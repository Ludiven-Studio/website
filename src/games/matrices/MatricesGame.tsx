import { useState, useEffect, useRef, useCallback } from 'react';
import { DIFFS, generateQuestion, cellKey, COLORS, ROT_VISIBLE, type Question, type Cell, type Shape } from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   MATRICES — React island (IQ-test "Raven" matrices).
   Libre : entraînement sans fin (une erreur révèle la règle).
   Défi du jour : 3 matrices le plus vite possible (au temps).
   Engine pur/testé dans ./engine.
   ===================================================== */

type Status = 'playing' | 'won';
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
const DAILY_TARGET = 3;

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

interface DailyState {
	solved: number;
	qIndex: number;
}

const dailyQ = (seed: number, diffIndex: number, i: number): Question =>
	generateQuestion(DIFFS[DIFF_ORDER[diffIndex] ?? 'facile'], mulberry32((seed + i * 0x9e3779b1) >>> 0));

/* ---------- Figure renderer (SVG glyphs in a 0..100 viewBox) ---------- */

const GLYPHS: Record<Shape, string> = {
	circle: '<circle cx="50" cy="50" r="40"/>',
	square: '<rect x="14" y="14" width="72" height="72" rx="6"/>',
	triangle: '<polygon points="50,10 90,86 10,86"/>',
	diamond: '<polygon points="50,8 92,50 50,92 8,50"/>',
	star: '<polygon points="50,4 61,37 96,37 68,58 79,92 50,71 21,92 32,58 4,37 39,37"/>',
	hexagon: '<polygon points="26,8 74,8 98,50 74,92 26,92 2,50"/>',
	heart: '<path d="M50 86 C16 60 12 34 30 23 C42 16 50 25 50 33 C50 25 58 16 70 23 C88 34 84 60 50 86 Z"/>',
	plus: '<polygon points="38,12 62,12 62,38 88,38 88,62 62,62 62,88 38,88 38,62 12,62 12,38 38,38"/>',
	arrow: '<polygon points="10,38 56,38 56,20 92,50 56,80 56,62 10,62"/>',
	semicircle: '<path d="M12 64 a38 38 0 0 1 76 0 Z"/>',
	quarter: '<path d="M18 82 L82 82 A64 64 0 0 0 18 18 Z"/>',
};

function Figure({ cell, size = 30 }: { cell: Cell; size?: number }) {
	const color = COLORS[cell.color] ?? COLORS[0];
	const n = Math.max(1, Math.min(4, cell.count));
	const mini = n === 1 ? size : n <= 2 ? Math.round(size * 0.62) : Math.round(size * 0.48);
	const cols = n === 1 ? 1 : 2; // 2,3,4 → mini-grid inside the cell
	const rot = ROT_VISIBLE[cell.shape] ? cell.rotation : 0;
	return (
		<span className="mx-cell" style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}>
			{Array.from({ length: n }).map((_, i) => (
				<svg key={i} className="mx-shape" width={mini} height={mini} viewBox="0 0 100 100" aria-hidden="true">
					<g fill={color} transform={`rotate(${rot} 50 50)`} dangerouslySetInnerHTML={{ __html: GLYPHS[cell.shape] }} />
				</svg>
			))}
		</span>
	);
}

