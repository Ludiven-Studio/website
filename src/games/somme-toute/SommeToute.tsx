import { useState, useEffect, useRef, useCallback } from 'react';
import { DIFFS, generatePuzzle, type Game } from './engine';
import { trackGame } from '../../lib/analytics';

/* =====================================================
   SOMME TOUTE — React island (training mode)
   Fill empty cells so every row and column reaches its
   target sum. Engine lives in ./engine (pure, tested).
   ===================================================== */

const emptyEntries = (size: number): (number | null)[][] =>
	Array.from({ length: size }, () => new Array(size).fill(null));

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

type Status = 'idle' | 'playing' | 'won';
type SumState = 'ok' | 'over' | 'pending';

export default function SommeToute({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [game, setGame] = useState<Game>(() => generatePuzzle(DIFFS.facile));
	const [entries, setEntries] = useState<(number | null)[][]>(() =>
		emptyEntries(DIFFS.facile.size),
	);
	const [selected, setSelected] = useState<[number, number] | null>(null);
	const [status, setStatus] = useState<Status>('idle');
	const [elapsed, setElapsed] = useState(0);
	const startRef = useRef<number>(0);

	const { puzzle, rowT, colT, size, maxVal } = game;

	const cellValue = useCallback(
		(r: number, c: number) => (puzzle[r][c] != null ? puzzle[r][c] : entries[r][c]),
		[puzzle, entries],
	);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing') return;
		const id = setInterval(
			() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
			250,
		);
		return () => clearInterval(id);
	}, [status]);

	/* Win detection */
	useEffect(() => {
		if (status === 'won') return;
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (cellValue(r, c) == null) return;
		for (let r = 0; r < size; r++) {
			let s = 0;
			for (let c = 0; c < size; c++) s += cellValue(r, c)!;
			if (s !== rowT[r]) return;
		}
		for (let c = 0; c < size; c++) {
			let s = 0;
			for (let r = 0; r < size; r++) s += cellValue(r, c)!;
			if (s !== colT[c]) return;
		}
		setStatus('won');
		setSelected(null);
		trackGame(gameId, 'game_won');
	}, [entries, status, size, rowT, colT, cellValue, gameId]);

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		const d = DIFFS[key];
		setDiffKey(key);
		setGame(generatePuzzle(d));
		setEntries(emptyEntries(d.size));
		setSelected(null);
		setStatus('idle');
		setElapsed(0);
	}, []);

	const placeValue = useCallback(
		(v: number | null) => {
			if (status === 'won' || !selected) return;
			const [r, c] = selected;
			if (puzzle[r][c] != null) return;
			setEntries((prev) => {
				const next = prev.map((row) => [...row]);
				next[r][c] = v;
				return next;
			});
			if (status === 'idle') {
				startRef.current = Date.now();
				setStatus('playing');
				trackGame(gameId, 'game_started');
			}
		},
		[status, selected, puzzle, gameId],
	);

	/* Keyboard (desktop) */
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (status === 'won') return;
			const d = parseInt(e.key, 10);
			if (d >= 1 && d <= maxVal) placeValue(d);
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
	}, [status, maxVal, selected, size, placeValue]);

	/* Sum state: ok | over | pending */
	const rowState = (r: number): SumState => {
		let s = 0, full = true;
		for (let c = 0; c < size; c++) {
			const v = cellValue(r, c);
			if (v == null) full = false;
			else s += v;
		}
		if (full) return s === rowT[r] ? 'ok' : 'over';
		return s > rowT[r] ? 'over' : 'pending';
	};
	const colState = (c: number): SumState => {
		let s = 0, full = true;
		for (let r = 0; r < size; r++) {
			const v = cellValue(r, c);
			if (v == null) full = false;
			else s += v;
		}
		if (full) return s === colT[c] ? 'ok' : 'over';
		return s > colT[c] ? 'over' : 'pending';
	};

	return (
		<div className="st-root">
			<style>{CSS}</style>

			<div className="st-bar">
				<div className="st-pills" role="tablist" aria-label="Difficulté">
					{Object.entries(DIFFS).map(([key, d]) => (
						<button
							key={key}
							role="tab"
							aria-selected={diffKey === key}
							className={`st-pill ${diffKey === key ? 'active' : ''}`}
							onClick={() => newGame(key as keyof typeof DIFFS)}
						>
							{d.label}
						</button>
					))}
				</div>
				<div className="st-bar-right">
					<div className="st-timer" aria-live="off">{fmtTime(elapsed)}</div>
					<button className="st-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">
						↻
					</button>
				</div>
			</div>

			<div className="st-boardwrap">
				<div
					className="st-board"
					style={{ gridTemplateColumns: `repeat(${size}, var(--st-cell)) auto` }}
				>
					{Array.from({ length: size }).map((_, r) => (
						<FragmentRow
							key={r}
							r={r}
							size={size}
							puzzle={puzzle}
							entries={entries}
							selected={selected}
							setSelected={setSelected}
							rowT={rowT}
							rowState={rowState}
							won={status === 'won'}
						/>
					))}
					{/* Column targets row */}
					{Array.from({ length: size }).map((_, c) => (
						<div key={`ct${c}`} className={`st-chip col ${colState(c)}`}>
							{colT[c]}
						</div>
					))}
					<div className="st-corner">Σ</div>
				</div>

				{status === 'won' && (
					<div className="st-win" role="dialog" aria-label="Grille résolue">
						<div className="st-wincard">
							<div className="st-winmark">⚖️</div>
							<h2>Équilibré !</h2>
							<p className="st-wintime">{fmtTime(elapsed)}</p>
							<p className="st-windiff">{DIFFS[diffKey].label} · {size}×{size}</p>
							<button className="st-replay" onClick={() => newGame(diffKey)}>
								Rejouer
							</button>
						</div>
					</div>
				)}
			</div>

			<div className="st-pad" aria-label="Pavé numérique">
				{Array.from({ length: maxVal }, (_, i) => i + 1).map((v) => (
					<button key={v} className="st-key" onClick={() => placeValue(v)}>
						{v}
					</button>
				))}
				<button className="st-key erase" onClick={() => placeValue(null)} aria-label="Effacer">
					⌫
				</button>
			</div>

			<p className="st-help">
				Touche une case vide puis choisis un nombre de 1 à {maxVal}.
				Les pastilles indiquent la somme cible de chaque ligne et colonne.
			</p>
		</div>
	);
}

