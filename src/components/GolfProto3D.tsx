import { useEffect, useRef, useState, useCallback } from 'react';
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
	type Vec,
} from '../games/golf/engine';
import {
	BALL_VIS,
	CORNERS,
	CUP_D,
	SINK_MS,
	buildHole3D,
	disposeHole,
	fitDist,
	groundYOf,
	nearestSample,
	surfaceY,
} from '../games/golf/render3d';
import { mulberry32 } from '../games/prng';

/* =====================================================
   MINI-GOLF 3D — proto only, not the shipped game.
   Same engine as /jeux/golf (generateHole + stepBall, untouched): the ball still
   moves in XZ. What changes is the rendering — `hole.alt`, which the game draws
   as a colour ramp, is used here as a real height, and the walls get sides.
   Purpose: judge the tilted camera, and above all measure how often the course
   hides the ball on a phone.
   ===================================================== */

type DiffKey = keyof typeof DIFFS;
const DIFF_ORDER: DiffKey[] = ['facile', 'moyen', 'difficile'];
const MODES: [CamMode, string][] = [
	['fit', 'Trou entier, incliné'],
	['shoulder', "Caméra d'épaule"],
	['top', 'Vue du dessus (jeu actuel)'],
];
const STEP = 1000 / 60;
const GRAB_R = 4.5;
// Drag length that means full power, as a share of the stage height. Aim used to be
// measured on the ground plane, so the same gesture was worth half the power from a
// shoulder camera as it was framed wide — the pull is read in pixels now.
const DRAG_H = 0.28;

type CamMode = 'fit' | 'shoulder' | 'top';
interface Cam {
	pitch: number; dist: number; relief: number; bank: number; zoom: number; power: number; mode: CamMode;
}

/* ---------- authored shapes ----------
   A real hole is short, wide and reads as one clear figure; the engine's random walk
   draws long meandering ribbons instead. These are hand-drawn polylines — the engine
   still does everything else (widths, walls, green, obstacles, relief). */
interface Shape { key: string; label: string; width: number; length: number; ctrl?: Vec[] }

/** Resample a polyline at even arc length, so Catmull sampling and `ds` stay uniform. */
function mkShape(key: string, label: string, width: number, poly: Vec[]): Shape {
	const cum = [0];
	for (let i = 1; i < poly.length; i++)
		cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].z - poly[i - 1].z));
	const length = cum[cum.length - 1];
	const N = 16;
	const ctrl: Vec[] = [];
	for (let k = 0; k <= N; k++) {
		const t = (length * k) / N;
		let i = 1;
		while (i < cum.length - 1 && cum[i] < t) i++;
		const u = (t - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
		ctrl.push({
			x: poly[i - 1].x + (poly[i].x - poly[i - 1].x) * u,
			z: poly[i - 1].z + (poly[i].z - poly[i - 1].z) * u,
		});
	}
	return { key, label, width, length, ctrl };
}

/** Coils in to the middle, where the green sits. Kept narrow so two coils never touch. */
function spiralPoly(): Vec[] {
	const pts: Vec[] = [];
	for (let i = 0; i <= 120; i++) {
		const t = i / 120;
		const a = t * 1.6 * Math.PI * 2;
		const r = 36 + (2 - 36) * t;
		pts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
	}
	return pts;
}

const SHAPES: Shape[] = [
	{ key: 'winding', label: 'Aléatoire (moteur)', width: 0, length: 0 },
	mkShape('straight', 'Ligne droite', 15, [{ x: 0, z: 0 }, { x: 0, z: -64 }]),
	mkShape('elbow', 'Coude', 14, [{ x: 0, z: 0 }, { x: 0, z: -44 }, { x: 44, z: -44 }]),
	mkShape('ess', 'Double virage', 13, [
		{ x: 0, z: 0 }, { x: 0, z: -20 }, { x: 28, z: -36 }, { x: 28, z: -60 }, { x: 0, z: -76 },
	]),
	mkShape('horseshoe', 'Fer à cheval', 13, [
		{ x: 0, z: 0 }, { x: 0, z: -40 }, { x: 17, z: -54 }, { x: 34, z: -40 }, { x: 34, z: -4 },
	]),
	mkShape('spiral', 'Spirale', 8, spiralPoly()),
];

