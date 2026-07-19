import { useState, useEffect, useRef, useCallback } from 'react';
import { fmtCentis } from '../../lib/scoreFormat';
import { DIFFS, generatePuzzle, findHint, type Game } from './engine';
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
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';
import { useLevels } from '../../lib/useLevels';
import { sommeTouteLevels } from './levels';

/* =====================================================
   SOMME TOUTE — React island (training mode)
   Fill empty cells so every row and column reaches its
   target sum. Engine lives in ./engine (pure, tested).
   ===================================================== */

const emptyEntries = (size: number): (number | null)[][] =>
	Array.from({ length: size }, () => new Array(size).fill(null));

const fmtTime = fmtCentis;

type Status = 'idle' | 'playing' | 'won';
type LineState = 'good' | 'diff' | 'empty';
interface LineInfo {
	sum: number;
	objective: number;
	state: LineState;
}

// Daily challenge: seed + difficulty come from the server (same for everyone).
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

export default function SommeToute({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [game, setGame] = useState<Game>(() => generatePuzzle(DIFFS.facile));
	const [entries, setEntries] = useState<(number | null)[][]>(() =>
		emptyEntries(DIFFS.facile.size),
	);
	const [selected, setSelected] = useState<[number, number] | null>(null);
	const [status, setStatus] = useState<Status>('idle');
	// Daily Start gate. Free mode starts implicitly (idle->playing) and ignores this.
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
	const lv = useLevels(gameId, sommeTouteLevels);

	const { puzzle, rowT, colT, size, maxVal } = game;

	const cellValue = useCallback(
		(r: number, c: number) => (puzzle[r][c] != null ? puzzle[r][c] : entries[r][c]),
		[puzzle, entries],
	);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing' || revealed) return;
		const id = setInterval(
			() => setElapsed(Math.round((Date.now() - startRef.current) / 10)),
			50,
		);
		return () => clearInterval(id);
	}, [status, revealed]);

	/* Win detection */
	useEffect(() => {
		if (status === 'won' || revealed) return;
		if (daily && !started) return; // skip win-check on a daily not yet started
		if (lv.active && !lv.playing) return; // levels grid open, not playing
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
	}, [entries, status, revealed, size, rowT, colT, cellValue, gameId, daily, started]);

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		const d = DIFFS[key];
		setDaily(false);
		setAlreadyPlayed(false);
		setHintNote('');
		setDiffKey(key);
		setGame(generatePuzzle(d));
		setEntries(emptyEntries(d.size));
		setSelected(null);
		setStatus('idle');
		setStarted(false);
		setRevealed(false);
		setHinted(new Set());
		setElapsed(0);
	}, []);

	/* Levels mode: start a level from its config; grade on solve. */
	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		const g = generatePuzzle(cfg.diff, mulberry32(cfg.seed));
		setDaily(false);
		setHintNote('');
		setGame(g);
		setEntries(emptyEntries(cfg.diff.size));
		setSelected(null);
		setRevealed(false);
		setHinted(new Set());
		setStarted(true);
		setStatus('playing');
		startRef.current = Date.now();
		setElapsed(0);
	}, [lv]);

	const armLevels = useCallback(() => {
		setDaily(false);
		lv.enter();
	}, [lv]);

	// Grade the level once it is solved (win → time).
	useEffect(() => {
		if (!lv.playing) return;
		if (status === 'won') lv.finish({ won: true, score: elapsed, raw: { size, maxVal } });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv.playing, status]);

	/* Daily challenge: one attempt per device, resumable. Server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setSelected(null);
		setRevealed(false);
		setHinted(new Set());

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			// Resume or lock the existing attempt — regenerate from the stored seed (no fetch).
			const diffIndex = run.diffIndex ?? 0;
			const dk = DIFF_ORDER[diffIndex] ?? 'facile';
			const d = DIFFS[dk];
			dailySeedRef.current = { seed: run.seed, diffIndex };
			setDailyLoading(false);
			setDiffKey(dk);
			setGame(generatePuzzle(d, mulberry32(run.seed)));
			setEntries((run.state as (number | null)[][]) ?? emptyEntries(d.size));
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
		setStatus('idle');
		setStarted(false);
		setElapsed(0);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const dk = DIFF_ORDER[diffIndex] ?? 'facile';
		const d = DIFFS[dk];
		setDiffKey(dk);
		setGame(generatePuzzle(d, mulberry32(seed)));
		setEntries(emptyEntries(d.size));
		setDailyLoading(false);
	}, [gameId]);

	const { celebrating, showWin } = useCelebration(status === 'won');

	/* Commencer: consumes the attempt and starts the chrono. */
	const startTimer = useCallback(() => {
		const now = Date.now();
		startRef.current = now;
		setStarted(true);
		setStatus('playing');
		setElapsed(0);
		trackGame(gameId, 'game_started');
		const sd = dailySeedRef.current;
		const dk = DIFF_ORDER[sd?.diffIndex ?? 0] ?? 'facile';
		saveDailyRun(gameId, {
			startedAt: now,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: emptyEntries(DIFFS[dk].size),
		});
	}, [gameId]);

	/* Clear my entries without resetting the attempt (chrono keeps running). */
	const resetDailyEntries = useCallback(() => {
		const sd = dailySeedRef.current;
		const dk = DIFF_ORDER[sd?.diffIndex ?? 0] ?? 'facile';
		setEntries(emptyEntries(DIFFS[dk].size));
		setHinted(new Set());
		setSelected(null);
		setHintNote('');
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: emptyEntries(DIFFS[dk].size),
		});
	}, [gameId]);

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
		const finalTime = Math.round((Date.now() - startRef.current) / 10);
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
		const h = findHint(entries, game);
		if (!h) return;
		setEntries((prev) => {
			const next = prev.map((row) => [...row]);
			next[h.r][h.c] = h.value;
			return next;
		});
		setHinted((prev) => new Set(prev).add(`${h.r},${h.c}`));
		setHintNote(h.reason);
		if (status === 'idle') {
			startRef.current = Date.now();
			setStatus('playing');
			trackGame(gameId, 'game_started');
		}
		trackGame(gameId, 'hint_used');
	}, [status, revealed, entries, game, gameId]);

	/* Reveal the full solution (does not count as a win). */
	const reveal = useCallback(() => {
		if (status === 'won' || revealed) return;
		setEntries(game.solution.map((row) => [...row]));
		setSelected(null);
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [status, revealed, game, gameId]);

	const placeValue = useCallback(
		(v: number | null) => {
			if (status === 'won' || revealed || !selected || (daily && !started)) return;
			const [r, c] = selected;
			if (puzzle[r][c] != null) return;
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
			if (status === 'idle') {
				startRef.current = Date.now();
				setStatus('playing');
				trackGame(gameId, 'game_started');
			}
		},
		[status, revealed, selected, puzzle, daily, started, gameId],
	);

	/* Keyboard (desktop) */
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (status === 'won' || revealed) return;
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
	}, [status, revealed, maxVal, selected, size, placeValue]);

	/* Running sum vs objective: good (matches) | diff (off) | empty (untouched). */
	const lineInfo = (sum: number, anyFilled: boolean, objective: number): LineInfo => ({
		sum,
		objective,
		state: !anyFilled ? 'empty' : sum === objective ? 'good' : 'diff',
	});
	const rowState = (r: number): LineInfo => {
		let s = 0, anyFilled = false;
		for (let c = 0; c < size; c++) {
			const v = cellValue(r, c);
			if (v != null) {
				s += v;
				anyFilled = true;
			}
		}
		return lineInfo(s, anyFilled, rowT[r]);
	};
	const colState = (c: number): LineInfo => {
		let s = 0, anyFilled = false;
		for (let r = 0; r < size; r++) {
			const v = cellValue(r, c);
			if (v != null) {
				s += v;
				anyFilled = true;
			}
		}
		return lineInfo(s, anyFilled, colT[c]);
	};

	const lockBoard = status === 'won' || revealed || (daily && !started);

	return (
		<div className="st-root" style={{ ['--n' as string]: size }}>
			<style>{CSS}</style>

			<ModeToggle
				daily={daily}
				onFree={() => { if (lv.active) { lv.exit(); newGame(diffKey); } else if (daily) newGame(diffKey); }}
				onDaily={() => { lv.exit(); startDaily(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

			{daily ? (
				<div className="st-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			) : lv.active ? (
				<div className="st-daily-tag">
					{lv.menu ? 'Progression — réussis un niveau pour débloquer le suivant' : `Niveau ${lv.level} · ${size}×${size}`}
				</div>
			) : (
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
			)}

			{(daily || (lv.active && !lv.menu)) && (
				<div className="st-bar" style={{ justifyContent: 'center' }}>
					<div className="st-timer" aria-live="off">{fmtTime(elapsed)}</div>
				</div>
			)}

			{status !== 'won' && !revealed && !daily && !(lv.active && lv.menu) && (
				<div className="st-actions">
					<button className="st-act" onClick={hint}>💡 Indice</button>
					{!lv.active && elapsed >= 60 && (
						<button className="st-act" onClick={reveal}>👁 Voir la solution</button>
					)}
				</div>
			)}

			{daily && started && status === 'playing' && (
				<div className="st-actions">
					<button className="st-act" onClick={resetDailyEntries}>↺ Vider mes saisies</button>
				</div>
			)}

			{daily && status === 'won' && (
				<div className="st-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Résolu en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			{lv.active && lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
			<div className="st-boardwrap" style={{ ['--n' as string]: size }}>
				{celebrating && <Celebration />}
				<div
					className={`st-board ${daily && !started ? 'blurred' : ''}`}
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
							rowState={rowState}
							locked={lockBoard}
							won={status === 'won' || revealed}
							hinted={hinted}
						/>
					))}
					{/* Column targets row */}
					{Array.from({ length: size }).map((_, c) => {
						const st = colState(c);
						return (
							<div
								key={`ct${c}`}
								className={`st-chip col ${st.state}`}
								aria-label={`Colonne ${c + 1} : somme ${st.sum}, objectif ${st.objective}`}
							>
								<span className="st-chip-sum">{st.sum}</span>
								<span className="st-chip-bar" />
								<span className="st-chip-obj">/{st.objective}</span>
							</div>
						);
					})}
					<div className="st-corner">Σ</div>
				</div>

				{daily && dailyLoading && (
					<div className="st-overlay">
						<div className="st-overlay-card"><p className="st-windiff">Préparation du défi…</p></div>
					</div>
				)}

				{daily && !dailyLoading && !started && status !== 'won' && (
					<div className="st-overlay">
						<button className="st-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div>
				)}

				{showWin && !daily && !lv.active && (
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

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={sommeTouteLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won ? `Résolu en ${fmtTime(elapsed)}` : undefined}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
			</div>
			)}

			{!daily && hintNote && (
				<p className="st-hint-note" aria-live="polite">💡 {hintNote}</p>
			)}

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={status === 'won' ? elapsed : undefined} />
			)}

			{!daily && !lv.active && <LeaderboardCorner game={gameId} metric="time" />}

			{revealed ? (
				<div className="st-revealed-note">
					<span>Solution affichée</span>
					<button className="st-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
				</div>
			) : (
				<>
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
						Chaque pastille montre la somme actuelle et l'objectif : elle passe en bleu quand la somme est atteinte.
					</p>
				</>
			)}
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
	rowState: (r: number) => LineInfo;
	locked: boolean;
	won: boolean;
	hinted: Set<string>;
}

