import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LEVELS, generatePuzzle, score, isWin, type MasterPuzzle, type Feedback } from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import {
	getDaily,
	dailyWeekdayLabel,
	dailyDifficultyIndex,
	loadDailyRun,
	saveDailyRun,
} from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   MASTER COLOR — Mastermind-like. React island.
   Guess the hidden colour code; each guess returns
   "X bien placés / Y présents". Fewest guesses wins.
   Engine is pure/tested.
   ===================================================== */

type Status = 'playing' | 'won' | 'lost';
type DiffKey = keyof typeof LEVELS;
const DIFF_ORDER: DiffKey[] = ['facile', 'moyen', 'difficile'];
const BEST_KEY = 'ludiven-master-color-best';
const LOSS_OFFSET = 100000; // daily: losers ranked after winners (cf. démineur)

interface Swatch {
	hex: string;
	name: string;
}
// 8 distinct hues; a level uses the first `colors` of them.
const PALETTE: Swatch[] = [
	{ hex: '#e6484d', name: 'Rouge' },
	{ hex: '#f59e0b', name: 'Orange' },
	{ hex: '#facc15', name: 'Jaune' },
	{ hex: '#22c55e', name: 'Vert' },
	{ hex: '#06b6d4', name: 'Cyan' },
	{ hex: '#3b82f6', name: 'Bleu' },
	{ hex: '#8b5cf6', name: 'Violet' },
	{ hex: '#ec4899', name: 'Rose' },
];

interface Row {
	guess: number[];
	fb: Feedback;
}
interface DailyState {
	rows: Row[];
	current: (number | null)[];
	status: Status;
}

const makeEmpty = (n: number): (number | null)[] => new Array<number | null>(n).fill(null);

