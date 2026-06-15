import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DIFFS, generateChemin, type CheminPuzzle } from './engine';

/* =====================================================
   LE CHEMIN (LinkedIn "Zip") — React island.
   Draw one path visiting every cell, through 1→k in order.
   Engine lives in ./engine (pure, tested).
   ===================================================== */

type Status = 'loading' | 'playing' | 'won';

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const key = (r: number, c: number) => `${r},${c}`;
const adjacent = (a: [number, number], b: [number, number]) =>
	Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

export default function CheminGame() {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<CheminPuzzle | null>(null);
	const [path, setPath] = useState<[number, number][]>([]);
	const [status, setStatus] = useState<Status>('loading');
	const [started, setStarted] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const startRef = useRef<number>(0);
	const boardRef = useRef<HTMLDivElement>(null);
	const drawing = useRef(false);
	const moved = useRef(false);
	const downCell = useRef<[number, number] | null>(null);
	const lastCell = useRef<[number, number] | null>(null);

	const startCell = (p: CheminPuzzle): [number, number] => {
		for (let r = 0; r < p.size; r++)
			for (let c = 0; c < p.size; c++) if (p.numbers[r][c] === 1) return [r, c];
		return [0, 0];
	};

	const newGame = useCallback((dk: keyof typeof DIFFS) => {
		setDiffKey(dk);
		setStatus('loading');
		setStarted(false);
		setElapsed(0);
		// Generate off the paint frame (7×7 can take a few hundred ms).
		setTimeout(() => {
			const p = generateChemin(DIFFS[dk]);
			setPuzzle(p);
			setPath([startCell(p)]);
			setStatus('playing');
		}, 0);
	}, []);

	useEffect(() => {
		newGame('facile');
	}, [newGame]);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing' || !started) return;
		const id = setInterval(
			() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
			250,
		);
		return () => clearInterval(id);
	}, [status, started]);

	const inPath = useMemo(() => new Set(path.map(([r, c]) => key(r, c))), [path]);

	/* Checkpoint-order errors (numbers reached out of sequence). */
	const errors = useMemo(() => {
		const bad = new Set<string>();
		if (!puzzle) return bad;
		let expected = 1;
		for (const [r, c] of path) {
			const lab = puzzle.numbers[r][c];
			if (lab !== 0) {
				if (lab === expected) expected++;
				else bad.add(key(r, c));
			}
		}
		return bad;
	}, [path, puzzle]);

	/* Win: full coverage, checkpoints in order. */
	useEffect(() => {
		if (!puzzle || status !== 'playing') return;
		if (path.length !== puzzle.size * puzzle.size) return;
		if (errors.size > 0) return;
		const last = path[path.length - 1];
		if (puzzle.numbers[last[0]][last[1]] !== puzzle.k) return;
		setStatus('won');
	}, [path, puzzle, status, errors]);

	const begin = () => {
		if (!started) {
			startRef.current = Date.now();
			setStarted(true);
		}
	};

	/* Blocked edges (flat-index pairs a<b -> id a*total+b). */
	const wallSet = useMemo(() => {
		const s = new Set<number>();
		if (puzzle) {
			const total = puzzle.size * puzzle.size;
			for (const [a, b] of puzzle.walls) s.add(a * total + b);
		}
		return s;
	}, [puzzle]);

	/* Drag logic: step onto a cell while drawing. Re-passing over an already
	   traced cell does nothing; only stepping back onto the previous cell
	   retracts. Extends onto an adjacent empty cell. */
	const step = useCallback(
		(cell: [number, number]) => {
			if (status !== 'playing' || !puzzle) return;
			const sz = puzzle.size;
			const total = sz * sz;
			setPath((prev) => {
				if (prev.length >= 2) {
					const back = prev[prev.length - 2];
					if (back[0] === cell[0] && back[1] === cell[1]) return prev.slice(0, -1); // retract one
				}
				if (prev.some(([r, c]) => r === cell[0] && c === cell[1])) return prev; // ignore re-pass
				const head = prev[prev.length - 1];
				if (adjacent(head, cell)) {
					const ai = head[0] * sz + head[1];
					const bi = cell[0] * sz + cell[1];
					if (!wallSet.has(Math.min(ai, bi) * total + Math.max(ai, bi))) {
						begin();
						return [...prev, cell]; // extend (no wall between)
					}
				}
				return prev;
			});
		},
		[status, started, puzzle, wallSet],
	);

	/* Deliberate click on an already-traced cell: cut the path back to it. */
	const truncateTo = useCallback(
		(cell: [number, number]) => {
			if (status !== 'playing') return;
			setPath((prev) => {
				const idx = prev.findIndex(([r, c]) => r === cell[0] && c === cell[1]);
				return idx !== -1 ? prev.slice(0, idx + 1) : prev;
			});
		},
		[status],
	);

	const cellFromPointer = (e: React.PointerEvent): [number, number] | null => {
		if (!boardRef.current || !puzzle) return null;
		const rect = boardRef.current.getBoundingClientRect();
		const n = puzzle.size;
		const c = Math.floor(((e.clientX - rect.left) / rect.width) * n);
		const r = Math.floor(((e.clientY - rect.top) / rect.height) * n);
		if (r < 0 || r >= n || c < 0 || c >= n) return null;
		return [r, c];
	};

	const onPointerDown = (e: React.PointerEvent) => {
		const cell = cellFromPointer(e);
		if (!cell) return;
		drawing.current = true;
		moved.current = false;
		downCell.current = cell;
		lastCell.current = cell;
		boardRef.current?.setPointerCapture(e.pointerId);
		step(cell);
	};
	const onPointerMove = (e: React.PointerEvent) => {
		if (!drawing.current) return;
		const cell = cellFromPointer(e);
		if (!cell) return;
		if (lastCell.current && cell[0] === lastCell.current[0] && cell[1] === lastCell.current[1]) return;
		lastCell.current = cell;
		moved.current = true;
		step(cell);
	};
	const endDraw = () => {
		if (drawing.current && !moved.current && downCell.current) truncateTo(downCell.current); // deliberate tap
		drawing.current = false;
	};

	const clearPath = () => {
		if (!puzzle) return;
		setPath([startCell(puzzle)]);
		if (status === 'won') setStatus('playing');
	};

	const n = puzzle?.size ?? 0;
	const head = path[path.length - 1];

	return (
		<div className="zp-root">
			<style>{CSS}</style>

			<div className="zp-bar">
				<div className="zp-pills" role="tablist" aria-label="Difficulté">
					{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
						<button
							key={k}
							role="tab"
							aria-selected={diffKey === k}
							className={`zp-pill ${diffKey === k ? 'active' : ''}`}
							onClick={() => newGame(k)}
						>
							{DIFFS[k].label}
						</button>
					))}
				</div>
				<div className="zp-bar-right">
					<div className="zp-timer">{fmtTime(elapsed)}</div>
					<button className="zp-new" onClick={clearPath} aria-label="Effacer le tracé">
						⌫
					</button>
				</div>
			</div>

			<div className="zp-boardwrap">
				{status === 'loading' || !puzzle ? (
					<div className="zp-loading">Génération…</div>
				) : (
					<div
						className="zp-board"
						ref={boardRef}
						style={{ gridTemplateColumns: `repeat(${n}, var(--zp-cell))`, ['--n' as string]: n }}
						onPointerDown={onPointerDown}
						onPointerMove={onPointerMove}
						onPointerUp={endDraw}
						onPointerCancel={endDraw}
						role="application"
						aria-label="Grille du chemin"
					>
						{Array.from({ length: n }).map((_, r) =>
							Array.from({ length: n }).map((_, c) => {
								const lab = puzzle.numbers[r][c];
								const on = inPath.has(key(r, c));
								const isHead = head && head[0] === r && head[1] === c;
								const err = errors.has(key(r, c));
								const a = r * n + c;
								const total = n * n;
								const wallR = c < n - 1 && wallSet.has(a * total + (a + 1));
								const wallB = r < n - 1 && wallSet.has(a * total + (a + n));
								return (
									<div
										key={`${r}-${c}`}
										className={['zp-cell', on ? 'on' : '', isHead ? 'head' : ''].join(' ')}
										style={{
											borderRight: wallR ? '4px solid var(--zp-wall)' : undefined,
											borderBottom: wallB ? '4px solid var(--zp-wall)' : undefined,
										}}
									>
										{lab !== 0 && <span className={`zp-num ${err ? 'err' : ''}`}>{lab}</span>}
									</div>
								);
							}),
						)}

						{/* Path line overlay, in grid units (scales with the board). */}
						{path.length > 1 && (
							<svg
								className="zp-line"
								viewBox={`0 0 ${n} ${n}`}
								preserveAspectRatio="none"
								aria-hidden="true"
							>
								<polyline
									points={path.map(([r, c]) => `${c + 0.5},${r + 0.5}`).join(' ')}
									fill="none"
									stroke="var(--accent-regular)"
									strokeWidth={0.34}
									strokeLinecap="round"
									strokeLinejoin="round"
									vectorEffect="non-scaling-stroke"
									style={{ strokeWidth: 'var(--zp-stroke)' } as React.CSSProperties}
								/>
							</svg>
						)}
					</div>
				)}

				{status === 'won' && (
					<div className="zp-win" role="dialog" aria-label="Chemin résolu">
						<div className="zp-wincard">
							<div className="zp-winmark">🧭</div>
							<h2>Relié !</h2>
							<p className="zp-wintime">{fmtTime(elapsed)}</p>
							<p className="zp-windiff">{DIFFS[diffKey].label} · {n}×{n}</p>
							<button className="zp-replay" onClick={() => newGame(diffKey)}>
								Rejouer
							</button>
						</div>
					</div>
				)}
			</div>

			<p className="zp-help">
				Glisse depuis le 1 pour tracer un chemin qui passe par tous les nombres dans l'ordre et
				remplit toutes les cases. Touche une case du tracé pour revenir en arrière.
			</p>
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.zp-root {
  --zp-accent: var(--accent-regular);
  --zp-ok: #2f9e6f;
  --zp-bad: #d9534f;
  --zp-wall: var(--gray-0);
  /* Constant board width whatever the size -> bigger grids get smaller cells,
     and the board never exceeds mobile width. */
  --zp-cell: calc(min(420px, 92vw) / var(--n, 5));
  --zp-stroke: calc(var(--zp-cell) * 0.34);

  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.zp-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 1rem;
}
.zp-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.zp-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.zp-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.zp-pill.active { background: var(--zp-accent); color: var(--accent-text-over); border-color: var(--zp-accent); }
.zp-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.zp-new {
  border: none; background: var(--gray-800); color: var(--gray-0);
  font-size: 16px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1;
}

