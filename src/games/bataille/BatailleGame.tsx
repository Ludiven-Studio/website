import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DIFFS, generateBataille, findHint, segType, type BataillePuzzle, type Given, type SegType } from './engine';
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

/* =====================================================
   BATAILLE NAVALE LOGIQUE (Bimaru) — React island.
   Find a hidden fleet from row/column ship counts and a
   few revealed cells. Mark each free cell ship or water;
   ships never touch (even diagonally). Engine is pure/tested.
   ===================================================== */

type Status = 'playing' | 'won';
// Player mark per cell: 0 empty, 1 ship, 2 water. Given cells override.
type Mark = 0 | 1 | 2;

const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const emptyMarks = (n: number): Mark[][] => Array.from({ length: n }, () => new Array<Mark>(n).fill(0));

/** Effective ship grid: player 'ship' OR given 'ship'. Used for win + segType rendering. */
function shipGrid(marks: Mark[][], given: Given[][], n: number): boolean[][] {
	const g: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) g[r][c] = given[r][c] === 'ship' || marks[r][c] === 1;
	return g;
}

/** Fleet legend, e.g. "1×4, 2×3, 2×2, 2×1" grouped by length desc. */
function fleetLegend(fleet: number[]): { len: number; count: number }[] {
	const m = new Map<number, number>();
	for (const l of fleet) m.set(l, (m.get(l) ?? 0) + 1);
	return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([len, count]) => ({ len, count }));
}

