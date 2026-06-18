import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DIFFS, SIZE, generateRondCarre, type Cell, type RondCarrePuzzle } from './engine';
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

/* =====================================================
   ROND & CARRÉ (façon LinkedIn "Tango") — React island.
   Engine lives in ./engine (pure, tested).
   ===================================================== */

type Status = 'playing' | 'won';
const HALF = SIZE / 2;
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

const emptyMarks = (): Cell[][] =>
	Array.from({ length: SIZE }, () => new Array(SIZE).fill(0) as Cell[]);

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const key = (r: number, c: number) => `${r},${c}`;

export default function RondCarreGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<RondCarrePuzzle>(() => generateRondCarre(DIFFS.facile));
	const [marks, setMarks] = useState<Cell[][]>(() => emptyMarks());
	const [status, setStatus] = useState<Status>('playing');
	const [started, setStarted] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [hinted, setHinted] = useState<Set<string>>(() => new Set());
	const [elapsed, setElapsed] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false); // daily already completed today
	const startRef = useRef<number>(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);

	const { given, constraints, solution } = puzzle;
	const n = SIZE;

	const value = useCallback(
		(r: number, c: number): Cell => (given[r][c] !== 0 ? given[r][c] : marks[r][c]),
		[given, marks],
	);

	const newGame = useCallback((k: keyof typeof DIFFS) => {
		setDaily(false);
		setAlreadyPlayed(false);
		setDiffKey(k);
		setPuzzle(generateRondCarre(DIFFS[k]));
		setMarks(emptyMarks());
		setStatus('playing');
		setStarted(false);
		setRevealed(false);
		setHinted(new Set());
		setElapsed(0);
	}, []);

	/* Daily challenge: one attempt per device, resumable. Server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setRevealed(false);
		setHinted(new Set());

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			// Resume or lock the existing attempt — regenerate from the stored seed (no fetch).
			const dk = DIFF_ORDER[run.diffIndex ?? 0] ?? 'facile';
			dailySeedRef.current = { seed: run.seed, diffIndex: run.diffIndex ?? 0 };
			setDailyLoading(false);
			setDiffKey(dk);
			setPuzzle(generateRondCarre(DIFFS[dk], mulberry32(run.seed)));
			setMarks((run.state as Cell[][]) ?? emptyMarks());
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
		setMarks(emptyMarks());
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const dk = DIFF_ORDER[diffIndex] ?? 'facile';
		setDiffKey(dk);
		setPuzzle(generateRondCarre(DIFFS[dk], mulberry32(seed)));
		setDailyLoading(false);
	}, [gameId]);

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
			state: emptyMarks(),
		});
	}, [gameId]);

	/* Clear my marks without resetting the attempt (chrono keeps running). */
	const resetDailyEntries = useCallback(() => {
		setMarks(emptyMarks());
		setHinted(new Set());
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: emptyMarks(),
		});
	}, [gameId]);

	useEffect(() => {
		if (daily) return; // daily restores its own marks
		setMarks(emptyMarks()); // backstop: marks always match the current puzzle
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [puzzle]);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing' || !started || revealed) return;
		const id = setInterval(
			() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
			250,
		);
		return () => clearInterval(id);
	}, [status, started, revealed]);

	/* Conflicts: 3-in-a-row, row/col imbalance, violated = / ≠ constraints. */
	const conflicts = useMemo(() => {
		const bad = new Set<string>();
		const v = (r: number, c: number) => (given[r][c] !== 0 ? given[r][c] : marks[r][c]);
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++) {
				const cur = v(r, c);
				if (!cur) continue;
				if (c >= 2 && v(r, c - 1) === cur && v(r, c - 2) === cur)
					[
						[r, c],
						[r, c - 1],
						[r, c - 2],
					].forEach(([a, b]) => bad.add(key(a, b)));
				if (r >= 2 && v(r - 1, c) === cur && v(r - 2, c) === cur)
					[
						[r, c],
						[r - 1, c],
						[r - 2, c],
					].forEach(([a, b]) => bad.add(key(a, b)));
			}
		const overfill = (cells: [number, number][]) => {
			let o = 0;
			let t = 0;
			for (const [r, c] of cells) {
				const x = v(r, c);
				if (x === 1) o++;
				else if (x === 2) t++;
			}
			if (o > HALF) cells.forEach(([r, c]) => v(r, c) === 1 && bad.add(key(r, c)));
			if (t > HALF) cells.forEach(([r, c]) => v(r, c) === 2 && bad.add(key(r, c)));
		};
		for (let r = 0; r < n; r++)
			overfill(Array.from({ length: n }, (_, c): [number, number] => [r, c]));
		for (let c = 0; c < n; c++)
			overfill(Array.from({ length: n }, (_, r): [number, number] => [r, c]));
		for (const { a, b, eq } of constraints) {
			const va = v(a[0], a[1]);
			const vb = v(b[0], b[1]);
			if (va && vb && (va === vb) !== eq) {
				bad.add(key(a[0], a[1]));
				bad.add(key(b[0], b[1]));
			}
		}
		return bad;
	}, [given, marks, constraints, n]);

	/* Win: grid full and conflict-free. */
	useEffect(() => {
		if (status === 'won' || revealed) return;
		for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (value(r, c) === 0) return;
		if (conflicts.size === 0) {
			setStatus('won');
			trackGame(gameId, 'game_won');
		}
	}, [marks, status, revealed, value, conflicts, n, gameId]);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || status === 'won') return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: marks,
		});
	}, [daily, started, status, marks, gameId]);

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
			state: marks,
		};
		saveDailyRun(gameId, snapshot);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	const cycle = useCallback(
		(r: number, c: number) => {
			if (daily && !started) return;
			if (status === 'won' || revealed || given[r][c] !== 0) return;
			setMarks((prev) => {
				const next = prev.map((row) => [...row]) as Cell[][];
				next[r][c] = (((next[r][c] + 1) % 3) as Cell);
				return next;
			});
			setHinted((prev) => {
				if (!prev.has(`${r},${c}`)) return prev;
				const nx = new Set(prev);
				nx.delete(`${r},${c}`);
				return nx;
			});
			if (!started) {
				startRef.current = Date.now();
				setStarted(true);
				trackGame(gameId, 'game_started');
			}
		},
		[status, revealed, started, given, daily, gameId],
	);

	/* Hint: fill the first empty, non-given cell with its solution value. */
	const hint = useCallback(() => {
		if (status === 'won' || revealed) return;
		// Priority 1: fix a wrong cell. Priority 2: fill an empty cell.
		let target: [number, number] | null = null;
		for (let r = 0; r < n && !target; r++)
			for (let c = 0; c < n && !target; c++)
				if (given[r][c] === 0 && marks[r][c] !== 0 && marks[r][c] !== solution[r][c]) target = [r, c];
		for (let r = 0; r < n && !target; r++)
			for (let c = 0; c < n && !target; c++)
				if (given[r][c] === 0 && marks[r][c] === 0) target = [r, c];
		if (!target) return;
		const [r, c] = target;
		setMarks((prev) => {
			const next = prev.map((row) => [...row]) as Cell[][];
			next[r][c] = solution[r][c];
			return next;
		});
		setHinted((prev) => new Set(prev).add(`${r},${c}`));
		if (!started) {
			startRef.current = Date.now();
			setStarted(true);
			trackGame(gameId, 'game_started');
		}
		trackGame(gameId, 'hint_used');
	}, [status, revealed, started, given, marks, solution, n, gameId]);

	/* Reveal the full solution (does not count as a win). */
	const reveal = useCallback(() => {
		if (status === 'won' || revealed) return;
		setMarks(solution.map((row) => [...row]));
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [status, revealed, solution, gameId]);

	return (
		<div className="rc-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newGame(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="rc-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			) : (
				<div className="rc-pills" role="tablist" aria-label="Difficulté">
					{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
						<button
							key={k}
							role="tab"
							aria-selected={diffKey === k}
							className={`rc-pill ${diffKey === k ? 'active' : ''}`}
							onClick={() => newGame(k)}
						>
							{DIFFS[k].label}
						</button>
					))}
				</div>
			)}

			<div className="rc-bar">
				<div className="rc-bar-right">
					<div className="rc-timer">{fmtTime(elapsed)}</div>
					{!daily && (
						<button
							className="rc-new"
							onClick={() => newGame(diffKey)}
							aria-label="Nouvelle grille"
						>
							↻
						</button>
					)}
				</div>
			</div>

			{status !== 'won' && !revealed && !daily && (
				<div className="rc-actions">
					<button className="rc-act" onClick={hint}>💡 Indice</button>
					{elapsed >= 60 && (
						<button className="rc-act" onClick={reveal}>👁 Voir la solution</button>
					)}
				</div>
			)}

			{daily && started && status === 'playing' && (
				<div className="rc-actions">
					<button className="rc-act" onClick={resetDailyEntries}>↺ Vider mes saisies</button>
				</div>
			)}

			{daily && status === 'won' && (
				<div className="rc-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Résolu en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			<div className="rc-boardwrap" style={{ ['--n' as string]: n }}>
				<div className={`rc-board ${daily && !started ? 'blurred' : ''}`}>
					{Array.from({ length: n }).map((_, r) =>
						Array.from({ length: n }).map((_, c) => {
							const x = value(r, c);
							const isGiven = given[r][c] !== 0;
							const bad = conflicts.has(key(r, c));
							return (
								<button
									key={`${r}-${c}`}
									className={[
										'rc-cell',
										isGiven ? 'given' : '',
										x === 1 ? 'rond' : x === 2 ? 'carre' : '',
										bad ? 'bad' : '',
										status === 'won' || revealed ? 'wondone' : '',
										!isGiven && hinted.has(key(r, c)) ? 'hinted' : '',
									].join(' ')}
									onClick={() => cycle(r, c)}
									aria-label={`Ligne ${r + 1}, colonne ${c + 1}${
										x === 1 ? ', rond' : x === 2 ? ', carré' : ', vide'
									}`}
									disabled={status === 'won' || revealed || (daily && !started)}
								>
									{x === 1 && <span className="rc-shape rc-rond-shape" />}
									{x === 2 && <span className="rc-shape rc-carre-shape" />}
								</button>
							);
						}),
					)}

					{/* "=" / "≠" constraint badges on the edges. */}
					<div className="rc-cons" aria-hidden="true">
						{constraints.map((cn, i) => {
							const horiz = cn.a[0] === cn.b[0];
							const left = horiz ? ((cn.a[1] + cn.b[1]) / 2 + 0.5) / n : (cn.a[1] + 0.5) / n;
							const top = horiz ? (cn.a[0] + 0.5) / n : ((cn.a[0] + cn.b[0]) / 2 + 0.5) / n;
							const va = value(cn.a[0], cn.a[1]);
							const vb = value(cn.b[0], cn.b[1]);
							const violated = va !== 0 && vb !== 0 && (va === vb) !== cn.eq;
							return (
								<span
									key={i}
									className={`rc-badge ${violated ? 'bad' : ''}`}
									style={{ left: `${left * 100}%`, top: `${top * 100}%` }}
								>
									{cn.eq ? '=' : '≠'}
								</span>
							);
						})}
					</div>
				</div>

				{daily && dailyLoading && (
					<div className="rc-overlay">
						<div className="rc-overlay-card"><p className="rc-windiff">Préparation du défi…</p></div>
					</div>
				)}

				{daily && !dailyLoading && !started && status !== 'won' && (
					<div className="rc-overlay">
						<button className="rc-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div>
				)}

				{status === 'won' && !daily && (
					<div className="rc-win" role="dialog" aria-label="Grille résolue">
						<div className="rc-wincard">
							<div className="rc-winmark">●■</div>
							<h2>Résolu !</h2>
							<p className="rc-wintime">{fmtTime(elapsed)}</p>
							<p className="rc-windiff">{DIFFS[diffKey].label}</p>
							<button className="rc-replay" onClick={() => newGame(diffKey)}>
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
				<div className="rc-revealed-note">
					<span>Solution affichée</span>
					<button className="rc-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
				</div>
			) : (
				<p className="rc-help">
					Touche une case pour cycler vide → ● → ■. Autant de ● que de ■ par ligne et colonne,
					jamais 3 identiques à la suite, et respecte les signes = (identiques) et ≠ (différents).
				</p>
			)}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.rc-root {
  --rc-accent: var(--accent-regular);
  --rc-rond: #ef8e3c;   /* ● amber */
  --rc-carre: #5b8def;  /* ■ blue */
  --rc-bad: #d9534f;
  --rc-line: var(--gray-700);
  --rc-cell: calc(100cqw / var(--n, 6));

  width: 100%;
  max-width: 460px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.rc-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.75rem;
}

.rc-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 1rem;
}
.rc-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.rc-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.75rem; }
.rc-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.rc-pill.active { background: var(--rc-accent); color: var(--accent-text-over); border-color: var(--rc-accent); }
.rc-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.rc-new {
  border: none; background: var(--rc-accent); color: var(--accent-text-over);
  font-size: 18px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1;
}

