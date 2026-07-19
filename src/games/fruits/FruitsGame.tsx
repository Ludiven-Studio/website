import { useState, useEffect, useRef, useCallback } from 'react';
import { fmtCentis } from '../../lib/scoreFormat';
import { DIFFS, generateQuestion, type Question } from './engine';
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
import { fruitsLevels } from './levels';

/* =====================================================
   CALCUL DE FRUITS — React island (QCM).
   Libre : entraînement sans fin (une erreur révèle la solution).
   Défi du jour : 3 énigmes le plus vite possible (au temps).
   Engine pur/testé dans ./engine.
   ===================================================== */

type Status = 'playing' | 'won';
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
const DAILY_TARGET = 3;

const fmtTime = fmtCentis;

interface DailyState { solved: number; qIndex: number; }

const dailyQ = (seed: number, diffIndex: number, i: number): Question =>
	generateQuestion(DIFFS[DIFF_ORDER[diffIndex] ?? 'facile'], mulberry32((seed + i * 0x9e3779b1) >>> 0));

function EquationRow({ q, eq }: { q: Question; eq: Question['equations'][number] }) {
	return (
		<div className="fr-eq">
			{eq.tokens.map((t, i) => (
				<span key={i} className={t.kind === 'fruit' ? 'fr-fruit' : 'fr-op'}>
					{t.kind === 'fruit' ? <>{t.coef && t.coef > 1 ? <span className="fr-coef">{t.coef}</span> : null}{q.fruits[t.idx]}</> : t.op}
				</span>
			))}
			<span className="fr-op">=</span>
			<span className="fr-res">{eq.result}</span>
		</div>
	);
}

