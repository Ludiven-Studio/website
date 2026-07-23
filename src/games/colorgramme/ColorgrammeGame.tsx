import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fmtCentis } from '../../lib/scoreFormat';
import { DIFFS, generateColorgramme, findHint, type ColorgrammePuzzle } from './engine';
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
import { colorgrammeLevels } from './levels';
import { usePointerDrag } from '../usePointerDrag';

/* =====================================================
   COLORGRAMME — React island. A fully-coloured deduction grid.
   Every cell is one of K colours. The clue shows, for the
   ACTIVE colour only, the ordered lengths of its blocks; the
   interleaving with the other (hidden) colours is deduced.
   Engine is pure/tested; every puzzle is logically solvable.
   ===================================================== */

type Status = 'playing' | 'won';

const COLORS = ['#e15554', '#4d9de0', '#e0a32e', '#3bb273']; // 1..4

// Daily challenge: difficulty comes from the server (same for everyone).
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

const fmtTime = fmtCentis;

const emptyGrid = (n: number): number[][] => Array.from({ length: n }, () => new Array(n).fill(0));

/** Resume snapshot for the daily attempt. */
interface CoState {
	grid: number[][];
	crosses: number[][];
}
const emptyState = (n: number): CoState => ({ grid: emptyGrid(n), crosses: emptyGrid(n) });
// Fresh grid with the puzzle's given (locked) cells pre-filled.
const startGrid = (p: ColorgrammePuzzle): number[][] => {
	const g = emptyGrid(p.size);
	for (const [r, c] of p.given) g[r][c] = p.solution[r][c];
	return g;
};
const startState = (p: ColorgrammePuzzle): CoState => ({ grid: startGrid(p), crosses: emptyGrid(p.size) });
const givenKey = (r: number, c: number) => `${r},${c}`;

/** Status of one line for the active colour: 'done' (its cells exactly placed),
    'error' (too many cells of that colour) or 'none'. */
function lineStatus(cells: number[], solCells: number[], k: number): 'done' | 'error' | 'none' {
	let g = 0, s = 0, match = true;
	for (let i = 0; i < cells.length; i++) {
		const gk = cells[i] === k, sk = solCells[i] === k;
		if (gk) g++;
		if (sk) s++;
		if (gk !== sk) match = false;
	}
	if (g > s) return 'error';
	if (match) return 'done';
	return 'none';
}

