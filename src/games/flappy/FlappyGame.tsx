import { useState, useEffect, useRef, useCallback } from 'react';
import {
	FLAPPY_CFG,
	FLAPPY_DIFFS,
	flappyConfig,
	createFlappy,
	flap,
	stepWorld,
	type FlappyConfig,
	type FlappyState,
} from './engine';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, dailyDifficultyIndex, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';

/* =====================================================
   FLAPPY COCOTTE — real-time React island (canvas + rAF loop).
   Libre : graine aléatoire, record local.
   Défi du jour : tuyaux identiques pour tous, rejouable, meilleur score classé.
   Engine is pure/tested (fixed-timestep physics).
   ===================================================== */

type Status = 'ready' | 'playing' | 'over';
type DiffKey = keyof typeof FLAPPY_DIFFS;
const BEST_KEY = 'ludiven-flappy-best';
const DIFF_ORDER: DiffKey[] = ['facile', 'moyen', 'difficile'];
const STEP = 1000 / 60; // ms per physics step

// Self-contained daytime scene (a little Flappy world, independent of the page theme).
const drawCloud = (ctx: CanvasRenderingContext2D, x: number, y: number, sc: number) => {
	ctx.beginPath();
	ctx.arc(x, y, 5 * sc, 0, Math.PI * 2);
	ctx.arc(x + 5 * sc, y + 1.4 * sc, 6 * sc, 0, Math.PI * 2);
	ctx.arc(x + 11 * sc, y, 4.6 * sc, 0, Math.PI * 2);
	ctx.arc(x + 5.5 * sc, y - 2.4 * sc, 4.6 * sc, 0, Math.PI * 2);
	ctx.fill();
};

const drawCloudLayer = (
	ctx: CanvasRenderingContext2D,
	worldW: number,
	distance: number,
	factor: number,
	span: number,
	ys: number[],
	sc: number,
	alpha: number,
) => {
	ctx.fillStyle = `rgba(255,255,255,${alpha})`;
	// Each cloud k lives at world x = k*span; the layer scrolls by distance*factor. Indexing by
	// the GLOBAL k (not a local loop index) keeps each cloud's position and height stable, so they
	// drift smoothly off the left and in from the right with no pop.
	const scroll = distance * factor;
	const margin = 22; // a cloud is ~16 wide; cull just outside the view
	const kStart = Math.floor((scroll - margin) / span);
	const kEnd = Math.ceil((scroll + worldW + margin) / span);
	for (let k = kStart; k <= kEnd; k++) {
		const x = k * span - scroll;
		const y = ys[((k % ys.length) + ys.length) % ys.length];
		drawCloud(ctx, x, y, sc);
	}
};

const drawPipe = (ctx: CanvasRenderingContext2D, cfg: FlappyConfig, p: { x: number; gapCenter: number }) => {
	const gapTop = p.gapCenter - cfg.gapH / 2;
	const gapBottom = p.gapCenter + cfg.gapH / 2;
	const floorY = cfg.worldH - cfg.groundH;
	const grad = ctx.createLinearGradient(p.x, 0, p.x + cfg.pipeW, 0);
	grad.addColorStop(0, '#4caf5a');
	grad.addColorStop(0.4, '#7ed98a');
	grad.addColorStop(1, '#3c9a4c');
	const lip = 1.4;
	ctx.fillStyle = grad;
	ctx.strokeStyle = '#2f7a3c';
	ctx.lineWidth = 0.5;
	// Top pipe + lip.
	ctx.fillRect(p.x, 0, cfg.pipeW, gapTop - 3);
	ctx.strokeRect(p.x, 0, cfg.pipeW, gapTop - 3);
	ctx.fillRect(p.x - lip, gapTop - 3, cfg.pipeW + 2 * lip, 3);
	ctx.strokeRect(p.x - lip, gapTop - 3, cfg.pipeW + 2 * lip, 3);
	// Bottom pipe + lip (stops at the ground).
	ctx.fillRect(p.x, gapBottom + 3, cfg.pipeW, floorY - (gapBottom + 3));
	ctx.strokeRect(p.x, gapBottom + 3, cfg.pipeW, floorY - (gapBottom + 3));
	ctx.fillRect(p.x - lip, gapBottom, cfg.pipeW + 2 * lip, 3);
	ctx.strokeRect(p.x - lip, gapBottom, cfg.pipeW + 2 * lip, 3);
};

