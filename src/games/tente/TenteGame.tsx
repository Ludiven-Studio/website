import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DIFFS, generateTente, findHint, type TentePuzzle, type Coord } from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import {
	getDaily,
	dailyWeekdayLabel,
	loadDailyRun,
	saveDailyRun,
	type DailyRun,
} from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   TENTE (Tents & Trees) — React island (training mode).
   One tent per tree, orthogonally adjacent; no two tents
   touch; row/column counts fix the number of tents.
   Engine lives in ./engine (pure, tested).
   ===================================================== */

type Status = 'playing' | 'won';
type Mark = 'tent' | 'grass' | null;

// Daily challenge: difficulty comes from the server (same for everyone).
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const emptyMarks = (n: number): Mark[][] => Array.from({ length: n }, () => new Array<Mark>(n).fill(null));

const cellKey = (r: number, c: number) => r * 100 + c;

const generate = (diffIndex: number, seed: number): TentePuzzle =>
	generateTente(DIFFS[DIFF_ORDER[diffIndex]], mulberry32(seed));

export default function TenteGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<TentePuzzle>(() =>
		generateTente(DIFFS.facile, Math.random),
	);
	const [marks, setMarks] = useState<Mark[][]>(() => emptyMarks(DIFFS.facile.size));
	const [status, setStatus] = useState<Status>('playing');
	const [started, setStarted] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [hinted, setHinted] = useState<Set<string>>(() => new Set());
	const [elapsed, setElapsed] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false); // daily already completed today
	const [hintNote, setHintNote] = useState(''); // explanation of the last hint
	const startRef = useRef<number>(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);

	const { size, trees, tents, rowCounts, colCounts } = puzzle;
	const over = status === 'won' || revealed;

	// Trees occupy fixed cells; lookup set + solution tent set.
	const treeSet = useMemo(() => new Set(trees.map(([r, c]) => cellKey(r, c))), [trees]);
	const solSet = useMemo(() => new Set(tents.map(([r, c]) => cellKey(r, c))), [tents]);

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		const d = DIFFS[key];
		setDaily(false);
		setAlreadyPlayed(false);
		setHintNote('');
		setDiffKey(key);
		setPuzzle(generateTente(d, Math.random));
		setMarks(emptyMarks(d.size));
		setStatus('playing');
		setStarted(false);
		setRevealed(false);
		setHinted(new Set());
		setElapsed(0);
	}, []);

	/* Daily challenge: one attempt per device, resumable. Server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setRevealed(false);
		setHinted(new Set());

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			// Resume or lock the existing attempt — regenerate from the stored seed (no fetch).
			const di = run.diffIndex ?? 0;
			const dk = DIFF_ORDER[di] ?? 'facile';
			dailySeedRef.current = { seed: run.seed, diffIndex: di };
			setDailyLoading(false);
			setDiffKey(dk);
			const p = generate(di, run.seed);
			setPuzzle(p);
			setMarks((run.state as Mark[][] | undefined) ?? emptyMarks(p.size));
			setStarted(true);
			if (run.done) {
				setAlreadyPlayed(true);
				setStatus('won');
				setElapsed(run.finalTime ?? 0);
			} else {
				setAlreadyPlayed(false);
				setStatus('playing');
				startRef.current = run.startedAt;
				setElapsed(Math.floor((Date.now() - run.startedAt) / 1000));
			}
			return;
		}

		// Fresh: fetch today's seed and arm the grid (Start not pressed yet).
		setAlreadyPlayed(false);
		setStatus('playing');
		setStarted(false);
		setElapsed(0);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const dk = DIFF_ORDER[diffIndex] ?? 'facile';
		setDiffKey(dk);
		const p = generate(diffIndex, seed);
		setPuzzle(p);
		setMarks(emptyMarks(p.size));
		setDailyLoading(false);
	}, [gameId]);

	const { celebrating, showWin } = useCelebration(status === 'won');

	/* Commencer: consumes the attempt and starts the chrono. */
	const startTimer = useCallback(() => {
		const now = Date.now();
		startRef.current = now;
		setStarted(true);
		setElapsed(0);
		trackGame(gameId, 'game_started');
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: now,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: emptyMarks(size),
		});
	}, [gameId, size]);

	/* Clear my entries without resetting the attempt (chrono keeps running). */
	const resetDailyEntries = useCallback(() => {
		setMarks(emptyMarks(size));
		setHinted(new Set());
		setHintNote('');
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: emptyMarks(size),
		});
	}, [gameId, size]);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing' || !started || revealed) return;
		const id = setInterval(
			() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
			250,
		);
		return () => clearInterval(id);
	}, [status, started, revealed]);

	const begin = useCallback(() => {
		if (daily) return; // daily chrono is started by ▶ Commencer, never by a move
		if (!started) {
			startRef.current = Date.now();
			setStarted(true);
			trackGame(gameId, 'game_started');
		}
	}, [daily, started, gameId]);

	/* Tent count per row / column from the player's marks. */
	const placedRows = useMemo(() => {
		const out = new Array(size).fill(0);
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (marks[r][c] === 'tent') out[r]++;
		return out;
	}, [marks, size]);
	const placedCols = useMemo(() => {
		const out = new Array(size).fill(0);
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (marks[r][c] === 'tent') out[c]++;
		return out;
	}, [marks, size]);

	/* Win: the player's tent set equals the solution exactly. */
	useEffect(() => {
		if (over) return;
		if (daily && !started) return; // skip win-check on a daily not yet started
		let count = 0;
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) {
				if (marks[r][c] === 'tent') {
					if (!solSet.has(cellKey(r, c))) return; // wrong tent
					count++;
				}
			}
		if (count !== solSet.size) return; // missing tents
		setStatus('won');
		trackGame(gameId, 'game_won');
	}, [marks, over, size, solSet, gameId, daily, started]);

	const removeHint = useCallback((r: number, c: number) => {
		setHinted((prev) => {
			if (!prev.has(`${r},${c}`)) return prev;
			const n = new Set(prev);
			n.delete(`${r},${c}`);
			return n;
		});
	}, []);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || status === 'won') return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: marks,
		});
	}, [daily, started, status, marks, gameId]);

	/* Lock the daily attempt on a fresh win. */
	useEffect(() => {
		if (!daily || status !== 'won' || alreadyPlayed) return;
		const sd = dailySeedRef.current;
		const finalTime = Math.floor((Date.now() - startRef.current) / 1000);
		const snapshot: DailyRun = {
			startedAt: startRef.current,
			done: true,
			finalTime,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: marks,
		};
		saveDailyRun(gameId, snapshot);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	/* Click a non-tree cell: empty → tent → grass → empty. */
	const cycle = useCallback(
		(r: number, c: number) => {
			if (over || (daily && !started) || treeSet.has(cellKey(r, c))) return;
			setMarks((prev) => {
				const cur = prev[r][c];
				const next: Mark = cur === null ? 'tent' : cur === 'tent' ? 'grass' : null;
				const n = prev.map((row) => [...row]);
				n[r][c] = next;
				return n;
			});
			removeHint(r, c);
			begin();
		},
		[over, daily, started, treeSet, removeHint, begin],
	);

	/* Hint (free mode): deduce the next logical cell and explain the technique. Mark it GREEN. */
	const hint = useCallback(() => {
		if (over) return;
		const h = findHint(marks, puzzle);
		if (!h) return;
		setMarks((prev) => {
			const n = prev.map((row) => [...row]);
			n[h.r][h.c] = h.value;
			return n;
		});
		setHinted((prev) => new Set(prev).add(`${h.r},${h.c}`));
		setHintNote(h.reason);
		begin();
		trackGame(gameId, 'hint_used');
	}, [over, marks, puzzle, begin, gameId]);

	/* Reveal the full solution (does not count as a win). */
	const reveal = useCallback(() => {
		if (over) return;
		const next = emptyMarks(size);
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) {
				if (treeSet.has(cellKey(r, c))) continue;
				next[r][c] = solSet.has(cellKey(r, c)) ? 'tent' : 'grass';
			}
		setMarks(next);
		setHinted(new Set());
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [over, size, treeSet, solSet, gameId]);

	return (
		<div className="te-root" style={{ ['--n' as string]: size }}>
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newGame(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="te-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label} · ${size}×${size}`}
				</div>
			) : null}

			<div className="te-bar">
				{!daily && (
					<div className="te-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={diffKey === k}
								className={`te-pill ${diffKey === k ? 'active' : ''}`}
								onClick={() => newGame(k)}
							>
								{DIFFS[k].label}
							</button>
						))}
					</div>
				)}
				<div className="te-bar-right">
					<div className="te-timer" aria-live="off">{fmtTime(elapsed)}</div>
					{!daily && (
						<button className="te-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">
							↻ Nouvelle
						</button>
					)}
				</div>
			</div>

			{!over && !daily && (
				<div className="te-actions">
					<button className="te-act" onClick={hint}>💡 Indice</button>
					{elapsed >= 60 && (
						<button className="te-act" onClick={reveal}>👁 Voir la solution</button>
					)}
				</div>
			)}

			{daily && started && status === 'playing' && (
				<div className="te-actions">
					<button className="te-act" onClick={resetDailyEntries}>↺ Vider mes saisies</button>
				</div>
			)}

			{daily && status === 'won' && (
				<div className="te-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Résolu en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			<div className="te-boardwrap" style={{ ['--n' as string]: size }}>
				{celebrating && <Celebration />}
				<div
					className={`te-board ${daily && !started ? 'blurred' : ''}`}
					style={{
						gridTemplate: `auto repeat(${size}, 1fr) / auto repeat(${size}, 1fr)`,
					}}
				>
					<div className="te-corner" />
					{Array.from({ length: size }).map((_, c) => {
						const reached = placedCols[c] >= colCounts[c];
						const exceeded = placedCols[c] > colCounts[c];
						return (
							<div
								key={`col${c}`}
								className={`te-count col ${exceeded ? 'over' : reached ? 'done' : ''}`}
							>
								{colCounts[c]}
							</div>
						);
					})}
					{Array.from({ length: size }).map((_, r) => {
						const reached = placedRows[r] >= rowCounts[r];
						const exceeded = placedRows[r] > rowCounts[r];
						return (
							<RowClueAndCells
								key={`row${r}`}
								r={r}
								size={size}
								rowCount={rowCounts[r]}
								rowState={exceeded ? 'over' : reached ? 'done' : ''}
								marks={marks}
								treeSet={treeSet}
								hinted={hinted}
								over={over}
								interactive={!over && (!daily || started)}
								onCell={cycle}
							/>
						);
					})}
				</div>

				{daily && dailyLoading && (
					<div className="te-overlay">
						<div className="te-overlay-card"><p className="te-windiff">Préparation du défi…</p></div>
					</div>
				)}

				{daily && !dailyLoading && !started && status !== 'won' && (
					<div className="te-overlay">
						<button className="te-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div>
				)}

				{showWin && !daily && (
					<div className="te-win" role="dialog" aria-label="Grille résolue">
						<div className="te-wincard">
							<div className="te-winmark">⛺</div>
							<h2>Résolu !</h2>
							<p className="te-wintime">{fmtTime(elapsed)}</p>
							<p className="te-windiff">{DIFFS[diffKey].label} · {size}×{size}</p>
							<button className="te-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
						</div>
					</div>
				)}
			</div>

			{!daily && hintNote && (
				<p className="te-hint-note" aria-live="polite">💡 {hintNote}</p>
			)}

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={status === 'won' ? elapsed : undefined} />
			)}

			{!daily && <LeaderboardCorner game={gameId} metric="time" />}

			{revealed ? (
				<div className="te-revealed-note">
					<span>Solution affichée</span>
					<button className="te-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
				</div>
			) : (
				<p className="te-help">
					Place une tente (⛺) à côté de chaque arbre (🌳) : une seule par arbre, jamais deux
					tentes qui se touchent (même en diagonale). Les chiffres donnent le nombre de tentes par
					ligne et colonne. Touche une case pour alterner vide → tente → herbe (▪, « pas de tente »).
				</p>
			)}
		</div>
	);
}

