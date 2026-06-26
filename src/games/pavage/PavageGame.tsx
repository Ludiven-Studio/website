import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
	DIFFS,
	generatePavage,
	findHint,
	rotations,
	placedCells,
	type PavagePuzzle,
	type Placement,
	type Cell,
} from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import {
	getDaily,
	dailyWeekdayLabel,
	loadDailyRun,
	saveDailyRun,
} from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   PAVAGE — React island.
   Drag Tetris-like pieces into the grid; same-colour pieces
   may never touch side by side. Rotation only (no mirror).
   Engine is pure/tested; the unique solution is guaranteed.
   ===================================================== */

type Status = 'playing' | 'won';

const ORTH = [
	[-1, 0], [1, 0], [0, -1], [0, 1],
] as const;

const COLORS = ['#e8623d', '#3d97e0', '#37ab73', '#c79a1f', '#9b6cd6'];

const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

interface Drag {
	pieceIndex: number;
	rotation: number;
	grab: Cell; // cell of the oriented shape that was grabbed
	cellPx: number;
	x: number; // pointer position
	y: number;
	preview: Placement | null;
	valid: boolean;
}

interface SavedState {
	placements: (Placement | null)[];
	trayRot: number[];
}

const bbox = (cells: Cell[]): { rows: number; cols: number } => {
	let mr = 0, mc = 0;
	for (const [r, c] of cells) {
		if (r > mr) mr = r;
		if (c > mc) mc = c;
	}
	return { rows: mr + 1, cols: mc + 1 };
};