.rc-actions {
  display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 1rem;
}
.rc-act {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.rc-act:hover { background: var(--gray-800); border-color: var(--rc-accent); color: var(--rc-accent); }

.rc-revealed-note {
  display: flex; align-items: center; gap: 14px; margin-top: 1.5rem;
  color: var(--gray-300); font-size: 14px; font-weight: 500;
}

.rc-boardwrap {
  position: relative;
  width: 100%;
  max-width: 420px;
  margin-inline: auto;
  container-type: inline-size;
}
.rc-board {
  position: relative;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(var(--n), var(--rc-cell));
  border: 2.5px solid var(--gray-100);
  border-radius: 8px;
  overflow: hidden;
  background: var(--gray-999);
}
.rc-cell {
  width: var(--rc-cell); height: var(--rc-cell);
  box-sizing: border-box;
  border-right: 1px solid var(--rc-line);
  border-bottom: 1px solid var(--rc-line);
  background: var(--gray-999);
  font: inherit; font-weight: 700;
  font-size: calc(var(--rc-cell) * 0.5);
  line-height: 1;
  cursor: pointer; padding: 0;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.08s ease;
}
.rc-cell:nth-child(6n) { border-right: none; } /* last column (n=6) */
.rc-cell.given { background: var(--gray-900); cursor: default; }
.rc-shape { display: block; }
.rc-rond-shape {
  width: calc(var(--rc-cell) * 0.5); height: calc(var(--rc-cell) * 0.5);
  border-radius: 50%; background: var(--rc-rond);
}
.rc-carre-shape {
  width: calc(var(--rc-cell) * 0.46); height: calc(var(--rc-cell) * 0.46);
  border-radius: calc(var(--rc-cell) * 0.08); background: var(--rc-carre);
}
.rc-cell.bad { background: rgba(217, 83, 79, 0.16); }
.rc-cell.wondone { box-shadow: inset 0 0 0 1px var(--rc-accent); }
.rc-cell.hinted { box-shadow: inset 0 0 0 2px #2f9e6f; }

.rc-cons { position: absolute; inset: 0; pointer-events: none; }
.rc-badge {
  position: absolute; transform: translate(-50%, -50%); z-index: 3;
  min-width: 27px; height: 27px; padding: 0 3px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 999px; background: var(--gray-999); border: 1.5px solid var(--gray-300);
  color: var(--gray-0); font-weight: 800; font-size: 18px; line-height: 1;
}
.rc-badge.bad { background: var(--rc-bad); color: #fff; border-color: var(--rc-bad); }

.rc-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem; }

.rc-win {
  position: absolute; inset: -8px; z-index: 10; display: flex; align-items: center; justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px; animation: rc-fade 0.25s ease;
}
.rc-wincard { background: var(--gray-999); border: 2px solid var(--rc-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg); }
.rc-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 24px; color: var(--gray-0); }
.rc-winmark { font-size: 26px; letter-spacing: 4px; }
.rc-winmark { color: var(--rc-accent); }
.rc-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--rc-accent); }
.rc-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.rc-replay { border: none; background: var(--rc-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer; }

.rc-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.rc-overlay {
  position: absolute; inset: -8px; z-index: 2;
  display: flex; align-items: center; justify-content: center;
  animation: rc-fade 0.25s ease;
}
.rc-overlay-card {
  background: var(--gray-999); border: 2px solid var(--rc-accent);
  border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg);
}
.rc-startbtn {
  border: none; background: var(--rc-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.rc-daily-won {
  text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem;
}
.rc-daily-won strong { color: var(--rc-accent); font-variant-numeric: tabular-nums; }

@keyframes rc-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .rc-cell, .rc-win, .rc-overlay { transition: none; animation: none; } }
`;
