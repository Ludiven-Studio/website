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
	countCrystals,
	decodeBoard,
	encodeBoard,
	generate,
	heroIndex,
	heroStuck,
	isWon,
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
   Push the row or the column the hen stands on, one cell at a time: the floor runs that way,
   the crates pile up against the wall and the gaps close for good. The crystals hover in
   place — ride the hen over them, and mind the dead ends.
   ===================================================== */

type Status = 'playing' | 'won' | 'stuck';

/** One floor piece. `id` stays put across slides so the DOM node is never remounted. */
interface Sprite {
	id: number;
	kind: Tile;
	idx: number;
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
const STEP_MS = 130; // how long a line takes to ease into its new cell
const HOLD_MS = 340; // press-and-hold on the pad before it starts repeating
const REPEAT_MS = 200;

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
	const [total, setTotal] = useState(0); // crystals the grid was dealt with
	const [dry, setDry] = useState(0); // moves since the last crystal, to offer a way out
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
	const animRef = useRef(0);
	const startRef = useRef(0);
	const finalRef = useRef(0); // chrono at the end of the run, win or dead end
	const seedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const popIdRef = useRef(0);
	const shakeRef = useRef(0);
	const lv = useLevels(gameId, tectoniqueLevels);

	/** Snap a running step home, so the next one starts from the grid. */
	const settle = useCallback(() => {
		if (!animRef.current) return;
		cancelAnimationFrame(animRef.current);
		animRef.current = 0;
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
		settle();
		freshRef.current = fresh;
		const b = resume ?? fresh;
		boardRef.current = b;
		setShifts({});
		setBoard(b);
		setSprites(spritesOf(b));
		setPops([]);
		setDry(0);
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

	const bump = useCallback(() => {
		setShaking(true);
		window.clearTimeout(shakeRef.current);
		shakeRef.current = window.setTimeout(() => setShaking(false), 240);
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

	/**
	 * One tactical move: push the line the hen stands on by a single cell. The board is committed
	 * first, then the line is drawn back where it came from and eased in — pieces that jammed are
	 * absent from `moves`, so they simply stay put while the rest of the line runs.
	 */
	const step = useCallback((axis: Axis, dir: -1 | 1) => {
		const b = boardRef.current;
		if (!b || lockedRef.current) return;
		settle();
		const h = heroIndex(b);
		const index = axis === 'row' ? Math.floor(h / b.n) : h % b.n;
		const moves = applyStep(axis, index, dir);
		if (!moves.length) { bump(); return; }

		const key = lineKey(axis, index);
		setMoving(new Set(moves.map((m) => m.to)));
		const t0 = performance.now();
		const frame = (): void => {
			const k = Math.min(1, (performance.now() - t0) / STEP_MS);
			setOffsets({ [key]: -dir * (1 - k) ** 3 });
			if (k < 1) animRef.current = requestAnimationFrame(frame);
			else { animRef.current = 0; setOffsets({}); setMoving(new Set()); }
		};
		animRef.current = requestAnimationFrame(frame);
	}, [applyStep, bump, settle]);

	const stepRef = useRef(step);
	stepRef.current = step;

	const cellPx = useCallback((): number => {
		const rect = elRef.current?.getBoundingClientRect();
		return Math.max(1, (rect?.width ?? 320) / Math.max(1, boardRef.current?.n ?? 1));
	}, []);

	/* Swipe on the board: one step per threshold crossed, so a long drag chains them. */
	const swipeRef = useRef({ x: 0, y: 0, on: false });
	const swipe = usePointerDrag(
		(x, y) => { swipeRef.current = { x, y, on: !lockedRef.current }; },
		(x, y) => {
			const g = swipeRef.current;
			if (!g.on) return;
			const dx = x - g.x;
			const dy = y - g.y;
			const need = Math.max(18, cellPx() * 0.6);
			if (Math.abs(dx) < need && Math.abs(dy) < need) return;
			const row = Math.abs(dx) >= Math.abs(dy);
			stepRef.current(row ? 'row' : 'col', (row ? dx : dy) > 0 ? 1 : -1);
			g.x = x;
			g.y = y;
		},
		() => { swipeRef.current.on = false; },
	);

	/* Arrow pad: press once, then hold to repeat. */
	const repeatRef = useRef<{ delay: number; tick: number }>({ delay: 0, tick: 0 });
	const releasePad = useCallback(() => {
		window.clearTimeout(repeatRef.current.delay);
		window.clearInterval(repeatRef.current.tick);
		repeatRef.current = { delay: 0, tick: 0 };
	}, []);
	const holdPad = useCallback((axis: Axis, dir: -1 | 1) => {
		releasePad();
		stepRef.current(axis, dir);
		repeatRef.current.delay = window.setTimeout(() => {
			repeatRef.current.tick = window.setInterval(() => stepRef.current(axis, dir), REPEAT_MS);
		}, HOLD_MS);
	}, [releasePad]);

	const pad = {
		up: useHoldButton(() => holdPad('col', -1), releasePad),
		down: useHoldButton(() => holdPad('col', 1), releasePad),
		left: useHoldButton(() => holdPad('row', -1), releasePad),
		right: useHoldButton(() => holdPad('row', 1), releasePad),
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			const hit = KEY_MOVES[e.key] ?? KEY_MOVES[e.key.toLowerCase()];
			if (!hit) return;
			e.preventDefault();
			stepRef.current(hit[0], hit[1]);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	useEffect(() => () => { settle(); releasePad(); }, [settle, releasePad]);

	const restart = useCallback(() => {
		const fresh = freshRef.current;
		if (!fresh || (daily && status !== 'playing')) return;
		load(fresh);
	}, [daily, status, load]);

	/* Grade the level once the run ends — a dead end counts as a loss. */
	useEffect(() => {
		if (!lv.playing || status === 'playing') return;
		lv.finish({ won: status === 'won', score: finalRef.current, raw: { n: board?.n } });
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
						className={`tk-board ${gated ? 'blurred' : ''} ${shaking ? 'shake' : ''}`}
						ref={elRef}
						onPointerDown={swipe.onPointerDown}
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
								<p className="tk-big">{fmtCentis(finalRef.current)}</p>
								<button className="tk-start small" onClick={() => newFree(freeDiff)}>Rejouer</button>
							</div>
						</div>
					)}

					{status === 'stuck' && !daily && !lv.active && (
						<div className="tk-overlay tk-win" role="dialog" aria-label="Grange bloquée">
							<div className="tk-card">
								<div className="tk-mark">🪨</div>
								<h2>Bloqué !</h2>
								<p className="tk-sub">Plus rien ne peut bouger autour de la cocotte.</p>
								<p className="tk-big">💎 {total - left}/{total}</p>
								<div className="tk-row">
									<button className="tk-start small" onClick={restart}>Recommencer</button>
									<button className="tk-start small ghost" onClick={() => newFree(freeDiff)}>Autre grange</button>
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
							detail={lv.won ? fmtCentis(finalRef.current) : 'Grange bloquée'}
							onNext={() => startLevel(lv.level + 1)}
							onReplay={() => startLevel(lv.level)}
							onMenu={lv.backToMenu}
						/>
					)}
				</div>
			)}

			{!(lv.active && lv.menu) && (
				<div className="tk-dpad" aria-label="Pousser la ligne de la cocotte">
					<button className="tk-dbtn up" ref={pad.up} aria-label="Pousser vers le haut">▲</button>
					<button className="tk-dbtn left" ref={pad.left} aria-label="Pousser vers la gauche">◀</button>
					<button className="tk-dbtn right" ref={pad.right} aria-label="Pousser vers la droite">▶</button>
					<button className="tk-dbtn down" ref={pad.down} aria-label="Pousser vers le bas">▼</button>
				</div>
			)}

			{daily && status !== 'playing' && (
				<div className="tk-done">
					{alreadyPlayed
						? <>Défi du jour déjà relevé · <strong>💎 {total - left}/{total}</strong> en {fmtCentis(finalRef.current)} — reviens demain&nbsp;!</>
						: status === 'won'
							? <>🎉 Plaque nettoyée en <strong>{fmtCentis(finalRef.current)}</strong></>
							: <>🪨 Bloqué avec <strong>💎 {total - left}/{total}</strong> · {fmtCentis(finalRef.current)}</>}
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
				Seules la ligne et la colonne où se trouve la cocotte 🐔 peuvent bouger, d'une case à la fois :
				flèches du clavier, pavé ci-dessus, ou petit glissé sur la grille. Le sol défile, mais seules les
				caisses glissent dessus : elles se tassent contre le mur ou contre ce qui les arrête. Les rochers
				et le nid sont posés sur le sol et voyagent exactement avec lui — dès qu'un rocher bute, toute sa
				ligne s'arrête. Les pieux, plantés à travers le sol, bloquent net leur ligne ; leur rainure montre
				le seul sens où le sol peut encore les emmener, et le pieu boulonné n'en a aucune. Les 💎 flottent
				au-dessus et ne bougent jamais — c'est le nid qui doit leur passer dessus. Les trous se referment
				pour de bon : on peut s'enfermer, et là il faut recommencer.
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
.tk-dbtn:active { background: var(--tk-accent); color: var(--accent-text-over); border-color: var(--tk-accent); }
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
  .tk-overlay, .tk-board.shake, .tk-pop span { animation: none; }
}
`;
