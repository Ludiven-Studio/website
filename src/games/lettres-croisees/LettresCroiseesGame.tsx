import { useState, useEffect, useRef, useCallback } from 'react';
import { fmtCentis } from '../../lib/scoreFormat';
import { generatePuzzle, DIFFS, type Puzzle } from './engine';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';
import { useLevels } from '../../lib/useLevels';
import { lettresCroiseesLevels } from './levels';
import { touchDrag } from '../touchDrag';

/* =====================================================
   LETTRES CROISÉES — React island. Wordscapes-style: compose words from a letter wheel;
   they fill a small crossword grid. Extra valid words count as bonus.
   Libre: nouvelle grille à volonté. Défi du jour: même grille pour tous, au chrono.
   Engine pure/testée dans ./engine.
   ===================================================== */

type Status = 'playing' | 'won';
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
const HINT_COOLDOWN_S = 30; // one grid word revealed at most every 30 s
const ck = (r: number, c: number): string => `${r},${c}`;

interface DailyState { found: string[]; bonusFound: string[]; }
interface Toast { msg: string; kind: 'ok' | 'bonus' | 'dup' | 'bad'; }

const wordCells = (w: Puzzle['words'][number]): string[] =>
	Array.from({ length: w.word.length }, (_, i) => ck(w.row + (w.dir === 'v' ? i : 0), w.col + (w.dir === 'h' ? i : 0)));

