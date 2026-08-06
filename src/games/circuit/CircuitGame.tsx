import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fmtCentis } from '../../lib/scoreFormat';
import {
	BIT,
	DIFFS,
	DIFF_ORDER,
	findHint,
	generateCircuit,
	isSolved,
	litCells,
	parTurns,
	rotate,
	turnsTo,
	type CircuitPuzzle,
} from './engine';
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
import GiveUp, { RevealNote } from '../../components/GiveUp';
import { useLevels } from '../../lib/useLevels';
import { circuitLevels } from './levels';
import { usePointerDrag } from '../usePointerDrag';
import { useHintGate } from '../useHintGate';
import { diffKeys } from '../../lib/difficulty';

/* =====================================================
   CIRCUIT (Netwalk) — React island.
   Tap a tile to spin it a quarter-turn; light the whole network from ⚡.
   Engine lives in ./engine (pure, tested).
   ===================================================== */

type Status = 'loading' | 'playing' | 'won';

const fmtTime = fmtCentis;

/** Where each side meets the tile edge, in the 100×100 tile viewBox. N E S W. */
const SIDE: readonly (readonly [number, number])[] = [[50, 0], [100, 50], [50, 100], [0, 50]];

const zeros = (n: number): number[] => new Array<number>(n).fill(0);

function Tile({ base, spin, lit }: { base: number; spin: number; lit: boolean }) {
	const arms = [0, 1, 2, 3].filter((d) => base & BIT[d]);
	return (
		<svg
			className={`cir-tile ${lit ? 'lit' : ''}`}
			viewBox="0 0 100 100"
			style={{ transform: `rotate(${spin * 90}deg)` }}
			aria-hidden="true"
		>
			{arms.map((d) => (
				<line key={d} x1={50} y1={50} x2={SIDE[d][0]} y2={SIDE[d][1]} />
			))}
			{arms.length === 1 ? (
				<rect className="cir-end" x={28} y={28} width={44} height={44} rx={12} />
			) : (
				<circle className="cir-hub" cx={50} cy={50} r={10} />
			)}
		</svg>
	);
}

