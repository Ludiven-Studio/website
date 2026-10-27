import { createContext, useContext, useState, useEffect, useRef, useCallback, type KeyboardEvent as KeyEvent, type RefObject } from 'react';
import {
	CENTRE_ORDER,
	FIRE_FULL,
	MAX_RANK,
	N,
	STEP_MOVES,
	breathe,
	canBreathe,
	cloneState,
	createGame,
	movesLeft,
	outOfMoves,
	endlessStep,
	findGroups,
	nextCentre,
	play,
	slide,
	upcoming,
	type Arrival,
	type Block,
	type Burst,
	type Dir,
	type EclatsCfg,
	type Kind,
	type State,
	type Step,
} from './engine';
import { DAILY, TIERS, TIER_ORDER, WORLDS, eclatsLevels, worldOf, type TierKey } from './levels';
import * as sfx from './sfx';
import { encodePacked, fmtCentis, formatScore } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import { trackGame } from '../../lib/analytics';
import { isTypingTarget } from '../../lib/keyboard';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun, type DailyRun } from '../../lib/leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import ModeToggle from '../../components/ModeToggle';
import DailyDone from '../../components/DailyDone';
import GiveUp from '../../components/GiveUp';
import { useLevels } from '../../lib/useLevels';
import { usePlayClock } from '../../lib/usePlayClock';
import { usePointerDrag } from '../usePointerDrag';
import { withExpert } from '../../lib/difficulty';

/* =====================================================
   DRAGON'S GEMS SWIPE (gameId eclats) — « Glisse et explose ». React island (SVG).
   Swipe: every block slides to the wall; three of a colour touching explode, four or more fuse
   into a stronger gem, the board slides again and refills from the edge and the centre, wave
   after wave. Open the chests: each pops out big and pours its coins into the loot, which goes
   to Bijou's treasure at the end. Every gem destroyed fills Bijou's gauge; full, a tap on him sends
   three fireballs onto the board. Engine: ./engine (pure, tested). Each move comes back as a
   timeline of steps that this file plays one by one.
   ===================================================== */

type Mode = 'levels' | 'daily' | 'free';
type Phase = 'ready' | 'idle' | 'busy' | 'over';

const U = 10; // SVG units per cell
const SLIDE_MS = 140;
const ARRIVE_MS = 150;
const GLOW_MS = 120;
const POP_MS = 300;
const COMET_MS = 380;
const SWIPE_PX = 16;
const TUG_START_PX = 8; // a starting swipe tugs the blocks it would move once it has a direction
const TUG = 0.25 * U;
const TUG_OUT_MS = 500;
const TUG_BACK_MS = 200;
const TUG_EVERY_MS = 1000; // a finger that holds tugs them again, after 0.3 s at rest
// The app's DOTween eases. Out: OutCubic, exact as this bezier, the elastic holding the block back. Back: OutBack
// (overshoot 2.2), 15 % past its place at 108 ms, sampled since CSS linear() easing throws on iOS before 17.2.
const TUG_OUT_EASE = 'cubic-bezier(.3333, 1, .6667, 1)';
const TUG_BACK_CURVE = Array.from({ length: 21 }, (_, i) => {
	const u = i / 20 - 1, s = 2.2;
	return -(s + 1) * u ** 3 - s * u ** 2;
});
const DIR_VEC: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const LB_ID = (gameId: string): string => `${gameId}-t`;
const recordKey = (t: TierKey): string => `eclats-score-${t}`;
const RANK_NAMES = ['', '', 'Gemme chargée', 'Joyau', 'Couronne'];
const HOARD_KEY = 'ludiven-eclats-hoard';
const CHEST_GOLD = 10; // a chest's coins, times the wave that opened it, doubled if it had a padlock
const HOARD_TIERS = [500, 2000, 5000]; // the pile under Bijou grows a size at each
const BIG = 2.2; // how much an opening chest grows
const REACT_MS = 1500;
const BALL_MS = 420; // a fireball's flight from Bijou to the board
const BALL_GAP = 170; // between two fireballs

/** Gem colours, each with its own cut so they read without the colours. */
const GEMS = [
	{ fill: '#ec4f73', dark: '#a3203f' },
	{ fill: '#3f91f2', dark: '#1d4f9e' },
	{ fill: '#33c27a', dark: '#167444' },
	{ fill: '#f6b92e', dark: '#a56d09' },
	{ fill: '#a970f2', dark: '#5b2ea6' },
];

const starPath = (r: number, n: number, inner: number): string => {
	const pts: string[] = [];
	for (let i = 0; i < n * 2; i++) {
		const a = (Math.PI * i) / n - Math.PI / 2;
		const rad = i % 2 === 0 ? r : inner;
		pts.push(`${(Math.cos(a) * rad).toFixed(2)},${(Math.sin(a) * rad).toFixed(2)}`);
	}
	return `M${pts.join('L')}Z`;
};
const poly = (r: number, n: number, rot: number): string => {
	const pts: string[] = [];
	for (let i = 0; i < n; i++) {
		const a = (Math.PI * 2 * i) / n + rot;
		pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
	}
	return `M${pts.join('L')}Z`;
};
const CUTS = ['', 'M0,-4.6L4.6,0L0,4.6L-4.6,0Z', poly(4.4, 6, Math.PI / 6), 'M0,-4.4L4.5,3.4L-4.5,3.4Z', starPath(4.8, 5, 2.3)];
const SPARK = starPath(1.1, 4, 0.35);
const CROWN = 'M-2.6,-3.6L-2.6,-5.9L-1.3,-4.7L0,-6.4L1.3,-4.7L2.6,-5.9L2.6,-3.6Z';
const RAYS = Array.from({ length: 8 }, (_, k) => {
	const a = (Math.PI * k) / 4;
	return `M${(Math.cos(a) * 4.6).toFixed(2)},${(Math.sin(a) * 4.6).toFixed(2)}L${(Math.cos(a) * 6.6).toFixed(2)},${(Math.sin(a) * 6.6).toFixed(2)}`;
}).join('');

/* ---------- Daily save ---------- */

const GEN_V = 4;
const KINDS: Kind[] = ['gem', 'chest', 'rock'];

interface SavedRun {
	v: number;
	// kind, colour, ice, lock, rank, and whether a chest was ever locked (it pays double once open)
	cells: ([number, number, number, number, number, number?] | null)[];
	moves: number;
	arrivals: number;
	centred: number;
	opened: number;
	score: number;
	butin: number;
	fire?: number; // absent from runs saved before the gauge
	quit?: boolean; // given up; absent from runs saved before it, whose `abandoned` is set by any loss
}

const packRun = (s: State, butin: number, locked: Set<number>, quit = false): SavedRun => ({
	v: GEN_V,
	cells: s.cells.map((b) => (b ? [KINDS.indexOf(b.kind), b.color, b.ice ? 1 : 0, b.lock ? 1 : 0, b.rank, locked.has(b.id) ? 1 : 0] : null)),
	moves: s.moves,
	arrivals: s.arrivals,
	centred: s.centred,
	opened: s.opened,
	score: s.score,
	butin,
	fire: s.fire,
	quit,
});

const isCurrentRun = (saved: unknown): boolean => (saved as SavedRun | null)?.v === GEN_V;

/** Rebuild a saved attempt. Null if it belongs to another version. */
function unpackRun(saved: unknown, cfg: EclatsCfg): State | null {
	const o = saved as SavedRun | null;
	if (!o || o.v !== GEN_V || !Array.isArray(o.cells) || o.cells.length !== N * N) return null;
	const s = createGame(cfg);
	s.cells = o.cells.map((b) => (b ? { id: s.nextId++, kind: KINDS[b[0]] ?? 'gem', color: b[1], ice: !!b[2], lock: !!b[3], rank: b[4] || 1 } : null));
	s.moves = o.moves;
	s.arrivals = o.arrivals;
	s.centred = o.centred;
	s.opened = o.opened;
	s.score = o.score;
	s.fire = o.fire ?? 0;
	return s;
}

/* ---------- Sprites ---------- */

// Drawn by Codex (scripts/eclats-sprites.mjs). The flat drawings below stay as the fallback: while the
// sprites load, offline (images are not precached), or if one is missing.
const art = (name: string): string => `/assets/jeux/eclats/${name}.webp`;
const SPRITES = [
	...[0, 1, 2, 3, 4].flatMap((c) => [`gem-${c}`, `gem-${c}-r2`, `gem-${c}-r3`, `gem-${c}-r4`]),
	'chest', 'chest-locked', 'rock', 'coin', 'fx-burst', 'fx-sparkle', 'fx-ring', 'fx-comet',
];
let spritesLoaded = false;
const ArtCtx = createContext(false);

/** True once every sprite has loaded; never switches halfway, so the board is all art or all flat. */
function useSprites(): boolean {
	const [ok, setOk] = useState(spritesLoaded);
	useEffect(() => {
		if (spritesLoaded) return;
		let alive = true;
		const load = (name: string): Promise<void> =>
			new Promise((res, rej) => {
				const im = new Image();
				im.onload = () => res();
				im.onerror = rej;
				im.src = art(name);
			});
		Promise.all(SPRITES.map(load)).then(
			() => {
				spritesLoaded = true;
				if (alive) setOk(true);
			},
			() => { /* keep the flat drawings */ },
		);
		return () => { alive = false; };
	}, []);
	return ok;
}

const gemSprite = (color: number, rank: number): string => art(rank >= 2 ? `gem-${color % 5}-r${Math.min(MAX_RANK, rank)}` : `gem-${color % 5}`);

// Bijou and his treasure (tickets 0043-0044). Each drawing counts on its own: a missing pose falls back
// to the idle one, and without that one Bijou stays hidden.
const EXTRA = [
	'bijou-idle', 'bijou-blink', 'bijou-cheer', 'bijou-wow', 'bijou-fly', 'bijou-scared', 'bijou-sad', 'bijou-dance-1', 'bijou-dance-2', 'bijou-sleep',
	'chest-open', 'fx-rays', 'hoard-1', 'hoard-2', 'hoard-3', 'hoard-4',
	'bijou-ready', 'bijou-breath', 'fx-fireball', 'fx-flame',
];
const extraLoaded = new Set<string>();

function useExtraArt(): Set<string> {
	const [got, setGot] = useState(() => new Set(extraLoaded));
	useEffect(() => {
		let alive = true;
		for (const name of EXTRA) {
			if (extraLoaded.has(name)) continue;
			const im = new Image();
			im.onload = () => {
				extraLoaded.add(name);
				if (alive) setGot(new Set(extraLoaded));
			};
			im.src = art(name);
		}
		return () => { alive = false; };
	}, []);
	return got;
}

type Mood = 'idle' | 'wow' | 'cheer' | 'fly' | 'scared' | 'sad' | 'dance' | 'sleep' | 'ready' | 'breath';
const POSE: Record<Mood, string> = {
	idle: 'bijou-idle', wow: 'bijou-wow', cheer: 'bijou-cheer', fly: 'bijou-fly', scared: 'bijou-scared', sad: 'bijou-sad', dance: 'bijou-dance-1', sleep: 'bijou-sleep',
	ready: 'bijou-ready', breath: 'bijou-breath',
};
// A pose not drawn yet borrows the nearest one: the round mouth of wonder blows well enough.
const STAND_IN: Record<string, string> = { 'bijou-breath': 'bijou-wow' };
const MOOD_RANK: Partial<Record<Mood, number>> = { wow: 1, cheer: 2, fly: 3, breath: 4 };
const hoardTier = (gold: number): number => 1 + HOARD_TIERS.filter((t) => gold >= t).length;
const noteLocked = (seen: Set<number>, cells: (Block | null)[]): void => {
	for (const b of cells) if (b?.kind === 'chest' && b.lock) seen.add(b.id);
};
const fmtGold = (n: number): string => n.toLocaleString('fr-FR');
const chestsWord = (n: number): string => `${n} coffre${n > 1 ? 's' : ''}`;

/**
 * Bijou on his pile of gold, at the board's corner. He blinks at rest; the game sets his mood. With
 * `onTap` (his gauge is full) he is a button: a tap and he breathes.
 */
function Bijou({ mood, hoard, got, grew, onTap, boxRef }: { mood: Mood; hoard: number; got: Set<string>; grew: number; onTap?: () => void; boxRef: RefObject<HTMLDivElement | null> }) {
	const [blink, setBlink] = useState(false);
	useEffect(() => {
		if (mood !== 'idle') return;
		let t = 0;
		const loop = (): void => {
			t = window.setTimeout(() => {
				setBlink(true);
				t = window.setTimeout(() => {
					setBlink(false);
					loop();
				}, 150);
			}, 2400 + Math.random() * 2600);
		};
		loop();
		return () => {
			clearTimeout(t);
			setBlink(false);
		};
	}, [mood]);
	if (!got.has('bijou-idle')) return null;
	const pose = (name: string): string => art(got.has(name) ? name : got.has(STAND_IN[name]) ? STAND_IN[name] : 'bijou-idle');
	const tier = hoardTier(hoard);
	const pile = `hoard-${tier}`;
	const role = onTap
		? {
			role: 'button',
			tabIndex: 0,
			'aria-label': 'Bijou est prêt : touche-le pour cracher trois boules de feu',
			onClick: onTap,
			onKeyDown: (e: KeyEvent) => {
				if (e.key !== 'Enter' && e.key !== ' ') return;
				e.preventDefault();
				e.stopPropagation();
				onTap();
			},
		}
		: { role: 'img', 'aria-label': `Bijou, le bébé dragon, sur son trésor de ${fmtGold(hoard)} pièces` };
	return (
		<div ref={boxRef} className={`ec-bijou m-${mood} t${tier}${onTap ? ' tap' : ''}`} {...role}>
			{got.has(pile) && <img key={`p${grew}`} src={art(pile)} alt="" className={`ec-pile${grew ? ' grew' : ''}`} />}
			{mood === 'dance' && got.has('bijou-dance-2') ? (
				<span className="ec-drake ec-dance">
					<img src={pose('bijou-dance-1')} alt="" />
					<img src={pose('bijou-dance-2')} alt="" />
				</span>
			) : (
				<img src={pose(blink && mood === 'idle' ? 'bijou-blink' : POSE[mood])} alt="" className="ec-drake" />
			)}
			<span className="ec-hoardtag">🪙 {fmtGold(hoard)}</span>
		</div>
	);
}

/* ---------- Drawing ---------- */

