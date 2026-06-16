import { useState, useEffect, useRef, useCallback } from 'react';
import { DIFFS, generateQuestion, type Question } from './engine';
import { trackGame } from '../../lib/analytics';

/* =====================================================
   SUITE MYSTÈRE — React island (QCM, endless score).
   Pick the next term of a hidden-rule sequence.
   Engine lives in ./engine (pure, tested).
   ===================================================== */

type Status = 'playing' | 'over';
const BEST_KEY = 'ludiven-suite-best';

export default function SuiteGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [question, setQuestion] = useState<Question>(() => generateQuestion(DIFFS.facile));
	const [score, setScore] = useState(0);
	const [best, setBest] = useState(0);
	const [status, setStatus] = useState<Status>('playing');
	const [chosen, setChosen] = useState<number | null>(null);
	const [eliminated, setEliminated] = useState<number[]>([]);
	const [peeked, setPeeked] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const startedRef = useRef(false);

	useEffect(() => {
		const stored = Number(localStorage.getItem(BEST_KEY) ?? '0');
		if (stored > 0) setBest(stored);
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, []);

	const newGame = useCallback((key: keyof typeof DIFFS) => {
		if (timer.current) clearTimeout(timer.current);
		setDiffKey(key);
		setQuestion(generateQuestion(DIFFS[key]));
		setScore(0);
		setStatus('playing');
		setChosen(null);
		setEliminated([]);
		setPeeked(false);
		startedRef.current = false;
	}, []);

	const choose = (value: number, idx: number) => {
		if (status === 'over' || chosen !== null) return;
		if (!startedRef.current) {
			startedRef.current = true;
			trackGame(gameId, 'game_started');
		}
		setChosen(idx);
		if (value === question.answer) {
			const next = score + 1;
			setScore(next);
			timer.current = setTimeout(() => {
				setQuestion(generateQuestion(DIFFS[diffKey]));
				setChosen(null);
				setEliminated([]);
				setPeeked(false);
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

	/* Hint: remove one wrong option (keep at least the answer + one distractor). */
	const eliminate = () => {
		if (status === 'over' || chosen !== null) return;
		const remaining = question.options
			.map((v, i) => ({ v, i }))
			.filter(({ v, i }) => v !== question.answer && !eliminated.includes(i));
		if (remaining.length <= 1) return;
		setEliminated((prev) => [...prev, remaining[0].i]);
		trackGame(gameId, 'hint_used');
	};

	/* Reveal: highlight the correct option for this question. */
	const peek = () => {
		if (status === 'over' || chosen !== null || peeked) return;
		setPeeked(true);
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

	return (
		<div className="su-root">
			<style>{CSS}</style>

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

			<div className="su-seq" aria-label="Séquence">
				{question.terms.map((t, i) => (
					<span key={i} className="su-term">
						{t}
					</span>
				))}
				<span className="su-term q">?</span>
			</div>

			<div className="su-options">
				{question.options.map((v, i) => (
					<button
						key={i}
						className={optionClass(v, i)}
						onClick={() => choose(v, i)}
						disabled={chosen !== null || eliminated.includes(i)}
					>
						{v}
					</button>
				))}
			</div>

			{status === 'playing' && chosen === null && (
				<div className="su-actions">
					<button className="su-act" onClick={eliminate}>💡 Indice</button>
					<button className="su-act" onClick={peek}>👁 Voir la réponse</button>
				</div>
			)}

			{status === 'over' ? (
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
			)}
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

.su-help { max-width: 380px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.5rem; }

.su-over { text-align: center; margin-top: 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
.su-rule { color: var(--gray-300); font-size: 14px; max-width: 40ch; line-height: 1.5; }
.su-rule strong { color: var(--gray-0); }
.su-final { font-size: 22px; font-weight: 700; color: var(--su-accent); margin: 0.25rem 0; }
.su-replay {
  border: none; background: var(--su-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 26px; cursor: pointer;
}

@media (prefers-reduced-motion: reduce) { .su-opt { transition: none; } }
`;
