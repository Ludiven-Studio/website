import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DIFFS, generateReines, type ReinesPuzzle } from './engine';

/* =====================================================
   REINES (LinkedIn "Queens") — React island.
   One queen per row, column and colour region; no two
   queens adjacent. Engine lives in ./engine (pure, tested).
   ===================================================== */

type Status = 'playing' | 'won';
type CellState = 0 | 1 | 2; // empty | mark | queen

const emptyMarks = (n: number): CellState[][] =>
	Array.from({ length: n }, () => new Array(n).fill(0) as CellState[]);

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const regionColor = (id: number, n: number) => `hsla(${Math.round((id * 360) / n)}, 65%, 52%, 0.28)`;

const adjacent = (r1: number, c1: number, r2: number, c2: number) =>
	Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;

export default function ReinesGame() {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<ReinesPuzzle>(() => generateReines(DIFFS.facile));
	const [marks, setMarks] = useState<CellState[][]>(() => emptyMarks(DIFFS.facile.size));
	const [status, setStatus] = useState<Status>('playing');
	const [started, setStarted] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const startRef = useRef<number>(0);

	const { size, regions } = puzzle;

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		const d = DIFFS[key];
		setDiffKey(key);
		setPuzzle(generateReines(d));
		setMarks(emptyMarks(d.size));
		setStatus('playing');
		setStarted(false);
		setElapsed(0);
	}, []);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing' || !started) return;
		const id = setInterval(
			() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
			250,
		);
		return () => clearInterval(id);
	}, [status, started]);

	const queens = useMemo(() => {
		const out: [number, number][] = [];
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (marks[r][c] === 2) out.push([r, c]);
		return out;
	}, [marks, size]);

	/* Conflicting queens (same row / col / region / adjacent). */
	const conflicts = useMemo(() => {
		const set = new Set<string>();
		for (let i = 0; i < queens.length; i++) {
			for (let j = i + 1; j < queens.length; j++) {
				const [r1, c1] = queens[i];
				const [r2, c2] = queens[j];
				if (
					r1 === r2 ||
					c1 === c2 ||
					regions[r1][c1] === regions[r2][c2] ||
					adjacent(r1, c1, r2, c2)
				) {
					set.add(`${r1},${c1}`);
					set.add(`${r2},${c2}`);
				}
			}
		}
		return set;
	}, [queens, regions]);

	/* Win: n queens, no conflicts. */
	useEffect(() => {
		if (status === 'won') return;
		if (queens.length === size && conflicts.size === 0) setStatus('won');
	}, [queens, conflicts, size, status]);

	const cycle = useCallback(
		(r: number, c: number) => {
			if (status === 'won') return;
			setMarks((prev) => {
				const next = prev.map((row) => [...row]) as CellState[][];
				next[r][c] = (((next[r][c] + 1) % 3) as CellState);
				return next;
			});
			if (!started) {
				startRef.current = Date.now();
				setStarted(true);
			}
		},
		[status, started],
	);

	const thin = '1px solid var(--rn-line)';
	const thick = '2.5px solid var(--rn-line-strong)';

	return (
		<div className="rn-root">
			<style>{CSS}</style>

			<div className="rn-bar">
				<div className="rn-pills" role="tablist" aria-label="Difficulté">
					{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
						<button
							key={k}
							role="tab"
							aria-selected={diffKey === k}
							className={`rn-pill ${diffKey === k ? 'active' : ''}`}
							onClick={() => newGame(k)}
						>
							{DIFFS[k].label}
						</button>
					))}
				</div>
				<div className="rn-bar-right">
					<div className="rn-timer">{fmtTime(elapsed)}</div>
					<button className="rn-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">
						↻
					</button>
				</div>
			</div>

			<div className="rn-boardwrap">
				<div
					className="rn-board"
					style={{ gridTemplateColumns: `repeat(${size}, var(--rn-cell))`, ['--n' as string]: size }}
				>
					{Array.from({ length: size }).map((_, r) =>
						Array.from({ length: size }).map((_, c) => {
							const st = marks[r][c];
							const bad = st === 2 && conflicts.has(`${r},${c}`);
							return (
								<button
									key={`${r}-${c}`}
									className={['rn-cell', bad ? 'bad' : '', status === 'won' ? 'wondone' : ''].join(' ')}
									style={{
										backgroundColor: regionColor(regions[r][c], size),
										borderRight:
											c === size - 1 ? 'none' : regions[r][c] !== regions[r][c + 1] ? thick : thin,
										borderBottom:
											r === size - 1 ? 'none' : regions[r][c] !== regions[r + 1][c] ? thick : thin,
									}}
									onClick={() => cycle(r, c)}
									aria-label={`Ligne ${r + 1}, colonne ${c + 1}${
										st === 2 ? ', reine' : st === 1 ? ', marquée' : ', vide'
									}`}
									disabled={status === 'won'}
								>
									{st === 2 ? '♛' : st === 1 ? '·' : ''}
								</button>
							);
						}),
					)}
				</div>

				{status === 'won' && (
					<div className="rn-win" role="dialog" aria-label="Grille résolue">
						<div className="rn-wincard">
							<div className="rn-winmark">👑</div>
							<h2>Couronné !</h2>
							<p className="rn-wintime">{fmtTime(elapsed)}</p>
							<p className="rn-windiff">{DIFFS[diffKey].label} · {size}×{size}</p>
							<button className="rn-replay" onClick={() => newGame(diffKey)}>
								Rejouer
							</button>
						</div>
					</div>
				)}
			</div>

			<p className="rn-help">
				Touche une case pour cycler : vide → point → reine ♛. Place exactement une reine par
				ligne, colonne et couleur, sans que deux reines se touchent (même en diagonale).
			</p>
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.rn-root {
  --rn-accent: var(--accent-regular);
  --rn-ok: #2f9e6f;
  --rn-bad: #d9534f;
  --rn-line: var(--gray-700);
  --rn-line-strong: var(--gray-100);
  --rn-cell: clamp(34px, calc(min(440px, 88vw) / var(--n, 6)), 56px);

  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.rn-bar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.rn-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.rn-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.rn-pill {
  border: 1.5px solid var(--gray-700);
  background: transparent;
  color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px;
  border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.rn-pill.active { background: var(--rn-accent); color: var(--accent-text-over); border-color: var(--rn-accent); }
.rn-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0);
  border-radius: 999px; padding: 6px 14px;
}
.rn-new {
  border: none; background: var(--rn-accent); color: var(--accent-text-over);
  font-size: 18px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1;
}

