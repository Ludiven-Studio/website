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
const fmtTime = (s: number) => fmtCentis(Math.round(s * 100));
const BALL_COLORS = [0xff3b30, 0x0a84ff, 0xffd60a, 0x30d158, 0xbf5af2];
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
const AIM_Y = 0.5;
const HALF_SPAN = 24; // ortho half-view; the corridor is larger → camera follows the ball
const LOOK = 0.22; // camera look-ahead (× ball velocity)
const ARROW_MAX = 13; // arrow length (units) at full power
const ARC_SPAN = 1.1; // angular width of the pull arc (rad)
const GRAB_R = 4.5; // touch within this of the ball to aim; farther = pan the camera

interface Ghost {
	mesh: THREE.Mesh;
	cur: { x: number; z: number };
	target: { x: number; z: number };
}
interface Mats {
	ground: THREE.MeshStandardMaterial;
	floor: THREE.MeshStandardMaterial;
	wall: THREE.MeshStandardMaterial;
	cup: THREE.MeshBasicMaterial;
	ring: THREE.MeshBasicMaterial;
	flag: THREE.MeshBasicMaterial;
	green: THREE.MeshBasicMaterial;
	greenLine: THREE.MeshBasicMaterial;
	relief: THREE.MeshBasicMaterial;
	reliefArrow: THREE.MeshBasicMaterial;
	water: THREE.MeshBasicMaterial;
	rock: THREE.MeshStandardMaterial;
}
interface Scene3D {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.OrthographicCamera;
	ball: THREE.Mesh;
	ballRing: THREE.Mesh; // "touch here to aim" hint around the ball
	holeGroup: THREE.Group;
	aimArc: THREE.Line;
	aimArrow: THREE.Mesh;
	mats: Mats;
	disposables: { dispose: () => void }[];
}

const stripGeom = (pos: number[]): THREE.BufferGeometry => {
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.computeVertexNormals();
	return g;
};

