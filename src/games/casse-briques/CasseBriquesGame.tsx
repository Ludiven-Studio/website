import { useState, useEffect, useRef, useCallback } from 'react';
import {
	BREAKOUT_CFG,
	BREAKOUT_DIFFS,
	generateBricks,
	createBreakout,
	launch,
	stepBreakout,
	type BreakoutDiff,
	type BreakoutState,
	type BonusKind,
} from './engine';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, dailyDifficultyIndex, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import { useLevels } from '../../lib/useLevels';
import { usePointerDrag } from '../usePointerDrag';
import { casseBriquesLevels } from './levels';

/* =====================================================
   CASSE-BRIQUES — real-time React island (canvas + rAF loop).
   Libre : graine aléatoire, record local.
   Défi du jour : graine partagée (mur + bonus identiques), rejouable, meilleur score classé.
   Niveaux : vide le mur avec un stock de vies limité (1-100).
   Engine is pure/tested.
   ===================================================== */

type Status = BreakoutState['status'];
type DiffKey = keyof typeof BREAKOUT_DIFFS;
const CFG = BREAKOUT_CFG;
const BEST_KEY = 'ludiven-casse-briques-best';
const DIFF_ORDER: DiffKey[] = ['facile', 'moyen', 'difficile'];
const MAX_TRIES = 5; // daily attempts per day; best of the day is ranked
const MAX_DT = 1 / 120; // physics sub-step cap so a fast ball never tunnels through a brick

interface DailyState {
	best: number;
	tries: number;
}

const BONUS_EMOJI: Record<BonusKind, string> = {
	wide: '📏',
	multi: '⚡',
	power: '💥',
	life: '❤️',
	slow: '🐢',
};
const BONUS_LABEL: Record<BonusKind, string> = {
	wide: 'Raquette large',
	multi: 'Multi-balles',
	power: 'Balle puissante',
	life: 'Vie bonus',
	slow: 'Ralenti',
};

interface Colors {
	bg: string;
	rows: string[];
	paddle: string;
	ball: string;
	line: string;
}

const readColors = (): Colors => {
	const cs = getComputedStyle(document.documentElement);
	const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
	const accent = v('--accent-regular', '#7b5cff');
	return {
		bg: v('--gray-999', '#0e1014'),
		// Pastel row ramp — warm at the top, cool toward the paddle.
		rows: ['#e8637a', '#f0913f', '#f0c94a', '#5fbf6f', '#4aa3e0', '#8a7be8'],
		paddle: accent,
		ball: v('--gray-0', '#f5f5f7'),
		line: v('--gray-800', '#1b1f27'),
	};
};

