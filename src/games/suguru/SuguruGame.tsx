import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DIFFS, generateSuguru, type SuguruPuzzle } from './engine';
import { trackGame } from '../../lib/analytics';

/* =====================================================
   SUGURU (Tectonic) — React island.
   Fill each zone of k cells with 1..k; two equal digits
   may never touch (incl. diagonally). Engine is pure/tested.
   ===================================================== */

type Status = 'playing' | 'won';

const N8 = [
	[-1, -1], [-1, 0], [-1, 1],
	[0, -1], [0, 1],
	[1, -1], [1, 0], [1, 1],
];

const emptyEntries = (n: number): (number | null)[][] =>
	Array.from({ length: n }, () => new Array(n).fill(null));

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function SuguruGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<SuguruPuzzle>(() => generateSuguru(DIFFS.facile));
	const [entries, setEntries] = useState<(number | null)[][]>(() => emptyEntries(DIFFS.facile.size));
	const [selected, setSelected] = useState<[number, number] | null>(null);
	const [status, setStatus] = useState<Status>('playing');
	const [started, setStarted] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const startRef = useRef<number>(0);

	const { size, zones, zoneSize, maxDigit, given, solution } = puzzle;

	const value = useCallback(
		(r: number, c: number) => (given[r][c] != null ? given[r][c] : entries[r][c]),
		[given, entries],
	);

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		const d = DIFFS[key];
		const p = generateSuguru(d);
		setDiffKey(key);
		setPuzzle(p);
		setEntries(emptyEntries(d.size));
		setSelected(null);
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

	const zoneOf = useMemo(() => {
		const map = new Map<number, [number, number][]>();
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) {
				const z = zones[r][c];
				if (!map.has(z)) map.set(z, []);
				map.get(z)!.push([r, c]);
			}
		return map;
	}, [zones, size]);

	/* Conflicts: equal digits touching (8-dir) or repeated within a zone. */
	const conflicts = useMemo(() => {
		const bad = new Set<string>();
		const v = (r: number, c: number) => (given[r][c] != null ? given[r][c] : entries[r][c]);
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) {
				const cur = v(r, c);
				if (cur == null) continue;
				for (const [dr, dc] of N8) {
					const rr = r + dr, cc = c + dc;
					if (rr >= 0 && rr < size && cc >= 0 && cc < size && v(rr, cc) === cur) {
						bad.add(`${r},${c}`);
						bad.add(`${rr},${cc}`);
					}
				}
			}
		for (const cells of zoneOf.values()) {
			const seen = new Map<number, [number, number]>();
			for (const [r, c] of cells) {
				const cur = v(r, c);
				if (cur == null) continue;
				const prev = seen.get(cur);
				if (prev) {
					bad.add(`${r},${c}`);
					bad.add(`${prev[0]},${prev[1]}`);
				} else seen.set(cur, [r, c]);
			}
		}
		return bad;
	}, [given, entries, zoneOf, size]);

	/* Win: grid full, conflict-free. */
	useEffect(() => {
		if (status === 'won' || revealed) return;
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (value(r, c) == null) return;
		if (conflicts.size > 0) return;
		setStatus('won');
		setSelected(null);
		trackGame(gameId, 'game_won');
	}, [entries, status, revealed, size, value, conflicts, gameId]);

	const placeValue = useCallback(
		(v: number | null) => {
			if (status === 'won' || revealed || !selected) return;
			const [r, c] = selected;
			if (given[r][c] != null) return;
			if (v != null && v > zoneSize[zones[r][c]]) return; // out of zone range
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
		[status, revealed, selected, given, zones, zoneSize, started, gameId],
	);

	/* Hint: fill the selected empty cell (else the first empty) from the solution. */
	const hint = useCallback(() => {
		if (status === 'won' || revealed) return;
		let target: [number, number] | null =
			selected && given[selected[0]][selected[1]] == null && entries[selected[0]][selected[1]] == null
				? selected
				: null;
		for (let r = 0; r < size && !target; r++)
			for (let c = 0; c < size && !target; c++)
				if (given[r][c] == null && entries[r][c] == null) target = [r, c];
		if (!target) return;
		const [r, c] = target;
		setEntries((prev) => {
			const next = prev.map((row) => [...row]);
			next[r][c] = solution[r][c];
			return next;
		});
		if (!started) {
			startRef.current = Date.now();
			setStarted(true);
			trackGame(gameId, 'game_started');
		}
		trackGame(gameId, 'hint_used');
	}, [status, revealed, selected, given, entries, size, solution, started, gameId]);

	/* Reveal the full solution (does not count as a win). */
	const reveal = useCallback(() => {
		if (status === 'won' || revealed) return;
		setEntries(solution.map((row) => [...row]));
		setSelected(null);
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [status, revealed, solution, gameId]);

	/* Keyboard. */
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (status === 'won' || revealed) return;
			const d = parseInt(e.key, 10);
			if (d >= 1 && d <= maxDigit) placeValue(d);
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
	}, [status, revealed, maxDigit, selected, size, placeValue]);

	const thin = '1px solid var(--sg-line)';
	const thick = '2.5px solid var(--sg-line-strong)';

	return (
		<div className="sg-root">
			<style>{CSS}</style>

			<div className="sg-bar">
				<div className="sg-pills" role="tablist" aria-label="Difficulté">
					{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
						<button
							key={k}
							role="tab"
							aria-selected={diffKey === k}
							className={`sg-pill ${diffKey === k ? 'active' : ''}`}
							onClick={() => newGame(k)}
						>
							{DIFFS[k].label}
						</button>
					))}
				</div>
				<div className="sg-bar-right">
					<div className="sg-timer">{fmtTime(elapsed)}</div>
					<button className="sg-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">
						↻
					</button>
				</div>
			</div>

			{status !== 'won' && !revealed && (
				<div className="sg-actions">
					<button className="sg-act" onClick={hint}>💡 Indice</button>
					{elapsed >= 60 && (
						<button className="sg-act" onClick={reveal}>👁 Voir la solution</button>
					)}
				</div>
			)}

			<div className="sg-boardwrap">
				<div
					className="sg-board"
					style={{ gridTemplateColumns: `repeat(${size}, var(--sg-cell))`, ['--n' as string]: size }}
				>
					{Array.from({ length: size }).map((_, r) =>
						Array.from({ length: size }).map((_, c) => {
							const isGiven = given[r][c] != null;
							const v = value(r, c);
							const isSel = selected != null && selected[0] === r && selected[1] === c;
							const bad = conflicts.has(`${r},${c}`);
							return (
								<button
									key={`${r}-${c}`}
									className={[
										'sg-cell',
										isGiven ? 'given' : 'entry',
										isSel ? 'sel' : '',
										bad ? 'bad' : '',
										status === 'won' || revealed ? 'wondone' : '',
									].join(' ')}
									style={{
										borderRight:
											c === size - 1 ? 'none' : zones[r][c] !== zones[r][c + 1] ? thick : thin,
										borderBottom:
											r === size - 1 ? 'none' : zones[r][c] !== zones[r + 1][c] ? thick : thin,
									}}
									onClick={() => setSelected([r, c])}
									aria-label={`Ligne ${r + 1}, colonne ${c + 1}${v != null ? `, ${v}` : ', vide'}`}
									disabled={status === 'won' || revealed}
								>
									{v != null ? v : ''}
								</button>
							);
						}),
					)}
				</div>

				{status === 'won' && (
					<div className="sg-win" role="dialog" aria-label="Grille résolue">
						<div className="sg-wincard">
							<div className="sg-winmark">🧩</div>
							<h2>Résolu !</h2>
							<p className="sg-wintime">{fmtTime(elapsed)}</p>
							<p className="sg-windiff">{DIFFS[diffKey].label} · {size}×{size}</p>
							<button className="sg-replay" onClick={() => newGame(diffKey)}>
								Rejouer
							</button>
						</div>
					</div>
				)}
			</div>

			{revealed ? (
				<div className="sg-revealed-note">
					<span>Solution affichée</span>
					<button className="sg-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
				</div>
			) : (
				<>
					<div className="sg-pad" aria-label="Pavé numérique">
						{Array.from({ length: maxDigit }, (_, i) => i + 1).map((v) => (
							<button key={v} className="sg-key" onClick={() => placeValue(v)}>
								{v}
							</button>
						))}
						<button className="sg-key erase" onClick={() => placeValue(null)} aria-label="Effacer">
							⌫
						</button>
					</div>

					<p className="sg-help">
						Remplis chaque zone avec 1 à sa taille. Deux mêmes chiffres ne peuvent jamais se
						toucher, même en diagonale.
					</p>
				</>
			)}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.sg-root {
  --sg-accent: var(--accent-regular);
  --sg-ok: #2f9e6f;
  --sg-bad: #d9534f;
  --sg-line: var(--gray-700);
  --sg-line-strong: var(--gray-0);
  --sg-cell: calc(min(420px, 100vw - 3.5rem) / var(--n, 5));

  width: 100%;
  max-width: 460px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.sg-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.sg-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.sg-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.sg-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.sg-pill.active { background: var(--sg-accent); color: var(--accent-text-over); border-color: var(--sg-accent); }
.sg-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.sg-new {
  border: none; background: var(--sg-accent); color: var(--accent-text-over);
  font-size: 18px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1;
}

.sg-actions {
  display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 1rem;
}
.sg-act {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.sg-act:hover { background: var(--gray-800); border-color: var(--sg-accent); color: var(--sg-accent); }

.sg-boardwrap { position: relative; }
.sg-board {
  display: grid; border: 2.5px solid var(--sg-line-strong); border-radius: 6px; overflow: hidden; background: var(--gray-999);
}
.sg-cell {
  width: var(--sg-cell); height: var(--sg-cell);
  border: none; background: var(--gray-999); color: var(--sg-accent);
  font: inherit; font-weight: 700; font-size: calc(var(--sg-cell) * 0.44);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: background 0.08s ease;
}
.sg-cell.given { color: var(--gray-0); background: var(--gray-800); cursor: default; }
.sg-cell.sel { background: var(--accent-overlay); box-shadow: inset 0 0 0 2px var(--sg-accent); }
.sg-cell.bad { color: var(--sg-bad); }
.sg-cell.wondone { color: var(--sg-ok); }

.sg-pad {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 1.5rem; width: 100%;
}
.sg-key {
  width: clamp(44px, 12vw, 56px); height: clamp(44px, 12vw, 56px);
  border-radius: 14px; border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0);
  font: inherit; font-weight: 700; font-size: 20px; cursor: pointer;
}
.sg-key:active { background: var(--sg-accent); color: var(--accent-text-over); border-color: var(--sg-accent); }
.sg-key.erase { background: var(--gray-800); }

.sg-help {
  max-width: 380px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem;
}

.sg-revealed-note {
  display: flex; align-items: center; gap: 14px; margin-top: 1.5rem; color: var(--gray-300); font-size: 14px; font-weight: 500;
}

.sg-win {
  position: absolute; inset: -8px; display: flex; align-items: center; justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px;
}
.sg-wincard {
  background: var(--gray-999); border: 2px solid var(--sg-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg);
}
.sg-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 24px; color: var(--gray-0); }
.sg-winmark { font-size: 30px; }
.sg-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--sg-accent); }
.sg-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.sg-replay {
  border: none; background: var(--sg-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
  .sg-cell, .sg-win { transition: none; animation: none; }
}
`;