export default function CircuitGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<CircuitPuzzle | null>(null);
	const [spin, setSpin] = useState<number[]>([]); // quarter-turns applied per tile
	const [taps, setTaps] = useState(0);
	const [status, setStatus] = useState<Status>('loading');
	const [started, setStarted] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [hintNote, setHintNote] = useState('');
	const [elapsed, setElapsed] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false); // daily already completed today
	const startRef = useRef<number>(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const lv = useLevels(gameId, circuitLevels);
	const boardRef = useRef<HTMLDivElement>(null);
	const timed = daily || lv.playing; // both race the chrono → hints on a cooldown
	const gate = useHintGate(timed, status === 'playing' && started && !revealed);

	/* The dealt tiles never change; the player only accumulates quarter-turns. */
	const masks = useMemo(
		() => (puzzle ? puzzle.start.map((m, i) => rotate(m, spin[i] ?? 0)) : []),
		[puzzle, spin],
	);
	const lit = useMemo(
		() => (puzzle ? litCells(masks, puzzle.size, puzzle.wrap, puzzle.source) : []),
		[masks, puzzle],
	);
	const litCount = useMemo(() => lit.reduce((n, on) => n + (on ? 1 : 0), 0), [lit]);

	const newGame = useCallback((dk: keyof typeof DIFFS) => {
		setDaily(false);
		setAlreadyPlayed(false);
		setDiffKey(dk);
		setStatus('loading');
		setStarted(false);
		setRevealed(false);
		setHintNote('');
		setElapsed(0);
		setTaps(0);
		const p = generateCircuit(DIFFS[dk]);
		setPuzzle(p);
		setSpin(zeros(p.start.length));
		setStatus('playing');
	}, []);

	useEffect(() => {
		newGame('facile');
	}, [newGame]);

	/* Levels mode: start a level from its config; grade on solve. */
	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		setDaily(false);
		setDiffKey('facile');
		setRevealed(false);
		setHintNote('');
		setStatus('loading');
		setElapsed(0);
		setTaps(0);
		const p = generateCircuit(cfg.diff, mulberry32(cfg.seed));
		setPuzzle(p);
		setSpin(zeros(p.start.length));
		setStatus('playing');
		setStarted(false); // ready-gate: blurred board + ▶ Commencer starts the chrono
	}, [lv]);

	const armLevels = useCallback(() => {
		setDaily(false);
		lv.enter();
	}, [lv]);

	// Levels is the default landing: resume at the next unlocked level (grid once all cleared).
	// A ?defi deep link opens the daily instead — skip auto-resume then.
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily') return;
		void lv.resume().then((next) => { if (next != null) startLevel(next); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* Grade the level once solved (win → time). */
	useEffect(() => {
		if (!lv.playing) return;
		if (status === 'won') lv.finish({ won: true, score: Math.round((Date.now() - startRef.current) / 10), raw: { size: puzzle?.size } });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv.playing, status]);

	/* Daily challenge: one attempt per device, resumable. Server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setRevealed(false);
		setHintNote('');
		setTaps(0);

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			// Resume or lock the existing attempt — regenerate from the stored seed (no fetch).
			const diffIndex = run.diffIndex ?? 0;
			const dk = DIFF_ORDER[diffIndex] ?? 'facile';
			dailySeedRef.current = { seed: run.seed, diffIndex };
			setDailyLoading(false);
			setDiffKey(dk);
			const p = generateCircuit(DIFFS[dk], mulberry32(run.seed));
			setPuzzle(p);
			setSpin((run.state as number[]) ?? zeros(p.start.length));
			setStarted(true);
			if (run.done && run.abandoned) {
				// Gave up earlier today: the stored grid IS the solution, and it never won.
				setAlreadyPlayed(true);
				setRevealed(true);
				setStatus('playing');
				setElapsed(run.finalTime ?? 0);
			} else if (run.done) {
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
		setStatus('loading');
		setStarted(false);
		setElapsed(0);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const dk = DIFF_ORDER[diffIndex] ?? 'facile';
		setDiffKey(dk);
		const p = generateCircuit(DIFFS[dk], mulberry32(seed));
		setPuzzle(p);
		setSpin(zeros(p.start.length));
		setStatus('playing');
		setDailyLoading(false);
	}, [gameId]);

	const { celebrating, showWin } = useCelebration(status === 'won');

	/* Commencer: consumes the attempt and starts the chrono. */
	const startTimer = useCallback(() => {
		if (!puzzle) return;
		const now = Date.now();
		startRef.current = now;
		setStarted(true);
		setElapsed(0);
		trackGame(gameId, 'game_started');
		if (daily) {
			const sd = dailySeedRef.current;
			saveDailyRun(gameId, {
				startedAt: now,
				done: false,
				seed: sd?.seed,
				diffIndex: sd?.diffIndex,
				state: zeros(puzzle.start.length),
			});
		}
	}, [gameId, puzzle, daily]);

	/* Clear my turns without resetting the attempt (chrono keeps running). */
	const resetDailyEntries = useCallback(() => {
		if (!puzzle) return;
		const fresh = zeros(puzzle.start.length);
		setSpin(fresh);
		setHintNote('');
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: fresh,
		});
	}, [gameId, puzzle]);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing' || !started || revealed) return;
		const id = setInterval(
			() => setElapsed(Math.round((Date.now() - startRef.current) / 10)),
			50,
		);
		return () => clearInterval(id);
	}, [status, started, revealed]);

	/* Win: no loose end anywhere and every tile fed from the generator. */
	useEffect(() => {
		if (!puzzle || status !== 'playing' || revealed) return;
		if (daily && !started) return; // skip win-check on a daily not yet started
		if (lv.active && !lv.playing) return; // levels grid open, not playing
		if (!isSolved(masks, puzzle.size, puzzle.wrap, puzzle.source)) return;
		setStatus('won');
		trackGame(gameId, 'game_won');
	}, [masks, puzzle, status, revealed, gameId, daily, started, lv.active, lv.playing]);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || status === 'won' || revealed) return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: spin,
		});
	}, [daily, started, status, revealed, spin, gameId]);

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
			state: spin,
		};
		saveDailyRun(gameId, snapshot);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	const begin = useCallback(() => {
		if (!started) {
			startRef.current = Date.now();
			setStarted(true);
			trackGame(gameId, 'game_started');
		}
	}, [started, gameId]);

	/* Spin one tile. `dir` is +1 clockwise, -1 the other way (right-click on desktop). */
	const turn = useCallback(
		(idx: number, dir: number) => {
			if (status !== 'playing' || revealed || !puzzle) return;
			begin();
			setTaps((t) => t + 1);
			setSpin((prev) => {
				const next = prev.slice();
				next[idx] = (next[idx] ?? 0) + dir;
				return next;
			});
		},
		[status, revealed, puzzle, begin],
	);

	const cellFromCoords = (clientX: number, clientY: number): number | null => {
		if (!boardRef.current || !puzzle) return null;
		const rect = boardRef.current.getBoundingClientRect();
		const n = puzzle.size;
		const c = Math.floor(((clientX - rect.left) / rect.width) * n);
		const r = Math.floor(((clientY - rect.top) / rect.height) * n);
		if (r < 0 || r >= n || c < 0 || c >= n) return null;
		return r * n + c;
	};

	/* Act on press, not on release: the tile should snap the instant the finger lands. */
	const onPress = (clientX: number, clientY: number) => {
		if ((daily || lv.playing) && !started) return; // armed but not started: overlay owns the board
		const idx = cellFromCoords(clientX, clientY);
		if (idx != null) turn(idx, 1);
	};
	const noop = () => { /* taps only — nothing to track between press and release */ };
	const { onPointerDown } = usePointerDrag(onPress, noop, noop);

	const onContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		if ((daily || lv.playing) && !started) return;
		const idx = cellFromCoords(e.clientX, e.clientY);
		if (idx != null) turn(idx, -1);
	};

	const resetTurns = () => {
		if (!puzzle || revealed) return;
		setSpin(zeros(puzzle.start.length));
		setHintNote('');
		if (status === 'won') setStatus('playing');
	};

	/* Hint: straighten the misplaced tile nearest the generator. */
	const hint = useCallback(() => {
		if (!puzzle || status !== 'playing' || revealed || !gate.ready) return;
		const h = findHint(masks, puzzle);
		if (!h) return;
		gate.consume();
		setHintNote(h.reason);
		setSpin((prev) => {
			const next = prev.slice();
			next[h.idx] = (next[h.idx] ?? 0) + h.turns;
			return next;
		});
		begin();
		trackGame(gameId, 'hint_used');
	}, [puzzle, masks, status, revealed, gameId, gate, begin]);

	/* Reveal the whole network (does not count as a win). */
	const solvedSpin = useCallback(
		(): number[] => (puzzle ? masks.map((m, i) => (spin[i] ?? 0) + turnsTo(m, puzzle.solution[i])) : []),
		[puzzle, masks, spin],
	);

	const reveal = useCallback(() => {
		if (!puzzle || status !== 'playing' || revealed) return;
		setSpin(solvedSpin());
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [puzzle, status, revealed, gameId, solvedSpin]);

	/* Daily give-up: show the solution and close the attempt — nothing is submitted. */
	const giveUp = useCallback(() => {
		if (!puzzle) return;
		const solved = solvedSpin();
		const sd = dailySeedRef.current;
		setSpin(solved);
		setHintNote('');
		setRevealed(true);
		setAlreadyPlayed(true);
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: true,
			finalTime: Math.round((Date.now() - startRef.current) / 10),
			abandoned: true,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: solved,
		});
		trackGame(gameId, 'solution_shown');
	}, [puzzle, gameId, solvedSpin]);

	const n = puzzle?.size ?? 0;
	const par = puzzle ? parTurns(puzzle.start, puzzle.solution) : 0;

	return (
		<div className="cir-root" style={{ ['--n' as string]: n }}>
			<style>{CSS}</style>

			<ModeToggle
				daily={daily}
				onFree={() => { if (lv.active) { lv.exit(); newGame(diffKey); } else if (daily) newGame(diffKey); }}
				onDaily={() => { lv.exit(); startDaily(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

			{lv.active && (
				<div className="cir-daily-tag">
					{lv.menu
						? 'Progression — réussis un niveau pour débloquer le suivant'
						: `Niveau ${lv.level} · ${n}×${n}${puzzle?.wrap ? ' · bords bouclés' : ''}`}
				</div>
			)}

			{!lv.active && (daily ? (
				<div className="cir-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			) : (
				<div className="cir-bar">
					<div className="cir-pills" role="tablist" aria-label="Difficulté">
						{diffKeys(DIFFS, gameId).map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={diffKey === k}
								className={`cir-pill ${diffKey === k ? 'active' : ''}`}
								onClick={() => newGame(k)}
							>
								{DIFFS[k].label}
							</button>
						))}
					</div>
					<div className="cir-bar-right">
						<div className="cir-timer chrono">{fmtTime(elapsed)}</div>
						<button className="cir-new" onClick={resetTurns} aria-label="Remettre les tuiles comme au départ">
							⌫
						</button>
					</div>
				</div>
			))}

			{!lv.active && daily && (
				<div className="cir-bar cir-bar-daily">
					<div className="cir-timer chrono">{fmtTime(elapsed)}</div>
				</div>
			)}

			{puzzle && status !== 'loading' && !(lv.active && lv.menu) && (
				<div className="cir-gauge" aria-live="polite">
					⚡ <strong>{litCount}</strong>/{n * n} alimentées
				</div>
			)}

			{status === 'playing' && !revealed && !(lv.active && lv.menu) && (
				<div className="cir-actions">
					<button className="cir-act" onClick={hint} disabled={!gate.ready || (timed && !started)}>{gate.label}</button>
					{!daily && !lv.active && elapsed >= 60 && (
						<button className="cir-act" onClick={reveal}>👁 Voir la solution</button>
					)}
					{daily && started && (
						<button className="cir-act" onClick={resetDailyEntries}>↺ Vider mes saisies</button>
					)}
				</div>
			)}

			{daily && started && !revealed && status !== 'won' && puzzle && <GiveUp onGiveUp={giveUp} />}

			{daily && status === 'won' && (
				<div className="cir-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Réseau alimenté en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			{lv.active && lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
			<div className="cir-boardwrap" style={{ ['--n' as string]: n }}>
				{celebrating && <Celebration />}
				{status === 'loading' || !puzzle ? (
					<div className="cir-loading">Génération…</div>
				) : (
					<div
						className={`cir-board ${(daily || lv.playing) && !started ? 'blurred' : ''}`}
						ref={boardRef}
						style={{
							gridTemplateColumns: `repeat(${n}, 1fr)`,
							gridTemplateRows: `repeat(${n}, 1fr)`,
						}}
						onPointerDown={onPointerDown}
						onContextMenu={onContextMenu}
						role="application"
						aria-label="Réseau à rebrancher"
					>
						{puzzle.start.map((base, i) => (
							<div key={i} className={`cir-cell ${lit[i] ? 'lit' : ''}`}>
								<Tile base={base} spin={spin[i] ?? 0} lit={!!lit[i]} />
								{i === puzzle.source && <span className="cir-src">⚡</span>}
							</div>
						))}
					</div>
				)}

				{daily && dailyLoading && (
					<div className="cir-overlay">
						<div className="cir-overlay-card"><p className="cir-windiff">Préparation…</p></div>
					</div>
				)}

				{((daily && !dailyLoading) || lv.playing) && !started && status !== 'won' && puzzle && (
					<div className="cir-overlay">
						<button className="cir-startbtn" onClick={startTimer}>
							{lv.playing ? `▶ Niveau ${lv.level} — Commencer` : '▶ Commencer'}
						</button>
					</div>
				)}

				{showWin && !daily && !lv.active && (
					<div className="cir-win" role="dialog" aria-label="Réseau alimenté">
						<div className="cir-wincard">
							<div className="cir-winmark">⚡</div>
							<h2>Tout est allumé&nbsp;!</h2>
							<p className="cir-wintime">{fmtTime(elapsed)}</p>
							<p className="cir-windiff">{taps} tours · minimum {par}</p>
							<button className="cir-replay" onClick={() => newGame(diffKey)}>
								Rejouer
							</button>
						</div>
					</div>
				)}

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={circuitLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won ? `Alimenté en ${fmtTime(elapsed)}` : undefined}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
			</div>
			)}

			{hintNote && !(lv.active && lv.menu) && (
				<p className="cir-hint-note" aria-live="polite">💡 {hintNote}</p>
			)}

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={status === 'won' && !revealed ? elapsed : undefined} />
			)}

			{!daily && !lv.active && <LeaderboardCorner game={gameId} metric="time" />}

			{revealed ? (
				daily ? (
					<RevealNote />
				) : (
				<div className="cir-revealed-note">
					<span>Solution affichée</span>
					<button className="cir-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
				</div>
				)
			) : (
				<p className="cir-help">
					Touche une tuile pour la faire pivoter d'un quart de tour. Tout le réseau doit partir
					du générateur ⚡ et alimenter chaque tuile, sans laisser un seul tuyau dans le vide.
					{puzzle?.wrap && ' Ici les bords bouclent : un tuyau qui sort à droite revient à gauche.'}
				</p>
			)}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.cir-root {
  --cir-accent: var(--accent-regular);
  --cir-off: var(--gray-500);
  /* Fluid cell: the board fills its (capped) container, so bigger grids get
     smaller cells and the board never exceeds mobile width. */
  --cir-cell: calc(100cqw / var(--n, 5));

  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cir-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.75rem;
}

