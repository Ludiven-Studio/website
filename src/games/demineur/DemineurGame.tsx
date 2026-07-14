import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
	SIZES,
	DIFFS,
	generateDemineur,
	findHint,
	reveal,
	revealSolution,
	isWin,
	isLose,
	emptyState,
	HIDDEN,
	REVEALED,
	FLAGGED,
	type DemineurPuzzle,
	type PlayerGrid,
} from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun, type DailyRun } from '../../lib/leaderboard';
import { formatScore, fmtCentis } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   DÉMINEUR LOGIQUE — React island.
   No-guess minesweeper: a guaranteed-safe 0-opening is
   auto-revealed; every board is solvable by deduction.
   Reveal cells, flag mines (right-click / flag mode);
   a mine = game over. Engine is pure/tested.
   ===================================================== */

type Status = 'playing' | 'won' | 'lost';
type DiffKey = keyof typeof SIZES; // 'facile' | 'moyen' | 'difficile' (size + technique in one axis)

const DIFF_ORDER: DiffKey[] = ['facile', 'moyen', 'difficile'];

// Daily leaderboard (metric 'time'): winners submit their time; losers submit LOSS_OFFSET + bombs
// remaining, so every loss ranks after every win, ordered by fewest bombs left.
const LOSS_OFFSET = 100000;

const fmtTime = fmtCentis;

const flagCount = (g: PlayerGrid): number =>
	g.reduce((a, row) => a + row.filter((v) => v === FLAGGED).length, 0);

const openedStart = (p: DemineurPuzzle): PlayerGrid => reveal(emptyState(p.size), p, p.start);