export default function PavageGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<PavagePuzzle>(emptyPuzzle);
	const [placements, setPlacements] = useState<(Placement | null)[]>([]);
	const [trayRot, setTrayRot] = useState<number[]>([]);
	const [drag, setDrag] = useState<Drag | null>(null);
	const [status, setStatus] = useState<Status>('playing');
	const [started, setStarted] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [hinted, setHinted] = useState<Set<number>>(() => new Set());
	const [elapsed, setElapsed] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [hintNote, setHintNote] = useState('');
	const startRef = useRef<number>(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const boardRef = useRef<HTMLDivElement>(null);

	const { size, blocked, pieces, solution, rotate } = puzzle;

	// rotations of every piece (small, recomputed cheaply but memoized on puzzle).
	const pieceRots = useMemo(() => pieces.map((p) => rotations(p.cells)), [pieces]);

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		const p = generatePavage(DIFFS[key]);
		setDaily(false);
		setAlreadyPlayed(false);
		setHintNote('');
		setDiffKey(key);
		setPuzzle(p);
		setPlacements(p.pieces.map(() => null));
		setTrayRot(p.pieces.map(() => 0));
		setDrag(null);
		setStatus('playing');
		setStarted(false);
		setRevealed(false);
		setHinted(new Set());
		setElapsed(0);
	}, []);

	// Initialise free mode on mount.
	useEffect(() => {
		newGame('facile');
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* Daily challenge: one attempt per device, resumable. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setRevealed(false);
		setHinted(new Set());
		setHintNote('');

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const di = run.diffIndex ?? 0;
			const dk = DIFF_ORDER[di] ?? 'facile';
			const d = DIFFS[dk];
			dailySeedRef.current = { seed: run.seed, diffIndex: di };
			setDailyLoading(false);
			setDiffKey(dk);
			const p = generatePavage(d, mulberry32(run.seed));
			setPuzzle(p);
			const saved = run.state as SavedState | undefined;
			setPlacements(saved?.placements ?? p.pieces.map(() => null));
			setTrayRot(saved?.trayRot ?? p.pieces.map(() => 0));
			setDrag(null);
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

		setAlreadyPlayed(false);
		setStatus('playing');
		setStarted(false);
		setElapsed(0);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const dk = DIFF_ORDER[diffIndex] ?? 'facile';
		const d = DIFFS[dk];
		setDiffKey(dk);
		const p = generatePavage(d, mulberry32(seed));
		setPuzzle(p);
		setPlacements(p.pieces.map(() => null));
		setTrayRot(p.pieces.map(() => 0));
		setDrag(null);
		setDailyLoading(false);
	}, [gameId]);

	const { celebrating, showWin } = useCelebration(status === 'won');

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
			state: { placements: pieces.map(() => null), trayRot: pieces.map(() => 0) } satisfies SavedState,
		});
	}, [gameId, pieces]);

	const resetDailyEntries = useCallback(() => {
		const empty: SavedState = {
			placements: pieces.map(() => null),
			trayRot: pieces.map(() => 0),
		};
		setPlacements(empty.placements);
		setTrayRot(empty.trayRot);
		setHinted(new Set());
		setHintNote('');
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: empty,
		});
	}, [gameId, pieces]);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing' || !started || revealed) return;
		const id = setInterval(
			() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
			250,
		);
		return () => clearInterval(id);
	}, [status, started, revealed]);

	const ensureStarted = useCallback(() => {
		if (started || daily) return;
		startRef.current = Date.now();
		setStarted(true);
		trackGame(gameId, 'game_started');
	}, [started, daily, gameId]);

	/* Cover grid: piece index per cell (excludes pieces still in the tray / being dragged). */
	const cover = useMemo(() => {
		const g: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
		placements.forEach((pl, i) => {
			if (!pl) return;
			for (const [r, c] of placedCells(pieces[i], pl)) g[r][c] = i;
		});
		return g;
	}, [placements, pieces, size]);

	const validPlacement = useCallback(
		(pieceIndex: number, pl: Placement): boolean => {
			const piece = pieces[pieceIndex];
			const cells = placedCells(piece, pl);
			for (const [r, c] of cells) {
				if (r < 0 || r >= size || c < 0 || c >= size) return false;
				if (blocked[r][c]) return false;
				if (cover[r][c] >= 0) return false;
			}
			for (const [r, c] of cells)
				for (const [dr, dc] of ORTH) {
					const nr = r + dr, nc = c + dc;
					if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
						const j = cover[nr][nc];
						if (j >= 0 && pieces[j].color === piece.color) return false;
					}
				}
			return true;
		},
		[pieces, blocked, cover, size],
	);

	/* Win: every piece placed (a full valid tiling is necessarily the unique solution). */
	useEffect(() => {
		if (status === 'won' || revealed) return;
		if (daily && !started) return;
		if (placements.length === 0 || placements.some((p) => !p)) return;
		setStatus('won');
		setDrag(null);
		trackGame(gameId, 'game_won');
	}, [placements, status, revealed, daily, started, gameId]);

	/* Persist in-progress daily attempt. */
	useEffect(() => {
		if (!daily || !started || status === 'won') return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { placements, trayRot } satisfies SavedState,
		});
	}, [daily, started, status, placements, trayRot, gameId]);

	/* Lock the daily attempt on a fresh win. */
	useEffect(() => {
		if (!daily || status !== 'won' || alreadyPlayed) return;
		const sd = dailySeedRef.current;
		const finalTime = Math.floor((Date.now() - startRef.current) / 1000);
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: true,
			finalTime,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { placements, trayRot } satisfies SavedState,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	/* ---------- drag & drop ---------- */

	const cellFromPoint = useCallback(
		(x: number, y: number): Cell | null => {
			const el = boardRef.current;
			if (!el) return null;
			const rect = el.getBoundingClientRect();
			if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
			const c = Math.floor((x - rect.left) / (rect.width / size));
			const r = Math.floor((y - rect.top) / (rect.height / size));
			if (r < 0 || r >= size || c < 0 || c >= size) return null;
			return [r, c];
		},
		[size],
	);

	const boardCellPx = useCallback((): number => {
		const el = boardRef.current;
		if (!el) return 40;
		return el.getBoundingClientRect().width / size;
	}, [size]);

	const beginDrag = useCallback(
		(pieceIndex: number, rotation: number, grab: Cell, x: number, y: number) => {
			if (status === 'won' || revealed) return;
			if (daily && !started) return;
			// Pick a placed piece back up.
			setPlacements((prev) => {
				if (!prev[pieceIndex]) return prev;
				const next = [...prev];
				next[pieceIndex] = null;
				return next;
			});
			setHintNote('');
			setDrag({ pieceIndex, rotation, grab, cellPx: boardCellPx(), x, y, preview: null, valid: false });
		},
		[status, revealed, daily, started, boardCellPx],
	);

	// Recompute preview given a pointer position + rotation.
	const computeDrag = useCallback(
		(d: Drag, x: number, y: number, rotation: number): Drag => {
			const hover = cellFromPoint(x, y);
			let preview: Placement | null = null;
			let valid = false;
			if (hover) {
				// keep the grabbed cell under the finger
				const pl: Placement = { row: hover[0] - d.grab[0], col: hover[1] - d.grab[1], rotation };
				valid = validPlacement(d.pieceIndex, pl);
				preview = pl;
			}
			return { ...d, x, y, rotation, preview, valid };
		},
		[cellFromPoint, validPlacement],
	);

	useEffect(() => {
		if (!drag) return;
		const onMove = (e: PointerEvent) => {
			e.preventDefault();
			setDrag((d) => (d ? computeDrag(d, e.clientX, e.clientY, d.rotation) : d));
		};
		const onUp = () => {
			setDrag((d) => {
				if (!d) return null;
				setTrayRot((tr) => {
					const next = [...tr];
					next[d.pieceIndex] = d.rotation;
					return next;
				});
				if (d.preview && d.valid) {
					setPlacements((prev) => {
						const next = [...prev];
						next[d.pieceIndex] = d.preview;
						return next;
					});
					setHinted((prev) => {
						if (!prev.has(d.pieceIndex)) return prev;
						const n = new Set(prev);
						n.delete(d.pieceIndex);
						return n;
					});
					ensureStarted();
				}
				return null;
			});
		};
		const onKey = (e: KeyboardEvent) => {
			if (!rotate) return;
			if (e.key === 'r' || e.key === 'R') {
				e.preventDefault();
				setDrag((d) => {
					if (!d) return d;
					const nRot = pieceRots[d.pieceIndex].length;
					return computeDrag(d, d.x, d.y, (d.rotation + 1) % nRot);
				});
			}
		};
		window.addEventListener('pointermove', onMove, { passive: false });
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
			window.removeEventListener('keydown', onKey);
		};
	}, [drag, computeDrag, ensureStarted, pieceRots, rotate]);

	const rotateTray = useCallback((pieceIndex: number) => {
		setTrayRot((tr) => {
			const next = [...tr];
			next[pieceIndex] = (next[pieceIndex] + 1) % pieceRots[pieceIndex].length;
			return next;
		});
	}, [pieceRots]);

	/* Hint: remove a misplaced piece or place the next forced one. */
	const hint = useCallback(() => {
		if (status === 'won' || revealed) return;
		const h = findHint(placements, puzzle);
		if (!h) return;
		if (h.action === 'remove') {
			setPlacements((prev) => {
				const next = [...prev];
				next[h.pieceIndex] = null;
				return next;
			});
		} else if (h.placement) {
			const pl = h.placement;
			setPlacements((prev) => {
				const next = [...prev];
				next[h.pieceIndex] = pl;
				return next;
			});
			setTrayRot((tr) => {
				const next = [...tr];
				next[h.pieceIndex] = pl.rotation;
				return next;
			});
			setHinted((prev) => new Set(prev).add(h.pieceIndex));
		}
		setHintNote(h.reason);
		ensureStarted();
		trackGame(gameId, 'hint_used');
	}, [status, revealed, placements, puzzle, ensureStarted, gameId]);

	const reveal = useCallback(() => {
		if (status === 'won' || revealed) return;
		setPlacements(solution.map((p) => ({ ...p })));
		setDrag(null);
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [status, revealed, solution, gameId]);

	/* ---------- derived render data ---------- */

	const previewMap = useMemo(() => {
		const m = new Map<number, 'ok' | 'bad'>();
		if (!drag || !drag.preview) return m;
		for (const [r, c] of placedCells(pieces[drag.pieceIndex], drag.preview)) {
			if (r < 0 || r >= size || c < 0 || c >= size) continue;
			if (blocked[r][c] || cover[r][c] >= 0) continue;
			m.set(r * size + c, drag.valid ? 'ok' : 'bad');
		}
		return m;
	}, [drag, pieces, size, blocked, cover]);

	const interactive = !(status === 'won' || revealed || (daily && !started));

	const sideBorder = (r: number, c: number, dr: number, dc: number, idx: number): boolean => {
		const nr = r + dr, nc = c + dc;
		if (nr < 0 || nr >= size || nc < 0 || nc >= size) return true;
		return cover[nr][nc] !== idx;
	};

	const dragGhost = drag; // ghost shown for the whole drag

	return (
		<div className="pv-root" style={{ ['--n' as string]: size }}>
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newGame(diffKey)} onDaily={startDaily} />

			{daily && (
				<div className="pv-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			)}

			<div className="pv-bar">
				{!daily ? (
					<div className="pv-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={diffKey === k}
								className={`pv-pill ${diffKey === k ? 'active' : ''}`}
								onClick={() => newGame(k)}
							>
								{DIFFS[k].label}
							</button>
						))}
					</div>
				) : (
					<div />
				)}
				<div className="pv-bar-right">
					<div className="pv-timer">{fmtTime(elapsed)}</div>
					{!daily && (
						<button className="pv-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">
							↻
						</button>
					)}
				</div>
			</div>

			{status !== 'won' && !revealed && !daily && (
				<div className="pv-actions">
					<button className="pv-act" onClick={hint}>💡 Indice</button>
					{elapsed >= 60 && (
						<button className="pv-act" onClick={reveal}>👁 Voir la solution</button>
					)}
				</div>
			)}

			{daily && started && status === 'playing' && (
				<div className="pv-actions">
					<button className="pv-act" onClick={hint}>💡 Indice</button>
					<button className="pv-act" onClick={resetDailyEntries}>↺ Vider</button>
				</div>
			)}

			{daily && status === 'won' && (
				<div className="pv-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Résolu en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			<div className="pv-boardwrap" style={{ ['--n' as string]: size }}>
				{celebrating && <Celebration />}
				<div
					ref={boardRef}
					className={`pv-board ${daily && !started ? 'blurred' : ''}`}
					style={{ gridTemplateColumns: `repeat(${size}, var(--pv-cell))` }}
				>
					{Array.from({ length: size }).map((_, r) =>
						Array.from({ length: size }).map((_, c) => {
							const isBlocked = blocked[r][c];
							const idx = cover[r][c];
							const covered = idx >= 0;
							const color = covered ? COLORS[pieces[idx].color % COLORS.length] : undefined;
							const prev = previewMap.get(r * size + c);
							const cls = [
								'pv-cell',
								isBlocked ? 'blocked' : '',
								covered ? 'covered' : '',
								covered && hinted.has(idx) ? 'hinted' : '',
								prev ? `prev-${prev}` : '',
								status === 'won' || revealed ? 'wondone' : '',
							].join(' ');
							const boxShadow = covered
								? [
										sideBorder(r, c, -1, 0, idx) ? 'inset 0 2px 0 0 var(--pv-edge)' : '',
										sideBorder(r, c, 1, 0, idx) ? 'inset 0 -2px 0 0 var(--pv-edge)' : '',
										sideBorder(r, c, 0, -1, idx) ? 'inset 2px 0 0 0 var(--pv-edge)' : '',
										sideBorder(r, c, 0, 1, idx) ? 'inset -2px 0 0 0 var(--pv-edge)' : '',
									].filter(Boolean).join(', ')
								: undefined;
							return (
								<div
									key={`${r}-${c}`}
									className={cls}
									style={{ background: color, boxShadow }}
									onPointerDown={(e) => {
										if (!interactive || !covered) return;
										e.preventDefault();
										const pl = placements[idx]!;
										beginDrag(idx, pl.rotation, [r - pl.row, c - pl.col], e.clientX, e.clientY);
									}}
									aria-label={`Ligne ${r + 1}, colonne ${c + 1}${isBlocked ? ', bloquée' : covered ? ', occupée' : ', libre'}`}
								/>
							);
						}),
					)}
				</div>

				{daily && dailyLoading && (
					<div className="pv-overlay">
						<div className="pv-overlay-card"><p className="pv-windiff">Préparation du défi…</p></div>
					</div>
				)}

				{daily && !dailyLoading && !started && status !== 'won' && (
					<div className="pv-overlay">
						<button className="pv-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div>
				)}

				{showWin && !daily && (
					<div className="pv-win" role="dialog" aria-label="Grille résolue">
						<div className="pv-wincard">
							<div className="pv-winmark">🧩</div>
							<h2>Résolu !</h2>
							<p className="pv-wintime">{fmtTime(elapsed)}</p>
							<p className="pv-windiff">{DIFFS[diffKey].label} · {size}×{size}</p>
							<button className="pv-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
						</div>
					</div>
				)}
			</div>

			{!daily && hintNote && (
				<p className="pv-hint-note" aria-live="polite">💡 {hintNote}</p>
			)}
			{daily && started && hintNote && (
				<p className="pv-hint-note" aria-live="polite">💡 {hintNote}</p>
			)}

			{/* Tray of remaining pieces */}
			{!revealed && status !== 'won' && interactive && (
				<div className="pv-tray" aria-label="Pièces à placer">
					{pieces.map((piece, i) => {
						if (placements[i]) return null;
						if (drag && drag.pieceIndex === i) return null; // hide while dragging
						const o = pieceRots[i][trayRot[i] ?? 0];
						const { rows, cols } = bbox(o);
						const set = new Set(o.map(([r, c]) => r * cols + c));
						return (
							<div key={piece.id} className="pv-tray-piece">
								<div
									className="pv-mini"
									style={{ gridTemplateColumns: `repeat(${cols}, var(--pv-mini-cell))` }}
									onPointerDown={(e) => {
										e.preventDefault();
										// grab cell from pointer position inside the mini-grid
										const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
										const cell = rect.width / cols;
										let gc = Math.floor((e.clientX - rect.left) / cell);
										let gr = Math.floor((e.clientY - rect.top) / cell);
										gc = Math.max(0, Math.min(cols - 1, gc));
										gr = Math.max(0, Math.min(rows - 1, gr));
										// snap grab to an actual filled cell of the piece
										const grab = nearestFilled(o, [gr, gc]);
										beginDrag(i, trayRot[i] ?? 0, grab, e.clientX, e.clientY);
									}}
								>
									{Array.from({ length: rows * cols }).map((_, k) => {
										const r = Math.floor(k / cols), c = k % cols;
										const on = set.has(r * cols + c);
										return (
											<div
												key={k}
												className={`pv-mini-cell ${on ? 'on' : 'off'}`}
												style={on ? { background: COLORS[piece.color % COLORS.length] } : undefined}
											/>
										);
									})}
								</div>
								{rotate && pieceRots[i].length > 1 && (
									<button
										className="pv-rot"
										onClick={() => rotateTray(i)}
										onPointerDown={(e) => e.stopPropagation()}
										aria-label="Tourner la pièce"
									>
										⟳
									</button>
								)}
							</div>
						);
					})}
				</div>
			)}

			{revealed ? (
				<div className="pv-revealed-note">
					<span>Solution affichée</span>
					<button className="pv-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
				</div>
			) : (
				<p className="pv-help">
					Glisse chaque pièce dans la grille pour tout couvrir. Deux pièces de même couleur ne
					doivent jamais se toucher côte à côte.{' '}
					{rotate && 'Tourne une pièce avec ⟳ (ou la touche R en cours de déplacement). '}
					Les cases barrées sont bloquées.
				</p>
			)}

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={status === 'won' ? elapsed : undefined} />
			)}
			{!daily && <LeaderboardCorner game={gameId} metric="time" />}

			{/* Floating drag ghost */}
			{dragGhost && (
				<DragGhost
					cells={pieceRots[dragGhost.pieceIndex][dragGhost.rotation]}
					color={COLORS[pieces[dragGhost.pieceIndex].color % COLORS.length]}
					cellPx={dragGhost.cellPx}
					grab={dragGhost.grab}
					x={dragGhost.x}
					y={dragGhost.y}
					valid={dragGhost.valid || dragGhost.preview == null}
				/>
			)}
		</div>
	);
}