export default function BatailleGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<BataillePuzzle>(() => generateBataille(DIFFS.facile));
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
	const painting = useRef(false);
	const strokeVal = useRef<Mark>(0);

	const { size, given, solution, rowCounts, colCounts, fleet } = puzzle;
	const over = status === 'won' || revealed;

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		const d = DIFFS[key];
		setDaily(false);
		setAlreadyPlayed(false);
		setHintNote('');
		setDiffKey(key);
		setPuzzle(generateBataille(d));
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
			const d = DIFFS[dk];
			setPuzzle(generateBataille(d, mulberry32(run.seed)));
			setMarks((run.state as Mark[][] | undefined) ?? emptyMarks(d.size));
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
		const d = DIFFS[dk];
		setPuzzle(generateBataille(d, mulberry32(seed)));
		setMarks(emptyMarks(d.size));
		setDailyLoading(false);
	}, [gameId]);

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

	const removeHint = useCallback((r: number, c: number) => {
		setHinted((prev) => {
			if (!prev.has(`${r},${c}`)) return prev;
			const n = new Set(prev);
			n.delete(`${r},${c}`);
			return n;
		});
	}, []);

	/* Effective ship grid for rendering and counts. */
	const ships = useMemo(() => shipGrid(marks, given, size), [marks, given, size]);

	const rowShipCount = useMemo(
		() => ships.map((row) => row.reduce((a, v) => a + (v ? 1 : 0), 0)),
		[ships],
	);
	const colShipCount = useMemo(() => {
		const out = new Array(size).fill(0);
		for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (ships[r][c]) out[c]++;
		return out;
	}, [ships, size]);

	/* Win: every cell's effective ship matches the solution. */
	useEffect(() => {
		if (over) return;
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (ships[r][c] !== solution[r][c]) return;
		setStatus('won');
		trackGame(gameId, 'game_won');
	}, [ships, over, size, solution, gameId]);

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

	/* Stroke: set a free cell's mark (given cells are locked). */
	const applyStroke = useCallback(
		(r: number, c: number) => {
			if (given[r][c] !== null) return; // locked clue
			const v = strokeVal.current;
			setMarks((prev) => {
				if (prev[r][c] === v) return prev;
				const n = prev.map((row) => [...row]);
				n[r][c] = v;
				return n;
			});
			removeHint(r, c);
			begin();
		},
		[given, removeHint, begin],
	);

	const cellFromEvent = (e: React.PointerEvent): [number, number] | null => {
		const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
		const cell = el?.closest?.('.ba-cell') as HTMLElement | null;
		if (!cell) return null;
		const r = Number(cell.dataset.r);
		const c = Number(cell.dataset.c);
		if (Number.isNaN(r) || Number.isNaN(c)) return null;
		return [r, c];
	};

	const onPointerDown = (e: React.PointerEvent) => {
		if (over || (daily && !started)) return;
		const cell = cellFromEvent(e);
		if (!cell) return;
		const [r, c] = cell;
		if (given[r][c] !== null) return;
		painting.current = true;
		// Cycle empty → ship → water → empty; the chosen value paints the whole stroke.
		const cur = marks[r][c];
		strokeVal.current = (cur === 0 ? 1 : cur === 1 ? 2 : 0) as Mark;
		applyStroke(r, c);
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
	};
	const onPointerMove = (e: React.PointerEvent) => {
		if (!painting.current) return;
		const cell = cellFromEvent(e);
		if (cell) applyStroke(cell[0], cell[1]);
	};
	const endStroke = () => {
		painting.current = false;
	};

	/* Hint: deduce the next logical cell and explain the technique. */
	const hint = useCallback(() => {
		if (over) return;
		const h = findHint(marks, puzzle);
		if (!h) return;
		const { r, c } = h;
		setMarks((prev) => {
			const n = prev.map((row) => [...row]);
			n[r][c] = (h.value === 'ship' ? 1 : 2) as Mark;
			return n;
		});
		setHinted((prev) => new Set(prev).add(`${r},${c}`));
		setHintNote(h.reason);
		begin();
		trackGame(gameId, 'hint_used');
	}, [over, marks, puzzle, begin, gameId]);

	/* Reveal the full solution (does not count as a win). */
	const reveal = useCallback(() => {
		if (over) return;
		setMarks((prev) => {
			const n = prev.map((row) => [...row]);
			for (let r = 0; r < size; r++)
				for (let c = 0; c < size; c++)
					if (given[r][c] === null) n[r][c] = (solution[r][c] ? 1 : 2) as Mark;
			return n;
		});
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [over, size, given, solution, gameId]);

	const legend = useMemo(() => fleetLegend(fleet), [fleet]);

	return (
		<div className="ba-root" style={{ ['--n' as string]: size }}>
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newGame(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="ba-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			) : null}

			<div className="ba-bar">
				{!daily && (
					<div className="ba-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={diffKey === k}
								className={`ba-pill ${diffKey === k ? 'active' : ''}`}
								onClick={() => newGame(k)}
							>
								{DIFFS[k].label}
							</button>
						))}
					</div>
				)}
				<div className="ba-bar-right">
					<div className="ba-timer">{fmtTime(elapsed)}</div>
					{!daily && (
						<button className="ba-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">
							↻
						</button>
					)}
				</div>
			</div>

			<div className="ba-fleet" aria-label="Flotte à trouver">
				{legend.map(({ len, count }) => (
					<span key={len} className="ba-fleet-item">
						<strong>{count}×</strong>
						<span className="ba-fleet-ship">
							{Array.from({ length: len }).map((_, i) => (
								<i key={i} className="ba-fleet-seg" />
							))}
						</span>
					</span>
				))}
			</div>

			{!over && !daily && (
				<div className="ba-actions">
					<button className="ba-act" onClick={hint}>💡 Indice</button>
					{elapsed >= 60 && (
						<button className="ba-act" onClick={reveal}>👁 Voir la solution</button>
					)}
				</div>
			)}

			{daily && started && status === 'playing' && (
				<div className="ba-actions">
					<button className="ba-act" onClick={resetDailyEntries}>↺ Vider mes saisies</button>
				</div>
			)}

			{daily && status === 'won' && (
				<div className="ba-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Résolu en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			<div className="ba-boardwrap">
				<div
					className={`ba-board ${daily && !started ? 'blurred' : ''}`}
					style={{
						gridTemplateColumns: `auto repeat(${size}, 1fr)`,
						gridTemplateRows: `auto repeat(${size}, 1fr)`,
					}}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={endStroke}
					onPointerCancel={endStroke}
				>
					<div className="ba-corner" />
					{Array.from({ length: size }).map((_, c) => {
						const cur = colShipCount[c];
						const tgt = colCounts[c];
						const cls = cur > tgt ? 'over' : cur === tgt ? 'done' : '';
						return (
							<div key={`ch${c}`} className={`ba-head col ${cls}`}>
								{tgt}
							</div>
						);
					})}
					{Array.from({ length: size }).map((_, r) => {
						const curR = rowShipCount[r];
						const tgtR = rowCounts[r];
						const rcls = curR > tgtR ? 'over' : curR === tgtR ? 'done' : '';
						return (
							<RowCells
								key={`row${r}`}
								r={r}
								size={size}
								rowTarget={tgtR}
								rowClass={rcls}
								marks={marks}
								given={given}
								ships={ships}
								solution={solution}
								hinted={hinted}
								revealed={revealed}
								over={over}
							/>
						);
					})}
				</div>

				{daily && dailyLoading && (
					<div className="ba-overlay">
						<div className="ba-overlay-card"><p className="ba-windiff">Préparation…</p></div>
					</div>
				)}

				{daily && !dailyLoading && !started && status !== 'won' && (
					<div className="ba-overlay">
						<button className="ba-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div>
				)}

				{status === 'won' && !daily && (
					<div className="ba-win" role="dialog" aria-label="Flotte trouvée">
						<div className="ba-wincard">
							<div className="ba-winmark">⚓</div>
							<h2>Flotte coulée !</h2>
							<p className="ba-wintime">{fmtTime(elapsed)}</p>
							<p className="ba-windiff">{DIFFS[diffKey].label} · {size}×{size}</p>
							<button className="ba-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
						</div>
					</div>
				)}
			</div>

			{!daily && hintNote && (
				<p className="ba-hint-note" aria-live="polite">💡 {hintNote}</p>
			)}

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={status === 'won' ? elapsed : undefined} />
			)}

			{!daily && <LeaderboardCorner game={gameId} metric="time" />}

			{revealed ? (
				<div className="ba-revealed-note">
					<span>Solution affichée</span>
					<button className="ba-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
				</div>
			) : (
				<p className="ba-help">
					Les chiffres indiquent le nombre de cases-navire par ligne et colonne. Touche une case
					pour la faire défiler : vide → <strong>navire</strong> → <strong>eau</strong> → vide.
					Les navires ne se touchent jamais, même en diagonale.
				</p>
			)}
		</div>
	);
}

