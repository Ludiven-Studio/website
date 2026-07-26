import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import { encodePacked, formatScore, fmtCentis } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';
import { useLevels } from '../../lib/useLevels';
import { usePointerDrag } from '../usePointerDrag';
import { tectoniqueLevels } from './levels';
import { TECTONIQUE_DAILY, type PackedGrid } from './grids';
import {
	applyMove,
	canPush,
	countCrystals,
	decodeBoard,
	encodeBoard,
	isWon,
	legalMoves,
	CRYSTAL,
	EMPTY,
	HERO,
	LOCK_COL,
	LOCK_ROW,
	type Board,
	type Move,
	type Piece,
} from './engine';

/* =====================================================
   TECTONIQUE — React island.
   Push a whole row or column to an edge; the hero eats the crystals it sweeps.
   Engine + pre-solved grids live next door (pure, tested).
   ===================================================== */

type Status = 'playing' | 'won';

/** One piece on the board. `id` stays put across moves so CSS can animate the slide. */
interface Sprite {
	id: number;
	kind: Piece;
	idx: number;
}

interface Snapshot {
	board: Board;
	sprites: Sprite[];
}

const GLYPH: Record<number, string> = { [HERO]: '🐔', [CRYSTAL]: '💎', [LOCK_ROW]: '↔', [LOCK_COL]: '↕' };
const KIND_CLASS: Record<number, string> = { [HERO]: 'hero', [CRYSTAL]: 'crystal', [LOCK_ROW]: 'lockrow', [LOCK_COL]: 'lockcol' };

const FREE_LABELS = ['Facile', 'Moyen', 'Difficile'];

// Arrows + ZQSD/WASD, both keyboard layouts.
const KEY_MOVES: Record<string, [Move['axis'], -1 | 1] | undefined> = {
	ArrowLeft: ['row', -1], ArrowRight: ['row', 1], ArrowUp: ['col', -1], ArrowDown: ['col', 1],
	q: ['row', -1], a: ['row', -1], d: ['row', 1], z: ['col', -1], w: ['col', -1], s: ['col', 1],
};

const spritesOf = (b: Board): Sprite[] => {
	const out: Sprite[] = [];
	b.cells.forEach((p, i) => {
		if (p !== EMPTY) out.push({ id: i, kind: p, idx: i });
	});
	return out;
};