/* One grid row + its target chip */
interface RowProps {
	r: number;
	size: number;
	puzzle: (number | null)[][];
	entries: (number | null)[][];
	selected: [number, number] | null;
	setSelected: (s: [number, number]) => void;
	rowT: number[];
	rowState: (r: number) => SumState;
	won: boolean;
}

function FragmentRow({ r, size, puzzle, entries, selected, setSelected, rowT, rowState, won }: RowProps) {
	return (
		<>
			{Array.from({ length: size }).map((_, c) => {
				const given = puzzle[r][c] != null;
				const v = given ? puzzle[r][c] : entries[r][c];
				const isSel = selected != null && selected[0] === r && selected[1] === c;
				const isPeer =
					selected != null && !isSel && (selected[0] === r || selected[1] === c);
				return (
					<button
						key={c}
						className={[
							'st-cell',
							given ? 'given' : 'entry',
							isSel ? 'sel' : '',
							isPeer ? 'peer' : '',
							won ? 'wondone' : '',
						].join(' ')}
						onClick={() => !given && setSelected([r, c])}
						aria-label={`Case ligne ${r + 1}, colonne ${c + 1}${v != null ? `, valeur ${v}` : ', vide'}`}
						disabled={won}
					>
						{v != null ? v : ''}
					</button>
				);
			})}
			<div className={`st-chip row ${rowState(r)}`}>{rowT[r]}</div>
		</>
	);
}

/* ---------- Styles (harmonized with the Ludiven charte + dark mode) ---------- */

