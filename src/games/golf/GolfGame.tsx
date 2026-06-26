import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
	DIFFS,
	PARAMS,
	generateHole,
	stepBall,
	aimToVelocity,
	isSettled,
	type Hole,
	type Ball,
} from './engine';
import { mulberry32 } from '../prng';
import { joinGolf, multiplayerAvailable, MAX_PLAYERS, type Lobby, type Peer, type PosMsg, type ScoreMsg } from './net';
import {
	playerName,
	setPlayerName,
	getDaily,
	dailyWeekdayLabel,
	loadDailyRun,
	saveDailyRun,
} from '../../lib/leaderboard';
import { trackGame } from '../../lib/analytics';
import Leaderboard from '../../components/Leaderboard';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   MINI-GOLF — top-down 3D arcade (three.js + Supabase Realtime).
   Slingshot aim (pull back, launch opposite, power ∝ pull), bounces off borders
   and walls. Daily : same hole for everyone, 10 attempts, best = fewest strokes.
   Other players are non-colliding ghost balls with a pseudo. Engine pure/tested.
   ===================================================== */

type Phase = 'menu' | 'playing';
type Mode = 'libre' | 'defi';
type DiffKey = keyof typeof DIFFS;
const DIFF_ORDER: DiffKey[] = ['facile', 'moyen', 'difficile'];
const STEP = 1000 / 60;
const SEND_HZ = 12;
const MAX_TRIES = 10;
const BALL_COLORS = [0xff3b30, 0x0a84ff, 0xffd60a, 0x30d158, 0xbf5af2];
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
const AIM_Y = 0.5;

interface Ghost {
	mesh: THREE.Mesh;
	cur: { x: number; z: number };
	target: { x: number; z: number };
}
interface Mats {
	green: THREE.MeshStandardMaterial;
	rail: THREE.MeshStandardMaterial;
	wall: THREE.MeshStandardMaterial;
	cup: THREE.MeshBasicMaterial;
	pole: THREE.MeshStandardMaterial;
	flag: THREE.MeshStandardMaterial;
}
interface Scene3D {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.OrthographicCamera;
	ball: THREE.Mesh;
	holeGroup: THREE.Group;
	aimLine: THREE.Line;
	mats: Mats;
	disposables: { dispose: () => void }[];
}

function makeBall(color: number, ghost = false): THREE.Mesh {
	const geo = new THREE.SphereGeometry(PARAMS.ballR, 18, 14);
	const mat = new THREE.MeshStandardMaterial({
		color: ghost ? color : 0xffffff,
		roughness: 0.45,
		metalness: 0.1,
		transparent: ghost,
		opacity: ghost ? 0.5 : 1,
		emissive: ghost ? color : 0x000000,
		emissiveIntensity: ghost ? 0.25 : 0,
	});
	return new THREE.Mesh(geo, mat);
}

function buildHoleGroup(hole: Hole, mats: Mats): THREE.Group {
	const grp = new THREE.Group();
	const { w, h } = hole.half;

	const green = new THREE.Mesh(new THREE.PlaneGeometry(2 * w, 2 * h), mats.green);
	green.rotation.x = -Math.PI / 2;
	grp.add(green);

	const t = 0.7, hy = 1.3;
	const mk = (geo: THREE.BufferGeometry, x: number, z: number) => {
		const m = new THREE.Mesh(geo, mats.rail);
		m.position.set(x, hy / 2, z);
		grp.add(m);
	};
	const railH = new THREE.BoxGeometry(2 * w + 2 * t, hy, t);
	const railV = new THREE.BoxGeometry(t, hy, 2 * h);
	mk(railH, 0, -h - t / 2);
	mk(railH, 0, h + t / 2);
	mk(railV, -w - t / 2, 0);
	mk(railV, w + t / 2, 0);

	for (const wl of hole.walls) {
		const ww = wl.maxX - wl.minX, dd = wl.maxZ - wl.minZ;
		const m = new THREE.Mesh(new THREE.BoxGeometry(ww, 1.4, dd), mats.wall);
		m.position.set((wl.minX + wl.maxX) / 2, 0.7, (wl.minZ + wl.maxZ) / 2);
		grp.add(m);
	}

	const cup = new THREE.Mesh(new THREE.CircleGeometry(hole.cupR, 28), mats.cup);
	cup.rotation.x = -Math.PI / 2;
	cup.position.set(hole.cup.x, 0.03, hole.cup.z);
	grp.add(cup);

	const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.2, 6), mats.pole);
	pole.position.set(hole.cup.x, 2.6, hole.cup.z);
	grp.add(pole);
	const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.2), mats.flag);
	flag.position.set(hole.cup.x + 1.1, 4.4, hole.cup.z);
	grp.add(flag);

	return grp;
}

