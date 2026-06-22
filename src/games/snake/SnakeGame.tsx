import { useState, useEffect, useRef, useCallback } from 'react';
import {
	SNAKE_CFG,
	foodSequence,
	createSnake,
	setDir,
	stepSnake,
	tickInterval,
	type Dir,
	type SnakeState,
	type Vec,
} from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
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
const BEST_KEY = 'ludiven-snake-best';

interface Colors {
	bg: string;
	grid: string;
	body: string;
	head: string;
	food: string;
}

const readColors = (): Colors => {
	const cs = getComputedStyle(document.documentElement);
	const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
	return {
		bg: v('--gray-999', '#0e1014'),
		grid: v('--gray-800', '#1b1f27'),
		body: v('--gray-0', '#f5f5f5'),
		head: v('--accent-regular', '#7b5cff'),
		food: v('--accent-regular', '#7b5cff'),
	};
};

export default function SnakeGame({ gameId }: { gameId: string }) {
	const [status, setStatus] = useState<Status>('ready');
	const [score, setScore] = useState(0);
	const [best, setBest] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [attempt, setAttempt] = useState(0);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stateRef = useRef<SnakeState | null>(null);
	const seqRef = useRef<Vec[]>([]);
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
		ctx.clearRect(0, 0, size, size);
		ctx.fillStyle = colors.bg;
		ctx.fillRect(0, 0, size, size);
		// Faint grid.
		ctx.strokeStyle = colors.grid;
		ctx.lineWidth = 1;
		ctx.globalAlpha = 0.6;
		for (let i = 1; i < SNAKE_CFG.cols; i++) {
			ctx.beginPath();
			ctx.moveTo(i * cell, 0);
			ctx.lineTo(i * cell, size);
			ctx.moveTo(0, i * cell);
			ctx.lineTo(size, i * cell);
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
		const pad = Math.max(1, cell * 0.08);
		const cellRect = (c: Vec, fill: string) => {
			ctx.fillStyle = fill;
			ctx.beginPath();
			ctx.roundRect(c.x * cell + pad, c.y * cell + pad, cell - 2 * pad, cell - 2 * pad, cell * 0.28);
			ctx.fill();
		};
		cellRect(st.food, colors.food);
		st.snake.forEach((seg, i) => cellRect(seg, i === 0 ? colors.head : colors.body));
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
				saveDailyRun(gameId, {
					startedAt: startRef.current,
					done: true,
					seed: seedRef.current,
					diffIndex: diffIdxRef.current,
					state: { best: nb },
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
			while (runningRef.current && accRef.current >= tickInterval(st.score)) {
				accRef.current -= tickInterval(st.score);
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
		stateRef.current = createSnake(SNAKE_CFG, seqRef.current);
		scoreRef.current = 0;
		accRef.current = 0;
		lastRef.current = performance.now();
		startRef.current = Date.now();
		runningRef.current = true;
		setScore(0);
		setStatus('playing');
		setAttempt((a) => a + 1);
		trackGame(gameId, 'game_started');
		if (dailyRef.current)
			saveDailyRun(gameId, {
				startedAt: startRef.current,
				done: false,
				seed: seedRef.current,
				diffIndex: diffIdxRef.current,
				state: { best },
			});
		draw();
		rafRef.current = requestAnimationFrame(frame);
	}, [gameId, best, draw, frame]);

	/* ---- Modes ---- */
	const armFree = useCallback(() => {
		stop();
		dailyRef.current = false;
		setDaily(false);
		setAlreadyPlayed(false);
		seedRef.current = (Math.random() * 2 ** 32) >>> 0;
		seqRef.current = foodSequence(SNAKE_CFG, mulberry32(seedRef.current));
		stateRef.current = createSnake(SNAKE_CFG, seqRef.current);
		scoreRef.current = 0;
		setScore(0);
		setStatus('ready');
		try {
			setBest(Number(localStorage.getItem(BEST_KEY) ?? '0') || 0);
		} catch {
			setBest(0);
		}
		draw();
	}, [stop, draw]);

	const startDaily = useCallback(async () => {
		stop();
		dailyRef.current = true;
		setDaily(true);
		setStatus('ready');
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			seedRef.current = run.seed;
			diffIdxRef.current = run.diffIndex ?? 0;
			seqRef.current = foodSequence(SNAKE_CFG, mulberry32(run.seed));
			stateRef.current = createSnake(SNAKE_CFG, seqRef.current);
			const st = (run.state as { best?: number } | undefined) ?? {};
			setBest(st.best ?? 0);
			setAlreadyPlayed(run.done === true);
			setDailyLoading(false);
			setScore(0);
			scoreRef.current = 0;
			draw();
			return;
		}
		setDailyLoading(true);
		setAlreadyPlayed(false);
		const { seed, diffIndex } = await getDaily(gameId);
		seedRef.current = seed;
		diffIdxRef.current = diffIndex;
		seqRef.current = foodSequence(SNAKE_CFG, mulberry32(seed));
		stateRef.current = createSnake(SNAKE_CFG, seqRef.current);
		setBest(0);
		setScore(0);
		scoreRef.current = 0;
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

	/* Mount: size the canvas, arm a free game, cleanup the loop on unmount. */
	useEffect(() => {
		resize();
		armFree();
		const onResize = () => resize();
		window.addEventListener('resize', onResize);
		return () => {
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

			<ModeToggle daily={daily} onFree={armFree} onDaily={startDaily} />

			{daily ? (
				<div className="sn-daily-tag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · graine partagée`}
				</div>
			) : null}

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

				{status === 'ready' && !dailyLoading && (
					<div className="sn-overlay">
						<button className="sn-startbtn" onClick={start}>▶ {daily ? 'Commencer' : 'Jouer'}</button>
						{daily && alreadyPlayed && <p className="sn-overlay-note">Record du jour : {best}</p>}
					</div>
				)}
				{dailyLoading && (
					<div className="sn-overlay"><div className="sn-overlay-card">Préparation…</div></div>
				)}
				{status === 'over' && (
					<div className="sn-overlay">
						<div className="sn-overlay-card">
							<p className="sn-go-title">Perdu&nbsp;!</p>
							<p className="sn-go-score">Score {score} · Record {best}</p>
							<button className="sn-startbtn sm" onClick={start}>↻ Rejouer</button>
						</div>
					</div>
				)}
			</div>

			<p className="sn-help">
				Mange les pommes pour grandir. Flèches ou ZQSD/WASD au clavier, glisse du doigt sur mobile.
				Tu accélères en grossissant — évite les murs et ta propre queue&nbsp;!
			</p>

			{daily && <Leaderboard key={`lb-${gameId}-${attempt}`} game={gameId} metric="score" submitValue={status === 'over' ? score : undefined} />}
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
.sn-bar { width: 100%; display: flex; justify-content: center; gap: 0.5rem; font-weight: 700; font-size: 13px; margin-bottom: 0.85rem; }
.sn-score { background: var(--sn-accent); color: var(--accent-text-over); border-radius: 999px; padding: 5px 14px; }
.sn-best { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 14px; }

.sn-boardwrap { position: relative; width: 100%; max-width: 420px; margin-inline: auto; }
.sn-canvas {
  width: 100%; aspect-ratio: 1 / 1; display: block;
  background: var(--gray-999); border: 1px solid var(--gray-800); border-radius: 12px;
  touch-action: none;
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