/** A gem; each rank adds its mark (glow, gold setting, crown) so the rank reads still and without colour. */
function Gem({ color, rank }: { color: number; rank: number }) {
	const withArt = useContext(ArtCtx);
	const c = GEMS[color % GEMS.length];
	if (withArt) {
		return (
			<g className={rank >= 2 ? `ec-rank r${rank}` : undefined}>
				{rank >= 3 && <circle r={6.4} className="ec-halo art" fill="url(#ec-halo)" />}
				{rank >= MAX_RANK && <path d={RAYS} className="ec-rays" />}
				<image href={gemSprite(color, rank)} x={-5.4} y={-5.4} width={10.8} height={10.8} className={rank === 2 ? 'ec-charged' : undefined} />
				{rank === 2 && (
					<>
						<image href={art('fx-sparkle')} x={1.8} y={-5.6} width={3.6} height={3.6} className="ec-twinkle" />
						<image href={art('fx-sparkle')} x={-5.4} y={1.8} width={3} height={3} className="ec-twinkle t2" />
					</>
				)}
				{rank === 3 && (
					<g className="ec-orbit">
						{[0, 1, 2].map((k) => <circle key={k} r={0.6} cx={Math.cos((k * Math.PI * 2) / 3) * 5.4} cy={Math.sin((k * Math.PI * 2) / 3) * 5.4} />)}
					</g>
				)}
			</g>
		);
	}
	const cut = CUTS[color % CUTS.length];
	const rim = rank >= 2 ? '#fff' : c.dark;
	const scale = [1, 1, 1.06, 1.1, 1.06][Math.min(MAX_RANK, rank)];
	return (
		<g className={rank >= 2 ? `ec-rank r${rank}` : undefined}>
			{rank >= 3 && <circle r={5.1} className="ec-halo" fill={c.fill} />}
			{rank >= MAX_RANK && <path d={RAYS} className="ec-rays" />}
			<g transform={`scale(${scale})`}>
				{cut ? (
					<path d={cut} fill={c.fill} stroke={rim} strokeWidth={rank >= 2 ? 0.8 : 0.6} strokeLinejoin="round" />
				) : (
					<circle r={4.4} fill={c.fill} stroke={rim} strokeWidth={rank >= 2 ? 0.8 : 0.6} />
				)}
				<ellipse cx={-1.4} cy={-1.7} rx={1.6} ry={0.9} fill="#fff" opacity={0.55} transform="rotate(-30 -1.4 -1.7)" />
				{rank >= 2 && <circle r={1.15} className="ec-core" />}
			</g>
			{rank === 2 && (
				<>
					<path d={SPARK} transform="translate(3.6 -3.6)" className="ec-twinkle" />
					<path d={SPARK} transform="translate(-3.5 3.4)" className="ec-twinkle t2" />
				</>
			)}
			{rank === 3 && (
				<g className="ec-orbit">
					{[0, 1, 2].map((k) => <circle key={k} r={0.75} cx={Math.cos((k * Math.PI * 2) / 3) * 5.3} cy={Math.sin((k * Math.PI * 2) / 3) * 5.3} />)}
				</g>
			)}
			{rank >= MAX_RANK && <path d={CROWN} className="ec-crown" />}
		</g>
	);
}

function Piece({ b, small = false }: { b: Pick<Block, 'kind' | 'color' | 'ice' | 'lock' | 'rank'>; small?: boolean }) {
	const withArt = useContext(ArtCtx);
	if (withArt && b.kind !== 'gem') {
		return (
			<g className={b.kind === 'chest' && !small ? 'ec-chest' : undefined}>
				<image href={art(b.kind === 'rock' ? 'rock' : b.lock ? 'chest-locked' : 'chest')} x={-5} y={-5} width={10} height={10} />
			</g>
		);
	}
	if (b.kind === 'rock') {
		return (
			<g>
				<path d="M-4.4,1.8L-3.6,-2.6L-0.8,-4.3L3.2,-3.4L4.5,0.6L2.6,4.1L-2.2,4.3Z" className="ec-rock" />
				<path d="M-1.6,-1.8l1.4,1.2l-0.6,1.8" className="ec-rock-crack" />
			</g>
		);
	}
	if (b.kind === 'chest') {
		return (
			<g className={small ? undefined : 'ec-chest'}>
				<rect x={-4} y={-1.2} width={8} height={5} rx={0.9} fill="#c98a2b" stroke="#6b4310" strokeWidth={0.55} />
				<path d="M-4,-1.2a4,2.8 0 0 1 8,0z" fill="#e6a93a" stroke="#6b4310" strokeWidth={0.55} />
				<rect x={-4} y={0.6} width={8} height={0.9} fill="#8a5a18" />
				<rect x={-0.8} y={-0.3} width={1.6} height={2.1} rx={0.35} fill="#ffe27a" stroke="#6b4310" strokeWidth={0.3} />
				{b.lock && (
					<g className="ec-padlock">
						<path d="M-1.4,-1.6v-1.2a1.4,1.4 0 0 1 2.8,0v1.2" fill="none" stroke="#dfe4ea" strokeWidth={0.7} />
						<rect x={-2} y={-1.8} width={4} height={3.2} rx={0.6} fill="#9aa3ad" stroke="#4d545c" strokeWidth={0.4} />
					</g>
				)}
			</g>
		);
	}
	return (
		<g>
			<Gem color={b.color} rank={small ? 1 : b.rank} />
			{b.ice && <rect className="ec-ice" x={-4.8} y={-4.8} width={9.6} height={9.6} rx={2.2} />}
		</g>
	);
}

const ArrivalChip = ({ a }: { a: Arrival }) => (
	<svg viewBox="-5.5 -5.5 11 11" width="22" height="22" aria-hidden="true">
		<Piece b={{ kind: a.kind, color: a.color, ice: false, lock: false, rank: 1 }} small />
	</svg>
);

const cx = (i: number): number => (i % N) * U + U / 2;
const cy = (i: number): number => Math.floor(i / N) * U + U / 2;
const CENTRE = CENTRE_ORDER[0];

/* ---------- The game ---------- */

interface Fx {
	id: number;
	pops: { cell: number; color: number; kind: Kind; rank: number; delay: number; into: number }[];
	zones: { cell: number; rank: number; delay: number }[]; // charged gems going off
	bolts: { from: number; to: number; delay: number }[]; // a crown striking every gem of its colour
	comets: { from: number; to: number }[];
	fused: { cell: number; rank: number; delay: number }[];
}

const cheb = (a: number, b: number): number => Math.max(Math.abs((a % N) - (b % N)), Math.abs(Math.floor(a / N) - Math.floor(b / N)));

/**
 * When each thing of a wave goes: the group from its leading cell outward, blasts by distance, a comet's catch
 * once it lands. `balls`: Bijou's fireballs, landing BALL_GAP apart; what each one hits goes when it lands.
 */
function timeFx(step: Burst, balls: number[] = []): Omit<Fx, 'id'> {
	const order = new Map<number, number>();
	step.groups.forEach((g) => g.forEach((cell, k) => order.set(cell, Math.min(6, k) * 28)));
	balls.forEach((b, k) => {
		for (let i = 0; i < N * N; i++) if (cheb(i, b) <= 1 && !order.has(i)) order.set(i, k * BALL_GAP + cheb(i, b) * 40);
	});
	const near = (cell: number, late: boolean): number => {
		const from = step.releases.filter((z) => z.late === late);
		if (!from.length) return 60;
		// A blast set off by a fireball starts when that fireball lands.
		return Math.min(...from.map((z) => (balls.length ? order.get(z.cell) ?? 0 : 0) + 60 + cheb(z.cell, cell) * 35));
	};
	const delayOf = (cell: number, late: boolean): number => (late ? COMET_MS : 0) + (order.get(cell) ?? near(cell, late));
	const zones = [
		...step.releases.map((z) => ({ cell: z.cell, rank: z.rank, delay: delayOf(z.cell, z.late) })),
		...step.comets.map((c) => ({ cell: c.to, rank: 2, delay: COMET_MS })),
	];
	const bolts = step.releases
		.filter((z) => z.rank >= MAX_RANK)
		.flatMap((z) => step.popped.filter((p) => p.kind === 'gem' && p.color === z.color && p.cell !== z.cell).map((p) => ({ from: z.cell, to: p.cell, delay: delayOf(z.cell, z.late) })));
	return {
		pops: step.popped.map((p) => ({ cell: p.cell, color: p.color, kind: p.kind, rank: p.rank, into: p.into, delay: p.into >= 0 ? (order.get(p.cell) ?? 0) * 0.6 : delayOf(p.cell, p.late) })),
		zones,
		bolts,
		comets: step.comets,
		fused: step.fused.map((f) => ({ cell: f.cell, rank: f.rank, delay: 200 })),
	};
}

const HINT_WORDS: Record<Dir, string> = { up: 'le haut ↑', down: 'le bas ↓', left: 'la gauche ←', right: 'la droite →' };

const DIR_KEYS: Record<string, Dir> = {
	ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
	z: 'up', w: 'up', s: 'down', q: 'left', a: 'left', d: 'right',
};

