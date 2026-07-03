import { useState, useEffect, useRef, useCallback } from 'react';
import {
	DIFFS,
	generateWaterSort,
	findHint,
	legalMove,
	applyMove,
	isSolved,
	topBlock,
	type WaterPuzzle,
	type Tube,
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
   TUBES (Water Sort) — React island.
   Tap a tube then another to pour the top colour block.
   Goal: each tube empty or full of one colour. Engine pure/tested.
   ===================================================== */

type Status = 'playing' | 'won';

// Colour-blind-friendlier distinct hues (index = colour value - 1).
const COLORS = [
	'#e6483d', '#3d7ae6', '#37ab59', '#e6b800', '#9b4fe0',
	'#e6731f', '#2bb6c4', '#e85aa0', '#7d8a99',
];

// Rising-bubble descriptors per tube (x position, size, duration, horizontal wobble, delay).
const BUBBLES = [
	{ x: '24%', s: '6px', d: '3.2s', w: '4px', dl: 0 },
	{ x: '58%', s: '4px', d: '2.6s', w: '-5px', dl: 0.9 },
	{ x: '42%', s: '5px', d: '3.8s', w: '3px', dl: 1.7 },
	{ x: '70%', s: '3px', d: '2.9s', w: '-3px', dl: 2.4 },
] as const;

const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const cloneTubes = (tubes: Tube[]): Tube[] => tubes.map((t) => t.slice());

interface Snapshot {
	tubes: Tube[];
	moves: number;
	jokerUsed: boolean;
}

interface SavedState {
	tubes: Tube[];
	moves: number;
	jokerUsed: boolean;
}

interface Fresh {
	to: number;
	count: number;
}

const emptyPuzzle = (): WaterPuzzle => ({ tubes: [], height: 4, colors: 0, tubesCount: 0 });

export default function TubesGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<WaterPuzzle>(emptyPuzzle);
	const [tubes, setTubes] = useState<Tube[]>([]);
	const [selected, setSelected] = useState<number | null>(null);
	const [moves, setMoves] = useState(0);
	const [history, setHistory] = useState<Snapshot[]>([]);
	const [jokerUsed, setJokerUsed] = useState(false);
	const [status, setStatus] = useState<Status>('playing');
	const [started, setStarted] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [hintMove, setHintMove] = useState<{ from: number; to: number } | null>(null);
	const [fresh, setFresh] = useState<Fresh | null>(null);
	const startRef = useRef<number>(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);

	const height = puzzle.height;

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		const p = generateWaterSort(DIFFS[key]);
		setDaily(false);
		setAlreadyPlayed(false);
		setDiffKey(key);
		setPuzzle(p);
		setTubes(cloneTubes(p.tubes));
		setSelected(null);
		setMoves(0);
		setHistory([]);
		setJokerUsed(false);
		setHintMove(null);
		setFresh(null);
		setStatus('playing');
		setStarted(false);
		setElapsed(0);
	}, []);

	// Init free mode on mount.
	useEffect(() => {
		newGame('facile');
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* Daily challenge: one attempt per device, resumable. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setSelected(null);
		setHintMove(null);
		setFresh(null);
		setHistory([]);

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const di = run.diffIndex ?? 0;
			const dk = DIFF_ORDER[di] ?? 'facile';
			const d = DIFFS[dk];
			dailySeedRef.current = { seed: run.seed, diffIndex: di };
			setDailyLoading(false);
			setDiffKey(dk);
			const p = generateWaterSort(d, mulberry32(run.seed));
			setPuzzle(p);
			const saved = run.state as SavedState | undefined;
			setTubes(saved?.tubes ? cloneTubes(saved.tubes) : cloneTubes(p.tubes));
			setMoves(saved?.moves ?? 0);
			setJokerUsed(saved?.jokerUsed ?? false);
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
		setMoves(0);
		setJokerUsed(false);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const dk = DIFF_ORDER[diffIndex] ?? 'facile';
		const d = DIFFS[dk];
		setDiffKey(dk);
		const p = generateWaterSort(d, mulberry32(seed));
		setPuzzle(p);
		setTubes(cloneTubes(p.tubes));
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
			state: { tubes: cloneTubes(puzzle.tubes), moves: 0, jokerUsed: false } satisfies SavedState,
		});
	}, [gameId, puzzle]);

	const ensureStarted = useCallback(() => {
		if (started || daily) return;
		startRef.current = Date.now();
		setStarted(true);
		trackGame(gameId, 'game_started');
	}, [started, daily, gameId]);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing' || !started) return;
		const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 250);
		return () => clearInterval(id);
	}, [status, started]);

	/* Win detection */
	useEffect(() => {
		if (status === 'won') return;
		if (daily && !started) return;
		if (tubes.length === 0 || !isSolved(tubes, height)) return;
		setStatus('won');
		setSelected(null);
		trackGame(gameId, 'game_won');
	}, [tubes, status, daily, started, height, gameId]);

	/* Persist in-progress daily attempt. */
	useEffect(() => {
		if (!daily || !started || status === 'won') return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { tubes, moves, jokerUsed } satisfies SavedState,
		});
	}, [daily, started, status, tubes, moves, jokerUsed, gameId]);

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
			state: { tubes, moves, jokerUsed } satisfies SavedState,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	/* Clear the "freshly poured" highlight shortly after a pour. */
	useEffect(() => {
		if (!fresh) return;
		const t = setTimeout(() => setFresh(null), 340);
		return () => clearTimeout(t);
	}, [fresh]);

	const interactive = status !== 'won' && !(daily && !started);

	const pushHistory = useCallback(() => {
		setHistory((h) => [...h, { tubes: cloneTubes(tubes), moves, jokerUsed }]);
	}, [tubes, moves, jokerUsed]);

	const doPour = useCallback(
		(from: number, to: number) => {
			pushHistory();
			const count = Math.min(topBlock(tubes[from]), height - tubes[to].length);
			setTubes((prev) => applyMove(prev, { from, to }, height));
			setMoves((m) => m + 1);
			setFresh({ to, count });
			setHintMove(null);
			ensureStarted();
		},
		[pushHistory, tubes, height, ensureStarted],
	);

	const onTube = useCallback(
		(i: number) => {
			if (!interactive) return;
			if (selected === null) {
				if (tubes[i].length > 0) setSelected(i);
				return;
			}
			if (selected === i) {
				setSelected(null);
				return;
			}
			if (legalMove(tubes, selected, i, height)) {
				doPour(selected, i);
				setSelected(null);
			} else {
				// re-select the tapped tube if it has liquid, else clear
				setSelected(tubes[i].length > 0 ? i : null);
			}
		},
		[interactive, selected, tubes, height, doPour],
	);

	const undo = useCallback(() => {
		if (status === 'won') return;
		setHistory((h) => {
			if (h.length === 0) return h;
			const last = h[h.length - 1];
			setTubes(cloneTubes(last.tubes));
			setMoves(last.moves);
			setJokerUsed(last.jokerUsed);
			setSelected(null);
			setHintMove(null);
			setFresh(null);
			return h.slice(0, -1);
		});
	}, [status]);

	const restart = useCallback(() => {
		setTubes(cloneTubes(puzzle.tubes));
		setMoves(0);
		setHistory([]);
		setJokerUsed(false);
		setSelected(null);
		setHintMove(null);
		setFresh(null);
	}, [puzzle]);

	const addTube = useCallback(() => {
		if (jokerUsed || !interactive) return;
		pushHistory();
		setTubes((prev) => [...prev, []]);
		setJokerUsed(true);
		setSelected(null);
	}, [jokerUsed, interactive, pushHistory]);

	const hint = useCallback(() => {
		if (!interactive) return;
		const h = findHint(tubes, height);
		if (!h) {
			setHintMove(null);
			return;
		}
		setSelected(null);
		setHintMove({ from: h.from, to: h.to }); // suggest the pour; player performs it
		trackGame(gameId, 'hint_used');
	}, [interactive, tubes, height, gameId]);

	const tubeRows = layoutRows(tubes.length);

	return (
		<div className="ws-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newGame(diffKey)} onDaily={startDaily} />

			{daily && (
				<div className="ws-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			)}

			<div className="ws-bar">
				{!daily ? (
					<div className="ws-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={diffKey === k}
								className={`ws-pill ${diffKey === k ? 'active' : ''}`}
								onClick={() => newGame(k)}
							>
								{DIFFS[k].label}
							</button>
						))}
					</div>
				) : (
					<div />
				)}
				<div className="ws-bar-right">
					<div className="ws-stat" aria-label="Coups">{moves} coups</div>
					<div className="ws-timer">{fmtTime(elapsed)}</div>
					{!daily && (
						<button className="ws-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">↻</button>
					)}
				</div>
			</div>

			{interactive && (
				<div className="ws-actions">
					<button className="ws-act" onClick={undo} disabled={history.length === 0}>↶ Annuler</button>
					<button className="ws-act" onClick={hint}>💡 Indice</button>
					<button className="ws-act" onClick={restart}>↺ Recommencer</button>
					<button className="ws-act" onClick={addTube} disabled={jokerUsed}>➕ Tube</button>
				</div>
			)}

			{daily && status === 'won' && (
				<div className="ws-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Résolu en <strong>{fmtTime(elapsed)}</strong> · {moves} coups</>
					)}
				</div>
			)}

			<div className="ws-boardwrap">
				{celebrating && <Celebration />}
				<div className={`ws-board ${daily && !started ? 'blurred' : ''}`}>
					{tubeRows.map((row, ri) => (
						<div className="ws-row" key={ri}>
							{row.map((i) => {
								const tube = tubes[i];
								const isSel = selected === i;
								const isHint = hintMove != null && (hintMove.from === i || hintMove.to === i);
								return (
									<button
										key={i}
										className={`ws-tube ${isSel ? 'sel' : ''} ${isHint ? 'hint' : ''}`}
										style={{ ['--h' as string]: height }}
										onClick={() => onTube(i)}
										disabled={!interactive}
										aria-label={`Tube ${i + 1}, ${tube.length} sur ${height}`}
									>
										<span className="ws-glass" />
										<span className="ws-liquid">
											{tube.map((c, depth) => {
												const fromTop = tube.length - 1 - depth;
												const isFresh = fresh != null && fresh.to === i && fromTop < fresh.count;
												return (
													<span
														key={depth}
														className={`ws-seg ${fromTop === 0 ? 'surface' : ''} ${isFresh ? 'fresh' : ''}`}
														style={{
															backgroundColor: COLORS[(c - 1) % COLORS.length],
															height: `calc(100% / ${height})`,
															['--seg' as string]: depth,
														}}
													/>
												);
											})}
										</span>
										{tube.length > 0 && (
											<span
												className="ws-bubbles"
												style={{ height: `calc(100% / ${height} * ${tube.length})` }}
											>
												{BUBBLES.map((b, bi) => (
													<span
														key={bi}
														className="ws-bubble"
														style={{
															['--bx' as string]: b.x,
															['--bs' as string]: b.s,
															['--bd' as string]: b.d,
															['--bw' as string]: b.w,
															animationDelay: `${b.dl + (i % 4) * 0.5}s`,
														}}
													/>
												))}
											</span>
										)}
										<span className="ws-shine" />
									</button>
								);
							})}
						</div>
					))}
				</div>

				{daily && dailyLoading && (
					<div className="ws-overlay">
						<div className="ws-overlay-card"><p>Préparation du défi…</p></div>
					</div>
				)}

				{daily && !dailyLoading && !started && status !== 'won' && (
					<div className="ws-overlay">
						<button className="ws-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div>
				)}

				{showWin && !daily && (
					<div className="ws-win" role="dialog" aria-label="Casse-tête résolu">
						<div className="ws-wincard">
							<div className="ws-winmark">🧪</div>
							<h2>Résolu !</h2>
							<p className="ws-wintime">{fmtTime(elapsed)}</p>
							<p className="ws-windiff">{DIFFS[diffKey].label} · {moves} coups</p>
							<button className="ws-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
						</div>
					</div>
				)}
			</div>

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={status === 'won' ? elapsed : undefined} />
			)}
			{!daily && <LeaderboardCorner game={gameId} metric="time" />}

			<p className="ws-help">
				Touche un tube puis un autre pour verser la couleur du dessus (vers un tube vide ou une
				même couleur, s'il reste de la place). But : rassembler chaque couleur dans un seul tube.
			</p>
		</div>
	);
}

