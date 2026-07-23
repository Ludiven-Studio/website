import { useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from 'react';
import {
	generateBoard, trySwap, smash, findHint, hasAnyMove, shuffle, cagesLeft, canSwap,
	isGem, isCage, type Cell, type GenBoard, type Cfg, type SpecialKind, type Step,
} from './engine';
import { mineLevels } from './levels';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import { useLevels } from '../../lib/useLevels';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   LA MINE AUX COCOTTES — match-3 pour libérer les cocottes en cage.
   Gemmes positionnées en absolu par id → échanges/chutes animés en CSS.
   Moteur pur/testé ; l'UI ne fait que rejouer les cascades.
   ===================================================== */

type Status = 'playing' | 'over';
// Free mode: 3 difficulties by number of cocottes to free (only ~3 shown at once, the
// rest descend from the top). Moves scale with the objective.
const FREE_DIFFS = [
	{ key: 'facile', label: 'Facile', cocottes: 5, moves: 16 },
	{ key: 'moyen', label: 'Moyen', cocottes: 10, moves: 26 },
	{ key: 'costaud', label: 'Costaud', cocottes: 20, moves: 42 },
] as const;
type FreeDiff = typeof FREE_DIFFS[number]['key'];
const DIFF_KEY = 'ludiven-mine-diff';
const freeCfg = (cocottes: number): Cfg => ({ rows: 8, cols: 8, colors: 6, cocottes, cageHits: 1 });
const DAILY_CFG: Cfg = { rows: 8, cols: 8, colors: 6, cocottes: 8, cageHits: 1 };
const DAILY_MOVES = 34;
const HAMMERS = 3;
const BEST_KEY = 'ludiven-mine-best';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// rubis, émeraude, saphir, ambre, améthyste, diamant
const GEM_COLORS: { base: string; light: string; dark: string }[] = [
	{ base: '#e23b5a', light: '#ff8ea0', dark: '#a01f38' }, // 1 rubis
	{ base: '#33ac5e', light: '#7fe6a0', dark: '#1d7a3e' }, // 2 émeraude
	{ base: '#3b7de2', light: '#8ab6ff', dark: '#1f4fa0' }, // 3 saphir
	{ base: '#f0a623', light: '#ffd27a', dark: '#b3720c' }, // 4 ambre
	{ base: '#9b57e0', light: '#c99bff', dark: '#6a2fa8' }, // 5 améthyste
	{ base: '#dfe9f2', light: '#ffffff', dark: '#9fb3c8' }, // 6 diamant
];

/** Rocket / bomb glyphs, drawn over the gem (works on both the SVG and image gems). */
function specialMarkEls(special?: SpecialKind) {
	return (
		<>
			{(special === 'rowClear' || special === 'colClear') && (
				<g stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.95">
					{special === 'rowClear' ? <><line x1="24" y1="50" x2="76" y2="50" /><polyline points="66,42 78,50 66,58" fill="none" /><polyline points="34,42 22,50 34,58" fill="none" /></>
						: <><line x1="50" y1="26" x2="50" y2="74" /><polyline points="42,36 50,24 58,36" fill="none" /><polyline points="42,64 50,76 58,64" fill="none" /></>}
				</g>
			)}
			{special === 'bomb' && <circle cx="50" cy="52" r="15" fill="#1b1b22" stroke="#fff" strokeWidth="3" />}
		</>
	);
}

type Cut = { base: string; light: string; dark: string };
const STROKE = 'rgba(0,0,0,0.24)';

// One distinct cut per gem colour: round, emerald, marquise, pear, hexagon, brilliant.
const GEM_SHAPES: ((c: Cut) => ReactNode)[] = [
	// 1 rubis — round brilliant (octagon)
	(c) => (<>
		<polygon points="32,7 68,7 93,32 93,68 68,93 32,93 7,68 7,32" fill={c.base} stroke={STROKE} strokeWidth="2" />
		<polygon points="40,25 60,25 75,40 75,60 60,75 40,75 25,60 25,40" fill={c.light} opacity="0.9" />
		<g stroke={c.dark} strokeWidth="1.1" opacity="0.45">
			<line x1="40" y1="25" x2="32" y2="7" /><line x1="60" y1="25" x2="68" y2="7" />
			<line x1="75" y1="40" x2="93" y2="32" /><line x1="75" y1="60" x2="93" y2="68" />
			<line x1="60" y1="75" x2="68" y2="93" /><line x1="40" y1="75" x2="32" y2="93" />
			<line x1="25" y1="60" x2="7" y2="68" /><line x1="25" y1="40" x2="7" y2="32" />
		</g>
		<polygon points="25,60 75,60 68,93 32,93" fill={c.dark} opacity="0.25" />
	</>),
	// 2 émeraude — emerald step cut (cut-corner rectangle)
	(c) => (<>
		<polygon points="26,9 74,9 91,26 91,74 74,91 26,91 9,74 9,26" fill={c.base} stroke={STROKE} strokeWidth="2" />
		<polygon points="30,23 70,23 77,30 77,70 70,77 30,77 23,70 23,30" fill={c.light} opacity="0.5" />
		<rect x="35" y="35" width="30" height="30" fill={c.light} opacity="0.9" />
		<rect x="35" y="35" width="30" height="30" fill="none" stroke={c.dark} strokeWidth="1.1" opacity="0.4" />
		<polygon points="9,74 91,74 74,91 26,91" fill={c.dark} opacity="0.28" />
		<polygon points="26,9 74,9 70,17 30,17" fill="#fff" opacity="0.22" />
	</>),
	// 3 saphir — marquise (pointed oval, fuller / less elongated)
	(c) => (<>
		<path d="M14,50 Q50,-6 86,50 Q50,106 14,50 Z" fill={c.base} stroke={STROKE} strokeWidth="2" />
		<path d="M28,50 Q50,20 72,50 Q50,80 28,50 Z" fill={c.light} opacity="0.85" />
		<line x1="14" y1="50" x2="86" y2="50" stroke={c.dark} strokeWidth="1.1" opacity="0.4" />
		<path d="M14,50 Q50,106 86,50 Z" fill={c.dark} opacity="0.2" />
	</>),
	// 4 ambre — pear (teardrop)
	(c) => (<>
		<path d="M50,8 Q83,40 83,60 A33,33 0 1 1 17,60 Q17,40 50,8 Z" fill={c.base} stroke={STROKE} strokeWidth="2" />
		<path d="M50,25 Q67,42 67,59 A17,17 0 1 1 33,59 Q33,42 50,25 Z" fill={c.light} opacity="0.85" />
		<path d="M17,60 A33,33 0 0 0 83,60 Z" fill={c.dark} opacity="0.22" />
	</>),
	// 5 améthyste — hexagon
	(c) => (<>
		<polygon points="50,7 89,29 89,71 50,93 11,71 11,29" fill={c.base} stroke={STROKE} strokeWidth="2" />
		<polygon points="50,24 73,37 73,63 50,76 27,63 27,37" fill={c.light} opacity="0.88" />
		<g stroke={c.dark} strokeWidth="1.1" opacity="0.4">
			<line x1="50" y1="24" x2="50" y2="7" /><line x1="73" y1="37" x2="89" y2="29" /><line x1="73" y1="63" x2="89" y2="71" />
			<line x1="50" y1="76" x2="50" y2="93" /><line x1="27" y1="63" x2="11" y2="71" /><line x1="27" y1="37" x2="11" y2="29" />
		</g>
		<polygon points="27,63 73,63 50,93" fill={c.dark} opacity="0.25" />
	</>),
	// 6 diamant — brilliant (pointed kite)
	(c) => (<>
		<polygon points="50,4 93,37 69,96 31,96 7,37" fill={c.base} stroke={STROKE} strokeWidth="2" />
		<polygon points="50,4 93,37 50,50 7,37" fill={c.light} opacity="0.92" />
		<polygon points="7,37 50,50 31,96" fill={c.dark} opacity="0.5" />
		<polygon points="93,37 50,50 69,96" fill={c.dark} opacity="0.66" />
		<line x1="50" y1="50" x2="50" y2="96" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" />
	</>),
];

/** A twinkling sparkle (4-point star + a small glint) laid over every gem. */
function Glint({ color }: { color: number }) {
	return (
		<g className="mn-glint" fill="#fff" style={{ animationDelay: `${-(color * 0.37).toFixed(2)}s` }}>
			<path d="M37,29 L40,40 L51,43 L40,46 L37,57 L34,46 L23,43 L34,40 Z" />
			<circle cx="61" cy="33" r="2.6" opacity="0.85" />
		</g>
	);
}

function GemSVG({ color, special }: { color: number; special?: SpecialKind }) {
	const c = GEM_COLORS[(color - 1) % GEM_COLORS.length];
	const isRainbow = special === 'rainbow';
	return (
		<svg viewBox="0 0 100 100" className="mn-gemsvg" aria-hidden="true">
			{isRainbow && (
				<defs>
					<linearGradient id="mn-rainbow" x1="0" y1="0" x2="1" y2="1">
						<stop offset="0%" stopColor="#ff5d8f" /><stop offset="33%" stopColor="#ffd166" />
						<stop offset="66%" stopColor="#06d6a0" /><stop offset="100%" stopColor="#8a7bff" />
					</linearGradient>
				</defs>
			)}
			{isRainbow ? (
				<>
					<polygon points="32,7 68,7 93,32 93,68 68,93 32,93 7,68 7,32" fill="url(#mn-rainbow)" stroke={STROKE} strokeWidth="2" />
					<polygon points="40,25 60,25 75,40 75,60 60,75 40,75 25,60 25,40" fill="#fff" opacity="0.85" />
				</>
			) : GEM_SHAPES[(color - 1) % GEM_SHAPES.length](c)}
			<Glint color={color} />
			{specialMarkEls(special)}
		</svg>
	);
}

/** Prefer generated gem art (public/assets/mine/gem-N.png) when present; else the SVG gem.
 *  Rainbow always uses the SVG (its look is colour-agnostic). */
function GemVisual({ color, special, useImg }: { color: number; special?: SpecialKind; useImg: boolean }) {
	if (!useImg || special === 'rainbow') return <GemSVG color={color} special={special} />;
	const n = ((color - 1) % GEM_COLORS.length) + 1;
	return (
		<>
			<img className="mn-gemimg" src={`/assets/mine/gem-${n}.png`} alt="" draggable={false} />
			{special && <svg viewBox="0 0 100 100" className="mn-mark" aria-hidden="true">{specialMarkEls(special)}</svg>}
		</>
	);
}

function CocotteMini() {
	// The hen is drawn small in its viewBox; scale it up around the centre so it fills the frame.
	return (
		<svg viewBox="0 0 100 100" className="mn-cocotte" aria-hidden="true">
			<g transform="translate(50 53) scale(1.24) translate(-50 -53)">
				<g fill="#e0413a"><circle cx="42" cy="26" r="6" /><circle cx="52" cy="21" r="7" /><circle cx="62" cy="26" r="6" /></g>
				<ellipse cx="50" cy="60" rx="30" ry="28" fill="#fdfdfb" stroke="#e6e6df" strokeWidth="1.4" />
				<circle cx="41" cy="52" r="4" fill="#2a2a2a" /><circle cx="59" cy="52" r="4" fill="#2a2a2a" />
				<polygon points="50,56 44,62 56,62" fill="#f5a623" />
			</g>
		</svg>
	);
}

export default function MineGame({ gameId }: { gameId: string }) {
	const [displayGrid, setDisplayGrid] = useState<Cell[][]>([]);
	const [cfg, setCfg] = useState<Cfg>(freeCfg(FREE_DIFFS[0].cocottes));
	const [status, setStatus] = useState<Status>('playing');
	const [won, setWon] = useState(false);
	const [score, setScore] = useState(0);
	const [freeDiff, setFreeDiff] = useState<FreeDiff>(FREE_DIFFS[0].key);
	const [movesLeft, setMovesLeft] = useState<number>(FREE_DIFFS[0].moves);
	const [cocottesLeft, setCocottesLeft] = useState(0); // still caged (for lose/detail texts + win check)
	const [cocottesFreed, setCocottesFreed] = useState(0); // shown counter: fills up as cocottes land in it
	const [cocottesTotal, setCocottesTotal] = useState(0);
	const [selected, setSelected] = useState<[number, number] | null>(null);
	const [drag, setDrag] = useState<{ from: [number, number]; to: [number, number] | null; dx: number; dy: number } | null>(null);
	const [clearing, setClearing] = useState<Set<number>>(new Set());
	const [combo, setCombo] = useState(0);
	const [hint, setHint] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
	const [hammers, setHammers] = useState(HAMMERS);
	const [hammerArmed, setHammerArmed] = useState(false);
	const [best, setBest] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [shake, setShake] = useState(false);
	const [flyers, setFlyers] = useState<{ id: number; r: number; c: number; dx: number; dy: number }[]>([]);
	const [eggs, setEggs] = useState<{ id: number; r: number; c: number }[]>([]);
	const [counterHit, setCounterHit] = useState(0);
	const [gemImg, setGemImg] = useState(false); // true once generated gem art is available

	const boardRef = useRef<GenBoard | null>(null);
	const statusRef = useRef<Status>('playing');
	const animatingRef = useRef(false);
	const movesRef = useRef<number>(FREE_DIFFS[0].moves);
	const freeDiffRef = useRef<FreeDiff>(FREE_DIFFS[0].key);
	const scoreRef = useRef(0);
	const dailyRef = useRef(false);
	const idleRef = useRef<number>(0);
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const cocotteRef = useRef<HTMLSpanElement | null>(null);
	const dragRef = useRef<{ from: [number, number]; x: number; y: number; dx: number; dy: number; to: [number, number] | null; moved: boolean } | null>(null);
	const draggedRef = useRef(false); // last pointer sequence was a drag → suppress the click-select
	const doSwapRef = useRef<(a: [number, number], b: [number, number]) => void>(() => {});
	const hammerArmedRef = useRef(false);
	const flyIdRef = useRef(0);
	const lv = useLevels(gameId, mineLevels);
	const { celebrating, showWin } = useCelebration(status === 'over' && won);

	const setStat = (s: Status) => { statusRef.current = s; setStatus(s); };

	/* ---------- board setup ---------- */
	const armBoard = useCallback((b: GenBoard, moves: number) => {
		boardRef.current = b;
		setCfg(b.cfg);
		setDisplayGrid(b.grid.map((row) => row.slice()));
		movesRef.current = moves; setMovesLeft(moves);
		scoreRef.current = 0; setScore(0);
		setCocottesLeft(cagesLeft(b)); setCocottesTotal(b.cfg.cocottes);
		setCocottesFreed(b.cfg.cocottes - cagesLeft(b)); // starts at 0 (all caged)
		setSelected(null); setHint(null); setClearing(new Set()); setCombo(0);
		setHammers(HAMMERS); setHammerArmed(false); setWon(false);
		setFlyers([]); setEggs([]);
		setStat('playing');
		animatingRef.current = false;
		idleRef.current = Date.now();
	}, []);

	/* ---------- freed-cocotte flight → counter + explosive egg ---------- */
	const spawnFreed = useCallback((positions: [number, number][]) => {
		const board = wrapRef.current;
		if (!board) return;
		const br = board.getBoundingClientRect();
		const tr = cocotteRef.current?.getBoundingClientRect();
		const cols = boardRef.current!.cfg.cols, rows = boardRef.current!.cfg.rows;
		const tx = tr ? tr.left + tr.width / 2 : br.left + br.width * 0.12;
		const ty = tr ? tr.top + tr.height / 2 : br.top - 24;
		const flyAdd = positions.map(([r, c]) => {
			const cx = br.left + ((c + 0.5) / cols) * br.width;
			const cy = br.top + ((r + 0.5) / rows) * br.height;
			return { id: ++flyIdRef.current, r, c, dx: Math.round(tx - cx), dy: Math.round(ty - cy) };
		});
		const eggAdd = positions.map(([r, c]) => ({ id: ++flyIdRef.current, r, c }));
		setFlyers((f) => [...f, ...flyAdd]);
		setEggs((e) => [...e, ...eggAdd]);
		const flyIds = new Set(flyAdd.map((a) => a.id));
		const eggIds = new Set(eggAdd.map((a) => a.id));
		// as each cocotte lands in the counter, tick it up + bump it
		window.setTimeout(() => { setCounterHit((n) => n + 1); setCocottesFreed((f) => f + positions.length); }, 620);
		window.setTimeout(() => setFlyers((f) => f.filter((x) => !flyIds.has(x.id))), 950);
		window.setTimeout(() => setEggs((e) => e.filter((x) => !eggIds.has(x.id))), 800);
	}, []);

	const newFree = useCallback((diff: FreeDiff = freeDiffRef.current) => {
		const d = FREE_DIFFS.find((x) => x.key === diff) ?? FREE_DIFFS[0];
		freeDiffRef.current = d.key; setFreeDiff(d.key);
		setDaily(false); dailyRef.current = false; setAlreadyPlayed(false);
		armBoard(generateBoard((Math.random() * 2 ** 31) >>> 0, freeCfg(d.cocottes)), d.moves);
		try { setBest(Number(localStorage.getItem(BEST_KEY) ?? '0') || 0); } catch { setBest(0); }
	}, [armBoard]);

	const pickDiff = useCallback((diff: FreeDiff) => {
		try { localStorage.setItem(DIFF_KEY, diff); } catch { /* ignore */ }
		newFree(diff);
	}, [newFree]);

	const startLevel = useCallback((level: number) => {
		const s = lv.play(level); // switch the levels phase to "playing" (leaves the menu) + get the config
		setDaily(false); dailyRef.current = false;
		armBoard(generateBoard(s.seed, s.cfg), s.moves);
	}, [armBoard, lv]);

	const armLevels = useCallback(() => { setDaily(false); dailyRef.current = false; lv.enter(); }, [lv]);

	// Levels is the default landing: resume at the next unlocked level (grid once all cleared).
	// A ?defi deep link opens the daily instead — skip auto-resume then.
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily') return;
		void lv.resume().then((next) => { if (next != null) startLevel(next); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const startDaily = useCallback(async () => {
		setDaily(true); dailyRef.current = true;
		lv.exit();
		const run = loadDailyRun(gameId);
		if (run?.done) { setAlreadyPlayed(true); setDailyLoading(false); armBoard(generateBoard(run.seed ?? 1, DAILY_CFG), 0); setStat('over'); setScore((run.state as { score?: number })?.score ?? 0); return; }
		setAlreadyPlayed(false); setDailyLoading(true);
		const { seed } = await getDaily(gameId);
		armBoard(generateBoard(seed, DAILY_CFG), DAILY_MOVES);
		boardRef.current!.rngRef = () => mulberry32(seed >>> 0); // deterministic-ish daily cascades
		(boardRef.current as GenBoard & { seed?: number }).seed = seed;
		setDailyLoading(false);
	}, [gameId, armBoard, lv]);

	// Init once — restore the last-played free difficulty.
	useEffect(() => {
		let d: FreeDiff = FREE_DIFFS[0].key;
		try { const s = localStorage.getItem(DIFF_KEY); if (s && FREE_DIFFS.some((x) => x.key === s)) d = s as FreeDiff; } catch { /* ignore */ }
		newFree(d);
		/* eslint-disable-next-line react-hooks/exhaustive-deps */
	}, []);

	// Use generated gem art if present (drop PNGs in public/assets/mine/ — no code change needed).
	useEffect(() => { const img = new Image(); img.onload = () => setGemImg(true); img.src = '/assets/mine/gem-1.png'; }, []);

	/* ---------- end of game ---------- */
	const endGame = useCallback((didWin: boolean) => {
		setStat('over'); setWon(didWin);
		const mode = lv.active ? 'levels' : dailyRef.current ? 'daily' : 'free';
		const ctx = lv.active ? { level: lv.level } : dailyRef.current ? {} : { diff: freeDiffRef.current };
		trackGame(gameId, didWin ? 'game_won' : 'game_over', { mode, ...ctx, score: scoreRef.current });
		if (lv.active) {
			lv.finish({ won: didWin, score: scoreRef.current, stat: movesRef.current });
		} else if (dailyRef.current) {
			const seed = (boardRef.current as (GenBoard & { seed?: number }) | null)?.seed ?? 1;
			saveDailyRun(gameId, { startedAt: Date.now(), done: true, seed, state: { score: scoreRef.current } });
			setAlreadyPlayed(true);
		} else if (didWin || scoreRef.current > 0) {
			setBest((prev) => { const nb = Math.max(prev, scoreRef.current); try { localStorage.setItem(BEST_KEY, String(nb)); } catch { /* ignore */ } return nb; });
		}
	}, [gameId, lv]);

	/* ---------- the core: play a swap's cascade ---------- */
	const idAt = (grid: Cell[][], r: number, c: number): number | null => { const g = grid[r][c]; return isGem(g) ? g.id : null; };

	const runResult = useCallback(async (steps: Step[], gained: number, freed: number) => {
		animatingRef.current = true;
		setSelected(null); setHint(null);
		for (const step of steps) {
			const grid = boardRef.current!.grid;
			const ids = new Set<number>();
			for (const [r, c] of step.cleared) { const id = idAt(grid, r, c); if (id != null) ids.add(id); }
			setClearing(ids);
			if (step.combo > 1) setCombo(step.combo);
			// let the burst/flash play before collapsing the column
			await sleep(step.cleared.length ? 380 : 60);
			// a cocotte just broke free → it flies to the counter and drops an egg (still on the old grid so it pops from the cage)
			if (step.freedPos.length) spawnFreed(step.freedPos);
			boardRef.current = { ...boardRef.current!, grid: step.grid };
			setDisplayGrid(step.grid.map((row) => row.slice()));
			setClearing(new Set());
			// hold longer on combos, and longer still on a freed beat so the flight + egg read before the column blast
			await sleep(step.freedPos.length ? 760 : step.combo > 1 ? 560 : 320);
		}
		scoreRef.current += gained; setScore(scoreRef.current);
		setCocottesLeft(cagesLeft(boardRef.current!));
		setCombo(0);
		// win / lose / shuffle — all cocottes freed (none left on the board OR in the buffers)
		if (cagesLeft(boardRef.current!) === 0) endGame(true);
		else if (movesRef.current <= 0) endGame(false);
		else if (!hasAnyMove(boardRef.current!)) {
			shuffle(boardRef.current!);
			setDisplayGrid(boardRef.current!.grid.map((row) => row.slice()));
		}
		void freed;
		animatingRef.current = false;
		idleRef.current = Date.now();
	}, [endGame]);

	const doSwap = useCallback(async (a: [number, number], b: [number, number]) => {
		if (animatingRef.current || statusRef.current !== 'playing' || !boardRef.current) return;
		const res = trySwap(boardRef.current, a, b);
		if (!res.valid) { setShake(true); setTimeout(() => setShake(false), 300); setSelected(null); return; }
		movesRef.current -= 1; setMovesLeft(movesRef.current);
		// visually swap first (same gem objects → CSS slides them)
		const swapped = boardRef.current.grid.map((row) => row.slice());
		[swapped[a[0]][a[1]], swapped[b[0]][b[1]]] = [swapped[b[0]][b[1]], swapped[a[0]][a[1]]];
		boardRef.current = { ...boardRef.current, grid: swapped };
		setDisplayGrid(swapped.map((row) => row.slice()));
		await sleep(260); // let the swap glide finish before the first match pops
		await runResult(res.steps, res.gained, res.freed);
	}, [runResult]);

	// keep the drag controller (a run-once effect) reading the latest handlers/state
	doSwapRef.current = doSwap;
	hammerArmedRef.current = hammerArmed;

	const onCell = useCallback((r: number, c: number) => {
		if (draggedRef.current) { draggedRef.current = false; return; } // this pointer sequence was a drag, not a tap
		if (animatingRef.current || statusRef.current !== 'playing') return;
		idleRef.current = Date.now(); setHint(null);
		const cell = boardRef.current!.grid[r][c];
		if (hammerArmed) {
			if (!isGem(cell)) return;
			setHammerArmed(false); setHammers((h) => h - 1);
			const res = smash(boardRef.current!, [r, c]);
			if (res.valid) void runResult(res.steps, res.gained, res.freed);
			return;
		}
		if (!isGem(cell)) { setSelected(null); return; } // cages aren't selectable
		if (!selected) { setSelected([r, c]); return; }
		if (selected[0] === r && selected[1] === c) { setSelected(null); return; }
		const adj = (Math.abs(selected[0] - r) + Math.abs(selected[1] - c)) === 1;
		if (adj) { const a = selected; setSelected(null); void doSwap(a, [r, c]); }
		else setSelected([r, c]);
	}, [hammerArmed, selected, doSwap, runResult]);

	/* ---------- drag-to-swap: the gem follows the pointer, then snaps to the target
	   (valid swap) or back (invalid). Pointer events + `touch-action:none` on the board
	   cover mouse and touch alike; runs once and reads live state via refs. ---------- */
	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		let raf = 0;
		const geo = () => {
			const rect = el.getBoundingClientRect();
			const cfg2 = boardRef.current?.cfg;
			const cols = cfg2?.cols ?? 8, rows = cfg2?.rows ?? 8;
			return { rect, w: rect.width / cols, h: rect.height / rows, cols, rows };
		};
		const cellAt = (x: number, y: number, g: ReturnType<typeof geo>): [number, number] | null => {
			const c = Math.floor((x - g.rect.left) / g.w);
			const r = Math.floor((y - g.rect.top) / g.h);
			return r >= 0 && r < g.rows && c >= 0 && c < g.cols ? [r, c] : null;
		};
		const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
		const isGemAt = (r: number, c: number) => !!boardRef.current && isGem(boardRef.current.grid[r]?.[c]);

		const onDown = (e: PointerEvent) => {
			if (animatingRef.current || statusRef.current !== 'playing' || hammerArmedRef.current) return;
			const g = geo();
			const from = cellAt(e.clientX, e.clientY, g);
			if (!from || !isGemAt(from[0], from[1])) return;
			dragRef.current = { from, x: e.clientX, y: e.clientY, dx: 0, dy: 0, to: null, moved: false };
			setHint(null); idleRef.current = Date.now();
		};
		const onMove = (e: PointerEvent) => {
			const d = dragRef.current;
			if (!d) return;
			const g = geo();
			let dx = e.clientX - d.x, dy = e.clientY - d.y;
			if (Math.abs(dx) >= Math.abs(dy)) { dy = 0; dx = clamp(dx, g.w); } else { dx = 0; dy = clamp(dy, g.h); }
			let to: [number, number] | null = null;
			if (dx > 0) to = [d.from[0], d.from[1] + 1];
			else if (dx < 0) to = [d.from[0], d.from[1] - 1];
			else if (dy > 0) to = [d.from[0] + 1, d.from[1]];
			else if (dy < 0) to = [d.from[0] - 1, d.from[1]];
			if (to && !isGemAt(to[0], to[1])) { to = null; dx = clamp(dx, g.w * 0.32); dy = clamp(dy, g.h * 0.32); } // resist into a wall/cage
			if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
			d.dx = dx; d.dy = dy; d.to = to;
			if (!raf) raf = requestAnimationFrame(() => { raf = 0; const c = dragRef.current; if (c) setDrag({ from: c.from, to: c.to, dx: c.dx, dy: c.dy }); });
		};
		const onUp = () => {
			const d = dragRef.current;
			if (!d) return;
			dragRef.current = null;
			if (raf) { cancelAnimationFrame(raf); raf = 0; }
			const g = geo();
			const past = Math.abs(d.dx) > g.w * 0.4 || Math.abs(d.dy) > g.h * 0.4;
			if (d.moved) draggedRef.current = true; // suppress the click-select that follows
			setDrag(null); // transforms animate back to 0
			if (d.to && past && boardRef.current && canSwap(boardRef.current, d.from, d.to)) void doSwapRef.current(d.from, d.to);
		};
		el.addEventListener('pointerdown', onDown);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
		return () => {
			el.removeEventListener('pointerdown', onDown);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
			if (raf) cancelAnimationFrame(raf);
		};
		// re-bind when the board (un)mounts — it's replaced by LevelSelect on the progression map
	}, [lv.active, lv.menu]);

	/* ---------- idle hint ---------- */
	useEffect(() => {
		if (status !== 'playing' || lv.menu) return;
		const id = setInterval(() => {
			if (animatingRef.current || Date.now() - idleRef.current < 6000) return;
			if (boardRef.current) setHint(findHint(boardRef.current));
		}, 1000);
		return () => clearInterval(id);
	}, [status, lv.menu]);

	const showHint = () => { if (boardRef.current) setHint(findHint(boardRef.current)); idleRef.current = Date.now(); };

	/* ---------- render ---------- */
	const fmtScore = (n: number) => n.toLocaleString('fr-FR');
	const inLevelsPlay = lv.active && !lv.menu;
	const hintSet = hint ? new Set([`${hint.a[0]},${hint.a[1]}`, `${hint.b[0]},${hint.b[1]}`]) : null;

	return (
		<div className="mn-root">
			<style>{CSS}</style>

			<ModeToggle
				daily={daily}
				onFree={() => { lv.exit(); newFree(); }}
				onDaily={() => startDaily()}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

			{lv.active ? (
				<div className="mn-tag">{lv.menu ? 'Progression — libère les cocottes pour débloquer le niveau suivant' : `Niveau ${lv.level}`}</div>
			) : daily ? (
				<div className="mn-tag">{dailyLoading ? 'Préparation…' : `Défi du jour · ${dailyWeekdayLabel()}`}</div>
			) : (
				<div className="mn-tag">Mine libre — {cocottesTotal} cocottes à libérer</div>
			)}

			{!daily && !lv.active && (
				<div className="mn-diff" role="tablist" aria-label="Difficulté">
					{FREE_DIFFS.map((d) => (
						<button
							key={d.key}
							role="tab"
							aria-selected={freeDiff === d.key}
							className={`mn-diff-seg ${freeDiff === d.key ? 'on' : ''}`}
							onClick={() => pickDiff(d.key)}
						>
							{d.label} · {d.cocottes}🐔
						</button>
					))}
				</div>
			)}

			{!(lv.active && lv.menu) && (
				<div className="mn-hud">
					<span ref={cocotteRef} key={counterHit} className="mn-stat mn-cstat">🐔 <strong>{cocottesFreed}</strong>/{cocottesTotal}</span>
					<span className="mn-stat">👣 <strong>{movesLeft}</strong></span>
					<span className="mn-stat">💎 <strong>{fmtScore(score)}</strong></span>
					{!daily && !lv.active && <span className="mn-stat">🏆 {fmtScore(best)}</span>}
				</div>
			)}

			{lv.active && lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
			<div className="mn-boardwrap">
				<div
					ref={wrapRef}
					className={`mn-board ${shake ? 'shake' : ''}`}
					style={{ ['--cols' as string]: cfg.cols, ['--rows' as string]: cfg.rows }}
				>
					{celebrating && <Celebration />}
					{/* gems + cages layer (animated, non-interactive) */}
					{displayGrid.map((row, r) =>
						row.map((cell, c) => {
							if (isGem(cell)) {
								const cl = clearing.has(cell.id) ? ' clr' : '';
								const isFrom = drag && drag.from[0] === r && drag.from[1] === c;
								const isTo = drag && drag.to && drag.to[0] === r && drag.to[1] === c;
								const sel = (selected && selected[0] === r && selected[1] === c) || isFrom ? ' sel' : '';
								const hi = hintSet?.has(`${r},${c}`) ? ' hint' : '';
								const style = cellStyle(r, c, cfg);
								if (isFrom) { style.transform = `translate(${drag!.dx}px, ${drag!.dy}px)`; style.zIndex = 20; }
								else if (isTo) style.transform = `translate(${-drag!.dx}px, ${-drag!.dy}px)`;
								return (
									<div key={cell.id} className={`mn-gem${cl}${sel}${hi}${isFrom || isTo ? ' drag' : ''}`} style={style}>
										<GemVisual color={cell.color} special={cell.special} useImg={gemImg} />
									</div>
								);
							}
							if (isCage(cell)) {
								return (
									<div key={`cage-${r}-${c}`} className={`mn-cage h${cell.hits}`} style={cellStyle(r, c, cfg)}>
										<CocotteMini />
										<span className="mn-bars" aria-hidden="true" />
									</div>
								);
							}
							return null;
						}),
					)}
					{/* hit layer (static, interactive) */}
					{status === 'playing' && !dailyLoading && Array.from({ length: cfg.rows }).map((_, r) =>
						Array.from({ length: cfg.cols }).map((_, c) => (
							<button key={`hit-${r}-${c}`} className="mn-hit" style={cellStyle(r, c, cfg)} onClick={() => onCell(r, c)} aria-label={`Case ${r + 1},${c + 1}`} />
						)),
					)}
					{/* explosive eggs left where a cocotte broke free (blast the column next beat) */}
					{eggs.map((eg) => (
						<div key={eg.id} className="mn-egg" style={cellStyle(eg.r, eg.c, cfg)} aria-hidden="true"><span>🥚</span></div>
					))}
					{combo > 1 && <div key={combo} className="mn-halo" aria-hidden="true" />}
					{combo > 1 && <div className="mn-combo">Combo ×{combo} !</div>}

					{dailyLoading && <div className="mn-overlay"><div className="mn-card">Préparation du défi…</div></div>}

					{lv.done && (
						<LevelOutcome
							level={lv.level}
							lastLevel={mineLevels.count}
							won={lv.won}
							stars={lv.stars}
							detail={lv.won ? `Cocottes libérées · ${movesLeft} coups restants` : `${cocottesLeft} cocotte(s) encore en cage`}
							onNext={() => startLevel(lv.level + 1)}
							onReplay={() => startLevel(lv.level)}
							onMenu={lv.backToMenu}
						/>
					)}

					{!lv.active && status === 'over' && (
						<div className="mn-overlay">
							<div className="mn-card">
								{showWin || won ? (
									<>
										<CocotteMini />
										<h3>Cocottes libérées !</h3>
										<p className="mn-score">{fmtScore(score)} pts{daily ? '' : ` · ${movesLeft} coups restants`}</p>
									</>
								) : (
									<>
										<h3>💔 Plus de coups</h3>
										<p className="mn-score">{cocottesLeft} cocotte(s) encore en cage · {fmtScore(score)} pts</p>
									</>
								)}
								{daily && alreadyPlayed ? (
									<p className="mn-note">Défi du jour terminé — reviens demain&nbsp;!</p>
								) : daily ? (
									<p className="mn-note">Score classé — reviens demain&nbsp;!</p>
								) : (
									<button className="mn-btn primary" onClick={() => newFree()}>↻ Nouvelle mine</button>
								)}
							</div>
						</div>
					)}
				</div>
				{/* freed cocottes flying out to the counter (outside the board so they aren't clipped) */}
				{flyers.map((fl) => (
					<div key={fl.id} className="mn-flyer" style={{ ...cellStyle(fl.r, fl.c, cfg), ['--dx' as string]: `${fl.dx}px`, ['--dy' as string]: `${fl.dy}px` }} aria-hidden="true">
						<CocotteMini />
					</div>
				))}
			</div>
			)}

			{inLevelsPlay || (status === 'playing' && !dailyLoading && !(lv.active && lv.menu)) ? (
				<div className="mn-actions">
					<button className="mn-act" onClick={showHint} disabled={animatingRef.current}>💡 Indice</button>
					<button className={`mn-act ${hammerArmed ? 'on' : ''}`} onClick={() => setHammerArmed((v) => !v)} disabled={hammers <= 0}>🔨 Marteau ({hammers})</button>
					{lv.active ? (
						<button className="mn-act" onClick={lv.backToMenu}>🗺 Carte</button>
					) : !daily ? (
						<button className="mn-act" onClick={() => newFree()}>↻ Nouvelle</button>
					) : null}
				</div>
			) : null}

			{daily && <Leaderboard game={gameId} metric="score" submitValue={status === 'over' ? score : undefined} />}
			{!daily && !lv.active && <LeaderboardCorner game={gameId} metric="score" />}

			<p className="mn-help">
				Aligne <strong>3 cristaux</strong> ou plus (tape deux gemmes voisines, ou glisse). Un alignement <strong>à côté d'une cage</strong> la fissure&nbsp;: libère toutes les cocottes avant la fin des coups&nbsp;! Vise les <strong>4</strong> (fusée), <strong>5</strong> (arc-en-ciel) et les <strong>L/T</strong> (bombe) pour de gros enchaînements.
			</p>
		</div>
	);
}

