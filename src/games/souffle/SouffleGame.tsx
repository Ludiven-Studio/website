import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { trackGame } from '../../lib/analytics';
import { isTypingTarget } from '../../lib/keyboard';
import Celebration, { useCelebration } from '../../components/Celebration';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import ModeToggle from '../../components/ModeToggle';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import { DAILY_LB } from '../../data/dailyLb';
import { formatScore, fmtCentis, encodePacked } from '../../lib/scoreFormat';
import { useLevels } from '../../lib/useLevels';
import { usePlayClock } from '../../lib/usePlayClock';
import { mulberry32 } from '../prng';
import { usePointerDrag } from '../usePointerDrag';
import { souffleLevels } from './levels';
import {
	SOUFFLE_BANDS,
	applyGust,
	flowersLeft,
	generateSouffle,
	glide,
	isWon,
	startState,
	type Dir,
	type SoufflePuzzle,
	type SouffleState,
} from './engine';

/* =====================================================
   SOUFFLE — React island.
   Swipe = one gust: the feather glides until the first rock or the hedge, brushing
   every flower on the way; ghost feathers preview (and play) each landing.
   Modes: levels 1-100 (gusts vs par), daily (gusts + chrono tiebreak), free play.
   ===================================================== */

const GAME_ID = 'souffle';

/* Daily-run state is versioned: bump with the generator or the bands, so a state
   saved under an older deal is discarded instead of decoded onto a different grid. */
const GEN_V = 1;

const TIERS = ['Brise', 'Vent', 'Tempête'];
const DIR_NAME = ['le haut', 'la droite', 'le bas', 'la gauche'];

const KEY_DIRS: Record<string, Dir | undefined> = {
	ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3,
	z: 0, w: 0, d: 1, s: 2, q: 3, a: 3,
};

/** Deterministic bloom per cell, so the meadow looks alive without any state. */
const BLOOM = ['🌼', '🌸', '🌺'];
const bloomAt = (idx: number): string => BLOOM[(idx * 7 + 3) % BLOOM.length];

interface Pop { id: number; idx: number; glyph: string }
interface Gust { id: number; idx: number; axis: 'h' | 'v' }

interface DailyState { v?: number; pos?: number; flowers?: number[]; gusts?: number }