function FragmentRow({ r, size, puzzle, entries, selected, setSelected, rowState, locked, won, hinted }: RowProps) {
	const st = rowState(r);
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
							!given && hinted.has(`${r},${c}`) ? 'hinted' : '',
						].join(' ')}
						onClick={() => !given && !locked && setSelected([r, c])}
						aria-label={`Case ligne ${r + 1}, colonne ${c + 1}${v != null ? `, valeur ${v}` : ', vide'}`}
						disabled={locked}
					>
						{v != null ? v : ''}
					</button>
				);
			})}
			<div
				className={`st-chip row ${st.state}`}
				aria-label={`Ligne ${r + 1} : somme ${st.sum}, objectif ${st.objective}`}
			>
				<span className="st-chip-sum">{st.sum}</span>
				<span className="st-chip-bar" />
				<span className="st-chip-obj">/{st.objective}</span>
			</div>
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
  --st-good: #2f6df0;
  --st-diff: #e8870c;
  --st-cellbg: var(--gray-999);
  --st-givenbg: var(--gray-800);
  --st-cell: calc(100cqw / (var(--n, 6) + 1));

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
.st-daily-tag {
  text-align: center; color: var(--st-ink-soft); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.75rem;
}
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

.st-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.st-act {
  border: 1.5px solid var(--gray-700);
  background: transparent;
  color: var(--st-ink-soft);
  font: inherit;
  font-weight: 500;
  font-size: 13px;
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.st-act:hover { background: var(--gray-800); border-color: var(--st-accent); color: var(--st-accent); }

.st-revealed-note {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 1.5rem;
  color: var(--st-ink-soft);
  font-size: 14px;
  font-weight: 500;
}

.st-boardwrap {
  position: relative;
  width: 100%;
  max-width: calc(56px * (var(--n, 6) + 1));
  margin-inline: auto;
  container-type: inline-size;
}
.st-board {
  width: 100%;
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
.st-cell.hinted { color: var(--st-ok); }

.st-chip {
  min-width: calc(var(--st-cell) * 0.66);
  height: var(--st-cell);
  padding: 0 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: transparent;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.st-chip-sum {
  font-weight: 800;
  font-size: calc(var(--st-cell) * 0.3);
  color: var(--st-ink-soft);
  transition: color 0.15s ease;
}
.st-chip-bar {
  width: 62%;
  height: 2px;
  border-radius: 2px;
  background: transparent;
  transition: background 0.15s ease;
}
.st-chip-obj {
  font-weight: 600;
  font-size: calc(var(--st-cell) * 0.2);
  color: var(--st-ink-soft);
}
.st-chip.diff .st-chip-sum { color: var(--st-diff); }
.st-chip.diff .st-chip-bar { background: var(--st-diff); }
.st-chip.good .st-chip-sum { color: var(--st-good); }
.st-chip.good .st-chip-bar { background: var(--st-good); }
.st-chip.good { animation: st-pop 0.3s ease; }
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
.st-hint-note {
  max-width: 420px;
  margin: 1rem auto 0;
  text-align: center;
  font-size: 13px;
  line-height: 1.5;
  color: var(--st-ok);
  background: var(--accent-overlay);
  border: 1px solid var(--st-ok);
  border-radius: 12px;
  padding: 8px 14px;
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

.st-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.st-overlay {
  position: absolute; inset: -8px; z-index: 2;
  display: flex; align-items: center; justify-content: center;
  animation: st-fade 0.25s ease;
}
.st-overlay-card {
  background: var(--gray-999); border: 2px solid var(--st-accent);
  border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg);
}
.st-startbtn {
  border: none; background: var(--st-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.st-daily-won {
  text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem;
}
.st-daily-won strong { color: var(--st-accent); font-variant-numeric: tabular-nums; }

@keyframes st-fade { from { opacity: 0; } to { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .st-cell, .st-chip, .st-win, .st-overlay { transition: none; animation: none; }
}
`;
