import { useState, useEffect, useRef, useCallback } from 'react';
import { makeGrid, lineCells, matchIndex, DIFFS, type Grid, type Cell } from './engine';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   MOTS MÊLÉS — React island. Grille de lettres, mots d'un thème à retrouver en glissant.
   Libre : nouvelle grille à volonté. Défi du jour : même grille pour tous, au chrono.
   Moteur pur/testé dans ./engine.
   ===================================================== */

type Status = 'playing' | 'won';
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const ckey = (r: number, c: number) => `${r},${c}`;
// A distinct colour per found word (readable with white text, works in light & dark).
const WORD_COLORS = ['#e0484d', '#e07a2f', '#c99a1e', '#37a05a', '#2f9bb0', '#4a7fe0', '#8a5cf0', '#c94f97', '#6a9e34', '#b0563a', '#3aa090'];
const wordColor = (i: number) => WORD_COLORS[i % WORD_COLORS.length];

interface DailyState { found: number[]; }

export default function MotsMelesGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [grid, setGrid] = useState<Grid>(() => makeGrid(1, DIFFS.facile));
	const [found, setFound] = useState<number[]>([]);
	const [sel, setSel] = useState<Cell[]>([]);
	const [status, setStatus] = useState<Status>('playing');
	// Daily
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [started, setStarted] = useState(false);
	const [elapsed, setElapsed] = useState(0);

	const boardRef = useRef<HTMLDivElement | null>(null);
	const drawing = useRef(false);
	const startCellRef = useRef<Cell | null>(null);
	const selRef = useRef<Cell[]>([]);
	const startedRef = useRef(false); // free-mode "first find" flag
	const startRef = useRef(0); // daily chrono start (epoch ms)
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);

	const { celebrating } = useCelebration(status === 'won');
	const armed = daily && !started;
	const total = grid.words.length;

	/* Daily chrono. */
	useEffect(() => {
		if (!daily || !started || status !== 'playing') return;
		const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 250);
		return () => clearInterval(id);
	}, [daily, started, status]);

	const applySel = (cells: Cell[]) => { selRef.current = cells; setSel(cells); };

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		setDaily(false);
		setStarted(false);
		setAlreadyPlayed(false);
		setDiffKey(key);
		setElapsed(0);
		startedRef.current = false;
		setGrid(makeGrid((Math.random() * 2 ** 31) >>> 0, DIFFS[key]));
		setFound([]); applySel([]);
		setStatus('playing');
	}, []);

	const startDaily = useCallback(async () => {
		setDaily(true);
		applySel([]);
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const di = run.diffIndex ?? 0;
			const key = DIFF_ORDER[di] ?? 'facile';
			dailySeedRef.current = { seed: run.seed, diffIndex: di };
			setDailyLoading(false);
			setDiffKey(key);
			setGrid(makeGrid(run.seed, DIFFS[key]));
			const st = (run.state as DailyState) ?? { found: [] };
			setFound(st.found ?? []);
			setStarted(true);
			if (run.done) { setStatus('won'); setAlreadyPlayed(true); setElapsed(run.finalTime ?? 0); }
			else { setStatus('playing'); setAlreadyPlayed(false); startRef.current = run.startedAt; setElapsed(Math.floor((Date.now() - run.startedAt) / 1000)); }
			return;
		}
		setAlreadyPlayed(false);
		setStatus('playing');
		setStarted(false);
		setFound([]);
		setElapsed(0);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		const key = DIFF_ORDER[diffIndex] ?? 'facile';
		dailySeedRef.current = { seed, diffIndex };
		setDiffKey(key);
		setGrid(makeGrid(seed, DIFFS[key]));
		setDailyLoading(false);
	}, [gameId]);

	const startTimer = useCallback(() => {
		const now = Date.now();
		startRef.current = now;
		setStarted(true);
		setElapsed(0);
		trackGame(gameId, 'game_started');
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, { startedAt: now, done: false, seed: sd?.seed, diffIndex: sd?.diffIndex, state: { found: [] } satisfies DailyState });
	}, [gameId]);

	const markFound = (idx: number) => {
		if (found.includes(idx)) return;
		const nf = [...found, idx];
		setFound(nf);
		const complete = nf.length === grid.words.length;
		if (daily) {
			const sd = dailySeedRef.current;
			const finalTime = complete ? Math.floor((Date.now() - startRef.current) / 1000) : undefined;
			saveDailyRun(gameId, { startedAt: startRef.current, done: complete, finalTime, seed: sd?.seed, diffIndex: sd?.diffIndex, state: { found: nf } satisfies DailyState });
			if (complete) { setElapsed(finalTime!); setStatus('won'); trackGame(gameId, 'game_won'); }
		} else {
			if (!startedRef.current) { startedRef.current = true; trackGame(gameId, 'game_started'); }
			if (complete) { setStatus('won'); trackGame(gameId, 'game_won'); }
		}
	};

	/* ---------- Pointer: drag a straight line across letters ---------- */
	const cellFromPointer = (e: React.PointerEvent): Cell | null => {
		const board = boardRef.current;
		if (!board) return null;
		const rect = board.getBoundingClientRect();
		const n = grid.size;
		const c = Math.floor(((e.clientX - rect.left) / rect.width) * n);
		const r = Math.floor(((e.clientY - rect.top) / rect.height) * n);
		if (r < 0 || r >= n || c < 0 || c >= n) return null;
		return [r, c];
	};
	const onDown = (e: React.PointerEvent) => {
		if (armed || status !== 'playing') return;
		const cell = cellFromPointer(e);
		if (!cell) return;
		drawing.current = true;
		startCellRef.current = cell;
		applySel([cell]);
		boardRef.current?.setPointerCapture(e.pointerId);
		e.preventDefault();
	};
	const onMove = (e: React.PointerEvent) => {
		if (!drawing.current || !startCellRef.current) return;
		const cell = cellFromPointer(e);
		if (!cell) return;
		const line = lineCells(startCellRef.current, cell, grid.size);
		if (line) applySel(line);
	};
	const onUp = () => {
		if (!drawing.current) return;
		drawing.current = false;
		const s = selRef.current;
		applySel([]);
		if (s.length < 2) return;
		const idx = matchIndex(s, grid.words);
		if (idx >= 0) markFound(idx);
	};

	useEffect(() => { newGame('facile'); }, [newGame]);

	const cellColor = new Map<string, string>(); // found cell → its word's colour (overlaps: last found wins)
	for (const i of found) for (const [r, c] of grid.words[i].cells) cellColor.set(ckey(r, c), wordColor(i));
	const selSet = new Set(sel.map(([r, c]) => ckey(r, c)));

	return (
		<div className="mm-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newGame(diffKey)} onDaily={startDaily} />

			{daily ? (
				<>
					<div className="mm-daily-tag">
						{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
					</div>
					<div className="mm-status">
						<span className="mm-theme">🔎 {grid.theme}</span>
						<span className="mm-count">{found.length}/{total}</span>
						<span className="mm-time">⏱ {fmtTime(elapsed)}</span>
					</div>
				</>
			) : (
				<div className="mm-bar">
					<div className="mm-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button key={k} role="tab" aria-selected={diffKey === k} className={`mm-pill ${diffKey === k ? 'active' : ''}`} onClick={() => newGame(k)}>
								{DIFFS[k].label}
							</button>
						))}
					</div>
					<button className="mm-act" onClick={() => newGame(diffKey)}>↻ Nouvelle grille</button>
				</div>
			)}

			{!daily && (
				<div className="mm-status">
					<span className="mm-theme">🔎 {grid.theme}</span>
					<span className="mm-count">{found.length}/{total}</span>
				</div>
			)}

			<div className="mm-playwrap">
				{celebrating && <Celebration />}
				<div
					ref={boardRef}
					className={`mm-grid ${armed ? 'blurred' : ''}`}
					style={{ gridTemplateColumns: `repeat(${grid.size}, 1fr)`, ['--n' as string]: grid.size }}
					onPointerDown={onDown}
					onPointerMove={onMove}
					onPointerUp={onUp}
					onPointerCancel={onUp}
				>
					{grid.letters.map((row, r) => row.map((ch, c) => {
						const k = ckey(r, c);
						const inSel = selSet.has(k);
						const col = inSel ? undefined : cellColor.get(k); // selection (accent) takes visual priority
						return <div key={k} className={`mm-cell${col ? ' found' : ''}${inSel ? ' sel' : ''}`} style={col ? { background: col } : undefined}>{ch}</div>;
					}))}
				</div>

				{daily && dailyLoading && <div className="mm-overlay"><div className="mm-overlay-card">Préparation du défi…</div></div>}
				{armed && !dailyLoading && status !== 'won' && (
					<div className="mm-overlay"><button className="mm-startbtn" onClick={startTimer}>▶ Commencer</button></div>
				)}
			</div>

			<div className="mm-words">
				{grid.words.map((w, i) => {
					const isF = found.includes(i);
					return <span key={i} className={`mm-word ${isF ? 'done' : ''}`} style={isF ? { background: wordColor(i), borderColor: wordColor(i), color: '#fff' } : undefined}>{w.word}</span>;
				})}
			</div>

			{daily && status === 'won' && (
				<div className="mm-won">
					{alreadyPlayed
						? <>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
						: <>🎉 Tous les mots trouvés en <strong>{fmtTime(elapsed)}</strong></>}
				</div>
			)}
			{!daily && status === 'won' && (
				<div className="mm-won">🎉 Grille terminée&nbsp;! <button className="mm-replay" onClick={() => newGame(diffKey)}>Nouvelle grille</button></div>
			)}

			{!daily && (
				<p className="mm-help">Glisse sur les lettres pour surligner un mot de la liste (horizontal, vertical, diagonale — et à l'envers dès le moyen). Chaque mot trouvé a sa couleur. Trouve-les tous&nbsp;!</p>
			)}
			{daily && status === 'playing' && (
				<p className="mm-help">Retrouve tous les mots le plus vite possible. Glisse sur les lettres pour surligner.</p>
			)}

			{daily && <Leaderboard game={gameId} metric="time" submitValue={status === 'won' && !alreadyPlayed ? elapsed : undefined} />}
			{!daily && <LeaderboardCorner game={gameId} metric="time" />}
		</div>
	);
}

