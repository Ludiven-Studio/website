import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fmtCentis } from '../../lib/scoreFormat';
import {
	DIFFS,
	DIFF_ORDER,
	applyHint,
	distToSeg,
	findHint,
	generateCordes,
	inBox,
	isSolved,
	ropeFault,
	segHitsPath,
	type CordesPuzzle,
	type Pt,
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
import { cordesLevels } from './levels';
import { usePointerDrag } from '../usePointerDrag';
import { useHintGate } from '../useHintGate';
import { diffKeys } from '../../lib/difficulty';

/* =====================================================
   CORDES — React island.
   Drag from a peg to its twin. Ropes stay in the frame and never cross.
   Engine lives in ./engine (pure, tested).
   ===================================================== */

type Status = 'loading' | 'playing' | 'won';
type Board = (Pt[] | null)[];

const fmtTime = fmtCentis;

/** The SVG works in hundredths so stroke widths stay readable numbers. */
const V = 100;

const HUE = ['#e0567a', '#3fa9f5', '#f0a12e', '#4cc38a', '#a06bff', '#ff7a45', '#2ec9c9', '#c2b03a'];

/** How far the finger travels before the rope gains a joint. */
const STEP = 0.016;

const nulls = (n: number): Board => new Array<Pt[] | null>(n).fill(null);

/* The saved daily board is raw coordinates, so it only means something on the pegs it was
   drawn against. GEN_V bumps with the generator: an attempt saved against an older board
   is dropped instead of redrawn as scribbles over the new pegs. */
const GEN_V = 5;
const packBoard = (ropes: Board) => ({ v: GEN_V, ropes });
const unpackBoard = (saved: unknown, n: number): Board | null => {
	const o = saved as { v?: number; ropes?: Board } | null;
	return o && o.v === GEN_V && Array.isArray(o.ropes) && o.ropes.length === n ? o.ropes : null;
};

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

const pointsAttr = (path: Pt[]): string => path.map((p) => `${p.x * V},${p.y * V}`).join(' ');

export default function CordesGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<CordesPuzzle | null>(null);
	const [ropes, setRopes] = useState<Board>([]);
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
	const lv = useLevels(gameId, cordesLevels);
	const boardRef = useRef<HTMLDivElement>(null);
	/** The rope under the finger: which one, where it has to land, and what it has drawn so far. */
	const drawRef = useRef<{ rope: number; target: Pt; path: Pt[] } | null>(null);
	const ropesRef = useRef<Board>([]);
	ropesRef.current = ropes;
	const timed = daily || lv.playing; // both race the chrono → hints on a cooldown
	const gate = useHintGate(timed, status === 'playing' && started && !revealed);

	const tied = useMemo(
		() => (puzzle ? ropes.filter((path, r) => path && ropeFault(path, r, ropes, puzzle) === null).length : 0),
		[ropes, puzzle],
	);

	const deal = useCallback((p: CordesPuzzle) => {
		setPuzzle(p);
		setRopes(nulls(p.ropes));
		drawRef.current = null;
	}, []);

	const newGame = useCallback((dk: keyof typeof DIFFS) => {
		setDaily(false);
		setAlreadyPlayed(false);
		setDiffKey(dk);
		setStatus('loading');
		setStarted(false);
		setRevealed(false);
		setHintNote('');
		setElapsed(0);
		deal(generateCordes(DIFFS[dk]));
		setStatus('playing');
	}, [deal]);

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
		deal(generateCordes(cfg.diff, mulberry32(cfg.seed)));
		setStatus('playing');
		setStarted(false); // ready-gate: blurred board + ▶ Commencer starts the chrono
	}, [lv, deal]);

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
		if (status === 'won') lv.finish({ won: true, score: Math.round((Date.now() - startRef.current) / 10), raw: { ropes: puzzle?.ropes } });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv.playing, status]);

	/* Daily challenge: one attempt per device, resumable. Server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setRevealed(false);
		setHintNote('');

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			// Resume or lock the existing attempt — regenerate from the stored seed (no fetch).
			const diffIndex = run.diffIndex ?? 0;
			const dk = DIFF_ORDER[diffIndex] ?? 'facile';
			dailySeedRef.current = { seed: run.seed, diffIndex };
			setDailyLoading(false);
			setDiffKey(dk);
			const p = generateCordes(DIFFS[dk], mulberry32(run.seed));
			deal(p);
			const saved = unpackBoard(run.state, p.ropes);
			setStarted(true);
			if (run.done && run.abandoned) {
				// Gave up earlier today: the stored board IS the solution, and it never won.
				setRopes(saved ?? p.solution.slice());
				setAlreadyPlayed(true);
				setRevealed(true);
				setStatus('playing');
				setElapsed(run.finalTime ?? 0);
			} else if (run.done) {
				setRopes(saved ?? nulls(p.ropes));
				setAlreadyPlayed(true);
				setStatus('won');
				setElapsed(run.finalTime ?? 0);
			} else {
				setRopes(saved ?? nulls(p.ropes));
				setAlreadyPlayed(false);
				setStatus('playing');
				startRef.current = run.startedAt;
				setElapsed(Math.round((Date.now() - run.startedAt) / 10));
			}
			return;
		}

		// Fresh: fetch today's seed and arm the board (Start not pressed yet).
		setAlreadyPlayed(false);
		setStatus('loading');
		setStarted(false);
		setElapsed(0);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const dk = DIFF_ORDER[diffIndex] ?? 'facile';
		setDiffKey(dk);
		deal(generateCordes(DIFFS[dk], mulberry32(seed)));
		setStatus('playing');
		setDailyLoading(false);
	}, [gameId, deal]);

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
				state: packBoard(nulls(puzzle.ropes)),
			});
		}
	}, [gameId, puzzle, daily]);

	/* Timer */
	useEffect(() => {
		if (status !== 'playing' || !started || revealed) return;
		const id = setInterval(
			() => setElapsed(Math.round((Date.now() - startRef.current) / 10)),
			50,
		);
		return () => clearInterval(id);
	}, [status, started, revealed]);

	/* Win: every rope tied, none crossing. */
	useEffect(() => {
		if (!puzzle || status !== 'playing' || revealed) return;
		if (daily && !started) return; // skip win-check on a daily not yet started
		if (lv.active && !lv.playing) return; // levels grid open, not playing
		if (!isSolved(ropes, puzzle)) return;
		setStatus('won');
		trackGame(gameId, 'game_won');
	}, [ropes, puzzle, status, revealed, gameId, daily, started, lv.active, lv.playing]);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || status === 'won' || revealed) return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: packBoard(ropes),
		});
	}, [daily, started, status, revealed, ropes, gameId]);

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
			state: packBoard(ropes),
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

	const put = useCallback((r: number, path: Pt[] | null) => {
		setRopes((prev) => {
			const next = prev.slice();
			next[r] = path;
			return next;
		});
	}, []);

	/* ---------- Drawing ---------- */

	const toUnit = (clientX: number, clientY: number): Pt | null => {
		const el = boardRef.current;
		if (!el) return null;
		const rect = el.getBoundingClientRect();
		return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
	};

	/** Can the rope reach `c` from its head without breaking a rule? */
	const canExtend = useCallback((path: Pt[], c: Pt, rope: number, board: Board, p: CordesPuzzle): boolean => {
		if (!inBox(c)) return false;
		const h = path[path.length - 1];
		if (segHitsPath(h, c, path, 1)) return false; // its own body, minus the joint it starts from
		for (let r = 0; r < board.length; r++) {
			const o = board[r];
			if (r === rope || !o) continue;
			if (segHitsPath(h, c, o)) return false;
		}
		for (let r = 0; r < p.ends.length; r++) {
			if (r === rope) continue;
			for (const peg of p.ends[r]) if (distToSeg(peg, h, c) < p.pegR) return false;
		}
		return true;
	}, []);

	const onPress = (clientX: number, clientY: number) => {
		if (!puzzle || status !== 'playing' || revealed) return;
		if (timed && !started) return; // armed but not started: the overlay owns the board
		const c = toUnit(clientX, clientY);
		if (!c) return;
		const board = ropesRef.current;
		const grab = Math.max(puzzle.pegR * 2.4, 0.05);

		// Pick up a rope left hanging, right where it stopped.
		for (let r = 0; r < puzzle.ropes; r++) {
			const path = board[r];
			if (!path || ropeFault(path, r, board, puzzle) === null) continue;
			const head = path[path.length - 1];
			if (dist(c, head) > grab) continue;
			const from = path[0];
			const target = dist(from, puzzle.ends[r][0]) < dist(from, puzzle.ends[r][1]) ? puzzle.ends[r][1] : puzzle.ends[r][0];
			drawRef.current = { rope: r, target, path: path.slice() };
			begin();
			return;
		}

		// Start again from a peg — whatever that rope had is thrown away.
		for (let r = 0; r < puzzle.ropes; r++) {
			for (let e = 0; e < 2; e++) {
				if (dist(c, puzzle.ends[r][e]) > grab) continue;
				drawRef.current = { rope: r, target: puzzle.ends[r][1 - e], path: [puzzle.ends[r][e]] };
				put(r, [puzzle.ends[r][e]]);
				setHintNote('');
				begin();
				return;
			}
		}

		// Otherwise a tap on a rope rubs it out.
		for (let r = 0; r < puzzle.ropes; r++) {
			const path = board[r];
			if (!path) continue;
			for (let i = 0; i < path.length - 1; i++) {
				if (distToSeg(c, path[i], path[i + 1]) > grab * 0.6) continue;
				put(r, null);
				setHintNote('');
				return;
			}
		}
	};

	const onMove = (clientX: number, clientY: number) => {
		const d = drawRef.current;
		if (!d || !puzzle) return;
		const c = toUnit(clientX, clientY);
		if (!c) return;
		const path = d.path;

		// Coming back over what was drawn erases it, joint by joint.
		for (let i = path.length - 2; i >= 0; i--) {
			if (dist(c, path[i]) > STEP) continue;
			path.length = i + 1;
			put(d.rope, path.slice());
			return;
		}

		const head = path[path.length - 1];
		if (dist(c, head) < STEP) return;

		const board = ropesRef.current;
		// Close on the twin peg as soon as it is in reach: the rope clicks into place.
		if (dist(c, d.target) < Math.max(puzzle.pegR * 1.8, 0.035) && canExtend(path, d.target, d.rope, board, puzzle)) {
			path.push(d.target);
			put(d.rope, path.slice());
			drawRef.current = null;
			return;
		}
		// An illegal move does not punish: the rope simply refuses to follow the finger.
		if (!canExtend(path, c, d.rope, board, puzzle)) return;
		path.push(c);
		put(d.rope, path.slice());
	};

	const onRelease = () => {
		drawRef.current = null;
	};

	const { onPointerDown } = usePointerDrag(onPress, onMove, onRelease);

	const clearAll = () => {
		if (!puzzle || revealed) return;
		drawRef.current = null;
		setRopes(nulls(puzzle.ropes));
		setHintNote('');
		if (status === 'won') setStatus('playing');
	};

	/* Hint: tie the first missing rope, rubbing out whatever was in its way. */
	const hint = useCallback(() => {
		if (!puzzle || status !== 'playing' || revealed || !gate.ready) return;
		const h = findHint(ropes, puzzle);
		if (!h) return;
		gate.consume();
		const next = applyHint(ropes, h, puzzle);
		const wiped = next.filter((path, r) => !path && ropes[r]).length;
		drawRef.current = null;
		setRopes(next);
		setHintNote(wiped > 0
			? `Une corde tracée pour toi — ${wiped > 1 ? `${wiped} cordes gênaient` : 'une corde gênait'} son passage.`
			: 'Une corde tracée pour toi.');
		begin();
		trackGame(gameId, 'hint_used');
	}, [puzzle, ropes, status, revealed, gameId, gate, begin]);

	/* Reveal every route (does not count as a win). */
	const reveal = useCallback(() => {
		if (!puzzle || status !== 'playing' || revealed) return;
		drawRef.current = null;
		setRopes(puzzle.solution.slice());
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [puzzle, status, revealed, gameId]);

	/* Daily give-up: show the answer and close the attempt — nothing is submitted. */
	const giveUp = useCallback(() => {
		if (!puzzle) return;
		const sd = dailySeedRef.current;
		drawRef.current = null;
		setRopes(puzzle.solution.slice());
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
			state: packBoard(puzzle.solution),
		});
		trackGame(gameId, 'solution_shown');
	}, [puzzle, gameId]);

	const total = puzzle?.ropes ?? 0;
	const pegView = puzzle ? Math.max(puzzle.pegR * V, 3) : 3;

	return (
		<div className="cor-root">
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
				<div className="cor-daily-tag">
					{lv.menu
						? 'Progression — réussis un niveau pour débloquer le suivant'
						: `Niveau ${lv.level} · ${total} cordes`}
				</div>
			)}

			{!lv.active && (daily ? (
				<div className="cor-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			) : (
				<div className="cor-bar">
					<div className="cor-pills" role="tablist" aria-label="Difficulté">
						{diffKeys(DIFFS, gameId).map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={diffKey === k}
								className={`cor-pill ${diffKey === k ? 'active' : ''}`}
								onClick={() => newGame(k)}
							>
								{DIFFS[k].label}
							</button>
						))}
					</div>
					<div className="cor-bar-right">
						<div className="cor-timer chrono">{fmtTime(elapsed)}</div>
						<button className="cor-new" onClick={clearAll} aria-label="Effacer toutes les cordes">
							⌫
						</button>
					</div>
				</div>
			))}

			{!lv.active && daily && (
				<div className="cor-bar cor-bar-daily">
					<div className="cor-timer chrono">{fmtTime(elapsed)}</div>
				</div>
			)}

			{puzzle && status !== 'loading' && !(lv.active && lv.menu) && (
				<div className="cor-gauge" aria-live="polite">
					🪢 <strong>{tied}</strong>/{total} reliées
				</div>
			)}

			{status === 'playing' && !revealed && !(lv.active && lv.menu) && (
				<div className="cor-actions">
					<button className="cor-act" onClick={hint} disabled={!gate.ready || (timed && !started)}>{gate.label}</button>
					{!daily && !lv.active && elapsed >= 60 && (
						<button className="cor-act" onClick={reveal}>👁 Voir la solution</button>
					)}
					{daily && started && (
						<button className="cor-act" onClick={clearAll}>↺ Vider mes saisies</button>
					)}
				</div>
			)}

			{daily && started && !revealed && status !== 'won' && puzzle && <GiveUp onGiveUp={giveUp} />}

			{daily && status === 'won' && (
				<div className="cor-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Toutes les cordes reliées en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			{lv.active && lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
			<div className="cor-boardwrap">
				{celebrating && !lv.active && <Celebration />}
				{status === 'loading' || !puzzle ? (
					<div className="cor-loading">Génération…</div>
				) : (
					<div
						className={`cor-board ${timed && !started ? 'blurred' : ''}`}
						ref={boardRef}
						onPointerDown={onPointerDown}
						role="application"
						aria-label="Cordes à relier"
					>
						<svg viewBox={`0 0 ${V} ${V}`} className="cor-svg" aria-hidden="true">
							{ropes.map((path, r) => {
								if (!path || path.length < 2) return null;
								const done = ropeFault(path, r, ropes, puzzle) === null;
								return (
									<polyline
										key={r}
										className={`cor-rope ${done ? 'done' : 'draft'}`}
										points={pointsAttr(path)}
										stroke={HUE[r % HUE.length]}
									/>
								);
							})}
							{ropes.map((path, r) => {
								if (!path || ropeFault(path, r, ropes, puzzle) === null) return null;
								const head = path[path.length - 1];
								return (
									<circle
										key={r}
										className="cor-head"
										cx={head.x * V}
										cy={head.y * V}
										r={pegView * 0.55}
										stroke={HUE[r % HUE.length]}
									/>
								);
							})}
							{puzzle.ends.map((pair, r) => pair.map((peg, e) => (
								<circle
									key={`${r}-${e}`}
									className={`cor-peg ${puzzle.anchored[r] ? 'nailed' : ''}`}
									cx={peg.x * V}
									cy={peg.y * V}
									// A peg on the frame shows only half of itself, so draw it bigger to weigh the same.
									r={puzzle.anchored[r] ? pegView * 1.35 : pegView}
									fill={HUE[r % HUE.length]}
								/>
							)))}
						</svg>
					</div>
				)}

				{daily && dailyLoading && (
					<div className="cor-overlay">
						<div className="cor-overlay-card"><p className="cor-windiff">Préparation…</p></div>
					</div>
				)}

				{((daily && !dailyLoading) || lv.playing) && !started && status !== 'won' && puzzle && (
					<div className="cor-overlay">
						<button className="cor-startbtn" onClick={startTimer}>
							{lv.playing ? `▶ Niveau ${lv.level} — Commencer` : '▶ Commencer'}
						</button>
					</div>
				)}

				{showWin && !daily && !lv.active && (
					<div className="cor-win" role="dialog" aria-label="Cordes reliées">
						<div className="cor-wincard">
							<div className="cor-winmark">🪢</div>
							<h2>Aucun croisement&nbsp;!</h2>
							<p className="cor-wintime">{fmtTime(elapsed)}</p>
							<p className="cor-windiff">{total} cordes · {DIFFS[diffKey].label}</p>
							<button className="cor-replay" onClick={() => newGame(diffKey)}>
								Rejouer
							</button>
						</div>
					</div>
				)}

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={cordesLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won ? `Reliées en ${fmtTime(elapsed)}` : undefined}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
			</div>
			)}

			{hintNote && !(lv.active && lv.menu) && (
				<p className="cor-hint-note" aria-live="polite">💡 {hintNote}</p>
			)}

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={status === 'won' && !revealed ? elapsed : undefined} />
			)}

			{!daily && !lv.active && <LeaderboardCorner game={gameId} metric="time" />}

			{revealed ? (
				daily ? (
					<RevealNote />
				) : (
				<div className="cor-revealed-note">
					<span>Solution affichée</span>
					<button className="cor-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
				</div>
				)
			) : (
				<p className="cor-help">
					Pars d'un piquet et glisse ton doigt jusqu'à celui de la même couleur. La corde reste
					dans le cadre et ne croise rien&nbsp;: si tu forces, elle s'arrête au lieu de passer.
					Reviens en arrière pour l'effacer, touche une corde posée pour la retirer.
				</p>
			)}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.cor-root {
  --cor-accent: var(--accent-regular);

  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cor-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.75rem;
}

