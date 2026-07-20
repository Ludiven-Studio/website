import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fmtCentis } from '../../lib/scoreFormat';
import { DIFFS, generateAquarium, findHint, type AquariumPuzzle } from './engine';
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
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';
import { useLevels } from '../../lib/useLevels';
import { touchDrag } from '../touchDrag';
import { aquariumLevels } from './levels';

/* =====================================================
   AQUARIUM — React island. The grid is partitioned into
   coloured regions (aquariums). Water settles by gravity.
   Mark each cell water / air to match the hidden solution;
   row & column clues give the water count. Engine is pure/tested.
   ===================================================== */

type Status = 'playing' | 'won';
type Mark = 0 | 1 | 2; // 0 empty, 1 water, 2 air

// Soft region palette indexed by region id.
const PALETTE = ['#3a5a7d', '#4d7c6f', '#7d5a8c', '#8c6d3a', '#7d3a4d', '#3a7d8c', '#5d6b8c'];

// Daily challenge: difficulty comes from the server (same for everyone).
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

const fmtTime = fmtCentis;

const emptyGrid = (n: number): Mark[][] =>
	Array.from({ length: n }, () => new Array(n).fill(0) as Mark[]);

export default function AquariumGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<AquariumPuzzle>(() => generateAquarium(DIFFS.facile));
	const [grid, setGrid] = useState<Mark[][]>(() => emptyGrid(DIFFS.facile.size));
	const [status, setStatus] = useState<Status>('playing');
	const [started, setStarted] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [hinted, setHinted] = useState<Set<string>>(() => new Set());
	const [hintNote, setHintNote] = useState(''); // explanation of the last hint
	const [elapsed, setElapsed] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false); // daily already completed today
	const startRef = useRef<number>(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const painting = useRef(false);
	const strokeVal = useRef<Mark>(0);
	const lv = useLevels(gameId, aquariumLevels);

	const { size, regionOf, solution, rowCounts, colCounts } = puzzle;
	const over = status === 'won' || revealed;

	/* Levels mode: start a level from its config; grade on solve. */
	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		const p = generateAquarium(cfg.diff, mulberry32(cfg.seed));
		setDaily(false);
		setPuzzle(p);
		setGrid(emptyGrid(cfg.diff.size));
		setStatus('playing');
		setRevealed(false);
		setHinted(new Set());
		setHintNote('');
		setStarted(true);
		startRef.current = Date.now();
		setElapsed(0);
	}, [lv]);

	const armLevels = useCallback(() => {
		setDaily(false);
		lv.enter();
	}, [lv]);

	// Grade the level once it is solved (win → time).
	useEffect(() => {
		if (!lv.playing) return;
		if (status === 'won') lv.finish({ won: true, score: Math.round((Date.now() - startRef.current) / 10), raw: { size } });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv.playing, status]);

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		const d = DIFFS[key];
		const p = generateAquarium(d);
		setDaily(false);
		setAlreadyPlayed(false);
		setDiffKey(key);
		setPuzzle(p);
		setGrid(emptyGrid(d.size));
		setStatus('playing');
		setStarted(false);
		setRevealed(false);
		setHinted(new Set());
		setHintNote('');
		setElapsed(0);
	}, []);

	/* Daily challenge: one attempt per device, resumable. Server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setRevealed(false);
		setHinted(new Set());
		setHintNote('');

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			// Resume or lock the existing attempt — regenerate from the stored seed (no fetch).
			const di = run.diffIndex ?? 0;
			const dk = DIFF_ORDER[di] ?? 'facile';
			dailySeedRef.current = { seed: run.seed, diffIndex: di };
			setDailyLoading(false);
			setDiffKey(dk);
			const d = DIFFS[dk];
			setPuzzle(generateAquarium(d, mulberry32(run.seed)));
			setGrid((run.state as Mark[][]) ?? emptyGrid(d.size));
			setStarted(true);
			if (run.done) {
				setAlreadyPlayed(true);
				setStatus('won');
				setElapsed(run.finalTime ?? 0);
			} else {
				setAlreadyPlayed(false);
				setStatus('playing');
				startRef.current = run.startedAt;
				setElapsed(Math.round((Date.now() - run.startedAt) / 10));
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
		setPuzzle(generateAquarium(d, mulberry32(seed)));
		setGrid(emptyGrid(d.size));
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
			state: emptyGrid(size),
		});
	}, [gameId, size]);

	/* Clear my entries without resetting the attempt (chrono keeps running). */
	const resetDailyEntries = useCallback(() => {
		setGrid(emptyGrid(size));
		setHinted(new Set());
		setHintNote('');
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: emptyGrid(size),
		});
	}, [gameId, size]);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing' || !started || revealed) return;
		const id = setInterval(
			() => setElapsed(Math.round((Date.now() - startRef.current) / 10)),
			50,
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

	/* Win: every cell where the solution holds water is marked water, others not. */
	useEffect(() => {
		if (status === 'won' || revealed) return;
		if (daily && !started) return; // skip win-check on a daily not yet started
		if (lv.active && !lv.playing) return; // levels grid open, not playing
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if ((grid[r][c] === 1) !== solution[r][c]) return;
		setStatus('won');
		trackGame(gameId, 'game_won');
	}, [grid, status, revealed, size, solution, gameId, daily, started]);

	/* Per row/col water tallies (for clue feedback). */
	const rowWater = useMemo(
		() => grid.map((row) => row.reduce((s: number, m) => s + (m === 1 ? 1 : 0), 0)),
		[grid],
	);
	const colWater = useMemo(() => {
		const out = new Array(size).fill(0);
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (grid[r][c] === 1) out[c]++;
		return out;
	}, [grid, size]);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || status === 'won') return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: grid,
		});
	}, [daily, started, status, grid, gameId]);

	/* Lock the daily attempt on a fresh win. */
	useEffect(() => {
		if (!daily || status !== 'won' || alreadyPlayed) return;
		const sd = dailySeedRef.current;
		const finalTime = Math.round((Date.now() - startRef.current) / 10);
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

	const applyStroke = useCallback(
		(r: number, c: number) => {
			const v = strokeVal.current;
			setGrid((prev) => {
				if (prev[r][c] === v) return prev;
				const n = prev.map((row) => [...row]) as Mark[][];
				n[r][c] = v;
				return n;
			});
			removeHint(r, c);
			begin();
		},
		[begin, removeHint],
	);

	const cellFromXY = (clientX: number, clientY: number): [number, number] | null => {
		const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
		const cell = el?.closest?.('.aq-cell') as HTMLElement | null;
		if (!cell) return null;
		const r = Number(cell.dataset.r);
		const c = Number(cell.dataset.c);
		if (Number.isNaN(r) || Number.isNaN(c)) return null;
		return [r, c];
	};

	// Coordinate-based paint. Mouse/pen go through Pointer Events; iOS touch is driven
	// by native touch events (touchDrag) because pointermove is unreliable after capture.
	const startPaint = (clientX: number, clientY: number) => {
		if (over || (daily && !started)) return;
		const cell = cellFromXY(clientX, clientY);
		if (!cell) return;
		const [r, c] = cell;
		painting.current = true;
		// Cycle the tapped cell empty → water → air → empty; drag paints that value.
		strokeVal.current = ((grid[r][c] + 1) % 3) as Mark;
		applyStroke(r, c);
	};
	const movePaint = (clientX: number, clientY: number) => {
		if (!painting.current) return;
		const cell = cellFromXY(clientX, clientY);
		if (cell) applyStroke(cell[0], cell[1]);
	};
	const endStroke = () => {
		painting.current = false;
	};

	const onPointerDown = (e: React.PointerEvent) => {
		if (e.pointerType === 'touch') return;
		startPaint(e.clientX, e.clientY);
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
	};
	const onPointerMove = (e: React.PointerEvent) => {
		if (e.pointerType === 'touch') return;
		movePaint(e.clientX, e.clientY);
	};

	/* Hint (free): deduce the next logical cell and explain the technique. Marks GREEN. */
	const hint = useCallback(() => {
		if (over) return;
		const h = findHint(grid, puzzle);
		if (!h) return;
		const v: Mark = h.value === 'water' ? 1 : 2;
		setGrid((prev) => {
			const n = prev.map((row) => [...row]) as Mark[][];
			n[h.r][h.c] = v;
			return n;
		});
		setHinted((prev) => new Set(prev).add(`${h.r},${h.c}`));
		setHintNote(h.reason);
		begin();
		trackGame(gameId, 'hint_used');
	}, [over, grid, puzzle, begin, gameId]);

	/* Reveal the full solution (does not count as a win). */
	const reveal = useCallback(() => {
		if (over) return;
		setGrid(solution.map((row) => row.map((w) => (w ? 1 : 2)) as Mark[]));
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [over, solution, gameId]);

	// Region border helper: thick edge where the neighbour belongs to another region.
	const diffRegion = (r: number, c: number, nr: number, nc: number) =>
		nr < 0 || nr >= size || nc < 0 || nc >= size || regionOf[r][c] !== regionOf[nr][nc];

	return (
		<div className="aq-root" style={{ ['--n' as string]: size }}>
			<style>{CSS}</style>

			<ModeToggle
				daily={daily}
				onFree={() => { if (lv.active) { lv.exit(); newGame(diffKey); } else if (daily) newGame(diffKey); }}
				onDaily={() => { lv.exit(); startDaily(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

			{daily ? (
				<div className="aq-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			) : null}

			{lv.active && (
				<div className="aq-daily-tag">
					{lv.menu ? 'Progression — réussis un niveau pour débloquer le suivant' : `Niveau ${lv.level} · ${size}×${size}`}
				</div>
			)}

			{!(lv.active && lv.menu) && (
			<div className="aq-bar">
				{!daily && !lv.active && (
					<div className="aq-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={diffKey === k}
								className={`aq-pill ${diffKey === k ? 'active' : ''}`}
								onClick={() => newGame(k)}
							>
								{DIFFS[k].label}
							</button>
						))}
					</div>
				)}
				<div className="aq-bar-right">
					<div className="aq-timer">{fmtTime(elapsed)}</div>
					{!daily && !lv.active && (
						<button className="aq-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">
							↻ Nouvelle
						</button>
					)}
				</div>
			</div>
			)}

			{!over && !daily && !(lv.active && lv.menu) && (
				<div className="aq-actions">
					<button className="aq-act" onClick={hint}>💡 Indice</button>
					{!lv.active && elapsed >= 60 && (
						<button className="aq-act" onClick={reveal}>👁 Voir la solution</button>
					)}
				</div>
			)}

			{daily && started && status === 'playing' && (
				<div className="aq-actions">
					<button className="aq-act" onClick={resetDailyEntries}>↺ Vider mes saisies</button>
				</div>
			)}

			{!daily && hintNote && (
				<p className="aq-hint-note" aria-live="polite">💡 {hintNote}</p>
			)}

			{daily && status === 'won' && (
				<div className="aq-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Résolu en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			{lv.active && lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
			<div className="aq-boardwrap">
				{celebrating && <Celebration />}
				<div
					className={`aq-board ${daily && !started ? 'blurred' : ''}`}
					style={{
						gridTemplate: `auto repeat(${size}, 1fr) / auto repeat(${size}, 1fr)`,
					}}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={endStroke}
					onPointerCancel={endStroke}
					{...touchDrag(startPaint, movePaint, endStroke)}
				>
					<div className="aq-corner" />
					{/* Column clues (water count per column). */}
					{Array.from({ length: size }).map((_, c) => {
						const reached = colWater[c] === colCounts[c];
						const exceeded = colWater[c] > colCounts[c];
						return (
							<div
								key={`cc${c}`}
								className={`aq-clue col ${reached ? 'reached' : ''} ${exceeded ? 'exceeded' : ''}`}
							>
								{colCounts[c]}
							</div>
						);
					})}
					{Array.from({ length: size }).map((_, r) => (
						<RowAndCells
							key={`row${r}`}
							r={r}
							size={size}
							grid={grid}
							regionOf={regionOf}
							hinted={hinted}
							over={over}
							rowWater={rowWater[r]}
							rowCount={rowCounts[r]}
							diffRegion={diffRegion}
						/>
					))}
				</div>

				{daily && dailyLoading && (
					<div className="aq-overlay">
						<div className="aq-overlay-card"><p className="aq-windiff">Préparation…</p></div>
					</div>
				)}

				{daily && !dailyLoading && !started && status !== 'won' && (
					<div className="aq-overlay">
						<button className="aq-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div>
				)}

				{showWin && !daily && !lv.active && (
					<div className="aq-win" role="dialog" aria-label="Grille résolue">
						<div className="aq-wincard">
							<div className="aq-winmark">💧</div>
							<h2>Aquarium rempli !</h2>
							<p className="aq-wintime">{fmtTime(elapsed)}</p>
							<p className="aq-windiff">{DIFFS[diffKey].label} · {size}×{size}</p>
							<button className="aq-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
						</div>
					</div>
				)}

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={aquariumLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won ? `Résolu en ${fmtTime(elapsed)}` : undefined}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
			</div>
			)}

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={status === 'won' ? elapsed : undefined} />
			)}

			{!daily && !lv.active && <LeaderboardCorner game={gameId} metric="time" />}

			{revealed ? (
				<div className="aq-revealed-note">
					<span>Solution affichée</span>
					<button className="aq-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
				</div>
			) : (
				<p className="aq-help">
					La grille est découpée en aquariums colorés. L'eau se dépose par gravité : dans un
					aquarium elle est de niveau. Touche une case pour la faire passer de vide à
					<strong> 💧 eau</strong> puis à <strong>✕ air</strong>. Les nombres indiquent le total
					de cases d'eau par ligne et colonne.
				</p>
			)}
		</div>
	);
}

interface RowProps {
	r: number;
	size: number;
	grid: Mark[][];
	regionOf: number[][];
	hinted: Set<string>;
	over: boolean;
	rowWater: number;
	rowCount: number;
	diffRegion: (r: number, c: number, nr: number, nc: number) => boolean;
}

function RowAndCells({ r, size, grid, regionOf, hinted, over, rowWater, rowCount, diffRegion }: RowProps) {
	const reached = rowWater === rowCount;
	const exceeded = rowWater > rowCount;
	const thin = '1px solid rgba(255,255,255,0.10)';
	const thick = '3px solid var(--gray-0)';
	return (
		<>
			<div className={`aq-clue row ${reached ? 'reached' : ''} ${exceeded ? 'exceeded' : ''}`}>
				{rowCount}
			</div>
			{Array.from({ length: size }).map((_, c) => {
				const m = grid[r][c];
				const base = PALETTE[regionOf[r][c] % PALETTE.length];
				return (
					<div
						key={c}
						className={`aq-cell ${m === 1 ? 'water' : ''} ${m === 2 ? 'air' : ''} ${
							hinted.has(`${r},${c}`) ? 'hinted' : ''
						} ${over ? 'over' : ''}`}
						data-r={r}
						data-c={c}
						style={{
							background: base,
							borderTop: diffRegion(r, c, r - 1, c) ? thick : thin,
							borderLeft: diffRegion(r, c, r, c - 1) ? thick : thin,
							borderRight: diffRegion(r, c, r, c + 1) ? thick : thin,
							borderBottom: diffRegion(r, c, r + 1, c) ? thick : thin,
						}}
						aria-label={`Ligne ${r + 1}, colonne ${c + 1}`}
					>
						{m === 1 && <span className="aq-drop">💧</span>}
						{m === 2 && <span className="aq-x">✕</span>}
					</div>
				);
			})}
		</>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.aq-root {
  --aq-accent: var(--accent-regular);
  --aq-ok: #2f9e6f;
  --aq-bad: #d9534f;

  width: 100%;
  max-width: 480px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.aq-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.75rem;
}

.aq-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 1rem;
}
.aq-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.aq-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.aq-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.aq-pill.active { background: var(--aq-accent); color: var(--accent-text-over); border-color: var(--aq-accent); }
.aq-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.aq-new {
  border: none; background: var(--aq-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 14px; border-radius: 999px; padding: 8px 16px; cursor: pointer;
}

.aq-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 0.85rem; }
.aq-act {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.aq-act:hover { background: var(--gray-800); border-color: var(--aq-accent); color: var(--aq-accent); }

.aq-hint-note {
  max-width: 420px;
  margin: 0 auto 0.85rem;
  text-align: center;
  font-size: 13px;
  line-height: 1.5;
  color: var(--aq-ok);
  background: var(--accent-overlay);
  border: 1px solid var(--aq-ok);
  border-radius: 12px;
  padding: 8px 14px;
}

.aq-boardwrap {
  position: relative;
  width: 100%;
  max-width: min(460px, calc(48px * (var(--n, 6) + 1)));
  margin-inline: auto;
  container-type: inline-size;
}
.aq-board {
  width: 100%;
  display: grid;
  touch-action: none;
  user-select: none;
  background: var(--gray-999);
  border-radius: 6px;
}
.aq-corner { }
.aq-clue {
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: calc(52cqw / (var(--n, 6) + 1) * 0.42);
  font-variant-numeric: tabular-nums;
  color: var(--gray-200);
}
.aq-clue.col { min-height: calc(100cqw / (var(--n, 6) + 1) * 0.7); }
.aq-clue.row { min-width: calc(100cqw / (var(--n, 6) + 1) * 0.7); }
.aq-clue.reached { color: var(--gray-500); opacity: 0.55; }
.aq-clue.exceeded { color: var(--aq-bad); }

.aq-cell {
  position: relative;
  aspect-ratio: 1 / 1;
  box-sizing: border-box;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: calc(60cqw / (var(--n, 6) + 1));
  line-height: 1;
}
.aq-cell.water { box-shadow: inset 0 0 0 100px rgba(64, 156, 255, 0.42); }
.aq-cell.over { cursor: default; }
.aq-cell.hinted::after {
  content: ''; position: absolute; inset: 3px; border-radius: 4px;
  box-shadow: inset 0 0 0 3px var(--aq-ok); pointer-events: none;
}
.aq-drop { filter: drop-shadow(0 1px 1px rgba(0,0,0,0.4)); }
.aq-x { color: rgba(255,255,255,0.55); font-weight: 800; font-size: calc(46cqw / (var(--n, 6) + 1)); }

.aq-help {
  max-width: 430px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin-top: 1.1rem;
}
.aq-revealed-note {
  display: flex; align-items: center; gap: 14px; margin-top: 1.25rem; color: var(--gray-300); font-size: 14px; font-weight: 500;
}

.aq-win {
  position: absolute; inset: -8px; display: flex; align-items: center; justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px;
}
.aq-wincard {
  background: var(--gray-999); border: 2px solid var(--aq-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg);
}
.aq-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 22px; color: var(--gray-0); }
.aq-winmark { font-size: 30px; }
.aq-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--aq-accent); }
.aq-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.aq-replay {
  border: none; background: var(--aq-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer;
}

.aq-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.aq-overlay {
  position: absolute; inset: -8px; z-index: 2;
  display: flex; align-items: center; justify-content: center;
}
.aq-overlay-card {
  background: var(--gray-999); border: 2px solid var(--aq-accent);
  border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg);
}
.aq-startbtn {
  border: none; background: var(--aq-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.aq-daily-won {
  text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem;
}
.aq-daily-won strong { color: var(--aq-accent); font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) { .aq-win, .aq-overlay { transition: none; } }
`;