const CSS = `
.mm-root { --mm-accent: var(--accent-regular); --mm-ok: #2f9e6f; width: 100%; max-width: 460px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.mm-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.6rem; }
.mm-bar { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
.mm-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.mm-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition); }
.mm-pill.active { background: var(--mm-accent); color: var(--accent-text-over); border-color: var(--mm-accent); }
.mm-act { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.mm-act:hover { background: var(--gray-800); border-color: var(--mm-accent); color: var(--mm-accent); }
.mm-status { display: flex; gap: 0.5rem; align-items: center; font-weight: 700; font-size: 13px; margin-bottom: 0.75rem; }
.mm-theme { background: var(--mm-accent); color: var(--accent-text-over); border-radius: 999px; padding: 5px 12px; }
.mm-count, .mm-time { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; font-variant-numeric: tabular-nums; }
.mm-playwrap { width: 100%; position: relative; display: flex; justify-content: center; }
.mm-grid { width: 100%; max-width: 460px; aspect-ratio: 1; display: grid; gap: 2px; container-type: inline-size; background: var(--gray-800); border: 2px solid var(--gray-800); border-radius: 12px; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; }
.mm-cell { display: flex; align-items: center; justify-content: center; background: var(--gray-999); color: var(--gray-0); font-weight: 700; font-size: calc(100cqi / var(--n) * 0.5); text-transform: uppercase; }
.mm-cell.found { color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.4); } /* background = per-word colour (inline) */
.mm-cell.sel { background: var(--mm-accent); color: var(--accent-text-over); }
.mm-grid.blurred { filter: blur(5px); opacity: 0.5; pointer-events: none; }
.mm-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; }
.mm-overlay-card { background: var(--gray-999); border: 2px solid var(--mm-accent); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); color: var(--gray-300); }
.mm-startbtn { border: none; background: var(--mm-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg); }
.mm-words { display: flex; flex-wrap: wrap; gap: 6px 10px; justify-content: center; margin-top: 1rem; }
.mm-word { font-weight: 700; font-size: 13.5px; letter-spacing: 0.5px; color: var(--gray-0); background: var(--gray-900); border: 1px solid var(--gray-800); border-radius: 999px; padding: 4px 11px; }
.mm-word.done { color: #fff; text-decoration: none; } /* background/border = per-word colour (inline) */
.mm-won { text-align: center; font-size: 16px; color: var(--gray-0); margin-top: 1.25rem; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.mm-won strong { color: var(--mm-accent); font-variant-numeric: tabular-nums; }
.mm-replay { border: none; background: var(--mm-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 24px; cursor: pointer; }
.mm-help { max-width: 400px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.1rem; }
`;