function buildArrowGeom(): THREE.BufferGeometry {
	const y = AIM_Y;
	const pos: number[] = [];
	const sh = 0.09;
	pos.push(0, y, -sh, 0.78, y, -sh, 0.78, y, sh);
	pos.push(0, y, -sh, 0.78, y, sh, 0, y, sh);
	pos.push(0.72, y, -0.26, 1.0, y, 0, 0.72, y, 0.26);
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	return g;
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
	const { path } = hole;
	const W = hole.widths;
	const cut = hole.cutIdx;

	// Altitude → colour ramp (dark green = low, light green = high).
	const altMin = Math.min(...hole.alt), altMax = Math.max(...hole.alt);
	const altRange = altMax - altMin || 1;
	const col = (a: number): [number, number, number] => {
		const tt = Math.max(0, Math.min(1, (a - altMin) / altRange));
		return [0.16 + tt * 0.44, 0.42 + tt * 0.48, 0.26 + tt * 0.4];
	};
	// Banked turns: the two edges sit at different heights → different shades.
	const bankVis = 4;
	const cL = (i: number) => col(hole.alt[i] - bankVis * hole.bank[i]);
	const cR = (i: number) => col(hole.alt[i] + bankVis * hole.bank[i]);

	// Lane floor (per-sample width), vertex-coloured by altitude + banking, up to the green.
	const fpos: number[] = [], fcol: number[] = [];
	for (let i = 0; i < cut; i++) {
		const p = path[i], q = path[i + 1], wi = W[i], wj = W[i + 1];
		const lp = [p.x + p.nx * wi, p.z + p.nz * wi], rp = [p.x - p.nx * wi, p.z - p.nz * wi];
		const lq = [q.x + q.nx * wj, q.z + q.nz * wj], rq = [q.x - q.nx * wj, q.z - q.nz * wj];
		const cLi = cL(i), cRi = cR(i), cLj = cL(i + 1), cRj = cR(i + 1);
		fpos.push(lp[0], 0, lp[1], rp[0], 0, rp[1], lq[0], 0, lq[1]);
		fcol.push(...cLi, ...cRi, ...cLj);
		fpos.push(rp[0], 0, rp[1], rq[0], 0, rq[1], lq[0], 0, lq[1]);
		fcol.push(...cRi, ...cRj, ...cLj);
	}
	const fgeom = new THREE.BufferGeometry();
	fgeom.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
	fgeom.setAttribute('color', new THREE.Float32BufferAttribute(fcol, 3));
	fgeom.computeVertexNormals();
	grp.add(new THREE.Mesh(fgeom, mats.floor));

	// Decorative water stream + plank bridge over a narrow section.
	if (hole.water) {
		const w = hole.water;
		const wp: number[] = [];
		wp.push(w[0].x, -0.03, w[0].z, w[1].x, -0.03, w[1].z, w[2].x, -0.03, w[2].z);
		wp.push(w[0].x, -0.03, w[0].z, w[2].x, -0.03, w[2].z, w[3].x, -0.03, w[3].z);
		grp.add(new THREE.Mesh(stripGeom(wp), mats.water));
	}
	if (hole.bridge) {
		const { lo, hi } = hole.bridge;
		const archY = (i: number) => {
			const u = Math.max(0, Math.min(1, (i - lo) / (hi - lo)));
			return 0.1 + 3.2 * Math.sin(u * Math.PI) * 0.32; // matches the altitude hump
		};
		const bp: number[] = [], bcol: number[] = [];
		for (let i = Math.max(0, lo); i < Math.min(cut, hi); i++) {
			const p = path[i], q = path[i + 1], wi = W[i] + 0.3, wj = W[i + 1] + 0.3;
			const lp = [p.x + p.nx * wi, p.z + p.nz * wi], rp = [p.x - p.nx * wi, p.z - p.nz * wi];
			const lq = [q.x + q.nx * wj, q.z + q.nz * wj], rq = [q.x - q.nx * wj, q.z - q.nz * wj];
			const yi = archY(i), yj = archY(i + 1);
			const ci = col(hole.alt[i]), cj = col(hole.alt[i + 1]);
			bp.push(lp[0], yi, lp[1], rp[0], yi, rp[1], lq[0], yj, lq[1]);
			bcol.push(...ci, ...ci, ...cj);
			bp.push(rp[0], yi, rp[1], rq[0], yj, rq[1], lq[0], yj, lq[1]);
			bcol.push(...ci, ...cj, ...cj);
		}
		if (bp.length) {
			const bgeo = new THREE.BufferGeometry();
			bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
			bgeo.setAttribute('color', new THREE.Float32BufferAttribute(bcol, 3));
			bgeo.computeVertexNormals();
			grp.add(new THREE.Mesh(bgeo, mats.floor));
		}
	}

	// Green bowl: coloured by the SAME altitude ramp — low centre (dark) → higher rim (lighter).
	const ggeo = new THREE.CircleGeometry(hole.greenR, 48);
	const gc = ggeo.attributes.position.count;
	const gcol: number[] = [];
	const cCenter = col(hole.alt[hole.alt.length - 1]); // cup centre (lowest)
	const cRim = col(hole.alt[cut]); // green edge
	for (let v = 0; v < gc; v++) { const c = v === 0 ? cCenter : cRim; gcol.push(c[0], c[1], c[2]); }
	ggeo.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
	const green = new THREE.Mesh(ggeo, mats.green);
	green.rotation.x = -Math.PI / 2;
	green.position.set(hole.cup.x, 0.02, hole.cup.z);
	grp.add(green);
	for (let k = 1; k <= 3; k++) {
		const rr = (hole.greenR * k) / 3.4;
		const gr = new THREE.Mesh(new THREE.RingGeometry(rr - 0.06, rr + 0.06, 48), mats.greenLine);
		gr.rotation.x = -Math.PI / 2;
		gr.position.set(hole.cup.x, 0.03, hole.cup.z);
		grp.add(gr);
	}

	// Walls: raised flat ribbons along both corridor edges (up to the green) + tee cap.
	const t = 1.0, wy = 1.4;
	const wpos: number[] = [];
	const wallStrip = (sign: number) => {
		for (let i = 0; i < cut; i++) {
			const p = path[i], q = path[i + 1];
			const o1p = sign * W[i], o2p = sign * (W[i] + t), o1q = sign * W[i + 1], o2q = sign * (W[i + 1] + t);
			const ax = p.x + p.nx * o1p, az = p.z + p.nz * o1p, bx = p.x + p.nx * o2p, bz = p.z + p.nz * o2p;
			const cx = q.x + q.nx * o2q, cz = q.z + q.nz * o2q, dx = q.x + q.nx * o1q, dz = q.z + q.nz * o1q;
			wpos.push(ax, wy, az, bx, wy, bz, cx, wy, cz);
			wpos.push(ax, wy, az, cx, wy, cz, dx, wy, dz);
		}
	};
	wallStrip(1);
	wallStrip(-1);
	const p0 = path[0], fx = p0.dirX * t * -1, fz = p0.dirZ * t * -1;
	const lox = p0.x + p0.nx * (W[0] + t), loz = p0.z + p0.nz * (W[0] + t);
	const rox = p0.x - p0.nx * (W[0] + t), roz = p0.z - p0.nz * (W[0] + t);
	wpos.push(lox, wy, loz, rox, wy, roz, rox + fx, wy, roz + fz);
	wpos.push(lox, wy, loz, rox + fx, wy, roz + fz, lox + fx, wy, loz + fz);

	// Circular green wall (bumper following the circle), as a raised ribbon.
	const gw = hole.greenWall;
	const outR = (p: { x: number; z: number }) => ({
		x: hole.cup.x + (p.x - hole.cup.x) * (1 + t / hole.greenR),
		z: hole.cup.z + (p.z - hole.cup.z) * (1 + t / hole.greenR),
	});
	for (let k = 0; k < gw.length - 1; k++) {
		const a = gw[k], b = gw[k + 1], oa = outR(a), ob = outR(b);
		wpos.push(a.x, wy, a.z, oa.x, wy, oa.z, ob.x, wy, ob.z);
		wpos.push(a.x, wy, a.z, ob.x, wy, ob.z, b.x, wy, b.z);
	}

	// Connectors: bridge the corridor mouth to the circle's opening so the wall is continuous
	// (the course simply ends in the circular green). These are the two jambs of the doorway.
	const pc = path[cut];
	const Li = { x: pc.x + pc.nx * W[cut], z: pc.z + pc.nz * W[cut] };
	const Lo = { x: pc.x + pc.nx * (W[cut] + t), z: pc.z + pc.nz * (W[cut] + t) };
	const Ri = { x: pc.x - pc.nx * W[cut], z: pc.z - pc.nz * W[cut] };
	const Ro = { x: pc.x - pc.nx * (W[cut] + t), z: pc.z - pc.nz * (W[cut] + t) };
	const c0 = gw[0], c1 = gw[gw.length - 1];
	const lC = Math.hypot(Li.x - c0.x, Li.z - c0.z) <= Math.hypot(Li.x - c1.x, Li.z - c1.z) ? c0 : c1;
	const rC = lC === c0 ? c1 : c0;
	const jamb = (inner: { x: number; z: number }, outer: { x: number; z: number }, circ: { x: number; z: number }) => {
		const co = outR(circ);
		wpos.push(inner.x, wy, inner.z, outer.x, wy, outer.z, co.x, wy, co.z);
		wpos.push(inner.x, wy, inner.z, co.x, wy, co.z, circ.x, wy, circ.z);
	};
	jamb(Li, Lo, lC);
	jamb(Ri, Ro, rC);

	grp.add(new THREE.Mesh(stripGeom(wpos), mats.wall));

	// Cup: bright ring + dark hole, plus a flat flag marker.
	const ring = new THREE.Mesh(new THREE.RingGeometry(hole.cupR, hole.cupR + 0.35, 28), mats.ring);
	ring.rotation.x = -Math.PI / 2;
	ring.position.set(hole.cup.x, 0.04, hole.cup.z);
	grp.add(ring);
	const cup = new THREE.Mesh(new THREE.CircleGeometry(hole.cupR, 28), mats.cup);
	cup.rotation.x = -Math.PI / 2;
	cup.position.set(hole.cup.x, 0.05, hole.cup.z);
	grp.add(cup);
	const fs = new THREE.Shape();
	fs.moveTo(0, 0); fs.lineTo(2.2, 0.7); fs.lineTo(0, 1.4); fs.lineTo(0, 0);
	const flag = new THREE.Mesh(new THREE.ShapeGeometry(fs), mats.flag);
	flag.rotation.x = -Math.PI / 2;
	flag.position.set(hole.cup.x, 0.06, hole.cup.z + hole.cupR);
	grp.add(flag);

	// Obstacles: decorative rocks attached to a wall — a raised top + a smaller crest for relief.
	const oy = 1.6;
	for (const ob of hole.obstacles) {
		const q = ob.pts;
		const opos: number[] = [];
		opos.push(q[0].x, oy, q[0].z, q[1].x, oy, q[1].z, q[2].x, oy, q[2].z);
		opos.push(q[0].x, oy, q[0].z, q[2].x, oy, q[2].z, q[3].x, oy, q[3].z);
		// a smaller raised crest (centre pulled in) for a chunky rock look
		const cxo = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, czo = (q[0].z + q[1].z + q[2].z + q[3].z) / 4;
		const k = 0.45, cy = oy + 0.7;
		const m = (pt: { x: number; z: number }) => ({ x: cxo + (pt.x - cxo) * k, z: czo + (pt.z - czo) * k });
		const a = m(q[0]), b = m(q[1]), c = m(q[2]), d = m(q[3]);
		opos.push(a.x, cy, a.z, b.x, cy, b.z, c.x, cy, c.z);
		opos.push(a.x, cy, a.z, c.x, cy, c.z, d.x, cy, d.z);
		grp.add(new THREE.Mesh(stripGeom(opos), mats.rock));
	}

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
	const [elapsed, setElapsed] = useState(0);
	const [board, setBoard] = useState<{ id: string; name: string; strokes: number; done: boolean; time: number }[]>([]);
	const [overview, setOverview] = useState(false);
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
	const aimRef = useRef({ active: false, px: 0, pz: 0 });
	const camTargetRef = useRef({ x: 0, z: 0 });
	const spanRef = useRef(HALF_SPAN);
	const appliedSpanRef = useRef(-1);
	const fitSpanRef = useRef(HALF_SPAN);
	const aspectRef = useRef(1); // canvas w/h so the ortho camera fills wide screens
	const courseCenterRef = useRef({ x: 0, z: 0 });
	const overviewRef = useRef(false);
	const freeCamRef = useRef<{ x: number; z: number } | null>(null); // panned (free-look) camera centre
	const panningRef = useRef(false);
	const lastPanRef = useRef({ x: 0, y: 0 });
	const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
	const pinchRef = useRef<{ dist: number; span: number } | null>(null);
	const rayRef = useRef(new THREE.Raycaster());
	const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
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
		const scene = new THREE.Scene();
		scene.background = new THREE.Color('#0d1117');
		const camera = new THREE.OrthographicCamera(-HALF_SPAN, HALF_SPAN, HALF_SPAN, -HALF_SPAN, 0.1, 400);
		camera.position.set(0, 80, 0);
		camera.up.set(0, 0, -1);
		camera.lookAt(0, 0, 0);
		scene.add(new THREE.AmbientLight(0x9aa3b8, 1.15));
		const dir = new THREE.DirectionalLight(0xffffff, 1.4);
		dir.position.set(30, 70, 40);
		scene.add(dir);

		// Big rough-grass ground so off-lane is always covered as the camera roams.
		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(2000, 2000),
			new THREE.MeshStandardMaterial({ color: 0x2c6e44, roughness: 1 }),
		);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = -0.05;
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

		const mats: Mats = {
			ground: ground.material as THREE.MeshStandardMaterial,
			floor: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, vertexColors: true }),
			wall: new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.85, side: THREE.DoubleSide }),
			cup: new THREE.MeshBasicMaterial({ color: 0x07090c }),
			ring: new THREE.MeshBasicMaterial({ color: 0xf2f4f8 }),
			flag: new THREE.MeshBasicMaterial({ color: 0xe34b4b, side: THREE.DoubleSide }),
			green: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, vertexColors: true }),
			greenLine: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
			relief: new THREE.MeshBasicMaterial({ color: 0x6db4ff, transparent: true, opacity: 0.26, side: THREE.DoubleSide }),
			reliefArrow: new THREE.MeshBasicMaterial({ color: 0xeaf2ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
			water: new THREE.MeshBasicMaterial({ color: 0x2f7fd6, transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
			rock: new THREE.MeshStandardMaterial({ color: 0x8b9098, roughness: 1, flatShading: true, side: THREE.DoubleSide }),
		};

		const ball = makeBall(0xffffff);
		scene.add(ball);

		const ballRing = new THREE.Mesh(
			new THREE.RingGeometry(GRAB_R - 0.18, GRAB_R, 40),
			new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
		);
		ballRing.rotation.x = -Math.PI / 2;
		ballRing.visible = false;
		scene.add(ballRing);

		const arcGeom = new THREE.BufferGeometry();
		arcGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 17), 3));
		const aimArc = new THREE.Line(arcGeom, new THREE.LineBasicMaterial({ color: 0xeef1f6, transparent: true, opacity: 0.85 }));
		aimArc.visible = false;
		aimArc.frustumCulled = false;
		scene.add(aimArc);

		const aimArrow = new THREE.Mesh(buildArrowGeom(), new THREE.MeshBasicMaterial({ color: 0x30d158, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
		aimArrow.visible = false;
		aimArrow.frustumCulled = false;
		scene.add(aimArrow);

		const holeGroup = new THREE.Group();
		scene.add(holeGroup);

		g3Ref.current = {
			renderer, scene, camera, ball, ballRing, holeGroup, aimArc, aimArrow, mats,
			disposables: [
				arcGeom, aimArc.material as THREE.Material, aimArrow.geometry, aimArrow.material as THREE.Material,
				ball.geometry, ball.material as THREE.Material, ground.geometry, ground.material as THREE.Material,
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
		aspectRef.current = w / h;
		g.renderer.setSize(w, h, false);
		appliedSpanRef.current = -1; // force the camera to re-project on the next frame
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

	const renderFrame = useCallback((dtSec: number, pose: { x: number; z: number }) => {
		const g = g3Ref.current;
		if (!g) return;
		g.ball.position.set(pose.x, PARAMS.ballR, pose.z);

		// Zoom: re-project only when the span changes.
		const span = overviewRef.current ? fitSpanRef.current : spanRef.current;
		if (span !== appliedSpanRef.current) {
			const a = aspectRef.current; g.camera.left = -span * a; g.camera.right = span * a; g.camera.top = span; g.camera.bottom = -span;
			g.camera.updateProjectionMatrix();
			appliedSpanRef.current = span;
		}
		// Camera: overview frames the whole course; free-look stays where the player panned;
		// otherwise it follows the ball (+ look-ahead).
		const b = ballRef.current;
		let cx: number, cz: number;
		if (overviewRef.current) {
			cx = courseCenterRef.current.x;
			cz = courseCenterRef.current.z;
		} else if (freeCamRef.current) {
			cx = freeCamRef.current.x;
			cz = freeCamRef.current.z;
			camTargetRef.current.x = cx; // so follow eases smoothly when free-look ends
			camTargetRef.current.z = cz;
		} else {
			const tx = pose.x + b.vx * LOOK, tz = pose.z + b.vz * LOOK;
			const kc = Math.min(1, dtSec * 5);
			camTargetRef.current.x += (tx - camTargetRef.current.x) * kc;
			camTargetRef.current.z += (tz - camTargetRef.current.z) * kc;
			cx = camTargetRef.current.x;
			cz = camTargetRef.current.z;
		}
		g.camera.position.set(cx, 80, cz);
		g.camera.lookAt(cx, 0, cz);

		// "Touch here to aim" ring around the ball (only when it's the player's turn).
		const canAim = runningRef.current && !doneRef.current && !overviewRef.current && isSettled(b);
		g.ballRing.position.set(b.x, 0.05, b.z);
		g.ballRing.visible = canAim && !aimRef.current.active;

		// Aim visuals: an arc on the pull side (follows the cursor) + a force arrow on the launch side.
		if (aimRef.current.active) {
			const dx = aimRef.current.px - b.x, dz = aimRef.current.pz - b.z;
			const mag = Math.hypot(dx, dz) || 1;
			const frac = Math.min(mag, PARAMS.maxPull) / PARAMS.maxPull;
			const radius = Math.min(mag, PARAMS.maxPull);
			const phi = Math.atan2(dz, dx);
			const arr = g.aimArc.geometry.attributes.position.array as Float32Array;
			const K = 16;
			for (let i = 0; i <= K; i++) {
				const ang = phi + (i / K - 0.5) * ARC_SPAN;
				arr[i * 3] = b.x + Math.cos(ang) * radius;
				arr[i * 3 + 1] = AIM_Y;
				arr[i * 3 + 2] = b.z + Math.sin(ang) * radius;
			}
			g.aimArc.geometry.attributes.position.needsUpdate = true;
			g.aimArc.visible = true;

			// Arrow points opposite the pull, length & colour scale with power.
			const launch = phi + Math.PI;
			g.aimArrow.position.set(b.x, 0, b.z);
			g.aimArrow.rotation.y = -launch;
			g.aimArrow.scale.set(frac * ARROW_MAX, 1, 1 + frac * 1.4);
			(g.aimArrow.material as THREE.MeshBasicMaterial).color.setRGB(
				Math.min(1, frac * 2),
				Math.min(1, 2 - frac * 2),
				0.16,
			);
			g.aimArrow.visible = true;
		} else {
			g.aimArc.visible = false;
			g.aimArrow.visible = false;
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
		const finalSec = curTime();
		setElapsed(finalSec);
		const v = encodeScore(sc, finalSec); // strokes, then time as a tiebreaker
		const nb = bestRef.current == null ? v : Math.min(bestRef.current, v);
		bestRef.current = nb;
		setBest(nb);
		aimRef.current.active = false;
		trackGame(gameId, 'game_won', { strokes: sc });
		// Levels: solo only — grade by strokes, never touch the lobby / daily run.
		if (levelActiveRef.current) {
			lv.finish({ won: true, score: sc, raw: { seed: seedRef.current } });
			return;
		}
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
			renderFrame(dt / 1000, { x: prev.x + (ball.x - prev.x) * alpha, z: prev.z + (ball.z - prev.z) * alpha });
			rafRef.current = requestAnimationFrame(frame);
		},
		[renderFrame, handleSunk],
	);

	/* ---- Zoom / overview ---- */
	const zoomBy = useCallback((factor: number) => {
		overviewRef.current = false;
		setOverview(false);
		spanRef.current = Math.max(12, Math.min(fitSpanRef.current, spanRef.current * factor));
	}, []);
	const toggleOverview = useCallback(() => {
		const nv = !overviewRef.current;
		overviewRef.current = nv;
		setOverview(nv);
		if (nv) {
			aimRef.current.active = false;
			setPower(0);
		}
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12);
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

	// Single-gesture aim/pan flow, coord-based so both pointer (mouse/pen) and native touch feed it.
	// Pinch (two pointers) stays on the pointer path — touchDrag only tracks touches[0].
	const aimStart = useCallback((clientX: number, clientY: number) => {
		if (pinchRef.current) return; // a second finger is zooming — don't (re)arm aim/pan
		if (phase !== 'playing' || overviewRef.current) return;
		const p = worldFromPointer(clientX, clientY);
		const b = ballRef.current;
		// Aim only when the ball is at rest AND the touch is near it; otherwise pan ("look").
		if (p && !doneRef.current && isSettled(b) && Math.hypot(p.x - b.x, p.z - b.z) <= GRAB_R) {
			aimRef.current = { active: true, px: p.x, pz: p.z };
			setPower(Math.min(Math.hypot(p.x - b.x, p.z - b.z), PARAMS.maxPull) / PARAMS.maxPull);
		} else {
			panningRef.current = true;
			lastPanRef.current = { x: clientX, y: clientY };
			if (!freeCamRef.current) freeCamRef.current = { x: camTargetRef.current.x, z: camTargetRef.current.z };
		}
	}, [phase, worldFromPointer]);

	const aimMove = useCallback((clientX: number, clientY: number) => {
		if (pinchRef.current) return;
		if (panningRef.current && freeCamRef.current) {
			const canvas = canvasRef.current;
			const span = spanRef.current;
			const wpp = canvas ? (2 * span) / canvas.clientHeight : 0.1; // world units per screen pixel (square pixels)
			freeCamRef.current.x -= (clientX - lastPanRef.current.x) * wpp;
			freeCamRef.current.z -= (clientY - lastPanRef.current.y) * wpp;
			lastPanRef.current = { x: clientX, y: clientY };
			return;
		}
		if (!aimRef.current.active) return;
		const p = worldFromPointer(clientX, clientY);
		if (!p) return;
		aimRef.current.px = p.x;
		aimRef.current.pz = p.z;
		const b = ballRef.current;
		setPower(Math.min(Math.hypot(p.x - b.x, p.z - b.z), PARAMS.maxPull) / PARAMS.maxPull);
	}, [worldFromPointer]);

	const aimEnd = useCallback(() => {
		if (pinchRef.current) return; // lifting one of two zoom fingers — never fires a shot
		if (panningRef.current) { panningRef.current = false; return; }
		if (!aimRef.current.active) return;
		aimRef.current.active = false;
		setPower(0);
		const b = ballRef.current;
		const vel = aimToVelocity({ x: aimRef.current.px - b.x, z: aimRef.current.pz - b.z });
		if (!vel) return;
		freeCamRef.current = null; // a shot re-centres the camera on the ball
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
			pinchRef.current = { dist: pinchDist(), span: spanRef.current };
			aimRef.current.active = false;
			panningRef.current = false;
			setPower(0);
			return;
		}
		onAimPointerDown(e); // single pointer → aim/pan via the hook
	}, [onAimPointerDown]);

	const onPointerMove = useCallback((e: React.PointerEvent) => {
		if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pinchRef.current) {
			const d = pinchDist();
			if (d > 0) {
				overviewRef.current = false;
				setOverview(false);
				spanRef.current = Math.max(12, Math.min(fitSpanRef.current, pinchRef.current.span * (pinchRef.current.dist / d)));
			}
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
		camTargetRef.current = { x: hole.start.x, z: hole.start.z };
		freeCamRef.current = null;
		panningRef.current = false;
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

			const bd = hole.bounds;
			courseCenterRef.current = { x: (bd.minX + bd.maxX) / 2, z: (bd.minZ + bd.maxZ) / 2 };
			fitSpanRef.current = Math.max(bd.maxX - bd.minX, bd.maxZ - bd.minZ) / 2 + 4;
			spanRef.current = HALF_SPAN;
			overviewRef.current = false;
			setOverview(false);
			appliedSpanRef.current = -1;

			const g = g3Ref.current;
			if (g) {
				g.holeGroup.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
				g.scene.remove(g.holeGroup);
				g.holeGroup = buildHoleGroup(hole, g.mats);
				g.scene.add(g.holeGroup);
			}
			resize();
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
						<span className="gf-best">⏱ {fmtTime(elapsed)}</span>
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
						<button className="gf-zbtn" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoomer">＋</button>
						<button className="gf-zbtn" onClick={() => zoomBy(1.25)} aria-label="Dézoomer">－</button>
						<button className={`gf-zbtn ${overview ? 'active' : ''}`} onClick={toggleOverview} aria-label="Vue d'ensemble">🔍</button>
					</div>
				)}

				{phase === 'playing' && (
					<div className="gf-legend" aria-hidden="true">
						<span>Haut</span>
						<div className="gf-legendbar" />
						<span>Bas</span>
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

				{phase === 'menu' && !webglError && !lv.active && (
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
				les bords et les murs. Au défi du jour, jusqu'à {MAX_PLAYERS} joueurs sur le même trou&nbsp;: tu vois
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
  width: 100%; height: 100%; display: block; background: #0d1117;
  border: 1px solid var(--gray-800); border-radius: 12px;
  touch-action: none; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none;
}
/* Site global fullscreen → the course fills the screen; controls stay overlaid. */
.game-page.gf-full .gf-root { max-width: none; width: 100%; height: 100%; display: flex; flex-direction: column; }
.game-page.gf-full .gf-boardwrap { flex: 1; aspect-ratio: auto; }
.game-page.gf-full .gf-canvas { border-radius: 0; border: none; }
.game-page.gf-full .gf-help { display: none; }
.game-page.gf-full .gf-board { top: 54px; }
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
.gf-legend { position: absolute; bottom: 10px; left: 10px; display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 10px; font-weight: 700; color: #fff; background: rgba(0,0,0,0.45); padding: 6px 7px; border-radius: 10px; pointer-events: none; }
.gf-legendbar { width: 11px; height: 64px; border-radius: 6px; background: linear-gradient(to top, #296b42, #99e6a8); border: 1px solid rgba(255,255,255,0.4); }
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
