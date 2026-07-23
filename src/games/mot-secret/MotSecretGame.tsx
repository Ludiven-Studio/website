import { useState, useEffect, useRef, useCallback } from 'react';
import { pickSolution, isValidGuess, evaluate, bestKnown, knownGood, DIFFS, MAX_TRIES, type GuessRow, type LetterState } from './engine';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import { useLevels } from '../../lib/useLevels';
import { motSecretLevels } from './levels';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   MOT SECRET — React island. Motus-like: guess the hidden French word in 6 tries; the first
   letter is revealed, red square = right spot, yellow circle = elsewhere (French convention).
   Libre: nouveau mot à volonté. Défi du jour: même mot pour tous, classé au nombre d'essais.
   Engine pure/testée dans ./engine.
   ===================================================== */

type Status = 'playing' | 'won' | 'lost';
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
const LOSS_OFFSET = 100000; // daily: losers ranked after winners (cf. démineur/codecolor)
const KB = ['AZERTYUIOP', 'QSDFGHJKLM', '#WXCVBN<']; // # = Enter, < = Backspace
const HINT_EVERY = 30; // free mode: reveal one more letter every 30 s (disabled in the ranked daily)

interface DailyState { rows: GuessRow[]; current: string; status: Status; }
interface Msg { text: string; }

