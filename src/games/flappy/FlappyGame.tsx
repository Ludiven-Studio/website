import { useState, useEffect, useRef, useCallback } from 'react';
import { FLAPPY_CFG, createFlappy, flap, stepWorld, type FlappyState } from './engine';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';

/* =====================================================
   FLAPPY BIRD — real-time React island (canvas + rAF loop).
   Libre : graine aléatoire, record local.
   Défi du jour : tuyaux identiques pour tous, rejouable, meilleur score classé.
   Engine is pure/tested (fixed-timestep physics).
   ===================================================== */

type Status = 'ready' | 'playing' | 'over';
const BEST_KEY = 'ludiven-flappy-best';
const STEP = 1000 / 60; // ms per physics step

interface Colors {
	bg: string;
	pipe: string;
	bird: string;
	ground: string;
}

const readColors = (): Colors => {
	const cs = getComputedStyle(document.documentElement);
	const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
	return {
		bg: v('--gray-999', '#0e1014'),
		pipe: v('--accent-regular', '#7b5cff'),
		bird: v('--gray-0', '#f5f5f5'),
		ground: v('--gray-800', '#1b1f27'),
	};
};

export default function FlappyGame({ gameId }: { gameId: string }) {
	const [status, setStatus] = useState<Status>('ready');
	const [score, setScore] = useState(0);
	const [best, setBest] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [attempt, setAttempt] = useState(0);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stateRef = useRef<FlappyState>(createFlappy());
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
	const dailyRef = useRef(false);
	const statusRef = useRef<Status>('ready');

	/* ---- Drawing ---- */
	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		const st = stateRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const colors = colorsRef.current ?? (colorsRef.current = readColors());
		const size = cssSizeRef.current;
		const s = size / FLAPPY_CFG.worldW; // world → px
		ctx.clearRect(0, 0, size, size);
		ctx.fillStyle = colors.bg;
		ctx.fillRect(0, 0, size, size);
		// Pipes (top + bottom of each gap).
		ctx.fillStyle = colors.pipe;
		for (const p of st.pipes) {
			const gapTop = p.gapCenter - FLAPPY_CFG.gapH / 2;
			const gapBottom = p.gapCenter + FLAPPY_CFG.gapH / 2;
			ctx.beginPath();
			ctx.roundRect(p.x * s, 0, FLAPPY_CFG.pipeW * s, gapTop * s, 4);
			ctx.roundRect(p.x * s, gapBottom * s, FLAPPY_CFG.pipeW * s, (FLAPPY_CFG.worldH - gapBottom) * s, 4);
			ctx.fill();
		}
		// Bird.
		ctx.fillStyle = colors.bird;
		ctx.beginPath();
		ctx.arc(FLAPPY_CFG.birdX * s, st.birdY * s, FLAPPY_CFG.birdR * s, 0, Math.PI * 2);
		ctx.fill();
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

	/* ---- Loop ---- */
	const stop = useCallback(() => {
		runningRef.current = false;
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = 0;
	}, []);

	const onGameOver = useCallback(() => {
		stop();
		const sc = stateRef.current.score;
		statusRef.current = 'over';
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
			const dt = Math.min(now - lastRef.current, 200);
			lastRef.current = now;
			accRef.current += dt;
			let st = stateRef.current;
			while (runningRef.current && accRef.current >= STEP) {
				accRef.current -= STEP;
				st = stepWorld(st, STEP / 1000, FLAPPY_CFG, seedRef.current);
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
		stateRef.current = flap(createFlappy()); // first input starts + flaps up
		scoreRef.current = 0;
		accRef.current = 0;
		lastRef.current = performance.now();
		startRef.current = Date.now();
		runningRef.current = true;
		statusRef.current = 'playing';
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

	const doFlap = useCallback(() => {
		if (dailyLoading) return;
		if (statusRef.current === 'over') return;
		if (statusRef.current === 'ready') {
			start();
			return;
		}
		stateRef.current = flap(stateRef.current);
	}, [dailyLoading, start]);

	/* ---- Modes ---- */
	const armFree = useCallback(() => {
		stop();
		dailyRef.current = false;
		setDaily(false);
		setAlreadyPlayed(false);
		seedRef.current = (Math.random() * 2 ** 32) >>> 0;
		stateRef.current = createFlappy();
		scoreRef.current = 0;
		setScore(0);
		statusRef.current = 'ready';
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
		statusRef.current = 'ready';
		setStatus('ready');
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			seedRef.current = run.seed;
			diffIdxRef.current = run.diffIndex ?? 0;
			stateRef.current = createFlappy();
			const st = (run.state as { best?: number } | undefined) ?? {};
			setBest(st.best ?? 0);
			setAlreadyPlayed(run.done === true);
			setScore(0);
			scoreRef.current = 0;
			setDailyLoading(false);
			draw();
			return;
		}
		setDailyLoading(true);
		setAlreadyPlayed(false);
		const { seed, diffIndex } = await getDaily(gameId);
		seedRef.current = seed;
		diffIdxRef.current = diffIndex;
		stateRef.current = createFlappy();
		setBest(0);
		setScore(0);
		scoreRef.current = 0;
		setDailyLoading(false);
		draw();
	}, [gameId, stop, draw]);

	/* ---- Input ---- */
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
				e.preventDefault();
				doFlap();
			}
		};
		window.addEventListener('keydown', onKey, { passive: false });
		return () => window.removeEventListener('keydown', onKey);
	}, [doFlap]);

	useEffect(() => {
		const onVis = () => {
			if (document.hidden) {
				if (runningRef.current) {
					runningRef.current = false;
					if (rafRef.current) cancelAnimationFrame(rafRef.current);
					rafRef.current = 0;
				}
			} else if (statusRef.current === 'playing' && !runningRef.current) {
				lastRef.current = performance.now();
				runningRef.current = true;
				rafRef.current = requestAnimationFrame(frame);
			}
		};
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	}, [frame]);

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

	const onCanvasPointer = (e: React.PointerEvent) => {
		e.preventDefault();
		doFlap();
	};

	return (
		<div className="fl-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={armFree} onDaily={startDaily} />

			{daily ? (
				<div className="fl-daily-tag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · tuyaux partagés`}
				</div>
			) : null}

			<div className="fl-bar">
				<span className="fl-score">Score {score}</span>
				<span className="fl-best">Record {best}</span>
			</div>

			<div className="fl-boardwrap">
				<canvas
					ref={canvasRef}
					className="fl-canvas"
					role="img"
					aria-label={`Flappy Bird — score ${score}`}
					onPointerDown={onCanvasPointer}
				/>

				{status === 'ready' && !dailyLoading && (
					<div className="fl-overlay">
						<button className="fl-startbtn" onClick={start}>▶ {daily ? 'Commencer' : 'Jouer'}</button>
						{daily && alreadyPlayed && <p className="fl-overlay-note">Record du jour : {best}</p>}
					</div>
				)}
				{dailyLoading && (
					<div className="fl-overlay"><div className="fl-overlay-card">Préparation…</div></div>
				)}
				{status === 'over' && (
					<div className="fl-overlay">
						<div className="fl-overlay-card">
							<p className="fl-go-title">Aïe&nbsp;!</p>
							<p className="fl-go-score">Score {score} · Record {best}</p>
							<button className="fl-startbtn sm" onClick={start}>↻ Rejouer</button>
						</div>
					</div>
				)}
			</div>

			<p className="fl-help">
				Appuie sur <strong>Espace</strong>, clique ou touche l'écran pour battre des ailes et passer
				entre les tuyaux. Chaque tuyau franchi vaut 1 point. Au défi du jour, les tuyaux sont les mêmes
				pour tout le monde.
			</p>

			{daily && <Leaderboard key={`lb-${gameId}-${attempt}`} game={gameId} metric="score" submitValue={status === 'over' ? score : undefined} />}
			{!daily && <LeaderboardCorner game={gameId} metric="score" />}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.fl-root {
  --fl-accent: var(--accent-regular);
  width: 100%; max-width: 460px; margin-inline: auto;
  color: var(--gray-0); font-family: var(--font-body);
  display: flex; flex-direction: column; align-items: center;
}
.fl-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem; }
.fl-bar { width: 100%; display: flex; justify-content: center; gap: 0.5rem; font-weight: 700; font-size: 13px; margin-bottom: 0.85rem; }
.fl-score { background: var(--fl-accent); color: var(--accent-text-over); border-radius: 999px; padding: 5px 14px; }
.fl-best { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 14px; }

.fl-boardwrap { position: relative; width: 100%; max-width: 420px; margin-inline: auto; }
.fl-canvas {
  width: 100%; aspect-ratio: 1 / 1; display: block;
  background: var(--gray-999); border: 1px solid var(--gray-800); border-radius: 12px;
  touch-action: none; cursor: pointer;
}

.fl-overlay {
  position: absolute; inset: 0; z-index: 2;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6rem;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.25)); backdrop-filter: blur(2px); border-radius: 12px;
}
.fl-overlay-card {
  background: var(--gray-999); border: 2px solid var(--fl-accent); border-radius: 16px;
  padding: 18px 26px; text-align: center; box-shadow: var(--shadow-lg); color: var(--gray-0);
}
.fl-overlay-note { color: var(--gray-300); font-size: 13px; margin: 0; }
.fl-go-title { font-family: var(--font-brand); font-weight: 600; font-size: 20px; margin: 0 0 4px; }
.fl-go-score { color: var(--gray-300); font-size: 14px; margin: 0 0 12px; font-variant-numeric: tabular-nums; }
.fl-startbtn {
  border: none; background: var(--fl-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.fl-startbtn.sm { font-size: 15px; padding: 10px 26px; }

.fl-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.1rem; }
`;
