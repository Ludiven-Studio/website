import { useState, useEffect, useRef, useCallback } from 'react';
import { encodePacked, fmtCentis, formatScore } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import {
	DIFFS,
	DIFF_ORDER,
	MAX_AIM,
	R,
	ROW_H,
	applyShot,
	bestMove,
	boardH,
	boardW,
	centreOf,
	cloneGrid,
	countBubbles,
	descend,
	fly,
	generateBulles,
	gridOf,
	isLost,
	nextColour,
	randomRow,
	ray,
	shooterOf,
	type BullesPuzzle,
	type Grid,
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
import { usePlayClock } from '../../lib/usePlayClock';
import { bullesLevels, THREE_STAR_OVER } from './levels';
import { usePointerDrag } from '../usePointerDrag';
import { useHintGate } from '../useHintGate';
import { diffKeys } from '../../lib/difficulty';

/* =====================================================
   BULLES — React island.
   Aim the cannon, land three of a colour, bring the raft down.
   Engine lives in ./engine (pure, tested).
   ===================================================== */

type Status = 'loading' | 'playing' | 'won' | 'lost';

const fmtTime = fmtCentis;
const LB_ID = (gameId: string): string => `${gameId}-t`;

const HUE = ['#e0567a', '#3fa9f5', '#f0a12e', '#4cc38a', '#a06bff', '#2ec9c9', '#ff7a45'];

/** Board units a shot covers per second. */
const SPEED = 62;

/** How much of the aim the guide gives away: the cannon, the first wall, and one more leg. */
const GUIDE_LEGS = 3;

/** Free play: the classic deal is padded to this many rows so the raft has room to descend into. */
const FREE_TOTAL_ROWS = 13;
/** A fresh ceiling row descends on this real-time clock (ms) in free play. */
const DESCEND_MS = 10_000;
/** Free-play records, kept per device and difficulty. */
const winKey = (dk: string): string => `bulles-libre-win-${dk}`; // fastest clear (centis)
const survKey = (dk: string): string => `bulles-libre-surv-${dk}`; // longest hold (centis)

/** Pad a classic deal into a taller grid so the descending raft has room to grow. */
function padDeal(p: BullesPuzzle, totalRows: number): Grid {
	const rows = Math.max(totalRows, p.rows);
	const g: Grid = { cols: p.cols, rows, parity: 0, cells: new Int8Array(p.cols * rows).fill(-1) };
	g.cells.set(p.cells.subarray(0, Math.min(p.cells.length, g.cells.length)));
	return g;
}

/** Idle bubbles drifting up behind the raft. x is a share of the width. */
const DECOR = [
	{ x: 0.12, r: 0.48, dur: 13, delay: 0 },
	{ x: 0.31, r: 0.3, dur: 17, delay: 4 },
	{ x: 0.46, r: 0.66, dur: 21, delay: 9 },
	{ x: 0.62, r: 0.36, dur: 15, delay: 2 },
	{ x: 0.79, r: 0.54, dur: 19, delay: 11 },
	{ x: 0.91, r: 0.26, dur: 12, delay: 6 },
];

/* The saved daily attempt is a raw cell array, so it only means something on the board it was
   dealt from. GEN_V bumps with the generator: an attempt saved against an older deal is
   dropped instead of painted over the new one. */
const GEN_V = 1;

interface SavedRun {
	v: number;
	cells: number[];
	shots: number;
}

const packRun = (g: Grid, shots: number): SavedRun => ({ v: GEN_V, cells: Array.from(g.cells), shots });

function unpackRun(saved: unknown, g: Grid): { grid: Grid; shots: number } | null {
	const o = saved as SavedRun | null;
	if (!o || o.v !== GEN_V || !Array.isArray(o.cells) || o.cells.length !== g.cells.length) return null;
	return { grid: { cols: g.cols, rows: g.rows, cells: Int8Array.from(o.cells) }, shots: o.shots ?? 0 };
}

export default function BullesGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<BullesPuzzle | null>(null);
	const [grid, setGrid] = useState<Grid | null>(null);
	const [shots, setShots] = useState(0);
	const [status, setStatus] = useState<Status>('loading');
	const [started, setStarted] = useState(false);
	const [hintAim, setHintAim] = useState<number | null>(null);
	const [hintNote, setHintNote] = useState('');
	const [aim, setAim] = useState(0); // where the sight points, kept between shots
	const [aiming, setAiming] = useState(false);
	const [flying, setFlying] = useState(false);
	const [burst, setBurst] = useState<{ x: number; y: number; colour: number }[]>([]);
	const [elapsed, setElapsed] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false); // daily already closed today
	const [gaveUp, setGaveUp] = useState(false);
	// Free-play scores are time (centis): fastest to clear the board, or longest held before drowning.
	const [bestWin, setBestWin] = useState(0);
	const [bestSurv, setBestSurv] = useState(0);
	const [newRecord, setNewRecord] = useState(false);

	const startRef = useRef<number>(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const boardRef = useRef<SVGSVGElement>(null);
	const bubbleRef = useRef<SVGGElement>(null);
	const rafRef = useRef(0);
	const animRef = useRef<{ pts: Pt[]; legs: number[]; total: number; t0: number; cell: number; colour: number } | null>(null);
	const gridRef = useRef<Grid | null>(null);
	const shotsRef = useRef(0);
	const statusRef = useRef<Status>('loading');
	const armedRef = useRef(false); // the board takes shots right now
	const descendRng = useRef<() => number>(() => 0); // drives each descended row's colours
	const descendColoursRef = useRef(3);
	const bestWinRef = useRef(0); // records BEFORE the current run, for new-record detection
	const bestSurvRef = useRef(0);
	const flyingRef = useRef(false); // a shot is in the air — hold the descent off
	gridRef.current = grid;
	shotsRef.current = shots;
	statusRef.current = status;
	bestWinRef.current = bestWin;
	bestSurvRef.current = bestSurv;
	flyingRef.current = flying;

	const lv = useLevels(gameId, bullesLevels);
	const freeMode = !daily && !lv.active; // free play: the raft descends on a clock, scored by time
	const timed = daily || lv.playing; // both race the chrono → hints on a cooldown
	const ready = status === 'playing' && (!timed || started);
	armedRef.current = ready && !flying;
	const gate = useHintGate(timed, ready);

	const par = puzzle?.par ?? 0;
	const loaded = grid && status === 'playing' ? nextColour(grid, puzzle?.seed ?? 0, shots) : 0;

	const deal = useCallback((p: BullesPuzzle, g?: Grid) => {
		setPuzzle(p);
		setGrid(g ?? gridOf(p));
		setShots(0);
		setBurst([]);
		setAim(0);
		setAiming(false);
		setHintAim(null);
		animRef.current = null;
		setFlying(false);
	}, []);

	/* Free play: a classic solvable deal that also descends one row every DESCEND_MS. Clear it
	   fast to win (score = time), or hold out as long as you can before it drowns you. */
	const newGame = useCallback((dk: keyof typeof DIFFS) => {
		const diff = DIFFS[dk];
		const p = generateBulles(diff);
		descendRng.current = mulberry32((p.seed ^ 0x9e3779b1) >>> 0);
		descendColoursRef.current = diff.colours;
		setDaily(false);
		setAlreadyPlayed(false);
		setGaveUp(false);
		setNewRecord(false);
		setDiffKey(dk);
		setStatus('loading');
		setHintNote('');
		deal(p, padDeal(p, FREE_TOTAL_ROWS));
		startRef.current = Date.now();
		setElapsed(0);
		setStarted(true); // the clock (and the descent) run from the moment the board appears
		setStatus('playing');
	}, [deal]);

	useEffect(() => {
		newGame('facile');
	}, [newGame]);

	/* Levels mode: start a level from its config; grade on a cleared or drowned board. */
	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		setDaily(false);
		setGaveUp(false);
		setHintNote('');
		setStatus('loading');
		setElapsed(0);
		deal(generateBulles(cfg.diff, mulberry32(cfg.seed)));
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

	/* Daily challenge: one attempt per device, resumable. Server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setGaveUp(false);
		setHintNote('');

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			// Resume or lock the existing attempt — regenerate from the stored seed (no fetch).
			const diffIndex = run.diffIndex ?? 0;
			const dk = DIFF_ORDER[diffIndex] ?? 'facile';
			dailySeedRef.current = { seed: run.seed, diffIndex };
			setDailyLoading(false);
			setDiffKey(dk);
			const p = generateBulles(DIFFS[dk], mulberry32(run.seed));
			deal(p);
			const saved = unpackRun(run.state, gridOf(p));
			setStarted(true);
			if (saved) {
				setGrid(saved.grid);
				setShots(saved.shots);
			}
			if (run.done) {
				setAlreadyPlayed(true);
				setGaveUp(!!run.abandoned);
				setStatus(run.abandoned ? 'lost' : 'won');
				setElapsed(run.finalTime ?? 0);
			} else {
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
		deal(generateBulles(DIFFS[dk], mulberry32(seed)));
		setStatus('playing');
		setDailyLoading(false);
	}, [gameId, deal]);

	const { celebrating, showWin } = useCelebration(status === 'won');

	/* Commencer: consumes the attempt and starts the chrono. */
	const startTimer = useCallback(() => {
		if (!grid) return;
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
				state: packRun(grid, 0),
			});
		}
	}, [gameId, grid, daily]);

	const begin = useCallback(() => {
		if (started) return;
		startRef.current = Date.now();
		setStarted(true);
		trackGame(gameId, 'game_started');
	}, [started, gameId]);

	/* Timer */
	const ticking = status === 'playing' && started;
	usePlayClock(startRef, ticking, daily ? gameId : null);
	useEffect(() => {
		if (!ticking) return;
		const id = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 10)), 50);
		return () => clearInterval(id);
	}, [ticking]);

	/* Free play: the raft descends on a real-time clock (one row every DESCEND_MS),
	   held off while a shot is in the air or the tab is hidden. */
	useEffect(() => {
		if (!freeMode || status !== 'playing' || !started) return;
		const id = setInterval(() => {
			if (document.hidden || flyingRef.current) return;
			const g = gridRef.current;
			if (!g || statusRef.current !== 'playing') return;
			const next = cloneGrid(g);
			descend(next, randomRow(next.cols, descendColoursRef.current, descendRng.current));
			setGrid(next);
		}, DESCEND_MS);
		return () => clearInterval(id);
	}, [freeMode, status, started]);

	/* ---------- Shooting ---------- */

	const land = useCallback(() => {
		const a = animRef.current;
		const g = gridRef.current;
		animRef.current = null;
		setFlying(false);
		if (!a || !g) return;
		const next = cloneGrid(g);
		const blast = applyShot(next, a.cell, a.colour);
		// Burst marks are drawn at absolute positions, not cell indices — a survival descent
		// reshuffles indices, so an index-based mark would jump to the wrong cell.
		setBurst([...blast.popped, ...blast.dropped].map((cell) => {
			const c = centreOf(g, cell);
			return { x: c.x, y: c.y, colour: cell === a.cell ? a.colour : g.cells[cell] };
		}));
		setGrid(next);
		setShots((s) => s + 1);
	}, []);

	const frame = useCallback(() => {
		const a = animRef.current;
		if (!a) return;
		const d = ((performance.now() - a.t0) / 1000) * SPEED;
		if (d >= a.total) {
			land();
			return;
		}
		let rest = d;
		let i = 0;
		while (i < a.legs.length - 1 && rest > a.legs[i]) rest -= a.legs[i++];
		const p0 = a.pts[i];
		const p1 = a.pts[i + 1];
		const t = a.legs[i] > 0 ? rest / a.legs[i] : 0;
		const el = bubbleRef.current;
		if (el) {
			const x = p0.x + (p1.x - p0.x) * t;
			const y = p0.y + (p1.y - p0.y) * t;
			el.setAttribute('transform', `translate(${x} ${y})`);
		}
		rafRef.current = requestAnimationFrame(frame);
	}, [land]);

	const shoot = useCallback((angle: number) => {
		const g = gridRef.current;
		if (!g || !armedRef.current) return;
		const f = fly(g, angle);
		if (!f) return;
		const colour = nextColour(g, puzzle?.seed ?? 0, shotsRef.current);
		const legs: number[] = [];
		let total = 0;
		for (let i = 0; i < f.path.length - 1; i++) {
			const l = Math.hypot(f.path[i + 1].x - f.path[i].x, f.path[i + 1].y - f.path[i].y);
			legs.push(l);
			total += l;
		}
		animRef.current = { pts: f.path, legs, total, t0: performance.now(), cell: f.cell, colour };
		setFlying(true);
		setAiming(false);
		setHintAim(null);
		setBurst([]);
		begin();
		rafRef.current = requestAnimationFrame(frame);
	}, [puzzle, begin, frame]);

	useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

	/* ---------- Aiming ---------- */

	/**
	 * Above the cannon the sight points straight at the finger. Level with it or below, the
	 * bottom of the board is a dial: sliding left and right sweeps the sight, so a thumb
	 * resting under the board still aims.
	 */
	const angleAt = useCallback((clientX: number, clientY: number): number => {
		const el = boardRef.current;
		const g = gridRef.current;
		if (!el || !g) return 0;
		const rect = el.getBoundingClientRect();
		const x = ((clientX - rect.left) / rect.width) * boardW(g.cols);
		const y = ((clientY - rect.top) / rect.height) * boardH(g.rows);
		const sh = shooterOf(g);
		const dy = y - sh.y;
		const a = dy < -R ? Math.atan2(x - sh.x, -dy) : ((x - sh.x) / (boardW(g.cols) / 2)) * MAX_AIM;
		return Math.max(-MAX_AIM, Math.min(MAX_AIM, a));
	}, []);

	const onPress = (clientX: number, clientY: number) => {
		if (!armedRef.current) return;
		setAiming(true);
		setAim(angleAt(clientX, clientY));
	};

	const onMove = (clientX: number, clientY: number) => {
		if (!armedRef.current) return;
		setAim(angleAt(clientX, clientY));
	};

	const onRelease = (clientX: number, clientY: number) => {
		if (!armedRef.current) return;
		const a = angleAt(clientX, clientY);
		setAim(a);
		setAiming(false);
		shoot(a);
	};

	const { onPointerDown } = usePointerDrag(onPress, onMove, onRelease);

	/* Win when the raft is gone, loss when it reaches the cannon's lane. */
	useEffect(() => {
		if (!grid || status !== 'playing' || flying) return;
		if (timed && !started) return;
		if (lv.active && !lv.playing) return;
		if (countBubbles(grid) === 0) {
			setStatus('won');
			trackGame(gameId, 'game_won');
		} else if (isLost(grid)) {
			setStatus('lost');
		}
	}, [grid, status, flying, timed, started, lv.active, lv.playing, gameId]);

	/* Free-play records, per difficulty. */
	useEffect(() => {
		setBestWin(Number(localStorage.getItem(winKey(diffKey)) || 0));
		setBestSurv(Number(localStorage.getItem(survKey(diffKey)) || 0));
	}, [diffKey]);

	// Freeze the finish time and file it: fastest clear on a win, longest hold on a loss.
	// Compare against the record BEFORE this run via refs, so beating it once doesn't re-fire.
	useEffect(() => {
		if (!freeMode || (status !== 'won' && status !== 'lost')) return;
		const centis = Math.round((Date.now() - startRef.current) / 10);
		setElapsed(centis);
		if (status === 'won') {
			if (bestWinRef.current === 0 || centis < bestWinRef.current) {
				localStorage.setItem(winKey(diffKey), String(centis));
				setBestWin(centis);
				setNewRecord(true);
			}
		} else if (centis > bestSurvRef.current) {
			localStorage.setItem(survKey(diffKey), String(centis));
			setBestSurv(centis);
			setNewRecord(true);
		}
	}, [freeMode, status, diffKey]);

	/* Grade the level once it is over. Score is the shot count; par rides along as `stat`. */
	useEffect(() => {
		if (!lv.playing) return;
		if (status === 'won') lv.finish({ won: true, score: shots, stat: par, raw: { par, centis: elapsed } });
		else if (status === 'lost') lv.finish({ won: false, score: shots, stat: par });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv.playing, status]);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || !grid || status !== 'playing') return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: packRun(grid, shots),
		});
	}, [daily, started, status, grid, shots, gameId]);

	/* Lock the daily attempt once it is over. */
	useEffect(() => {
		if (!daily || alreadyPlayed || !grid) return;
		if (status !== 'won' && status !== 'lost') return;
		const sd = dailySeedRef.current;
		const snapshot: DailyRun = {
			startedAt: startRef.current,
			done: true,
			finalTime: Math.round((Date.now() - startRef.current) / 10),
			abandoned: status === 'lost',
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: packRun(grid, shots),
		};
		saveDailyRun(gameId, snapshot);
		setAlreadyPlayed(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	/* Hint: the shot the solver would take with the bubble in the cannon. */
	const hint = useCallback(() => {
		const g = gridRef.current;
		if (!g || !armedRef.current || !gate.ready) return;
		const mv = bestMove(g, nextColour(g, puzzle?.seed ?? 0, shots));
		if (!mv) return;
		gate.consume();
		setHintAim(mv.angle);
		setHintNote(mv.clears > 0
			? `Ce tir décroche ${mv.clears} bulles.`
			: 'Aucune grappe à faire tomber : pose la bulle contre sa couleur.');
		begin();
		trackGame(gameId, 'hint_used');
	}, [puzzle, shots, gate, begin, gameId]);

	/* Daily give-up: close the attempt — nothing is submitted. */
	const giveUp = useCallback(() => {
		setGaveUp(true);
		setStatus('lost');
		trackGame(gameId, 'solution_shown');
	}, [gameId]);

	const left = grid ? countBubbles(grid) : 0;
	const dailyScore = encodePacked(10_000_000, [shots, Math.min(9_999_999, elapsed)]);
	const fmtPacked = (v: number): string => formatScore(DAILY_LB.bulles.fmt, v);

	const sight = hintAim ?? aim; // where the barrel points, hint takes over while it shows
	const showGuide = grid !== null && status === 'playing' && !flying && (aiming || hintAim !== null);
	const sightPts = showGuide && grid ? ray(grid, sight) : null;
	const guidePts = sightPts ? sightPts.slice(0, hintAim !== null ? sightPts.length : GUIDE_LEGS) : null;
	// The ghost only shows when the whole line is on screen, so a bounced shot keeps its secret.
	const ghost =
		grid && sightPts && (hintAim !== null || sightPts.length <= GUIDE_LEGS) ? fly(grid, sight) : null;

	const W = grid ? boardW(grid.cols) : 20;
	const H = grid ? boardH(grid.rows) : 27;

	return (
		<div className="bul-root">
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
				<div className="bul-daily-tag">
					{lv.menu
						? 'Progression — réussis un niveau pour débloquer le suivant'
						: `Niveau ${lv.level} · par ${par} tirs`}
				</div>
			)}

			{!lv.active && (daily ? (
				<div className="bul-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			) : (
				<div className="bul-bar">
					<div className="bul-pills" role="tablist" aria-label="Difficulté">
						{diffKeys(DIFFS, gameId).map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={diffKey === k}
								className={`bul-pill ${diffKey === k ? 'active' : ''}`}
								onClick={() => newGame(k)}
							>
								{DIFFS[k].label}
							</button>
						))}
					</div>
					<div className="bul-bar-right">
						<div className="bul-timer chrono">{fmtTime(elapsed)}</div>
						<button className="bul-new" onClick={() => newGame(diffKey)} aria-label="Nouveau tableau">
							↻
						</button>
					</div>
				</div>
			))}

			{!lv.active && daily && (
				<div className="bul-bar bul-bar-daily">
					<div className="bul-timer chrono">{fmtTime(elapsed)}</div>
				</div>
			)}

			{grid && status !== 'loading' && !(lv.active && lv.menu) && (
				<div className="bul-gauge" aria-live="polite">
					{freeMode ? (
						<>🫧 <strong>{left}</strong> bulles · </>
					) : (
						<>🎯 <strong>{shots}</strong> tirs · par {par} · <strong>{left}</strong> bulles · </>
					)}
					{/* The cannon is small and often under a thumb, so the loaded colour is repeated here. */}
					<span className="bul-chip" style={{ background: HUE[loaded % HUE.length] }} aria-label="Bulle chargée" />
				</div>
			)}

			{status === 'playing' && !(lv.active && lv.menu) && (
				<div className="bul-actions">
					<button className="bul-act" onClick={hint} disabled={!gate.ready || !ready}>{gate.label}</button>
				</div>
			)}

			{daily && started && status === 'playing' && <GiveUp onGiveUp={giveUp} />}

			{daily && (status === 'won' || status === 'lost') && (
				<div className="bul-daily-won">
					{status === 'lost' ? (
						<>Défi du jour terminé — reviens demain&nbsp;!</>
					) : alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{shots} tirs</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Tableau vidé en <strong>{shots} tirs</strong> · {fmtTime(elapsed)}</>
					)}
				</div>
			)}

			{lv.active && lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
			<div className="bul-boardwrap edge-safe">
				{celebrating && !lv.active && <Celebration />}
				{status === 'loading' || !grid ? (
					<div className="bul-loading">Génération…</div>
				) : (
					<svg
						viewBox={`0 0 ${W} ${H}`}
						className={`bul-svg ${timed && !started ? 'blurred' : ''}`}
						ref={boardRef}
						onPointerDown={onPointerDown}
						role="application"
						aria-label="Tableau de bulles"
					>
						<defs>
							{/* One sheen for every bubble: bright top-left, dark rim — the soap look. */}
							<radialGradient id="bul-sheen" cx="34%" cy="28%" r="76%">
								<stop offset="0%" stopColor="#fff" stopOpacity="0.72" />
								<stop offset="24%" stopColor="#fff" stopOpacity="0.2" />
								<stop offset="58%" stopColor="#fff" stopOpacity="0" />
								<stop offset="84%" stopColor="#000" stopOpacity="0.06" />
								<stop offset="100%" stopColor="#000" stopOpacity="0.26" />
							</radialGradient>
							{/* Same idea as the sheen but no dark rim — the decor must not read as a pebble on dark. */}
							<radialGradient id="bul-film" cx="36%" cy="30%" r="72%">
								<stop offset="0%" stopColor="#fff" stopOpacity="0.6" />
								<stop offset="34%" stopColor="#fff" stopOpacity="0.2" />
								<stop offset="74%" stopColor="#fff" stopOpacity="0.09" />
								<stop offset="93%" stopColor="#fff" stopOpacity="0.34" />
								<stop offset="100%" stopColor="#fff" stopOpacity="0.04" />
							</radialGradient>
							<linearGradient id="bul-water" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="#7ec8ff" stopOpacity="0.16" />
								<stop offset="55%" stopColor="#3f8fd8" stopOpacity="0.1" />
								<stop offset="100%" stopColor="#12508f" stopOpacity="0.22" />
							</linearGradient>
							<g id="bul-shine">
								<circle r={R * 0.95} fill="url(#bul-sheen)" />
								<ellipse
									cx={-R * 0.32}
									cy={-R * 0.36}
									rx={R * 0.3}
									ry={R * 0.19}
									fill="#fff"
									opacity="0.8"
									transform={`rotate(-28 ${-R * 0.32} ${-R * 0.36})`}
								/>
								<path
									className="bul-rimlight"
									d={`M ${-R * 0.66} ${R * 0.5} A ${R * 0.84} ${R * 0.84} 0 0 0 ${R * 0.5} ${R * 0.68}`}
									fill="none"
									stroke="#fff"
									strokeOpacity="0.4"
									strokeWidth={R * 0.1}
									strokeLinecap="round"
								/>
							</g>
						</defs>

						<rect className="bul-sea" x={0} y={0} width={W} height={H} fill="url(#bul-water)" />
						{DECOR.map((d, i) => (
							<circle
								key={`d${i}`}
								className="bul-drift"
								cx={d.x * W}
								cy={H - 1}
								r={d.r}
								fill="url(#bul-film)"
								style={{ animationDuration: `${d.dur}s`, animationDelay: `-${d.delay}s` }}
							/>
						))}

						{/* The lane the raft must never reach. */}
						<line
							className="bul-lane"
							x1={0}
							y1={R + (grid.rows - 1) * ROW_H}
							x2={W}
							y2={R + (grid.rows - 1) * ROW_H}
						/>

						{guidePts && guidePts.length > 1 && (
							<polyline
								className={`bul-guide ${hintAim !== null ? 'hinted' : ''}`}
								points={guidePts.map((p) => `${p.x},${p.y}`).join(' ')}
								stroke={HUE[loaded % HUE.length]}
							/>
						)}

						{ghost && (
							<circle
								className="bul-ghost"
								cx={centreOf(grid, ghost.cell).x}
								cy={centreOf(grid, ghost.cell).y}
								r={R * 0.9}
								stroke={HUE[loaded % HUE.length]}
							/>
						)}

						{Array.from(grid.cells).map((v, k) => {
							if (v < 0) return null;
							const c = centreOf(grid, k);
							return (
								<g key={k}>
									<circle className="bul-bubble" cx={c.x} cy={c.y} r={R * 0.95} fill={HUE[v % HUE.length]} />
									<use href="#bul-shine" x={c.x} y={c.y} />
								</g>
							);
						})}

						{burst.map(({ x, y, colour }, i) => (
							<g key={`b${i}`} className="bul-burst">
								<circle className="bul-burst-fill" cx={x} cy={y} r={R * 0.95} fill={HUE[colour % HUE.length]} />
								<circle className="bul-burst-ring" cx={x} cy={y} r={R * 0.95} stroke={HUE[colour % HUE.length]} />
							</g>
						))}

						{/* Cannon: a shell base and a barrel that follows the sight. */}
						{status === 'playing' && (
							<g
								className="bul-cannon"
								transform={`translate(${shooterOf(grid).x} ${shooterOf(grid).y}) rotate(${(sight * 180) / Math.PI})`}
							>
								<rect className="bul-barrel" x={-R * 0.46} y={-R * 2.7} width={R * 0.92} height={R * 2.9} rx={R * 0.46} />
								<line className="bul-notch" x1={0} y1={-R * 2.5} x2={0} y2={-R * 1.7} />
							</g>
						)}
						<ellipse
							className="bul-base"
							cx={shooterOf(grid).x}
							cy={shooterOf(grid).y + R * 0.35}
							rx={R * 1.8}
							ry={R * 0.9}
						/>

						{flying && animRef.current && (
							<g
								ref={bubbleRef}
								className="bul-flyer"
								transform={`translate(${animRef.current.pts[0].x} ${animRef.current.pts[0].y})`}
							>
								<circle
									className="bul-bubble"
									cx={0}
									cy={0}
									r={R * 0.95}
									fill={HUE[animRef.current.colour % HUE.length]}
								/>
								<use href="#bul-shine" />
							</g>
						)}

						{status === 'playing' && !flying && (
							<g>
								<circle
									className="bul-loaded"
									cx={shooterOf(grid).x}
									cy={shooterOf(grid).y}
									r={R * 0.95}
									fill={HUE[loaded % HUE.length]}
								/>
								<use href="#bul-shine" x={shooterOf(grid).x} y={shooterOf(grid).y} />
							</g>
						)}
					</svg>
				)}

				{daily && dailyLoading && (
					<div className="bul-overlay">
						<div className="bul-overlay-card"><p className="bul-windiff">Préparation…</p></div>
					</div>
				)}

				{((daily && !dailyLoading) || lv.playing) && !started && status === 'playing' && grid && (
					<div className="bul-overlay">
						<button className="bul-startbtn" onClick={startTimer}>
							{lv.playing ? `▶ Niveau ${lv.level} — Commencer` : '▶ Commencer'}
						</button>
					</div>
				)}

				{showWin && freeMode && (
					<div className="bul-win" role="dialog" aria-label="Tableau vidé">
						<div className="bul-wincard">
							<div className="bul-winmark">{newRecord ? '🏅' : '🫧'}</div>
							<h2>Tableau vidé&nbsp;!</h2>
							<p className="bul-wintime">{fmtTime(elapsed)}</p>
							<p className="bul-windiff">{newRecord ? 'Record de vitesse !' : bestWin ? `record ${fmtTime(bestWin)}` : ''} · {DIFFS[diffKey].label}</p>
							<button className="bul-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
						</div>
					</div>
				)}

				{status === 'lost' && freeMode && (
					<div className="bul-win" role="dialog" aria-label="Bulles descendues trop bas">
						<div className="bul-wincard">
							<div className="bul-winmark">{newRecord ? '🏅' : '🌊'}</div>
							<h2>Tenu {fmtTime(elapsed)}</h2>
							<p className="bul-windiff">{newRecord ? 'Record de survie !' : bestSurv ? `record ${fmtTime(bestSurv)}` : ''} · {DIFFS[diffKey].label}</p>
							<button className="bul-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
						</div>
					</div>
				)}

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={bullesLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won ? `${shots} tirs · par ${par}` : 'Les bulles ont touché le bas'}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
			</div>
			)}

			{hintNote && !(lv.active && lv.menu) && (
				<p className="bul-hint-note" aria-live="polite">💡 {hintNote}</p>
			)}

			{daily && <Leaderboard
				key={`lb-${shots}`}
				game={LB_ID(gameId)}
				metric="time"
				submitValue={status === 'won' && !gaveUp ? dailyScore : undefined}
				format={fmtPacked}
			/>}

			{!daily && !lv.active && (
				<LeaderboardCorner game={LB_ID(gameId)} metric="time" format={fmtPacked} side="right" />
			)}

			{gaveUp ? (
				<RevealNote />
			) : (
				<p className="bul-help">
					Glisse de gauche à droite pour orienter le viseur — ou vise un point du tableau — puis
					relâche pour tirer. Trois bulles de la même couleur qui se
					touchent tombent, et tout ce qu'elles retenaient tombe avec elles.{' '}
					{freeMode
						? 'Une nouvelle ligne descend toutes les 10 secondes : vide le tableau le plus vite possible, ou tiens le plus longtemps avant que les bulles touchent le bas.'
						: `Vide le tableau en ${par + THREE_STAR_OVER} tirs ou moins pour trois étoiles.`}
				</p>
			)}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.bul-root {
  --bul-accent: var(--accent-regular);

  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.bul-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.75rem;
}

