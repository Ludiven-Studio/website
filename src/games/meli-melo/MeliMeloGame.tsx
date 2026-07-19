import { useState, useEffect, useRef, useCallback } from 'react';
import { generateGrid, wordPoints, adjacent, spellPath, DIFFS, DURATION_S, SIZE, type BoggleGrid } from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';
import { useLevels } from '../../lib/useLevels';
import { meliMeloLevels } from './levels';
import { touchDrag } from '../touchDrag';

/* =====================================================
   MÉLI-MÉLO — React island. Boggle 4×4: chain adjacent letters (8 directions) to form
   French words, 90 seconds on the clock. Score = classic Boggle points.
   Libre: nouvelle grille à volonté. Défi du jour: même grille pour tous, une tentative.
   Engine pure/testée dans ./engine (solutions précalculées → validation instantanée).
   ===================================================== */

type Status = 'armed' | 'playing' | 'ended';
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

interface DailyState { found: string[]; }
interface Toast { msg: string; kind: 'ok' | 'dup' | 'bad'; }

const score = (found: string[]): number => found.reduce((s, w) => s + wordPoints(w), 0);

export default function MeliMeloGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [grid, setGrid] = useState<BoggleGrid>(() => generateGrid(1, DIFFS.facile));
	const [found, setFound] = useState<string[]>([]);
	const [path, setPath] = useState<number[]>([]);
	const [status, setStatus] = useState<Status>('armed');
	const [remaining, setRemaining] = useState(DURATION_S * 1000);
	const [toast, setToast] = useState<Toast | null>(null);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const lv = useLevels(gameId, meliMeloLevels);

	const boardRef = useRef<HTMLDivElement | null>(null);
	const dragging = useRef(false);
	const dragMoved = useRef(false);
	const pathRef = useRef<number[]>([]);
	const foundRef = useRef<string[]>([]);
	const gridRef = useRef<BoggleGrid>(grid);
	const statusRef = useRef<Status>('armed');
	const dailyRef = useRef(false);
	const startRef = useRef(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const levelTargetRef = useRef(0);

	const total = score(found);
	const { celebrating } = useCelebration(daily && status === 'ended' && !alreadyPlayed && total > 0);

	const setPathBoth = (p: number[]): void => { pathRef.current = p; setPath(p); };
	const setFoundBoth = (f: string[]): void => { foundRef.current = f; setFound(f); };
	const setStatusBoth = (s: Status): void => { statusRef.current = s; setStatus(s); };

	const flash = (msg: string, kind: Toast['kind']): void => {
		if (toastTimer.current) clearTimeout(toastTimer.current);
		setToast({ msg, kind });
		toastTimer.current = setTimeout(() => setToast(null), 1100);
	};

	const saveDaily = (nf: string[], done: boolean): void => {
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, { startedAt: startRef.current, done, seed: sd?.seed, diffIndex: sd?.diffIndex, state: { found: nf } satisfies DailyState });
	};

	const endRun = useCallback((): void => {
		if (statusRef.current !== 'playing') return;
		setStatusBoth('ended');
		setPathBoth([]);
		if (dailyRef.current) saveDaily(foundRef.current, true);
		trackGame(gameId, 'game_won', { score: score(foundRef.current) });
	}, [gameId]);

	/* Wall-clock timer — reloads never pause it. */
	useEffect(() => {
		if (status !== 'playing') return;
		if (lv.active && !lv.playing) return; // levels grid open, not a running level
		const tick = (): void => {
			const left = DURATION_S * 1000 - (Date.now() - startRef.current);
			setRemaining(Math.max(0, left));
			if (left <= 0) endRun();
		};
		tick();
		const id = setInterval(tick, 100);
		return () => clearInterval(id);
	}, [status, endRun, lv.active, lv.playing]);

	const newGame = useCallback((key: keyof typeof DIFFS): void => {
		dailyRef.current = false;
		setDaily(false); setAlreadyPlayed(false);
		setDiffKey(key);
		const g = generateGrid((Math.random() * 2 ** 31) >>> 0, DIFFS[key]);
		gridRef.current = g; setGrid(g);
		setFoundBoth([]); setPathBoth([]); setToast(null);
		setRemaining(DURATION_S * 1000);
		setStatusBoth('armed');
	}, []);

	const startDaily = useCallback(async (): Promise<void> => {
		dailyRef.current = true;
		setDaily(true); setPathBoth([]); setToast(null);
		const lay = (seed: number, di: number): void => {
			const key = DIFF_ORDER[di] ?? 'facile';
			dailySeedRef.current = { seed, diffIndex: di };
			setDiffKey(key);
			const g = generateGrid(seed, DIFFS[key]);
			gridRef.current = g; setGrid(g);
		};
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			lay(run.seed, run.diffIndex ?? 0);
			const st = (run.state as DailyState) ?? { found: [] };
			setFoundBoth(st.found ?? []);
			setDailyLoading(false);
			startRef.current = run.startedAt;
			const expired = Date.now() - run.startedAt >= DURATION_S * 1000;
			if (run.done || expired) {
				setStatusBoth('ended');
				setAlreadyPlayed(run.done === true);
				setRemaining(0);
				if (!run.done) saveDaily(st.found ?? [], true); // expired while away → close the run, still submit below
			} else {
				setStatusBoth('playing'); setAlreadyPlayed(false);
			}
			return;
		}
		setAlreadyPlayed(false);
		setFoundBoth([]); setRemaining(DURATION_S * 1000);
		setStatusBoth('armed'); setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		lay(seed, diffIndex);
		setDailyLoading(false);
	}, [gameId]);

	const startTimer = useCallback((): void => {
		startRef.current = Date.now();
		setRemaining(DURATION_S * 1000);
		setStatusBoth('playing');
		trackGame(gameId, 'game_started', { mode: dailyRef.current ? 'daily' : 'free', difficulty: diffKey });
		if (dailyRef.current) saveDaily([], false);
	}, [gameId, diffKey]);

	/* Levels mode: start a level from its config; chrono starts immediately, grade when it ends. */
	const startLevel = useCallback((level: number): void => {
		const cfg = lv.play(level);
		dailyRef.current = false;
		setDaily(false); setAlreadyPlayed(false);
		levelTargetRef.current = cfg.target;
		// Derive a deterministic 32-bit seed from cfg.seed via mulberry32; generateGrid re-seeds from it.
		const g = generateGrid(mulberry32(cfg.seed)() * 2 ** 32 >>> 0, cfg.diff);
		gridRef.current = g; setGrid(g);
		setFoundBoth([]); setPathBoth([]); setToast(null);
		startRef.current = Date.now();
		setRemaining(DURATION_S * 1000);
		setStatusBoth('playing');
		trackGame(gameId, 'game_started', { mode: 'levels', level });
	}, [lv, gameId]);

	const armLevels = useCallback((): void => {
		dailyRef.current = false;
		setDaily(false);
		lv.enter();
	}, [lv]);

	/* Grade the level once the run ends: won = final score reached the target. */
	useEffect(() => {
		if (!lv.playing || status !== 'ended') return;
		const pts = score(foundRef.current);
		lv.finish({ won: pts >= levelTargetRef.current, score: pts, raw: { found: foundRef.current.length } });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv.playing, status]);

	/* ---------- Submit ---------- */
	const submitPath = (p: number[]): void => {
		if (p.length < 3) return;
		const word = spellPath(p, gridRef.current.cells);
		if (foundRef.current.includes(word)) { flash('Déjà trouvé', 'dup'); return; }
		if (!gridRef.current.solutions.includes(word)) { flash(word, 'bad'); return; }
		const nf = [...foundRef.current, word];
		setFoundBoth(nf);
		flash(`${word} +${wordPoints(word)}`, 'ok');
		if (dailyRef.current) saveDaily(nf, false);
	};

	/* ---------- Pointer: chain adjacent cells (8 directions) ---------- */
	const cellFromXY = (clientX: number, clientY: number): number | null => {
		const board = boardRef.current; if (!board) return null;
		const rect = board.getBoundingClientRect();
		const px = ((clientX - rect.left) / rect.width) * SIZE;
		const py = ((clientY - rect.top) / rect.height) * SIZE;
		const c = Math.floor(px), r = Math.floor(py);
		if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
		// centre deadzone → reliable diagonals
		if (Math.abs(px - c - 0.5) > 0.36 || Math.abs(py - r - 0.5) > 0.36) return null;
		return r * SIZE + c;
	};
	const downOnLast = useRef(false);
	const startDrag = (clientX: number, clientY: number): void => {
		if (statusRef.current !== 'playing') return;
		dragging.current = true; dragMoved.current = false;
		const cell = cellFromXY(clientX, clientY);
		const p = pathRef.current;
		downOnLast.current = cell != null && p.length > 0 && cell === p[p.length - 1];
		if (cell != null && !p.includes(cell)) {
			if (!p.length || adjacent(p[p.length - 1], cell)) { setPathBoth([...p, cell]); dragMoved.current = p.length > 0; }
		}
	};
	const moveDrag = (clientX: number, clientY: number): void => {
		if (!dragging.current) return;
		const cell = cellFromXY(clientX, clientY);
		if (cell == null) return;
		const p = pathRef.current;
		if (p.length && cell === p[p.length - 1]) return;
		if (p.length >= 2 && cell === p[p.length - 2]) { setPathBoth(p.slice(0, -1)); dragMoved.current = true; return; } // backtrack
		if (!p.includes(cell) && (!p.length || adjacent(p[p.length - 1], cell))) { setPathBoth([...p, cell]); if (p.length) dragMoved.current = true; }
	};
	const endDrag = (): void => {
		if (!dragging.current) return;
		dragging.current = false;
		if (dragMoved.current) {
			const p = pathRef.current;
			setPathBoth([]);
			submitPath(p);
		} else if (downOnLast.current) {
			setPathBoth(pathRef.current.slice(0, -1)); // re-tap the last cell → remove it
		}
		// otherwise: simple tap appended a cell (tap-to-compose mode, ✓ to submit)
	};
	const onDown = (e: React.PointerEvent): void => {
		if (e.pointerType === 'touch') return;
		startDrag(e.clientX, e.clientY);
		boardRef.current?.setPointerCapture(e.pointerId);
		e.preventDefault();
	};
	const onMove = (e: React.PointerEvent): void => {
		if (e.pointerType === 'touch') return;
		moveDrag(e.clientX, e.clientY);
	};
	const onUp = (e?: React.PointerEvent): void => {
		if (e && e.pointerType === 'touch') return;
		endDrag();
	};
	const tapRemove = (): void => { setPathBoth(pathRef.current.slice(0, -1)); };
	const tapSubmit = (): void => { const p = pathRef.current; setPathBoth([]); submitPath(p); };

	useEffect(() => { newGame('facile'); }, [newGame]);

	/* ---------- Render ---------- */
	const word = spellPath(path, grid.cells);
	const wordState = path.length >= 3 ? (found.includes(word) ? 'dup' : grid.solutions.includes(word) ? 'ok' : '') : '';
	const missed = grid.solutions.filter((w) => !found.includes(w))
		.sort((a, b) => wordPoints(b) - wordPoints(a) || a.localeCompare(b)).slice(0, 10);
	const secs = Math.ceil(remaining / 1000);
	const pts = path.map((i) => `${(i % SIZE) + 0.5},${Math.floor(i / SIZE) + 0.5}`).join(' ');
	const armed = status === 'armed';

	return (
		<div className="mm-root">
			<style>{CSS}</style>

			<ModeToggle
				daily={daily}
				onFree={() => { if (lv.active) { lv.exit(); newGame(diffKey); } else if (daily) newGame(diffKey); }}
				onDaily={() => { lv.exit(); startDaily(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

			{lv.active && (
				<div className="mm-daily-tag">
					{lv.menu ? 'Progression — réussis un niveau pour débloquer le suivant' : `Niveau ${lv.level} · objectif ${levelTargetRef.current} pts`}
				</div>
			)}

			{daily ? (
				<div className="mm-daily-tag">{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}</div>
			) : !lv.active ? (
				<div className="mm-bar">
					<div className="mm-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button key={k} role="tab" aria-selected={diffKey === k} className={`mm-pill ${diffKey === k ? 'active' : ''}`} onClick={() => newGame(k)}>{DIFFS[k].label}</button>
						))}
					</div>
					<button className="mm-act" onClick={() => newGame(diffKey)}>↻ Nouvelle grille</button>
				</div>
			) : null}

			{lv.active && lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
			<>
			<div className="mm-status">
				<span className="mm-score">{total} pts</span>
				<span className="mm-count">{found.length} mot{found.length > 1 ? 's' : ''}</span>
				<span className={`mm-time${status === 'playing' && secs <= 10 ? ' urgent' : ''}`}>⏱ {secs}s</span>
			</div>
			<div className="mm-timerbar"><div className={`mm-timerfill${status === 'playing' && secs <= 10 ? ' urgent' : ''}`} style={{ width: `${(remaining / (DURATION_S * 1000)) * 100}%` }} /></div>

			<div className="mm-playwrap">
				{celebrating && <Celebration />}
				<div className={`mm-boardwrap${armed || status === 'ended' ? ' blurred' : ''}`}>
					<div
						ref={boardRef}
						className="mm-board"
						{...touchDrag(startDrag, moveDrag, endDrag)}
						onPointerDown={onDown}
						onPointerMove={onMove}
						onPointerUp={onUp}
						onPointerCancel={onUp}
					>
						{grid.cells.map((ch, i) => (
							<div key={i} className={`mm-cell${path.includes(i) ? ' sel' : ''}`}>{ch}</div>
						))}
						<svg className="mm-trail" viewBox={`0 0 ${SIZE} ${SIZE}`} preserveAspectRatio="none" aria-hidden="true">
							{path.length > 1 && <polyline points={pts} />}
						</svg>
					</div>
				</div>

				{status === 'ended' && !lv.active && (
					<div className="mm-overlay">
						<div className="mm-overlay-card end">
							<h3>⏱ Temps écoulé&nbsp;!</h3>
							<div className="mm-bigscore">{total} pts</div>
							<p>{found.length}/{grid.solutions.length} mots trouvés</p>
						</div>
					</div>
				)}
				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={meliMeloLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won
							? `${total} pts · objectif ${levelTargetRef.current} atteint`
							: `${total} / ${levelTargetRef.current} pts — objectif manqué`}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
				{daily && dailyLoading && <div className="mm-overlay"><div className="mm-overlay-card">Préparation du défi…</div></div>}
				{armed && !dailyLoading && (
					<div className="mm-overlay"><div className="mm-overlay-card start">
						<h3>Prêt&nbsp;?</h3>
						<p>{DURATION_S} secondes pour trouver un max de mots{daily ? ' — une seule tentative !' : ''}.</p>
						<button className="mm-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div></div>
				)}
			</div>

			<div className="mm-preview-row">
				<div className={`mm-preview ${toast ? toast.kind : wordState}`}>{toast ? toast.msg : word || ' '}</div>
				{!dragging.current && path.length > 0 && status === 'playing' && (
					<>
						{path.length >= 3 && <button className="mm-mini ok" onClick={tapSubmit}>✓</button>}
						<button className="mm-mini" onClick={tapRemove}>⌫</button>
					</>
				)}
			</div>

			{status === 'ended' ? (
				<div className="mm-end">
					<div className="mm-endscore">
						{daily && alreadyPlayed
							? <>Défi du jour déjà relevé · <strong>{total} pts</strong> — reviens demain&nbsp;!</>
							: <>⏱ Terminé&nbsp;! <strong>{total} pts</strong> · {found.length}/{grid.solutions.length} mots trouvés</>}
					</div>
					{found.length > 0 && (
						<div className="mm-chips">{found.slice().reverse().map((w) => <span key={w} className="mm-chip done">{w} <i>+{wordPoints(w)}</i></span>)}</div>
					)}
					{missed.length > 0 && (
						<details className="mm-missed">
							<summary>Meilleurs mots manqués ({grid.solutions.length - found.length})</summary>
							<div className="mm-chips">{missed.map((w) => <span key={w} className="mm-chip">{w} <i>+{wordPoints(w)}</i></span>)}</div>
						</details>
					)}
					{!daily && !lv.active && <button className="mm-replay" onClick={() => newGame(diffKey)}>↻ Nouvelle grille</button>}
				</div>
			) : (
				found.length > 0 && <div className="mm-chips live">{found.slice().reverse().map((w) => <span key={w} className="mm-chip done">{w} <i>+{wordPoints(w)}</i></span>)}</div>
			)}
			</>
			)}

			<p className="mm-help">
				Relie des lettres voisines (8 directions, chaque case une seule fois) pour former des mots de 3 lettres ou plus.
				3-4 lettres = 1 pt, 5 = 2, 6 = 3, 7 = 5, 8 = 11.
			</p>

			{daily && <Leaderboard game={gameId} metric="score" submitValue={status === 'ended' && !alreadyPlayed ? total : undefined} />}
			{!daily && !lv.active && <LeaderboardCorner game={gameId} metric="score" />}
		</div>
	);
}