const CSS = `
.st-root {
  --st-ink: var(--gray-0);
  --st-ink-soft: var(--gray-300);
  --st-accent: var(--accent-regular);
  --st-ok: #2f9e6f;
  --st-bad: #d9534f;
  --st-cellbg: var(--gray-999);
  --st-givenbg: var(--gray-800);
  --st-cell: clamp(42px, 11.5vw, 58px);

  width: 100%;
  max-width: 460px;
  margin-inline: auto;
  color: var(--st-ink);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}

.st-bar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.st-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.st-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.st-pill {
  border: 1.5px solid var(--gray-700);
  background: transparent;
  color: var(--st-ink-soft);
  font: inherit;
  font-weight: 500;
  font-size: 13px;
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.st-pill.active { background: var(--st-accent); color: var(--accent-text-over); border-color: var(--st-accent); }
.st-timer {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 16px;
  background: var(--gray-900);
  color: var(--gray-0);
  border-radius: 999px;
  padding: 6px 14px;
}
.st-new {
  border: none;
  background: var(--st-accent);
  color: var(--accent-text-over);
  font-size: 18px;
  width: 38px; height: 38px;
  border-radius: 50%;
  cursor: pointer;
  font-weight: 700;
  line-height: 1;
}

.st-boardwrap { position: relative; }
.st-board {
  display: grid;
  gap: 6px;
  align-items: center;
  justify-items: center;
}

.st-cell {
  width: var(--st-cell);
  height: var(--st-cell);
  border-radius: 12px;
  border: 1.5px solid transparent;
  background: var(--st-cellbg);
  box-shadow: var(--shadow-sm);
  font: inherit;
  font-weight: 700;
  font-size: calc(var(--st-cell) * 0.42);
  color: var(--st-accent);
  cursor: pointer;
  transition: transform 0.08s ease, border-color 0.08s ease, background 0.08s ease;
}
.st-cell.given {
  background: var(--st-givenbg);
  color: var(--gray-0);
  cursor: default;
  box-shadow: none;
}
.st-cell.entry.peer { border-color: var(--gray-700); }
.st-cell.entry.sel {
  border-color: var(--st-accent);
  background: var(--accent-overlay);
  transform: scale(1.04);
}
.st-cell.wondone { color: var(--st-ok); }

.st-chip {
  min-width: calc(var(--st-cell) * 0.66);
  padding: 0 8px;
  height: calc(var(--st-cell) * 0.58);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--gray-100);
  color: var(--gray-999);
  font-weight: 700;
  font-size: calc(var(--st-cell) * 0.3);
  font-variant-numeric: tabular-nums;
  transition: background 0.15s ease, transform 0.15s ease;
}
.st-chip.ok { background: var(--st-ok); color: #fff; animation: st-pop 0.3s ease; }
.st-chip.over { background: var(--st-bad); color: #fff; }
.st-corner {
  font-family: var(--font-brand);
  font-weight: 600;
  color: var(--st-ink-soft);
  font-size: calc(var(--st-cell) * 0.34);
}

@keyframes st-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.18); }
  100% { transform: scale(1); }
}

.st-pad {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 1.5rem;
  width: 100%;
}
.st-key {
  width: clamp(44px, 12vw, 56px);
  height: clamp(44px, 12vw, 56px);
  border-radius: 14px;
  border: 1.5px solid var(--gray-700);
  background: var(--gray-999);
  color: var(--st-ink);
  font: inherit;
  font-weight: 700;
  font-size: 20px;
  cursor: pointer;
}
.st-key:active { background: var(--st-accent); color: var(--accent-text-over); border-color: var(--st-accent); }
.st-key.erase { background: var(--gray-800); }

.st-help {
  max-width: 380px;
  text-align: center;
  color: var(--st-ink-soft);
  font-size: 12.5px;
  line-height: 1.5;
  margin-top: 1.25rem;
}

.st-win {
  position: absolute;
  inset: -8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04));
  backdrop-filter: blur(3px);
  border-radius: 16px;
  animation: st-fade 0.25s ease;
}
.st-wincard {
  background: var(--gray-999);
  border: 2px solid var(--st-accent);
  border-radius: 20px;
  padding: 26px 34px;
  text-align: center;
  box-shadow: var(--shadow-lg);
}
.st-wincard h2 {
  font-family: var(--font-brand);
  font-weight: 600;
  margin: 6px 0 2px;
  font-size: 24px;
  color: var(--gray-0);
}
.st-winmark { font-size: 30px; }
.st-wintime {
  font-size: 30px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin: 4px 0 0;
  color: var(--st-accent);
}
.st-windiff { color: var(--st-ink-soft); font-size: 13px; margin: 2px 0 14px; }
.st-replay {
  border: none;
  background: var(--st-accent);
  color: var(--accent-text-over);
  font: inherit;
  font-weight: 700;
  font-size: 15px;
  border-radius: 999px;
  padding: 10px 26px;
  cursor: pointer;
}

@keyframes st-fade { from { opacity: 0; } to { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .st-cell, .st-chip, .st-win { transition: none; animation: none; }
}
`;
