import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import {
	generateBoard, trySwap, smash, findHint, hasAnyMove, shuffle, cagedLeft,
	isGem, isCage, type Cell, type GenBoard, type Cfg, type SpecialKind, type Step,
} from './engine';
import { mineLevels, levelSetup } from './levels';
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
const FREE_CFG: Cfg = { rows: 8, cols: 8, colors: 6, cocottes: 5, cageHits: 1 };
const FREE_MOVES = 25;
const DAILY_CFG: Cfg = { rows: 8, cols: 8, colors: 6, cocottes: 6, cageHits: 1 };
const DAILY_MOVES = 24;
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
			<polygon points="50,3 93,37 69,97 31,97 7,37" fill={isRainbow ? `url(#mn-rainbow)` : c.base} stroke="rgba(0,0,0,0.18)" strokeWidth="2" />
			<polygon points="50,3 93,37 50,51 7,37" fill={isRainbow ? '#ffffff' : c.light} opacity="0.9" />
			<polygon points="7,37 50,51 31,97" fill={isRainbow ? c.dark : c.dark} opacity="0.55" />
			<polygon points="93,37 50,51 69,97" fill={c.dark} opacity="0.7" />
			<line x1="50" y1="51" x2="50" y2="97" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
			{(special === 'rowClear' || special === 'colClear') && (
				<g stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.95">
					{special === 'rowClear' ? <><line x1="24" y1="50" x2="76" y2="50" /><polyline points="66,42 78,50 66,58" fill="none" /><polyline points="34,42 22,50 34,58" fill="none" /></>
						: <><line x1="50" y1="26" x2="50" y2="74" /><polyline points="42,36 50,24 58,36" fill="none" /><polyline points="42,64 50,76 58,64" fill="none" /></>}
				</g>
			)}
			{special === 'bomb' && <circle cx="50" cy="52" r="15" fill="#1b1b22" stroke="#fff" strokeWidth="3" />}
		</svg>
	);
}

function CocotteMini() {
	return (
		<svg viewBox="0 0 100 100" className="mn-cocotte" aria-hidden="true">
			<g fill="#e0413a"><circle cx="42" cy="26" r="6" /><circle cx="52" cy="21" r="7" /><circle cx="62" cy="26" r="6" /></g>
			<ellipse cx="50" cy="60" rx="30" ry="28" fill="#fdfdfb" stroke="#e6e6df" strokeWidth="1.4" />
			<circle cx="41" cy="52" r="4" fill="#2a2a2a" /><circle cx="59" cy="52" r="4" fill="#2a2a2a" />
			<polygon points="50,56 44,62 56,62" fill="#f5a623" />
		</svg>
	);
}

