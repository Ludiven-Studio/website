import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SIZES, DIFFS, generateSudoku, findHint, type SudokuPuzzle } from './engine';
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

/* =====================================================
   SUDOKU — React island (training mode)
   Sizes 4×4, 6×6 and 9×9, several levels.
   Engine lives in ./engine (pure, tested).
   ===================================================== */

type SizeKey = keyof typeof SIZES;
type Status = 'playing' | 'won';

const emptyEntries = (n: number): (number | null)[][] =>
	Array.from({ length: n }, () => new Array(n).fill(null));

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const boxIndex = (r: number, c: number, boxH: number, boxW: number, n: number) =>
	Math.floor(r / boxH) * (n / boxW) + Math.floor(c / boxW);

// Daily challenge: fixed size; seed + difficulty come from the server (same for everyone).
const DAILY_SIZE: SizeKey = '9';
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

export default function SudokuGame({ gameId }: { gameId: string }) {
	const [sizeKey, setSizeKey] = useState<SizeKey>('6');
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<SudokuPuzzle>(() =>
		generateSudoku(SIZES['6'], DIFFS.facile),
	);
	const [entries, setEntries] = useState<(number | null)[][]>(() => emptyEntries(6));
	const [selected, setSelected] = useState<[number, number] | null>(null);
	const [status, setStatus] = useState<Status>('playing');
	const [started, setStarted] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [hinted, setHinted] = useState<Set<string>>(() => new Set());
	const [elapsed, setElapsed] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false); // daily already completed today
	const [hintNote, setHintNote] = useState(''); // explanation of the last hint
	const startRef = useRef<number>(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);

	const { size, boxH, boxW, given } = puzzle;

	const value = useCallback(
		(r: number, c: number) => (given[r][c] !== 0 ? given[r][c] : entries[r][c]),
		[given, entries],
	);

	const newGame = useCallback((sk: SizeKey, dk: keyof typeof DIFFS) => {
		const variant = SIZES[sk];
		setDaily(false);
		setAlreadyPlayed(false);
		setHintNote('');
		setSizeKey(sk);
		setDiffKey(dk);
		setPuzzle(generateSudoku(variant, DIFFS[dk]));
		setEntries(emptyEntries(variant.size));
		setSelected(null);
		setStatus('playing');
		setStarted(false);
		setRevealed(false);
		setHinted(new Set());
		setElapsed(0);
	}, []);

	/* Daily challenge: one attempt per device, resumable. Server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		const variant = SIZES[DAILY_SIZE];
		setDaily(true);
		setSizeKey(DAILY_SIZE);
		setSelected(null);
		setRevealed(false);
		setHinted(new Set());

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			// Resume or lock the existing attempt — regenerate from the stored seed (no fetch).
			const dk = DIFF_ORDER[run.diffIndex ?? 0] ?? 'facile';
			dailySeedRef.current = { seed: run.seed, diffIndex: run.diffIndex ?? 0 };
			setDailyLoading(false);
			setDiffKey(dk);
			setPuzzle(generateSudoku(variant, DIFFS[dk], mulberry32(run.seed)));
			setEntries((run.state as (number | null)[][]) ?? emptyEntries(variant.size));
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
		setStatus('playing');
		setStarted(false);
		setElapsed(0);
		setEntries(emptyEntries(variant.size));
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const dk = DIFF_ORDER[diffIndex] ?? 'facile';
		setDiffKey(dk);
		setPuzzle(generateSudoku(variant, DIFFS[dk], mulberry32(seed)));
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
			state: emptyEntries(SIZES[DAILY_SIZE].size),
		});
	}, [gameId]);

	/* Clear my entries without resetting the attempt (chrono keeps running). */
	const resetDailyEntries = useCallback(() => {
		const variant = SIZES[DAILY_SIZE];
		setEntries(emptyEntries(variant.size));
		setHinted(new Set());
		setSelected(null);
		setHintNote('');
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: emptyEntries(variant.size),
		});
	}, [gameId]);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing' || !started || revealed) return;
		const id = setInterval(
			() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
			250,
		);
		return () => clearInterval(id);
	}, [status, started, revealed]);

	/* Conflicts: cells whose value is duplicated in row / col / box. */
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
		for (let br = 0; br < size; br += boxH)
			for (let bc = 0; bc < size; bc += boxW) {
				const cells: [number, number][] = [];
				for (let r = 0; r < boxH; r++)
					for (let c = 0; c < boxW; c++) cells.push([br + r, bc + c]);
				scan(cells);
			}
		return set;
	}, [size, boxH, boxW, value]);

	/* Win detection: grid full and conflict-free. */
	useEffect(() => {
		if (status === 'won' || revealed) return;
		if (daily && !started) return; // skip win-check on a daily not yet started
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (value(r, c) == null) return;
		if (conflicts.size > 0) return;
		setStatus('won');
		setSelected(null);
		trackGame(gameId, 'game_won');
	}, [entries, status, revealed, size, value, conflicts, gameId, daily, started]);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || status === 'won') return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: entries,
		});
	}, [daily, started, status, entries, gameId]);

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
			state: entries,
		};
		saveDailyRun(gameId, snapshot);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	/* Hint: deduce the next logical cell and explain the technique. */
	const hint = useCallback(() => {
		if (status === 'won' || revealed) return;
		const h = findHint(entries, puzzle);
		if (!h) return;
		setEntries((prev) => {
			const next = prev.map((row) => [...row]);
			next[h.r][h.c] = h.value;
			return next;
		});
		setHinted((prev) => new Set(prev).add(`${h.r},${h.c}`));
		setHintNote(h.reason);
		if (!started) {
			startRef.current = Date.now();
			setStarted(true);
			trackGame(gameId, 'game_started');
		}
		trackGame(gameId, 'hint_used');
	}, [status, revealed, entries, puzzle, started, gameId]);

	/* Reveal the full solution (does not count as a win). */
	const reveal = useCallback(() => {
		if (status === 'won' || revealed) return;
		setEntries(puzzle.solution.map((row) => [...row]));
		setSelected(null);
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [status, revealed, puzzle, gameId]);

	const placeValue = useCallback(
		(v: number | null) => {
			if (status === 'won' || revealed || !selected || (daily && !started)) return;
			const [r, c] = selected;
			if (given[r][c] !== 0) return;
			setEntries((prev) => {
				const next = prev.map((row) => [...row]);
				next[r][c] = v;
				return next;
			});
			setHinted((prev) => {
				if (!prev.has(`${r},${c}`)) return prev;
				const n = new Set(prev);
				n.delete(`${r},${c}`);
				return n;
			});
			if (!started) {
				startRef.current = Date.now();
				setStarted(true);
				trackGame(gameId, 'game_started');
			}
		},
		[status, revealed, selected, given, started, daily, gameId],
	);

	/* Keyboard (desktop). */
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (status === 'won' || revealed) return;
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
	}, [status, revealed, size, selected, placeValue]);

	const selVal = selected ? value(selected[0], selected[1]) : null;
	const thin = '1px solid var(--sk-line)';
	const thick = '2px solid var(--sk-line-strong)';

	return (
		<div className="sk-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newGame(sizeKey, diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="sk-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label} · ${SIZES[DAILY_SIZE].label}`}
				</div>
			) : (
				<div className="sk-controls">
					<div className="sk-group" role="tablist" aria-label="Taille">
						{(Object.keys(SIZES) as SizeKey[]).map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={sizeKey === k}
								className={`sk-pill ${sizeKey === k ? 'active' : ''}`}
								onClick={() => newGame(k, diffKey)}
							>
								{SIZES[k].label}
							</button>
						))}
					</div>
					<div className="sk-group" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={diffKey === k}
								className={`sk-pill ${diffKey === k ? 'active' : ''}`}
								onClick={() => newGame(sizeKey, k)}
							>
								{DIFFS[k].label}
							</button>
						))}
					</div>
				</div>
			)}

			<div className="sk-bar">
				<div className="sk-timer" aria-live="off">{fmtTime(elapsed)}</div>
				{!daily && (
					<button
						className="sk-new"
						onClick={() => newGame(sizeKey, diffKey)}
						aria-label="Nouvelle grille"
					>
						↻ Nouvelle
					</button>
				)}
			</div>

			{status !== 'won' && !revealed && !daily && (
				<div className="sk-actions">
					<button className="sk-act" onClick={hint}>💡 Indice</button>
					{elapsed >= 60 && (
						<button className="sk-act" onClick={reveal}>👁 Voir la solution</button>
					)}
				</div>
			)}

			{daily && started && status === 'playing' && (
				<div className="sk-actions">
					<button className="sk-act" onClick={resetDailyEntries}>↺ Vider mes saisies</button>
				</div>
			)}

			{daily && status === 'won' && (
				<div className="sk-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Résolu en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			<div className="sk-boardwrap" style={{ ['--n' as string]: size }}>
				{celebrating && <Celebration />}
				<div
					className={`sk-board ${daily && !started ? 'blurred' : ''}`}
					style={{
						gridTemplateColumns: `repeat(${size}, 1fr)`,
						gridTemplateRows: `repeat(${size}, 1fr)`,
					}}
				>
					{Array.from({ length: size }).map((_, r) =>
						Array.from({ length: size }).map((_, c) => {
							const isGiven = given[r][c] !== 0;
							const v = value(r, c);
							const isSel = selected != null && selected[0] === r && selected[1] === c;
							const isPeer =
								selected != null &&
								!isSel &&
								(selected[0] === r ||
									selected[1] === c ||
									boxIndex(r, c, boxH, boxW, size) ===
										boxIndex(selected[0], selected[1], boxH, boxW, size));
							const sameVal = v != null && selVal != null && v === selVal && !isSel;
							const bad = conflicts.has(`${r},${c}`);
							return (
								<button
									key={`${r}-${c}`}
									className={[
										'sk-cell',
										isGiven ? 'given' : 'entry',
										isSel ? 'sel' : '',
										isPeer ? 'peer' : '',
										sameVal ? 'same' : '',
										bad ? 'bad' : '',
										status === 'won' || revealed ? 'wondone' : '',
										!isGiven && hinted.has(`${r},${c}`) ? 'hinted' : '',
									].join(' ')}
									style={{
										borderRight: c === size - 1 ? 'none' : (c + 1) % boxW === 0 ? thick : thin,
										borderBottom: r === size - 1 ? 'none' : (r + 1) % boxH === 0 ? thick : thin,
									}}
									onClick={() => setSelected([r, c])}
									aria-label={`Ligne ${r + 1}, colonne ${c + 1}${v != null ? `, ${v}` : ', vide'}`}
									disabled={status === 'won' || revealed || (daily && !started)}
								>
									{v != null ? v : ''}
								</button>
							);
						}),
					)}
				</div>

				{daily && dailyLoading && (
					<div className="sk-overlay">
						<div className="sk-overlay-card"><p className="sk-windiff">Préparation du défi…</p></div>
					</div>
				)}

				{daily && !dailyLoading && !started && status !== 'won' && (
					<div className="sk-overlay">
						<button className="sk-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div>
				)}

				{showWin && !daily && (
					<div className="sk-win" role="dialog" aria-label="Grille résolue">
						<div className="sk-wincard">
							<div className="sk-winmark">🧩</div>
							<h2>Résolu !</h2>
							<p className="sk-wintime">{fmtTime(elapsed)}</p>
							<p className="sk-windiff">{SIZES[sizeKey].label} · {DIFFS[diffKey].label}</p>
							<button className="sk-replay" onClick={() => newGame(sizeKey, diffKey)}>
								Rejouer
							</button>
						</div>
					</div>
				)}
			</div>

			{!daily && hintNote && (
				<p className="sk-hint-note" aria-live="polite">💡 {hintNote}</p>
			)}

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={status === 'won' ? elapsed : undefined} />
			)}

			{!daily && <LeaderboardCorner game={gameId} metric="time" />}

			{revealed ? (
				<div className="sk-revealed-note">
					<span>Solution affichée</span>
					<button className="sk-replay" onClick={() => newGame(sizeKey, diffKey)}>Rejouer</button>
				</div>
			) : (
				<>
					<div className="sk-pad" aria-label="Pavé numérique">
						{Array.from({ length: size }, (_, i) => i + 1).map((v) => (
							<button key={v} className="sk-key" onClick={() => placeValue(v)}>
								{v}
							</button>
						))}
						<button className="sk-key erase" onClick={() => placeValue(null)} aria-label="Effacer">
							⌫
						</button>
					</div>

					<p className="sk-help">
						Touche une case vide puis un chiffre de 1 à {size}. Chaque ligne, colonne et bloc
						doit contenir tous les chiffres une seule fois.
					</p>
				</>
			)}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.sk-root {
  --sk-accent: var(--accent-regular);
  --sk-ok: #2f9e6f;
  --sk-bad: #d9534f;
  --sk-line: var(--gray-700);
  --sk-line-strong: var(--gray-300);
  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.sk-controls {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  justify-content: center;
  margin-bottom: 0.75rem;
}
.sk-group { display: flex; gap: 6px; flex-wrap: wrap; }
.sk-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.75rem;
}
.sk-pill {
  border: 1.5px solid var(--gray-700);
  background: transparent;
  color: var(--gray-300);
  font: inherit;
  font-weight: 500;
  font-size: 13px;
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.sk-pill.active { background: var(--sk-accent); color: var(--accent-text-over); border-color: var(--sk-accent); }

.sk-bar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.sk-timer {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 16px;
  background: var(--gray-900);
  color: var(--gray-0);
  border-radius: 999px;
  padding: 6px 14px;
}
.sk-new {
  border: none;
  background: var(--sk-accent);
  color: var(--accent-text-over);
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  border-radius: 999px;
  padding: 8px 16px;
  cursor: pointer;
}

.sk-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.sk-act {
  border: 1.5px solid var(--gray-700);
  background: transparent;
  color: var(--gray-300);
  font: inherit;
  font-weight: 500;
  font-size: 13px;
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.sk-act:hover { background: var(--gray-800); border-color: var(--sk-accent); color: var(--sk-accent); }

.sk-revealed-note {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 1.5rem;
  color: var(--gray-300);
  font-size: 14px;
  font-weight: 500;
}

/* Site global fullscreen → the grid grows to fit the REMAINING space (controls + numpad reserved). */
.game-page:fullscreen .sk-root { max-width: none; width: 100%; height: 100%; }
.game-page:-webkit-full-screen .sk-root { max-width: none; width: 100%; height: 100%; }
.game-page:fullscreen .sk-boardwrap { flex: 1; min-height: 0; max-width: none; container-type: size; display: flex; align-items: center; justify-content: center; }
.game-page:-webkit-full-screen .sk-boardwrap { flex: 1; min-height: 0; max-width: none; container-type: size; display: flex; align-items: center; justify-content: center; }
.game-page:fullscreen .sk-board { width: min(100cqw, 100cqh); }
.game-page:-webkit-full-screen .sk-board { width: min(100cqw, 100cqh); }
.sk-boardwrap {
  position: relative;
  width: 100%;
  max-width: min(520px, calc(52px * var(--n, 6)));
  margin-inline: auto;
}
.sk-board {
  width: 100%;
  aspect-ratio: 1 / 1;
  display: grid;
  container-type: inline-size;
  border: 2px solid var(--sk-line-strong);
  border-radius: 6px;
  overflow: hidden;
  background: var(--gray-999);
}

.sk-cell {
  width: 100%;
  height: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: none;
  background: var(--gray-999);
  font: inherit;
  font-weight: 600;
  font-size: calc(46cqw / var(--n, 6));
  color: var(--sk-accent);
  cursor: pointer;
  padding: 0;
  transition: background 0.08s ease, color 0.08s ease;
}
.sk-cell.given { color: var(--gray-0); font-weight: 700; cursor: default; }
.sk-cell.peer { background: var(--gray-900); }
.sk-cell.same { background: var(--accent-overlay); }
.sk-cell.sel { background: var(--accent-overlay); box-shadow: inset 0 0 0 2px var(--sk-accent); }
.sk-cell.bad { color: var(--sk-bad); background: rgba(217, 83, 79, 0.14); }
.sk-cell.wondone { color: var(--sk-ok); }
.sk-cell.hinted { color: var(--sk-ok); }

.sk-pad {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 1.25rem;
  width: 100%;
}
.sk-key {
  min-width: clamp(40px, 11vw, 52px);
  height: clamp(40px, 11vw, 52px);
  padding: 0 0.5rem;
  border-radius: 12px;
  border: 1.5px solid var(--gray-700);
  background: var(--gray-999);
  color: var(--gray-0);
  font: inherit;
  font-weight: 700;
  font-size: 18px;
  cursor: pointer;
}
.sk-key:active { background: var(--sk-accent); color: var(--accent-text-over); border-color: var(--sk-accent); }
.sk-key.erase { background: var(--gray-800); }

.sk-help {
  max-width: 420px;
  text-align: center;
  color: var(--gray-300);
  font-size: 12.5px;
  line-height: 1.5;
  margin-top: 1.25rem;
}
.sk-hint-note {
  max-width: 420px;
  margin: 1rem auto 0;
  text-align: center;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sk-ok);
  background: var(--accent-overlay);
  border: 1px solid var(--sk-ok);
  border-radius: 12px;
  padding: 8px 14px;
}

.sk-win {
  position: absolute;
  inset: -8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04));
  backdrop-filter: blur(3px);
  border-radius: 16px;
  animation: sk-fade 0.25s ease;
}
.sk-wincard {
  background: var(--gray-999);
  border: 2px solid var(--sk-accent);
  border-radius: 20px;
  padding: 26px 34px;
  text-align: center;
  box-shadow: var(--shadow-lg);
  max-height: 82vh;
  overflow-y: auto;
}
.sk-wincard h2 {
  font-family: var(--font-brand);
  font-weight: 600;
  margin: 6px 0 2px;
  font-size: 24px;
  color: var(--gray-0);
}
.sk-winmark { font-size: 30px; }
.sk-wintime {
  font-size: 30px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin: 4px 0 0;
  color: var(--sk-accent);
}
.sk-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.sk-replay {
  border: none;
  background: var(--sk-accent);
  color: var(--accent-text-over);
  font: inherit;
  font-weight: 700;
  font-size: 15px;
  border-radius: 999px;
  padding: 10px 26px;
  cursor: pointer;
}

.sk-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.sk-overlay {
  position: absolute; inset: -8px; z-index: 2;
  display: flex; align-items: center; justify-content: center;
  animation: sk-fade 0.25s ease;
}
.sk-overlay-card {
  background: var(--gray-999); border: 2px solid var(--sk-accent);
  border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg);
}
.sk-startbtn {
  border: none; background: var(--sk-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.sk-daily-won {
  text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem;
}
.sk-daily-won strong { color: var(--sk-accent); font-variant-numeric: tabular-nums; }

@keyframes sk-fade { from { opacity: 0; } to { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .sk-cell, .sk-win, .sk-overlay { transition: none; animation: none; }
}
`;