/* Lay tubes out into balanced rows (max 6 per row). */
function layoutRows(n: number): number[][] {
	if (n <= 0) return [];
	const perRow = n <= 6 ? n : Math.ceil(n / 2);
	const rows: number[][] = [];
	for (let i = 0; i < n; i += perRow) rows.push(Array.from({ length: Math.min(perRow, n - i) }, (_, k) => i + k));
	return rows;
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.ws-root {
  --ws-accent: var(--accent-regular);
  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.ws-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem; }

.ws-bar { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 1rem; }
.ws-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.ws-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.ws-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.ws-pill.active { background: var(--ws-accent); color: var(--accent-text-over); border-color: var(--ws-accent); }
.ws-stat { font-size: 12.5px; font-weight: 600; color: var(--gray-300); white-space: nowrap; }
.ws-timer { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px; background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px; }
.ws-new { border: none; background: var(--ws-accent); color: var(--accent-text-over); font-size: 18px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1; }

.ws-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 1.25rem; }
.ws-act {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.ws-act:hover:not(:disabled) { background: var(--gray-800); border-color: var(--ws-accent); color: var(--ws-accent); }
.ws-act:disabled { opacity: 0.4; cursor: default; }

.ws-boardwrap { position: relative; width: 100%; display: flex; flex-direction: column; align-items: center; }
.ws-board { display: flex; flex-direction: column; gap: 18px; align-items: center; padding: 8px 0; }
.ws-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.ws-row { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }

.ws-tube {
  position: relative; isolation: isolate; width: 48px; height: calc(48px * var(--h, 4) * 0.64);
  margin-top: 6px;
  padding: 0; border: none; background: transparent; cursor: pointer;
  display: flex; align-items: flex-end;
  transition: transform 0.16s cubic-bezier(0.34, 1.3, 0.5, 1);
}
.ws-tube:disabled { cursor: default; }
.ws-tube.sel { transform: translateY(-16px); }

/* Glass shell: walls + rounded bottom + faint inner tint, sits behind the liquid. */
.ws-glass {
  position: absolute; inset: 0; z-index: 0;
  border: 2.5px solid color-mix(in srgb, var(--gray-400) 60%, transparent);
  border-top: none;
  border-radius: 5px 5px 22px 22px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--gray-0) 9%, transparent), color-mix(in srgb, var(--gray-0) 3%, transparent));
  box-shadow: inset 0 -8px 14px -8px rgba(0,0,0,0.35);
  pointer-events: none;
}
/* Open rim (slim ellipse) at the top of the tube. */
.ws-glass::before {
  content: ''; position: absolute; top: -4px; left: -2.5px; right: -2.5px; height: 8px;
  border: 2.5px solid color-mix(in srgb, var(--gray-400) 60%, transparent);
  border-radius: 50%;
  background: transparent;
}
.ws-tube.hint .ws-glass,
.ws-tube.hint .ws-glass::before { border-color: var(--ws-accent); }
.ws-tube.hint .ws-glass { box-shadow: 0 0 0 2px var(--accent-overlay), inset 0 -8px 14px -8px rgba(0,0,0,0.35); }

