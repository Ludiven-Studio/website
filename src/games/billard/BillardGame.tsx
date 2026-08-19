import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
	makeTable, generateRack, generateRack8, stepBalls, aimToVelocity, pullPower, isSettled,
	encodeScore, DIFFS, BALL_R, type Ball, type DiffLevel, type Table, type Vec, type Impact,
} from './engine';
import {
	buildTable3D, makeBallMesh, makeBall8Mesh, makeCueStick, makeFx, fitDist, bestAz, predictCue,
	ball8Hue, CUE_COLOR, BALL_COLORS, TRON, type Table3D, type Fx, type TableSkin,
} from './render3d';
import { hasTheme } from '../../lib/wallet';
import { initMatch8, applyShot, groupOf, type Match8, type Group } from './rules8';
import { chooseShot } from './ai8';
import * as sfx from './sfx';
import { joinRandom, joinByCode, makeCode, multiplayerAvailable, seedFromRoom, type BilliardMatch } from './net';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import { formatScore, fmtCentis } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun, playerName } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
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

type Status = 'aiming' | 'striking' | 'rolling' | 'won';
type CamMode = 'fit' | 'shoulder' | 'top';
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
const STEP = 1000 / 60;
const GRAB_R = 22; // table units: start aiming when grabbing near the cue ball
const GRAB_PX = 56; // …or this many screen pixels, for when the table is framed far away
const SINK_MS = 320; // pot drop animation
const FRAME_MARGIN = 16; // world units of felt framed around the table

const ZOOM_MAX = 4;
const PITCH_FIT = 46, PITCH_TOP = 88, SHOULDER_PITCH = 42; // elevated 3/4 start view (whole table, looking down it from behind the cue)
const STICK_TILT = 0.28; // radians the cue butt is lifted (~16°) so the shaft stays above the rails
const D2R = Math.PI / 180;
const MIN_PITCH = 14 * D2R, MAX_PITCH = 89 * D2R; // tilt limits for the two-finger vertical drag
const PITCH_PER_PX = 0.005; // radians of tilt per pixel of two-finger vertical drag
const ORBIT_PER_PX = 0.007; // radians of turn per pixel of right-button horizontal drag (PC)
const CAM_TAU = 0.09; // camera catch-up time constant (s) — snappy for user orbit/pan/zoom
const CAM_TAU_SLOW = 0.42; // slower, cinematic glide when auto-placing behind the cue on your turn
const CAM_FOLLOW_TAU = 0.16; // smooth tracking while the balls roll
const FOLLOW_MARGIN = 16, FOLLOW_MIN_X = 84, FOLLOW_MIN_Z = 46; // min framed half-extents: keep most of the cloth, a lone slow ball must not become a close-up
const FOLLOW_LEAD = 0.35; // s of travel added to the framed box: the camera eases, so frame where the balls WILL be
// Impact drama (render-only — the physics never sees any of it).
const HITSTOP_SPEED = 65; // closing speed that earns a freeze-frame (a full break arrives ~75-100)
const HITSTOP_COOLDOWN = 800; // ms between freezes, so a break doesn't stutter
const SLOWMO_FAR = 0.55, SLOWMO_NEAR = 0.18; // pocket threat: mild on engage, deepest right at the mouth
const SLOWMO_NEAR_8 = 0.1; // the black bottoms out even deeper
const SLOWMO_RANGE = 3.2; // engage within this many pocket radii of the mouth
const SLOWMO_AIM = 0.75; // min cos(velocity, pocket direction)
const SLOWMO_MIN_SPEED = 22; // a crawling ball earns no drama
const SLOWMO_HOLD = 420; // ms the effect lingers past the trigger, so the drop itself plays slow
const SLOWMO_TAU_IN = 70, SLOWMO_TAU_OUT = 200; // ms, ease into / out of slow motion
const SLOWMO_TTI = 0.1; // s: anticipate the shot's first ball contact this far ahead
const SLOWMO_HIT = 0.5; // lighter slow for that pre-contact beat (the hit-stop takes over at contact)
const SLOWMO_HIT_SPEED = 85; // only a hard closing speed earns the anticipation
const SLOWMO_HOLD_HIT = 240; // shorter linger for the contact beat
const SLOWMO_FOCUS_BELOW = 0.9; // punch the camera in once the slow-mo really bites
const FOCUS_MARGIN = 12, FOCUS_MIN_X = 34, FOCUS_MIN_Z = 24; // close-up half-extents on the slow-mo action
const SHAKE_TAU = 0.14; // s, camera shake decay
const SHAKE_MAX = 2.2; // world units of jitter at full amplitude
const SHOULDER_ZOOM = 1.55; // your turn: closer than the whole table, otherwise the shot is unreadable
const SHOULDER_AHEAD = 30; // look this far past the cue ball, down the line you are shooting
const STRIKE_MS = 460; // final forward swing duration before the ball is released
const STRIKE_HIT = 0.6; // fraction of the swing at which the tip reaches the ball (fire here)
const STRIKE_FOLLOW = 8; // follow-through past contact
const WARMUP_MS = 300; // duration of one AI practice stroke (back-and-forth) before the real swing
const STICK_MIN = 7, STICK_RANGE = 34; // cue drawn back this much (min + power·range) while aiming
const AIM_SEND_MS = 80; // online: how often we broadcast our aim so the opponent sees our stick
const AIM_STALE_MS = 2500; // hide the opponent's stick if their stream goes quiet (tab hidden, drop)
const AIM_TAU = 0.06; // smoothing of the received aim — the stream is far slower than the frame rate
const CAM_LABEL: Record<CamMode, string> = { fit: '🎥', shoulder: '🎱', top: '🛰' };
const CAM_NEXT: Record<CamMode, CamMode> = { fit: 'shoulder', shoulder: 'top', top: 'fit' };
const SUN_DIR = new THREE.Vector3(30, 90, 40).normalize();
const SKIN_KEY = 'billard-theme'; // 'tron' once bought in the boutique and toggled on
const BG_CLASSIC = 0x14100c;

const camEye = new THREE.Vector3();
const camLook = new THREE.Vector3();

const fmtTime = (s: number) => fmtCentis(Math.round(s * 100));

interface DailyState { best?: number; tries: number; }
const MAX_TRIES = 10; // daily attempts per day; best of the day is ranked

// 8-ball (Libre): you = 0, computer = 1. AI strength maps from the difficulty pills.
const HUMAN = 0 as const, AI = 1 as const;
const AI_SKILL: Record<string, number> = { facile: 0.35, moyen: 0.6, difficile: 0.82, expert: 0.95 };
interface ShotAcc { firstHitNumber: number | null; potted: number[]; scratched: boolean; railAfterContact: boolean; contactSeen: boolean; }
const emptyAcc = (): ShotAcc => ({ firstHitNumber: null, potted: [], scratched: false, railAfterContact: false, contactSeen: false });
const groupLabel = (g: Group | null): string => (g === 'solid' ? 'pleines' : g === 'stripe' ? 'rayées' : '—');

/* Critically-damped smoothing (Unity SmoothDamp) for a Vector3 — natural ease-in/ease-out with
   velocity continuity, so the camera never jerks when the target changes mid-glide. Mutates cur+vel. */
const AXES = ['x', 'y', 'z'] as const;
function smoothDampV3(cur: THREE.Vector3, target: THREE.Vector3, vel: THREE.Vector3, smoothTime: number, dt: number): void {
	const st = Math.max(0.0001, smoothTime);
	const omega = 2 / st;
	const x = omega * dt;
	const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
	for (const k of AXES) {
		const change = cur[k] - target[k];
		const temp = (vel[k] + omega * change) * dt;
		vel[k] = (vel[k] - omega * temp) * exp;
		cur[k] = target[k] + (change + temp) * exp;
	}
}

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
	contact: THREE.Mesh;
	placeRing: THREE.Mesh; // pulsing ring around the cue during ball-in-hand
	cueStick: THREE.Group; // swung at the ball on each shot (player + AI)
	fx: Fx; // sparks / shock rings / trails
}