export default function DemineurGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<DiffKey>('facile');
	const [puzzle, setPuzzle] = useState<DemineurPuzzle>(() => generateDemineur(SIZES.facile, DIFFS.facile));
	// Open the safe start zone immediately (free mode) so the player never starts blind.
	const [grid, setGrid] = useState<PlayerGrid>(() => openedStart(puzzle));
	const [status, setStatus] = useState<Status>('playing');
	const [started, setStarted] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [flagMode, setFlagMode] = useState(false);
	const [hinted, setHinted] = useState<Set<string>>(() => new Set());
	const [elapsed, setElapsed] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [hintNote, setHintNote] = useState('');
	const startRef = useRef<number>(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);

	const { size, mineCount } = puzzle;
	const over = status === 'won' || status === 'lost' || revealed;

	const newGame = useCallback((dk: DiffKey) => {
		const p = generateDemineur(SIZES[dk], DIFFS[dk]);
		setDaily(false);
		setAlreadyPlayed(false);
		setHintNote('');
		setDiffKey(dk);
		setPuzzle(p);
		setGrid(openedStart(p)); // free mode: show the safe opening immediately
		setStatus('playing');
		setStarted(false);
		setRevealed(false);
		setFlagMode(false);
		setHinted(new Set());
		setElapsed(0);
	}, []);

	/* Daily challenge: one attempt per device, resumable. Server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setRevealed(false);
		setHinted(new Set());
		setFlagMode(false);
		setHintNote('');

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const di = run.diffIndex ?? 0;
			const dk = DIFF_ORDER[di] ?? 'facile';
			dailySeedRef.current = { seed: run.seed, diffIndex: di };
			const p = generateDemineur(SIZES[dk], DIFFS[dk], mulberry32(run.seed));
			setDailyLoading(false);
			setDiffKey(dk);
			setPuzzle(p);
			const state = (run.state as PlayerGrid | undefined) ?? emptyState(p.size);
			setGrid(state);
			setStarted(true);
			if (run.done) {
				setAlreadyPlayed(true);
				setStatus(isLose(state, p) ? 'lost' : 'won');
				setElapsed(run.finalTime ?? Math.round((Date.now() - run.startedAt) / 10));
			} else {
				setAlreadyPlayed(false);
				setStatus('playing');
				startRef.current = run.startedAt;
				setElapsed(Math.round((Date.now() - run.startedAt) / 10));
			}
			return;
		}

		// Fresh: fetch today's seed, arm the grid (Commencer not pressed yet).
		setAlreadyPlayed(false);
		setStatus('playing');
		setStarted(false);
		setElapsed(0);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const dk = DIFF_ORDER[diffIndex] ?? 'facile';
		const p = generateDemineur(SIZES[dk], DIFFS[dk], mulberry32(seed));
		setDiffKey(dk);
		setPuzzle(p);
		setGrid(emptyState(p.size)); // blurred until Commencer
		setDailyLoading(false);
	}, [gameId]);

	const { celebrating, showWin } = useCelebration(status === 'won');

	/* Commencer: open the safe start, consume the attempt, start the chrono. */
	const startTimer = useCallback(() => {
		const now = Date.now();
		startRef.current = now;
		const opened = openedStart(puzzle);
		setGrid(opened);
		setStarted(true);
		setElapsed(0);
		trackGame(gameId, 'game_started');
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: now,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: opened,
		});
	}, [gameId, puzzle]);

	/* Clear my entries (chrono keeps running) — back to the opened start. */
	const resetDailyEntries = useCallback(() => {
		const opened = openedStart(puzzle);
		setGrid(opened);
		setHinted(new Set());
		setHintNote('');
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: opened,
		});
	}, [gameId, puzzle]);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing' || !started || revealed) return;
		const id = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 10)), 50);
		return () => clearInterval(id);
	}, [status, started, revealed]);

	const begin = useCallback(() => {
		if (daily) return; // daily chrono starts via Commencer
		if (!started) {
			startRef.current = Date.now();
			setStarted(true);
			trackGame(gameId, 'game_started');
		}
	}, [daily, started, gameId]);

	/* Win / lose detection. */
	useEffect(() => {
		if (over) return;
		if (daily && !started) return;
		if (isLose(grid, puzzle)) {
			setStatus('lost');
			trackGame(gameId, 'game_over');
			return;
		}
		if (isWin(grid, puzzle)) {
			setStatus('won');
			trackGame(gameId, 'game_won');
		}
	}, [grid, over, puzzle, gameId, daily, started]);

	/* Persist the in-progress daily attempt. */
	useEffect(() => {
		if (!daily || !started || status !== 'playing') return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: grid,
		});
	}, [daily, started, status, grid, gameId]);

	/* Lock the daily attempt when it ends (win submits a time; loss consumes it without one). */
	useEffect(() => {
		if (!daily || alreadyPlayed) return;
		if (status !== 'won' && status !== 'lost') return;
		const sd = dailySeedRef.current;
		const finalTime = status === 'won' ? Math.round((Date.now() - startRef.current) / 10) : undefined;
		const snapshot: DailyRun = {
			startedAt: startRef.current,
			done: true,
			finalTime,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: grid,
		};
		saveDailyRun(gameId, snapshot);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	const removeHint = useCallback((r: number, c: number) => {
		setHinted((prev) => {
			if (!prev.has(`${r},${c}`)) return prev;
			const n = new Set(prev);
			n.delete(`${r},${c}`);
			return n;
		});
	}, []);

	const doReveal = useCallback(
		(r: number, c: number) => {
			if (over || (daily && !started)) return;
			if (grid[r][c] !== HIDDEN) return; // already revealed or flagged
			begin();
			setGrid((prev) => reveal(prev, puzzle, { r, c }));
			removeHint(r, c);
		},
		[over, daily, started, grid, begin, puzzle, removeHint],
	);

	const toggleFlag = useCallback(
		(r: number, c: number) => {
			if (over || (daily && !started)) return;
			if (grid[r][c] === REVEALED) return; // can't flag a revealed cell
			begin();
			setGrid((prev) => {
				const next = prev.map((row) => row.slice());
				next[r][c] = next[r][c] === FLAGGED ? HIDDEN : FLAGGED;
				return next;
			});
			removeHint(r, c);
		},
		[over, daily, started, grid, begin, puzzle, removeHint],
	);

	const onCellClick = (r: number, c: number) => (flagMode ? toggleFlag(r, c) : doReveal(r, c));
	const onCellContext = (e: React.MouseEvent, r: number, c: number) => {
		e.preventDefault();
		toggleFlag(r, c);
	};

	/* Hint: apply the next forced deduction and explain it. */
	const hint = useCallback(() => {
		if (over) return;
		const h = findHint(grid, puzzle);
		if (!h) return;
		setGrid((prev) => {
			let next = prev;
			if (h.value === 'safe') {
				for (const { r, c } of h.cells) next = reveal(next, puzzle, { r, c });
			} else {
				next = next.map((row) => row.slice());
				for (const { r, c } of h.cells) next[r][c] = FLAGGED;
			}
			return next;
		});
		setHinted((prev) => {
			const s = new Set(prev);
			for (const { r, c } of h.cells) s.add(`${r},${c}`);
			return s;
		});
		setHintNote(h.reason);
		begin();
		trackGame(gameId, 'hint_used');
	}, [over, grid, puzzle, begin, gameId]);

	/* Reveal the full solution (does not count as a win). */
	const showSolution = useCallback(() => {
		if (revealed) return;
		setGrid(revealSolution(puzzle));
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [revealed, puzzle, gameId]);

	const minesLeft = useMemo(() => mineCount - flagCount(grid), [mineCount, grid]);
	const lostMine = status === 'lost'; // render every mine as a bomb when lost

	// Bombs still to find = mines minus correctly-placed flags (wrong flags don't count).
	const bombsRemaining = useMemo(() => {
		let found = 0;
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (grid[r][c] === FLAGGED && puzzle.mines[r][c]) found++;
		return mineCount - found;
	}, [grid, puzzle, size, mineCount]);

	// Daily submission: a win → time; a loss → still ranked, below all wins, by bombs remaining.
	const dailyValue =
		status === 'won' ? elapsed : status === 'lost' ? LOSS_OFFSET + bombsRemaining : undefined;
	const lbFormat = (v: number) => formatScore(DAILY_LB.demineur.fmt, v);

	return (
		<div className="dm-root" style={{ ['--n' as string]: size }}>
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newGame(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="dm-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label} · ${size}×${size}`}
				</div>
			) : null}

			<div className="dm-bar">
				{!daily && (
					<div className="dm-pills" role="tablist" aria-label="Difficulté">
						{DIFF_ORDER.map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={diffKey === k}
								className={`dm-pill ${diffKey === k ? 'active' : ''}`}
								onClick={() => newGame(k)}
							>
								{DIFFS[k].label}
							</button>
						))}
					</div>
				)}
				<div className="dm-bar-right">
					<div className="dm-mines" aria-label="Mines restantes">💣 {minesLeft}</div>
					<div className="dm-timer">{fmtTime(elapsed)}</div>
					{!daily && (
						<button className="dm-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">
							↻
						</button>
					)}
				</div>
			</div>

			{!over && (!daily || started) && (
				<div className="dm-actions">
					<button
						className={`dm-act ${flagMode ? 'on' : ''}`}
						onClick={() => setFlagMode((v) => !v)}
						aria-pressed={flagMode}
					>
						🚩 Mode drapeau{flagMode ? ' : activé' : ''}
					</button>
					<button className="dm-act" onClick={hint}>💡 Indice</button>
					{!daily && elapsed >= 60 && (
						<button className="dm-act" onClick={showSolution}>👁 Voir la solution</button>
					)}
					{daily && started && status === 'playing' && (
						<button className="dm-act" onClick={resetDailyEntries}>↺ Vider mes saisies</button>
					)}
				</div>
			)}

			{status === 'lost' && (
				<div className="dm-lost">
					💥 Mine touchée !{' '}
					{daily ? (
						<>Tu apparais au classement avec <strong>{bombsRemaining}</strong> bombe{bombsRemaining > 1 ? 's' : ''} restante{bombsRemaining > 1 ? 's' : ''} — reviens demain.</>
					) : (
						<>Partie perdue.</>
					)}
					<div className="dm-lost-actions">
						{!revealed && <button className="dm-act" onClick={showSolution}>👁 Voir la solution</button>}
						{!daily && <button className="dm-replay" onClick={() => newGame(diffKey)}>Rejouer</button>}
					</div>
				</div>
			)}

			{daily && status === 'won' && (
				<div className="dm-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Résolu en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			<div className="dm-boardwrap">
				{celebrating && <Celebration />}
				<div
					className={`dm-board ${daily && !started ? 'blurred' : ''}`}
					style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
					onContextMenu={(e) => e.preventDefault()}
				>
					{Array.from({ length: size }).map((_, r) =>
						Array.from({ length: size }).map((_, c) => {
							const v = grid[r][c];
							const mine = puzzle.mines[r][c];
							const showBomb = (lostMine || revealed) && mine;
							const adj = puzzle.adjacent[r][c];
							const isFlag = v === FLAGGED && !(revealed && !mine);
							const isOpen = v === REVEALED && !mine;
							const cls = [
								'dm-cell',
								isOpen ? 'open' : '',
								isOpen && adj > 0 ? `n${adj}` : '',
								isFlag ? 'flag' : '',
								showBomb ? 'bomb' : '',
								lostMine && v === REVEALED && mine ? 'boom' : '',
								hinted.has(`${r},${c}`) ? 'hinted' : '',
								over ? 'over' : '',
							].join(' ');
							return (
								<button
									key={`${r}-${c}`}
									className={cls}
									onClick={() => onCellClick(r, c)}
									onContextMenu={(e) => onCellContext(e, r, c)}
									disabled={over}
									aria-label={`Ligne ${r + 1}, colonne ${c + 1}`}
								>
									{showBomb ? '💣' : isFlag ? '🚩' : isOpen && adj > 0 ? adj : ''}
								</button>
							);
						}),
					)}
				</div>

				{daily && dailyLoading && (
					<div className="dm-overlay">
						<div className="dm-overlay-card"><p>Préparation…</p></div>
					</div>
				)}

				{daily && !dailyLoading && !started && status === 'playing' && (
					<div className="dm-overlay">
						<button className="dm-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div>
				)}

				{showWin && !daily && (
					<div className="dm-win" role="dialog" aria-label="Démineur résolu">
						<div className="dm-wincard">
							<div className="dm-winmark">🧨</div>
							<h2>Terrain déminé !</h2>
							<p className="dm-wintime">{fmtTime(elapsed)}</p>
							<p className="dm-windiff">{DIFFS[diffKey].label} · {size}×{size}</p>
							<button className="dm-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
						</div>
					</div>
				)}
			</div>

			{!daily && hintNote && <p className="dm-hint-note" aria-live="polite">💡 {hintNote}</p>}

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={dailyValue} format={lbFormat} />
			)}
			{!daily && <LeaderboardCorner game={gameId} metric="time" format={lbFormat} />}

			{revealed ? (
				<div className="dm-revealed-note">
					<span>Solution affichée</span>
					{!daily && <button className="dm-replay" onClick={() => newGame(diffKey)}>Rejouer</button>}
				</div>
			) : (
				<p className="dm-help">
					Découvre toutes les cases sûres sans cliquer sur une mine. Les chiffres indiquent le nombre
					de mines touchant la case (en comptant les diagonales). Clic = révéler ; clic droit ou{' '}
					<strong>mode drapeau</strong> = poser un drapeau 🚩. Chaque grille est résolvable par pure
					logique, sans deviner.
				</p>
			)}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.dm-root {
  --dm-accent: var(--accent-regular);
  --dm-ok: #2f9e6f;
  --dm-bad: #d9534f;
  --dm-line: var(--gray-700);
  --dm-hidden: var(--gray-700);
  --dm-open: var(--gray-900);
  --dm-cell: calc(100cqw / var(--n, 9));

  width: 100%;
  max-width: 480px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.dm-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem;
}

.dm-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 0.85rem; flex-wrap: wrap;
}
.dm-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.dm-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.dm-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.dm-pill.active { background: var(--dm-accent); color: var(--accent-text-over); border-color: var(--dm-accent); }
.dm-mines {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 14px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 12px;
}
.dm-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.dm-new {
  border: none; background: var(--dm-accent); color: var(--accent-text-over);
  font-size: 18px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1;
}