const CSS = `
.mm-root { --mm: var(--accent-regular); width: 100%; max-width: 460px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.game-page.gf-full .mm-root { max-width: none; width: 100%; height: 100%; justify-content: center; }
.game-page.gf-full .mm-help { display: none; }
.mm-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.6rem; }
.mm-bar { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
.mm-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.mm-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.mm-pill.active { background: var(--mm); color: var(--accent-text-over); border-color: var(--mm); }
.mm-act { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.mm-act:hover { background: var(--gray-800); border-color: var(--mm); color: var(--mm); }
.mm-status { display: flex; gap: 0.5rem; align-items: center; font-weight: 700; font-size: 13px; margin-bottom: 0.4rem; }
.mm-score { background: var(--mm); color: var(--accent-text-over); border-radius: 999px; padding: 5px 12px; font-variant-numeric: tabular-nums; }
.mm-count, .mm-time { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; font-variant-numeric: tabular-nums; }
.mm-time { font-size: 16px; font-weight: 800; padding: 6px 16px; border: 1.5px solid var(--gray-700); }
.mm-time.urgent { color: #ff5a5f; border-color: #ff5a5f; animation: mm-pulse 1s infinite; }
@keyframes mm-pulse { 50% { opacity: 0.55; } }
.mm-timerbar { width: 100%; max-width: 360px; height: 8px; background: var(--gray-800); border-radius: 999px; overflow: hidden; margin-bottom: 0.8rem; }
.mm-timerfill { height: 100%; background: var(--mm); border-radius: 999px; transition: width 0.1s linear, background 0.3s; }
.mm-timerfill.urgent { background: #e0484d; }
.mm-playwrap { width: 100%; position: relative; display: flex; justify-content: center; }
.mm-boardwrap { width: min(88vw, 340px); }
.mm-boardwrap.blurred { filter: blur(6px); opacity: 0.5; pointer-events: none; }
.mm-board { position: relative; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; width: 100%; aspect-ratio: 1; touch-action: none; user-select: none; -webkit-user-select: none; }
.mm-cell { background: var(--gray-900); border: 2px solid var(--gray-800); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: clamp(22px, 8vw, 34px); color: var(--gray-0); }
.mm-cell.sel { background: var(--mm); border-color: var(--mm); color: var(--accent-text-over); }
.mm-trail { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.mm-trail polyline { fill: none; stroke: rgba(255,255,255,0.55); stroke-width: 0.14; stroke-linecap: round; stroke-linejoin: round; }
.mm-preview-row { display: flex; align-items: center; gap: 8px; margin-top: 0.7rem; min-height: 40px; }
.mm-preview { min-width: 130px; text-align: center; background: var(--gray-900); border: 1.5px solid var(--gray-700); border-radius: 999px; padding: 7px 18px; font-weight: 800; font-size: 16px; letter-spacing: 2px; }
.mm-preview.ok { border-color: #37a05a; color: #5dd68a; }
.mm-preview.dup { border-color: #e07a2f; color: #e8a05c; }
.mm-preview.bad { border-color: #e0484d; color: #ef7a7e; }
.mm-mini { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 800; font-size: 15px; border-radius: 999px; width: 38px; height: 38px; cursor: pointer; }
.mm-mini.ok { background: var(--mm); border-color: var(--mm); color: var(--accent-text-over); }
.mm-chips { display: flex; flex-wrap: wrap; gap: 5px 6px; justify-content: center; margin-top: 0.6rem; max-width: 430px; }
.mm-chips.live { max-height: 74px; overflow-y: auto; }
.mm-chip { font-weight: 700; font-size: 12.5px; letter-spacing: 0.5px; color: var(--gray-300); background: var(--gray-900); border: 1.5px solid var(--gray-800); border-radius: 999px; padding: 3px 10px; }
.mm-chip.done { color: var(--gray-0); }
.mm-chip i { font-style: normal; color: var(--mm); font-size: 11px; }
.mm-end { display: flex; flex-direction: column; align-items: center; margin-top: 0.9rem; gap: 0.4rem; }
.mm-endscore { font-size: 16px; text-align: center; }
.mm-endscore strong { color: var(--mm); font-variant-numeric: tabular-nums; }
.mm-missed { margin-top: 0.4rem; text-align: center; }
.mm-missed summary { cursor: pointer; color: var(--gray-300); font-size: 13.5px; font-weight: 600; }
.mm-replay { border: none; background: var(--mm); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 24px; cursor: pointer; margin-top: 0.6rem; }
.mm-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; }
.mm-overlay-card { background: var(--gray-999); border: 2px solid var(--mm); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); color: var(--gray-300); text-align: center; max-width: 280px; }
.mm-overlay-card.start h3 { margin: 0 0 0.4rem; font-family: var(--font-brand); color: var(--gray-0); font-size: var(--text-xl); }
.mm-overlay-card.start p { margin: 0 0 0.8rem; font-size: 13px; }
.mm-overlay-card.end h3 { margin: 0 0 0.3rem; font-family: var(--font-brand); color: var(--gray-0); font-size: var(--text-xl); }
.mm-overlay-card.end p { margin: 0.3rem 0 0; font-size: 13.5px; }
.mm-bigscore { font-size: 40px; font-weight: 800; color: var(--mm); font-variant-numeric: tabular-nums; line-height: 1.1; }
.mm-startbtn { border: none; background: var(--mm); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 17px; border-radius: 999px; padding: 12px 34px; cursor: pointer; box-shadow: var(--shadow-lg); }
.mm-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1rem; }
`;
