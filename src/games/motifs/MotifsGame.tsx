import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DIFFS, generateMotifs, shapeOf, type MotifsPuzzle, type Rect } from './engine';
import { trackGame } from '../../lib/analytics';

/* =====================================================
   MOTIFS — React island. Split the grid into rectangles;
   each piece holds one clue (shape + sometimes area).
   Engine is pure/tested. Unique solution guaranteed.
   ===================================================== */

type Status = 'playing' | 'won';

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const SHAPE_GLYPH: Record<string, string> = { square: '◻', tall: '▯', wide: '▭', any: '◇' };

const PALETTE = [
	'#e5737366', '#64b5f666', '#81c78466', '#ffb74d66', '#ba68c866',
	'#4db6ac66', '#f0629266', '#a1887f66', '#9575cd66', '#4dd0e166',
];

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
	const startRef = useRef<number>(0);
	const boardRef = useRef<HTMLDivElement>(null);
	const drawing = useRef(false);
	const downCell = useRef<[number, number] | null>(null);

	const { size, clues, rects } = puzzle;

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		setDiffKey(key);
		setPuzzle(generateMotifs(DIFFS[key]));
		setPlaced([]);
		setPreview(null);
		setStatus('playing');
		setStarted(false);
		setRevealed(false);
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

	/* owner[r][c] = index into `placed`, or -1. */
	const owner = useMemo(() => {
		const g: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
		placed.forEach((rect, i) => {
			for (let r = rect.r0; r < rect.r0 + rect.h; r++)
				for (let c = rect.c0; c < rect.c0 + rect.w; c++) g[r][c] = i;
		});
		return g;
	}, [placed, size]);

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
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (owner[r][c] === -1) return;
		if (!placed.every(rectValid)) return;
		setStatus('won');
		setPreview(null);
		trackGame(gameId, 'game_won');
	}, [owner, placed, status, revealed, size, rectValid, gameId]);

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

	const cellFromPointer = (e: React.PointerEvent): [number, number] | null => {
		if (!boardRef.current) return null;
		const rect = boardRef.current.getBoundingClientRect();
		const c = Math.floor(((e.clientX - rect.left) / rect.width) * size);
		const r = Math.floor(((e.clientY - rect.top) / rect.height) * size);
		if (r < 0 || r >= size || c < 0 || c >= size) return null;
		return [r, c];
	};

	const onPointerDown = (e: React.PointerEvent) => {
		if (status === 'won' || revealed) return;
		const cell = cellFromPointer(e);
		if (!cell) return;
		drawing.current = true;
		downCell.current = cell;
		setPreview(rectFromCells(cell, cell));
		boardRef.current?.setPointerCapture(e.pointerId);
	};
	const onPointerMove = (e: React.PointerEvent) => {
		if (!drawing.current || !downCell.current) return;
		const cell = cellFromPointer(e);
		if (!cell) return;
		setPreview(rectFromCells(downCell.current, cell));
	};
	const onPointerUp = () => {
		if (!drawing.current || !downCell.current) return;
		const rect = preview ?? rectFromCells(downCell.current, downCell.current);
		if (rect.h === 1 && rect.w === 1 && owner[rect.r0][rect.c0] !== -1) {
			removeAt(rect.r0, rect.c0); // tap on a piece removes it
		} else {
			addPiece(rect);
		}
		drawing.current = false;
		downCell.current = null;
		setPreview(null);
	};

	/* Hint: place one correct piece from the solution. */
	const hint = useCallback(() => {
		if (status === 'won' || revealed) return;
		const matches = (rect: Rect) => {
			for (let r = rect.r0; r < rect.r0 + rect.h; r++)
				for (let c = rect.c0; c < rect.c0 + rect.w; c++) if (owner[r][c] === -1) return false;
			// already covered exactly by one placed rect?
			const idx = owner[rect.r0][rect.c0];
			const p = placed[idx];
			return p && p.r0 === rect.r0 && p.c0 === rect.c0 && p.h === rect.h && p.w === rect.w;
		};
		const todo = rects.find((rect) => !matches(rect));
		if (!todo) return;
		addPiece({ ...todo });
		trackGame(gameId, 'hint_used');
	}, [status, revealed, rects, owner, placed, addPiece, gameId]);

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
		<div className="mo-root">
			<style>{CSS}</style>

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

			{status !== 'won' && !revealed && (
				<div className="mo-actions">
					<button className="mo-act" onClick={hint}>💡 Indice</button>
					{elapsed >= 60 && (
						<button className="mo-act" onClick={reveal}>👁 Voir la solution</button>
					)}
				</div>
			)}

			<div className="mo-boardwrap">
				<div
					className="mo-board"
					ref={boardRef}
					style={{ gridTemplateColumns: `repeat(${size}, var(--mo-cell))`, ['--n' as string]: size }}
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
										previewSet.has(`${r},${c}`) ? 'prev' : '',
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

				{status === 'won' && (
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
  --mo-cell: calc(min(420px, 100vw - 3.5rem) / var(--n, 5));

  width: 100%;
  max-width: 460px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
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

.mo-boardwrap { position: relative; }
.mo-board {
  display: grid; border: 2px solid var(--mo-line); border-radius: 6px; overflow: hidden;
  background: var(--gray-999); touch-action: none; user-select: none;
}
.mo-cell {
  width: var(--mo-cell); height: var(--mo-cell);
  display: flex; align-items: center; justify-content: center; position: relative;
  transition: background-color 0.08s ease;
}
.mo-cell.prev { box-shadow: inset 0 0 0 2px var(--mo-accent); background-color: var(--accent-overlay) !important; }
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

@media (prefers-reduced-motion: reduce) { .mo-cell, .mo-win { transition: none; } }
`;
