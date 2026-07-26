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
import { usePointerDrag } from '../usePointerDrag';
import { tectoniqueLevels, TECTONIQUE_BANDS } from './levels';
import {
	countCrystals,
	decodeBoard,
	encodeBoard,
	frozen,
	generate,
	heroIndex,
	isWon,
	slack,
	slide,
	HERO,
	LOCK_COL,
	LOCK_ROW,
	PLATE,
	VOID,
	type Axis,
	type Board,
	type Tile,
} from './engine';

/* =====================================================
   TECTONIQUE — React island.
   Drag a row or a column of the floor: the plate slides as one block, coasts on release
   and stops against the wall. The crystals hover in place — ride the hero over them.
   ===================================================== */

type Status = 'playing' | 'won';

/** One floor piece. `id` stays put across slides so the DOM node is never remounted. */
interface Sprite {
	id: number;
	kind: Tile;
	idx: number;
}

/** The line currently under the finger (or coasting), and its fractional offset in cells. */
interface Motion {
	axis: Axis;
	index: number;
	offset: number;
}

const GLYPH: Record<number, string> = { [HERO]: '🐔', [LOCK_ROW]: '↔', [LOCK_COL]: '↕' };
const KIND_CLASS: Record<number, string> = { [PLATE]: 'plate', [HERO]: 'hero', [LOCK_ROW]: 'lockrow', [LOCK_COL]: 'lockcol' };
const FREE_LABELS = ['Facile', 'Moyen', 'Difficile'];

// Arrows + ZQSD/WASD, both keyboard layouts. They nudge the line the hero stands on.
const KEY_MOVES: Record<string, [Axis, -1 | 1] | undefined> = {
	ArrowLeft: ['row', -1], ArrowRight: ['row', 1], ArrowUp: ['col', -1], ArrowDown: ['col', 1],
	q: ['row', -1], a: ['row', -1], d: ['row', 1], z: ['col', -1], w: ['col', -1], s: ['col', 1],
};

const AXIS_LOCK_PX = 7; // travel before the gesture commits to a row or a column
const FLICK_SEC = 0.13; // how long the release speed keeps coasting

const spritesOf = (b: Board): Sprite[] =>
	b.floor.flatMap((t, i) => (t === VOID ? [] : [{ id: i, kind: t, idx: i }]));