export default function MotSecretGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [solution, setSolution] = useState<string>(() => pickSolution(1, DIFFS.facile.len));
	const [rows, setRows] = useState<GuessRow[]>([]);
	const [current, setCurrent] = useState<string>(solution[0]);
	const [status, setStatus] = useState<Status>('playing');
	const [msg, setMsg] = useState<Msg | null>(null);
	const [shake, setShake] = useState(false);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [hintPos, setHintPos] = useState<Set<number>>(() => new Set());
	const [hintIn, setHintIn] = useState(HINT_EVERY);
	const [maxTries, setMaxTries] = useState(MAX_TRIES); // level mode may tighten the budget

	const hintPosRef = useRef<Set<number>>(new Set());
	const secToHintRef = useRef(HINT_EVERY);
	const solutionRef = useRef(solution);
	const rowsRef = useRef<GuessRow[]>([]);
	const currentRef = useRef(current);
	const statusRef = useRef<Status>('playing');
	const dailyRef = useRef(false);
	const startRef = useRef(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const maxTriesRef = useRef(MAX_TRIES);

	const lv = useLevels(gameId, motSecretLevels);
	const { celebrating } = useCelebration(status === 'won');
	const len = solution.length;
	const over = status !== 'playing';
	const bestGood = rows.reduce((m, r) => Math.max(m, r.states.filter((s) => s === 'good').length), 0);
	const cost = status === 'won' ? rows.length : LOSS_OFFSET + (len - bestGood);

	const setRowsBoth = (r: GuessRow[]): void => { rowsRef.current = r; setRows(r); };
	const setCurrentBoth = (c: string): void => { currentRef.current = c; setCurrent(c); };
	const setStatusBoth = (s: Status): void => { statusRef.current = s; setStatus(s); };
	const setSolutionBoth = (s: string): void => { solutionRef.current = s; setSolution(s); };
	const resetHints = (): void => { hintPosRef.current = new Set(); setHintPos(new Set()); secToHintRef.current = HINT_EVERY; setHintIn(HINT_EVERY); };

	const flash = (text: string): void => {
		if (msgTimer.current) clearTimeout(msgTimer.current);
		setMsg({ text });
		setShake(true); setTimeout(() => setShake(false), 350);
		msgTimer.current = setTimeout(() => setMsg(null), 1800);
	};

	const newGame = useCallback((key: keyof typeof DIFFS): void => {
		dailyRef.current = false;
		setDaily(false); setAlreadyPlayed(false);
		maxTriesRef.current = MAX_TRIES; setMaxTries(MAX_TRIES);
		setDiffKey(key);
		const s = pickSolution((Math.random() * 2 ** 31) >>> 0, DIFFS[key].len);
		setSolutionBoth(s);
		setRowsBoth([]); setCurrentBoth(s[0]);
		setStatusBoth('playing'); setMsg(null); resetHints();
		trackGame(gameId, 'game_started', { difficulty: key, mode: 'free' });
	}, [gameId]);

	const saveDaily = (nr: GuessRow[], cur: string, st: Status): void => {
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, { startedAt: startRef.current, done: st !== 'playing', seed: sd?.seed, diffIndex: sd?.diffIndex, state: { rows: nr, current: cur, status: st } satisfies DailyState });
	};

	const startDaily = useCallback(async (): Promise<void> => {
		dailyRef.current = true;
		setDaily(true); setMsg(null);
		maxTriesRef.current = MAX_TRIES; setMaxTries(MAX_TRIES);
		const lay = (seed: number, di: number): string => {
			const key = DIFF_ORDER[di] ?? 'facile';
			dailySeedRef.current = { seed, diffIndex: di };
			setDiffKey(key);
			const s = pickSolution(seed, DIFFS[key].len);
			setSolutionBoth(s);
			return s;
		};
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const s = lay(run.seed, run.diffIndex ?? 0);
			const st = (run.state as DailyState) ?? { rows: [], current: s[0], status: 'playing' };
			setRowsBoth(st.rows ?? []); setCurrentBoth(st.current || s[0]);
			setDailyLoading(false);
			startRef.current = run.startedAt;
			if (run.done) { setStatusBoth(st.status === 'lost' ? 'lost' : 'won'); setAlreadyPlayed(true); }
			else { setStatusBoth('playing'); setAlreadyPlayed(false); }
			return;
		}
		setAlreadyPlayed(false); setStatusBoth('playing');
		setRowsBoth([]); setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		const s = lay(seed, diffIndex);
		setCurrentBoth(s[0]);
		setDailyLoading(false);
		startRef.current = Date.now();
		trackGame(gameId, 'game_started', { mode: 'daily' });
		saveDaily([], s[0], 'playing');
	}, [gameId]);

	/* Levels mode: find a word from the level config (no chrono → no ready-gate). */
	const startLevel = useCallback((level: number): void => {
		const cfg = lv.play(level);
		dailyRef.current = false;
		setDaily(false); setAlreadyPlayed(false); setDailyLoading(false);
		maxTriesRef.current = cfg.tries; setMaxTries(cfg.tries);
		const s = pickSolution(cfg.seed, cfg.len);
		setSolutionBoth(s);
		setRowsBoth([]); setCurrentBoth(s[0]);
		setStatusBoth('playing'); setMsg(null); resetHints();
		trackGame(gameId, 'game_started', { difficulty: cfg.label, mode: 'levels' });
	}, [gameId, lv]);

	const armLevels = useCallback((): void => {
		dailyRef.current = false;
		setDaily(false);
		lv.enter();
	}, [lv]);

	// Levels is the default landing: resume at the next unlocked level (grid once all cleared).
	// A ?defi deep link opens the daily instead — skip auto-resume then.
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily') return;
		void lv.resume().then((next) => { if (next != null) startLevel(next); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* ---------- Input ---------- */
	const onKey = useCallback((ch: string): void => {
		if (statusRef.current !== 'playing' || dailyLoading) return;
		const sol = solutionRef.current;
		const cur = currentRef.current;
		if (ch === '<') {
			if (cur.length > 1) { // never erase the revealed first letter
				const next = cur.slice(0, -1);
				setCurrentBoth(next);
				if (dailyRef.current) saveDaily(rowsRef.current, next, 'playing');
			}
			return;
		}
		if (ch === '#') {
			if (cur.length < sol.length) { flash('Mot trop court'); return; }
			const check = isValidGuess(cur, sol);
			if (!check.ok) {
				flash(check.reason === 'dict' ? 'Mot inconnu' : check.reason === 'first' ? `Doit commencer par ${sol[0]}` : 'Mot trop court');
				return;
			}
			const nr = [...rowsRef.current, { guess: cur, states: evaluate(cur, sol) }];
			setRowsBoth(nr);
			const won = cur === sol;
			const lost = !won && nr.length >= maxTriesRef.current;
			const st: Status = won ? 'won' : lost ? 'lost' : 'playing';
			setStatusBoth(st);
			setCurrentBoth(sol[0]);
			if (dailyRef.current) saveDaily(nr, sol[0], st);
			if (won) trackGame(gameId, 'game_won');
			return;
		}
		if (cur.length < sol.length && /^[A-Z]$/.test(ch)) {
			const next = cur + ch;
			setCurrentBoth(next);
			if (dailyRef.current) saveDaily(rowsRef.current, next, 'playing');
		}
	}, [gameId, dailyLoading]);

	/* Physical keyboard. */
	useEffect(() => {
		const onDown = (e: KeyboardEvent): void => {
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			const t = e.target as HTMLElement | null;
			if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
			if (e.key === 'Enter') { onKey('#'); e.preventDefault(); return; }
			if (e.key === 'Backspace') { onKey('<'); e.preventDefault(); return; }
			const ch = e.key.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
			if (/^[A-Z]$/.test(ch)) onKey(ch);
		};
		window.addEventListener('keydown', onDown);
		return () => window.removeEventListener('keydown', onDown);
	}, [onKey]);

	/* Reveal one more not-yet-known letter (free mode helper). */
	const revealHint = useCallback((): void => {
		const sol = solutionRef.current;
		const known = new Set<number>([0]);
		for (const r of rowsRef.current) for (let i = 0; i < sol.length; i++) if (r.states[i] === 'good') known.add(i);
		for (const p of hintPosRef.current) known.add(p);
		const free: number[] = [];
		for (let i = 1; i < sol.length; i++) if (!known.has(i)) free.push(i);
		if (!free.length) return; // whole word already known
		const p = free[Math.floor(Math.random() * free.length)];
		const next = new Set(hintPosRef.current); next.add(p);
		hintPosRef.current = next; setHintPos(next);
	}, []);

	/* Free-mode countdown → reveal a letter every HINT_EVERY seconds. */
	useEffect(() => {
		if (daily || lv.active || status !== 'playing' || dailyLoading) return;
		secToHintRef.current = HINT_EVERY; setHintIn(HINT_EVERY);
		const id = setInterval(() => {
			secToHintRef.current -= 1;
			if (secToHintRef.current <= 0) { revealHint(); secToHintRef.current = HINT_EVERY; }
			setHintIn(secToHintRef.current);
		}, 1000);
		return () => clearInterval(id);
	}, [daily, lv.active, status, dailyLoading, solution, revealHint]);

	useEffect(() => { newGame('facile'); }, [newGame]);

	/* Levels: grade the finished run by guesses used (won → rows.length; lost → over budget). */
	useEffect(() => {
		if (!over || !lv.playing) return;
		lv.finish({ won: status === 'won', score: status === 'won' ? rows.length : maxTries + 1 });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [over, status]);

	/* ---------- Render ---------- */
	const hints = knownGood(rows, len, solution[0]);
	for (const p of hintPos) if (hints[p] == null) hints[p] = solution[p]; // overlay the timed reveals
	const known = bestKnown(rows);
	const fmt = (v: number): string =>
		v >= LOSS_OFFSET ? `❌ ${len - (v - LOSS_OFFSET)}/${len}` : `${v} essai${v > 1 ? 's' : ''}`;

	const renderCell = (r: number, c: number): React.ReactNode => {
		if (r < rows.length) {
			const st: LetterState = rows[r].states[c];
			return <div key={c} className={`ms-cell ${st}`}><span className="ms-in">{rows[r].guess[c]}</span></div>;
		}
		if (r === rows.length && !over) {
			const typed = c < current.length ? current[c] : null;
			const hint = hints[c];
			return (
				<div key={c} className={`ms-cell cur${c === current.length ? ' caret' : ''}`}>
					<span className={`ms-in${!typed && hint ? ' hint' : ''}`}>{typed ?? hint ?? ''}</span>
				</div>
			);
		}
		return <div key={c} className="ms-cell empty" />;
	};

	return (
		<div className="ms-root">
			<style>{CSS}</style>

			<ModeToggle
				daily={daily}
				onFree={() => { if (lv.active) { lv.exit(); newGame(diffKey); } else if (daily) newGame(diffKey); }}
				onDaily={() => { lv.exit(); startDaily(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

			{lv.active ? (
				<div className="ms-daily-tag">
					{lv.menu ? 'Progression — choisis un niveau' : `Niveau ${lv.level} · mot de ${len} lettres · ${maxTries} essais`}
				</div>
			) : daily ? (
				<div className="ms-daily-tag">{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label} (${len} lettres)`}</div>
			) : (
				<div className="ms-bar">
					<div className="ms-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button key={k} role="tab" aria-selected={diffKey === k} className={`ms-pill ${diffKey === k ? 'active' : ''}`} onClick={() => newGame(k)}>{DIFFS[k].label} · {DIFFS[k].len}</button>
						))}
					</div>
					<button className="ms-act" onClick={() => newGame(diffKey)}>↻ Nouveau mot</button>
				</div>
			)}

			{!daily && !lv.active && status === 'playing' && (
				<div className="ms-hintbar">💡 Prochain indice dans <strong>{hintIn}s</strong>{hintPos.size ? ` · ${hintPos.size} lettre${hintPos.size > 1 ? 's' : ''} révélée${hintPos.size > 1 ? 's' : ''}` : ''}</div>
			)}

			{lv.active && lv.menu ? (
			<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
			<div className="ms-playwrap">
				{celebrating && <Celebration />}
				<div className={`ms-board${shake ? ' shake' : ''}`} style={{ ['--len' as string]: len }}>
					{Array.from({ length: maxTries }, (_, r) => (
						<div key={r} className="ms-rowwrap">
							<div className="ms-row">{Array.from({ length: len }, (_, c) => renderCell(r, c))}</div>
							{r === rows.length && !over && (
								<button className="ms-rowok" onClick={() => onKey('#')} disabled={current.length < len || dailyLoading} aria-label="Valider ce mot">✓</button>
							)}
						</div>
					))}
				</div>
				{daily && dailyLoading && <div className="ms-overlay"><div className="ms-overlay-card">Préparation du défi…</div></div>}
				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={motSecretLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won ? `Trouvé en ${rows.length} essai${rows.length > 1 ? 's' : ''}` : `Le mot était ${solution}`}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
			</div>
			)}

			<div className="ms-msg" role="status">{msg?.text ?? ' '}</div>

			{status === 'lost' && !lv.active && <div className="ms-reveal">Le mot était <strong>{solution}</strong></div>}
			{status === 'won' && !lv.active && (
				<div className="ms-won">
					{daily
						? (alreadyPlayed ? <>Défi du jour déjà relevé · <strong>{fmt(rows.length)}</strong> — reviens demain&nbsp;!</> : <>🎉 Trouvé en <strong>{fmt(rows.length)}</strong>&nbsp;!</>)
						: <>🎉 Trouvé en <strong>{fmt(rows.length)}</strong>&nbsp;! <button className="ms-replay" onClick={() => newGame(diffKey)}>Nouveau mot</button></>}
				</div>
			)}
			{status === 'lost' && !daily && !lv.active && <button className="ms-replay" onClick={() => newGame(diffKey)}>Nouveau mot</button>}

			<div className="ms-kb" aria-label="Clavier">
				{KB.map((line, i) => (
					<div key={i} className="ms-kb-row">
						{line.split('').map((k) => {
							const wide = k === '#' || k === '<';
							const st = known[k];
							return (
								<button
									key={k}
									className={`ms-key${wide ? ' wide' : ''}${st ? ` ${st}` : ''}`}
									onClick={() => onKey(k)}
									disabled={over || dailyLoading}
									aria-label={k === '#' ? 'Valider' : k === '<' ? 'Effacer' : k}
								>{k === '#' ? '⏎' : k === '<' ? '⌫' : k}</button>
							);
						})}
					</div>
				))}
			</div>

			<p className="ms-help">
				Devine le mot en 6 essais : chaque essai doit être un mot français commençant par la lettre donnée.
				En mode libre, un <strong>indice</strong> révèle une lettre toutes les 30&nbsp;s.
				<span className="ms-legend"><i className="lg good" /> bien placée · <i className="lg present" /> présente · <i className="lg absent" /> absente</span>
			</p>

			{daily && <Leaderboard game={gameId} metric="time" submitValue={over && !alreadyPlayed ? cost : undefined} format={fmt} />}
			{!daily && !lv.active && <LeaderboardCorner game={gameId} metric="time" />}
		</div>
	);
}

const CSS = `
.ms-root { --ms-good: #d13a40; --ms-present: #e7bf34; width: 100%; max-width: 460px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.game-page.gf-full .ms-root { max-width: none; width: 100%; height: 100%; justify-content: center; }
.game-page.gf-full .ms-help { display: none; }
.ms-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.7rem; }
.ms-bar { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.7rem; }
.ms-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.ms-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.ms-pill.active { background: var(--accent-regular); color: var(--accent-text-over); border-color: var(--accent-regular); }
.ms-act { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.ms-act:hover { background: var(--gray-800); border-color: var(--accent-regular); color: var(--accent-regular); }
.ms-hintbar { font-size: 12.5px; color: var(--gray-300); background: var(--gray-900); border: 1px solid var(--gray-800); border-radius: 999px; padding: 4px 13px; margin-bottom: 0.6rem; }
.ms-hintbar strong { color: var(--accent-regular); font-variant-numeric: tabular-nums; }
.ms-playwrap { position: relative; width: 100%; display: flex; justify-content: center; }
.ms-board { display: flex; flex-direction: column; gap: 5px; }
.ms-board.shake { animation: ms-shake 0.35s; }
@keyframes ms-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-7px); } 50% { transform: translateX(6px); } 75% { transform: translateX(-3px); } }
.ms-rowwrap { position: relative; }
.ms-rowok { position: absolute; left: calc(100% + 8px); top: 50%; transform: translateY(-50%); width: 36px; height: 36px; border-radius: 50%; border: none; background: var(--accent-regular); color: var(--accent-text-over); font-size: 17px; font-weight: 800; cursor: pointer; box-shadow: var(--shadow-sm); }
.ms-rowok:disabled { opacity: 0.35; cursor: not-allowed; }
.ms-row { display: grid; grid-template-columns: repeat(var(--len), 1fr); gap: 5px; }
.ms-cell { width: clamp(32px, calc((100vw - 110px) / var(--len)), 52px); aspect-ratio: 1; background: var(--gray-800); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.ms-cell.empty { opacity: 0.55; }
.ms-cell.cur { background: var(--gray-999); border: 2px solid var(--gray-700); }
.ms-cell.cur.caret { border-color: var(--accent-regular); }
.ms-in { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-weight: 800; font-size: clamp(16px, 4.5vw, 24px); }
.ms-in.hint { color: var(--gray-500); font-weight: 600; }
.ms-cell.good { background: var(--ms-good); }
.ms-cell.good .ms-in { color: #fff; }
.ms-cell.present { background: var(--gray-800); }
.ms-cell.present .ms-in { background: var(--ms-present); color: #3a2f00; border-radius: 50%; width: 78%; height: 78%; }
.ms-cell.absent .ms-in { color: var(--gray-400); }
.ms-msg { min-height: 20px; margin-top: 0.6rem; font-weight: 700; font-size: 13.5px; color: #e0484d; text-align: center; }
.ms-reveal { margin-top: 0.2rem; font-size: 15px; color: var(--gray-200); }
.ms-reveal strong { color: var(--accent-regular); letter-spacing: 1px; }
.ms-won { text-align: center; font-size: 16px; color: var(--gray-0); margin-top: 0.4rem; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.ms-won strong { color: var(--accent-regular); }
.ms-replay { border: none; background: var(--accent-regular); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 24px; cursor: pointer; margin-top: 0.4rem; }
.ms-kb { width: 100%; max-width: 430px; display: flex; flex-direction: column; gap: 6px; margin-top: 0.8rem; }
.ms-kb-row { display: flex; gap: 5px; justify-content: center; }
.ms-key { flex: 1; max-width: 42px; height: 46px; border: none; border-radius: 7px; background: var(--gray-700); color: var(--gray-0); font: inherit; font-weight: 700; font-size: 14.5px; cursor: pointer; padding: 0; touch-action: manipulation; }
.ms-key.wide { max-width: 58px; flex: 1.4; font-size: 17px; }
.ms-key.good { background: var(--ms-good); color: #fff; }
.ms-key.present { background: var(--ms-present); color: #3a2f00; }
.ms-key.absent { background: var(--gray-900); color: var(--gray-500); }
.ms-key:disabled { opacity: 0.5; cursor: not-allowed; }
.ms-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; }
.ms-overlay-card { background: var(--gray-999); border: 2px solid var(--accent-regular); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); color: var(--gray-300); text-align: center; }
.ms-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.6; margin-top: 1rem; }
.ms-legend { display: block; margin-top: 4px; }
.lg { display: inline-block; width: 11px; height: 11px; margin-right: 3px; vertical-align: -1px; }
.lg.good { background: var(--ms-good); border-radius: 3px; }
.lg.present { background: var(--ms-present); border-radius: 50%; }
.lg.absent { background: var(--gray-700); border-radius: 3px; }
`;