export default function ColorgrammeGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<ColorgrammePuzzle>(() => generateColorgramme(DIFFS.facile));
	const [grid, setGrid] = useState<number[][]>(() => emptyGrid(DIFFS.facile.size));
	const [crosses, setCrosses] = useState<number[][]>(() => emptyGrid(DIFFS.facile.size)); // bitmask per cell: bit k = "not colour k"
	const [activeColor, setActiveColor] = useState(1);
	const [tool, setTool] = useState<'paint' | 'cross' | 'eraser'>('paint');
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
	const lv = useLevels(gameId, colorgrammeLevels);
	const painting = useRef(false);
	const strokeVal = useRef<number>(0);
	const strokeCross = useRef<boolean>(true); // cross mode: add (true) or remove (false)

	const { size, colors, rowClues, colClues, solution } = puzzle;
	const over = status === 'won' || revealed;
	const givenSet = useMemo(() => new Set(puzzle.given.map(([r, c]) => givenKey(r, c))), [puzzle]);

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		const d = DIFFS[key];
		const p = generateColorgramme(d);
		setDaily(false);
		setAlreadyPlayed(false);
		setDiffKey(key);
		setPuzzle(p);
		setGrid(startGrid(p));
		setCrosses(emptyGrid(d.size));
		setActiveColor(1);
		setTool('paint');
		setStatus('playing');
		setStarted(false);
		setRevealed(false);
		setHinted(new Set());
		setHintNote('');
		setElapsed(0);
	}, []);

	/* Levels mode: start a level from its config; grade on the win. */
	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		const p = generateColorgramme(cfg.diff, mulberry32(cfg.seed));
		setDaily(false);
		setPuzzle(p);
		setGrid(startGrid(p));
		setCrosses(emptyGrid(cfg.diff.size));
		setActiveColor(1);
		setTool('paint');
		setStatus('playing');
		setStarted(false); // ready-gate: blurred board + ▶ Commencer starts the chrono
		setRevealed(false);
		setHinted(new Set());
		setHintNote('');
		setElapsed(0);
	}, [lv]);

	const armLevels = useCallback(() => {
		setDaily(false);
		lv.enter();
	}, [lv]);

	// Levels is the default landing: resume at the next unlocked level (grid once all cleared).
	// A ?defi deep link opens the daily instead — skip auto-resume then.
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily') return;
		void lv.resume().then((next) => { if (next != null) startLevel(next); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Grade the level once the picture is fully reconstructed.
	useEffect(() => {
		if (!lv.playing) return;
		if (status === 'won') lv.finish({ won: true, score: Math.round((Date.now() - startRef.current) / 10), raw: { size, colors } });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv.playing, status]);

	/* Daily challenge: one attempt per device, resumable. Server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setRevealed(false);
		setHinted(new Set());
		setActiveColor(1);
		setTool('paint');

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			// Resume or lock the existing attempt — regenerate from the stored seed (no fetch).
			const di = run.diffIndex ?? 0;
			const dk = DIFF_ORDER[di] ?? 'facile';
			dailySeedRef.current = { seed: run.seed, diffIndex: di };
			setDailyLoading(false);
			setDiffKey(dk);
			const d = DIFFS[dk];
			const pz = generateColorgramme(d, mulberry32(run.seed));
			setPuzzle(pz);
			const st = (run.state as CoState | undefined) ?? startState(pz);
			setGrid(st.grid ?? startGrid(pz));
			setCrosses(st.crosses ?? emptyGrid(d.size));
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
		const pz = generateColorgramme(d, mulberry32(seed));
		setPuzzle(pz);
		setGrid(startGrid(pz));
		setCrosses(emptyGrid(d.size));
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
		if (daily) {
			const sd = dailySeedRef.current;
			saveDailyRun(gameId, {
				startedAt: now,
				done: false,
				seed: sd?.seed,
				diffIndex: sd?.diffIndex,
				state: startState(puzzle),
			});
		}
	}, [gameId, size, puzzle, daily]);

	/* Clear my entries without resetting the attempt (chrono keeps running). */
	const resetDailyEntries = useCallback(() => {
		setGrid(startGrid(puzzle));
		setCrosses(emptyGrid(size));
		setHinted(new Set());
		setHintNote('');
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: startState(puzzle),
		});
	}, [gameId, size, puzzle]);

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

	/* Win: the grid matches the hidden picture (every cell). */
	useEffect(() => {
		if (status === 'won' || revealed) return;
		if (daily && !started) return; // skip win-check on a daily not yet started
		if (lv.active && !lv.playing) return; // levels grid open, not playing
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (grid[r][c] !== solution[r][c]) return;
		setStatus('won');
		trackGame(gameId, 'game_won');
	}, [grid, status, revealed, size, solution, gameId, daily, started]);

	/* Auto-advance: once the active colour is fully & correctly placed, jump to the
	   next unfinished colour. Triggered by moves (depends on `grid`), not by manual
	   colour selection. */
	useEffect(() => {
		if (over) return;
		const finished = (k: number) => {
			for (let r = 0; r < size; r++)
				for (let c = 0; c < size; c++)
					if ((grid[r][c] === k) !== (solution[r][c] === k)) return false;
			return true;
		};
		if (!finished(activeColor)) return;
		for (let d = 1; d <= colors; d++) {
			const k = ((activeColor - 1 + d) % colors) + 1;
			if (!finished(k)) {
				setActiveColor(k);
				return;
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [grid]);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || status === 'won') return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { grid, crosses },
		});
	}, [daily, started, status, grid, crosses, gameId]);

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
			state: { grid, crosses },
		};
		saveDailyRun(gameId, snapshot);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	const applyStroke = useCallback(
		(r: number, c: number) => {
			if (givenSet.has(givenKey(r, c))) return; // pre-filled cells are locked
			if (tool === 'eraser') {
				setGrid((prev) => (prev[r][c] === 0 ? prev : prev.map((row, i) => (i === r ? row.map((x, j) => (j === c ? 0 : x)) : row))));
				setCrosses((prev) => (prev[r][c] === 0 ? prev : prev.map((row, i) => (i === r ? row.map((x, j) => (j === c ? 0 : x)) : row))));
				removeHint(r, c);
				begin();
				return;
			}
			if (tool === 'cross') {
				// Allowed on empty cells, or a cell painted with the active colour (replaced).
				if (grid[r][c] !== 0 && grid[r][c] !== activeColor) return; // locked: another colour
				if (grid[r][c] === activeColor) {
					setGrid((prev) => prev.map((row, i) => (i === r ? row.map((x, j) => (j === c ? 0 : x)) : row)));
					removeHint(r, c);
				}
				const bit = 1 << activeColor;
				setCrosses((prev) => {
					const cur = prev[r][c];
					const next = strokeCross.current ? cur | bit : cur & ~bit;
					if (next === cur) return prev;
					const n = prev.map((row) => [...row]);
					n[r][c] = next;
					return n;
				});
				begin();
				return;
			}
			// paint — locked against cells drawn with another colour.
			if (grid[r][c] !== 0 && grid[r][c] !== activeColor) return;
			const v = strokeVal.current;
			setGrid((prev) => {
				if (prev[r][c] === v) return prev;
				const n = prev.map((row) => [...row]);
				n[r][c] = v;
				return n;
			});
			if (v !== 0) setCrosses((prev) => (prev[r][c] === 0 ? prev : prev.map((row, i) => (i === r ? row.map((x, j) => (j === c ? 0 : x)) : row)))); // a decided cell loses its crosses
			removeHint(r, c);
			begin();
		},
		[tool, grid, activeColor, begin, removeHint, givenSet],
	);

	const cellFromXY = (clientX: number, clientY: number): [number, number] | null => {
		const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
		const cell = el?.closest?.('.co-cell') as HTMLElement | null;
		if (!cell) return null;
		const r = Number(cell.dataset.r);
		const c = Number(cell.dataset.c);
		if (Number.isNaN(r) || Number.isNaN(c)) return null;
		return [r, c];
	};

	/* Coordinate-driven stroke handlers, shared by Pointer (mouse/pen) and native touch. */
	const startStroke = (clientX: number, clientY: number) => {
		if (over || ((daily || lv.playing) && !started)) return;
		const cell = cellFromXY(clientX, clientY);
		if (!cell) return;
		const [r, c] = cell;
		painting.current = true;
		if (tool === 'paint') strokeVal.current = grid[r][c] === activeColor ? 0 : activeColor; // re-tap erases
		else if (tool === 'cross') strokeCross.current = !((crosses[r][c] >> activeColor) & 1);
		applyStroke(r, c);
	};
	const moveStroke = (clientX: number, clientY: number) => {
		if (!painting.current) return;
		const cell = cellFromXY(clientX, clientY);
		if (cell) applyStroke(cell[0], cell[1]);
	};
	const endStroke = () => {
		painting.current = false;
	};

	// Unified pointer drag drives mouse, pen AND touch (iOS-safe; see usePointerDrag).
	const { onPointerDown } = usePointerDrag(startStroke, moveStroke, endStroke);

	/* Hint: deduce the next logical cell and explain the technique. Paints the target
	   cell AND selects its colour, so the player can carry on in that colour. */
	const hint = useCallback(() => {
		if (over) return;
		const h = findHint(grid, puzzle);
		if (!h) return;
		const { r, c, value, reason } = h;
		setGrid((prev) => {
			const n = prev.map((row) => [...row]);
			n[r][c] = value;
			return n;
		});
		setCrosses((prev) => (prev[r][c] === 0 ? prev : prev.map((row, i) => (i === r ? row.map((x, j) => (j === c ? 0 : x)) : row))));
		setHinted((prev) => new Set(prev).add(`${r},${c}`));
		setActiveColor(value); // switch to the revealed cell's colour
		setTool('paint');
		setHintNote(reason);
		begin();
		trackGame(gameId, 'hint_used');
	}, [over, grid, puzzle, begin, gameId]);

	/* Reveal the full picture (does not count as a win). */
	const reveal = useCallback(() => {
		if (over) return;
		setGrid(solution.map((row) => [...row]));
		setCrosses(emptyGrid(size));
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [over, solution, size, gameId]);

	return (
		<div className="co-root" style={{ ['--n' as string]: size }}>
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
				<div className="co-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			) : null}

			{lv.active && (
				<div className="co-daily-tag">
					{lv.menu ? 'Progression — réussis un niveau pour débloquer le suivant' : `Niveau ${lv.level} · ${size}×${size} · ${colors} couleurs`}
				</div>
			)}

			{!(lv.active && lv.menu) && (
			<div className="co-bar">
				{!daily && !lv.active && (
					<div className="co-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={diffKey === k}
								className={`co-pill ${diffKey === k ? 'active' : ''}`}
								onClick={() => newGame(k)}
							>
								{DIFFS[k].label}
							</button>
						))}
					</div>
				)}
				<div className="co-bar-right">
					<div className="co-timer">{fmtTime(elapsed)}</div>
					{!daily && !lv.active && (
						<button className="co-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">
							↻
						</button>
					)}
				</div>
			</div>
			)}

			{!over && (!daily || started) && !(lv.active && lv.menu) && (
				<div className="co-tools" role="toolbar" aria-label="Outils">
					<div className="co-colors" role="group" aria-label="Couleurs">
						{Array.from({ length: colors }, (_, i) => i + 1).map((v) => (
							<button
								key={v}
								className={`co-tool color ${activeColor === v ? 'active' : ''}`}
								style={{ background: COLORS[v - 1] }}
								onClick={() => { setActiveColor(v); setTool((t) => (t === 'eraser' ? 'paint' : t)); }}
								aria-pressed={activeColor === v}
								aria-label={`Couleur ${v}`}
							/>
						))}
					</div>
					<div className="co-modes" role="group" aria-label="Action">
						<button
							className={`co-tool pencil ${tool === 'paint' ? 'active' : ''}`}
							onClick={() => setTool('paint')}
							aria-pressed={tool === 'paint'}
							aria-label="Crayon (dessiner)"
							title="Crayon : dessiner avec la couleur"
						>
							✏️
						</button>
						<button
							className={`co-tool cross ${tool === 'cross' ? 'active' : ''}`}
							style={{ color: COLORS[activeColor - 1] }}
							onClick={() => setTool('cross')}
							aria-pressed={tool === 'cross'}
							aria-label="Croix (marquer une couleur absente)"
							title="Croix : marquer « pas cette couleur »"
						>
							✕
						</button>
						<button
							className={`co-tool eraser ${tool === 'eraser' ? 'active' : ''}`}
							onClick={() => setTool('eraser')}
							aria-pressed={tool === 'eraser'}
							aria-label="Gomme"
							title="Gomme"
						>
							⌫
						</button>
					</div>
				</div>
			)}

			{!over && !daily && !(lv.active && lv.menu) && (
				<div className="co-actions">
					<button className="co-act" onClick={hint}>💡 Indice</button>
					{!lv.active && elapsed >= 60 && (
						<button className="co-act" onClick={reveal}>👁 Voir la solution</button>
					)}
				</div>
			)}

			{daily && started && status === 'playing' && (
				<div className="co-actions">
					<button className="co-act" onClick={resetDailyEntries}>↺ Vider mes saisies</button>
				</div>
			)}

			{daily && status === 'won' && (
				<div className="co-daily-won">
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
			<div className="co-boardwrap" style={{ ['--n' as string]: size }}>
				{celebrating && <Celebration />}
				<div
					className={`co-board ${(daily || lv.playing) && !started ? 'blurred' : ''}`}
					style={{
						gridTemplateColumns: `auto repeat(${size}, var(--co-cell))`,
						gridTemplateRows: `auto repeat(${size}, var(--co-cell))`,
					}}
					onPointerDown={onPointerDown}
				>
					<div className="co-corner" />
					{Array.from({ length: size }).map((_, c) => {
						const st = lineStatus(grid.map((row) => row[c]), solution.map((row) => row[c]), activeColor);
						return (
							<div key={`cc${c}`} className={`co-clue col ${st}`}>
								{colClues[c][activeColor - 1].map((len, i) => (
									<span
										key={i}
										className="co-num"
										style={{ color: st === 'error' ? '#d9534f' : COLORS[activeColor - 1] }}
									>
										{len}
									</span>
								))}
							</div>
						);
					})}
					{Array.from({ length: size }).map((_, r) => (
						<RowClueAndCells
							key={`row${r}`}
							r={r}
							size={size}
							rowClueLens={rowClues[r][activeColor - 1]}
							activeColor={activeColor}
							clueStatus={lineStatus(grid[r], solution[r], activeColor)}
							grid={grid}
							crosses={crosses}
							hinted={hinted}
							over={over}
							givenSet={givenSet}
						/>
					))}
				</div>

				{daily && dailyLoading && (
					<div className="co-overlay">
						<div className="co-overlay-card"><p className="co-windiff">Préparation…</p></div>
					</div>
				)}

				{((daily && !dailyLoading) || lv.playing) && !started && status !== 'won' && (
					<div className="co-overlay">
						<button className="co-startbtn" onClick={startTimer}>
							{lv.playing ? `▶ Niveau ${lv.level} — Commencer` : '▶ Commencer'}
						</button>
					</div>
				)}

				{showWin && !daily && !lv.active && (
					<div className="co-win" role="dialog" aria-label="Image résolue">
						<div className="co-wincard">
							<div className="co-winmark">🎨</div>
							<h2>Image révélée !</h2>
							<p className="co-wintime">{fmtTime(elapsed)}</p>
							<p className="co-windiff">{DIFFS[diffKey].label} · {size}×{size}</p>
							<button className="co-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
						</div>
					</div>
				)}

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={colorgrammeLevels.count}
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

			{!daily && hintNote && (
				<p className="co-hint-note" aria-live="polite">💡 {hintNote}</p>
			)}

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={status === 'won' ? elapsed : undefined} />
			)}

			{!daily && !lv.active && <LeaderboardCorner game={gameId} metric="time" />}

			{revealed ? (
				<div className="co-revealed-note">
					<span>Solution affichée</span>
					<button className="co-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
				</div>
			) : (
				<p className="co-help">
					Toutes les cases sont coloriées. Choisis une couleur : tu ne vois que SES blocs (dans
					l'ordre). Déduis où ils commencent grâce aux lignes et colonnes. Le mode <strong>✕</strong>
					marque « pas cette couleur ici » (une croix colorée par couleur exclue).
				</p>
			)}
		</div>
	);
}