.cir-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.cir-bar-daily { justify-content: center; }

.cir-gauge {
  color: var(--gray-300); font-size: 13px; font-weight: 500;
  margin-bottom: 0.75rem;
}
.cir-gauge strong { color: var(--cir-accent); font-variant-numeric: tabular-nums; }

.cir-actions {
  display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;
  margin-bottom: 1rem;
}
.cir-act {
  border: 1.5px solid var(--gray-700);
  background: transparent;
  color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px;
  border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.cir-act:hover { background: var(--gray-800); border-color: var(--cir-accent); color: var(--cir-accent); }

.cir-revealed-note {
  display: flex; align-items: center; gap: 14px;
  margin-top: 1.25rem;
  color: var(--gray-300); font-size: 14px; font-weight: 500;
}
.cir-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.cir-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.cir-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.cir-pill.active { background: var(--cir-accent); color: var(--accent-text-over); border-color: var(--cir-accent); }
.cir-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.cir-new {
  border: none; background: var(--gray-800); color: var(--gray-0);
  font-size: 16px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1;
}

.cir-boardwrap {
  position: relative;
  width: 100%;
  max-width: 420px;
  margin-inline: auto;
  container-type: inline-size;
}
.cir-loading {
  display: flex; align-items: center; justify-content: center;
  width: 100%; aspect-ratio: 1 / 1;
  color: var(--gray-300); font-weight: 600;
}
.cir-board {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  display: grid;
  border: 2.5px solid var(--gray-100);
  border-radius: 8px;
  overflow: hidden;
  background: var(--gray-999);
  touch-action: none;
  user-select: none;
}
.cir-cell {
  position: relative;
  width: 100%; height: 100%; min-width: 0;
  box-sizing: border-box;
  border-right: 1px solid var(--gray-800);
  border-bottom: 1px solid var(--gray-800);
  display: flex; align-items: center; justify-content: center;
  transition: background-color 0.18s ease;
}
.cir-cell.lit { background: var(--accent-overlay); }

.cir-tile {
  width: 100%; height: 100%; display: block;
  transition: transform 0.16s ease-out;
}
.cir-tile line {
  stroke: var(--cir-off); stroke-width: 15; stroke-linecap: round;
  transition: stroke 0.18s ease;
}
.cir-tile .cir-hub { fill: var(--cir-off); transition: fill 0.18s ease; }
.cir-tile .cir-end {
  fill: var(--gray-999); stroke: var(--cir-off); stroke-width: 12;
  transition: fill 0.18s ease, stroke 0.18s ease;
}
.cir-tile.lit line { stroke: var(--cir-accent); }
.cir-tile.lit .cir-hub { fill: var(--cir-accent); }
.cir-tile.lit .cir-end { fill: var(--cir-accent); stroke: var(--cir-accent); }

.cir-src {
  position: absolute; z-index: 2;
  font-size: calc(var(--cir-cell) * 0.44);
  line-height: 1;
  pointer-events: none;
  filter: drop-shadow(0 0 3px var(--gray-999));
}

.cir-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.cir-overlay {
  position: absolute; inset: -8px; z-index: 3;
  display: flex; align-items: center; justify-content: center;
  animation: cir-fade 0.25s ease;
}
.cir-overlay-card {
  background: var(--gray-999); border: 2px solid var(--cir-accent);
  border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg);
}
.cir-startbtn {
  border: none; background: var(--cir-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.cir-daily-won {
  text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem;
}
.cir-daily-won strong { color: var(--cir-accent); font-variant-numeric: tabular-nums; }

.cir-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem; }

.cir-hint-note {
  max-width: 420px;
  margin: 1rem auto 0;
  text-align: center;
  font-size: 13px;
  line-height: 1.5;
  color: #2f9e6f;
  background: var(--accent-overlay);
  border: 1px solid #2f9e6f;
  border-radius: 12px;
  padding: 8px 14px;
}

.cir-win {
  position: absolute; inset: -8px; z-index: 10; display: flex; align-items: center; justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px; animation: cir-fade 0.25s ease;
}
.cir-wincard { background: var(--gray-999); border: 2px solid var(--cir-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg); }
.cir-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 24px; color: var(--gray-0); }
.cir-winmark { font-size: 30px; }
.cir-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--cir-accent); }
.cir-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.cir-replay { border: none; background: var(--cir-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer; }

@keyframes cir-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .cir-win, .cir-overlay { animation: none; }
  .cir-tile { transition: none; }
}
`;