export default function SouffleGame() {
	const [puzzle, setPuzzle] = useState<SoufflePuzzle | null>(null);
	const [hist, setHist] = useState<SouffleState[]>([]);
	const [diff, setDiff] = useState(0);
	const [pops, setPops] = useState<Pop[]>([]);
	const [gusts, setGusts] = useState<Gust[]>([]);
	const [shake, setShake] = useState(0); // a refused gust wobbles the feather
	const [glideMs, setGlideMs] = useState(300);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [started, setStarted] = useState(false); // daily ready-gate
	const [elapsed, setElapsed] = useState(0); // centis, daily chrono (tiebreak)

	const idRef = useRef(0);
	const shakeRef = useRef(0);
	const histRef = useRef(hist);
	histRef.current = hist;
	const puzzleRef = useRef(puzzle);
	puzzleRef.current = puzzle;
	const seedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const startRef = useRef(0);
	const finalRef = useRef(0); // chrono at the daily win
	const lv = useLevels(GAME_ID, souffleLevels);

	const cur: SouffleState | null = hist.length ? hist[hist.length - 1] : null;
	const won = cur ? isWon(cur) : false;

	const gated = daily && !started && !alreadyPlayed;
	const locked = dailyLoading || gated || (daily && alreadyPlayed);
	const lockedRef = useRef(locked);
	lockedRef.current = locked;

	const deal = useCallback((p: SoufflePuzzle, resume?: SouffleState) => {
		setPuzzle(p);
		setHist([resume ?? startState(p)]);
		setPops([]);
		setGusts([]);
	}, []);

	const newGame = useCallback((d: number) => {
		setDaily(false);
		setAlreadyPlayed(false);
		setDiff(d);
		deal(generateSouffle(mulberry32((Math.floor(Math.random() * 0xffffffff)) || 1), SOUFFLE_BANDS[d] ?? SOUFFLE_BANDS[0]));
		trackGame(GAME_ID, 'game_started');
	}, [deal]);

	useEffect(() => { newGame(0); }, [newGame]);

	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		setDaily(false);
		deal(generateSouffle(mulberry32(cfg.seed), cfg));
		trackGame(GAME_ID, 'game_started');
	}, [lv, deal]);

	const armLevels = useCallback(() => {
		setDaily(false);
		lv.enter();
	}, [lv]);

	// Levels is the default landing: resume at the next unlocked level.
	// A ?defi deep link opens the daily instead (ModeToggle fires it) — skip auto-resume then.
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily') return;
		void lv.resume().then((next) => { if (next != null) startLevel(next); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* Daily challenge: one attempt per device, resumable mid-run. Server seed + difficulty. */
	const startDaily = useCallback(async () => {
		if (lv.active) lv.exit();
		setDaily(true);
		const build = (seed: number, diffIndex: number): SoufflePuzzle =>
			generateSouffle(mulberry32(seed), SOUFFLE_BANDS[diffIndex] ?? SOUFFLE_BANDS[0]);

		const run = loadDailyRun(GAME_ID);
		if (run && run.seed != null) {
			const diffIndex = run.diffIndex ?? 0;
			seedRef.current = { seed: run.seed, diffIndex };
			const p = build(run.seed, diffIndex);
			const s = run.state as DailyState | undefined;
			const kept = new Set(s?.flowers ?? []);
			const resumed: SouffleState | undefined = s?.v === GEN_V && s.pos != null
				? { pos: s.pos, flowers: p.flowers.map((_, i) => kept.has(i)), gusts: s.gusts ?? 0 }
				: undefined;
			setDailyLoading(false);
			setStarted(true);
			deal(p, resumed);
			if (run.done) {
				setAlreadyPlayed(true);
				finalRef.current = run.finalTime ?? 0;
				setElapsed(finalRef.current);
			} else {
				setAlreadyPlayed(false);
				startRef.current = run.startedAt;
				setElapsed(Math.round((Date.now() - run.startedAt) / 10));
			}
			return;
		}

		setAlreadyPlayed(false);
		setStarted(false);
		setElapsed(0);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(GAME_ID);
		seedRef.current = { seed, diffIndex };
		deal(build(seed, diffIndex));
		setDailyLoading(false);
	}, [lv, deal]);

	/* Commencer: consumes the attempt and starts the tiebreak chrono. */
	const startTimer = useCallback(() => {
		const now = Date.now();
		startRef.current = now;
		setStarted(true);
		setElapsed(0);
		trackGame(GAME_ID, 'game_started');
		const sd = seedRef.current;
		saveDailyRun(GAME_ID, { startedAt: now, done: false, seed: sd?.seed, diffIndex: sd?.diffIndex });
	}, []);

	/* Chrono (daily only): the gust count ranks first, this splits the ties. */
	const ticking = daily && started && !alreadyPlayed && !won;
	usePlayClock(startRef, ticking, daily ? GAME_ID : null);
	useEffect(() => {
		if (!ticking) return;
		const id = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 10)), 250);
		return () => clearInterval(id);
	}, [ticking]);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || alreadyPlayed || won || !cur) return;
		const sd = seedRef.current;
		saveDailyRun(GAME_ID, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { v: GEN_V, pos: cur.pos, flowers: cur.flowers.flatMap((f, i) => (f ? [i] : [])), gusts: cur.gusts },
		});
	}, [daily, started, alreadyPlayed, won, cur]);

	/* Lock the daily attempt on the win. */
	useEffect(() => {
		if (!daily || !won || alreadyPlayed || !cur) return;
		if (!finalRef.current) {
			finalRef.current = Math.max(1, Math.round((Date.now() - startRef.current) / 10));
			setElapsed(finalRef.current);
		}
		const sd = seedRef.current;
		saveDailyRun(GAME_ID, {
			startedAt: startRef.current,
			done: true,
			finalTime: finalRef.current,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { v: GEN_V, pos: cur.pos, flowers: [], gusts: cur.gusts },
		});
	}, [daily, won, alreadyPlayed, cur]);

	/* Grade the level on the win — Souffle cannot be lost, undo goes all the way back. */
	useEffect(() => {
		if (!lv.playing || !won || !cur) return;
		lv.finish({ won: true, score: cur.gusts, raw: { par: puzzleRef.current?.par } });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv.playing, won]);

	const blow = useCallback((dir: Dir) => {
		if (lockedRef.current) return;
		const p = puzzleRef.current;
		const h = histRef.current;
		const s = h.length ? h[h.length - 1] : null;
		if (!p || !s || isWon(s)) return;
		const next = applyGust(p, s, dir);
		if (!next) {
			window.clearTimeout(shakeRef.current);
			setShake(0);
			requestAnimationFrame(() => setShake(dir + 1));
			shakeRef.current = window.setTimeout(() => setShake(0), 320);
			return;
		}
		const path = glide(p.n, p.rocks, s.pos, dir);
		setGlideMs(140 + 55 * path.length);
		// The flowers the gust brushed pop out; the wind itself streaks along the path.
		const popped = path.filter((i) => s.flowers[i]);
		const freshPops = popped.map((idx) => ({ id: ++idRef.current, idx, glyph: bloomAt(idx) }));
		const axis: 'h' | 'v' = dir === 1 || dir === 3 ? 'h' : 'v';
		const freshGusts = path.map((idx) => ({ id: ++idRef.current, idx, axis }));
		setPops((prev) => [...prev, ...freshPops]);
		setGusts((prev) => [...prev, ...freshGusts]);
		const popIds = new Set(freshPops.map((x) => x.id));
		const gustIds = new Set(freshGusts.map((x) => x.id));
		window.setTimeout(() => setPops((prev) => prev.filter((x) => !popIds.has(x.id))), 620);
		window.setTimeout(() => setGusts((prev) => prev.filter((x) => !gustIds.has(x.id))), 520);
		setHist([...h, next]);
		if (isWon(next)) trackGame(GAME_ID, 'game_won');
	}, []);

	const undo = useCallback(() => {
		if (lockedRef.current) return;
		setHist((h) => (h.length > 1 && !isWon(h[h.length - 1]) ? h.slice(0, -1) : h));
	}, []);

	const restart = useCallback(() => {
		if (lockedRef.current) return;
		const p = puzzleRef.current;
		const h = histRef.current;
		if (p && !(h.length && isWon(h[h.length - 1]) && daily)) setHist([startState(p)]);
	}, [daily]);

	/* Swipe: the first clear direction fires the gust, then the finger is spent until it lifts. */
	const dragRef = useRef({ x: 0, y: 0, fired: true });
	const swipe = usePointerDrag(
		(x, y) => { dragRef.current = { x, y, fired: false }; },
		(x, y) => {
			const g = dragRef.current;
			if (g.fired) return;
			const dx = x - g.x;
			const dy = y - g.y;
			if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
			g.fired = true;
			const horiz = Math.abs(dx) >= Math.abs(dy);
			blow(horiz ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
		},
		() => { dragRef.current.fired = true; },
	);

	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			if (isTypingTarget(e.target)) return; // KEY_DIRS holds z/w/d/s/q/a: leave those letters to the pseudo field
			const dir = KEY_DIRS[e.key] ?? KEY_DIRS[e.key.toLowerCase()];
			if (dir == null) return;
			e.preventDefault();
			if (!e.repeat) blow(dir);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [blow]);

	useEffect(() => () => window.clearTimeout(shakeRef.current), []);

	/* ---------- Render ---------- */

	const n = puzzle?.n ?? 0;
	const total = puzzle ? puzzle.flowers.filter(Boolean).length : 0;
	const left = cur ? flowersLeft(cur) : 0;

	const rocks = useMemo(() => (puzzle ? puzzle.rocks.flatMap((r, i) => (r ? [i] : [])) : []), [puzzle]);
	const blooms = cur ? cur.flowers.flatMap((f, i) => (f ? [i] : [])) : [];

	/** Where each gust would land — the ghosts the player can read, or tap. */
	const ghosts = useMemo(() => {
		if (!puzzle || !cur || won || locked) return [];
		return ([0, 1, 2, 3] as Dir[]).flatMap((d) => {
			const path = glide(puzzle.n, puzzle.rocks, cur.pos, d);
			return path.length ? [{ dir: d, idx: path[path.length - 1] }] : [];
		});
	}, [puzzle, cur, won, locked]);

	const at = (idx: number): { transform: string } => ({
		transform: `translate(${(idx % n) * 100}%, ${Math.floor(idx / n) * 100}%)`,
	});

	const { celebrating, showWin } = useCelebration(won);

	// Gusts rank first, the chrono only splits ties — ascending-is-better like every packed score.
	const dailyScore = encodePacked(10_000_000, [cur?.gusts ?? 0, Math.min(9_999_999, finalRef.current)]);

	return (
		<div className="sf-root" style={{ ['--n' as string]: n }}>
			<style>{CSS}</style>

			<ModeToggle
				daily={daily}
				onFree={() => { if (lv.active) { lv.exit(); newGame(diff); } else if (daily) newGame(diff); }}
				onDaily={() => { void startDaily(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

			{lv.active ? (
				<div className="sf-tag">
					{lv.menu ? 'Progression — réussis un niveau pour débloquer le suivant' : `Niveau ${lv.level} · ${n}×${n}`}
				</div>
			) : daily ? (
				<div className="sf-tag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${TIERS[seedRef.current?.diffIndex ?? 0]}`}
				</div>
			) : (
				<div className="sf-pills" role="tablist" aria-label="Difficulté">
					{TIERS.map((t, i) => (
						<button
							key={t}
							role="tab"
							aria-selected={diff === i}
							className={`sf-pill ${diff === i ? 'active' : ''}`}
							onClick={() => newGame(i)}
						>
							{t}
						</button>
					))}
				</div>
			)}

			{!(lv.active && lv.menu) && (
				<div className="sf-bar">
					<span className="sf-chip">💨 {cur?.gusts ?? 0}</span>
					<span className="sf-chip">🎯 par {puzzle?.par ?? 0}</span>
					<span className="sf-chip">🌼 {total - left}/{total}</span>
					{daily && <span className="sf-chip">⏱ {fmtCentis(elapsed)}</span>}
					<button className="sf-btn" onClick={undo} disabled={locked || hist.length < 2 || won} aria-label="Annuler le dernier souffle">↩</button>
					<button className="sf-btn" onClick={restart} disabled={locked || hist.length < 2 || (daily && won)} aria-label="Recommencer ce pré">↻</button>
					{!daily && !lv.active && (
						<button className="sf-act" onClick={() => newGame(diff)}>Nouveau pré</button>
					)}
				</div>
			)}

			{lv.active && lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
				<div className="sf-boardwrap edge-safe">
					{celebrating && !lv.active && <Celebration />}
					<div
						className={`sf-board ${gated && !dailyLoading ? 'blurred' : ''}`}
						onPointerDown={swipe.onPointerDown}
						role="application"
						aria-label="Pré de Souffle — glisse pour souffler la plume"
					>
						{rocks.map((i) => (
							<div key={`r${i}`} className="sf-cell sf-rock" style={at(i)}><span>🪨</span></div>
						))}
						{blooms.map((i) => (
							<div key={`f${i}`} className="sf-cell sf-flower" style={at(i)}><span>{bloomAt(i)}</span></div>
						))}
						{pops.map((p) => (
							<div key={p.id} className="sf-cell sf-pop" style={at(p.idx)}><span>{p.glyph}</span></div>
						))}
						{gusts.map((g) => (
							<div key={g.id} className={`sf-gust ${g.axis}`} style={at(g.idx)} />
						))}
						{ghosts.map((g) => (
							<button
								key={g.dir}
								className="sf-cell sf-ghost"
								style={at(g.idx)}
								onClick={() => blow(g.dir)}
								aria-label={`Souffler vers ${DIR_NAME[g.dir]}`}
							>
								<span>🪶</span>
							</button>
						))}
						{cur && (
							<div
								className={`sf-cell sf-feather${shake ? ' bump' : ''}${won ? ' rest' : ''}`}
								style={{ ...at(cur.pos), transitionDuration: `${glideMs}ms` }}
							>
								<span>🪶</span>
							</div>
						)}

						{daily && dailyLoading && (
							<div className="sf-overlay"><div className="sf-card"><p className="sf-sub">Préparation…</p></div></div>
						)}

						{gated && !dailyLoading && puzzle && (
							<div className="sf-overlay">
								<button className="sf-start big" onClick={startTimer}>▶ Commencer</button>
							</div>
						)}

						{showWin && !daily && !lv.active && puzzle && cur && (
							<div className="sf-overlay" role="dialog" aria-label="Pré butiné">
								<div className="sf-card">
									<div className="sf-mark">🌼</div>
									<h2>Toutes les fleurs !</h2>
									<p className="sf-big">{cur.gusts} souffles</p>
									<p className="sf-sub">{cur.gusts <= puzzle.par ? 'Le vent ne pouvait pas faire mieux 🎐' : `par ${puzzle.par}`}</p>
									<div className="sf-row">
										<button className="sf-start" onClick={restart}>Rejouer</button>
										<button className="sf-start ghost" onClick={() => newGame(diff)}>Nouveau pré</button>
									</div>
								</div>
							</div>
						)}
					</div>

					{lv.done && cur && (
						<LevelOutcome
							level={lv.level}
							lastLevel={souffleLevels.count}
							won={lv.won}
							stars={lv.stars}
							detail={`${cur.gusts} souffles · par ${puzzle?.par ?? 0}`}
							onNext={() => startLevel(lv.level + 1)}
							onReplay={() => startLevel(lv.level)}
							onMenu={lv.backToMenu}
						/>
					)}
				</div>
			)}

			{daily && (won || alreadyPlayed) && cur && (
				<div className="sf-done">
					{alreadyPlayed
						? <>Défi du jour déjà relevé · <strong>{cur.gusts} souffles</strong> en {fmtCentis(finalRef.current)} — reviens demain&nbsp;!</>
						: <>🎉 Pré butiné en <strong>{cur.gusts} souffles</strong> · {fmtCentis(finalRef.current)}</>}
				</div>
			)}

			{daily && !dailyLoading && (
				<Leaderboard
					game={`${GAME_ID}-t`}
					metric="time"
					submitValue={won || alreadyPlayed ? dailyScore : undefined}
					format={(v) => formatScore(DAILY_LB.souffle.fmt, v)}
				/>
			)}

			{!daily && !lv.active && (
				<LeaderboardCorner game={`${GAME_ID}-t`} metric="time" format={(v) => formatScore(DAILY_LB.souffle.fmt, v)} />
			)}

			<p className="sf-help">
				Glisse le doigt (ou flèches / ZQSD)&nbsp;: un souffle envoie la plume 🪶 en ligne droite, et
				elle file jusqu'au premier rocher ou jusqu'à la haie — impossible de s'arrêter en route. Elle
				cueille toutes les fleurs qu'elle frôle, case d'arrivée comprise. Les plumes fantômes montrent
				où chaque souffle la poserait&nbsp;: touche l'une d'elles pour souffler dans cette direction.
				Un souffle raté se reprend&nbsp;: ↩ revient en arrière autant que tu veux. Cueille tout le pré
				en le moins de souffles possible — le par, c'est le chemin du vent lui-même.
			</p>
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.sf-root {
  --sf-cell: calc(100cqw / var(--n, 7));
  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.sf-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem; }
.sf-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.75rem; }
.sf-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
}
.sf-pill.active { background: var(--accent-regular); color: var(--accent-text-over); border-color: var(--accent-regular); }

.sf-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.9rem; }
.sf-chip {
  background: var(--gray-900); border-radius: 999px; padding: 6px 12px;
  font-weight: 700; font-size: 14px; font-variant-numeric: tabular-nums;
}
.sf-btn {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-0);
  width: 36px; height: 36px; border-radius: 50%; font-size: 16px; cursor: pointer; line-height: 1;
}
.sf-btn:disabled { opacity: 0.35; cursor: default; }
.sf-act {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-0);
  font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 7px 14px; cursor: pointer;
}

