import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
	makeTable, generateRack, stepBalls, aimToVelocity, pullPower, isSettled,
	encodeScore, DIFFS, BALL_R, type Ball, type DiffLevel, type Table, type Vec,
} from './engine';
import {
	buildTable3D, makeBallMesh, fitDist, bestAz, predictCue,
	CUE_COLOR, BALL_COLORS, type Table3D,
} from './render3d';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import { formatScore, fmtCentis } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import { useLevels } from '../../lib/useLevels';
import { billardLevels } from './levels';
import { usePointerDrag } from '../usePointerDrag';
import { diffKeys } from '../../lib/difficulty';

/* =====================================================
   BILLARD — React island, 3D table (three.js).
   Rentre les 3 boules colorées avec la blanche (visée à la fronde).
   Fausse blanche → replacée + 1 coup. Score : coups, chrono départage.
   Moteur pur/testé 2D dans ./engine ; seul le rendu (render3d.ts) est 3D.
   ===================================================== */

type Status = 'aiming' | 'rolling' | 'won';
type CamMode = 'fit' | 'shoulder' | 'top';
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
const STEP = 1000 / 60;
const GRAB_R = 22; // table units: start aiming when grabbing near the cue ball
const GRAB_PX = 56; // …or this many screen pixels, for when the table is framed far away
const SINK_MS = 320; // pot drop animation
const FRAME_MARGIN = 16; // world units of felt framed around the table

const ZOOM_MAX = 4;
const PITCH_FIT = 46, PITCH_TOP = 88, SHOULDER_PITCH = 23;
const SHOULDER_DIST = 150;
const D2R = Math.PI / 180;
const MIN_PITCH = 14 * D2R, MAX_PITCH = 89 * D2R; // tilt limits for the two-finger vertical drag
const PITCH_PER_PX = 0.005; // radians of tilt per pixel of two-finger vertical drag
const CAM_TAU = 0.09; // camera catch-up time constant (s)
const CAM_LABEL: Record<CamMode, string> = { fit: '🎥', shoulder: '🎱', top: '🛰' };
const CAM_NEXT: Record<CamMode, CamMode> = { fit: 'shoulder', shoulder: 'top', top: 'fit' };
const SUN_DIR = new THREE.Vector3(30, 90, 40).normalize();

const camEye = new THREE.Vector3();
const camLook = new THREE.Vector3();

const fmtTime = (s: number) => fmtCentis(Math.round(s * 100));

interface DailyState { best?: number; tries: number; }
const MAX_TRIES = 10; // daily attempts per day; best of the day is ranked

type SinkInfo = { idx: number; t0: number; px: number; py: number }; // px/py: pocket centre (engine)

interface Scene3D {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	sun: THREE.DirectionalLight;
	table3d: Table3D;
	ballGroup: THREE.Group;
	ballMeshes: THREE.Mesh[]; // index-aligned with ballsRef.current
	aimLine: THREE.Line;
	objLine: THREE.Line;
	cueLine: THREE.Line;
	pullLine: THREE.Line;
	contact: THREE.Mesh;
}

