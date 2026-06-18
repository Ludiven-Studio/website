import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DIFFS, generateChemin, type CheminPuzzle } from './engine';
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

const startCellOf = (p: CheminPuzzle): [number, number] => {
	for (let r = 0; r < p.size; r++)
		for (let c = 0; c < p.size; c++) if (p.numbers[r][c] === 1) return [r, c];
	return [0, 0];
};

// Daily challenge: difficulty comes from the server (same for everyone).
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

export default function CheminGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<CheminPuzzle | null>(null);
	const [path, setPath] = useState<[number, number][]>([]);
	const [status, setStatus] = useState<Status>('loading');
	const [started, setStarted] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false); // daily already completed today
	const startRef = useRef<number>(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const boardRef = useRef<HTMLDivElement>(null);
	const drawing = useRef(false);
	const moved = useRef(false);
	const downCell = useRef<[number, number] | null>(null);
	const lastCell = useRef<[number, number] | null>(null);

	const newGame = useCallback((dk: keyof typeof DIFFS) => {
		setDaily(false);
		setAlreadyPlayed(false);
		setDiffKey(dk);
		setStatus('loading');
		setStarted(false);
		setRevealed(false);
		setElapsed(0);
		// Generate off the paint frame (7×7 can take a few hundred ms).
		setTimeout(() => {
			const p = generateChemin(DIFFS[dk]);
			setPuzzle(p);
			setPath([startCellOf(p)]);
			setStatus('playing');
		}, 0);
	}, []);

	useEffect(() => {
		newGame('facile');
	}, [newGame]);

	/* Daily challenge: one attempt per device, resumable. Server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setRevealed(false);

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			// Resume or lock the existing attempt — regenerate from the stored seed (no fetch).
			const diffIndex = run.diffIndex ?? 0;
			const dk = DIFF_ORDER[diffIndex] ?? 'facile';
			dailySeedRef.current = { seed: run.seed, diffIndex };
			setDailyLoading(false);
			setDiffKey(dk);
			const p = generateChemin(DIFFS[dk], mulberry32(run.seed));
			setPuzzle(p);
			setPath((run.state as [number, number][]) ?? [startCellOf(p)]);
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
		setStatus('loading');
		setStarted(false);
		setElapsed(0);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const dk = DIFF_ORDER[diffIndex] ?? 'facile';
		setDiffKey(dk);
		const p = generateChemin(DIFFS[dk], mulberry32(seed));
		setPuzzle(p);
		setPath([startCellOf(p)]);
		setStatus('playing');
		setDailyLoading(false);
	}, [gameId]);

	/* Commencer: consumes the attempt and starts the chrono. */
	const startTimer = useCallback(() => {
		if (!puzzle) return;
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
			state: [startCellOf(puzzle)],
		});
	}, [gameId, puzzle]);

	/* Clear my entries without resetting the attempt (chrono keeps running). */
	const resetDailyEntries = useCallback(() => {
		if (!puzzle) return;
		const start: [number, number][] = [startCellOf(puzzle)];
		setPath(start);
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: start,
		});
	}, [gameId, puzzle]);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing' || !started || revealed) return;
		const id = setInterval(
			() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
			250,
		);
		return () => clearInterval(id);
	}, [status, started, revealed]);

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
		if (!puzzle || status !== 'playing' || revealed) return;
		if (path.length !== puzzle.size * puzzle.size) return;
		if (errors.size > 0) return;
		const last = path[path.length - 1];
		if (puzzle.numbers[last[0]][last[1]] !== puzzle.k) return;
		setStatus('won');
		trackGame(gameId, 'game_won');
	}, [path, puzzle, status, revealed, errors, gameId]);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || status === 'won') return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: path,
		});
	}, [daily, started, status, path, gameId]);

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
			state: path,
		};
		saveDailyRun(gameId, snapshot);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	const begin = () => {
		if (!started) {
			startRef.current = Date.now();
			setStarted(true);
			trackGame(gameId, 'game_started');
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
			if (status !== 'playing' || revealed || !puzzle) return;
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
		[status, revealed, started, puzzle, wallSet],
	);

	/* Deliberate click on an already-traced cell: cut the path back to it. */
	const truncateTo = useCallback(
		(cell: [number, number]) => {
			if (status !== 'playing' || revealed) return;
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
		if (daily && !started) return; // armed but not started: overlay owns the board
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
		if (daily && !started) return;
		if (!drawing.current) return;
		const cell = cellFromPointer(e);
		if (!cell) return;
		if (lastCell.current && cell[0] === lastCell.current[0] && cell[1] === lastCell.current[1]) return;
		lastCell.current = cell;
		moved.current = true;
		step(cell);
	};
	const endDraw = () => {
		if (daily && !started) return;
		if (drawing.current && !moved.current && downCell.current) truncateTo(downCell.current); // deliberate tap
		drawing.current = false;
	};

	const clearPath = () => {
		if (!puzzle || revealed) return;
		setPath([startCellOf(puzzle)]);
		if (status === 'won') setStatus('playing');
	};

	/* Hint: extend the path by one correct step along the solution. */
	const hint = useCallback(() => {
		if (!puzzle || status !== 'playing' || revealed) return;
		const sol = puzzle.path;
		let prefix = 0;
		while (
			prefix < path.length &&
			prefix < sol.length &&
			path[prefix][0] === sol[prefix][0] &&
			path[prefix][1] === sol[prefix][1]
		)
			prefix++;
		if (prefix >= sol.length) return; // already fully correct
		setPath(sol.slice(0, prefix + 1).map((p) => [...p] as [number, number]));
		begin();
		trackGame(gameId, 'hint_used');
	}, [puzzle, status, revealed, path, gameId]);

	/* Reveal the full path (does not count as a win). */
	const reveal = useCallback(() => {
		if (!puzzle || status !== 'playing' || revealed) return;
		setPath(puzzle.path.map((p) => [...p] as [number, number]));
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [puzzle, status, revealed, gameId]);

	const n = puzzle?.size ?? 0;
	const head = path[path.length - 1];

	return (
		<div className="zp-root">
			<style>{CSS}</style>

			<div className="zp-modes" role="tablist" aria-label="Mode">
				<button
					role="tab"
					aria-selected={!daily}
					className={`zp-pill ${!daily ? 'active' : ''}`}
					onClick={() => daily && newGame(diffKey)}
				>
					Libre
				</button>
				<button
					role="tab"
					aria-selected={daily}
					className={`zp-pill ${daily ? 'active' : ''}`}
					onClick={startDaily}
				>
					🏆 Défi du jour
				</button>
			</div>

			{daily ? (
				<div className="zp-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			) : (
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
			)}

			{daily && (
				<div className="zp-bar zp-bar-daily">
					<div className="zp-timer">{fmtTime(elapsed)}</div>
				</div>
			)}

			{status === 'playing' && !revealed && !daily && (
				<div className="zp-actions">
					<button className="zp-act" onClick={hint}>💡 Indice</button>
					{elapsed >= 60 && (
						<button className="zp-act" onClick={reveal}>👁 Voir la solution</button>
					)}
				</div>
			)}

			{daily && started && status === 'playing' && (
				<div className="zp-actions">
					<button className="zp-act" onClick={resetDailyEntries}>↺ Vider mes saisies</button>
				</div>
			)}

			{daily && status === 'won' && (
				<div className="zp-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Relié en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			<div className="zp-boardwrap" style={{ ['--n' as string]: n }}>
				{status === 'loading' || !puzzle ? (
					<div className="zp-loading">Génération…</div>
				) : (
					<div
						className={`zp-board ${daily && !started ? 'blurred' : ''}`}
						ref={boardRef}
						style={{ gridTemplateColumns: `repeat(${n}, var(--zp-cell))` }}
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

				{daily && dailyLoading && (
					<div className="zp-overlay">
						<div className="zp-overlay-card"><p className="zp-windiff">Préparation…</p></div>
					</div>
				)}

				{daily && !dailyLoading && !started && status !== 'won' && puzzle && (
					<div className="zp-overlay">
						<button className="zp-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div>
				)}

				{status === 'won' && !daily && (
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

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={status === 'won' ? elapsed : undefined} />
			)}

			{!daily && <LeaderboardCorner game={gameId} metric="time" />}

			{revealed ? (
				<div className="zp-revealed-note">
					<span>Solution affichée</span>
					<button className="zp-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
				</div>
			) : (
				<p className="zp-help">
					Glisse depuis le 1 pour tracer un chemin qui passe par tous les nombres dans l'ordre et
					remplit toutes les cases. Touche une case du tracé pour revenir en arrière.
				</p>
			)}
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
  /* Fluid cell: the board fills its (capped) container, so bigger grids get
     smaller cells and the board never exceeds mobile width. */
  --zp-cell: calc(100cqw / var(--n, 5));
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

.zp-modes { display: flex; gap: 6px; justify-content: center; margin-bottom: 0.75rem; }
.zp-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.75rem;
}

.zp-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 1rem;
}
.zp-bar-daily { justify-content: center; }

.zp-actions {
  display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;
  margin-bottom: 1rem;
}
.zp-act {
  border: 1.5px solid var(--gray-700);
  background: transparent;
  color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px;
  border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.zp-act:hover { background: var(--gray-800); border-color: var(--zp-accent); color: var(--zp-accent); }

.zp-revealed-note {
  display: flex; align-items: center; gap: 14px;
  margin-top: 1.25rem;
  color: var(--gray-300); font-size: 14px; font-weight: 500;
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

.zp-boardwrap {
  position: relative;
  width: 100%;
  max-width: 420px;
  margin-inline: auto;
  container-type: inline-size;
}
.zp-loading {
  display: flex; align-items: center; justify-content: center;
  width: 100%; aspect-ratio: 1 / 1;
  color: var(--gray-300); font-weight: 600;
}
.zp-board {
  position: relative;
  width: 100%;
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

.zp-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.zp-overlay {
  position: absolute; inset: -8px; z-index: 2;
  display: flex; align-items: center; justify-content: center;
  animation: zp-fade 0.25s ease;
}
.zp-overlay-card {
  background: var(--gray-999); border: 2px solid var(--zp-accent);
  border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg);
}
.zp-startbtn {
  border: none; background: var(--zp-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.zp-daily-won {
  text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem;
}
.zp-daily-won strong { color: var(--zp-accent); font-variant-numeric: tabular-nums; }

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
@media (prefers-reduced-motion: reduce) { .zp-win, .zp-overlay { animation: none; } }
`;