export default function MatricesGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [question, setQuestion] = useState<Question>(() => generateQuestion(DIFFS.facile));
	const [score, setScore] = useState(0);
	const [status, setStatus] = useState<Status>('playing');
	const [chosen, setChosen] = useState<number | null>(null);
	const [eliminated, setEliminated] = useState<number[]>([]);
	const [peeked, setPeeked] = useState(false);
	const [hintNote, setHintNote] = useState('');
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [started, setStarted] = useState(false);
	const [qIndex, setQIndex] = useState(0);
	const [elapsed, setElapsed] = useState(0);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const startedRef = useRef(false);
	const startRef = useRef(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);

	useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

	useEffect(() => {
		if (!daily || !started || status !== 'playing') return;
		const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 250);
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
				setElapsed(Math.floor((Date.now() - run.startedAt) / 1000));
			}
			return;
		}

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

	const answerKey = cellKey(question.grid[question.answerIndex]);

	const choose = (idx: number) => {
		if (status !== 'playing' || chosen !== null) return;
		if (daily && !started) return;
		const correct = cellKey(question.options[idx]) === answerKey;
		setChosen(idx);

		if (daily) {
			const sd = dailySeedRef.current;
			if (correct && score + 1 >= DAILY_TARGET) {
				const finalTime = Math.floor((Date.now() - startRef.current) / 1000);
				setScore(score + 1);
				setElapsed(finalTime);
				setStatus('won');
				trackGame(gameId, 'game_won');
				saveDailyRun(gameId, {
					startedAt: startRef.current, done: true, finalTime,
					seed: sd?.seed, diffIndex: sd?.diffIndex,
					state: { solved: score + 1, qIndex } satisfies DailyState,
				});
				return;
			}
			if (correct) setScore(score + 1);
			const nextSolved = correct ? score + 1 : score;
			timer.current = setTimeout(() => {
				const ni = qIndex + 1;
				setQIndex(ni);
				setQuestion(dailyQ(sd!.seed, sd!.diffIndex, ni));
				setChosen(null);
				setEliminated([]);
				setPeeked(false);
				saveDailyRun(gameId, {
					startedAt: startRef.current, done: false,
					seed: sd?.seed, diffIndex: sd?.diffIndex,
					state: { solved: nextSolved, qIndex: ni } satisfies DailyState,
				});
			}, 700);
			return;
		}

		// Free mode (endless practice). Wrong answer reveals the rule, then we move on.
		if (!startedRef.current) {
			startedRef.current = true;
			trackGame(gameId, 'game_started');
		}
		if (!correct) {
			setHintNote('La logique : ' + question.rule + '.');
			trackGame(gameId, 'solution_shown');
		}
		timer.current = setTimeout(() => {
			setQuestion(generateQuestion(DIFFS[diffKey]));
			setChosen(null);
			setEliminated([]);
			setPeeked(false);
			setHintNote('');
		}, correct ? 700 : 1900);
	};

	const eliminate = () => {
		if (status !== 'playing' || chosen !== null) return;
		const remaining = question.options
			.map((c, i) => ({ c, i }))
			.filter(({ c, i }) => cellKey(c) !== answerKey && !eliminated.includes(i));
		if (remaining.length <= 1) return;
		setEliminated((prev) => [...prev, remaining[0].i]);
		setHintNote('Cette option ne suit pas la logique.');
		trackGame(gameId, 'hint_used');
	};

	const peek = () => {
		if (status !== 'playing' || chosen !== null || peeked) return;
		setPeeked(true);
		setHintNote('La logique : ' + question.rule + '.');
		trackGame(gameId, 'solution_shown');
	};

	const optionClass = (idx: number) => {
		const isAnswer = cellKey(question.options[idx]) === answerKey;
		if (chosen === null) {
			if (peeked && isAnswer) return 'mx-opt good';
			if (eliminated.includes(idx)) return 'mx-opt dim';
			return 'mx-opt';
		}
		if (isAnswer) return 'mx-opt good';
		if (idx === chosen) return 'mx-opt bad';
		return 'mx-opt dim';
	};

	const armed = daily && !started;

	return (
		<div className="mx-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newGame(diffKey)} onDaily={startDaily} />

			{daily ? (
				<>
					<div className="mx-daily-tag">
						{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label} · 3 matrices`}
					</div>
					<div className="mx-daily-status">
						<span className="mx-score">Réussies {Math.min(score, DAILY_TARGET)}/{DAILY_TARGET}</span>
						<span className="mx-best">⏱ {fmtTime(elapsed)}</span>
					</div>
				</>
			) : (
				<div className="mx-bar">
					<div className="mx-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button key={k} role="tab" aria-selected={diffKey === k} className={`mx-pill ${diffKey === k ? 'active' : ''}`} onClick={() => newGame(k)}>
								{DIFFS[k].label}
							</button>
						))}
					</div>
				</div>
			)}

			<div className="mx-playwrap">
				{celebrating && <Celebration />}

				<div className={`mx-grid ${armed ? 'blurred' : ''}`} aria-label="Matrice">
					{question.grid.map((cell, i) => (
						<span key={i} className={`mx-gcell ${i === question.answerIndex ? 'q' : ''}`}>
							{i === question.answerIndex ? '?' : <Figure cell={cell} size={30} />}
						</span>
					))}
				</div>

				<p className="mx-prompt">Quelle figure complète la grille ?</p>

				<div className={`mx-options ${armed ? 'blurred' : ''}`}>
					{question.options.map((c, i) => (
						<button key={i} className={optionClass(i)} onClick={() => choose(i)} disabled={chosen !== null || eliminated.includes(i) || armed} aria-label={`Option ${i + 1}`}>
							<Figure cell={c} size={28} />
						</button>
					))}
				</div>

				{daily && dailyLoading && (
					<div className="mx-overlay"><div className="mx-overlay-card">Préparation du défi…</div></div>
				)}
				{armed && !dailyLoading && status !== 'won' && (
					<div className="mx-overlay"><button className="mx-startbtn" onClick={startTimer}>▶ Commencer</button></div>
				)}
			</div>

			{!daily && status === 'playing' && chosen === null && (
				<div className="mx-actions">
					<button className="mx-act" onClick={eliminate}>💡 Indice</button>
					<button className="mx-act" onClick={peek}>👁 Voir la réponse</button>
				</div>
			)}

			{!daily && hintNote && <p className="mx-hint-note" aria-live="polite">💡 {hintNote}</p>}

			{!daily && (
				<p className="mx-help">
					Repère la logique de chaque ligne et colonne (forme, couleur, nombre, orientation) et trouve la
					figure manquante. Entraîne-toi autant que tu veux : une erreur révèle la logique.
				</p>
			)}

			{daily && status === 'won' && (
				<div className="mx-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 3 matrices résolues en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			{daily && status === 'playing' && (
				<p className="mx-help">Résous 3 matrices le plus vite possible. Une erreur ne t'arrête pas, mais le chrono continue.</p>
			)}

			{daily && <Leaderboard game={gameId} metric="time" submitValue={status === 'won' ? elapsed : undefined} />}
			{!daily && <LeaderboardCorner game={gameId} metric="time" />}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.mx-root {
  --mx-accent: var(--accent-regular);
  --mx-ok: #2f9e6f;
  --mx-bad: #d9534f;
  width: 100%; max-width: 460px; margin-inline: auto; color: var(--gray-0);
  font-family: var(--font-body); display: flex; flex-direction: column; align-items: center;
}
.mx-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.6rem; }
.mx-daily-status { display: flex; gap: 0.5rem; font-weight: 700; font-size: 13px; margin-bottom: 1.25rem; }
.mx-bar { width: 100%; display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
.mx-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.mx-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition); }
.mx-pill.active { background: var(--mx-accent); color: var(--accent-text-over); border-color: var(--mx-accent); }
.mx-score { background: var(--mx-accent); color: var(--accent-text-over); border-radius: 999px; padding: 5px 12px; }
.mx-best { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; }

.mx-playwrap { width: 100%; position: relative; display: flex; flex-direction: column; align-items: center; }
.mx-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; max-width: 300px; }
.mx-gcell {
  aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center;
  border-radius: 12px; background: var(--gray-999); border: 1.5px solid var(--gray-800);
  box-shadow: var(--shadow-sm);
}
.mx-gcell.q { color: var(--mx-accent); border-color: var(--mx-accent); border-style: dashed; font-weight: 800; font-size: 28px; }

.mx-prompt { color: var(--gray-300); font-size: 12.5px; margin: 1.1rem 0 0.75rem; text-align: center; }
.mx-options { width: 100%; max-width: 340px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.mx-opt { aspect-ratio: 1 / 1; border-radius: 14px; border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0); display: flex; align-items: center; justify-content: center; font: inherit; cursor: pointer; transition: transform 0.08s ease, background 0.12s ease, border-color 0.12s ease; }
.mx-opt:hover:not(:disabled) { border-color: var(--mx-accent); }
.mx-opt:active:not(:disabled) { transform: scale(0.96); }
.mx-opt.good { background: var(--mx-ok); border-color: var(--mx-ok); }
.mx-opt.bad { background: var(--mx-bad); border-color: var(--mx-bad); }
.mx-opt.dim { opacity: 0.42; }

.mx-cell { display: grid; gap: 3px; place-items: center; place-content: center; }
.mx-shape { display: block; }

.mx-grid.blurred, .mx-options.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.mx-overlay { position: absolute; inset: -8px; z-index: 2; display: flex; align-items: center; justify-content: center; }
.mx-overlay-card { background: var(--gray-999); border: 2px solid var(--mx-accent); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); color: var(--gray-300); }
.mx-startbtn { border: none; background: var(--mx-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg); }

.mx-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 1.25rem; }
.mx-act { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition); }
.mx-act:hover { background: var(--gray-800); border-color: var(--mx-accent); color: var(--mx-accent); }
.mx-help { max-width: 400px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem; }
.mx-hint-note { max-width: 420px; margin: 1rem auto 0; text-align: center; font-size: 13px; line-height: 1.5; color: var(--mx-ok); background: var(--accent-overlay); border: 1px solid var(--mx-ok); border-radius: 12px; padding: 8px 14px; }
.mx-daily-won { text-align: center; font-size: 16px; color: var(--gray-0); margin-top: 1.25rem; }
.mx-daily-won strong { color: var(--mx-accent); font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) { .mx-opt { transition: none; } }
`;