// A little hen ("cocotte"): white body, red comb + wattle, orange beak, wing, tail.
const drawHen = (ctx: CanvasRenderingContext2D, cfg: FlappyConfig, birdY: number, vy: number) => {
	const r = cfg.birdR;
	const tilt = Math.max(-0.5, Math.min(0.8, vy / 180));
	const RED = '#e23b3b';
	ctx.save();
	ctx.translate(cfg.birdX, birdY);
	ctx.rotate(tilt);

	// Tail feathers (back, pointing up-left).
	ctx.fillStyle = '#eef0f2';
	ctx.beginPath();
	ctx.moveTo(-r * 0.7, r * 0.1);
	ctx.lineTo(-r * 1.7, -r * 0.9);
	ctx.lineTo(-r * 1.0, -r * 0.2);
	ctx.lineTo(-r * 1.6, -r * 0.1);
	ctx.closePath();
	ctx.fill();

	// Body.
	ctx.fillStyle = '#ffffff';
	ctx.beginPath();
	ctx.ellipse(0, r * 0.1, r * 1.05, r * 0.95, 0, 0, Math.PI * 2);
	ctx.fill();

	// Wing.
	ctx.fillStyle = '#e6e8ea';
	ctx.beginPath();
	ctx.ellipse(-r * 0.15, r * 0.2, r * 0.55, r * 0.4, -0.25, 0, Math.PI * 2);
	ctx.fill();

	// Head.
	const hx = r * 0.62;
	const hy = -r * 0.55;
	ctx.fillStyle = '#ffffff';
	ctx.beginPath();
	ctx.arc(hx, hy, r * 0.62, 0, Math.PI * 2);
	ctx.fill();

	// Comb (crête) — three red bumps on top of the head.
	ctx.fillStyle = RED;
	for (let i = 0; i < 3; i++) {
		ctx.beginPath();
		ctx.arc(hx - r * 0.25 + i * r * 0.28, hy - r * 0.55, r * 0.2, 0, Math.PI * 2);
		ctx.fill();
	}

	// Beak (orange) pointing forward.
	ctx.fillStyle = '#ff9f1c';
	ctx.beginPath();
	ctx.moveTo(hx + r * 0.45, hy - r * 0.05);
	ctx.lineTo(hx + r * 1.2, hy + r * 0.18);
	ctx.lineTo(hx + r * 0.45, hy + r * 0.32);
	ctx.closePath();
	ctx.fill();

	// Wattle (barbillon) under the beak.
	ctx.fillStyle = RED;
	ctx.beginPath();
	ctx.ellipse(hx + r * 0.5, hy + r * 0.42, r * 0.16, r * 0.26, 0, 0, Math.PI * 2);
	ctx.fill();

	// Eye.
	ctx.fillStyle = '#1b1b1b';
	ctx.beginPath();
	ctx.arc(hx + r * 0.18, hy - r * 0.1, r * 0.13, 0, Math.PI * 2);
	ctx.fill();

	ctx.restore();
};

const drawGround = (ctx: CanvasRenderingContext2D, cfg: FlappyConfig, distance: number) => {
	const top = cfg.worldH - cfg.groundH;
	ctx.fillStyle = '#ded08a';
	ctx.fillRect(0, top, cfg.worldW, cfg.groundH);
	ctx.fillStyle = '#caa15a';
	ctx.fillRect(0, top, cfg.worldW, 1.6);
	// Scrolling stripes for a sense of speed.
	ctx.fillStyle = 'rgba(160,120,60,0.35)';
	const span = 9;
	const off = (distance % span) + span;
	for (let x = -off; x < cfg.worldW; x += span) ctx.fillRect(x, top + 2.5, 4.5, cfg.groundH - 3.5);
};