export default function MasterColorGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<DiffKey>('facile');
	const [puzzle, setPuzzle] = useState<MasterPuzzle>(() => generatePuzzle(LEVELS.facile));
	const [rows, setRows] = useState<Row[]>([]);
	const [current, setCurrent] = useState<(number | null)[]>(() => makeEmpty(LEVELS.facile.slots));
	const [status, setStatus] = useState<Status>('playing');
	const [best, setBest] = useState(0);
	const [started, setStarted] = useState(false);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const startedRef = useRef(false); // free-mode "first action" flag
	const startRef = useRef(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);

	const { slots, colors, tries } = puzzle;
	const over = status !== 'playing';
	const usedTries = rows.length;
	const filled = current.every((v) => v !== null);
	const bestExact = useMemo(() => rows.reduce((m, r) => Math.max(m, r.fb.exact), 0), [rows]);
	const cost = status === 'won' ? usedTries : LOSS_OFFSET + (slots - bestExact);

	const newGame = useCallback((dk: DiffKey) => {
		const lvl = LEVELS[dk];
		setDaily(false);
		setAlreadyPlayed(false);
		setDiffKey(dk);
		setPuzzle(generatePuzzle(lvl));
		setRows([]);
		setCurrent(makeEmpty(lvl.slots));
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
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const di = run.diffIndex ?? dailyDifficultyIndex();
			const dk = DIFF_ORDER[di] ?? 'moyen';
			dailySeedRef.current = { seed: run.seed, diffIndex: di };
			const p = generatePuzzle(LEVELS[dk], mulberry32(run.seed));
			const st = run.state as DailyState | undefined;
			setDailyLoading(false);
			setDiffKey(dk);
			setPuzzle(p);
			setRows(st?.rows ?? []);
			setCurrent(st?.current ?? makeEmpty(p.slots));
			setStarted(true);
			if (run.done) {
				setAlreadyPlayed(true);
				setStatus(st?.status === 'lost' ? 'lost' : 'won');
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
		setRows([]);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const dk = DIFF_ORDER[diffIndex] ?? 'moyen';
		const p = generatePuzzle(LEVELS[dk], mulberry32(seed));
		setDiffKey(dk);
		setPuzzle(p);
		setCurrent(makeEmpty(p.slots));
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
			state: { rows: [], current: makeEmpty(slots), status: 'playing' } satisfies DailyState,
		});
	}, [gameId, slots]);

	const begin = useCallback(() => {
		if (daily) return; // daily starts via Commencer
		if (!startedRef.current) {
			startedRef.current = true;
			trackGame(gameId, 'game_started');
		}
	}, [daily, gameId]);

	const armed = daily && !started;

	/* Place the next colour into the first empty slot. */
	const placeColor = useCallback(
		(ci: number) => {
			if (over || armed) return;
			begin();
			setCurrent((prev) => {
				const i = prev.indexOf(null);
				if (i === -1) return prev;
				const next = prev.slice();
				next[i] = ci;
				return next;
			});
		},
		[over, armed, begin],
	);

	const clearSlot = useCallback(
		(i: number) => {
			if (over || armed) return;
			setCurrent((prev) => {
				const next = prev.slice();
				next[i] = null;
				return next;
			});
		},
		[over, armed],
	);

	const validate = useCallback(() => {
		if (over || armed || current.some((v) => v === null)) return;
		const guess = current.map((v) => v as number);
		const fb = score(puzzle.code, guess);
		const nextRows = [...rows, { guess, fb }];
		setRows(nextRows);
		setCurrent(makeEmpty(slots));
		if (isWin(fb, slots)) {
			setStatus('won');
			trackGame(gameId, 'game_won', { tries: nextRows.length });
		} else if (nextRows.length >= tries) {
			setStatus('lost');
			trackGame(gameId, 'game_over', { tries: nextRows.length });
		}
	}, [over, armed, current, puzzle.code, rows, slots, tries, gameId]);

	/* Persist the in-progress daily attempt. */
	useEffect(() => {
		if (!daily || !started || over) return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { rows, current, status } satisfies DailyState,
		});
	}, [daily, started, over, rows, current, status, gameId]);

	/* Lock the daily on a fresh finish + record free-mode best on a win. */
	useEffect(() => {
		if (!over) return;
		if (daily) {
			if (alreadyPlayed) return;
			const sd = dailySeedRef.current;
			saveDailyRun(gameId, {
				startedAt: startRef.current,
				done: true,
				finalTime: cost,
				seed: sd?.seed,
				diffIndex: sd?.diffIndex,
				state: { rows, current, status } satisfies DailyState,
			});
		} else if (status === 'won') {
			setBest((prev) => {
				const nb = prev === 0 ? usedTries : Math.min(prev, usedTries);
				try {
					localStorage.setItem(BEST_KEY, String(nb));
				} catch {
					/* ignore */
				}
				return nb;
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [over]);

	const fmt = (v: number): string =>
		v >= LOSS_OFFSET ? `❌ ${slots - (v - LOSS_OFFSET)}/${slots}` : `${v} essai${v > 1 ? 's' : ''}`;

	return (
		<div className="mc-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newGame(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="mc-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${LEVELS[diffKey].label}`}
				</div>
			) : (
				<div className="mc-pills" role="tablist" aria-label="Difficulté">
					{DIFF_ORDER.map((k) => (
						<button
							key={k}
							role="tab"
							aria-selected={diffKey === k}
							className={`mc-pill ${diffKey === k ? 'active' : ''}`}
							onClick={() => newGame(k)}
						>
							{LEVELS[k].label}
						</button>
					))}
				</div>
			)}

			<div className="mc-bar">
				<span className="mc-stat">🎯 {usedTries}/{tries}</span>
				{!daily && best > 0 && <span className="mc-stat best">★ {best}</span>}
			</div>

			<div className="mc-boardwrap">
				{celebrating && <Celebration />}

				<div className={`mc-board ${armed ? 'blurred' : ''}`}>
					{rows.map((row, ri) => (
						<div className="mc-row" key={ri}>
							<span className="mc-rownum">{ri + 1}</span>
							<div className="mc-pegs">
								{row.guess.map((ci, i) => (
									<span key={i} className="mc-peg" style={{ background: PALETTE[ci].hex }} aria-label={PALETTE[ci].name} />
								))}
							</div>
							<div className="mc-fb">
								<span className="mc-fb-exact" aria-label={`${row.fb.exact} bien placés`}>✓ {row.fb.exact}</span>
								<span className="mc-fb-partial" aria-label={`${row.fb.partial} présents`}>○ {row.fb.partial}</span>
							</div>
						</div>
					))}

					{!over && (
						<div className="mc-row active">
							<span className="mc-rownum">{usedTries + 1}</span>
							<div className="mc-pegs">
								{current.map((ci, i) => (
									<button
										key={i}
										className={`mc-peg slot ${ci === null ? 'empty' : ''}`}
										style={ci === null ? undefined : { background: PALETTE[ci].hex }}
										onClick={() => clearSlot(i)}
										disabled={armed || ci === null}
										aria-label={ci === null ? `Case ${i + 1} vide` : `Retirer ${PALETTE[ci].name}`}
									/>
								))}
							</div>
							<div className="mc-fb">
								<button className="mc-validate" onClick={validate} disabled={armed || !filled}>
									Valider
								</button>
							</div>
						</div>
					)}
				</div>

				{!over && (
					<div className={`mc-palette ${armed ? 'blurred' : ''}`} aria-label="Couleurs">
						{PALETTE.slice(0, colors).map((s, ci) => (
							<button
								key={ci}
								className="mc-swatch"
								style={{ background: s.hex }}
								onClick={() => placeColor(ci)}
								disabled={armed || filled}
								aria-label={s.name}
								title={s.name}
							/>
						))}
					</div>
				)}

				{daily && dailyLoading && (
					<div className="mc-overlay"><div className="mc-overlay-card">Préparation…</div></div>
				)}
				{armed && !dailyLoading && (
					<div className="mc-overlay">
						<button className="mc-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div>
				)}

				{showWin && !daily && (
					<div className="mc-end" role="dialog" aria-label="Code trouvé">
						<div className="mc-endcard">
							<div className="mc-endmark">🎉</div>
							<h2>Code trouvé !</h2>
							<p className="mc-endbig">{usedTries} essai{usedTries > 1 ? 's' : ''}</p>
							<div className="mc-code">
								{puzzle.code.map((ci, i) => (
									<span key={i} className="mc-peg" style={{ background: PALETTE[ci].hex }} />
								))}
							</div>
							<button className="mc-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
						</div>
					</div>
				)}
				{status === 'lost' && !daily && (
					<div className="mc-end" role="dialog" aria-label="Perdu">
						<div className="mc-endcard">
							<div className="mc-endmark">🙈</div>
							<h2>Raté !</h2>
							<p className="mc-endsub">Le code était :</p>
							<div className="mc-code">
								{puzzle.code.map((ci, i) => (
									<span key={i} className="mc-peg" style={{ background: PALETTE[ci].hex }} />
								))}
							</div>
							<button className="mc-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
						</div>
					</div>
				)}
			</div>

			{daily && over && (
				<div className="mc-daily-won">
					{alreadyPlayed ? (
						<>
							Défi du jour déjà joué ·{' '}
							<strong>{status === 'won' ? `${usedTries} essais` : `code manqué`}</strong> — reviens demain&nbsp;!
						</>
					) : status === 'won' ? (
						<>🎉 Code trouvé en <strong>{usedTries} essais</strong></>
					) : (
						<>Raté… le code apparaît ci-dessus. Tu es classé selon tes pions bien placés.</>
					)}
				</div>
			)}
			{daily && over && status === 'lost' && (
				<div className="mc-board mc-reveal">
					<div className="mc-row">
						<span className="mc-rownum">🔑</span>
						<div className="mc-pegs">
							{puzzle.code.map((ci, i) => (
								<span key={i} className="mc-peg" style={{ background: PALETTE[ci].hex }} />
							))}
						</div>
						<div className="mc-fb" />
					</div>
				</div>
			)}

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={over ? cost : undefined} format={fmt} />
			)}
			{!daily && <LeaderboardCorner game={gameId} metric="time" />}

			<p className="mc-help">
				Devine le <strong>code de couleurs</strong> caché en un minimum d'essais. Pose des couleurs (une
				couleur peut se répéter) puis <strong>Valide</strong>. Chaque essai renvoie deux indices :
				<strong> ✓ bien placés</strong> (bonne couleur, bonne place) et <strong>○ présents</strong>
				(bonne couleur, mauvaise place) — sans dire lesquels.
			</p>
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.mc-root {
  --mc-accent: var(--accent-regular);
  width: 100%; max-width: 460px; margin-inline: auto;
  color: var(--gray-0); font-family: var(--font-body);
  display: flex; flex-direction: column; align-items: center;
}
.mc-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem; }
.mc-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.85rem; }
.mc-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.mc-pill.active { background: var(--mc-accent); color: var(--accent-text-over); border-color: var(--mc-accent); }

.mc-bar { display: flex; justify-content: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.8rem; font-weight: 700; font-size: 13px; }
.mc-stat { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; font-variant-numeric: tabular-nums; }
.mc-stat.best { background: transparent; border: 1.5px solid var(--gray-700); color: var(--gray-300); }

.mc-boardwrap { position: relative; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 0.9rem; }
.mc-board { width: 100%; max-width: 380px; display: flex; flex-direction: column; gap: 6px; }
.mc-reveal { margin-top: -0.3rem; }
.mc-row { display: flex; align-items: center; gap: 10px; }
.mc-row.active { background: var(--gray-900); border-radius: 12px; padding: 6px 8px; }
.mc-rownum { width: 18px; text-align: center; color: var(--gray-400); font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; flex: none; }
.mc-pegs { display: flex; gap: 6px; flex: 1; }
.mc-peg { width: 30px; height: 30px; border-radius: 50%; border: none; flex: none; box-shadow: inset 0 -2px 4px rgba(0,0,0,0.18); }
.mc-peg.slot { cursor: pointer; padding: 0; }
.mc-peg.slot.empty { background: var(--gray-800); box-shadow: none; border: 2px dashed var(--gray-600, var(--gray-700)); cursor: default; }
.mc-peg.slot:not(.empty):hover { outline: 2px solid var(--gray-0); outline-offset: 1px; }

.mc-fb { display: flex; align-items: center; gap: 6px; flex: none; min-width: 92px; justify-content: flex-end; }
.mc-fb-exact, .mc-fb-partial { font-size: 12.5px; font-weight: 800; border-radius: 999px; padding: 3px 8px; font-variant-numeric: tabular-nums; }
.mc-fb-exact { background: #1f9d55; color: #fff; }
.mc-fb-partial { background: transparent; color: var(--gray-200); border: 1.5px solid var(--gray-600, var(--gray-700)); }
.mc-validate { border: none; background: var(--mc-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 13px; border-radius: 999px; padding: 7px 16px; cursor: pointer; }
.mc-validate:disabled { opacity: 0.4; cursor: default; }

.mc-palette { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; padding: 4px; }
.mc-swatch { width: 38px; height: 38px; border-radius: 50%; border: none; cursor: pointer; box-shadow: inset 0 -3px 6px rgba(0,0,0,0.2); transition: transform 0.08s; }
.mc-swatch:hover:not(:disabled) { transform: scale(1.1); }
.mc-swatch:disabled { opacity: 0.45; cursor: default; }

.mc-board.blurred, .mc-palette.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.mc-overlay { position: absolute; inset: -8px 0 auto 0; top: 0; height: 100%; z-index: 2; display: flex; align-items: center; justify-content: center; }
.mc-overlay-card { background: var(--gray-999); border: 2px solid var(--mc-accent); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); color: var(--gray-300); }
.mc-startbtn { border: none; background: var(--mc-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg); }

.mc-end { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px; z-index: 3; }
.mc-endcard { background: var(--gray-999); border: 2px solid var(--mc-accent); border-radius: 20px; padding: 24px 32px; text-align: center; box-shadow: var(--shadow-lg); }
.mc-endcard h2 { font-family: var(--font-brand); font-weight: 600; margin: 6px 0 2px; font-size: 22px; color: var(--gray-0); }
.mc-endmark { font-size: 30px; }
.mc-endbig { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 4px 0 6px; color: var(--mc-accent); }
.mc-endsub { color: var(--gray-300); font-size: 13px; margin: 4px 0 8px; }
.mc-code { display: flex; gap: 6px; justify-content: center; margin-bottom: 14px; }
.mc-code .mc-peg { width: 26px; height: 26px; }
.mc-replay { border: none; background: var(--mc-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer; }

.mc-daily-won { text-align: center; font-size: 16px; color: var(--gray-0); margin: 0.75rem 0 0; }
.mc-daily-won strong { color: var(--mc-accent); }

.mc-help { max-width: 440px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin-top: 1.1rem; }
`;