interface RowProps {
	r: number;
	size: number;
	rowTarget: number;
	rowClass: string;
	marks: Mark[][];
	given: Given[][];
	ships: boolean[][];
	solution: boolean[][];
	hinted: Set<string>;
	revealed: boolean;
	over: boolean;
}

const SEG_CLASS: Record<NonNullable<SegType>, string> = {
	single: 'seg-single',
	left: 'seg-left',
	right: 'seg-right',
	top: 'seg-top',
	bottom: 'seg-bottom',
	'mid-h': 'seg-midh',
	'mid-v': 'seg-midv',
};

function RowCells({ r, size, rowTarget, rowClass, marks, given, ships, solution, hinted, revealed, over }: RowProps) {
	return (
		<>
			<div className={`ba-head row ${rowClass}`}>{rowTarget}</div>
			{Array.from({ length: size }).map((_, c) => {
				const g = given[r][c];
				const isGiven = g !== null;
				const isShip = ships[r][c];
				const isWater = !isShip && (isGiven ? g === 'water' : marks[r][c] === 2);
				const seg = isShip ? segType(ships, r, c) : null;
				const wrong = revealed && !isGiven && marks[r][c] !== 0 && (marks[r][c] === 1) !== solution[r][c];
				return (
					<div
						key={c}
						className={[
							'ba-cell',
							isGiven ? 'given' : '',
							isShip ? 'ship' : '',
							isWater ? 'water' : '',
							seg ? SEG_CLASS[seg] : '',
							hinted.has(`${r},${c}`) ? 'hinted' : '',
							wrong ? 'wrong' : '',
							over ? 'over' : '',
						].join(' ')}
						data-r={r}
						data-c={c}
						aria-label={`Ligne ${r + 1}, colonne ${c + 1}${isShip ? ', navire' : isWater ? ', eau' : ', vide'}`}
					>
						{isShip ? <span className="ba-seg" /> : isWater ? <span className="ba-dot" /> : null}
					</div>
				);
			})}
		</>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.ba-root {
  --ba-accent: var(--accent-regular);
  --ba-ok: #2f9e6f;
  --ba-bad: #d9534f;
  --ba-line: var(--gray-700);
  --ba-ship: var(--gray-0);
  --ba-cell: calc(100cqw / (var(--n, 6) + 1));

  width: 100%;
  max-width: 480px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.ba-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.75rem;
}

.ba-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 0.85rem;
}
.ba-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.ba-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.ba-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.ba-pill.active { background: var(--ba-accent); color: var(--accent-text-over); border-color: var(--ba-accent); }
.ba-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.ba-new {
  border: none; background: var(--ba-accent); color: var(--accent-text-over);
  font-size: 18px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1;
}

.ba-fleet {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
  gap: 6px 12px; margin-bottom: 0.85rem; font-size: 12.5px; color: var(--gray-300);
}
.ba-fleet-item { display: inline-flex; align-items: center; gap: 4px; }
.ba-fleet-item strong { color: var(--gray-0); font-weight: 700; }
.ba-fleet-ship { display: inline-flex; gap: 1px; }
.ba-fleet-seg {
  width: 11px; height: 11px; background: var(--ba-ship); border-radius: 3px;
}
.ba-fleet-ship .ba-fleet-seg:first-child { border-top-left-radius: 999px; border-bottom-left-radius: 999px; }
.ba-fleet-ship .ba-fleet-seg:last-child { border-top-right-radius: 999px; border-bottom-right-radius: 999px; }
.ba-fleet-ship .ba-fleet-seg:only-child { border-radius: 999px; }

.ba-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 0.85rem; }
.ba-act {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.ba-act:hover { background: var(--gray-800); border-color: var(--ba-accent); color: var(--ba-accent); }

.ba-boardwrap {
  position: relative;
  width: 100%;
  max-width: min(460px, calc(46px * (var(--n, 6) + 1)));
  margin-inline: auto;
  container-type: inline-size;
}
.ba-board {
  width: 100%;
  display: grid;
  touch-action: none;
  user-select: none;
  background: var(--gray-999);
  border-radius: 6px;
}
.ba-corner { }
.ba-head {
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: calc(var(--ba-cell) * 0.42); font-variant-numeric: tabular-nums;
  color: var(--gray-0);
}
.ba-head.col { min-height: calc(var(--ba-cell) * 0.9); }
.ba-head.row { min-width: calc(var(--ba-cell) * 0.9); }
.ba-head.done { color: var(--ba-ok); }
.ba-head.over { color: var(--ba-bad); }

.ba-cell {
  position: relative;
  width: var(--ba-cell); height: var(--ba-cell);
  border: 1px solid var(--ba-line);
  background: var(--gray-999);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.ba-cell.over { cursor: default; }
.ba-cell.given { background: var(--gray-900); cursor: default; }

/* Water: a small muted dot. */
.ba-dot {
  width: calc(var(--ba-cell) * 0.18); height: calc(var(--ba-cell) * 0.18);
  border-radius: 50%; background: var(--gray-500);
}
.ba-cell.given.water .ba-dot { background: var(--ba-accent); opacity: 0.75; }

/* Ship segment shapes from segType. */
.ba-seg {
  background: var(--ba-ship);
  display: block;
}
.ba-cell.ship.given .ba-seg { background: var(--ba-accent); }
.ba-cell.ship .ba-seg { width: 78%; height: 78%; }
.ba-cell.seg-single .ba-seg { border-radius: 50%; }
.ba-cell.seg-left .ba-seg { width: 100%; border-radius: 999px 0 0 999px; margin-left: 22%; }
.ba-cell.seg-right .ba-seg { width: 100%; border-radius: 0 999px 999px 0; margin-right: 22%; }
.ba-cell.seg-top .ba-seg { height: 100%; border-radius: 999px 999px 0 0; margin-top: 22%; }
.ba-cell.seg-bottom .ba-seg { height: 100%; border-radius: 0 0 999px 999px; margin-bottom: 22%; }
.ba-cell.seg-midh .ba-seg { width: 100%; height: 78%; border-radius: 0; }
.ba-cell.seg-midv .ba-seg { width: 78%; height: 100%; border-radius: 0; }

.ba-cell.hinted .ba-seg { background: var(--ba-ok); }
.ba-cell.hinted.water .ba-dot { background: var(--ba-ok); }
.ba-cell.hinted { box-shadow: inset 0 0 0 2px var(--ba-ok); }
.ba-cell.wrong { box-shadow: inset 0 0 0 2px var(--ba-bad); }

.ba-help {
  max-width: 430px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin-top: 1.1rem;
}
.ba-revealed-note {
  display: flex; align-items: center; gap: 14px; margin-top: 1.25rem; color: var(--gray-300); font-size: 14px; font-weight: 500;
}
.ba-hint-note {
  max-width: 430px; margin: 1rem auto 0; text-align: center; font-size: 13px; line-height: 1.5;
  color: var(--ba-ok); background: var(--accent-overlay); border: 1px solid var(--ba-ok); border-radius: 12px; padding: 8px 14px;
}

.ba-win {
  position: absolute; inset: -8px; display: flex; align-items: center; justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px;
}
.ba-wincard {
  background: var(--gray-999); border: 2px solid var(--ba-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg);
}
.ba-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 22px; color: var(--gray-0); }
.ba-winmark { font-size: 30px; }
.ba-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--ba-accent); }
.ba-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.ba-replay {
  border: none; background: var(--ba-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer;
}

.ba-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.ba-overlay {
  position: absolute; inset: -8px; z-index: 2;
  display: flex; align-items: center; justify-content: center;
}
.ba-overlay-card {
  background: var(--gray-999); border: 2px solid var(--ba-accent);
  border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg);
}
.ba-startbtn {
  border: none; background: var(--ba-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.ba-daily-won {
  text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem;
}
.ba-daily-won strong { color: var(--ba-accent); font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) { .ba-win, .ba-overlay { transition: none; } }
`;
