import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fmtCentis } from '../../lib/scoreFormat';
import { DIFFS, generateMotifs, hintReason, shapeOf, type MotifsPuzzle, type Rect } from './engine';
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
import Celebration, { useCelebration } from '../../components/Celebration';
import { touchDrag } from '../touchDrag';

/* =====================================================
   MOTIFS — React island. Split the grid into rectangles;
   each piece holds one clue (shape + sometimes area).
   Engine is pure/tested. Unique solution guaranteed.
   ===================================================== */

type Status = 'playing' | 'won';

const fmtTime = fmtCentis;

const SHAPE_GLYPH: Record<string, string> = { square: '◻', tall: '▯', wide: '▭', any: '◇' };

const PALETTE = [
	'#e5737366', '#64b5f666', '#81c78466', '#ffb74d66', '#ba68c866',
	'#4db6ac66', '#f0629266', '#a1887f66', '#9575cd66', '#4dd0e166',
];

// Daily challenge: seed + difficulty come from the server (same for everyone).
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

const rectFromCells = (a: [number, number], b: [number, number]): Rect => ({
	r0: Math.min(a[0], b[0]),
	c0: Math.min(a[1], b[1]),
	h: Math.abs(a[0] - b[0]) + 1,
	w: Math.abs(a[1] - b[1]) + 1,
});

const inRect = (p: Rect, r: number, c: number) =>
	r >= p.r0 && r < p.r0 + p.h && c >= p.c0 && c < p.c0 + p.w;

const overlaps = (a: Rect, b: Rect) =>
	!(a.r0 + a.h <= b.r0 || b.r0 + b.h <= a.r0 || a.c0 + a.w <= b.c0 || b.c0 + b.w <= a.c0);

