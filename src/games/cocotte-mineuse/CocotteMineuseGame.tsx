import { useState, useEffect, useRef, useCallback } from 'react';
import {
	createMine, setDir, stepMine, stepLamp, craft, useTool, scoreOf, cellKey,
	Cell, CELL_ORE, MINE_DIFFS, RECIPES, COLS,
	type Dir, type MineDiff, type MineState, type ItemId, type ToolId, type OreId,
} from './engine';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, dailyDifficultyIndex, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';

/* =====================================================
   COCOTTE MINEUSE — real-time React island (canvas + rAF loop).
   Libre : graine aléatoire, record local.
   Défi du jour : graine partagée, 10 essais, meilleur score classé.
   Engine is pure/tested; the camera/interpolation live here only.
   ===================================================== */

type Status = 'ready' | 'playing' | 'over';
type DiffKey = keyof typeof MINE_DIFFS;
const BEST_KEY = 'ludiven-cocotte-mineuse-best';
const DIFF_ORDER: DiffKey[] = ['facile', 'moyen', 'difficile'];
const MAX_TRIES = 10; // daily attempts per day; best of the day is ranked
const VISIBLE_ROWS = 17;
const DETECT_R2 = 36; // detector reveal radius² (cells)

interface DailyState {
	best: number;
	tries: number;
}

const EMOJI: Record<ItemId, string> = {
	charbon: '⚫', silex: '🪨', cuivre: '🟠', fer: '⚪', or: '🟡', cristal: '🔮', diamant: '💎',
	torche: '🔥', bombe: '💣', etai: '🪵', detecteur: '📡', bague: '💍', collier: '📿', couronne: '👑',
};
const LABEL: Record<ItemId, string> = {
	charbon: 'Charbon', silex: 'Silex', cuivre: 'Cuivre', fer: 'Fer', or: 'Or', cristal: 'Cristal', diamant: 'Diamant',
	torche: 'Torche', bombe: 'Bombe', etai: 'Étai', detecteur: 'Détecteur', bague: 'Bague', collier: 'Collier', couronne: 'Couronne',
};
const TOOL_HINT: Record<ToolId, string> = {
	torche: '+25 % de lampe',
	bombe: 'pulvérise les pierres autour de toi',
	etai: 'cale la pierre au-dessus de toi',
	detecteur: 'révèle les gemmes proches 10 s',
};
const ORE_ORDER: OreId[] = ['charbon', 'silex', 'cuivre', 'fer', 'or', 'cristal', 'diamant'];
const TOOL_ORDER: ToolId[] = ['torche', 'bombe', 'etai', 'detecteur'];
const GEM_COLOR: Record<OreId, string> = {
	charbon: '#3a3a3a', silex: '#9a9a8c', cuivre: '#d97b4a', fer: '#b9c2cc',
	or: '#f2c53d', cristal: '#b17bf5', diamant: '#7ee8f0',
};

/* Cheap deterministic per-cell hash for sand grain / sparkles. */
const cellHash = (x: number, y: number): number => {
	let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
	h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
	return (h >>> 8) / 16777216;
};

const sandColor = (depth: number): string => {
	const h = 40 - Math.min(22, depth * 0.09);
	const s = 42 - Math.min(14, depth * 0.05);
	const l = 58 - Math.min(28, depth * 0.11);
	return `hsl(${h} ${s}% ${l}%)`;
};
const sandDark = (depth: number): string => {
	const h = 40 - Math.min(22, depth * 0.09);
	const l = 46 - Math.min(26, depth * 0.11);
	return `hsl(${h} 34% ${l}%)`;
};

