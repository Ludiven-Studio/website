import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DIFFS, generateCalcudoku, type CalcudokuPuzzle, type Op } from './engine';
import { trackGame } from '../../lib/analytics';

/* =====================================================
   CALCUDOKU (KenKen) — React island.
   Latin square + cages with a target and an operation.
   Engine lives in ./engine (pure, tested).
   ===================================================== */

type Status = 'playing' | 'won';

const emptyEntries = (n: number): (number | null)[][] =>
	Array.from({ length: n }, () => new Array(n).fill(null));

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const OP_SYM: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷', '=': '' };

export default function CalcudokuGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<CalcudokuPuzzle>(() => generateCalcudoku(DIFFS.facile));
	const [entries, setEntries] = useState<(number | null)[][]>(() => emptyEntries(DIFFS.facile.size));
	const [selected, setSelected] = useState<[number, number] | null>(null);
	const [status, setStatus] = useState<Status>('playing');
	const [started, setStarted] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const startRef = useRef<number>(0);

	const { size, cages, cageOf } = puzzle;

	// Single-cell ("=") cages are revealed as fixed givens.
	const given = useMemo(() => {
		const g: (number | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null));
		for (const cage of cages)
			if (cage.op === '=') {
				const [r, c] = cage.cells[0];
				g[r][c] = cage.target;
			}
		return g;
	}, [cages, size]);

	// Cage label cell (top-left-most) + text, for non-trivial cages.
	const labels = useMemo(() => {
		const map = new Map<string, string>();
		cages.forEach((cage) => {
			if (cage.op === '=') return;
			let best = cage.cells[0];
			for (const [r, c] of cage.cells)
				if (r * size + c < best[0] * size + best[1]) best = [r, c];
			map.set(`${best[0]},${best[1]}`, `${cage.target}${OP_SYM[cage.op]}`);
		});
		return map;
	}, [cages, size]);

	const value = useCallback(
		(r: number, c: number) => (given[r][c] != null ? given[r][c] : entries[r][c]),
		[given, entries],
	);

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		const d = DIFFS[key];
		setDiffKey(key);
		setPuzzle(generateCalcudoku(d));
		setEntries(emptyEntries(d.size));
		setSelected(null);
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

	/* Latin conflicts (row / col duplicates). */
	const conflicts = useMemo(() => {
		const set = new Set<string>();
		const scan = (cells: [number, number][]) => {
			const seen = new Map<number, [number, number]>();
			for (const [r, c] of cells) {
				const v = value(r, c);
				if (v == null) continue;
				const prev = seen.get(v);
				if (prev) {
					set.add(`${r},${c}`);
					set.add(`${prev[0]},${prev[1]}`);
				} else seen.set(v, [r, c]);
			}
		};
		for (let r = 0; r < size; r++)
			scan(Array.from({ length: size }, (_, c): [number, number] => [r, c]));
		for (let c = 0; c < size; c++)
			scan(Array.from({ length: size }, (_, r): [number, number] => [r, c]));
		return set;
	}, [size, value]);

	/* Cage satisfaction (only meaningful when full). */
	const cageSatisfied = useCallback(() => {
		for (const cage of cages) {
			const vals: number[] = [];
			for (const [r, c] of cage.cells) {
				const v = value(r, c);
				if (v == null) return false;
				vals.push(v);
			}
			let ok = false;
			if (cage.op === '=') ok = vals[0] === cage.target;
			else if (cage.op === '+') ok = vals.reduce((a, b) => a + b, 0) === cage.target;
			else if (cage.op === '*') ok = vals.reduce((a, b) => a * b, 1) === cage.target;
			else if (cage.op === '-') ok = Math.abs(vals[0] - vals[1]) === cage.target;
			else if (cage.op === '/') {
				const hi = Math.max(...vals), lo = Math.min(...vals);
				ok = lo !== 0 && hi % lo === 0 && hi / lo === cage.target;
			}
			if (!ok) return false;
		}
		return true;
	}, [cages, value]);

	/* Win detection. */
	useEffect(() => {
		if (status === 'won') return;
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (value(r, c) == null) return;
		if (conflicts.size > 0) return;
		if (cageSatisfied()) {
			setStatus('won');
			setSelected(null);
			trackGame(gameId, 'game_won');
		}
	}, [entries, status, size, value, conflicts, cageSatisfied, gameId]);

	const placeValue = useCallback(
		(v: number | null) => {
			if (status === 'won' || !selected) return;
			const [r, c] = selected;
			if (given[r][c] != null) return;
			setEntries((prev) => {
				const next = prev.map((row) => [...row]);
				next[r][c] = v;
				return next;
			});
			if (!started) {
				startRef.current = Date.now();
				setStarted(true);
				trackGame(gameId, 'game_started');
			}
		},
		[status, selected, given, started, gameId],
	);

	/* Keyboard. */
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (status === 'won') return;
			const d = parseInt(e.key, 10);
			if (d >= 1 && d <= size) placeValue(d);
			else if (e.key === 'Backspace' || e.key === 'Delete') placeValue(null);
			else if (e.key.startsWith('Arrow') && selected) {
				e.preventDefault();
				const [r, c] = selected;
				const dr = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
				const dc = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
				setSelected([
					Math.min(size - 1, Math.max(0, r + dr)),
					Math.min(size - 1, Math.max(0, c + dc)),
				]);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [status, size, selected, placeValue]);

	const thin = '1px solid var(--cd-line)';
	const thick = '2.5px solid var(--cd-line-strong)';

	return (
		<div className="cd-root">
			<style>{CSS}</style>

			<div className="cd-bar">
				<div className="cd-pills" role="tablist" aria-label="Difficulté">
					{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
						<button
							key={k}
							role="tab"
							aria-selected={diffKey === k}
							className={`cd-pill ${diffKey === k ? 'active' : ''}`}
							onClick={() => newGame(k)}
						>
							{DIFFS[k].label}
						</button>
					))}
				</div>
				<div className="cd-bar-right">
					<div className="cd-timer">{fmtTime(elapsed)}</div>
					<button className="cd-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">
						↻
					</button>
				</div>
			</div>

			<div className="cd-boardwrap">
				<div
					className="cd-board"
					style={{ gridTemplateColumns: `repeat(${size}, var(--cd-cell))`, ['--n' as string]: size }}
				>
					{Array.from({ length: size }).map((_, r) =>
						Array.from({ length: size }).map((_, c) => {
							const isGiven = given[r][c] != null;
							const v = value(r, c);
							const isSel = selected != null && selected[0] === r && selected[1] === c;
							const bad = conflicts.has(`${r},${c}`);
							const label = labels.get(`${r},${c}`);
							return (
								<button
									key={`${r}-${c}`}
									className={[
										'cd-cell',
										isGiven ? 'given' : 'entry',
										isSel ? 'sel' : '',
										bad ? 'bad' : '',
										status === 'won' ? 'wondone' : '',
									].join(' ')}
									style={{
										borderRight:
											c === size - 1 ? 'none' : cageOf[r][c] !== cageOf[r][c + 1] ? thick : thin,
										borderBottom:
											r === size - 1 ? 'none' : cageOf[r][c] !== cageOf[r + 1][c] ? thick : thin,
									}}
									onClick={() => setSelected([r, c])}
									aria-label={`Ligne ${r + 1}, colonne ${c + 1}${v != null ? `, ${v}` : ', vide'}`}
									disabled={status === 'won'}
								>
									{label && <span className="cd-cagelabel">{label}</span>}
									<span className="cd-val">{v != null ? v : ''}</span>
								</button>
							);
						}),
					)}
				</div>

				{status === 'won' && (
					<div className="cd-win" role="dialog" aria-label="Grille résolue">
						<div className="cd-wincard">
							<div className="cd-winmark">🧮</div>
							<h2>Résolu !</h2>
							<p className="cd-wintime">{fmtTime(elapsed)}</p>
							<p className="cd-windiff">{DIFFS[diffKey].label} · {size}×{size}</p>
							<button className="cd-replay" onClick={() => newGame(diffKey)}>
								Rejouer
							</button>
						</div>
					</div>
				)}
			</div>

			<div className="cd-pad" aria-label="Pavé numérique">
				{Array.from({ length: size }, (_, i) => i + 1).map((v) => (
					<button key={v} className="cd-key" onClick={() => placeValue(v)}>
						{v}
					</button>
				))}
				<button className="cd-key erase" onClick={() => placeValue(null)} aria-label="Effacer">
					⌫
				</button>
			</div>

			<p className="cd-help">
				Touche une case puis un chiffre de 1 à {size}. Chaque ligne et colonne contient 1 à {size}.
				Dans chaque cage, les chiffres donnent la cible avec l'opération indiquée.
			</p>
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.cd-root {
  --cd-accent: var(--accent-regular);
  --cd-ok: #2f9e6f;
  --cd-bad: #d9534f;
  --cd-line: var(--gray-700);
  --cd-line-strong: var(--gray-100);
  --cd-cell: clamp(40px, calc(min(420px, 88vw) / var(--n, 4)), 64px);

  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cd-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 1rem;
}
.cd-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.cd-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.cd-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.cd-pill.active { background: var(--cd-accent); color: var(--accent-text-over); border-color: var(--cd-accent); }
.cd-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.cd-new {
  border: none; background: var(--cd-accent); color: var(--accent-text-over);
  font-size: 18px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1;
}

