import { useState, useEffect, useRef, useCallback } from 'react';
import {
	LANES,
	COLS,
	APPROACH,
	TOWER,
	TOWER_ORDER,
	FOX,
	DIFFS,
	DIFF_ORDER,
	PROD_INTERVAL,
	createGame,
	placeTower,
	collectGrain,
	grainValue,
	rebuyLane,
	laserTarget,
	REBUY_COST,
	TOKEN_TTL,
	step,
	type State,
	type TowerType,
	type FoxType,
	type Tower,
	type Fox,
	type Grain,
	type DiffKey,
} from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, dailyDifficultyIndex, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';

/* =====================================================
   COCOTTES VS RENARDS — real-time lane tower-defense island.
   World is drawn in CELL units with a henhouse margin (left) and a forest
   approach margin (right): VIEW_W = HENHOUSE_W + COLS + APPROACH. Grain is
   collected as PvZ-style tokens; a render-only particle layer adds juice.
   Fixed-timestep rAF loop; pure engine in ./engine (seeded, tested).
   ===================================================== */

type Status = 'ready' | 'playing' | 'over';
type Selected = TowerType | 'shovel' | null;
const MAX_TRIES = 3;
const STEP = 1000 / 60;
const HENHOUSE_W = 1.15; // left margin: coop + nests to defend
const VERT_PAD = 0.55; // top & bottom breathing room so hp bars / counters aren't clipped
const VIEW_W = HENHOUSE_W + COLS + APPROACH;
const VIEW_H = LANES + VERT_PAD * 2;
const bestKey = (key: DiffKey): string => `ludiven-cocottes-best-${key}`;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
// Stable per-cell hash for decorative scatter (no per-frame flicker).
const hash2 = (a: number, b: number): number => {
	const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
	return x - Math.floor(x);
};

interface DailyState {
	best: number;
	tries: number;
}

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	g: number;
	life: number;
	maxLife: number;
	size: number;
	color: string;
	kind: 'dust' | 'spark' | 'feather' | 'splash' | 'text';
	text?: string;
}

const CARD: Record<TowerType, { emoji: string; short: string; desc: string }> = {
	pondeuse: { emoji: '🥚', short: 'Pondeuse', desc: 'Pond un œuf toutes les 5 s (il grossit sous elle) qu\'elle troque en blé : clique le jeton pour l\'encaisser. Le moteur de ton économie, pose-en tôt !' },
	lanceuse: { emoji: '🐔', short: 'Lanceuse', desc: 'Tire des œufs sur le premier renard de sa voie. La défense de base.' },
	gemellaire: { emoji: '🐤', short: 'Gémeaux', desc: 'Tire deux œufs par salve : deux fois plus de dégâts qu\'une lanceuse.' },
	glaciere: { emoji: '🧊', short: 'Neiges', desc: 'Ses œufs givrés ralentissent les renards touchés (dégâts modestes).' },
	costaude: { emoji: '🌾', short: 'Costaude', desc: 'Botte de foin très résistante : bloque les renards pendant que tes poules tirent.' },
	mine: { emoji: '💣', short: 'Œuf-mine', desc: 'S\'arme en 3 s puis explose au contact — énormes dégâts de zone, usage unique.' },
	mitrailleuse: { emoji: '🐓', short: 'Mitrailleuse', desc: 'Cadence de tir très rapide, idéale contre les meutes et les gros renards.' },
	laser: { emoji: '⚡', short: 'Laser', desc: 'Rayon continu surpuissant qui brûle le renard le plus proche de sa voie. Chère (500) mais dévastatrice contre le méga renard.' },
	piment: { emoji: '🌶️', short: 'Coq piment', desc: 'Usage unique : élimine immédiatement tous les renards de la voie choisie.' },
};
const SHOVEL_DESC = 'Retire une cocotte posée (clique-la) pour libérer la case.';

interface HenStyle {
	comb: string;
	body: string;
	bodyDark: string;
	wing: string;
}
const HEN_STYLE: Record<string, HenStyle> = {
	pondeuse: { comb: '#e8b23a', body: '#fdfdfd', bodyDark: '#e2e2e2', wing: '#ededed' },
	lanceuse: { comb: '#e34b4b', body: '#fdfdfd', bodyDark: '#e2e2e2', wing: '#ededed' },
	mitrailleuse: { comb: '#e34b4b', body: '#ffd8d8', bodyDark: '#f0b6b6', wing: '#ffc4c4' },
	glaciere: { comb: '#7fb2e6', body: '#dcefff', bodyDark: '#b6dbf7', wing: '#c8e6ff' },
	gemellaire: { comb: '#f0a830', body: '#fff1c6', bodyDark: '#f0dc9c', wing: '#ffe9a8' },
	laser: { comb: '#ff2d55', body: '#e6f0ff', bodyDark: '#c2d6f2', wing: '#d4e6ff' },
	piment: { comb: '#c22b2b', body: '#ff9a5a', bodyDark: '#e07a3a', wing: '#ffb47a' }, // preview ghost only (one-shot card)
};

interface FoxStyle {
	fur: string;
	furDark: string;
	belly: string;
}
const FOX_STYLE: Record<FoxType, FoxStyle> = {
	normal: { fur: '#d8722c', furDark: '#b25a1c', belly: '#f2c89b' },
	rapide: { fur: '#e39140', furDark: '#c2731f', belly: '#f7d9ad' },
	blinde: { fur: '#9a6a3a', furDark: '#7a5228', belly: '#d8b98c' },
	mega: { fur: '#a8531c', furDark: '#7c3a12', belly: '#e0a86a' },
	creuseur: { fur: '#8a6a44', furDark: '#684e2f', belly: '#c9ac82' },
	sauteur: { fur: '#d86a4c', furDark: '#b24e34', belly: '#f4c2ac' },
	meute: { fur: '#cd6f38', furDark: '#a8531f', belly: '#efc699' },
};
const foxRadius = (type: FoxType): number =>
	type === 'mega' ? 0.6 : type === 'meute' ? 0.28 : type === 'rapide' ? 0.31 : 0.36;