/* Nearest filled cell of an oriented piece to a target (for a natural grab point). */
function nearestFilled(o: Cell[], target: Cell): Cell {
	let best = o[0];
	let bd = Infinity;
	for (const [r, c] of o) {
		const d = Math.abs(r - target[0]) + Math.abs(c - target[1]);
		if (d < bd) { bd = d; best = [r, c]; }
	}
	return best;
}

function DragGhost({
	cells,
	color,
	cellPx,
	grab,
	x,
	y,
	valid,
}: {
	cells: Cell[];
	color: string;
	cellPx: number;
	grab: Cell;
	x: number;
	y: number;
	valid: boolean;
}) {
	const { rows, cols } = bbox(cells);
	const set = new Set(cells.map(([r, c]) => r * cols + c));
	const left = x - (grab[1] + 0.5) * cellPx;
	const top = y - (grab[0] + 0.5) * cellPx;
	return (
		<div
			className="pv-ghost"
			style={{
				left,
				top,
				gridTemplateColumns: `repeat(${cols}, ${cellPx}px)`,
				opacity: valid ? 0.92 : 0.55,
			}}
		>
			{Array.from({ length: rows * cols }).map((_, k) => {
				const r = Math.floor(k / cols), c = k % cols;
				const on = set.has(r * cols + c);
				return (
					<div
						key={k}
						style={{
							width: cellPx,
							height: cellPx,
							background: on ? color : 'transparent',
							boxShadow: on ? 'inset 0 0 0 1.5px rgba(0,0,0,0.25)' : undefined,
						}}
					/>
				);
			})}
		</div>
	);
}