export default function FruitsGame({ gameId }: { gameId: string }) {
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
	const lv = useLevels(gameId, fruitsLevels);

	useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

	useEffect(() => {
		if (!(daily || lv.playing) || !started || status !== 'playing') return;
		const id = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 10)), 50);
		return () => clearInterval(id);
	}, [daily, lv.playing, started, status]);

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

	/* Levels mode: one seeded question from the level config; grade on answer. */
	const startLevel = useCallback((level: number) => {
		if (timer.current) clearTimeout(timer.current);
		const cfg = lv.play(level);
		setDaily(false);
		setAlreadyPlayed(false);
		setDiffKey(cfg.diff.system ? 'difficile' : cfg.diff.mul ? 'moyen' : 'facile');
		setQuestion(generateQuestion(cfg.diff, mulberry32(cfg.seed)));
		setScore(0);
		setQIndex(0);
		setElapsed(0);
		setStatus('playing');
		setChosen(null);
		setEliminated([]);
		setPeeked(false);
		setHintNote('');
		startedRef.current = false;
		startRef.current = Date.now();
		setStarted(true);
	}, [lv]);

	const armLevels = useCallback(() => {
		if (timer.current) clearTimeout(timer.current);
		setDaily(false);
		lv.enter();
	}, [lv]);

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
			if (run.done) { setStatus('won'); setAlreadyPlayed(true); setElapsed(run.finalTime ?? 0); }
			else { setStatus('playing'); setAlreadyPlayed(false); startRef.current = run.startedAt; setElapsed(Math.round((Date.now() - run.startedAt) / 10)); }
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
		saveDailyRun(gameId, { startedAt: now, done: false, seed: sd?.seed, diffIndex: sd?.diffIndex, state: { solved: 0, qIndex: 0 } satisfies DailyState });
	}, [gameId]);

	const choose = (idx: number) => {
		if (status !== 'playing' || chosen !== null) return;
		if (daily && !started) return;
		const correct = idx === question.answerIndex;
		setChosen(idx);

		if (lv.playing) {
			const t = Math.round((Date.now() - startRef.current) / 10);
			setElapsed(t);
			if (correct) { setScore(1); setStatus('won'); trackGame(gameId, 'game_won'); }
			timer.current = setTimeout(() => lv.finish({ won: correct, score: t }), 700);
			return;
		}

		if (daily) {
			const sd = dailySeedRef.current;
			if (correct && score + 1 >= DAILY_TARGET) {
				const finalTime = Math.round((Date.now() - startRef.current) / 10);
				setScore(score + 1); setElapsed(finalTime); setStatus('won');
				trackGame(gameId, 'game_won');
				saveDailyRun(gameId, { startedAt: startRef.current, done: true, finalTime, seed: sd?.seed, diffIndex: sd?.diffIndex, state: { solved: score + 1, qIndex } satisfies DailyState });
				return;
			}
			if (correct) setScore(score + 1);
			const nextSolved = correct ? score + 1 : score;
			timer.current = setTimeout(() => {
				const ni = qIndex + 1;
				setQIndex(ni);
				setQuestion(dailyQ(sd!.seed, sd!.diffIndex, ni));
				setChosen(null); setEliminated([]); setPeeked(false);
				saveDailyRun(gameId, { startedAt: startRef.current, done: false, seed: sd?.seed, diffIndex: sd?.diffIndex, state: { solved: nextSolved, qIndex: ni } satisfies DailyState });
			}, 700);
			return;
		}

		if (!startedRef.current) { startedRef.current = true; trackGame(gameId, 'game_started'); }
		if (!correct) { setHintNote('La solution : ' + question.rule + '.'); trackGame(gameId, 'solution_shown'); }
		timer.current = setTimeout(() => {
			setQuestion(generateQuestion(DIFFS[diffKey]));
			setChosen(null); setEliminated([]); setPeeked(false); setHintNote('');
		}, correct ? 700 : 2200);
	};

	const eliminate = () => {
		if (status !== 'playing' || chosen !== null) return;
		const remaining = question.options.map((_, i) => i).filter((i) => i !== question.answerIndex && !eliminated.includes(i));
		if (remaining.length <= 1) return;
		setEliminated((prev) => [...prev, remaining[0]]);
		setHintNote('Une option en moins. Résous pas à pas en partant de l\'équation la plus simple.');
		trackGame(gameId, 'hint_used');
	};

	const peek = () => {
		if (status !== 'playing' || chosen !== null || peeked) return;
		setPeeked(true);
		setHintNote('La solution : ' + question.rule + '.');
		trackGame(gameId, 'solution_shown');
	};

	const optionClass = (idx: number) => {
		const isAnswer = idx === question.answerIndex;
		if (chosen === null) {
			if (peeked && isAnswer) return 'fr-opt good';
			if (eliminated.includes(idx)) return 'fr-opt dim';
			return 'fr-opt';
		}
		if (isAnswer) return 'fr-opt good';
		if (idx === chosen) return 'fr-opt bad';
		return 'fr-opt dim';
	};

	const armed = daily && !started;

	return (
		<div className="fr-root">
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
				<div className="fr-daily-tag">
					{lv.menu ? 'Progression — réussis un niveau pour débloquer le suivant' : `Niveau ${lv.level} · ${DIFFS[diffKey].label}`}
				</div>
			)}

			{!lv.active && (daily ? (
				<>
					<div className="fr-daily-tag">
						{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label} · 3 énigmes`}
					</div>
					<div className="fr-daily-status">
						<span className="fr-score">Résolues {Math.min(score, DAILY_TARGET)}/{DAILY_TARGET}</span>
						<span className="fr-best">⏱ {fmtTime(elapsed)}</span>
					</div>
				</>
			) : (
				<div className="fr-bar">
					<div className="fr-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button key={k} role="tab" aria-selected={diffKey === k} className={`fr-pill ${diffKey === k ? 'active' : ''}`} onClick={() => newGame(k)}>
								{DIFFS[k].label}
							</button>
						))}
					</div>
				</div>
			))}

			{lv.playing && (
				<div className="fr-daily-status">
					<span className="fr-best">⏱ {fmtTime(elapsed)}</span>
				</div>
			)}

			{lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
			<div className="fr-playwrap">
				{celebrating && <Celebration />}
				<div className={`fr-eqs ${armed ? 'blurred' : ''}`}>
					{question.equations.map((eq, i) => <EquationRow key={i} q={question} eq={eq} />)}
				</div>
				<p className="fr-ask">Combien vaut <span className="fr-fruit">{question.fruits[question.askIdx]}</span> ?</p>
				<div className={`fr-options ${armed ? 'blurred' : ''}`}>
					{question.options.map((v, i) => (
						<button key={i} className={optionClass(i)} onClick={() => choose(i)} disabled={chosen !== null || eliminated.includes(i) || armed} aria-label={`Réponse ${v}`}>
							{v}
						</button>
					))}
				</div>

				{daily && dailyLoading && <div className="fr-overlay"><div className="fr-overlay-card">Préparation du défi…</div></div>}
				{armed && !dailyLoading && status !== 'won' && (
					<div className="fr-overlay"><button className="fr-startbtn" onClick={startTimer}>▶ Commencer</button></div>
				)}

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={fruitsLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won ? `Résolu en ${fmtTime(elapsed)}` : 'Mauvaise réponse'}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
			</div>
			)}

			{!daily && !lv.active && status === 'playing' && chosen === null && (
				<div className="fr-actions">
					<button className="fr-act" onClick={eliminate}>💡 Indice</button>
					<button className="fr-act" onClick={peek}>👁 Voir la réponse</button>
				</div>
			)}

			{!daily && !lv.active && hintNote && <p className="fr-hint-note" aria-live="polite">💡 {hintNote}</p>}

			{lv.playing && (
				<p className="fr-help">Réponds le plus vite possible : une seule question, une seule réponse. Une erreur fait échouer le niveau.</p>
			)}

			{!daily && !lv.active && (
				<p className="fr-help">
					Chaque fruit cache un nombre. Déduis la valeur demandée à partir des équations. Entraîne-toi
					autant que tu veux : une erreur révèle la solution puis on passe à la suivante.
				</p>
			)}

			{daily && status === 'won' && (
				<div className="fr-daily-won">
					{alreadyPlayed
						? <>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
						: <>🎉 3 énigmes résolues en <strong>{fmtTime(elapsed)}</strong></>}
				</div>
			)}

			{daily && status === 'playing' && (
				<p className="fr-help">Résous 3 énigmes le plus vite possible. Une erreur ne t'arrête pas, mais le chrono continue.</p>
			)}

			{daily && <Leaderboard game={gameId} metric="time" submitValue={status === 'won' ? elapsed : undefined} />}
			{!daily && !lv.active && <LeaderboardCorner game={gameId} metric="time" />}
		</div>
	);
}

const CSS = `
.fr-root { --fr-accent: var(--accent-regular); --fr-ok: #2f9e6f; --fr-bad: #d9534f; width: 100%; max-width: 460px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.fr-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.6rem; }
.fr-daily-status { display: flex; gap: 0.5rem; font-weight: 700; font-size: 13px; margin-bottom: 1.25rem; }
.fr-bar { width: 100%; display: flex; justify-content: center; margin-bottom: 1.25rem; }
.fr-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.fr-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition); }
.fr-pill.active { background: var(--fr-accent); color: var(--accent-text-over); border-color: var(--fr-accent); }
.fr-score { background: var(--fr-accent); color: var(--accent-text-over); border-radius: 999px; padding: 5px 12px; }
.fr-best { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; }

.fr-playwrap { width: 100%; position: relative; display: flex; flex-direction: column; align-items: center; }
.fr-eqs { display: flex; flex-direction: column; gap: 8px; align-items: center; background: var(--gray-999); border: 1.5px solid var(--gray-800); border-radius: 16px; padding: 14px 18px; box-shadow: var(--shadow-sm); }
.fr-eq { display: flex; align-items: center; gap: 6px; font-size: 26px; line-height: 1; }
.fr-fruit { font-size: 28px; }
.fr-coef { font-size: 18px; font-weight: 800; color: var(--gray-0); margin-right: 1px; vertical-align: 0.12em; }
.fr-op { color: var(--gray-300); font-weight: 700; font-size: 22px; }
.fr-res { font-weight: 800; color: var(--fr-accent); font-size: 26px; font-variant-numeric: tabular-nums; }
.fr-ask { color: var(--gray-0); font-size: 16px; margin: 1.1rem 0 0.75rem; text-align: center; }
.fr-ask .fr-fruit { font-size: 24px; vertical-align: middle; }

.fr-options { width: 100%; max-width: 320px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.fr-opt { height: 60px; border-radius: 16px; border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0); display: flex; align-items: center; justify-content: center; font: inherit; font-weight: 800; font-size: 24px; font-variant-numeric: tabular-nums; cursor: pointer; transition: transform 0.08s ease, background 0.12s ease, border-color 0.12s ease; }
.fr-opt:hover:not(:disabled) { border-color: var(--fr-accent); }
.fr-opt:active:not(:disabled) { transform: scale(0.97); }
.fr-opt.good { background: color-mix(in srgb, var(--fr-ok) 18%, transparent); border-color: var(--fr-ok); }
.fr-opt.bad { background: color-mix(in srgb, var(--fr-bad) 16%, transparent); border-color: var(--fr-bad); }
.fr-opt.dim { opacity: 0.42; }

.fr-eqs.blurred, .fr-options.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }
.fr-overlay { position: absolute; inset: -8px; z-index: 2; display: flex; align-items: center; justify-content: center; }
.fr-overlay-card { background: var(--gray-999); border: 2px solid var(--fr-accent); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); color: var(--gray-300); }
.fr-startbtn { border: none; background: var(--fr-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg); }

.fr-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 1.25rem; }
.fr-act { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition); }
.fr-act:hover { background: var(--gray-800); border-color: var(--fr-accent); color: var(--fr-accent); }
.fr-help { max-width: 400px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem; }
.fr-hint-note { max-width: 420px; margin: 1rem auto 0; text-align: center; font-size: 13px; line-height: 1.5; color: var(--fr-ok); background: var(--accent-overlay); border: 1px solid var(--fr-ok); border-radius: 12px; padding: 8px 14px; }
.fr-daily-won { text-align: center; font-size: 16px; color: var(--gray-0); margin-top: 1.25rem; }
.fr-daily-won strong { color: var(--fr-accent); font-variant-numeric: tabular-nums; }
`;