export default function CocotteMineuseGame({ gameId }: { gameId: string }) {
	const [status, setStatus] = useState<Status>('ready');
	const [score, setScore] = useState(0);
	const [depth, setDepth] = useState(0);
	const [lampPct, setLampPct] = useState(100);
	const [best, setBest] = useState(0);
	const [inv, setInv] = useState<Record<ItemId, number> | null>(null);
	const [bench, setBench] = useState(false);
	const [deathCause, setDeathCause] = useState<'crush' | 'lamp' | null>(null);
	const [diffKey, setDiffKey] = useState<DiffKey>('moyen');
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [attempt, setAttempt] = useState(0); // re-keys the leaderboard so each replay re-submits
	const [tries, setTries] = useState(0);
	const [coarse, setCoarse] = useState(false);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stateRef = useRef<MineState | null>(null);
	const diffRef = useRef<MineDiff>(MINE_DIFFS.moyen);
	const seedRef = useRef(0);
	const diffIdxRef = useRef(0);
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const accRef = useRef(0);
	const runningRef = useRef(false);
	const camYRef = useRef(0);
	const prevPlayerRef = useRef({ x: 6, y: 0 });
	const startRef = useRef(0);
	const cssWRef = useRef(0);
	const touchRef = useRef<{ x: number; y: number } | null>(null);
	const dailyRef = useRef(false);
	const triesRef = useRef(0);
	const benchRef = useRef(false);
	const hudRef = useRef({ score: -1, depth: -1, lamp: -1, invSig: '' });

	/* ---- Drawing ---- */
	const draw = useCallback((now = 0) => {
		const canvas = canvasRef.current;
		const st = stateRef.current;
		if (!canvas || !st) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const w = cssWRef.current;
		const cell = w / COLS;
		const h = cell * VISIBLE_ROWS;
		const camY = camYRef.current;
		const alpha = runningRef.current && !benchRef.current
			? Math.min(1, accRef.current / diffRef.current.tickMs) : 1;

		// cave background
		ctx.fillStyle = '#16110c';
		ctx.fillRect(0, 0, w, h);

		const y0 = Math.max(0, Math.floor(camY) - 1);
		const y1 = Math.min(st.rows.length - 1, Math.ceil(camY + VISIBLE_ROWS) + 1);
		const px = st.player.x, py = st.player.y;

		for (let y = y0; y <= y1; y++) {
			const row = st.rows[y];
			for (let x = 0; x < COLS; x++) {
				const c = row[x];
				if (c === Cell.Empty) continue;
				const k = cellKey(x, y);
				let sx = x * cell;
				let sy = (y - camY) * cell;
				if (st.justFell.has(k)) sy -= (1 - alpha) * cell; // slide the fall
				if (st.wobbles.has(k)) sx += Math.sin(now * 0.045 + x * 7 + y * 13) * cell * 0.07;

				if (c === Cell.Sand || CELL_ORE[c]) {
					// sand body (ores are embedded in sand until they fall)
					const inSand = c === Cell.Sand || !st.falling.has(k) && !st.justFell.has(k);
					if (inSand) {
						ctx.fillStyle = sandColor(y);
						ctx.fillRect(sx, sy, cell + 0.5, cell + 0.5);
						ctx.fillStyle = sandDark(y);
						const g1 = cellHash(x, y), g2 = cellHash(x + 311, y);
						ctx.beginPath();
						ctx.arc(sx + cell * (0.2 + g1 * 0.6), sy + cell * (0.2 + g2 * 0.6), cell * 0.07, 0, Math.PI * 2);
						ctx.arc(sx + cell * (0.15 + g2 * 0.7), sy + cell * (0.6 + g1 * 0.3), cell * 0.05, 0, Math.PI * 2);
						ctx.fill();
					}
					const spec = CELL_ORE[c];
					if (spec) {
						const exposed =
							st.rows[y]?.[x + 1] === Cell.Empty || st.rows[y]?.[x - 1] === Cell.Empty ||
							st.rows[y + 1]?.[x] === Cell.Empty || st.rows[y - 1]?.[x] === Cell.Empty;
						const near = (x - px) * (x - px) + (y - py) * (y - py) <= DETECT_R2;
						const revealed = exposed || !inSand || (st.detectorMs > 0 && near);
						drawGem(ctx, sx, sy, cell, GEM_COLOR[spec.id], revealed, st.detectorMs > 0 && near);
					}
				} else if (c === Cell.Stone) {
					drawStone(ctx, sx, sy, cell);
					if (st.propped.has(k)) {
						ctx.fillStyle = '#8a5a2b';
						ctx.fillRect(sx + cell * 0.12, sy + cell * 0.86, cell * 0.76, cell * 0.14);
					}
				} else if (c === Cell.Bedrock) {
					drawBedrock(ctx, sx, sy, cell, x, y);
				}
			}
			// depth markers on the left wall
			if (y > 0 && y % 10 === 0) {
				ctx.fillStyle = 'rgba(255,255,255,0.45)';
				ctx.font = `600 ${Math.max(8, cell * 0.34)}px system-ui, sans-serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(String(y), cell * 0.5, (y - camY) * cell + cell * 0.5);
			}
		}

		// the hen (interpolated between grid ticks)
		const prev = prevPlayerRef.current;
		const ix = (prev.x + (st.player.x - prev.x) * alpha) * cell + cell / 2;
		const iy = (prev.y + (st.player.y - prev.y) * alpha - camY) * cell + cell / 2;
		drawHen(ctx, ix, iy, cell, st.dir);

		// lamp vignette — tightens as the oil runs out
		const lamp = st.lamp;
		const reach = w * (0.55 + 1.5 * Math.min(1, lamp * 1.6));
		const grad = ctx.createRadialGradient(ix, iy, reach * 0.3, ix, iy, reach);
		grad.addColorStop(0, 'rgba(0,0,0,0)');
		grad.addColorStop(1, `rgba(0,0,0,${0.55 + 0.4 * (1 - Math.min(1, lamp * 2))})`);
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, w, h);
	}, []);

	const resize = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const dpr = window.devicePixelRatio || 1;
		const cssW = canvas.clientWidth;
		cssWRef.current = cssW;
		canvas.width = Math.round(cssW * dpr);
		canvas.height = Math.round((cssW * VISIBLE_ROWS) / COLS * dpr);
		const ctx = canvas.getContext('2d');
		if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
		const st = stateRef.current;
		const sc = st ? scoreOf(st) : 0;
		setDeathCause(st?.deathCause ?? null);
		setBench(false);
		benchRef.current = false;
		setStatus('over');
		setScore(sc);
		setBest((prevBest) => {
			const nb = Math.max(prevBest, sc);
			if (dailyRef.current) {
				if (triesRef.current >= MAX_TRIES) setAlreadyPlayed(true);
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
	}, [gameId, stop]);

	const syncHud = useCallback((st: MineState) => {
		const hud = hudRef.current;
		const sc = scoreOf(st);
		if (sc !== hud.score) { hud.score = sc; setScore(sc); }
		if (st.player.y !== hud.depth) { hud.depth = st.player.y; setDepth(st.player.y); }
		const lp = Math.ceil(st.lamp * 100);
		if (lp !== hud.lamp) { hud.lamp = lp; setLampPct(lp); }
		const sig = Object.values(st.inventory).join(',');
		if (sig !== hud.invSig) { hud.invSig = sig; setInv({ ...st.inventory }); }
	}, []);

	const frame = useCallback((now: number) => {
		if (!runningRef.current) return;
		const dt = Math.min(now - lastRef.current, 200); // clamp after tab-hidden
		lastRef.current = now;
		const st = stateRef.current!;
		if (benchRef.current) {
			accRef.current = 0; // grid frozen at the workbench
		} else {
			accRef.current += dt;
			const tickMs = diffRef.current.tickMs;
			while (runningRef.current && accRef.current >= tickMs) {
				accRef.current -= tickMs;
				prevPlayerRef.current = { ...st.player };
				stepMine(st);
				if (st.status === 'over') break;
			}
		}
		stepLamp(st, dt, benchRef.current);
		// camera eases toward keeping the hen in the upper third
		const target = Math.max(0, prevPlayerRef.current.y + (st.player.y - prevPlayerRef.current.y) - VISIBLE_ROWS * 0.35);
		camYRef.current += (target - camYRef.current) * Math.min(1, dt * 0.006);
		draw(now);
		syncHud(st);
		if (st.status === 'over') { onGameOver(); return; }
		rafRef.current = requestAnimationFrame(frame);
	}, [draw, onGameOver, syncHud]);

	const start = useCallback(() => {
		if (dailyRef.current && triesRef.current >= MAX_TRIES) return;
		const st = createMine(seedRef.current, diffRef.current);
		stateRef.current = st;
		prevPlayerRef.current = { ...st.player };
		camYRef.current = 0;
		accRef.current = 0;
		hudRef.current = { score: -1, depth: -1, lamp: -1, invSig: '' };
		lastRef.current = performance.now();
		startRef.current = Date.now();
		runningRef.current = true;
		setDeathCause(null);
		setBench(false);
		benchRef.current = false;
		setStatus('playing');
		setAttempt((a) => a + 1);
		syncHud(st);
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
	}, [gameId, best, draw, frame, syncHud]);

	/* ---- Modes ---- */
	const armFree = useCallback((key: DiffKey = diffKey) => {
		stop();
		dailyRef.current = false;
		setDaily(false);
		setAlreadyPlayed(false);
		triesRef.current = 0;
		setTries(0);
		setDiffKey(key);
		diffRef.current = MINE_DIFFS[key];
		seedRef.current = (Math.random() * 2 ** 32) >>> 0;
		const st = createMine(seedRef.current, diffRef.current);
		stateRef.current = st;
		prevPlayerRef.current = { ...st.player };
		camYRef.current = 0;
		setBench(false);
		benchRef.current = false;
		setDeathCause(null);
		setStatus('ready');
		syncHud(st);
		try { setBest(Number(localStorage.getItem(BEST_KEY) ?? '0') || 0); } catch { setBest(0); }
		draw();
	}, [stop, draw, diffKey, syncHud]);

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
			diffRef.current = MINE_DIFFS[key];
			const st = createMine(seed, diffRef.current);
			stateRef.current = st;
			prevPlayerRef.current = { ...st.player };
			camYRef.current = 0;
			syncHud(st);
		};

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			applyLevel(run.seed, run.diffIndex ?? dailyDifficultyIndex());
			const st = (run.state as DailyState | undefined) ?? { best: 0, tries: 0 };
			triesRef.current = st.tries ?? 0;
			setTries(triesRef.current);
			setBest(st.best ?? 0);
			const exhausted = triesRef.current >= MAX_TRIES;
			setAlreadyPlayed(exhausted);
			if (exhausted) {
				setScore(st.best ?? 0);
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
	}, [gameId, stop, draw, syncHud]);

	/* ---- Input ---- */
	const turn = useCallback((dir: Dir) => {
		if (status === 'over' || dailyLoading || benchRef.current) return;
		if (status === 'ready') {
			start();
			if (stateRef.current) setDir(stateRef.current, dir);
			return;
		}
		if (stateRef.current) setDir(stateRef.current, dir);
	}, [status, dailyLoading, start]);

	const useToolAction = useCallback((id: ToolId) => {
		const st = stateRef.current;
		if (!st || status !== 'playing') return;
		if (useTool(st, id)) syncHud(st);
	}, [status, syncHud]);

	const craftAction = useCallback((id: ItemId) => {
		const st = stateRef.current;
		if (!st) return;
		if (craft(st, id)) syncHud(st);
	}, [syncHud]);

	const toggleBench = useCallback(() => {
		if (status !== 'playing') return;
		benchRef.current = !benchRef.current;
		setBench(benchRef.current);
	}, [status]);

	useEffect(() => {
		const KEYS: Record<string, Dir> = {
			ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
			w: 'up', s: 'down', a: 'left', d: 'right', z: 'up', q: 'left',
		};
		const TOOLS: Record<string, ToolId> = { '1': 'torche', '2': 'bombe', '3': 'etai', '4': 'detecteur' };
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && benchRef.current) { benchRef.current = false; setBench(false); return; }
			const dir = KEYS[e.key];
			if (dir) { e.preventDefault(); turn(dir); return; }
			const tool = TOOLS[e.key];
			if (tool) useToolAction(tool);
		};
		window.addEventListener('keydown', onKey, { passive: false });
		return () => window.removeEventListener('keydown', onKey);
	}, [turn, useToolAction]);

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
		setCoarse(window.matchMedia('(pointer: coarse)').matches);
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
		const s0 = touchRef.current;
		if (!s0) return;
		const t = e.changedTouches[0];
		const dx = t.clientX - s0.x;
		const dy = t.clientY - s0.y;
		if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return; // tap, not swipe
		turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
		touchRef.current = null;
	};

	const invCount = (id: ItemId): number => inv?.[id] ?? 0;
	const canCraft = (r: (typeof RECIPES)[number]): boolean =>
		invCount(r.ingredients[0]) >= 1 && invCount(r.ingredients[1]) >= 1;
	const st = stateRef.current;

	return (
		<div className="cm-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => armFree(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="cm-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${MINE_DIFFS[diffKey].label} · Essai ${Math.min(tries, MAX_TRIES)}/${MAX_TRIES}`}
				</div>
			) : (
				<div className="cm-pills" role="tablist" aria-label="Difficulté">
					{DIFF_ORDER.map((k) => (
						<button
							key={k}
							role="tab"
							aria-selected={diffKey === k}
							className={`cm-pill ${diffKey === k ? 'active' : ''}`}
							onClick={() => armFree(k)}
						>
							{MINE_DIFFS[k].label}
						</button>
					))}
				</div>
			)}

			<div className="cm-bar">
				<span className="cm-chip cm-depth">⛏ {depth} m</span>
				<span className="cm-chip cm-scorechip">Score {score}</span>
				<span className={`cm-lamp ${lampPct <= 25 ? 'low' : ''}`} role="meter" aria-label={`Lampe ${lampPct}%`}>
					<span className="cm-lampfill" style={{ width: `${lampPct}%` }} />
					<span className="cm-lampicon">🕯</span>
				</span>
			</div>

			<div className="cm-boardwrap">
				<canvas
					ref={canvasRef}
					className={`cm-canvas ${daily && status === 'ready' ? 'blurred' : ''}`}
					role="img"
					aria-label={`Cocotte Mineuse — profondeur ${depth} m`}
					onTouchStart={onTouchStart}
					onTouchEnd={onTouchEnd}
				/>

				{coarse && status === 'playing' && !bench && (
					<div className="cm-dpad" aria-hidden="true">
						<button className="cm-dbtn up" onPointerDown={(e) => { e.preventDefault(); turn('up'); }}>▲</button>
						<button className="cm-dbtn left" onPointerDown={(e) => { e.preventDefault(); turn('left'); }}>◀</button>
						<button className="cm-dbtn right" onPointerDown={(e) => { e.preventDefault(); turn('right'); }}>▶</button>
						<button className="cm-dbtn down" onPointerDown={(e) => { e.preventDefault(); turn('down'); }}>▼</button>
					</div>
				)}

				{status === 'ready' && !dailyLoading && !(daily && alreadyPlayed) && (
					<div className="cm-overlay">
						<div className="cm-overlay-card">
							<p className="cm-go-title">Prêt&nbsp;?</p>
							<p className="cm-overlay-note">
								Creuse, ramasse les minerais, fabrique des outils —<br />et remonte à la lumière avant la panne&nbsp;!
							</p>
							<button className="cm-startbtn" onClick={start}>▶ {daily ? 'Commencer' : 'Jouer'}</button>
						</div>
					</div>
				)}
				{dailyLoading && (
					<div className="cm-overlay"><div className="cm-overlay-card">Préparation…</div></div>
				)}

				{bench && st && (
					<div className="cm-overlay cm-bench">
						<div className="cm-overlay-card cm-bench-card">
							<p className="cm-go-title">🛠 Atelier</p>
							<p className="cm-bench-hint">Le jeu est en pause… mais la lampe brûle toujours un peu&nbsp;!</p>
							<div className="cm-recipes">
								{RECIPES.map((r) => (
									<button
										key={r.id}
										className={`cm-recipe ${r.kind}`}
										disabled={!canCraft(r)}
										onClick={() => craftAction(r.id)}
									>
										<span className="cm-recipe-in">
											{EMOJI[r.ingredients[0]]}<i>{invCount(r.ingredients[0])}</i>
											{' + '}
											{EMOJI[r.ingredients[1]]}<i>{invCount(r.ingredients[1])}</i>
										</span>
										<span className="cm-recipe-arrow">→</span>
										<span className="cm-recipe-out">
											{EMOJI[r.id]} {LABEL[r.id]}
											{r.kind === 'jewel' ? <b> +{r.bonus}</b> : <i> ×{invCount(r.id)}</i>}
										</span>
									</button>
								))}
							</div>
							<button className="cm-startbtn sm" onClick={toggleBench}>Reprendre</button>
						</div>
					</div>
				)}

				{status === 'over' && (
					<div className="cm-overlay">
						<div className="cm-overlay-card">
							<p className="cm-go-title">
								{daily && alreadyPlayed && deathCause == null
									? 'Défi du jour terminé'
									: deathCause === 'crush' ? '💥 Écrasée !' : '🕯 Plus de lumière…'}
							</p>
							{st && deathCause != null && (
								<p className="cm-go-detail">
									Profondeur {st.maxDepth} m · Minerais {st.collected} · Bijoux {st.craftBonus}
								</p>
							)}
							<p className="cm-go-score">Score {score} · {daily ? 'Meilleur' : 'Record'} {best}</p>
							{daily && alreadyPlayed ? (
								<p className="cm-overlay-note">Reviens demain&nbsp;!</p>
							) : (
								<button className="cm-startbtn sm" onClick={start}>
									↻ Rejouer{daily ? ` (${MAX_TRIES - tries} restant${MAX_TRIES - tries > 1 ? 's' : ''})` : ''}
								</button>
							)}
						</div>
					</div>
				)}
			</div>

			<div className="cm-invbar">
				{ORE_ORDER.map((id) => (
					<span key={id} className={`cm-item ${invCount(id) ? '' : 'empty'}`} title={LABEL[id]}>
						{EMOJI[id]}<i>{invCount(id)}</i>
					</span>
				))}
				<span className="cm-invsep" />
				{TOOL_ORDER.map((id, i) => (
					<button
						key={id}
						className="cm-item cm-tool"
						disabled={status !== 'playing' || !invCount(id)}
						title={`${LABEL[id]} (${i + 1}) — ${TOOL_HINT[id]}`}
						onClick={() => useToolAction(id)}
					>
						{EMOJI[id]}<i>{invCount(id)}</i>
					</button>
				))}
				<button className="cm-benchbtn" disabled={status !== 'playing'} onClick={toggleBench}>🛠 Atelier</button>
			</div>

			<p className="cm-help">
				Flèches ou ZQSD pour creuser dans les 4 directions (glisse ou pavé tactile sur mobile).
				Les pierres tremblent quand tu creuses dessous… puis tombent — ne reste pas en dessous&nbsp;!
				Passe à l'atelier pour fabriquer outils et bijoux (touches 1-4 pour les outils).
			</p>

			{daily && <Leaderboard key={`lb-${gameId}-${attempt}`} game={gameId} metric="score" submitValue={status === 'over' ? best : undefined} />}
			{!daily && <LeaderboardCorner game={gameId} metric="score" />}
		</div>
	);
}