export default function EclatsGame({ gameId }: { gameId: string }) {
	const [, setTick] = useState(0);
	const bump = useCallback(() => setTick((t) => t + 1), []);
	const [mode, setMode] = useState<Mode>('free');
	const [tierKey, setTierKey] = useState<TierKey>('facile');
	const [phase, setPhaseState] = useState<Phase>('idle');
	const [cells, setCells] = useState<(Block | null)[]>([]);
	const [glow, setGlow] = useState<number[]>([]);
	const [preview, setPreview] = useState<number[]>([]); // block ids the swipe being drawn would explode
	const [enter, setEnter] = useState<{ ids: Set<number>; centre: number; dir: Dir }>({ ids: new Set(), centre: -1, dir: 'up' });
	const [fx, setFx] = useState<Fx | null>(null);
	const [label, setLabel] = useState<{ id: number; cell: number; text: string } | null>(null);
	const [chain, setChain] = useState<{ id: number; wave: number } | null>(null);
	const [shake, setShake] = useState(0);
	const [nudge, setNudge] = useState<{ id: number; dir: Dir } | null>(null);
	const [sweep, setSweep] = useState<{ id: number; dir: Dir } | null>(null);
	const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [gaveUp, setGaveUp] = useState(false);
	const [record, setRecord] = useState(0);
	const [newRecord, setNewRecord] = useState(false);
	const [round, setRound] = useState(0); // one per deal: block ids restart, their keys must not
	const [sound, setSound] = useState(true);
	const [react, setReact] = useState<Mood | null>(null); // Bijou's reaction to the last big moment
	const [sleepy, setSleepy] = useState(false);
	const [hoard, setHoard] = useState(0);
	const [grew, setGrew] = useState(0);
	const [endGain, setEndGain] = useState(0);
	const [pour, setPour] = useState(false); // the gauge pours into Bijou as he breathes
	const [said, setSaid] = useState(''); // what a screen reader is told after a move

	const sRef = useRef<State | null>(null);
	const phaseRef = useRef<Phase>('idle');
	const modeRef = useRef<Mode>('free');
	const runRef = useRef(0); // the timeline playing now; a new deal cancels it
	const quitRef = useRef(false); // the daily was given up mid-move: it ends once the move does
	const dailyAsk = useRef(0); // the daily's latest seed request; a board change drops an older answer
	const fastRef = useRef(false); // a finger held on the board speeds the cascade up
	const startRef = useRef(0);
	const menuRef = useRef(false);
	const fxId = useRef(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const boardRef = useRef<HTMLDivElement>(null);
	const onEndRef = useRef<(s: State, quit?: boolean) => void>(() => {});
	const rootRef = useRef<HTMLDivElement>(null);
	const flyRef = useRef<HTMLDivElement>(null); // the layer the opening chests and their coins fly in
	const chestChip = useRef<HTMLSpanElement>(null);
	const goldChip = useRef<HTMLSpanElement>(null);
	const butinRef = useRef(0); // the run's loot, counted as soon as a chest opens
	const shownRef = useRef({ opened: 0, butin: 0, fire: 0, score: 0 }); // what the counters and the gauge show: they move as things land
	const showsRef = useRef({ token: 0, pending: 0, started: 0 }); // a new deal bumps the token: old flights stop counting
	const lockedRef = useRef(new Set<number>()); // chests that had a padlock: worth double
	const reactRef = useRef<{ mood: Mood; until: number; timer: number }>({ mood: 'idle', until: 0, timer: 0 });
	const hoardRef = useRef(0);
	const moodRef = useRef<Mood>('idle');
	const bijouRef = useRef<HTMLDivElement>(null);
	const fireTrack = useRef<HTMLSpanElement>(null); // the gauge: embers fly to its filled end
	modeRef.current = mode;

	const lv = useLevels(gameId, eclatsLevels);
	const sprites = useSprites();
	const extra = useExtraArt();
	menuRef.current = lv.menu;
	const s = sRef.current;

	const setPhase = useCallback((p: Phase) => {
		phaseRef.current = p;
		setPhaseState(p);
	}, []);

	useEffect(() => { setSound(sfx.isEnabled()); }, []);
	useEffect(() => {
		try { hoardRef.current = Number(localStorage.getItem(HOARD_KEY) || 0); } catch { /* private mode */ }
		setHoard(hoardRef.current);
	}, []);

	/* ---------- Bijou, the chests and the loot ---------- */

	/** Bijou reacts to a moment, unless a bigger one is still showing. */
	const reactTo = useCallback((mood: Mood) => {
		const r = reactRef.current;
		if (Date.now() < r.until && (MOOD_RANK[r.mood] ?? 0) > (MOOD_RANK[mood] ?? 0)) return;
		clearTimeout(r.timer);
		r.mood = mood;
		r.until = Date.now() + REACT_MS;
		r.timer = window.setTimeout(() => setReact(null), REACT_MS);
		setReact(mood);
	}, []);

	/** Once the move is over and nothing flies any more, the counters show the true values. */
	const settleShows = useCallback(() => {
		if (showsRef.current.pending > 0 || phaseRef.current === 'busy') return;
		shownRef.current = { opened: sRef.current?.opened ?? 0, butin: butinRef.current, fire: sRef.current?.fire ?? 0, score: sRef.current?.score ?? 0 };
		bump();
	}, [bump]);

	/** A new board: the flights of the old one are dropped and the counters start from `opened` / `butin` / `fire`. */
	const resetShows = useCallback((opened: number, butin: number, fire: number) => {
		showsRef.current.token++;
		showsRef.current.pending = 0;
		flyRef.current?.replaceChildren();
		butinRef.current = butin;
		shownRef.current = { opened, butin, fire, score: sRef.current?.score ?? 0 };
		lockedRef.current.clear();
		clearTimeout(reactRef.current.timer);
		reactRef.current.until = 0;
		setReact(null);
	}, []);

	const bounce = (el: HTMLElement | null): void => {
		el?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.28)' }, { transform: 'scale(1)' }], { duration: 240, easing: 'ease-out' });
	};

	/**
	 * A chest pops out of its cell, grows and opens; its coins fountain up and fly into the loot counter,
	 * then the open chest drops into the chest counter. Drawn in an HTML layer over the whole game, so the
	 * next swipe can play underneath. Without the drawings or with reduced motion, the counters just move.
	 */
	const chestShow = (cell: number, gold: number, token: number): void => {
		const shows = showsRef.current;
		let landed = false;
		const land = (): void => {
			if (landed) return;
			landed = true;
			// A flight from the board before is not one the new board waits for.
			if (token !== shows.token) return;
			shows.pending = Math.max(0, shows.pending - 1);
			settleShows();
		};
		const counts = (): boolean => token === shows.token && !landed;
		const layer = flyRef.current;
		const root = rootRef.current;
		const board = boardRef.current;
		if (token !== shows.token) return;
		if (!layer || !root || !board || !spritesLoaded || matchMedia('(prefers-reduced-motion: reduce)').matches) {
			land();
			return;
		}
		shows.started++;
		const rr = root.getBoundingClientRect();
		const br = board.getBoundingClientRect();
		const k = br.width / (N * U + 3);
		const size = U * k;
		const x = br.left - rr.left + (cx(cell) + 1.5) * k;
		const y = br.top - rr.top + (cy(cell) + 1.5) * k;
		const half = (size * BIG) / 2;
		const bx = Math.min(br.right - rr.left - half, Math.max(br.left - rr.left + half, x));
		const by = Math.min(br.bottom - rr.top - half, Math.max(br.top - rr.top + half, y - size * 0.35));
		const centre = (el: HTMLElement | null): [number, number] | null => {
			if (!el) return null;
			const r = el.getBoundingClientRect();
			return [r.left - rr.left + r.width / 2, r.top - rr.top + r.height / 2];
		};
		const at = (px: number, py: number, w: number, more = ''): string => `translate(${px - w / 2}px, ${py - w / 2}px) ${more}`;
		const img = (name: string, w: number, cls: string): HTMLImageElement => {
			const im = document.createElement('img');
			im.src = art(name);
			im.alt = '';
			im.className = cls;
			im.style.width = `${w}px`;
			layer.appendChild(im);
			return im;
		};
		let parts = 0;
		const done = (el: HTMLElement): void => {
			el.remove();
			if (--parts === 0) land();
		};
		// A throttled or interrupted animation must not leave the counters behind.
		window.setTimeout(land, 3500);

		if (extraLoaded.has('fx-rays')) {
			const w = size * 3.4;
			const rays = img('fx-rays', w, 'ec-flyer ec-bigrays');
			parts++;
			rays.animate(
				[
					{ transform: at(bx, by, w, 'scale(0.3) rotate(0deg)'), opacity: 0 },
					{ transform: at(bx, by, w, 'scale(1) rotate(25deg)'), opacity: 1, offset: 0.3 },
					{ transform: at(bx, by, w, 'scale(1.1) rotate(70deg)'), opacity: 0 },
				],
				{ duration: 1000, easing: 'ease-out', fill: 'both' },
			).onfinish = () => done(rays);
		}

		const chest = img('chest', size, 'ec-flyer ec-bigchest');
		const toChest = centre(chestChip.current);
		parts++;
		// Easings go on the keyframes: an overshooting easing on the whole effect would fling the chest past its target.
		chest.animate(
			[
				{ transform: at(x, y, size, 'scale(1)'), easing: 'cubic-bezier(.3, 1.6, .5, 1)' },
				{ transform: at(bx, by, size, `scale(${BIG})`), offset: 0.2 },
				{ transform: at(bx, by, size, `scale(${BIG})`), offset: 0.68, easing: 'cubic-bezier(.5, 0, .8, .4)' },
				toChest
					? { transform: at(toChest[0], toChest[1], size, 'scale(0.45)'), opacity: 0.9 }
					: { transform: at(bx, by, size, `scale(${BIG * 1.15})`), opacity: 0 },
			],
			{ duration: 1250, fill: 'both' },
		).onfinish = () => {
			if (counts() && toChest) {
				shownRef.current.opened++;
				bounce(chestChip.current);
				sfx.stash();
				bump();
			}
			done(chest);
		};
		window.setTimeout(() => {
			if (extraLoaded.has('chest-open')) chest.src = art('chest-open');
		}, 260);

		const toGold = centre(goldChip.current);
		const n = Math.min(10, 3 + Math.round(gold / 10));
		for (let i = 0; i < n; i++) {
			const w = size * 0.42;
			const coin = img('coin', w, 'ec-flyer ec-bigcoin');
			const share = i < n - 1 ? Math.floor(gold / n) : gold - Math.floor(gold / n) * (n - 1);
			const sx = bx + (i - (n - 1) / 2) * size * 0.32;
			const sy = by - size * (1.3 + (i % 3) * 0.25);
			const [tx, ty] = toGold ?? [bx, by - size * 2];
			parts++;
			coin.animate(
				[
					{ transform: at(bx, by - size * 0.4, w, 'scale(0.4)'), opacity: 0, easing: 'ease-out' },
					{ transform: at(sx, sy, w, 'scale(1.1) rotate(160deg)'), opacity: 1, offset: 0.38, easing: 'cubic-bezier(.5, 0, .9, .6)' },
					{ transform: at(tx, ty, w, 'scale(0.7) rotate(360deg)'), opacity: toGold ? 1 : 0 },
				],
				{ duration: 760, delay: 300 + i * 50, fill: 'both' },
			).onfinish = () => {
				if (counts()) {
					shownRef.current.butin += share;
					sfx.coin(i);
					if (i % 2 === 0 || i === n - 1) bounce(goldChip.current);
					bump();
				}
				done(coin);
			};
		}
	};

	/** Embers fly from the gems a wave destroyed to Bijou's gauge, which fills as they land. */
	const feedFire = (step: Burst, token: number): void => {
		const gems = step.popped.filter((p) => p.kind === 'gem');
		if (!gems.length) return;
		const shows = showsRef.current;
		const add = (n: number): void => {
			shownRef.current.fire = Math.min(FIRE_FULL, shownRef.current.fire + n);
			bump();
		};
		const layer = flyRef.current;
		const root = rootRef.current;
		const board = boardRef.current;
		const track = fireTrack.current;
		if (!layer || !root || !board || !track || matchMedia('(prefers-reduced-motion: reduce)').matches) {
			add(gems.length);
			return;
		}
		const rr = root.getBoundingClientRect();
		const br = board.getBoundingClientRect();
		const tr = track.getBoundingClientRect();
		const k = br.width / (N * U + 3);
		const w = U * k * 0.55;
		const tx = tr.left - rr.left + tr.width * Math.min(1, (shownRef.current.fire + gems.length / 2) / FIRE_FULL);
		const ty = tr.top - rr.top + tr.height / 2;
		const n = Math.min(4, gems.length);
		for (let i = 0; i < n; i++) {
			const p = gems[Math.floor((i * gems.length) / n)];
			const share = Math.floor(gems.length / n) + (i < gems.length % n ? 1 : 0);
			const x = br.left - rr.left + (cx(p.cell) + 1.5) * k;
			const y = br.top - rr.top + (cy(p.cell) + 1.5) * k;
			const el = document.createElement(extraLoaded.has('fx-flame') ? 'img' : 'span');
			if (el instanceof HTMLImageElement) {
				el.src = art('fx-flame');
				el.alt = '';
			}
			el.className = 'ec-flyer ec-ember';
			el.style.width = `${w}px`;
			el.style.height = `${w}px`;
			layer.appendChild(el);
			shows.pending++;
			let landed = false;
			const land = (): void => {
				if (landed) return;
				landed = true;
				el.remove();
				if (token !== shows.token) return;
				shows.pending = Math.max(0, shows.pending - 1);
				add(share);
				settleShows();
			};
			window.setTimeout(land, 2000);
			el.animate(
				[
					{ transform: `translate(${x - w / 2}px, ${y - w / 2}px) scale(0.4)`, opacity: 0, easing: 'ease-out' },
					{ transform: `translate(${x - w / 2}px, ${y - w * 1.5}px) scale(1)`, opacity: 1, offset: 0.25, easing: 'cubic-bezier(.5, 0, .9, .5)' },
					{ transform: `translate(${tx - w / 2}px, ${ty - w / 2}px) scale(0.5)`, opacity: 0.9 },
				],
				{ duration: 560, delay: 140 + i * 60, fill: 'both' },
			).onfinish = land;
		}
	};

	/**
	 * Bijou's fireballs leave his mouth one after another and land on their cells, each with a flash, a
	 * thump and a shake. False when nothing can fly (no drawings, reduced motion): the blasts just go.
	 */
	const fireballs = (balls: number[], token: number): boolean => {
		const layer = flyRef.current;
		const root = rootRef.current;
		const board = boardRef.current;
		const drake = bijouRef.current?.querySelector('.ec-drake');
		if (!layer || !root || !board || !drake || !spritesLoaded || matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
		const rr = root.getBoundingClientRect();
		const br = board.getBoundingClientRect();
		const dr = drake.getBoundingClientRect();
		const k = br.width / (N * U + 3);
		const size = U * k;
		// Where the flame of the breathing pose starts, left of his face.
		const mx = dr.left - rr.left + dr.width * 0.2;
		const my = dr.top - rr.top + dr.height * 0.6;
		const drawn = extraLoaded.has('fx-fireball');
		const angle = (x0: number, y0: number, x1: number, y1: number): number => (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
		const img = (name: string, w: number, cls: string): HTMLImageElement => {
			const im = document.createElement('img');
			im.src = art(name);
			im.alt = '';
			im.className = cls;
			im.style.width = `${w}px`;
			layer.appendChild(im);
			return im;
		};
		balls.forEach((cell, i) => {
			const tx = br.left - rr.left + (cx(cell) + 1.5) * k;
			const ty = br.top - rr.top + (cy(cell) + 1.5) * k;
			const w = size * 1.7;
			// Until it is drawn, the comet dyed orange stands in for the fireball (both have the head on the right).
			const ball = img(drawn ? 'fx-fireball' : 'fx-comet', w, `ec-flyer ec-fireball${drawn ? '' : ' dyed'}`);
			const [ax, ay] = [(mx + tx) / 2 - size * 0.8, Math.min(my, ty) - size * 0.5]; // the arc bulges up and out
			const place = (x: number, y: number, a: number, sc: number): string => `translate(${x - w / 2}px, ${y - w / 2}px) rotate(${a}deg) scale(${sc})`;
			ball.animate(
				[
					{ transform: place(mx, my, angle(mx, my, ax, ay), 0.35), opacity: 0 },
					{ transform: place(ax, ay, angle(mx, my, tx, ty), 0.9), opacity: 1, offset: 0.45 },
					{ transform: place(tx, ty, angle(ax, ay, tx, ty), 1.15), opacity: 1 },
				],
				{ duration: BALL_MS, delay: i * BALL_GAP, easing: 'ease-in', fill: 'both' },
			).onfinish = () => {
				ball.remove();
				if (token !== showsRef.current.token) return;
				sfx.blast(2);
				setShake((x) => x + 1);
				const fw = size * 3.4;
				const flash = img('fx-burst', fw, 'ec-flyer ec-fireflash');
				flash.animate(
					[
						{ transform: `translate(${tx - fw / 2}px, ${ty - fw / 2}px) scale(0.3)`, opacity: 1 },
						{ transform: `translate(${tx - fw / 2}px, ${ty - fw / 2}px) scale(1.25)`, opacity: 0 },
					],
					{ duration: 380, easing: 'ease-out', fill: 'both' },
				).onfinish = () => flash.remove();
			};
		});
		return true;
	};

	/** Deal a fresh game on `cfg`. `go` starts it at once (free play); else the ready gate. */
	const deal = useCallback((cfg: EclatsCfg, go: boolean) => {
		runRef.current++;
		dailyAsk.current++;
		quitRef.current = false;
		const st = createGame(cfg);
		sRef.current = st;
		resetShows(0, 0, 0);
		noteLocked(lockedRef.current, st.cells);
		setCells(st.cells.map((b) => (b ? { ...b } : null)));
		setGlow([]);
		setPreview([]);
		setFx(null);
		setLabel(null);
		setChain(null);
		setToast(null);
		setSaid('');
		setGaveUp(false);
		setNewRecord(false);
		setEndGain(0);
		setElapsed(0);
		setRound((r) => r + 1);
		startRef.current = Date.now();
		setPhase(go ? 'idle' : 'ready');
		bump();
	}, [bump, setPhase, resetShows]);

	/* Free play: endless, scored in points. */
	const newFree = useCallback((t: TierKey) => {
		setMode('free');
		modeRef.current = 'free';
		setTierKey(t);
		setAlreadyPlayed(false);
		setDailyLoading(false);
		try { setRecord(Number(localStorage.getItem(recordKey(t)) || 0)); } catch { setRecord(0); }
		deal({ ...TIERS[t].cfg, seed: (Math.random() * 2 ** 32) >>> 0 }, true);
	}, [deal]);

	useEffect(() => {
		newFree('facile');
	}, [newFree]);

	/* Levels */
	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		setMode('levels');
		modeRef.current = 'levels';
		setAlreadyPlayed(false);
		setDailyLoading(false);
		deal(cfg, false);
	}, [lv, deal]);

	const closeLevels = useCallback(() => { if (!lv.close()) newFree(tierKey); }, [lv, newFree, tierKey]);

	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily') return;
		void lv.resume().then((next) => { if (next != null) startLevel(next); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* Daily: one attempt per device, resumable. */
	const startDaily = useCallback(async () => {
		setMode('daily');
		modeRef.current = 'daily';
		setGaveUp(false);
		const tierOf = (i: number): TierKey => TIER_ORDER[i] ?? 'facile';
		// A run saved by another version of the game is dropped, finished or not: the day starts over.
		const saved = loadDailyRun(gameId);
		const run = saved && isCurrentRun(saved.state) ? saved : null;
		if (run && run.seed != null) {
			const diffIndex = run.diffIndex ?? 0;
			dailySeedRef.current = { seed: run.seed, diffIndex };
			const t = tierOf(diffIndex);
			setTierKey(t);
			setDailyLoading(false);
			const cfg = { ...DAILY[t].cfg, seed: run.seed };
			deal(cfg, false);
			const back = unpackRun(run.state, cfg);
			const kept = run.state as SavedRun;
			if (back) {
				sRef.current = back;
				resetShows(back.opened, kept.butin ?? 0, back.fire);
				noteLocked(lockedRef.current, back.cells);
				kept.cells.forEach((c, i) => { const b = back.cells[i]; if (c?.[5] && b) lockedRef.current.add(b.id); });
				setCells(back.cells.map((b) => (b ? { ...b } : null)));
			}
			if (run.done) {
				setAlreadyPlayed(true);
				// Runs saved before `quit` only had `abandoned`, which a full board sets too.
				setGaveUp(kept.quit ?? !!run.abandoned);
				setElapsed(run.finalTime ?? 0);
				sRef.current!.status = run.abandoned ? 'lost' : 'won';
				setPhase('over');
			} else {
				setAlreadyPlayed(false);
				startRef.current = run.startedAt;
				setElapsed(Math.round((Date.now() - run.startedAt) / 10));
				setPhase('idle');
			}
			bump();
			return;
		}
		setAlreadyPlayed(false);
		setDailyLoading(true);
		// The board left behind stops playing and takes no input while the seed loads: it is not the daily.
		runRef.current++;
		setPhase('busy');
		const ask = ++dailyAsk.current;
		const { seed, diffIndex } = await getDaily(gameId);
		if (ask !== dailyAsk.current || modeRef.current !== 'daily') return;
		dailySeedRef.current = { seed, diffIndex };
		const t = tierOf(diffIndex);
		setTierKey(t);
		deal({ ...DAILY[t].cfg, seed }, false);
		setDailyLoading(false);
	}, [gameId, deal, bump, setPhase, resetShows]);

	/* ▶ Commencer: starts the chrono; in the daily it spends the attempt. */
	const begin = useCallback(() => {
		const st = sRef.current;
		if (!st || phaseRef.current !== 'ready') return;
		sfx.unlock();
		startRef.current = Date.now();
		setElapsed(0);
		setPhase('idle');
		trackGame(gameId, 'game_started');
		// The page opens on its header: bring the goal, the counters and the board into view.
		const tag = rootRef.current?.querySelector('.ec-tag');
		const board = boardRef.current?.getBoundingClientRect();
		if (tag && board && board.bottom > innerHeight && !document.fullscreenElement && !document.documentElement.classList.contains('gf-full')) {
			const by = Math.min(board.bottom - innerHeight + 12, tag.getBoundingClientRect().top - 8);
			if (by > 0) window.scrollBy({ top: by, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
		}
		if (modeRef.current === 'daily') {
			const sd = dailySeedRef.current;
			saveDailyRun(gameId, { startedAt: startRef.current, done: false, seed: sd?.seed, diffIndex: sd?.diffIndex, state: packRun(st, butinRef.current, lockedRef.current) });
		}
	}, [gameId, setPhase]);

	const ticking = phase === 'idle' || phase === 'busy';
	usePlayClock(startRef, ticking && mode !== 'free', mode === 'daily' ? gameId : null);
	useEffect(() => {
		if (!ticking || mode === 'free') return;
		const id = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 10)), 100);
		return () => clearInterval(id);
	}, [ticking, mode]);

	// Bijou dozes off when nobody swipes for a while.
	const movesNow = sRef.current?.moves ?? 0;
	useEffect(() => {
		setSleepy(false);
		if (phase !== 'idle') return;
		const t = window.setTimeout(() => setSleepy(true), 15000);
		return () => clearTimeout(t);
	}, [phase, movesNow]);

	/* ---------- Playing a move's timeline ---------- */

	const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

	const runSteps = useCallback(async (steps: Step[], dir: Dir) => {
		const my = ++runRef.current;
		setPhase('busy');
		const st = sRef.current!;
		const pointsBefore = st.score - steps.reduce((t, x) => t + (x.t === 'burst' ? x.points : 0), 0);
		let waves = 0;
		let opened = 0;
		let balls: number[] = []; // Bijou's fireballs, when this is his breath
		let shown = steps[0].cells;
		const show = (c: (Block | null)[]): void => {
			shown = c;
			noteLocked(lockedRef.current, c);
			setCells(c);
		};
		const token = showsRef.current.token;
		// Later waves play quicker, and a finger held on the board quicker still.
		const pace = (wave: number): number => Math.max(0.4, 1 - 0.12 * Math.max(0, wave - 1)) * (fastRef.current ? 0.45 : 1);
		for (const step of steps) {
			if (runRef.current !== my) return;
			if (step.t === 'slide') {
				show(step.cells);
				await wait(SLIDE_MS * pace(waves));
			} else if (step.t === 'arrive') {
				setEnter({ ids: new Set(step.ids), centre: step.centre, dir });
				show(step.cells);
				await wait(ARRIVE_MS * pace(waves));
			} else if (step.t === 'breath') {
				// The gauge pours into Bijou, he roars, and the next wave goes off as his fireballs land.
				balls = step.balls;
				shownRef.current.fire = 0;
				setPour(true);
				window.setTimeout(() => setPour(false), 450);
				reactTo('breath');
				sfx.breath();
				if (fireballs(balls, token)) await wait(BALL_MS);
			} else {
				waves = step.wave;
				if (!balls.length) {
					setGlow(step.groups.flat());
					await wait(GLOW_MS * pace(waves));
					if (runRef.current !== my) return;
					setGlow([]);
				}
				const timed = timeFx(step, balls);
				setFx({ id: ++fxId.current, ...timed });
				shownRef.current.score += step.points;
				// What a comet catches stays on the board until it lands. Under Bijou's breath every block stays until
				// its blast reaches it: the fireballs land BALL_GAP apart, and what they set off goes after them.
				const late = step.popped.filter((p) => p.late);
				const goneAt = new Map(timed.pops.map((p, k) => [p.cell, balls.length ? Math.round(p.delay / 40) * 40 : step.popped[k].late ? COMET_MS : 0]));
				const showAt = (ms: number): void => {
					const mid = step.cells.slice();
					for (const p of step.popped) if ((goneAt.get(p.cell) ?? 0) > ms) mid[p.cell] = shown[p.cell];
					show(mid);
				};
				showAt(0);
				// A fireball thumps as it lands; its gems feed nothing, the gauge was just spent.
				if (!balls.length) {
					sfx.pop(step.wave, step.popped.filter((p) => p.kind === 'gem').length);
					feedFire(step, token);
				}
				const top = Math.max(0, ...step.releases.filter((z) => !z.late).map((z) => z.rank));
				if (top) sfx.blast(top);
				if (step.fused.length) {
					const r = Math.max(...step.fused.map((f) => f.rank));
					setTimeout(() => sfx.fuse(r), 200);
				}
				if (step.comets.length) sfx.comet();
				if (step.opened.length > late.filter((p) => p.kind === 'chest').length) sfx.chest();
				opened += step.opened.length;
				// Each chest pays its coins now; the show of it opening plays on its own, one after another.
				step.popped.filter((p) => p.kind === 'chest').forEach((p, k) => {
					const gold = CHEST_GOLD * step.wave * (lockedRef.current.has(p.id) ? 2 : 1);
					butinRef.current += gold;
					showsRef.current.pending++;
					const landing = (goneAt.get(p.cell) ?? 0) + 40;
					window.setTimeout(() => chestShow(p.cell, gold, token), landing + k * 200);
				});
				const named = step.fused.filter((f) => f.rank >= 3).sort((a, b) => b.rank - a.rank)[0];
				if (named) setLabel({ id: fxId.current, cell: named.cell, text: `${RANK_NAMES[named.rank]} !` });
				if (step.wave >= 2) setChain({ id: fxId.current, wave: step.wave });
				if (step.wave >= 5 || step.releases.some((z) => z.rank >= MAX_RANK) || step.fused.some((f) => f.rank >= MAX_RANK)) reactTo('fly');
				else if (step.wave >= 3) reactTo('cheer');
				else if (step.opened.length) reactTo('wow');
				if (step.wave >= 3 || step.releases.length >= 2 || top >= 3 || step.comets.length) setShake((x) => x + 1);
				bump();
				// Not sped up: the screen must show a comet or a fireball land before its catch goes.
				let at = 0;
				const marks = [...new Set([...goneAt.values(), ...(late.length ? [COMET_MS] : [])])].filter((ms) => ms > 0).sort((a, b) => a - b);
				for (const ms of marks) {
					await wait(ms - at);
					if (runRef.current !== my) return;
					if (late.length && at < COMET_MS && ms >= COMET_MS) {
						const lateTop = Math.max(0, ...step.releases.filter((z) => z.late).map((z) => z.rank));
						sfx.blast(Math.max(2, lateTop));
						if (late.some((p) => p.kind === 'chest')) sfx.chest();
					}
					at = ms;
					showAt(ms);
				}
				await wait(POP_MS * pace(waves));
			}
		}
		if (runRef.current !== my) return;
		setEnter({ ids: new Set(), centre: -1, dir });
		const gained = st.score - pointsBefore;
		const parts = [
			balls.length ? '🔥 Souffle de Bijou' : '',
			waves >= 2 ? `Chaîne ×${waves}` : '',
			modeRef.current === 'free' ? `+${gained} points` : '',
			opened ? `🎁 ${opened} coffre${opened > 1 ? 's' : ''}` : '',
		].filter(Boolean);
		if (waves >= 2 || opened || balls.length) setToast({ id: ++fxId.current, text: parts.join(' · ') });
		// Every move is read out once, where the HUD itself changes with every coin and spark.
		const count = modeRef.current === 'free'
			? `${st.score} points en tout`
			: `${chestsWord(st.opened)} sur ${st.cfg.goal}${st.limit > 0 ? `, ${movesLeft(st)} coup${movesLeft(st) > 1 ? 's' : ''} restant${movesLeft(st) > 1 ? 's' : ''}` : ''}`;
		setSaid([...parts, count].join(' · '));
		if (st.status !== 'playing') {
			setPhase('over');
			onEndRef.current(st);
		} else {
			setPhase('idle');
			if (modeRef.current === 'daily') {
				const sd = dailySeedRef.current;
				saveDailyRun(gameId, { startedAt: startRef.current, done: false, seed: sd?.seed, diffIndex: sd?.diffIndex, state: packRun(st, butinRef.current, lockedRef.current) });
			}
		}
		settleShows();
		bump();
		// chestShow, feedFire and fireballs only read refs and module state.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [bump, gameId, setPhase, settleShows, reactTo]);

	const doMove = useCallback((dir: Dir) => {
		const st = sRef.current;
		if (!st || phaseRef.current !== 'idle' || menuRef.current || st.status !== 'playing') return;
		sfx.unlock();
		const steps = play(st, dir);
		setPreview([]);
		if (!steps) {
			sfx.refused();
			setNudge({ id: ++fxId.current, dir });
			return;
		}
		sfx.swipe();
		setSweep({ id: ++fxId.current, dir });
		setToast(null); // the last swipe's summary would cover the bottom row
		if (st.moves === 1 && modeRef.current === 'free') trackGame(gameId, 'game_started');
		void runSteps(steps, dir);
	}, [gameId, runSteps]);

	/** A tap on Bijou (or his gauge) once it is full: his fireballs. */
	const doBreathe = useCallback(() => {
		const st = sRef.current;
		if (!st || phaseRef.current !== 'idle' || menuRef.current) return;
		sfx.unlock();
		const steps = breathe(st);
		if (!steps) return;
		setPreview([]);
		void runSteps(steps, 'down');
	}, [runSteps]);

	/** The block ids a swipe would explode by itself: what the finger sees before letting go. */
	const previewIds = (dir: Dir): number[] => {
		const st = sRef.current;
		if (!st) return [];
		const t = cloneState(st);
		if (!slide(t, dir)) return [];
		return findGroups(t, dir).flat().map((i) => t.cells[i]!.id);
	};

	/** The block ids a swipe would move: a starting swipe tugs them its way. */
	const movingIds = (dir: Dir): Set<number> => {
		const st = sRef.current;
		const ids = new Set<number>();
		if (!st) return ids;
		const t = cloneState(st);
		if (!slide(t, dir)) return ids;
		const was = new Map<number, number>();
		st.cells.forEach((b, i) => b && was.set(b.id, i));
		t.cells.forEach((b, i) => b && was.get(b.id) !== i && ids.add(b.id));
		return ids;
	};

	/* ---------- Input ---------- */

	const drag = useRef<{ x: number; y: number; dir: Dir | null; pulled: Dir | null; tugged: Set<Dir> } | null>(null);
	const tugClock = useRef(0);
	useEffect(() => () => clearInterval(tugClock.current), []);
	const dirOf = (dx: number, dy: number, min = SWIPE_PX): Dir | null => {
		if (Math.abs(dx) < min && Math.abs(dy) < min) return null;
		return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
	};
	/** The blocks `dir` would move stretch its way, held by an elastic, then bounce back, the finger still down. */
	const tug = (dir: Dir) => {
		const el = boardRef.current;
		if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const ids = movingIds(dir);
		const [vx, vy] = DIR_VEC[dir];
		const total = TUG_OUT_MS + TUG_BACK_MS;
		const at = (k: number) => `translate(${vx * TUG * k}px, ${vy * TUG * k}px)`;
		const keys: Keyframe[] = [
			{ transform: at(0), offset: 0, easing: TUG_OUT_EASE },
			...TUG_BACK_CURVE.map((k, i) => ({
				transform: at(k),
				offset: (TUG_OUT_MS + (i / (TUG_BACK_CURVE.length - 1)) * TUG_BACK_MS) / total,
			})),
		];
		el.querySelectorAll<SVGGElement>('.ec-tug').forEach((g) => {
			if (!ids.has(Number(g.dataset.id))) return;
			// Added, not replaced: a tug the other way over one still running starts from where the block is.
			g.animate(keys, { duration: total, composite: 'add' });
		});
	};
	const onPress = (x: number, y: number) => {
		clearInterval(tugClock.current);
		drag.current = { x, y, dir: null, pulled: null, tugged: new Set() };
		if (phaseRef.current === 'busy') fastRef.current = true;
	};
	const onDrag = (x: number, y: number) => {
		const d = drag.current;
		if (!d || phaseRef.current !== 'idle') return;
		const [dx, dy] = [x - d.x, y - d.y];
		d.pulled = dirOf(dx, dy, TUG_START_PX);
		// At once the first time the finger takes a direction (a diagonal start flickering between two does not
		// shake the board), then every second the way it points while it holds.
		if (d.pulled && !d.tugged.has(d.pulled)) {
			d.tugged.add(d.pulled);
			tug(d.pulled);
			clearInterval(tugClock.current);
			tugClock.current = window.setInterval(() => {
				const held = drag.current?.pulled;
				if (held && phaseRef.current === 'idle' && !document.hidden) tug(held);
			}, TUG_EVERY_MS);
		}
		const dir = dirOf(dx, dy);
		if (dir === d.dir) return;
		d.dir = dir;
		setPreview(dir ? previewIds(dir) : []);
	};
	const onRelease = (x: number, y: number) => {
		const d = drag.current;
		drag.current = null;
		fastRef.current = false;
		clearInterval(tugClock.current);
		if (!d) return;
		const dir = dirOf(x - d.x, y - d.y);
		setPreview([]);
		if (dir) doMove(dir);
	};
	const swipe = usePointerDrag(onPress, onDrag, onRelease);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (isTypingTarget(e.target)) return;
			if (phaseRef.current === 'ready' && (e.key === ' ' || e.key === 'Enter') && !menuRef.current) {
				e.preventDefault();
				begin();
				return;
			}
			// Space breathes once the gauge is full, unless it is pressing a focused button.
			const onControl = e.target instanceof Element && !!e.target.closest('button, a, [role="button"], [role="tab"]');
			if (e.key === ' ' && !onControl && sRef.current && canBreathe(sRef.current)) {
				e.preventDefault();
				doBreathe();
				return;
			}
			const dir = DIR_KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
			if (!dir) return;
			e.preventDefault();
			if (!e.repeat) doMove(dir);
		};
		window.addEventListener('keydown', onKey, { passive: false });
		return () => window.removeEventListener('keydown', onKey);
	}, [begin, doMove, doBreathe]);

	/* ---------- End of a run ---------- */

	onEndRef.current = (st: State, quit = false) => {
		const centis = Math.round((Date.now() - startRef.current) / 10);
		setElapsed(centis);
		const m = modeRef.current;
		if (st.status === 'won') sfx.win(); else sfx.lose();
		// The loot goes to Bijou's treasure; a lost level loses it.
		const gain = m === 'levels' && st.status !== 'won' ? 0 : butinRef.current;
		setEndGain(gain);
		if (gain > 0) {
			hoardRef.current += gain;
			try { localStorage.setItem(HOARD_KEY, String(hoardRef.current)); } catch { /* private mode */ }
			window.setTimeout(() => {
				setHoard(hoardRef.current);
				setGrew((g) => g + 1);
			}, 1300);
		}
		if (m === 'levels') {
			lv.finish({ won: st.status === 'won', score: st.moves, raw: { points: st.score, centis } });
		} else if (m === 'daily') {
			const sd = dailySeedRef.current;
			const snapshot: DailyRun = {
				startedAt: startRef.current,
				done: true,
				finalTime: centis,
				abandoned: st.status !== 'won',
				seed: sd?.seed,
				diffIndex: sd?.diffIndex,
				state: packRun(st, butinRef.current, lockedRef.current, quit),
			};
			saveDailyRun(gameId, snapshot);
			setAlreadyPlayed(true);
		} else if (st.score > record) {
			try { localStorage.setItem(recordKey(tierKey), String(st.score)); } catch { /* private mode */ }
			setRecord(st.score);
			setNewRecord(true);
		}
		trackGame(gameId, st.status === 'won' ? 'game_won' : 'game_over', { score: st.score });
	};

	const giveUp = useCallback(() => {
		const st = sRef.current;
		if (!st || st.status !== 'playing') return;
		// Mid-move, the chests of its later waves have not paid their coins yet: give up once it ends.
		if (phaseRef.current === 'busy') {
			quitRef.current = true;
			return;
		}
		quitRef.current = false;
		runRef.current++;
		st.status = 'lost';
		setGaveUp(true);
		setPhase('over');
		onEndRef.current(st, true);
		bump();
		trackGame(gameId, 'solution_shown');
	}, [bump, gameId, setPhase]);
	useEffect(() => { if (phase === 'idle' && quitRef.current) giveUp(); }, [phase, giveUp]);

	const toggleSound = () => {
		const on = !sfx.isEnabled();
		sfx.setEnabled(on);
		setSound(on);
	};

	/* Test hook for scripts/check-eclats.mjs: read the run, swipe or breathe without a finger. */
	useEffect(() => {
		const w = window as unknown as { __eclats?: unknown };
		w.__eclats = {
			get state() {
				const st = sRef.current;
				return st && {
					mode: modeRef.current, phase: phaseRef.current, status: st.status, moves: st.moves, opened: st.opened,
					goal: st.cfg.goal, score: st.score, empty: st.cells.filter((b) => !b).length,
					ranks: [2, 3, 4].map((r) => st.cells.filter((b) => b?.kind === 'gem' && b.rank === r).length),
					butin: butinRef.current, shown: { ...shownRef.current }, shows: showsRef.current.started, flying: showsRef.current.pending,
					hoard: hoardRef.current, mood: moodRef.current, fire: st.fire, fireFull: FIRE_FULL, limit: st.limit,
				};
			},
			swipe(dir: Dir) { doMove(dir); },
			breathe() { doBreathe(); },
			previewCount(dir: Dir) { return previewIds(dir).length; },
			movingCount(dir: Dir) { return movingIds(dir).size; },
		};
		return () => { delete w.__eclats; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* ---------- Render ---------- */

	const over = phase === 'over';
	const won = s?.status === 'won';
	const dailyScore = encodePacked(10_000_000, [s?.moves ?? 0, Math.min(9_999_999, elapsed)]);
	const fmtPacked = (v: number): string => formatScore(DAILY_LB.eclats.fmt, v);
	const world = mode === 'levels' ? worldOf(lv.level) : null;
	const cfgLv = mode === 'levels' && (lv.playing || lv.done) ? eclatsLevels.config(lv.level) : null;
	const lesson = mode === 'levels' && !lv.menu ? cfgLv?.lesson : undefined;
	const novelty = !lesson && world && lv.level < world.from + 3 ? world.novelty : '';
	// A lesson's suggested first swipe: its blocks glow until the player swipes.
	const guide = lesson && cfgLv?.hint && s && s.moves === 0 && phase === 'idle' && !preview.length ? previewIds(cfgLv.hint) : [];
	const next = s && s.status === 'playing' ? upcoming(s, 4) : [];
	const glowSet = new Set(glow);
	const grown = new Map((fx?.fused ?? []).map((f) => [cells[f.cell]?.id ?? -1, f.delay]));
	const previewSet = new Set([...preview, ...guide]);
	const step = s && mode === 'free' ? endlessStep(s) : 0;
	const toNext = s ? STEP_MOVES - (s.moves % STEP_MOVES) : 0;
	const nudgeDir = nudge ? { up: [0, -1.2], down: [0, 1.2], left: [-1.2, 0], right: [1.2, 0] }[nudge.dir] : [0, 0];
	const inFrom = { up: [0, U], down: [0, -U], left: [U, 0], right: [-U, 0] }[enter.dir];
	const crowded = phase !== 'ready' && cells.length > 0 && cells.filter((b) => !b).length <= 5;
	const shownFire = shownRef.current.fire;
	const fireFull = !!s && s.status === 'playing' && phase !== 'ready' && !pour && shownFire >= FIRE_FULL;
	const canTap = fireFull && phase === 'idle' && !lv.menu && !!s && canBreathe(s);
	// No swipe can play any more: only his breath saves the run, so it is said over the board.
	const stuck = canTap && !!s && (s.cells.every((b) => b) || outOfMoves(s));
	useEffect(() => { if (fireFull) sfx.ready(); }, [fireFull]);
	const mood: Mood = over ? (won ? 'dance' : 'sad') : react ?? (fireFull ? 'ready' : crowded ? 'scared' : sleepy ? 'sleep' : 'idle');
	moodRef.current = mood;
	const shownOpened = shownRef.current.opened;
	const goldChipEl = (
		<span ref={goldChip} className="ec-chip gold" title="Le butin des coffres ouverts">{sprites ? <img className="ec-chip-ico" src={art('coin')} alt="" /> : '🪙'} <strong>{fmtGold(shownRef.current.butin)}</strong></span>
	);

	return (
		<ArtCtx.Provider value={sprites}>
		<div className="ec-root" ref={rootRef}>
			<style>{CSS}</style>
			<div ref={flyRef} className="ec-flylayer" aria-hidden="true" />

			<ModeToggle
				daily={mode === 'daily'}
				onFree={() => { if (mode !== 'free' || lv.active) { lv.exit(); newFree(tierKey); } }}
				onDaily={() => { lv.exit(); void startDaily(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={() => lv.enter()}
			/>

			{mode === 'levels' ? (
				<div className="ec-tag">
					{lv.menu ? 'Progression — réussis un niveau pour débloquer le suivant' : (
						<>
							{world?.name} · Niveau {lv.level}{cfgLv?.hard ? ' · 🔥 difficile' : ''}
							{s && (
								<span className="ec-goal">
									Ouvre {chestsWord(s.cfg.goal)}{s.limit > 0 ? ` en ${s.limit} coups maximum` : ''}
									{cfgLv ? <small>★★★ en {cfgLv.three} coups ou moins</small> : null}
								</span>
							)}
						</>
					)}
				</div>
			) : mode === 'daily' ? (
				<div className="ec-tag">
					{dailyLoading ? 'Préparation du défi…' : <>
						Défi du jour · {dailyWeekdayLabel()} · {DAILY[tierKey].label}
						{s && <span className="ec-goal">Ouvre {chestsWord(s.cfg.goal)} en un minimum de coups</span>}
					</>}
				</div>
			) : lv.booting ? null : (
				<div className="ec-pills" role="tablist" aria-label="Difficulté">
					{withExpert(TIER_ORDER, gameId).map((k) => (
						<button key={k} role="tab" aria-selected={tierKey === k} className={`ec-pill ${tierKey === k ? 'active' : ''}`} onClick={() => newFree(k)}>
							{TIERS[k].label}
						</button>
					))}
				</div>
			)}

			{novelty && !over && <p className="ec-novelty">Nouveau : {novelty}</p>}
			{lesson && !over && (
				<p className="ec-novelty ec-lesson">
					{/* The breath's lesson says what to do once its first swipe has filled the gauge. */}
					💡 {fireFull && cfgLv?.fire != null ? 'La jauge est pleine ! Touche Bijou : il crache trois boules de feu, d’abord sur les coffres.' : lesson}
					{guide.length > 0 && cfgLv?.hint ? <strong> Essaie vers {HINT_WORDS[cfgLv.hint]}.</strong> : null}
				</p>
			)}

			{s && (
				<div className="ec-hud">
					{mode === 'free' ? (
						<>
							<span className="ec-chip">⭐ <strong>{shownRef.current.score}</strong>{record ? <small> · record {record}</small> : null}</span>
							<span className="ec-chip" title="Tous les quelques coups, un peu plus de la cinquième couleur">Palier {step + 1}<small> · {toNext} coup{toNext > 1 ? 's' : ''}</small></span>
							{goldChipEl}
						</>
					) : (
						<>
							<span ref={chestChip} className="ec-chip" title="Coffres ouverts sur le nombre à ouvrir">{sprites ? <img className="ec-chip-ico" src={art('chest')} alt="" /> : '🎁'} <strong>{shownOpened}</strong>/{s.cfg.goal}</span>
							{s.limit > 0 ? (
								<span className={`ec-chip${movesLeft(s) <= 3 && !over ? ' low' : ''}`} title="Coups restants : sans coup, le niveau est perdu">
									👆 <strong>{movesLeft(s)}</strong> coup{movesLeft(s) > 1 ? 's' : ''} <small>restant{movesLeft(s) > 1 ? 's' : ''}</small>
								</span>
							) : (
								<span className="ec-chip">👆 <strong>{s.moves}</strong> coup{s.moves > 1 ? 's' : ''}</span>
							)}
							{mode === 'daily' && <span className="ec-chip chrono">{fmtCentis(elapsed)}</span>}
							{goldChipEl}
						</>
					)}
					<button className="ec-sound" onClick={toggleSound} aria-label={sound ? 'Couper le son' : 'Remettre le son'}>{sound ? '🔊' : '🔇'}</button>
				</div>
			)}

			{s && (
				<div className="ec-perch">
					<div className="ec-perch-side">
						{/* Bijou's gauge fills toward him; full, it is a button like him. */}
						<button
							type="button"
							className={`ec-fire${fireFull ? ' full' : ''}`}
							onClick={doBreathe}
							disabled={!canTap}
							aria-label={canTap ? 'Souffle de Bijou : la jauge est pleine, touche pour cracher trois boules de feu' : `Souffle de Bijou : ${shownFire} gemmes sur ${FIRE_FULL}`}
						>
							<span className="ec-fire-name">Souffle</span>
							<span ref={fireTrack} className="ec-fire-track">
								<span key={pour ? 'pour' : 'fill'} className={`ec-fire-fill${pour ? ' pour' : ''}`} style={{ width: `${pour ? 100 : (100 * shownFire) / FIRE_FULL}%` }} />
								{fireFull && <span className="ec-fire-cta">Touche Bijou !</span>}
							</span>
							{extra.has('fx-flame') ? <img src={art('fx-flame')} alt="" className="ec-fire-tip" /> : <span className="ec-fire-tip">🔥</span>}
						</button>
						{next.length > 0 ? (
							<div className="ec-next" aria-label="Prochains blocs">
								<span>À venir</span>
								{next.map((a, i) => <ArrivalChip key={i} a={a} />)}
								<span className="ec-next-mid">au centre</span>
								<ArrivalChip a={{ kind: 'gem', color: nextCentre(s) }} />
							</div>
						) : (
							// The row keeps its place once the game is decided, so nothing jumps while the last move plays.
							<div className="ec-next" aria-hidden="true" style={{ visibility: 'hidden' }}>
								<ArrivalChip a={{ kind: 'gem', color: 0 }} />
							</div>
						)}
					</div>
					<Bijou mood={mood} hoard={hoard} got={extra} grew={grew} onTap={canTap ? doBreathe : undefined} boxRef={bijouRef} />
				</div>
			)}

			<div
				ref={boardRef}
				className={`ec-boardwrap ${shake % 2 ? 'shake-a' : shake ? 'shake-b' : ''}`}
				onPointerDown={swipe.onPointerDown}
			>
				{cells.length > 0 ? (
					<svg
						viewBox={`-1.5 -1.5 ${N * U + 3} ${N * U + 3}`}
						className={`ec-svg ${phase === 'ready' ? 'blurred' : ''} ${over && mode !== 'levels' ? 'dimmed' : ''}`}
						role="application"
						aria-label="Plateau de Dragon's Gems Swipe : glisse pour tout faire glisser"
					>
						<defs>
							<radialGradient id="ec-halo">
								<stop offset="0" stopColor="#fff6c8" stopOpacity="0.95" />
								<stop offset="0.45" stopColor="#ffd24a" stopOpacity="0.45" />
								<stop offset="1" stopColor="#ffd24a" stopOpacity="0" />
							</radialGradient>
							{[...GEMS.map((g) => g.fill), '#ffd24a', '#b9bec7'].map((fill, k) => (
								<radialGradient key={k} id={`ec-pop-${k}`}>
									<stop offset="0" stopColor="#fff" stopOpacity="0.95" />
									<stop offset="0.35" stopColor={fill} stopOpacity="0.75" />
									<stop offset="1" stopColor={fill} stopOpacity="0" />
								</radialGradient>
							))}
						</defs>
						<rect x={-1.5} y={-1.5} width={N * U + 3} height={N * U + 3} rx={3} className="ec-tray" />
						{Array.from({ length: N * N }, (_, i) => (
							<rect key={`s${i}`} x={(i % N) * U + 0.5} y={Math.floor(i / N) * U + 0.5} width={U - 1} height={U - 1} rx={1.8} className="ec-slot" />
						))}
						<circle cx={cx(CENTRE)} cy={cy(CENTRE)} r={3.2} className="ec-centre-mark" />

						<g key={nudge?.id ?? 0} className={nudge ? 'ec-nudge' : undefined} style={{ ['--nx' as string]: `${nudgeDir[0]}px`, ['--ny' as string]: `${nudgeDir[1]}px` }}>
							{cells.map((b, i) =>
								b ? (
									<g key={`${round}-${b.id}`} className="ec-cell" style={{ transform: `translate(${cx(i)}px, ${cy(i)}px)` }}>
										<g className="ec-tug" data-id={b.id}>
											<g
												className={b.id === enter.centre ? 'ec-drop' : enter.ids.has(b.id) ? 'ec-in' : undefined}
												style={enter.ids.has(b.id) ? { ['--fx' as string]: `${inFrom[0]}px`, ['--fy' as string]: `${inFrom[1]}px` } : undefined}
											>
												<g
													key={grown.has(b.id) ? `g${fx?.id}` : 'g'}
													className={glowSet.has(i) ? 'ec-glow' : grown.has(b.id) ? 'ec-grow' : undefined}
													style={grown.has(b.id) ? { animationDelay: `${grown.get(b.id)}ms` } : undefined}
												>
													<Piece b={b} />
												</g>
											</g>
											{previewSet.has(b.id) && <rect x={-4.9} y={-4.9} width={9.8} height={9.8} rx={2.2} className="ec-preview" />}
										</g>
									</g>
								) : null,
							)}
						</g>

						{fx && (
							<g key={fx.id}>
								{fx.zones.map((z, k) => {
									const rad = z.rank >= MAX_RANK ? N : z.rank - 1;
									const [r, c] = [Math.floor(z.cell / N), z.cell % N];
									const [x0, y0] = [Math.max(0, c - rad), Math.max(0, r - rad)];
									const [x1, y1] = [Math.min(N - 1, c + rad), Math.min(N - 1, r + rad)];
									const d = { animationDelay: `${z.delay}ms` };
									return (
										<g key={`z${k}`}>
											<rect x={x0 * U} y={y0 * U} width={(x1 - x0 + 1) * U} height={(y1 - y0 + 1) * U} rx={3} className={`ec-zone r${z.rank}`} style={d} />
											{sprites ? (
												<image href={art('fx-ring')} x={cx(z.cell) - (Math.min(rad, 3) + 0.8) * U} y={cy(z.cell) - (Math.min(rad, 3) + 0.8) * U} width={(Math.min(rad, 3) + 0.8) * 2 * U} height={(Math.min(rad, 3) + 0.8) * 2 * U} className={`ec-wave r${z.rank}`} style={d} />
											) : (
												<circle cx={cx(z.cell)} cy={cy(z.cell)} r={(Math.min(rad, 3) + 0.6) * U} className={`ec-wave r${z.rank}`} style={d} />
											)}
										</g>
									);
								})}
								{fx.bolts.map((b, k) => {
									const [mx, my] = [(cx(b.from) + cx(b.to)) / 2 + ((k % 3) - 1) * 2.4, (cy(b.from) + cy(b.to)) / 2 + (((k + 1) % 3) - 1) * 2.4];
									return <path key={`l${k}`} d={`M${cx(b.from)},${cy(b.from)}L${mx},${my}L${cx(b.to)},${cy(b.to)}`} className="ec-bolt" style={{ animationDelay: `${b.delay}ms` }} />;
								})}
								{fx.pops.map((p, k) => (
									<g key={`p${k}`} transform={`translate(${cx(p.cell)} ${cy(p.cell)})`}>
										{p.into >= 0 ? (
											<g
												className="ec-fly"
												style={{ animationDelay: `${p.delay}ms`, ['--dx' as string]: `${cx(p.into) - cx(p.cell)}px`, ['--dy' as string]: `${cy(p.into) - cy(p.cell)}px` }}
											>
												<Gem color={p.color} rank={p.rank} />
											</g>
										) : (
											<>
												<circle
													r={sprites ? 5.6 : 4.2}
													className={`ec-pop ${p.kind}`}
													fill={
														sprites
															? `url(#ec-pop-${p.kind === 'gem' ? p.color % GEMS.length : p.kind === 'chest' ? GEMS.length : GEMS.length + 1})`
															: p.kind === 'gem' ? GEMS[p.color % GEMS.length].fill : p.kind === 'chest' ? '#ffd24a' : '#9aa0aa'
													}
													style={{ animationDelay: `${p.delay}ms` }}
												/>
												{sprites && <image href={art('fx-burst')} x={-6} y={-6} width={12} height={12} className="ec-burst" style={{ animationDelay: `${p.delay}ms` }} />}
												{[0, 1, 2, 3, 4, 5].slice(0, p.rank >= 2 ? 6 : 4).map((k2) => (
													<path
														key={k2}
														d="M0,-1L0.8,0L0,1L-0.8,0Z"
														className="ec-shard"
														fill={p.kind === 'gem' ? GEMS[p.color % GEMS.length].fill : '#ffd24a'}
														style={{ animationDelay: `${p.delay}ms`, ['--sx' as string]: `${[5, -5, 4, -4, 0, 1][k2] * (p.rank >= 2 ? 1.4 : 1)}px`, ['--sy' as string]: `${[-4, -3, 5, 4, -6, 6][k2] * (p.rank >= 2 ? 1.4 : 1)}px` }}
													/>
												))}
												{/* With the drawings, the chest's coins fly in the layer above (chestShow). */}
												{p.kind === 'chest' && !sprites && [0, 1, 2, 3, 4].map((k2) => (
													<circle key={`c${k2}`} r={1} className="ec-coin" style={{ animationDelay: `${p.delay + k2 * 40}ms`, ['--sx' as string]: `${(k2 - 2) * 2.4}px` }} />
												))}
											</>
										)}
									</g>
								))}
								{fx.comets.map((c, k) => (
									<g
										key={`c${k}`}
										className="ec-comet"
										style={{
											animationDuration: `${COMET_MS}ms`,
											['--fx' as string]: `${cx(c.from)}px`, ['--fy' as string]: `${cy(c.from)}px`,
											['--tx' as string]: `${cx(c.to)}px`, ['--ty' as string]: `${cy(c.to)}px`,
										}}
									>
										{sprites ? (
											<image
												href={art('fx-comet')}
												x={-13}
												y={-8}
												width={16}
												height={16}
												transform={`rotate(${(Math.atan2(cy(c.to) - cy(c.from), cx(c.to) - cx(c.from)) * 180) / Math.PI})`}
											/>
										) : (
											<>
												{[3, 2, 1].map((tail) => <circle key={tail} r={2.2 - tail * 0.45} cx={0} cy={0} className="ec-comet-tail" style={{ transform: `translate(${(cx(c.from) - cx(c.to)) * tail * 0.06}px, ${(cy(c.from) - cy(c.to)) * tail * 0.06}px)` }} />)}
												<circle r={2.8} className="ec-comet-head" />
												<path d={starPath(4, 4, 1)} className="ec-comet-star" />
											</>
										)}
									</g>
								))}
								{fx.fused.map((f, k) => (
									<g key={`f${k}`}>
										<circle cx={cx(f.cell)} cy={cy(f.cell)} r={5} className={`ec-born r${f.rank}`} style={{ animationDelay: `${f.delay}ms` }} />
										{sprites && [0, 1, 2, 3].slice(0, f.rank).map((k2) => (
											<g key={k2} transform={`translate(${cx(f.cell)} ${cy(f.cell)})`}>
												<image
													href={art('fx-sparkle')}
													x={-2}
													y={-2}
													width={4}
													height={4}
													className="ec-sparkfly"
													style={{ animationDelay: `${f.delay}ms`, ['--sx' as string]: `${[6, -6, 5, -5][k2]}px`, ['--sy' as string]: `${[-5, -4, 6, 5][k2]}px` }}
												/>
											</g>
										))}
									</g>
								))}
							</g>
						)}
					</svg>
				) : (
					<div className="ec-loading">Préparation…</div>
				)}

				{/* Keyed apart: a wave's chain and label take the same fx id. */}
				{sweep && <div key={`sweep${sweep.id}`}className={`ec-sweep ${sweep.dir}`} aria-hidden="true" onAnimationEnd={() => setSweep(null)} />}

				{chain && <div key={`chain${chain.id}`} className={`ec-chain w${Math.min(5, chain.wave)}`}>Chaîne ×{chain.wave}</div>}
				{label && (
					<div
						key={`label${label.id}`}
						className="ec-label"
						style={{ left: `${Math.min(80, Math.max(20, ((cx(label.cell) + 1.5) / (N * U + 3)) * 100))}%`, top: `${Math.min(78, Math.max(14, ((cy(label.cell) + 1.5 - 0.8 * U) / (N * U + 3)) * 100))}%` }}
						onAnimationEnd={() => setLabel(null)}
					>
						{label.text}
					</div>
				)}
				{toast && <div key={`toast${toast.id}`} className="ec-toast" onAnimationEnd={() => setToast(null)}>{toast.text}</div>}
				<p className="sr-only" role="status">{stuck && s ? `${outOfMoves(s) ? 'Plus de coups' : 'Plus de place'} : touche Bijou pour son souffle.` : said}</p>

				{dailyLoading && <div className="ec-overlay"><div className="ec-card">Préparation…</div></div>}

				{phase === 'ready' && !dailyLoading && s && !lv.menu && (
					<div className="ec-overlay">
						<button className="ec-start" onClick={begin}>{mode === 'levels' ? `▶ Niveau ${lv.level} — Commencer` : '▶ Commencer'}</button>
					</div>
				)}

				{stuck && s && (
					<div className="ec-overlay ec-stuck">
						<p className="ec-stuck-why">{outOfMoves(s) ? 'Plus de coups' : 'Plus de place'} : Bijou peut sauver la partie !</p>
						<button className="ec-start" onClick={doBreathe}>🔥 Souffle de Bijou</button>
					</div>
				)}

				{over && mode === 'free' && s && (
					<div className="ec-overlay">
						<div className="ec-card" role="dialog" aria-label="Partie terminée">
							<div className="ec-mark">{newRecord ? '🏅' : '💥'}</div>
							<h2>{s.score} points</h2>
							<p className="ec-sub">{newRecord ? 'Nouveau record !' : record ? `Record ${record}` : ''} · {s.moves} coups · palier {step + 1} · {TIERS[tierKey].label}</p>
							{endGain > 0 && <p className="ec-sub">🪙 +{fmtGold(endGain)} au trésor de Bijou</p>}
							<button className="ec-start sm" onClick={() => newFree(tierKey)}>Rejouer</button>
						</div>
					</div>
				)}

				{over && mode === 'daily' && s && (
					<div className="ec-overlay">
						<div className="ec-card" role="dialog" aria-label="Défi du jour terminé">
							<div className="ec-mark">{won ? '🎁' : '🧱'}</div>
							<h2>{won ? `${s.cfg.goal} coffres en ${s.moves} coups` : gaveUp ? 'Défi abandonné' : 'Le plateau est plein'}</h2>
							{won && <p className="ec-sub">{fmtCentis(elapsed)}</p>}
							{endGain > 0 && <p className="ec-sub">🪙 +{fmtGold(endGain)} au trésor de Bijou</p>}
							<DailyDone />
						</div>
					</div>
				)}

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={eclatsLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={
							lv.won
								? `${s?.moves ?? 0} coups${cfgLv && lv.stars < 3 ? ` · ★★★ en ${cfgLv.three} coups ou moins` : ''}${endGain ? ` · 🪙 +${fmtGold(endGain)} au trésor de Bijou` : ''}`
								: s && outOfMoves(s)
									? `Plus de coups : ${s.opened} ${s.opened > 1 ? 'coffres ouverts' : 'coffre ouvert'} sur ${s.cfg.goal}${butinRef.current ? ` · ${fmtGold(butinRef.current)} pièces de butin perdues` : ''}`
									: `Plateau plein${s ? ` : ${s.opened} ${s.opened > 1 ? 'coffres ouverts' : 'coffre ouvert'} sur ${s.cfg.goal}` : ''}${butinRef.current ? ` · ${fmtGold(butinRef.current)} pièces de butin perdues` : ''}. Astuce : garde de la place, de nouveaux blocs entrent à chaque coup.`
						}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
			</div>

			{mode === 'daily' && !dailyLoading && phase !== 'ready' && !over && (
				<GiveUp onGiveUp={giveUp} warn="Le défi du jour sera terminé, sans score classé." />
			)}

			<details className="ec-help">
				<summary>
					<span>Glisse : tout le plateau suit. 3 gemmes de même couleur qui se touchent explosent ; 4 ou plus fusionnent. Une explosion près d'un coffre l'ouvre.</span>
					<strong>Toutes les règles</strong>
				</summary>
				<p>
					Glisse le doigt sur le plateau (ou les flèches du clavier) : tous les blocs glissent jusqu'au bout.
					3 gemmes de la même couleur qui se touchent explosent ; 4 ou plus fusionnent en une gemme plus forte
					(chargée, joyau, couronne) qui explose plus fort quand elle saute avec sa couleur : 3×3, 5×5, puis
					toute sa couleur. Un carré de 4 lance une comète vers un coffre. Après chaque coup, de nouveaux blocs
					entrent par le bord opposé et une gemme tombe au centre : les explosions s'enchaînent. Une explosion
					à côté d'un coffre l'ouvre : ses pièces vont au butin, d'autant plus nombreuses que la chaîne est
					longue (le double pour un coffre cadenassé). En fin de partie, le butin rejoint le trésor de Bijou, le
					bébé dragon ; un niveau perdu le perd. Chaque gemme détruite remplit la jauge de souffle de Bijou :
					pleine, touche Bijou (ou la barre d'espace) et il crache trois boules de feu, d'abord sur les coffres,
					sinon là où les gemmes s'entassent. Ça ne compte pas comme un coup, et tant que la jauge est pleine,
					un plateau plein n'est pas perdu. En mode Niveaux, les coups sont comptés : sans coup avant le dernier
					coffre, le niveau est perdu (un niveau sur dix, marqué 🔥, est plus serré). Garde le doigt appuyé pour
					accélérer une longue chaîne.
				</p>
			</details>

			{lv.active && lv.menu && (
				<LevelSelect
					progress={lv.progress}
					onPick={startLevel}
					onClose={closeLevels}
					sections={WORLDS.filter((w) => w.from <= eclatsLevels.count).map((w, i) => ({ from: w.from, title: i < 5 ? `Monde ${i + 1} · ${w.name}` : w.name }))}
				/>
			)}

			{mode === 'daily' && (
				<LeaderboardCorner
					key={`lb-${alreadyPlayed ? 1 : 0}`}
					game={LB_ID(gameId)}
					metric="time"
					side="right"
					actions
					submitValue={over && won && !gaveUp ? dailyScore : undefined}
					format={fmtPacked}
				/>
			)}
			{mode === 'free' && <LeaderboardCorner game={LB_ID(gameId)} metric="time" format={fmtPacked} side="right" />}
		</div>
		</ArtCtx.Provider>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.ec-root {
  position: relative; width: 100%; max-width: 460px; margin-inline: auto;
  color: var(--gray-0); font-family: var(--font-body);
  display: flex; flex-direction: column; align-items: center;
}
.ec-flylayer { position: absolute; inset: 0; z-index: 8; pointer-events: none; }
.ec-flyer { position: absolute; left: 0; top: 0; pointer-events: none; will-change: transform; }
.ec-bigchest { filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.35)); }
.ec-bigcoin { filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.3)); }
.ec-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.6rem; }
.ec-goal { display: block; margin-top: 2px; color: var(--gray-100); font-size: 14px; font-weight: 700; }
.ec-goal small { display: block; color: var(--gray-300); font-size: 12.5px; font-weight: 500; }
.ec-novelty {
  margin: 0 0 0.6rem; max-width: 420px; text-align: center; font-size: 12.5px; line-height: 1.45;
  color: var(--gray-100); background: var(--accent-overlay); border: 1px solid var(--accent-regular);
  border-radius: 12px; padding: 6px 12px;
}
.ec-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.6rem; }
.ec-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
}
.ec-pill.active { background: var(--accent-regular); color: var(--accent-text-over); border-color: var(--accent-regular); }

.ec-hud { width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap; margin-bottom: 0.45rem; }
.ec-chip {
  background: var(--gray-900); color: var(--gray-100); border-radius: 999px; padding: 4px 11px;
  font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums;
}
.ec-chip strong { color: var(--accent-regular); }
:root.theme-dark .ec-chip:not(.gold):not(.low) strong { color: #d8b4fe; } /* the accent purple is too dark on a dark chip */
.ec-chip.gold strong { color: #d99a0b; }
.ec-chip small { color: var(--gray-300); font-weight: 500; }
.ec-chip-ico { width: 19px; height: 19px; object-fit: contain; vertical-align: -4px; }
/* The daily's five counters on one line on a phone, chrono and all. */
@media (max-width: 420px) {
  .ec-hud { gap: 4px; }
  .ec-chip { padding: 4px 8px; }
  .ec-sound { width: 28px; }
}
.ec-chip.low { background: rgba(214, 58, 31, 0.16); animation: ec-low 0.8s ease-in-out infinite alternate; }
.ec-chip.low strong { color: #d63a1f; }
.ec-sound { border: none; background: var(--gray-900); border-radius: 999px; width: 32px; height: 28px; cursor: pointer; font-size: 14px; }

/* The arrivals on the left; Bijou on his pile at the board's top corner, over its frame but never a cell. */
.ec-perch {
  width: 100%; max-width: min(440px, 62vh); display: flex; align-items: flex-end; justify-content: space-between; gap: 6px;
}
.game-page:fullscreen .ec-perch { max-width: min(560px, calc(100dvh - 290px)); }
.game-page:-webkit-full-screen .ec-perch { max-width: min(560px, calc(100dvh - 290px)); }
/* Per pile size: the box height, the pile's offset (its drawing has empty space below), and how high Bijou sits on it. */
.ec-bijou {
  --k: 1; --h: 86px; --pb: -17px; --db: 12px;
  position: relative; flex: none; width: calc(104px * var(--k)); height: calc(var(--h) * var(--k));
  margin-bottom: -6px; margin-right: -4px; z-index: 3; pointer-events: none;
}
.ec-bijou.t1 { --h: 80px; --pb: -16px; --db: 6px; }
.ec-bijou.t3 { --h: 104px; --pb: -14px; --db: 30px; }
.ec-bijou.t4 { --h: 110px; --pb: -11px; --db: 36px; }
.ec-pile { position: absolute; left: 0; bottom: calc(var(--pb) * var(--k)); width: 100%; transform-origin: 50% 85%; }
.ec-pile.grew { animation: ec-grew 0.6s cubic-bezier(.3, 1.6, .5, 1); }
.ec-drake {
  position: absolute; left: 0; right: 0; bottom: calc(var(--db) * var(--k)); width: calc(74px * var(--k)); height: calc(74px * var(--k));
  margin-inline: auto; transform-origin: 50% 100%;
}
.ec-dance img { position: absolute; inset: 0; width: 100%; height: 100%; }
/* The two steps take turns: one shows while the other hides, never both. */
.ec-dance img:nth-child(1) { animation: ec-step-a 0.5s steps(1) infinite; }
.ec-dance img:nth-child(2) { animation: ec-step-b 0.5s steps(1) infinite; }
.ec-hoardtag {
  position: absolute; left: 50%; bottom: 1px; transform: translateX(-50%); white-space: nowrap;
  background: rgba(16, 20, 30, 0.82); color: #ffe27a; border-radius: 999px; padding: 0 7px;
  font-size: 10.5px; font-weight: 700; line-height: 16px; font-variant-numeric: tabular-nums;
}
.m-idle .ec-drake { animation: ec-breathe 1.7s ease-in-out infinite alternate; }
.m-sleep .ec-drake { animation: ec-breathe 2.8s ease-in-out infinite alternate; }
.m-wow .ec-drake { animation: ec-wow 0.45s cubic-bezier(.3, 1.6, .5, 1); }
.m-cheer .ec-drake { animation: ec-hop 0.36s ease-in-out 4 alternate; }
.m-fly .ec-drake { animation: ec-fly-up 1.5s ease-in-out; }
.m-scared .ec-drake { animation: ec-shiver 0.14s linear infinite; }
.m-sad .ec-drake { transform: translateY(3px) scale(0.97); }
.m-dance .ec-drake { animation: ec-sway 0.5s ease-in-out infinite alternate; }
@media (min-width: 600px) {
  .ec-bijou { --k: 1.23; }
}

.ec-perch-side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
/* Bijou's gauge, over the arrivals: it fills toward him; full, it glows and is a button. */
.ec-fire {
  display: flex; align-items: center; gap: 6px; width: 100%; margin: 0; padding: 0; border: none; background: none;
  font: inherit; color: var(--gray-300); cursor: default; -webkit-tap-highlight-color: transparent;
}
.ec-fire:not(:disabled) { cursor: pointer; }
.ec-fire-name { flex: none; font-size: 11.5px; font-weight: 600; }
.ec-fire-track {
  position: relative; flex: 1; height: 14px; border-radius: 999px; background: #1d2638;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
}
.ec-fire-fill {
  position: absolute; left: 0; top: 0; bottom: 0; border-radius: inherit;
  background: linear-gradient(90deg, #ffcf4a, #ff8a1f 55%, #ff4a2b); transition: width 0.25s ease-out;
}
.ec-fire-fill.pour { animation: ec-pour 0.42s ease-in forwards; }
.ec-fire.full .ec-fire-track { box-shadow: 0 0 0 1.5px #ffcf4a, 0 0 12px 2px rgba(255, 138, 31, 0.75); animation: ec-fire-glow 0.8s ease-in-out infinite alternate; }
.ec-fire.full .ec-fire-fill { background: linear-gradient(90deg, #ffcf4a, #ff8a1f, #ff4a2b, #ff8a1f, #ffcf4a); background-size: 200% 100%; animation: ec-flow 1.2s linear infinite; }
.ec-fire-cta {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; white-space: nowrap;
  font-size: 10.5px; font-weight: 800; color: #fff; text-shadow: 0 1px 2px rgba(122, 30, 0, 0.9);
}
.ec-fire-tip { flex: none; width: 22px; height: 22px; object-fit: contain; font-size: 16px; line-height: 22px; text-align: center; }
.ec-fire.full .ec-fire-tip { animation: ec-flicker 0.4s ease-in-out infinite alternate; }
span.ec-ember { border-radius: 50%; background: radial-gradient(circle, #fff6c8 0, #ffb02e 40%, rgba(255, 74, 43, 0) 70%); }
.ec-fireball { filter: drop-shadow(0 0 6px rgba(255, 140, 40, 0.8)); }
.ec-fireball.dyed { filter: hue-rotate(180deg) saturate(1.8) brightness(1.1) drop-shadow(0 0 6px rgba(255, 140, 40, 0.8)); }
.ec-bijou.tap { pointer-events: auto; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.ec-bijou.tap:focus-visible { outline: 2px solid #ffcf4a; outline-offset: 2px; border-radius: 12px; }
.m-ready .ec-drake { animation: ec-ready 0.8s ease-in-out infinite alternate; }
.m-breath .ec-drake { animation: ec-roar 0.9s ease-out; }

.ec-next { display: flex; align-items: center; gap: 3px; margin-bottom: 0.45rem; color: var(--gray-300); font-size: 11.5px; font-weight: 600; }
.ec-next span { margin-right: 4px; }
.ec-next .ec-next-mid { margin: 0 2px 0 8px; }
.ec-next svg { background: #1d2638; border-radius: 6px; }

.ec-boardwrap {
  position: relative; width: 100%; max-width: min(440px, 62vh); aspect-ratio: 1;
  touch-action: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; cursor: grab;
}
.game-page:fullscreen .ec-boardwrap { max-width: min(560px, calc(100dvh - 290px)); }
.game-page:-webkit-full-screen .ec-boardwrap { max-width: min(560px, calc(100dvh - 290px)); }
/* A computer screen has room for a bigger board, as long as the goal above it still shows. */
@media (min-width: 900px) {
  .ec-root { max-width: 600px; }
  .ec-perch, .ec-boardwrap { max-width: min(580px, max(440px, calc(100vh - 300px))); }
  .ec-bijou { --k: 1.45; }
  .ec-tag { font-size: 13.5px; }
  .ec-goal { font-size: 15.5px; }
  .ec-chip { font-size: 14.5px; padding: 5px 13px; }
  .ec-chip-ico { width: 21px; height: 21px; }
  .ec-fire-name, .ec-next { font-size: 13px; }
}
.ec-svg { display: block; width: 100%; height: 100%; }
.ec-svg.blurred { filter: blur(4px); opacity: 0.55; }
.ec-svg.dimmed { filter: brightness(0.55) saturate(0.8); }
.ec-loading { padding: 4rem 0; color: var(--gray-300); font-weight: 600; text-align: center; }
.ec-tray { fill: #1b2337; stroke: #2c3854; stroke-width: 0.4; }
.ec-slot { fill: #232d45; }
.ec-centre-mark { fill: none; stroke: #3a4870; stroke-width: 0.5; stroke-dasharray: 1 0.8; }

.ec-cell { transition: transform 0.14s ease-out; }
/* A played swipe: a band of light crosses the board its way. The band is 45 % of the board, so 222 % of it is the board. */
.ec-sweep { position: absolute; inset: 0; overflow: hidden; border-radius: 4%; pointer-events: none; }
.ec-sweep::before { content: ''; position: absolute; opacity: 0; animation: 0.28s ease-out both; }
.ec-sweep.left::before, .ec-sweep.right::before { top: 0; bottom: 0; left: 0; width: 45%; background: linear-gradient(90deg, transparent, rgba(255, 244, 214, 0.3), transparent); }
.ec-sweep.up::before, .ec-sweep.down::before { left: 0; right: 0; top: 0; height: 45%; background: linear-gradient(180deg, transparent, rgba(255, 244, 214, 0.3), transparent); }
.ec-sweep.right::before { animation-name: ec-sweep-right; }
.ec-sweep.left::before { animation-name: ec-sweep-left; }
.ec-sweep.down::before { animation-name: ec-sweep-down; }
.ec-sweep.up::before { animation-name: ec-sweep-up; }
.ec-in { animation: ec-in 0.16s ease-out both; }
.ec-drop { animation: ec-drop 0.26s cubic-bezier(.3, 1.6, .5, 1) both; transform-box: fill-box; transform-origin: center; }
.ec-grow { animation: ec-grow 0.32s cubic-bezier(.3, 1.7, .5, 1) both; transform-box: fill-box; transform-origin: center; }
.ec-glow { animation: ec-glow 0.12s ease-out both; transform-box: fill-box; transform-origin: center; }
.ec-glow > g, .ec-glow > path, .ec-glow > circle { filter: brightness(1.6) drop-shadow(0 0 1.2px #fff); }
.ec-preview { fill: none; stroke: #fff; stroke-width: 0.6; stroke-dasharray: 1.2 0.9; animation: ec-blink 0.6s ease-in-out infinite alternate; pointer-events: none; }
.ec-nudge { animation: ec-nudge 0.22s ease-out; }

.ec-ice { fill: rgba(190, 232, 255, 0.5); stroke: #e8f7ff; stroke-width: 0.6; }
.ec-rock { fill: #8b9099; stroke: #4c5059; stroke-width: 0.55; stroke-linejoin: round; }
.ec-rock-crack { fill: none; stroke: #4c5059; stroke-width: 0.45; stroke-linecap: round; }
.ec-core { fill: #fff; animation: ec-core 0.9s ease-in-out infinite alternate; }
.ec-rank.r2 > g > path, .ec-rank.r2 > g > circle:first-child { animation: ec-rim 1.2s ease-in-out infinite alternate; }
.ec-twinkle { fill: #fff; animation: ec-twinkle 1.1s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
.ec-twinkle.t2 { animation-delay: -0.55s; }
.ec-charged { animation: ec-rim 1.2s ease-in-out infinite alternate; }
.ec-burst { opacity: 0; pointer-events: none; transform-box: fill-box; transform-origin: center; animation: ec-burst 0.36s ease-out forwards; }
.ec-sparkfly { opacity: 0; pointer-events: none; transform-box: fill-box; transform-origin: center; animation: ec-shard 0.6s ease-out forwards; }
.ec-halo { opacity: 0.35; animation: ec-halo 1.4s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
.ec-orbit { fill: #fff; animation: ec-spin 2.4s linear infinite; }
.ec-rays { fill: none; stroke: #ffe27a; stroke-width: 0.7; stroke-linecap: round; animation: ec-spin 6s linear infinite, ec-rays 0.8s ease-in-out infinite alternate; }
.ec-crown { fill: #ffd24a; stroke: #a56d09; stroke-width: 0.35; stroke-linejoin: round; }
.ec-rank.r4 .ec-halo { animation: ec-halo 1.4s ease-in-out infinite alternate, ec-hue 3s linear infinite; opacity: 0.5; }
.ec-rank .ec-halo.art { animation: ec-halo 1.4s ease-in-out infinite alternate; opacity: 0.75; }
.ec-rank.r4 .ec-halo.art { opacity: 1; }
.ec-chest { animation: ec-shine 1.6s ease-in-out infinite alternate; }

.ec-pop { pointer-events: none; transform-box: fill-box; transform-origin: center; opacity: 0; animation: ec-pop 0.3s ease-out forwards; }
.ec-shard { pointer-events: none; opacity: 0; animation: ec-shard 0.42s ease-out forwards; }
.ec-coin { fill: #ffd24a; stroke: #a56d09; stroke-width: 0.3; opacity: 0; animation: ec-coin 0.7s ease-out forwards; }
.ec-fly { pointer-events: none; animation: ec-fly 0.22s ease-in both; }
.ec-zone { pointer-events: none; opacity: 0; fill: rgba(255, 150, 60, 0.5); animation: ec-flash 0.36s ease-out forwards; }
.ec-zone.r3 { fill: rgba(255, 110, 70, 0.6); animation-duration: 0.5s; }
.ec-zone.r4 { fill: rgba(255, 245, 210, 0.75); animation-duration: 0.6s; }
.ec-wave { fill: none; stroke: #ffd9a0; stroke-width: 0.8; opacity: 0; pointer-events: none; transform-box: fill-box; transform-origin: center; animation: ec-wave 0.45s ease-out forwards; }
.ec-wave.r3 { stroke: #ffb37a; stroke-width: 1.2; }
.ec-wave.r4 { stroke: #fff; stroke-width: 1.5; }
.ec-bolt { fill: none; stroke: #fff6c8; stroke-width: 0.7; stroke-linejoin: round; opacity: 0; pointer-events: none; animation: ec-bolt 0.4s ease-out forwards; }
.ec-comet { pointer-events: none; animation-name: ec-comet; animation-timing-function: cubic-bezier(.4, 0, .9, .6); animation-fill-mode: both; }
.ec-comet-head { fill: #fff; }
.ec-comet-tail { fill: #9fd2ff; opacity: 0.55; }
.ec-comet-star { fill: #e9f6ff; opacity: 0.8; animation: ec-spin 0.4s linear infinite; transform-box: fill-box; transform-origin: center; }
.ec-born { fill: none; stroke: #fff; stroke-width: 0.7; opacity: 0; pointer-events: none; transform-box: fill-box; transform-origin: center; animation: ec-ring 0.5s ease-out forwards; }
.ec-born.r3 { stroke: #ffe27a; stroke-width: 1; }
.ec-born.r4 { stroke: #ffe27a; stroke-width: 1.4; animation-duration: 0.8s; }
.ec-label {
  position: absolute; z-index: 4; pointer-events: none; transform: translate(-50%, -50%); white-space: nowrap;
  font-family: var(--font-brand); font-weight: 800; font-size: 18px; color: #ffe27a;
  text-shadow: 0 2px 0 #7a4a09, 0 0 10px rgba(255, 210, 74, 0.8);
  animation: ec-label 1.1s ease-out both;
}

.ec-boardwrap.shake-a { animation: ec-shake-a 0.32s ease-out; }
.ec-boardwrap.shake-b { animation: ec-shake-b 0.32s ease-out; }

.ec-chain {
  position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); z-index: 4; pointer-events: none;
  font-family: var(--font-brand); font-weight: 800; color: #fff; white-space: nowrap;
  text-shadow: 0 2px 0 #7a35c7, 0 0 12px rgba(122, 53, 199, 0.8);
  animation: ec-chain 0.7s ease-out both;
}
.ec-chain.w2 { font-size: 24px; }
.ec-chain.w3 { font-size: 30px; }
.ec-chain.w4 { font-size: 36px; color: #ffe27a; }
.ec-chain.w5 { font-size: 42px; color: #ffe27a; }
.ec-toast {
  position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); z-index: 4;
  background: rgba(16, 20, 30, 0.88); color: #fff; border: 1px solid var(--accent-regular);
  border-radius: 999px; padding: 6px 14px; font-size: 13px; font-weight: 600; white-space: nowrap;
  max-width: 92vw; overflow: hidden; text-overflow: ellipsis; pointer-events: none;
  animation: ec-toast 2s ease forwards;
}

.ec-overlay { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; }
.ec-card {
  background: var(--gray-999); border: 2px solid var(--accent-regular); border-radius: 18px;
  padding: 20px 26px; text-align: center; box-shadow: var(--shadow-lg); max-width: 88%;
}
.ec-card h2 { font-family: var(--font-brand); font-size: 20px; margin: 4px 0 2px; color: var(--gray-0); }
.ec-mark { font-size: 30px; }
.ec-sub { color: var(--gray-300); font-size: 13px; margin: 2px 0 12px; }
.ec-start {
  border: none; background: var(--accent-regular); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 17px; border-radius: 999px; padding: 13px 32px; cursor: pointer;
  box-shadow: var(--shadow-lg);
}
.ec-start.sm { font-size: 14px; padding: 10px 24px; }
/* The board stays readable behind: only his breath can play. */
.ec-stuck { flex-direction: column; gap: 10px; background: rgba(10, 14, 24, 0.38); border-radius: 4%; }
.ec-stuck .ec-start { background: linear-gradient(90deg, #ffb02e, #ff6a2b); color: #fff; text-shadow: 0 1px 2px rgba(122, 30, 0, 0.7); animation: ec-fire-glow 0.8s ease-in-out infinite alternate; }
.ec-stuck-why {
  margin: 0; padding: 6px 14px; border-radius: 999px; background: rgba(16, 20, 30, 0.88); color: #fff;
  font-size: 13.5px; font-weight: 700; text-align: center;
}

.ec-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 0.9rem; }
.ec-help summary { list-style: none; cursor: pointer; }
.ec-help summary::-webkit-details-marker { display: none; }
.ec-help summary span { display: block; color: var(--gray-100); font-size: 13px; }
.ec-help summary strong { display: inline-block; margin-top: 4px; color: var(--accent-regular); font-size: 12.5px; }
.ec-help summary strong::after { content: ' ▾'; }
.ec-help[open] summary strong::after { content: ' ▴'; }
:root.theme-dark .ec-help summary strong { color: #d8b4fe; }
.ec-help p { margin: 8px 0 0; }
.game-page:fullscreen .ec-help { display: none; }
.game-page:-webkit-full-screen .ec-help { display: none; }

@keyframes ec-in { from { transform: translate(var(--fx), var(--fy)) scale(0.6); opacity: 0; } to { transform: translate(0, 0) scale(1); opacity: 1; } }
@keyframes ec-glow { from { transform: scale(1); } to { transform: scale(1.14); } }
@keyframes ec-blink { from { opacity: 0.45; } to { opacity: 1; } }
@keyframes ec-nudge { 0% { transform: translate(0, 0); } 40% { transform: translate(var(--nx), var(--ny)); } 100% { transform: translate(0, 0); } }
@keyframes ec-sweep-right { 0% { transform: translateX(-100%); opacity: 0; } 25% { opacity: 1; } 100% { transform: translateX(222%); opacity: 0; } }
@keyframes ec-sweep-left { 0% { transform: translateX(222%); opacity: 0; } 25% { opacity: 1; } 100% { transform: translateX(-100%); opacity: 0; } }
@keyframes ec-sweep-down { 0% { transform: translateY(-100%); opacity: 0; } 25% { opacity: 1; } 100% { transform: translateY(222%); opacity: 0; } }
@keyframes ec-sweep-up { 0% { transform: translateY(222%); opacity: 0; } 25% { opacity: 1; } 100% { transform: translateY(-100%); opacity: 0; } }
@keyframes ec-pop { 0% { opacity: 0.95; transform: scale(1); } 100% { opacity: 0; transform: scale(1.9); } }
@keyframes ec-shard { 0% { opacity: 1; transform: translate(0, 0) rotate(0); } 100% { opacity: 0; transform: translate(var(--sx), var(--sy)) rotate(160deg); } }
@keyframes ec-coin { 0% { opacity: 1; transform: translate(0, 0); } 45% { opacity: 1; transform: translate(var(--sx), -7px); } 100% { opacity: 0; transform: translate(var(--sx), -3px); } }
@keyframes ec-flash { from { opacity: 1; } to { opacity: 0; } }
@keyframes ec-burst { 0% { opacity: 1; transform: scale(0.3) rotate(0deg); } 55% { opacity: 1; } 100% { opacity: 0; transform: scale(1.35) rotate(25deg); } }
@keyframes ec-drop { from { transform: translateY(-6px) scale(0.3); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
@keyframes ec-grow { from { transform: scale(0.55); } to { transform: scale(1); } }
@keyframes ec-fly { from { transform: translate(0, 0) scale(1); opacity: 1; } to { transform: translate(var(--dx), var(--dy)) scale(0.45); opacity: 0.2; } }
@keyframes ec-wave { from { opacity: 0.95; transform: scale(0.15); } to { opacity: 0; transform: scale(1); } }
@keyframes ec-bolt { 0% { opacity: 0; } 15% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ec-comet { 0% { transform: translate(var(--fx), var(--fy)) scale(0.6); opacity: 0; } 12% { opacity: 1; } 92% { opacity: 1; transform: translate(var(--tx), var(--ty)) scale(1.2); } 100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(1.6); } }
@keyframes ec-core { from { opacity: 0.55; } to { opacity: 1; } }
@keyframes ec-rim { from { filter: brightness(1); } to { filter: brightness(1.25); } }
@keyframes ec-twinkle { from { opacity: 0.2; transform: scale(0.6); } to { opacity: 1; transform: scale(1.15); } }
@keyframes ec-halo { from { transform: scale(0.92); } to { transform: scale(1.08); } }
@keyframes ec-rays { from { opacity: 0.45; } to { opacity: 1; } }
@keyframes ec-hue { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(360deg); } }
@keyframes ec-label { 0% { opacity: 0; transform: translate(-50%, -30%) scale(0.6); } 20% { opacity: 1; transform: translate(-50%, -80%) scale(1.15); } 75% { opacity: 1; transform: translate(-50%, -110%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -140%) scale(1); } }
@keyframes ec-ring { from { opacity: 0.95; transform: scale(0.5); } to { opacity: 0; transform: scale(2); } }
@keyframes ec-spark { from { opacity: 0.6; transform: scale(0.8); } to { opacity: 1; transform: scale(1.2); } }
@keyframes ec-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
@keyframes ec-shine { from { filter: brightness(1); } to { filter: brightness(1.22); } }
@keyframes ec-chain { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); } 20% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); } 70% { opacity: 1; transform: translate(-50%, -60%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -75%) scale(1); } }
@keyframes ec-toast { 0% { opacity: 0; transform: translate(-50%, 6px); } 10% { opacity: 1; transform: translate(-50%, 0); } 80% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ec-shake-a { 0%, 100% { transform: translate(0, 0); } 20% { transform: translate(-3px, 2px); } 40% { transform: translate(3px, -2px); } 60% { transform: translate(-2px, -1px); } 80% { transform: translate(1px, 2px); } }
@keyframes ec-shake-b { 0%, 100% { transform: translate(0, 0); } 20% { transform: translate(3px, -2px); } 40% { transform: translate(-3px, 2px); } 60% { transform: translate(2px, 1px); } 80% { transform: translate(-1px, -2px); } }
@keyframes ec-breathe { from { transform: scale(1, 1); } to { transform: scale(1.025, 0.97); } }
@keyframes ec-wow { 0% { transform: scale(1); } 50% { transform: translateY(-5px) scale(1.12); } 100% { transform: scale(1); } }
@keyframes ec-hop { from { transform: translateY(0) scale(1.02, 0.96); } to { transform: translateY(-9px) scale(0.98, 1.04); } }
@keyframes ec-fly-up { 0% { transform: translateY(0); } 25% { transform: translateY(-22px) rotate(-6deg); } 50% { transform: translateY(-16px) rotate(5deg); } 75% { transform: translateY(-22px) rotate(-3deg); } 100% { transform: translateY(0); } }
@keyframes ec-shiver { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-1.5px); } 75% { transform: translateX(1.5px); } }
@keyframes ec-sway { from { transform: rotate(-6deg); } to { transform: rotate(6deg); } }
@keyframes ec-step-a { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 0; } }
@keyframes ec-step-b { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 1; } }
@keyframes ec-grew { 0% { transform: scale(0.8); } 60% { transform: scale(1.12); } 100% { transform: scale(1); } }
@keyframes ec-low { from { box-shadow: 0 0 0 0 rgba(214, 58, 31, 0); } to { box-shadow: 0 0 0 3px rgba(214, 58, 31, 0.35); } }
@keyframes ec-fire-glow { from { filter: brightness(1); } to { filter: brightness(1.2); } }
@keyframes ec-flow { from { background-position: 0 0; } to { background-position: -200% 0; } }
@keyframes ec-pour { from { clip-path: inset(0 0 0 0); } to { clip-path: inset(0 0 0 100%); } }
@keyframes ec-flicker { from { transform: scale(1) rotate(-4deg); } to { transform: scale(1.18) rotate(4deg); } }
@keyframes ec-ready { from { transform: scale(1); filter: drop-shadow(0 0 2px rgba(255, 138, 31, 0.5)); } to { transform: scale(1.04); filter: drop-shadow(0 0 9px rgba(255, 138, 31, 0.95)); } }
@keyframes ec-roar { 0% { transform: none; } 18% { transform: translateX(-3px) rotate(-6deg) scale(1.08); } 75% { transform: translateX(-3px) rotate(-6deg) scale(1.08); } 100% { transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .ec-cell { transition: none; }
  .ec-sweep { display: none; }
  .ec-in, .ec-drop, .ec-grow, .ec-glow, .ec-pop, .ec-burst, .ec-sparkfly, .ec-shard, .ec-coin, .ec-fly, .ec-zone, .ec-wave, .ec-bolt, .ec-born, .ec-chain, .ec-label { animation-duration: 0.01s; }
  .ec-core, .ec-charged, .ec-rank.r2 > g > path, .ec-rank.r2 > g > circle:first-child, .ec-twinkle, .ec-halo, .ec-orbit, .ec-rays, .ec-comet-star, .ec-chest, .ec-preview, .ec-boardwrap.shake-a, .ec-boardwrap.shake-b, .ec-nudge, .ec-drake, .ec-dance img, .ec-pile { animation: none; }
  .ec-dance img:nth-child(1) { animation: none; }
  .ec-dance img:nth-child(2) { display: none; }
  .ec-fire-fill { transition: none; }
  .ec-fire-fill.pour, .ec-fire.full .ec-fire-track, .ec-fire.full .ec-fire-fill, .ec-fire.full .ec-fire-tip, .ec-chip.low, .ec-stuck .ec-start { animation: none; }
}
`;
