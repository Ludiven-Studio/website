import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import { formatScore, fmtCentis, encodePacked } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';
import { useLevels } from '../../lib/useLevels';
import { mulberry32 } from '../prng';
import { usePointerDrag } from '../usePointerDrag';
import { useHoldButton } from '../useHoldButton';
import { tectoniqueLevels, TECTONIQUE_BANDS } from './levels';
import {
	blockers,
	countCrystals,
	decodeBoard,
	encodeBoard,
	generate,
	heroIndex,
	heroStuck,
	isWon,
	movers,
	slack,
	slide,
	HERO,
	LOCK_ALL,
	LOCK_COL,
	LOCK_ROW,
	PLATE,
	ROCK,
	VOID,
	type Axis,
	type Board,
	type PieceMove,
	type Tile,
} from './engine';

/* =====================================================
   TECTONIQUE — React island.
   The floor is a lattice of conveyor belts. Grab the hen's row or column and drag it: the
   belt follows the finger cell by cell, and it keeps the speed it had when you let go —
   so it coasts on, and you cut it with a second press. The crystals hover in place: ride
   the hen over them, and mind the dead ends.
   ===================================================== */

type Status = 'playing' | 'won' | 'stuck';

/** One floor piece. `id` stays put across slides so the DOM node is never remounted. */
interface Sprite {
	id: number;
	kind: Tile;
	idx: number;
}

/**
 * The line the player has hold of. `base` counts the cells already committed to the board,
 * `frac` is where the belt sits between two of them — the offset every piece is drawn at.
 */
interface BeltRun {
	axis: Axis;
	index: number;
	dir: -1 | 1;
	base: number;
	frac: number;
	want: number; // cells the finger asks for, total since the grab
	v: number; // cells per second, once the finger has let go
	held: boolean;
	settle: number; // stamp the wind-down started at, 0 while the belt still runs
	from: number; // frac the wind-down started from
	t: number;
	jolted: boolean;
	hist: { t: number; p: number }[]; // tail of the drag, to read the fling speed off
}

const GLYPH: Record<number, string> = { [HERO]: '🐔' };
const KIND_CLASS: Record<number, string> = {
	[PLATE]: 'plate', [HERO]: 'hero', [ROCK]: 'rock',
	[LOCK_ROW]: 'lockrow', [LOCK_COL]: 'lockcol', [LOCK_ALL]: 'lockall',
};
const FREE_LABELS = ['Facile', 'Moyen', 'Difficile'];

// Arrows + ZQSD/WASD, both keyboard layouts. They nudge the line the hero stands on.
const KEY_MOVES: Record<string, [Axis, -1 | 1] | undefined> = {
	ArrowLeft: ['row', -1], ArrowRight: ['row', 1], ArrowUp: ['col', -1], ArrowDown: ['col', 1],
	q: ['row', -1], a: ['row', -1], d: ['row', 1], z: ['col', -1], w: ['col', -1], s: ['col', 1],
};

const DRY_HINT = 25; // moves without a crystal before the way out is offered
// A launched belt is heavy: it only gives up its speed to friction, which takes about three
// seconds from a full fling. Precision comes from cutting it, not from short pushes.
const RUN_DECEL = 7.5; // cells/s² of friction
const RUN_VMAX = 22; // cells/s — cap on a fling, so one flick cannot run for ever
const TAP_V = 6.5; // cells/s — the impulse a key or a pad press gives (≈2.8 cells of glide)
const SETTLE_MS = 130; // easing the last part-cell home once the belt is cut

const lineKey = (axis: Axis, index: number): string => `${axis}:${index}`;

/** Cells per second over the tail of the drag: the speed the belt keeps when the finger lets go. */
const flingSpeed = (hist: { t: number; p: number }[]): number => {
	if (hist.length < 2) return 0;
	const last = hist[hist.length - 1];
	let ref = hist[0];
	for (const h of hist) if (last.t - h.t <= 110) { ref = h; break; }
	const dt = (last.t - ref.t) / 1000;
	return dt > 0.008 ? Math.max(0, (last.p - ref.p) / dt) : 0;
};

const ART: [string, string][] = [
	['belt.jpg', '--tk-belt'],
	['belt-v.jpg', '--tk-beltv'],
	['bin.jpg', '--tk-bin'],
	['metal.jpg', '--tk-metal'],
	['hen.png', '--tk-hen'],
];

const spritesOf = (b: Board): Sprite[] =>
	b.floor.flatMap((t, i) => (t === VOID ? [] : [{ id: i, kind: t, idx: i }]));