/* ---------- Canvas helpers ---------- */

function drawStone(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number): void {
	const m = cell * 0.06;
	ctx.fillStyle = '#43484f';
	ctx.beginPath();
	ctx.roundRect(x + m, y + m, cell - 2 * m, cell - 2 * m, cell * 0.3);
	ctx.fill();
	ctx.fillStyle = '#5d646e';
	ctx.beginPath();
	ctx.roundRect(x + m, y + m, cell - 2 * m, cell - 2.8 * m, cell * 0.3);
	ctx.fill();
	ctx.fillStyle = '#43484f';
	ctx.globalAlpha = 0.7;
	ctx.beginPath();
	ctx.arc(x + cell * 0.4, y + cell * 0.55, cell * 0.07, 0, Math.PI * 2);
	ctx.arc(x + cell * 0.63, y + cell * 0.4, cell * 0.05, 0, Math.PI * 2);
	ctx.fill();
	ctx.globalAlpha = 1;
}

function drawBedrock(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, gx: number, gy: number): void {
	ctx.fillStyle = '#23262c';
	ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
	ctx.strokeStyle = 'rgba(255,255,255,0.06)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	if ((gx + gy) % 2) {
		ctx.moveTo(x, y + cell);
		ctx.lineTo(x + cell, y);
	} else {
		ctx.moveTo(x, y);
		ctx.lineTo(x + cell, y + cell);
	}
	ctx.stroke();
}

