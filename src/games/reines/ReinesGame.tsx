import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { trackGame } from '../../lib/analytics';
import {
	DIFFS,
	generateReines,
	findConflicts,
	regionColor,
	type ReinesPuzzle,
	type ConflictReason,
} from './engine';

const REASON_LABEL: Record<ConflictReason, string> = {
	ligne: 'sur la même ligne',
	colonne: 'sur la même colonne',
	zone: 'dans la même zone',
	contact: 'qui se touchent',
};

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

export default function ReinesGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<ReinesPuzzle>(() => generateReines(DIFFS.facile));
	const [marks, setMarks] = useState<CellState[][]>(() => emptyMarks(DIFFS.facile.size));
	const [status, setStatus] = useState<Status>('playing');
	const [started, setStarted] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const startRef = useRef<number>(0);

	const { size, regions } = puzzle;

	// Backstop: marks always match the current puzzle (no possible desync).
	useEffect(() => {
		setMarks(emptyMarks(puzzle.size));
	}, [puzzle]);

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

	/* Conflicting queens (same row / col / region / adjacent) — pure & tested. */
	const conflictInfo = useMemo(() => findConflicts(regions, queens), [regions, queens]);
	const conflicts = conflictInfo.cells;
	const conflictMessage = useMemo(() => {
		if (conflictInfo.reasons.size === 0) return '';
		const parts = [...conflictInfo.reasons].map((r) => REASON_LABEL[r]);
		return `Conflit : des reines ${parts.join(' · ')}.`;
	}, [conflictInfo]);

	/* Ground-truth diagnostic: if a "zone" conflict ever fires, dump the real
	   region ids so a screenshot dispute can be settled from data, not pixels. */
	useEffect(() => {
		if (import.meta.env.DEV && conflictInfo.reasons.has('zone')) {
			// eslint-disable-next-line no-console
			console.warn('[Reines] conflit "zone" — regions des reines :', {
				size,
				queens: queens.map(([r, c]) => ({ r, c, region: regions[r]?.[c] })),
				conflictRegions: [...conflictInfo.regions],
				regions,
			});
		}
	}, [conflictInfo, queens, regions, size]);

	/* Win: n queens, no conflicts. */
	useEffect(() => {
		if (status === 'won') return;
		if (queens.length === size && conflicts.size === 0) {
			setStatus('won');
			trackGame(gameId, 'game_won');
		}
	}, [queens, conflicts, size, status, gameId]);

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
				trackGame(gameId, 'game_started');
			}
		},
		[status, started, gameId],
	);

	const thin = '1px solid var(--rn-line)';
	const thick = '3px solid var(--rn-line-strong)';

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
									data-region={regions[r][c]}
									className={[
										'rn-cell',
										bad ? 'bad' : '',
										conflictInfo.regions.has(regions[r][c]) ? 'creg' : '',
										status === 'won' ? 'wondone' : '',
									].join(' ')}
									style={{
										backgroundColor: regionColor(regions[r][c]),
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
									{st === 2 ? '♛' : st === 1 ? '✕' : ''}
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

			<p className="rn-msg" role="status" aria-live="polite">{conflictMessage}</p>

			<p className="rn-help">
				Touche une case pour cycler : vide → croix → reine ♛. Place exactement une reine par
				ligne, colonne et couleur, sans que deux reines se touchent (même en diagonale).
			</p>
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.rn-root {
  --rn-accent: var(--accent-regular);
  --rn-ok: #1f7a4d;
  --rn-bad: #d33a2c;
  --rn-ink: #23262e;            /* glyphs, readable on every pastel cell */
  --rn-line: rgba(35, 39, 48, 0.30);  /* visible cell grid, lighter than walls */
  --rn-line-strong: #2b2f3a;    /* region walls (theme-independent board) */
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
  border: 3px solid var(--rn-line-strong);
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.rn-cell {
  position: relative;
  width: var(--rn-cell); height: var(--rn-cell);
  box-sizing: border-box; border: none;
  font: inherit; font-weight: 700;
  font-size: calc(var(--rn-cell) * 0.55);
  line-height: 1;
  color: var(--rn-ink);
  cursor: pointer; padding: 0;
  display: flex; align-items: center; justify-content: center;
  transition: filter 0.08s ease;
}
.rn-cell:active { filter: brightness(0.93); }
/* Whole offending region washed red -> reads as one connected blob. */
.rn-cell.creg { background-image: linear-gradient(rgba(211, 58, 44, 0.34), rgba(211, 58, 44, 0.34)); }
.rn-cell.bad { color: var(--rn-bad); box-shadow: inset 0 0 0 3px var(--rn-bad); z-index: 1; }
.rn-cell.wondone { color: var(--rn-ok); }

.rn-msg {
  min-height: 1.2em; margin-top: 1rem; text-align: center;
  color: var(--rn-bad); font-weight: 600; font-size: 13.5px;
}
.rn-help {
  max-width: 420px; text-align: center; color: var(--gray-300);
  font-size: 12.5px; line-height: 1.5; margin-top: 0.5rem;
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