.sf-boardwrap { position: relative; width: 100%; max-width: 448px; margin-inline: auto; container-type: inline-size; }
/* A summer meadow: sky melting into grass, the hedge drawn by the border. */
.sf-board {
  position: relative;
  width: 100%; aspect-ratio: 1 / 1;
  border: 3px solid #4c8a3f;
  border-radius: 16px;
  overflow: hidden;
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.14) calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.14) var(--sf-cell)),
    repeating-linear-gradient(90deg, transparent 0, transparent calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.14) calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.14) var(--sf-cell)),
    linear-gradient(170deg, #bfe7f2 0%, #cdeccb 34%, #a8dba0 68%, #8fce8a 100%);
  touch-action: none;
  user-select: none;
}
.sf-board.blurred > :not(.sf-overlay) { filter: blur(7px); }

.sf-cell {
  position: absolute; top: 0; left: 0;
  width: calc(100% / var(--n)); height: calc(100% / var(--n));
  display: grid; place-items: center;
  font-size: calc(var(--sf-cell) * 0.62);
  line-height: 1;
  pointer-events: none;
}
.sf-rock span { filter: drop-shadow(0 2px 2px rgba(30, 60, 30, 0.35)); }
.sf-flower span { animation: sf-sway 3.2s ease-in-out infinite; transform-origin: 50% 90%; }
@keyframes sf-sway { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(5deg); } }

