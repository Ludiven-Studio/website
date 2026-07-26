import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import { formatScore, fmtCentis } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';
import { useLevels } from '../../lib/useLevels';
import { mulberry32 } from '../prng';
import { useMultiPointerDrag } from '../useMultiPointerDrag';
import { tectoniqueLevels, TECTONIQUE_BANDS } from './levels';
import {
	countCrystals,
	decodeBoard,
	encodeBoard,
	generate,
	heroIndex,
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
	type Tile,
} from './engine';

/* =====================================================
   TECTONIQUE — React island.
   Drag a row or a column of the floor: the crates run that way and pile up against the wall
   or against a planted rock, coasting on release. The crystals hover in place — ride the
   hero over them.
   ===================================================== */

type Status = 'playing' | 'won';

/** One floor piece. `id` stays put across slides so the DOM node is never remounted. */
interface Sprite {
	id: number;
	kind: Tile;
	idx: number;
}

/** A line being dragged or coasting. `t` is where the gesture asked it to be, in cells. */
interface Live {
	axis: Axis;
	index: number;
	t: number;
	committed: number;
	raf: number;
	held: boolean; // a finger is still on it
	movers: Set<number>; // pieces that still have room, so only they follow the drag
}

/** One finger. It picks its line only once the gesture commits to an axis. */
interface Grab {
	r: number;
	c: number;
	x: number;
	y: number;
	axis: Axis | null;
	line: Live | null;
	base: number;
	t: number;
	ms: number;
	v: number;
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

const AXIS_LOCK_PX = 7; // travel before the gesture commits to a row or a column
const FLICK_SEC = 0.32; // how long the release speed keeps coasting

const lineKey = (axis: Axis, index: number): string => `${axis}:${index}`;

const ART: [string, string][] = [
	['ground.jpg', '--tk-ground'],
	['crate.jpg', '--tk-crate'],
	['rock.png', '--tk-rock'],
	['nest.png', '--tk-nest'],
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
	const [status, setStatus] = useState<Status>('playing');
	const [shaking, setShaking] = useState(false);
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
	const livesRef = useRef(new Map<string, Live>());
	const startRef = useRef(0);
	const winRef = useRef(0);
	const seedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const popIdRef = useRef(0);
	const shakeRef = useRef(0);
	const lv = useLevels(gameId, tectoniqueLevels);

	const stopAll = useCallback(() => {
		for (const l of livesRef.current.values()) cancelAnimationFrame(l.raf);
		livesRef.current.clear();
		setOffsets({});
		setMoving(new Set());
	}, []);

	/* Art is optional: each CSS var stays unset until its image really loads, so a missing
	   asset just leaves the plain gradients in place. */
	useEffect(() => {
		for (const [file, prop] of ART) {
			const url = `/assets/jeux/tectonique/${file}`;
			const img = new Image();
			img.onload = () => rootRef.current?.style.setProperty(prop, `url(${url})`);
			img.src = url;
		}
	}, []);

	const load = useCallback((fresh: Board, resume?: Board) => {
		stopAll();
		freshRef.current = fresh;
		const b = resume ?? fresh;
		boardRef.current = b;
		setShifts({});
		setBoard(b);
		setSprites(spritesOf(b));
		setPops([]);
		setStatus(isWon(b) ? 'won' : 'playing');
	}, [stopAll]);

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
			setDailyLoading(false);
			setStarted(true);
			load(fresh, saved ? decodeBoard(fresh.n, saved) : undefined);
			if (run.done) {
				setAlreadyPlayed(true);
				setStatus('won');
				winRef.current = run.finalTime ?? 0;
				setElapsed(winRef.current);
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
	const locked = gated || status === 'won';
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

	const bump = useCallback(() => {
		setShaking(true);
		window.clearTimeout(shakeRef.current);
		shakeRef.current = window.setTimeout(() => setShaking(false), 240);
	}, []);

	/* ---------- Sliding ---------- */

	/** Commit an integer slide and carry the sprites of that line along with it. */
	const applyStep = useCallback((axis: Axis, index: number, step: number): number => {
		const b = boardRef.current;
		if (!b) return 0;
		const r = slide(b, axis, index, step);
		if (!r.shift) return 0;

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
		if (isWon(r.board)) {
			winRef.current = Math.round((Date.now() - startRef.current) / 10);
			setElapsed(winRef.current);
			setStatus('won');
			trackGame(gameId, 'game_won');
		}
		return r.shift;
	}, [gameId]);

	const pushOffsets = useCallback(() => {
		const o: Record<string, number> = {};
		const m = new Set<number>();
		for (const [k, l] of livesRef.current) {
			o[k] = l.t - l.committed;
			for (const i of l.movers) m.add(i);
		}
		setOffsets(o);
		setMoving(m);
	}, []);

	/**
	 * Move a live line to `next` cells from where its gesture started. Whole cells are
	 * committed to the engine as they are crossed and the remainder stays visual, so the
	 * slide reads as continuous while the board itself stays on the grid.
	 */
	const setOffset = useCallback((l: Live, next: number) => {
		const b = boardRef.current;
		if (!b) return;
		const s = slack(b, l.axis, l.index);
		const t = Math.max(l.committed + s.min, Math.min(l.committed + s.max, next));
		const step = Math.round(t) - l.committed;
		if (step !== 0) l.committed += applyStep(l.axis, l.index, step);
		l.t = t;
		// Pieces pile up, so they no longer share one offset: only those with room ahead follow.
		const dir = Math.sign(t - l.committed);
		const after = boardRef.current as Board;
		l.movers = dir ? new Set(movers(after, l.axis, l.index, dir as 1 | -1)) : new Set();
		pushOffsets();
	}, [applyStep, pushOffsets]);

	const drop = useCallback((l: Live) => {
		cancelAnimationFrame(l.raf);
		livesRef.current.delete(lineKey(l.axis, l.index));
		pushOffsets();
	}, [pushOffsets]);

	/** Ease a line to a whole-cell target, then let go of it. */
	const glideTo = useCallback((l: Live, target: number) => {
		const from = l.t;
		const key = lineKey(l.axis, l.index);
		const dur = Math.min(900, 180 + Math.abs(target - from) * 130);
		const t0 = performance.now();
		const frame = (): void => {
			if (livesRef.current.get(key) !== l) return;
			const k = Math.min(1, (performance.now() - t0) / dur);
			setOffset(l, from + (target - from) * (1 - (1 - k) ** 4));
			if (k < 1) l.raf = requestAnimationFrame(frame);
			else drop(l);
		};
		cancelAnimationFrame(l.raf);
		l.raf = requestAnimationFrame(frame);
	}, [setOffset, drop]);

	/**
	 * Rows and columns cross each other, so two perpendicular lines can never slide at once.
	 * Lines still coasting on the other axis are snapped home; a held one wins and the new
	 * gesture is dropped.
	 */
	const claimAxis = useCallback((axis: Axis): boolean => {
		for (const l of livesRef.current.values()) if (l.axis !== axis && l.held) return false;
		for (const l of [...livesRef.current.values()]) {
			if (l.axis === axis) continue;
			cancelAnimationFrame(l.raf);
			setOffset(l, Math.round(l.t));
			livesRef.current.delete(lineKey(l.axis, l.index));
		}
		pushOffsets();
		return true;
	}, [setOffset, pushOffsets]);

	/** Grab a line, reusing the one already there when a finger lands on a coasting line. */
	const takeLine = useCallback((axis: Axis, index: number): Live | null => {
		if (!claimAxis(axis)) return null;
		const key = lineKey(axis, index);
		const found = livesRef.current.get(key);
		if (found) {
			cancelAnimationFrame(found.raf);
			found.held = true;
			return found;
		}
		const l: Live = { axis, index, t: 0, committed: 0, raf: 0, held: true, movers: new Set() };
		livesRef.current.set(key, l);
		return l;
	}, [claimAxis]);

	const cellPx = useCallback((): number => {
		const rect = elRef.current?.getBoundingClientRect();
		return Math.max(1, (rect?.width ?? 320) / Math.max(1, boardRef.current?.n ?? 1));
	}, []);

	const { onPointerDown } = useMultiPointerDrag<Grab>({
		start: (x, y) => {
			const b = boardRef.current;
			const rect = elRef.current?.getBoundingClientRect();
			if (!b || !rect || lockedRef.current) return null;
			const c = Math.floor(((x - rect.left) / rect.width) * b.n);
			const r = Math.floor(((y - rect.top) / rect.height) * b.n);
			if (r < 0 || r >= b.n || c < 0 || c >= b.n) return null;
			return { r, c, x, y, axis: null, line: null, base: 0, t: 0, ms: performance.now(), v: 0 };
		},
		move: (d, x, y) => {
			if (!d.axis) {
				const dx = x - d.x;
				const dy = y - d.y;
				if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
				d.axis = Math.abs(dx) >= Math.abs(dy) ? 'row' : 'col';
				d.x = x;
				d.y = y; // the gesture restarts here, so the line does not jump by the lock distance
				const index = d.axis === 'row' ? d.r : d.c;
				const b = boardRef.current;
				const s = b ? slack(b, d.axis, index) : { min: 0, max: 0 };
				if (!s.min && !s.max) { bump(); return; }
				d.line = takeLine(d.axis, index);
				d.base = d.line?.t ?? 0;
				d.t = d.base;
			}
			if (!d.line) return;
			const now = performance.now();
			const t = d.base + (d.axis === 'row' ? x - d.x : y - d.y) / cellPx();
			const dt = Math.max(8, now - d.ms);
			d.v = ((t - d.t) / dt) * 1000;
			d.t = t;
			d.ms = now;
			setOffset(d.line, t);
		},
		end: (d) => {
			const l = d.line;
			if (!l) return;
			l.held = false;
			const s = slack(boardRef.current as Board, l.axis, l.index);
			const coast = Math.round(l.t + d.v * FLICK_SEC);
			glideTo(l, Math.max(l.committed + s.min, Math.min(l.committed + s.max, coast)));
		},
	});

	/* Keyboard: the arrows nudge the line the hero stands on by one cell. */
	const nudgeRef = useRef<(axis: Axis, dir: -1 | 1) => void>(() => {});
	nudgeRef.current = (axis, dir) => {
		const b = boardRef.current;
		if (!b || locked) return;
		const h = heroIndex(b);
		const index = axis === 'row' ? Math.floor(h / b.n) : h % b.n;
		const s = slack(b, axis, index);
		if (dir > 0 ? !s.max : !s.min) { bump(); return; }
		const l = takeLine(axis, index);
		if (!l) return;
		l.held = false;
		glideTo(l, Math.round(l.t) + dir);
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			const hit = KEY_MOVES[e.key] ?? KEY_MOVES[e.key.toLowerCase()];
			if (!hit) return;
			e.preventDefault();
			nudgeRef.current(hit[0], hit[1]);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	useEffect(() => stopAll, [stopAll]);

	const restart = useCallback(() => {
		const fresh = freshRef.current;
		if (!fresh || status === 'won') return;
		load(fresh);
	}, [status, load]);

	/* Grade the level once solved. Score = the chrono, in centiseconds. */
	useEffect(() => {
		if (!lv.playing || status !== 'won') return;
		lv.finish({ won: true, score: winRef.current, raw: { n: board?.n } });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv.playing, status]);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || status === 'won' || !board) return;
		const sd = seedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { cells: encodeBoard(board) },
		});
	}, [daily, started, status, board, gameId]);

	/* Lock the daily attempt on a fresh win. */
	useEffect(() => {
		if (!daily || status !== 'won' || alreadyPlayed || !board) return;
		const sd = seedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: true,
			finalTime: winRef.current,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { cells: encodeBoard(board) },
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	/* ---------- Render ---------- */

	const n = board?.n ?? 0;

	const gems = useMemo(() => (board ? board.crystals.flatMap((c, i) => (c ? [i] : [])) : []), [board]);

	const cells = useMemo(() => [...Array(n * n).keys()], [n]);

	/** A piece jammed against the wall or a rock stays put while the rest of its line runs on. */
	const offsetOf = (idx: number): { x: number; y: number } => {
		if (!moving.has(idx)) return { x: 0, y: 0 };
		return {
			x: offsets[lineKey('row', Math.floor(idx / n))] ?? 0,
			y: offsets[lineKey('col', idx % n)] ?? 0,
		};
	};

	/**
	 * The ground is no backdrop: every cell is a window on the straw, scrolled by all its row
	 * and its column have travelled. Cells of the same band stay continuous, and the floor
	 * tears between two bands — that is what makes the slide readable.
	 * The texture is laid out `n` cells wide, so a position of p% lands on cell p·(n−1)/100.
	 */
	const groundPos = (idx: number): string => {
		const rk = lineKey('row', Math.floor(idx / n));
		const ck = lineKey('col', idx % n);
		const x = (idx % n) - (shifts[rk] ?? 0) - (offsets[rk] ?? 0);
		const y = Math.floor(idx / n) - (shifts[ck] ?? 0) - (offsets[ck] ?? 0);
		return `${(x / (n - 1)) * 100}% ${(y / (n - 1)) * 100}%`;
	};

	const left = board ? countCrystals(board) : 0;
	const { celebrating, showWin } = useCelebration(status === 'won');

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
					<span className="tk-chip">💎 {left}</span>
					<span className="tk-chip">⏱ {fmtCentis(elapsed)}</span>
					<button
						className="tk-btn"
						onClick={daily || lv.playing ? restart : () => newFree(freeDiff)}
						disabled={status === 'won'}
						aria-label="Recommencer"
					>↻</button>
				</div>
			)}

			{lv.active && lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
				<div className="tk-boardwrap">
					{celebrating && <Celebration />}
					<div
						className={`tk-board ${gated ? 'blurred' : ''} ${shaking ? 'shake' : ''}`}
						ref={elRef}
						onPointerDown={onPointerDown}
						role="application"
						aria-label="Grille de Tectonique"
					>
						{cells.map((i) => (
							<div
								key={`f${i}`}
								className="tk-floor"
								style={{
									transform: `translate(${(i % n) * 100}%, ${Math.floor(i / n) * 100}%)`,
									backgroundPosition: groundPos(i),
								}}
							/>
						))}
						<div className="tk-grid" />

						{sprites.map((s) => {
							const o = offsetOf(s.idx);
							return (
								<div
									key={s.id}
									className={`tk-slab ${KIND_CLASS[s.kind]}`}
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
								<h2>Plaque nettoyée !</h2>
								<p className="tk-big">{fmtCentis(winRef.current)}</p>
								<button className="tk-start small" onClick={() => newFree(freeDiff)}>Rejouer</button>
							</div>
						</div>
					)}

					{lv.done && (
						<LevelOutcome
							level={lv.level}
							lastLevel={tectoniqueLevels.count}
							won={lv.won}
							stars={lv.stars}
							detail={lv.won ? fmtCentis(winRef.current) : undefined}
							onNext={() => startLevel(lv.level + 1)}
							onReplay={() => startLevel(lv.level)}
							onMenu={lv.backToMenu}
						/>
					)}
				</div>
			)}

			{daily && status === 'won' && (
				<div className="tk-done">
					{alreadyPlayed
						? <>Défi du jour déjà relevé · <strong>{fmtCentis(winRef.current)}</strong> — reviens demain&nbsp;!</>
						: <>🎉 Plaque nettoyée en <strong>{fmtCentis(winRef.current)}</strong></>}
				</div>
			)}

			{daily && !dailyLoading && (
				<Leaderboard
					game={gameId}
					metric="time"
					submitValue={status === 'won' ? winRef.current : undefined}
					format={(v) => formatScore(DAILY_LB.tectonique.fmt, v)}
				/>
			)}

			{!daily && !lv.active && <LeaderboardCorner game={gameId} metric="time" />}

			<p className="tk-help">
				Fais glisser une ligne ou une colonne : le sol défile. Seules les caisses glissent dessus, donc
				elles se tassent contre le mur ou contre ce qui les arrête. Les rochers et le nid, eux, sont
				posés sur le sol et voyagent exactement avec lui : dès qu'un rocher bute, toute sa ligne
				s'arrête. Les pieux, plantés à travers le sol, bloquent net leur ligne — leur rainure montre le
				seul sens où le sol peut encore les emmener, et le pieu boulonné n'en a aucune.
				À plusieurs doigts, plusieurs lignes (ou
				plusieurs colonnes) glissent en même temps. Les 💎 flottent au-dessus et ne bougent jamais —
				c'est le nid de la cocotte 🐔 qui doit leur passer dessus. Les trous se referment : si tu te
				coinces, ↻ remet la grange à zéro.
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

.tk-boardwrap { position: relative; width: 100%; max-width: 420px; margin-inline: auto; container-type: inline-size; }
.tk-board {
  position: relative;
  width: 100%; aspect-ratio: 1 / 1;
  border: 2.5px solid var(--gray-100);
  border-radius: 14px;
  overflow: hidden;
  background: linear-gradient(160deg, #3a2c1c, #221a10);
  touch-action: none;
  user-select: none;
  cursor: grab;
}

/* The barn floor, one window per cell. It is the only textured layer — the crates and the
   rocks are objects standing on it. Sized n cells wide and repeated, so a band can scroll
   for ever without ever running out of straw. */
.tk-floor {
  position: absolute; top: 0; left: 0;
  width: calc(100% / var(--n)); height: calc(100% / var(--n));
  background-image: var(--tk-ground, none);
  background-size: calc(var(--n) * 100%) calc(var(--n) * 100%);
  pointer-events: none;
}
.tk-grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(90deg, rgba(0,0,0,0.22) 0 1px, transparent 1px),
    linear-gradient(180deg, rgba(0,0,0,0.22) 0 1px, transparent 1px);
  background-size: calc(100% / var(--n)) 100%, 100% calc(100% / var(--n));
}

.tk-slab {
  position: absolute; top: 0; left: 0;
  width: calc(100% / var(--n)); height: calc(100% / var(--n));
  padding: 1%;
  box-sizing: border-box;
  pointer-events: none;
  will-change: transform;
}
/* The crate is square and fills its cell. The rock and the nest keep their alpha, so the
   floor shows around them and they read as objects put down on it. */
.tk-face {
  position: relative;
  width: 100%; height: 100%;
  border-radius: 16%;
  display: flex; align-items: center; justify-content: center;
  background: var(--tk-crate, none) center / 100% 100% no-repeat, linear-gradient(180deg, #a9743a, #6d4620);
  box-shadow: 0 3px 5px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0, 0, 0, 0.3);
}
.tk-slab span { position: relative; font-size: calc(var(--tk-cell) * 0.56); line-height: 1; }

/* The hen never rides a crate: she sits on her nest, which rides the floor like a rock does. */
.tk-slab.hero .tk-face {
  background:
    var(--tk-nest, none) center / 100% 100% no-repeat,
    radial-gradient(circle, rgba(90, 62, 20, 0.85) 0 40%, rgba(0, 0, 0, 0.35) 46%, transparent 50%);
  box-shadow: none;
  filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.55));
}
.tk-slab.hero span { font-size: calc(var(--tk-cell) * 0.62); filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.55)); }

/* A rock is only set down on the floor: it rides along with it, but never slides across it. */
.tk-slab.rock .tk-face {
  background:
    var(--tk-rock, none) center / 100% 100% no-repeat,
    radial-gradient(circle at 42% 36%, #9a9a92 0 34%, #5c5c54 62%, transparent 66%);
  box-shadow: none;
  filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.55));
}

/* A post is driven through the floor into the ground below, so the line it holds cannot budge.
   Its slot is the one axis the floor can still carry it along — the bolted one gets none. */
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

.tk-board.shake { animation: tk-shake 0.24s ease; }
@keyframes tk-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }

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

.tk-done { text-align: center; font-size: 16px; margin: 1rem 0 0; }
.tk-done strong { color: var(--tk-accent); }
.tk-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem; }

@keyframes tk-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .tk-gem span { animation: none; transform: translateY(-14%); }
  .tk-overlay, .tk-board.shake, .tk-pop span { animation: none; }
}
`;