export default function LettresCroiseesGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<Puzzle>(() => generatePuzzle(1, DIFFS.facile));
	const [letters, setLetters] = useState<string[]>(puzzle.letters);
	const [found, setFound] = useState<string[]>([]);
	const [bonusFound, setBonusFound] = useState<string[]>([]);
	const [sel, setSel] = useState<number[]>([]);
	const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null);
	const [status, setStatus] = useState<Status>('playing');
	const [toast, setToast] = useState<Toast | null>(null);
	const [shake, setShake] = useState(false);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [started, setStarted] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const [hintLeft, setHintLeft] = useState(HINT_COOLDOWN_S);

	const wheelRef = useRef<HTMLDivElement | null>(null);
	const dragging = useRef(false);
	const dragMoved = useRef(false);
	const selRef = useRef<number[]>([]);
	const lettersRef = useRef<string[]>(letters);
	const foundRef = useRef<string[]>([]);
	const bonusRef = useRef<string[]>([]);
	const puzzleRef = useRef<Puzzle>(puzzle);
	const dailyRef = useRef(false);
	const startRef = useRef(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const revealDelay = useRef<Map<string, number>>(new Map());
	const hintReadyAt = useRef(0);
	const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lv = useLevels(gameId, lettresCroiseesLevels);

	const { celebrating } = useCelebration(status === 'won');
	const armed = (daily || lv.playing) && !started;
	const total = puzzle.words.length;

	/* Daily chrono. */
	useEffect(() => {
		if (!daily || !started || status !== 'playing') return;
		const id = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 10)), 50);
		return () => clearInterval(id);
	}, [daily, started, status]);

	/* Hint cooldown ticker. */
	useEffect(() => {
		if (status !== 'playing' || armed) return;
		const tick = (): void => setHintLeft(Math.max(0, Math.ceil((hintReadyAt.current - Date.now()) / 1000)));
		tick();
		const id = setInterval(tick, 500);
		return () => clearInterval(id);
	}, [status, armed, puzzle]);

	const armHint = (): void => {
		hintReadyAt.current = Date.now() + HINT_COOLDOWN_S * 1000;
		setHintLeft(HINT_COOLDOWN_S);
	};

	const setSelBoth = (s: number[]): void => { selRef.current = s; setSel(s); };
	const setFoundBoth = (f: string[]): void => { foundRef.current = f; setFound(f); };
	const setBonusBoth = (b: string[]): void => { bonusRef.current = b; setBonusFound(b); };
	const setLettersBoth = (l: string[]): void => { lettersRef.current = l; setLetters(l); };

	const flash = (msg: string, kind: Toast['kind']): void => {
		if (toastTimer.current) clearTimeout(toastTimer.current);
		setToast({ msg, kind });
		toastTimer.current = setTimeout(() => setToast(null), 1400);
	};

	const applyPuzzle = (p: Puzzle): void => {
		puzzleRef.current = p; setPuzzle(p);
		setLettersBoth(p.letters);
		revealDelay.current = new Map();
		setSelBoth([]); setFoundBoth([]); setBonusBoth([]);
		setToast(null);
	};

	const newGame = useCallback((key: keyof typeof DIFFS): void => {
		dailyRef.current = false;
		setDaily(false); setStarted(false); setAlreadyPlayed(false);
		setDiffKey(key); setElapsed(0);
		applyPuzzle(generatePuzzle((Math.random() * 2 ** 31) >>> 0, DIFFS[key]));
		setStatus('playing');
		armHint();
		trackGame(gameId, 'game_started', { difficulty: key, mode: 'free' });
	}, [gameId]);

	const startDaily = useCallback(async (): Promise<void> => {
		dailyRef.current = true;
		setDaily(true); setSelBoth([]);
		const lay = (seed: number, di: number): Puzzle => {
			const key = DIFF_ORDER[di] ?? 'facile';
			dailySeedRef.current = { seed, diffIndex: di };
			setDiffKey(key);
			const p = generatePuzzle(seed, DIFFS[key]);
			applyPuzzle(p);
			return p;
		};
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const p = lay(run.seed, run.diffIndex ?? 0);
			const st = (run.state as DailyState) ?? { found: [], bonusFound: [] };
			// re-mark found cells without replay animation
			for (const w of p.words) if ((st.found ?? []).includes(w.word)) wordCells(w).forEach((k) => revealDelay.current.set(k, 0));
			setFoundBoth(st.found ?? []); setBonusBoth(st.bonusFound ?? []);
			setDailyLoading(false); setStarted(true);
			if (run.done) { setStatus('won'); setAlreadyPlayed(true); setElapsed(run.finalTime ?? 0); }
			else { setStatus('playing'); setAlreadyPlayed(false); startRef.current = run.startedAt; setElapsed(Math.round((Date.now() - run.startedAt) / 10)); armHint(); }
			return;
		}
		setAlreadyPlayed(false); setStatus('playing'); setStarted(false);
		setElapsed(0); setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		lay(seed, diffIndex);
		setDailyLoading(false);
	}, [gameId]);

	const startTimer = useCallback((): void => {
		const now = Date.now();
		startRef.current = now; setStarted(true); setElapsed(0);
		armHint();
		trackGame(gameId, 'game_started', { mode: 'daily' });
		if (daily) {
			const sd = dailySeedRef.current;
			saveDailyRun(gameId, { startedAt: now, done: false, seed: sd?.seed, diffIndex: sd?.diffIndex, state: { found: [], bonusFound: [] } satisfies DailyState });
		}
	}, [gameId, daily]);

	const saveDaily = (nf: string[], nb: string[], complete: boolean, finalTime?: number): void => {
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, { startedAt: startRef.current, done: complete, finalTime, seed: sd?.seed, diffIndex: sd?.diffIndex, state: { found: nf, bonusFound: nb } satisfies DailyState });
	};

	/* ---------- Levels mode ---------- */
	const startLevel = useCallback((level: number): void => {
		const cfg = lv.play(level);
		dailyRef.current = false;
		setDaily(false); setAlreadyPlayed(false);
		setDiffKey('facile');
		applyPuzzle(generatePuzzle(cfg.seed, cfg.diff));
		setStatus('playing');
		setStarted(false); setElapsed(0);
		armHint();
		trackGame(gameId, 'game_started', { mode: 'levels', level });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv, gameId]);

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

	/* Levels chrono. */
	useEffect(() => {
		if (!lv.playing || !started || status !== 'playing') return;
		const id = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 10)), 50);
		return () => clearInterval(id);
	}, [lv.playing, started, status]);

	/* Grade the level once every grid word is filled. */
	useEffect(() => {
		if (!lv.playing || status !== 'won') return;
		lv.finish({ won: true, score: Math.round((Date.now() - startRef.current) / 10) });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv.playing, status]);

	/* ---------- Reveal a grid word (correct submit or hint) ---------- */
	const revealGridWord = (word: string): void => {
		const p = puzzleRef.current;
		const grid = p.words.find((w) => w.word === word);
		if (!grid || foundRef.current.includes(word)) return;
		wordCells(grid).forEach((k, i) => { if (!revealDelay.current.has(k)) revealDelay.current.set(k, i * 40); });
		const nf = [...foundRef.current, word];
		setFoundBoth(nf);
		const complete = nf.length === p.words.length;
		if (dailyRef.current) {
			const finalTime = complete ? Math.round((Date.now() - startRef.current) / 10) : undefined;
			saveDaily(nf, bonusRef.current, complete, finalTime);
			if (complete) { setElapsed(finalTime!); setStatus('won'); trackGame(gameId, 'game_won'); }
		} else if (complete) { setStatus('won'); trackGame(gameId, 'game_won'); }
	};

	/* ---------- Submit a composed word ---------- */
	const submitWord = (word: string): void => {
		const p = puzzleRef.current;
		if (word.length < 3) return;
		if (p.words.some((w) => w.word === word) && !foundRef.current.includes(word)) {
			revealGridWord(word);
			return;
		}
		if (foundRef.current.includes(word) || bonusRef.current.includes(word)) { flash('Déjà trouvé', 'dup'); return; }
		if (p.bonus.includes(word)) {
			const nb = [...bonusRef.current, word];
			setBonusBoth(nb);
			if (dailyRef.current) saveDaily(foundRef.current, nb, false);
			flash('✨ Mot bonus !', 'bonus');
			return;
		}
		setShake(true); setTimeout(() => setShake(false), 350);
	};

	/* ---------- Wheel pointer handling ---------- */
	const wheelIndexAt = (clientX: number, clientY: number): number | null => {
		const el = wheelRef.current; if (!el) return null;
		const rect = el.getBoundingClientRect();
		const x = ((clientX - rect.left) / rect.width) * 100;
		const y = ((clientY - rect.top) / rect.height) * 100;
		const n = lettersRef.current.length;
		let best = -1, bestD = Infinity;
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2 - Math.PI / 2;
			const cx = 50 + 36 * Math.cos(a), cy = 50 + 36 * Math.sin(a);
			const d = Math.hypot(x - cx, y - cy);
			if (d < bestD) { bestD = d; best = i; }
		}
		return bestD <= 13 ? best : null; // dead zone between letters
	};
	const wheelPos = (clientX: number, clientY: number): { x: number; y: number } | null => {
		const el = wheelRef.current; if (!el) return null;
		const rect = el.getBoundingClientRect();
		return { x: ((clientX - rect.left) / rect.width) * 100, y: ((clientY - rect.top) / rect.height) * 100 };
	};
	const startDrag = (clientX: number, clientY: number): void => {
		if (armed || status !== 'playing') return;
		dragging.current = true; dragMoved.current = false;
		const idx = wheelIndexAt(clientX, clientY);
		if (idx != null && !selRef.current.includes(idx)) { setSelBoth([...selRef.current, idx]); dragMoved.current = selRef.current.length > 0; }
		setLivePos(wheelPos(clientX, clientY));
	};
	const moveDrag = (clientX: number, clientY: number): void => {
		if (!dragging.current) return;
		setLivePos(wheelPos(clientX, clientY));
		const idx = wheelIndexAt(clientX, clientY);
		if (idx == null) return;
		const s = selRef.current;
		if (s.length && idx === s[s.length - 1]) return;
		if (s.length >= 2 && idx === s[s.length - 2]) { setSelBoth(s.slice(0, -1)); dragMoved.current = true; return; } // backtrack
		if (!s.includes(idx)) { setSelBoth([...s, idx]); if (s.length) dragMoved.current = true; }
	};
	const endDrag = (): void => {
		if (!dragging.current) return;
		dragging.current = false;
		setLivePos(null);
		if (dragMoved.current) {
			const word = selRef.current.map((i) => lettersRef.current[i]).join('');
			setSelBoth([]);
			submitWord(word);
		}
		// simple tap: keep the selection (tap-to-compose mode, ✓ to submit)
	};
	const onWheelDown = (e: React.PointerEvent): void => {
		if (e.pointerType === 'touch') return;
		startDrag(e.clientX, e.clientY);
		wheelRef.current?.setPointerCapture(e.pointerId);
		e.preventDefault();
	};
	const onWheelMove = (e: React.PointerEvent): void => {
		if (e.pointerType === 'touch') return;
		moveDrag(e.clientX, e.clientY);
	};
	const onWheelUp = (e?: React.PointerEvent): void => {
		if (e && e.pointerType === 'touch') return;
		endDrag();
	};

	/* Hint: reveal the shortest unfound grid word (30 s cooldown — self-penalizing on the chrono). */
	const revealHint = (): void => {
		if (status !== 'playing' || armed || Date.now() < hintReadyAt.current) return;
		const unfound = puzzleRef.current.words
			.filter((w) => !foundRef.current.includes(w.word))
			.sort((a, b) => a.word.length - b.word.length);
		if (!unfound.length) return;
		armHint();
		flash(`💡 ${unfound[0].word}`, 'bonus');
		revealGridWord(unfound[0].word);
	};

	const tapSubmit = (): void => {
		const word = selRef.current.map((i) => lettersRef.current[i]).join('');
		setSelBoth([]);
		submitWord(word);
	};
	const shuffleWheel = (): void => {
		setSelBoth([]);
		const l = lettersRef.current.slice();
		for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
		setLettersBoth(l);
	};

	useEffect(() => { newGame('facile'); }, [newGame]);

	/* ---------- Render ---------- */
	const cellLetter = new Map<string, string>();
	const cellOn = new Set<string>();
	for (const w of puzzle.words) {
		const cells = wordCells(w);
		cells.forEach((k, i) => cellLetter.set(k, w.word[i]));
		if (found.includes(w.word)) cells.forEach((k) => cellOn.add(k));
	}
	const n = letters.length;
	const centers = letters.map((_, i) => {
		const a = (i / n) * Math.PI * 2 - Math.PI / 2;
		return { x: 50 + 36 * Math.cos(a), y: 50 + 36 * Math.sin(a) };
	});
	const preview = sel.map((i) => letters[i]).join('');
	const cellPx = Math.min(44, Math.floor(340 / puzzle.cols));

	return (
		<div className="lc-root">
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
				<>
					<div className="lc-daily-tag">
						{lv.menu ? 'Progression — remplis la grille pour débloquer le niveau suivant' : `Niveau ${lv.level} · ${total} mots`}
					</div>
					{!lv.menu && (
						<div className="lc-status">
							<span className="lc-count">{found.length}/{total} mots</span>
							<span className="lc-bonus">✨ {bonusFound.length}</span>
							<span className="lc-time">⏱ {fmtCentis(elapsed)}</span>
						</div>
					)}
				</>
			) : daily ? (
				<>
					<div className="lc-daily-tag">{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}</div>
					<div className="lc-status">
						<span className="lc-count">{found.length}/{total} mots</span>
						<span className="lc-bonus">✨ {bonusFound.length}</span>
						<span className="lc-time">⏱ {fmtCentis(elapsed)}</span>
					</div>
				</>
			) : (
				<>
					<div className="lc-bar">
						<div className="lc-pills" role="tablist" aria-label="Difficulté">
							{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
								<button key={k} role="tab" aria-selected={diffKey === k} className={`lc-pill ${diffKey === k ? 'active' : ''}`} onClick={() => newGame(k)}>{DIFFS[k].label}</button>
							))}
						</div>
						<button className="lc-act" onClick={() => newGame(diffKey)}>↻ Nouvelle grille</button>
					</div>
					<div className="lc-status">
						<span className="lc-count">{found.length}/{total} mots</span>
						<span className="lc-bonus">✨ {bonusFound.length} bonus</span>
					</div>
				</>
			)}

			{lv.active && lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
				<div className="lc-playwrap">
				{celebrating && <Celebration />}
				<div className={`lc-play ${armed ? 'blurred' : ''}`}>
					<div className="lc-gridcol">
					<div className="lc-grid" style={{ gridTemplateColumns: `repeat(${puzzle.cols}, ${cellPx}px)`, gridTemplateRows: `repeat(${puzzle.rows}, ${cellPx}px)` }}>
						{Array.from({ length: puzzle.rows }, (_, r) => Array.from({ length: puzzle.cols }, (_, c) => {
							const k = ck(r, c);
							const letter = cellLetter.get(k);
							if (letter == null) return <div key={k} />;
							const on = cellOn.has(k);
							return (
								<div key={k} className={`lc-cell${on ? ' on' : ''}`} style={on ? { animationDelay: `${revealDelay.current.get(k) ?? 0}ms` } : undefined}>
									{on ? letter : ''}
								</div>
							);
						}))}
					</div>
					</div>

					<div className="lc-controlscol">
					<div className={`lc-preview-row`}>
						<div className={`lc-preview${shake ? ' shake' : ''}${toast?.kind === 'bonus' ? ' gold' : ''}`}>
							{toast ? toast.msg : preview || ' '}
						</div>
						{!dragging.current && sel.length >= 3 && <button className="lc-mini ok" onClick={tapSubmit}>✓</button>}
						{!dragging.current && sel.length > 0 && <button className="lc-mini" onClick={() => setSelBoth([])}>✕</button>}
					</div>

					<div className="lc-wheelwrap">
						<div
							ref={wheelRef}
							className="lc-wheel"
							{...touchDrag(startDrag, moveDrag, endDrag)}
							onPointerDown={onWheelDown}
							onPointerMove={onWheelMove}
							onPointerUp={onWheelUp}
							onPointerCancel={onWheelUp}
						>
							<svg className="lc-trail" viewBox="0 0 100 100" aria-hidden="true">
								{sel.length > 0 && (
									<polyline
										points={[...sel.map((i) => `${centers[i].x},${centers[i].y}`), ...(livePos ? [`${livePos.x},${livePos.y}`] : [])].join(' ')}
									/>
								)}
							</svg>
							{letters.map((l, i) => (
								<div
									key={i}
									className={`lc-letter${sel.includes(i) ? ' sel' : ''}`}
									style={{ left: `${centers[i].x}%`, top: `${centers[i].y}%` }}
								>{l}</div>
							))}
						</div>
						<button className="lc-shuffle" onClick={shuffleWheel} disabled={armed || status !== 'playing'} aria-label="Mélanger les lettres">🔀</button>
					</div>

					{!lv.active && (
						<button className="lc-hint" onClick={revealHint} disabled={armed || status !== 'playing' || hintLeft > 0}>
							💡 Indice{status === 'playing' && !armed && hintLeft > 0 ? ` · ${hintLeft}s` : ''}
						</button>
					)}
					</div>
				</div>

				{daily && dailyLoading && <div className="lc-overlay"><div className="lc-overlay-card">Préparation du défi…</div></div>}
				{armed && !dailyLoading && status !== 'won' && (
					<div className="lc-overlay"><div className="lc-overlay-card start">
						<h3>Prêt&nbsp;?</h3>
						<p>Le chrono démarre dès que tu commences.</p>
						<button className="lc-startbtn" onClick={startTimer}>{lv.playing ? `▶ Niveau ${lv.level} — Commencer` : '▶ Commencer'}</button>
					</div></div>
				)}

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={lettresCroiseesLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won ? `Grille remplie en ${fmtCentis(elapsed)}` : undefined}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
				</div>
			)}

			{daily && status === 'won' && (
				<div className="lc-won">{alreadyPlayed
					? <>Défi du jour déjà relevé · <strong>{fmtCentis(elapsed)}</strong> — reviens demain&nbsp;!</>
					: <>🎉 Grille remplie en <strong>{fmtCentis(elapsed)}</strong>&nbsp;!{bonusFound.length > 0 && <> ✨ {bonusFound.length} mot{bonusFound.length > 1 ? 's' : ''} bonus</>}</>}</div>
			)}
			{!daily && !lv.active && status === 'won' && (
				<div className="lc-won">🎉 Grille remplie&nbsp;! <button className="lc-replay" onClick={() => newGame(diffKey)}>Nouvelle grille</button></div>
			)}

			<p className="lc-help">
				Glisse d'une lettre à l'autre (ou tape-les une à une) pour composer un mot, et remplis la grille croisée.
				Tous les mots utilisent uniquement les lettres de la roue. Les autres mots valides comptent en bonus ✨.
			</p>

			{daily && <Leaderboard game={gameId} metric="time" submitValue={status === 'won' && !alreadyPlayed ? elapsed : undefined} />}
			{!daily && !lv.active && <LeaderboardCorner game={gameId} metric="time" />}
		</div>
	);
}