.sf-feather {
  z-index: 3;
  transition-property: transform;
  transition-timing-function: cubic-bezier(0.22, 0.9, 0.3, 1);
  will-change: transform;
}
.sf-feather span {
  display: inline-block;
  font-size: calc(var(--sf-cell) * 0.72);
  animation: sf-bob 2.4s ease-in-out infinite;
  filter: drop-shadow(0 3px 3px rgba(30, 60, 30, 0.3));
}
.sf-feather.rest span { animation: none; }
@keyframes sf-bob { 0%, 100% { transform: translateY(-6%) rotate(-6deg); } 50% { transform: translateY(6%) rotate(4deg); } }
.sf-feather.bump span { animation: sf-bump 0.3s ease-out; }
@keyframes sf-bump { 0% { transform: scale(1); } 40% { transform: scale(0.82) rotate(10deg); } 100% { transform: scale(1); } }

/* Where each gust would land. A button, so reading it and playing it are the same gesture. */
.sf-ghost {
  pointer-events: auto;
  background: transparent; border: none; padding: 0; cursor: pointer;
  z-index: 2;
}
.sf-ghost span {
  font-size: calc(var(--sf-cell) * 0.6);
  opacity: 0.32;
  filter: grayscale(0.5);
}
.sf-ghost:hover span, .sf-ghost:focus-visible span { opacity: 0.6; }

