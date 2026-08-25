import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { trackGame } from '../../lib/analytics';
import Celebration, { useCelebration } from '../../components/Celebration';
import { mulberry32 } from '../prng';
import { usePointerDrag } from '../usePointerDrag';
import LeavesMode from './LeavesMode';
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
   SOUFFLE — React island (prototype, free play only). Two winds, side by side:
   🪶 Plume — swipe = one gust, the feather glides until the first rock or the hedge,
   brushing every flower on the way; ghost feathers preview (and play) each landing.
   🍂 Feuilles (LeavesMode) — draw persistent currents, the leaves ride them to the vortex.
   ===================================================== */

const GAME_ID = 'souffle';

type Mode = 'plume' | 'feuilles';
const MODE_KEY = 'ludiven-souffle-mode';

export default function SouffleGame() {
	const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(MODE_KEY) === 'feuilles' ? 'feuilles' : 'plume'));
	const pick = (m: Mode): void => {
		setMode(m);
		localStorage.setItem(MODE_KEY, m);
	};
	return (
		<div className="sf-shell">
			<style>{CSS}</style>
			<div className="sf-modes" role="tablist" aria-label="Mode de jeu">
				<button role="tab" aria-selected={mode === 'plume'} className={`sf-mode ${mode === 'plume' ? 'active' : ''}`} onClick={() => pick('plume')}>🪶 Plume</button>
				<button role="tab" aria-selected={mode === 'feuilles'} className={`sf-mode ${mode === 'feuilles' ? 'active' : ''}`} onClick={() => pick('feuilles')}>🍂 Feuilles</button>
			</div>
			{mode === 'plume' ? <FeatherMode /> : <LeavesMode />}
		</div>
	);
}

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

function FeatherMode() {
	const [puzzle, setPuzzle] = useState<SoufflePuzzle | null>(null);
	const [hist, setHist] = useState<SouffleState[]>([]);
	const [diff, setDiff] = useState(0);
	const [pops, setPops] = useState<Pop[]>([]);
	const [gusts, setGusts] = useState<Gust[]>([]);
	const [shake, setShake] = useState(0); // a refused gust wobbles the feather
	const [glideMs, setGlideMs] = useState(300);

	const idRef = useRef(0);
	const shakeRef = useRef(0);
	const histRef = useRef(hist);
	histRef.current = hist;
	const puzzleRef = useRef(puzzle);
	puzzleRef.current = puzzle;

	const cur: SouffleState | null = hist.length ? hist[hist.length - 1] : null;
	const won = cur ? isWon(cur) : false;

	const newGame = useCallback((d: number) => {
		setDiff(d);
		const p = generateSouffle(mulberry32(Math.floor(Math.random() * 0xffffffff)), SOUFFLE_BANDS[d] ?? SOUFFLE_BANDS[0]);
		setPuzzle(p);
		setHist([startState(p)]);
		setPops([]);
		setGusts([]);
		trackGame(GAME_ID, 'game_started');
	}, []);

	useEffect(() => { newGame(0); }, [newGame]);

	const blow = useCallback((dir: Dir) => {
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
		setHist((h) => (h.length > 1 ? h.slice(0, -1) : h));
	}, []);

	const restart = useCallback(() => {
		const p = puzzleRef.current;
		if (p) setHist([startState(p)]);
	}, []);

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
		if (!puzzle || !cur || won) return [];
		return ([0, 1, 2, 3] as Dir[]).flatMap((d) => {
			const path = glide(puzzle.n, puzzle.rocks, cur.pos, d);
			return path.length ? [{ dir: d, idx: path[path.length - 1] }] : [];
		});
	}, [puzzle, cur, won]);

	const at = (idx: number): { transform: string } => ({
		transform: `translate(${(idx % n) * 100}%, ${Math.floor(idx / n) * 100}%)`,
	});

	const { celebrating, showWin } = useCelebration(won);

	return (
		<div className="sf-root" style={{ ['--n' as string]: n }}>
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

			<div className="sf-bar">
				<span className="sf-chip">💨 {cur?.gusts ?? 0}</span>
				<span className="sf-chip">🎯 par {puzzle?.par ?? 0}</span>
				<span className="sf-chip">🌼 {total - left}/{total}</span>
				<button className="sf-btn" onClick={undo} disabled={hist.length < 2 || won} aria-label="Annuler le dernier souffle">↩</button>
				<button className="sf-btn" onClick={restart} disabled={hist.length < 2} aria-label="Recommencer ce pré">↻</button>
				<button className="sf-act" onClick={() => newGame(diff)}>Nouveau pré</button>
			</div>

			<div className="sf-boardwrap edge-safe">
				{celebrating && <Celebration />}
				<div
					className="sf-board"
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

					{showWin && puzzle && cur && (
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
			</div>

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

.sf-shell { width: 100%; }
.sf-modes { display: flex; gap: 6px; justify-content: center; margin-bottom: 0.9rem; }
.sf-mode {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 600; font-size: 14px; border-radius: 999px; padding: 8px 16px; cursor: pointer;
}
.sf-mode.active { background: var(--accent-regular); color: var(--accent-text-over); border-color: var(--accent-regular); }

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