export default function FlappyGame({ gameId }: { gameId: string }) {
	const [status, setStatus] = useState<Status>('ready');
	const [score, setScore] = useState(0);
	const [best, setBest] = useState(0);
	const [diffKey, setDiffKey] = useState<DiffKey>('moyen');
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [attempt, setAttempt] = useState(0);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stateRef = useRef<FlappyState>(createFlappy());
	const cfgRef = useRef<FlappyConfig>(FLAPPY_CFG);
	const holdingRef = useRef(false); // key/pointer currently held (variable jump)
	const seedRef = useRef(0);
	const diffIdxRef = useRef(0);
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const accRef = useRef(0);
	const runningRef = useRef(false);
	const scoreRef = useRef(0);
	const startRef = useRef(0);
	const cssSizeRef = useRef(0);
	const dailyRef = useRef(false);
	const statusRef = useRef<Status>('ready');

	/* ---- Drawing (everything in world units 0..100 via a scale transform) ---- */
	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		const st = stateRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const cfg = cfgRef.current;
		const size = cssSizeRef.current;
		const dpr = window.devicePixelRatio || 1;
		const sc = (size / cfg.worldW) * dpr; // world → device px
		ctx.setTransform(sc, 0, 0, sc, 0, 0);

		// Sky.
		const sky = ctx.createLinearGradient(0, 0, 0, cfg.worldH);
		sky.addColorStop(0, '#5fb6e6');
		sky.addColorStop(1, '#c7ecf8');
		ctx.fillStyle = sky;
		ctx.fillRect(0, 0, cfg.worldW, cfg.worldH);

		// Parallax clouds: far (slow) then near (faster).
		drawCloudLayer(ctx, cfg.worldW, st.distance, 0.18, 46, [16, 30], 1.05, 0.55);
		drawCloudLayer(ctx, cfg.worldW, st.distance, 0.42, 34, [10, 38, 22], 0.72, 0.85);

		for (const p of st.pipes) drawPipe(ctx, cfg, p);
		drawGround(ctx, cfg, st.distance);
		drawHen(ctx, cfg, st.birdY, st.vy);
	}, []);

	const resize = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const dpr = window.devicePixelRatio || 1;
		const cssSize = canvas.clientWidth;
		cssSizeRef.current = cssSize;
		canvas.width = Math.round(cssSize * dpr);
		canvas.height = Math.round(cssSize * dpr);
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
				st = stepWorld(st, STEP / 1000, cfgRef.current, seedRef.current, holdingRef.current);
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
		stateRef.current = flap(createFlappy(cfgRef.current), cfgRef.current); // first input starts + flaps up
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
		stateRef.current = flap(stateRef.current, cfgRef.current);
	}, [dailyLoading, start]);

	/* ---- Modes ---- */
	const armFree = useCallback(
		(key: DiffKey = diffKey) => {
			stop();
			dailyRef.current = false;
			setDaily(false);
			setAlreadyPlayed(false);
			setDiffKey(key);
			cfgRef.current = flappyConfig(FLAPPY_DIFFS[key]);
			seedRef.current = (Math.random() * 2 ** 32) >>> 0;
			stateRef.current = createFlappy(cfgRef.current);
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
		},
		[stop, draw, diffKey],
	);

	const startDaily = useCallback(async () => {
		stop();
		dailyRef.current = true;
		setDaily(true);
		statusRef.current = 'ready';
		setStatus('ready');
		const applyLevel = (seed: number, diffIndex: number) => {
			seedRef.current = seed;
			diffIdxRef.current = diffIndex;
			const key = DIFF_ORDER[diffIndex] ?? 'moyen';
			setDiffKey(key);
			cfgRef.current = flappyConfig(FLAPPY_DIFFS[key]);
			stateRef.current = createFlappy(cfgRef.current);
			setScore(0);
			scoreRef.current = 0;
		};
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			applyLevel(run.seed, run.diffIndex ?? dailyDifficultyIndex());
			const st = (run.state as { best?: number } | undefined) ?? {};
			setBest(st.best ?? 0);
			setAlreadyPlayed(run.done === true);
			setDailyLoading(false);
			draw();
			return;
		}
		setDailyLoading(true);
		setAlreadyPlayed(false);
		const { seed, diffIndex } = await getDaily(gameId);
		applyLevel(seed, diffIndex);
		setBest(0);
		setDailyLoading(false);
		draw();
	}, [gameId, stop, draw]);

	/* ---- Input ---- */
	useEffect(() => {
		const isFlapKey = (k: string) => k === ' ' || k === 'ArrowUp' || k === 'w';
		const onKeyDown = (e: KeyboardEvent) => {
			if (!isFlapKey(e.key)) return;
			e.preventDefault();
			if (e.repeat) return; // auto-repeat: holding already armed, don't re-flap
			holdingRef.current = true;
			doFlap();
		};
		const onKeyUp = (e: KeyboardEvent) => {
			if (isFlapKey(e.key)) holdingRef.current = false;
		};
		window.addEventListener('keydown', onKeyDown, { passive: false });
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, [doFlap]);

	/* Release the held boost on any pointer/touch up, even outside the canvas. */
	useEffect(() => {
		const release = () => {
			holdingRef.current = false;
		};
		window.addEventListener('pointerup', release);
		window.addEventListener('pointercancel', release);
		return () => {
			window.removeEventListener('pointerup', release);
			window.removeEventListener('pointercancel', release);
		};
	}, []);

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
		holdingRef.current = true;
		doFlap();
	};

	return (
		<div className="fl-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => armFree(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="fl-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${FLAPPY_DIFFS[diffKey].label}`}
				</div>
			) : (
				<div className="fl-pills" role="tablist" aria-label="Difficulté">
					{DIFF_ORDER.map((k) => (
						<button
							key={k}
							role="tab"
							aria-selected={diffKey === k}
							className={`fl-pill ${diffKey === k ? 'active' : ''}`}
							onClick={() => armFree(k)}
						>
							{FLAPPY_DIFFS[k].label}
						</button>
					))}
				</div>
			)}

			<div className="fl-bar">
				<span className="fl-score">Score {score}</span>
				<span className="fl-best">Record {best}</span>
			</div>

			<div className="fl-boardwrap">
				<canvas
					ref={canvasRef}
					className="fl-canvas"
					role="img"
					aria-label={`Flappy Cocotte — score ${score}`}
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
				Appuie sur <strong>Espace</strong>, clique ou touche l'écran pour battre des ailes.
				Plus tu <strong>maintiens</strong>, plus la cocotte monte haut ; un petit tap = petit saut.
				Chaque tuyau franchi vaut 1 point. Choisis ta difficulté (écart et taille des ouvertures) ;
				au défi du jour, les tuyaux sont les mêmes pour tout le monde.
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
.fl-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.85rem; }
.fl-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.fl-pill.active { background: var(--fl-accent); color: var(--accent-text-over); border-color: var(--fl-accent); }
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