export default function CasseBriquesGame({ gameId }: { gameId: string }) {
	const [status, setStatus] = useState<Status>('ready');
	const [score, setScore] = useState(0);
	const [best, setBest] = useState(0);
	const [lives, setLives] = useState(CFG.startLives);
	const [active, setActive] = useState<BonusKind[]>([]); // timed bonuses currently running
	const [diffKey, setDiffKey] = useState<DiffKey>('moyen');
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false); // daily tries exhausted (locked)
	const [attempt, setAttempt] = useState(0); // re-keys the leaderboard so each replay re-submits
	const [tries, setTries] = useState(0); // daily attempts used today

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stateRef = useRef<BreakoutState | null>(null);
	const diffRef = useRef<BreakoutDiff>(BREAKOUT_DIFFS.moyen);
	const seedRef = useRef(0);
	const diffIdxRef = useRef(0);
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const runningRef = useRef(false);
	const scoreRef = useRef(0);
	const livesRef = useRef(CFG.startLives);
	const activeRef = useRef(''); // last active-bonus signature, to avoid per-frame setState
	const startRef = useRef(0);
	const colorsRef = useRef<Colors | null>(null);
	const cssWRef = useRef(0);
	const scaleRef = useRef(1);
	const paddleTargetRef = useRef(CFG.worldW / 2);
	const dailyRef = useRef(false);
	const triesRef = useRef(0);
	const lv = useLevels(gameId, casseBriquesLevels);
	const levelsRef = useRef(false);
	const livesGrantRef = useRef(CFG.startLives); // lives a level started with (for star math)

	/* ---- Canvas drawing ---- */
	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		const st = stateRef.current;
		if (!canvas || !st) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const c = colorsRef.current ?? (colorsRef.current = readColors());
		const S = scaleRef.current;
		const W = CFG.worldW * S;
		const H = CFG.worldH * S;
		ctx.clearRect(0, 0, W, H);
		ctx.fillStyle = c.bg;
		ctx.fillRect(0, 0, W, H);

		// Bricks — colour by row; a 2-hit brick reads darker until its first hit chips it.
		for (const b of st.bricks) {
			if (!b.alive) continue;
			const base = c.rows[b.row % c.rows.length];
			ctx.fillStyle = base;
			if (b.hp < b.maxHp) ctx.globalAlpha = 1; // chipped 2-hit brick brightens to full
			else if (b.maxHp === 2) ctx.globalAlpha = 0.72; // intact 2-hit brick reads darker
			roundRect(ctx, b.x * S, b.y * S, b.w * S, b.h * S, 1.4 * S);
			ctx.fill();
			ctx.globalAlpha = 1;
			if (b.maxHp === 2 && b.hp === b.maxHp) {
				ctx.strokeStyle = 'rgba(255,255,255,0.35)';
				ctx.lineWidth = Math.max(1, 0.5 * S);
				ctx.stroke();
			}
		}

		// Falling bonuses — a rounded capsule with an emoji glyph.
		for (const bo of st.bonuses) {
			ctx.fillStyle = c.paddle;
			roundRect(ctx, (bo.x - CFG.bonusW / 2) * S, (bo.y - CFG.bonusH / 2) * S, CFG.bonusW * S, CFG.bonusH * S, 1.6 * S);
			ctx.globalAlpha = 0.9;
			ctx.fill();
			ctx.globalAlpha = 1;
			ctx.font = `${CFG.bonusH * S * 0.86}px system-ui, sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(BONUS_EMOJI[bo.kind], bo.x * S, (bo.y + 0.2) * S);
		}

		// Paddle.
		const pw = st.wideMs > 0 ? CFG.paddleWideW : CFG.paddleBaseW;
		ctx.fillStyle = c.paddle;
		roundRect(ctx, (st.paddleX - pw / 2) * S, CFG.paddleY * S, pw * S, CFG.paddleH * S, CFG.paddleH * S * 0.5);
		ctx.fill();

		// Balls — a "power" ball glows.
		for (const ball of st.balls) {
			ctx.beginPath();
			ctx.arc(ball.x * S, ball.y * S, CFG.ballR * S, 0, Math.PI * 2);
			ctx.fillStyle = st.powerMs > 0 ? '#f0c94a' : c.ball;
			if (st.powerMs > 0) { ctx.shadowColor = '#f0c94a'; ctx.shadowBlur = 8; }
			ctx.fill();
			ctx.shadowBlur = 0;
		}
	}, []);

	const resize = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const dpr = window.devicePixelRatio || 1;
		const cssW = canvas.clientWidth;
		const cssH = cssW * (CFG.worldH / CFG.worldW);
		canvas.style.height = `${cssH}px`;
		cssWRef.current = cssW;
		scaleRef.current = cssW / CFG.worldW;
		canvas.width = Math.round(cssW * dpr);
		canvas.height = Math.round(cssH * dpr);
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

	const onEnd = useCallback((st: BreakoutState) => {
		stop();
		const sc = st.score;
		setStatus(st.status);
		setScore(sc);
		if (levelsRef.current) {
			// Win = field cleared. Lives left at the win drive the star grade.
			lv.finish({ won: st.status === 'won', score: sc, raw: { livesLeft: st.lives } });
			trackGame(gameId, 'game_over', { score: sc });
			return;
		}
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
				try { localStorage.setItem(BEST_KEY, String(nb)); } catch { /* ignore */ }
			}
			return nb;
		});
		trackGame(gameId, 'game_over', { score: sc });
	}, [gameId, stop, lv]);

	const frame = useCallback(
		(now: number) => {
			if (!runningRef.current) return;
			let dt = Math.min((now - lastRef.current) / 1000, 0.05); // clamp after tab-hidden
			lastRef.current = now;
			let st = stateRef.current!;
			// Sub-step so a fast ball can't skip over a brick between frames.
			while (dt > 0 && st.status === 'playing') {
				const step = Math.min(dt, MAX_DT);
				st = stepBreakout(st, step, CFG, paddleTargetRef.current);
				dt -= step;
			}
			stateRef.current = st;
			draw();
			if (st.score !== scoreRef.current) { scoreRef.current = st.score; setScore(st.score); }
			if (st.lives !== livesRef.current) { livesRef.current = st.lives; setLives(st.lives); }
			// Active timed bonuses (for the HUD chips) — only re-render when the set changes.
			const sig = `${st.wideMs > 0 ? 'w' : ''}${st.powerMs > 0 ? 'p' : ''}${st.slowMs > 0 ? 's' : ''}`;
			if (sig !== activeRef.current) {
				activeRef.current = sig;
				const list: BonusKind[] = [];
				if (st.wideMs > 0) list.push('wide');
				if (st.powerMs > 0) list.push('power');
				if (st.slowMs > 0) list.push('slow');
				setActive(list);
			}
			if (st.status === 'won' || st.status === 'over') { onEnd(st); return; }
			rafRef.current = requestAnimationFrame(frame);
		},
		[draw, onEnd],
	);

	const start = useCallback(() => {
		if (dailyRef.current && triesRef.current >= MAX_TRIES) return; // out of daily tries
		const built = createBreakout(CFG, generateBricks(seedRef.current, CFG, diffRef.current), diffRef.current);
		if (levelsRef.current) built.lives = livesGrantRef.current;
		paddleTargetRef.current = CFG.worldW / 2;
		stateRef.current = launch(built);
		scoreRef.current = 0;
		livesRef.current = built.lives;
		activeRef.current = '';
		lastRef.current = performance.now();
		startRef.current = Date.now();
		runningRef.current = true;
		setScore(0);
		setLives(built.lives);
		setActive([]);
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

	/* ---- Build a fresh (unlaunched) board for the ready-gate ---- */
	const arm = useCallback((seed: number, diff: BreakoutDiff, livesGrant?: number) => {
		diffRef.current = diff;
		seedRef.current = seed;
		const built = createBreakout(CFG, generateBricks(seed, CFG, diff), diff);
		if (livesGrant != null) built.lives = livesGrant;
		stateRef.current = built;
		scoreRef.current = 0;
		livesRef.current = built.lives;
		paddleTargetRef.current = CFG.worldW / 2;
		setScore(0);
		setLives(built.lives);
		setActive([]);
		setStatus('ready');
		draw();
	}, [draw]);

	/* ---- Modes ---- */
	const armFree = useCallback(
		(key: DiffKey = diffKey) => {
			stop();
			dailyRef.current = false;
			levelsRef.current = false;
			setDaily(false);
			setAlreadyPlayed(false);
			triesRef.current = 0;
			setTries(0);
			setDiffKey(key);
			seedRef.current = (Math.random() * 2 ** 32) >>> 0;
			arm(seedRef.current, BREAKOUT_DIFFS[key]);
			try { setBest(Number(localStorage.getItem(BEST_KEY) ?? '0') || 0); } catch { setBest(0); }
		},
		[stop, arm, diffKey],
	);

	const startDaily = useCallback(async () => {
		stop();
		dailyRef.current = true;
		levelsRef.current = false;
		setDaily(true);
		setStatus('ready');
		const apply = (seed: number, diffIndex: number) => {
			diffIdxRef.current = diffIndex;
			const key = DIFF_ORDER[diffIndex] ?? 'moyen';
			setDiffKey(key);
			arm(seed, BREAKOUT_DIFFS[key]);
		};

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			apply(run.seed, run.diffIndex ?? dailyDifficultyIndex());
			const st = (run.state as DailyState | undefined) ?? { best: 0, tries: 0 };
			triesRef.current = st.tries ?? 0;
			setTries(triesRef.current);
			setBest(st.best ?? 0);
			const exhausted = triesRef.current >= MAX_TRIES;
			setAlreadyPlayed(exhausted);
			if (exhausted) { setScore(st.best ?? 0); scoreRef.current = st.best ?? 0; setStatus('over'); }
			else setStatus('ready');
			setDailyLoading(false);
			return;
		}
		setDailyLoading(true);
		setAlreadyPlayed(false);
		triesRef.current = 0;
		setTries(0);
		const { seed, diffIndex } = await getDaily(gameId);
		apply(seed, diffIndex);
		setBest(0);
		setStatus('ready');
		setDailyLoading(false);
	}, [gameId, stop, arm]);

	/* ---- Levels mode ---- */
	const startLevel = useCallback(
		(level: number) => {
			stop();
			const cfg = lv.play(level);
			dailyRef.current = false;
			levelsRef.current = true;
			setDaily(false);
			setAlreadyPlayed(false);
			diffRef.current = cfg.diff;
			livesGrantRef.current = cfg.lives;
			arm(cfg.seed, cfg.diff, cfg.lives);
		},
		[lv, stop, arm],
	);

	const armLevels = useCallback(() => {
		stop();
		dailyRef.current = false;
		setDaily(false);
		lv.enter();
	}, [lv, stop]);

	// Levels is the default landing: resume at the next unlocked level (grid once all
	// cleared). A ?defi deep link opens the daily instead — skip auto-resume then.
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily') return;
		void lv.resume().then((next) => { if (next != null) startLevel(next); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* ---- Input: paddle follows the pointer; keyboard nudges it; space/▶ launches ---- */
	const movePaddle = useCallback((clientX: number) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		paddleTargetRef.current = ((clientX - rect.left) / rect.width) * CFG.worldW;
	}, []);
	const drag = usePointerDrag(movePaddle, movePaddle, () => {});

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'q') {
				e.preventDefault();
				paddleTargetRef.current = Math.max(0, paddleTargetRef.current - 6);
			} else if (e.key === 'ArrowRight' || e.key === 'd') {
				e.preventDefault();
				paddleTargetRef.current = Math.min(CFG.worldW, paddleTargetRef.current + 6);
			} else if ((e.key === ' ' || e.key === 'ArrowUp') && status === 'ready' && !dailyLoading && !(daily && alreadyPlayed)) {
				e.preventDefault();
				start();
			}
		};
		window.addEventListener('keydown', onKey, { passive: false });
		return () => window.removeEventListener('keydown', onKey);
	}, [status, dailyLoading, daily, alreadyPlayed, start]);

	/* Auto-pause when the tab is hidden; resume on return if mid-game. */
	useEffect(() => {
		const onVis = () => {
			if (document.hidden) {
				if (runningRef.current) { runningRef.current = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
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

	const heartRow = '❤️'.repeat(Math.max(0, lives)) || '—';

	return (
		<div className="cb-root">
			<style>{CSS}</style>

			<ModeToggle
				daily={daily}
				onFree={() => { if (lv.active) { lv.exit(); } armFree(diffKey); }}
				onDaily={() => { lv.exit(); startDaily(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

			{lv.active ? (
				<div className="cb-daily-tag">
					{lv.menu ? 'Progression — choisis un niveau' : `Niveau ${lv.level} · ${diffRef.current.label} · vide le mur`}
				</div>
			) : daily ? (
				<div className="cb-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${BREAKOUT_DIFFS[diffKey].label} · Essai ${Math.min(tries, MAX_TRIES)}/${MAX_TRIES}`}
				</div>
			) : (
				<div className="cb-pills" role="tablist" aria-label="Difficulté">
					{DIFF_ORDER.map((k) => (
						<button
							key={k}
							role="tab"
							aria-selected={diffKey === k}
							className={`cb-pill ${diffKey === k ? 'active' : ''}`}
							onClick={() => armFree(k)}
						>
							{BREAKOUT_DIFFS[k].label}
						</button>
					))}
				</div>
			)}

			<div className="cb-bar">
				<span className="cb-score">Score {score}</span>
				<span className="cb-lives" aria-label={`${lives} vies`}>{heartRow}</span>
				<span className="cb-best">{lv.active ? `Niveau ${lv.level}` : `Record ${best}`}</span>
			</div>

			{active.length > 0 && (
				<div className="cb-buffs" aria-live="off">
					{active.map((k) => (
						<span key={k} className="cb-buff" title={BONUS_LABEL[k]}>{BONUS_EMOJI[k]} {BONUS_LABEL[k]}</span>
					))}
				</div>
			)}

			<div className="cb-boardwrap">
				{lv.active && lv.menu ? (
					<LevelSelect progress={lv.progress} onPick={startLevel} />
				) : (
					<>
						<canvas
							ref={canvasRef}
							className="cb-canvas"
							role="img"
							aria-label={`Casse-Briques — score ${score}`}
							onPointerDown={drag.onPointerDown}
						/>

						{status === 'ready' && !dailyLoading && !(daily && alreadyPlayed) && (
							<div className="cb-overlay">
								{lv.active && <p className="cb-go-chip">Niveau {lv.level} · {diffRef.current.label}</p>}
								<button className="cb-startbtn" onClick={start}>▶ {lv.active || daily ? 'Commencer' : 'Jouer'}</button>
							</div>
						)}
						{dailyLoading && (
							<div className="cb-overlay cb-overlay-end"><div className="cb-overlay-card">Préparation…</div></div>
						)}
						{(status === 'over' || status === 'won') && !lv.active && (
							<div className="cb-overlay cb-overlay-end">
								<div className="cb-overlay-card">
									<p className="cb-go-title">
										{status === 'won' ? '🎉 Mur détruit !' : daily && alreadyPlayed ? 'Défi du jour terminé' : 'Perdu !'}
									</p>
									<p className="cb-go-score">{daily ? <>Score {score} · Meilleur {best}</> : <>Score {score} · Record {best}</>}</p>
									{daily && alreadyPlayed ? (
										<p className="cb-overlay-note">Reviens demain&nbsp;!</p>
									) : (
										<button className="cb-startbtn sm" onClick={start}>
											↻ Rejouer{daily ? ` (${MAX_TRIES - tries} restant${MAX_TRIES - tries > 1 ? 's' : ''})` : ''}
										</button>
									)}
								</div>
							</div>
						)}

						{lv.done && (
							<LevelOutcome
								level={lv.level}
								lastLevel={casseBriquesLevels.count}
								won={lv.won}
								stars={lv.stars}
								detail={lv.won ? `Mur détruit · ${lives} vie${lives > 1 ? 's' : ''} restante${lives > 1 ? 's' : ''}` : `Score ${score}`}
								onNext={() => startLevel(lv.level + 1)}
								onReplay={() => startLevel(lv.level)}
								onMenu={lv.backToMenu}
							/>
						)}
					</>
				)}
			</div>

			<p className="cb-help">
				Glisse la raquette pour renvoyer la balle et casser tout le mur. Attrape les bonus qui tombent :
				📏 raquette large, ⚡ multi-balles, 💥 balle puissante, ❤️ vie, 🐢 ralenti. Flèches ou souris au clavier.
			</p>

			{daily && !lv.active && <Leaderboard key={`lb-${gameId}-${attempt}`} game={gameId} metric="score" submitValue={(status === 'over' || status === 'won') ? best : undefined} />}
			{!daily && !lv.active && <LeaderboardCorner game={gameId} metric="score" />}
		</div>
	);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
	const rad = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rad, y);
	ctx.arcTo(x + w, y, x + w, y + h, rad);
	ctx.arcTo(x + w, y + h, x, y + h, rad);
	ctx.arcTo(x, y + h, x, y, rad);
	ctx.arcTo(x, y, x + w, y, rad);
	ctx.closePath();
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.cb-root {
  --cb-accent: var(--accent-regular);
  width: 100%; max-width: 440px; margin-inline: auto;
  color: var(--gray-0); font-family: var(--font-body);
  display: flex; flex-direction: column; align-items: center;
}
.cb-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem; }
.cb-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.85rem; }
.cb-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.cb-pill.active { background: var(--accent-regular); color: var(--accent-text-over); border-color: var(--accent-regular); }
.cb-bar { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 13px; margin-bottom: 0.5rem; }
.cb-score { color: var(--gray-0); }
.cb-lives { letter-spacing: 1px; font-size: 12px; }
.cb-best { color: var(--gray-300); }
.cb-buffs { width: 100%; display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; margin-bottom: 0.5rem; }
.cb-buff { background: var(--accent-overlay); border: 1px solid var(--accent-regular); color: var(--gray-0); border-radius: 999px; padding: 3px 10px; font-size: 11.5px; font-weight: 600; }