/* Empty placeholder puzzle: rendered for one frame before the mount effect
   generates the real grid (keeps mount cheap and generation off the init path). */
function emptyPuzzle(): PavagePuzzle {
	return { size: 0, blocked: [], pieces: [], solution: [], palette: 0, rotate: false };
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.pv-root {
  --pv-accent: var(--accent-regular);
  --pv-line: var(--gray-700);
  --pv-edge: var(--gray-999);
  --pv-cell: calc(100cqw / var(--n, 5));
  --pv-mini-cell: 22px;

  width: 100%;
  max-width: 460px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pv-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.75rem;
}

.pv-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 1rem;
}
.pv-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.pv-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.pv-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.pv-pill.active { background: var(--pv-accent); color: var(--accent-text-over); border-color: var(--pv-accent); }
.pv-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.pv-new {
  border: none; background: var(--pv-accent); color: var(--accent-text-over);
  font-size: 18px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1;
}

.pv-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 1rem; }
.pv-act {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.pv-act:hover { background: var(--gray-800); border-color: var(--pv-accent); color: var(--pv-accent); }

.pv-boardwrap {
  position: relative; width: 100%; max-width: 420px; margin-inline: auto; container-type: inline-size;
}
.pv-board {
  width: 100%;
  display: grid; border: 2.5px solid var(--gray-0); border-radius: 6px; overflow: hidden;
  background: var(--gray-999);
  touch-action: none;
}
.pv-cell {
  width: var(--pv-cell); height: var(--pv-cell);
  box-sizing: border-box;
  border-right: 1px solid var(--pv-line); border-bottom: 1px solid var(--pv-line);
  background: var(--gray-999);
}
.pv-cell.covered { cursor: grab; }
.pv-cell.blocked {
  background: var(--gray-700);
  background-image: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.25) 4px, rgba(0,0,0,0.25) 8px);
  cursor: not-allowed;
}
.pv-cell.prev-ok { background: var(--pv-accent) !important; opacity: 0.55; }
.pv-cell.prev-bad { background: #d9534f !important; opacity: 0.5; }
.pv-cell.hinted { box-shadow: inset 0 0 0 2px var(--gray-0) !important; }
.pv-cell.wondone { filter: saturate(1.15); }

.pv-tray {
  display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; align-items: flex-end;
  margin-top: 1.5rem; width: 100%; min-height: 60px;
}
.pv-tray-piece { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.pv-mini {
  display: grid; touch-action: none; cursor: grab; padding: 2px;
  background: var(--gray-900); border-radius: 8px;
}
.pv-mini-cell { width: var(--pv-mini-cell); height: var(--pv-mini-cell); box-sizing: border-box; }
.pv-mini-cell.on { box-shadow: inset 0 0 0 1.5px rgba(0,0,0,0.28); border-radius: 2px; }
.pv-mini-cell.off { background: transparent; }
.pv-rot {
  border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0);
  width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 15px; line-height: 1; font-weight: 700;
}
.pv-rot:hover { border-color: var(--pv-accent); color: var(--pv-accent); }

.pv-ghost {
  position: fixed; z-index: 50; display: grid; pointer-events: none;
  filter: drop-shadow(0 6px 10px rgba(0,0,0,0.35));
}

.pv-help { max-width: 380px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem; }
.pv-hint-note {
  max-width: 380px; margin: 1rem auto 0; text-align: center; font-size: 13px; line-height: 1.5;
  color: var(--gray-0); background: var(--accent-overlay); border: 1px solid var(--pv-accent);
  border-radius: 12px; padding: 8px 14px;
}
.pv-revealed-note { display: flex; align-items: center; gap: 14px; margin-top: 1.5rem; color: var(--gray-300); font-size: 14px; font-weight: 500; }

.pv-win {
  position: absolute; inset: -8px; display: flex; align-items: center; justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px;
}
.pv-wincard {
  background: var(--gray-999); border: 2px solid var(--pv-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg);
}
.pv-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 24px; color: var(--gray-0); }
.pv-winmark { font-size: 30px; }
.pv-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--pv-accent); }
.pv-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.pv-replay {
  border: none; background: var(--pv-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer;
}

.pv-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.pv-overlay { position: absolute; inset: -8px; z-index: 2; display: flex; align-items: center; justify-content: center; animation: pv-fade 0.25s ease; }
.pv-overlay-card { background: var(--gray-999); border: 2px solid var(--pv-accent); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); }
.pv-startbtn {
  border: none; background: var(--pv-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.pv-daily-won { text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem; }
.pv-daily-won strong { color: var(--pv-accent); font-variant-numeric: tabular-nums; }

@keyframes pv-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .pv-cell, .pv-win, .pv-overlay { transition: none; animation: none; } }
`;