export default function BillardGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [status, setStatus] = useState<Status>('aiming');
	const [strokes, setStrokes] = useState(0);
	const [remaining, setRemaining] = useState(3);
	const [elapsed, setElapsed] = useState(0);
	const [best, setBest] = useState<number | null>(null);
	const [scratchFlash, setScratchFlash] = useState(false);
	const [camMode, setCamMode] = useState<CamMode>('fit');
	const [webglError, setWebglError] = useState(false);
	// Daily
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [tries, setTries] = useState(0); // daily attempts used today

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const g3Ref = useRef<Scene3D | null>(null);
	const tableRef = useRef<Table>(makeTable());
	const ballsRef = useRef<Ball[]>([]);
	const aimRef = useRef<{ pull: Vec } | null>(null);
	const statusRef = useRef<Status>('aiming');
	const rollingRef = useRef(false);
	const strokesRef = useRef(0);
	const startRef = useRef(0); // chrono start (epoch ms), 0 = not started
	const finishedRef = useRef(false);
	const rafRef = useRef<number | null>(null);
	const resolveShotRef = useRef<() => void>(() => {});
	const accRef = useRef(0);
	const lastRef = useRef(0);
	const powerRef = useRef(0); // 0..1, for the aim-line colour
	const sinksRef = useRef<SinkInfo[]>([]); // active pot drops
	const seenRef = useRef<Set<number>>(new Set()); // ball indices already dropping
	const dailyRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const bestRef = useRef<number | null>(null);
	const triesRef = useRef(0);

	// Camera / view state read inside the raf loop.
	const camModeRef = useRef<CamMode>('fit');
	const zoomRef = useRef(1);
	const azRef = useRef(0);
	const pitchRef = useRef(PITCH_FIT * D2R); // camera tilt for fit/top (two-finger vertical)
	const fitRef = useRef({ hx: 120, hz: 70, base: 0, az: 0, azTop: 0 });
	const panDragRef = useRef<{ x: number; y: number; panX: number; panZ: number } | null>(null); // one-finger pan
	const panRef = useRef({ x: 0, z: 0 }); // fit/top look-target offset
	const camSmoothRef = useRef({ eye: new THREE.Vector3(), look: new THREE.Vector3(), on: false });
	const lastFrameRef = useRef(0);
	const lastDistRef = useRef(200); // camera→target distance, for the pan pixel→world scale
	const pinchRef = useRef<{ dist: number; zoom: number; ang: number; az: number; cy: number; pitch: number } | null>(null);
	const rayRef = useRef(new THREE.Raycaster());

	const { celebrating } = useCelebration(status === 'won');
	const lv = useLevels(gameId, billardLevels);

	const setStat = (s: Status) => { statusRef.current = s; setStatus(s); };
	const freeBestKey = (k: string) => `ludiven-billard-best-${k}`;

	/* ---------- three.js scene (built once) ---------- */
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
		renderer.shadowMap.type = THREE.VSMShadowMap;

		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x14100c);
		const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 3000);

		scene.add(new THREE.HemisphereLight(0xffffff, 0x2a1e14, 0.9));
		const sun = new THREE.DirectionalLight(0xfff1d8, 1.7);
		const t = tableRef.current;
		const R = Math.max(t.w, t.h);
		sun.position.set(SUN_DIR.x * R, SUN_DIR.y * R, SUN_DIR.z * R);
		sun.castShadow = true;
		sun.shadow.mapSize.set(window.innerWidth < 700 ? 1024 : 2048, window.innerWidth < 700 ? 1024 : 2048);
		const sc = sun.shadow.camera;
		sc.near = R * 0.4; sc.far = R * 2.4;
		sc.left = -t.w * 0.7; sc.right = t.w * 0.7; sc.top = t.h * 0.9; sc.bottom = -t.h * 0.9;
		sc.updateProjectionMatrix();
		sun.shadow.bias = -0.0006;
		sun.shadow.normalBias = 0.4;
		sun.shadow.radius = 3;
		sun.shadow.blurSamples = 8;
		scene.add(sun);
		scene.add(sun.target); // target defaults to origin = table centre

		const table3d = buildTable3D(t);
		scene.add(table3d.group);

		// AI felt + floor textures (flat colours until they load / if they 404).
		new THREE.TextureLoader().load('/assets/jeux/billard/felt.jpg', (tex) => {
			tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
			tex.repeat.set(10, 5);
			tex.colorSpace = THREE.SRGBColorSpace;
			table3d.feltMat.map = tex; table3d.feltMat.color.set(0xffffff); table3d.feltMat.needsUpdate = true;
		});
		new THREE.TextureLoader().load('/assets/jeux/billard/floor.jpg', (tex) => {
			tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
			tex.repeat.set(10, 16);
			tex.colorSpace = THREE.SRGBColorSpace;
			table3d.floorMat.map = tex; table3d.floorMat.color.set(0xffffff); table3d.floorMat.needsUpdate = true;
		});

		// Frame the whole table (plus a felt margin) for the fit / top views.
		fitRef.current.hx = t.w / 2 + FRAME_MARGIN;
		fitRef.current.hz = t.h / 2 + FRAME_MARGIN;

		const ballGroup = new THREE.Group();
		scene.add(ballGroup);

		// Aim gizmos: dashed cue path, object-ball guide, pull marker, contact ring.
		const mkLine = (mat: THREE.LineBasicMaterial | THREE.LineDashedMaterial) => {
			const l = new THREE.Line(new THREE.BufferGeometry(), mat);
			l.frustumCulled = false; l.visible = false; l.renderOrder = 10;
			scene.add(l);
			return l;
		};
		const aimLine = mkLine(new THREE.LineDashedMaterial({ color: 0x30d158, dashSize: 3, gapSize: 2, transparent: true, depthWrite: false }));
		const objLine = mkLine(new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95, depthWrite: false })); // struck ball's path (amber)
		const cueLine = mkLine(new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 2.5, gapSize: 2, transparent: true, opacity: 0.85, depthWrite: false })); // cue's own deflection (white)
		const pullLine = mkLine(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
		const contact = new THREE.Mesh(
			new THREE.RingGeometry(BALL_R * 0.9, BALL_R * 1.25, 24),
			new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
		);
		contact.rotation.x = -Math.PI / 2; contact.visible = false; contact.renderOrder = 11;
		scene.add(contact);

		g3Ref.current = { renderer, scene, camera, sun, table3d, ballGroup, ballMeshes: [], aimLine, objLine, cueLine, pullLine, contact };
		return true;
	}, []);

	/* Rebuild the ball meshes for the current rack (count changes with difficulty). */
	const syncBallMeshes = useCallback(() => {
		const g = g3Ref.current;
		if (!g) return;
		for (const m of g.ballMeshes) {
			g.ballGroup.remove(m);
			m.geometry.dispose();
			(m.material as THREE.Material).dispose();
		}
		g.ballMeshes = ballsRef.current.map((b) => {
			const mesh = makeBallMesh(b.kind === 'cue' ? CUE_COLOR : BALL_COLORS[b.color] ?? 0xffffff);
			g.ballGroup.add(mesh);
			return mesh;
		});
	}, []);

	/* ---------- Camera framing for this canvas ---------- */
	const resize = useCallback(() => {
		const g = g3Ref.current, cv = canvasRef.current, wrap = wrapRef.current;
		if (!g || !cv || !wrap) return;
		const w = wrap.clientWidth, h = wrap.clientHeight || Math.round(w * 0.625);
		g.renderer.setSize(w, h, false);
		g.camera.aspect = w / Math.max(1, h);
		g.camera.updateProjectionMatrix();
		const f = fitRef.current;
		f.az = bestAz(g.camera, f.hx, f.hz, f.base, (PITCH_FIT * Math.PI) / 180);
		f.azTop = bestAz(g.camera, f.hx, f.hz, f.base, (PITCH_TOP * Math.PI) / 180);
	}, []);

	/* ---------- Table setup ---------- */
	const layRack = useCallback((diff: DiffLevel, seed: number) => {
		const t = tableRef.current;
		ballsRef.current = generateRack(t, mulberry32(seed), diff);
		sinksRef.current = [];
		seenRef.current.clear();
		strokesRef.current = 0;
		startRef.current = 0;
		finishedRef.current = false;
		rollingRef.current = false;
		aimRef.current = null;
		panDragRef.current = null;
		zoomRef.current = 1;
		panRef.current = { x: 0, z: 0 };
		azRef.current = fitRef.current.az;
		pitchRef.current = PITCH_FIT * D2R;
		camModeRef.current = 'fit';
		setCamMode('fit');
		camSmoothRef.current.on = false;
		setStrokes(0);
		setRemaining(ballsRef.current.filter((b) => b.kind === 'color').length);
		setElapsed(0);
		setStat('aiming');
		syncBallMeshes();
	}, [syncBallMeshes]);

	const layTable = useCallback((key: keyof typeof DIFFS, seed: number) => {
		layRack(DIFFS[key], seed);
	}, [layRack]);

	/* ---------- Levels mode: seeded rack; grade on the sink-all win (strokes). ---------- */
	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		setDaily(false);
		layRack(cfg.diff, cfg.seed);
	}, [lv, layRack]);

	const armLevels = useCallback(() => {
		setDaily(false);
		lv.enter();
	}, [lv]);

	// Levels is the default landing: resume at the next unlocked level (grid once all cleared).
	// A ?defi / ?mode=daily deep link opens the daily instead — skip auto-resume then.
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily') return;
		void lv.resume().then((next) => { if (next != null) startLevel(next); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const newFreeTable = useCallback((key: keyof typeof DIFFS) => {
		setDaily(false);
		setDiffKey(key);
		triesRef.current = 0;
		setTries(0);
		const lb = localStorage.getItem(freeBestKey(key));
		const stored = lb ? Number(lb) : null;
		bestRef.current = stored;
		setBest(stored);
		layTable(key, (Math.random() * 2 ** 31) >>> 0);
	}, [layTable]);

	const startDaily = useCallback(async () => {
		setDaily(true);
		setDailyLoading(true);
		const run = loadDailyRun(gameId);
		const { seed, diffIndex } = run?.seed != null ? { seed: run.seed, diffIndex: run.diffIndex ?? 0 } : await getDaily(gameId);
		dailyRef.current = { seed, diffIndex };
		const key = DIFF_ORDER[diffIndex] ?? 'facile';
		setDiffKey(key);
		const st = (run?.state as DailyState) ?? { tries: 0 };
		triesRef.current = st.tries ?? 0;
		setTries(triesRef.current);
		const validBest = typeof st.best === 'number' && st.best >= 10_000_000 ? st.best : null;
		bestRef.current = validBest;
		setBest(validBest);
		layTable(key, seed);
		if (run?.startedAt && !run.done) startRef.current = run.startedAt; // resume the timer only for an unfinished run
		setDailyLoading(false);
	}, [gameId, layTable]);

	// ↻ stays available in every mode. The daily re-lays the same table, so the cost
	// is a try: it is billed on the next first stroke, not here.
	const restart = useCallback(() => {
		if (lv.active) startLevel(lv.level);
		else if (daily && dailyRef.current) layTable(diffKey, dailyRef.current.seed);
		else newFreeTable(diffKey);
	}, [lv.active, lv.level, startLevel, daily, diffKey, layTable, newFreeTable]);

	/* ---------- Resolve end of a shot ---------- */
	const resolveShot = useCallback(() => {
		const balls = ballsRef.current;
		const cue = balls.find((b) => b.kind === 'cue')!;
		if (cue.potted) {
			// scratch: respawn cue at start + 1 stroke penalty (let its drop finish on its own)
			seenRef.current.delete(balls.indexOf(cue));
			cue.potted = false;
			cue.x = tableRef.current.cueStart.x;
			cue.y = tableRef.current.cueStart.y;
			cue.vx = cue.vy = 0;
			strokesRef.current += 1;
			setStrokes(strokesRef.current);
			setScratchFlash(true);
			setTimeout(() => setScratchFlash(false), 1100);
		}
		const left = balls.filter((b) => b.kind === 'color' && !b.potted).length;
		setRemaining(left);
		if (left === 0) {
			finishedRef.current = true;
			const timeSec = (Date.now() - startRef.current) / 1000;
			const score = encodeScore(strokesRef.current, timeSec);
			setElapsed(timeSec);
			setStat('won');
			trackGame(gameId, 'game_won', { strokes: strokesRef.current });
			if (lv.active) {
				lv.finish({ won: true, score: strokesRef.current, raw: { timeSec: Math.round(timeSec * 100) } });
				return;
			}
			const prev = bestRef.current;
			const newBest = prev == null ? score : Math.min(prev, score);
			bestRef.current = newBest;
			setBest(newBest);
			if (daily) {
				saveDailyRun(gameId, {
					startedAt: startRef.current, done: true,
					seed: dailyRef.current?.seed, diffIndex: dailyRef.current?.diffIndex,
					state: { best: newBest, tries: triesRef.current } satisfies DailyState,
				});
			} else {
				localStorage.setItem(freeBestKey(diffKey), String(newBest));
			}
		} else {
			setStat('aiming');
		}
	}, [daily, diffKey, gameId, lv]);

	/* ---------- Pointer helpers (raycast into the table) ---------- */
	/** Engine-space point under the pointer on the felt plane (y = 0). */
	const worldFromPointer = useCallback((clientX: number, clientY: number): Vec | null => {
		const g = g3Ref.current, cv = canvasRef.current;
		if (!g || !cv) return null;
		const rect = cv.getBoundingClientRect();
		const ndc = new THREE.Vector2(
			((clientX - rect.left) / rect.width) * 2 - 1,
			-(((clientY - rect.top) / rect.height) * 2 - 1),
		);
		rayRef.current.setFromCamera(ndc, g.camera);
		const hit = new THREE.Vector3();
		if (!rayRef.current.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
		return { x: hit.x + tableRef.current.w / 2, y: hit.z + tableRef.current.h / 2 };
	}, []);

	/** Pointer-to-cue distance in CSS pixels. */
	const cueScreenDist = useCallback((clientX: number, clientY: number, cue: Ball): number => {
		const g = g3Ref.current, cv = canvasRef.current;
		if (!g || !cv) return Infinity;
		const r = cv.getBoundingClientRect();
		const v = new THREE.Vector3(cue.x - tableRef.current.w / 2, BALL_R, cue.y - tableRef.current.h / 2).project(g.camera);
		return Math.hypot(r.left + ((v.x + 1) / 2) * r.width - clientX, r.top + ((1 - v.y) / 2) * r.height - clientY);
	}, []);

	const cueBall = () => ballsRef.current.find((b) => b.kind === 'cue');

	/** Pan the look target by a screen-pixel drag, mapped through the camera basis to the ground. */
	const applyPan = useCallback((startPanX: number, startPanZ: number, dxPx: number, dyPx: number) => {
		const g = g3Ref.current;
		if (!g) return;
		const H = canvasRef.current?.clientHeight || 600;
		const wpp = (2 * lastDistRef.current * Math.tan((g.camera.fov * Math.PI / 180) / 2)) / H;
		const right = new THREE.Vector3().setFromMatrixColumn(g.camera.matrixWorld, 0); right.y = 0; right.normalize();
		const fwd = new THREE.Vector3(); g.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
		// Drag down (dy > 0) should pull the table down-screen, i.e. move the target along +fwd.
		panRef.current.x = startPanX - dxPx * wpp * right.x + dyPx * wpp * fwd.x;
		panRef.current.z = startPanZ - dxPx * wpp * right.z + dyPx * wpp * fwd.z;
	}, []);

	/* ---------- One finger: aim from the cue (slingshot) or pan the view; two fingers: zoom + turn. ---------- */
	const aimStart = useCallback((clientX: number, clientY: number) => {
		if (pinchRef.current) return; // two fingers own the gesture
		const cue = cueBall();
		const p = worldFromPointer(clientX, clientY);
		const near = cue && (cueScreenDist(clientX, clientY, cue) <= GRAB_PX
			|| (p != null && Math.hypot(p.x - cue.x, p.y - cue.y) <= GRAB_R));
		if (statusRef.current === 'aiming' && cue && near) {
			aimRef.current = { pull: { x: 0, y: 0 } };
			powerRef.current = 0;
		} else {
			panDragRef.current = { x: clientX, y: clientY, panX: panRef.current.x, panZ: panRef.current.z }; // one finger drags the view
		}
	}, [worldFromPointer, cueScreenDist]);

	const aimMove = useCallback((clientX: number, clientY: number) => {
		if (pinchRef.current) return;
		if (panDragRef.current) {
			applyPan(panDragRef.current.panX, panDragRef.current.panZ, clientX - panDragRef.current.x, clientY - panDragRef.current.y);
			return;
		}
		if (!aimRef.current) return;
		const cue = cueBall();
		if (!cue) return;
		const p = worldFromPointer(clientX, clientY);
		if (!p) return;
		aimRef.current.pull = { x: p.x - cue.x, y: p.y - cue.y };
		powerRef.current = pullPower(aimRef.current.pull);
	}, [worldFromPointer, applyPan]);

	const aimEnd = useCallback(() => {
		if (pinchRef.current) return;
		if (panDragRef.current) { panDragRef.current = null; return; }
		const aim = aimRef.current;
		aimRef.current = null;
		powerRef.current = 0;
		if (!aim || statusRef.current !== 'aiming') return;
		if (daily && startRef.current === 0 && triesRef.current >= MAX_TRIES) return; // out of daily tries
		const v = aimToVelocity(aim.pull);
		if (!v) return;
		const cue = cueBall();
		if (!cue) return;
		cue.vx = v.vx; cue.vy = v.vy;
		if (startRef.current === 0) {
			startRef.current = Date.now();
			trackGame(gameId, 'game_started');
			if (daily) {
				triesRef.current += 1; // the first stroke consumes a try (no farming by reloading)
				setTries(triesRef.current);
				saveDailyRun(gameId, {
					startedAt: startRef.current, done: false,
					seed: dailyRef.current?.seed, diffIndex: dailyRef.current?.diffIndex,
					state: { best: bestRef.current ?? undefined, tries: triesRef.current } satisfies DailyState,
				});
			}
		}
		strokesRef.current += 1;
		setStrokes(strokesRef.current);
		rollingRef.current = true;
		setStat('rolling');
	}, [daily, gameId]);

	// Single-pointer aim/orbit via Pointer Events (mouse, touch, pen) — reliable on iOS.
	const { onPointerDown: onAimPointerDown } = usePointerDrag(aimStart, aimMove, aimEnd);

	/* ---------- Zoom (wheel + pinch) and camera cycle ---------- */
	const zoomBy = useCallback((f: number) => {
		zoomRef.current = Math.max(1, Math.min(ZOOM_MAX, zoomRef.current * f));
	}, []);

	const cycleCam = useCallback(() => {
		const nv = CAM_NEXT[camModeRef.current];
		camModeRef.current = nv;
		setCamMode(nv);
		zoomRef.current = 1;
		panRef.current = { x: 0, z: 0 };
		azRef.current = nv === 'top' ? fitRef.current.azTop : fitRef.current.az;
		pitchRef.current = (nv === 'top' ? PITCH_TOP : PITCH_FIT) * D2R;
	}, []);

	// Single finger → aim/orbit (usePointerDrag). A pinch already owns the gesture via pinchRef.
	const onPointerDown = useCallback((e: React.PointerEvent) => {
		if (pinchRef.current) return;
		onAimPointerDown(e);
	}, [onAimPointerDown]);

	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomBy(e.deltaY > 0 ? 1 / 1.12 : 1.12); };
		cv.addEventListener('wheel', onWheel, { passive: false });

		// Two-finger pinch (zoom) + centroid drag (pan). NATIVE non-passive touch listeners —
		// React's multi-touch pointer events are dead on real iOS (see the ios-touch memory).
		const gesture = (t: TouchList) => ({
			dist: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY),
			ang: Math.atan2(t[1].clientY - t[0].clientY, t[1].clientX - t[0].clientX),
			cy: (t[0].clientY + t[1].clientY) / 2,
		});
		const onTouchStart = (e: TouchEvent) => {
			if (e.touches.length < 2) return;
			e.preventDefault();
			const gg = gesture(e.touches);
			pinchRef.current = { dist: gg.dist, zoom: zoomRef.current, ang: gg.ang, az: azRef.current, cy: gg.cy, pitch: pitchRef.current };
			aimRef.current = null; panDragRef.current = null; powerRef.current = 0;
		};
		const onTouchMove = (e: TouchEvent) => {
			const p = pinchRef.current;
			if (!p || e.touches.length < 2) return;
			e.preventDefault();
			const gg = gesture(e.touches);
			// Spread → zoom; twist the two-finger line → turn the view; slide both up/down → tilt.
			if (gg.dist > 0) zoomRef.current = Math.max(1, Math.min(ZOOM_MAX, p.zoom * (gg.dist / p.dist)));
			let dAng = gg.ang - p.ang;
			while (dAng > Math.PI) dAng -= 2 * Math.PI;
			while (dAng < -Math.PI) dAng += 2 * Math.PI;
			azRef.current = p.az - dAng;
			// Slide the centroid down → tilt toward top-down; up → tilt toward the horizon.
			pitchRef.current = Math.max(MIN_PITCH, Math.min(MAX_PITCH, p.pitch + (gg.cy - p.cy) * PITCH_PER_PX));
		};
		const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinchRef.current = null; };
		cv.addEventListener('touchstart', onTouchStart, { passive: false });
		cv.addEventListener('touchmove', onTouchMove, { passive: false });
		cv.addEventListener('touchend', onTouchEnd);
		cv.addEventListener('touchcancel', onTouchEnd);
		return () => {
			cv.removeEventListener('wheel', onWheel);
			cv.removeEventListener('touchstart', onTouchStart);
			cv.removeEventListener('touchmove', onTouchMove);
			cv.removeEventListener('touchend', onTouchEnd);
			cv.removeEventListener('touchcancel', onTouchEnd);
		};
	}, [zoomBy]);

	/* ---------- Resize wiring ---------- */
	useEffect(() => {
		const wrap = wrapRef.current;
		if (!wrap) return;
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(wrap);
		return () => ro.disconnect();
	}, [resize]);

	// The site's global fullscreen re-measures after the box changes.
	useEffect(() => {
		const onFs = () => requestAnimationFrame(resize);
		document.addEventListener('fullscreenchange', onFs);
		document.addEventListener('webkitfullscreenchange', onFs);
		return () => {
			document.removeEventListener('fullscreenchange', onFs);
			document.removeEventListener('webkitfullscreenchange', onFs);
		};
	}, [resize]);

	resolveShotRef.current = resolveShot; // keep the run-once loop calling the latest resolveShot

	/* ---------- Scene update (per frame) ---------- */
	const updateScene = useCallback((now: number) => {
		const g = g3Ref.current;
		if (!g) return;
		const t = tableRef.current, hw = t.w / 2, hh = t.h / 2;
		const balls = ballsRef.current;
		const dt = Math.min(0.1, Math.max(0, (now - lastFrameRef.current) / 1000)) || 1 / 60;
		lastFrameRef.current = now;
		const ease = (tau: number) => 1 - Math.exp(-dt / tau);

		// Balls (with pot-drop animation).
		for (let i = 0; i < balls.length; i++) {
			const b = balls[i], mesh = g.ballMeshes[i];
			if (!mesh) continue;
			if (!b.potted) { mesh.visible = true; mesh.position.set(b.x - hw, BALL_R, b.y - hh); continue; }
			const sink = sinksRef.current.find((s) => s.idx === i);
			if (sink) {
				const e = Math.min(1, (now - sink.t0) / SINK_MS);
				const k = e * e;
				mesh.visible = true;
				mesh.position.set(
					(b.x + (sink.px - b.x) * k) - hw,
					BALL_R - (BALL_R + 7) * k,
					(b.y + (sink.py - b.y) * k) - hh,
				);
			} else {
				mesh.visible = false;
			}
		}

		// Aim gizmos.
		const aim = aimRef.current;
		const cue = balls.find((b) => b.kind === 'cue');
		const showAim = aim && cue && statusRef.current === 'aiming' && Math.hypot(aim.pull.x, aim.pull.y) > 0.5;
		g.aimLine.visible = g.objLine.visible = g.cueLine.visible = g.pullLine.visible = g.contact.visible = false;
		if (showAim && aim && cue) {
			const pred = predictCue(balls, t, aim.pull);
			const Y = 0.5;
			const pts: THREE.Vector3[] = [];
			for (let s = 0; s < pred.segs.length; s++) {
				if (s === 0) pts.push(new THREE.Vector3(pred.segs[s].from.x - hw, Y, pred.segs[s].from.y - hh));
				pts.push(new THREE.Vector3(pred.segs[s].to.x - hw, Y, pred.segs[s].to.y - hh));
			}
			if (pts.length >= 2) {
				g.aimLine.geometry.setFromPoints(pts);
				g.aimLine.computeLineDistances();
				(g.aimLine.material as THREE.LineDashedMaterial).color.setHSL((1 - powerRef.current) / 3, 0.85, 0.55);
				g.aimLine.visible = true;
			}
			if (pred.contact) {
				g.contact.position.set(pred.contact.x - hw, Y, pred.contact.y - hh);
				g.contact.visible = true;
			}
			if (pred.object) {
				g.objLine.geometry.setFromPoints([
					new THREE.Vector3(pred.object.from.x - hw, Y, pred.object.from.y - hh),
					new THREE.Vector3(pred.object.to.x - hw, Y, pred.object.to.y - hh),
				]);
				g.objLine.visible = true;
			}
			if (pred.cueAfter) {
				g.cueLine.geometry.setFromPoints([
					new THREE.Vector3(pred.cueAfter.from.x - hw, Y, pred.cueAfter.from.y - hh),
					new THREE.Vector3(pred.cueAfter.to.x - hw, Y, pred.cueAfter.to.y - hh),
				]);
				g.cueLine.computeLineDistances();
				g.cueLine.visible = true;
			}
			// Pull marker: from the cue back along the drag, showing how hard the shot is.
			g.pullLine.geometry.setFromPoints([
				new THREE.Vector3(cue.x - hw, Y, cue.y - hh),
				new THREE.Vector3(cue.x + aim.pull.x - hw, Y, cue.y + aim.pull.y - hh),
			]);
			g.pullLine.visible = true;
		}

		// Camera pose for the current mode, then eased toward it.
		const mode = camModeRef.current, f = fitRef.current;
		const zoom = Math.max(1, zoomRef.current);
		if (mode === 'shoulder' && cue) {
			const cx = cue.x - hw, cz = cue.y - hh;
			let tx = -cx, tz = -cz; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
			const pitch = (SHOULDER_PITCH * Math.PI) / 180;
			const dist = SHOULDER_DIST / zoom;
			const flat = Math.cos(pitch) * dist;
			camEye.set(cx - tx * flat, Math.sin(pitch) * dist + BALL_R, cz - tz * flat);
			camLook.set(cx + tx * 24, BALL_R + 3, cz + tz * 24);
			lastDistRef.current = dist;
		} else {
			const pitch = pitchRef.current;
			const az = azRef.current;
			const d = fitDist(g.camera, f.hx, f.hz, pitch, az) / zoom;
			const pan = panRef.current;
			// Keep the cue ball on screen: whatever the pan/zoom, pull the look target back
			// toward the cue if the current framing would push it out of frame.
			if (cue) {
				const cgx = cue.x - hw, cgz = cue.y - hh;
				const visHalf = d * Math.tan((g.camera.fov * Math.PI / 180) / 2) * Math.min(1, g.camera.aspect);
				const maxOff = Math.max(0, visHalf * 0.8 - BALL_R * 3);
				const ox = pan.x - cgx, oz = pan.z - cgz, od = Math.hypot(ox, oz);
				if (od > maxOff && od > 1e-3) { pan.x = cgx + (ox / od) * maxOff; pan.z = cgz + (oz / od) * maxOff; }
			}
			camEye.set(pan.x - Math.cos(az) * Math.cos(pitch) * d, Math.sin(pitch) * d, pan.z - Math.sin(az) * Math.cos(pitch) * d);
			camLook.set(pan.x, 0, pan.z);
			lastDistRef.current = d;
		}
		const cs = camSmoothRef.current;
		if (!cs.on) { cs.eye.copy(camEye); cs.look.copy(camLook); cs.on = true; }
		const ck = ease(CAM_TAU);
		cs.eye.lerp(camEye, ck);
		cs.look.lerp(camLook, ck);
		g.camera.position.copy(cs.eye);
		g.camera.lookAt(cs.look);

		g.renderer.render(g.scene, g.camera);
	}, []);

	/* ---------- Render + physics loop (run once) ---------- */
	useEffect(() => {
		if (!initScene()) return;
		syncBallMeshes();
		resize();
		const t = tableRef.current;

		const frame = (now: number) => {
			if (!lastRef.current) lastRef.current = now;
			const dt = Math.min(now - lastRef.current, 200);
			lastRef.current = now;
			accRef.current += dt;
			while (accRef.current >= STEP) {
				accRef.current -= STEP;
				if (rollingRef.current) {
					stepBalls(ballsRef.current, t, STEP / 1000);
					if (isSettled(ballsRef.current)) {
						rollingRef.current = false;
						resolveShotRef.current();
					}
				}
			}
			// Spawn a drop animation for any ball that just fell.
			const balls = ballsRef.current;
			for (let i = 0; i < balls.length; i++) {
				const b = balls[i];
				if (b.potted && !seenRef.current.has(i)) {
					seenRef.current.add(i);
					let bp = t.pockets[0], bd = Infinity;
					for (const p of t.pockets) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < bd) { bd = d; bp = p; } }
					// Drop toward the anchor (the visible hole), not the inward-nudged capture centre.
					sinksRef.current.push({ idx: i, t0: now, px: bp.anchor.x, py: bp.anchor.y });
				}
			}
			sinksRef.current = sinksRef.current.filter((s) => now - s.t0 < SINK_MS);
			if (startRef.current && !finishedRef.current) setElapsed((Date.now() - startRef.current) / 1000);
			updateScene(now);
			rafRef.current = requestAnimationFrame(frame);
		};
		rafRef.current = requestAnimationFrame(frame);
		return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); lastRef.current = 0; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* ---------- Init (free table on mount) ---------- */
	useEffect(() => { newFreeTable('facile'); }, [newFreeTable]);

	const bestLabel = best == null ? '—' : formatScore(DAILY_LB.billard.fmt, best);
	const dailyMode = daily && !lv.active;
	const triesLeft = MAX_TRIES - tries;
	const exhausted = dailyMode && triesLeft <= 0;
	const restartLabel = lv.active ? 'Recommencer le niveau'
		: dailyMode ? (exhausted ? 'Essais du jour épuisés' : `Recommencer (${triesLeft} essai${triesLeft > 1 ? 's' : ''} restant${triesLeft > 1 ? 's' : ''})`)
		: 'Nouvelle table';

	return (
		<div className="bi-root">
			<style>{CSS}</style>

			{/* Sits above the table on a phone; overlays it on a wide screen and in fullscreen. */}
			<div className="bi-topbar">
				<div className="bi-hud-top">
					<div className="bi-modetoggle">
						<ModeToggle
							daily={daily}
							onFree={() => { if (lv.active) { lv.exit(); newFreeTable(diffKey); } else if (daily) newFreeTable(diffKey); }}
							onDaily={() => { lv.exit(); startDaily(); }}
							showLevels
							levelsActive={lv.active}
							onLevels={armLevels}
						/>
					</div>
					<div className="bi-stats">
						<span className="bi-stat">🎱 {strokes}</span>
						<span className="bi-stat">🎯 {remaining}</span>
						<span className="bi-stat">⏱ <span className="chrono">{fmtTime(elapsed)}</span></span>
					</div>
					<div className="bi-hud-actions">
						{!daily && !lv.active && diffKeys(DIFFS, gameId).map((k) => (
							<button key={k} className={`bi-pill ${diffKey === k ? 'active' : ''}`} onClick={() => newFreeTable(k)}>{DIFFS[k].label}</button>
						))}
						<button className="bi-act" onClick={cycleCam} aria-label="Changer de vue" title="Changer de vue">{CAM_LABEL[camMode]}</button>
						{!lv.menu && (
							<button
								className="bi-act"
								onClick={restart}
								disabled={exhausted}
								aria-label={restartLabel}
								title={restartLabel}
							>↻</button>
						)}
					</div>
				</div>
				{dailyMode && (
					<div className="bi-daily-tag bi-daily-hud">
						{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label} · Essai ${Math.min(Math.max(tries, 1), MAX_TRIES)}/${MAX_TRIES}`}
					</div>
				)}
				{lv.active && !lv.menu && (
					<div className="bi-daily-tag bi-daily-hud">
						{`Niveau ${lv.level} · ${billardLevels.config(lv.level).diff.balls} boules · ${billardLevels.starHint(lv.level).three} / ${billardLevels.starHint(lv.level).two}`}
					</div>
				)}
			</div>

			<div className="bi-playwrap" ref={wrapRef}>
				{celebrating && !lv.active && <Celebration />}
				<canvas
					ref={canvasRef}
					className="bi-canvas"
					onPointerDown={onPointerDown}
				/>

				{webglError && (
					<div className="bi-overlay">
						<div className="bi-overlay-card">Ton appareil ne peut pas afficher la table 3D (WebGL indisponible).</div>
					</div>
				)}

				{scratchFlash && <div className="bi-scratch">Pénalité · +1 coup</div>}
				{status === 'won' && !lv.active && (
					<div className="bi-overlay">
						<div className="bi-overlay-card">
							🎉 Gagné en <strong>{strokes} coups</strong> · {fmtTime(elapsed)}
							{exhausted ? <span className="bi-spent">Défi terminé pour aujourd'hui</span> : (
								<button className="bi-replay" onClick={restart}>
									{daily ? `Rejouer la table (${triesLeft} restant${triesLeft > 1 ? 's' : ''})` : 'Nouvelle table'}
								</button>
							)}
						</div>
					</div>
				)}

				{lv.active && lv.menu && (
					<div className="bi-overlay bi-levels-overlay">
						<LevelSelect progress={lv.progress} onPick={startLevel} />
					</div>
				)}
				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={billardLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={`${strokes} coups`}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
			</div>

			<p className="bi-help">
				Glisse depuis la boule blanche puis relâche : tu tires dans le sens opposé, plus tu tires loin plus
				c'est puissant. La ligne montre la trajectoire prévue. 1 doigt ailleurs déplace la vue, 2 doigts pour zoomer, pivoter et incliner (haut/bas), 🎥 pour changer d'angle.
				{lv.active ? ' Moins tu joues de coups, plus tu gagnes d\'étoiles.' : daily ? ` Même table pour tous · ${MAX_TRIES} essais · le chrono départage les ex æquo.` : ` Record : ${bestLabel}.`}
			</p>

			{daily && !lv.active && <Leaderboard
				key={`lb-${best ?? 0}`}
				game={`${gameId}-t`}
				metric="time"
				submitValue={status === 'won' && best != null ? best : undefined}
				format={(v) => formatScore(DAILY_LB.billard.fmt, v)}
			/>}
			{!daily && !lv.active && <LeaderboardCorner
				game={`${gameId}-t`}
				metric="time"
				format={(v) => formatScore(DAILY_LB.billard.fmt, v)}
			/>}
		</div>
	);
}

/* ---------- Styles ---------- */

const CSS = `
.bi-root {
  --bi-accent: var(--accent-regular);
  width: 100%; max-width: 620px; margin-inline: auto; color: var(--gray-0);
  font-family: var(--font-body); display: flex; flex-direction: column; align-items: center;
  position: relative; /* anchor for the HUD once it goes absolute in fullscreen */
}

/* Play area holds the canvas + all controls overlaid (immersive). */
.bi-playwrap { width: 100%; aspect-ratio: 16 / 10; position: relative; overflow: hidden; border-radius: 14px; box-shadow: var(--shadow-lg); }
.bi-canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: crosshair; background: #14100c; }
/* Site global fullscreen: the table fills the whole screen, UI overlaid. */
.game-page.gf-full .bi-root { max-width: none; width: 100%; height: 100%; }
.game-page.gf-full .bi-help { display: none; }
.game-page.gf-full .bi-playwrap { flex: 1; aspect-ratio: auto; border-radius: 0; box-shadow: none; }
.game-page.gf-full .bi-hud-top { padding-right: 122px; }

/* HUD stacked above the table: on a phone an overlaid banner covers the cushion
   and swallows the drag that aims the shot. */
.bi-topbar { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 10px; }
.bi-hud-top { width: 100%; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; flex-wrap: wrap; pointer-events: none; }
.bi-hud-top > * { pointer-events: auto; }
/* Libre/Défi toggle: hidden in the windowed view, shown only in fullscreen. */
.bi-modetoggle { display: none; }
.game-page.gf-full .bi-modetoggle { display: block; }
.bi-hud-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.bi-daily-hud { background: rgba(20,14,10,0.6); color: #f0e6da; font-size: 12.5px; font-weight: 500; padding: 5px 14px; border-radius: 999px; margin: 0; backdrop-filter: blur(4px); pointer-events: none; }

/* The HUD (level/score info + controls) is always a bar ABOVE the table, in flow — never over
   the play surface — in every mode (windowed, wide screens, and fullscreen). */
.game-page.gf-full .bi-topbar { margin: 0 0 6px; z-index: 3; }

.bi-stats { display: flex; gap: 6px; font-weight: 700; font-size: 13px; flex-wrap: wrap; }
.bi-stat { background: rgba(20,14,10,0.6); color: #f4ece2; border-radius: 999px; padding: 5px 11px; backdrop-filter: blur(4px); box-shadow: 0 1px 3px rgba(0,0,0,0.35); font-variant-numeric: tabular-nums; }

.bi-pill { border: 1.5px solid rgba(255,255,255,0.28); background: rgba(20,14,10,0.55); color: #f0e6da; font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; backdrop-filter: blur(4px); transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition); }
.bi-pill.active { background: var(--bi-accent); color: var(--accent-text-over); border-color: var(--bi-accent); }
.bi-act { border: 1.5px solid rgba(255,255,255,0.28); background: rgba(20,14,10,0.55); color: #f0e6da; font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 6px 12px; min-width: 36px; cursor: pointer; backdrop-filter: blur(4px); }
.bi-act:hover:not(:disabled) { border-color: var(--bi-accent); color: #fff; }
.bi-act:disabled { opacity: 0.45; cursor: not-allowed; }

.bi-scratch { position: absolute; top: 48px; left: 50%; transform: translateX(-50%); z-index: 3; background: #d9534f; color: #fff; font-weight: 700; font-size: 13px; padding: 6px 14px; border-radius: 999px; box-shadow: var(--shadow-md); }

.bi-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.bi-overlay-card { background: var(--gray-999); border: 2px solid var(--bi-accent); border-radius: 16px; padding: 18px 26px; box-shadow: var(--shadow-lg); color: var(--gray-0); text-align: center; font-size: 16px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.bi-overlay-card strong { color: var(--bi-accent); }
.bi-replay { border: none; background: var(--bi-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 24px; cursor: pointer; }
.bi-spent { color: var(--gray-300); font-size: 13px; }

/* Levels grid overlays the table (canvas stays mounted); scrollable + opaque so it reads. */
.bi-levels-overlay { background: rgba(12, 8, 5, 0.82); backdrop-filter: blur(4px); overflow-y: auto; padding: 18px 12px; align-items: flex-start; }
.bi-levels-overlay .ls-wrap { margin: auto; }

.bi-help { max-width: 460px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1rem; }
`;
