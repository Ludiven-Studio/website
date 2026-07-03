import { useState, useEffect, useRef, useCallback } from 'react';
import {
	DIFFS,
	DIFF_ORDER,
	makeStream,
	createBoard,
	move,
	isGameOver,
	hasWon,
	type Dir,
	type Board,
	type State,
	type DiffKey,
} from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   2048 — turn-based React island (no rAF; move on input).
   Libre : graine aléatoire, record local par taille.
   Défi du jour : graine partagée, UN seul essai, reprise en cours.
   Engine is pure/tested.
   ===================================================== */

type Status = 'playing' | 'over';
const DEFAULT_DIFF: DiffKey = 'moyen';
const freeBestKey = (key: DiffKey): string => `ludiven-2048-best-${key}`;

interface DailyState {
	board: Board;
	score: number;
	cursor: number;
}

// One dark, saturated, well-separated colour per value (theme-independent), white number on top.
const TILE_BG: Record<number, string> = {
	2: '#4a6fa5', // steel blue
	4: '#2f8f86', // teal
	8: '#3f9147', // green
	16: '#8a9330', // olive
	32: '#b5872c', // gold
	64: '#c26a2c', // orange
	128: '#bb4530', // brick
	256: '#b23052', // rose
	512: '#9a3a9c', // purple
	1024: '#5a4fb5', // indigo
	2048: '#c0357f', // magenta
};
const tileBg = (v: number): string => (v >= 4096 ? '#3b4252' : TILE_BG[v] ?? '#4a6fa5');

