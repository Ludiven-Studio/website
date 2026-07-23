import { useState, useEffect, useRef, useCallback } from 'react';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, dailyDifficultyIndex, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import Celebration, { useCelebration } from '../../components/Celebration';
import { useLevels } from '../../lib/useLevels';
import { solitaireLevels, levelPegs } from './levels';
import {
	VARIANTS,
	createLayout,
	initialPegs,
	pegCount,
	isWin,
	isStuck,
	movesFrom,
	applyMove,
	hintMove,
	generateDaily,
	type Variant,
	type Layout,
	type Move,
} from './engine';

/* =====================================================
   SOLITAIRE À BILLES — peg solitaire island.
   Free mode: full cross / triangle boards, clear down to one marble.
   Daily: a small deterministic mini-board (tightest solvable position for the
   day's seed) to clear as fast as possible — ranked by time. Canvas board with
   marble sprites + a jump animation; pure engine in ./engine (tested).
   ===================================================== */

type Status = 'playing' | 'won' | 'stuck';
const ANIM_MS = 190;
const DAILY_COUNT = [5, 6, 7]; // pegs by difficulty tier (Mon/Tue → weekend)
const bestKey = (v: Variant): string => `ludiven-solitaire-best-${v}`;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const marbleHue = (i: number): number => (i * 47 + 15) % 360;
const fmtCentis = (c: number): string => {
	const s = c / 100;
	if (s < 60) return `${s.toFixed(2)} s`;
	const m = Math.floor(s / 60);
	return `${m}:${(s % 60).toFixed(2).padStart(5, '0')}`;
};

interface Anim {
	move: Move;
	start: number;
}