export default function GolfProto3D() {
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	const [diff, setDiff] = useState<DiffKey>('moyen');
	const [shape, setShape] = useState('winding');
	const [seed, setSeed] = useState(1337);
	const [cam, setCam] = useState<Cam>({
		pitch: 45, dist: 26, relief: 0.1, bank: 5, zoom: 1, power: 1, mode: 'fit',
	});
	const [portrait, setPortrait] = useState(false);
	const [strokes, setStrokes] = useState(0);
	const [par, setPar] = useState(0);
	const [sunk, setSunk] = useState(false);
	const [hidden, setHidden] = useState(0); // % of frames where the course masks the ball
	const [deco, setDeco] = useState(0); // … and where only the scenery is in the way
	const [probed, setProbed] = useState(0);

	const camRef = useRef(cam);
	camRef.current = cam;

	const sceneRef = useRef<{
		renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; sun: THREE.DirectionalLight;
		ball: THREE.Mesh; shade: THREE.Mesh; ring: THREE.Mesh; arrow: THREE.Mesh; ground: THREE.Mesh;
		group: THREE.Group | null;
	} | null>(null);
	const holeRef = useRef<Hole | null>(null);
	const ballRef = useRef<Ball>({ x: 0, z: 0, vx: 0, vz: 0 });
	// `px`/`pz` give the aim direction on the ground; `pull` is the power, read off the screen.
	const aimRef = useRef({ active: false, px: 0, pz: 0, pull: 0 });
	const azRef = useRef(0);
	const fitRef = useRef({ x: 0, y: 0, z: 0, hx: 40, hz: 40, az: 0 }); // bounding box of the hole
	const orbitRef = useRef<{ x: number; az: number } | null>(null);
	const rayRef = useRef(new THREE.Raycaster());
	const occRef = useRef({ hit: 0, deco: 0, total: 0 });
	const sinkRef = useRef<number | null>(null); // RAF timestamp of the drop, null while playing

	/* ---------- scene bootstrap (once) ---------- */
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x87b7e8);
		scene.fog = new THREE.Fog(0x87b7e8, 260, 900);

		const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 1200);
		const amb = new THREE.HemisphereLight(0xffffff, 0x4a6b3a, 1.05);
		scene.add(amb);
		const sun = new THREE.DirectionalLight(0xfff3d6, 1.5);
		sun.position.set(40, 70, 20);
		sun.castShadow = true;
		// The shadow frustum is refitted to each hole; a fixed 200-unit box spread these
		// texels so thin that the ball's own shadow fell between two of them and vanished.
		sun.shadow.mapSize.set(2048, 2048);
		sun.shadow.camera.near = 1;
		sun.shadow.camera.far = 400;
		sun.shadow.normalBias = 0.03;
		scene.add(sun);
		scene.add(sun.target);

		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(900, 900),
			new THREE.MeshStandardMaterial({ color: 0x2f5d33, roughness: 1 }),
		);
		ground.rotation.x = -Math.PI / 2;
		ground.receiveShadow = true;
		scene.add(ground);

		const ball = new THREE.Mesh(
			new THREE.SphereGeometry(PARAMS.ballR * BALL_VIS, 20, 16),
			new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 }),
		);
		ball.castShadow = true;
		scene.add(ball);

		// Painted contact shadow. The cast one comes and goes with the sun angle and the
		// slope; this one is always there, and it is what tells you where the ball sits.
		const shade = new THREE.Mesh(
			new THREE.CircleGeometry(PARAMS.ballR * BALL_VIS * 1.25, 20),
			new THREE.MeshBasicMaterial({ color: 0x0b1a0d, transparent: true, opacity: 0.34, depthWrite: false }),
		);
		shade.rotation.x = -Math.PI / 2;
		shade.renderOrder = 2;
		scene.add(shade);

		const ring = new THREE.Mesh(
			new THREE.RingGeometry(PARAMS.ballR * 1.8, PARAMS.ballR * 2.2, 24),
			new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
		);
		ring.rotation.x = -Math.PI / 2;
		scene.add(ring);

		const ag = new THREE.BufferGeometry();
		ag.setAttribute('position', new THREE.Float32BufferAttribute([
			0, 0, -0.18, 0.8, 0, -0.18, 0.8, 0, 0.18,
			0, 0, -0.18, 0.8, 0, 0.18, 0, 0, 0.18,
			0.74, 0, -0.5, 1.05, 0, 0, 0.74, 0, 0.5,
		], 3));
		const arrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0x30d158, side: THREE.DoubleSide }));
		arrow.visible = false;
		scene.add(arrow);

		sceneRef.current = { renderer, scene, camera, sun, ball, shade, ring, arrow, ground, group: null };

		const resize = () => {
			const w = wrapRef.current;
			if (!w) return;
			const cw = w.clientWidth, ch = w.clientHeight;
			renderer.setSize(cw, ch, false);
			camera.aspect = cw / Math.max(1, ch);
			camera.updateProjectionMatrix();
		};
		resize();
		const ro = new ResizeObserver(resize);
		if (wrapRef.current) ro.observe(wrapRef.current);

		return () => {
			ro.disconnect();
			renderer.dispose();
			sceneRef.current = null;
		};
	}, []);

	/* ---------- (re)build the hole ---------- */
	useEffect(() => {
		const g = sceneRef.current;
		if (!g) return;
		// An authored shape brings its own length and width; the difficulty still sets the
		// cup size, the obstacles and the slopes.
		const sh = SHAPES.find((s) => s.key === shape) ?? SHAPES[0];
		const level = sh.ctrl ? { ...DIFFS[diff], length: sh.length, width: sh.width } : DIFFS[diff];
		const hole = generateHole(mulberry32(seed), level, sh.ctrl);
		holeRef.current = hole;
		ballRef.current = { x: hole.start.x, z: hole.start.z, vx: 0, vz: 0 };
		setStrokes(0);
		setPar(hole.par);
		setSunk(false);
		sinkRef.current = null;
		occRef.current = { hit: 0, deco: 0, total: 0 };
		if (g.group) {
			g.scene.remove(g.group);
			disposeHole(g.group);
		}
		const grp = buildHole3D(hole, { relief: cam.relief, bank: cam.bank });
		g.scene.add(grp);
		g.group = grp;
		// Sit the surrounding lawn just under the course, else it reads as a floating table.
		g.ground.position.y = groundYOf(hole, cam.relief);

		// The engine's bounds ignore the pond, which the proto adds — widen or it gets cropped.
		const bo = hole.bounds;
		const pond = grp.userData.pond as { x: number; z: number; r: number } | undefined;
		const minX = Math.min(bo.minX, pond ? pond.x - pond.r : Infinity);
		const maxX = Math.max(bo.maxX, pond ? pond.x + pond.r : -Infinity);
		const minZ = Math.min(bo.minZ, pond ? pond.z - pond.r : Infinity);
		const maxZ = Math.max(bo.maxZ, pond ? pond.z + pond.r : -Infinity);
		const fx = (minX + maxX) / 2, fz = (minZ + maxZ) / 2;
		fitRef.current = {
			x: fx, y: surfaceY(hole, fx, fz, cam.relief, cam.bank), z: fz,
			hx: (maxX - minX) / 2 + 3, hz: (maxZ - minZ) / 2 + 3,
			az: Math.atan2(hole.cup.z - hole.start.z, hole.cup.x - hole.start.x),
		};
		g.ground.position.x = fx; g.ground.position.z = fz;

		// Wrap the shadow frustum around this hole only, so its texels stay small.
		const R = Math.max(maxX - minX, maxZ - minZ) / 2 + 14;
		const sc = g.sun.shadow.camera;
		sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R;
		sc.updateProjectionMatrix();
		g.sun.position.set(fx + 40, 70, fz + 20);
		g.sun.target.position.set(fx, 0, fz);
		g.sun.target.updateMatrixWorld();

		azRef.current = fitRef.current.az;
		orbitRef.current = null;
	}, [seed, diff, shape, cam.relief, cam.bank]);

	/* ---------- input ---------- */
	const worldFromPointer = useCallback((cx: number, cy: number, y: number) => {
		const g = sceneRef.current, canvas = canvasRef.current;
		if (!g || !canvas) return null;
		const r = canvas.getBoundingClientRect();
		rayRef.current.setFromCamera(
			new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1)),
			g.camera,
		);
		const hit = new THREE.Vector3();
		// The aim plane rides at the ball's height — on a bumpy course y = 0 would drift.
		if (!rayRef.current.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), hit)) return null;
		return { x: hit.x, z: hit.z };
	}, []);

	/** Pointer-to-ball distance in CSS pixels. */
	const screenDist = useCallback((cx: number, cy: number, x: number, y: number, z: number) => {
		const g = sceneRef.current, canvas = canvasRef.current;
		if (!g || !canvas) return Infinity;
		const r = canvas.getBoundingClientRect();
		const v = new THREE.Vector3(x, y + PARAMS.ballR, z).project(g.camera);
		return Math.hypot(r.left + ((v.x + 1) / 2) * r.width - cx, r.top + ((1 - v.y) / 2) * r.height - cy);
	}, []);

	/** Pull in world units for a drag of `px` pixels — the same gesture in any camera. */
	const pullFromScreen = useCallback((px: number) => {
		const r = canvasRef.current?.getBoundingClientRect();
		return (px / ((r?.height || 600) * DRAG_H)) * PARAMS.maxPull;
	}, []);

	const onPointerDown = (e: React.PointerEvent) => {
		const hole = holeRef.current, b = ballRef.current;
		if (!hole || sunk || !isSettled(b)) return;
		const c = camRef.current;
		const by = surfaceY(hole, b.x, b.z, c.relief, c.bank) + PARAMS.ballR;
		const w = worldFromPointer(e.clientX, e.clientY, by);
		if (!w) return;
		// Grab in pixels, not world units: framed whole, the hole is far away and a fixed
		// world radius shrinks to a couple of pixels — the ball becomes impossible to grab.
		if (screenDist(e.clientX, e.clientY, b.x, by, b.z) <= 60 || Math.hypot(w.x - b.x, w.z - b.z) <= GRAB_R) {
			aimRef.current = { active: true, px: w.x, pz: w.z, pull: 0 };
		} else {
			orbitRef.current = { x: e.clientX, az: azRef.current }; // drag away from the ball = turn around it
		}
		(e.target as Element).setPointerCapture?.(e.pointerId);
	};

	const onPointerMove = (e: React.PointerEvent) => {
		if (orbitRef.current) {
			azRef.current = orbitRef.current.az + (e.clientX - orbitRef.current.x) * 0.008;
			return;
		}
		if (!aimRef.current.active) return;
		const hole = holeRef.current, b = ballRef.current;
		if (!hole) return;
		const c = camRef.current;
		const by = surfaceY(hole, b.x, b.z, c.relief, c.bank) + PARAMS.ballR;
		const w = worldFromPointer(e.clientX, e.clientY, by);
		if (w) {
			aimRef.current = {
				active: true, px: w.x, pz: w.z,
				pull: pullFromScreen(screenDist(e.clientX, e.clientY, b.x, by - PARAMS.ballR, b.z)),
			};
		}
	};

	const onPointerUp = () => {
		orbitRef.current = null;
		const aim = aimRef.current;
		if (!aim.active) return;
		const b = ballRef.current;
		aimRef.current = { active: false, px: 0, pz: 0, pull: 0 };
		// The ground drag only gives the direction; the power comes from the screen pull.
		const dx = aim.px - b.x, dz = aim.pz - b.z;
		const m = Math.hypot(dx, dz);
		if (!m) return;
		const v = aimToVelocity(
			{ x: (dx / m) * aim.pull, z: (dz / m) * aim.pull },
			{ ...PARAMS, powerScale: PARAMS.powerScale * camRef.current.power },
		);
		if (!v) return;
		b.vx = v.vx; b.vz = v.vz;
		setStrokes((s) => s + 1);
	};

	/* ---------- loop ---------- */
	useEffect(() => {
		let raf = 0, last = 0, acc = 0;
		const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

		const frame = (now: number) => {
			raf = requestAnimationFrame(frame);
			const g = sceneRef.current, hole = holeRef.current;
			if (!g || !hole) return;
			if (!last) last = now;
			acc += Math.min(now - last, 250);
			last = now;

			// Physics: the untouched 2D engine — only the drawing knows about height.
			while (acc >= STEP) {
				acc -= STEP;
				const r = stepBall(ballRef.current, hole, STEP / 1000);
				ballRef.current = r.ball;
				if (r.sunk) {
					if (sinkRef.current === null) sinkRef.current = now;
					setSunk(true);
				}
			}

			const b = ballRef.current;
			const c = camRef.current;
			const rel = c.relief;
			const by = surfaceY(hole, b.x, b.z, rel, c.bank);
			const vr = PARAMS.ballR * BALL_VIS;
			// Drop into the cup: the engine snaps the ball to the centre and stops it, so all
			// that is left is to let it fall out of sight.
			let ballY = by + vr;
			if (sinkRef.current !== null) {
				const k = Math.min(1, (now - sinkRef.current) / SINK_MS);
				const cupY = (g.group?.userData.cupY as number | undefined) ?? by;
				ballY = by + vr + (cupY - CUP_D + vr - (by + vr)) * (k * k);
			}
			g.ball.position.set(b.x, ballY, b.z);
			g.shade.position.set(b.x, by + 0.05, b.z);
			g.shade.visible = sinkRef.current === null;
			g.ring.position.set(b.x, by + 0.09, b.z);
			g.ring.visible = isSettled(b) && !sunk && !aimRef.current.active;

			// Aim arrow: launch side, length ∝ pull.
			const aim = aimRef.current;
			g.arrow.visible = aim.active;
			if (aim.active) {
				const dx = aim.px - b.x, dz = aim.pz - b.z;
				const pw = Math.min(aim.pull, PARAMS.maxPull) / PARAMS.maxPull;
				g.arrow.position.set(b.x, by + 0.35, b.z);
				g.arrow.rotation.y = -Math.atan2(-dz, -dx);
				g.arrow.scale.set(3 + pw * 10, 1, 1 + pw * 1.6);
				(g.arrow.material as THREE.MeshBasicMaterial).color.setHex(
					pw > 0.8 ? 0xff453a : pw > 0.5 ? 0xffd60a : 0x30d158,
				);
			}

			// Camera. `top` and `fit` both frame the whole hole like the shipped game —
			// only the pitch differs, which is exactly the comparison this proto is for.
			// `shoulder` is the other end of the spectrum: close behind the ball.
			const f = fitRef.current;
			if (c.mode === 'shoulder') {
				const i = nearestSample(hole, b.x, b.z);
				const p = hole.path[i];
				const want = Math.atan2(p.dirZ, p.dirX);
				if (!orbitRef.current) {
					let d = ((want - azRef.current + Math.PI) % (Math.PI * 2)) - Math.PI;
					if (d < -Math.PI) d += Math.PI * 2;
					azRef.current += d * 0.03; // ease toward "down the fairway"
				}
				const pitch = (c.pitch * Math.PI) / 180;
				const flat = Math.cos(pitch) * c.dist;
				g.camera.position.set(
					b.x - Math.cos(azRef.current) * flat,
					by + Math.sin(pitch) * c.dist,
					b.z - Math.sin(azRef.current) * flat,
				);
				// Aim ahead of the ball, not at it, so the fairway fills the frame.
				g.camera.lookAt(b.x + Math.cos(azRef.current) * 10, by + 1.2, b.z + Math.sin(azRef.current) * 10);
			} else {
				const pitch = ((c.mode === 'top' ? 89.5 : c.pitch) * Math.PI) / 180;
				const az = c.mode === 'top' ? f.az : azRef.current;
				const place = (d: number, tx: number, ty: number, tz: number) => {
					g.camera.position.set(
						tx - Math.cos(az) * Math.cos(pitch) * d,
						ty + Math.sin(pitch) * d,
						tz - Math.sin(az) * Math.cos(pitch) * d,
					);
					g.camera.lookAt(tx, ty, tz);
					g.camera.updateMatrixWorld();
				};
				// The closed-form fit is only an ortho approximation — under a tilt the near
				// end of the course grows and spills out. Seed with it, then pull back until
				// the four corners actually project inside the frame.
				let d = fitDist(g.camera, f.hx, f.hz, pitch, az);
				for (let it = 0; it < 4; it++) {
					place(d, f.x, f.y, f.z);
					let m = 0;
					for (const [sx, sz] of CORNERS) {
						tmpC.set(f.x + sx * f.hx, f.y, f.z + sz * f.hz).project(g.camera);
						m = Math.max(m, Math.abs(tmpC.x), Math.abs(tmpC.y));
					}
					d *= Math.max(0.6, Math.min(1.8, m / 0.94));
				}
				// Zoom follows the ball, but the target is held near the course so the frame
				// never wanders off into the lawn. At zoom 1 the range collapses onto the fit
				// centre, which is exactly the framing above. The 1.5 lets the view hang a
				// little past the edge — otherwise a ball on the tee sits pinned to the bottom.
				const zf = Math.max(1, c.zoom);
				const cl = (v: number, mid: number, half: number) => {
					const r = Math.min(half, half * (1 - 1 / zf) * 1.5);
					return Math.max(mid - r, Math.min(mid + r, v));
				};
				place(
					d / zf,
					cl(b.x, f.x, f.hx), f.y + (by - f.y) * (1 - 1 / zf), cl(b.z, f.z, f.hz),
				);
			}

			// Occlusion probe. Course and scenery are counted apart: a course that hides the
			// ball is a dead end, scenery in the way is just a placement rule.
			// Only a blocker well clear of the ball counts — the lawn the ball rests on is
			// always grazed by a low camera and would score every frame as a false positive.
			if (g.group && c.mode !== 'top') {
				tmpA.copy(g.camera.position);
				tmpB.set(b.x, by + PARAMS.ballR * 2, b.z).sub(tmpA);
				const dist = tmpB.length();
				rayRef.current.set(tmpA, tmpB.normalize());
				const blocked = (objs: THREE.Object3D[]) => {
					const h = rayRef.current.intersectObjects(objs, true);
					return h.length > 0 && h[0].distance < dist - 2.5;
				};
				const kids = g.group.children;
				const o = occRef.current;
				o.total++;
				if (blocked(kids.filter((k) => k.name !== 'decor'))) o.hit++;
				else if (blocked(kids.filter((k) => k.name === 'decor'))) o.deco++;
			}

			// Where the ball is, on screen (canvas pixels) and in the world. The snapshot
			// harness aims its drags with it — a fixed screen point misses as soon as the
			// framing zooms — and measures how far a shot rolls.
			tmpC.set(b.x, ballY, b.z).project(g.camera);
			(window as unknown as Record<string, unknown>).__gpBall = {
				x: ((tmpC.x + 1) / 2) * g.renderer.domElement.clientWidth,
				y: ((1 - tmpC.y) / 2) * g.renderer.domElement.clientHeight,
				wx: b.x, wz: b.z, speed: Math.hypot(b.vx, b.vz),
			};

			g.renderer.render(g.scene, g.camera);
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	}, [sunk]);

	// Occlusion readout, refreshed once a second (a per-frame setState would thrash).
	useEffect(() => {
		const id = setInterval(() => {
			const o = occRef.current;
			setHidden(o.total ? Math.round((o.hit / o.total) * 100) : 0);
			setDeco(o.total ? Math.round((o.deco / o.total) * 100) : 0);
			setProbed(o.total);
		}, 1000);
		return () => clearInterval(id);
	}, []);

	// A reading only means something for one camera — start over when it changes.
	useEffect(() => {
		occRef.current = { hit: 0, deco: 0, total: 0 };
	}, [cam.mode, cam.pitch, cam.dist, cam.zoom, portrait]);

	const set = (patch: Partial<Cam>) => setCam((c) => ({ ...c, ...patch }));

	return (
		<div className="gp-root">
			<style>{CSS}</style>

			<div className={`gp-stage ${portrait ? 'portrait' : ''}`} ref={wrapRef}>
				<canvas
					ref={canvasRef}
					className="gp-canvas"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
				/>
				<div className="gp-hud">
					<span className="gp-chip">Coups {strokes} · Par {par || '—'}</span>
					<span className={`gp-chip ${hidden > 12 ? 'warn' : ''}`}>Parcours masque {hidden}%</span>
					<span className={`gp-chip ${deco > 12 ? 'warn' : ''}`}>Décor masque {deco}% ({probed} img)</span>
					{sunk && <span className="gp-chip win">Dans le trou !</span>}
				</div>
			</div>

			<div className="gp-panel">
				<div className="gp-row">
					{MODES.map(([k, label]) => (
						<button key={k} className={`gp-btn ${cam.mode === k ? 'on' : ''}`} onClick={() => set({ mode: k })}>
							{label}
						</button>
					))}
					<button className="gp-btn" onClick={() => setPortrait((p) => !p)}>
						{portrait ? 'Format large' : 'Format téléphone'}
					</button>
					<button className="gp-btn" onClick={() => setSeed(Math.floor(Math.random() * 2 ** 31))}>
						Nouveau trou
					</button>
					{DIFF_ORDER.map((k) => (
						<button key={k} className={`gp-btn ${diff === k ? 'on' : ''}`} onClick={() => setDiff(k)}>
							{DIFFS[k].label}
						</button>
					))}
				</div>
				<div className="gp-row">
					<span className="gp-lab">Forme</span>
					{SHAPES.map((s) => (
						<button key={s.key} className={`gp-btn ${shape === s.key ? 'on' : ''}`} onClick={() => setShape(s.key)}>
							{s.label}
						</button>
					))}
				</div>
				<div className="gp-row">
					<label className="gp-slider">
						Inclinaison <b>{cam.pitch}°</b>
						<input type="range" min="12" max="85" value={cam.pitch} disabled={cam.mode === 'top'}
							onChange={(e) => set({ pitch: +e.target.value })} />
					</label>
					<label className="gp-slider">
						Recul <b>{cam.dist}</b>
						<input type="range" min="12" max="60" value={cam.dist} disabled={cam.mode !== 'shoulder'}
							onChange={(e) => set({ dist: +e.target.value })} />
					</label>
					<label className="gp-slider">
						Zoom <b>{cam.zoom.toFixed(1)}×</b>
						<input type="range" min="1" max="6" step="0.1" value={cam.zoom} disabled={cam.mode === 'shoulder'}
							onChange={(e) => set({ zoom: +e.target.value })} />
					</label>
				</div>
				<div className="gp-row">
					<label className="gp-slider">
						Relief <b>{cam.relief.toFixed(1)}×</b>
						<input type="range" min="0" max="2" step="0.1" value={cam.relief}
							onChange={(e) => set({ relief: +e.target.value })} />
					</label>
					<label className="gp-slider">
						Dévers <b>{cam.bank}</b>
						<input type="range" min="0" max="10" step="1" value={cam.bank}
							onChange={(e) => set({ bank: +e.target.value })} />
					</label>
					<label className="gp-slider">
						Puissance <b>{cam.power.toFixed(2)}×</b>
						<input type="range" min="0.6" max="2" step="0.05" value={cam.power}
							onChange={(e) => set({ power: +e.target.value })} />
					</label>
				</div>
				<p className="gp-note">
					Tire depuis la balle pour viser (comme dans le jeu), glisse ailleurs pour tourner le trou.
					Le moteur est celui de <a href="/jeux/golf/">/jeux/golf</a>, inchangé : la balle reste en 2D,
					seul l'affichage lit l'altitude. <b>Relief 0×</b> = la géométrie plate d'aujourd'hui, juste
					vue de biais. <b>Dévers</b> incline la piste dans les virages : la poussée latérale existe
					déjà dans le moteur, ce réglage la rend visible. La force du tir se mesure en pixels
					(≈ 28&nbsp;% de la hauteur = plein pot) : le même geste tape pareil quelle que soit la
					caméra. <b>Balle masquée</b> compte les images où le décor cache la balle — c'est le vrai
					risque du passage en 3D sur téléphone.
				</p>
			</div>
		</div>
	);
}