interface RowProps {
	r: number;
	size: number;
	rowCount: number;
	rowState: '' | 'done' | 'over';
	marks: Mark[][];
	treeSet: Set<number>;
	hinted: Set<string>;
	over: boolean;
	interactive: boolean;
	onCell: (r: number, c: number) => void;
}

function RowClueAndCells({ r, size, rowCount, rowState, marks, treeSet, hinted, over, interactive, onCell }: RowProps) {
	return (
		<>
			<div className={`te-count row ${rowState}`}>{rowCount}</div>
			{Array.from({ length: size }).map((_, c) => {
				const isTree = treeSet.has(r * 100 + c);
				const m = marks[r][c];
				const isHinted = hinted.has(`${r},${c}`);
				return (
					<button
						key={c}
						className={[
							'te-cell',
							isTree ? 'tree' : '',
							m === 'tent' ? 'tent' : '',
							m === 'grass' ? 'grass' : '',
							isHinted ? 'hinted' : '',
							over ? 'over' : '',
						].join(' ')}
						onClick={() => onCell(r, c)}
						disabled={isTree || !interactive}
						aria-label={`Ligne ${r + 1}, colonne ${c + 1}${
							isTree ? ', arbre' : m === 'tent' ? ', tente' : m === 'grass' ? ', herbe' : ', vide'
						}`}
					>
						{isTree ? '🌳' : m === 'tent' ? '⛺' : m === 'grass' ? '▪' : ''}
					</button>
				);
			})}
		</>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.te-root {
  --te-accent: var(--accent-regular);
  --te-ok: #2f9e6f;
  --te-bad: #d9534f;
  --te-line: var(--gray-700);

  width: 100%;
  max-width: 480px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.te-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.75rem;
}

.te-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 1rem;
}
.te-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.te-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.te-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.te-pill.active { background: var(--te-accent); color: var(--accent-text-over); border-color: var(--te-accent); }
.te-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.te-new {
  border: none; background: var(--te-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 14px; border-radius: 999px; padding: 8px 16px; cursor: pointer;
}

.te-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 0.85rem; }
.te-act {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.te-act:hover { background: var(--gray-800); border-color: var(--te-accent); color: var(--te-accent); }

.te-boardwrap {
  position: relative;
  width: 100%;
  max-width: min(460px, calc(46px * (var(--n, 6) + 1)));
  margin-inline: auto;
  container-type: inline-size;
}
.te-board {
  width: 100%;
  display: grid;
  background: var(--gray-999);
  border-radius: 6px;
  overflow: hidden;
}
.te-corner { }
.te-count {
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: calc(44cqw / (var(--n, 6) + 1)); font-variant-numeric: tabular-nums;
  color: var(--gray-0);
}
.te-count.done { opacity: 0.5; }
.te-count.over { color: var(--te-bad); }

.te-cell {
  aspect-ratio: 1 / 1;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid var(--te-line);
  background: var(--gray-999);
  font: inherit;
  font-size: calc(58cqw / (var(--n, 6) + 1));
  line-height: 1;
  cursor: pointer;
  padding: 0;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.08s ease;
}
.te-cell.tree { background: var(--gray-900); cursor: default; }
.te-cell.tent { background: var(--accent-overlay); }
.te-cell.grass { color: var(--gray-500); font-size: calc(34cqw / (var(--n, 6) + 1)); }
.te-cell.hinted { box-shadow: inset 0 0 0 3px var(--te-ok); }
.te-cell.over { cursor: default; }
.te-cell:disabled { cursor: default; }

.te-help {
  max-width: 430px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin-top: 1.1rem;
}
.te-revealed-note {
  display: flex; align-items: center; gap: 14px; margin-top: 1.25rem; color: var(--gray-300); font-size: 14px; font-weight: 500;
}
.te-hint-note {
  max-width: 420px;
  margin: 1rem auto 0;
  text-align: center;
  font-size: 13px;
  line-height: 1.5;
  color: var(--te-ok);
  background: var(--accent-overlay);
  border: 1px solid var(--te-ok);
  border-radius: 12px;
  padding: 8px 14px;
}

.te-win {
  position: absolute; inset: -8px; display: flex; align-items: center; justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px;
}
.te-wincard {
  background: var(--gray-999); border: 2px solid var(--te-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg);
}
.te-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 22px; color: var(--gray-0); }
.te-winmark { font-size: 30px; }
.te-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--te-accent); }
.te-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.te-replay {
  border: none; background: var(--te-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer;
}

.te-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.te-overlay {
  position: absolute; inset: -8px; z-index: 2;
  display: flex; align-items: center; justify-content: center;
}
.te-overlay-card {
  background: var(--gray-999); border: 2px solid var(--te-accent);
  border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg);
}
.te-startbtn {
  border: none; background: var(--te-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.te-daily-won {
  text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem;
}
.te-daily-won strong { color: var(--te-accent); font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) { .te-cell, .te-win, .te-overlay { transition: none; } }
`;
