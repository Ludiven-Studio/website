import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
	DIFFS,
	PARAMS,
	generateHole,
	stepBall,
	aimToVelocity,
	isSettled,
	encodeScore,
	type Hole,
	type Ball,
} from './engine';
import {
	BALL_R_VIS,
	CORNERS,
	CUP_D,
	SINK_MS,
	animateHole,
	bestAz,
	buildHole3D,
	disposeHole,
	fitDist,
	groundYOf,
	nearestSample,
	surfaceY,
} from './render3d';
import { mulberry32 } from '../prng';
import { formatScore, fmtCentis } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
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
import { usePointerDrag } from '../usePointerDrag';
import ModeToggle from '../../components/ModeToggle';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import { useLevels } from '../../lib/useLevels';
import { golfLevels, type GolfLevelCfg } from './levels';

/* =====================================================
   MINI-GOLF — 3D arcade course (three.js + Supabase Realtime).
   Slingshot aim (pull back, launch opposite, power ∝ pull), bounces off borders
   and walls. Daily : same hole for everyone, 10 attempts, best = fewest strokes.
   Other players are non-colliding ghost balls with a pseudo. Engine pure/tested
   and still 2D — only the drawing (see render3d.ts) knows about height.
   ===================================================== */

type Phase = 'menu' | 'playing';
type Mode = 'libre' | 'defi';
type DiffKey = keyof typeof DIFFS;
type CamMode = 'fit' | 'shoulder' | 'top';
const DIFF_ORDER: DiffKey[] = ['facile', 'moyen', 'difficile'];
const STEP = 1000 / 60;
const SEND_HZ = 12;
const MAX_TRIES = 10;
const fmtTime = (s: number) => fmtCentis(Math.round(s * 100));
const BALL_COLORS = [0xff3b30, 0x0a84ff, 0xffd60a, 0x30d158, 0xbf5af2];
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
const RELIEF = 0.1; // height scale along the hole — enough to read, flat enough to putt
const BANK = 5; // cross slope in the turns; the engine already curves the ball there
const SUN_DIR = new THREE.Vector3(40, 70, 20).normalize();
const CAM_TAU = 0.08; // how fast the camera catches the pose its mode asks for, in seconds
const PITCH = 45; // camera tilt (deg) for the framed views
const TOP_PITCH = 89.5;
const SHOULDER_PITCH = 30;
const SHOULDER_DIST = 26;
// Drag length that means full power, as a share of the canvas height. Read in pixels,
// not on the ground plane: the same gesture must hit as hard from every camera.
const DRAG_H = 0.28;
const ZOOM_MAX = 5;
const GRAB_R = 4.5; // world radius around the ball that starts an aim…
const GRAB_PX = 60; // …or this many pixels, for when the whole hole is framed far away
const CAM_LABEL: Record<CamMode, string> = { fit: '🎥', shoulder: '🏌️', top: '🛰' };
const CAM_NEXT: Record<CamMode, CamMode> = { fit: 'shoulder', shoulder: 'top', top: 'fit' };
const INTRO_MS = 1900; // opening flyover, sky → behind the ball
const CAM_GLIDE_MS = 620; // and the same move when the camera button is pressed
const tmpV = new THREE.Vector3();
const camEye = new THREE.Vector3();
const camLook = new THREE.Vector3();

interface Ghost {
	mesh: THREE.Mesh;
	cur: { x: number; z: number };
	target: { x: number; z: number };
}
interface Scene3D {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	sun: THREE.DirectionalLight;
	ball: THREE.Mesh;
	shade: THREE.Mesh; // painted contact shadow — the cast one comes and goes with the sun
	ballRing: THREE.Mesh; // "touch here to aim" hint around the ball
	aimArrow: THREE.Mesh;
	ground: THREE.Mesh;
	holeGroup: THREE.Group;
	disposables: { dispose: () => void }[];
}

function buildArrowGeom(): THREE.BufferGeometry {
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute([
		0, 0, -0.18, 0.8, 0, -0.18, 0.8, 0, 0.18,
		0, 0, -0.18, 0.8, 0, 0.18, 0, 0, 0.18,
		0.74, 0, -0.5, 1.05, 0, 0, 0.74, 0, 0.5,
	], 3));
	return g;
}