export default function TectoniqueGame({ gameId }: { gameId: string }) {
	const lbId = `${gameId}-t`;
	const [grid, setGrid] = useState<PackedGrid | null>(null);
	const [board, setBoard] = useState<Board | null>(null);
	const [sprites, setSprites] = useState<Sprite[]>([]);
	const [pops, setPops] = useState<{ id: number; idx: number }[]>([]);
	const [history, setHistory] = useState<Snapshot[]>([]);
	const [movesPlayed, setMovesPlayed] = useState(0);
	const [status, setStatus] = useState<Status>('playing');
	const [shaking, setShaking] = useState(false);
	const [started, setStarted] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const [freeDiff, setFreeDiff] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const startRef = useRef(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const popIdRef = useRef(0);
	const shakeRef = useRef<number>(0);
	const boardRef = useRef<HTMLDivElement>(null);
	const lv = useLevels(gameId, tectoniqueLevels);

	const load = useCallback((g: PackedGrid, resume?: { cells: string; moves: number }) => {
		const b = decodeBoard(g.n, resume?.cells ?? g.cells);
		setGrid(g);
		setBoard(b);
		setSprites(spritesOf(b));
		setPops([]);
		setHistory([]);
		setMovesPlayed(resume?.moves ?? 0);
		setStatus(isWon(b) ? 'won' : 'playing');
	}, []);

	/* Free play reuses the daily pools — they are just boards, already proven solvable. */
	const newFree = useCallback((diff: number) => {
		setDaily(false);
		setAlreadyPlayed(false);
		setFreeDiff(diff);
		setStarted(true);
		setElapsed(0);
		startRef.current = Date.now();
		const pool = TECTONIQUE_DAILY[diff] ?? TECTONIQUE_DAILY[0];
		load(pool[Math.floor(Math.random() * pool.length)]);
	}, [load]);

	useEffect(() => {
		newFree(0);
	}, [newFree]);

	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		setDaily(false);
		setStarted(false); // ready-gate: blurred board + ▶ Commencer starts the chrono
		setElapsed(0);
		load(cfg.grid);
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
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const diffIndex = run.diffIndex ?? 0;
			const pool = TECTONIQUE_DAILY[diffIndex] ?? TECTONIQUE_DAILY[0];
			const g = pool[run.seed % pool.length];
			dailySeedRef.current = { seed: run.seed, diffIndex };
			setDailyLoading(false);
			setStarted(true);
			const st = run.state as { cells?: string; moves?: number } | undefined;
			load(g, st?.cells ? { cells: st.cells, moves: st.moves ?? 0 } : undefined);
			if (run.done) {
				setAlreadyPlayed(true);
				setStatus('won');
				setElapsed(run.finalTime ?? 0);
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
		dailySeedRef.current = { seed, diffIndex };
		const pool = TECTONIQUE_DAILY[diffIndex] ?? TECTONIQUE_DAILY[0];
		load(pool[seed % pool.length]);
		setDailyLoading(false);
	}, [gameId, load]);

	const gated = (daily || lv.playing) && !started;

	/* Commencer: consumes the attempt and starts the chrono. */
	const startTimer = useCallback(() => {
		const now = Date.now();
		startRef.current = now;
		setStarted(true);
		setElapsed(0);
		trackGame(gameId, 'game_started');
		if (daily) {
			const sd = dailySeedRef.current;
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
		shakeRef.current = window.setTimeout(() => setShaking(false), 260);
	}, []);

	const push = useCallback((m: Move) => {
		if (!board || status !== 'playing' || gated) return;
		const out = applyMove(board, m);
		if (!out) { bump(); return; }
		setHistory((h) => [...h, { board, sprites }]);
		const eaten = new Set(out.eatenAt);
		const moved = new Map(out.moved.map((mv) => [mv.from, mv.to]));
		setSprites(
			sprites
				.filter((s) => !eaten.has(s.idx))
				.map((s) => (moved.has(s.idx) ? { ...s, idx: moved.get(s.idx)! } : s)),
		);
		if (out.eatenAt.length) {
			const fresh = out.eatenAt.map((idx) => ({ id: ++popIdRef.current, idx }));
			setPops((p) => [...p, ...fresh]);
			const ids = new Set(fresh.map((f) => f.id));
			setTimeout(() => setPops((p) => p.filter((x) => !ids.has(x.id))), 500);
		}
		setBoard(out.board);
		setMovesPlayed((n) => n + 1);
		if (isWon(out.board)) {
			setStatus('won');
			trackGame(gameId, 'game_won');
		}
	}, [board, sprites, status, gated, bump, gameId]);

	const pushRef = useRef(push);
	pushRef.current = push;

	const undo = useCallback(() => {
		if (!history.length || status === 'won') return;
		const prev = history[history.length - 1];
		setHistory((h) => h.slice(0, -1));
		setBoard(prev.board);
		setSprites(prev.sprites);
		setMovesPlayed((n) => Math.max(0, n - 1));
	}, [history, status]);

	const restart = useCallback(() => {
		if (!grid || status === 'won') return;
		load(grid);
	}, [grid, status, load]);

	/* Grade the level once solved. Score = moves played, fewer is better. */
	useEffect(() => {
		if (!lv.playing || status !== 'won') return;
		lv.finish({ won: true, score: movesPlayed, raw: { n: grid?.n, opt: grid?.opt } });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv.playing, status]);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || status === 'won' || !board) return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { cells: encodeBoard(board), moves: movesPlayed },
		});
	}, [daily, started, status, board, movesPlayed, gameId]);

	/* Lock the daily attempt on a fresh win. */
	useEffect(() => {
		if (!daily || status !== 'won' || alreadyPlayed || !board) return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: true,
			finalTime: Math.round((Date.now() - startRef.current) / 10),
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { cells: encodeBoard(board), moves: movesPlayed },
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	const heroIdx = board ? board.cells.indexOf(HERO) : -1;
	const n = board?.n ?? 0;
	const heroLineRef = useRef({ row: 0, col: 0 });
	heroLineRef.current = n > 0 && heroIdx >= 0
		? { row: Math.floor(heroIdx / n), col: heroIdx % n }
		: { row: 0, col: 0 };

	/* Keyboard: the arrows push the line the hero stands on. */
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const hit = KEY_MOVES[e.key] ?? KEY_MOVES[e.key.toLowerCase()];
			if (!hit) return;
			e.preventDefault();
			pushRef.current({ axis: hit[0], index: heroLineRef.current[hit[0]], dir: hit[1] });
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	/* Swipe: the gesture's start cell picks the line, its dominant axis the push. */
	const dragRef = useRef<{ cell: [number, number]; x: number; y: number; done: boolean } | null>(null);

	const cellFromCoords = (clientX: number, clientY: number): [number, number] | null => {
		if (!boardRef.current || !n) return null;
		const rect = boardRef.current.getBoundingClientRect();
		const c = Math.floor(((clientX - rect.left) / rect.width) * n);
		const r = Math.floor(((clientY - rect.top) / rect.height) * n);
		if (r < 0 || r >= n || c < 0 || c >= n) return null;
		return [r, c];
	};

	const threshold = (): number => {
		const rect = boardRef.current?.getBoundingClientRect();
		return Math.max(14, ((rect?.width ?? 320) / Math.max(1, n)) * 0.4);
	};

	const { onPointerDown } = usePointerDrag(
		(x, y) => {
			const cell = cellFromCoords(x, y);
			dragRef.current = cell ? { cell, x, y, done: false } : null;
		},
		(x, y) => {
			const d = dragRef.current;
			if (!d || d.done) return;
			const dx = x - d.x;
			const dy = y - d.y;
			const t = threshold();
			if (Math.abs(dx) < t && Math.abs(dy) < t) return;
			d.done = true;
			const horizontal = Math.abs(dx) >= Math.abs(dy);
			pushRef.current(
				horizontal
					? { axis: 'row', index: d.cell[0], dir: dx > 0 ? 1 : -1 }
					: { axis: 'col', index: d.cell[1], dir: dy > 0 ? 1 : -1 },
			);
		},
		() => { dragRef.current = null; },
	);

	const frozen = useMemo(() => {
		const rows: boolean[] = [];
		const cols: boolean[] = [];
		if (board) {
			for (let i = 0; i < board.n; i++) {
				rows.push(!canPush(board, 'row', i));
				cols.push(!canPush(board, 'col', i));
			}
		}
		return { rows, cols };
	}, [board]);

	const left = board ? countCrystals(board) : 0;
	const stuck = !!board && status === 'playing' && !gated && legalMoves(board).length === 0;
	const { celebrating, showWin } = useCelebration(status === 'won');
	const dScore = encodePacked(10_000_000, [movesPlayed, Math.min(9_999_999, elapsed)]);
	const par = grid?.opt ?? 0;

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
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${FREE_LABELS[dailySeedRef.current?.diffIndex ?? 0]}`}
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
					<span className="tk-chip">🔁 {movesPlayed} <small>/ {par} coups</small></span>
					<span className="tk-chip">💎 {left}</span>
					<span className="tk-chip">⏱ {fmtCentis(elapsed)}</span>
					<button className="tk-btn" onClick={undo} disabled={!history.length || status === 'won'} aria-label="Annuler le dernier coup">↶</button>
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
						ref={boardRef}
						onPointerDown={onPointerDown}
						role="application"
						aria-label="Grille de Tectonique"
					>
						<div className="tk-cells" style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, gridTemplateRows: `repeat(${n}, 1fr)` }}>
							{Array.from({ length: n * n }).map((_, i) => {
								const r = Math.floor(i / n);
								const c = i % n;
								const cls = ['tk-cell', frozen.rows[r] ? 'frow' : '', frozen.cols[c] ? 'fcol' : ''].join(' ');
								return <div key={i} className={cls} />;
							})}
						</div>

						{sprites.map((s) => (
							<div
								key={s.id}
								className={`tk-piece ${KIND_CLASS[s.kind]}`}
								style={{ transform: `translate(${(s.idx % n) * 100}%, ${Math.floor(s.idx / n) * 100}%)` }}
							>
								<span>{GLYPH[s.kind]}</span>
							</div>
						))}

						{pops.map((p) => (
							<div
								key={p.id}
								className="tk-piece tk-pop"
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
								<h2>Grille avalée !</h2>
								<p className="tk-big">{movesPlayed} coups</p>
								<p className="tk-sub">Optimum : {par} · {fmtCentis(elapsed)}</p>
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
							detail={lv.won ? `${movesPlayed} coups (optimum ${par})` : undefined}
							onNext={() => startLevel(lv.level + 1)}
							onReplay={() => startLevel(lv.level)}
							onMenu={lv.backToMenu}
						/>
					)}
				</div>
			)}

			{stuck && (
				<p className="tk-stuck" aria-live="polite">Plus aucun coup possible — annule ({'↶'}) ou recommence.</p>
			)}

			{daily && status === 'won' && (
				<div className="tk-done">
					{alreadyPlayed
						? <>Défi du jour déjà relevé · <strong>{movesPlayed} coups</strong> — reviens demain&nbsp;!</>
						: <>🎉 Avalé en <strong>{movesPlayed} coups</strong> · {fmtCentis(elapsed)}</>}
				</div>
			)}

			{daily && !dailyLoading && (
				<Leaderboard
					game={lbId}
					metric="time"
					submitValue={status === 'won' ? dScore : undefined}
					format={(v) => formatScore(DAILY_LB.tectonique.fmt, v)}
				/>
			)}

			{!daily && !lv.active && <LeaderboardCorner game={lbId} metric="time" />}

			<p className="tk-help">
				Glisse une ligne ou une colonne : tout ce qui est dessus file jusqu'au bord. La cocotte 🐔 avale
				les 💎 qu'elle balaie sur son passage. Un bloc ↔ gèle sa ligne, un bloc ↕ gèle sa colonne —
				déplace-le par l'autre sens. Le moins de coups possible.
			</p>
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.tk-root {
  --tk-accent: var(--accent-regular);
  --tk-cell: calc(100cqw / var(--n, 5));
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
.tk-chip small { color: var(--gray-300); font-weight: 500; }
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
  border-radius: 12px;
  overflow: hidden;
  background: var(--gray-999);
  touch-action: none;
  user-select: none;
}
.tk-cells { position: absolute; inset: 0; display: grid; }
.tk-cell {
  border-right: 1px solid var(--gray-800);
  border-bottom: 1px solid var(--gray-800);
  box-sizing: border-box;
}
/* A frozen line is tinted with its blocker's hue, so the dead-ends are readable at a glance. */
.tk-cell.frow { background: rgba(245, 158, 11, 0.13); }
.tk-cell.fcol { background: rgba(56, 189, 248, 0.13); }
.tk-cell.frow.fcol { background: rgba(150, 130, 140, 0.18); }

.tk-piece {
  position: absolute; top: 0; left: 0;
  width: calc(100% / var(--n)); height: calc(100% / var(--n));
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.16s ease-out;
  pointer-events: none;
}
.tk-piece span { font-size: calc(var(--tk-cell) * 0.52); line-height: 1; }
.tk-piece.hero span { font-size: calc(var(--tk-cell) * 0.6); filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.35)); }
.tk-piece.crystal span { filter: drop-shadow(0 0 5px rgba(90, 200, 255, 0.6)); }

.tk-piece.lockrow span, .tk-piece.lockcol span {
  position: relative;
  width: 78%; height: 78%;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px;
  font-size: calc(var(--tk-cell) * 0.4); font-weight: 700;
  background: #2b2f3a; color: #f8fafc;
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.35);
}
/* Diagonal bar rather than a strike-through: a horizontal line would vanish into the ↔ shaft. */
.tk-piece.lockrow span::after, .tk-piece.lockcol span::after {
  content: '';
  position: absolute; left: 15%; right: 15%; top: 50%;
  height: 3px; margin-top: -1.5px; border-radius: 2px;
  background: currentColor;
  transform: rotate(-40deg);
}
.tk-piece.lockrow span { background: #7c4a06; color: #fde68a; }
.tk-piece.lockcol span { background: #0b4a63; color: #bae6fd; }

.tk-pop span { animation: tk-pop 0.5s ease-out forwards; }
@keyframes tk-pop { from { opacity: 1; transform: scale(0.6); } to { opacity: 0; transform: scale(1.6); } }

.tk-board.shake { animation: tk-shake 0.26s ease; }
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
.tk-start.small { font-size: 15px; padding: 10px 26px; box-shadow: none; }

.tk-stuck {
  margin: 1rem auto 0; text-align: center; font-size: 13px; color: #f59e0b;
  border: 1px solid #f59e0b; border-radius: 12px; padding: 8px 14px;
}
.tk-done { text-align: center; font-size: 16px; margin: 1rem 0 0; }
.tk-done strong { color: var(--tk-accent); }
.tk-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem; }

@keyframes tk-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .tk-piece { transition: none; }
  .tk-overlay, .tk-board.shake, .tk-pop span { animation: none; }
}
`;