interface RowProps {
	r: number;
	size: number;
	rowClueLens: number[];
	activeColor: number;
	clueStatus: 'done' | 'error' | 'none';
	grid: number[][];
	crosses: number[][];
	hinted: Set<string>;
	over: boolean;
	givenSet: Set<string>;
}

function RowClueAndCells({ r, size, rowClueLens, activeColor, clueStatus, grid, crosses, hinted, over, givenSet }: RowProps) {
	return (
		<>
			<div className={`co-clue row ${clueStatus}`}>
				{rowClueLens.map((len, i) => (
					<span
						key={i}
						className="co-num"
						style={{ color: clueStatus === 'error' ? '#d9534f' : COLORS[activeColor - 1] }}
					>
						{len}
					</span>
				))}
			</div>
			{Array.from({ length: size }).map((_, c) => {
				const v = grid[r][c];
				const mask = crosses[r][c];
				const isGiven = givenSet.has(`${r},${c}`);
				return (
					<div
						key={c}
						className={`co-cell ${v !== 0 ? 'filled' : ''} ${isGiven ? 'given' : ''} ${hinted.has(`${r},${c}`) ? 'hinted' : ''} ${over ? 'over' : ''}`}
						data-r={r}
						data-c={c}
						style={v !== 0 ? { background: COLORS[v - 1] } : undefined}
						aria-label={`Ligne ${r + 1}, colonne ${c + 1}${isGiven ? ' (donnée)' : ''}`}
					>
						{/* Crosses are per-colour notes: show only the active colour's. */}
						{v === 0 && ((mask >> activeColor) & 1) === 1 && (
							<div className="co-crosses">
								<span className="co-xmark" style={{ color: COLORS[activeColor - 1] }}>✕</span>
							</div>
						)}
					</div>
				);
			})}
		</>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.co-root {
  --co-accent: var(--accent-regular);
  --co-ok: #2f9e6f;
  --co-bad: #d9534f;
  --co-line: var(--gray-700);
  --co-cell: calc(100cqw / (var(--n, 5) + 1));

  width: 100%;
  max-width: 480px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.co-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.75rem;
}

.co-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 1rem;
}
.co-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.co-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.co-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.co-pill.active { background: var(--co-accent); color: var(--accent-text-over); border-color: var(--co-accent); }
.co-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.co-new {
  border: none; background: var(--co-accent); color: var(--accent-text-over);
  font-size: 18px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1;
}

.co-tools {
  display: flex; align-items: center; justify-content: center; flex-wrap: wrap;
  gap: 8px 1.25rem; margin-bottom: 0.85rem;
}
.co-colors, .co-modes { display: flex; gap: 8px; }
.co-modes { padding-left: 1.25rem; border-left: 1.5px solid var(--gray-800); }
@media (max-width: 26rem) { .co-modes { padding-left: 0; border-left: none; } }
.co-tool {
  width: 40px; height: 40px; border-radius: 12px; cursor: pointer;
  border: 2px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0);
  font: inherit; font-weight: 700; font-size: 18px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
  transition: transform 0.08s ease, border-color 0.08s ease;
}
.co-tool.active { border-color: var(--co-accent); transform: translateY(-2px); box-shadow: var(--shadow-sm); }

