import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
	CAR,
	generateTrack,
	createCar,
	stepCar,
	createLap,
	stepLap,
	nearestIndex,
	type Track,
	type CarState,
	type LapState,
} from './engine';
import { joinRace, multiplayerAvailable, MAX_PLAYERS, type Race, type Peer, type PosMsg, type LapMsg } from './net';
import { playerName, setPlayerName } from '../../lib/leaderboard';
import { trackGame } from '../../lib/analytics';

/* =====================================================
   DRIFT — top-down 3D arcade racing (three.js + Supabase Realtime).
   Auto-throttle + auto-drift, steer + brake. Random closed track shared per room.
   Other players are non-colliding ghosts with a pseudo label. Goal: best lap.
   Engine is pure/tested; net.ts handles matchmaking + sync.
   ===================================================== */

type Phase = 'menu' | 'racing';
const STEP = 1000 / 60;
const SEND_HZ = 12;
const CAR_COLORS = [0x7c5cff, 0xff5c8a, 0x33d6a6, 0xffb020];
const SKID_MARKS = 240; // recycled skid-mark pool (finite trail)
const SKID_FLOATS = SKID_MARKS * 18; // 2 triangles × 3 verts × 3 coords
const fmtMs = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`);
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
const lerpAngle = (a: number, b: number, t: number) => {
	let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
	if (d < -Math.PI) d += Math.PI * 2;
	return a + d * t;
};

interface Ghost {
	mesh: THREE.Group;
	cur: { x: number; z: number; heading: number };
	target: { x: number; z: number; heading: number };
}
interface Scene3D {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.OrthographicCamera;
	car: THREE.Group;
	trackMat: THREE.MeshStandardMaterial;
	trackGeom: THREE.BufferGeometry;
	deco: THREE.Group; // dashes + curbs + start line, rebuilt per track
	dashMat: THREE.MeshBasicMaterial;
	curbMat: THREE.MeshBasicMaterial;
	startMat: THREE.MeshBasicMaterial;
	wallMat: THREE.MeshBasicMaterial;
	skidGeom: THREE.BufferGeometry;
	skidMat: THREE.MeshBasicMaterial;
	skidPos: Float32Array;
	disposables: { dispose: () => void }[];
}

const HALF_SPAN = 34; // half of the visible world span (top-down zoom)

function makeCar(color: number, ghost = false): THREE.Group {
	const g = new THREE.Group();
	const body = new THREE.Mesh(
		new THREE.BoxGeometry(3.4, 1.0, 1.8),
		new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5, transparent: ghost, opacity: ghost ? 0.55 : 1 }),
	);
	body.position.y = 0.6;
	g.add(body);
	const cabin = new THREE.Mesh(
		new THREE.BoxGeometry(1.5, 0.8, 1.4),
		new THREE.MeshStandardMaterial({ color: 0x16181d, metalness: 0.2, roughness: 0.4, transparent: ghost, opacity: ghost ? 0.55 : 1 }),
	);
	cabin.position.set(-0.2, 1.2, 0);
	g.add(cabin);
	return g;
}

function buildTrackGeometry(track: Track): THREE.BufferGeometry {
	const n = track.points.length;
	const pos: number[] = [];
	const half = track.width / 2;
	for (let i = 0; i < n; i++) {
		const p = track.points[i];
		const q = track.points[(i + 1) % n];
		// quad (left_i, right_i, left_q, right_q)
		const lix = p.x + p.nx * half, liz = p.z + p.nz * half;
		const rix = p.x - p.nx * half, riz = p.z - p.nz * half;
		const lqx = q.x + q.nx * half, lqz = q.z + q.nz * half;
		const rqx = q.x - q.nx * half, rqz = q.z - q.nz * half;
		pos.push(lix, 0, liz, rix, 0, riz, lqx, 0, lqz);
		pos.push(rix, 0, riz, rqx, 0, rqz, lqx, 0, lqz);
	}
	const geom = new THREE.BufferGeometry();
	geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geom.computeVertexNormals();
	return geom;
}

type P2 = [number, number];
const pushQuad = (arr: number[], a: P2, b: P2, c: P2, d: P2, y: number) => {
	arr.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1]);
	arr.push(a[0], y, a[1], c[0], y, c[1], d[0], y, d[1]);
};
const geomFrom = (pos: number[]): THREE.BufferGeometry => {
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	return g;
};

/** Dashed white centre line. */
function buildDashes(track: Track): THREE.BufferGeometry {
	const pos: number[] = [];
	const L = 3, w = 0.45, y = 0.05;
	for (let i = 0; i < track.points.length; i += 6) {
		const p = track.points[i];
		const ax = p.x - p.dirX * (L / 2), az = p.z - p.dirZ * (L / 2);
		const bx = p.x + p.dirX * (L / 2), bz = p.z + p.dirZ * (L / 2);
		const ox = p.nx * (w / 2), oz = p.nz * (w / 2);
		pushQuad(pos, [ax - ox, az - oz], [ax + ox, az + oz], [bx + ox, bz + oz], [bx - ox, bz - oz], y);
	}
	return geomFrom(pos);
}

/** Thin curbs along both track edges. */
function buildCurbs(track: Track): THREE.BufferGeometry {
	const pos: number[] = [];
	const n = track.points.length;
	const half = track.width / 2, thick = 1.0, y = 0.04;
	const bands: P2[] = [[half - thick, half], [-half, -(half - thick)]];
	for (let i = 0; i < n; i++) {
		const p = track.points[i];
		const q = track.points[(i + 1) % n];
		for (const [o1, o2] of bands) {
			pushQuad(
				pos,
				[p.x + p.nx * o1, p.z + p.nz * o1],
				[p.x + p.nx * o2, p.z + p.nz * o2],
				[q.x + q.nx * o2, q.z + q.nz * o2],
				[q.x + q.nx * o1, q.z + q.nz * o1],
				y,
			);
		}
	}
	return geomFrom(pos);
}

/** Raised barrier bands at the outer wall radius (both sides), so the limits are visible from above. */
function buildWalls(track: Track): THREE.BufferGeometry {
	const pos: number[] = [];
	const n = track.points.length;
	const wallR = track.width / 2 + CAR.wallMargin;
	const y = 0.6; // raised → reads as a wall ring from the top-down view
	const bands: P2[] = [[wallR - 0.7, wallR + 0.7], [-(wallR + 0.7), -(wallR - 0.7)]];
	for (let i = 0; i < n; i++) {
		const p = track.points[i];
		const q = track.points[(i + 1) % n];
		for (const [o1, o2] of bands) {
			pushQuad(
				pos,
				[p.x + p.nx * o1, p.z + p.nz * o1],
				[p.x + p.nx * o2, p.z + p.nz * o2],
				[q.x + q.nx * o2, q.z + q.nz * o2],
				[q.x + q.nx * o1, q.z + q.nz * o1],
				y,
			);
		}
	}
	return geomFrom(pos);
}

/** Start/finish band across the track at checkpoint 0. */
function buildStartLine(track: Track): THREE.BufferGeometry {
	const p = track.points[track.checkpoints[0]];
	const half = track.width / 2, L = 2.5, y = 0.06;
	const ax = p.x - p.dirX * (L / 2), az = p.z - p.dirZ * (L / 2);
	const bx = p.x + p.dirX * (L / 2), bz = p.z + p.dirZ * (L / 2);
	const pos: number[] = [];
	pushQuad(
		pos,
		[ax + p.nx * half, az + p.nz * half],
		[ax - p.nx * half, az - p.nz * half],
		[bx - p.nx * half, bz - p.nz * half],
		[bx + p.nx * half, bz + p.nz * half],
		y,
	);
	return geomFrom(pos);
}

export default function DriftGame({ gameId }: { gameId: string }) {
	const [phase, setPhase] = useState<Phase>('menu');
	const [name, setName] = useState('');
	const [status, setStatus] = useState('');
	const [board, setBoard] = useState<{ id: string; name: string; bestMs: number }[]>([]);
	const [curMs, setCurMs] = useState(0);
	const [bestMs, setBestMs] = useState<number | null>(null);
	const [peerCount, setPeerCount] = useState(1);
	const [webglError, setWebglError] = useState(false);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const labelsRef = useRef<HTMLDivElement>(null);
	const g3Ref = useRef<Scene3D | null>(null);
	const trackRef = useRef<Track | null>(null);
	const carRef = useRef<CarState | null>(null);
	const lapRef = useRef<LapState>(createLap());
	const clockRef = useRef(0);
	const prevIdxRef = useRef(0);
	const keysRef = useRef({ left: false, right: false, brake: false });
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const accRef = useRef(0);
	const sendAccRef = useRef(0);
	const hudAccRef = useRef(0);
	const runningRef = useRef(false);
	const raceRef = useRef<Race | null>(null);
	const selfColorRef = useRef(CAR_COLORS[0]);
	const ghostsRef = useRef<Map<string, Ghost>>(new Map());
	const labelElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
	const peerInfoRef = useRef<Map<string, { name: string; color: number }>>(new Map());
	const bestRef = useRef<number | null>(null);
	const boardRef = useRef<Map<string, { name: string; bestMs: number }>>(new Map());
	const markIdxRef = useRef(0);
	const markPosRef = useRef({ x: 0, z: 0 });

	useEffect(() => {
		setName(playerName());
	}, []);

	/* ---- three.js scene ---- */
	const initScene = useCallback(() => {
		if (g3Ref.current || !canvasRef.current) return false;
		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
		} catch {
			setWebglError(true);
			return false;
		}
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		const scene = new THREE.Scene();
		scene.background = new THREE.Color('#0d1117');
		scene.fog = new THREE.Fog('#0d1117', 120, 260);
		const camera = new THREE.OrthographicCamera(-HALF_SPAN, HALF_SPAN, HALF_SPAN, -HALF_SPAN, 0.1, 400);
		camera.up.set(0, 0, -1); // north up, fixed (never rotates with the car)
		scene.add(new THREE.AmbientLight(0x99a0b5, 1.1));
		const dir = new THREE.DirectionalLight(0xffffff, 1.5);
		dir.position.set(40, 80, 20);
		scene.add(dir);

		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(1200, 1200),
			new THREE.MeshStandardMaterial({ color: 0x1f5d3a, roughness: 1 }),
		);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = -0.05;
		scene.add(ground);

		const trackMat = new THREE.MeshStandardMaterial({ color: 0x33373f, roughness: 0.95 });
		const trackGeom = new THREE.BufferGeometry();
		const trackMesh = new THREE.Mesh(trackGeom, trackMat);
		scene.add(trackMesh);

		const deco = new THREE.Group();
		scene.add(deco);
		const dashMat = new THREE.MeshBasicMaterial({ color: 0xeef2f6, side: THREE.DoubleSide });
		const curbMat = new THREE.MeshBasicMaterial({ color: 0xe34b4b, side: THREE.DoubleSide });
		const startMat = new THREE.MeshBasicMaterial({ color: 0xf2f4f8, side: THREE.DoubleSide });
		const wallMat = new THREE.MeshBasicMaterial({ color: 0xd9dde4, side: THREE.DoubleSide });

		// Skid-mark trail (one shared geometry, positions rewritten in place, oldest recycled).
		const skidPos = new Float32Array(SKID_FLOATS);
		const skidGeom = new THREE.BufferGeometry();
		skidGeom.setAttribute('position', new THREE.BufferAttribute(skidPos, 3));
		const skidMat = new THREE.MeshBasicMaterial({ color: 0x111319, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
		const skidMesh = new THREE.Mesh(skidGeom, skidMat);
		skidMesh.renderOrder = 1;
		skidMesh.frustumCulled = false; // positions are mutated in place → skip stale-bounds culling
		scene.add(skidMesh);

		const car = makeCar(selfColorRef.current);
		scene.add(car);

		g3Ref.current = {
			renderer, scene, camera, car, trackMat, trackGeom, deco, dashMat, curbMat, startMat, wallMat,
			skidGeom, skidMat, skidPos,
			disposables: [ground.geometry, ground.material as THREE.Material],
		};
		return true;
	}, []);

	const resize = useCallback(() => {
		const g = g3Ref.current;
		const canvas = canvasRef.current;
		if (!g || !canvas) return;
		const css = canvas.clientWidth;
		g.renderer.setSize(css, css, false);
		// Square ortho frustum (canvas is 1:1).
		g.camera.left = -HALF_SPAN;
		g.camera.right = HALF_SPAN;
		g.camera.top = HALF_SPAN;
		g.camera.bottom = -HALF_SPAN;
		g.camera.updateProjectionMatrix();
	}, []);

	const removeGhost = useCallback((id: string) => {
		const g = g3Ref.current;
		const ghost = ghostsRef.current.get(id);
		if (ghost && g) {
			g.scene.remove(ghost.mesh);
			ghost.mesh.traverse((o) => {
				if (o instanceof THREE.Mesh) {
					o.geometry.dispose();
					(o.material as THREE.Material).dispose();
				}
			});
		}
		ghostsRef.current.delete(id);
		const el = labelElsRef.current.get(id);
		if (el) el.remove();
		labelElsRef.current.delete(id);
	}, []);

	const getOrCreateGhost = useCallback((id: string): Ghost | null => {
		const g = g3Ref.current;
		if (!g) return null;
		let ghost = ghostsRef.current.get(id);
		if (!ghost) {
			const info = peerInfoRef.current.get(id);
			const mesh = makeCar(info?.color ?? 0xcccccc, true);
			g.scene.add(mesh);
			ghost = { mesh, cur: { x: 0, z: 0, heading: 0 }, target: { x: 0, z: 0, heading: 0 } };
			ghostsRef.current.set(id, ghost);
			// Label
			if (labelsRef.current) {
				const el = document.createElement('div');
				el.className = 'dr-label';
				el.textContent = info?.name ?? '???';
				labelsRef.current.appendChild(el);
				labelElsRef.current.set(id, el);
			}
		}
		return ghost;
	}, []);

	const syncBoard = useCallback(() => {
		const arr = [...boardRef.current.entries()].map(([id, v]) => ({ id, ...v }));
		arr.sort((a, b) => a.bestMs - b.bestMs);
		setBoard(arr);
	}, []);

	const clearSkid = useCallback(() => {
		const g = g3Ref.current;
		if (!g) return;
		g.skidPos.fill(0);
		g.skidGeom.attributes.position.needsUpdate = true;
		markIdxRef.current = 0;
	}, []);

	/* ---- Loop ---- */
	const stop = useCallback(() => {
		runningRef.current = false;
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = 0;
	}, []);

	const renderFrame = useCallback((dtSec: number) => {
		const g = g3Ref.current;
		const car = carRef.current;
		if (!g || !car) return;
		// Self car transform.
		g.car.position.set(car.x, 0, car.z);
		g.car.rotation.y = -car.heading;

		// Top-down camera: directly above, north-up, never rotates with the car. Eased pan.
		const kc = Math.min(1, dtSec * 6);
		g.camera.position.x += (car.x - g.camera.position.x) * kc;
		g.camera.position.z += (car.z - g.camera.position.z) * kc;
		g.camera.position.y = 80;
		g.camera.lookAt(g.camera.position.x, 0, g.camera.position.z);

		// Ghost interpolation.
		const k = Math.min(1, dtSec * 10);
		for (const ghost of ghostsRef.current.values()) {
			ghost.cur.x += (ghost.target.x - ghost.cur.x) * k;
			ghost.cur.z += (ghost.target.z - ghost.cur.z) * k;
			ghost.cur.heading = lerpAngle(ghost.cur.heading, ghost.target.heading, k);
			ghost.mesh.position.set(ghost.cur.x, 0, ghost.cur.z);
			ghost.mesh.rotation.y = -ghost.cur.heading;
		}

		g.renderer.render(g.scene, g.camera);

		// Position pseudo labels by projecting ghost world position to screen.
		const canvas = canvasRef.current;
		if (canvas) {
			const w = canvas.clientWidth, h = canvas.clientHeight;
			const v = new THREE.Vector3();
			for (const [id, ghost] of ghostsRef.current.entries()) {
				const el = labelElsRef.current.get(id);
				if (!el) continue;
				v.set(ghost.cur.x, 2.4, ghost.cur.z).project(g.camera);
				if (v.z > 1) { el.style.display = 'none'; continue; }
				el.style.display = 'block';
				el.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
				el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
			}
		}
	}, []);

	const frame = useCallback(
		(now: number) => {
			if (!runningRef.current) return;
			const dt = Math.min(now - lastRef.current, 200);
			lastRef.current = now;
			accRef.current += dt;
			const track = trackRef.current;
			let car = carRef.current;
			if (!track || !car) return;
			const input = {
				steer: (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0),
				brake: keysRef.current.brake ? 1 : 0,
			};
			while (runningRef.current && accRef.current >= STEP) {
				accRef.current -= STEP;
				clockRef.current += STEP;
				car = stepCar(car, input, STEP / 1000, track);
				const idx = nearestIndex(track, car.x, car.z);
				const prevLap = lapRef.current;
				lapRef.current = stepLap(prevLap, prevIdxRef.current, idx, track, clockRef.current);
				prevIdxRef.current = idx;
				if (lapRef.current.bestMs != null && lapRef.current.bestMs !== bestRef.current) {
					bestRef.current = lapRef.current.bestMs;
					setBestMs(bestRef.current);
					if (raceRef.current) {
						raceRef.current.sendLap(bestRef.current);
						boardRef.current.set(raceRef.current.selfId, { name: name || 'Moi', bestMs: bestRef.current });
						syncBoard();
					}
				}
			}
			carRef.current = car;

			// Skid marks while sliding (lateral slip), spaced by travelled distance.
			const g = g3Ref.current;
			if (g) {
				const moved = Math.hypot(car.x - markPosRef.current.x, car.z - markPosRef.current.z);
				if (car.drifting && moved > 0.4) {
					markPosRef.current = { x: car.x, z: car.z };
					const fx = Math.cos(car.heading), fz = Math.sin(car.heading);
					const px = -fz, pz = fx; // perpendicular (track lateral)
					const rear = 1.4, wheel = 0.7, L = 1.3, W = 0.4, y = 0.03;
					const put = (mx: number, mz: number) => {
						const o = (markIdxRef.current % SKID_MARKS) * 18;
						const p = g.skidPos;
						const ax = mx - fx * (L / 2) + px * (W / 2), az = mz - fz * (L / 2) + pz * (W / 2);
						const bx = mx - fx * (L / 2) - px * (W / 2), bz = mz - fz * (L / 2) - pz * (W / 2);
						const cx = mx + fx * (L / 2) - px * (W / 2), cz = mz + fz * (L / 2) - pz * (W / 2);
						const dx2 = mx + fx * (L / 2) + px * (W / 2), dz2 = mz + fz * (L / 2) + pz * (W / 2);
						p[o] = ax; p[o + 1] = y; p[o + 2] = az; p[o + 3] = bx; p[o + 4] = y; p[o + 5] = bz; p[o + 6] = cx; p[o + 7] = y; p[o + 8] = cz;
						p[o + 9] = ax; p[o + 10] = y; p[o + 11] = az; p[o + 12] = cx; p[o + 13] = y; p[o + 14] = cz; p[o + 15] = dx2; p[o + 16] = y; p[o + 17] = dz2;
						markIdxRef.current++;
					};
					put(car.x - fx * rear + px * wheel, car.z - fz * rear + pz * wheel);
					put(car.x - fx * rear - px * wheel, car.z - fz * rear - pz * wheel);
					g.skidGeom.attributes.position.needsUpdate = true;
				}
			}

			// Broadcast pose.
			if (raceRef.current) {
				sendAccRef.current += dt;
				if (sendAccRef.current >= 1000 / SEND_HZ) {
					sendAccRef.current = 0;
					raceRef.current.sendPos({ x: car.x, z: car.z, heading: car.heading });
				}
			}

			renderFrame(dt / 1000);
			hudAccRef.current += dt;
			if (hudAccRef.current >= 100) {
				hudAccRef.current = 0;
				setCurMs(lapRef.current.startedMs == null ? 0 : clockRef.current - lapRef.current.startedMs);
			}
			rafRef.current = requestAnimationFrame(frame);
		},
		[renderFrame, name, syncBoard],
	);

	/* ---- Start / stop a race ---- */
	const beginRace = useCallback(
		(seed: number, race: Race | null) => {
			const track = generateTrack(seed);
			trackRef.current = track;
			const built = buildTrackGeometry(track);
			const g = g3Ref.current;
			if (g) {
				const mesh = g.scene.children.find(
					(o): o is THREE.Mesh => o instanceof THREE.Mesh && (o as THREE.Mesh).material === g.trackMat,
				);
				if (mesh) mesh.geometry = built;
				g.trackGeom.dispose(); // old geometry
				g.trackGeom = built;
				// Track dressing (rebuilt per circuit).
				g.deco.children.forEach((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
				g.deco.clear();
				g.deco.add(
					new THREE.Mesh(buildDashes(track), g.dashMat),
					new THREE.Mesh(buildCurbs(track), g.curbMat),
					new THREE.Mesh(buildWalls(track), g.wallMat),
					new THREE.Mesh(buildStartLine(track), g.startMat),
				);
			}
			carRef.current = createCar(track);
			lapRef.current = createLap();
			clockRef.current = 0;
			prevIdxRef.current = track.checkpoints[0];
			markPosRef.current = { x: carRef.current.x, z: carRef.current.z };
			clearSkid();
			bestRef.current = null;
			setBestMs(null);
			setCurMs(0);
			boardRef.current.clear();
			setBoard([]);
			raceRef.current = race;

			if (race) {
				race.onPeers((peers: Peer[]) => {
					peerInfoRef.current.clear();
					for (const p of peers) peerInfoRef.current.set(p.id, { name: p.name, color: p.color });
					setPeerCount(peers.length + 1);
					// Drop ghosts/labels for peers that left.
					for (const id of [...ghostsRef.current.keys()]) if (!peerInfoRef.current.has(id)) removeGhost(id);
				});
				race.onPos((m: PosMsg) => {
					const ghost = getOrCreateGhost(m.id);
					if (ghost) ghost.target = { x: m.x, z: m.z, heading: m.heading };
				});
				race.onLap((m: LapMsg) => {
					boardRef.current.set(m.id, { name: m.name, bestMs: m.bestMs });
					syncBoard();
				});
			}

			setPhase('racing');
			runningRef.current = true;
			lastRef.current = performance.now();
			accRef.current = 0;
			sendAccRef.current = 0;
			rafRef.current = requestAnimationFrame(frame);
			trackGame(gameId, 'game_started');
		},
		[frame, gameId, getOrCreateGhost, removeGhost, syncBoard, clearSkid],
	);

	const reset = useCallback(() => {
		const track = trackRef.current;
		if (!track) return;
		carRef.current = createCar(track);
		lapRef.current = createLap();
		prevIdxRef.current = track.checkpoints[0];
		markPosRef.current = { x: carRef.current.x, z: carRef.current.z };
		clearSkid();
		setCurMs(0);
	}, [clearSkid]);

	const play = useCallback(async () => {
		const nm = (name || playerName()).trim();
		if (!nm) {
			setStatus('Entre un pseudo.');
			return;
		}
		setPlayerName(nm);
		selfColorRef.current = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
		if (!initScene()) return;
		resize();
		if (multiplayerAvailable()) {
			setStatus('Recherche d\'une course…');
			const race = await joinRace(nm, selfColorRef.current);
			if (race) {
				setStatus('');
				beginRace(race.seed, race);
				return;
			}
			setStatus('Multijoueur indisponible — course solo.');
		}
		beginRace(randomSeed(), null); // solo fallback
	}, [name, initScene, resize, beginRace]);

	const quit = useCallback(() => {
		stop();
		raceRef.current?.leave();
		raceRef.current = null;
		for (const id of [...ghostsRef.current.keys()]) removeGhost(id);
		peerInfoRef.current.clear();
		boardRef.current.clear();
		setPeerCount(1);
		setPhase('menu');
	}, [stop, removeGhost]);

	/* ---- Input ---- */
	useEffect(() => {
		const set = (k: string, down: boolean): boolean => {
			const r = keysRef.current;
			if (k === 'ArrowLeft' || k === 'a' || k === 'q') return ((r.left = down), true);
			if (k === 'ArrowRight' || k === 'd') return ((r.right = down), true);
			if (k === ' ' || k === 'ArrowDown' || k === 's') return ((r.brake = down), true);
			return false;
		};
		const onDown = (e: KeyboardEvent) => { if (set(e.key, true)) e.preventDefault(); };
		const onUp = (e: KeyboardEvent) => { set(e.key, false); };
		window.addEventListener('keydown', onDown, { passive: false });
		window.addEventListener('keyup', onUp);
		return () => {
			window.removeEventListener('keydown', onDown);
			window.removeEventListener('keyup', onUp);
		};
	}, []);

	useEffect(() => {
		const onResize = () => resize();
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
			stop();
			raceRef.current?.leave();
			const g = g3Ref.current;
			if (g) {
				for (const id of [...ghostsRef.current.keys()]) removeGhost(id);
				g.trackGeom.dispose();
				g.trackMat.dispose();
				g.deco.children.forEach((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
				g.dashMat.dispose();
				g.curbMat.dispose();
				g.startMat.dispose();
				g.wallMat.dispose();
				g.skidGeom.dispose();
				g.skidMat.dispose();
				g.car.traverse((o) => {
					if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
				});
				g.disposables.forEach((d) => d.dispose());
				g.renderer.dispose();
				g3Ref.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const touch = (which: 'left' | 'right' | 'brake', down: boolean) => (e: React.PointerEvent) => {
		e.preventDefault();
		keysRef.current[which] = down;
	};

	return (
		<div className="dr-root">
			<style>{CSS}</style>

			<div className="dr-boardwrap">
				<canvas ref={canvasRef} className="dr-canvas" role="img" aria-label="Drift" />
				<div ref={labelsRef} className="dr-labels" />

				{phase === 'racing' && (
					<>
						<div className="dr-hud">
							<span className="dr-cur">{fmtMs(curMs)}</span>
							<span className="dr-best">Meilleur {fmtMs(bestMs)}</span>
							<span className="dr-peers">👥 {Math.min(peerCount, MAX_PLAYERS)}/{MAX_PLAYERS}</span>
						</div>
						{board.length > 0 && (
							<ol className="dr-leaderboard">
								{board.slice(0, MAX_PLAYERS).map((r) => (
									<li key={r.id}>{r.name} · {fmtMs(r.bestMs)}</li>
								))}
							</ol>
						)}
						<div className="dr-touch">
							<button className="dr-tbtn" onPointerDown={touch('left', true)} onPointerUp={touch('left', false)} onPointerLeave={touch('left', false)} aria-label="Gauche">◀</button>
							<button className="dr-tbtn brake" onPointerDown={touch('brake', true)} onPointerUp={touch('brake', false)} onPointerLeave={touch('brake', false)} aria-label="Frein">FREIN</button>
							<button className="dr-tbtn" onPointerDown={touch('right', true)} onPointerUp={touch('right', false)} onPointerLeave={touch('right', false)} aria-label="Droite">▶</button>
						</div>
						<div className="dr-topbtns">
							<button className="dr-restart" onClick={reset}>↺ Recommencer</button>
							<button className="dr-quit" onClick={quit}>Quitter</button>
						</div>
					</>
				)}

				{webglError && <div className="dr-overlay"><div className="dr-card">3D indisponible (WebGL manquant).</div></div>}

				{phase === 'menu' && !webglError && (
					<div className="dr-overlay">
						<div className="dr-card">
							<h2>Drift</h2>
							<p className="dr-sub">Cours sur un circuit aléatoire. Les autres pilotes sont des fantômes — bats leur meilleur tour&nbsp;!</p>
							<input
								className="dr-name"
								value={name}
								maxLength={20}
								placeholder="Ton pseudo"
								onChange={(e) => setName(e.target.value)}
							/>
							<button className="dr-play" onClick={play}>▶ Rejoindre une course</button>
							{status && <p className="dr-status">{status}</p>}
							{!multiplayerAvailable() && <p className="dr-status">Multijoueur non configuré — tu joueras en solo.</p>}
						</div>
					</div>
				)}
			</div>

			<p className="dr-help">
				<strong>Tourne</strong> avec les flèches / Q-D (ou les boutons tactiles) et <strong>freine</strong>
				(Espace / bas) pour négocier les virages — l'accélération et le drift sont automatiques. Jusqu'à
				{` ${MAX_PLAYERS}`} pilotes par course&nbsp;: tu vois leurs fantômes et leur meilleur tour en direct.
			</p>
		</div>
	);
}

/* ---------- Styles ---------- */

const CSS = `
.dr-root { --dr-accent: var(--accent-regular); width: 100%; max-width: 560px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); }
.dr-boardwrap { position: relative; width: 100%; max-width: 520px; margin-inline: auto; }
.dr-canvas {
  width: 100%; aspect-ratio: 1 / 1; display: block; background: #0d1117;
  border: 1px solid var(--gray-800); border-radius: 12px;
  touch-action: none; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none;
}
.dr-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.dr-label {
  position: absolute; transform: translate(-50%, -100%); white-space: nowrap;
  font-size: 11px; font-weight: 700; color: #fff; background: rgba(0,0,0,0.55);
  padding: 1px 6px; border-radius: 999px;
}
.dr-hud { position: absolute; top: 8px; left: 8px; display: flex; gap: 6px; flex-wrap: wrap; font-weight: 700; font-size: 12.5px; }
.dr-cur { background: var(--dr-accent); color: var(--accent-text-over); border-radius: 999px; padding: 4px 10px; font-variant-numeric: tabular-nums; }
.dr-best, .dr-peers { background: rgba(0,0,0,0.55); color: #fff; border-radius: 999px; padding: 4px 10px; font-variant-numeric: tabular-nums; }
.dr-leaderboard { position: absolute; top: 8px; right: 8px; margin: 0; padding: 6px 10px 6px 26px; list-style: decimal; background: rgba(0,0,0,0.55); color: #fff; border-radius: 10px; font-size: 12px; font-variant-numeric: tabular-nums; }
.dr-touch { position: absolute; bottom: 10px; left: 0; right: 0; display: flex; justify-content: center; gap: 12px; }
.dr-tbtn { width: 64px; height: 64px; border-radius: 50%; border: none; background: rgba(255,255,255,0.18); color: #fff; font-weight: 800; font-size: 20px; cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none; }
.dr-tbtn.brake { width: auto; padding: 0 18px; border-radius: 999px; font-size: 14px; background: rgba(230,72,77,0.55); }
.dr-topbtns { position: absolute; bottom: 10px; right: 10px; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.dr-restart, .dr-quit { border: 1.5px solid var(--gray-600, var(--gray-700)); background: rgba(0,0,0,0.5); color: #fff; font: inherit; font-weight: 600; font-size: 12px; border-radius: 999px; padding: 6px 12px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.dr-restart { background: var(--dr-accent); color: var(--accent-text-over); border-color: transparent; }

.dr-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; background: rgba(6,8,16,0.5); backdrop-filter: blur(2px); border-radius: 12px; }
.dr-card { background: var(--gray-999); border: 2px solid var(--dr-accent); border-radius: 18px; padding: 22px 26px; text-align: center; box-shadow: var(--shadow-lg); max-width: 340px; }
.dr-card h2 { font-family: var(--font-brand); font-weight: 600; font-size: 24px; margin: 0 0 6px; }
.dr-sub { color: var(--gray-300); font-size: 13px; margin: 0 0 14px; line-height: 1.5; }
.dr-name { width: 100%; box-sizing: border-box; border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; border-radius: 999px; padding: 9px 16px; margin-bottom: 10px; text-align: center; }
.dr-play { border: none; background: var(--dr-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 16px; border-radius: 999px; padding: 12px 28px; cursor: pointer; }
.dr-status { color: var(--gray-300); font-size: 12px; margin: 10px 0 0; }
.dr-help { max-width: 460px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin: 1rem auto 0; }
`;
