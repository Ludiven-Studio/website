import { useState, useEffect, useRef, useCallback } from 'react';
import {
	createMine, stepMine, stepLamp, stepFlood, craft, useTool, scoreOf, cellKey,
	Cell, CELL_ORE, MINE_DIFFS, RECIPES, COLS, BOMB_FUSE, BLAST_TTL,
	type Dir, type MineDiff, type MineState, type ItemId, type ToolId, type JewelId, type OreId,
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
	torche: '🔥', bombe: '💣', etai: '🪵', detecteur: '📡', pioche: '⛏️', bague: '💍', collier: '📿', couronne: '👑',
};
const LABEL: Record<ItemId, string> = {
	charbon: 'Charbon', silex: 'Silex', cuivre: 'Cuivre', fer: 'Fer', or: 'Or', cristal: 'Cristal', diamant: 'Diamant',
	torche: 'Torche', bombe: 'Bombe', etai: 'Étai', detecteur: 'Détecteur', pioche: 'Pioche', bague: 'Bague', collier: 'Collier', couronne: 'Couronne',
};
// What each craftable does — shown as a legend in the workbench and as tool tooltips.
const RECIPE_HINT: Record<ToolId | JewelId, string> = {
	torche: 'Recharge la lampe (+25 %)',
	bombe: 'Posée à tes pieds, explose après 3 s — éloigne-toi !',
	pioche: 'Casse la pierre juste devant toi',
	etai: 'Cale la pierre au-dessus de toi — elle ne tombera plus',
	detecteur: 'Révèle les gemmes proches pendant 10 s',
	bague: 'Bijou : bonus de score',
	collier: 'Bijou : gros bonus de score',
	couronne: 'Bijou suprême : énorme bonus de score',
};
const ORE_ORDER: OreId[] = ['charbon', 'silex', 'cuivre', 'fer', 'or', 'cristal', 'diamant'];
const TOOL_ORDER: ToolId[] = ['torche', 'bombe', 'pioche', 'etai', 'detecteur'];
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
/* Lerp two #rrggbb colors — for the atmospheric cave gradient behind the dirt. */
const mixHex = (a: string, b: string, t: number): string => {
	const ch = (s: string, i: number): number => parseInt(s.slice(i, i + 2), 16);
	const r = Math.round(ch(a, 1) + (ch(b, 1) - ch(a, 1)) * t);
	const g = Math.round(ch(a, 3) + (ch(b, 3) - ch(a, 3)) * t);
	const bl = Math.round(ch(a, 5) + (ch(b, 5) - ch(a, 5)) * t);
	return `rgb(${r} ${g} ${bl})`;
};

