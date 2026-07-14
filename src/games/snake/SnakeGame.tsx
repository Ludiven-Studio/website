import { useState, useEffect, useRef, useCallback } from 'react';
import {
	SNAKE_CFG,
	SNAKE_DIFFS,
	createSnakeLevel,
	createSnake,
	setDir,
	stepSnake,
	tickInterval,
	type Dir,
	type SnakeDiff,
	type SnakeState,
	type Vec,
} from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, dailyDifficultyIndex, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';

/* =====================================================
   SNAKE — real-time React island (canvas + rAF loop).
   Libre : graine aléatoire, record local.
   Défi du jour : graine partagée, rejouable, meilleur score classé.
   Engine is pure/tested.
   ===================================================== */

type Status = 'ready' | 'playing' | 'over';
type DiffKey = keyof typeof SNAKE_DIFFS;
const BEST_KEY = 'ludiven-snake-best';
const DIFF_ORDER: DiffKey[] = ['facile', 'moyen', 'difficile'];
const MAX_TRIES = 10; // daily attempts per day; best of the day is ranked

interface DailyState {
	best: number;
	tries: number;
}

interface Colors {
	bg: string;
	grid: string;
	body: string;
	bodyLight: string;
	outline: string;
	head: string;
	rock: string;
	rockDark: string;
	apple: string;
	leaf: string;
	stem: string;
}

const readColors = (): Colors => {
	const cs = getComputedStyle(document.documentElement);
	const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
	return {
		bg: v('--gray-999', '#0e1014'),
		grid: v('--gray-800', '#1b1f27'),
		body: v('--accent-regular', '#7b5cff'),
		bodyLight: v('--accent-light', '#b9a3ff'),
		outline: '#241640',
		head: v('--accent-regular', '#7b5cff'),
		rock: v('--gray-500', '#6b7280'),
		rockDark: v('--gray-700', '#3b4252'),
		apple: '#e23b3b',
		leaf: '#3fb950',
		stem: '#8a5a2b',
	};
};