export default function CocottesRenardsGame({ gameId }: { gameId: string }) {
	const [status, setStatus] = useState<Status>('ready');
	const [score, setScore] = useState(0);
	const [best, setBest] = useState(0);
	const [hud, setHud] = useState<{ grain: number; wave: number; nests: number; cd: Partial<Record<TowerType, number>> }>({ grain: 0, wave: 0, nests: LANES, cd: {} });
	const [grainBump, setGrainBump] = useState(false);
	const [selected, setSelected] = useState<Selected>(null);
	const [diffKey, setDiffKey] = useState<DiffKey>('moyen');
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [tries, setTries] = useState(0);
	const [attempt, setAttempt] = useState(0);
	const [megaAlert, setMegaAlert] = useState(false);
	const [laneAlert, setLaneAlert] = useState(false);
	const [showInfo, setShowInfo] = useState(false);

	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const stateRef = useRef<State | null>(null);
	const rngRef = useRef<() => number>(() => 0);
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const accRef = useRef(0);
	const runningRef = useRef(false);
	const scaleRef = useRef(1);
	const startRef = useRef(0);
	const hudTickRef = useRef(0);
	const animRef = useRef(0); // real-time clock for idle/run animation
	const bumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastGrainRef = useRef(0);
	// Render-only FX + frame-to-frame diff bookkeeping.
	const partsRef = useRef<Particle[]>([]);
	const prevFoxRef = useRef<Map<number, { x: number; row: number; type: FoxType }>>(new Map());
	const prevTowerRef = useRef<Map<number, { type: TowerType; col: number; row: number }>>(new Map());
	const prevEggRef = useRef<Map<number, { x: number; row: number }>>(new Map());
	const prevGrainRef = useRef<Map<number, { x: number; y: number; value: number }>>(new Map());
	const prevLostRef = useRef<boolean[]>([]);
	const laneAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Mirrors for listeners / pointer handlers.
	const statusRef = useRef<Status>('ready');
	const selectedRef = useRef<Selected>(null);
	const hoverRef = useRef<{ row: number; col: number } | null>(null);
	const megaAlertRef = useRef(false);
	const dailyRef = useRef(false);
	const triesRef = useRef(0);
	const seedRef = useRef(0);
	const diffIdxRef = useRef(1);

	const setStat = (v: Status): void => {
		statusRef.current = v;
		setStatus(v);
	};
	const selectCard = (v: Selected): void => {
		selectedRef.current = v;
		setSelected(v);
	};

	/* ---------- Particles ---------- */
	const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
	const push = (p: Particle): void => {
		if (partsRef.current.length < 320) partsRef.current.push(p);
	};
	const emitFoxPoof = (info: { x: number; row: number; type: FoxType }): void => {
		const cx = info.x;
		const cy = info.row + 0.5;
		const style = FOX_STYLE[info.type];
		const n = info.type === 'mega' ? 14 : 7;
		for (let i = 0; i < n; i++)
			push({ x: cx, y: cy, vx: rnd(-1.4, 1.4), vy: rnd(-2, -0.3), g: 4.5, life: 0.55, maxLife: 0.55, size: rnd(0.05, 0.11), color: i % 2 ? style.fur : style.belly, kind: 'feather' });
		for (let i = 0; i < 4; i++)
			push({ x: cx, y: cy, vx: rnd(-0.8, 0.8), vy: rnd(-0.6, 0.2), g: 1, life: 0.5, maxLife: 0.5, size: rnd(0.08, 0.16), color: 'rgba(150,140,120,0.5)', kind: 'dust' });
		push({ x: cx, y: cy - 0.25, vx: 0, vy: -0.7, g: 0, life: 0.85, maxLife: 0.85, size: 0.34, color: '#ffe08a', kind: 'text', text: `+${FOX[info.type].reward}` });
	};
	const emitBlast = (info: { col: number; row: number }): void => {
		const cx = info.col + 0.5;
		const cy = info.row + 0.5;
		for (let i = 0; i < 20; i++)
			push({ x: cx, y: cy, vx: rnd(-3, 3), vy: rnd(-3, 1.5), g: 5, life: rnd(0.4, 0.7), maxLife: 0.7, size: rnd(0.06, 0.16), color: i % 2 ? '#ffb347' : '#ff6a2b', kind: 'spark' });
	};
	const emitPuff = (info: { col: number; row: number }): void => {
		const cx = info.col + 0.5;
		const cy = info.row + 0.5;
		for (let i = 0; i < 6; i++)
			push({ x: cx, y: cy, vx: rnd(-1, 1), vy: rnd(-1.2, -0.1), g: 2, life: 0.5, maxLife: 0.5, size: rnd(0.08, 0.15), color: 'rgba(120,110,95,0.55)', kind: 'dust' });
	};
	const emitSplash = (info: { x: number; row: number }): void => {
		for (let i = 0; i < 6; i++)
			push({ x: info.x, y: info.row + 0.5, vx: rnd(-1.4, 1.4), vy: rnd(-1.4, 0.4), g: 3, life: 0.35, maxLife: 0.35, size: rnd(0.03, 0.07), color: '#fff6e0', kind: 'splash' });
	};
	const emitLayPop = (info: { x: number; y: number }): void => {
		for (let i = 0; i < 6; i++)
			push({ x: info.x, y: info.y, vx: rnd(-0.9, 0.9), vy: rnd(-1.4, -0.3), g: 2, life: 0.45, maxLife: 0.45, size: rnd(0.03, 0.06), color: i % 2 ? '#fff6e0' : '#ffe08a', kind: 'spark' });
		// Egg → wheat: the hen trades her egg for grain (the currency).
		push({ x: info.x, y: info.y - 0.2, vx: 0, vy: -0.85, g: 0, life: 0.95, maxLife: 0.95, size: 0.26, color: '#fff', kind: 'text', text: '🥚→🌾' });
	};
	const emitGrainCollect = (info: { x: number; y: number; value: number }): void => {
		for (let i = 0; i < 8; i++)
			push({ x: info.x, y: info.y, vx: rnd(-1.2, 1.2), vy: rnd(-2.2, -0.6), g: 1.5, life: 0.6, maxLife: 0.6, size: rnd(0.04, 0.09), color: i % 2 ? '#ffe08a' : '#ffd85a', kind: 'spark' });
		push({ x: info.x, y: info.y - 0.15, vx: 0, vy: -0.9, g: 0, life: 0.8, maxLife: 0.8, size: 0.32, color: '#ffe08a', kind: 'text', text: `+${info.value}` });
	};

	const emitRebuild = (row: number): void => {
		for (let i = 0; i < 14; i++)
			push({ x: rnd(-0.4, 1.6), y: row + rnd(0.15, 0.85), vx: rnd(-1.4, 1.4), vy: rnd(-2.4, -0.5), g: 4, life: rnd(0.5, 0.9), maxLife: 0.9, size: rnd(0.05, 0.1), color: i % 2 ? '#fdf4dd' : '#ffd85a', kind: 'feather' });
		push({ x: COLS / 2, y: row + 0.32, vx: 0, vy: -0.6, g: 0, life: 1.2, maxLife: 1.2, size: 0.32, color: '#7cfc98', kind: 'text', text: 'Nid reconstruit !' });
	};
	const emitLaneLost = (row: number): void => {
		for (let i = 0; i < 16; i++)
			push({ x: rnd(-0.4, 1.8), y: row + rnd(0.15, 0.85), vx: rnd(-1.6, 1.6), vy: rnd(-2.4, -0.4), g: 4, life: rnd(0.5, 0.9), maxLife: 0.9, size: rnd(0.05, 0.1), color: i % 2 ? '#fdf4dd' : '#d8722c', kind: 'feather' });
		push({ x: 1.4, y: row + 0.35, vx: 0, vy: -0.5, g: 0, life: 1.2, maxLife: 1.2, size: 0.32, color: '#ff9a8a', kind: 'text', text: 'Nid pillé !' });
	};

	const detectEvents = (st: State): void => {
		// Newly raided lanes first: raid FX + suppress kill/blast FX for swept entities.
		const newlyLost = new Set<number>();
		for (let r = 0; r < LANES; r++) if (st.lostLanes[r] && !prevLostRef.current[r]) newlyLost.add(r);
		if (newlyLost.size > 0) {
			for (const r of newlyLost) emitLaneLost(r);
			setLaneAlert(true);
			if (laneAlertTimerRef.current) clearTimeout(laneAlertTimerRef.current);
			laneAlertTimerRef.current = setTimeout(() => setLaneAlert(false), 2600);
		}
		prevLostRef.current = [...st.lostLanes];

		const cur = new Set<number>();
		for (const f of st.foxes) cur.add(f.id);
		if (!st.over) for (const [id, info] of prevFoxRef.current) if (!cur.has(id) && !newlyLost.has(info.row)) emitFoxPoof(info);
		prevFoxRef.current.clear();
		for (const f of st.foxes) prevFoxRef.current.set(f.id, { x: f.x, row: f.row, type: f.type });

		const curT = new Set<number>();
		for (const t of st.towers) curT.add(t.id);
		for (const [id, info] of prevTowerRef.current) if (!curT.has(id) && !newlyLost.has(info.row)) (info.type === 'mine' ? emitBlast : emitPuff)(info);
		prevTowerRef.current.clear();
		for (const t of st.towers) prevTowerRef.current.set(t.id, { type: t.type, col: t.col, row: t.row });

		const curE = new Set<number>();
		for (const e of st.eggs) curE.add(e.id);
		for (const [id, info] of prevEggRef.current) if (!curE.has(id) && !newlyLost.has(info.row) && info.x <= COLS + 0.6) emitSplash(info);
		prevEggRef.current.clear();
		for (const e of st.eggs) prevEggRef.current.set(e.id, { x: e.x, row: e.row });

		const curG = new Set<number>();
		for (const g of st.grains) curG.add(g.id);
		for (const [id, info] of prevGrainRef.current) if (!curG.has(id)) emitGrainCollect(info);
		for (const g of st.grains) if (!prevGrainRef.current.has(g.id) && !g.sky) emitLayPop(g); // fresh lay
		prevGrainRef.current.clear();
		for (const g of st.grains) prevGrainRef.current.set(g.id, { x: g.x, y: g.y, value: g.value });
	};

	const updateParticles = (dt: number): void => {
		const ps = partsRef.current;
		for (const p of ps) {
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.vy += p.g * dt;
			p.life -= dt;
		}
		partsRef.current = ps.filter((p) => p.life > 0);
	};

	/* ---------- Rendering (cell units, henhouse-shifted) ---------- */
	const draw = useCallback(() => {
		const cv = canvasRef.current;
		const st = stateRef.current;
		if (!cv || !st) return;
		const ctx = cv.getContext('2d');
		if (!ctx) return;
		const anim = animRef.current;
		ctx.clearRect(0, 0, VIEW_W, VIEW_H);
		ctx.save();
		ctx.translate(HENHOUSE_W, VERT_PAD);
		// Grassy frame filling the top/bottom padding behind everything.
		ctx.fillStyle = '#6fae44';
		ctx.fillRect(-HENHOUSE_W, -VERT_PAD, VIEW_W, VIEW_H);

		const dot = (x: number, y: number, rr: number): void => {
			ctx.beginPath();
			ctx.arc(x, y, rr, 0, Math.PI * 2);
			ctx.fill();
		};
		const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void => {
			ctx.beginPath();
			ctx.moveTo(ax, ay);
			ctx.lineTo(bx, by);
			ctx.lineTo(cx, cy);
			ctx.closePath();
			ctx.fill();
		};
		const ellipse = (x: number, y: number, rx: number, ry: number): void => {
			ctx.beginPath();
			ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
			ctx.fill();
		};
		const hpBar = (cx: number, cy: number, r: number, frac: number): void => {
			if (frac >= 1) return;
			ctx.fillStyle = 'rgba(0,0,0,0.35)';
			ctx.fillRect(cx - r, cy - r * 1.5, r * 2, 0.06);
			ctx.fillStyle = frac > 0.5 ? '#2f9e6f' : frac > 0.25 ? '#f0a830' : '#d9534f';
			ctx.fillRect(cx - r, cy - r * 1.5, r * 2 * frac, 0.06);
		};
		const roundRect = (x: number, y: number, w: number, h: number, rad: number): void => {
			ctx.beginPath();
			ctx.moveTo(x + rad, y);
			ctx.arcTo(x + w, y, x + w, y + h, rad);
			ctx.arcTo(x + w, y + h, x, y + h, rad);
			ctx.arcTo(x, y + h, x, y, rad);
			ctx.arcTo(x, y, x + w, y, rad);
			ctx.closePath();
		};
		// Canvas text via a 16px nominal font + scale — sub-pixel fonts don't render in Firefox.
		const LABEL_BASE = 16;
		const drawLabel = (
			text: string,
			x: number,
			y: number,
			size: number,
			fill: string,
			opts?: { stroke?: string; align?: CanvasTextAlign; alpha?: number },
		): void => {
			const k = size / LABEL_BASE;
			ctx.save();
			if (opts?.alpha != null) ctx.globalAlpha = opts.alpha;
			ctx.translate(x, y);
			ctx.scale(k, k);
			ctx.font = `bold ${LABEL_BASE}px system-ui, sans-serif`;
			ctx.textAlign = opts?.align ?? 'center';
			ctx.textBaseline = 'middle';
			if (opts?.stroke) {
				ctx.strokeStyle = opts.stroke;
				ctx.lineWidth = 2.5;
				ctx.lineJoin = 'round';
				ctx.strokeText(text, 0, 0);
			}
			ctx.fillStyle = fill;
			ctx.fillText(text, 0, 0);
			ctx.restore();
		};
		const measureLabel = (text: string, size: number): number => {
			ctx.font = `bold ${LABEL_BASE}px system-ui, sans-serif`;
			return ctx.measureText(text).width * (size / LABEL_BASE);
		};

		/* --- Ground: grid lanes, henhouse floor, forest floor --- */
		for (let r = 0; r < LANES; r++) {
			ctx.fillStyle = r % 2 === 0 ? '#8fce5f' : '#82c455';
			ctx.fillRect(0, r, COLS, 1);
			// furrow shading
			ctx.fillStyle = 'rgba(60,110,40,0.10)';
			ctx.fillRect(0, r + 0.92, COLS, 0.08);
		}
		// Decorative scatter (deterministic per cell).
		for (let c = 0; c < COLS; c++) {
			for (let r = 0; r < LANES; r++) {
				const k = hash2(c + 1, r + 1);
				const dx = c + 0.15 + hash2(c * 3 + 7, r) * 0.7;
				const dy = r + 0.6 + hash2(c, r * 3 + 5) * 0.32;
				if (k < 0.33) {
					// grass tuft
					ctx.strokeStyle = 'rgba(70,130,45,0.5)';
					ctx.lineWidth = 0.03;
					for (let b = -1; b <= 1; b++) {
						ctx.beginPath();
						ctx.moveTo(dx + b * 0.05, dy);
						ctx.lineTo(dx + b * 0.09, dy - 0.16);
						ctx.stroke();
					}
				} else if (k < 0.52) {
					// little flower
					ctx.fillStyle = k < 0.42 ? '#f5d24a' : '#e98fb5';
					for (let p = 0; p < 5; p++) {
						const a = (p / 5) * Math.PI * 2;
						dot(dx + Math.cos(a) * 0.05, dy + Math.sin(a) * 0.05, 0.032);
					}
					ctx.fillStyle = '#fff6d0';
					dot(dx, dy, 0.03);
				} else if (k < 0.62) {
					// pebble
					ctx.fillStyle = 'rgba(120,120,120,0.4)';
					ellipse(dx, dy, 0.06, 0.04);
				}
			}
		}
		// Forest approach floor (right).
		const fg = ctx.createLinearGradient(COLS, 0, COLS + APPROACH, 0);
		fg.addColorStop(0, '#7bb84f');
		fg.addColorStop(1, '#5b7d38');
		ctx.fillStyle = fg;
		ctx.fillRect(COLS, 0, APPROACH, LANES);
		ctx.fillStyle = '#6a5230';
		ctx.fillRect(COLS, 0, 0.12, LANES); // dirt lip where they emerge
		// Tree line at the far right.
		for (let r = 0; r < LANES; r++) {
			const bx = COLS + APPROACH - 0.28 + hash2(r + 2, 9) * 0.12;
			const by = r + 0.5;
			ctx.fillStyle = '#3f6b2c';
			dot(bx, by - 0.12, 0.3);
			ctx.fillStyle = '#4c7d33';
			dot(bx - 0.16, by + 0.12, 0.22);
			dot(bx + 0.16, by + 0.14, 0.2);
		}

		/* --- Henhouse + nests (left) --- */
		// Grassy mound base.
		ctx.fillStyle = '#7cbb52';
		ctx.fillRect(-HENHOUSE_W, 0, HENHOUSE_W, LANES);
		// Coop building spanning the lanes.
		const coopX = -HENHOUSE_W + 0.1;
		const coopW = HENHOUSE_W - 0.34;
		ctx.fillStyle = '#c46b3d';
		ctx.fillRect(coopX, 0.5, coopW, LANES - 1);
		ctx.fillStyle = '#a8542c';
		for (let i = 0; i < 5; i++) {
			ctx.fillRect(coopX, 0.5 + i * ((LANES - 1) / 5), coopW, 0.05);
		}
		// Roof.
		ctx.fillStyle = '#7c4a2b';
		tri(-HENHOUSE_W, 0.55, coopX + coopW + 0.06, 0.55, -HENHOUSE_W + HENHOUSE_W / 2, -0.35 + 0);
		ctx.fillStyle = '#8a5732';
		ctx.fillRect(coopX, 0.4, coopW, 0.16);
		// Round door.
		ctx.fillStyle = '#3a2415';
		dot(coopX + coopW * 0.5, LANES * 0.5, 0.34);
		ctx.fillStyle = '#ffd97a';
		dot(coopX + coopW * 0.5, LANES * 0.5, 0.34 * 0.62);
		// Nests, one per lane (the objectives), just inside the fence. Raided lanes show a wrecked nest.
		for (let r = 0; r < LANES; r++) {
			const nx = -0.12;
			const ny = r + 0.62;
			if (st.lostLanes[r]) {
				ctx.fillStyle = '#8f6f33';
				ellipse(nx, ny + 0.04, 0.22, 0.07); // flattened straw
				ctx.fillStyle = '#fdf4dd';
				tri(nx - 0.09, ny, nx - 0.03, ny - 0.09, nx + 0.01, ny); // broken shells
				tri(nx + 0.03, ny + 0.02, nx + 0.09, ny - 0.06, nx + 0.13, ny + 0.02);
				continue;
			}
			ctx.fillStyle = '#b58a3c';
			ellipse(nx, ny, 0.2, 0.12);
			ctx.fillStyle = '#caa24a';
			ellipse(nx, ny - 0.02, 0.15, 0.08);
			ctx.fillStyle = '#fdf4dd';
			dot(nx - 0.05, ny - 0.03, 0.05);
			dot(nx + 0.05, ny - 0.03, 0.05);
		}
		// Fence posts on the henhouse edge.
		ctx.fillStyle = '#8a5a2b';
		ctx.fillRect(0, 0, 0.08, LANES);
		ctx.fillStyle = 'rgba(255,255,255,0.14)';
		ctx.fillRect(0.08, 0, 0.02, LANES);

		// Raided lanes: darkened strip + scattered feathers (deterministic).
		for (let r = 0; r < LANES; r++) {
			if (!st.lostLanes[r]) continue;
			ctx.fillStyle = 'rgba(52,38,24,0.42)';
			ctx.fillRect(-HENHOUSE_W, r, VIEW_W, 1);
			for (let i = 0; i < 6; i++) {
				const fx = hash2(r * 7 + i, 3) * COLS;
				const fy = r + 0.25 + hash2(i + 1, r * 5 + 1) * 0.55;
				ctx.fillStyle = i % 2 ? 'rgba(255,250,240,0.45)' : 'rgba(216,114,44,0.4)';
				ellipse(fx, fy, 0.07, 0.035);
			}
		}

		/* --- Grid lines --- */
		ctx.strokeStyle = 'rgba(0,0,0,0.08)';
		ctx.lineWidth = 0.015;
		for (let c = 1; c < COLS; c++) {
			ctx.beginPath();
			ctx.moveTo(c, 0);
			ctx.lineTo(c, LANES);
			ctx.stroke();
		}
		for (let r = 1; r < LANES; r++) {
			ctx.beginPath();
			ctx.moveTo(0, r);
			ctx.lineTo(COLS, r);
			ctx.stroke();
		}

		/* --- Sprites --- */
		const drawHen = (cx: number, cy: number, r: number, s: HenStyle, flap: number, twin: boolean, alpha = 1): void => {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.translate(cx, cy);
			// feet
			ctx.strokeStyle = '#e0a020';
			ctx.lineWidth = r * 0.1;
			ctx.lineCap = 'round';
			for (const fx of [-r * 0.28, r * 0.28]) {
				ctx.beginPath();
				ctx.moveTo(fx, r * 0.78);
				ctx.lineTo(fx, r * 1.02);
				ctx.stroke();
			}
			// tail feathers (back-left)
			ctx.fillStyle = s.bodyDark;
			tri(-r * 0.7, -r * 0.1, -r * 1.25, -r * 0.5, -r * 0.7, r * 0.35);
			// body
			ctx.fillStyle = s.body;
			ellipse(0, 0, r * 0.98, r * 0.9);
			// top shading
			ctx.fillStyle = s.bodyDark;
			ctx.globalAlpha = alpha * 0.5;
			ellipse(-r * 0.1, -r * 0.4, r * 0.7, r * 0.35);
			ctx.globalAlpha = alpha;
			// wing (flaps on fire)
			ctx.save();
			ctx.translate(r * 0.1, r * 0.05);
			ctx.rotate(-flap * 0.5);
			ctx.fillStyle = s.wing;
			ellipse(0, 0, r * 0.5, r * 0.34);
			ctx.strokeStyle = 'rgba(0,0,0,0.08)';
			ctx.lineWidth = 0.015;
			ctx.stroke();
			ctx.restore();
			// comb (double for twin)
			ctx.fillStyle = s.comb;
			for (const cxo of twin ? [-r * 0.25, r * 0.25] : [0]) {
				dot(cxo - r * 0.16, -r, r * 0.16);
				dot(cxo + r * 0.02, -r * 1.08, r * 0.18);
				dot(cxo + r * 0.2, -r, r * 0.15);
			}
			// wattle
			ctx.fillStyle = '#e34b4b';
			dot(r * 0.68, r * 0.28, r * 0.1);
			// beak (faces right, toward foxes)
			ctx.fillStyle = '#f0a830';
			tri(r * 0.72, -r * 0.02, r * 1.4, r * 0.14, r * 0.72, r * 0.3);
			// eye
			ctx.fillStyle = '#fff';
			dot(r * 0.34, -r * 0.26, r * 0.17);
			ctx.fillStyle = '#222';
			dot(r * 0.4, -r * 0.26, r * 0.09);
			ctx.fillStyle = '#fff';
			dot(r * 0.44, -r * 0.3, r * 0.03);
			ctx.restore();
		};
		const drawHay = (cx: number, cy: number, r: number, frac: number, alpha = 1): void => {
			const w = r * 1.9;
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.translate(cx, cy);
			ctx.fillStyle = frac > 0.4 ? '#c9a24a' : '#a9843a';
			const x = -w / 2;
			const rad = 0.08;
			ctx.beginPath();
			ctx.moveTo(x + rad, -w / 2);
			ctx.arcTo(x + w, -w / 2, x + w, w / 2, rad);
			ctx.arcTo(x + w, w / 2, x, w / 2, rad);
			ctx.arcTo(x, w / 2, x, -w / 2, rad);
			ctx.arcTo(x, -w / 2, x + w, -w / 2, rad);
			ctx.closePath();
			ctx.fill();
			ctx.strokeStyle = 'rgba(120,80,20,0.5)';
			ctx.lineWidth = 0.03;
			for (let i = -1; i <= 1; i++) {
				ctx.beginPath();
				ctx.moveTo(x, (i * w) / 3);
				ctx.lineTo(x + w, (i * w) / 3);
				ctx.stroke();
			}
			// binding rope
			ctx.strokeStyle = 'rgba(90,60,20,0.7)';
			ctx.lineWidth = 0.05;
			ctx.beginPath();
			ctx.moveTo(-w * 0.18, -w / 2);
			ctx.lineTo(-w * 0.18, w / 2);
			ctx.stroke();
			ctx.restore();
		};
		const drawMine = (cx: number, cy: number, r: number, armed: boolean, alpha = 1): void => {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.translate(cx, cy);
			// earth mound
			ctx.fillStyle = '#6a4a2a';
			ellipse(0, r * 0.35, r * 0.95, r * 0.55);
			ctx.fillStyle = '#5a3e22';
			ellipse(0, r * 0.5, r * 0.7, r * 0.32);
			// egg poking out
			ctx.fillStyle = '#fdf4dd';
			ellipse(0, -r * 0.05, r * 0.5, r * 0.62);
			ctx.strokeStyle = 'rgba(0,0,0,0.12)';
			ctx.lineWidth = 0.02;
			ctx.stroke();
			// fuse light
			ctx.fillStyle = armed ? '#e34b4b' : '#8a8f96';
			dot(0, -r * 0.5, r * 0.14);
			if (armed) {
				ctx.fillStyle = 'rgba(255,120,90,0.35)';
				dot(0, -r * 0.5, r * 0.26);
			}
			ctx.restore();
		};
		const drawTower = (t: Tower): void => {
			const bob = Math.sin(anim * 3 + t.id) * 0.02;
			const recoil = t.fireFlash > 0 ? (t.fireFlash / 0.18) * 0.06 : 0;
			const cx = t.col + 0.5 - recoil;
			let cy = t.row + 0.5 + bob;
			const r = 0.34;
			const frac = t.maxHp ? t.hp / t.maxHp : 1;
			if (t.type === 'costaude') drawHay(cx, cy, r, frac);
			else if (t.type === 'mine') drawMine(t.col + 0.5, t.row + 0.5, r, t.armed <= 0);
			else {
				if (t.type === 'laser') {
					const target = laserTarget(st, t);
					if (target) {
						const bx0 = t.col + 0.7;
						const by = t.row + 0.5 - 0.04;
						const bx1 = target.x - foxRadius(target.type) * 0.3;
						const flick = 0.7 + 0.3 * Math.abs(Math.sin(anim * 40 + t.id));
						ctx.save();
						ctx.lineCap = 'round';
						// outer glow
						ctx.globalAlpha = 0.3 * flick;
						ctx.strokeStyle = '#ff3b3b';
						ctx.lineWidth = 0.14;
						ctx.beginPath();
						ctx.moveTo(bx0, by);
						ctx.lineTo(bx1, by);
						ctx.stroke();
						// bright core
						ctx.globalAlpha = flick;
						ctx.strokeStyle = '#fff2f2';
						ctx.lineWidth = 0.04;
						ctx.beginPath();
						ctx.moveTo(bx0, by);
						ctx.lineTo(bx1, by);
						ctx.stroke();
						// impact burst
						ctx.globalAlpha = 0.85 * flick;
						ctx.fillStyle = '#ff6a4a';
						dot(bx1, by, 0.09 + 0.03 * Math.abs(Math.sin(anim * 30 + t.id)));
						ctx.fillStyle = '#fff';
						dot(bx1, by, 0.04);
						ctx.restore();
					}
				}
				if (t.type === 'pondeuse') {
					// Egg-in-progress: grows under the hen; she wiggles just before laying.
					const prog = clamp(t.timer / PROD_INTERVAL, 0, 1);
					const near = Math.max(0, (prog - 0.75) / 0.25);
					cy += near * Math.sin(anim * 18) * 0.02; // pre-lay wiggle
					const ex = t.col + 0.5;
					const ey = t.row + 0.82;
					const er = 0.05 + prog * 0.1;
					ctx.save();
					ctx.globalAlpha = 0.45 + prog * 0.55;
					if (near > 0) {
						ctx.fillStyle = `rgba(255,220,120,${0.35 * near})`;
						dot(ex, ey, er * 1.9); // almost-ready glow
					}
					ctx.fillStyle = '#fdf4dd';
					ellipse(ex, ey, er * 0.8, er);
					ctx.strokeStyle = 'rgba(0,0,0,0.12)';
					ctx.lineWidth = 0.015;
					ctx.stroke();
					ctx.restore();
				}
				const flap = t.fireFlash > 0 ? t.fireFlash / 0.18 : Math.max(0, Math.sin(anim * 3 + t.id)) * 0.25;
				drawHen(cx, cy, r, HEN_STYLE[t.type], flap, t.type === 'gemellaire');
			}
			hpBar(t.col + 0.5, t.row + 0.5, r, frac);
		};
		const drawFox = (f: Fox): void => {
			const s = FOX_STYLE[f.type];
			const mega = f.type === 'mega';
			const r = foxRadius(f.type);
			const cx = f.x;
			const cy = f.row + 0.5;
			const frac = f.maxHp ? Math.max(0, f.hp / f.maxHp) : 1;
			const alpha = f.x > COLS ? clamp(1 - (f.x - COLS) / APPROACH, 0.12, 1) : 1;

			// Creuseur burrowed: only a dirt mound + ears until midfield.
			if (f.type === 'creuseur' && f.x > COLS / 2) {
				ctx.save();
				ctx.globalAlpha = alpha;
				ctx.translate(cx, cy + 0.2);
				ctx.fillStyle = '#6a4a2a';
				ellipse(0, 0, r * 1.1, r * 0.5);
				ctx.fillStyle = '#5a3e22';
				ellipse(-r * 0.3 + Math.sin(anim * 8 + f.id) * 0.03, -r * 0.1, r * 0.4, r * 0.25);
				ctx.fillStyle = s.fur;
				tri(-r * 0.35, -r * 0.35, -r * 0.15, -r * 0.8, 0, -r * 0.3);
				tri(r * 0.1, -r * 0.35, r * 0.3, -r * 0.8, r * 0.45, -r * 0.3);
				ctx.restore();
				return;
			}

			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.translate(cx, cy);
			const run = f.eating ? 0 : Math.sin(anim * 12 + f.id * 1.7);
			const lunge = f.eating ? Math.max(0, Math.sin(anim * 14 + f.id)) * 0.05 : 0;
			ctx.translate(-lunge, 0);
			// legs
			ctx.strokeStyle = s.furDark;
			ctx.lineWidth = r * 0.16;
			ctx.lineCap = 'round';
			const leg = (lx: number, sw: number): void => {
				ctx.beginPath();
				ctx.moveTo(lx, r * 0.45);
				ctx.lineTo(lx + sw * r * 0.5, r * 1.0);
				ctx.stroke();
			};
			leg(-r * 0.45, run);
			leg(r * 0.4, -run);
			leg(-r * 0.15, -run * 0.7);
			leg(r * 0.12, run * 0.7);
			// tail (back-right) with pale tip
			ctx.save();
			ctx.rotate(Math.sin(anim * 5 + f.id) * 0.2);
			ctx.fillStyle = s.fur;
			tri(r * 0.7, -r * 0.2, r * 1.5, -r * 0.6, r * 0.8, r * 0.35);
			ctx.fillStyle = s.belly;
			dot(r * 1.4, -r * 0.55, r * 0.16);
			ctx.restore();
			// body
			ctx.fillStyle = s.fur;
			ellipse(0, 0, r * 1.05, r * 0.82);
			ctx.fillStyle = s.belly;
			ellipse(-r * 0.2, r * 0.25, r * 0.7, r * 0.4);
			ctx.fillStyle = s.furDark;
			ctx.globalAlpha = alpha * 0.4;
			ellipse(r * 0.15, -r * 0.4, r * 0.6, r * 0.3);
			ctx.globalAlpha = alpha;
			// armor plate for blindé
			if (f.type === 'blinde') {
				ctx.fillStyle = '#9aa0a8';
				ellipse(r * 0.05, -r * 0.15, r * 0.7, r * 0.5);
				ctx.fillStyle = '#c3c8ce';
				ellipse(r * 0.05, -r * 0.25, r * 0.5, r * 0.28);
				ctx.strokeStyle = 'rgba(0,0,0,0.2)';
				ctx.lineWidth = 0.02;
				ctx.beginPath();
				ctx.moveTo(r * 0.05, -r * 0.6);
				ctx.lineTo(r * 0.05, r * 0.3);
				ctx.stroke();
			}
			// head/snout (faces left)
			ctx.fillStyle = s.fur;
			ellipse(-r * 0.55, -r * 0.05, r * 0.55, r * 0.5);
			ctx.fillStyle = '#fff';
			dot(-r * 0.75, r * 0.12, r * 0.28);
			ctx.fillStyle = '#222';
			dot(-r * 1.02, r * 0.12, r * 0.08); // nose
			// ears
			ctx.fillStyle = s.fur;
			tri(-r * 0.75, -r * 0.4, -r * 0.55, -r * 1.15, -r * 0.3, -r * 0.45);
			tri(-r * 0.3, -r * 0.45, -r * 0.1, -r * 1.05, r * 0.05, -r * 0.4);
			ctx.fillStyle = s.furDark;
			tri(-r * 0.6, -r * 0.5, -r * 0.5, -r * 0.95, -r * 0.35, -r * 0.5);
			// eyes
			ctx.fillStyle = '#222';
			dot(-r * 0.45, -r * 0.12, r * 0.1);
			dot(-r * 0.08, -r * 0.12, r * 0.1);
			if (mega) {
				ctx.strokeStyle = '#111';
				ctx.lineWidth = 0.05;
				ctx.beginPath();
				ctx.moveTo(-r * 0.6, -r * 0.4);
				ctx.lineTo(-r * 0.3, -r * 0.22);
				ctx.moveTo(-r * 0.02, -r * 0.4);
				ctx.lineTo(-r * 0.28, -r * 0.22);
				ctx.stroke();
			}
			// frost tint
			if (f.slow > 0) {
				ctx.globalAlpha = alpha * 0.4;
				ctx.fillStyle = '#9fd0ff';
				ellipse(-r * 0.1, 0, r * 1.05, r * 0.85);
				ctx.globalAlpha = alpha;
			}
			ctx.restore();
			hpBar(cx, cy, r, frac);
		};
		const drawGrain = (g: Grain): void => {
			const cur = grainValue(g);
			const frac = g.value ? cur / g.value : 1;
			const bob = g.y >= g.rest ? Math.sin(anim * 4 + g.id) * 0.03 : 0;
			const x = g.x;
			const y = g.y + bob;
			const r = 0.19 * (0.82 + 0.18 * frac); // shrinks a touch as it decays
			const blink = g.ttl < 2 ? 0.55 + 0.45 * Math.abs(Math.sin(anim * 8)) : 1;
			ctx.save();
			ctx.globalAlpha = blink * (0.55 + 0.45 * frac); // dims as it decays
			// glow
			ctx.fillStyle = 'rgba(255,220,120,0.28)';
			dot(x, y, r * 1.6);
			// round wheat coin
			ctx.fillStyle = '#ffd85a';
			dot(x, y, r);
			ctx.strokeStyle = '#c9901f';
			ctx.lineWidth = 0.03;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.stroke();
			// wheat kernels
			ctx.fillStyle = '#e8a92a';
			for (let i = 0; i < 3; i++) ellipse(x - 0.05 + i * 0.05, y, 0.02, 0.05);
			ctx.fillStyle = 'rgba(255,255,255,0.75)';
			dot(x - r * 0.35, y - r * 0.35, r * 0.28);
			// countdown ring around the token (depletes over its lifetime)
			const ttlFrac = clamp(g.ttl / TOKEN_TTL, 0, 1);
			const tint = frac > 0.85 ? '#3ddc84' : frac > 0.6 ? '#ffcf4a' : '#ff6a4a';
			ctx.globalAlpha = blink;
			ctx.strokeStyle = 'rgba(0,0,0,0.18)';
			ctx.lineWidth = 0.045;
			ctx.beginPath();
			ctx.arc(x, y, r * 1.45, 0, Math.PI * 2);
			ctx.stroke();
			ctx.strokeStyle = tint;
			ctx.lineWidth = 0.05;
			ctx.beginPath();
			ctx.arc(x, y, r * 1.45, -Math.PI / 2, -Math.PI / 2 + ttlFrac * Math.PI * 2);
			ctx.stroke();
			ctx.restore();
			// value counter above the token (green → red as it loses worth)
			drawLabel(String(cur), x, y - r - 0.24, 0.3, tint, { stroke: 'rgba(0,0,0,0.6)', alpha: blink });
		};

		for (const e of st.eggs) {
			ctx.fillStyle = e.frost ? '#dff0ff' : '#fff6e0';
			ctx.strokeStyle = e.frost ? 'rgba(90,150,210,0.5)' : 'rgba(0,0,0,0.15)';
			ctx.lineWidth = 0.02;
			ctx.save();
			ctx.translate(e.x, e.row + 0.5);
			ctx.rotate(e.x * 6);
			ctx.beginPath();
			ctx.ellipse(0, 0, 0.11, 0.15, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			ctx.restore();
		}
		for (const t of st.towers) drawTower(t);
		for (const f of st.foxes) drawFox(f);
		for (const g of st.grains) drawGrain(g);

		// Particles.
		for (const p of partsRef.current) {
			const a = clamp(p.life / p.maxLife, 0, 1);
			ctx.globalAlpha = a;
			if (p.kind === 'text') {
				drawLabel(p.text ?? '', p.x, p.y, p.size, p.color, { stroke: 'rgba(0,0,0,0.5)', alpha: a });
			} else {
				ctx.fillStyle = p.color;
				dot(p.x, p.y, p.size);
			}
		}
		ctx.globalAlpha = 1;

		// Rebuild prompt on raided lanes.
		if (statusRef.current === 'playing') {
			for (let r = 0; r < LANES; r++) {
				if (!st.lostLanes[r]) continue;
				const afford = st.grain >= REBUY_COST;
				const pulse = 0.82 + 0.18 * Math.sin(anim * 4 + r);
				const label = `🔨 Reconstruire · ${REBUY_COST}`;
				const tx = COLS / 2;
				const ty = r + 0.5;
				const tw = measureLabel(label, 0.3);
				ctx.globalAlpha = afford ? pulse : 0.7;
				ctx.fillStyle = afford ? '#2f9e6f' : '#5a5148';
				roundRect(tx - tw / 2 - 0.18, ty - 0.26, tw + 0.36, 0.52, 0.14);
				ctx.fill();
				ctx.globalAlpha = 1;
				drawLabel(label, tx, ty, 0.3, afford ? '#fff' : '#cfc7bd');
			}
		}

		// Placement preview.
		const h = hoverRef.current;
		const sel = selectedRef.current;
		if (statusRef.current === 'playing' && h && sel && sel !== 'shovel') {
			const occupied = st.lostLanes[h.row] || st.towers.some((t) => t.row === h.row && t.col === h.col);
			ctx.fillStyle = occupied ? 'rgba(220,60,60,0.18)' : 'rgba(255,255,255,0.18)';
			ctx.fillRect(h.col, h.row, 1, 1);
			if (!occupied) {
				const cx = h.col + 0.5;
				const cy = h.row + 0.5;
				if (sel === 'costaude') drawHay(cx, cy, 0.34, 1, 0.55);
				else if (sel === 'mine') drawMine(cx, cy, 0.34, false, 0.55);
				else drawHen(cx, cy, 0.34, HEN_STYLE[sel], 0, sel === 'gemellaire', 0.55);
			}
		} else if (statusRef.current === 'playing' && h && sel === 'shovel') {
			ctx.fillStyle = 'rgba(220,60,60,0.2)';
			ctx.fillRect(h.col, h.row, 1, 1);
		}

		ctx.restore();
	}, []);

	/* ---------- Loop ---------- */
	const stop = useCallback(() => {
		runningRef.current = false;
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = 0;
	}, []);

	const triggerBump = (): void => {
		setGrainBump(true);
		if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
		bumpTimerRef.current = setTimeout(() => setGrainBump(false), 280);
	};

	const syncHud = (st: State): void => {
		if (st.grain > lastGrainRef.current) triggerBump();
		lastGrainRef.current = st.grain;
		setHud({ grain: Math.floor(st.grain), wave: st.wave, nests: st.lostLanes.filter((l) => !l).length, cd: { ...st.cooldowns } });
		if (st.score !== score) setScore(st.score);
		const hasMega = st.foxes.some((f) => f.type === 'mega');
		if (hasMega !== megaAlertRef.current) {
			megaAlertRef.current = hasMega;
			setMegaAlert(hasMega);
		}
	};

	const onGameOver = useCallback(() => {
		stop();
		const st = stateRef.current;
		const sc = st?.score ?? 0;
		setStat('over');
		setScore(sc);
		setBest((prev) => {
			const nb = Math.max(prev, sc);
			if (dailyRef.current) {
				const exhausted = triesRef.current >= MAX_TRIES;
				if (exhausted) setAlreadyPlayed(true);
				saveDailyRun(gameId, {
					startedAt: startRef.current,
					done: true,
					seed: seedRef.current,
					diffIndex: diffIdxRef.current,
					state: { best: nb, tries: triesRef.current } satisfies DailyState,
				});
			} else {
				try {
					localStorage.setItem(bestKey(DIFF_ORDER[diffIdxRef.current] ?? 'moyen'), String(nb));
				} catch {
					/* ignore */
				}
			}
			return nb;
		});
		trackGame(gameId, 'game_over', { score: sc });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gameId, stop]);

	const frame = useCallback(
		(now: number) => {
			if (!runningRef.current) return;
			const rawDt = Math.min(now - lastRef.current, 200);
			lastRef.current = now;
			const realDt = rawDt / 1000;
			animRef.current += realDt;
			accRef.current += rawDt;
			const st = stateRef.current!;
			const rng = rngRef.current;
			while (runningRef.current && accRef.current >= STEP) {
				accRef.current -= STEP;
				step(st, STEP / 1000, rng);
				if (st.over) break;
			}
			detectEvents(st);
			updateParticles(realDt);
			draw();
			if (++hudTickRef.current % 6 === 0) syncHud(st);
			if (st.over) {
				syncHud(st);
				onGameOver();
				return;
			}
			rafRef.current = requestAnimationFrame(frame);
			// eslint-disable-next-line react-hooks/exhaustive-deps
		},
		[draw, onGameOver],
	);

	const resetFx = (st: State): void => {
		partsRef.current = [];
		prevFoxRef.current.clear();
		prevTowerRef.current.clear();
		prevEggRef.current.clear();
		prevGrainRef.current.clear();
		prevLostRef.current = [...st.lostLanes];
		if (laneAlertTimerRef.current) clearTimeout(laneAlertTimerRef.current);
		setLaneAlert(false);
		animRef.current = 0;
		lastGrainRef.current = st.grain;
	};

	const start = useCallback(() => {
		if (dailyRef.current && triesRef.current >= MAX_TRIES) return;
		stateRef.current = createGame(diffIdxRef.current, mulberry32(seedRef.current));
		rngRef.current = mulberry32(seedRef.current ^ 0x9e3779b9);
		accRef.current = 0;
		lastRef.current = performance.now();
		startRef.current = Date.now();
		runningRef.current = true;
		resetFx(stateRef.current);
		setScore(0);
		setHud({ grain: Math.floor(stateRef.current.grain), wave: 0, nests: LANES, cd: {} });
		megaAlertRef.current = false;
		setMegaAlert(false);
		selectCard(null);
		setStat('playing');
		setAttempt((a) => a + 1);
		trackGame(gameId, 'game_started');
		if (dailyRef.current) {
			triesRef.current += 1;
			setTries(triesRef.current);
			saveDailyRun(gameId, {
				startedAt: startRef.current,
				done: false,
				seed: seedRef.current,
				diffIndex: diffIdxRef.current,
				state: { best, tries: triesRef.current } satisfies DailyState,
			});
		}
		draw();
		rafRef.current = requestAnimationFrame(frame);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gameId, best, draw, frame]);

	/* ---------- Modes ---------- */
	const armFree = useCallback(
		(key: DiffKey) => {
			stop();
			dailyRef.current = false;
			setDaily(false);
			setAlreadyPlayed(false);
			setDailyLoading(false);
			triesRef.current = 0;
			setTries(0);
			setDiffKey(key);
			diffIdxRef.current = DIFF_ORDER.indexOf(key);
			seedRef.current = (Math.random() * 2 ** 32) >>> 0;
			stateRef.current = createGame(diffIdxRef.current, mulberry32(seedRef.current));
			resetFx(stateRef.current);
			selectCard(null);
			setStat('ready');
			setScore(0);
			setHud({ grain: Math.floor(stateRef.current.grain), wave: 0, nests: LANES, cd: {} });
			let b = 0;
			try {
				b = Number(localStorage.getItem(bestKey(key))) || 0;
			} catch {
				/* ignore */
			}
			setBest(b);
			draw();
			// eslint-disable-next-line react-hooks/exhaustive-deps
		},
		[stop, draw],
	);

	const startDaily = useCallback(async () => {
		stop();
		dailyRef.current = true;
		setDaily(true);
		selectCard(null);
		const applyDaily = (seed: number, diffIndex: number, run: DailyState | null): void => {
			seedRef.current = seed >>> 0;
			diffIdxRef.current = diffIndex;
			setDiffKey(DIFF_ORDER[diffIndex] ?? 'moyen');
			triesRef.current = run?.tries ?? 0;
			setTries(triesRef.current);
			const b = run?.best ?? 0;
			setBest(b);
			stateRef.current = createGame(diffIndex, mulberry32(seedRef.current));
			resetFx(stateRef.current);
			setScore(0);
			setHud({ grain: Math.floor(stateRef.current.grain), wave: 0, nests: LANES, cd: {} });
			const exhausted = triesRef.current >= MAX_TRIES;
			setAlreadyPlayed(exhausted);
			setStat(exhausted ? 'over' : 'ready');
			draw();
		};

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			applyDaily(run.seed, run.diffIndex ?? dailyDifficultyIndex(), (run.state as DailyState) ?? null);
			setDailyLoading(false);
			return;
		}
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		applyDaily(seed, diffIndex, null);
		setDailyLoading(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gameId, stop, draw]);

	/* ---------- Canvas sizing ---------- */
	const resize = useCallback(() => {
		const cv = canvasRef.current;
		const wrap = wrapRef.current;
		if (!cv || !wrap) return;
		const cssW = wrap.clientWidth;
		const cssH = (cssW * VIEW_H) / VIEW_W;
		const dpr = window.devicePixelRatio || 1;
		cv.style.height = `${cssH}px`;
		cv.width = Math.round(cssW * dpr);
		cv.height = Math.round(cssH * dpr);
		scaleRef.current = cssW / VIEW_W;
		const ctx = cv.getContext('2d');
		if (ctx) ctx.setTransform(dpr * scaleRef.current, 0, 0, dpr * scaleRef.current, 0, 0);
		draw();
	}, [draw]);

	useEffect(() => {
		resize();
		armFree('moyen');
		const ro = new ResizeObserver(() => resize());
		if (wrapRef.current) ro.observe(wrapRef.current);
		return () => {
			ro.disconnect();
			stop();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* Auto-pause when the tab is hidden. */
	useEffect(() => {
		const onVis = (): void => {
			if (document.hidden) {
				if (runningRef.current) stop();
			} else if (statusRef.current === 'playing' && !runningRef.current) {
				lastRef.current = performance.now();
				runningRef.current = true;
				rafRef.current = requestAnimationFrame(frame);
			}
		};
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	}, [frame, stop]);

	/* ---------- Pointer (collect / place / remove) ---------- */
	const worldFrom = (e: React.PointerEvent): { wx: number; wy: number } | null => {
		const cv = canvasRef.current;
		if (!cv) return null;
		const rect = cv.getBoundingClientRect();
		const wx = ((e.clientX - rect.left) / rect.width) * VIEW_W - HENHOUSE_W;
		const wy = ((e.clientY - rect.top) / rect.height) * VIEW_H - VERT_PAD;
		return { wx, wy };
	};
	const cellFrom = (e: React.PointerEvent): { row: number; col: number } | null => {
		const w = worldFrom(e);
		if (!w) return null;
		const col = Math.floor(w.wx);
		const row = Math.floor(w.wy);
		if (row < 0 || row >= LANES || col < 0 || col >= COLS) return null;
		return { row, col };
	};
	const grainAt = (wx: number, wy: number): Grain | undefined => {
		const st = stateRef.current;
		if (!st) return undefined;
		let best: Grain | undefined;
		let bestD = 0.34 * 0.34;
		for (const g of st.grains) {
			const dx = g.x - wx;
			const dy = g.y - wy;
			const d = dx * dx + dy * dy;
			if (d < bestD) {
				bestD = d;
				best = g;
			}
		}
		return best;
	};
	const onPointerMove = (e: React.PointerEvent): void => {
		hoverRef.current = cellFrom(e);
	};
	const onPointerDown = (e: React.PointerEvent): void => {
		if (statusRef.current !== 'playing') return;
		const st = stateRef.current;
		if (!st) return;
		const w = worldFrom(e);
		if (w) {
			const g = grainAt(w.wx, w.wy);
			if (g) {
				collectGrain(st, g.id);
				setHud((h) => ({ ...h, grain: Math.floor(st.grain) }));
				draw();
				return;
			}
			// Click a raided lane to rebuild its nest.
			const row = Math.floor(w.wy);
			if (row >= 0 && row < LANES && st.lostLanes[row]) {
				if (rebuyLane(st, row)) {
					emitRebuild(row);
					setHud((h) => ({ ...h, grain: Math.floor(st.grain), nests: st.lostLanes.filter((l) => !l).length }));
				}
				draw();
				return;
			}
		}
		const cell = cellFrom(e);
		const sel = selectedRef.current;
		if (!cell || !sel) return;
		if (sel === 'shovel') {
			st.towers = st.towers.filter((t) => !(t.row === cell.row && t.col === cell.col));
			selectCard(null);
		} else if (placeTower(st, sel, cell.row, cell.col)) {
			selectCard(null);
		}
		setHud((h) => ({ ...h, grain: Math.floor(st.grain), cd: { ...st.cooldowns } }));
		draw();
	};

	const affordable = (type: TowerType): boolean => hud.grain >= TOWER[type].cost && (hud.cd[type] ?? 0) <= 0;

	return (
		<div className="cr-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => armFree(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="cr-daily-tag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label} · Essai ${Math.min(tries, MAX_TRIES)}/${MAX_TRIES}`}
				</div>
			) : (
				<div className="cr-bar">
					<div className="cr-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as DiffKey[]).map((k) => (
							<button key={k} role="tab" aria-selected={diffKey === k} className={`cr-pill ${diffKey === k ? 'active' : ''}`} onClick={() => armFree(k)}>
								{DIFFS[k].label}
							</button>
						))}
					</div>
				</div>
			)}

			<div className="cr-hud">
				<span className={`cr-grain ${grainBump ? 'bump' : ''}`}>🌾 <strong>{hud.grain}</strong></span>
				<span className="cr-scorepill">Vague <strong>{hud.wave}</strong></span>
				<span className="cr-scorepill">Nids <strong>{hud.nests}</strong></span>
				<span className="cr-scorepill">Renards <strong>{score}</strong></span>
				<span className="cr-scorepill">Record <strong>{best}</strong></span>
			</div>

			<div className="cr-cards">
				{TOWER_ORDER.map((type) => {
					const ok = affordable(type);
					const cd = hud.cd[type] ?? 0;
					return (
						<button
							key={type}
							className={`cr-card ${selected === type ? 'sel' : ''} ${ok ? '' : 'disabled'}`}
							onClick={() => selectCard(selected === type ? null : type)}
							disabled={status !== 'playing' || !ok}
							title={`${TOWER[type].label} — ${TOWER[type].cost} grain`}
						>
							<span className="cr-card-emoji">{CARD[type].emoji}</span>
							<span className="cr-card-cost">{TOWER[type].cost}</span>
							{cd > 0 && <span className="cr-card-cd" style={{ height: `${Math.min(100, (cd / TOWER[type].cooldown) * 100)}%` }} />}
						</button>
					);
				})}
				<button
					className={`cr-card shovel ${selected === 'shovel' ? 'sel' : ''}`}
					onClick={() => selectCard(selected === 'shovel' ? null : 'shovel')}
					disabled={status !== 'playing'}
					title="Retirer une cocotte"
				>
					<span className="cr-card-emoji">🧹</span>
				</button>
				<button
					className={`cr-card shovel ${showInfo ? 'sel' : ''}`}
					onClick={() => setShowInfo((v) => !v)}
					title="Infos sur les défenses"
					aria-expanded={showInfo}
				>
					<span className="cr-card-emoji">❓</span>
				</button>
			</div>

			<div className="cr-desc">
				{selected === 'shovel'
					? <>🧹 <strong>Balai</strong> — {SHOVEL_DESC}</>
					: selected
						? <>{CARD[selected].emoji} <strong>{TOWER[selected].label}</strong> · {TOWER[selected].cost} blé — {CARD[selected].desc}</>
						: <span className="cr-desc-hint">Sélectionne une carte pour voir son rôle, ou ❓ pour tout afficher.</span>}
			</div>

			{showInfo && (
				<div className="cr-info-panel">
					{TOWER_ORDER.map((t) => (
						<div key={t} className="cr-info-row">
							<span className="cr-info-emoji">{CARD[t].emoji}</span>
							<span><strong>{TOWER[t].label}</strong> · {TOWER[t].cost} grain — {CARD[t].desc}</span>
						</div>
					))}
					<div className="cr-info-row">
						<span className="cr-info-emoji">🧹</span>
						<span><strong>Balai</strong> — {SHOVEL_DESC}</span>
					</div>
					<div className="cr-info-row">
						<span className="cr-info-emoji">🌾</span>
						<span><strong>Blé</strong> — La monnaie. Un jeton laissé trop longtemps perd de la valeur (compteur au-dessus) puis est encaissé au minimum. Ramasse-le vite&nbsp;!</span>
					</div>
					<div className="cr-info-row">
						<span className="cr-info-emoji">🔨</span>
						<span><strong>Reconstruire un nid</strong> · {REBUY_COST} blé — Clique une ligne perdue pour relever son nid et la rendre à nouveau jouable.</span>
					</div>
				</div>
			)}

			{megaAlert && status === 'playing' && <div className="cr-mega-alert">🦊 Méga renard&nbsp;! La meute se renforce</div>}
			{laneAlert && status === 'playing' && <div className="cr-mega-alert cr-lane-alert">💔 Un nid a été pillé&nbsp;! Défends les lignes restantes</div>}

			<div className="cr-playwrap" ref={wrapRef}>
				<canvas
					ref={canvasRef}
					className="cr-canvas"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerLeave={() => (hoverRef.current = null)}
				/>

				{status === 'ready' && !dailyLoading && (
					<div className="cr-overlay">
						<button className="cr-startbtn" onClick={start}>▶ Commencer</button>
					</div>
				)}
				{daily && dailyLoading && <div className="cr-overlay"><div className="cr-overlay-card">Préparation du défi…</div></div>}
				{status === 'over' && (
					<div className="cr-overlay">
						<div className="cr-overlay-card cr-over">
							{daily && alreadyPlayed ? (
								<>Défi du jour terminé · <strong>{best}</strong><span>reviens demain&nbsp;!</span></>
							) : (
								<>
									<span className="cr-over-title">🦊 Tous les nids ont été pillés&nbsp;!</span>
									<span>Renards repoussés : <strong>{score}</strong></span>
									{daily
										? <button className="cr-replay" onClick={start}>↻ Rejouer ({MAX_TRIES - tries} restant{MAX_TRIES - tries > 1 ? 's' : ''})</button>
										: <button className="cr-replay" onClick={() => armFree(diffKey)}>↻ Rejouer</button>}
								</>
							)}
						</div>
					</div>
				)}
			</div>

			<p className="cr-help">
				Sélectionne une cocotte puis clique une case pour la poser. Ramasse vite les jetons de blé&nbsp;: ils perdent de la valeur avec le temps (compteur au-dessus). Si un renard atteint un nid, la ligne est perdue — clique-la pour la reconstruire ({REBUY_COST}&nbsp;blé). Tu perds quand il ne reste plus aucun nid.
			</p>

			{daily && <Leaderboard key={`lb-${gameId}-${attempt}`} game={gameId} metric="score" submitValue={status === 'over' && !alreadyPlayed ? best : undefined} />}
			{!daily && <LeaderboardCorner game={gameId} metric="score" />}
		</div>
	);
}

const CSS = `
.cr-root { --cr-accent: var(--accent-regular); width: 100%; max-width: 640px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.cr-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.5rem; }
.cr-bar { width: 100%; display: flex; justify-content: center; margin-bottom: 0.5rem; }
.cr-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.cr-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.cr-pill.active { background: var(--cr-accent); color: var(--accent-text-over); border-color: var(--cr-accent); }
.cr-hud { display: flex; gap: 0.5rem; align-items: center; font-size: 14px; font-weight: 600; margin-bottom: 0.55rem; flex-wrap: wrap; justify-content: center; }
.cr-grain { background: #3a2f14; color: #ffe08a; border-radius: 999px; padding: 6px 14px; font-variant-numeric: tabular-nums; transition: transform 0.1s ease; }
.cr-grain.bump { animation: cr-bump 0.28s ease; }
@keyframes cr-bump { 0% { transform: scale(1); } 40% { transform: scale(1.18); background: #5a4720; } 100% { transform: scale(1); } }
.cr-scorepill { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 12px; font-variant-numeric: tabular-nums; }
.cr-grain strong, .cr-scorepill strong { margin-left: 3px; }
.cr-cards { display: flex; gap: 5px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.6rem; }
.cr-card { position: relative; overflow: hidden; width: 56px; border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); border-radius: 10px; padding: 5px 3px 3px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.cr-card.sel { border-color: var(--cr-accent); box-shadow: 0 0 0 2px var(--cr-accent); }
.cr-card.disabled, .cr-card:disabled { opacity: 0.45; cursor: not-allowed; }
.cr-card-emoji { font-size: 20px; line-height: 1; }
.cr-card-cost { font-size: 11.5px; font-weight: 700; color: #ffe08a; }
.cr-card-cd { position: absolute; left: 0; bottom: 0; width: 100%; background: rgba(0,0,0,0.55); pointer-events: none; }
.cr-card.shovel { width: 46px; justify-content: center; }
.cr-desc { margin-bottom: 0.55rem; width: 100%; max-width: 560px; min-height: 46px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 12.5px; line-height: 1.45; color: var(--gray-200); background: var(--gray-900); border-radius: 10px; padding: 6px 14px; }
.cr-desc strong { color: var(--gray-0); }
.cr-desc-hint { color: var(--gray-400); }
.cr-info-panel { margin-bottom: 0.6rem; max-width: 560px; background: var(--gray-900); border: 1px solid var(--gray-700); border-radius: 12px; padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; line-height: 1.45; color: var(--gray-200); }
.cr-info-row { display: flex; gap: 8px; align-items: baseline; text-align: left; }
.cr-info-emoji { font-size: 15px; flex: 0 0 auto; }
.cr-info-row strong { color: var(--gray-0); }
.cr-mega-alert { margin-bottom: 0.5rem; background: #b0281f; color: #fff; font-weight: 800; font-size: 13px; letter-spacing: 0.2px; border-radius: 999px; padding: 6px 16px; box-shadow: var(--shadow-md); animation: cr-pulse 0.9s ease-in-out infinite; }
.cr-lane-alert { background: #b45309; }
@keyframes cr-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.72; transform: scale(1.05); } }
@media (prefers-reduced-motion: reduce) { .cr-mega-alert, .cr-grain.bump { animation: none; } }
.cr-playwrap { width: 100%; position: relative; border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-sm); }
.cr-canvas { display: block; width: 100%; touch-action: none; user-select: none; -webkit-user-select: none; }
.cr-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.25); }
.cr-overlay-card { background: var(--gray-999); border: 2px solid var(--cr-accent); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); color: var(--gray-0); text-align: center; }
.cr-over { display: flex; flex-direction: column; gap: 8px; align-items: center; font-size: 15px; }
.cr-over-title { font-size: 17px; font-weight: 700; }
.cr-over strong { color: var(--cr-accent); font-variant-numeric: tabular-nums; }
.cr-over span { color: var(--gray-200); }
.cr-startbtn, .cr-replay { border: none; background: var(--cr-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 16px; border-radius: 999px; padding: 12px 32px; cursor: pointer; box-shadow: var(--shadow-lg); }
.cr-replay { font-size: 14px; padding: 9px 20px; margin-top: 2px; }
.cr-help { max-width: 520px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1rem; }
`;
