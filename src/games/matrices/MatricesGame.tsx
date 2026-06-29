import { useState, useEffect, useRef, useCallback } from 'react';
import { DIFFS, generateQuestion, cellKey, COLORS, type Question, type Cell, type Elt } from './engine';
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

/* ---------- Figure renderer (geometry → SVG, 0..100 viewBox) ---------- */

function regPoly(cx: number, cy: number, r: number, n: number, rotDeg: number): string {
	const pts: string[] = [];
	for (let i = 0; i < n; i++) {
		const a = ((rotDeg + (360 / n) * i) * Math.PI) / 180;
		pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
	}
	return pts.join(' ');
}

function starPts(cx: number, cy: number, r: number): string {
	const pts: string[] = [];
	for (let i = 0; i < 10; i++) {
		const rr = i % 2 === 0 ? r : r * 0.45;
		const a = ((-90 + 36 * i) * Math.PI) / 180;
		pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
	}
	return pts.join(' ');
}

function ElementShape({ e }: { e: Elt }) {
	const col = COLORS[e.color] ?? COLORS[0];
	const solid = e.filled || e.kind === 'dot';
	const common = { fill: solid ? col : 'none', stroke: solid ? 'none' : col, strokeWidth: Math.max(2, e.size * 0.34), strokeLinejoin: 'round' as const };
	switch (e.kind) {
		case 'dot': return <circle cx={e.x} cy={e.y} r={e.size} fill={col} />;
		case 'circle': return <circle cx={e.x} cy={e.y} r={e.size} {...common} />;
		case 'square': return <rect x={e.x - e.size} y={e.y - e.size} width={e.size * 2} height={e.size * 2} rx={2} {...common} />;
		case 'triangle': return <polygon points={regPoly(e.x, e.y, e.size * 1.15, 3, -90)} {...common} />;
		case 'diamond': return <polygon points={regPoly(e.x, e.y, e.size * 1.1, 4, -90)} {...common} />;
		case 'hexagon': return <polygon points={regPoly(e.x, e.y, e.size * 1.1, 6, -90)} {...common} />;
		case 'star': return <polygon points={starPts(e.x, e.y, e.size * 1.2)} {...common} />;
		default: return null;
	}
}

function Frame({ cell }: { cell: Cell }) {
	const col = COLORS[cell.color] ?? COLORS[0];
	const s = { fill: 'none', stroke: col, strokeWidth: 3, strokeLinejoin: 'round' as const };
	switch (cell.container) {
		case 'triangle': return <polygon points="50,12 88,84 12,84" {...s} />;
		case 'square': return <rect x="14" y="14" width="72" height="72" rx="6" {...s} />;
		case 'circle': return <circle cx="50" cy="50" r="38" {...s} />;
		case 'wheel8':
			return (
				<>
					<circle cx="50" cy="50" r="38" {...s} />
					{[0, 1, 2, 3].map((k) => {
						const a = (k * 45 * Math.PI) / 180;
						const dx = 38 * Math.cos(a), dy = 38 * Math.sin(a);
						return <line key={k} x1={50 - dx} y1={50 - dy} x2={50 + dx} y2={50 + dy} stroke={col} strokeWidth={3} />;
					})}
					<circle cx="50" cy="50" r="4" fill={col} />
				</>
			);
		case 'quad':
			return (
				<>
					<circle cx="50" cy="50" r="38" {...s} />
					<line x1="50" y1="12" x2="50" y2="88" stroke={col} strokeWidth={3} />
					<line x1="12" y1="50" x2="88" y2="50" stroke={col} strokeWidth={3} />
				</>
			);
		default:
			return null;
	}
}

function Figure({ cell }: { cell: Cell }) {
	return (
		<svg className="mx-fig" viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
			<Frame cell={cell} />
			{cell.elements.map((e, i) => <ElementShape key={i} e={e} />)}
		</svg>
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
							{i === question.answerIndex ? '?' : <Figure cell={cell} />}
						</span>
					))}
				</div>

				<p className="mx-prompt">Quelle figure complète la grille ?</p>

				<div className={`mx-options ${armed ? 'blurred' : ''}`}>
					{question.options.map((c, i) => (
						<button key={i} className={optionClass(i)} onClick={() => choose(i)} disabled={chosen !== null || eliminated.includes(i) || armed} aria-label={`Option ${i + 1}`}>
							<Figure cell={c} />
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
  box-shadow: var(--shadow-sm); padding: 7%; box-sizing: border-box;
}
.mx-gcell.q { color: var(--mx-accent); border-color: var(--mx-accent); border-style: dashed; font-weight: 800; font-size: 28px; }

.mx-fig { display: block; width: 100%; height: 100%; }
.mx-prompt { color: var(--gray-300); font-size: 12.5px; margin: 1.1rem 0 0.75rem; text-align: center; }
.mx-options { width: 100%; max-width: 320px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.mx-opt { aspect-ratio: 1 / 1; border-radius: 14px; border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0); display: flex; align-items: center; justify-content: center; font: inherit; cursor: pointer; padding: 9%; box-sizing: border-box; transition: transform 0.08s ease, background 0.12s ease, border-color 0.12s ease; }
.mx-opt:hover:not(:disabled) { border-color: var(--mx-accent); }
.mx-opt:active:not(:disabled) { transform: scale(0.96); }
.mx-opt.good { background: color-mix(in srgb, var(--mx-ok) 18%, transparent); border-color: var(--mx-ok); border-width: 2px; }
.mx-opt.bad { background: color-mix(in srgb, var(--mx-bad) 16%, transparent); border-color: var(--mx-bad); border-width: 2px; }
.mx-opt.dim { opacity: 0.42; }


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