export default function TectoniqueGame({ gameId }: { gameId: string }) {
	const [board, setBoard] = useState<Board | null>(null);
	const [sprites, setSprites] = useState<Sprite[]>([]);
	const [motion, setMotion] = useState<Motion | null>(null);
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
	const elRef = useRef<HTMLDivElement>(null);
	const liveRef = useRef<{ axis: Axis; index: number; t: number; committed: number } | null>(null);
	const rafRef = useRef(0);
	const startRef = useRef(0);
	const winRef = useRef(0);
	const seedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const popIdRef = useRef(0);
	const shakeRef = useRef(0);
	const lv = useLevels(gameId, tectoniqueLevels);

	const stopMotion = useCallback(() => {
		cancelAnimationFrame(rafRef.current);
		liveRef.current = null;
		setMotion(null);
	}, []);

	const load = useCallback((fresh: Board, resume?: Board) => {
		stopMotion();
		freshRef.current = fresh;
		const b = resume ?? fresh;
		boardRef.current = b;
		setBoard(b);
		setSprites(spritesOf(b));
		setPops([]);
		setStatus(isWon(b) ? 'won' : 'playing');
	}, [stopMotion]);

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
		const stride = axis === 'row' ? 1 : b.n;
		const onLine = (i: number): boolean => (axis === 'row' ? Math.floor(i / b.n) === index : i % b.n === index);
		setSprites((prev) => prev.map((s) => (onLine(s.idx) ? { ...s, idx: s.idx + r.shift * stride } : s)));

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

	/**
	 * Move the live line to `next` cells from where the gesture started. Whole cells are
	 * committed to the engine as they are crossed and the remainder stays visual, so the
	 * slide reads as continuous while the board itself stays on the grid.
	 */
	const setOffset = useCallback((next: number) => {
		const m = liveRef.current;
		const b = boardRef.current;
		if (!m || !b) return;
		const s = slack(b, m.axis, m.index);
		const t = Math.max(m.committed + s.min, Math.min(m.committed + s.max, next));
		const step = Math.round(t) - m.committed;
		if (step !== 0) m.committed += applyStep(m.axis, m.index, step);
		m.t = t;
		setMotion({ axis: m.axis, index: m.index, offset: t - m.committed });
	}, [applyStep]);

	/** Ease the live line to a whole-cell target, then let go of it. */
	const glideTo = useCallback((target: number) => {
		const m = liveRef.current;
		if (!m) return;
		const from = m.t;
		const dur = Math.min(420, 130 + Math.abs(target - from) * 90);
		const t0 = performance.now();
		const frame = (): void => {
			if (!liveRef.current) return;
			const k = Math.min(1, (performance.now() - t0) / dur);
			setOffset(from + (target - from) * (1 - (1 - k) ** 3));
			if (k < 1) rafRef.current = requestAnimationFrame(frame);
			else stopMotion();
		};
		cancelAnimationFrame(rafRef.current);
		rafRef.current = requestAnimationFrame(frame);
	}, [setOffset, stopMotion]);

	const cellPx = useCallback((): number => {
		const rect = elRef.current?.getBoundingClientRect();
		return Math.max(1, (rect?.width ?? 320) / Math.max(1, boardRef.current?.n ?? 1));
	}, []);

	const dragRef = useRef<{ r: number; c: number; x: number; y: number; axis: Axis | null; t: number; ms: number; v: number } | null>(null);

	const { onPointerDown } = usePointerDrag(
		(x, y) => {
			const b = boardRef.current;
			const rect = elRef.current?.getBoundingClientRect();
			if (!b || !rect || lockedRef.current) return;
			const c = Math.floor(((x - rect.left) / rect.width) * b.n);
			const r = Math.floor(((y - rect.top) / rect.height) * b.n);
			if (r < 0 || r >= b.n || c < 0 || c >= b.n) return;
			stopMotion();
			dragRef.current = { r, c, x, y, axis: null, t: 0, ms: performance.now(), v: 0 };
		},
		(x, y) => {
			const d = dragRef.current;
			if (!d) return;
			if (!d.axis) {
				const dx = x - d.x;
				const dy = y - d.y;
				if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
				d.axis = Math.abs(dx) >= Math.abs(dy) ? 'row' : 'col';
				d.x = x;
				d.y = y; // the gesture restarts here, so the line does not jump by the lock distance
				const index = d.axis === 'row' ? d.r : d.c;
				const b = boardRef.current;
				if (b && frozen(b, d.axis, index)) { dragRef.current = null; bump(); return; }
				liveRef.current = { axis: d.axis, index, t: 0, committed: 0 };
			}
			const now = performance.now();
			const t = (d.axis === 'row' ? x - d.x : y - d.y) / cellPx();
			const dt = Math.max(8, now - d.ms);
			d.v = ((t - d.t) / dt) * 1000;
			d.t = t;
			d.ms = now;
			setOffset(t);
		},
		() => {
			const d = dragRef.current;
			dragRef.current = null;
			const m = liveRef.current;
			if (!d || !m) return;
			const s = slack(boardRef.current as Board, m.axis, m.index);
			const coast = Math.round(m.t + d.v * FLICK_SEC);
			glideTo(Math.max(m.committed + s.min, Math.min(m.committed + s.max, coast)));
		},
	);

	/* Keyboard: the arrows nudge the line the hero stands on by one cell. */
	const nudgeRef = useRef<(axis: Axis, dir: -1 | 1) => void>(() => {});
	nudgeRef.current = (axis, dir) => {
		const b = boardRef.current;
		if (!b || locked || liveRef.current) return;
		const h = heroIndex(b);
		const index = axis === 'row' ? Math.floor(h / b.n) : h % b.n;
		if (frozen(b, axis, index)) { bump(); return; }
		liveRef.current = { axis, index, t: 0, committed: 0 };
		glideTo(dir);
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

	useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

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

	const freeze = useMemo(() => {
		const rows: number[] = [];
		const cols: number[] = [];
		if (board) {
			for (let i = 0; i < board.n; i++) {
				if (frozen(board, 'row', i)) rows.push(i);
				if (frozen(board, 'col', i)) cols.push(i);
			}
		}
		return { rows, cols };
	}, [board]);

	const gems = useMemo(() => (board ? board.crystals.flatMap((c, i) => (c ? [i] : [])) : []), [board]);

	const offsetOf = (idx: number): { x: number; y: number } => {
		if (!motion) return { x: 0, y: 0 };
		const on = motion.axis === 'row' ? Math.floor(idx / n) === motion.index : idx % n === motion.index;
		if (!on) return { x: 0, y: 0 };
		return motion.axis === 'row' ? { x: motion.offset, y: 0 } : { x: 0, y: motion.offset };
	};

	const left = board ? countCrystals(board) : 0;
	const { celebrating, showWin } = useCelebration(status === 'won');

	return (
		<div className="tk-root" style={{ ['--n' as string]: n }}>
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
						{freeze.rows.map((r) => (
							<div key={`fr${r}`} className="tk-freeze row" style={{ transform: `translateY(${r * 100}%)` }} />
						))}
						{freeze.cols.map((c) => (
							<div key={`fc${c}`} className="tk-freeze col" style={{ transform: `translateX(${c * 100}%)` }} />
						))}

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
				Fais glisser une ligne ou une colonne du sol : la plaque part d'un bloc et continue sur sa
				lancée, jusqu'à buter contre le bord. Les 💎 flottent au-dessus et ne bougent jamais — c'est la
				cocotte 🐔 qui doit leur passer dessus. Un bloc ↔ gèle sa ligne, un bloc ↕ gèle sa colonne.
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
  /* The void the plate floats in — that empty room IS what lets a line travel. */
  background:
    repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px var(--tk-cell)),
    repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px var(--tk-cell)),
    radial-gradient(circle at 50% 40%, #131722, #05070c);
  touch-action: none;
  user-select: none;
  cursor: grab;
}

/* A frozen line keeps its blocker's hue, so the dead ends read at a glance. */
.tk-freeze { position: absolute; top: 0; left: 0; pointer-events: none; }
.tk-freeze.row { width: 100%; height: calc(100% / var(--n)); background: rgba(245, 158, 11, 0.12); }
.tk-freeze.col { width: calc(100% / var(--n)); height: 100%; background: rgba(56, 189, 248, 0.12); }

.tk-slab {
  position: absolute; top: 0; left: 0;
  width: calc(100% / var(--n)); height: calc(100% / var(--n));
  padding: 2.5%;
  box-sizing: border-box;
  pointer-events: none;
  will-change: transform;
}
.tk-face {
  width: 100%; height: 100%;
  border-radius: 20%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, #55606f, #333c4b);
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.14);
}
.tk-slab span { font-size: calc(var(--tk-cell) * 0.5); line-height: 1; }
.tk-slab.hero .tk-face { background: linear-gradient(180deg, #7a6a4a, #4a3f2c); box-shadow: 0 3px 0 rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.2); }
.tk-slab.hero span { font-size: calc(var(--tk-cell) * 0.58); filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.3)); }
.tk-slab.lockrow .tk-face { background: linear-gradient(180deg, #a86a12, #6d4207); color: #fde68a; }
.tk-slab.lockcol .tk-face { background: linear-gradient(180deg, #0e7ea6, #08475f); color: #bae6fd; }
.tk-slab.lockrow span, .tk-slab.lockcol span { font-weight: 700; font-size: calc(var(--tk-cell) * 0.44); }

/* Crystals hover above the floor: raised, with their own shadow, and never offset by a slide. */
.tk-gem {
  position: absolute; top: 0; left: 0;
  width: calc(100% / var(--n)); height: calc(100% / var(--n));
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.tk-gem span {
  font-size: calc(var(--tk-cell) * 0.46); line-height: 1;
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