export default function MotifsGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<MotifsPuzzle>(() => generateMotifs(DIFFS.facile));
	const [placed, setPlaced] = useState<Rect[]>([]);
	const [preview, setPreview] = useState<Rect | null>(null);
	const [status, setStatus] = useState<Status>('playing');
	const [started, setStarted] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false); // daily already completed today
	const [hintNote, setHintNote] = useState(''); // explanation of the last hint
	const startRef = useRef<number>(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const boardRef = useRef<HTMLDivElement>(null);
	const drawing = useRef(false);
	const downCell = useRef<[number, number] | null>(null);
	const anchor = useRef<[number, number] | null>(null); // fixed corner while drawing/resizing
	const moved = useRef(false);
	const resizeIdx = useRef(-1); // index of the piece being resized, or -1 for a new draw

	const { size, clues, rects } = puzzle;

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		setDaily(false);
		setAlreadyPlayed(false);
		setDiffKey(key);
		setPuzzle(generateMotifs(DIFFS[key]));
		setPlaced([]);
		setPreview(null);
		setHintNote('');
		setStatus('playing');
		setStarted(false);
		setRevealed(false);
		setElapsed(0);
	}, []);

	/* Daily challenge: one attempt per device, resumable. Server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setPreview(null);
		setRevealed(false);

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			// Resume or lock the existing attempt — regenerate from the stored seed (no fetch).
			const diffIndex = run.diffIndex ?? 0;
			const dk = DIFF_ORDER[diffIndex] ?? 'facile';
			dailySeedRef.current = { seed: run.seed, diffIndex };
			setDailyLoading(false);
			setDiffKey(dk);
			setPuzzle(generateMotifs(DIFFS[dk], mulberry32(run.seed)));
			setPlaced((run.state as Rect[]) ?? []);
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
		setPlaced([]);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const dk = DIFF_ORDER[diffIndex] ?? 'facile';
		setDiffKey(dk);
		setPuzzle(generateMotifs(DIFFS[dk], mulberry32(seed)));
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
			state: [],
		});
	}, [gameId]);

	/* Clear my entries without resetting the attempt (chrono keeps running). */
	const resetDailyEntries = useCallback(() => {
		setPlaced([]);
		setPreview(null);
		setHintNote('');
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: [],
		});
	}, [gameId]);

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
		if (!started) {
			startRef.current = Date.now();
			setStarted(true);
			trackGame(gameId, 'game_started');
		}
	}, [started, gameId]);

	/* owner[r][c] = index into `placed`, or -1. */
	const owner = useMemo(() => {
		const g: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
		placed.forEach((rect, i) => {
			for (let r = rect.r0; r < rect.r0 + rect.h; r++)
				for (let c = rect.c0; c < rect.c0 + rect.w; c++) g[r][c] = i;
		});
		return g;
	}, [placed, size]);

	/* A rect can be drawn only over empty cells (or cells of the piece being resized). */
	const rectClear = useCallback(
		(rect: Rect, except: number): boolean => {
			for (let r = rect.r0; r < rect.r0 + rect.h; r++)
				for (let c = rect.c0; c < rect.c0 + rect.w; c++)
					if (owner[r][c] !== -1 && owner[r][c] !== except) return false;
			return true;
		},
		[owner],
	);

	const clueGrid = useMemo(() => {
		const g: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
		clues.forEach((cl, i) => (g[cl.r][cl.c] = i));
		return g;
	}, [clues, size]);

	/* A placed rect is valid when it holds exactly one clue it satisfies. */
	const rectValid = useCallback(
		(rect: Rect): boolean => {
			let found = -1;
			for (let r = rect.r0; r < rect.r0 + rect.h; r++)
				for (let c = rect.c0; c < rect.c0 + rect.w; c++)
					if (clueGrid[r][c] >= 0) {
						if (found >= 0) return false;
						found = clueGrid[r][c];
					}
			if (found < 0) return false;
			const clue = clues[found];
			if (clue.shape !== 'any' && clue.shape !== shapeOf(rect.h, rect.w)) return false;
			if (clue.area != null && clue.area !== rect.h * rect.w) return false;
			return true;
		},
		[clueGrid, clues],
	);

	/* Win: every cell owned and every piece valid. */
	useEffect(() => {
		if (status === 'won' || revealed) return;
		if (daily && !started) return; // skip win-check on a daily not yet started
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (owner[r][c] === -1) return;
		if (!placed.every(rectValid)) return;
		setStatus('won');
		setPreview(null);
		trackGame(gameId, 'game_won');
	}, [owner, placed, status, revealed, size, rectValid, gameId, daily, started]);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || status === 'won') return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: placed,
		});
	}, [daily, started, status, placed, gameId]);

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
			state: placed,
		};
		saveDailyRun(gameId, snapshot);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	const addPiece = useCallback(
		(rect: Rect) => {
			setPlaced((prev) => [...prev.filter((p) => !overlaps(p, rect)), rect]);
			begin();
		},
		[begin],
	);

	const removeAt = useCallback((r: number, c: number) => {
		setPlaced((prev) => prev.filter((p) => !inRect(p, r, c)));
	}, []);

	const cellFromCoords = (clientX: number, clientY: number): [number, number] | null => {
		if (!boardRef.current) return null;
		const rect = boardRef.current.getBoundingClientRect();
		const c = Math.floor(((clientX - rect.left) / rect.width) * size);
		const r = Math.floor(((clientY - rect.top) / rect.height) * size);
		if (r < 0 || r >= size || c < 0 || c >= size) return null;
		return [r, c];
	};

	const startDrag = (clientX: number, clientY: number) => {
		if (status === 'won' || revealed || (daily && !started)) return;
		const cell = cellFromCoords(clientX, clientY);
		if (!cell) return;
		const [r, c] = cell;
		drawing.current = true;
		moved.current = false;
		downCell.current = cell;
		const idx = owner[r][c];
		resizeIdx.current = idx;
		if (idx !== -1) {
			// Start on an existing piece → resize it: anchor the corner opposite the grab.
			const p = placed[idx];
			const anchorR = r - p.r0 <= p.r0 + p.h - 1 - r ? p.r0 + p.h - 1 : p.r0;
			const anchorC = c - p.c0 <= p.c0 + p.w - 1 - c ? p.c0 + p.w - 1 : p.c0;
			anchor.current = [anchorR, anchorC];
		} else {
			anchor.current = cell;
		}
		setPreview(rectFromCells(anchor.current, cell));
	};
	const moveDrag = (clientX: number, clientY: number) => {
		if (status === 'won' || revealed || (daily && !started)) return;
		if (!drawing.current || !anchor.current || !downCell.current) return;
		const cell = cellFromCoords(clientX, clientY);
		if (!cell) return;
		if (cell[0] !== downCell.current[0] || cell[1] !== downCell.current[1]) moved.current = true;
		setPreview(rectFromCells(anchor.current, cell));
	};
	const endDrag = () => {
		if (status === 'won' || revealed || (daily && !started)) return;
		if (!drawing.current) return;
		const dc = downCell.current;
		const except = resizeIdx.current;
		if (!moved.current && dc && owner[dc[0]][dc[1]] !== -1) {
			removeAt(dc[0], dc[1]); // tap on a piece removes it
		} else if (preview && rectClear(preview, except)) {
			// Place only over empty cells (the resized piece is replaced). Never draw over another piece.
			setPlaced((prev) => {
				const kept = except >= 0 ? prev.filter((_, i) => i !== except) : prev;
				return [...kept, preview];
			});
			begin();
		}
		drawing.current = false;
		moved.current = false;
		downCell.current = null;
		anchor.current = null;
		resizeIdx.current = -1;
		setPreview(null);
	};

	const onPointerDown = (e: React.PointerEvent) => {
		if (e.pointerType === 'touch') return;
		startDrag(e.clientX, e.clientY);
		boardRef.current?.setPointerCapture(e.pointerId);
		e.preventDefault();
	};
	const onPointerMove = (e: React.PointerEvent) => {
		if (e.pointerType === 'touch') return;
		moveDrag(e.clientX, e.clientY);
	};
	const onPointerUp = (e?: React.PointerEvent) => {
		if (e && e.pointerType === 'touch') return;
		endDrag();
	};

	/* Hint: place one correct piece from the solution. */
	const hint = useCallback(() => {
		if (status === 'won' || revealed) return;
		const sameRect = (a: Rect, b: Rect) =>
			a.r0 === b.r0 && a.c0 === b.c0 && a.h === b.h && a.w === b.w;
		const matches = (rect: Rect) => {
			for (let r = rect.r0; r < rect.r0 + rect.h; r++)
				for (let c = rect.c0; c < rect.c0 + rect.w; c++) if (owner[r][c] === -1) return false;
			const idx = owner[rect.r0][rect.c0];
			const p = placed[idx];
			return p && sameRect(p, rect);
		};
		// Priority 1: replace a wrong piece (a placed rect that is no solution rect)
		// with the solution rect covering its top-left cell.
		const wrong = placed.find((p) => !rects.some((r) => sameRect(r, p)));
		let todo = wrong ? rects.find((r) => inRect(r, wrong.r0, wrong.c0)) : undefined;
		// Priority 2: reveal the next solution rect not yet correctly placed.
		if (!todo) todo = rects.find((rect) => !matches(rect));
		if (!todo) return;
		addPiece({ ...todo });
		setHintNote(hintReason(todo, puzzle));
		trackGame(gameId, 'hint_used');
	}, [status, revealed, rects, owner, placed, addPiece, puzzle, gameId]);

	/* Reveal the full partition (does not count as a win). */
	const reveal = useCallback(() => {
		if (status === 'won' || revealed) return;
		setPlaced(rects.map((r) => ({ ...r })));
		setPreview(null);
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [status, revealed, rects, gameId]);

	const previewSet = useMemo(() => {
		const s = new Set<string>();
		if (preview)
			for (let r = preview.r0; r < preview.r0 + preview.h; r++)
				for (let c = preview.c0; c < preview.c0 + preview.w; c++) s.add(`${r},${c}`);
		return s;
	}, [preview]);

	// The current drag would cover another piece's cells → invalid (shown in red).
	const previewBad = preview ? !rectClear(preview, resizeIdx.current) : false;

	const badPieces = useMemo(() => {
		const s = new Set<number>();
		placed.forEach((p, i) => {
			// only flag full pieces that are clearly wrong (hold a clue but break it,
			// or hold none) — keeps feedback gentle while drawing.
			let clueCount = 0;
			for (let r = p.r0; r < p.r0 + p.h; r++)
				for (let c = p.c0; c < p.c0 + p.w; c++) if (clueGrid[r][c] >= 0) clueCount++;
			if (clueCount > 1 || (clueCount === 1 && !rectValid(p))) s.add(i);
		});
		return s;
	}, [placed, clueGrid, rectValid]);

	const ownerColor = (r: number, c: number): string | undefined => {
		const o = owner[r][c];
		return o === -1 ? undefined : PALETTE[o % PALETTE.length];
	};
	const border = (r: number, c: number, dr: number, dc: number) => {
		const o = owner[r][c];
		const rr = r + dr, cc = c + dc;
		const o2 = rr >= 0 && rr < size && cc >= 0 && cc < size ? owner[rr][cc] : -2;
		return o !== -1 && o === o2 ? '1px solid transparent' : '2px solid var(--mo-line)';
	};

	return (
		<div className="mo-root" style={{ ['--n' as string]: size }}>
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newGame(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="mo-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			) : (
				<div className="mo-bar">
					<div className="mo-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={diffKey === k}
								className={`mo-pill ${diffKey === k ? 'active' : ''}`}
								onClick={() => newGame(k)}
							>
								{DIFFS[k].label}
							</button>
						))}
					</div>
					<div className="mo-bar-right">
						<div className="mo-timer">{fmtTime(elapsed)}</div>
						<button className="mo-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">
							↻
						</button>
					</div>
				</div>
			)}

			{daily && (
				<div className="mo-bar">
					<div className="mo-timer">{fmtTime(elapsed)}</div>
				</div>
			)}

			{status !== 'won' && !revealed && !daily && (
				<div className="mo-actions">
					<button className="mo-act" onClick={hint}>💡 Indice</button>
					{elapsed >= 60 && (
						<button className="mo-act" onClick={reveal}>👁 Voir la solution</button>
					)}
				</div>
			)}

			{daily && started && status === 'playing' && (
				<div className="mo-actions">
					<button className="mo-act" onClick={resetDailyEntries}>↺ Vider mes saisies</button>
				</div>
			)}

			{daily && status === 'won' && (
				<div className="mo-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Résolu en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			<div className="mo-boardwrap" style={{ ['--n' as string]: size }}>
				{celebrating && <Celebration />}
				<div
					className={`mo-board ${daily && !started ? 'blurred' : ''}`}
					ref={boardRef}
					style={{ gridTemplateColumns: `repeat(${size}, var(--mo-cell))` }}
					{...touchDrag(startDrag, moveDrag, endDrag)}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
					role="application"
					aria-label="Grille des motifs"
				>
					{Array.from({ length: size }).map((_, r) =>
						Array.from({ length: size }).map((_, c) => {
							const ci = clueGrid[r][c];
							const o = owner[r][c];
							const isBad = o !== -1 && badPieces.has(o);
							return (
								<div
									key={`${r}-${c}`}
									className={[
										'mo-cell',
										previewSet.has(`${r},${c}`) ? (previewBad ? 'prev prev-bad' : 'prev') : '',
										isBad ? 'bad' : '',
									].join(' ')}
									style={{
										backgroundColor: ownerColor(r, c),
										borderRight: border(r, c, 0, 1),
										borderBottom: border(r, c, 1, 0),
									}}
								>
									{ci >= 0 && (
										<span className="mo-clue">
											<span className="mo-glyph">{SHAPE_GLYPH[clues[ci].shape]}</span>
											{clues[ci].area != null && <span className="mo-area">{clues[ci].area}</span>}
										</span>
									)}
								</div>
							);
						}),
					)}
				</div>

				{daily && dailyLoading && (
					<div className="mo-overlay">
						<div className="mo-overlay-card"><p className="mo-windiff">Préparation du défi…</p></div>
					</div>
				)}

				{daily && !dailyLoading && !started && status !== 'won' && (
					<div className="mo-overlay">
						<button className="mo-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div>
				)}

				{showWin && !daily && (
					<div className="mo-win" role="dialog" aria-label="Grille résolue">
						<div className="mo-wincard">
							<div className="mo-winmark">🧩</div>
							<h2>Bien découpé !</h2>
							<p className="mo-wintime">{fmtTime(elapsed)}</p>
							<p className="mo-windiff">{DIFFS[diffKey].label} · {size}×{size}</p>
							<button className="mo-replay" onClick={() => newGame(diffKey)}>
								Rejouer
							</button>
						</div>
					</div>
				)}
			</div>

			{!daily && hintNote && (
				<p className="mo-hint-note" aria-live="polite">💡 {hintNote}</p>
			)}

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={status === 'won' ? elapsed : undefined} />
			)}

			{!daily && <LeaderboardCorner game={gameId} metric="time" />}

			{revealed ? (
				<div className="mo-revealed-note">
					<span>Solution affichée</span>
					<button className="mo-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
				</div>
			) : (
				<p className="mo-help">
					Glisse pour tracer un rectangle autour de chaque indice. ◻ carré · ▯ rectangle haut ·
					▭ rectangle large · ◇ forme libre ; le nombre, s'il est là, donne le total de cases.
					Touche un rectangle pour l'effacer.
				</p>
			)}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.mo-root {
  --mo-accent: var(--accent-regular);
  --mo-line: var(--gray-0);

  width: 100%;
  max-width: 460px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.mo-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.75rem;
}