export default function CocotteMineuseGame({ gameId }: { gameId: string }) {
	const [status, setStatus] = useState<Status>('ready');
	const [score, setScore] = useState(0);
	const [depth, setDepth] = useState(0);
	const [lampPct, setLampPct] = useState(100);
	const [floodGap, setFloodGap] = useState(99); // rows between the hen and the downpour
	const [best, setBest] = useState(0);
	const [inv, setInv] = useState<Record<ItemId, number> | null>(null);
	const [bench, setBench] = useState(false);
	const [deathCause, setDeathCause] = useState<'crush' | 'bomb' | 'flood' | null>(null);
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
	const heldDirsRef = useRef<Dir[]>([]); // currently-pressed directions (last wins → hold repeats)
	const bufferDirRef = useRef<Dir | null>(null); // one-shot move so a quick tap/swipe always lands
	const dailyRef = useRef(false);
	const triesRef = useRef(0);
	const benchRef = useRef(false);
	const hudRef = useRef({ score: -1, depth: -1, lamp: -1, floodGap: -1, invSig: '' });

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

		// cave background — dusk sky at the surface, deepening to a warm indigo dark below
		const dt = Math.min(1, camY / 90);
		const bg = ctx.createLinearGradient(0, 0, 0, h);
		bg.addColorStop(0, mixHex('#3d2d54', '#0c0a14', dt));
		bg.addColorStop(1, mixHex('#241a2a', '#08060f', dt));
		ctx.fillStyle = bg;
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
					const spec = CELL_ORE[c];
					// an ore is embedded in sand until it falls into open space (loose) or is mid-fall
					const embedded = spec ? !(st.loose.has(k) || st.falling.has(k) || st.justFell.has(k)) : true;
					if (c === Cell.Sand || embedded) {
						ctx.fillStyle = sandColor(y);
						ctx.fillRect(sx, sy, cell + 0.5, cell + 0.5);
						ctx.fillStyle = sandDark(y);
						const g1 = cellHash(x, y), g2 = cellHash(x + 311, y);
						ctx.beginPath();
						ctx.arc(sx + cell * (0.2 + g1 * 0.6), sy + cell * (0.2 + g2 * 0.6), cell * 0.07, 0, Math.PI * 2);
						ctx.arc(sx + cell * (0.15 + g2 * 0.7), sy + cell * (0.6 + g1 * 0.3), cell * 0.05, 0, Math.PI * 2);
						ctx.fill();
					}
					if (spec) {
						const exposed =
							st.rows[y]?.[x + 1] === Cell.Empty || st.rows[y]?.[x - 1] === Cell.Empty ||
							st.rows[y + 1]?.[x] === Cell.Empty || st.rows[y - 1]?.[x] === Cell.Empty;
						const near = (x - px) * (x - px) + (y - py) * (y - py) <= DETECT_R2;
						const revealed = !embedded || exposed || (st.detectorMs > 0 && near);
						drawGem(ctx, sx, sy, cell, GEM_COLOR[spec.id], revealed, st.detectorMs > 0 && near);
					}
				} else if (c === Cell.Stone) {
					drawStone(ctx, sx, sy, cell);
					if (st.propped.has(k)) {
						ctx.fillStyle = '#8a5a2b';
						ctx.fillRect(sx + cell * 0.12, sy + cell * 0.86, cell * 0.76, cell * 0.14);
					}
				} else if (c === Cell.Bedrock) {
					drawBedrock(ctx, sx, sy, cell);
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

		// ticking bombs (under the hen)
		for (const b of st.bombs) drawBomb(ctx, b.x * cell, (b.y - camY) * cell, cell, b.fuseMs, now);

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

		// the downpour — a sheet of water above the flood line, with rain streaks + a wavy surface
		const fy = (st.floodY - camY) * cell;
		if (fy > -cell) {
			const top = Math.max(0, Math.min(h, fy));
			if (top > 0) {
				const wg = ctx.createLinearGradient(0, 0, 0, top);
				wg.addColorStop(0, 'rgba(38,86,150,0.5)');
				wg.addColorStop(1, 'rgba(74,146,210,0.34)');
				ctx.fillStyle = wg;
				ctx.fillRect(0, 0, w, top);
				ctx.strokeStyle = 'rgba(205,232,255,0.4)';
				ctx.lineWidth = Math.max(1, cell * 0.03);
				for (let i = 0; i < 24; i++) {
					const rx = (i * 61 + now * 0.35) % w;
					const ry = (i * 83 + now * 0.9) % top;
					ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - cell * 0.12, ry + cell * 0.55); ctx.stroke();
				}
			}
			if (fy > 0 && fy < h) {
				ctx.strokeStyle = 'rgba(175,222,255,0.95)';
				ctx.lineWidth = Math.max(1.5, cell * 0.09);
				ctx.beginPath();
				for (let x = 0; x <= w; x += 4) {
					const yy = fy + Math.sin(x * 0.06 + now * 0.005) * cell * 0.14;
					if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
				}
				ctx.stroke();
			}
		}

		// explosion flashes — brightest, above the vignette
		for (const bl of st.blasts) drawBlast(ctx, (bl.x + 0.5) * cell, (bl.y - camY + 0.5) * cell, cell, bl.r, bl.ttl);
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
		heldDirsRef.current = [];
		bufferDirRef.current = null;
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
		const gap = Math.max(0, Math.round(st.player.y - st.floodY));
		if (gap !== hud.floodGap) { hud.floodGap = gap; setFloodGap(gap); }
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
				// one input per tick: the held direction (hold = repeat), else a buffered tap
				const held = heldDirsRef.current;
				const dir = held.length ? held[held.length - 1] : bufferDirRef.current;
				bufferDirRef.current = null;
				stepMine(st, dir);
				if (st.status === 'over') break;
			}
		}
		stepLamp(st, dt, benchRef.current);
		if (st.status === 'playing') stepFlood(st, dt, benchRef.current);
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
		hudRef.current = { score: -1, depth: -1, lamp: -1, floodGap: -1, invSig: '' };
		heldDirsRef.current = [];
		bufferDirRef.current = null;
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

	/* ---- Input (discrete: one cell per press, hold to repeat) ---- */
	const pressDir = useCallback((dir: Dir) => {
		if (status === 'over' || dailyLoading || benchRef.current) return;
		if (status === 'ready') start();
		const held = heldDirsRef.current;
		if (!held.includes(dir)) held.push(dir); // last-pressed wins; repeats each tick while held
		bufferDirRef.current = dir; // guarantees a fast tap lands even if released before a tick
	}, [status, dailyLoading, start]);

	const releaseDir = useCallback((dir: Dir) => {
		const held = heldDirsRef.current;
		const i = held.indexOf(dir);
		if (i >= 0) held.splice(i, 1);
	}, []);

	const stepOnce = useCallback((dir: Dir) => { // one-shot move (swipe)
		if (status === 'over' || dailyLoading || benchRef.current) return;
		if (status === 'ready') start();
		bufferDirRef.current = dir;
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
		if (benchRef.current) { heldDirsRef.current = []; bufferDirRef.current = null; } // don't resume a stuck key
		setBench(benchRef.current);
	}, [status]);

	useEffect(() => {
		const KEYS: Record<string, Dir> = {
			ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
			w: 'up', s: 'down', a: 'left', d: 'right', z: 'up', q: 'left',
		};
		const TOOLS: Record<string, ToolId> = { '1': 'torche', '2': 'bombe', '3': 'pioche', '4': 'etai', '5': 'detecteur' };
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && benchRef.current) { benchRef.current = false; setBench(false); return; }
			const dir = KEYS[e.key];
			if (dir) { e.preventDefault(); if (!e.repeat) pressDir(dir); return; } // our tick drives the repeat
			const tool = TOOLS[e.key];
			if (tool && !e.repeat) useToolAction(tool);
		};
		const onKeyUp = (e: KeyboardEvent) => {
			const dir = KEYS[e.key];
			if (dir) releaseDir(dir);
		};
		window.addEventListener('keydown', onKey, { passive: false });
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, [pressDir, releaseDir, useToolAction]);

	/* Auto-pause when the tab is hidden; resume on return if mid-game. */
	useEffect(() => {
		const onVis = () => {
			if (document.hidden) {
				if (runningRef.current) {
					runningRef.current = false;
					heldDirsRef.current = [];
					bufferDirRef.current = null;
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
		stepOnce(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
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
				{status === 'playing' && (
					<span className={`cm-chip cm-flood ${floodGap <= 4 ? 'danger' : ''}`} title="Distance avant que l'averse te rattrape">🌧 {floodGap}</span>
				)}
				<span className={`cm-lamp ${lampPct <= 25 ? 'low' : ''}`} role="meter" aria-label={`Lampe ${lampPct}%`}>
					<span className="cm-lampfill" style={{ width: `${lampPct}%` }} />
					<span className="cm-lampicon">🕯</span>
				</span>
				<button
					className={`cm-benchbtn ${status === 'playing' && RECIPES.some((r) => canCraft(r)) ? 'ready' : ''}`}
					disabled={status !== 'playing'}
					onClick={toggleBench}
				>
					🛠 Atelier
				</button>
				{status === 'playing' && (
					<button className="cm-restartbtn" title="Recommencer la partie" onClick={start}>↻</button>
				)}
			</div>

			<div className="cm-stage">
			<div className="cm-side cm-ores" aria-label="Minerais collectés">
				{ORE_ORDER.map((id) => (
					<span key={id} className={`cm-item ${invCount(id) ? '' : 'empty'}`} title={LABEL[id]}>
						{EMOJI[id]}<i>{invCount(id)}</i>
					</span>
				))}
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
						{(['up', 'left', 'right', 'down'] as const).map((dir) => (
							<button
								key={dir}
								className={`cm-dbtn ${dir}`}
								onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); pressDir(dir); }}
								onPointerUp={() => releaseDir(dir)}
								onPointerLeave={() => releaseDir(dir)}
								onPointerCancel={() => releaseDir(dir)}
							>
								{dir === 'up' ? '▲' : dir === 'left' ? '◀' : dir === 'right' ? '▶' : '▼'}
							</button>
						))}
					</div>
				)}

				{status === 'ready' && !dailyLoading && !(daily && alreadyPlayed) && (
					<div className="cm-overlay">
						<div className="cm-overlay-card">
							<p className="cm-go-title">Prêt&nbsp;?</p>
							<p className="cm-overlay-note">
								Creuse toujours plus bas pour fuir l'averse&nbsp;🌧<br />ramasse les minerais et forge la couronne pour le score&nbsp;!
							</p>
							<button className="cm-startbtn" onClick={start}>▶ {daily ? 'Commencer' : 'Jouer'}</button>
						</div>
					</div>
				)}
				{dailyLoading && (
					<div className="cm-overlay"><div className="cm-overlay-card">Préparation…</div></div>
				)}

				{status === 'over' && (
					<div className="cm-overlay">
						<div className="cm-overlay-card">
							<p className="cm-go-title">
								{daily && alreadyPlayed && deathCause == null
									? 'Défi du jour terminé'
									: deathCause === 'crush' ? '💥 Écrasée !'
									: deathCause === 'bomb' ? '💣 Soufflée par la bombe !'
									: '🌊 Rattrapée par l\'averse…'}
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

			<div className="cm-side cm-tools" aria-label="Pouvoirs">
				{TOOL_ORDER.map((id, i) => (
					<button
						key={id}
						className="cm-item cm-tool"
						disabled={status !== 'playing' || !invCount(id)}
						title={`${LABEL[id]} (${i + 1}) — ${RECIPE_HINT[id]}`}
						onClick={() => useToolAction(id)}
					>
						{EMOJI[id]}<i>{invCount(id)}</i>
					</button>
				))}
			</div>

			{bench && st && (
				<div className="cm-overlay cm-bench">
					<div className="cm-overlay-card cm-bench-card">
						<p className="cm-go-title">🛠 Atelier</p>
						<p className="cm-bench-hint">
							Combine 2 minerais — la <b>couronne</b> 👑 rapporte gros&nbsp;! (l'averse continue de descendre)
						</p>
						<div className="cm-recipes">
							{RECIPES.map((r) => (
								<button
									key={r.id}
									className={`cm-recipe ${r.kind}`}
									disabled={!canCraft(r)}
									onClick={() => craftAction(r.id)}
									title={RECIPE_HINT[r.id as ToolId | JewelId]}
								>
									<span className="cm-recipe-out">
										{EMOJI[r.id]} {LABEL[r.id]}
										{r.id === 'couronne' ? <b> 🏆</b> : r.kind === 'jewel' ? <b> +{r.bonus}</b> : <i> ×{invCount(r.id)}</i>}
									</span>
									<span className="cm-recipe-in">
										{EMOJI[r.ingredients[0]]}<i>{invCount(r.ingredients[0])}</i>
										{' '}
										{EMOJI[r.ingredients[1]]}<i>{invCount(r.ingredients[1])}</i>
									</span>
								</button>
							))}
						</div>
						<button className="cm-startbtn sm" onClick={toggleBench}>Reprendre</button>
					</div>
				</div>
			)}
			</div>

			<p className="cm-help">
				Flèches ou ZQSD pour creuser dans les 4 directions (glisse ou pavé tactile sur mobile).
				L'averse 🌧 descend du ciel, dissout le sable et fait tomber les pierres — creuse toujours plus bas pour la fuir&nbsp;!
				Coincée par des pierres&nbsp;? Crafte une pioche pour en casser une devant toi.
				À l'atelier, fabrique outils et bijoux (touches 1-5) — la couronne 👑 rapporte un gros bonus.
			</p>

			{daily && <Leaderboard key={`lb-${gameId}-${attempt}`} game={gameId} metric="score" submitValue={status === 'over' ? best : undefined} />}
			{!daily && <LeaderboardCorner game={gameId} metric="score" />}
		</div>
	);
}

/* ---------- Canvas helpers ---------- */

/** Loose boulder that falls — a LIGHT, smooth grey cube (contrast with dark bedrock). */
/** A placed bomb with a burning fuse — blinks faster the closer it is to detonation. */
function drawBomb(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, fuseMs: number, now: number): void {
	const cx = x + cell / 2, cy = y + cell * 0.6, r = cell * 0.3;
	const urgency = 1 - Math.min(1, fuseMs / BOMB_FUSE);
	const blink = 0.5 + 0.5 * Math.sin(now * (0.008 + urgency * 0.05));
	ctx.globalAlpha = 0.2 + 0.4 * blink * (0.4 + 0.6 * urgency); // danger glow
	ctx.fillStyle = '#ff5a3c';
	ctx.beginPath(); ctx.arc(cx, cy, cell * 0.5, 0, Math.PI * 2); ctx.fill();
	ctx.globalAlpha = 1;
	ctx.fillStyle = '#1b1e25'; // body
	ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
	ctx.fillStyle = 'rgba(255,255,255,0.25)';
	ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.25, 0, Math.PI * 2); ctx.fill();
	ctx.strokeStyle = '#c98a4a'; // fuse
	ctx.lineWidth = Math.max(1, cell * 0.05);
	ctx.beginPath(); ctx.moveTo(cx + r * 0.5, cy - r * 0.7); ctx.quadraticCurveTo(cx + r, cy - r * 1.4, cx + r * 0.35, cy - r * 1.6); ctx.stroke();
	ctx.fillStyle = blink > 0.5 ? '#ffe08a' : '#ff8a3c'; // spark
	ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 1.6, cell * 0.08, 0, Math.PI * 2); ctx.fill();
}

