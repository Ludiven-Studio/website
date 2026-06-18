import { useState, useEffect, useRef, useCallback } from 'react';
import { DIFFS, generateColocross, type ColocrossPuzzle } from './engine';
import { trackGame } from '../../lib/analytics';

/* =====================================================
   COLOCROSS — React island. A fully-coloured deduction grid.
   Every cell is one of K colours. The clue shows, for the
   ACTIVE colour only, the ordered lengths of its blocks; the
   interleaving with the other (hidden) colours is deduced.
   Engine is pure/tested; every puzzle is logically solvable.
   ===================================================== */

type Status = 'playing' | 'won';

const COLORS = ['#e15554', '#4d9de0', '#e0a32e', '#3bb273']; // 1..4

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const emptyGrid = (n: number): number[][] => Array.from({ length: n }, () => new Array(n).fill(0));

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

export default function ColocrossGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<ColocrossPuzzle>(() => generateColocross(DIFFS.facile));
	const [grid, setGrid] = useState<number[][]>(() => emptyGrid(DIFFS.facile.size));
	const [activeColor, setActiveColor] = useState(1);
	const [eraseMode, setEraseMode] = useState(false);
	const [status, setStatus] = useState<Status>('playing');
	const [started, setStarted] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [hinted, setHinted] = useState<Set<string>>(() => new Set());
	const [elapsed, setElapsed] = useState(0);
	const startRef = useRef<number>(0);
	const painting = useRef(false);
	const strokeVal = useRef<number>(0);

	const { size, colors, rowClues, colClues, solution } = puzzle;
	const over = status === 'won' || revealed;

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		const d = DIFFS[key];
		const p = generateColocross(d);
		setDiffKey(key);
		setPuzzle(p);
		setGrid(emptyGrid(d.size));
		setActiveColor(1);
		setEraseMode(false);
		setStatus('playing');
		setStarted(false);
		setRevealed(false);
		setHinted(new Set());
		setElapsed(0);
	}, []);

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
		if (!started) {
			startRef.current = Date.now();
			setStarted(true);
			trackGame(gameId, 'game_started');
		}
	}, [started, gameId]);

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
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (grid[r][c] !== solution[r][c]) return;
		setStatus('won');
		trackGame(gameId, 'game_won');
	}, [grid, status, revealed, size, solution, gameId]);

	const applyStroke = useCallback(
		(r: number, c: number) => {
			// Locked: a cell drawn with another colour can't be changed from here.
			if (grid[r][c] !== 0 && grid[r][c] !== activeColor) return;
			const v = strokeVal.current;
			setGrid((prev) => {
				if (prev[r][c] === v) return prev;
				const n = prev.map((row) => [...row]);
				n[r][c] = v;
				return n;
			});
			removeHint(r, c);
			begin();
		},
		[grid, activeColor, begin, removeHint],
	);

	const cellFromEvent = (e: React.PointerEvent): [number, number] | null => {
		const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
		const cell = el?.closest?.('.co-cell') as HTMLElement | null;
		if (!cell) return null;
		const r = Number(cell.dataset.r);
		const c = Number(cell.dataset.c);
		if (Number.isNaN(r) || Number.isNaN(c)) return null;
		return [r, c];
	};

	const onPointerDown = (e: React.PointerEvent) => {
		if (over) return;
		const cell = cellFromEvent(e);
		if (!cell) return;
		const [r, c] = cell;
		painting.current = true;
		strokeVal.current = eraseMode ? 0 : grid[r][c] === activeColor ? 0 : activeColor; // re-tap erases
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

	/* Hint: fix a wrong cell first, else fill an unpainted cell. */
	const hint = useCallback(() => {
		if (over) return;
		let target: [number, number] | null = null;
		for (let r = 0; r < size && !target; r++)
			for (let c = 0; c < size && !target; c++)
				if (grid[r][c] !== 0 && grid[r][c] !== solution[r][c]) target = [r, c];
		for (let r = 0; r < size && !target; r++)
			for (let c = 0; c < size && !target; c++) if (grid[r][c] === 0) target = [r, c];
		if (!target) return;
		const [r, c] = target;
		setGrid((prev) => {
			const n = prev.map((row) => [...row]);
			n[r][c] = solution[r][c];
			return n;
		});
		setHinted((prev) => new Set(prev).add(`${r},${c}`));
		begin();
		trackGame(gameId, 'hint_used');
	}, [over, size, grid, solution, begin, gameId]);

	/* Reveal the full picture (does not count as a win). */
	const reveal = useCallback(() => {
		if (over) return;
		setGrid(solution.map((row) => [...row]));
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [over, solution, gameId]);

	return (
		<div className="co-root">
			<style>{CSS}</style>

			<div className="co-bar">
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
				<div className="co-bar-right">
					<div className="co-timer">{fmtTime(elapsed)}</div>
					<button className="co-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">
						↻
					</button>
				</div>
			</div>

			{!over && (
				<div className="co-tools" role="toolbar" aria-label="Couleurs">
					{Array.from({ length: colors }, (_, i) => i + 1).map((v) => (
						<button
							key={v}
							className={`co-tool color ${activeColor === v && !eraseMode ? 'active' : ''}`}
							style={{ background: COLORS[v - 1] }}
							onClick={() => { setActiveColor(v); setEraseMode(false); }}
							aria-pressed={activeColor === v && !eraseMode}
							aria-label={`Couleur ${v}`}
						/>
					))}
					<button
						className={`co-tool eraser ${eraseMode ? 'active' : ''}`}
						onClick={() => setEraseMode(true)}
						aria-pressed={eraseMode}
						aria-label="Gomme"
						title="Gomme"
					>
						⌫
					</button>
				</div>
			)}

			{!over && (
				<div className="co-actions">
					<button className="co-act" onClick={hint}>💡 Indice</button>
					{elapsed >= 60 && (
						<button className="co-act" onClick={reveal}>👁 Voir la solution</button>
					)}
				</div>
			)}

			<div className="co-boardwrap">
				<div
					className="co-board"
					style={{
						gridTemplateColumns: `auto repeat(${size}, var(--co-cell))`,
						gridTemplateRows: `auto repeat(${size}, var(--co-cell))`,
						['--n' as string]: size,
					}}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={endStroke}
					onPointerCancel={endStroke}
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
							hinted={hinted}
							over={over}
						/>
					))}
				</div>

				{status === 'won' && (
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
			</div>

			{revealed ? (
				<div className="co-revealed-note">
					<span>Solution affichée</span>
					<button className="co-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
				</div>
			) : (
				<p className="co-help">
					Toutes les cases sont coloriées. Choisis une couleur : tu ne vois que SES blocs (dans
					l'ordre). Comme les blocs des autres couleurs sont cachés, déduis où commencent les
					tiens grâce aux lignes et colonnes.
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
	hinted: Set<string>;
	over: boolean;
}

function RowClueAndCells({ r, size, rowClueLens, activeColor, clueStatus, grid, hinted, over }: RowProps) {
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
				return (
					<div
						key={c}
						className={`co-cell ${v !== 0 ? 'filled' : ''} ${hinted.has(`${r},${c}`) ? 'hinted' : ''} ${over ? 'over' : ''}`}
						data-r={r}
						data-c={c}
						style={v !== 0 ? { background: COLORS[v - 1] } : undefined}
						aria-label={`Ligne ${r + 1}, colonne ${c + 1}`}
					/>
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
  --co-line: var(--gray-700);
  --co-cell: min(46px, calc((100vw - 3.5rem - 2.5rem) / var(--n, 5)));

  width: 100%;
  max-width: 480px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
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
  display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 0.85rem;
}
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

.co-boardwrap { position: relative; }
.co-board {
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
}
.co-cell.filled { border-color: rgba(0,0,0,0.18); }
.co-cell.hinted { box-shadow: inset 0 0 0 3px var(--co-ok); }
.co-cell.over { cursor: default; }

.co-help {
  max-width: 430px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin-top: 1.1rem;
}
.co-revealed-note {
  display: flex; align-items: center; gap: 14px; margin-top: 1.25rem; color: var(--gray-300); font-size: 14px; font-weight: 500;
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

@media (prefers-reduced-motion: reduce) { .co-tool, .co-win { transition: none; } }
`;