.mo-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.mo-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.mo-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.mo-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.mo-pill.active { background: var(--mo-accent); color: var(--accent-text-over); border-color: var(--mo-accent); }
.mo-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.mo-new {
  border: none; background: var(--mo-accent); color: var(--accent-text-over);
  font-size: 18px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1;
}

.mo-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 1rem; }
.mo-act {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.mo-act:hover { background: var(--gray-800); border-color: var(--mo-accent); color: var(--mo-accent); }

.mo-boardwrap {
  position: relative;
  width: 100%;
  max-width: 420px;
  margin-inline: auto;
  container-type: inline-size;
}
.mo-board {
  width: 100%;
  --mo-cell: calc(100cqw / var(--n, 5));
  display: grid; border: 2px solid var(--mo-line); border-radius: 6px; overflow: hidden;
  background: var(--gray-999); touch-action: none; user-select: none;
}
.mo-cell {
  width: var(--mo-cell); height: var(--mo-cell);
  display: flex; align-items: center; justify-content: center; position: relative;
  transition: background-color 0.08s ease;
}
.mo-cell.prev { box-shadow: inset 0 0 0 2px var(--mo-accent); background-color: var(--accent-overlay) !important; }
.mo-cell.prev-bad { box-shadow: inset 0 0 0 2px var(--mo-bad, #d9534f); background-color: rgba(217,83,79,0.18) !important; }
.mo-cell.bad { box-shadow: inset 0 0 0 2px var(--mo-bad, #d9534f); }
.mo-clue {
  display: inline-flex; align-items: baseline; gap: 1px;
  background: var(--gray-999); border: 1px solid var(--gray-700); border-radius: 8px;
  padding: 1px 5px; line-height: 1.1;
}
.mo-glyph { color: var(--mo-accent); font-size: calc(var(--mo-cell) * 0.4); font-weight: 700; }
.mo-area { color: var(--gray-0); font-weight: 700; font-size: calc(var(--mo-cell) * 0.3); }

.mo-help {
  max-width: 400px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin-top: 1.25rem;
}
.mo-revealed-note {
  display: flex; align-items: center; gap: 14px; margin-top: 1.5rem; color: var(--gray-300); font-size: 14px; font-weight: 500;
}
.mo-hint-note {
  --mo-ok: #2f9e6f;
  max-width: 420px; margin: 1rem auto 0; text-align: center; font-size: 13px; line-height: 1.5;
  color: var(--mo-ok); background: var(--accent-overlay); border: 1px solid var(--mo-ok);
  border-radius: 12px; padding: 8px 14px;
}

.mo-win {
  position: absolute; inset: -8px; display: flex; align-items: center; justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px;
}
.mo-wincard {
  background: var(--gray-999); border: 2px solid var(--mo-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg);
}
.mo-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 24px; color: var(--gray-0); }
.mo-winmark { font-size: 30px; }
.mo-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--mo-accent); }
.mo-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.mo-replay {
  border: none; background: var(--mo-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer;
}

.mo-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.mo-overlay {
  position: absolute; inset: -8px; z-index: 2;
  display: flex; align-items: center; justify-content: center;
  animation: mo-fade 0.25s ease;
}
.mo-overlay-card {
  background: var(--gray-999); border: 2px solid var(--mo-accent);
  border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg);
}
.mo-startbtn {
  border: none; background: var(--mo-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.mo-daily-won {
  text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem;
}
.mo-daily-won strong { color: var(--mo-accent); font-variant-numeric: tabular-nums; }

@keyframes mo-fade { from { opacity: 0; } to { opacity: 1; } }

@media (prefers-reduced-motion: reduce) { .mo-cell, .mo-win, .mo-overlay { transition: none; animation: none; } }
`;