.cb-boardwrap { position: relative; width: 100%; }
.cb-canvas {
  width: 100%; display: block;
  background: var(--gray-999); border: 1px solid var(--gray-800); border-radius: 12px;
  touch-action: none; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none;
}

.cb-overlay {
  position: absolute; inset: 0; z-index: 2;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6rem;
}
/* End states dim the whole (frozen) board so the card reads as a clean modal. */
.cb-overlay-end { background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(2px); border-radius: 12px; }
.cb-overlay-card {
  /* Theme-adaptive surface + text so contrast holds in both light and dark modes. */
  background: var(--gray-999); border: 1.5px solid var(--gray-700); border-radius: 16px; padding: 18px 26px;
  display: flex; flex-direction: column; align-items: center; gap: 0.5rem; text-align: center;
  box-shadow: var(--shadow-lg);
}
.cb-go-title { font-family: var(--font-brand); font-weight: 700; font-size: 18px; margin: 0; color: var(--gray-0); }
/* Standalone label over the armed board (ready gate) — dark chip, always readable. */
.cb-go-chip { margin: 0; font-family: var(--font-brand); font-weight: 700; font-size: 14px; color: #fff; background: rgba(10, 12, 16, 0.7); border-radius: 999px; padding: 6px 14px; backdrop-filter: blur(3px); }
.cb-go-score { margin: 0; color: var(--gray-300); font-size: 13.5px; font-weight: 600; }
.cb-overlay-note { margin: 0; color: var(--gray-300); font-size: 13px; }
.cb-startbtn {
  border: none; background: var(--accent-regular); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 17px; border-radius: 999px; padding: 13px 34px; cursor: pointer;
  box-shadow: var(--shadow-lg);
}
.cb-startbtn.sm { font-size: 14px; padding: 10px 22px; }

.cb-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1rem; }
`;
