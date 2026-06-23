import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
	SIZES,
	generateHunt,
	segType,
	sonarCount,
	isSunk,
	isWon,
	type HuntPuzzle,
	type SegType,
	type Shot,
} from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import {
	getDaily,
	dailyWeekdayLabel,
	dailyDifficultyIndex,
	loadDailyRun,
	saveDailyRun,
	type DailyRun,
} from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   BATAILLE NAVALE — chasse à la flotte. React island.
   Tire (touché/manqué), coule les navires ; quelques
   sonars révèlent une zone 3×3. Score = tirs + sonars,
   le moins possible. Engine is pure/tested.
   ===================================================== */

type Status = 'playing' | 'won';
type DiffKey = keyof typeof SIZES;
const DIFF_ORDER: DiffKey[] = ['facile', 'moyen', 'difficile'];
const BEST_KEY = 'ludiven-bataille-best';

interface DailyHunt {
	shots: Shot[][];
	sonar: [string, number][];
	shotsUsed: number;
	sonarsUsed: number;
	done: boolean;
}

const emptyShots = (n: number): Shot[][] => Array.from({ length: n }, () => new Array<Shot>(n).fill(0));

const NBR8: [number, number][] = [
	[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
];

const SEG_CLASS: Record<NonNullable<SegType>, string> = {
	single: 'seg-single', left: 'seg-left', right: 'seg-right', top: 'seg-top',
	bottom: 'seg-bottom', 'mid-h': 'seg-midh', 'mid-v': 'seg-midv',
};

export default function BatailleGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<DiffKey>('facile');
	const [puzzle, setPuzzle] = useState<HuntPuzzle>(() => generateHunt(SIZES.facile));
	const [shots, setShots] = useState<Shot[][]>(() => emptyShots(SIZES.facile.size));
	const [sonarReveals, setSonarReveals] = useState<Record<string, number>>({});
	const [shotsUsed, setShotsUsed] = useState(0);
	const [sonarsUsed, setSonarsUsed] = useState(0);
	const [sonarMode, setSonarMode] = useState(false);
	const [status, setStatus] = useState<Status>('playing');
	const [best, setBest] = useState(0);
	const [started, setStarted] = useState(false);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const startedRef = useRef(false); // free-mode "first action" flag
	const startRef = useRef(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);

	const { size, fleet, sonars } = useMemo(
		() => ({ size: puzzle.size, fleet: puzzle.fleet, sonars: SIZES[diffKey].sonars }),
		[puzzle, diffKey],
	);
	const over = status === 'won';
	const cost = shotsUsed + sonarsUsed;
	const sonarsLeft = sonars - sonarsUsed;

	/* Sunk ships + a grid of revealed ship cells (sunk, or all on win) for segment rendering. */
	const { sunkGrid, sunkCount } = useMemo(() => {
		const grid: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
		let sunk = 0;
		for (let id = 0; id < fleet.length; id++) {
			const dead = over || isSunk(puzzle, shots, id);
			if (dead) sunk++;
			if (dead || over)
				for (let r = 0; r < size; r++)
					for (let c = 0; c < size; c++) if (puzzle.shipId[r][c] === id) grid[r][c] = true;
		}
		return { sunkGrid: grid, sunkCount: sunk };
	}, [puzzle, shots, over, size, fleet]);

	const newGame = useCallback((dk: DiffKey) => {
		const s = SIZES[dk];
		setDaily(false);
		setAlreadyPlayed(false);
		setDiffKey(dk);
		setPuzzle(generateHunt(s));
		setShots(emptyShots(s.size));
		setSonarReveals({});
		setShotsUsed(0);
		setSonarsUsed(0);
		setSonarMode(false);
		setStatus('playing');
		setStarted(false);
		startedRef.current = false;
		try {
			setBest(Number(localStorage.getItem(BEST_KEY) ?? '0') || 0);
		} catch {
			setBest(0);
		}
	}, []);

	/* Daily: one resumable attempt per device; server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setSonarMode(false);
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const di = run.diffIndex ?? dailyDifficultyIndex();
			const dk = DIFF_ORDER[di] ?? 'moyen';
			dailySeedRef.current = { seed: run.seed, diffIndex: di };
			const p = generateHunt(SIZES[dk], mulberry32(run.seed));
			const st = run.state as DailyHunt | undefined;
			setDailyLoading(false);
			setDiffKey(dk);
			setPuzzle(p);
			setShots(st?.shots ?? emptyShots(p.size));
			setSonarReveals(st ? Object.fromEntries(st.sonar) : {});
			setShotsUsed(st?.shotsUsed ?? 0);
			setSonarsUsed(st?.sonarsUsed ?? 0);
			setStarted(true);
			if (run.done) {
				setAlreadyPlayed(true);
				setStatus('won');
			} else {
				setAlreadyPlayed(false);
				setStatus('playing');
				startRef.current = run.startedAt;
			}
			return;
		}
		// Fresh: fetch today's seed and arm the board (Commencer not pressed yet).
		setAlreadyPlayed(false);
		setStatus('playing');
		setStarted(false);
		setShotsUsed(0);
		setSonarsUsed(0);
		setSonarReveals({});
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const dk = DIFF_ORDER[diffIndex] ?? 'moyen';
		const p = generateHunt(SIZES[dk], mulberry32(seed));
		setDiffKey(dk);
		setPuzzle(p);
		setShots(emptyShots(p.size));
		setDailyLoading(false);
	}, [gameId]);

	const { celebrating, showWin } = useCelebration(status === 'won');

	/* Commencer: consume the daily attempt. */
	const startTimer = useCallback(() => {
		startRef.current = Date.now();
		setStarted(true);
		trackGame(gameId, 'game_started');
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { shots: emptyShots(size), sonar: [], shotsUsed: 0, sonarsUsed: 0, done: false } satisfies DailyHunt,
		});
	}, [gameId, size]);

	const begin = useCallback(() => {
		if (daily) return; // daily starts via Commencer
		if (!startedRef.current) {
			startedRef.current = true;
			trackGame(gameId, 'game_started');
		}
	}, [daily, gameId]);

	/* Win detection. */
	useEffect(() => {
		if (over) return;
		if (daily && !started) return;
		if (isWon(puzzle, shots)) {
			setStatus('won');
			trackGame(gameId, 'game_won', { cost });
		}
	}, [shots, over, puzzle, daily, started, gameId, cost]);

	/* Persist the in-progress daily attempt. */
	useEffect(() => {
		if (!daily || !started || status === 'won') return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: {
				shots,
				sonar: Object.entries(sonarReveals).map(([k, v]) => [k, v] as [string, number]),
				shotsUsed,
				sonarsUsed,
				done: false,
			} satisfies DailyHunt,
		});
	}, [daily, started, status, shots, sonarReveals, shotsUsed, sonarsUsed, gameId]);

	/* Lock the daily on a fresh win + record free-mode best. */
	useEffect(() => {
		if (status !== 'won') return;
		if (daily) {
			if (alreadyPlayed) return;
			const sd = dailySeedRef.current;
			saveDailyRun(gameId, {
				startedAt: startRef.current,
				done: true,
				finalTime: cost,
				seed: sd?.seed,
				diffIndex: sd?.diffIndex,
				state: {
					shots,
					sonar: Object.entries(sonarReveals).map(([k, v]) => [k, v] as [string, number]),
					shotsUsed,
					sonarsUsed,
					done: true,
				} satisfies DailyHunt,
			});
		} else {
			setBest((prev) => {
				const nb = prev === 0 ? cost : Math.min(prev, cost);
				try {
					localStorage.setItem(BEST_KEY, String(nb));
				} catch {
					/* ignore */
				}
				return nb;
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [status]);

	/* Fire at a cell: hit/miss; sinking a ship floods the (always-water) cells around it. */
	const fire = useCallback(
		(r: number, c: number) => {
			if (over || (daily && !started) || shots[r][c] !== 0) return;
			begin();
			setShots((prev) => {
				const next = prev.map((row) => row.slice());
				next[r][c] = puzzle.ships[r][c] ? 1 : 2;
				if (puzzle.ships[r][c]) {
					const id = puzzle.shipId[r][c];
					const cells: [number, number][] = [];
					for (let rr = 0; rr < size; rr++)
						for (let cc = 0; cc < size; cc++) if (puzzle.shipId[rr][cc] === id) cells.push([rr, cc]);
					if (cells.every(([rr, cc]) => next[rr][cc] === 1)) {
						for (const [rr, cc] of cells)
							for (const [dr, dc] of NBR8) {
								const nr = rr + dr;
								const nc = cc + dc;
								if (nr >= 0 && nr < size && nc >= 0 && nc < size && next[nr][nc] === 0 && !puzzle.ships[nr][nc])
									next[nr][nc] = 2;
							}
					}
				}
				return next;
			});
			setShotsUsed((s) => s + 1);
		},
		[over, daily, started, shots, begin, puzzle, size],
	);

	/* Sonar: reveal the 3×3 ship-cell count at a cell (costs one sonar). */
	const sonar = useCallback(
		(r: number, c: number) => {
			if (over || (daily && !started) || sonarsLeft <= 0) return;
			begin();
			setSonarReveals((prev) => ({ ...prev, [`${r},${c}`]: sonarCount(puzzle.ships, r, c, size) }));
			setSonarsUsed((s) => s + 1);
			setSonarMode(false);
			trackGame(gameId, 'hint_used');
		},
		[over, daily, started, sonarsLeft, puzzle, size, begin, gameId],
	);

	const onCell = (r: number, c: number) => (sonarMode ? sonar(r, c) : fire(r, c));

	const armed = daily && !started;

	return (
		<div className="ba-root" style={{ ['--n' as string]: size }}>
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newGame(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="ba-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${SIZES[diffKey].label}`}
				</div>
			) : (
				<div className="ba-pills" role="tablist" aria-label="Difficulté">
					{DIFF_ORDER.map((k) => (
						<button
							key={k}
							role="tab"
							aria-selected={diffKey === k}
							className={`ba-pill ${diffKey === k ? 'active' : ''}`}
							onClick={() => newGame(k)}
						>
							{SIZES[k].label}
						</button>
					))}
				</div>
			)}

			<div className="ba-bar">
				<span className="ba-stat">🎯 {shotsUsed}</span>
				<span className="ba-stat sunk">🚢 {sunkCount}/{fleet.length}</span>
				<span className="ba-stat">🔊 {Math.max(0, sonarsLeft)}/{sonars}</span>
				{!daily && best > 0 && <span className="ba-stat best">★ {best}</span>}
			</div>

			{!over && (!daily || started) && (
				<div className="ba-actions">
					<button
						className={`ba-act ${sonarMode ? 'on' : ''}`}
						onClick={() => setSonarMode((v) => !v)}
						disabled={sonarsLeft <= 0}
						aria-pressed={sonarMode}
					>
						🔊 Sonar{sonarsLeft > 0 ? ` (${sonarsLeft})` : ' épuisé'}
					</button>
					{sonarMode && <span className="ba-hint">Clique une zone à sonder (3×3)</span>}
				</div>
			)}

			<div className="ba-boardwrap">
				{celebrating && <Celebration />}
				<div
					className={`ba-board ${armed ? 'blurred' : ''} ${sonarMode ? 'sonar' : ''}`}
					style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
				>
					{Array.from({ length: size }).map((_, r) =>
						Array.from({ length: size }).map((_, c) => {
							const sv = shots[r][c];
							const reveal = sonarReveals[`${r},${c}`];
							const isShipSeg = sunkGrid[r][c]; // sunk (or won) → draw ship segment
							const seg = isShipSeg ? segType(sunkGrid, r, c) : null;
							const hit = sv === 1 && !isShipSeg; // hit but not yet sunk
							const miss = sv === 2;
							const cls = [
								'ba-cell',
								isShipSeg ? 'ship' : '',
								seg ? SEG_CLASS[seg] : '',
								hit ? 'hit' : '',
								miss ? 'miss' : '',
								reveal !== undefined && sv === 0 ? 'sonarval' : '',
								over ? 'over' : '',
							].join(' ');
							return (
								<button
									key={`${r}-${c}`}
									className={cls}
									onClick={() => onCell(r, c)}
									disabled={over || armed}
									aria-label={`Ligne ${r + 1}, colonne ${c + 1}`}
								>
									{isShipSeg ? (
										<span className="ba-seg" />
									) : hit ? (
										'✸'
									) : miss ? (
										<span className="ba-dot" />
									) : reveal !== undefined ? (
										reveal
									) : (
										''
									)}
								</button>
							);
						}),
					)}
				</div>

				{daily && dailyLoading && (
					<div className="ba-overlay"><div className="ba-overlay-card">Préparation…</div></div>
				)}
				{armed && !dailyLoading && (
					<div className="ba-overlay">
						<button className="ba-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div>
				)}

				{showWin && !daily && (
					<div className="ba-win" role="dialog" aria-label="Flotte coulée">
						<div className="ba-wincard">
							<div className="ba-winmark">⚓</div>
							<h2>Flotte coulée !</h2>
							<p className="ba-wintime">{cost} coups</p>
							<p className="ba-windiff">{shotsUsed} tirs · {sonarsUsed} sonars</p>
							<button className="ba-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
						</div>
					</div>
				)}
			</div>

			{daily && status === 'won' && (
				<div className="ba-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{cost} coups</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Flotte coulée en <strong>{cost} coups</strong></>
					)}
				</div>
			)}

			{daily && (
				<Leaderboard
					game={gameId}
					metric="time"
					submitValue={status === 'won' ? cost : undefined}
					format={(v) => `${v} coups`}
				/>
			)}
			{!daily && <LeaderboardCorner game={gameId} metric="time" />}

			<p className="ba-help">
				Coule toute la flotte cachée en un minimum d'actions. Clique une case pour <strong>tirer</strong>{' '}
				(✸ touché, point = manqué) ; un navire entièrement touché est coulé (l'eau autour se dévoile).
				Le bouton <strong>Sonar</strong> révèle le nombre de cases-navire dans une zone 3×3. Score =
				tirs + sonars.
			</p>
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.ba-root {
  --ba-accent: var(--accent-regular);
  --ba-hit: #d9534f;
  --ba-ship: var(--gray-0);
  --ba-line: var(--gray-700);
  --ba-cell: calc(100cqw / var(--n, 8));
  width: 100%; max-width: 480px; margin-inline: auto;
  color: var(--gray-0); font-family: var(--font-body);
  display: flex; flex-direction: column; align-items: center;
}
.ba-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem; }
.ba-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.85rem; }
.ba-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.ba-pill.active { background: var(--ba-accent); color: var(--accent-text-over); border-color: var(--ba-accent); }

.ba-bar { display: flex; justify-content: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.7rem; font-weight: 700; font-size: 13px; }
.ba-stat { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; font-variant-numeric: tabular-nums; }
.ba-stat.sunk { background: var(--ba-accent); color: var(--accent-text-over); }
.ba-stat.best { background: transparent; border: 1.5px solid var(--gray-700); color: var(--gray-300); }

.ba-actions { display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap; margin-bottom: 0.85rem; }
.ba-act {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.ba-act:hover:not(:disabled) { border-color: var(--ba-accent); color: var(--ba-accent); }
.ba-act.on { background: var(--ba-accent); color: var(--accent-text-over); border-color: var(--ba-accent); }
.ba-act:disabled { opacity: 0.5; cursor: default; }
.ba-hint { color: var(--ba-accent); font-size: 12.5px; font-weight: 500; }

.ba-boardwrap { position: relative; width: 100%; max-width: min(460px, calc(46px * var(--n, 8))); margin-inline: auto; container-type: inline-size; }
.ba-board {
  width: 100%; display: grid; gap: 2px; touch-action: manipulation; user-select: none;
  background: var(--gray-700); border-radius: 6px; padding: 2px;
}
.ba-board.sonar { outline: 2px solid var(--ba-accent); outline-offset: 2px; border-radius: 8px; }
.ba-cell {
  width: 100%; aspect-ratio: 1; border: none; border-radius: 3px;
  background: var(--gray-999); color: var(--gray-300);
  font-family: var(--font-body); font-weight: 800; font-size: calc(var(--ba-cell) * 0.46);
  line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;
  font-variant-numeric: tabular-nums;
}
.ba-cell:hover:not(:disabled) { background: var(--gray-800); }
.ba-cell.miss { color: var(--gray-500); cursor: default; }
.ba-cell.hit { color: #fff; background: var(--ba-hit); cursor: default; }
.ba-cell.sonarval { color: var(--ba-accent); background: var(--gray-900); }
.ba-cell.over { cursor: default; }
.ba-dot { width: calc(var(--ba-cell) * 0.16); height: calc(var(--ba-cell) * 0.16); border-radius: 50%; background: var(--gray-500); }

/* Ship segments (sunk / revealed). */
.ba-cell.ship { background: var(--gray-900); cursor: default; }
.ba-seg { background: var(--ba-ship); display: block; }
.ba-cell.ship .ba-seg { width: 78%; height: 78%; background: var(--ba-accent); }
.ba-cell.seg-single .ba-seg { border-radius: 50%; }
.ba-cell.seg-left .ba-seg { width: 100%; border-radius: 999px 0 0 999px; margin-left: 22%; }
.ba-cell.seg-right .ba-seg { width: 100%; border-radius: 0 999px 999px 0; margin-right: 22%; }
.ba-cell.seg-top .ba-seg { height: 100%; border-radius: 999px 999px 0 0; margin-top: 22%; }
.ba-cell.seg-bottom .ba-seg { height: 100%; border-radius: 0 0 999px 999px; margin-bottom: 22%; }
.ba-cell.seg-midh .ba-seg { width: 100%; height: 78%; border-radius: 0; }
.ba-cell.seg-midv .ba-seg { width: 78%; height: 100%; border-radius: 0; }

.ba-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.ba-overlay { position: absolute; inset: -8px; z-index: 2; display: flex; align-items: center; justify-content: center; }
.ba-overlay-card { background: var(--gray-999); border: 2px solid var(--ba-accent); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); color: var(--gray-300); }
.ba-startbtn { border: none; background: var(--ba-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg); }

.ba-win { position: absolute; inset: -8px; display: flex; align-items: center; justify-content: center; background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px; }
.ba-wincard { background: var(--gray-999); border: 2px solid var(--ba-accent); border-radius: 20px; padding: 26px 34px; text-align: center; box-shadow: var(--shadow-lg); }
.ba-wincard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 22px; color: var(--gray-0); }
.ba-winmark { font-size: 30px; }
.ba-wintime { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 0; color: var(--ba-accent); }
.ba-windiff { color: var(--gray-300); font-size: 13px; margin: 2px 0 14px; }
.ba-replay { border: none; background: var(--ba-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer; }

.ba-daily-won { text-align: center; font-size: 16px; color: var(--gray-0); margin: 0.75rem 0 0; }
.ba-daily-won strong { color: var(--ba-accent); font-variant-numeric: tabular-nums; }

.ba-help { max-width: 440px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin-top: 1.1rem; }

@media (prefers-reduced-motion: reduce) { .ba-win, .ba-overlay { transition: none; } }
`;