export default function MineGame({ gameId }: { gameId: string }) {
	const [displayGrid, setDisplayGrid] = useState<Cell[][]>([]);
	const [cfg, setCfg] = useState<Cfg>(FREE_CFG);
	const [status, setStatus] = useState<Status>('playing');
	const [won, setWon] = useState(false);
	const [score, setScore] = useState(0);
	const [movesLeft, setMovesLeft] = useState(FREE_MOVES);
	const [cocottesLeft, setCocottesLeft] = useState(0);
	const [cocottesTotal, setCocottesTotal] = useState(0);
	const [selected, setSelected] = useState<[number, number] | null>(null);
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

	const boardRef = useRef<GenBoard | null>(null);
	const statusRef = useRef<Status>('playing');
	const animatingRef = useRef(false);
	const movesRef = useRef(FREE_MOVES);
	const scoreRef = useRef(0);
	const dailyRef = useRef(false);
	const idleRef = useRef<number>(0);
	const wrapRef = useRef<HTMLDivElement | null>(null);
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
		const caged = cagedLeft(b.grid);
		setCocottesLeft(caged); setCocottesTotal(caged);
		setSelected(null); setHint(null); setClearing(new Set()); setCombo(0);
		setHammers(HAMMERS); setHammerArmed(false); setWon(false);
		setStat('playing');
		animatingRef.current = false;
		idleRef.current = Date.now();
	}, []);

	const newFree = useCallback(() => {
		setDaily(false); dailyRef.current = false; setAlreadyPlayed(false);
		armBoard(generateBoard((Math.random() * 2 ** 31) >>> 0, FREE_CFG), FREE_MOVES);
		try { setBest(Number(localStorage.getItem(BEST_KEY) ?? '0') || 0); } catch { setBest(0); }
	}, [armBoard]);

	const startLevel = useCallback((level: number) => {
		const s = levelSetup(level);
		setDaily(false); dailyRef.current = false;
		armBoard(generateBoard(s.seed, s.cfg), s.moves);
	}, [armBoard]);

	const armLevels = useCallback(() => { setDaily(false); dailyRef.current = false; lv.enter(); }, [lv]);

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

	// Init once.
	useEffect(() => { newFree(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

	/* ---------- end of game ---------- */
	const endGame = useCallback((didWin: boolean) => {
		setStat('over'); setWon(didWin);
		trackGame(gameId, didWin ? 'game_won' : 'game_over', { score: scoreRef.current });
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
			await sleep(step.cleared.length ? 170 : 40);
			boardRef.current = { ...boardRef.current!, grid: step.grid };
			setDisplayGrid(step.grid.map((row) => row.slice()));
			setClearing(new Set());
			await sleep(150);
		}
		scoreRef.current += gained; setScore(scoreRef.current);
		setCocottesLeft(cagedLeft(boardRef.current!.grid));
		setCombo(0);
		// win / lose / shuffle
		if (cagedLeft(boardRef.current!.grid) === 0) endGame(true);
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
		await sleep(160);
		await runResult(res.steps, res.gained, res.freed);
	}, [runResult]);

	const onCell = useCallback((r: number, c: number) => {
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

	/* ---------- native touch swipe (iOS-safe) ---------- */
	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		let start: [number, number] | null = null;
		const cellAt = (x: number, y: number): [number, number] | null => {
			const rect = el.getBoundingClientRect();
			const c = Math.floor(((x - rect.left) / rect.width) * cfg.cols);
			const r = Math.floor(((y - rect.top) / rect.height) * cfg.rows);
			return r >= 0 && r < cfg.rows && c >= 0 && c < cfg.cols ? [r, c] : null;
		};
		const onStart = (e: TouchEvent) => { const t = e.touches[0]; if (t) start = cellAt(t.clientX, t.clientY); };
		const onEnd = (e: TouchEvent) => {
			if (!start) return;
			const t = e.changedTouches[0];
			const end = t ? cellAt(t.clientX, t.clientY) : null;
			const s = start; start = null;
			if (!end) return;
			const d = Math.abs(s[0] - end[0]) + Math.abs(s[1] - end[1]);
			if (d === 1) { e.preventDefault(); void doSwap(s, end); } // a swipe to a neighbour → swap (tap falls through to onCell)
		};
		el.addEventListener('touchstart', onStart, { passive: false });
		el.addEventListener('touchend', onEnd, { passive: false });
		return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchend', onEnd); };
	}, [cfg.cols, cfg.rows, doSwap]);

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
				<div className="mn-tag">Mine libre — graine aléatoire</div>
			)}

			{!(lv.active && lv.menu) && (
				<div className="mn-hud">
					<span className="mn-stat">🐔 <strong>{cocottesLeft}</strong>/{cocottesTotal}</span>
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
								const sel = selected && selected[0] === r && selected[1] === c ? ' sel' : '';
								const hi = hintSet?.has(`${r},${c}`) ? ' hint' : '';
								return (
									<div key={cell.id} className={`mn-gem${cl}${sel}${hi}`} style={cellStyle(r, c, cfg)}>
										<GemSVG color={cell.color} special={cell.special} />
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
									<button className="mn-btn primary" onClick={newFree}>↻ Nouvelle mine</button>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
			)}

			{inLevelsPlay || (status === 'playing' && !dailyLoading && !(lv.active && lv.menu)) ? (
				<div className="mn-actions">
					<button className="mn-act" onClick={showHint} disabled={animatingRef.current}>💡 Indice</button>
					<button className={`mn-act ${hammerArmed ? 'on' : ''}`} onClick={() => setHammerArmed((v) => !v)} disabled={hammers <= 0}>🔨 Marteau ({hammers})</button>
					{lv.active ? (
						<button className="mn-act" onClick={lv.backToMenu}>🗺 Carte</button>
					) : !daily ? (
						<button className="mn-act" onClick={newFree}>↻ Nouvelle</button>
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
.mn-hud { width: 100%; display: flex; justify-content: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.7rem; font-size: 13px; }
.mn-stat { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; font-variant-numeric: tabular-nums; }
.mn-stat strong { color: var(--mn-accent); }

.mn-boardwrap { position: relative; width: 100%; }
.mn-board { position: relative; width: 100%; aspect-ratio: 1; border-radius: 14px; background: linear-gradient(160deg, #241a33, #14101f); border: 2px solid var(--gray-800); overflow: hidden; touch-action: none; -webkit-user-select: none; user-select: none; box-shadow: var(--shadow-md); }
.mn-board.shake { animation: mn-shake 0.3s; }
@keyframes mn-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }

.mn-gem, .mn-cage, .mn-hit { position: absolute; box-sizing: border-box; }
.mn-gem { padding: 1.5%; transition: left 0.16s ease, top 0.16s ease; animation: mn-in 0.18s ease; pointer-events: none; }
.mn-gemsvg { width: 100%; height: 100%; display: block; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4)); }
.mn-gem.sel .mn-gemsvg { filter: drop-shadow(0 0 6px #fff) drop-shadow(0 2px 3px rgba(0,0,0,0.4)); transform: scale(1.08); }
.mn-gem.hint .mn-gemsvg { animation: mn-hint 0.8s ease-in-out infinite; }
.mn-gem.clr { transform: scale(0); opacity: 0; transition: transform 0.15s ease, opacity 0.15s ease; }
@keyframes mn-in { from { transform: scale(0.2); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes mn-hint { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }

.mn-cage { padding: 3%; display: grid; place-items: center; pointer-events: none; }
.mn-cage .mn-cocotte { width: 88%; height: 88%; }
.mn-bars { position: absolute; inset: 8%; border-radius: 8px; border: 2px solid rgba(255,255,255,0.55); background: repeating-linear-gradient(90deg, rgba(180,190,210,0.75) 0 3px, transparent 3px 22%); box-shadow: inset 0 0 8px rgba(0,0,0,0.4); }
.mn-cage.h1 .mn-bars { opacity: 0.5; background: repeating-linear-gradient(90deg, rgba(180,190,210,0.6) 0 2px, transparent 2px 33%); }

.mn-hit { background: transparent; border: none; cursor: pointer; padding: 0; -webkit-tap-highlight-color: transparent; }

.mn-combo { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); background: var(--mn-accent); color: var(--accent-text-over); font-weight: 800; font-size: 15px; padding: 5px 16px; border-radius: 999px; pointer-events: none; animation: mn-pop 0.5s ease; z-index: 5; }
@keyframes mn-pop { from { transform: translateX(-50%) scale(0.4); opacity: 0; } to { transform: translateX(-50%) scale(1); opacity: 1; } }

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
@media (prefers-reduced-motion: reduce) { .mn-gem, .mn-combo, .mn-board.shake { animation: none; transition: none; } }
`;