.ws-liquid {
  position: relative; z-index: 1;
  width: calc(100% - 5px); height: 100%; margin: 0 2.5px 2.5px;
  display: flex; flex-direction: column-reverse;
  border-radius: 3px 3px 19px 19px; overflow: hidden;
}
.ws-seg {
  position: relative; width: 100%; display: block;
  background-image: linear-gradient(95deg,
    rgba(255,255,255,0.22) 0 10%,
    rgba(255,255,255,0.05) 16% 52%,
    rgba(0,0,0,0.10) 84% 100%);
  box-shadow: inset 0 -1px 0 rgba(0,0,0,0.14);
}
/* Liquid surface: subtle convex meniscus + a brighter top line. */
.ws-seg.surface { border-radius: 45% 45% 0 0 / 9px 9px 0 0; }
.ws-seg.surface::after {
  content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px;
  background: rgba(255,255,255,0.4); border-radius: 50%;
}
.ws-seg.fresh { animation: ws-drop 0.3s ease; }
@keyframes ws-drop { from { transform: translateY(-160%); opacity: 0.5; } to { transform: translateY(0); opacity: 1; } }

/* Rising bubbles, clipped to the filled portion of the tube. */
.ws-bubbles {
  position: absolute; left: 3px; right: 3px; bottom: 3px; z-index: 2;
  overflow: hidden; border-radius: 0 0 18px 18px; pointer-events: none;
}
.ws-bubble {
  position: absolute; bottom: 0; left: var(--bx);
  width: var(--bs); height: var(--bs); border-radius: 50%; opacity: 0;
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.9), rgba(255,255,255,0.3) 55%, rgba(255,255,255,0) 72%);
  animation: ws-bubble var(--bd) ease-in infinite;
}
@keyframes ws-bubble {
  0% { bottom: 3%; opacity: 0; transform: translateX(0) scale(0.5); }
  18% { opacity: 0.75; }
  82% { opacity: 0.5; }
  100% { bottom: 94%; opacity: 0; transform: translateX(var(--bw)) scale(1); }
}