.bul-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.bul-bar-daily { justify-content: center; }
.bul-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.bul-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.bul-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.bul-pill.active { background: var(--bul-accent); color: var(--accent-text-over); border-color: var(--bul-accent); }
.bul-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.bul-new {
  border: none; background: var(--gray-800); color: var(--gray-0);
  font-size: 16px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1;
}

.bul-gauge {
  color: var(--gray-300); font-size: 13px; font-weight: 500;
  margin-bottom: 0.75rem;
}
.bul-gauge strong { color: var(--bul-accent); font-variant-numeric: tabular-nums; }
.bul-chip {
  display: inline-block; width: 13px; height: 13px; border-radius: 50%;
  vertical-align: -2px; border: 1.5px solid var(--gray-100);
}

.bul-actions {
  display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;
  margin-bottom: 1rem;
}
.bul-act {
  border: 1.5px solid var(--gray-700);
  background: transparent;
  color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px;
  border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.bul-act:hover { background: var(--gray-800); border-color: var(--bul-accent); color: var(--bul-accent); }

.bul-boardwrap {
  position: relative;
  width: 100%;
  max-width: 380px;
  margin-inline: auto;
}
.bul-loading {
  display: flex; align-items: center; justify-content: center;
  width: 100%; aspect-ratio: 3 / 4;
  color: var(--gray-300); font-weight: 600;
}
.bul-svg {
  display: block; width: 100%; height: auto;
  border: 2.5px solid var(--gray-100);
  border-radius: 8px;
  background: var(--gray-999);
  touch-action: none;
  user-select: none;
}

.bul-bubble { stroke: rgba(255, 255, 255, 0.4); stroke-width: 0.06; }
.bul-loaded { stroke: var(--gray-100); stroke-width: 0.12; }
.bul-lane { stroke: var(--gray-700); stroke-width: 0.08; stroke-dasharray: 0.6 0.5; }
.bul-sea, .bul-drift, .bul-base, .bul-cannon, .bul-ghost { pointer-events: none; }

/* Idle bubbles rising behind the raft. */
.bul-drift {
  stroke: var(--gray-300); stroke-opacity: 0.55; stroke-width: 0.06;
  animation: bul-rise linear infinite;
}

.bul-guide {
  fill: none; stroke-width: 0.2; stroke-dasharray: 0.55 0.5; opacity: 0.8;
  stroke-linecap: round; stroke-linejoin: round;
}
.bul-guide.hinted { opacity: 1; stroke-width: 0.32; stroke-dasharray: none; }
/* Where the bubble would settle — only drawn when the whole line is visible anyway. */
.bul-ghost { fill: none; stroke-width: 0.12; stroke-dasharray: 0.34 0.3; opacity: 0.65; }

/* Mid-scale greys so the cannon keeps its contrast in both themes. */
.bul-base { fill: var(--gray-700); stroke: var(--gray-400); stroke-width: 0.07; }
.bul-barrel { fill: var(--gray-500); stroke: var(--gray-300); stroke-width: 0.07; }
.bul-notch { stroke: var(--gray-999); stroke-width: 0.11; stroke-linecap: round; opacity: 0.8; }

.bul-burst { pointer-events: none; }
.bul-burst-fill {
  transform-box: fill-box; transform-origin: center;
  animation: bul-pop 0.34s ease-out forwards;
}
.bul-burst-ring {
  fill: none; stroke-width: 0.16;
  transform-box: fill-box; transform-origin: center;
  animation: bul-ring 0.44s ease-out forwards;
}

.bul-svg.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.bul-overlay {
  position: absolute; inset: -8px; z-index: 3;
  display: flex; align-items: center; justify-content: center;
  animation: bul-fade 0.25s ease;
}
.bul-overlay-card {
  background: var(--gray-999); border: 2px solid var(--bul-accent);
  border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg);
}
.bul-startbtn {
  border: none; background: var(--bul-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.bul-daily-won {
  text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem;
}
.bul-daily-won strong { color: var(--bul-accent); font-variant-numeric: tabular-nums; }

.bul-help { max-width: 380px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem; }

.bul-hint-note {
  max-width: 380px;
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

.bul-win {
  position: absolute; inset: -8px; z-index: 10; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 10px;
  border-radius: 16px; animation: bul-fade 0.25s ease;
}
.bul-wincard { background: var(--gray-999); border: 2px solid var(--bul-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg); }
.bul-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 22px; color: var(--gray-0); }
.bul-winmark { font-size: 30px; }
.bul-wintime { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--bul-accent); }
.bul-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.bul-replay { border: none; background: var(--bul-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer; }

@keyframes bul-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes bul-pop {
  from { opacity: 0.9; transform: scale(1); }
  to { opacity: 0; transform: scale(1.7); }
}
@keyframes bul-ring {
  from { opacity: 0.85; transform: scale(0.55); }
  to { opacity: 0; transform: scale(2.4); }
}
@keyframes bul-rise {
  from { transform: translateY(0); opacity: 0; }
  12% { opacity: 0.9; }
  85% { opacity: 0.7; }
  to { transform: translateY(-32px); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .bul-win, .bul-overlay { animation: none; }
  .bul-drift { animation: none; opacity: 0; }
  .bul-burst-fill, .bul-burst-ring { animation-duration: 0.01s; }
}
`;