const CSS = `
.gp-root { width: 100%; max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
.gp-stage { position: relative; width: 100%; aspect-ratio: 16 / 10; border-radius: 14px; overflow: hidden; background: #87b7e8; box-shadow: var(--shadow-md); }
.gp-stage.portrait { max-width: 390px; margin: 0 auto; aspect-ratio: 390 / 620; }
.gp-canvas { width: 100%; height: 100%; display: block; touch-action: none; }
.gp-hud { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; gap: 6px; flex-wrap: wrap; pointer-events: none; }
.gp-chip { background: rgba(10,14,20,0.6); color: #eef4fb; font-size: 12.5px; font-weight: 600; padding: 5px 12px; border-radius: 999px; backdrop-filter: blur(4px); font-variant-numeric: tabular-nums; }
.gp-chip.warn { background: rgba(200,60,40,0.78); }
.gp-chip.win { background: rgba(48,209,88,0.85); color: #06210f; }
.gp-panel { display: flex; flex-direction: column; gap: 10px; }
.gp-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.gp-btn { border: 1.5px solid var(--gray-700); background: var(--gray-999_40); color: var(--gray-100); font: inherit; font-size: 13px; font-weight: 600; border-radius: 999px; padding: 7px 14px; cursor: pointer; }
.gp-btn:hover { border-color: var(--accent-regular); color: var(--gray-0); }
.gp-btn.on { background: var(--accent-regular); border-color: var(--accent-regular); color: var(--accent-text-over); }
.gp-lab { font-size: 13px; color: var(--gray-300); }
.gp-slider { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--gray-300); }
.gp-slider b { color: var(--gray-100); font-variant-numeric: tabular-nums; min-width: 3.2em; }
.gp-slider input { width: 130px; }
.gp-note { font-size: 13px; line-height: 1.6; color: var(--gray-300); margin: 0; max-width: 70ch; }
.gp-note b { color: var(--gray-100); }
`;