/* The cell keeps its inline translate; only the bloom inside flies off. */
.sf-pop { z-index: 4; }
.sf-pop span { display: inline-block; animation: sf-pluck 0.6s ease-out forwards; }
@keyframes sf-pluck {
  0% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-46%) rotate(80deg) scale(1.5); }
}

/* The wind itself: a pale streak crossing each swept cell. */
.sf-gust {
  position: absolute; top: 0; left: 0;
  width: calc(100% / var(--n)); height: calc(100% / var(--n));
  pointer-events: none; z-index: 1;
  animation: sf-fade 0.5s ease-out forwards;
}
.sf-gust.h { background: linear-gradient(90deg, transparent 8%, rgba(255, 255, 255, 0.55) 50%, transparent 92%) center / 100% 26% no-repeat; }
.sf-gust.v { background: linear-gradient(0deg, transparent 8%, rgba(255, 255, 255, 0.55) 50%, transparent 92%) center / 26% 100% no-repeat; }
@keyframes sf-fade { from { opacity: 1; } to { opacity: 0; } }

.sf-overlay {
  position: absolute; inset: 0; z-index: 6;
  display: grid; place-items: center;
  background: rgba(20, 40, 24, 0.45);
  backdrop-filter: blur(2px);
  border-radius: 13px;
}
.sf-card {
  background: var(--gray-999, #fff); color: var(--gray-0);
  border-radius: 16px; padding: 20px 26px; text-align: center;
  box-shadow: var(--shadow-md, 0 10px 30px rgba(0, 0, 0, 0.25));
  max-width: 86%;
}
.sf-mark { font-size: 34px; }
.sf-card h2 { margin: 6px 0 2px; font-size: 20px; }
.sf-big { font-size: 24px; font-weight: 800; margin: 4px 0 0; font-variant-numeric: tabular-nums; }
.sf-sub { color: var(--gray-300); font-size: 13.5px; margin: 2px 0 0; }
.sf-row { display: flex; gap: 8px; justify-content: center; margin-top: 14px; flex-wrap: wrap; }
.sf-start {
  border: none; background: var(--accent-regular); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 14px; border-radius: 999px; padding: 9px 18px; cursor: pointer;
}
.sf-start.ghost { background: transparent; color: var(--gray-0); border: 1.5px solid var(--gray-700); }
.sf-start.big { font-size: 16px; padding: 13px 26px; box-shadow: var(--shadow-md, 0 10px 30px rgba(0, 0, 0, 0.25)); }

.sf-done {
  margin-top: 0.9rem; text-align: center;
  color: var(--gray-100); font-size: 14px;
}

.sf-help {
  max-width: 440px; margin: 1rem auto 0; text-align: center;
  color: var(--gray-300); font-size: 13.5px; line-height: 1.55;
}

:root.theme-dark .sf-board, .theme-dark .sf-board {
  border-color: #356030;
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.05) calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.05) var(--sf-cell)),
    repeating-linear-gradient(90deg, transparent 0, transparent calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.05) calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.05) var(--sf-cell)),
    linear-gradient(170deg, #22384a 0%, #23402c 40%, #1d3524 100%);
}
`;