function makeBall(color: number, ghost = false): THREE.Mesh {
	const geo = new THREE.SphereGeometry(BALL_R_VIS, 20, 16);
	const mat = new THREE.MeshStandardMaterial({
		color: ghost ? color : 0xffffff,
		roughness: 0.4,
		metalness: 0.05,
		transparent: ghost,
		opacity: ghost ? 0.5 : 1,
		emissive: ghost ? color : 0x000000,
		emissiveIntensity: ghost ? 0.25 : 0,
	});
	const m = new THREE.Mesh(geo, mat);
	m.castShadow = !ghost;
	return m;
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
	const [elapsed, setElapsed] = useState(0);
	const [board, setBoard] = useState<{ id: string; name: string; strokes: number; done: boolean; time: number }[]>([]);
	const [camMode, setCamMode] = useState<CamMode>('fit');
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
	const boardRef = useRef<Map<string, { name: string; strokes: number; done: boolean; time: number }>>(new Map());
	const strokesRef = useRef(0);
	const bestRef = useRef<number | null>(null); // best ENCODED score (strokes+time) of the day
	const startTimeRef = useRef(0); // performance.now() at the attempt's first stroke (0 = not started)
	const hudAccRef = useRef(0);
	const doneRef = useRef(false);
	const triesRef = useRef(0);
	const modeRef = useRef<Mode>('defi');
	const seedRef = useRef(0);
	// `px`/`pz` give the aim direction on the ground; `pull` is the power, read off the screen.
	const aimRef = useRef({ active: false, px: 0, pz: 0, pull: 0 });
	const zoomRef = useRef(1);
	const camModeRef = useRef<CamMode>('fit');
	// A camera move is a blend from a frozen pose toward whatever the live mode wants.
	const camTweenRef = useRef<{ eye: THREE.Vector3; look: THREE.Vector3; t0: number; dur: number } | null>(null);
	const camLookRef = useRef(new THREE.Vector3());
	// Where the camera actually is, chasing the pose the mode asks for. Without this lag the
	// eye copies every step the ball takes and the ride reads as a series of nudges.
	const camSmoothRef = useRef({ eye: new THREE.Vector3(), look: new THREE.Vector3(), on: false });
	const lastFrameRef = useRef(0);
	const introRef = useRef(false);
	const azRef = useRef(0); // camera azimuth around the target
	// Bounding box of the hole. `base` is the tee→cup heading; `az`/`azTop` are the framings
	// derived from it, which depend on the canvas shape and so are refreshed on every resize.
	const fitRef = useRef({ x: 0, y: 0, z: 0, hx: 40, hz: 40, base: 0, az: 0, azTop: 0 });
	const orbitRef = useRef<{ x: number; az: number } | null>(null);
	const sinkRef = useRef<number | null>(null); // timestamp of the drop, null while playing
	const sinkTimerRef = useRef(0);
	const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
	const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
	const rayRef = useRef(new THREE.Raycaster());
	const lv = useLevels(gameId, golfLevels);
	const levelCfgRef = useRef<GolfLevelCfg | null>(null);
	const levelActiveRef = useRef(false); // read inside the raf loop / handleSunk
	levelActiveRef.current = lv.active;

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
		renderer.shadowMap.enabled = true;
		// PCFSoftShadowMap is deprecated and silently falls back to plain PCF, which is what
		// made the edges look like a staircase. VSM is blurred in the map itself.
		renderer.shadowMap.type = THREE.VSMShadowMap;
		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x87b7e8);
		scene.fog = new THREE.Fog(0x87b7e8, 260, 900);
		const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 1200);
		scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6b3a, 1.05));
		const sun = new THREE.DirectionalLight(0xfff3d6, 1.5);
		sun.position.set(40, 70, 20);
		sun.castShadow = true;
		// The shadow frustum is refitted to each hole; a fixed box spreads these texels so
		// thin that the ball's own shadow falls between two of them and vanishes.
		const smap = window.innerWidth < 700 ? 1024 : 2048;
		sun.shadow.mapSize.set(smap, smap);
		sun.shadow.camera.near = 1;
		sun.shadow.camera.far = 400;
		sun.shadow.normalBias = 0.03;
		sun.shadow.bias = -0.0006;
		sun.shadow.radius = 3;
		sun.shadow.blurSamples = 8;
		scene.add(sun);
		scene.add(sun.target);

		// Big rough-grass ground so off-lane is always covered as the camera roams.
		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(900, 900),
			new THREE.MeshStandardMaterial({ color: 0x2f5d33, roughness: 1 }),
		);
		ground.rotation.x = -Math.PI / 2;
		ground.receiveShadow = true;
		scene.add(ground);
		// AI grass on the rough (wrap-repeated); stays flat green until it loads / if it 404s.
		new THREE.TextureLoader().load('/assets/jeux/golf/grass.jpg', (t) => {
			t.wrapS = t.wrapT = THREE.RepeatWrapping;
			t.repeat.set(200, 200);
			t.colorSpace = THREE.SRGBColorSpace;
			const gm = ground.material as THREE.MeshStandardMaterial;
			gm.map = t;
			gm.color.set(0xffffff);
			gm.needsUpdate = true;
		});

		const ball = makeBall(0xffffff);
		scene.add(ball);

		// Painted contact shadow. The cast one comes and goes with the sun angle and the
		// slope; this one is always there, and it is what tells you where the ball sits.
		const shade = new THREE.Mesh(
			new THREE.CircleGeometry(BALL_R_VIS * 1.25, 20),
			new THREE.MeshBasicMaterial({ color: 0x0b1a0d, transparent: true, opacity: 0.34, depthWrite: false }),
		);
		shade.rotation.x = -Math.PI / 2;
		shade.renderOrder = 2;
		scene.add(shade);

		const ballRing = new THREE.Mesh(
			new THREE.RingGeometry(PARAMS.ballR * 1.8, PARAMS.ballR * 2.2, 28),
			new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
		);
		ballRing.rotation.x = -Math.PI / 2;
		ballRing.visible = false;
		scene.add(ballRing);

		// Drawn over everything: the arrow often runs into a kerb or an obstacle, and the
		// player still needs to read where the shot points.
		const aimArrow = new THREE.Mesh(buildArrowGeom(), new THREE.MeshBasicMaterial({
			color: 0x30d158, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
		}));
		aimArrow.visible = false;
		aimArrow.frustumCulled = false;
		aimArrow.renderOrder = 12;
		scene.add(aimArrow);

		const holeGroup = new THREE.Group();
		scene.add(holeGroup);

		g3Ref.current = {
			renderer, scene, camera, sun, ball, shade, ballRing, aimArrow, ground, holeGroup,
			disposables: [
				aimArrow.geometry, aimArrow.material as THREE.Material,
				ball.geometry, ball.material as THREE.Material, ground.geometry, ground.material as THREE.Material,
				shade.geometry, shade.material as THREE.Material,
				ballRing.geometry, ballRing.material as THREE.Material,
			],
		};
		return true;
	}, []);

	const resize = useCallback(() => {
		const g = g3Ref.current;
		const canvas = canvasRef.current;
		if (!g || !canvas) return;
		const w = canvas.clientWidth, h = canvas.clientHeight || canvas.clientWidth;
		g.renderer.setSize(w, h, false);
		g.camera.aspect = w / Math.max(1, h);
		g.camera.updateProjectionMatrix();
		const f = fitRef.current;
		f.az = bestAz(g.camera, f.hx, f.hz, f.base, (PITCH * Math.PI) / 180);
		f.azTop = bestAz(g.camera, f.hx, f.hz, f.base, (TOP_PITCH * Math.PI) / 180);
	}, []);

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

	const curTime = () => (startTimeRef.current ? (performance.now() - startTimeRef.current) / 1000 : 0);

	const syncBoard = useCallback(() => {
		const arr = [...boardRef.current.entries()].map(([id, v]) => ({ id, ...v }));
		// finished first, then fewest strokes, then fastest time (tiebreaker).
		arr.sort((a, b) => Number(b.done) - Number(a.done) || a.strokes - b.strokes || a.time - b.time);
		setBoard(arr);
	}, []);

	const stop = useCallback(() => {
		runningRef.current = false;
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = 0;
	}, []);

	/** Ground point under the pointer, on the horizontal plane at height `y`. */
	const worldFromPointer = useCallback((clientX: number, clientY: number, y: number): { x: number; z: number } | null => {
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
		// The aim plane rides at the ball's height — on a bumpy course y = 0 would drift.
		if (!rayRef.current.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), hit)) return null;
		return { x: hit.x, z: hit.z };
	}, []);

	/** Pointer-to-ball distance in CSS pixels. */
	const screenDist = useCallback((clientX: number, clientY: number, x: number, y: number, z: number): number => {
		const g = g3Ref.current;
		const canvas = canvasRef.current;
		if (!g || !canvas) return Infinity;
		const r = canvas.getBoundingClientRect();
		const v = new THREE.Vector3(x, y, z).project(g.camera);
		return Math.hypot(r.left + ((v.x + 1) / 2) * r.width - clientX, r.top + ((1 - v.y) / 2) * r.height - clientY);
	}, []);

	/** Pull in world units for a drag of `px` pixels — the same gesture in any camera. */
	const pullFromScreen = useCallback((px: number): number => {
		const r = canvasRef.current?.getBoundingClientRect();
		return (px / ((r?.height || 600) * DRAG_H)) * PARAMS.maxPull;
	}, []);

	/** Surface height under a point, at the game's fixed relief. */
	const groundAt = useCallback((x: number, z: number): number => {
		const hole = holeRef.current;
		return hole ? surfaceY(hole, x, z, RELIEF, BANK) : 0;
	}, []);

	const renderFrame = useCallback((now: number, pose: { x: number; z: number }) => {
		const g = g3Ref.current;
		const hole = holeRef.current;
		if (!g || !hole) return;
		const b = ballRef.current;
		const mode = camModeRef.current;
		const by = surfaceY(hole, pose.x, pose.z, RELIEF, BANK);
		// Every easing below is written as a time constant, not a per-frame fraction: at 120 Hz
		// a fixed fraction eases twice as fast as at 60.
		const dt = Math.min(0.1, Math.max(0, (now - lastFrameRef.current) / 1000)) || 1 / 60;
		lastFrameRef.current = now;
		const ease = (tau: number) => 1 - Math.exp(-dt / tau);

		animateHole(g.holeGroup, now, pose.x, pose.z);

		// Drop into the cup: the engine snaps the ball to the centre and stops it, so all
		// that is left is to let it fall out of sight.
		let ballY = by + BALL_R_VIS;
		if (sinkRef.current !== null) {
			const k = Math.min(1, (now - sinkRef.current) / SINK_MS);
			const cupY = (g.holeGroup.userData.cupY as number | undefined) ?? by;
			ballY += (cupY - CUP_D + BALL_R_VIS - ballY) * (k * k);
		}
		g.ball.position.set(pose.x, ballY, pose.z);
		g.shade.position.set(pose.x, by + 0.05, pose.z);
		g.shade.visible = sinkRef.current === null;

		// "Touch here to aim" ring around the ball (only when it's the player's turn).
		const canAim = runningRef.current && !doneRef.current && isSettled(b)
			&& !introRef.current && !camTweenRef.current;
		g.ballRing.position.set(pose.x, by + 0.09, pose.z);
		g.ballRing.visible = canAim && !aimRef.current.active;

		// Aim arrow: launch side, length and colour scale with the pull.
		const aim = aimRef.current;
		g.aimArrow.visible = aim.active;
		if (aim.active) {
			const dx = aim.px - b.x, dz = aim.pz - b.z;
			const frac = Math.min(aim.pull, PARAMS.maxPull) / PARAMS.maxPull;
			g.aimArrow.position.set(b.x, by + 0.35, b.z);
			g.aimArrow.rotation.y = -Math.atan2(-dz, -dx);
			g.aimArrow.scale.set(3 + frac * 10, 1, 1 + frac * 1.6);
			(g.aimArrow.material as THREE.MeshBasicMaterial).color.setHex(
				frac > 0.8 ? 0xff453a : frac > 0.5 ? 0xffd60a : 0x30d158,
			);
		}

		// Camera. `fit` and `top` both frame the whole hole and differ only by the tilt;
		// `shoulder` is the other end of the spectrum, close behind the ball. Every mode is
		// resolved to an eye + look-at pair, so two of them can be blended.
		const f = fitRef.current;
		const poseOf = (m: CamMode) => {
			if (m === 'shoulder') {
				const p = hole.path[nearestSample(hole, pose.x, pose.z)];
				const want = Math.atan2(p.dirZ, p.dirX);
				if (!orbitRef.current) {
					let d = ((want - azRef.current + Math.PI) % (Math.PI * 2)) - Math.PI;
					if (d < -Math.PI) d += Math.PI * 2;
					azRef.current += d * ease(0.55); // ease toward "down the fairway"
				}
				const pitch = (SHOULDER_PITCH * Math.PI) / 180;
				const flat = Math.cos(pitch) * SHOULDER_DIST;
				camEye.set(
					pose.x - Math.cos(azRef.current) * flat,
					by + Math.sin(pitch) * SHOULDER_DIST,
					pose.z - Math.sin(azRef.current) * flat,
				);
				// Aim ahead of the ball, not at it, so the fairway fills the frame.
				camLook.set(pose.x + Math.cos(azRef.current) * 10, by + 1.2, pose.z + Math.sin(azRef.current) * 10);
				return;
			}
			const pitch = ((m === 'top' ? TOP_PITCH : PITCH) * Math.PI) / 180;
			const az = m === 'top' ? f.azTop : azRef.current;
			const place = (d: number, tx: number, ty: number, tz: number) => {
				g.camera.position.set(
					tx - Math.cos(az) * Math.cos(pitch) * d,
					ty + Math.sin(pitch) * d,
					tz - Math.sin(az) * Math.cos(pitch) * d,
				);
				g.camera.lookAt(tx, ty, tz);
				g.camera.updateMatrixWorld();
				camLook.set(tx, ty, tz);
			};
			// The closed-form fit is only an ortho approximation — under a tilt the near end
			// of the course grows and spills out. Seed with it, then pull back until the four
			// corners actually project inside the frame.
			let d = fitDist(g.camera, f.hx, f.hz, pitch, az);
			for (let it = 0; it < 4; it++) {
				place(d, f.x, f.y, f.z);
				let m = 0;
				for (const [sx, sz] of CORNERS) {
					tmpV.set(f.x + sx * f.hx, f.y, f.z + sz * f.hz).project(g.camera);
					m = Math.max(m, Math.abs(tmpV.x), Math.abs(tmpV.y));
				}
				d *= Math.max(0.6, Math.min(1.8, m / 0.94));
			}
			// Zoom follows the ball, but the target is held near the course so the frame never
			// wanders off into the lawn. At zoom 1 the range collapses onto the fit centre,
			// which is exactly the framing above. The 1.5 lets the view hang a little past the
			// edge — otherwise a ball on the tee sits pinned to the bottom.
			const zf = Math.max(1, zoomRef.current);
			const cl = (v: number, mid: number, half: number) => {
				const r = Math.min(half, half * (1 - 1 / zf) * 1.5);
				return Math.max(mid - r, Math.min(mid + r, v));
			};
			place(d / zf, cl(pose.x, f.x, f.hx), f.y + (by - f.y) * (1 - 1 / zf), cl(pose.z, f.z, f.hz));
			camEye.copy(g.camera.position);
		};

		if (introRef.current) {
			introRef.current = false;
			poseOf('top'); // a hole opens from the sky, then flies down behind the ball
			camTweenRef.current = { eye: camEye.clone(), look: camLook.clone(), t0: now, dur: INTRO_MS };
			camSmoothRef.current.on = false;
		}
		poseOf(mode);
		const tw = camTweenRef.current;
		if (tw) {
			const t = Math.min(1, (now - tw.t0) / tw.dur);
			const k = t * t * (3 - 2 * t); // slow at both ends: it holds the sky shot, then settles
			camEye.lerpVectors(tw.eye, camEye, k);
			camLook.lerpVectors(tw.look, camLook, k);
			if (t >= 1) camTweenRef.current = null;
		}
		const cs = camSmoothRef.current;
		if (!cs.on) { cs.eye.copy(camEye); cs.look.copy(camLook); cs.on = true; }
		const ck = ease(CAM_TAU);
		cs.eye.lerp(camEye, ck);
		cs.look.lerp(camLook, ck);
		g.camera.position.copy(cs.eye);
		g.camera.lookAt(cs.look);
		camLookRef.current.copy(cs.look); // where a glide has to start from, next time

		const k = ease(0.06);
		for (const ghost of ghostsRef.current.values()) {
			ghost.cur.x += (ghost.target.x - ghost.cur.x) * k;
			ghost.cur.z += (ghost.target.z - ghost.cur.z) * k;
			ghost.mesh.position.set(ghost.cur.x, surfaceY(hole, ghost.cur.x, ghost.cur.z, RELIEF, BANK) + BALL_R_VIS, ghost.cur.z);
		}

		g.renderer.render(g.scene, g.camera);

		const canvas = canvasRef.current;
		if (canvas && ghostsRef.current.size) {
			const w = canvas.clientWidth, h = canvas.clientHeight;
			for (const [id, ghost] of ghostsRef.current.entries()) {
				const el = labelElsRef.current.get(id);
				if (!el) continue;
				tmpV.set(ghost.mesh.position.x, ghost.mesh.position.y + 2, ghost.mesh.position.z).project(g.camera);
				el.style.left = `${(tmpV.x * 0.5 + 0.5) * w}px`;
				el.style.top = `${(-tmpV.y * 0.5 + 0.5) * h}px`;
			}
		}
	}, []);

	const handleSunk = useCallback(() => {
		if (doneRef.current) return;
		doneRef.current = true;
		sinkRef.current = performance.now();
		const sc = strokesRef.current;
		const finalSec = curTime();
		setElapsed(finalSec);
		const v = encodeScore(sc, finalSec); // strokes, then time as a tiebreaker
		const nb = bestRef.current == null ? v : Math.min(bestRef.current, v);
		bestRef.current = nb;
		setBest(nb);
		aimRef.current.active = false;
		setPower(0);
		trackGame(gameId, 'game_won', { strokes: sc });
		// The result card waits for the ball to actually drop into the cup — that fall is
		// the payoff, and an overlay on top of it hides the only frame that shows the hole.
		clearTimeout(sinkTimerRef.current);
		sinkTimerRef.current = window.setTimeout(() => {
			if (levelActiveRef.current) lv.finish({ won: true, score: sc, raw: { seed: seedRef.current } });
			else setDone(true);
		}, SINK_MS + 320);
		// Levels: solo only — grade by strokes, never touch the lobby / daily run.
		if (levelActiveRef.current) return;
		if (lobbyRef.current) {
			lobbyRef.current.sendScore({ strokes: sc, done: true, time: finalSec });
			boardRef.current.set(lobbyRef.current.selfId, { name: name || 'Moi', strokes: sc, done: true, time: finalSec });
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
	}, [gameId, name, syncBoard, diffKey, lv]);

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

			// Live chrono (throttled) while the attempt is running.
			if (startTimeRef.current && !doneRef.current) {
				hudAccRef.current += dt;
				if (hudAccRef.current >= 200) { hudAccRef.current = 0; setElapsed(curTime()); }
			}

			const prev = prevBallRef.current;
			const alpha = Math.min(1, accRef.current / STEP);
			renderFrame(now, { x: prev.x + (ball.x - prev.x) * alpha, z: prev.z + (ball.z - prev.z) * alpha });
			rafRef.current = requestAnimationFrame(frame);
		},
		[renderFrame, handleSunk],
	);

	/* ---- Zoom / camera mode ---- */
	const zoomBy = useCallback((factor: number) => {
		zoomRef.current = Math.max(1, Math.min(ZOOM_MAX, zoomRef.current * factor));
	}, []);
	/** Freeze the current view as the start of a blend toward the next one. */
	const glideCam = useCallback((dur: number) => {
		const g = g3Ref.current;
		if (!g) return;
		camTweenRef.current = {
			eye: g.camera.position.clone(), look: camLookRef.current.clone(), t0: performance.now(), dur,
		};
	}, []);
	const cycleCam = useCallback(() => {
		glideCam(CAM_GLIDE_MS);
		const nv = CAM_NEXT[camModeRef.current];
		camModeRef.current = nv;
		setCamMode(nv);
		zoomRef.current = 1;
		azRef.current = fitRef.current.az;
		orbitRef.current = null;
	}, [glideCam]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			zoomBy(e.deltaY > 0 ? 1 / 1.12 : 1.12);
		};
		canvas.addEventListener('wheel', onWheel, { passive: false });
		return () => canvas.removeEventListener('wheel', onWheel);
	}, [zoomBy]);

	/* ---- Pointer: slingshot aim (single) + pinch zoom (two) ---- */
	const pinchDist = (): number => {
		const pts = [...pointersRef.current.values()];
		if (pts.length < 2) return 0;
		return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
	};

	// Single-gesture aim/orbit flow, coord-based so both pointer (mouse/pen) and native touch feed it.
	// Pinch (two pointers) stays on the pointer path — touchDrag only tracks touches[0].
	const aimStart = useCallback((clientX: number, clientY: number) => {
		if (pinchRef.current) return; // a second finger is zooming — don't (re)arm aim/orbit
		if (phase !== 'playing') return;
		// A tap during a camera move cuts it short instead of aiming: the ground under the
		// pointer is sliding, so the drag that follows would not mean what it looks like.
		if (introRef.current || camTweenRef.current) { introRef.current = false; glideCam(220); return; }
		const b = ballRef.current;
		const by = groundAt(b.x, b.z) + PARAMS.ballR;
		const p = worldFromPointer(clientX, clientY, by);
		// Grab in pixels as well as world units: framed whole, the hole is far away and a
		// fixed world radius shrinks to a couple of pixels — the ball becomes ungrabbable.
		const near = screenDist(clientX, clientY, b.x, by, b.z) <= GRAB_PX
			|| (p != null && Math.hypot(p.x - b.x, p.z - b.z) <= GRAB_R);
		if (p && near && !doneRef.current && isSettled(b)) {
			aimRef.current = { active: true, px: p.x, pz: p.z, pull: 0 };
			setPower(0);
		} else {
			orbitRef.current = { x: clientX, az: azRef.current }; // drag away from the ball = turn around it
		}
	}, [phase, worldFromPointer, screenDist, groundAt, glideCam]);

	const aimMove = useCallback((clientX: number, clientY: number) => {
		if (pinchRef.current) return;
		if (orbitRef.current) {
			azRef.current = orbitRef.current.az + (clientX - orbitRef.current.x) * 0.008;
			return;
		}
		if (!aimRef.current.active) return;
		const b = ballRef.current;
		const by = groundAt(b.x, b.z) + PARAMS.ballR;
		const p = worldFromPointer(clientX, clientY, by);
		if (!p) return;
		const pull = pullFromScreen(screenDist(clientX, clientY, b.x, by - PARAMS.ballR, b.z));
		aimRef.current = { active: true, px: p.x, pz: p.z, pull };
		setPower(Math.min(pull, PARAMS.maxPull) / PARAMS.maxPull);
	}, [worldFromPointer, screenDist, pullFromScreen, groundAt]);

	const aimEnd = useCallback(() => {
		if (pinchRef.current) return; // lifting one of two zoom fingers — never fires a shot
		if (orbitRef.current) { orbitRef.current = null; return; }
		const aim = aimRef.current;
		if (!aim.active) return;
		aimRef.current = { active: false, px: 0, pz: 0, pull: 0 };
		setPower(0);
		const b = ballRef.current;
		// The ground drag only gives the direction; the power comes from the screen pull.
		const dx = aim.px - b.x, dz = aim.pz - b.z;
		const m = Math.hypot(dx, dz);
		if (!m) return;
		const vel = aimToVelocity({ x: (dx / m) * aim.pull, z: (dz / m) * aim.pull });
		if (!vel) return;
		ballRef.current = { ...b, vx: vel.vx, vz: vel.vz };
		if (strokesRef.current === 0) startTimeRef.current = performance.now(); // chrono starts on the first stroke
		strokesRef.current += 1;
		setStrokes(strokesRef.current);
		if (lobbyRef.current) lobbyRef.current.sendScore({ strokes: strokesRef.current, done: false, time: curTime() });
	}, []);

	// Single-pointer aim/pan (mouse, touch, pen) via Pointer Events — reliable on iOS (see usePointerDrag).
	const { onPointerDown: onAimPointerDown } = usePointerDrag(aimStart, aimMove, aimEnd);

	// Pinch (two pointers) needs multi-pointer tracking, which usePointerDrag doesn't do, so it stays
	// on native canvas handlers. aimStart/Move/End already early-return while pinchRef is set, so the
	// hook's document listeners no-op during a pinch.
	const onPointerDown = useCallback((e: React.PointerEvent) => {
		pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointersRef.current.size >= 2) {
			pinchRef.current = { dist: pinchDist(), zoom: zoomRef.current };
			aimRef.current.active = false;
			orbitRef.current = null;
			setPower(0);
			return;
		}
		onAimPointerDown(e); // single pointer → aim/orbit via the hook
	}, [onAimPointerDown]);

	const onPointerMove = useCallback((e: React.PointerEvent) => {
		if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pinchRef.current) {
			const d = pinchDist();
			if (d > 0) zoomRef.current = Math.max(1, Math.min(ZOOM_MAX, pinchRef.current.zoom * (d / pinchRef.current.dist)));
		}
	}, []);

	const onPointerUp = useCallback((e: React.PointerEvent) => {
		pointersRef.current.delete(e.pointerId);
		if (pointersRef.current.size < 2) pinchRef.current = null;
	}, []);

	/* ---- Begin / restart a hole ---- */
	const placeBallAtStart = useCallback(() => {
		const hole = holeRef.current;
		if (!hole) return;
		ballRef.current = { x: hole.start.x, z: hole.start.z, vx: 0, vz: 0 };
		prevBallRef.current = ballRef.current;
		orbitRef.current = null;
		azRef.current = fitRef.current.az;
		clearTimeout(sinkTimerRef.current);
		sinkRef.current = null;
		startTimeRef.current = 0;
		setElapsed(0);
		strokesRef.current = 0;
		setStrokes(0);
		doneRef.current = false;
		setDone(false);
	}, []);

	const beginHole = useCallback(
		(seed: number, lobby: Lobby | null, m: Mode, dk: DiffKey, diffOverride?: import('./engine').DiffLevel) => {
			modeRef.current = m;
			seedRef.current = seed;
			setMode(m);
			setDiffKey(dk);
			const hole = generateHole(mulberry32(seed), diffOverride ?? DIFFS[dk]);
			holeRef.current = hole;
			setPar(hole.par);

			zoomRef.current = 1;

			const g = g3Ref.current;
			if (g) {
				g.scene.remove(g.holeGroup);
				disposeHole(g.holeGroup);
				// Lighter planting on a phone — the scatter is what costs, not the course.
				g.holeGroup = buildHole3D(hole, { relief: RELIEF, bank: BANK, decor: window.innerWidth < 700 ? 700 : 1400 });
				g.scene.add(g.holeGroup);

				// Sit the surrounding lawn just under the course, else it reads as a floating table.
				// The engine's bounds ignore the pond the renderer adds — widen or it gets cropped.
				const bd = hole.bounds;
				const pond = g.holeGroup.userData.pond as { x: number; z: number; r: number } | undefined;
				const minX = Math.min(bd.minX, pond ? pond.x - pond.r : Infinity);
				const maxX = Math.max(bd.maxX, pond ? pond.x + pond.r : -Infinity);
				const minZ = Math.min(bd.minZ, pond ? pond.z - pond.r : Infinity);
				const maxZ = Math.max(bd.maxZ, pond ? pond.z + pond.r : -Infinity);
				const fx = (minX + maxX) / 2, fz = (minZ + maxZ) / 2;
				fitRef.current = {
					x: fx, y: surfaceY(hole, fx, fz, RELIEF, BANK), z: fz,
					hx: (maxX - minX) / 2 + 3, hz: (maxZ - minZ) / 2 + 3,
					base: Math.atan2(hole.cup.z - hole.start.z, hole.cup.x - hole.start.x),
					az: 0, azTop: 0, // resize() below picks the framing for this canvas
				};
				g.ground.position.set(fx, groundYOf(hole, RELIEF), fz);

				// Wrap the shadow frustum around this hole only, so its texels stay small.
				const R = Math.max(maxX - minX, maxZ - minZ) / 2 + 14;
				const sc = g.sun.shadow.camera;
				sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R;
				// Stand the sun off far enough that the whole box is in front of it, and pull
				// near/far in around the box — a 1..400 range wastes the depth VSM works from.
				const D = R + 120;
				sc.near = Math.max(1, D - R - 40);
				sc.far = D + R + 40;
				sc.updateProjectionMatrix();
				g.sun.position.set(fx + SUN_DIR.x * D, SUN_DIR.y * D, fz + SUN_DIR.z * D);
				g.sun.target.position.set(fx, 0, fz);
				g.sun.target.updateMatrixWorld();
			}
			resize();
			placeBallAtStart();
			// The hole opens on a flyover: high above to show the whole thing, then down
			// behind the ball, which is where it stays to play.
			camModeRef.current = 'shoulder';
			setCamMode('shoulder');
			azRef.current = Math.atan2(hole.path[0].dirZ, hole.path[0].dirX);
			camTweenRef.current = null;
			introRef.current = true;

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
					boardRef.current.set(msg.id, { name: msg.name, strokes: msg.strokes, done: msg.done, time: msg.time });
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
		[resize, placeBallAtStart, frame, gameId, getOrCreateGhost, removeGhost, syncBoard],
	);

	/* Levels: start a solo, deterministic hole for a level (seed + ramped diff); grade on holing. */
	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		levelCfgRef.current = cfg;
		if (!initScene()) return;
		stop();
		lobbyRef.current?.leave();
		lobbyRef.current = null;
		for (const id of [...ghostsRef.current.keys()]) removeGhost(id);
		beginHole(cfg.seed, null, 'libre', diffKey, cfg.diff);
	}, [lv, initScene, stop, removeGhost, beginHole, diffKey]);

	const armLevels = useCallback(() => {
		stop();
		lobbyRef.current?.leave();
		lobbyRef.current = null;
		for (const id of [...ghostsRef.current.keys()]) removeGhost(id);
		setMode('libre');
		setPhase('menu');
		lv.enter();
	}, [lv, stop, removeGhost]);

	// Levels is the default landing: resume at the next unlocked level (grid once all cleared).
	// A ?defi / ?mode=daily deep link opens the daily instead — skip auto-resume then.
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily') return;
		void lv.resume().then((next) => { if (next != null) startLevel(next); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

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
		if (lobbyRef.current) lobbyRef.current.sendScore({ strokes: 0, done: false, time: 0 });
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
			// Only accept a real ENCODED best (≥10_000_000 = strokes≥1); ignore legacy raw-stroke values.
			if (st.best && st.best >= 10_000_000) { bestRef.current = st.best; setBest(st.best); }
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
		const onFs = () => requestAnimationFrame(resize); // re-measure after the fullscreen box applies
		window.addEventListener('resize', onResize);
		document.addEventListener('fullscreenchange', onFs);
		document.addEventListener('webkitfullscreenchange', onFs);
		return () => {
			document.removeEventListener('fullscreenchange', onFs);
			document.removeEventListener('webkitfullscreenchange', onFs);
			window.removeEventListener('resize', onResize);
			stop();
			clearTimeout(sinkTimerRef.current);
			lobbyRef.current?.leave();
			const g = g3Ref.current;
			if (g) {
				for (const id of [...ghostsRef.current.keys()]) removeGhost(id);
				disposeHole(g.holeGroup);
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

			<ModeToggle
				daily={mode === 'defi' && !lv.active}
				onFree={() => { lv.exit(); setMode('libre'); if (phase === 'playing') quit(); }}
				onDaily={() => { lv.exit(); setMode('defi'); if (phase === 'playing') quit(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

			{lv.active && (
				<p className="gf-leveltag">
					{lv.menu
						? 'Progression — rentre la balle pour valider, moins de coups pour les étoiles'
						: `Niveau ${lv.level} · par ${levelCfgRef.current?.par ?? '—'} · rentre la balle`}
				</p>
			)}

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
						<span className="gf-best">⏱ <span className="chrono">{fmtTime(elapsed)}</span></span>
						<span className="gf-best">Par {par}</span>
						{mode === 'defi' && <span className="gf-peers">👥 {Math.min(peerCount, MAX_PLAYERS)}/{MAX_PLAYERS}</span>}
						{mode === 'defi' && <span className="gf-peers">Essai {Math.min(tries, MAX_TRIES)}/{MAX_TRIES}</span>}
						{aimRef.current.active && <span className="gf-cur">💪 {Math.round(power * 100)}%</span>}
					</div>
				)}

				{phase === 'playing' && !lv.active && board.length > 0 && (
					<ol className="gf-board">
						{board.slice(0, MAX_PLAYERS).map((r) => (
							<li key={r.id}>{r.name} · {r.done ? `${r.strokes} · ${fmtTime(r.time)}` : `${r.strokes}…`}</li>
						))}
					</ol>
				)}

				{phase === 'playing' && (
					<div className="gf-zoom">
						<button className="gf-zbtn" onClick={() => zoomBy(1.25)} aria-label="Zoomer">＋</button>
						<button className="gf-zbtn" onClick={() => zoomBy(1 / 1.25)} aria-label="Dézoomer">－</button>
						<button className="gf-zbtn" onClick={cycleCam} aria-label="Changer de caméra">{CAM_LABEL[camMode]}</button>
					</div>
				)}

				{phase === 'playing' && done && !lv.active && (
					<div className="gf-overlay">
						<div className="gf-card">
							<div className="gf-winmark">🏌️</div>
							<h2>Bravo&nbsp;!</h2>
							<p className="gf-winscore">{strokes} coups · {fmtTime(elapsed)} · <strong>{parTag(strokes)}</strong></p>
							{mode === 'defi' ? (
								alreadyPlayed || triesRef.current >= MAX_TRIES ? (
									<p className="gf-sub">Défi terminé · meilleur <strong>{best != null ? formatScore(DAILY_LB.golf.fmt, best) : '—'}</strong> — reviens demain&nbsp;!</p>
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

				{lv.menu && !webglError && (
					<div className="gf-overlay gf-overlay-levels">
						<LevelSelect
							progress={lv.progress}
							onPick={startLevel}
							title={`${Object.values(lv.progress.stars).reduce((a, b) => a + b, 0)} / ${golfLevels.count * 3} ⭐`}
						/>
					</div>
				)}

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={golfLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won ? `${strokes} coups` : 'Balle non rentrée'}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}

				{phase === 'menu' && !lv.booting && !webglError && !lv.active && (
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

			{phase === 'playing' && lv.active && !lv.done && (
				<div className="gf-actions">
					<button className="gf-restart" onClick={() => startLevel(lv.level)}>↻ Recommencer</button>
					<button className="gf-quit" onClick={() => { stop(); lv.backToMenu(); }}>🗺 Carte</button>
				</div>
			)}

			{phase === 'playing' && !lv.active && (
				<div className="gf-actions">
					{mode === 'libre' && <button className="gf-restart" onClick={() => beginHole(randomSeed(), null, 'libre', diffKey)}>🎲 Nouveau trou</button>}
					<button className="gf-quit" onClick={quit}>Quitter</button>
				</div>
			)}

			{mode === 'defi' && !lv.active && (
				<Leaderboard key={`lb-${name}-${best ?? 0}`} game={`${gameId}-t`} metric="time" submitValue={done ? best ?? undefined : undefined} format={(v) => formatScore(DAILY_LB.golf.fmt, v)} />
			)}

			<p className="gf-help">
				<strong>Vise à la fronde</strong>&nbsp;: touche/clique près de la balle et tire dans le sens
				opposé à la direction voulue — plus tu tires, plus c'est fort. La balle <strong>rebondit</strong> sur
				les bords et les murs. Glisse ailleurs pour <strong>tourner autour du trou</strong>, et le bouton caméra
				passe de la vue d'ensemble à l'épaule puis au dessus. Au défi du jour, jusqu'à {MAX_PLAYERS} joueurs sur le même trou&nbsp;: tu vois
				leurs balles fantômes en direct, classement au moins de coups.
			</p>
		</div>
	);
}

/* ---------- Styles ---------- */

const CSS = `
.gf-root { --gf-accent: var(--accent-regular); width: 100%; max-width: 640px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); }
.gf-boardwrap { position: relative; width: 100%; aspect-ratio: 16 / 10; margin-inline: auto; }
.gf-canvas {
  width: 100%; height: 100%; display: block; background: #87b7e8;
  border: 1px solid var(--gray-800); border-radius: 12px;
  touch-action: none; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none;
}
/* Site global fullscreen → the course fills the screen; controls stay overlaid. */
.game-page.gf-full .gf-root { max-width: none; width: 100%; height: 100%; display: flex; flex-direction: column; }
/* min-height:0 or the canvas' intrinsic height becomes a floor flex:1 cannot shrink past,
   and the board overflows the screen in landscape. */
.game-page.gf-full .gf-boardwrap { flex: 1; min-height: 0; aspect-ratio: auto; }
.game-page.gf-full .gf-canvas { border-radius: 0; border: none; }
.game-page.gf-full .gf-help { display: none; }
.game-page.gf-full .gf-board { top: 54px; }
/* Landscape phone: every row above the board costs a tenth of the screen. */
@media (max-height: 520px) {
  .game-page.gf-full .gf-leveltag { display: none; }
  .game-page.gf-full .gf-actions { margin-top: 0.35rem; }
}
.gf-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.gf-label { position: absolute; transform: translate(-50%, -120%); white-space: nowrap; font-size: 11px; font-weight: 700; color: #fff; background: rgba(0,0,0,0.55); padding: 1px 6px; border-radius: 999px; }
.gf-celebrate { position: absolute; inset: 0; pointer-events: none; }
.gf-hud { position: absolute; top: 8px; left: 8px; display: flex; gap: 6px; flex-wrap: wrap; font-weight: 700; font-size: 12.5px; }
.gf-cur { background: var(--gf-accent); color: var(--accent-text-over); border-radius: 999px; padding: 4px 10px; font-variant-numeric: tabular-nums; }
.gf-best, .gf-peers { background: rgba(0,0,0,0.55); color: #fff; border-radius: 999px; padding: 4px 10px; font-variant-numeric: tabular-nums; }
.gf-board { position: absolute; top: 8px; right: 8px; margin: 0; padding: 6px 10px 6px 26px; list-style: decimal; background: rgba(0,0,0,0.55); color: #fff; border-radius: 10px; font-size: 12px; font-variant-numeric: tabular-nums; }
.gf-zoom { position: absolute; bottom: 10px; right: 10px; display: flex; flex-direction: column; gap: 6px; }
.gf-zbtn { width: 42px; height: 42px; border-radius: 12px; border: none; background: rgba(0,0,0,0.5); color: #fff; font-size: 20px; font-weight: 800; line-height: 1; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: none; }
.gf-zbtn:active, .gf-zbtn.active { background: var(--gf-accent); color: var(--accent-text-over); }
.gf-actions { display: flex; gap: 10px; justify-content: center; margin-top: 0.7rem; }
.gf-restart, .gf-quit { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 8px 18px; cursor: pointer; }
.gf-restart { background: var(--gf-accent); color: var(--accent-text-over); border-color: transparent; }

.gf-leveltag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 600; margin: -0.4rem auto 0.7rem; max-width: 480px; }
.gf-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; background: rgba(6,8,16,0.5); backdrop-filter: blur(2px); border-radius: 12px; }
.gf-overlay-levels { overflow-y: auto; padding: 16px 12px; align-items: flex-start; }
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
