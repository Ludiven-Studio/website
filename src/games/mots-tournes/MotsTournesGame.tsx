import { useState, useEffect, useRef, useCallback } from 'react';
import { fmtCentis } from '../../lib/scoreFormat';
import { generatePuzzle, spell, DIFFS, type Puzzle, type Cell } from './engine';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   MOTS TOURNÉS — React island. A "Wend"-style word puzzle: trace each themed word as a snaking
   path over adjacent letters; the paths tile the grid. Only lengths + the theme are shown.
   Libre: nouvelle grille à volonté. Défi du jour: même grille pour tous, au chrono.
   Moteur pur/testé dans ./engine.
   ===================================================== */

type Status = 'playing' | 'won';
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
const ckey = (r: number, c: number): string => `${r},${c}`;
const WORD_COLORS = ['#e0484d', '#e07a2f', '#c99a1e', '#37a05a', '#2f9bb0', '#4a7fe0', '#8a5cf0', '#c94f97', '#6a9e34', '#b0563a', '#3aa090'];
const wordColor = (i: number): string => WORD_COLORS[i % WORD_COLORS.length];
const adjacent = (a: Cell, b: Cell): boolean => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

interface DailyState { found: number[]; }

export default function MotsTournesGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<Puzzle>(() => generatePuzzle(1, DIFFS.facile));
	const [found, setFound] = useState<number[]>([]);
	const [trace, setTrace] = useState<Cell[]>([]);
	const [status, setStatus] = useState<Status>('playing');
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [started, setStarted] = useState(false);
	const [elapsed, setElapsed] = useState(0);

	const boardRef = useRef<HTMLDivElement | null>(null);
	const drawing = useRef(false);
	const traceRef = useRef<Cell[]>([]);
	const foundRef = useRef<number[]>([]);
	const puzzleRef = useRef<Puzzle>(puzzle);
	const dailyRef = useRef(false);
	const startRef = useRef(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);

	const { celebrating } = useCelebration(status === 'won');
	const armed = daily && !started;
	const total = puzzle.regions.length;

	/* Daily chrono. */
	useEffect(() => {
		if (!daily || !started || status !== 'playing') return;
		const id = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 10)), 50);
		return () => clearInterval(id);
	}, [daily, started, status]);

	const setTraceBoth = (t: Cell[]): void => { traceRef.current = t; setTrace(t); };
	const setFoundBoth = (f: number[]): void => { foundRef.current = f; setFound(f); };
	const occupied = (cell: Cell): boolean => {
		const p = puzzleRef.current;
		if (p.letters[cell[0]][cell[1]] === '') return true; // blank/wall cell — can't be traced
		return foundRef.current.some((i) => p.regions[i].cells.some(([r, c]) => r === cell[0] && c === cell[1]));
	};

	const newGame = useCallback((key: keyof typeof DIFFS): void => {
		dailyRef.current = false;
		setDaily(false); setStarted(false); setAlreadyPlayed(false);
		setDiffKey(key); setElapsed(0);
		const p = generatePuzzle((Math.random() * 2 ** 31) >>> 0, DIFFS[key]);
		puzzleRef.current = p; setPuzzle(p);
		setFoundBoth([]); setTraceBoth([]);
		setStatus('playing');
		trackGame(gameId, 'game_started', { difficulty: key, mode: 'free' });
	}, [gameId]);

	const startDaily = useCallback(async (): Promise<void> => {
		dailyRef.current = true;
		setDaily(true); setTraceBoth([]);
		const lay = (seed: number, di: number): void => {
			const key = DIFF_ORDER[di] ?? 'facile';
			dailySeedRef.current = { seed, diffIndex: di };
			setDiffKey(key);
			const p = generatePuzzle(seed, DIFFS[key]);
			puzzleRef.current = p; setPuzzle(p);
		};
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const di = run.diffIndex ?? 0;
			lay(run.seed, di);
			const st = (run.state as DailyState) ?? { found: [] };
			setFoundBoth(st.found ?? []);
			setDailyLoading(false); setStarted(true);
			if (run.done) { setStatus('won'); setAlreadyPlayed(true); setElapsed(run.finalTime ?? 0); }
			else { setStatus('playing'); setAlreadyPlayed(false); startRef.current = run.startedAt; setElapsed(Math.round((Date.now() - run.startedAt) / 10)); }
			return;
		}
		setAlreadyPlayed(false); setStatus('playing'); setStarted(false);
		setFoundBoth([]); setElapsed(0); setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		lay(seed, diffIndex);
		setDailyLoading(false);
	}, [gameId]);

	const startTimer = useCallback((): void => {
		const now = Date.now();
		startRef.current = now; setStarted(true); setElapsed(0);
		trackGame(gameId, 'game_started', { mode: 'daily' });
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, { startedAt: now, done: false, seed: sd?.seed, diffIndex: sd?.diffIndex, state: { found: [] } satisfies DailyState });
	}, [gameId]);

	const saveDaily = (nf: number[], complete: boolean, finalTime?: number): void => {
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, { startedAt: startRef.current, done: complete, finalTime, seed: sd?.seed, diffIndex: sd?.diffIndex, state: { found: nf } satisfies DailyState });
	};

	const markFound = (idx: number): void => {
		if (foundRef.current.includes(idx)) return;
		const nf = [...foundRef.current, idx];
		setFoundBoth(nf);
		const complete = nf.length === puzzleRef.current.regions.length;
		if (dailyRef.current) {
			const finalTime = complete ? Math.round((Date.now() - startRef.current) / 10) : undefined;
			saveDaily(nf, complete, finalTime);
			if (complete) { setElapsed(finalTime!); setStatus('won'); trackGame(gameId, 'game_won'); }
		} else if (complete) { setStatus('won'); trackGame(gameId, 'game_won'); }
	};

	const undo = (): void => {
		if (!foundRef.current.length || status === 'won') return;
		const nf = foundRef.current.slice(0, -1);
		setFoundBoth(nf);
		if (dailyRef.current) saveDaily(nf, false);
	};

	/* ---------- Pointer: trace a path across adjacent letters ---------- */
	const cellFromPointer = (e: React.PointerEvent): Cell | null => {
		const board = boardRef.current; if (!board) return null;
		const p = puzzleRef.current;
		const rect = board.getBoundingClientRect();
		const c = Math.floor(((e.clientX - rect.left) / rect.width) * p.cols);
		const r = Math.floor(((e.clientY - rect.top) / rect.height) * p.rows);
		if (r < 0 || r >= p.rows || c < 0 || c >= p.cols) return null;
		return [r, c];
	};
	const onDown = (e: React.PointerEvent): void => {
		if (armed || status !== 'playing') return;
		const cell = cellFromPointer(e);
		if (!cell || occupied(cell)) return;
		drawing.current = true;
		setTraceBoth([cell]);
		boardRef.current?.setPointerCapture(e.pointerId);
		e.preventDefault();
	};
	const onMove = (e: React.PointerEvent): void => {
		if (!drawing.current) return;
		const cell = cellFromPointer(e);
		if (!cell) return;
		const t = traceRef.current;
		const last = t[t.length - 1];
		if (last[0] === cell[0] && last[1] === cell[1]) return;
		if (t.length >= 2 && t[t.length - 2][0] === cell[0] && t[t.length - 2][1] === cell[1]) { setTraceBoth(t.slice(0, -1)); return; } // backtrack
		if (adjacent(last, cell) && !occupied(cell) && !t.some(([r, c]) => r === cell[0] && c === cell[1])) setTraceBoth([...t, cell]);
	};
	const onUp = (): void => {
		if (!drawing.current) return;
		drawing.current = false;
		const t = traceRef.current;
		setTraceBoth([]);
		if (t.length < 2) return;
		const s = spell(t, puzzleRef.current.letters);
		const idx = puzzleRef.current.regions.findIndex((rg, i) => !foundRef.current.includes(i) && rg.word === s);
		if (idx >= 0) markFound(idx);
	};

	useEffect(() => { newGame('facile'); }, [newGame]);

	/* ---------- Render ---------- */
	const cellColor = new Map<string, string>();
	for (const i of found) for (const [r, c] of puzzle.regions[i].cells) cellColor.set(ckey(r, c), wordColor(i));
	const traceSet = new Set(trace.map(([r, c]) => ckey(r, c)));
	const remainingLengths = puzzle.regions.map((_, i) => i).filter((i) => !found.includes(i)).map((i) => puzzle.regions[i].word.length).sort((a, b) => a - b);
	const pts = (cells: Cell[]): string => cells.map(([r, c]) => `${c + 0.5},${r + 0.5}`).join(' '); // tube polyline (cell centres)
	// Direction arrows sitting in the gaps between consecutive cells → show the reading order
	// without covering the letters (like the ‹ › ^ v marks in the original).
	const arrows = (cells: Cell[], kp: string): React.ReactNode[] => cells.slice(0, -1).map((_, i) => {
		const [ar, ac] = cells[i], [br, bc] = cells[i + 1];
		const mx = (ac + bc) / 2 + 0.5, my = (ar + br) / 2 + 0.5;
		const dx = bc - ac, dy = br - ar, px = -dy, py = dx, s = 0.16;
		const pts = `${mx + dx * s},${my + dy * s} ${mx - dx * s * 0.55 + px * s},${my - dy * s * 0.55 + py * s} ${mx - dx * s * 0.55 - px * s},${my - dy * s * 0.55 - py * s}`;
		return <polygon key={`${kp}${i}`} className="wt-arrow" points={pts} />;
	});

	return (
		<div className="wt-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newGame(diffKey)} onDaily={startDaily} />

			{daily ? (
				<>
					<div className="wt-daily-tag">{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}</div>
					<div className="wt-status">
						<span className="wt-theme">🎯 {puzzle.theme}</span>
						<span className="wt-count">{found.length}/{total}</span>
						<span className="wt-time">⏱ {fmtCentis(elapsed)}</span>
					</div>
				</>
			) : (
				<>
					<div className="wt-bar">
						<div className="wt-pills" role="tablist" aria-label="Difficulté">
							{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
								<button key={k} role="tab" aria-selected={diffKey === k} className={`wt-pill ${diffKey === k ? 'active' : ''}`} onClick={() => newGame(k)}>{DIFFS[k].label}</button>
							))}
						</div>
						<button className="wt-act" onClick={() => newGame(diffKey)}>↻ Nouvelle grille</button>
					</div>
					<div className="wt-status">
						<span className="wt-theme">🎯 {puzzle.theme}</span>
						<span className="wt-count">{found.length}/{total}</span>
					</div>
				</>
			)}

			<div className="wt-playwrap">
				{celebrating && <Celebration />}
				<div className={`wt-board ${armed ? 'blurred' : ''}`} style={{ aspectRatio: `${puzzle.cols} / ${puzzle.rows}`, ['--cols' as string]: puzzle.cols }}>
					{/* layer 1: neutral tiles (interactive) */}
					<div
						ref={boardRef}
						className="wt-cells"
						style={{ gridTemplateColumns: `repeat(${puzzle.cols}, 1fr)`, gridTemplateRows: `repeat(${puzzle.rows}, 1fr)` }}
						onPointerDown={onDown}
						onPointerMove={onMove}
						onPointerUp={onUp}
						onPointerCancel={onUp}
					>
						{puzzle.letters.map((row, r) => row.map((ch, c) => <div key={ckey(r, c)} className={`wt-cell${ch === '' ? ' wall' : ''}`} />))}
					</div>
					{/* layer 2: a rounded colour TUBE per found word (+ the live trace), with direction arrows */}
					<svg className="wt-tubes" viewBox={`0 0 ${puzzle.cols} ${puzzle.rows}`} preserveAspectRatio="none" aria-hidden="true">
						{found.map((i) => <polyline key={`t${i}`} className="wt-tube" points={pts(puzzle.regions[i].cells)} stroke={wordColor(i)} />)}
						{trace.length > 1 && <polyline className="wt-tube wt-tube-live" points={pts(trace)} />}
						{found.map((i) => <g key={`a${i}`}>{arrows(puzzle.regions[i].cells, `f${i}_`)}</g>)}
						{trace.length > 1 && <g>{arrows(trace, 'live_')}</g>}
					</svg>
					{/* layer 3: letters on top */}
					<div className="wt-letters" style={{ gridTemplateColumns: `repeat(${puzzle.cols}, 1fr)`, gridTemplateRows: `repeat(${puzzle.rows}, 1fr)` }} aria-hidden="true">
						{puzzle.letters.map((row, r) => row.map((ch, c) => {
							const k = ckey(r, c);
							return <div key={k} className={`wt-letter${cellColor.has(k) || traceSet.has(k) ? ' on' : ''}`}>{ch}</div>;
						}))}
					</div>
				</div>

				{daily && dailyLoading && <div className="wt-overlay"><div className="wt-overlay-card">Préparation du défi…</div></div>}
				{armed && !dailyLoading && status !== 'won' && (
					<div className="wt-overlay"><div className="wt-overlay-card start">
						<h3>Prêt&nbsp;?</h3>
						<p>Le chrono démarre dès que tu commences.</p>
						<button className="wt-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div></div>
				)}
			</div>

			<div className="wt-slots">
				{found.map((i) => (
					<span key={`f${i}`} className="wt-slot done" style={{ background: wordColor(i), borderColor: wordColor(i) }}>{puzzle.regions[i].word}</span>
				))}
				{remainingLengths.map((len, j) => (
					<span key={`r${j}`} className="wt-slot">{'•'.repeat(len)}</span>
				))}
			</div>

			<div className="wt-controls">
				<button className="wt-btn" onClick={undo} disabled={!found.length || status === 'won'}>↶ Annuler</button>
				{!daily && <button className="wt-btn" onClick={() => newGame(diffKey)}>↻ Nouvelle grille</button>}
			</div>

			{daily && status === 'won' && (
				<div className="wt-won">{alreadyPlayed
					? <>Défi du jour déjà relevé · <strong>{fmtCentis(elapsed)}</strong> — reviens demain&nbsp;!</>
					: <>🎉 Grille pavée en <strong>{fmtCentis(elapsed)}</strong>&nbsp;!</>}</div>
			)}
			{!daily && status === 'won' && (
				<div className="wt-won">🎉 Grille pavée&nbsp;! <button className="wt-replay" onClick={() => newGame(diffKey)}>Nouvelle grille</button></div>
			)}

			<p className="wt-help">
				{daily
					? 'Trace chaque mot du thème en reliant des lettres voisines (haut/bas/gauche/droite) — les chemins pavent toute la grille. Le plus vite possible !'
					: 'Trace chaque mot du thème en reliant des lettres voisines (haut/bas/gauche/droite). Les points en dessous donnent la longueur de chaque mot restant ; les chemins pavent toute la grille.'}
			</p>

			{daily && <Leaderboard game={gameId} metric="time" submitValue={status === 'won' && !alreadyPlayed ? elapsed : undefined} />}
			{!daily && <LeaderboardCorner game={gameId} metric="time" />}
		</div>
	);
}