/** Ore lozenge: buried = discreet glint; revealed (exposed/falling/detector) = full gem. */
function drawGem(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, color: string, revealed: boolean, glow: boolean): void {
	const cx = x + cell / 2, cy = y + cell / 2;
	const r = revealed ? cell * 0.32 : cell * 0.18;
	if (glow) {
		ctx.fillStyle = color;
		ctx.globalAlpha = 0.35;
		ctx.beginPath();
		ctx.arc(cx, cy, cell * 0.48, 0, Math.PI * 2);
		ctx.fill();
		ctx.globalAlpha = 1;
	}
	ctx.globalAlpha = revealed ? 1 : 0.65;
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(cx, cy - r);
	ctx.lineTo(cx + r, cy);
	ctx.lineTo(cx, cy + r);
	ctx.lineTo(cx - r, cy);
	ctx.closePath();
	ctx.fill();
	if (revealed) {
		ctx.fillStyle = 'rgba(255,255,255,0.55)';
		ctx.beginPath();
		ctx.moveTo(cx, cy - r * 0.7);
		ctx.lineTo(cx + r * 0.35, cy - r * 0.1);
		ctx.lineTo(cx - r * 0.2, cy + r * 0.05);
		ctx.closePath();
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

/** The mining hen: cream body, yellow hard hat, beak oriented by direction. */
function drawHen(ctx: CanvasRenderingContext2D, cx: number, cy: number, cell: number, dir: Dir): void {
	const r = cell * 0.38;
	const fwd = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[dir];
	// body
	ctx.fillStyle = '#241c10';
	ctx.beginPath();
	ctx.arc(cx, cy, r + cell * 0.06, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#f6e7c8';
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fill();
	// wing
	ctx.fillStyle = '#e8d3a8';
	ctx.beginPath();
	ctx.ellipse(cx - fwd.x * r * 0.35, cy + r * 0.25, r * 0.42, r * 0.3, 0, 0, Math.PI * 2);
	ctx.fill();
	// beak (forward)
	const bx = cx + fwd.x * r * 0.95, by = cy + fwd.y * r * 0.95;
	const px = -fwd.y, py = fwd.x;
	ctx.fillStyle = '#f0913a';
	ctx.beginPath();
	ctx.moveTo(bx + fwd.x * r * 0.55, by + fwd.y * r * 0.55);
	ctx.lineTo(bx + px * r * 0.3, by + py * r * 0.3);
	ctx.lineTo(bx - px * r * 0.3, by - py * r * 0.3);
	ctx.closePath();
	ctx.fill();
	// eye (front-side)
	ctx.fillStyle = '#1c1c1c';
	ctx.beginPath();
	ctx.arc(cx + fwd.x * r * 0.35 + px * r * 0.28, cy + fwd.y * r * 0.35 + py * r * 0.28, r * 0.13, 0, Math.PI * 2);
	ctx.fill();
	// hard hat (always on top)
	ctx.fillStyle = '#f2c53d';
	ctx.beginPath();
	ctx.arc(cx, cy - r * 0.45, r * 0.72, Math.PI, 0);
	ctx.fill();
	ctx.fillRect(cx - r * 0.85, cy - r * 0.5, r * 1.7, r * 0.16);
	// headlamp dot
	ctx.fillStyle = '#fff7d6';
	ctx.beginPath();
	ctx.arc(cx, cy - r * 0.75, r * 0.14, 0, Math.PI * 2);
	ctx.fill();
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.cm-root {
  --cm-accent: var(--accent-regular);
  width: 100%; max-width: 460px; margin-inline: auto;
  color: var(--gray-0); font-family: var(--font-body);
  display: flex; flex-direction: column; align-items: center;
}
.cm-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem; }
.cm-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.85rem; }
.cm-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.cm-pill.active { background: var(--accent-regular); color: var(--accent-text-over); border-color: var(--accent-regular); }

.cm-bar { width: 100%; max-width: 420px; display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 700; font-size: 13px; margin-bottom: 0.85rem; }
.cm-chip { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cm-depth { background: var(--cm-accent); color: var(--accent-text-over); }
.cm-lamp {
  position: relative; flex: 1; min-width: 70px; max-width: 150px; height: 22px;
  background: var(--gray-900); border-radius: 999px; overflow: hidden;
}
.cm-lampfill { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, #e8a33d, #f5d76e); border-radius: 999px; transition: width 0.3s linear; }
.cm-lamp.low .cm-lampfill { background: #e05252; animation: cm-blink 0.8s ease-in-out infinite alternate; }
@keyframes cm-blink { from { opacity: 1; } to { opacity: 0.45; } }
.cm-lampicon { position: absolute; left: 7px; top: 50%; transform: translateY(-50%); font-size: 12px; }

.cm-boardwrap { position: relative; width: 100%; max-width: 380px; margin-inline: auto; }
/* Site global fullscreen → the board fits the remaining space (portrait ratio preserved). */
.game-page.gf-full .cm-root { max-width: none; width: 100%; height: 100%; }
.game-page.gf-full .cm-boardwrap { flex: 1; min-height: 0; max-width: none; container-type: size; display: flex; align-items: center; justify-content: center; }
.game-page.gf-full .cm-canvas { width: min(100cqw, calc(100cqh * ${COLS} / ${VISIBLE_ROWS})); height: auto; }
.game-page.gf-full .cm-help { display: none; }
.cm-canvas {
  width: 100%; aspect-ratio: ${COLS} / ${VISIBLE_ROWS}; display: block;
  background: #16110c; border: 1px solid var(--gray-800); border-radius: 12px;
  touch-action: none; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none;
}
.cm-canvas.blurred { filter: blur(9px); }

.cm-dpad {
  position: absolute; right: 10px; bottom: 10px; z-index: 3;
  display: grid; grid-template-columns: repeat(3, 44px); grid-template-rows: repeat(3, 44px);
}
.cm-dbtn {
  border: none; border-radius: 12px; background: rgba(255,255,255,0.16); color: #fff;
  font-size: 17px; cursor: pointer; backdrop-filter: blur(3px); -webkit-tap-highlight-color: transparent; touch-action: none;
}
.cm-dbtn:active { background: rgba(255,255,255,0.35); }
.cm-dbtn.up { grid-area: 1 / 2; }
.cm-dbtn.left { grid-area: 2 / 1; }
.cm-dbtn.right { grid-area: 2 / 3; }
.cm-dbtn.down { grid-area: 3 / 2; }

.cm-overlay {
  position: absolute; inset: 0; z-index: 4;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6rem;
  background: var(--accent-subtle-overlay, rgba(0,0,0,0.25)); backdrop-filter: blur(2px); border-radius: 12px;
}
.cm-overlay-card {
  background: var(--gray-999); border: 2px solid var(--cm-accent); border-radius: 16px;
  padding: 18px 22px; text-align: center; box-shadow: var(--shadow-lg); color: var(--gray-0);
  max-width: 92%;
}
.cm-overlay-note { color: var(--gray-300); font-size: 13px; margin: 0 0 10px; line-height: 1.45; }
.cm-go-title { font-family: var(--font-brand); font-weight: 600; font-size: 20px; margin: 0 0 6px; }
.cm-go-detail { color: var(--gray-200); font-size: 13px; margin: 0 0 4px; font-variant-numeric: tabular-nums; }
.cm-go-score { color: var(--gray-300); font-size: 14px; margin: 0 0 12px; font-variant-numeric: tabular-nums; }
.cm-startbtn {
  border: none; background: var(--cm-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.cm-startbtn.sm { font-size: 15px; padding: 10px 26px; }

.cm-bench-card { width: 320px; }
.cm-bench-hint { color: var(--gray-300); font-size: 12px; margin: 0 0 10px; }
.cm-recipes { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.cm-recipe {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0);
  font: inherit; font-size: 13.5px; border-radius: 10px; padding: 8px 10px; cursor: pointer;
}
.cm-recipe:disabled { opacity: 0.45; cursor: default; }
.cm-recipe.jewel { border-color: #b18f2f; }
.cm-recipe b { color: #e8bb3d; }
.cm-recipe i { font-style: normal; color: var(--gray-300); font-size: 11.5px; }
.cm-recipe-in { white-space: nowrap; }
.cm-recipe-arrow { color: var(--gray-400); }
.cm-recipe-out { white-space: nowrap; font-weight: 600; }

.cm-invbar {
  display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 4px;
  width: 100%; max-width: 420px; margin-top: 0.7rem;
}
.cm-item {
  display: inline-flex; align-items: center; gap: 2px;
  background: var(--gray-900); border: 1.5px solid transparent; border-radius: 999px;
  color: var(--gray-0); font-size: 13px; padding: 3px 8px;
}
.cm-item i { font-style: normal; font-size: 11.5px; color: var(--gray-300); font-variant-numeric: tabular-nums; }
.cm-item.empty { opacity: 0.4; }
.cm-invsep { width: 1px; height: 18px; background: var(--gray-700); margin-inline: 3px; }
.cm-tool { cursor: pointer; border-color: var(--gray-700); font: inherit; font-size: 13px; }
.cm-tool:disabled { opacity: 0.35; cursor: default; }
.cm-tool:not(:disabled):hover { border-color: var(--cm-accent); }
.cm-benchbtn {
  border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0);
  font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 4px 12px; cursor: pointer;
}
.cm-benchbtn:disabled { opacity: 0.4; cursor: default; }

.cm-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.1rem; }
`;