export default function GolfGame({ gameId }: { gameId: string }) {
	const [phase, setPhase] = useState<Phase>('menu');
	const [mode, setMode] = useState<Mode>('defi');
	const [diffKey, setDiffKey] = useState<DiffKey>('moyen');
	const [name, setName] = useState('');
	const [status, setStatus] = useState('');
	const [dailyLoading, setDailyLoading] = useState(false);
	const [strokes, setStrokes] = useState(0);
	const [par, setPar] = useState(3);
	const [done, setDone] = useState(false);
	const [best, setBest] = useState<number | null>(null);
	const [tries, setTries] = useState(0);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [power, setPower] = useState(0);
	const [peerCount, setPeerCount] = useState(1);
	const [board, setBoard] = useState<{ id: string; name: string; strokes: number; done: boolean }[]>([]);
	const [webglError, setWebglError] = useState(false);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const labelsRef = useRef<HTMLDivElement>(null);
	const g3Ref = useRef<Scene3D | null>(null);
	const holeRef = useRef<Hole | null>(null);
	const ballRef = useRef<Ball>({ x: 0, z: 0, vx: 0, vz: 0 });
	const prevBallRef = useRef<Ball>({ x: 0, z: 0, vx: 0, vz: 0 });
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const accRef = useRef(0);
	const sendAccRef = useRef(0);
	const runningRef = useRef(false);
	const lobbyRef = useRef<Lobby | null>(null);
	const selfColorRef = useRef(BALL_COLORS[0]);
	const ghostsRef = useRef<Map<string, Ghost>>(new Map());
	const labelElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
	const peerInfoRef = useRef<Map<string, { name: string; color: number }>>(new Map());
	const boardRef = useRef<Map<string, { name: string; strokes: number; done: boolean }>>(new Map());
	const strokesRef = useRef(0);
	const bestRef = useRef<number | null>(null);
	const doneRef = useRef(false);
	const triesRef = useRef(0);
	const modeRef = useRef<Mode>('defi');
	const seedRef = useRef(0);
	const aimRef = useRef({ active: false, px: 0, pz: 0 });
	const rayRef = useRef(new THREE.Raycaster());
	const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

	useEffect(() => {
		setName(playerName());
	}, []);

	const { celebrating } = useCelebration(done);

	/* ---- three.js scene ---- */
	const initScene = useCallback((): boolean => {
		if (g3Ref.current) return true;
		if (!canvasRef.current) return false;
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
		const camera = new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, 400);
		camera.position.set(0, 80, 0);
		camera.up.set(0, 0, -1);
		camera.lookAt(0, 0, 0);
		scene.add(new THREE.AmbientLight(0x9aa3b8, 1.15));
		const dir = new THREE.DirectionalLight(0xffffff, 1.4);
		dir.position.set(30, 70, 40);
		scene.add(dir);

		const mats: Mats = {
			green: new THREE.MeshStandardMaterial({ color: 0x3f9a5a, roughness: 1 }),
			rail: new THREE.MeshStandardMaterial({ color: 0xb8732f, roughness: 0.8 }),
			wall: new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.8 }),
			cup: new THREE.MeshBasicMaterial({ color: 0x0a0c10 }),
			pole: new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.7 }),
			flag: new THREE.MeshStandardMaterial({ color: 0xe34b4b, roughness: 0.8, side: THREE.DoubleSide }),
		};

		const ball = makeBall(0xffffff);
		scene.add(ball);

		const aimGeom = new THREE.BufferGeometry();
		aimGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
		const aimLine = new THREE.Line(aimGeom, new THREE.LineBasicMaterial({ color: 0xffffff }));
		aimLine.visible = false;
		aimLine.frustumCulled = false;
		scene.add(aimLine);

		const holeGroup = new THREE.Group();
		scene.add(holeGroup);

		g3Ref.current = {
			renderer, scene, camera, ball, holeGroup, aimLine, mats,
			disposables: [aimGeom, aimLine.material as THREE.Material, ball.geometry, ball.material as THREE.Material],
		};
		return true;
	}, []);

	const fitCamera = useCallback((hole: Hole) => {
		const g = g3Ref.current;
		const canvas = canvasRef.current;
		if (!g || !canvas) return;
		const css = canvas.clientWidth;
		g.renderer.setSize(css, css, false);
		const span = Math.max(hole.half.w, hole.half.h) + 3;
		g.camera.left = -span;
		g.camera.right = span;
		g.camera.top = span;
		g.camera.bottom = -span;
		g.camera.updateProjectionMatrix();
	}, []);

	const resize = useCallback(() => {
		if (holeRef.current) fitCamera(holeRef.current);
	}, [fitCamera]);

	const removeGhost = useCallback((id: string) => {
		const g = g3Ref.current;
		const ghost = ghostsRef.current.get(id);
		if (ghost && g) {
			g.scene.remove(ghost.mesh);
			ghost.mesh.geometry.dispose();
			(ghost.mesh.material as THREE.Material).dispose();
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
			const mesh = makeBall(info?.color ?? 0xcccccc, true);
			mesh.position.y = PARAMS.ballR;
			g.scene.add(mesh);
			ghost = { mesh, cur: { x: 0, z: 0 }, target: { x: 0, z: 0 } };
			ghostsRef.current.set(id, ghost);
			if (labelsRef.current) {
				const el = document.createElement('div');
				el.className = 'gf-label';
				el.textContent = info?.name ?? '???';
				labelsRef.current.appendChild(el);
				labelElsRef.current.set(id, el);
			}
		}
		return ghost;
	}, []);

	const syncBoard = useCallback(() => {
		const arr = [...boardRef.current.entries()].map(([id, v]) => ({ id, ...v }));
		arr.sort((a, b) => Number(b.done) - Number(a.done) || a.strokes - b.strokes);
		setBoard(arr);
	}, []);

	const stop = useCallback(() => {
		runningRef.current = false;
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = 0;
	}, []);

	const worldFromPointer = useCallback((clientX: number, clientY: number): { x: number; z: number } | null => {
		const g = g3Ref.current;
		const canvas = canvasRef.current;
		if (!g || !canvas) return null;
		const rect = canvas.getBoundingClientRect();
		const ndc = new THREE.Vector2(
			((clientX - rect.left) / rect.width) * 2 - 1,
			-(((clientY - rect.top) / rect.height) * 2 - 1),
		);
		rayRef.current.setFromCamera(ndc, g.camera);
		const hit = new THREE.Vector3();
		if (!rayRef.current.ray.intersectPlane(planeRef.current, hit)) return null;
		return { x: hit.x, z: hit.z };
	}, []);

	const renderFrame = useCallback((pose: { x: number; z: number }) => {
		const g = g3Ref.current;
		if (!g) return;
		g.ball.position.set(pose.x, PARAMS.ballR, pose.z);

		// Aim elastic: pointer → ball → predicted launch direction (opposite the pull).
		if (aimRef.current.active) {
			const b = ballRef.current;
			const dx = aimRef.current.px - b.x, dz = aimRef.current.pz - b.z;
			const mag = Math.hypot(dx, dz) || 1;
			const frac = Math.min(mag, PARAMS.maxPull) / PARAMS.maxPull;
			const len = frac * 14;
			const ex = b.x - (dx / mag) * len, ez = b.z - (dz / mag) * len;
			const arr = g.aimLine.geometry.attributes.position.array as Float32Array;
			arr[0] = aimRef.current.px; arr[1] = AIM_Y; arr[2] = aimRef.current.pz;
			arr[3] = b.x; arr[4] = AIM_Y; arr[5] = b.z;
			arr[6] = ex; arr[7] = AIM_Y; arr[8] = ez;
			g.aimLine.geometry.attributes.position.needsUpdate = true;
			(g.aimLine.material as THREE.LineBasicMaterial).color.setRGB(0.3 + frac * 0.7, 1 - frac * 0.7, 0.25);
			g.aimLine.visible = true;
		} else {
			g.aimLine.visible = false;
		}

		const k = 0.25;
		for (const ghost of ghostsRef.current.values()) {
			ghost.cur.x += (ghost.target.x - ghost.cur.x) * k;
			ghost.cur.z += (ghost.target.z - ghost.cur.z) * k;
			ghost.mesh.position.set(ghost.cur.x, PARAMS.ballR, ghost.cur.z);
		}

		g.renderer.render(g.scene, g.camera);

		const canvas = canvasRef.current;
		if (canvas && ghostsRef.current.size) {
			const w = canvas.clientWidth, h = canvas.clientHeight;
			const v = new THREE.Vector3();
			for (const [id, ghost] of ghostsRef.current.entries()) {
				const el = labelElsRef.current.get(id);
				if (!el) continue;
				v.set(ghost.cur.x, 2, ghost.cur.z).project(g.camera);
				el.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
				el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
			}
		}
	}, []);

	const handleSunk = useCallback(() => {
		if (doneRef.current) return;
		doneRef.current = true;
		setDone(true);
		const sc = strokesRef.current;
		const nb = bestRef.current == null ? sc : Math.min(bestRef.current, sc);
		bestRef.current = nb;
		setBest(nb);
		aimRef.current.active = false;
		trackGame(gameId, 'game_won', { strokes: sc });
		if (lobbyRef.current) {
			lobbyRef.current.sendScore({ strokes: sc, done: true });
			boardRef.current.set(lobbyRef.current.selfId, { name: name || 'Moi', strokes: sc, done: true });
			syncBoard();
		}
		if (modeRef.current === 'defi') {
			if (triesRef.current >= MAX_TRIES) setAlreadyPlayed(true);
			saveDailyRun(gameId, {
				startedAt: Date.now(),
				done: true,
				seed: seedRef.current,
				diffIndex: DIFF_ORDER.indexOf(diffKey),
				state: { best: nb, tries: triesRef.current },
			});
		}
	}, [gameId, name, syncBoard, diffKey]);

	const frame = useCallback(
		(now: number) => {
			if (!runningRef.current) return;
			const dt = Math.min(now - lastRef.current, 200);
			lastRef.current = now;
			accRef.current += dt;
			const hole = holeRef.current;
			let ball = ballRef.current;
			if (!hole) return;
			while (runningRef.current && accRef.current >= STEP) {
				accRef.current -= STEP;
				prevBallRef.current = ball;
				const r = stepBall(ball, hole, STEP / 1000);
				ball = r.ball;
				if (r.sunk && !doneRef.current) {
					ballRef.current = ball;
					handleSunk();
					break;
				}
			}
			ballRef.current = ball;

			if (lobbyRef.current) {
				sendAccRef.current += dt;
				if (sendAccRef.current >= 1000 / SEND_HZ) {
					sendAccRef.current = 0;
					lobbyRef.current.sendPos({ x: ball.x, z: ball.z });
				}
			}

			const prev = prevBallRef.current;
			const alpha = Math.min(1, accRef.current / STEP);
			renderFrame({ x: prev.x + (ball.x - prev.x) * alpha, z: prev.z + (ball.z - prev.z) * alpha });
			rafRef.current = requestAnimationFrame(frame);
		},
		[renderFrame, handleSunk],
	);

	/* ---- Pointer: slingshot aim ---- */
	const onPointerDown = useCallback((e: React.PointerEvent) => {
		if (phase !== 'playing' || doneRef.current) return;
		if (!isSettled(ballRef.current)) return;
		const p = worldFromPointer(e.clientX, e.clientY);
		if (!p) return;
		aimRef.current = { active: true, px: p.x, pz: p.z };
		const b = ballRef.current;
		setPower(Math.min(Math.hypot(p.x - b.x, p.z - b.z), PARAMS.maxPull) / PARAMS.maxPull);
		(e.target as HTMLElement).setPointerCapture?.(e.pointerId);
	}, [phase, worldFromPointer]);

	const onPointerMove = useCallback((e: React.PointerEvent) => {
		if (!aimRef.current.active) return;
		const p = worldFromPointer(e.clientX, e.clientY);
		if (!p) return;
		aimRef.current.px = p.x;
		aimRef.current.pz = p.z;
		const b = ballRef.current;
		setPower(Math.min(Math.hypot(p.x - b.x, p.z - b.z), PARAMS.maxPull) / PARAMS.maxPull);
	}, [worldFromPointer]);

	const onPointerUp = useCallback(() => {
		if (!aimRef.current.active) return;
		aimRef.current.active = false;
		setPower(0);
		const b = ballRef.current;
		const vel = aimToVelocity({ x: aimRef.current.px - b.x, z: aimRef.current.pz - b.z });
		if (!vel) return;
		ballRef.current = { ...b, vx: vel.vx, vz: vel.vz };
		strokesRef.current += 1;
		setStrokes(strokesRef.current);
		if (lobbyRef.current) lobbyRef.current.sendScore({ strokes: strokesRef.current, done: false });
	}, []);

	/* ---- Begin / restart a hole ---- */
	const placeBallAtStart = useCallback(() => {
		const hole = holeRef.current;
		if (!hole) return;
		ballRef.current = { x: hole.start.x, z: hole.start.z, vx: 0, vz: 0 };
		prevBallRef.current = ballRef.current;
		strokesRef.current = 0;
		setStrokes(0);
		doneRef.current = false;
		setDone(false);
	}, []);

	const beginHole = useCallback(
		(seed: number, lobby: Lobby | null, m: Mode, dk: DiffKey) => {
			modeRef.current = m;
			seedRef.current = seed;
			setMode(m);
			setDiffKey(dk);
			const hole = generateHole(mulberry32(seed), DIFFS[dk]);
			holeRef.current = hole;
			setPar(hole.par);

			const g = g3Ref.current;
			if (g) {
				g.holeGroup.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
				g.scene.remove(g.holeGroup);
				g.holeGroup = buildHoleGroup(hole, g.mats);
				g.scene.add(g.holeGroup);
			}
			fitCamera(hole);
			placeBallAtStart();

			lobbyRef.current = lobby;
			boardRef.current.clear();
			setBoard([]);
			if (lobby) {
				lobby.onPeers((peers: Peer[]) => {
					peerInfoRef.current.clear();
					for (const p of peers) peerInfoRef.current.set(p.id, { name: p.name, color: p.color });
					setPeerCount(peers.length + 1);
					for (const [id] of [...ghostsRef.current.entries()]) {
						const info = peerInfoRef.current.get(id);
						if (!info) { removeGhost(id); continue; }
						const el = labelElsRef.current.get(id);
						if (el) el.textContent = info.name;
					}
				});
				lobby.onPos((msg: PosMsg) => {
					const ghost = getOrCreateGhost(msg.id);
					if (ghost) ghost.target = { x: msg.x, z: msg.z };
				});
				lobby.onScore((msg: ScoreMsg) => {
					boardRef.current.set(msg.id, { name: msg.name, strokes: msg.strokes, done: msg.done });
					syncBoard();
				});
			}

			setPhase('playing');
			runningRef.current = true;
			lastRef.current = performance.now();
			accRef.current = 0;
			sendAccRef.current = 0;
			rafRef.current = requestAnimationFrame(frame);
			trackGame(gameId, 'game_started');
		},
		[fitCamera, placeBallAtStart, frame, gameId, getOrCreateGhost, removeGhost, syncBoard],
	);

	/** New attempt on the SAME hole (daily consumes a try; free is unlimited). */
	const newAttempt = useCallback(() => {
		if (modeRef.current === 'defi') {
			if (triesRef.current >= MAX_TRIES) return;
			triesRef.current += 1;
			setTries(triesRef.current);
			saveDailyRun(gameId, {
				startedAt: Date.now(),
				done: false,
				seed: seedRef.current,
				diffIndex: DIFF_ORDER.indexOf(diffKey),
				state: { best: bestRef.current ?? 0, tries: triesRef.current },
			});
		}
		placeBallAtStart();
		if (lobbyRef.current) lobbyRef.current.sendScore({ strokes: 0, done: false });
	}, [gameId, diffKey, placeBallAtStart]);

	const play = useCallback(async (m: Mode) => {
		const nm = (name || playerName()).trim();
		if (m === 'defi' && !nm) { setStatus('Entre un pseudo.'); return; }
		if (nm) setPlayerName(nm);
		selfColorRef.current = BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)];
		if (!initScene()) return;

		let dk: DiffKey = diffKey;
		let fixedSeed: number | undefined;
		bestRef.current = null;
		setBest(null);

		if (m === 'defi') {
			setStatus('');
			setDailyLoading(true);
			const d = await getDaily(gameId);
			dk = DIFF_ORDER[d.diffIndex] ?? 'moyen';
			fixedSeed = d.seed;
			setDiffKey(dk);
			setDailyLoading(false);
			// resume today's run (best + tries)
			const run = loadDailyRun(gameId);
			const st = (run?.state as { best?: number; tries?: number } | undefined) ?? { best: 0, tries: 0 };
			triesRef.current = st.tries ?? 0;
			setTries(triesRef.current);
			if (st.best) { bestRef.current = st.best; setBest(st.best); }
			if (triesRef.current >= MAX_TRIES) setAlreadyPlayed(true);
			else { triesRef.current += 1; setTries(triesRef.current); } // this attempt consumes a try
		} else {
			triesRef.current = 0;
			setTries(0);
			setAlreadyPlayed(false);
		}

		let lobby: Lobby | null = null;
		if (m === 'defi' && multiplayerAvailable()) {
			setStatus('Recherche de joueurs…');
			lobby = await joinGolf(nm, selfColorRef.current, { prefix: 'golf-d-' + dk, fixedSeed });
			setStatus('');
		}
		beginHole(fixedSeed ?? randomSeed(), lobby, m, dk);
	}, [name, initScene, diffKey, gameId, beginHole]);

	const quit = useCallback(() => {
		stop();
		lobbyRef.current?.leave();
		lobbyRef.current = null;
		for (const id of [...ghostsRef.current.keys()]) removeGhost(id);
		peerInfoRef.current.clear();
		boardRef.current.clear();
		setBoard([]);
		setPeerCount(1);
		setPhase('menu');
	}, [stop, removeGhost]);

	useEffect(() => {
		const onResize = () => resize();
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
			stop();
			lobbyRef.current?.leave();
			const g = g3Ref.current;
			if (g) {
				for (const id of [...ghostsRef.current.keys()]) removeGhost(id);
				g.holeGroup.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
				Object.values(g.mats).forEach((mm) => (mm as THREE.Material).dispose());
				g.disposables.forEach((d) => d.dispose());
				g.renderer.dispose();
				g3Ref.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const parTag = (n: number) => (n === par ? 'Par' : n < par ? `${n - par}` : `+${n - par}`);

	return (
		<div className="gf-root">
			<style>{CSS}</style>

			<div className="gf-boardwrap">
				<canvas
					ref={canvasRef}
					className="gf-canvas"
					role="img"
					aria-label="Mini-Golf"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
				/>
				<div ref={labelsRef} className="gf-labels" />
				{celebrating && <div className="gf-celebrate"><Celebration /></div>}

				{phase === 'playing' && (
					<div className="gf-hud">
						<span className="gf-cur">{strokes} coups</span>
						<span className="gf-best">Par {par}</span>
						{mode === 'defi' && <span className="gf-peers">👥 {Math.min(peerCount, MAX_PLAYERS)}/{MAX_PLAYERS}</span>}
						{mode === 'defi' && <span className="gf-peers">Essai {Math.min(tries, MAX_TRIES)}/{MAX_TRIES}</span>}
						{aimRef.current.active && <span className="gf-cur">💪 {Math.round(power * 100)}%</span>}
					</div>
				)}

				{phase === 'playing' && board.length > 0 && (
					<ol className="gf-board">
						{board.slice(0, MAX_PLAYERS).map((r) => (
							<li key={r.id}>{r.name} · {r.done ? `${r.strokes} ✓` : `${r.strokes}…`}</li>
						))}
					</ol>
				)}

				{phase === 'playing' && done && (
					<div className="gf-overlay">
						<div className="gf-card">
							<div className="gf-winmark">🏌️</div>
							<h2>Dans le trou&nbsp;!</h2>
							<p className="gf-winscore">{strokes} coups · <strong>{parTag(strokes)}</strong></p>
							{mode === 'defi' ? (
								alreadyPlayed || triesRef.current >= MAX_TRIES ? (
									<p className="gf-sub">Défi terminé · meilleur <strong>{best} coups</strong> — reviens demain&nbsp;!</p>
								) : (
									<button className="gf-play sm" onClick={newAttempt}>↻ Rejouer ({MAX_TRIES - tries} restant{MAX_TRIES - tries > 1 ? 's' : ''})</button>
								)
							) : (
								<div className="gf-modes">
									<button className="gf-play sm" onClick={newAttempt}>↻ Même trou</button>
									<button className="gf-play sm" onClick={() => beginHole(randomSeed(), null, 'libre', diffKey)}>🎲 Nouveau</button>
								</div>
							)}
						</div>
					</div>
				)}

				{webglError && <div className="gf-overlay"><div className="gf-card">3D indisponible (WebGL manquant).</div></div>}

				{phase === 'menu' && !webglError && (
					<div className="gf-overlay">
						<div className="gf-card">
							<h2>Mini-Golf</h2>
							<p className="gf-sub">Tire la balle à la fronde, fais des rebonds, rentre en un minimum de coups.</p>
							<div className="gf-modes" role="tablist" aria-label="Mode">
								<button role="tab" aria-selected={mode === 'defi'} className={`gf-mode ${mode === 'defi' ? 'active' : ''}`} onClick={() => setMode('defi')}>Défi du jour</button>
								<button role="tab" aria-selected={mode === 'libre'} className={`gf-mode ${mode === 'libre' ? 'active' : ''}`} onClick={() => setMode('libre')}>Libre</button>
							</div>
							{mode === 'libre' && (
								<div className="gf-modes" role="tablist" aria-label="Niveau">
									{DIFF_ORDER.map((k) => (
										<button key={k} role="tab" aria-selected={diffKey === k} className={`gf-mode ${diffKey === k ? 'active' : ''}`} onClick={() => setDiffKey(k)}>{DIFFS[k].label}</button>
									))}
								</div>
							)}
							<p className="gf-modehint">{mode === 'defi' ? `Même trou pour tous · ${dailyWeekdayLabel()} · ${MAX_TRIES} essais · fantômes en direct` : `Trou aléatoire · ${DIFFS[diffKey].label}`}</p>
							{mode === 'defi' && (
								<input className="gf-name" value={name} maxLength={20} placeholder="Ton pseudo" onChange={(e) => setName(e.target.value)} />
							)}
							<button className="gf-play" onClick={() => play(mode)} disabled={dailyLoading}>{dailyLoading ? 'Préparation…' : '▶ Jouer'}</button>
							{status && <p className="gf-status">{status}</p>}
							{mode === 'defi' && !multiplayerAvailable() && <p className="gf-status">Multijoueur non configuré — tu joueras en solo.</p>}
						</div>
					</div>
				)}
			</div>

			{phase === 'playing' && (
				<div className="gf-actions">
					{mode === 'libre' && <button className="gf-restart" onClick={() => beginHole(randomSeed(), null, 'libre', diffKey)}>🎲 Nouveau trou</button>}
					<button className="gf-quit" onClick={quit}>Quitter</button>
				</div>
			)}

			{mode === 'defi' && (
				<Leaderboard game={gameId} metric="time" submitValue={done ? best ?? undefined : undefined} format={(v) => `${v} coups`} />
			)}

			<p className="gf-help">
				<strong>Vise à la fronde</strong>&nbsp;: touche/clique près de la balle et tire dans le sens
				opposé à la direction voulue — plus tu tires, plus c'est fort. La balle <strong>rebondit</strong> sur
				les bords et les murs. Au défi du jour, jusqu'à {MAX_PLAYERS} joueurs sur le même trou&nbsp;: tu vois
				leurs balles fantômes en direct, classement au moins de coups.
			</p>
		</div>
	);
}

/* ---------- Styles ---------- */

const CSS = `
.gf-root { --gf-accent: var(--accent-regular); width: 100%; max-width: 560px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); }
.gf-boardwrap { position: relative; width: 100%; max-width: 520px; margin-inline: auto; }
.gf-canvas {
  width: 100%; aspect-ratio: 1 / 1; display: block; background: #0d1117;
  border: 1px solid var(--gray-800); border-radius: 12px;
  touch-action: none; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none;
}
.gf-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.gf-label { position: absolute; transform: translate(-50%, -120%); white-space: nowrap; font-size: 11px; font-weight: 700; color: #fff; background: rgba(0,0,0,0.55); padding: 1px 6px; border-radius: 999px; }
.gf-celebrate { position: absolute; inset: 0; pointer-events: none; }
.gf-hud { position: absolute; top: 8px; left: 8px; display: flex; gap: 6px; flex-wrap: wrap; font-weight: 700; font-size: 12.5px; }
.gf-cur { background: var(--gf-accent); color: var(--accent-text-over); border-radius: 999px; padding: 4px 10px; font-variant-numeric: tabular-nums; }
.gf-best, .gf-peers { background: rgba(0,0,0,0.55); color: #fff; border-radius: 999px; padding: 4px 10px; font-variant-numeric: tabular-nums; }
.gf-board { position: absolute; top: 8px; right: 8px; margin: 0; padding: 6px 10px 6px 26px; list-style: decimal; background: rgba(0,0,0,0.55); color: #fff; border-radius: 10px; font-size: 12px; font-variant-numeric: tabular-nums; }
.gf-actions { display: flex; gap: 10px; justify-content: center; margin-top: 0.7rem; }
.gf-restart, .gf-quit { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 8px 18px; cursor: pointer; }
.gf-restart { background: var(--gf-accent); color: var(--accent-text-over); border-color: transparent; }

.gf-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; background: rgba(6,8,16,0.5); backdrop-filter: blur(2px); border-radius: 12px; }
.gf-card { background: var(--gray-999); border: 2px solid var(--gf-accent); border-radius: 18px; padding: 22px 26px; text-align: center; box-shadow: var(--shadow-lg); max-width: 360px; }
.gf-card h2 { font-family: var(--font-brand); font-weight: 600; font-size: 24px; margin: 0 0 6px; }
.gf-winmark { font-size: 30px; }
.gf-winscore { font-size: 18px; margin: 2px 0 10px; }
.gf-winscore strong { color: var(--gf-accent); }
.gf-sub { color: var(--gray-300); font-size: 13px; margin: 0 0 14px; line-height: 1.5; }
.gf-modes { display: flex; gap: 6px; justify-content: center; margin-bottom: 8px; flex-wrap: wrap; }
.gf-mode { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.gf-mode.active { background: var(--gf-accent); color: var(--accent-text-over); border-color: transparent; }
.gf-modehint { color: var(--gray-300); font-size: 11.5px; margin: 0 0 10px; }
.gf-name { width: 100%; box-sizing: border-box; border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; border-radius: 999px; padding: 9px 16px; margin-bottom: 10px; text-align: center; }
.gf-play { border: none; background: var(--gf-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 16px; border-radius: 999px; padding: 12px 28px; cursor: pointer; }
.gf-play.sm { font-size: 14px; padding: 9px 20px; }
.gf-play:disabled { opacity: 0.6; cursor: default; }
.gf-status { color: var(--gray-300); font-size: 12px; margin: 10px 0 0; }
.gf-help { max-width: 460px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin: 1rem auto 0; }
`;