/** Expanding explosion flash centred on the bomb cell. */
function drawBlast(ctx: CanvasRenderingContext2D, cx: number, cy: number, cell: number, r: number, ttl: number): void {
	const p = 1 - Math.max(0, ttl) / BLAST_TTL; // 0 → 1
	const rad = (r + 0.6) * cell * (0.4 + 0.6 * p);
	const a = (1 - p) * 0.85;
	const g = ctx.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
	g.addColorStop(0, `rgba(255,244,190,${a})`);
	g.addColorStop(0.5, `rgba(255,140,50,${a * 0.8})`);
	g.addColorStop(1, 'rgba(255,80,40,0)');
	ctx.fillStyle = g;
	ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
}

/** Rounded boulder that falls and rolls (Boulder Dash) — LIGHT grey, distinct from dark bedrock. */
function drawStone(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number): void {
	const m = cell * 0.06;
	const s = cell - 2 * m;
	const rad = cell * 0.34; // well rounded → reads as "rolls"
	ctx.fillStyle = '#6b7480';
	ctx.beginPath();
	ctx.roundRect(x + m, y + m, s, s, rad);
	ctx.fill();
	// top bevel highlight, bottom shadow → a chunky loose rock
	ctx.fillStyle = '#8b94a1';
	ctx.fillRect(x + m + s * 0.14, y + m + s * 0.12, s * 0.72, s * 0.2);
	ctx.fillStyle = '#4c545e';
	ctx.fillRect(x + m + s * 0.14, y + m + s * 0.74, s * 0.72, s * 0.14);
	ctx.strokeStyle = 'rgba(0,0,0,0.4)';
	ctx.lineWidth = Math.max(1, cell * 0.03);
	ctx.beginPath();
	ctx.roundRect(x + m, y + m, s, s, rad);
	ctx.stroke();
}