function cellStyle(r: number, c: number, cfg: Cfg): CSSProperties {
	return {
		left: `${(c * 100) / cfg.cols}%`,
		top: `${(r * 100) / cfg.rows}%`,
		width: `${100 / cfg.cols}%`,
		height: `${100 / cfg.rows}%`,
	};
}

const CSS = `
.mn-root { --mn-accent: var(--accent-regular); width: 100%; max-width: 480px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.mn-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.7rem; }
.mn-diff { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; margin-bottom: 0.7rem; }
.mn-diff-seg { border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-300); font: inherit; font-weight: 600; font-size: 12.5px; padding: 6px 12px; border-radius: 999px; cursor: pointer; transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease; }
.mn-diff-seg:hover:not(.on) { color: var(--gray-0); border-color: var(--gray-500); }
.mn-diff-seg.on { background: var(--mn-accent); color: var(--accent-text-over); border-color: var(--mn-accent); }
.mn-hud { width: 100%; display: flex; justify-content: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.7rem; font-size: 13px; }
.mn-stat { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; font-variant-numeric: tabular-nums; }
.mn-stat strong { color: var(--mn-accent); }

.mn-boardwrap { position: relative; width: 100%; }
.mn-board { position: relative; width: 100%; aspect-ratio: 1; border-radius: 14px; background: linear-gradient(160deg, #241a33, #14101f); border: 2px solid var(--gray-800); overflow: hidden; touch-action: none; -webkit-user-select: none; user-select: none; box-shadow: var(--shadow-md); }
.mn-board.shake { animation: mn-shake 0.3s; }
@keyframes mn-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }

.mn-gem, .mn-cage, .mn-hit { position: absolute; box-sizing: border-box; }
.mn-gem { padding: 1.5%; transition: left 0.28s cubic-bezier(0.3,1.1,0.5,1), top 0.32s cubic-bezier(0.3,1.25,0.5,1), transform 0.22s cubic-bezier(0.3,1.1,0.5,1); animation: mn-in 0.42s cubic-bezier(0.3,1.3,0.5,1); pointer-events: none; }
.mn-gem.drag { transition: none; } /* follow the pointer 1:1 while dragging (snap animates on release) */
.mn-gemsvg, .mn-gemimg { width: 100%; height: 100%; display: block; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4)); }
.mn-gemimg { object-fit: contain; -webkit-user-drag: none; user-select: none; }
.mn-mark { position: absolute; inset: 1.5%; width: auto; height: auto; pointer-events: none; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.85)); }
.mn-gem.sel .mn-gemsvg, .mn-gem.sel .mn-gemimg { filter: drop-shadow(0 0 6px #fff) drop-shadow(0 2px 3px rgba(0,0,0,0.4)); transform: scale(1.08); }
.mn-gem.hint .mn-gemsvg, .mn-gem.hint .mn-gemimg { animation: mn-hint 0.8s ease-in-out infinite; }
/* clearing: flash bright, swell, then burst away in a spin */
.mn-gem.clr { z-index: 4; animation: mn-burst 0.46s cubic-bezier(0.45,0,0.4,1) forwards; }
.mn-gem.clr .mn-gemsvg, .mn-gem.clr .mn-gemimg { animation: mn-flash 0.46s ease-out forwards; }
@keyframes mn-in { 0% { transform: translateY(-28%) scale(0.55); opacity: 0; } 55% { opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
@keyframes mn-hint { 0%,100%{transform:scale(1)} 50%{transform:scale(1.18)} }
/* sparkle glint over each gem — gentle opacity twinkle (staggered per colour) */
.mn-glint { animation: mn-twinkle 2.4s ease-in-out infinite; }
@keyframes mn-twinkle { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
@keyframes mn-burst { 0% { transform: scale(1) rotate(0); } 32% { transform: scale(1.45) rotate(-10deg); } 100% { transform: scale(0) rotate(35deg); opacity: 0; } }
@keyframes mn-flash {
	0% { filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4)); }
	32% { filter: brightness(2.6) saturate(1.4) drop-shadow(0 0 14px rgba(255,255,255,0.95)); }
	100% { filter: brightness(3.2) drop-shadow(0 0 6px rgba(255,255,255,0.6)); }
}

.mn-cage { padding: 2%; display: grid; place-items: center; pointer-events: none; }
.mn-cage .mn-cocotte { width: 95%; height: 95%; }
.mn-bars { position: absolute; inset: 8%; border-radius: 8px; border: 2px solid rgba(255,255,255,0.55); background: repeating-linear-gradient(90deg, rgba(180,190,210,0.75) 0 3px, transparent 3px 22%); box-shadow: inset 0 0 8px rgba(0,0,0,0.4); }
.mn-cage.h1 .mn-bars { opacity: 0.5; background: repeating-linear-gradient(90deg, rgba(180,190,210,0.6) 0 2px, transparent 2px 33%); }

.mn-hit { background: transparent; border: none; cursor: grab; padding: 0; -webkit-tap-highlight-color: transparent; }
.mn-hit:active { cursor: grabbing; }

.mn-combo { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); background: var(--mn-accent); color: var(--accent-text-over); font-weight: 800; font-size: 19px; letter-spacing: 0.3px; padding: 7px 20px; border-radius: 999px; pointer-events: none; box-shadow: 0 0 18px var(--mn-accent), 0 4px 12px rgba(0,0,0,0.4); animation: mn-pop 0.6s cubic-bezier(0.2,1.5,0.35,1); z-index: 6; }
@keyframes mn-pop { 0% { transform: translateX(-50%) scale(0.3); opacity: 0; } 55% { transform: translateX(-50%) scale(1.2); opacity: 1; } 100% { transform: translateX(-50%) scale(1); opacity: 1; } }
/* combo halo pulse on the board — remounts each chain step to replay */
.mn-halo { position: absolute; inset: 0; border-radius: 14px; pointer-events: none; z-index: 5; box-shadow: inset 0 0 42px 6px var(--mn-accent); animation: mn-halo 0.6s ease-out forwards; }
@keyframes mn-halo { 0% { opacity: 0; } 35% { opacity: 0.9; } 100% { opacity: 0; } }

/* freed cocotte: pops from the cage, then flies to the 🐔 counter and shrinks in */
.mn-flyer { position: absolute; z-index: 30; pointer-events: none; padding: 4%; animation: mn-fly 0.9s cubic-bezier(0.45,-0.15,0.7,1) forwards; }
.mn-flyer .mn-cocotte { width: 100%; height: 100%; filter: drop-shadow(0 0 9px rgba(255,214,120,0.95)); }
@keyframes mn-fly {
	0% { transform: translate(0,0) scale(0.7) rotate(0); opacity: 0; }
	18% { transform: translate(0,-14%) scale(1.35) rotate(-10deg); opacity: 1; }
	40% { transform: translate(calc(var(--dx) * 0.2), calc(var(--dy) * 0.2 - 12px)) scale(1.1) rotate(8deg); opacity: 1; }
	100% { transform: translate(var(--dx), var(--dy)) scale(0.28) rotate(-14deg); opacity: 0.15; }
}
/* explosive egg dropped where the cocotte was — swells and rattles before the column blast */
.mn-egg { position: absolute; z-index: 7; display: grid; place-items: center; pointer-events: none; }
.mn-egg span { font-size: min(6vw, 26px); filter: drop-shadow(0 0 10px rgba(255,150,60,0.95)); animation: mn-egg 0.8s ease-out forwards; }
@keyframes mn-egg { 0% { transform: scale(0.2) rotate(0); opacity: 0; } 35% { transform: scale(1.25) rotate(-8deg); opacity: 1; } 55% { transform: scale(1.1) rotate(8deg); } 75% { transform: scale(1.2) rotate(-6deg); } 100% { transform: scale(1.5); opacity: 0; } }
/* the 🐔 counter bumps as a cocotte lands in it */
.mn-cstat { animation: mn-bump 0.42s cubic-bezier(0.2,1.6,0.4,1); }
@keyframes mn-bump { 0% { transform: scale(1); } 45% { transform: scale(1.35); box-shadow: 0 0 14px var(--mn-accent); } 100% { transform: scale(1); } }

.mn-overlay { position: absolute; inset: 0; z-index: 8; display: flex; align-items: center; justify-content: center; background: rgba(10,8,18,0.55); backdrop-filter: blur(3px); border-radius: 14px; }
.mn-card { background: var(--gray-999); border: 2px solid var(--mn-accent); border-radius: 18px; padding: 20px 28px; text-align: center; box-shadow: var(--shadow-lg); max-width: 300px; }
.mn-card .mn-cocotte { width: 54px; height: 54px; }
.mn-card h3 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 21px; color: var(--gray-0); }
.mn-score { color: var(--mn-accent); font-weight: 700; font-variant-numeric: tabular-nums; margin: 2px 0 12px; }
.mn-note { color: var(--gray-300); font-size: 13px; margin: 2px 0 0; }
.mn-btn { border: none; background: var(--mn-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 24px; cursor: pointer; }

.mn-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 0.9rem; }
.mn-act { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.mn-act:hover:not(:disabled) { background: var(--gray-800); border-color: var(--mn-accent); color: var(--mn-accent); }
.mn-act.on { background: var(--mn-accent); color: var(--accent-text-over); border-color: var(--mn-accent); }
.mn-act:disabled { opacity: 0.4; cursor: default; }

.mn-help { max-width: 440px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.2rem; }
@media (prefers-reduced-motion: reduce) { .mn-gem, .mn-gem.clr .mn-gemsvg, .mn-gem.clr .mn-gemimg, .mn-glint, .mn-combo, .mn-halo, .mn-flyer, .mn-egg span, .mn-cstat, .mn-board.shake { animation: none; transition: none; } }
`;