.cor-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.cor-bar-daily { justify-content: center; }

.cor-gauge {
  color: var(--gray-300); font-size: 13px; font-weight: 500;
  margin-bottom: 0.75rem;
}
.cor-gauge strong { color: var(--cor-accent); font-variant-numeric: tabular-nums; }

.cor-actions {
  display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;
  margin-bottom: 1rem;
}
.cor-act {
  border: 1.5px solid var(--gray-700);
  background: transparent;
  color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px;
  border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.cor-act:hover { background: var(--gray-800); border-color: var(--cor-accent); color: var(--cor-accent); }

.cor-revealed-note {
  display: flex; align-items: center; gap: 14px;
  margin-top: 1.25rem;
  color: var(--gray-300); font-size: 14px; font-weight: 500;
}
.cor-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.cor-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.cor-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.cor-pill.active { background: var(--cor-accent); color: var(--accent-text-over); border-color: var(--cor-accent); }
.cor-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.cor-new {
  border: none; background: var(--gray-800); color: var(--gray-0);
  font-size: 16px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1;
}

.cor-boardwrap {
  position: relative;
  width: 100%;
  max-width: 420px;
  margin-inline: auto;
}
.cor-loading {
  display: flex; align-items: center; justify-content: center;
  width: 100%; aspect-ratio: 1 / 1;
  color: var(--gray-300); font-weight: 600;
}
.cor-board {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border: 2.5px solid var(--gray-100);
  border-radius: 8px;
  overflow: hidden;
  background: var(--gray-999);
  touch-action: none;
  user-select: none;
}
.cor-svg { display: block; width: 100%; height: 100%; }

/* Elsewhere the leaderboard pill floats over inert padding. Here the frame's edge is the
   whole point of the puzzle, and a peg can sit within a tenth of it, so let the pill flow. */
.cor-root .lbc-root {
  position: static; transform: none; margin: 14px auto 0;
}

.cor-rope {
  fill: none; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round;
}
.cor-rope.draft { opacity: 0.5; stroke-dasharray: 3 2.4; }
.cor-head { fill: var(--gray-999); stroke-width: 1.4; }
.cor-peg { stroke: var(--gray-999); stroke-width: 1.2; }
.cor-peg.nailed { stroke: var(--gray-200); stroke-width: 2; }

.cor-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.cor-overlay {
  position: absolute; inset: -8px; z-index: 3;
  display: flex; align-items: center; justify-content: center;
  animation: cor-fade 0.25s ease;
}
.cor-overlay-card {
  background: var(--gray-999); border: 2px solid var(--cor-accent);
  border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg);
}
.cor-startbtn {
  border: none; background: var(--cor-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.cor-daily-won {
  text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem;
}
.cor-daily-won strong { color: var(--cor-accent); font-variant-numeric: tabular-nums; }

.cor-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem; }

.cor-hint-note {
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

.cor-win {
  position: absolute; inset: -8px; z-index: 10; display: flex; align-items: center; justify-content: center;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px; animation: cor-fade 0.25s ease;
}
.cor-wincard { background: var(--gray-999); border: 2px solid var(--cor-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg); }
.cor-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 24px; color: var(--gray-0); }
.cor-winmark { font-size: 30px; }
.cor-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--cor-accent); }
.cor-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.cor-replay { border: none; background: var(--cor-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer; }

@keyframes cor-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .cor-win, .cor-overlay { animation: none; }
}
`;