.dm-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 0.85rem; }
.dm-act {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.dm-act:hover { background: var(--gray-800); border-color: var(--dm-accent); color: var(--dm-accent); }
.dm-act.on { background: var(--dm-accent); color: var(--accent-text-over); border-color: var(--dm-accent); }

.dm-boardwrap {
  position: relative;
  width: 100%;
  max-width: min(460px, calc(46px * var(--n, 9)));
  margin-inline: auto;
  container-type: inline-size;
}
.dm-board {
  width: 100%;
  display: grid;
  gap: 2px;
  touch-action: manipulation;
  user-select: none;
  background: var(--gray-700);
  border-radius: 6px;
  padding: 2px;
}
.dm-cell {
  width: 100%;
  aspect-ratio: 1;
  border: none;
  border-radius: 3px;
  background: var(--dm-hidden);
  color: var(--gray-0);
  font-family: var(--font-body);
  font-weight: 800;
  font-size: calc(var(--dm-cell) * 0.5);
  line-height: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  padding: 0;
  transition: background-color 0.08s ease;
}
.dm-cell:hover:not(.open):not(:disabled) { background: var(--gray-500); }
.dm-cell.open { background: var(--dm-open); cursor: default; }
.dm-cell.flag { background: var(--dm-hidden); font-size: calc(var(--dm-cell) * 0.42); }
.dm-cell.bomb { background: var(--gray-900); font-size: calc(var(--dm-cell) * 0.42); }
.dm-cell.boom { background: var(--dm-bad); }
.dm-cell.hinted { box-shadow: inset 0 0 0 2px var(--dm-ok); }
.dm-cell.over { cursor: default; }
.dm-cell:disabled { cursor: default; }

/* Number colours (classic palette, readable on dark). */
.dm-cell.n1 { color: #5aa9ff; }
.dm-cell.n2 { color: #4cc38a; }
.dm-cell.n3 { color: #ff7a7a; }
.dm-cell.n4 { color: #b388ff; }
.dm-cell.n5 { color: #ffb454; }
.dm-cell.n6 { color: #41d6c3; }
.dm-cell.n7 { color: #ff8cc6; }
.dm-cell.n8 { color: var(--gray-300); }

.dm-lost {
  text-align: center; font-size: 15px; color: var(--gray-0); margin: 0 0 0.85rem; font-weight: 500;
}
.dm-lost-actions { display: flex; gap: 8px; justify-content: center; margin-top: 0.6rem; flex-wrap: wrap; }
.dm-daily-won { text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem; }
.dm-daily-won strong { color: var(--dm-accent); font-variant-numeric: tabular-nums; }

.dm-help {
  max-width: 440px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin-top: 1.1rem;
}
.dm-revealed-note {
  display: flex; align-items: center; gap: 14px; margin-top: 1.25rem; color: var(--gray-300); font-size: 14px; font-weight: 500;
}
.dm-hint-note {
  max-width: 440px; margin: 1rem auto 0; text-align: center; font-size: 13px; line-height: 1.5;
  color: var(--dm-ok); background: var(--accent-overlay); border: 1px solid var(--dm-ok); border-radius: 12px; padding: 8px 14px;
}

.dm-win {
  position: absolute; inset: -8px; display: flex; align-items: center; justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px;
}
.dm-wincard {
  background: var(--gray-999); border: 2px solid var(--dm-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg);
}
.dm-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 22px; color: var(--gray-0); }
.dm-winmark { font-size: 30px; }
.dm-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--dm-accent); }
.dm-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.dm-replay {
  border: none; background: var(--dm-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer;
}

.dm-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.dm-overlay { position: absolute; inset: -8px; z-index: 2; display: flex; align-items: center; justify-content: center; }
.dm-overlay-card { background: var(--gray-999); border: 2px solid var(--dm-accent); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); }
.dm-startbtn {
  border: none; background: var(--dm-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}

@media (prefers-reduced-motion: reduce) { .dm-win, .dm-overlay, .dm-cell { transition: none; } }
`;