export default function Game2048({ gameId }: { gameId: string }) {
	const [board, setBoard] = useState<Board>([]);
	const [score, setScore] = useState(0);
	const [best, setBest] = useState(0);
	const [diffKey, setDiffKey] = useState<DiffKey>(DEFAULT_DIFF);
	const [status, setStatus] = useState<Status>('playing');
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [started, setStarted] = useState(true); // free starts immediately; daily arms behind "Commencer"
	const [alreadyPlayed, setAlreadyPlayed] = useState(false); // daily already finished today (locked)
	const [won, setWon] = useState(false);

	const stateRef = useRef<State | null>(null);
	const streamRef = useRef<number[] | null>(null);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const startedAtRef = useRef(0);
	const touchRef = useRef<{ x: number; y: number } | null>(null);
	// Mirrors read by the stable keydown listener (avoid stale closures).
	const statusRef = useRef<Status>('playing');
	const startedRef = useRef(true);
	const dailyRef = useRef(false);
	const alreadyRef = useRef(false);
	const loadingRef = useRef(false);
	const bestRef = useRef(0);
	const diffKeyRef = useRef<DiffKey>(DEFAULT_DIFF);
	const wonRef = useRef(false);

	const { celebrating } = useCelebration(won);
	const size = board.length || DIFFS[diffKey].size;
	const armed = daily && !started;

	const sync = (): void => {
		const s = stateRef.current;
		if (!s) return;
		setBoard(s.board.map((row) => row.slice()));
		setScore(s.score);
	};
	const setStat = (v: Status): void => {
		statusRef.current = v;
		setStatus(v);
	};

	const persistDaily = (done: boolean): void => {
		const s = stateRef.current;
		const sd = dailySeedRef.current;
		if (!s) return;
		saveDailyRun(gameId, {
			startedAt: startedAtRef.current,
			done,
			finalTime: done ? s.score : undefined,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { board: s.board, score: s.score, cursor: s.cursor } satisfies DailyState,
		});
	};

	const commitFreeBest = (sc: number): void => {
		if (sc > bestRef.current) {
			bestRef.current = sc;
			setBest(sc);
			try {
				localStorage.setItem(freeBestKey(diffKeyRef.current), String(sc));
			} catch {
				/* ignore */
			}
		}
	};

	const applyMove = useCallback(
		(dir: Dir) => {
			if (dailyRef.current && !startedRef.current) return; // armed, waiting for "Commencer"
			if (statusRef.current !== 'playing' || alreadyRef.current || loadingRef.current) return;
			const s = stateRef.current;
			const stream = streamRef.current;
			if (!s || !stream) return;
			const res = move(s, dir, stream);
			if (!res.moved) return;
			stateRef.current = res.state;
			sync();
			if (dailyRef.current) persistDaily(false);
			else commitFreeBest(res.state.score);
			if (!wonRef.current && hasWon(res.state)) {
				wonRef.current = true;
				setWon(true);
				trackGame(gameId, 'game_won');
			}
			if (isGameOver(res.state)) {
				setStat('over');
				trackGame(gameId, 'game_over');
				if (dailyRef.current) persistDaily(true);
			}
			// eslint-disable-next-line react-hooks/exhaustive-deps
		},
		[gameId],
	);

	const armFree = useCallback((key: DiffKey) => {
		dailyRef.current = false;
		setDaily(false);
		alreadyRef.current = false;
		setAlreadyPlayed(false);
		loadingRef.current = false;
		setDailyLoading(false);
		startedRef.current = true;
		setStarted(true);
		wonRef.current = false;
		setWon(false);
		setStat('playing');
		diffKeyRef.current = key;
		setDiffKey(key);
		const stream = makeStream(mulberry32((Math.random() * 2 ** 31) >>> 0));
		streamRef.current = stream;
		stateRef.current = createBoard(DIFFS[key].size, stream);
		sync();
		let b = 0;
		try {
			b = Number(localStorage.getItem(freeBestKey(key))) || 0;
		} catch {
			/* ignore */
		}
		bestRef.current = b;
		setBest(b);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const startDaily = useCallback(async () => {
		dailyRef.current = true;
		setDaily(true);
		wonRef.current = false;
		setWon(false);
		const run = loadDailyRun(gameId);
		if (run && run.seed != null && run.state) {
			const diffIndex = run.diffIndex ?? 0;
			const key = DIFF_ORDER[diffIndex] ?? DEFAULT_DIFF;
			dailySeedRef.current = { seed: run.seed, diffIndex };
			diffKeyRef.current = key;
			setDiffKey(key);
			streamRef.current = makeStream(mulberry32(run.seed));
			const st = run.state as DailyState;
			stateRef.current = { board: st.board, score: st.score, size: st.board.length, cursor: st.cursor };
			startedAtRef.current = run.startedAt;
			sync();
			startedRef.current = true;
			setStarted(true);
			loadingRef.current = false;
			setDailyLoading(false);
			if (run.done) {
				alreadyRef.current = true;
				setAlreadyPlayed(true);
				setStat('over');
				setScore(run.finalTime ?? st.score);
			} else {
				alreadyRef.current = false;
				setAlreadyPlayed(false);
				setStat('playing');
			}
			return;
		}
		// Fresh daily: fetch today's seed and arm behind the "Commencer" gate.
		alreadyRef.current = false;
		setAlreadyPlayed(false);
		startedRef.current = false;
		setStarted(false);
		setStat('playing');
		loadingRef.current = true;
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		const key = DIFF_ORDER[diffIndex] ?? DEFAULT_DIFF;
		dailySeedRef.current = { seed, diffIndex };
		diffKeyRef.current = key;
		setDiffKey(key);
		const stream = makeStream(mulberry32(seed));
		streamRef.current = stream;
		stateRef.current = createBoard(DIFFS[key].size, stream);
		sync();
		loadingRef.current = false;
		setDailyLoading(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gameId]);

	const startTimer = useCallback(() => {
		startedAtRef.current = Date.now();
		startedRef.current = true;
		setStarted(true);
		trackGame(gameId, 'game_started');
		persistDaily(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gameId]);

	/* Keyboard: arrows + ZQSD/WASD. */
	useEffect(() => {
		const KEYS: Record<string, Dir> = {
			ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
			w: 'up', s: 'down', a: 'left', d: 'right', z: 'up', q: 'left',
		};
		const onKey = (e: KeyboardEvent): void => {
			const dir = KEYS[e.key];
			if (dir) {
				e.preventDefault();
				applyMove(dir);
			}
		};
		window.addEventListener('keydown', onKey, { passive: false });
		return () => window.removeEventListener('keydown', onKey);
	}, [applyMove]);

	/* Mount: arm a free game. */
	useEffect(() => {
		armFree(DEFAULT_DIFF);
	}, [armFree]);

	// Pointer swipe (mouse, touch, pen) — one drag = one move in the dominant axis.
	const onPointerDown = (e: React.PointerEvent): void => {
		touchRef.current = { x: e.clientX, y: e.clientY };
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	};
	const onPointerUp = (e: React.PointerEvent): void => {
		const s0 = touchRef.current;
		if (!s0) return;
		const dx = e.clientX - s0.x;
		const dy = e.clientY - s0.y;
		touchRef.current = null;
		if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return; // click/tap, not a swipe
		applyMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
	};

	return (
		<div className="g2-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => armFree(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="g2-daily-tag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label} ${size}×${size}`}
				</div>
			) : (
				<div className="g2-bar">
					<div className="g2-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as DiffKey[]).map((k) => (
							<button key={k} role="tab" aria-selected={diffKey === k} className={`g2-pill ${diffKey === k ? 'active' : ''}`} onClick={() => armFree(k)}>
								{DIFFS[k].size}×{DIFFS[k].size}
							</button>
						))}
					</div>
					<button className="g2-act" onClick={() => armFree(diffKey)}>↻ Nouvelle partie</button>
				</div>
			)}

			<div className="g2-status">
				<span className="g2-score">Score <strong>{score}</strong></span>
				{!daily && <span className="g2-best">Record <strong>{best}</strong></span>}
			</div>

			<div className="g2-playwrap">
				{celebrating && <Celebration />}
				<div
					className={`g2-grid ${armed ? 'blurred' : ''}`}
					style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, gridTemplateRows: `repeat(${size}, 1fr)`, ['--n' as string]: size }}
					onPointerDown={onPointerDown}
					onPointerUp={onPointerUp}
				>
					{Array.from({ length: size * size }).map((_, i) => {
						const v = board[Math.floor(i / size)]?.[i % size] ?? 0;
						const cls = v >= 1024 ? ' xsmall' : v >= 128 ? ' small' : '';
						return (
							<div key={i} className={`g2-cell${v ? ' filled' : ''}${cls}`} style={v ? { background: tileBg(v) } : undefined}>
								{v || ''}
							</div>
						);
					})}
				</div>

				{daily && dailyLoading && <div className="g2-overlay"><div className="g2-overlay-card">Préparation du défi…</div></div>}
				{armed && !dailyLoading && <div className="g2-overlay"><button className="g2-startbtn" onClick={startTimer}>▶ Commencer</button></div>}
				{status === 'over' && (
					<div className="g2-overlay">
						<div className="g2-overlay-card g2-over">
							{daily ? (
								alreadyPlayed
									? <>Défi du jour terminé · <strong>{score}</strong><span>reviens demain&nbsp;!</span></>
									: <>🎉 Terminé · <strong>{score}</strong><span>reviens demain pour un nouveau défi</span></>
							) : (
								<>Perdu ! · <strong>{score}</strong><button className="g2-replay" onClick={() => armFree(diffKey)}>Rejouer</button></>
							)}
						</div>
					</div>
				)}
			</div>

			<p className="g2-help">
				Flèches ou ZQSD au clavier, ou glisse le doigt : les tuiles identiques fusionnent. Atteins 2048, puis pousse ton score&nbsp;!
			</p>

			{daily && <Leaderboard game={gameId} metric="score" submitValue={status === 'over' && !alreadyPlayed ? score : undefined} />}
			{!daily && <LeaderboardCorner game={gameId} metric="score" />}
		</div>
	);
}

const CSS = `
.g2-root { --g2-accent: var(--accent-regular); width: 100%; max-width: 460px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.g2-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.6rem; }
.g2-bar { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
.g2-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.g2-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition); }
.g2-pill.active { background: var(--g2-accent); color: var(--accent-text-over); border-color: var(--g2-accent); }
.g2-act { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.g2-act:hover { background: var(--gray-800); border-color: var(--g2-accent); color: var(--g2-accent); }
.g2-status { display: flex; gap: 0.75rem; align-items: center; font-weight: 600; font-size: 14px; margin-bottom: 0.75rem; }
.g2-score, .g2-best { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px; font-variant-numeric: tabular-nums; }
.g2-score strong, .g2-best strong { color: var(--g2-accent); margin-left: 4px; }
.g2-playwrap { width: 100%; position: relative; display: flex; justify-content: center; }
.g2-grid { width: 100%; max-width: 460px; aspect-ratio: 1; display: grid; gap: 2.2%; container-type: inline-size; background: var(--gray-800); border: 2px solid var(--gray-800); border-radius: 12px; padding: 2.2%; touch-action: none; user-select: none; -webkit-user-select: none; }
.g2-cell { display: flex; align-items: center; justify-content: center; min-width: 0; overflow: hidden; background: var(--gray-900); color: #fff; font-weight: 800; font-size: calc(100cqi / var(--n) * 0.42); border-radius: 8px; font-variant-numeric: tabular-nums; }
.g2-cell.small { font-size: calc(100cqi / var(--n) * 0.32); }
.g2-cell.xsmall { font-size: calc(100cqi / var(--n) * 0.24); }
.g2-cell.filled { color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.35); box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
.g2-grid.blurred { filter: blur(5px); opacity: 0.5; pointer-events: none; }
.g2-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; }
.g2-overlay-card { background: var(--gray-999); border: 2px solid var(--g2-accent); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); color: var(--gray-300); text-align: center; }
.g2-over { display: flex; flex-direction: column; gap: 8px; align-items: center; font-size: 16px; color: var(--gray-0); }
.g2-over strong { color: var(--g2-accent); font-size: 22px; font-variant-numeric: tabular-nums; }
.g2-over span { color: var(--gray-300); font-size: 13px; }
.g2-startbtn { border: none; background: var(--g2-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg); }
.g2-replay { border: none; background: var(--g2-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 9px 22px; cursor: pointer; margin-top: 4px; }
.g2-help { max-width: 400px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.1rem; }
`;