.rn-boardwrap { position: relative; }
.rn-board {
  display: grid;
  border: 2.5px solid var(--rn-line-strong);
  border-radius: 8px;
  overflow: hidden;
  background: var(--gray-999);
}
.rn-cell {
  width: var(--rn-cell); height: var(--rn-cell);
  box-sizing: border-box; border: none;
  font: inherit; font-weight: 700;
  font-size: calc(var(--rn-cell) * 0.55);
  line-height: 1;
  color: var(--gray-0);
  cursor: pointer; padding: 0;
  display: flex; align-items: center; justify-content: center;
  transition: filter 0.08s ease;
}
.rn-cell:active { filter: brightness(0.92); }
.rn-cell.bad { color: #fff; background-color: var(--rn-bad) !important; }
.rn-cell.wondone { color: var(--rn-ok); }

.rn-help {
  max-width: 420px; text-align: center; color: var(--gray-300);
  font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem;
}

.rn-win {
  position: absolute; inset: -8px;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04));
  backdrop-filter: blur(3px); border-radius: 16px;
  animation: rn-fade 0.25s ease;
}
.rn-wincard {
  background: var(--gray-999); border: 2px solid var(--rn-accent);
  border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg);
}
.rn-wincard h2 {
  font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 24px; color: var(--gray-0);
}
.rn-winmark { font-size: 30px; }
.rn-wintime {
  font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--rn-accent);
}
.rn-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.rn-replay {
  border: none; background: var(--rn-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer;
}

@keyframes rn-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .rn-cell, .rn-win { transition: none; animation: none; } }
`;