const CSS = `
.lc-root { --lc: var(--accent-regular); width: 100%; max-width: 460px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
/* Room for the side-by-side wheel + grid layout. */
@media (min-width: 760px) { .lc-root { max-width: 820px; } }
.game-page.gf-full .lc-root { max-width: none; width: 100%; height: 100%; justify-content: center; }
.game-page.gf-full .lc-help { display: none; }
.lc-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.6rem; }
.lc-bar { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
.lc-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.lc-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.lc-pill.active { background: var(--lc); color: var(--accent-text-over); border-color: var(--lc); }
.lc-act { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.lc-act:hover { background: var(--gray-800); border-color: var(--lc); color: var(--lc); }
.lc-status { display: flex; gap: 0.5rem; align-items: center; font-weight: 700; font-size: 13px; margin-bottom: 0.7rem; }
.lc-count, .lc-time, .lc-bonus { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; font-variant-numeric: tabular-nums; }
.lc-bonus { color: #eec95c; }
.lc-playwrap { width: 100%; position: relative; display: flex; justify-content: center; }
.lc-play { width: 100%; display: flex; flex-direction: column; align-items: center; }
.lc-play.blurred { filter: blur(5px); opacity: 0.5; pointer-events: none; }
.lc-gridcol { display: flex; align-items: center; justify-content: center; }
.lc-controlscol { width: 100%; display: flex; flex-direction: column; align-items: center; }
/* Wide screens: letter wheel to the LEFT of the crossword so it all fits without scrolling. */
@media (min-width: 760px) {
	.lc-play { flex-direction: row; align-items: center; justify-content: center; gap: 2.5rem; }
	.lc-controlscol { order: -1; width: auto; }
	.lc-gridcol { flex: 0 0 auto; }
}
.lc-grid { display: grid; gap: 3px; justify-content: center; }
.lc-cell { background: var(--gray-800); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #fff; font-size: clamp(13px, 4.2vw, 22px); }
.lc-cell.on { background: var(--lc); color: var(--accent-text-over); animation: lc-pop 0.35s ease both; }
@keyframes lc-pop { 0% { transform: scale(0.4); opacity: 0.2; } 65% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }
.lc-preview-row { display: flex; align-items: center; gap: 8px; margin: 0.7rem 0 0.2rem; min-height: 40px; }
.lc-preview { min-width: 120px; text-align: center; background: var(--gray-900); border: 1.5px solid var(--gray-700); border-radius: 999px; padding: 7px 18px; font-weight: 800; font-size: 17px; letter-spacing: 2px; }
.lc-preview.gold { border-color: #eec95c; color: #eec95c; }
.lc-preview.shake { animation: lc-shake 0.35s; border-color: #e0484d; }
@keyframes lc-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 50% { transform: translateX(5px); } 75% { transform: translateX(-3px); } }
.lc-mini { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 800; font-size: 15px; border-radius: 999px; width: 38px; height: 38px; cursor: pointer; }
.lc-mini.ok { background: var(--lc); border-color: var(--lc); color: var(--accent-text-over); }
.lc-wheelwrap { position: relative; width: min(64vw, 250px); }
.lc-wheel { position: relative; width: 100%; aspect-ratio: 1; background: var(--gray-900); border: 2px solid var(--gray-800); border-radius: 50%; touch-action: none; user-select: none; -webkit-user-select: none; }
.lc-trail { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.lc-trail polyline { fill: none; stroke: var(--lc); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; opacity: 0.85; }
.lc-letter { position: absolute; width: 22%; aspect-ratio: 1; transform: translate(-50%, -50%); background: var(--gray-999); border: 2px solid var(--gray-700); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: clamp(17px, 6vw, 26px); color: var(--gray-0); pointer-events: none; }
.lc-letter.sel { background: var(--lc); border-color: var(--lc); color: var(--accent-text-over); }
.lc-shuffle { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0); font-size: 17px; border-radius: 50%; width: 44px; height: 44px; cursor: pointer; }
.lc-shuffle:disabled { opacity: 0.4; cursor: not-allowed; }
.lc-hint { margin-top: 0.7rem; border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13.5px; border-radius: 999px; padding: 8px 18px; cursor: pointer; font-variant-numeric: tabular-nums; }
.lc-hint:not(:disabled):hover { border-color: #eec95c; color: #eec95c; }
.lc-hint:disabled { opacity: 0.45; cursor: not-allowed; }
.lc-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; }
.lc-overlay-card { background: var(--gray-999); border: 2px solid var(--lc); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); color: var(--gray-300); text-align: center; }
.lc-overlay-card.start h3 { margin: 0 0 0.4rem; font-family: var(--font-brand); color: var(--gray-0); font-size: var(--text-xl); }
.lc-overlay-card.start p { margin: 0 0 0.8rem; font-size: 13px; }
.lc-startbtn { border: none; background: var(--lc); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 17px; border-radius: 999px; padding: 12px 34px; cursor: pointer; box-shadow: var(--shadow-lg); }
.lc-won { text-align: center; font-size: 16px; color: var(--gray-0); margin-top: 1rem; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.lc-won strong { color: var(--lc); font-variant-numeric: tabular-nums; }
.lc-replay { border: none; background: var(--lc); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 24px; cursor: pointer; }
.lc-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1rem; }
`;