.zp-boardwrap { position: relative; }
.zp-loading {
  display: flex; align-items: center; justify-content: center;
  width: min(420px, 92vw); height: min(420px, 92vw);
  color: var(--gray-300); font-weight: 600;
}
.zp-board {
  position: relative;
  display: grid;
  border: 2.5px solid var(--gray-100);
  border-radius: 8px;
  overflow: hidden;
  background: var(--gray-999);
  touch-action: none;
  user-select: none;
}
.zp-cell {
  position: relative;
  width: var(--zp-cell); height: var(--zp-cell);
  box-sizing: border-box;
  border-right: 1px solid var(--gray-800);
  border-bottom: 1px solid var(--gray-800);
  display: flex; align-items: center; justify-content: center;
}
.zp-cell.on { background: var(--accent-overlay); }
.zp-num {
  position: relative; z-index: 2;
  width: calc(var(--zp-cell) * 0.66); height: calc(var(--zp-cell) * 0.66);
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: var(--gray-0); color: var(--gray-999);
  font-weight: 700; font-size: calc(var(--zp-cell) * 0.36);
}
.zp-num.err { background: var(--zp-bad); color: #fff; }
.zp-line { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; }

.zp-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem; }

.zp-win {
  position: absolute; inset: -8px; z-index: 10; display: flex; align-items: center; justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px; animation: zp-fade 0.25s ease;
}
.zp-wincard { background: var(--gray-999); border: 2px solid var(--zp-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg); }
.zp-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 24px; color: var(--gray-0); }
.zp-winmark { font-size: 30px; }
.zp-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--zp-accent); }
.zp-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.zp-replay { border: none; background: var(--zp-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer; }

@keyframes zp-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .zp-win { animation: none; } }
`;