/* Glass reflection on top of everything. */
.ws-shine {
  position: absolute; inset: 0; z-index: 3; pointer-events: none;
  border-radius: 5px 5px 22px 22px; overflow: hidden;
  background:
    linear-gradient(100deg, rgba(255,255,255,0.18) 0 6%, rgba(255,255,255,0) 12% 70%, rgba(255,255,255,0.08) 78% 84%, rgba(255,255,255,0) 90%);
}

.ws-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.5rem; }

.ws-overlay { position: absolute; inset: -8px; z-index: 10; display: flex; align-items: center; justify-content: center; animation: ws-fade 0.25s ease; }
.ws-overlay-card { background: var(--gray-999); border: 2px solid var(--ws-accent); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); }
.ws-startbtn { border: none; background: var(--ws-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg); }
.ws-daily-won { text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem; }
.ws-daily-won strong { color: var(--ws-accent); font-variant-numeric: tabular-nums; }

.ws-win { position: absolute; inset: -8px; z-index: 10; display: flex; align-items: center; justify-content: center; background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px; }
.ws-wincard { background: var(--gray-999); border: 2px solid var(--ws-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg); }
.ws-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 24px; color: var(--gray-0); }
.ws-winmark { font-size: 30px; }
.ws-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--ws-accent); }
.ws-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.ws-replay { border: none; background: var(--ws-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer; }

@keyframes ws-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .ws-tube, .ws-seg.fresh, .ws-win, .ws-overlay { transition: none; animation: none; }
  .ws-bubble { animation: none; opacity: 0; }
}
`;
