import { useState, useEffect, useRef, useCallback } from 'react';
import {
	N,
	STEP_MOVES,
	cloneState,
	createGame,
	endlessStep,
	findGroups,
	play,
	slide,
	upcoming,
	type Arrival,
	type Block,
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
   ÉCLATS — « Glisse et explose ». React island (SVG).
   Swipe: every block slides to the wall; three of a colour touching explode, the board slides
   again and refills from the edge, wave after wave. Open the chests. Engine: ./engine (pure,
   tested). Each move comes back as a timeline of steps that this file plays one by one.
   ===================================================== */

type Mode = 'levels' | 'daily' | 'free';
type Phase = 'ready' | 'idle' | 'busy' | 'over';

const U = 10; // SVG units per cell
const SLIDE_MS = 140;
const ARRIVE_MS = 150;
const GLOW_MS = 120;
const POP_MS = 300;
const SWIPE_PX = 16;
const LB_ID = (gameId: string): string => `${gameId}-t`;
const recordKey = (t: TierKey): string => `eclats-score-${t}`;

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

/* ---------- Daily save ---------- */

const GEN_V = 2;
const KINDS: Kind[] = ['gem', 'bomb', 'star', 'chest', 'rock'];

interface SavedRun {
	v: number;
	cells: ([number, number, number, number] | null)[];
	moves: number;
	arrivals: number;
	opened: number;
	score: number;
}

const packRun = (s: State): SavedRun => ({
	v: GEN_V,
	cells: s.cells.map((b) => (b ? [KINDS.indexOf(b.kind), b.color, b.ice ? 1 : 0, b.lock ? 1 : 0] : null)),
	moves: s.moves,
	arrivals: s.arrivals,
	opened: s.opened,
	score: s.score,
});

/** Rebuild a saved attempt. Null if it belongs to another version. */
function unpackRun(saved: unknown, cfg: EclatsCfg): State | null {
	const o = saved as SavedRun | null;
	if (!o || o.v !== GEN_V || !Array.isArray(o.cells) || o.cells.length !== N * N) return null;
	const s = createGame(cfg);
	s.cells = o.cells.map((b) => (b ? { id: s.nextId++, kind: KINDS[b[0]] ?? 'gem', color: b[1], ice: !!b[2], lock: !!b[3] } : null));
	s.moves = o.moves;
	s.arrivals = o.arrivals;
	s.opened = o.opened;
	s.score = o.score;
	return s;
}

/* ---------- Drawing ---------- */

function Piece({ b, small = false }: { b: Pick<Block, 'kind' | 'color' | 'ice' | 'lock'>; small?: boolean }) {
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
	if (b.kind === 'bomb') {
		return (
			<g className={small ? undefined : 'ec-bomb'}>
				<circle r={3.9} fill="#23242c" stroke="#0e0f14" strokeWidth={0.5} />
				<ellipse cx={-1.3} cy={-1.4} rx={1.2} ry={0.7} fill="#fff" opacity={0.35} transform="rotate(-30 -1.3 -1.4)" />
				<path d="M2.2,-3.1q1.4,-1.4 2.6,-0.6" fill="none" stroke="#c9a46a" strokeWidth={0.6} />
				<path d={starPath(1.3, 4, 0.45)} fill="#ffd24a" transform="translate(4.8 -3.7)" className="ec-spark" />
			</g>
		);
	}
	const c = GEMS[b.color % GEMS.length];
	if (b.kind === 'star') {
		return (
			<g className={small ? undefined : 'ec-starblock'}>
				<circle r={4.6} fill={c.fill} opacity={0.35} />
				<path d={starPath(4.6, 5, 2.1)} fill="#ffe27a" stroke={c.dark} strokeWidth={0.7} strokeLinejoin="round" />
				<circle r={1.3} fill={c.fill} />
			</g>
		);
	}
	const cut = CUTS[b.color % CUTS.length];
	return (
		<g>
			{cut ? (
				<path d={cut} fill={c.fill} stroke={c.dark} strokeWidth={0.6} strokeLinejoin="round" />
			) : (
				<circle r={4.4} fill={c.fill} stroke={c.dark} strokeWidth={0.6} />
			)}
			<ellipse cx={-1.4} cy={-1.7} rx={1.6} ry={0.9} fill="#fff" opacity={0.55} transform="rotate(-30 -1.4 -1.7)" />
			{b.ice && <rect className="ec-ice" x={-4.8} y={-4.8} width={9.6} height={9.6} rx={2.2} />}
		</g>
	);
}

const ArrivalChip = ({ a }: { a: Arrival }) => (
	<svg viewBox="-5.5 -5.5 11 11" width="22" height="22" aria-hidden="true">
		<Piece b={{ kind: a.kind, color: a.color, ice: false, lock: false }} small />
	</svg>
);

const cx = (i: number): number => (i % N) * U + U / 2;
const cy = (i: number): number => Math.floor(i / N) * U + U / 2;

/* ---------- The game ---------- */

interface Fx {
	id: number;
	pops: { cell: number; color: number; kind: Kind; delay: number }[];
	blasts: number[];
	specials: { cell: number; kind: 'bomb' | 'star' }[];
}

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
	const [enter, setEnter] = useState<{ ids: Set<number>; dir: Dir }>({ ids: new Set(), dir: 'up' });
	const [fx, setFx] = useState<Fx | null>(null);
	const [chain, setChain] = useState<{ id: number; wave: number } | null>(null);
	const [shake, setShake] = useState(0);
	const [nudge, setNudge] = useState<{ id: number; dir: Dir } | null>(null);
	const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [gaveUp, setGaveUp] = useState(false);
	const [record, setRecord] = useState(0);
	const [newRecord, setNewRecord] = useState(false);
	const [round, setRound] = useState(0); // one per deal: block ids restart, their keys must not
	const [sound, setSound] = useState(true);

	const sRef = useRef<State | null>(null);
	const phaseRef = useRef<Phase>('idle');
	const modeRef = useRef<Mode>('free');
	const runRef = useRef(0); // the timeline playing now; a new deal cancels it
	const fastRef = useRef(false); // a finger held on the board speeds the cascade up
	const startRef = useRef(0);
	const menuRef = useRef(false);
	const fxId = useRef(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const boardRef = useRef<HTMLDivElement>(null);
	const onEndRef = useRef<(s: State) => void>(() => {});
	modeRef.current = mode;

	const lv = useLevels(gameId, eclatsLevels);
	menuRef.current = lv.menu;
	const s = sRef.current;

	const setPhase = useCallback((p: Phase) => {
		phaseRef.current = p;
		setPhaseState(p);
	}, []);

	useEffect(() => { setSound(sfx.isEnabled()); }, []);

	/** Deal a fresh game on `cfg`. `go` starts it at once (free play); else the ready gate. */
	const deal = useCallback((cfg: EclatsCfg, go: boolean) => {
		runRef.current++;
		const st = createGame(cfg);
		sRef.current = st;
		setCells(st.cells.map((b) => (b ? { ...b } : null)));
		setGlow([]);
		setPreview([]);
		setFx(null);
		setChain(null);
		setToast(null);
		setGaveUp(false);
		setNewRecord(false);
		setElapsed(0);
		setRound((r) => r + 1);
		startRef.current = Date.now();
		setPhase(go ? 'idle' : 'ready');
		bump();
	}, [bump, setPhase]);

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
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const diffIndex = run.diffIndex ?? 0;
			dailySeedRef.current = { seed: run.seed, diffIndex };
			const t = tierOf(diffIndex);
			setTierKey(t);
			setDailyLoading(false);
			const cfg = { ...DAILY[t].cfg, seed: run.seed };
			deal(cfg, false);
			const back = unpackRun(run.state, cfg);
			if (back) {
				sRef.current = back;
				setCells(back.cells.map((b) => (b ? { ...b } : null)));
			}
			if (run.done) {
				setAlreadyPlayed(true);
				setGaveUp(!!run.abandoned);
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
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const t = tierOf(diffIndex);
		setTierKey(t);
		deal({ ...DAILY[t].cfg, seed }, false);
		setDailyLoading(false);
	}, [gameId, deal, bump, setPhase]);

	/* ▶ Commencer: starts the chrono; in the daily it spends the attempt. */
	const begin = useCallback(() => {
		const st = sRef.current;
		if (!st || phaseRef.current !== 'ready') return;
		sfx.unlock();
		startRef.current = Date.now();
		setElapsed(0);
		setPhase('idle');
		trackGame(gameId, 'game_started');
		if (modeRef.current === 'daily') {
			const sd = dailySeedRef.current;
			saveDailyRun(gameId, { startedAt: startRef.current, done: false, seed: sd?.seed, diffIndex: sd?.diffIndex, state: packRun(st) });
		}
	}, [gameId, setPhase]);

	const ticking = phase === 'idle' || phase === 'busy';
	usePlayClock(startRef, ticking && mode !== 'free', mode === 'daily' ? gameId : null);
	useEffect(() => {
		if (!ticking || mode === 'free') return;
		const id = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 10)), 100);
		return () => clearInterval(id);
	}, [ticking, mode]);

	/* ---------- Playing a move's timeline ---------- */

	const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

	const runSteps = useCallback(async (steps: Step[], dir: Dir) => {
		const my = ++runRef.current;
		setPhase('busy');
		const st = sRef.current!;
		const pointsBefore = st.score - steps.reduce((t, x) => t + (x.t === 'burst' ? x.points : 0), 0);
		let waves = 0;
		let opened = 0;
		// Later waves play quicker, and a finger held on the board quicker still.
		const pace = (wave: number): number => Math.max(0.4, 1 - 0.12 * Math.max(0, wave - 1)) * (fastRef.current ? 0.45 : 1);
		for (const step of steps) {
			if (runRef.current !== my) return;
			if (step.t === 'slide') {
				setCells(step.cells);
				await wait(SLIDE_MS * pace(waves));
			} else if (step.t === 'arrive') {
				setEnter({ ids: new Set(step.ids), dir });
				setCells(step.cells);
				await wait(ARRIVE_MS * pace(waves));
			} else {
				waves = step.wave;
				setGlow(step.groups.flat());
				await wait(GLOW_MS * pace(waves));
				if (runRef.current !== my) return;
				setGlow([]);
				const delays = new Map<number, number>();
				step.groups.forEach((g) => g.forEach((cell, k) => delays.set(cell, Math.min(6, k) * 28)));
				setFx({
					id: ++fxId.current,
					pops: step.popped.map((p) => ({ cell: p.cell, color: p.color, kind: p.kind, delay: delays.get(p.cell) ?? 60 })),
					blasts: step.blasts,
					specials: step.specials.map((x) => ({ cell: x.cell, kind: x.kind })),
				});
				setCells(step.cells);
				const gems = step.popped.filter((p) => p.kind === 'gem').length;
				sfx.pop(step.wave, gems);
				if (step.blasts.length) sfx.bomb();
				if (step.stars.length) sfx.star();
				if (step.opened.length) sfx.chest();
				opened += step.opened.length;
				if (step.wave >= 2) setChain({ id: fxId.current, wave: step.wave });
				if (step.wave >= 3 || step.blasts.length >= 2 || step.stars.length) setShake((k) => k + 1);
				bump();
				// A big moment holds a beat longer.
				await wait(POP_MS * pace(waves) + (step.wave >= 4 || step.stars.length ? 160 : 0));
			}
		}
		if (runRef.current !== my) return;
		setEnter({ ids: new Set(), dir });
		const gained = st.score - pointsBefore;
		if (waves >= 2 || opened) {
			const parts = [waves >= 2 ? `Chaîne ×${waves}` : '', modeRef.current === 'free' ? `+${gained} points` : '', opened ? `🎁 ${opened} coffre${opened > 1 ? 's' : ''}` : ''].filter(Boolean);
			setToast({ id: ++fxId.current, text: parts.join(' · ') });
		}
		if (st.status !== 'playing') {
			setPhase('over');
			onEndRef.current(st);
		} else {
			setPhase('idle');
			if (modeRef.current === 'daily') {
				const sd = dailySeedRef.current;
				saveDailyRun(gameId, { startedAt: startRef.current, done: false, seed: sd?.seed, diffIndex: sd?.diffIndex, state: packRun(st) });
			}
		}
		bump();
	}, [bump, gameId, setPhase]);

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
		if (st.moves === 1 && modeRef.current === 'free') trackGame(gameId, 'game_started');
		void runSteps(steps, dir);
	}, [gameId, runSteps]);

	/** The block ids a swipe would explode by itself: what the finger sees before letting go. */
	const previewIds = (dir: Dir): number[] => {
		const st = sRef.current;
		if (!st) return [];
		const t = cloneState(st);
		if (!slide(t, dir)) return [];
		return findGroups(t, dir).flat().map((i) => t.cells[i]!.id);
	};

	/* ---------- Input ---------- */

	const drag = useRef<{ x: number; y: number; dir: Dir | null } | null>(null);
	const dirOf = (dx: number, dy: number): Dir | null => {
		if (Math.abs(dx) < SWIPE_PX && Math.abs(dy) < SWIPE_PX) return null;
		return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
	};
	const onPress = (x: number, y: number) => {
		drag.current = { x, y, dir: null };
		if (phaseRef.current === 'busy') fastRef.current = true;
	};
	const onDrag = (x: number, y: number) => {
		const d = drag.current;
		if (!d || phaseRef.current !== 'idle') return;
		const dir = dirOf(x - d.x, y - d.y);
		if (dir === d.dir) return;
		d.dir = dir;
		setPreview(dir ? previewIds(dir) : []);
	};
	const onRelease = (x: number, y: number) => {
		const d = drag.current;
		drag.current = null;
		fastRef.current = false;
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
			const dir = DIR_KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
			if (!dir) return;
			e.preventDefault();
			if (!e.repeat) doMove(dir);
		};
		window.addEventListener('keydown', onKey, { passive: false });
		return () => window.removeEventListener('keydown', onKey);
	}, [begin, doMove]);

	/* ---------- End of a run ---------- */

	onEndRef.current = (st: State) => {
		const centis = Math.round((Date.now() - startRef.current) / 10);
		setElapsed(centis);
		const m = modeRef.current;
		if (st.status === 'won') sfx.win(); else sfx.lose();
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
				state: packRun(st),
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
		if (!st) return;
		runRef.current++;
		st.status = 'lost';
		setGaveUp(true);
		setPhase('over');
		onEndRef.current(st);
		bump();
		trackGame(gameId, 'solution_shown');
	}, [bump, gameId, setPhase]);

	const toggleSound = () => {
		const on = !sfx.isEnabled();
		sfx.setEnabled(on);
		setSound(on);
	};

	/* Test hook for scripts/check-eclats.mjs: read the run, swipe without a finger. */
	useEffect(() => {
		const w = window as unknown as { __eclats?: unknown };
		w.__eclats = {
			get state() {
				const st = sRef.current;
				return st && {
					mode: modeRef.current, phase: phaseRef.current, status: st.status, moves: st.moves, opened: st.opened,
					goal: st.cfg.goal, score: st.score, empty: st.cells.filter((b) => !b).length,
				};
			},
			swipe(dir: Dir) { doMove(dir); },
			previewCount(dir: Dir) { return previewIds(dir).length; },
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
	const novelty = world && lv.level < world.from + 3 ? world.novelty : '';
	const cfgLv = mode === 'levels' && (lv.playing || lv.done) ? eclatsLevels.config(lv.level) : null;
	const next = s && s.status === 'playing' ? upcoming(s, 4) : [];
	const glowSet = new Set(glow);
	const previewSet = new Set(preview);
	const step = s && mode === 'free' ? endlessStep(s) : 0;
	const toNext = s ? STEP_MOVES - (s.moves % STEP_MOVES) : 0;
	const nudgeDir = nudge ? { up: [0, -1.2], down: [0, 1.2], left: [-1.2, 0], right: [1.2, 0] }[nudge.dir] : [0, 0];
	const inFrom = { up: [0, U], down: [0, -U], left: [U, 0], right: [-U, 0] }[enter.dir];

	return (
		<div className="ec-root">
			<style>{CSS}</style>

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
					{lv.menu ? 'Progression — réussis un niveau pour débloquer le suivant' : <>{world?.name} · Niveau {lv.level}{cfgLv ? ` · ★★★ en ${cfgLv.three} coups` : ''}</>}
				</div>
			) : mode === 'daily' ? (
				<div className="ec-tag">{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DAILY[tierKey].label}`}</div>
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

			{s && (
				<div className="ec-hud" aria-live="polite">
					{mode === 'free' ? (
						<>
							<span className="ec-chip">⭐ <strong>{s.score}</strong>{record ? <small> · record {record}</small> : null}</span>
							<span className="ec-chip" title="Tous les quelques coups, un peu plus de la cinquième couleur">Palier {step + 1}<small> · {toNext} coup{toNext > 1 ? 's' : ''}</small></span>
						</>
					) : (
						<>
							<span className="ec-chip">🎁 <strong>{s.opened}</strong>/{s.cfg.goal}</span>
							<span className="ec-chip">👆 <strong>{s.moves}</strong> coup{s.moves > 1 ? 's' : ''}</span>
							<span className="ec-chip chrono">{fmtCentis(elapsed)}</span>
						</>
					)}
					<button className="ec-sound" onClick={toggleSound} aria-label={sound ? 'Couper le son' : 'Remettre le son'}>{sound ? '🔊' : '🔇'}</button>
				</div>
			)}

			{next.length > 0 && (
				<div className="ec-next" aria-label="Prochains blocs">
					<span>À venir</span>
					{next.map((a, i) => <ArrivalChip key={i} a={a} />)}
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
						aria-label="Plateau d'Éclats : glisse pour tout faire glisser"
					>
						<rect x={-1.5} y={-1.5} width={N * U + 3} height={N * U + 3} rx={3} className="ec-tray" />
						{Array.from({ length: N * N }, (_, i) => (
							<rect key={`s${i}`} x={(i % N) * U + 0.5} y={Math.floor(i / N) * U + 0.5} width={U - 1} height={U - 1} rx={1.8} className="ec-slot" />
						))}

						<g key={nudge?.id ?? 0} className={nudge ? 'ec-nudge' : undefined} style={{ ['--nx' as string]: `${nudgeDir[0]}px`, ['--ny' as string]: `${nudgeDir[1]}px` }}>
							{cells.map((b, i) =>
								b ? (
									<g key={`${round}-${b.id}`} className="ec-cell" style={{ transform: `translate(${cx(i)}px, ${cy(i)}px)` }}>
										<g
											className={enter.ids.has(b.id) ? 'ec-in' : undefined}
											style={enter.ids.has(b.id) ? { ['--fx' as string]: `${inFrom[0]}px`, ['--fy' as string]: `${inFrom[1]}px` } : undefined}
										>
											<g className={glowSet.has(i) ? 'ec-glow' : undefined}>
												<Piece b={b} />
											</g>
										</g>
										{previewSet.has(b.id) && <rect x={-4.9} y={-4.9} width={9.8} height={9.8} rx={2.2} className="ec-preview" />}
									</g>
								) : null,
							)}
						</g>

						{fx && fx.blasts.map((c, k) => (
							<rect key={`${fx.id}-b${k}`} x={(c % N) * U - U} y={Math.floor(c / N) * U - U} width={3 * U} height={3 * U} rx={3} className="ec-blast" />
						))}
						{fx && fx.pops.map((p, k) => (
							<g key={`${fx.id}-p${k}`} transform={`translate(${cx(p.cell)} ${cy(p.cell)})`}>
								<circle
									r={4.2}
									className={`ec-pop ${p.kind}`}
									fill={p.kind === 'gem' || p.kind === 'star' ? GEMS[p.color % GEMS.length].fill : p.kind === 'chest' ? '#ffd24a' : p.kind === 'rock' ? '#9aa0aa' : '#ff8a3d'}
									style={{ animationDelay: `${p.delay}ms` }}
								/>
								{[0, 1, 2, 3].map((k2) => (
									<path
										key={k2}
										d="M0,-1L0.8,0L0,1L-0.8,0Z"
										className="ec-shard"
										fill={p.kind === 'gem' ? GEMS[p.color % GEMS.length].fill : '#ffd24a'}
										style={{ animationDelay: `${p.delay}ms`, ['--sx' as string]: `${[5, -5, 4, -4][k2]}px`, ['--sy' as string]: `${[-4, -3, 5, 4][k2]}px` }}
									/>
								))}
								{p.kind === 'chest' && [0, 1, 2, 3, 4].map((k2) => (
									<circle key={`c${k2}`} r={1} className="ec-coin" style={{ animationDelay: `${p.delay + k2 * 40}ms`, ['--sx' as string]: `${(k2 - 2) * 2.4}px` }} />
								))}
							</g>
						))}
						{fx && fx.specials.map((x, k) => (
							<g key={`${fx.id}-s${k}`}>
								{x.kind === 'bomb' && <rect x={(x.cell % N) * U - U + 0.5} y={Math.floor(x.cell / N) * U - U + 0.5} width={3 * U - 1} height={3 * U - 1} rx={3} className="ec-zone" />}
								<circle cx={cx(x.cell)} cy={cy(x.cell)} r={5} className="ec-born" />
							</g>
						))}
					</svg>
				) : (
					<div className="ec-loading">Préparation…</div>
				)}

				{chain && <div key={chain.id} className={`ec-chain w${Math.min(5, chain.wave)}`}>Chaîne ×{chain.wave}</div>}
				{toast && <div key={toast.id} className="ec-toast" onAnimationEnd={() => setToast(null)}>{toast.text}</div>}

				{dailyLoading && <div className="ec-overlay"><div className="ec-card">Préparation…</div></div>}

				{phase === 'ready' && !dailyLoading && s && !lv.menu && (
					<div className="ec-overlay">
						<button className="ec-start" onClick={begin}>{mode === 'levels' ? `▶ Niveau ${lv.level} — Commencer` : '▶ Commencer'}</button>
					</div>
				)}

				{over && mode === 'free' && s && (
					<div className="ec-overlay">
						<div className="ec-card" role="dialog" aria-label="Partie terminée">
							<div className="ec-mark">{newRecord ? '🏅' : '💥'}</div>
							<h2>{s.score} points</h2>
							<p className="ec-sub">{newRecord ? 'Nouveau record !' : record ? `Record ${record}` : ''} · {s.moves} coups · palier {step + 1} · {TIERS[tierKey].label}</p>
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
						detail={lv.won ? `${s?.moves ?? 0} coups${cfgLv ? ` · ★★★ ≤ ${cfgLv.three}, ★★ ≤ ${cfgLv.two}` : ''}` : 'Le plateau est plein'}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
			</div>

			{mode === 'daily' && phase !== 'ready' && !over && (
				<GiveUp onGiveUp={giveUp} warn="Le défi du jour sera terminé, sans score classé." />
			)}

			<p className="ec-help">
				Glisse le doigt sur le plateau (ou les flèches du clavier) : tous les blocs glissent jusqu'au bout.
				3 blocs de la même couleur qui se touchent explosent, tout reglisse, et de nouveaux blocs entrent par
				le bord opposé : les explosions s'enchaînent. Pendant que tu glisses, les blocs qui vont exploser
				brillent. Une explosion à côté d'un coffre l'ouvre. 4 blocs d'un coup laissent une bombe, 6 une étoile
				qui fait sauter toute sa couleur. Garde le doigt appuyé pour accélérer une longue chaîne.
			</p>

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
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.ec-root {
  width: 100%; max-width: 460px; margin-inline: auto;
  color: var(--gray-0); font-family: var(--font-body);
  display: flex; flex-direction: column; align-items: center;
}
.ec-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.6rem; }
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
.ec-chip small { color: var(--gray-300); font-weight: 500; }
.ec-sound { border: none; background: var(--gray-900); border-radius: 999px; width: 32px; height: 28px; cursor: pointer; font-size: 14px; }

.ec-next { display: flex; align-items: center; gap: 3px; margin-bottom: 0.45rem; color: var(--gray-300); font-size: 11.5px; font-weight: 600; }
.ec-next span { margin-right: 4px; }
.ec-next svg { background: #1d2638; border-radius: 6px; }

.ec-boardwrap {
  position: relative; width: 100%; max-width: min(440px, 62vh); aspect-ratio: 1;
  touch-action: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; cursor: grab;
}
.game-page:fullscreen .ec-boardwrap { max-width: min(560px, calc(100dvh - 230px)); }
.game-page:-webkit-full-screen .ec-boardwrap { max-width: min(560px, calc(100dvh - 230px)); }
.ec-svg { display: block; width: 100%; height: 100%; }
.ec-svg.blurred { filter: blur(4px); opacity: 0.55; }
.ec-svg.dimmed { filter: brightness(0.55) saturate(0.8); }
.ec-loading { padding: 4rem 0; color: var(--gray-300); font-weight: 600; text-align: center; }
.ec-tray { fill: #1b2337; stroke: #2c3854; stroke-width: 0.4; }
.ec-slot { fill: #232d45; }

.ec-cell { transition: transform 0.14s ease-out; }
.ec-in { animation: ec-in 0.16s ease-out both; }
.ec-glow { animation: ec-glow 0.12s ease-out both; transform-box: fill-box; transform-origin: center; }
.ec-glow > g, .ec-glow > path, .ec-glow > circle { filter: brightness(1.6) drop-shadow(0 0 1.2px #fff); }
.ec-preview { fill: none; stroke: #fff; stroke-width: 0.6; stroke-dasharray: 1.2 0.9; animation: ec-blink 0.6s ease-in-out infinite alternate; pointer-events: none; }
.ec-nudge { animation: ec-nudge 0.22s ease-out; }

.ec-ice { fill: rgba(190, 232, 255, 0.5); stroke: #e8f7ff; stroke-width: 0.6; }
.ec-rock { fill: #8b9099; stroke: #4c5059; stroke-width: 0.55; stroke-linejoin: round; }
.ec-rock-crack { fill: none; stroke: #4c5059; stroke-width: 0.45; stroke-linecap: round; }
.ec-bomb .ec-spark { animation: ec-spark 0.5s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
.ec-starblock { animation: ec-spin 3s linear infinite; transform-box: fill-box; transform-origin: center; }
.ec-chest { animation: ec-shine 1.6s ease-in-out infinite alternate; }

.ec-pop { pointer-events: none; transform-box: fill-box; transform-origin: center; opacity: 0; animation: ec-pop 0.3s ease-out both; }
.ec-shard { pointer-events: none; opacity: 0; animation: ec-shard 0.42s ease-out both; }
.ec-coin { fill: #ffd24a; stroke: #a56d09; stroke-width: 0.3; opacity: 0; animation: ec-coin 0.7s ease-out both; }
.ec-blast { fill: rgba(255, 150, 60, 0.55); pointer-events: none; animation: ec-flash 0.32s ease-out both; }
.ec-zone { fill: none; stroke: #ffb347; stroke-width: 0.6; stroke-dasharray: 1.4 1; pointer-events: none; animation: ec-flash 0.9s ease-out both; }
.ec-born { fill: none; stroke: #fff; stroke-width: 0.7; pointer-events: none; transform-box: fill-box; transform-origin: center; animation: ec-ring 0.5s ease-out both; }

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

.ec-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 0.9rem; }
.game-page:fullscreen .ec-help { display: none; }
.game-page:-webkit-full-screen .ec-help { display: none; }

@keyframes ec-in { from { transform: translate(var(--fx), var(--fy)) scale(0.6); opacity: 0; } to { transform: translate(0, 0) scale(1); opacity: 1; } }
@keyframes ec-glow { from { transform: scale(1); } to { transform: scale(1.14); } }
@keyframes ec-blink { from { opacity: 0.45; } to { opacity: 1; } }
@keyframes ec-nudge { 0% { transform: translate(0, 0); } 40% { transform: translate(var(--nx), var(--ny)); } 100% { transform: translate(0, 0); } }
@keyframes ec-pop { 0% { opacity: 0.95; transform: scale(1); } 100% { opacity: 0; transform: scale(1.9); } }
@keyframes ec-shard { 0% { opacity: 1; transform: translate(0, 0) rotate(0); } 100% { opacity: 0; transform: translate(var(--sx), var(--sy)) rotate(160deg); } }
@keyframes ec-coin { 0% { opacity: 1; transform: translate(0, 0); } 45% { opacity: 1; transform: translate(var(--sx), -7px); } 100% { opacity: 0; transform: translate(var(--sx), -3px); } }
@keyframes ec-flash { from { opacity: 1; } to { opacity: 0; } }
@keyframes ec-ring { from { opacity: 0.95; transform: scale(0.5); } to { opacity: 0; transform: scale(2); } }
@keyframes ec-spark { from { opacity: 0.6; transform: scale(0.8); } to { opacity: 1; transform: scale(1.2); } }
@keyframes ec-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
@keyframes ec-shine { from { filter: brightness(1); } to { filter: brightness(1.22); } }
@keyframes ec-chain { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); } 20% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); } 70% { opacity: 1; transform: translate(-50%, -60%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -75%) scale(1); } }
@keyframes ec-toast { 0% { opacity: 0; transform: translate(-50%, 6px); } 10% { opacity: 1; transform: translate(-50%, 0); } 80% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ec-shake-a { 0%, 100% { transform: translate(0, 0); } 20% { transform: translate(-3px, 2px); } 40% { transform: translate(3px, -2px); } 60% { transform: translate(-2px, -1px); } 80% { transform: translate(1px, 2px); } }
@keyframes ec-shake-b { 0%, 100% { transform: translate(0, 0); } 20% { transform: translate(3px, -2px); } 40% { transform: translate(-3px, 2px); } 60% { transform: translate(2px, 1px); } 80% { transform: translate(-1px, -2px); } }
@media (prefers-reduced-motion: reduce) {
  .ec-cell { transition: none; }
  .ec-in, .ec-glow, .ec-pop, .ec-shard, .ec-coin, .ec-blast, .ec-zone, .ec-born, .ec-chain { animation-duration: 0.01s; }
  .ec-bomb .ec-spark, .ec-starblock, .ec-chest, .ec-preview, .ec-boardwrap.shake-a, .ec-boardwrap.shake-b, .ec-nudge { animation: none; }
}
`;