/** Indestructible bedrock — a DARK cross-hatched wall block, clearly not a loose stone. */
function drawBedrock(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number): void {
	ctx.fillStyle = '#23272e';
	ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
	// cross-hatch → reads as hard, built, immovable
	ctx.strokeStyle = 'rgba(150,162,178,0.16)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(x, y); ctx.lineTo(x + cell, y + cell);
	ctx.moveTo(x + cell, y); ctx.lineTo(x, y + cell);
	ctx.stroke();
	ctx.strokeStyle = 'rgba(0,0,0,0.5)';
	ctx.strokeRect(x + 0.5, y + 0.5, cell, cell);
}

/**
 * Faceted gemstone (brilliant cut: flat table on top, crown facets, pointed culet below).
 * Buried ores already read as gems — visible and enticing, just smaller + translucent so the
 * sand still shows through. Revealed (exposed / falling / detector) = full size, opaque, with
 * a bright table facet + sparkle. `glow` = detector halo.
 */
function drawGem(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, color: string, revealed: boolean, glow: boolean): void {
	const cx = x + cell / 2, cy = y + cell / 2;
	const r = revealed ? cell * 0.34 : cell * 0.27; // buried gems are now clearly poking through
	if (glow) {
		ctx.fillStyle = color;
		ctx.globalAlpha = 0.35;
		ctx.beginPath();
		ctx.arc(cx, cy, cell * 0.48, 0, Math.PI * 2);
		ctx.fill();
		ctx.globalAlpha = 1;
	}
	ctx.globalAlpha = revealed ? 1 : 0.78;

	// gem outline: table (tblY), girdle (widest), culet (bottom point)
	const tblY = cy - r * 0.55, girdleY = cy - r * 0.1, culetY = cy + r;
	const tblX = r * 0.5, girdleX = r * 0.95;
	ctx.beginPath();
	ctx.moveTo(cx - tblX, tblY);
	ctx.lineTo(cx + tblX, tblY);
	ctx.lineTo(cx + girdleX, girdleY);
	ctx.lineTo(cx, culetY);
	ctx.lineTo(cx - girdleX, girdleY);
	ctx.closePath();
	ctx.fillStyle = color;
	ctx.fill();

	// darker pavilion (lower facets) for depth
	ctx.fillStyle = 'rgba(0,0,0,0.24)';
	ctx.beginPath();
	ctx.moveTo(cx - girdleX, girdleY);
	ctx.lineTo(cx + girdleX, girdleY);
	ctx.lineTo(cx, culetY);
	ctx.closePath();
	ctx.fill();

	// bright table facet (top) — the "shine" that makes it read as a gem, kept even when buried
	ctx.fillStyle = revealed ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.32)';
	ctx.beginPath();
	ctx.moveTo(cx - tblX, tblY);
	ctx.lineTo(cx + tblX, tblY);
	ctx.lineTo(cx + tblX * 0.55, girdleY);
	ctx.lineTo(cx - tblX * 0.55, girdleY);
	ctx.closePath();
	ctx.fill();

	if (revealed) {
		// left crown highlight + a little sparkle
		ctx.fillStyle = 'rgba(255,255,255,0.28)';
		ctx.beginPath();
		ctx.moveTo(cx - tblX, tblY);
		ctx.lineTo(cx - tblX * 0.55, girdleY);
		ctx.lineTo(cx - girdleX, girdleY);
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = 'rgba(255,255,255,0.92)';
		ctx.beginPath();
		ctx.arc(cx - r * 0.24, tblY + r * 0.16, r * 0.11, 0, Math.PI * 2);
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

.cm-bar { width: 100%; max-width: 460px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 700; font-size: 13px; margin-bottom: 0.85rem; }
.cm-chip { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cm-depth { background: var(--cm-accent); color: var(--accent-text-over); }
.cm-flood { background: #2f6fb0; color: #eaf4ff; }
.cm-flood.danger { background: #e05252; animation: cm-blink 0.7s ease-in-out infinite alternate; }
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
  background: #2a1f38; border: 1px solid var(--gray-800); border-radius: 12px;
  touch-action: none; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none;
}
.cm-canvas.blurred { filter: blur(9px); }

.cm-dpad {
  position: absolute; right: 10px; bottom: 10px; z-index: 3;
  display: grid; grid-template-columns: repeat(3, 44px); grid-template-rows: repeat(3, 44px);
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
}
.cm-dbtn {
  border: none; border-radius: 12px; background: rgba(255,255,255,0.16); color: #fff;
  font-size: 17px; cursor: pointer; backdrop-filter: blur(3px); -webkit-tap-highlight-color: transparent; touch-action: none;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
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

.cm-bench-card { width: 340px; max-width: 96%; max-height: 96%; overflow-y: auto; }
.cm-bench-hint { color: var(--gray-300); font-size: 12px; margin: 0 0 10px; }
.cm-recipes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px; }
.cm-recipe {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left;
  border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0);
  font: inherit; font-size: 13px; border-radius: 10px; padding: 6px 9px; cursor: pointer;
}
.cm-recipe:disabled { opacity: 0.45; cursor: default; }
.cm-recipe.jewel { border-color: #b18f2f; }
.cm-recipe b { color: #e8bb3d; }
.cm-recipe i { font-style: normal; color: var(--gray-300); font-size: 11.5px; }
.cm-recipe-out { white-space: nowrap; font-weight: 600; }
.cm-recipe-in { white-space: nowrap; font-size: 12px; color: var(--gray-300); }

.cm-stage {
  position: relative; /* the workbench overlay spans the whole stage, not just the narrow board */
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; max-width: 460px;
}
.cm-stage .cm-boardwrap { flex: 1 1 auto; min-width: 0; }
.cm-side {
  display: flex; flex-direction: column; justify-content: center; gap: 5px;
  flex: 0 0 auto; align-self: stretch;
}
.cm-side .cm-item { justify-content: center; min-width: 42px; padding: 5px 7px; font-size: 15px; }
.cm-side .cm-item i { font-size: 12.5px; }
.cm-item {
  display: inline-flex; align-items: center; gap: 2px;
  background: var(--gray-900); border: 1.5px solid transparent; border-radius: 999px;
  color: var(--gray-0); font-size: 13px; padding: 3px 8px;
}
.cm-item i { font-style: normal; font-size: 11.5px; color: var(--gray-300); font-variant-numeric: tabular-nums; }
.cm-item.empty { opacity: 0.4; }
.cm-tool { cursor: pointer; border-color: var(--gray-700); font: inherit; font-size: 13px; }
.cm-tool:disabled { opacity: 0.35; cursor: default; }
.cm-tool:not(:disabled):hover { border-color: var(--cm-accent); }
.cm-benchbtn {
  border: none; background: var(--cm-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 13.5px; border-radius: 999px; padding: 5px 16px;
  margin-left: 4px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.cm-benchbtn:disabled { opacity: 0.4; cursor: default; box-shadow: none; }
.cm-restartbtn {
  border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0);
  font: inherit; font-size: 15px; line-height: 1; width: 30px; height: 30px; border-radius: 999px;
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
}
.cm-restartbtn:hover { border-color: var(--cm-accent); color: var(--cm-accent); }
.cm-benchbtn.ready { animation: cm-benchpulse 1.3s ease-in-out infinite; }
@keyframes cm-benchpulse {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.07); filter: brightness(1.15); }
}
@media (prefers-reduced-motion: reduce) { .cm-benchbtn.ready { animation: none; } }

.cm-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.1rem; }
`;