const CSS = `
.wt-root { --wt: var(--accent-regular); width: 100%; max-width: 460px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.game-page.gf-full .wt-root { max-width: none; width: 100%; height: 100%; justify-content: center; }
.game-page.gf-full .wt-help { display: none; }
.wt-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.6rem; }
.wt-bar { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
.wt-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.wt-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.wt-pill.active { background: var(--wt); color: var(--accent-text-over); border-color: var(--wt); }
.wt-act { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.wt-act:hover { background: var(--gray-800); border-color: var(--wt); color: var(--wt); }
.wt-status { display: flex; gap: 0.5rem; align-items: center; font-weight: 700; font-size: 13px; margin-bottom: 0.7rem; }
.wt-theme { background: var(--wt); color: var(--accent-text-over); border-radius: 999px; padding: 5px 12px; }
.wt-count, .wt-time { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; font-variant-numeric: tabular-nums; }
.wt-playwrap { width: 100%; position: relative; display: flex; justify-content: center; }
.wt-board { position: relative; width: 100%; max-width: 440px; container-type: inline-size; }
.wt-board.blurred { filter: blur(5px); opacity: 0.5; pointer-events: none; }
/* layer 1 — neutral tiles (interactive) */
.wt-cells { position: absolute; inset: 0; z-index: 0; display: grid; gap: 3px; background: var(--gray-800); border: 2px solid var(--gray-800); border-radius: 12px; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; }
.wt-cell { background: var(--gray-999); border-radius: 3px; }
.wt-cell.wall { background: var(--gray-800); } /* blends with the grid lines → looks empty */
/* layer 2 — rounded colour tubes */
.wt-tubes { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
.wt-tube { fill: none; stroke-width: 0.74; stroke-linecap: round; stroke-linejoin: round; }
.wt-tube-live { stroke: var(--wt); opacity: 0.9; }
.wt-arrow { fill: rgba(255,255,255,0.95); stroke: rgba(0,0,0,0.22); stroke-width: 0.03; }
/* layer 3 — letters on top */
.wt-letters { position: absolute; inset: 0; z-index: 2; display: grid; gap: 3px; border: 2px solid transparent; pointer-events: none; }
.wt-letter { display: flex; align-items: center; justify-content: center; color: var(--gray-0); font-weight: 700; font-size: calc(100cqi / var(--cols) * 0.44); text-transform: uppercase; }
.wt-letter.on { color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.4); }
.wt-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; }
.wt-overlay-card { background: var(--gray-999); border: 2px solid var(--wt); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); color: var(--gray-300); text-align: center; }
.wt-overlay-card.start h3 { margin: 0 0 0.4rem; font-family: var(--font-brand); color: var(--gray-0); font-size: var(--text-xl); }
.wt-overlay-card.start p { margin: 0 0 0.8rem; font-size: 13px; }
.wt-startbtn { border: none; background: var(--wt); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 17px; border-radius: 999px; padding: 12px 34px; cursor: pointer; box-shadow: var(--shadow-lg); }
.wt-slots { display: flex; flex-wrap: wrap; gap: 6px 8px; justify-content: center; margin-top: 1rem; }
.wt-slot { font-weight: 700; font-size: 13.5px; letter-spacing: 1px; color: var(--gray-400); background: var(--gray-900); border: 1.5px solid var(--gray-800); border-radius: 999px; padding: 4px 12px; min-width: 2.2rem; text-align: center; }
.wt-slot.done { color: #fff; letter-spacing: 0.5px; }
.wt-controls { display: flex; gap: 8px; margin-top: 0.8rem; flex-wrap: wrap; justify-content: center; }
.wt-btn { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13.5px; border-radius: 999px; padding: 8px 16px; cursor: pointer; }
.wt-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.wt-won { text-align: center; font-size: 16px; color: var(--gray-0); margin-top: 1rem; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.wt-won strong { color: var(--wt); font-variant-numeric: tabular-nums; }
.wt-replay { border: none; background: var(--wt); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 24px; cursor: pointer; }
.wt-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1rem; }
`;