.co-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 0.85rem; }
.co-act {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.co-act:hover { background: var(--gray-800); border-color: var(--co-accent); color: var(--co-accent); }

.co-boardwrap {
  position: relative;
  width: 100%;
  max-width: calc(46px * (var(--n, 5) + 1));
  margin-inline: auto;
  container-type: inline-size;
}
.co-board {
  width: 100%;
  display: grid;
  touch-action: none;
  user-select: none;
  background: var(--gray-999);
  border-radius: 6px;
}
.co-corner { }
.co-clue {
  display: flex; gap: 4px;
  font-weight: 700; font-size: calc(var(--co-cell) * 0.44); font-variant-numeric: tabular-nums;
  padding: 2px;
}
.co-clue.col { flex-direction: column; align-items: center; justify-content: flex-end; min-height: calc(var(--co-cell) * 1.2); }
.co-clue.row { flex-direction: row; align-items: center; justify-content: flex-end; min-width: calc(var(--co-cell) * 1.2); }
.co-num { line-height: 1; }
.co-clue.done { opacity: 0.5; }
.co-clue.error .co-num { text-decoration: underline wavy; text-underline-offset: 2px; }

.co-cell {
  width: var(--co-cell); height: var(--co-cell);
  border: 1px solid var(--co-line);
  background: var(--gray-999);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.co-cell.filled { border-color: rgba(0,0,0,0.18); }
.co-cell.hinted { box-shadow: inset 0 0 0 3px var(--co-ok); }
/* Given (locked) cells: a small inset ring + no pointer, so they read as fixed. */
.co-cell.given { cursor: default; box-shadow: inset 0 0 0 2px rgba(255,255,255,0.85), inset 0 0 0 3px rgba(0,0,0,0.35); }
.co-cell.over { cursor: default; }
.co-crosses {
  pointer-events: none;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
  gap: 0 2px; width: 100%; height: 100%; line-height: 1;
}
.co-xmark { font-size: calc(var(--co-cell) * 0.34); font-weight: 800; line-height: 1; }

.co-help {
  max-width: 430px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin-top: 1.1rem;
}
.co-revealed-note {
  display: flex; align-items: center; gap: 14px; margin-top: 1.25rem; color: var(--gray-300); font-size: 14px; font-weight: 500;
}
.co-hint-note {
  max-width: 430px; margin: 1rem auto 0; text-align: center;
  font-size: 13px; line-height: 1.5; color: var(--co-ok);
  background: var(--accent-overlay); border: 1px solid var(--co-ok);
  border-radius: 12px; padding: 8px 14px;
}

.co-win {
  position: absolute; inset: -8px; display: flex; align-items: center; justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px;
}
.co-wincard {
  background: var(--gray-999); border: 2px solid var(--co-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg);
}
.co-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 22px; color: var(--gray-0); }
.co-winmark { font-size: 30px; }
.co-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--co-accent); }
.co-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.co-replay {
  border: none; background: var(--co-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer;
}

.co-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.co-overlay {
  position: absolute; inset: -8px; z-index: 2;
  display: flex; align-items: center; justify-content: center;
}
.co-overlay-card {
  background: var(--gray-999); border: 2px solid var(--co-accent);
  border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg);
}
.co-startbtn {
  border: none; background: var(--co-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.co-daily-won {
  text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem;
}
.co-daily-won strong { color: var(--co-accent); font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) { .co-tool, .co-win, .co-overlay { transition: none; } }
`;