export default function BillardGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [status, setStatus] = useState<Status>('aiming');
	const [strokes, setStrokes] = useState(0);
	const [remaining, setRemaining] = useState(3);
	const [elapsed, setElapsed] = useState(0);
	const [best, setBest] = useState<number | null>(null);
	const [scratchFlash, setScratchFlash] = useState(false);
	const [cancelFlash, setCancelFlash] = useState(false); // brief "shot cancelled" toast (PC left+right)
	// Announces the hand-over between shots (and the solids/stripes assignment, in the same card so
	// the two never stack): whose turn it is now was easy to miss on the HUD alone.
	const [turnFlash, setTurnFlash] = useState<{ mine: boolean; title: string; sub: string | null } | null>(null);
	const [camMode, setCamMode] = useState<CamMode>('shoulder');
	const [webglError, setWebglError] = useState(false);
	// Daily
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [tries, setTries] = useState(0); // daily attempts used today
	// 8-ball (Libre)
	const [match8, setMatch8] = useState<Match8 | null>(null); // mirror of match8Ref for the HUD
	const [placing, setPlacing] = useState(false); // ball-in-hand: drag to place the cue
	// Multiplayer (Libre online)
	const [mpPhase, setMpPhase] = useState<'off' | 'menu' | 'connecting' | 'waiting' | 'playing'>('off');
	const [mpCode, setMpCode] = useState<string | null>(null); // code to share / joined with
	const [mpOpp, setMpOpp] = useState<string | null>(null); // opponent name
	const [mpPlayer, setMpPlayer] = useState<0 | 1>(0); // my player index online
	const [mpMsg, setMpMsg] = useState<string | null>(null);
	const [codeInput, setCodeInput] = useState('');

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
	// Ball positions before the last physics step, and how far into the next one we are. The
	// simulation runs at a fixed 60 Hz while the screen refreshes at its own rate, so drawing raw
	// engine positions skips or doubles a step now and then — visible as stutter against the smoothly
	// eased camera. Rendering between the two states hides the mismatch.
	const prevPosRef = useRef<{ x: number; y: number }[]>([]);
	const alphaRef = useRef(1);
	const powerRef = useRef(0); // 0..1, for the aim-line colour
	const sinksRef = useRef<SinkInfo[]>([]); // active pot drops
	const seenRef = useRef<Set<number>>(new Set()); // ball indices already dropping
	const dailyRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const bestRef = useRef<number | null>(null);
	const triesRef = useRef(0);
	// 8-ball refs (read inside the raf loop / async turns)
	const eightBallRef = useRef(false); // Libre = 8-ball; Défi / Niveaux = arcade (Phase 1)
	const match8Ref = useRef<Match8 | null>(null);
	const shotAccRef = useRef<ShotAcc>(emptyAcc());
	const boardBeforeRef = useRef<number[]>([]); // ball numbers on the table BEFORE the shot
	const placingRef = useRef(false); // human is placing the cue (ball in hand)
	const placeDragRef = useRef(false); // a placement drag is in progress
	const aiThinkingRef = useRef(false); // AI turn scheduled/running — block human input
	const runAiShotRef = useRef<() => void>(() => {});
	const levelSkillRef = useRef(0.5); // AI strength for the current Niveaux level
	// Multiplayer
	const netRef = useRef<BilliardMatch | null>(null);
	const onlineRef = useRef(false); // opponent is a remote human, not the AI
	const myPlayerRef = useRef<0 | 1>(0);
	const startedOnlineRef = useRef(false); // guard against starting the match twice on presence sync
	// The opponent's live aim, so their cue stick shows on our table while they line the shot up.
	// Purely cosmetic: the shot message is still what drives the simulation. `to` is the last one
	// received, `at` the eased pose we actually draw — the stream arrives ~12x a second, the screen
	// refreshes much faster, so drawing raw messages would make the stick jump.
	const remoteAimRef = useRef<{ px: number; py: number; dx: number; dy: number; power: number; live: boolean; seen: number } | null>(null);
	const remoteStickRef = useRef({ px: 0, py: 0, dx: 1, dy: 0, power: 0, on: false });
	const aimSentRef = useRef(0); // last aim broadcast (ms), to throttle the stream

	// Cue-strike animation: set on fire, advanced in the raf loop; releases the ball at contact.
	// `warmups` = practice strokes before the swing (AI only); `back` = draw-back distance.
	const strikeRef = useRef<{ vx: number; vy: number; dx: number; dy: number; cx: number; cy: number; back: number; warmups: number; t0: number; fired: boolean; release: () => void } | null>(null);

	// Camera / view state read inside the raf loop.
	const userCamRef = useRef<CamMode>('shoulder'); // the view the player picked, restored after the action cam
	const camModeRef = useRef<CamMode>('shoulder');
	const zoomRef = useRef(1);
	const azRef = useRef(0);
	const pitchRef = useRef(PITCH_FIT * D2R); // camera tilt for fit/top (two-finger vertical)
	const fitRef = useRef({ hx: 120, hz: 70, base: 0, az: 0, azTop: 0 });
	const panDragRef = useRef<{ x: number; y: number; panX: number; panZ: number } | null>(null); // one-finger pan
	const panRef = useRef({ x: 0, z: 0 }); // fit/top look-target offset
	const camSmoothRef = useRef({ eye: new THREE.Vector3(), look: new THREE.Vector3(), velEye: new THREE.Vector3(), velLook: new THREE.Vector3(), on: false });
	const camTauRef = useRef(CAM_TAU); // eased down to CAM_TAU on user input, up to CAM_TAU_SLOW for auto-placement
	const camMovedRef = useRef(false); // player turned/panned/zoomed since the last preset — don't yank it back
	const rollSeenRef = useRef<Set<number>>(new Set()); // balls this shot set in motion — the framed cast
	const turnFlashTimer = useRef<number | null>(null);
	const lastFrameRef = useRef(0);
	const lastDistRef = useRef(200); // camera→target distance, for the pan pixel→world scale
	const pinchRef = useRef<{ dist: number; zoom: number; ang: number; az: number; cy: number; pitch: number } | null>(null);
	const rayRef = useRef(new THREE.Raycaster());
	const rollAxisRef = useRef(new THREE.Vector3()); // scratch axis for the rolling-ball spin
	// Impact drama, all render-side: a shared scratch array for the engine's events, a freeze-frame
	// timer that pauses the accumulator (never the simulation itself), and a decaying camera shake.
	const impactsRef = useRef<Impact[]>([]);
	const hitStopRef = useRef(0); // ms of freeze left
	const hitStopCoolRef = useRef(0); // no new freeze before this timestamp
	const slowRef = useRef(1); // smoothed sim-time scale (1 = real time)
	const slowHoldRef = useRef({ ms: 0, scale: 1 }); // lingering slow-mo after the last trigger
	const slowBornRef = useRef(0); // times engaged — smoke tests
	const slowHitBornRef = useRef(0); // times the pre-contact anticipation opened the slow-mo — smoke tests
	const slowFocusRef = useRef<{ idx: number; idx2?: number; px: number; py: number } | null>(null); // what the punch-in frames: a live ball + (a second ball | a fixed point)
	const contactSeenRef = useRef(true); // this shot's first ball contact already happened (no more anticipation)
	const shakeRef = useRef(0); // current shake amplitude (world units)
	const maxImpactRef = useRef(0); // hardest contact seen since load — threshold tuning + smoke tests
	const [skin, setSkin] = useState<TableSkin>(() => {
		try { return hasTheme('billard-tron') && localStorage.getItem(SKIN_KEY) === 'tron' ? 'tron' : 'classic'; } catch { return 'classic'; }
	});
	const skinRef = useRef(skin);
	const woodTexRef = useRef<{ felt?: THREE.Texture; floor?: THREE.Texture }>({}); // kept across skin swaps
	const [sound, setSound] = useState(() => sfx.isEnabled());

	const { celebrating } = useCelebration(status === 'won');
	const lv = useLevels(gameId, billardLevels);

	const setStat = (s: Status) => { statusRef.current = s; setStatus(s); };
	const freeBestKey = (k: string) => `ludiven-billard-best-${k}`;
	const localPlayer = (): 0 | 1 => (onlineRef.current ? myPlayerRef.current : HUMAN); // the player at this device

	/* ---------- three.js scene (built once) ---------- */
	/* Put the wood textures back on the current table materials (classic skin only). */
	const attachWoodTextures = useCallback(() => {
		const g = g3Ref.current, wt = woodTexRef.current;
		if (!g || skinRef.current === 'tron') return;
		if (wt.felt) { g.table3d.feltMat.map = wt.felt; g.table3d.feltMat.color.set(0xffffff); g.table3d.feltMat.needsUpdate = true; }
		if (wt.floor) { g.table3d.floorMat.map = wt.floor; g.table3d.floorMat.color.set(0xffffff); g.table3d.floorMat.needsUpdate = true; }
	}, []);

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
		scene.background = new THREE.Color(skinRef.current === 'tron' ? TRON.background : BG_CLASSIC);
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

		const table3d = buildTable3D(t, skinRef.current);
		scene.add(table3d.group);

		// AI felt + floor textures (flat colours until they load / if they 404). Kept in a ref so
		// a skin swap back to classic can re-attach them; Tron uses its own generated materials.
		new THREE.TextureLoader().load('/assets/jeux/billard/felt.jpg', (tex) => {
			tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
			tex.repeat.set(10, 5);
			tex.colorSpace = THREE.SRGBColorSpace;
			woodTexRef.current.felt = tex;
			attachWoodTextures();
		});
		new THREE.TextureLoader().load('/assets/jeux/billard/floor.jpg', (tex) => {
			tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
			tex.repeat.set(10, 16);
			tex.colorSpace = THREE.SRGBColorSpace;
			woodTexRef.current.floor = tex;
			attachWoodTextures();
		});

		// Frame the whole table (plus a felt margin) for the fit / top views.
		fitRef.current.hx = t.w / 2 + FRAME_MARGIN;
		fitRef.current.hz = t.h / 2 + FRAME_MARGIN;

		const ballGroup = new THREE.Group();
		scene.add(ballGroup);

		// Aim gizmos: dashed GREEN cue-ball path (before + after contact), solid ORANGE struck-ball
		// guide, contact ring. The two colours never overlap so the lines stay readable.
		const mkLine = (mat: THREE.LineBasicMaterial | THREE.LineDashedMaterial) => {
			const l = new THREE.Line(new THREE.BufferGeometry(), mat);
			l.frustumCulled = false; l.visible = false; l.renderOrder = 10;
			scene.add(l);
			return l;
		};
		const aimLine = mkLine(new THREE.LineDashedMaterial({ color: 0x30d158, dashSize: 3, gapSize: 2, transparent: true, depthWrite: false }));
		const objLine = mkLine(new THREE.LineBasicMaterial({ color: 0x38b6ff, transparent: true, opacity: 0.98, depthWrite: false })); // struck ball's path (blue — distinct from the power-tinted cue line)
		const cueLine = mkLine(new THREE.LineDashedMaterial({ color: 0x30d158, dashSize: 3, gapSize: 2, transparent: true, opacity: 0.95, depthWrite: false })); // cue's own path after contact (same green as the aim = "the white ball")
		const contact = new THREE.Mesh(
			new THREE.RingGeometry(BALL_R * 0.9, BALL_R * 1.25, 24),
			new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
		);
		contact.rotation.x = -Math.PI / 2; contact.visible = false; contact.renderOrder = 11;
		scene.add(contact);

		// Ball-in-hand marker: a bright ring that pulses around the cue while the human places it.
		const placeRing = new THREE.Mesh(
			new THREE.RingGeometry(BALL_R * 1.35, BALL_R * 1.95, 32),
			new THREE.MeshBasicMaterial({ color: 0x30d158, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
		);
		placeRing.rotation.x = -Math.PI / 2; placeRing.visible = false; placeRing.renderOrder = 12;
		scene.add(placeRing);

		const cueStick = makeCueStick();
		scene.add(cueStick);

		g3Ref.current = { renderer, scene, camera, sun, table3d, ballGroup, ballMeshes: [], aimLine, objLine, cueLine, contact, placeRing, cueStick, fx: makeFx(scene) };
		return true;
	}, [attachWoodTextures]);

	/* Rebuild the ball meshes for the current rack (count changes with difficulty). */
	const syncBallMeshes = useCallback(() => {
		const g = g3Ref.current;
		if (!g) return;
		for (const m of g.ballMeshes) {
			g.ballGroup.remove(m);
			m.geometry.dispose();
			const mat = m.material as THREE.MeshStandardMaterial;
			mat.map?.dispose();
			mat.dispose();
		}
		g.ballMeshes = ballsRef.current.map((b) => {
			const glow = skinRef.current === 'tron';
			const mesh = eightBallRef.current
				? makeBall8Mesh(b.kind === 'cue' ? -1 : b.color, glow)
				: makeBallMesh(b.kind === 'cue' ? CUE_COLOR : BALL_COLORS[b.color] ?? 0xffffff, glow);
			g.ballGroup.add(mesh);
			return mesh;
		});
		g.fx.resetTrails(); // indices (and colours) change with the rack
	}, []);

	/* Swap the table skin live: rebuild the static scenery, keep everything else. */
	const applySkin = useCallback((next: TableSkin) => {
		skinRef.current = next;
		setSkin(next);
		try { localStorage.setItem(SKIN_KEY, next); } catch { /* storage unavailable */ }
		const g = g3Ref.current;
		if (!g) return;
		g.scene.remove(g.table3d.group);
		g.table3d.dispose();
		g.table3d = buildTable3D(tableRef.current, next);
		g.scene.add(g.table3d.group);
		g.scene.background = new THREE.Color(next === 'tron' ? TRON.background : BG_CLASSIC);
		attachWoodTextures();
		syncBallMeshes(); // ball materials change too (neon glow)
	}, [attachWoodTextures, syncBallMeshes]);

	/** Turn one engine impact into drama: sparks + ring, camera shake, and — for the hardest
	    hits only, throttled — a few frozen frames. All of it render-side. */
	const onImpact = useCallback((im: Impact, now: number) => {
		const g = g3Ref.current, t = tableRef.current;
		if (!g) return;
		const x = im.x - t.w / 2, z = im.y - t.h / 2;
		if (im.kind === 'ball' && im.speed > maxImpactRef.current) maxImpactRef.current = im.speed;
		if (im.kind === 'ball') {
			contactSeenRef.current = true; // the anticipated hit landed
			sfx.ballHit(im.speed); // sound triggers below the visual threshold: soft touches are audible
			if (im.speed < 18) return; // grazes stay quiet
			g.fx.burst(x, z, im.speed);
			if (im.speed > 45) g.fx.ring(x, z, 0xffffff);
			shakeRef.current = Math.min(SHAKE_MAX, shakeRef.current + im.speed * 0.012);
			if (im.speed > HITSTOP_SPEED && now >= hitStopCoolRef.current) {
				hitStopRef.current = Math.min(90, 30 + im.speed * 0.3);
				hitStopCoolRef.current = now + HITSTOP_COOLDOWN;
			}
		} else if (im.kind === 'rail') {
			sfx.railHit(im.speed);
			if (im.speed < 32) return;
			g.fx.burst(x, z, im.speed * 0.55);
			shakeRef.current = Math.min(SHAKE_MAX, shakeRef.current + im.speed * 0.0025);
		} else {
			sfx.pocket();
			// The drop itself always plays at the deepest slow-mo, however coarse the frames were.
			const hold = slowHoldRef.current;
			if (hold.ms <= 0) slowBornRef.current++;
			hold.ms = Math.max(hold.ms, SLOWMO_HOLD);
			hold.scale = Math.min(hold.scale, SLOWMO_NEAR);
			g.fx.ring(x, z, 0xffd76a, true); // a pot always celebrates, whatever the entry speed
			g.fx.burst(x, z, Math.max(50, im.speed));
			shakeRef.current = Math.min(SHAKE_MAX, shakeRef.current + 0.5);
		}
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
		const eightBall = eightBallRef.current;
		if (eightBall) {
			ballsRef.current = generateRack8(t, mulberry32(seed));
			match8Ref.current = initMatch8(HUMAN);
			setMatch8(match8Ref.current);
		} else {
			ballsRef.current = generateRack(t, mulberry32(seed), diff);
			match8Ref.current = null;
			setMatch8(null);
		}
		shotAccRef.current = emptyAcc();
		boardBeforeRef.current = [];
		placingRef.current = false; setPlacing(false);
		placeDragRef.current = false;
		aiThinkingRef.current = false;
		sinksRef.current = [];
		seenRef.current.clear();
		strokesRef.current = 0;
		startRef.current = 0;
		finishedRef.current = false;
		rollingRef.current = false;
		aimRef.current = null;
		panDragRef.current = null;
		userCamRef.current = 'shoulder'; // aim from behind the cue ball by default
		setView('shoulder');
		strikeRef.current = null;
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

	/* ---------- Niveaux: 8-ball vs an AI whose strength ramps with the level. ---------- */
	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		setDaily(false);
		eightBallRef.current = true;
		levelSkillRef.current = cfg.skill;
		layRack(DIFFS.facile, cfg.seed); // diff ignored by the 8-ball rack
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
		eightBallRef.current = true; // Libre = 8-ball vs the computer
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
		eightBallRef.current = false; // Défi keeps the arcade rules
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
			sfx.foul();
		}
		const left = balls.filter((b) => b.kind === 'color' && !b.potted).length;
		setRemaining(left);
		if (left === 0) {
			sfx.win();
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
			restoreCam();
			setStat('aiming');
		}
	}, [daily, diffKey, gameId, lv]);

	/* ---------- 8-ball (Libre vs the computer) — plain fns, wired via refs each render ---------- */
	const moveCueTo = (cue: Ball, p: Vec) => {
		const t = tableRef.current, r = BALL_R;
		const x = Math.max(r, Math.min(t.w - r, p.x)), y = Math.max(r, Math.min(t.h - r, p.y));
		for (const b of ballsRef.current) if (b !== cue && !b.potted && Math.hypot(b.x - x, b.y - y) < 2 * r) return; // no overlap
		for (const pk of t.pockets) if (Math.hypot(x - pk.x, y - pk.y) < pk.r + r) return; // not over a pocket
		cue.x = x; cue.y = y; cue.vx = cue.vy = 0;
	};

	/** Ball in hand is over: the player pressed the button under the table. Releasing the drag can't
	    do it — you need to let go, look around and move the ball again before committing. */
	const confirmPlacement = () => {
		placeDragRef.current = false;
		placingRef.current = false; setPlacing(false);
		if (match8Ref.current && match8Ref.current.ballInHand === HUMAN) { match8Ref.current = { ...match8Ref.current, ballInHand: null }; setMatch8(match8Ref.current); }
		if (!camMovedRef.current) restoreCam(); // back to the player's own view, unless they set one up
		const placed = cueBall();
		if (placed) streamAim(placed, null, true);
		setStat('aiming');
	};

	/** Broadcast where we point and how hard we pull, so the opponent sees our cue stick move. */
	const streamAim = (cue: Ball, pull: Vec | null, force = false) => {
		const net = netRef.current;
		if (!onlineRef.current || !net) return;
		const now = Date.now();
		if (!force && now - aimSentRef.current < AIM_SEND_MS) return;
		aimSentRef.current = now;
		const m = pull ? Math.hypot(pull.x, pull.y) : 0;
		net.sendAim({
			px: cue.x, py: cue.y,
			dx: m > 1e-3 ? -pull!.x / m : 0, dy: m > 1e-3 ? -pull!.y / m : 0,
			power: pull ? pullPower(pull) : 0,
			live: m > 1,
		});
	};

	const startShot8 = () => {
		shotAccRef.current = emptyAcc();
		boardBeforeRef.current = ballsRef.current.filter((b) => b.kind === 'color' && !b.potted).map((b) => b.color);
		rollingRef.current = true;
		setStat('rolling');
	};

	// Snap the camera to a preset for the new situation. It only sets az/pitch/pan/zoom ONCE — the
	// render reads those each frame, so the player stays free to orbit/pan/zoom afterwards; nothing
	// re-locks the view until the next situation change (which eases smoothly to the new preset).
	const setView = (view: CamMode) => {
		camModeRef.current = view; setCamMode(view);
		camMovedRef.current = false;
		camTauRef.current = view === 'shoulder' ? CAM_TAU_SLOW : CAM_TAU; // glide slowly behind the cue
		const f = fitRef.current;
		zoomRef.current = 1;
		const cue = ballsRef.current.find((b) => b.kind === 'cue');
		if (view === 'shoulder' && cue) {
			// Elevated 3/4 view of the WHOLE table, looking down it toward the nearest ball of our group
			// (or the nearest ball if the table is open / group cleared) — the cue sits in the foreground.
			const me = onlineRef.current ? myPlayerRef.current : HUMAN;
			const myGroup = match8Ref.current?.groups[me] ?? null;
			const objs = ballsRef.current.filter((b) => b.kind === 'color' && !b.potted);
			let cands = myGroup ? objs.filter((b) => groupOf(b.color) === myGroup) : objs;
			if (cands.length === 0) cands = objs;
			let tx = 1, tz = 0, bd = Infinity; // fallback: down the table
			for (const b of cands) {
				const dx = b.x - cue.x, dz = b.y - cue.y, d = Math.hypot(dx, dz);
				if (d > 1e-3 && d < bd) { bd = d; tx = dx / d; tz = dz / d; }
			}
			// Look just past the cue ball along that line and come closer: framing the whole table from
			// here leaves the balls tiny, and the shot is what the player is reading.
			const t = tableRef.current;
			panRef.current = {
				x: Math.max(-f.hx, Math.min(f.hx, cue.x - t.w / 2 + tx * SHOULDER_AHEAD)),
				z: Math.max(-f.hz, Math.min(f.hz, cue.y - t.h / 2 + tz * SHOULDER_AHEAD)),
			};
			zoomRef.current = SHOULDER_ZOOM;
			azRef.current = Math.atan2(tz, tx); // face down the table toward the target
			pitchRef.current = SHOULDER_PITCH * D2R;
		} else {
			panRef.current = { x: 0, z: 0 };
			azRef.current = view === 'top' ? f.azTop : f.az;
			pitchRef.current = (view === 'top' ? PITCH_TOP : PITCH_FIT) * D2R;
		}
	};
	const enterActionCam = () => { setView('fit'); camTauRef.current = CAM_FOLLOW_TAU; }; // whole table, then track the roll
	const restoreCam = () => setView(userCamRef.current); // back to the player's chosen view on their turn

	// Swing the cue stick at the ball, then fire `release` at contact (see the raf loop). Adds a beat
	// before every shot (player release + AI) and pulls the camera back to watch the balls scatter.
	// warmups = AI practice strokes; back = draw-back distance (matches the aiming stick for the human).
	const beginStrike = (vx: number, vy: number, release: () => void, opts?: { back?: number; warmups?: number }) => {
		const cue = ballsRef.current.find((b) => b.kind === 'cue');
		const m = Math.hypot(vx, vy);
		if (!cue || m < 1e-3) { release(); return; } // nothing to swing at — just fire
		const back = opts?.back ?? STICK_MIN + Math.min(1, m / 195) * STICK_RANGE;
		strikeRef.current = { vx, vy, dx: vx / m, dy: vy / m, cx: cue.x, cy: cue.y, back, warmups: opts?.warmups ?? 0, t0: -1, fired: false, release };
		setStat('striking');
		enterActionCam();
	};

	const runAiShot = () => {
		const balls = ballsRef.current, t = tableRef.current, m = match8Ref.current;
		if (!m || m.winner !== null || m.turn !== AI) { aiThinkingRef.current = false; return; }
		const cue = balls.find((b) => b.kind === 'cue');
		if (!cue) { aiThinkingRef.current = false; return; }
		if (m.ballInHand === AI) { cue.x = t.cueStart.x; cue.y = t.cueStart.y; cue.potted = false; match8Ref.current = { ...m, ballInHand: null }; setMatch8(match8Ref.current); }
		const skill = lv.active ? levelSkillRef.current : (AI_SKILL[diffKey] ?? 0.6);
		const shot = chooseShot(balls, t, m.groups[AI], skill, Math.random);
		beginStrike(shot.vx, shot.vy, startShot8, { warmups: Math.random() < 0.5 ? 1 : 2 }); // AI lines up with a stroke or two
		aiThinkingRef.current = false;
	};

	const announceTurn = (mine: boolean, title: string, sub: string | null) => {
		if (turnFlashTimer.current) window.clearTimeout(turnFlashTimer.current);
		setTurnFlash({ mine, title, sub });
		turnFlashTimer.current = window.setTimeout(() => setTurnFlash(null), sub ? 2400 : 1500); // matches the CSS animation
	};

	const resolveShot8 = () => {
		const balls = ballsRef.current, t = tableRef.current, prev = match8Ref.current;
		if (!prev) return;
		const acc = shotAccRef.current;
		const next = applyShot(prev, { firstHitNumber: acc.firstHitNumber, potted: acc.potted, scratched: acc.scratched, railAfterContact: acc.railAfterContact }, { remaining: boardBeforeRef.current });
		match8Ref.current = next;
		setMatch8(next);
		setRemaining(balls.filter((b) => b.kind === 'color' && !b.potted).length);
		const cue = balls.find((b) => b.kind === 'cue');
		if (cue && cue.potted) { seenRef.current.delete(balls.indexOf(cue)); cue.potted = false; cue.x = t.cueStart.x; cue.y = t.cueStart.y; cue.vx = cue.vy = 0; } // un-pot on scratch
		if (next.lastFoul) { setScratchFlash(true); setTimeout(() => setScratchFlash(false), 1500); sfx.foul(); }
		const me = onlineRef.current ? myPlayerRef.current : HUMAN; // the player at this device
		const groupMsg = prev.open && !next.open && next.groups[me] ? `🎱 Tu joues les ${groupLabel(next.groups[me])} !` : null;
		if (next.winner === null && (next.turn !== prev.turn || groupMsg)) {
			const mine = next.turn === me;
			const opp = onlineRef.current ? (mpOpp || 'ton adversaire') : 'l’ordi';
			announceTurn(mine, mine ? '🎯 À toi de jouer' : `⏳ Au tour de ${opp}`, groupMsg);
		}
		if (next.winner !== null) {
			if (next.winner === me) sfx.win(); else sfx.lose();
			setStat('won');
			if (lv.active) {
				const oppGroup = next.groups[AI];
				const oppLeft = oppGroup ? balls.filter((b) => b.kind === 'color' && !b.potted && groupOf(b.color) === oppGroup).length : 0;
				lv.finish({ won: next.winner === HUMAN, score: oppLeft, stat: oppLeft });
			}
			return;
		}
		if (next.turn === me) { // my turn to aim — bring my chosen view back
			if (next.ballInHand === me) { // placing needs the whole table, not a low 3/4 view
				placingRef.current = true; setPlacing(true);
				setView('top');
			} else restoreCam();
			setStat('aiming');
		} else if (onlineRef.current) { // remote opponent shoots — wait for their shot message
			setStat('aiming');
		} else { // local AI opponent
			aiThinkingRef.current = true;
			setStat('aiming');
			window.setTimeout(() => runAiShotRef.current(), 450); // brief think; the warmup strokes add the rest of the beat
		}
	};

	const onSettled = () => { if (eightBallRef.current) resolveShot8(); else resolveShot(); };
	runAiShotRef.current = runAiShot;

	/* ---------- Multiplayer (Libre online, deterministic lockstep) ---------- */
	// Tear down any online session/state WITHOUT laying a table (the caller picks the next mode).
	const resetOnline = () => {
		if (netRef.current) { netRef.current.leave(); netRef.current = null; }
		onlineRef.current = false; startedOnlineRef.current = false;
		remoteAimRef.current = null; remoteStickRef.current.on = false;
		setMpPhase('off'); setMpCode(null); setMpOpp(null); setMpMsg(null);
	};
	const leaveOnline = () => { resetOnline(); newFreeTable(diffKey); }; // back to vs-AI
	// The "En ligne" tab: drop any level/daily/online state, lay a clean Libre table as the backdrop
	// (the online match re-racks on connect; backing out of the menu leaves a consistent Libre game),
	// then open the match menu.
	const enterOnline = () => {
		resetOnline();
		if (lv.active) lv.exit();
		newFreeTable(diffKey);
		setMpMsg(null);
		setMpPhase('menu');
	};

	const startOnlineMatch = () => {
		const net = netRef.current;
		if (!net || startedOnlineRef.current) return;
		startedOnlineRef.current = true;
		onlineRef.current = true;
		eightBallRef.current = true;
		myPlayerRef.current = net.isHost() ? 0 : 1;
		setMpPlayer(myPlayerRef.current);
		setDaily(false);
		lv.exit();
		net.onShot((s) => { // remote fired — replay it on our identical sim
			const m = match8Ref.current;
			if (!m || m.winner !== null || m.turn === myPlayerRef.current) return;
			const cue = ballsRef.current.find((b) => b.kind === 'cue');
			if (!cue) return;
			cue.x = s.px; cue.y = s.py; cue.potted = false; cue.vx = 0; cue.vy = 0;
			if (m.ballInHand != null) { match8Ref.current = { ...m, ballInHand: null }; setMatch8(match8Ref.current); }
			placingRef.current = false; setPlacing(false);
			remoteAimRef.current = null;
			beginStrike(s.vx, s.vy, startShot8); // animate the opponent's stroke too
		});
		net.onAim((a) => { // remote is lining up — show their stick (and their ball-in-hand placing)
			const m = match8Ref.current;
			if (!m || m.winner !== null || m.turn === myPlayerRef.current || rollingRef.current || strikeRef.current) return;
			remoteAimRef.current = { ...a, seen: performance.now() }; // rAF clock — updateScene compares against it
			// Their ball in hand: follow the white ball they are dragging. Cosmetic — the shot message
			// carries the final position, so a lost or late aim can never desync the two tables.
			const cue = ballsRef.current.find((b) => b.kind === 'cue');
			if (cue && m.ballInHand != null && !cue.potted) { cue.x = a.px; cue.y = a.py; }
		});
		layRack(DIFFS.facile, seedFromRoom(net.roomId)); // same rack on both peers
		setMpMsg(null);
		setMpPhase('playing');
	};

	const watchPeers = () => {
		netRef.current?.onPeers((peers) => {
			if (peers.length >= 1) { setMpOpp(peers[0].name); startOnlineMatch(); }
			else if (onlineRef.current) { setMpMsg('Adversaire parti'); }
		});
	};

	const mpQuickMatch = async () => {
		if (!multiplayerAvailable()) { setMpMsg('Multijoueur indisponible'); return; }
		setMpPhase('connecting'); setMpMsg(null); setMpCode(null);
		const net = await joinRandom((playerName() || 'Joueur').slice(0, 16));
		if (!net) { setMpPhase('menu'); setMpMsg('Aucune partie libre, réessaie'); return; }
		netRef.current = net; setMpPhase('waiting'); watchPeers();
	};

	const mpCreateCode = async () => {
		if (!multiplayerAvailable()) { setMpMsg('Multijoueur indisponible'); return; }
		const code = makeCode();
		setMpPhase('connecting'); setMpMsg(null); setMpCode(code);
		const net = await joinByCode((playerName() || 'Joueur').slice(0, 16), code);
		if (!net) { setMpPhase('menu'); setMpMsg('Erreur de connexion'); return; }
		netRef.current = net; setMpPhase('waiting'); watchPeers();
	};

	const mpJoinCode = async () => {
		const code = codeInput.trim().toUpperCase();
		if (!code) return;
		if (!multiplayerAvailable()) { setMpMsg('Multijoueur indisponible'); return; }
		setMpPhase('connecting'); setMpMsg(null); setMpCode(code);
		const net = await joinByCode((playerName() || 'Joueur').slice(0, 16), code);
		if (!net) { setMpPhase('menu'); setMpMsg('Code plein ou invalide'); return; }
		netRef.current = net; setMpPhase('waiting'); watchPeers();
	};

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
		camTauRef.current = CAM_TAU; camMovedRef.current = true; // user is moving the view → respond snappily
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
		if (eightBallRef.current && placingRef.current && cue) {
			// Ball in hand: only a drag STARTED ON the white ball places it. Anywhere else turns the
			// view — you need to look around the table before deciding where to put it.
			const pp = worldFromPointer(clientX, clientY);
			const onCue = cueScreenDist(clientX, clientY, cue) <= GRAB_PX
				|| (pp != null && Math.hypot(pp.x - cue.x, pp.y - cue.y) <= GRAB_R);
			if (onCue) {
				if (pp) moveCueTo(cue, pp);
				placeDragRef.current = true;
			} else {
				panDragRef.current = { x: clientX, y: clientY, panX: panRef.current.x, panZ: panRef.current.z };
			}
			return;
		}
		// In 8-ball you may only aim on your turn (otherwise the drag just moves the view).
		const canAim = !eightBallRef.current
			|| (!!match8Ref.current && match8Ref.current.turn === localPlayer() && match8Ref.current.winner === null && !aiThinkingRef.current);
		const p = worldFromPointer(clientX, clientY);
		const near = cue && (cueScreenDist(clientX, clientY, cue) <= GRAB_PX
			|| (p != null && Math.hypot(p.x - cue.x, p.y - cue.y) <= GRAB_R));
		if (statusRef.current === 'aiming' && canAim && cue && near) {
			aimRef.current = { pull: { x: 0, y: 0 } };
			powerRef.current = 0;
		} else {
			panDragRef.current = { x: clientX, y: clientY, panX: panRef.current.x, panZ: panRef.current.z }; // one finger drags the view
		}
	}, [worldFromPointer, cueScreenDist]);

	const aimMove = useCallback((clientX: number, clientY: number) => {
		if (pinchRef.current) return;
		if (placeDragRef.current) { const cue = cueBall(); const pp = worldFromPointer(clientX, clientY); if (cue && pp) { moveCueTo(cue, pp); streamAim(cue, null); } return; }
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
		streamAim(cue, aimRef.current.pull);
	}, [worldFromPointer, applyPan]);

	const aimEnd = useCallback(() => {
		if (pinchRef.current) return;
		if (placeDragRef.current) { // dropped the ball somewhere — the button below is what validates
			placeDragRef.current = false;
			const moved = cueBall();
			if (moved) streamAim(moved, null, true);
			return;
		}
		if (panDragRef.current) { panDragRef.current = null; return; }
		const aim = aimRef.current;
		aimRef.current = null;
		powerRef.current = 0;
		const released = cueBall();
		if (aim && released) streamAim(released, null, true); // drop the stick on the opponent's screen
		if (!aim || statusRef.current !== 'aiming') return;
		if (eightBallRef.current) { // 8-ball shot — no strokes, no daily tries
			const m = match8Ref.current;
			if (!m || m.turn !== localPlayer() || m.winner !== null || aiThinkingRef.current || placingRef.current) return;
			const v = aimToVelocity(aim.pull);
			if (!v) return;
			const cue = cueBall();
			if (!cue) return;
			if (onlineRef.current) netRef.current?.sendShot({ vx: v.vx, vy: v.vy, px: cue.x, py: cue.y }); // tell the remote (it animates its own strike)
			beginStrike(v.vx, v.vy, startShot8, { back: STICK_MIN + pullPower(aim.pull) * STICK_RANGE });
			return;
		}
		if (daily && startRef.current === 0 && triesRef.current >= MAX_TRIES) return; // out of daily tries
		const v = aimToVelocity(aim.pull);
		if (!v) return;
		const cue = cueBall();
		if (!cue) return;
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
		beginStrike(v.vx, v.vy, () => { rollingRef.current = true; setStat('rolling'); }, { back: STICK_MIN + pullPower(aim.pull) * STICK_RANGE });
	}, [daily, gameId]);

	// Single-pointer aim/orbit via Pointer Events (mouse, touch, pen) — reliable on iOS.
	const { onPointerDown: onAimPointerDown } = usePointerDrag(aimStart, aimMove, aimEnd);

	/* ---------- Zoom (wheel + pinch) and camera cycle ---------- */
	const zoomBy = useCallback((f: number) => {
		camTauRef.current = CAM_TAU; camMovedRef.current = true; // user is adjusting the view → respond snappily
		zoomRef.current = Math.max(1, Math.min(ZOOM_MAX, zoomRef.current * f));
	}, []);

	const cycleCam = useCallback(() => {
		const nv = CAM_NEXT[camModeRef.current];
		userCamRef.current = nv; // remember the player's choice so the action cam can restore it
		setView(nv);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Right-button drag → orbit the view (turn azimuth + tilt pitch), like the two-finger twist on touch.
	const orbitDragRef = useRef<{ x: number; y: number; az: number; pitch: number } | null>(null);
	const onPointerDown = useCallback((e: React.PointerEvent) => {
		sfx.unlock(); // iOS needs a user gesture before any sound can play
		if (pinchRef.current) return;
		if (e.button === 2 || (e.button === 0 && e.altKey)) { // right-click (or Alt+left) rotates
			e.preventDefault();
			orbitDragRef.current = { x: e.clientX, y: e.clientY, az: azRef.current, pitch: pitchRef.current };
			const onMove = (m: PointerEvent) => {
				const o = orbitDragRef.current;
				if (!o) return;
				camTauRef.current = CAM_TAU; camMovedRef.current = true; // user is orbiting → respond snappily
				azRef.current = o.az - (m.clientX - o.x) * ORBIT_PER_PX;
				pitchRef.current = Math.max(MIN_PITCH, Math.min(MAX_PITCH, o.pitch + (m.clientY - o.y) * PITCH_PER_PX));
			};
			const onUp = () => { orbitDragRef.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', onUp);
			return;
		}
		onAimPointerDown(e);
	}, [onAimPointerDown]);

	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomBy(e.deltaY > 0 ? 1 / 1.12 : 1.12); };
		cv.addEventListener('wheel', onWheel, { passive: false });

		// PC: pressing left + right together cancels the shot being aimed, so you can reposition the
		// camera and re-aim. Mouse-button chording fires mousedown reliably (a 2nd pointerdown may not).
		const onMouseDown = (e: MouseEvent) => {
			if ((e.buttons & 1) && (e.buttons & 2) && aimRef.current) {
				aimRef.current = null; powerRef.current = 0;
				setCancelFlash(true); setTimeout(() => setCancelFlash(false), 900);
			}
		};
		cv.addEventListener('mousedown', onMouseDown);

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
			camTauRef.current = CAM_TAU; camMovedRef.current = true; // user is adjusting the view → respond snappily
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
			cv.removeEventListener('mousedown', onMouseDown);
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

	resolveShotRef.current = onSettled; // dispatch to 8-ball or arcade resolution (latest closure)

	/* ---------- Scene update (per frame) ---------- */
	const updateScene = useCallback((now: number) => {
		const g = g3Ref.current;
		if (!g) return;
		const t = tableRef.current, hw = t.w / 2, hh = t.h / 2;
		const balls = ballsRef.current;
		const dt = Math.min(0.1, Math.max(0, (now - lastFrameRef.current) / 1000)) || 1 / 60;
		lastFrameRef.current = now;
		const rollAxis = rollAxisRef.current;
		const alpha = alphaRef.current;

		// Balls (with pot-drop animation). Rolling: spin the mesh about the horizontal axis perpendicular
		// to its velocity by distance/radius, so the number/stripe visibly turns instead of sliding.
		for (let i = 0; i < balls.length; i++) {
			const b = balls[i], mesh = g.ballMeshes[i];
			if (!mesh) continue;
			if (!b.potted) {
				mesh.visible = true;
				const sp = Math.hypot(b.vx, b.vy);
				if (sp > 0.4) { rollAxis.set(b.vy, 0, -b.vx).normalize(); mesh.rotateOnWorldAxis(rollAxis, (sp * dt) / BALL_R); }
				const p = alpha < 1 ? prevPosRef.current[i] : undefined;
				const px = p ? p.x + (b.x - p.x) * alpha : b.x;
				const pz = p ? p.y + (b.y - p.y) * alpha : b.y;
				mesh.position.set(px - hw, BALL_R, pz - hh);
				g.fx.trailPoint(i, px - hw, pz - hh, sp,
					b.kind === 'cue' ? CUE_COLOR : eightBallRef.current ? ball8Hue(b.color) : BALL_COLORS[b.color] ?? 0xffffff);
				continue;
			}
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
		g.aimLine.visible = g.objLine.visible = g.cueLine.visible = g.contact.visible = false;
		if (showAim && aim && cue) {
			const pred = predictCue(balls, t, aim.pull);
			const Y = 0.5;
			const pts: THREE.Vector3[] = [];
			for (let s = 0; s < pred.segs.length; s++) {
				if (s === 0) pts.push(new THREE.Vector3(pred.segs[s].from.x - hw, Y, pred.segs[s].from.y - hh));
				pts.push(new THREE.Vector3(pred.segs[s].to.x - hw, Y, pred.segs[s].to.y - hh));
			}
			if (pts.length >= 2) {
				// Fresh geometry each time: setFromPoints REUSES the old position buffer and only
				// overwrites up to its old vertex count, so a long bank path left stale segments behind
				// when the next aim was a short direct line. Dispose + rebuild sizes it exactly.
				g.aimLine.geometry.dispose();
				g.aimLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
				g.aimLine.computeLineDistances();
				(g.aimLine.material as THREE.LineDashedMaterial).color.setHSL(0.33 * (1 - powerRef.current), 0.95, 0.5); // force gauge: green (soft) → orange → red (max); struck-ball line is blue so no clash
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
				(g.cueLine.material as THREE.LineDashedMaterial).color.copy((g.aimLine.material as THREE.LineDashedMaterial).color); // white-ball path = same power colour before & after contact
				g.cueLine.visible = true;
			}
		}

		// Ball-in-hand: pulse a ring around the cue so it's obvious the player must place it.
		const placing = placingRef.current && cue && !cue.potted;
		g.placeRing.visible = !!placing;
		if (placing && cue) {
			const s = 1 + 0.14 * Math.sin(now * 0.006);
			g.placeRing.position.set(cue.x - hw, 0.4, cue.y - hh);
			g.placeRing.scale.set(s, s, s);
		}

		// Cue stick: follows the aim while you draw back, then swings on the strike (AI adds warmups).
		const placeStick = (cx: number, cy: number, dxw: number, dzw: number, off: number) => {
			// off: 0 = tip on the ball, negative = drawn back, positive = follow-through past contact.
			g.cueStick.position.set((cx - hw) - dxw * (BALL_R - off), BALL_R, (cy - hh) - dzw * (BALL_R - off));
			g.cueStick.rotation.set(0, Math.atan2(dzw, -dxw), 0); // local +X (toward butt) points back up-cue
			g.cueStick.rotateZ(STICK_TILT); // raise the butt so the shaft clears the rails instead of clipping through
			g.cueStick.visible = true;
		};
		const strike = strikeRef.current;
		if (strike) {
			const tt = strike.t0 < 0 ? 0 : now - strike.t0;
			const warmDur = strike.warmups * WARMUP_MS;
			let off: number;
			if (tt < warmDur) { // practice stroke: a small back-and-forth near the ball, never touching it
				const u = (tt % WARMUP_MS) / WARMUP_MS;
				off = -strike.back * (0.22 + 0.5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * u)));
			} else { // real swing: full draw → contact at STRIKE_HIT → follow-through
				const e = Math.min(1, (tt - warmDur) / STRIKE_MS);
				off = e < STRIKE_HIT ? -strike.back * (1 - (e / STRIKE_HIT) ** 2) : STRIKE_FOLLOW * ((e - STRIKE_HIT) / (1 - STRIKE_HIT));
			}
			placeStick(strike.cx, strike.cy, strike.dx, strike.dy, off);
		} else if (aim && cue && statusRef.current === 'aiming' && !placingRef.current) {
			const pm = Math.hypot(aim.pull.x, aim.pull.y);
			if (pm > 1) placeStick(cue.x, cue.y, -aim.pull.x / pm, -aim.pull.y / pm, -(STICK_MIN + pullPower(aim.pull) * STICK_RANGE));
			else g.cueStick.visible = false;
		} else {
			// Online: the opponent's stick, eased toward the last aim message so it glides instead of
			// stepping at the stream rate. It vanishes if their stream goes quiet (tab hidden, drop).
			const r = remoteAimRef.current, st = remoteStickRef.current;
			if (r && r.live && statusRef.current === 'aiming' && now - r.seen < AIM_STALE_MS) {
				if (!st.on) { st.px = r.px; st.py = r.py; st.dx = r.dx; st.dy = r.dy; st.power = r.power; st.on = true; }
				else {
					const k = 1 - Math.exp(-dt / AIM_TAU);
					st.px += (r.px - st.px) * k; st.py += (r.py - st.py) * k;
					st.dx += (r.dx - st.dx) * k; st.dy += (r.dy - st.dy) * k;
					st.power += (r.power - st.power) * k;
				}
				const dm = Math.hypot(st.dx, st.dy) || 1;
				placeStick(st.px, st.py, st.dx / dm, st.dy / dm, -(STICK_MIN + st.power * STICK_RANGE));
			} else {
				st.on = false;
				g.cueStick.visible = false;
			}
		}

		// Free orbit camera: az/pitch/pan/zoom are set by setView() at a situation change and then freely
		// changed by the player — never re-locked per frame. EXCEPTION: while the balls roll, the camera
		// auto-frames the shot (the cue + every ball in motion) so you always see the ball you just hit —
		// panning and zooming to follow the action, not just a static wide shot. The player can still
		// change the viewing ANGLE (right-drag / two-finger) during the roll.
		const f = fitRef.current;
		const pitch = pitchRef.current, az = azRef.current;
		let panX: number, panZ: number, d: number;
		if (statusRef.current === 'rolling') {
			let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, any = false;
			const seen = rollSeenRef.current;
			for (let i = 0; i < balls.length; i++) {
				const b = balls[i];
				if (b.potted) continue;
				if (Math.hypot(b.vx, b.vy) > 1) seen.add(i);
				// The cue + everything this shot set in motion: dropping a ball once it slows down would
				// swing the camera away from where the action just happened.
				if (b.kind !== 'cue' && !seen.has(i)) continue;
				const x = b.x - hw, z = b.y - hh;
				// Where it will be once the camera gets there — clamped to the cloth, a rail sends it back.
				const lx = Math.max(-hw, Math.min(hw, x + b.vx * FOLLOW_LEAD));
				const lz = Math.max(-hh, Math.min(hh, z + b.vy * FOLLOW_LEAD));
				minX = Math.min(minX, x, lx); maxX = Math.max(maxX, x, lx);
				minZ = Math.min(minZ, z, lz); maxZ = Math.max(maxZ, z, lz);
				any = true;
			}
			if (!any) { minX = maxX = minZ = maxZ = 0; }
			panX = (minX + maxX) / 2; panZ = (minZ + maxZ) / 2;
			let bx = Math.max(FOLLOW_MIN_X, (maxX - minX) / 2 + FOLLOW_MARGIN);
			let bz = Math.max(FOLLOW_MIN_Z, (maxZ - minZ) / 2 + FOLLOW_MARGIN);
			// Slow-mo punch-in: once the slow-mo bites, frame just the action — the threatened
			// ball and its pocket (or the two balls about to meet). The smoothing glides in/out.
			const focus = slowFocusRef.current;
			if (focus && slowRef.current < SLOWMO_FOCUS_BELOW) {
				const a = balls[focus.idx], b2 = focus.idx2 != null ? balls[focus.idx2] : null;
				const x1 = (a.potted ? focus.px : a.x) - hw, z1 = (a.potted ? focus.py : a.y) - hh;
				const x2 = (b2 && !b2.potted ? b2.x : focus.px) - hw, z2 = (b2 && !b2.potted ? b2.y : focus.py) - hh;
				panX = (x1 + x2) / 2; panZ = (z1 + z2) / 2;
				bx = Math.max(FOCUS_MIN_X, Math.abs(x2 - x1) / 2 + FOCUS_MARGIN);
				bz = Math.max(FOCUS_MIN_Z, Math.abs(z2 - z1) / 2 + FOCUS_MARGIN);
			}
			d = fitDist(g.camera, bx, bz, pitch, az);
		} else {
			rollSeenRef.current.clear(); // the next shot starts from an empty cast
			d = fitDist(g.camera, f.hx, f.hz, pitch, az) / Math.max(1, zoomRef.current);
			panX = panRef.current.x; panZ = panRef.current.z;
		}
		camEye.set(panX - Math.cos(az) * Math.cos(pitch) * d, Math.sin(pitch) * d, panZ - Math.sin(az) * Math.cos(pitch) * d);
		camLook.set(panX, 0, panZ);
		lastDistRef.current = d;
		const cs = camSmoothRef.current;
		if (!cs.on) { cs.eye.copy(camEye); cs.look.copy(camLook); cs.velEye.set(0, 0, 0); cs.velLook.set(0, 0, 0); cs.on = true; }
		smoothDampV3(cs.eye, camEye, cs.velEye, camTauRef.current, dt); // natural ease-in/out, no jerk on target change
		smoothDampV3(cs.look, camLook, cs.velLook, camTauRef.current, dt);
		g.camera.position.copy(cs.eye);
		g.camera.lookAt(cs.look);
		if (shakeRef.current > 0.02) { // impact shake: raw jitter on top of the smoothing, decaying fast
			const a = shakeRef.current;
			g.camera.position.x += (Math.random() * 2 - 1) * a;
			g.camera.position.y += (Math.random() * 2 - 1) * a * 0.5;
			g.camera.position.z += (Math.random() * 2 - 1) * a;
			shakeRef.current = a * Math.exp(-dt / SHAKE_TAU);
		} else shakeRef.current = 0;

		g.fx.update(dt);
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
			let dt = Math.min(now - lastRef.current, 200);
			lastRef.current = now;
			// Hit-stop: a hard contact freezes the SIMULATION clock for a few frames (the camera and
			// FX keep breathing on real time). The engine itself never skips or scales a step, so
			// lockstep peers still compute the exact same shot.
			if (hitStopRef.current > 0) { hitStopRef.current -= dt; dt = 0; }
			// Slow motion when a ball bears down on a pocket: only SIM time dilates (camera and FX
			// keep real time), so lockstep peers still compute the exact same shot.
			let slowTarget = 1;
			if (rollingRef.current) {
				let bestSc = 2; // the deepest trigger this frame owns the camera focus
				const engage = (sc: number, holdMs: number, focus: { idx: number; idx2?: number; px: number; py: number }) => {
					const hold = slowHoldRef.current;
					if (hold.ms <= 0) slowBornRef.current++;
					hold.ms = Math.max(hold.ms, holdMs);
					hold.scale = Math.min(hold.scale, sc);
					slowTarget = Math.min(slowTarget, sc);
					if (sc < bestSc) { bestSc = sc; slowFocusRef.current = focus; }
				};
				const balls = ballsRef.current;
				// Anticipation: the shot's first ball contact, seen SLOWMO_TTI ahead when it will be hard.
				// The window widens to this frame's sim span, so a coarse frame can't jump past the contact.
				const look = Math.max(SLOWMO_TTI, dt / 1000);
				if (!contactSeenRef.current) {
					const cue = balls.find((b) => b.kind === 'cue');
					if (cue && !cue.potted) {
						for (let i = 0; i < balls.length; i++) {
							const c = balls[i];
							if (c === cue || c.potted) continue;
							const rx = cue.x - c.x, ry = cue.y - c.y;
							const vx = cue.vx - c.vx, vy = cue.vy - c.vy;
							const v2 = vx * vx + vy * vy;
							if (v2 < SLOWMO_HIT_SPEED * SLOWMO_HIT_SPEED) continue;
							const bq = 2 * (rx * vx + ry * vy);
							if (bq >= 0) continue; // moving apart
							const disc = bq * bq - 4 * v2 * (rx * rx + ry * ry - 4 * BALL_R * BALL_R);
							if (disc <= 0) continue; // will miss
							const tti = (-bq - Math.sqrt(disc)) / (2 * v2);
							if (tti > 0 && tti < look) {
								if (slowHoldRef.current.ms <= 0) slowHitBornRef.current++;
								engage(SLOWMO_HIT, SLOWMO_HOLD_HIT, { idx: balls.indexOf(cue), idx2: i, px: c.x, py: c.y });
							}
						}
					}
				}
				// Pocket threat: mild at the engage range, ramping to its deepest right at the mouth.
				for (let i = 0; i < balls.length; i++) {
					const b = balls[i];
					if (b.potted) continue;
					const sp = Math.hypot(b.vx, b.vy);
					if (sp < SLOWMO_MIN_SPEED) continue;
					for (const p of t.pockets) {
						const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
						if (d > p.r * SLOWMO_RANGE || d < 1e-3) continue;
						if ((b.vx * dx + b.vy * dy) / (sp * d) < SLOWMO_AIM) continue;
						const near = eightBallRef.current && b.kind !== 'cue' && b.color === 8 ? SLOWMO_NEAR_8 : SLOWMO_NEAR;
						const prox = Math.max(0, Math.min(1, (d - p.r) / (p.r * (SLOWMO_RANGE - 1))));
						engage(near + (SLOWMO_FAR - near) * prox, SLOWMO_HOLD, { idx: i, px: p.anchor.x, py: p.anchor.y });
					}
				}
			}
			const hold = slowHoldRef.current;
			if (hold.ms > 0) { hold.ms -= dt; slowTarget = Math.min(slowTarget, hold.scale); }
			else { hold.scale = 1; slowFocusRef.current = null; }
			const tau = slowTarget < slowRef.current ? SLOWMO_TAU_IN : SLOWMO_TAU_OUT;
			slowRef.current += (slowTarget - slowRef.current) * Math.min(1, dt / tau);
			if (slowRef.current > 0.995) slowRef.current = 1;
			sfx.setRate(0.55 + 0.45 * slowRef.current); // impacts pitch down with the slow-mo
			const realDt = dt;
			dt *= slowRef.current;
			// The chrono must not pay for the cinematics: push the start epoch by the skipped time.
			if (startRef.current && !finishedRef.current) startRef.current += realDt - dt;
			// Cue-strike swing: optional AI practice strokes, then thrust; release the ball at contact.
			const strike = strikeRef.current;
			if (strike) {
				if (strike.t0 < 0) strike.t0 = now;
				const tt = now - strike.t0;
				const warmDur = strike.warmups * WARMUP_MS;
				const fireAt = warmDur + STRIKE_HIT * STRIKE_MS;
				if (!strike.fired && tt >= fireAt) {
					strike.fired = true;
					sfx.cueStrike(Math.hypot(strike.vx, strike.vy));
					contactSeenRef.current = false; // a fresh shot: anticipation armed again
					slowFocusRef.current = null;
					const cue = ballsRef.current.find((b) => b.kind === 'cue');
					if (cue) { cue.vx = strike.vx; cue.vy = strike.vy; }
					strike.release();
				}
				if (tt >= warmDur + STRIKE_MS) strikeRef.current = null;
			}
			accRef.current += dt;
			while (accRef.current >= STEP) {
				accRef.current -= STEP;
				if (rollingRef.current) {
					const bs = ballsRef.current, pp = prevPosRef.current;
					if (pp.length !== bs.length) prevPosRef.current = bs.map((b) => ({ x: b.x, y: b.y }));
					else for (let i = 0; i < bs.length; i++) { pp[i].x = bs[i].x; pp[i].y = bs[i].y; }
					const imps = impactsRef.current;
					imps.length = 0;
					const r = stepBalls(ballsRef.current, t, STEP / 1000, imps);
					for (const im of imps) onImpact(im, now);
					if (eightBallRef.current) { // accumulate the shot for the 8-ball rules
						const acc = shotAccRef.current;
						if (r.firstHit !== null && !acc.contactSeen) { acc.contactSeen = true; acc.firstHitNumber = r.firstHit; }
						if (r.railHit && acc.contactSeen) acc.railAfterContact = true;
						if (r.pottedColors.length) acc.potted.push(...r.pottedColors);
						if (r.scratched) acc.scratched = true;
					}
					if (isSettled(ballsRef.current)) {
						rollingRef.current = false;
						// isSettled tolerates a crawl (speed < SETTLE), so a ball can end the shot with
						// leftover velocity. The physics stops but the mesh spin reads that velocity —
						// the ball would keep turning on the spot forever. Park them for real.
						for (const b of ballsRef.current) { b.vx = 0; b.vy = 0; }
						resolveShotRef.current();
					}
				}
			}
			// Only the roll is interpolated: aiming and ball-in-hand move the cue outside the fixed step.
			alphaRef.current = rollingRef.current ? accRef.current / STEP : 1;
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

	// Read-only state snapshot for the Playwright smoke check (harmless).
	useEffect(() => {
		const w = window as unknown as { __billard?: () => unknown };
		w.__billard = () => ({
			n: ballsRef.current.length,
			potted: ballsRef.current.filter((b) => b.potted).length,
			match8: match8Ref.current,
			status: statusRef.current,
			rolling: rollingRef.current,
			moving: ballsRef.current.filter((b) => !b.potted && Math.hypot(b.vx, b.vy) > 0.2).length,
			aiming: !!aimRef.current,
			strokes: strokesRef.current,
			eightBall: eightBallRef.current,
			online: onlineRef.current,
			myPlayer: myPlayerRef.current,
			camMode: camModeRef.current,
			placing: placingRef.current,
			remoteAim: remoteAimRef.current,
			stickVisible: !!g3Ref.current?.cueStick.visible,
			fx: g3Ref.current ? { ...g3Ref.current.fx.stats(), maxImpact: maxImpactRef.current } : null,
			slow: { born: slowBornRef.current, bornHit: slowHitBornRef.current, scale: +slowRef.current.toFixed(3), focus: !!slowFocusRef.current, camDist: +lastDistRef.current.toFixed(1) },
			skin: skinRef.current,
			sound: sfx.stats(),
			frame: (() => { // how the balls sit in the frame — the smoke test samples this while they roll
				const g = g3Ref.current, t = tableRef.current;
				if (!g) return { out: 0, edge: 0, movingOut: 0, movingEdge: 0 };
				let out = 0, edge = 0, movingOut = 0, movingEdge = 0;
				for (const b of ballsRef.current) {
					if (b.potted) continue;
					const v = new THREE.Vector3(b.x - t.w / 2, BALL_R, b.y - t.h / 2).project(g.camera);
					const e = Math.max(Math.abs(v.x), Math.abs(v.y)); // 1 = the frame edge
					if (e > 1) out++;
					if (e > edge) edge = e;
					if (b.kind !== 'cue' && Math.hypot(b.vx, b.vy) <= 1) continue;
					if (e > 1) movingOut++;
					if (e > movingEdge) movingEdge = e;
				}
				return { out, edge, movingOut, movingEdge };
			})(),
			pocketScreens: (() => { // client x,y of the pocket mouths (smoke tests aim at them)
				const g = g3Ref.current, cv = canvasRef.current;
				if (!g || !cv) return null;
				const r = cv.getBoundingClientRect(), t = tableRef.current;
				return t.pockets.map((p) => {
					const v = new THREE.Vector3(p.anchor.x - t.w / 2, 0, p.anchor.y - t.h / 2).project(g.camera);
					return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
				});
			})(),
			cueScreen: (() => { // the cue's client x,y (for the smoke test to aim precisely)
				const g = g3Ref.current, cv = canvasRef.current, cue = ballsRef.current.find((b) => b.kind === 'cue');
				if (!g || !cv || !cue) return null;
				const r = cv.getBoundingClientRect();
				const v = new THREE.Vector3(cue.x - tableRef.current.w / 2, BALL_R, cue.y - tableRef.current.h / 2).project(g.camera);
				return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
			})(),
		});
		return () => { delete w.__billard; netRef.current?.leave(); netRef.current = null; };
	}, []);

	const dailyMode = daily && !lv.active;
	const triesLeft = MAX_TRIES - tries;
	const myIdx = mpPhase === 'playing' ? mpPlayer : HUMAN; // whose winner state means "me"
	const oppLabel = mpPhase === 'playing' ? `👤 ${mpOpp || 'Adversaire'}`
		: lv.active ? `🤖 IA ${Math.round(billardLevels.config(lv.level).skill * 100)}%`
		: `🤖 IA ${Math.round((AI_SKILL[diffKey] ?? 0.6) * 100)}%`;
	const myTurn = !!match8 && match8.winner == null && match8.turn === myIdx;
	const oppTurn = !!match8 && match8.winner == null && match8.turn !== myIdx;
	const exhausted = dailyMode && triesLeft <= 0;
	// 8-ball = everything except Défi (daily). Libre + Niveaux are 8-ball.
	const is8 = !daily;
	const myGroup: Group | null = match8?.groups[HUMAN] ?? null;
	const colorLeft = ballsRef.current.filter((b) => b.kind === 'color' && !b.potted);
	const myLeft = myGroup ? colorLeft.filter((b) => groupOf(b.color) === myGroup).length : 0;
	// Group cleared → only the 8 left to pot (correct for the local player, incl. online player 1).
	const meGroup: Group | null = match8?.groups[myIdx] ?? null;
	const meLeft = meGroup ? colorLeft.filter((b) => groupOf(b.color) === meGroup).length : 0;
	const onBlack = is8 && !!match8 && match8.winner == null && !match8.open && !!meGroup && meLeft === 0;
	const eightWin = is8 && !lv.active && match8?.winner != null; // Libre card; Niveaux uses LevelOutcome
	const restartLabel = lv.active ? 'Recommencer le niveau'
		: is8 ? 'Nouvelle partie'
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
							onFree={() => { if (mpPhase !== 'off') leaveOnline(); else if (lv.active) { lv.exit(); newFreeTable(diffKey); } else if (daily) newFreeTable(diffKey); }}
							onDaily={() => { resetOnline(); lv.exit(); startDaily(); }}
							showLevels
							levelsActive={lv.active}
							onLevels={() => { resetOnline(); armLevels(); }}
							showOnline
							onlineActive={mpPhase !== 'off'}
							onOnline={enterOnline}
						/>
					</div>
					<div className="bi-stats">
						{is8 ? (
							<>
								{/* No "whose turn" pill: the vs bar below highlights it and the hand-over card announces it. */}
								{match8?.winner != null && <span className="bi-stat">{match8.winner === myIdx ? '🏆 Gagné' : '❌ Perdu'}</span>}
								{lv.active && !lv.menu && <span className="bi-stat">🎯 Niveau {lv.level}</span>}
								<span className="bi-stat">{match8?.open ? 'Table ouverte' : `${groupLabel(myGroup)} · ${myLeft}`}</span>
							</>
						) : (
							<>
								<span className="bi-stat">🎱 {strokes}</span>
								<span className="bi-stat">🎯 {remaining}</span>
								<span className="bi-stat">⏱ <span className="chrono">{fmtTime(elapsed)}</span></span>
							</>
						)}
					</div>
					<div className="bi-hud-actions">
						{is8 && !lv.active && mpPhase === 'off' && diffKeys(DIFFS, gameId).map((k) => (
							<button key={k} className={`bi-pill ${diffKey === k ? 'active' : ''}`} onClick={() => newFreeTable(k)} title="Force de l’IA">{DIFFS[k].label}</button>
						))}
						{mpPhase === 'playing' && (
							<button className="bi-act" onClick={leaveOnline} aria-label="Quitter la partie en ligne" title="Quitter la partie en ligne">🚪</button>
						)}
						<button
							className="bi-act"
							onClick={() => { const on = !sound; sfx.setEnabled(on); setSound(on); }}
							aria-pressed={sound}
							aria-label="Son"
							title={sound ? 'Couper le son' : 'Activer le son'}
						>{sound ? '🔊' : '🔇'}</button>
						<button className="bi-act" onClick={cycleCam} aria-label="Changer de vue" title="Changer de vue">{CAM_LABEL[camMode]}</button>
						{hasTheme('billard-tron') && (
							<button
								className="bi-act"
								onClick={() => applySkin(skin === 'tron' ? 'classic' : 'tron')}
								aria-pressed={skin === 'tron'}
								aria-label="Thème néon"
								title={skin === 'tron' ? 'Repasser en table classique' : 'Activer le thème néon'}
							>🌌</button>
						)}
						{!lv.menu && mpPhase !== 'playing' && mpPhase !== 'waiting' && mpPhase !== 'connecting' && (
							<button
								className="bi-act"
								onClick={restart}
								disabled={exhausted}
								aria-label={restartLabel}
								title={restartLabel}
							>↻</button>
						)}
					</div>
					{is8 && match8 && (
						<div className="bi-vs">
							<span className={`bi-vs-p ${myTurn ? 'on' : ''}`}>😎 Toi</span>
							<span className="bi-vs-mid">{match8.winner != null ? '🏁' : 'vs'}</span>
							<span className={`bi-vs-p ${oppTurn ? 'on' : ''}`}>{oppLabel}</span>
						</div>
					)}
				</div>
				{dailyMode && (
					<div className="bi-daily-tag bi-daily-hud">
						{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label} · Essai ${Math.min(Math.max(tries, 1), MAX_TRIES)}/${MAX_TRIES}`}
					</div>
				)}
				{/* Only what nothing else on screen says: the AI strength is on the vs bar, the level and the
				    group on their own pills — so this line is just what happened on the last shot. */}
				{is8 && match8 && match8.winner == null && !lv.menu && (match8.lastFoul || match8.lastEvent) && (
					<div className="bi-daily-tag bi-daily-hud">{match8.lastFoul || match8.lastEvent}</div>
				)}
				{onBlack && <div className="bi-daily-tag bi-daily-hud bi-onblack">🎱 Plus que la noire à rentrer !</div>}
			</div>

			<div className="bi-playwrap" ref={wrapRef}>
				{celebrating && !lv.active && (!is8 || match8?.winner === HUMAN) && <Celebration />}
				<canvas
					ref={canvasRef}
					className="bi-canvas"
					onPointerDown={onPointerDown}
					onContextMenu={(e) => e.preventDefault()}
				/>

				{webglError && (
					<div className="bi-overlay">
						<div className="bi-overlay-card">Ton appareil ne peut pas afficher la table 3D (WebGL indisponible).</div>
					</div>
				)}

				{scratchFlash && <div className="bi-scratch">{is8 ? (match8?.lastFoul ?? 'Faute') : 'Pénalité · +1 coup'}</div>}
				{cancelFlash && <div className="bi-scratch bi-cancel">Tir annulé</div>}
				{turnFlash && (
					<div className={`bi-turnflash ${turnFlash.mine ? 'mine' : ''} ${turnFlash.sub ? 'long' : ''}`}>
						<span className="bi-turnflash-title">{turnFlash.title}</span>
						{turnFlash.sub && <span className="bi-turnflash-sub">{turnFlash.sub}</span>}
					</div>
				)}
				{is8 && placing && (
					<>
						<div className="bi-place">
							<span className="bi-place-icon">✋</span>
							<span className="bi-place-title">Bille en main</span>
							<span className="bi-place-sub">glisse la blanche · ailleurs, tu tournes la vue</span>
						</div>
						<button className="bi-placeok" onClick={confirmPlacement}>✓ Je place ici</button>
					</>
				)}

				{/* Arcade win card (Défi only; free mode is 8-ball). */}
				{status === 'won' && daily && (
					<div className="bi-overlay">
						<div className="bi-overlay-card">
							🎉 Gagné en <strong>{strokes} coups</strong> · {fmtTime(elapsed)}
							{exhausted ? <span className="bi-spent">Défi terminé pour aujourd'hui</span> : (
								<button className="bi-replay" onClick={restart}>{`Rejouer la table (${triesLeft} restant${triesLeft > 1 ? 's' : ''})`}</button>
							)}
						</div>
					</div>
				)}

				{/* 8-ball win/loss card (Libre — vs AI or online). */}
				{eightWin && (
					<div className="bi-overlay">
						<div className="bi-overlay-card">
							{match8?.winner === myIdx ? '🏆 Tu as gagné !' : (mpPhase === 'playing' ? '❌ L’adversaire gagne' : '❌ L’ordinateur gagne')}
							{mpPhase === 'playing'
								? <button className="bi-replay" onClick={leaveOnline}>Quitter</button>
								: <button className="bi-replay" onClick={() => newFreeTable(diffKey)}>Nouvelle partie</button>}
						</div>
					</div>
				)}

				{/* Multiplayer menu / connection. */}
				{is8 && (mpPhase === 'menu' || mpPhase === 'connecting' || mpPhase === 'waiting') && (
					<div className="bi-overlay">
						<div className="bi-overlay-card bi-mp">
							{mpPhase === 'menu' ? (
								<>
									<div className="bi-mp-title">Jouer en ligne</div>
									<button className="bi-replay" onClick={mpQuickMatch}>⚡ Partie rapide</button>
									<button className="bi-replay" onClick={mpCreateCode}>🔑 Créer un code ami</button>
									<div className="bi-mp-join">
										<input value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 4))} maxLength={4} placeholder="CODE" aria-label="Code ami" />
										<button className="bi-replay" onClick={mpJoinCode}>Rejoindre</button>
									</div>
									{mpMsg && <span className="bi-spent">{mpMsg}</span>}
									<button className="bi-act" onClick={() => setMpPhase('off')}>Retour</button>
								</>
							) : (
								<>
									<div className="bi-mp-title">{mpPhase === 'connecting' ? 'Connexion…' : 'En attente d’un joueur…'}</div>
									{mpCode && <div className="bi-mp-code">Code : <strong>{mpCode}</strong></div>}
									{mpMsg && <span className="bi-spent">{mpMsg}</span>}
									<button className="bi-act" onClick={leaveOnline}>Annuler</button>
								</>
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
						detail={lv.won ? 'Victoire sur l’ordinateur' : 'Battu par l’ordinateur'}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
			</div>

			<p className="bi-help">
				Glisse depuis la boule blanche puis relâche : tu tires dans le sens opposé, plus tu tires loin plus
				c'est puissant. La ligne pointillée montre le trajet de la blanche — sa couleur va du vert (doux) à l'orange (fort) selon la force —, la ligne bleue celle de la bille visée. 1 doigt ailleurs déplace la vue, 2 doigts (ou clic droit sur PC) pour pivoter et incliner, molette ou pincement pour zoomer, 🎥 pour changer d'angle. Sur PC, clic gauche + droit ensemble annule le tir en préparation.
				{is8 ? ' 8-ball vs l\'ordinateur : empoche ton groupe (pleines ou rayées) puis la noire en dernier. Les pastilles règlent la force de l\'IA.'
					: lv.active ? ' Moins tu joues de coups, plus tu gagnes d\'étoiles.'
					: ` Même table pour tous · ${MAX_TRIES} essais · le chrono départage les ex æquo.`}
			</p>

			{daily && !lv.active && <Leaderboard
				key={`lb-${best ?? 0}`}
				game={`${gameId}-t`}
				metric="time"
				submitValue={status === 'won' && best != null ? best : undefined}
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
/* Site global fullscreen: fullscreen means the TABLE is fullscreen. Drop the page padding and
   float the HUD over the cloth — the bar itself is tap-through, only its pills catch a finger,
   so an aim drag started anywhere between them still reaches the canvas. */
.game-page.gf-full:has(.bi-root) { padding: 0; }
.game-page.gf-full .bi-root { max-width: none; width: 100%; height: 100%; }
.game-page.gf-full .bi-help { display: none; }
.game-page.gf-full .bi-playwrap { flex: 1; aspect-ratio: auto; border-radius: 0; box-shadow: none; }
.game-page.gf-full .bi-hud-top { padding-right: 122px; align-items: center; gap: 6px; }
.game-page.gf-full .bi-hud-top > * { pointer-events: auto; }
/* Fullscreen means the table is the interface: drop the mode tabs (they only leave the game, and
   they collide with the Quitter button) and shrink the rest so it costs one thin line of cloth. */
.game-page.gf-full .bi-modetoggle { display: none; }
.game-page.gf-full .bi-vs { order: -1; margin-top: 0; }
/* Controls go to the bottom corner, where a thumb is: the top edge then carries information only. */
.game-page.gf-full .bi-hud-actions {
  position: fixed; z-index: 4; max-width: 45vw;
  right: max(8px, env(safe-area-inset-right)); bottom: max(10px, env(safe-area-inset-bottom));
}
.game-page.gf-full .bi-stat,
.game-page.gf-full .bi-vs-p { font-size: 12px; padding: 4px 10px; }
.game-page.gf-full .bi-act { font-size: 14px; padding: 4px 10px; min-width: 32px; }
.game-page.gf-full .bi-pill { font-size: 12px; padding: 4px 10px; }
.game-page.gf-full .bi-daily-hud { font-size: 12px; padding: 4px 12px; max-width: 96%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* HUD stacked above the table: on a phone an overlaid banner covers the cushion
   and swallows the drag that aims the shot. */
.bi-topbar { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 10px; }
.bi-hud-top { width: 100%; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; flex-wrap: wrap; pointer-events: none; }
.bi-hud-top > * { pointer-events: auto; }
/* Niveaux / Défi / Libre toggle — always visible so modes (and multiplayer, in Libre) are reachable
   without going fullscreen. The topbar wraps on narrow screens. */
.bi-modetoggle { display: block; }
.bi-hud-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.bi-daily-hud { background: rgba(20,14,10,0.6); color: #f0e6da; font-size: 12.5px; font-weight: 500; padding: 5px 14px; border-radius: 999px; margin: 0; backdrop-filter: blur(4px); pointer-events: none; }

/* Windowed, the HUD is a bar ABOVE the table, in flow. In fullscreen it floats over the top of
   the cloth so no pixel of screen is spent on chrome; the notch/rounded corners are respected. */
.game-page.gf-full .bi-topbar {
  position: absolute; inset: 0 0 auto 0; margin: 0; z-index: 3; gap: 6px; pointer-events: none;
  padding: max(6px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left));
}
.game-page.gf-full .bi-topbar > * { pointer-events: none; }

.bi-stats { display: flex; gap: 6px; font-weight: 700; font-size: 13px; flex-wrap: wrap; }
.bi-stat { background: rgba(20,14,10,0.6); color: #f4ece2; border-radius: 999px; padding: 5px 11px; backdrop-filter: blur(4px); box-shadow: 0 1px 3px rgba(0,0,0,0.35); font-variant-numeric: tabular-nums; }

.bi-pill { border: 1.5px solid rgba(255,255,255,0.28); background: rgba(20,14,10,0.55); color: #f0e6da; font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; backdrop-filter: blur(4px); transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition); }
.bi-pill.active { background: var(--bi-accent); color: var(--accent-text-over); border-color: var(--bi-accent); }
.bi-act { border: 1.5px solid rgba(255,255,255,0.28); background: rgba(20,14,10,0.55); color: #f0e6da; font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 6px 12px; min-width: 36px; cursor: pointer; backdrop-filter: blur(4px); }
.bi-act:hover:not(:disabled) { border-color: var(--bi-accent); color: #fff; }
.bi-act:disabled { opacity: 0.45; cursor: not-allowed; }

.bi-scratch { position: absolute; bottom: 104px; left: 50%; transform: translateX(-50%); z-index: 3; background: #d9534f; color: #fff; font-weight: 700; font-size: 13px; padding: 6px 14px; border-radius: 999px; box-shadow: var(--shadow-md); text-align: center; max-width: 90%; }
.bi-cancel { background: rgba(20,14,10,0.82); }
.bi-onblack { background: linear-gradient(180deg, #2b2b2f, #111114); color: #ffe08a; font-weight: 800; border: 1px solid rgba(255,224,138,0.5); }
/* Hand-over card: slides in, holds, slides out on its own — the JS timer only unmounts it. */
.bi-turnflash { position: absolute; top: 42%; left: 50%; transform: translate(-50%, -50%); z-index: 5; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 13px 28px; border-radius: 18px; text-align: center; color: #fff; background: linear-gradient(180deg, rgba(24,18,14,0.94), rgba(16,11,8,0.9)); border: 2px solid rgba(255,255,255,0.16); box-shadow: var(--shadow-lg); pointer-events: none; animation: bi-turn-card 1.5s cubic-bezier(0.2, 0.9, 0.25, 1) forwards; }
.bi-turnflash.mine { background: linear-gradient(180deg, rgba(48,209,88,0.96), rgba(24,140,60,0.96)); border-color: rgba(255,255,255,0.4); }
.bi-turnflash.long { animation-duration: 2.4s; }
.bi-turnflash-title { font-family: var(--font-brand); font-weight: 800; font-size: 20px; }
.bi-turnflash-sub { font-weight: 700; font-size: 14px; opacity: 0.95; }
@keyframes bi-turn-card {
  0% { opacity: 0; transform: translate(-50%, -50%) translateX(-70px) scale(0.9); }
  14% { opacity: 1; transform: translate(-50%, -50%) translateX(0) scale(1.07); }
  24% { transform: translate(-50%, -50%) scale(1); }
  78% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) translateX(70px) scale(0.94); }
}
@media (prefers-reduced-motion: reduce) { .bi-turnflash { animation: bi-turn-fade 1.5s linear forwards; } @keyframes bi-turn-fade { 0%, 100% { opacity: 0; } 10%, 85% { opacity: 1; } } }
/* One flat pill on the bottom edge: placing happens on the cloth, so the banner must not sit on it,
   and the top belongs to the HUD once fullscreen overlays it. */
.bi-place { position: absolute; left: 50%; bottom: 62px; transform: translateX(-50%); z-index: 4; display: flex; flex-direction: row; align-items: baseline; gap: 7px; text-align: center; max-width: 92%; padding: 5px 14px; border-radius: 999px; background: linear-gradient(180deg, rgba(48,209,88,0.94), rgba(30,150,60,0.94)); color: #fff; box-shadow: var(--shadow-md); animation: bi-place-pop 1.6s ease-in-out infinite; pointer-events: none; }
.bi-place-icon { font-size: 14px; line-height: 1; }
.bi-place-title { font-weight: 800; font-size: 13px; }
.bi-place-sub { font-weight: 600; font-size: 12px; opacity: 0.9; }
/* Sits under the info pill, thumb height: nothing else validates the placement. */
.bi-placeok { position: absolute; left: 50%; bottom: max(12px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 5; border: 2px solid rgba(255,255,255,0.5); background: linear-gradient(180deg, #30d158, #1e963c); color: #fff; font: inherit; font-weight: 800; font-size: 15px; padding: 9px 22px; border-radius: 999px; cursor: pointer; box-shadow: var(--shadow-md); }
.bi-placeok:hover { filter: brightness(1.08); }
@keyframes bi-place-pop { 0%, 100% { transform: translateX(-50%) scale(1); } 50% { transform: translateX(-50%) scale(1.04); } }

.bi-mp { min-width: 240px; gap: 10px; }
.bi-mp-title { font-family: var(--font-brand); font-weight: 700; font-size: 17px; }
.bi-mp-join { display: flex; gap: 6px; width: 100%; }
.bi-mp-join input { flex: 1; min-width: 0; text-align: center; letter-spacing: 3px; text-transform: uppercase; font: inherit; font-weight: 700; border-radius: 999px; border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0); padding: 8px 10px; }
.bi-mp-code { font-size: 15px; color: var(--gray-100); }
.bi-mp-code strong { font-size: 22px; letter-spacing: 4px; color: var(--bi-accent); }

.bi-vs { display: flex; align-items: center; gap: 8px; justify-content: center; margin-top: 2px; pointer-events: none; flex-wrap: wrap; }
.bi-vs-p { background: rgba(20,14,10,0.6); color: #e8ddcf; font-weight: 700; font-size: 13px; padding: 5px 13px; border-radius: 999px; backdrop-filter: blur(4px); border: 1.5px solid transparent; box-shadow: 0 1px 3px rgba(0,0,0,0.35); transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition); }
.bi-vs-p.on { background: var(--bi-accent); color: var(--accent-text-over); border-color: var(--bi-accent); box-shadow: 0 0 12px color-mix(in srgb, var(--bi-accent) 70%, transparent); }
.bi-vs-mid { color: #d8cbb8; font-size: 11px; font-weight: 700; opacity: 0.75; }

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