export default function SolitaireGame({ gameId }: { gameId: string }) {
	const [variant, setVariant] = useState<Variant>('anglais');
	const [pegs, setPegs] = useState(32);
	const [moves, setMoves] = useState(0);
	const [status, setStatus] = useState<Status>('playing');
	const [best, setBest] = useState<number | null>(null);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false); // daily: one attempt already spent today
	const [elapsed, setElapsed] = useState(0);
	const [started, setStarted] = useState(false); // false = board armed (blurred, Start gate)
	const [finalCentis, setFinalCentis] = useState<number | null>(null);
	const [submitCentis, setSubmitCentis] = useState<number | undefined>(undefined);
	const [bestTime, setBestTime] = useState<number | null>(null);
	const [attempt, setAttempt] = useState(0);
	const { celebrating, showWin } = useCelebration(status === 'won');
	const lv = useLevels(gameId, solitaireLevels);

	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const woodImgRef = useRef<HTMLImageElement | null>(null); // AI wood board (else flat brown)
	const dimRef = useRef({ w: 420, h: 420 });
	const layoutRef = useRef<Layout>(createLayout('anglais'));
	const pegsRef = useRef<boolean[]>(initialPegs(layoutRef.current));
	const histRef = useRef<boolean[][]>([]);
	const selRef = useRef(-1);
	const dragRef = useRef(-1);
	const animRef = useRef<Anim | null>(null);
	const hintRef = useRef<{ move: Move; until: number } | null>(null);
	const clockRef = useRef(0);
	const rafRef = useRef(0);
	const statusRef = useRef<Status>('playing');
	// Daily bookkeeping
	const dailyRef = useRef(false);
	const seedRef = useRef(0);
	const diffRef = useRef(1);
	const dailyInitRef = useRef<boolean[] | null>(null);
	const timerStartRef = useRef<number | null>(null);
	const timerRunRef = useRef(false);
	const startedRef = useRef(false);
	const bestTimeRef = useRef<number | null>(null);
	// Levels mode: routes move-end grading to lv.finish, reuses the daily timer + Commencer gate.
	const levelsRef = useRef(false);

	// Arm a freshly laid board: blurred, timer paused, waiting for ▶ Commencer.
	const armBoard = (): void => { startedRef.current = false; setStarted(false); };
	// ▶ Commencer: reveal + start the clock now (so thinking time counts).
	const beginPlay = (): void => {
		if (startedRef.current) return;
		startedRef.current = true;
		setStarted(true);
		timerStartRef.current = clockRef.current;
		timerRunRef.current = true;
	};

	// Load the wood board texture once (RAF loop picks it up next frame).
	useEffect(() => {
		const img = new Image();
		img.onload = () => { woodImgRef.current = img; };
		img.src = '/assets/jeux/solitaire/wood.jpg';
	}, []);

	/* ---------- Geometry ---------- */
	const geom = useCallback(() => {
		const { w, h } = dimRef.current;
		const L = layoutRef.current;
		const spanX = L.maxX - L.minX;
		const spanY = L.maxY - L.minY;
		const cell = Math.min(w / (spanX + 1.5), h / (spanY + 1.5));
		return { cell, ox: (w - spanX * cell) / 2, oy: (h - spanY * cell) / 2, L };
	}, []);
	const pixelOf = useCallback(
		(id: number): { px: number; py: number } => {
			const { cell, ox, oy, L } = geom();
			const hole = L.holes[id];
			return { px: ox + (hole.x - L.minX) * cell, py: oy + (hole.y - L.minY) * cell };
		},
		[geom],
	);
	const hitTest = useCallback(
		(x: number, y: number): number => {
			const { cell, ox, oy, L } = geom();
			let bestId = -1;
			let bestD = (cell * 0.55) ** 2;
			L.holes.forEach((hole, id) => {
				const px = ox + (hole.x - L.minX) * cell;
				const py = oy + (hole.y - L.minY) * cell;
				const d = (px - x) ** 2 + (py - y) ** 2;
				if (d < bestD) {
					bestD = d;
					bestId = id;
				}
			});
			return bestId;
		},
		[geom],
	);

	/* ---------- Free-mode record (fewest pegs) ---------- */
	const loadBest = (v: Variant): number | null => {
		try {
			const r = localStorage.getItem(bestKey(v));
			return r == null ? null : Number(r);
		} catch {
			return null;
		}
	};

	/* ---------- End of game ---------- */
	const finishFree = useCallback(
		(next: boolean[], won: boolean): void => {
			const count = pegCount(next);
			setBest((prev) => {
				const nb = prev == null ? count : Math.min(prev, count);
				try {
					localStorage.setItem(bestKey(layoutRef.current.variant), String(nb));
				} catch {
					/* ignore */
				}
				return nb;
			});
			trackGame(gameId, 'game_over', { score: count, win: won });
		},
		[gameId],
	);
	const finishDaily = useCallback((): void => {
		timerRunRef.current = false;
		const centis = Math.max(0, Math.round((clockRef.current - (timerStartRef.current ?? clockRef.current)) / 10));
		setFinalCentis(centis);
		bestTimeRef.current = bestTimeRef.current == null ? centis : Math.min(bestTimeRef.current, centis);
		setBestTime(bestTimeRef.current);
		setSubmitCentis(bestTimeRef.current);
		saveDailyRun(gameId, { startedAt: Date.now(), done: true, finalTime: bestTimeRef.current, seed: seedRef.current, diffIndex: diffRef.current });
		trackGame(gameId, 'game_over', { score: centis, win: true, mode: 'daily' });
	}, [gameId]);

	// Levels mode end: stop the clock, grade the run (win → time; stuck → fail).
	const finishLevel = useCallback((won: boolean): void => {
		timerRunRef.current = false;
		const centis = Math.max(0, Math.round((clockRef.current - (timerStartRef.current ?? clockRef.current)) / 10));
		setFinalCentis(won ? centis : null);
		lv.finish({ won, score: won ? centis : 0, raw: { variant: layoutRef.current.variant, pegs: pegCount(pegsRef.current) } });
	}, [lv]);

	const doMove = useCallback(
		(m: Move): void => {
			histRef.current.push(pegsRef.current);
			pegsRef.current = applyMove(pegsRef.current, m);
			animRef.current = { move: m, start: clockRef.current };
			selRef.current = -1;
			hintRef.current = null;
			setMoves((n) => n + 1);
			const next = pegsRef.current;
			setPegs(pegCount(next));
			const won = isWin(next);
			const stuck = !won && isStuck(layoutRef.current, next);
			if (won) {
				statusRef.current = 'won';
				setStatus('won');
				if (levelsRef.current) finishLevel(true);
				else if (dailyRef.current) finishDaily();
				else finishFree(next, true);
			} else if (stuck) {
				statusRef.current = 'stuck';
				setStatus('stuck');
				if (levelsRef.current) finishLevel(false);
				else if (!dailyRef.current) finishFree(next, false);
			}
		},
		[finishDaily, finishFree, finishLevel],
	);

	/* ---------- Mode setup ---------- */
	const startFree = useCallback(
		(v: Variant): void => {
			levelsRef.current = false;
			dailyRef.current = false;
			setDaily(false);
			setDailyLoading(false);
			setAlreadyPlayed(false);
			setVariant(v);
			layoutRef.current = createLayout(v);
			pegsRef.current = initialPegs(layoutRef.current);
			histRef.current = [];
			selRef.current = -1;
			dragRef.current = -1;
			animRef.current = null;
			hintRef.current = null;
			timerStartRef.current = null;
			timerRunRef.current = false;
			armBoard();
			statusRef.current = 'playing';
			setStatus('playing');
			setMoves(0);
			setPegs(pegCount(pegsRef.current));
			setFinalCentis(null);
			setSubmitCentis(undefined);
			setElapsed(0);
			setBest(loadBest(v));
			trackGame(gameId, 'game_started', { variant: v, mode: 'free' });
		},
		[gameId],
	);

	const startDaily = useCallback(async (): Promise<void> => {
		levelsRef.current = false;
		dailyRef.current = true;
		setDaily(true);
		selRef.current = -1;
		const apply = (seed: number, diffIndex: number, finalTime: number | null): void => {
			seedRef.current = seed >>> 0;
			diffRef.current = clamp(diffIndex, 0, 2);
			const count = DAILY_COUNT[diffRef.current];
			layoutRef.current = createLayout('anglais');
			const p = generateDaily(seedRef.current, count);
			dailyInitRef.current = p;
			pegsRef.current = p.slice();
			histRef.current = [];
			selRef.current = -1;
			dragRef.current = -1;
			animRef.current = null;
			hintRef.current = null;
			timerStartRef.current = null;
			timerRunRef.current = false;
			armBoard();
			statusRef.current = 'playing';
			setStatus('playing');
			setMoves(0);
			setPegs(pegCount(p));
			setFinalCentis(null);
			setSubmitCentis(undefined);
			setElapsed(0);
			bestTimeRef.current = finalTime;
			setBestTime(finalTime);
			setAttempt((a) => a + 1);
			setDailyLoading(false);
		};
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			apply(run.seed, run.diffIndex ?? dailyDifficultyIndex(), run.finalTime ?? null);
			if (run.done) {
				// One attempt per day: lock the result, no replay, no Commencer gate.
				setAlreadyPlayed(true);
				startedRef.current = true;
				setStarted(true);
				statusRef.current = 'won';
				setStatus('won');
				setFinalCentis(run.finalTime ?? null);
				setSubmitCentis(undefined); // already submitted — don't resubmit on resume
			} else {
				setAlreadyPlayed(false);
			}
			return;
		}
		setAlreadyPlayed(false);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		apply(seed, diffIndex, null);
	}, [gameId]);

	/* ---------- Levels mode ---------- */
	// Start a level from its seeded config; arm the board + Commencer gate (chrono starts on ▶).
	const startLevel = useCallback((level: number): void => {
		const cfg = lv.play(level);
		levelsRef.current = true;
		dailyRef.current = false;
		setDaily(false);
		setDailyLoading(false);
		setAlreadyPlayed(false);
		layoutRef.current = createLayout(cfg.variant);
		setVariant(cfg.variant);
		const p = levelPegs(cfg);
		dailyInitRef.current = p;
		pegsRef.current = p.slice();
		histRef.current = [];
		selRef.current = -1;
		dragRef.current = -1;
		animRef.current = null;
		hintRef.current = null;
		timerStartRef.current = null;
		timerRunRef.current = false;
		armBoard();
		statusRef.current = 'playing';
		setStatus('playing');
		setMoves(0);
		setPegs(pegCount(p));
		setFinalCentis(null);
		setSubmitCentis(undefined);
		setElapsed(0);
	}, [lv]);

	const armLevels = useCallback((): void => {
		levelsRef.current = true;
		dailyRef.current = false;
		setDaily(false);
		lv.enter();
	}, [lv]);

	// Levels is the default landing: resume at the next unlocked level (grid once all cleared).
	// startLevel already arms the ready-gate. A ?defi deep link opens the daily instead.
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily') return;
		void lv.resume().then((next) => { if (next != null) startLevel(next); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Leave levels mode (helper for the mode toggle).
	const exitLevels = useCallback((): void => {
		levelsRef.current = false;
		lv.exit();
	}, [lv]);

	const restart = (): void => {
		if (levelsRef.current) {
			startLevel(lv.level);
		} else if (dailyRef.current) {
			pegsRef.current = (dailyInitRef.current ?? pegsRef.current).slice();
			histRef.current = [];
			selRef.current = -1;
			animRef.current = null;
			hintRef.current = null;
			timerStartRef.current = null;
			timerRunRef.current = false;
			armBoard();
			statusRef.current = 'playing';
			setStatus('playing');
			setMoves(0);
			setPegs(pegCount(pegsRef.current));
			setFinalCentis(null);
			setElapsed(0);
		} else {
			startFree(layoutRef.current.variant);
		}
	};
	const undo = (): void => {
		const prev = histRef.current.pop();
		if (!prev) return;
		pegsRef.current = prev;
		animRef.current = null;
		selRef.current = -1;
		hintRef.current = null;
		statusRef.current = 'playing';
		setStatus('playing');
		setMoves((n) => Math.max(0, n - 1));
		setPegs(pegCount(prev));
	};
	const hint = (): void => {
		if (statusRef.current !== 'playing' || animRef.current) return;
		const m = hintMove(layoutRef.current, pegsRef.current);
		if (m) {
			hintRef.current = { move: m, until: clockRef.current + 2200 };
			selRef.current = m.from;
		}
	};

	/* ---------- Pointer ---------- */
	const posFrom = (e: React.PointerEvent): { x: number; y: number } => {
		const cv = canvasRef.current!;
		const rect = cv.getBoundingClientRect();
		return {
			x: (e.clientX - rect.left) * (dimRef.current.w / rect.width),
			y: (e.clientY - rect.top) * (dimRef.current.h / rect.height),
		};
	};
	const validTarget = (from: number, hole: number): Move | undefined =>
		movesFrom(layoutRef.current, pegsRef.current, from).find((m) => m.to === hole);

	const onDown = (e: React.PointerEvent): void => {
		if (statusRef.current !== 'playing' || !startedRef.current || animRef.current || dailyLoading) return;
		const p = posFrom(e);
		const hole = hitTest(p.x, p.y);
		if (hole < 0) {
			selRef.current = -1;
			return;
		}
		const ps = pegsRef.current;
		if (ps[hole] && movesFrom(layoutRef.current, ps, hole).length > 0) {
			selRef.current = hole;
			dragRef.current = hole;
			canvasRef.current?.setPointerCapture(e.pointerId);
		} else if (selRef.current >= 0) {
			const m = validTarget(selRef.current, hole);
			if (m) doMove(m);
			else selRef.current = -1;
		}
	};
	const onUp = (e: React.PointerEvent): void => {
		const from = dragRef.current;
		dragRef.current = -1;
		if (from < 0 || animRef.current) return;
		const p = posFrom(e);
		const hole = hitTest(p.x, p.y);
		if (hole >= 0 && hole !== from) {
			const m = validTarget(from, hole);
			if (m) doMove(m);
		}
	};

	/* ---------- Loop + sizing ---------- */
	useEffect(() => {
		startFree('anglais');
		const resize = (): void => {
			const wrap = wrapRef.current;
			const cv = canvasRef.current;
			if (!wrap || !cv) return;
			const w = clamp(wrap.clientWidth, 240, 440);
			const dpr = window.devicePixelRatio || 1;
			dimRef.current = { w, h: w };
			cv.style.height = `${w}px`;
			cv.width = Math.round(w * dpr);
			cv.height = Math.round(w * dpr);
			const ctx = cv.getContext('2d');
			if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		resize();
		const ro = new ResizeObserver(resize);
		if (wrapRef.current) ro.observe(wrapRef.current);
		let last = performance.now();
		const frame = (now: number): void => {
			clockRef.current += Math.min(now - last, 100);
			last = now;
			if (animRef.current && clockRef.current - animRef.current.start >= ANIM_MS) animRef.current = null;
			draw();
			rafRef.current = requestAnimationFrame(frame);
		};
		rafRef.current = requestAnimationFrame(frame);
		return () => {
			ro.disconnect();
			cancelAnimationFrame(rafRef.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Live chrono in daily + levels mode (both race the clock from ▶ Commencer).
	useEffect(() => {
		if (!daily && !lv.active) return;
		const id = setInterval(() => {
			if (timerRunRef.current && timerStartRef.current != null) setElapsed(clockRef.current - timerStartRef.current);
		}, 100);
		return () => clearInterval(id);
	}, [daily, lv.active]);

	/* ---------- Draw ---------- */
	const drawMarble = (ctx: CanvasRenderingContext2D, px: number, py: number, r: number, id: number, alpha = 1): void => {
		const hue = marbleHue(id);
		const g = ctx.createRadialGradient(px - r * 0.35, py - r * 0.4, r * 0.1, px, py, r);
		g.addColorStop(0, `hsla(${hue}, 90%, 82%, ${alpha})`);
		g.addColorStop(0.55, `hsla(${hue}, 70%, 58%, ${alpha})`);
		g.addColorStop(1, `hsla(${hue}, 65%, 38%, ${alpha})`);
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc(px, py, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = `rgba(255,255,255,${0.75 * alpha})`;
		ctx.beginPath();
		ctx.ellipse(px - r * 0.32, py - r * 0.38, r * 0.26, r * 0.18, -0.5, 0, Math.PI * 2);
		ctx.fill();
	};

	const draw = (): void => {
		const cv = canvasRef.current;
		if (!cv) return;
		const ctx = cv.getContext('2d');
		if (!ctx) return;
		const { w, h } = dimRef.current;
		const { cell, L } = geom();
		const R = cell * 0.42;
		const pr = cell * 0.36;
		const ps = pegsRef.current;
		const now = clockRef.current;
		const anim = animRef.current;
		const hintOn = hintRef.current && now < hintRef.current.until ? hintRef.current.move : null;

		ctx.clearRect(0, 0, w, h);
		const woodPat = woodImgRef.current && ctx.createPattern(woodImgRef.current, 'repeat');
		ctx.fillStyle = woodPat || '#3b2a1c';
		panelPath(ctx, w, h, cell * 0.7);
		ctx.fill();

		L.holes.forEach((_, id) => {
			const { px, py } = pixelOf(id);
			ctx.fillStyle = 'rgba(0,0,0,0.5)';
			ctx.beginPath();
			ctx.arc(px, py, R, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = '#2a1d12';
			ctx.beginPath();
			ctx.arc(px, py + R * 0.08, R * 0.82, 0, Math.PI * 2);
			ctx.fill();
			if (L.center === id) {
				ctx.strokeStyle = 'rgba(255,220,140,0.35)';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(px, py, R * 0.5, 0, Math.PI * 2);
				ctx.stroke();
			}
		});

		if (selRef.current >= 0 && !anim) {
			for (const m of movesFrom(L, ps, selRef.current)) {
				const { px, py } = pixelOf(m.to);
				const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 260));
				ctx.strokeStyle = `rgba(120,200,120,${0.5 + 0.4 * pulse})`;
				ctx.lineWidth = 2.5;
				ctx.beginPath();
				ctx.arc(px, py, R * 0.7, 0, Math.PI * 2);
				ctx.stroke();
			}
		}
		if (hintOn) {
			const { px, py } = pixelOf(hintOn.to);
			const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 200));
			ctx.strokeStyle = `rgba(255,209,102,${0.55 + 0.4 * pulse})`;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(px, py, R * 0.78, 0, Math.PI * 2);
			ctx.stroke();
		}

		const t = anim ? clamp((now - anim.start) / ANIM_MS, 0, 1) : 1;
		L.holes.forEach((_, id) => {
			if (!ps[id]) return;
			if (anim && id === anim.move.to) return;
			const { px, py } = pixelOf(id);
			const sel = id === selRef.current;
			if (sel) {
				ctx.strokeStyle = 'rgba(255,255,255,0.9)';
				ctx.lineWidth = 3;
				ctx.beginPath();
				ctx.arc(px, py - 2, pr + 3, 0, Math.PI * 2);
				ctx.stroke();
			}
			drawMarble(ctx, px, py - (sel ? 2 : 0), pr, id);
		});

		if (anim) {
			const a = pixelOf(anim.move.from);
			const b = pixelOf(anim.move.to);
			const px = a.px + (b.px - a.px) * t;
			const py = a.py + (b.py - a.py) * t - Math.sin(t * Math.PI) * cell * 0.5;
			const capP = pixelOf(anim.move.over);
			const cs = 1 - t;
			if (cs > 0.02) drawMarble(ctx, capP.px, capP.py, pr * cs, anim.move.over, cs);
			drawMarble(ctx, px, py, pr, anim.move.to);
		}
	};

	const layout = layoutRef.current;
	const perfect = status === 'won' && (layout.center < 0 || pegsRef.current[layout.center]);
	const timed = daily || lv.active; // both race the chrono
	const chrono = timed && status === 'won' && finalCentis != null ? fmtCentis(finalCentis) : `${(elapsed / 1000).toFixed(1)} s`;

	return (
		<div className="sol-root">
			<style>{CSS}</style>

			<ModeToggle
				daily={daily}
				onFree={() => { if (lv.active) exitLevels(); startFree(variant); }}
				onDaily={() => { if (lv.active) exitLevels(); startDaily(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

			{lv.active ? (
				<div className="sol-dailytag">
					{lv.menu ? 'Progression — résous un niveau pour débloquer le suivant' : `Niveau ${lv.level} · ${layout.variant === 'triangle' ? 'Triangle' : 'Croix'} · ${pegs} billes — le plus vite possible`}
				</div>
			) : daily ? (
				<div className="sol-dailytag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DAILY_COUNT[diffRef.current]} billes — le plus vite possible`}
				</div>
			) : (
				<div className="sol-variants" role="tablist" aria-label="Plateau">
					{VARIANTS.map((v) => (
						<button key={v.key} role="tab" aria-selected={variant === v.key} className={`sol-pill ${variant === v.key ? 'active' : ''}`} onClick={() => startFree(v.key)}>
							{v.label}
						</button>
					))}
				</div>
			)}

			<div className="sol-hud">
				<span className="sol-stat">
					Billes <strong>{pegs}</strong>
				</span>
				{daily ? (
					<>
						<span className="sol-stat">
							Chrono <strong>{chrono}</strong>
						</span>
						<span className="sol-stat">
							Record <strong>{bestTime == null ? '—' : fmtCentis(bestTime)}</strong>
						</span>
					</>
				) : lv.active ? (
					<>
						<span className="sol-stat">
							Chrono <strong>{chrono}</strong>
						</span>
						<span className="sol-stat">
							Coups <strong>{moves}</strong>
						</span>
					</>
				) : (
					<>
						<span className="sol-stat">
							Coups <strong>{moves}</strong>
						</span>
						<span className="sol-stat">
							Record <strong>{best ?? '—'}</strong>
						</span>
					</>
				)}
			</div>

			<div className="sol-playwrap" ref={wrapRef}>
				<canvas ref={canvasRef} className={`sol-canvas${started ? '' : ' sol-blur'}`} onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={onUp} />

				{celebrating && <Celebration />}
				{dailyLoading && (
					<div className="sol-overlay">
						<div className="sol-card">Préparation du défi…</div>
					</div>
				)}
				{!started && status === 'playing' && !dailyLoading && !(lv.active && lv.menu) && !lv.done && (
					<div className="sol-overlay">
						<div className="sol-card">
							<h3>Prêt&nbsp;?</h3>
							<p>Le chrono démarre dès que tu commences — pas de repérage gratuit&nbsp;!</p>
							<button className="sol-btn primary" onClick={beginPlay}>▶ Commencer</button>
						</div>
					</div>
				)}
				{lv.active && lv.menu && (
					<div className="sol-overlay sol-overlay-scroll">
						<LevelSelect progress={lv.progress} onPick={startLevel} />
					</div>
				)}
				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={solitaireLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won ? `Résolu en ${chrono} · ${moves} coups` : `Bloqué — il reste ${pegs} billes`}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
				{!lv.active && (showWin || (alreadyPlayed && status === 'won')) && (
					<div className="sol-overlay">
						<div className="sol-card">
							{daily ? (
								<>
									<h3>{alreadyPlayed ? '✓ Défi déjà relevé' : '🎉 Résolu !'}</h3>
									<p>
										{alreadyPlayed
											? <>Ton temps du jour&nbsp;: <strong>{finalCentis != null ? fmtCentis(finalCentis) : chrono}</strong>. Reviens demain pour un nouveau défi&nbsp;!</>
											: <>En <strong>{finalCentis != null ? fmtCentis(finalCentis) : chrono}</strong> et {moves} coups. Un seul essai&nbsp;: ton temps est classé — reviens demain&nbsp;!</>}
									</p>
								</>
							) : (
								<>
									<h3>{perfect ? '🏆 Parfait !' : '🎉 Gagné !'}</h3>
									<p>{perfect ? 'Une seule bille, pile au centre. Chapeau !' : 'Il ne reste qu’une seule bille. Bravo !'}</p>
									<button className="sol-btn primary" onClick={restart}>
										↻ Rejouer
									</button>
								</>
							)}
						</div>
					</div>
				)}
				{status === 'stuck' && !lv.active && (
					<div className="sol-overlay">
						<div className="sol-card">
							<h3>Plus de coups possibles</h3>
							<p>
								Il reste <strong>{pegs}</strong> billes. {daily ? 'Annule un ou plusieurs coups pour tenter une autre voie.' : 'Annule pour retenter, ou recommence.'}
							</p>
							<div className="sol-cardbtns">
								<button className="sol-btn primary" onClick={undo}>
									↶ Annuler
								</button>
								{!daily && (
									<button className="sol-btn" onClick={restart}>
										↻ Recommencer
									</button>
								)}
							</div>
						</div>
					</div>
				)}
			</div>

			{!(lv.active && (lv.menu || lv.done)) && (
				<div className="sol-controls">
					<button className="sol-btn" onClick={undo} disabled={moves === 0 || status === 'won'}>
						↶ Annuler
					</button>
					{/* Levels are timed too — no free hints there. */}
					{!daily && !lv.active && (
						<button className="sol-btn" onClick={hint} disabled={status !== 'playing' || !started}>
							💡 Indice
						</button>
					)}
					{/* Daily = one attempt: no restart. Free + levels stay replayable. */}
					{!daily && (
						<button className="sol-btn" onClick={restart}>
							↻ Recommencer
						</button>
					)}
				</div>
			)}

			<p className="sol-help">
				{lv.active
					? 'Niveaux : chaque niveau part d’une position toujours résoluble. Vide le plateau jusqu’à une seule bille pour le valider — plus tu vas vite, plus tu gagnes d’étoiles.'
					: daily
						? 'Défi du jour : un mini-plateau identique pour tout le monde. Vide-le jusqu’à une seule bille le plus vite possible — ton meilleur temps entre au classement.'
						: 'Tape une bille puis un trou situé deux cases plus loin (ou fais-la glisser) pour sauter par-dessus une voisine et la retirer. Objectif : n’en laisser qu’une — au centre pour la croix.'}
			</p>

			{daily ? (
				<Leaderboard key={`lb-${gameId}-${attempt}`} game={gameId} metric="time" submitValue={status === 'won' && !alreadyPlayed ? submitCentis : undefined} format={fmtCentis} />
			) : !lv.active ? (
				<LeaderboardCorner game={gameId} metric="time" />
			) : null}
		</div>
	);
}

/** Trace the rounded board panel path (caller fills). */
function panelPath(ctx: CanvasRenderingContext2D, w: number, h: number, pad: number): void {
	const x = pad * 0.4;
	const y = pad * 0.4;
	const rw = w - pad * 0.8;
	const rh = h - pad * 0.8;
	const rad = 18;
	ctx.beginPath();
	ctx.moveTo(x + rad, y);
	ctx.arcTo(x + rw, y, x + rw, y + rh, rad);
	ctx.arcTo(x + rw, y + rh, x, y + rh, rad);
	ctx.arcTo(x, y + rh, x, y, rad);
	ctx.arcTo(x, y, x + rw, y, rad);
	ctx.closePath();
}

const CSS = `
.sol-root { --sol: var(--accent-regular); width: 100%; max-width: 480px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.sol-dailytag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.55rem; }
.sol-variants { display: flex; gap: 6px; margin-bottom: 0.55rem; }
.sol-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 16px; cursor: pointer; }
.sol-pill.active { background: var(--sol); color: var(--accent-text-over); border-color: var(--sol); }
.sol-hud { display: flex; gap: 0.5rem; font-size: 14px; font-weight: 600; margin-bottom: 0.6rem; }
.sol-stat { background: var(--gray-900); border-radius: 999px; padding: 6px 14px; font-variant-numeric: tabular-nums; }
.sol-stat strong { margin-left: 4px; color: var(--sol); }
.sol-playwrap { position: relative; width: 100%; max-width: 440px; display: flex; justify-content: center; }
.sol-canvas { display: block; width: 100%; touch-action: none; user-select: none; -webkit-user-select: none; border-radius: 16px; box-shadow: var(--shadow-md); cursor: pointer; }
/* Armed board: hidden behind the ▶ Commencer gate until the player starts. */
.sol-canvas.sol-blur { filter: blur(7px); cursor: default; }
.sol-overlay { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.45); backdrop-filter: blur(3px); border-radius: 16px; }
/* Level grid overlay: scrolls if the 100-tile grid overflows the board. */
.sol-overlay-scroll { align-items: flex-start; overflow: auto; padding: 12px; z-index: 8; }
.sol-card { background: var(--gray-999); border: 2px solid var(--sol); border-radius: 16px; padding: 18px 22px; max-width: 18rem; text-align: center; box-shadow: var(--shadow-lg); color: var(--gray-0); }
.sol-card h3 { margin: 0 0 0.5rem; font-family: var(--font-brand); font-size: var(--text-xl); }
.sol-card p { color: var(--gray-200); font-size: 13.5px; line-height: 1.5; margin: 0 0 0.9rem; }
.sol-cardbtns { display: flex; gap: 8px; justify-content: center; }
.sol-controls { display: flex; gap: 8px; margin-top: 0.8rem; flex-wrap: wrap; justify-content: center; }
.sol-btn { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13.5px; border-radius: 999px; padding: 9px 18px; cursor: pointer; }
.sol-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sol-btn.primary { background: var(--sol); color: var(--accent-text-over); border-color: var(--sol); }
.sol-help { max-width: 440px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 0.9rem; }
`;