export default function SnakeGame({ gameId }: { gameId: string }) {
	const [status, setStatus] = useState<Status>('ready');
	const [score, setScore] = useState(0);
	const [best, setBest] = useState(0);
	const [diffKey, setDiffKey] = useState<DiffKey>('moyen');
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false); // daily tries exhausted (locked)
	const [attempt, setAttempt] = useState(0); // re-keys the leaderboard so each replay re-submits
	const [tries, setTries] = useState(0); // daily attempts used today

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stateRef = useRef<SnakeState | null>(null);
	const seqRef = useRef<Vec[]>([]);
	const rocksRef = useRef<Vec[]>([]);
	const diffRef = useRef<SnakeDiff>(SNAKE_DIFFS.moyen);
	const seedRef = useRef(0);
	const diffIdxRef = useRef(0);
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const accRef = useRef(0);
	const runningRef = useRef(false);
	const scoreRef = useRef(0);
	const startRef = useRef(0);
	const colorsRef = useRef<Colors | null>(null);
	const cssSizeRef = useRef(0);
	const touchRef = useRef<{ x: number; y: number } | null>(null);
	const dailyRef = useRef(false); // latest daily flag for callbacks/listeners
	const triesRef = useRef(0); // daily attempts used (guards start without stale state)
	const bgImgRef = useRef<HTMLImageElement | null>(null); // AI board background
	const appleImgRef = useRef<HTMLImageElement | null>(null); // AI apple sprite
	const rockImgRef = useRef<HTMLImageElement | null>(null); // AI rock sprite

	/* ---- Canvas sizing + drawing ---- */
	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		const st = stateRef.current;
		if (!canvas || !st) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const colors = colorsRef.current ?? (colorsRef.current = readColors());
		const size = cssSizeRef.current;
		const cell = size / SNAKE_CFG.cols;
		const cx = (c: Vec) => c.x * cell + cell / 2;
		const cy = (c: Vec) => c.y * cell + cell / 2;
		ctx.clearRect(0, 0, size, size);
		const bgImg = bgImgRef.current;
		if (bgImg) {
			ctx.drawImage(bgImg, 0, 0, size, size);
			ctx.fillStyle = 'rgba(6, 12, 8, 0.14)'; // whisper of darken so the snake/apple pop
			ctx.fillRect(0, 0, size, size);
		} else {
			ctx.fillStyle = colors.bg;
			ctx.fillRect(0, 0, size, size);
		}

		// Checkerboard cells so the grid reads clearly (aligned to the play cells),
		// then a light line grid on top.
		if (bgImg) {
			// Two levels of dark tint → a checker that reads on the light pastel lawn.
			for (let gy = 0; gy < SNAKE_CFG.cols; gy++) {
				for (let gx = 0; gx < SNAKE_CFG.cols; gx++) {
					ctx.fillStyle = (gx + gy) % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(20,40,15,0.15)';
					ctx.fillRect(gx * cell, gy * cell, cell, cell);
				}
			}
		}
		ctx.strokeStyle = bgImg ? 'rgba(25,45,20,0.28)' : colors.grid;
		ctx.lineWidth = 1;
		ctx.globalAlpha = bgImg ? 1 : 0.5;
		for (let i = 1; i < SNAKE_CFG.cols; i++) {
			ctx.beginPath();
			ctx.moveTo(i * cell, 0);
			ctx.lineTo(i * cell, size);
			ctx.moveTo(0, i * cell);
			ctx.lineTo(size, i * cell);
			ctx.stroke();
		}
		ctx.globalAlpha = 1;

		// Rocks: a cartoon sprite when loaded, else a shaded procedural boulder.
		const rockImg = rockImgRef.current;
		for (const r of st.rocks) {
			const x = r.x * cell;
			const y = r.y * cell;
			if (rockImg) {
				const rs = cell * 0.82; // smaller than the cell → grass shows around it
				const rw = rs * (rockImg.naturalWidth / rockImg.naturalHeight || 1);
				ctx.drawImage(rockImg, x + (cell - rw) / 2, y + (cell - rs) / 2, rw, rs);
				continue;
			}
			const m = cell * 0.1;
			ctx.fillStyle = colors.rockDark;
			ctx.beginPath();
			ctx.roundRect(x + m, y + m, cell - 2 * m, cell - 2 * m, cell * 0.22);
			ctx.fill();
			ctx.fillStyle = colors.rock;
			ctx.beginPath();
			ctx.roundRect(x + m, y + m, cell - 2 * m, cell - 2.4 * m, cell * 0.22);
			ctx.fill();
			ctx.fillStyle = colors.rockDark;
			ctx.globalAlpha = 0.6;
			ctx.beginPath();
			ctx.arc(x + cell * 0.4, y + cell * 0.55, cell * 0.06, 0, Math.PI * 2);
			ctx.arc(x + cell * 0.62, y + cell * 0.42, cell * 0.045, 0, Math.PI * 2);
			ctx.fill();
			ctx.globalAlpha = 1;
		}

		// Apple: an AI sprite when loaded, else the procedural fallback.
		{
			const ax = cx(st.food);
			const ay = cy(st.food);
			const appleImg = appleImgRef.current;
			if (appleImg) {
				const h = cell * 1.08; // fits within the cell → grass shows around it
				const w = h * (appleImg.naturalWidth / appleImg.naturalHeight || 1);
				ctx.drawImage(appleImg, ax - w / 2, ay - h / 2, w, h);
			} else {
			const r = cell * 0.3;
			ctx.fillStyle = colors.apple;
			ctx.beginPath();
			ctx.arc(ax - r * 0.35, ay + r * 0.1, r * 0.8, 0, Math.PI * 2);
			ctx.arc(ax + r * 0.35, ay + r * 0.1, r * 0.8, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = '#ffffff';
			ctx.globalAlpha = 0.35;
			ctx.beginPath();
			ctx.arc(ax - r * 0.35, ay - r * 0.2, r * 0.28, 0, Math.PI * 2);
			ctx.fill();
			ctx.globalAlpha = 1;
			ctx.strokeStyle = colors.stem;
			ctx.lineWidth = Math.max(1, cell * 0.07);
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo(ax, ay - r * 0.7);
			ctx.lineTo(ax + cell * 0.03, ay - r * 1.25);
			ctx.stroke();
			ctx.fillStyle = colors.leaf;
			ctx.beginPath();
			ctx.ellipse(ax + r * 0.45, ay - r * 1.15, r * 0.45, r * 0.22, -0.6, 0, Math.PI * 2);
			ctx.fill();
			}
		}

		// Snake: cartoon look — a dark outline pass under a bright body with a top
		// highlight, then a rounded head with eyes and a little forked tongue.
		const n = st.snake.length;
		if (n > 0) {
			const outline = colors.outline;
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';
			const bodyW = (i: number) => cell * (0.78 - 0.3 * (i / n));
			const stroke = (extra: number, style: string) => {
				ctx.strokeStyle = style;
				for (let i = n - 1; i >= 1; i--) {
					ctx.lineWidth = bodyW(i) + extra;
					ctx.beginPath();
					ctx.moveTo(cx(st.snake[i]), cy(st.snake[i]));
					ctx.lineTo(cx(st.snake[i - 1]), cy(st.snake[i - 1]));
					ctx.stroke();
				}
			};
			stroke(cell * 0.16, outline); // dark outline
			stroke(0, colors.body); // body fill
			// Top highlight: a thin brighter line offset up-left along the body.
			ctx.strokeStyle = colors.bodyLight;
			ctx.globalAlpha = 0.55;
			for (let i = n - 1; i >= 1; i--) {
				ctx.lineWidth = Math.max(1, bodyW(i) * 0.3);
				ctx.beginPath();
				ctx.moveTo(cx(st.snake[i]) - cell * 0.08, cy(st.snake[i]) - cell * 0.1);
				ctx.lineTo(cx(st.snake[i - 1]) - cell * 0.08, cy(st.snake[i - 1]) - cell * 0.1);
				ctx.stroke();
			}
			ctx.globalAlpha = 1;

			// Head.
			const head = st.snake[0];
			const hx = cx(head);
			const hy = cy(head);
			const hr = cell * 0.48;
			const fwd = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[st.dir];
			// Tongue (behind the head), forked, pointing forward.
			const tb = hr * 1.05;
			const tt = hr * 1.7;
			ctx.strokeStyle = '#e5484d';
			ctx.lineWidth = Math.max(1.5, cell * 0.06);
			ctx.beginPath();
			ctx.moveTo(hx + fwd.x * tb, hy + fwd.y * tb);
			ctx.lineTo(hx + fwd.x * tt, hy + fwd.y * tt);
			ctx.stroke();
			const fk = hr * 0.22;
			ctx.beginPath();
			ctx.moveTo(hx + fwd.x * tt, hy + fwd.y * tt);
			ctx.lineTo(hx + fwd.x * (tt + fk) + -fwd.y * fk, hy + fwd.y * (tt + fk) + fwd.x * fk);
			ctx.moveTo(hx + fwd.x * tt, hy + fwd.y * tt);
			ctx.lineTo(hx + fwd.x * (tt + fk) - -fwd.y * fk, hy + fwd.y * (tt + fk) - fwd.x * fk);
			ctx.stroke();
			// Outlined head.
			ctx.fillStyle = outline;
			ctx.beginPath();
			ctx.arc(hx, hy, hr + cell * 0.08, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = colors.head;
			ctx.beginPath();
			ctx.arc(hx, hy, hr, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = colors.bodyLight;
			ctx.globalAlpha = 0.5;
			ctx.beginPath();
			ctx.arc(hx - hr * 0.32, hy - hr * 0.34, hr * 0.4, 0, Math.PI * 2);
			ctx.fill();
			ctx.globalAlpha = 1;
			// Eyes, oriented by direction.
			const px = -fwd.y;
			const py = fwd.x; // perpendicular
			for (const sgn of [-1, 1]) {
				const ex = hx + fwd.x * hr * 0.26 + px * sgn * hr * 0.44;
				const ey = hy + fwd.y * hr * 0.26 + py * sgn * hr * 0.44;
				ctx.fillStyle = '#ffffff';
				ctx.beginPath();
				ctx.arc(ex, ey, hr * 0.3, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = outline;
				ctx.beginPath();
				ctx.arc(ex, ey, hr * 0.3, 0, Math.PI * 2);
				ctx.stroke();
				ctx.lineWidth = Math.max(1, cell * 0.03);
				ctx.fillStyle = '#101216';
				ctx.beginPath();
				ctx.arc(ex + fwd.x * hr * 0.12, ey + fwd.y * hr * 0.12, hr * 0.15, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}, []);

	const resize = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const dpr = window.devicePixelRatio || 1;
		const cssSize = canvas.clientWidth;
		cssSizeRef.current = cssSize;
		canvas.width = Math.round(cssSize * dpr);
		canvas.height = Math.round(cssSize * dpr);
		const ctx = canvas.getContext('2d');
		if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		colorsRef.current = readColors();
		draw();
	}, [draw]);

	/* ---- Game loop ---- */
	const stop = useCallback(() => {
		runningRef.current = false;
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = 0;
	}, []);

	const onGameOver = useCallback(() => {
		stop();
		const sc = stateRef.current?.score ?? 0;
		setStatus('over');
		setBest((prev) => {
			const nb = Math.max(prev, sc);
			if (dailyRef.current) {
				const exhausted = triesRef.current >= MAX_TRIES;
				if (exhausted) setAlreadyPlayed(true);
				saveDailyRun(gameId, {
					startedAt: startRef.current,
					done: true,
					seed: seedRef.current,
					diffIndex: diffIdxRef.current,
					state: { best: nb, tries: triesRef.current } satisfies DailyState,
				});
			} else {
				try {
					localStorage.setItem(BEST_KEY, String(nb));
				} catch {
					/* ignore */
				}
			}
			return nb;
		});
		trackGame(gameId, 'game_over', { score: sc });
	}, [gameId, stop]);

	const frame = useCallback(
		(now: number) => {
			if (!runningRef.current) return;
			const dt = Math.min(now - lastRef.current, 200); // clamp after tab-hidden
			lastRef.current = now;
			accRef.current += dt;
			let st = stateRef.current!;
			while (runningRef.current && accRef.current >= tickInterval(st.score, diffRef.current)) {
				accRef.current -= tickInterval(st.score, diffRef.current);
				st = stepSnake(st, SNAKE_CFG, seqRef.current);
				stateRef.current = st;
				if (st.status === 'over') break;
			}
			draw();
			if (st.score !== scoreRef.current) {
				scoreRef.current = st.score;
				setScore(st.score);
			}
			if (st.status === 'over') {
				onGameOver();
				return;
			}
			rafRef.current = requestAnimationFrame(frame);
		},
		[draw, onGameOver],
	);

	const start = useCallback(() => {
		if (dailyRef.current && triesRef.current >= MAX_TRIES) return; // out of daily tries
		stateRef.current = createSnake(SNAKE_CFG, seqRef.current, rocksRef.current);
		scoreRef.current = 0;
		accRef.current = 0;
		lastRef.current = performance.now();
		startRef.current = Date.now();
		runningRef.current = true;
		setScore(0);
		setStatus('playing');
		setAttempt((a) => a + 1);
		trackGame(gameId, 'game_started');
		if (dailyRef.current) {
			triesRef.current += 1; // a started run consumes a try (no farming by reloading)
			setTries(triesRef.current);
			saveDailyRun(gameId, {
				startedAt: startRef.current,
				done: false,
				seed: seedRef.current,
				diffIndex: diffIdxRef.current,
				state: { best, tries: triesRef.current } satisfies DailyState,
			});
		}
		draw();
		rafRef.current = requestAnimationFrame(frame);
	}, [gameId, best, draw, frame]);

	/* ---- Modes ---- */
	const armFree = useCallback(
		(key: DiffKey = diffKey) => {
			stop();
			dailyRef.current = false;
			setDaily(false);
			setAlreadyPlayed(false);
			triesRef.current = 0;
			setTries(0);
			setDiffKey(key);
			diffRef.current = SNAKE_DIFFS[key];
			seedRef.current = (Math.random() * 2 ** 32) >>> 0;
			const lvl = createSnakeLevel(SNAKE_CFG, SNAKE_DIFFS[key], mulberry32(seedRef.current));
			seqRef.current = lvl.seq;
			rocksRef.current = lvl.rocks;
			stateRef.current = createSnake(SNAKE_CFG, lvl.seq, lvl.rocks);
			scoreRef.current = 0;
			setScore(0);
			setStatus('ready');
			try {
				setBest(Number(localStorage.getItem(BEST_KEY) ?? '0') || 0);
			} catch {
				setBest(0);
			}
			draw();
		},
		[stop, draw, diffKey],
	);

	const startDaily = useCallback(async () => {
		stop();
		dailyRef.current = true;
		setDaily(true);
		setStatus('ready');
		const applyLevel = (seed: number, diffIndex: number) => {
			seedRef.current = seed;
			diffIdxRef.current = diffIndex;
			const key = DIFF_ORDER[diffIndex] ?? 'moyen';
			setDiffKey(key);
			diffRef.current = SNAKE_DIFFS[key];
			const lvl = createSnakeLevel(SNAKE_CFG, SNAKE_DIFFS[key], mulberry32(seed));
			seqRef.current = lvl.seq;
			rocksRef.current = lvl.rocks;
			stateRef.current = createSnake(SNAKE_CFG, lvl.seq, lvl.rocks);
			setScore(0);
			scoreRef.current = 0;
		};

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			// Resume today's daily: restore best + tries used; lock once tries are spent.
			applyLevel(run.seed, run.diffIndex ?? dailyDifficultyIndex());
			const st = (run.state as DailyState | undefined) ?? { best: 0, tries: 0 };
			triesRef.current = st.tries ?? 0;
			setTries(triesRef.current);
			setBest(st.best ?? 0);
			const exhausted = triesRef.current >= MAX_TRIES;
			setAlreadyPlayed(exhausted);
			if (exhausted) {
				setScore(st.best ?? 0);
				scoreRef.current = st.best ?? 0;
				setStatus('over');
			} else {
				setStatus('ready');
			}
			setDailyLoading(false);
			draw();
			return;
		}
		setDailyLoading(true);
		setAlreadyPlayed(false);
		triesRef.current = 0;
		setTries(0);
		const { seed, diffIndex } = await getDaily(gameId);
		applyLevel(seed, diffIndex);
		setBest(0);
		setStatus('ready');
		setDailyLoading(false);
		draw();
	}, [gameId, stop, draw]);

	/* ---- Input ---- */
	const turn = useCallback(
		(dir: Dir) => {
			if (status === 'over' || dailyLoading) return;
			if (status === 'ready') {
				start();
				stateRef.current = setDir(stateRef.current!, dir);
				return;
			}
			if (stateRef.current) stateRef.current = setDir(stateRef.current, dir);
		},
		[status, dailyLoading, start],
	);

	useEffect(() => {
		const KEYS: Record<string, Dir> = {
			ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
			w: 'up', s: 'down', a: 'left', d: 'right', z: 'up', q: 'left',
		};
		const onKey = (e: KeyboardEvent) => {
			const dir = KEYS[e.key];
			if (dir) {
				e.preventDefault();
				turn(dir);
			}
		};
		window.addEventListener('keydown', onKey, { passive: false });
		return () => window.removeEventListener('keydown', onKey);
	}, [turn]);

	/* Auto-pause when the tab is hidden; resume on return if mid-game. */
	useEffect(() => {
		const onVis = () => {
			if (document.hidden) {
				if (runningRef.current) {
					runningRef.current = false;
					if (rafRef.current) cancelAnimationFrame(rafRef.current);
					rafRef.current = 0;
				}
			} else if (status === 'playing' && !runningRef.current) {
				lastRef.current = performance.now();
				runningRef.current = true;
				rafRef.current = requestAnimationFrame(frame);
			}
		};
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	}, [status, frame]);

	/* Load the AI board background + apple sprite once; redraw when each arrives. */
	useEffect(() => {
		const load = (src: string, ref: React.RefObject<HTMLImageElement | null>) => {
			const img = new Image();
			img.onload = () => {
				ref.current = img;
				draw();
			};
			img.src = src;
		};
		load('/assets/jeux/snake/bg.jpg', bgImgRef);
		load('/assets/jeux/snake/apple.png', appleImgRef);
		load('/assets/jeux/snake/rock.png', rockImgRef);
	}, [draw]);

	/* Mount: size the canvas, arm a free game, cleanup the loop on unmount. */
	useEffect(() => {
		resize();
		armFree();
		const onResize = () => resize();
		const onFs = () => requestAnimationFrame(resize);
		window.addEventListener('resize', onResize);
		document.addEventListener('fullscreenchange', onFs);
		document.addEventListener('webkitfullscreenchange', onFs);
		return () => {
			document.removeEventListener('fullscreenchange', onFs);
			document.removeEventListener('webkitfullscreenchange', onFs);
			window.removeEventListener('resize', onResize);
			stop();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const onTouchStart = (e: React.TouchEvent) => {
		const t = e.touches[0];
		touchRef.current = { x: t.clientX, y: t.clientY };
	};
	const onTouchEnd = (e: React.TouchEvent) => {
		const start0 = touchRef.current;
		if (!start0) return;
		const t = e.changedTouches[0];
		const dx = t.clientX - start0.x;
		const dy = t.clientY - start0.y;
		if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return; // tap, not swipe
		turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
		touchRef.current = null;
	};

	return (
		<div className="sn-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => armFree(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="sn-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${SNAKE_DIFFS[diffKey].label} · Essai ${Math.min(tries, MAX_TRIES)}/${MAX_TRIES}`}
				</div>
			) : (
				<div className="sn-pills" role="tablist" aria-label="Difficulté">
					{DIFF_ORDER.map((k) => (
						<button
							key={k}
							role="tab"
							aria-selected={diffKey === k}
							className={`sn-pill ${diffKey === k ? 'active' : ''}`}
							onClick={() => armFree(k)}
						>
							{SNAKE_DIFFS[k].label}
						</button>
					))}
				</div>
			)}

			<div className="sn-bar">
				<span className="sn-score">Score {score}</span>
				<span className="sn-best">Record {best}</span>
			</div>

			<div className="sn-boardwrap">
				<canvas
					ref={canvasRef}
					className="sn-canvas"
					role="img"
					aria-label={`Snake — score ${score}`}
					onTouchStart={onTouchStart}
					onTouchEnd={onTouchEnd}
				/>

				{status === 'ready' && !dailyLoading && !(daily && alreadyPlayed) && (
					<div className="sn-overlay">
						<button className="sn-startbtn" onClick={start}>▶ {daily ? 'Commencer' : 'Jouer'}</button>
					</div>
				)}
				{dailyLoading && (
					<div className="sn-overlay"><div className="sn-overlay-card">Préparation…</div></div>
				)}
				{status === 'over' && (
					<div className="sn-overlay">
						<div className="sn-overlay-card">
							<p className="sn-go-title">{daily && alreadyPlayed ? 'Défi du jour terminé' : 'Perdu !'}</p>
							<p className="sn-go-score">
								{daily ? <>Score {score} · Meilleur {best}</> : <>Score {score} · Record {best}</>}
							</p>
							{daily && alreadyPlayed ? (
								<p className="sn-overlay-note">Reviens demain&nbsp;!</p>
							) : (
								<button className="sn-startbtn sm" onClick={start}>
									↻ Rejouer{daily ? ` (${MAX_TRIES - tries} restant${MAX_TRIES - tries > 1 ? 's' : ''})` : ''}
								</button>
							)}
						</div>
					</div>
				)}
			</div>

			<p className="sn-help">
				Mange les pommes pour grandir. Flèches ou ZQSD/WASD au clavier, glisse du doigt sur mobile.
				Tu accélères en grossissant — évite les murs et ta propre queue&nbsp;!
			</p>

			{daily && <Leaderboard key={`lb-${gameId}-${attempt}`} game={gameId} metric="score" submitValue={status === 'over' ? best : undefined} />}
			{!daily && <LeaderboardCorner game={gameId} metric="score" />}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.sn-root {
  --sn-accent: var(--accent-regular);
  width: 100%; max-width: 460px; margin-inline: auto;
  color: var(--gray-0); font-family: var(--font-body);
  display: flex; flex-direction: column; align-items: center;
}
.sn-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem; }
.sn-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.85rem; }
.sn-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.sn-pill.active { background: var(--accent-regular); color: var(--accent-text-over); border-color: var(--accent-regular); }
.sn-bar { width: 100%; display: flex; justify-content: center; gap: 0.5rem; font-weight: 700; font-size: 13px; margin-bottom: 0.85rem; }
.sn-score { background: var(--sn-accent); color: var(--accent-text-over); border-radius: 999px; padding: 5px 14px; }
.sn-best { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 14px; }

.sn-boardwrap { position: relative; width: 100%; max-width: 420px; margin-inline: auto; }
/* Site global fullscreen → the board fits the REMAINING space (a square, no overflow in landscape). */
.game-page.gf-full .sn-root { max-width: none; width: 100%; height: 100%; }
.game-page.gf-full .sn-boardwrap { flex: 1; min-height: 0; max-width: none; container-type: size; display: flex; align-items: center; justify-content: center; }
.game-page.gf-full .sn-canvas { width: min(100cqw, 100cqh); height: auto; }
.game-page.gf-full .sn-help { display: none; }
.sn-canvas {
  width: 100%; aspect-ratio: 1 / 1; display: block;
  background: var(--gray-999); border: 1px solid var(--gray-800); border-radius: 12px;
  touch-action: none; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none;
}

.sn-overlay {
  position: absolute; inset: 0; z-index: 2;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6rem;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.25)); backdrop-filter: blur(2px); border-radius: 12px;
}
.sn-overlay-card {
  background: var(--gray-999); border: 2px solid var(--sn-accent); border-radius: 16px;
  padding: 18px 26px; text-align: center; box-shadow: var(--shadow-lg); color: var(--gray-0);
}
.sn-overlay-note { color: var(--gray-300); font-size: 13px; margin: 0; }
.sn-go-title { font-family: var(--font-brand); font-weight: 600; font-size: 20px; margin: 0 0 4px; }
.sn-go-score { color: var(--gray-300); font-size: 14px; margin: 0 0 12px; font-variant-numeric: tabular-nums; }
.sn-startbtn {
  border: none; background: var(--sn-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.sn-startbtn.sm { font-size: 15px; padding: 10px 26px; }

.sn-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.1rem; }
`;