export default function TectoniqueGame({ gameId }: { gameId: string }) {
	const [board, setBoard] = useState<Board | null>(null);
	const [sprites, setSprites] = useState<Sprite[]>([]);
	const [offsets, setOffsets] = useState<Record<string, number>>({});
	const [moving, setMoving] = useState<Set<number>>(new Set()); // pieces free to follow the live drag
	const [shifts, setShifts] = useState<Record<string, number>>({}); // cells a line has travelled since it was dealt
	const [pops, setPops] = useState<{ id: number; idx: number }[]>([]);
	const [total, setTotal] = useState(0); // crystals the grid was dealt with
	const [moves, setMoves] = useState(0); // the score in levels mode: stars compare it to par
	const [dry, setDry] = useState(0); // moves since the last crystal, to offer a way out
	const [status, setStatus] = useState<Status>('playing');
	const [front, setFront] = useState<Axis>('col'); // last pushed axis: its hero belt rides on top
	const [running, setRunning] = useState(false); // a belt is under the hand or still coasting
	const [jam, setJam] = useState<{ cells: Set<number>; axis: Axis } | null>(null);
	const [started, setStarted] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const [freeDiff, setFreeDiff] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);

	const boardRef = useRef<Board | null>(null);
	const freshRef = useRef<Board | null>(null); // the board as generated, for ↻
	const rootRef = useRef<HTMLDivElement>(null);
	const elRef = useRef<HTMLDivElement>(null);
	const animRef = useRef(0);
	const startRef = useRef(0);
	const movesRef = useRef(0);
	const finalRef = useRef(0); // chrono at the end of the run, win or dead end
	const seedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const popIdRef = useRef(0);
	const jamRef = useRef(0);
	const beltRef = useRef<BeltRun | null>(null);
	const nextRef = useRef<number[]>([]); // pieces the next cell will carry
	const lv = useLevels(gameId, tectoniqueLevels);

	/** Let go of the line and put every piece back on its cell. */
	const settle = useCallback(() => {
		if (animRef.current) cancelAnimationFrame(animRef.current);
		animRef.current = 0;
		beltRef.current = null;
		nextRef.current = [];
		setRunning(false);
		setOffsets({});
		setMoving(new Set());
	}, []);

	/* Art is optional: each CSS var stays unset until its image really loads, so a missing
	   asset just leaves the plain gradients in place. */
	useEffect(() => {
		for (const [file, prop] of ART) {
			const url = `/assets/jeux/tectonique/${file}`;
			const img = new Image();
			img.onload = () => {
				rootRef.current?.style.setProperty(prop, `url(${url})`);
				// Marker class, so the CSS can drop a fallback (the hero emoji) once its art is in.
				rootRef.current?.classList.add(`art-${file.split('.')[0]}`);
			};
			img.src = url;
		}
	}, []);

	const load = useCallback((fresh: Board, resume?: Board) => {
		settle();
		freshRef.current = fresh;
		const b = resume ?? fresh;
		boardRef.current = b;
		setShifts({});
		setBoard(b);
		setSprites(spritesOf(b));
		setPops([]);
		setDry(0);
		setMoves(0);
		movesRef.current = 0;
		setTotal(countCrystals(fresh));
		setStatus(isWon(b) ? 'won' : 'playing');
	}, [settle]);

	const newFree = useCallback((diff: number) => {
		setDaily(false);
		setAlreadyPlayed(false);
		setFreeDiff(diff);
		setStarted(true);
		setElapsed(0);
		startRef.current = Date.now();
		const params = TECTONIQUE_BANDS[diff] ?? TECTONIQUE_BANDS[0];
		load(generate(mulberry32(Math.floor(Math.random() * 0xffffffff)), params));
	}, [load]);

	useEffect(() => {
		newFree(0);
	}, [newFree]);

	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		setDaily(false);
		setStarted(false); // ready-gate: blurred board + ▶ Commencer starts the chrono
		setElapsed(0);
		load(generate(mulberry32(cfg.seed), cfg));
	}, [lv, load]);

	const armLevels = useCallback(() => {
		setDaily(false);
		lv.enter();
	}, [lv]);

	// Levels is the default landing: resume at the next unlocked level.
	// A ?defi deep link opens the daily instead — skip auto-resume then.
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily') return;
		void lv.resume().then((next) => { if (next != null) startLevel(next); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* Daily challenge: one attempt per device, resumable. Server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		const build = (seed: number, diffIndex: number): Board =>
			generate(mulberry32(seed), TECTONIQUE_BANDS[diffIndex] ?? TECTONIQUE_BANDS[0]);

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const diffIndex = run.diffIndex ?? 0;
			seedRef.current = { seed: run.seed, diffIndex };
			const fresh = build(run.seed, diffIndex);
			const saved = (run.state as { cells?: string } | undefined)?.cells;
			const resumed = saved ? decodeBoard(fresh.n, saved) : undefined;
			setDailyLoading(false);
			setStarted(true);
			load(fresh, resumed);
			if (run.done) {
				setAlreadyPlayed(true);
				setStatus(isWon(resumed ?? fresh) ? 'won' : 'stuck');
				finalRef.current = run.finalTime ?? 0;
				setElapsed(finalRef.current);
			} else {
				setAlreadyPlayed(false);
				startRef.current = run.startedAt;
				setElapsed(Math.round((Date.now() - run.startedAt) / 10));
			}
			return;
		}

		setAlreadyPlayed(false);
		setStarted(false);
		setElapsed(0);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		seedRef.current = { seed, diffIndex };
		load(build(seed, diffIndex));
		setDailyLoading(false);
	}, [gameId, load]);

	const gated = (daily || lv.playing) && !started;
	const locked = gated || status !== 'playing';
	const lockedRef = useRef(locked);
	lockedRef.current = locked;

	/* Commencer: consumes the attempt and starts the chrono. */
	const startTimer = useCallback(() => {
		const now = Date.now();
		startRef.current = now;
		setStarted(true);
		setElapsed(0);
		trackGame(gameId, 'game_started');
		if (daily) {
			const sd = seedRef.current;
			saveDailyRun(gameId, { startedAt: now, done: false, seed: sd?.seed, diffIndex: sd?.diffIndex });
		}
	}, [gameId, daily]);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing' || !started) return;
		const id = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 10)), 50);
		return () => clearInterval(id);
	}, [status, started]);

	/** Nothing gives: shudder whatever is holding the line, rather than the whole board.
	    Cleared first, so two jams in a row really replay the animation. */
	const jolt = useCallback((axis: Axis, index: number, dir: -1 | 1) => {
		const b = boardRef.current;
		if (!b) return;
		const cells = blockers(b, axis, index, dir);
		if (!cells.length) return;
		window.clearTimeout(jamRef.current);
		setJam(null);
		requestAnimationFrame(() => setJam({ cells: new Set(cells), axis }));
		jamRef.current = window.setTimeout(() => setJam(null), 340);
	}, []);

	/* ---------- Sliding ---------- */

	/** Stop the chrono and close the run, cleared or given up. */
	const endRun = useCallback((s: Status) => {
		finalRef.current = Math.round((Date.now() - startRef.current) / 10);
		setElapsed(finalRef.current);
		setStatus(s);
	}, []);

	/** Commit a one-cell slide and carry the sprites of that line along with it. */
	const applyStep = useCallback((axis: Axis, index: number, dir: -1 | 1): PieceMove[] => {
		const b = boardRef.current;
		if (!b) return [];
		const r = slide(b, axis, index, dir);
		if (!r.shift) return [];

		boardRef.current = r.board;
		setBoard(r.board);
		// The ground travels with the line, so its scroll has to keep adding up: the live
		// offset drops back to zero on every commit, this does not.
		setShifts((prev) => ({ ...prev, [lineKey(axis, index)]: (prev[lineKey(axis, index)] ?? 0) + r.shift }));
		// Each piece has its own trip once they pile up, so moving the whole line by `shift`
		// would overlap the jammed ones and push the end of the line off the grid.
		const trips = new Map(r.moves.map((m) => [m.from, m.to]));
		setSprites((prev) => prev.map((s) => (trips.has(s.idx) ? { ...s, idx: trips.get(s.idx) as number } : s)));

		if (r.eaten.length) {
			const fresh = r.eaten.map((idx) => ({ id: ++popIdRef.current, idx }));
			setPops((p) => [...p, ...fresh]);
			const ids = new Set(fresh.map((f) => f.id));
			setTimeout(() => setPops((p) => p.filter((x) => !ids.has(x.id))), 480);
		}
		setDry((d) => (r.eaten.length ? 0 : d + 1));
		movesRef.current += 1;
		setMoves(movesRef.current);

		if (isWon(r.board)) {
			endRun('won');
			trackGame(gameId, 'game_won');
		} else if (heroStuck(r.board)) {
			// Rare, but the gaps close for good: a move can nail the hen down for ever.
			endRun('stuck');
			trackGame(gameId, 'game_over');
		}
		return r.moves;
	}, [gameId, endRun]);

	/** Look ahead: which pieces the next cell will carry. Empty means the line is against a jam. */
	const aim = useCallback((r: BeltRun): boolean => {
		const b = boardRef.current;
		const m = b ? movers(b, r.axis, r.index, r.dir) : [];
		nextRef.current = m;
		setMoving(new Set(m));
		return m.length > 0;
	}, []);

	/** Cut the belt: finish the cell it is more than halfway into, then ease the rest home. */
	const wind = useCallback((r: BeltRun, now: number) => {
		if (r.settle) return;
		r.held = false;
		r.v = 0;
		if (r.frac >= 0.5 && nextRef.current.length) {
			const moves = applyStep(r.axis, r.index, r.dir);
			r.base += 1;
			r.frac -= 1;
			// Those pieces have arrived: from here they ease IN from behind, so they are the
			// ones to draw offset — not the look-ahead set.
			setMoving(new Set(moves.map((m) => m.to)));
			nextRef.current = [];
		}
		r.settle = now;
		r.from = r.frac;
	}, [applyStep]);

	/**
	 * The belt, frame by frame. Under the hand it tracks the finger 1:1; let go and it coasts
	 * on friction alone. Cells are committed as it runs over them, and a jam pins it dead.
	 */
	const tick = useCallback((now: number) => {
		const r = beltRef.current;
		if (!r) return;
		const dt = Math.min(0.05, (now - r.t) / 1000);
		r.t = now;

		if (r.settle) {
			const k = Math.min(1, (now - r.settle) / SETTLE_MS);
			r.frac = r.from * (1 - k) ** 2;
			if (k >= 1) { settle(); return; }
		} else if (r.held) {
			// The belt cannot be pulled back past the last cell it committed: slides are final.
			r.frac = Math.max(0, r.want - r.base);
		} else {
			r.v = Math.max(0, r.v - RUN_DECEL * dt);
			r.frac += r.v * dt;
		}

		while (!r.settle && r.frac >= 1 && nextRef.current.length) {
			applyStep(r.axis, r.index, r.dir);
			r.base += 1;
			r.frac -= 1;
			r.jolted = false;
			aim(r);
		}

		if (!r.settle && !nextRef.current.length) {
			if (r.frac > 0.05 && !r.jolted) { r.jolted = true; jolt(r.axis, r.index, r.dir); }
			r.frac = 0;
			r.v = 0;
			if (!r.held) { settle(); return; } // ran into the jam: it stops dead there
		}
		if (lockedRef.current) { settle(); return; }
		if (!r.settle && !r.held && r.v === 0) wind(r, now);

		setOffsets({ [lineKey(r.axis, r.index)]: r.dir * r.frac });
		animRef.current = requestAnimationFrame(tick);
	}, [applyStep, aim, jolt, settle, wind]);

	/** Take hold of the hen's line. False when it is nailed down and nothing can start. */
	const grab = useCallback((axis: Axis, dir: -1 | 1, held: boolean): boolean => {
		const b = boardRef.current;
		if (!b || lockedRef.current) return false;
		settle();
		const h = heroIndex(b);
		const index = axis === 'row' ? Math.floor(h / b.n) : h % b.n;
		const r: BeltRun = {
			axis, index, dir, base: 0, frac: 0, want: 0, v: 0, held,
			settle: 0, from: 0, t: performance.now(), jolted: false, hist: [],
		};
		beltRef.current = r;
		setFront(axis);
		if (!aim(r)) { jolt(axis, index, dir); settle(); return false; }
		setRunning(true);
		animRef.current = requestAnimationFrame(tick);
		return true;
	}, [settle, aim, jolt, tick]);

	/** One press — a key or the pad: launch the belt, or cut it when it is already running. */
	const nudge = useCallback((axis: Axis, dir: -1 | 1) => {
		const r = beltRef.current;
		if (r) { wind(r, performance.now()); return; }
		if (grab(axis, dir, false) && beltRef.current) beltRef.current.v = TAP_V;
	}, [grab, wind]);

	const nudgeRef = useRef(nudge);
	nudgeRef.current = nudge;

	const cellPx = useCallback((): number => {
		const rect = elRef.current?.getBoundingClientRect();
		return Math.max(1, (rect?.width ?? 320) / Math.max(1, boardRef.current?.n ?? 1));
	}, []);

	/* Drag on the board: the belt follows the finger, and keeps its speed when you let go. */
	const dragRef = useRef({ x: 0, y: 0, on: false, locked: false });
	const swipe = usePointerDrag(
		(x, y) => {
			// Touching a running belt is the brake.
			const r = beltRef.current;
			if (r) wind(r, performance.now());
			dragRef.current = { x, y, on: !lockedRef.current, locked: false };
		},
		(x, y) => {
			const g = dragRef.current;
			if (!g.on) return;
			const cell = cellPx();
			const dx = x - g.x;
			const dy = y - g.y;
			if (!g.locked) {
				const need = Math.max(9, cell * 0.25);
				if (Math.abs(dx) < need && Math.abs(dy) < need) return;
				const row = Math.abs(dx) >= Math.abs(dy);
				// Re-anchor on the crossing point, so the belt does not jump by the threshold.
				g.x = x;
				g.y = y;
				g.locked = true;
				if (!grab(row ? 'row' : 'col', (row ? dx : dy) > 0 ? 1 : -1, true)) g.on = false;
				return;
			}
			const r = beltRef.current;
			if (!r || !r.held) return;
			r.want = Math.max(0, ((r.axis === 'row' ? dx : dy) * r.dir) / cell);
			r.hist.push({ t: performance.now(), p: r.want });
			if (r.hist.length > 8) r.hist.shift();
		},
		() => {
			dragRef.current.on = false;
			const r = beltRef.current;
			if (!r || !r.held) return;
			r.held = false;
			r.v = Math.min(RUN_VMAX, flingSpeed(r.hist));
			if (r.v < 0.6) wind(r, performance.now());
		},
	);

	const noop = useCallback(() => {}, []);
	const pad = {
		up: useHoldButton(() => nudgeRef.current('col', -1), noop),
		down: useHoldButton(() => nudgeRef.current('col', 1), noop),
		left: useHoldButton(() => nudgeRef.current('row', -1), noop),
		right: useHoldButton(() => nudgeRef.current('row', 1), noop),
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			const hit = KEY_MOVES[e.key] ?? KEY_MOVES[e.key.toLowerCase()];
			if (!hit) return;
			e.preventDefault();
			if (e.repeat) return; // a held key must not flip between launch and brake
			nudgeRef.current(hit[0], hit[1]);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	useEffect(() => () => { settle(); window.clearTimeout(jamRef.current); }, [settle]);

	const restart = useCallback(() => {
		const fresh = freshRef.current;
		if (!fresh || (daily && status !== 'playing')) return;
		load(fresh);
	}, [daily, status, load]);

	/* Grade the level once the run ends — a dead end counts as a loss. */
	useEffect(() => {
		if (!lv.playing || status === 'playing') return;
		lv.finish({ won: status === 'won', score: movesRef.current, raw: { n: board?.n } });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv.playing, status]);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || status !== 'playing' || !board) return;
		const sd = seedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { cells: encodeBoard(board) },
		});
	}, [daily, started, status, board, gameId]);

	/* Lock the daily attempt once the run ends, cleared or stranded. */
	useEffect(() => {
		if (!daily || status === 'playing' || alreadyPlayed || !board) return;
		const sd = seedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: true,
			finalTime: finalRef.current,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { cells: encodeBoard(board) },
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	/* ---------- Render ---------- */

	const n = board?.n ?? 0;

	const gems = useMemo(() => (board ? board.crystals.flatMap((c, i) => (c ? [i] : [])) : []), [board]);

	// The hen's two belts render on top of the crossing ones, with their end drums lit.
	const laneR = board ? Math.floor(heroIndex(board) / n) : -1;
	const laneC = board ? heroIndex(board) % n : -1;

	/** A piece jammed against the wall or a rock stays put while the rest of its line runs on. */
	const offsetOf = (idx: number): { x: number; y: number } => {
		if (!moving.has(idx)) return { x: 0, y: 0 };
		return {
			x: offsets[lineKey('row', Math.floor(idx / n))] ?? 0,
			y: offsets[lineKey('col', idx % n)] ?? 0,
		};
	};

	/** The belt surface travels with its line: one cell of texture per cell of shift. */
	const beltPos = (axis: Axis, index: number): string => {
		const k = lineKey(axis, index);
		return `calc(${(shifts[k] ?? 0) + (offsets[k] ?? 0)} * var(--tk-cell))`;
	};

	// The hen's two belts, the last pushed one on the very top: the belt you drive passes in front.
	const heroBelts = [
		laneR >= 0 && (
			<div key="hr" className="tk-belt h on" style={{ top: `calc(${(laneR * 100) / n}% + 4px)`, backgroundPositionX: beltPos('row', laneR) }} />
		),
		laneC >= 0 && (
			<div key="hc" className="tk-belt v on" style={{ left: `calc(${(laneC * 100) / n}% + 4px)`, backgroundPositionY: beltPos('col', laneC) }} />
		),
	];
	if (front === 'row') heroBelts.reverse();

	/* A push that cannot move greys its arrow out, so the dead ends read at a glance.
	   While a belt runs they all stay lit: any of them is the brake. */
	const can = useMemo(() => {
		if (!board || locked) return { up: false, down: false, left: false, right: false };
		if (running) return { up: true, down: true, left: true, right: true };
		const h = heroIndex(board);
		const row = slack(board, 'row', Math.floor(h / board.n));
		const col = slack(board, 'col', h % board.n);
		return { up: col.min < 0, down: col.max > 0, left: row.min < 0, right: row.max > 0 };
	}, [board, locked, running]);

	const left = board ? countCrystals(board) : 0;
	const { celebrating, showWin } = useCelebration(status === 'won');

	// The daily ranks on crystals first, the chrono only splits ties. Storing what was MISSED
	// keeps the packed value ascending-is-better, like every other 'time' score.
	const dailyScore = encodePacked(10_000_000, [left, Math.min(9_999_999, finalRef.current)]);

	return (
		<div className="tk-root" ref={rootRef} style={{ ['--n' as string]: n }}>
			<style>{CSS}</style>

			<ModeToggle
				daily={daily}
				onFree={() => { if (lv.active) { lv.exit(); newFree(freeDiff); } else if (daily) newFree(freeDiff); }}
				onDaily={() => { lv.exit(); startDaily(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

			{lv.active ? (
				<div className="tk-tag">
					{lv.menu ? 'Progression — réussis un niveau pour débloquer le suivant' : `Niveau ${lv.level} · ${n}×${n}`}
				</div>
			) : daily ? (
				<div className="tk-tag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${FREE_LABELS[seedRef.current?.diffIndex ?? 0]}`}
				</div>
			) : (
				<div className="tk-pills" role="tablist" aria-label="Difficulté">
					{FREE_LABELS.map((label, i) => (
						<button
							key={label}
							role="tab"
							aria-selected={freeDiff === i}
							className={`tk-pill ${freeDiff === i ? 'active' : ''}`}
							onClick={() => newFree(i)}
						>
							{label}
						</button>
					))}
				</div>
			)}

			{!(lv.active && lv.menu) && (
				<div className="tk-bar">
					<span className="tk-chip">💎 {total - left}/{total}</span>
					<span className="tk-chip">👣 {moves}</span>
					<span className="tk-chip">⏱ {fmtCentis(elapsed)}</span>
					<button
						className="tk-btn"
						onClick={daily || lv.playing ? restart : () => newFree(freeDiff)}
						disabled={daily ? status !== 'playing' : status === 'won'}
						aria-label="Recommencer"
					>↻</button>
				</div>
			)}

			{/* A true dead end is rare — losing the thread is not. After a long dry spell, say so
			    and give the way out: start over, or bank the crystals when the daily is at stake. */}
			{status === 'playing' && started && dry >= DRY_HINT && (
				<div className="tk-hint">
					Bloqué&nbsp;?
					{daily
						? <button className="tk-link" onClick={() => endRun('stuck')}>Terminer l'essai ({total - left} 💎)</button>
						: <button className="tk-link" onClick={lv.playing ? restart : () => newFree(freeDiff)}>Recommencer</button>}
				</div>
			)}

			{lv.active && lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
				<div className="tk-boardwrap">
					{celebrating && <Celebration />}
					<div
						className={`tk-board ${gated ? 'blurred' : ''}`}
						ref={elRef}
						onPointerDown={swipe.onPointerDown}
						role="application"
						aria-label="Grille de Tectonique"
					>
						{/* One physical band per lane. Draw order does the crossing: plain rows, grid
						    ticks, plain columns, then the hen's two belts ride over everything. */}
						{Array.from({ length: n }, (_, r) => r !== laneR && (
							<div key={`br${r}`} className="tk-belt h" style={{ top: `calc(${(r * 100) / n}% + 4px)`, backgroundPositionX: beltPos('row', r) }} />
						))}
						<div className="tk-grid" />
						{Array.from({ length: n }, (_, c) => c !== laneC && (
							<div key={`bc${c}`} className="tk-belt v" style={{ left: `calc(${(c * 100) / n}% + 4px)`, backgroundPositionY: beltPos('col', c) }} />
						))}
						{heroBelts}

						{sprites.map((s) => {
							const o = offsetOf(s.idx);
							return (
								<div
									key={s.id}
									className={`tk-slab ${KIND_CLASS[s.kind]}${jam?.cells.has(s.idx) ? ` jam ${jam.axis === 'row' ? 'jx' : 'jy'}` : ''}`}
									style={{ transform: `translate(${((s.idx % n) + o.x) * 100}%, ${(Math.floor(s.idx / n) + o.y) * 100}%)` }}
								>
									<div className="tk-face">{GLYPH[s.kind] && <span>{GLYPH[s.kind]}</span>}</div>
								</div>
							);
						})}

						{gems.map((i) => (
							<div
								key={`g${i}`}
								className="tk-gem"
								style={{ transform: `translate(${(i % n) * 100}%, ${Math.floor(i / n) * 100}%)` }}
							>
								<span>💎</span>
							</div>
						))}

						{pops.map((p) => (
							<div
								key={p.id}
								className="tk-gem tk-pop"
								style={{ transform: `translate(${(p.idx % n) * 100}%, ${Math.floor(p.idx / n) * 100}%)` }}
							>
								<span>✨</span>
							</div>
						))}
					</div>

					{/* End drums in the gutter: every belt wraps around one, the hen's two light up. */}
					{n > 0 && (
						<div className="tk-rollers" aria-hidden="true">
							{Array.from({ length: n }, (_, i) => {
								const at = `calc(${(i * 100) / n}% + 5px)`;
								return [
									<div key={`ra${i}`} className={`tk-roller v${i === laneR ? ' on' : ''}`} style={{ top: at, left: -13 }} />,
									<div key={`rb${i}`} className={`tk-roller v${i === laneR ? ' on' : ''}`} style={{ top: at, right: -13 }} />,
									<div key={`rc${i}`} className={`tk-roller h${i === laneC ? ' on' : ''}`} style={{ left: at, top: -13 }} />,
									<div key={`rd${i}`} className={`tk-roller h${i === laneC ? ' on' : ''}`} style={{ left: at, bottom: -13 }} />,
								];
							})}
						</div>
					)}

					{daily && dailyLoading && (
						<div className="tk-overlay"><div className="tk-card"><p className="tk-sub">Préparation…</p></div></div>
					)}

					{gated && !dailyLoading && board && (
						<div className="tk-overlay">
							<button className="tk-start" onClick={startTimer}>
								{lv.playing ? `▶ Niveau ${lv.level} — Commencer` : '▶ Commencer'}
							</button>
						</div>
					)}

					{showWin && !daily && !lv.active && (
						<div className="tk-overlay tk-win" role="dialog" aria-label="Grille résolue">
							<div className="tk-card">
								<div className="tk-mark">💎</div>
								<h2>Tapis nettoyés !</h2>
								<p className="tk-big">{fmtCentis(finalRef.current)}</p>
								<button className="tk-start small" onClick={() => newFree(freeDiff)}>Rejouer</button>
							</div>
						</div>
					)}

					{status === 'stuck' && !daily && !lv.active && (
						<div className="tk-overlay tk-win" role="dialog" aria-label="Usine bloquée">
							<div className="tk-card">
								<div className="tk-mark">⚙️</div>
								<h2>Bloqué !</h2>
								<p className="tk-sub">Plus rien ne peut bouger autour de la cocotte.</p>
								<p className="tk-big">💎 {total - left}/{total}</p>
								<div className="tk-row">
									<button className="tk-start small" onClick={restart}>Recommencer</button>
									<button className="tk-start small ghost" onClick={() => newFree(freeDiff)}>Autre usine</button>
								</div>
							</div>
						</div>
					)}

					{lv.done && (
						<LevelOutcome
							level={lv.level}
							lastLevel={tectoniqueLevels.count}
							won={lv.won}
							stars={lv.stars}
							detail={lv.won ? `${moves} coups` : 'Usine bloquée'}
							onNext={() => startLevel(lv.level + 1)}
							onReplay={() => startLevel(lv.level)}
							onMenu={lv.backToMenu}
						/>
					)}
				</div>
			)}

			{!(lv.active && lv.menu) && (
				<div className="tk-dpad" aria-label="Pousser la ligne de la cocotte">
					<button className="tk-dbtn up" ref={pad.up} disabled={!can.up} aria-label="Pousser vers le haut">▲</button>
					<button className="tk-dbtn left" ref={pad.left} disabled={!can.left} aria-label="Pousser vers la gauche">◀</button>
					<button className="tk-dbtn right" ref={pad.right} disabled={!can.right} aria-label="Pousser vers la droite">▶</button>
					<button className="tk-dbtn down" ref={pad.down} disabled={!can.down} aria-label="Pousser vers le bas">▼</button>
				</div>
			)}

			{daily && status !== 'playing' && (
				<div className="tk-done">
					{alreadyPlayed
						? <>Défi du jour déjà relevé · <strong>💎 {total - left}/{total}</strong> en {fmtCentis(finalRef.current)} — reviens demain&nbsp;!</>
						: status === 'won'
							? <>🎉 Tapis nettoyés en <strong>{fmtCentis(finalRef.current)}</strong></>
							: <>⚙️ Bloqué avec <strong>💎 {total - left}/{total}</strong> · {fmtCentis(finalRef.current)}</>}
				</div>
			)}

			{daily && !dailyLoading && (
				<Leaderboard
					game={`${gameId}-t`}
					metric="time"
					submitValue={status !== 'playing' ? dailyScore : undefined}
					format={(v) => formatScore(DAILY_LB.tectonique.fmt, v)}
				/>
			)}

			{!daily && !lv.active && (
				<LeaderboardCorner game={`${gameId}-t`} metric="time" format={(v) => formatScore(DAILY_LB.tectonique.fmt, v)} />
			)}

			<p className="tk-help">
				Seules la ligne et la colonne où se trouve la cocotte 🐔 peuvent bouger. Attrape la ligne au
				doigt&nbsp;: le tapis suit la main, et il garde son élan quand tu lâches — il continue tout seul
				jusqu'à ce que le frottement l'arrête. Un nouvel appui le coupe net. Les flèches du clavier et le
				pavé ci-dessus lui donnent une impulsion, et servent aussi de frein. Chaque case parcourue compte
				un coup&nbsp;: c'est en coupant tôt qu'on vise le par. Le sol est un quadrillage de
				tapis roulants : la cocotte et les bacs en plastique glissent dessus et se tassent contre le mur
				ou contre ce qui les arrête — le tapis, lui, continue de tourner dessous. Les caisses en fer,
				pleines de pièces lourdes, sont boulonnées au tapis et voyagent exactement avec lui : dès
				qu'une caisse bute, toute sa ligne s'arrête. Les
				plots, vissés à travers le tapis, bloquent net leur ligne ; leur rainure montre le seul sens où le
				tapis peut encore les emmener, et le plot boulonné n'en a aucune. Les 💎 flottent au-dessus et ne
				bougent jamais — c'est la cocotte qui doit leur passer dessus. Les trous se referment pour de
				bon : on peut s'enfermer, et là il faut recommencer.
			</p>
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.tk-root {
  --tk-accent: var(--accent-regular);
  --tk-cell: calc(100cqw / var(--n, 6));
  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.tk-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem; }
.tk-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.75rem; }
.tk-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
}
.tk-pill.active { background: var(--tk-accent); color: var(--accent-text-over); border-color: var(--tk-accent); }

.tk-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.9rem; }
.tk-chip {
  background: var(--gray-900); border-radius: 999px; padding: 6px 12px;
  font-weight: 700; font-size: 14px; font-variant-numeric: tabular-nums;
}
.tk-btn {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-0);
  width: 36px; height: 36px; border-radius: 50%; font-size: 16px; cursor: pointer; line-height: 1;
}
.tk-btn:disabled { opacity: 0.35; cursor: default; }

.tk-hint {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center;
  color: var(--gray-300); font-size: 13px; margin: -0.4rem 0 0.9rem;
}
.tk-link {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-0);
  font: inherit; font-size: 13px; border-radius: 999px; padding: 5px 12px; cursor: pointer;
}

