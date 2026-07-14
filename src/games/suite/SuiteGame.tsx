import { useState, useEffect, useRef, useCallback } from 'react';
import { fmtCentis } from '../../lib/scoreFormat';
import { DIFFS, generateQuestion, type Question } from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import {
	getDaily,
	dailyWeekdayLabel,
	loadDailyRun,
	saveDailyRun,
} from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   SUITE MYSTÈRE — React island.
   Libre : QCM endless au score.
   Défi du jour : réussir 3 suites le plus vite possible (au temps).
   Engine lives in ./engine (pure, tested).
   ===================================================== */

type Status = 'playing' | 'over' | 'won';
const BEST_KEY = 'ludiven-suite-best';
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
const DAILY_TARGET = 3;

const fmtTime = fmtCentis;

interface DailyState {
	solved: number;
	qIndex: number;
}

/** Deterministic daily question stream: question i is fully reproducible from (seed, i). */
const dailyQ = (seed: number, diffIndex: number, i: number): Question =>
	generateQuestion(DIFFS[DIFF_ORDER[diffIndex] ?? 'facile'], mulberry32((seed + i * 0x9e3779b1) >>> 0));

export default function SuiteGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [question, setQuestion] = useState<Question>(() => generateQuestion(DIFFS.facile));
	const [score, setScore] = useState(0); // free: streak ; daily: suites réussies
	const [best, setBest] = useState(0);
	const [status, setStatus] = useState<Status>('playing');
	const [chosen, setChosen] = useState<number | null>(null);
	const [eliminated, setEliminated] = useState<number[]>([]);
	const [peeked, setPeeked] = useState(false);
	const [hintNote, setHintNote] = useState('');
	// Daily challenge
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [started, setStarted] = useState(false);
	const [qIndex, setQIndex] = useState(0);
	const [elapsed, setElapsed] = useState(0);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const startedRef = useRef(false); // free-mode "first answer" flag
	const startRef = useRef(0); // daily chrono start (epoch ms)
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);

	useEffect(() => {
		const stored = Number(localStorage.getItem(BEST_KEY) ?? '0');
		if (stored > 0) setBest(stored);
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, []);

	/* Daily chrono. */
	useEffect(() => {
		if (!daily || !started || status !== 'playing') return;
		const id = setInterval(
			() => setElapsed(Math.round((Date.now() - startRef.current) / 10)),
			50,
		);
		return () => clearInterval(id);
	}, [daily, started, status]);

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		if (timer.current) clearTimeout(timer.current);
		setDaily(false);
		setAlreadyPlayed(false);
		setStarted(false);
		setDiffKey(key);
		setQuestion(generateQuestion(DIFFS[key]));
		setScore(0);
		setQIndex(0);
		setElapsed(0);
		setStatus('playing');
		setChosen(null);
		setEliminated([]);
		setPeeked(false);
		setHintNote('');
		startedRef.current = false;
	}, []);

	/* Daily: one attempt per device, resumable; server-issued seed. */
	const startDaily = useCallback(async () => {
		if (timer.current) clearTimeout(timer.current);
		setDaily(true);
		setChosen(null);
		setEliminated([]);
		setPeeked(false);

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const di = run.diffIndex ?? 0;
			dailySeedRef.current = { seed: run.seed, diffIndex: di };
			setDailyLoading(false);
			setDiffKey(DIFF_ORDER[di] ?? 'facile');
			const st = (run.state as DailyState) ?? { solved: 0, qIndex: 0 };
			setScore(st.solved);
			setQIndex(st.qIndex);
			setQuestion(dailyQ(run.seed, di, st.qIndex));
			setStarted(true);
			if (run.done) {
				setStatus('won');
				setAlreadyPlayed(true);
				setElapsed(run.finalTime ?? 0);
			} else {
				setStatus('playing');
				setAlreadyPlayed(false);
				startRef.current = run.startedAt;
				setElapsed(Math.round((Date.now() - run.startedAt) / 10));
			}
			return;
		}

		// Fresh: fetch today's seed and arm (Start not pressed yet).
		setAlreadyPlayed(false);
		setStatus('playing');
		setStarted(false);
		setScore(0);
		setQIndex(0);
		setElapsed(0);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		setDiffKey(DIFF_ORDER[diffIndex] ?? 'facile');
		setQuestion(dailyQ(seed, diffIndex, 0));
		setDailyLoading(false);
	}, [gameId]);

	const { celebrating } = useCelebration(status === 'won');

	/* Commencer: consumes the attempt and starts the chrono. */
	const startTimer = useCallback(() => {
		const now = Date.now();
		startRef.current = now;
		setStarted(true);
		setElapsed(0);
		trackGame(gameId, 'game_started');
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: now,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { solved: 0, qIndex: 0 } satisfies DailyState,
		});
	}, [gameId]);

	const choose = (value: number, idx: number) => {
		if (status !== 'playing' || chosen !== null) return;
		if (daily && !started) return;
		const correct = value === question.answer;
		setChosen(idx);

		if (daily) {
			const sd = dailySeedRef.current;
			if (correct && score + 1 >= DAILY_TARGET) {
				const finalTime = Math.round((Date.now() - startRef.current) / 10);
				setScore(score + 1);
				setElapsed(finalTime);
				setStatus('won');
				trackGame(gameId, 'game_won');
				saveDailyRun(gameId, {
					startedAt: startRef.current,
					done: true,
					finalTime,
					seed: sd?.seed,
					diffIndex: sd?.diffIndex,
					state: { solved: score + 1, qIndex } satisfies DailyState,
				});
				return;
			}
			if (correct) setScore(score + 1);
			// Wrong answers don't end the run — the chrono keeps running.
			const nextSolved = correct ? score + 1 : score;
			timer.current = setTimeout(() => {
				const ni = qIndex + 1;
				setQIndex(ni);
				setQuestion(dailyQ(sd!.seed, sd!.diffIndex, ni));
				setChosen(null);
				setEliminated([]);
				setPeeked(false);
				saveDailyRun(gameId, {
					startedAt: startRef.current,
					done: false,
					seed: sd?.seed,
					diffIndex: sd?.diffIndex,
					state: { solved: nextSolved, qIndex: ni } satisfies DailyState,
				});
			}, 700);
			return;
		}

		// Free mode (endless score).
		if (!startedRef.current) {
			startedRef.current = true;
			trackGame(gameId, 'game_started');
		}
		if (correct) {
			setScore(score + 1);
			timer.current = setTimeout(() => {
				setQuestion(generateQuestion(DIFFS[diffKey]));
				setChosen(null);
				setEliminated([]);
				setPeeked(false);
				setHintNote('');
			}, 650);
		} else {
			setStatus('over');
			trackGame(gameId, 'game_over', { score });
			setBest((b) => {
				const nb = Math.max(b, score);
				try {
					localStorage.setItem(BEST_KEY, String(nb));
				} catch {
					/* ignore */
				}
				return nb;
			});
		}
	};

	/* Hint: remove one wrong option (free mode only). */
	const eliminate = () => {
		if (status !== 'playing' || chosen !== null) return;
		const remaining = question.options
			.map((v, i) => ({ v, i }))
			.filter(({ v, i }) => v !== question.answer && !eliminated.includes(i));
		if (remaining.length <= 1) return;
		setEliminated((prev) => [...prev, remaining[0].i]);
		setHintNote('Cette option ne suit pas la règle : ' + question.rule + '.');
		trackGame(gameId, 'hint_used');
	};

	/* Reveal: highlight the correct option (free mode only). */
	const peek = () => {
		if (status !== 'playing' || chosen !== null || peeked) return;
		setPeeked(true);
		setHintNote('La règle est « ' + question.rule + ' » → la réponse est ' + question.answer + '.');
		trackGame(gameId, 'solution_shown');
	};

	const optionClass = (value: number, idx: number) => {
		if (chosen === null) {
			if (peeked && value === question.answer) return 'su-opt good';
			if (eliminated.includes(idx)) return 'su-opt dim';
			return 'su-opt';
		}
		if (value === question.answer) return 'su-opt good';
		if (idx === chosen) return 'su-opt bad';
		return 'su-opt dim';
	};

	const armed = daily && !started;

	return (
		<div className="su-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newGame(diffKey)} onDaily={startDaily} />

			{daily ? (
				<>
					<div className="su-daily-tag">
						{dailyLoading
							? 'Préparation du défi…'
							: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label} · 3 suites`}
					</div>
					<div className="su-daily-status">
						<span className="su-score">Réussies {Math.min(score, DAILY_TARGET)}/{DAILY_TARGET}</span>
						<span className="su-best">⏱ {fmtTime(elapsed)}</span>
					</div>
				</>
			) : (
				<div className="su-bar">
					<div className="su-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={diffKey === k}
								className={`su-pill ${diffKey === k ? 'active' : ''}`}
								onClick={() => newGame(k)}
							>
								{DIFFS[k].label}
							</button>
						))}
					</div>
					<div className="su-scores">
						<span className="su-score">Score {score}</span>
						<span className="su-best">Record {best}</span>
					</div>
				</div>
			)}

			<div className="su-playwrap">
				{celebrating && <Celebration />}
				<div className={`su-seq ${armed ? 'blurred' : ''}`} aria-label="Séquence">
					{question.terms.map((t, i) => (
						<span key={i} className="su-term">
							{t}
						</span>
					))}
					<span className="su-term q">?</span>
				</div>

				<div className={`su-options ${armed ? 'blurred' : ''}`}>
					{question.options.map((v, i) => (
						<button
							key={i}
							className={optionClass(v, i)}
							onClick={() => choose(v, i)}
							disabled={chosen !== null || eliminated.includes(i) || armed}
						>
							{v}
						</button>
					))}
				</div>

				{daily && dailyLoading && (
					<div className="su-overlay">
						<div className="su-overlay-card">Préparation du défi…</div>
					</div>
				)}
				{armed && !dailyLoading && status !== 'won' && (
					<div className="su-overlay">
						<button className="su-startbtn" onClick={startTimer}>▶ Commencer</button>
					</div>
				)}
			</div>

			{!daily && status === 'playing' && chosen === null && (
				<div className="su-actions">
					<button className="su-act" onClick={eliminate}>💡 Indice</button>
					<button className="su-act" onClick={peek}>👁 Voir la réponse</button>
				</div>
			)}

			{!daily && hintNote && (
				<p className="su-hint-note" aria-live="polite">💡 {hintNote}</p>
			)}

			{!daily &&
				(status === 'over' ? (
					<div className="su-over">
						<p className="su-rule">
							La règle : <strong>{question.rule}</strong> — la réponse était{' '}
							<strong>{question.answer}</strong>.
						</p>
						<p className="su-final">Score : {score}</p>
						<button className="su-replay" onClick={() => newGame(diffKey)}>
							Rejouer
						</button>
					</div>
				) : (
					<p className="su-help">
						Trouve le terme suivant de la suite. Bonne réponse → on enchaîne ; une erreur termine
						la manche.
					</p>
				))}

			{daily && status === 'won' && (
				<div className="su-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 3 suites réussies en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			{daily && status === 'playing' && (
				<p className="su-help">
					Réussis 3 suites le plus vite possible. Une erreur ne t'arrête pas, mais le chrono
					continue de tourner.
				</p>
			)}

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={status === 'won' ? elapsed : undefined} />
			)}

			{!daily && <LeaderboardCorner game={gameId} metric="time" />}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.su-root {
  --su-accent: var(--accent-regular);
  --su-ok: #2f9e6f;
  --su-bad: #d9534f;

  width: 100%;
  max-width: 460px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.su-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.6rem;
}
.su-daily-status { display: flex; gap: 0.5rem; font-weight: 700; font-size: 13px; margin-bottom: 1.5rem; }

.su-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap;
  margin-bottom: 1.5rem;
}
.su-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.su-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.su-pill.active { background: var(--su-accent); color: var(--accent-text-over); border-color: var(--su-accent); }
.su-scores { display: flex; gap: 0.5rem; font-weight: 700; font-size: 13px; }
.su-score { background: var(--su-accent); color: var(--accent-text-over); border-radius: 999px; padding: 5px 12px; }
.su-best { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; }

.su-actions {
  display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;
  margin-top: 1.25rem;
}
.su-act {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.su-act:hover { background: var(--gray-800); border-color: var(--su-accent); color: var(--su-accent); }

.su-playwrap { width: 100%; position: relative; }

.su-seq {
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; align-items: center;
  margin-bottom: 1.75rem;
}
.su-term {
  min-width: 48px; height: 56px; padding: 0 10px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 14px; background: var(--gray-999); border: 1.5px solid var(--gray-800);
  font-weight: 700; font-size: 22px; color: var(--gray-0); font-variant-numeric: tabular-nums;
  box-shadow: var(--shadow-sm);
}
.su-term.q { color: var(--su-accent); border-color: var(--su-accent); border-style: dashed; }

.su-options {
  width: 100%;
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;
}
.su-opt {
  height: 60px; border-radius: 16px; border: 1.5px solid var(--gray-700);
  background: var(--gray-999); color: var(--gray-0);
  font: inherit; font-weight: 700; font-size: 22px; cursor: pointer; font-variant-numeric: tabular-nums;
  transition: transform 0.08s ease, background 0.12s ease, border-color 0.12s ease;
}
.su-opt:hover:not(:disabled) { border-color: var(--su-accent); }
.su-opt:active:not(:disabled) { transform: scale(0.97); }
.su-opt.good { background: var(--su-ok); color: #fff; border-color: var(--su-ok); }
.su-opt.bad { background: var(--su-bad); color: #fff; border-color: var(--su-bad); }
.su-opt.dim { opacity: 0.5; }

.su-seq.blurred, .su-options.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.su-overlay {
  position: absolute; inset: -8px; z-index: 2;
  display: flex; align-items: center; justify-content: center;
}
.su-overlay-card {
  background: var(--gray-999); border: 2px solid var(--su-accent);
  border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); color: var(--gray-300);
}
.su-startbtn {
  border: none; background: var(--su-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}

.su-help { max-width: 380px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.5rem; }

.su-hint-note {
  max-width: 420px;
  margin: 1rem auto 0;
  text-align: center;
  font-size: 13px;
  line-height: 1.5;
  color: var(--su-ok);
  background: var(--accent-overlay);
  border: 1px solid var(--su-ok);
  border-radius: 12px;
  padding: 8px 14px;
}

.su-over { text-align: center; margin-top: 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
.su-rule { color: var(--gray-300); font-size: 14px; max-width: 40ch; line-height: 1.5; }
.su-rule strong { color: var(--gray-0); }
.su-final { font-size: 22px; font-weight: 700; color: var(--su-accent); margin: 0.25rem 0; }
.su-replay {
  border: none; background: var(--su-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer;
}

.su-daily-won { text-align: center; font-size: 16px; color: var(--gray-0); margin-top: 1.5rem; }
.su-daily-won strong { color: var(--su-accent); font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) { .su-opt { transition: none; } }
`;