.cd-boardwrap { position: relative; }
.cd-board {
  display: grid; border: 2.5px solid var(--cd-line-strong); border-radius: 6px; overflow: hidden; background: var(--gray-999);
}
.cd-cell {
  position: relative;
  width: var(--cd-cell); height: var(--cd-cell);
  box-sizing: border-box; border: none; background: var(--gray-999);
  font: inherit; cursor: pointer; padding: 0;
  transition: background 0.08s ease, color 0.08s ease;
}
.cd-cell.given { background: var(--gray-900); }
.cd-cell.sel { background: var(--accent-overlay); box-shadow: inset 0 0 0 2px var(--cd-accent); }
.cd-cell.bad .cd-val { color: var(--cd-bad); }
.cd-cell.wondone .cd-val { color: var(--cd-ok); }
.cd-cagelabel {
  position: absolute; top: 2px; left: 4px;
  font-size: calc(var(--cd-cell) * 0.24); font-weight: 700; line-height: 1;
  color: var(--gray-300); pointer-events: none;
}
.cd-val {
  display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;
  font-weight: 600; font-size: calc(var(--cd-cell) * 0.42); color: var(--cd-accent);
}
.cd-cell.given .cd-val { color: var(--gray-0); font-weight: 700; }

.cd-pad { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 1.25rem; width: 100%; }
.cd-key {
  min-width: clamp(44px, 12vw, 56px); height: clamp(44px, 12vw, 56px); padding: 0 0.5rem;
  border-radius: 14px; border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0);
  font: inherit; font-weight: 700; font-size: 20px; cursor: pointer;
}
.cd-key:active { background: var(--cd-accent); color: var(--accent-text-over); border-color: var(--cd-accent); }
.cd-key.erase { background: var(--gray-800); }

.cd-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem; }

.cd-win {
  position: absolute; inset: -8px; display: flex; align-items: center; justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px; animation: cd-fade 0.25s ease;
}
.cd-wincard { background: var(--gray-999); border: 2px solid var(--cd-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg); }
.cd-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 24px; color: var(--gray-0); }
.cd-winmark { font-size: 30px; }
.cd-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--cd-accent); }
.cd-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.cd-replay { border: none; background: var(--cd-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer; }

@keyframes cd-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .cd-cell, .cd-win { transition: none; animation: none; } }
`;