/* The gutter around the board holds the belt end drums. */
.tk-boardwrap { position: relative; width: 100%; max-width: 448px; margin-inline: auto; container-type: inline-size; padding: 14px; box-sizing: border-box; }
.tk-board {
  position: relative;
  width: 100%; aspect-ratio: 1 / 1;
  border: 2.5px solid var(--gray-100);
  border-radius: 14px;
  overflow: hidden;
  background: linear-gradient(160deg, #23262b, #121417);
  touch-action: none;
  user-select: none;
  cursor: grab;
}
.tk-board:active { cursor: grabbing; }

/* One physical band per lane, edge rails shaded in. The texture is one cell of belt,
   repeated along the run, and background-position carries it exactly with its line —
   so the slats really travel. The rotated copy serves the columns. */
.tk-belt {
  position: absolute; top: 0; left: 0; pointer-events: none;
  will-change: background-position;
}
/* Each band sits 4px inside its lane: the gaps let the crossing bands show through. */
.tk-belt.h {
  width: 100%; height: calc(100% / var(--n) - 8px);
  background-image: var(--tk-belt, linear-gradient(90deg, #2c3035, #24272b));
  background-size: var(--tk-cell) 100%;
  box-shadow:
    inset 0 4px 5px -3px rgba(255, 255, 255, 0.16),
    inset 0 -5px 6px -3px rgba(0, 0, 0, 0.9);
}
.tk-belt.v {
  height: 100%; width: calc(100% / var(--n) - 8px);
  background-image: var(--tk-beltv, linear-gradient(0deg, #2c3035, #24272b));
  background-size: 100% var(--tk-cell);
  box-shadow:
    inset 4px 0 5px -3px rgba(255, 255, 255, 0.16),
    inset -5px 0 6px -3px rgba(0, 0, 0, 0.9);
}
/* The hen's two belts pass in front: brighter, and casting on the lanes they cross. */
.tk-belt.on { filter: brightness(1.22); }
.tk-belt.h.on { box-shadow: 0 0 12px 3px rgba(0, 0, 0, 0.6), inset 0 4px 5px -3px rgba(255, 255, 255, 0.2), inset 0 -5px 6px -3px rgba(0, 0, 0, 0.9); }
.tk-belt.v.on { box-shadow: 0 0 12px 3px rgba(0, 0, 0, 0.6), inset 4px 0 5px -3px rgba(255, 255, 255, 0.2), inset -5px 0 6px -3px rgba(0, 0, 0, 0.9); }

/* Faint cell ticks, under the crossing columns. */
.tk-grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(90deg, rgba(0,0,0,0.35) 0 2px, transparent 2px),
    linear-gradient(180deg, rgba(0,0,0,0.35) 0 2px, transparent 2px);
  background-size: calc(100% / var(--n)) 100%, 100% calc(100% / var(--n));
}

/* End drums: one per lane in the gutter, dim until the hen's belt runs over them. */
.tk-rollers { position: absolute; inset: 14px; pointer-events: none; }
.tk-roller { position: absolute; border-radius: 6px; opacity: 0.45; }
.tk-roller.v {
  width: 10px; height: calc(100% / var(--n) - 10px);
  background: linear-gradient(90deg, #565c63, #1e2226 45%, #565c63);
}
.tk-roller.h {
  height: 10px; width: calc(100% / var(--n) - 10px);
  background: linear-gradient(180deg, #565c63, #1e2226 45%, #565c63);
}
.tk-roller.on { opacity: 1; box-shadow: 0 0 6px rgba(0, 0, 0, 0.7), inset 0 0 0 1px #7d848c; }

.tk-slab {
  position: absolute; top: 0; left: 0;
  width: calc(100% / var(--n)); height: calc(100% / var(--n));
  padding: 1%;
  box-sizing: border-box;
  pointer-events: none;
  will-change: transform;
}
/* Both crates are square and fill their cell: a plastic bin that slides, an iron one bolted. */
.tk-face {
  position: relative;
  width: 100%; height: 100%;
  border-radius: 12%;
  display: flex; align-items: center; justify-content: center;
  background: var(--tk-bin, none) center / 100% 100% no-repeat, linear-gradient(180deg, #7fd4cf, #4aa8a2);
  box-shadow: 0 3px 5px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0, 0, 0, 0.3);
}
.tk-slab span { position: relative; font-size: calc(var(--tk-cell) * 0.56); line-height: 1; }

/* The hen stands right on the belt, nothing under her: she slides like a bin does.
   The robo-hen sprite replaces the emoji as soon as it loads. */
.tk-slab.hero .tk-face {
  background: var(--tk-hen, none) center / 94% 94% no-repeat;
  box-shadow: none;
  filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.65));
}
.tk-slab.hero span { font-size: calc(var(--tk-cell) * 0.78); filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.65)); }
.tk-root.art-hen .tk-slab.hero span { visibility: hidden; }

/* The iron crate is bolted to the belt: it travels exactly with it, and caps its line. */
.tk-slab.rock .tk-face {
  background: var(--tk-metal, none) center / 100% 100% no-repeat, linear-gradient(180deg, #565c63, #2c3136);
}

/* A post is driven through the belt into the frame below, so the line it holds cannot budge.
   Its slot is the one axis the belt can still carry it along — the bolted one gets none. */
.tk-slab.lockrow .tk-face, .tk-slab.lockcol .tk-face, .tk-slab.lockall .tk-face {
  background: none;
  box-shadow: none;
  filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.55));
}
.tk-slab.lockrow .tk-face { --tk-post: rgba(245, 158, 11, 0.9); }
.tk-slab.lockcol .tk-face { --tk-post: rgba(56, 189, 248, 0.9); }
.tk-slab.lockrow .tk-face::before, .tk-slab.lockcol .tk-face::before, .tk-slab.lockall .tk-face::before {
  content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  border-radius: 999px;
  background: linear-gradient(180deg, #16181c, #343a41);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.95), 0 0 0 2px var(--tk-post, #6b7280);
}
.tk-slab.lockrow .tk-face::before { width: 60%; height: 96%; }
.tk-slab.lockcol .tk-face::before { width: 96%; height: 60%; }
/* Bolted both ways: a flange plate instead of a slot, nothing to slide along. */
.tk-slab.lockall .tk-face::before { width: 84%; height: 84%; border-radius: 24%; }
/* A hex nut, not a round knob: a disc in a coloured slot reads as a toggle switch. */
.tk-slab.lockrow .tk-face::after, .tk-slab.lockcol .tk-face::after, .tk-slab.lockall .tk-face::after {
  content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 44%; height: 44%;
  clip-path: polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
  background: radial-gradient(circle at 34% 26%, #dfe4e9 0 8%, #99a1a9 36%, #5f666e 72%, #2f343a 100%);
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.85));
}

/* Crystals hover above the floor: raised, with their own shadow, and never offset by a slide. */
.tk-gem {
  position: absolute; top: 0; left: 0;
  width: calc(100% / var(--n)); height: calc(100% / var(--n));
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.tk-gem span {
  font-size: calc(var(--tk-cell) * 0.55); line-height: 1;
  filter: drop-shadow(0 5px 4px rgba(0, 0, 0, 0.55)) drop-shadow(0 0 6px rgba(90, 200, 255, 0.55));
  animation: tk-float 2.4s ease-in-out infinite;
}
@keyframes tk-float { 0%, 100% { transform: translateY(-14%); } 50% { transform: translateY(-26%); } }

.tk-pop span { animation: tk-pop 0.48s ease-out forwards; }
@keyframes tk-pop { from { opacity: 1; transform: scale(0.6); } to { opacity: 0; transform: scale(1.7); } }

/* Nothing gives: the pieces holding the line shudder against it, the board stays put. */
.tk-slab.jam .tk-face { animation: tk-jam 0.34s cubic-bezier(0.36, 0.07, 0.19, 0.97); }
.tk-slab.jam.jy .tk-face { animation-name: tk-jam-v; }
@keyframes tk-jam {
  0%, 100% { transform: translateX(0); }
  18% { transform: translateX(-9%); } 42% { transform: translateX(7%); }
  66% { transform: translateX(-4%); } 85% { transform: translateX(2%); }
}
@keyframes tk-jam-v {
  0%, 100% { transform: translateY(0); }
  18% { transform: translateY(-9%); } 42% { transform: translateY(7%); }
  66% { transform: translateY(-4%); } 85% { transform: translateY(2%); }
}

.tk-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.tk-overlay {
  position: absolute; inset: -8px; z-index: 5;
  display: flex; align-items: center; justify-content: center;
  animation: tk-fade 0.25s ease;
}
.tk-win { background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px; }
.tk-card {
  background: var(--gray-999); border: 2px solid var(--tk-accent); border-radius: 20px;
  padding: 22px 30px; text-align: center; box-shadow: var(--shadow-lg);
}
.tk-card h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 22px; color: var(--gray-0); }
.tk-mark { font-size: 28px; }
.tk-big { font-size: 28px; font-weight: 700; margin: 4px 0 0; color: var(--tk-accent); font-variant-numeric: tabular-nums; }
.tk-sub { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.tk-start {
  border: none; background: var(--tk-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.tk-start.small { font-size: 15px; padding: 10px 26px; box-shadow: none; margin-top: 12px; }
.tk-start.ghost { background: transparent; color: var(--gray-100); border: 1.5px solid var(--gray-700); }
.tk-row { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }

/* The pad is the whole input on touch, so it stays out in the open under the board. */
.tk-dpad {
  margin-top: 0.9rem;
  display: grid; grid-template-columns: repeat(3, 52px); grid-template-rows: repeat(2, 46px); gap: 6px;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
}
.tk-dbtn {
  border: 1.5px solid var(--gray-700); border-radius: 12px; background: var(--gray-900); color: var(--gray-0);
  font-size: 17px; cursor: pointer; touch-action: none;
  -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none;
}
.tk-dbtn:active:not(:disabled) { background: var(--tk-accent); color: var(--accent-text-over); border-color: var(--tk-accent); }
.tk-dbtn:disabled { opacity: 0.3; cursor: default; }
.tk-dbtn.up { grid-area: 1 / 2; }
.tk-dbtn.left { grid-area: 2 / 1; }
.tk-dbtn.down { grid-area: 2 / 2; }
.tk-dbtn.right { grid-area: 2 / 3; }

.tk-done { text-align: center; font-size: 16px; margin: 1rem 0 0; }
.tk-done strong { color: var(--tk-accent); }
.tk-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem; }

@keyframes tk-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .tk-gem span { animation: none; transform: translateY(-14%); }
  .tk-overlay, .tk-slab.jam .tk-face, .tk-pop span { animation: none; }
}
`;
