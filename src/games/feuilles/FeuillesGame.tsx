import { useState, useEffect, useRef, useCallback } from 'react';
import { trackGame } from '../../lib/analytics';
import Celebration, { useCelebration } from '../../components/Celebration';
import { usePlayClock } from '../../lib/usePlayClock';
import { mulberry32 } from '../prng';
import { usePointerDrag } from '../usePointerDrag';
import {
	DR, DC,
	FEUILLES_BANDS,
	emptyFlow,
	generateBoard,
	paint,
	spawnLeaves,
	startStroke,
	tickLeaves,
	type Dir,
	type FeuillesBoard,
	type FlowState,
	type Leaf,
} from './engine';

/* =====================================================
   FEUILLES — React island (prototype, free play only).
   Leaves rain on the meadow; the finger draws persistent wind currents that carry
   them to the vortex. Drawing over a stream cuts it there, brooks merge into rivers.
   Reach the target count — the chrono is the score.
   ===================================================== */

const GAME_ID = 'feuilles';
const TICK = 420; // one beat of wind

const TIERS = ['Brise', 'Vent', 'Tempête'];
const LEAF = ['🍂', '🍁', '🍃'];
const OBST = ['🌳', '🪨'];

interface Fade { id: number; idx: number }
interface Swirl { id: number; glyph: string }

/** Each leaf lands a little off-centre, its own way — piles spill sideways. */
const jitter = (id: number): { transform: string } => ({
	transform: `translate(${((id * 37) % 62) - 31}%, ${((id * 53) % 54) - 27}%) rotate(${((id * 71) % 70) - 35}deg) scale(${0.82 + ((id * 29) % 30) / 100})`,
});

const fmt = (ms: number): string => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export default function FeuillesGame() {
	const [board, setBoard] = useState<FeuillesBoard | null>(null);
	const [flow, setFlow] = useState<FlowState | null>(null);
	const [leaves, setLeaves] = useState<Leaf[]>([]);
	const [collected, setCollected] = useState(0);
	const [breath, setBreath] = useState(0);
	const [won, setWon] = useState(false);
	const [diff, setDiff] = useState(0);
	const [now, setNow] = useState(0);
	const [fades, setFades] = useState<Fade[]>([]);
	const [swirls, setSwirls] = useState<Swirl[]>([]);

	const idRef = useRef(0);
	const boardElRef = useRef<HTMLDivElement>(null);
	const boardRef = useRef(board);
	boardRef.current = board;
	const flowRef = useRef(flow);
	flowRef.current = flow;
	const leavesRef = useRef(leaves);
	leavesRef.current = leaves;
	const wonRef = useRef(won);
	wonRef.current = won;
	const collectedRef = useRef(collected);
	collectedRef.current = collected;
	const diffRef = useRef(diff);
	diffRef.current = diff;
	const rngRef = useRef(mulberry32(1));
	const leafIdRef = useRef(0);
	const beatRef = useRef(0);
	const seedRef = useRef(1);
	const startRef = useRef(0);
	const winMsRef = useRef(0);
	const strokeRef = useRef(0);
	const lastCellRef = useRef(-1);

	/* Same seed → same board AND the same rain, so Rejouer replays the very same storm. */
	const newGame = useCallback((d: number, seed?: number) => {
		setDiff(d);
		const s = seed ?? (Math.floor(Math.random() * 0xffffffff) || 1);
		seedRef.current = s;
		const rng = mulberry32(s);
		rngRef.current = rng;
		const band = FEUILLES_BANDS[d] ?? FEUILLES_BANDS[0];
		const b = generateBoard(rng, band);
		const first = spawnLeaves(rng, b, band.seed, 0);
		leafIdRef.current = first.nextId;
		beatRef.current = 0;
		startRef.current = Date.now();
		setBoard(b);
		setFlow(emptyFlow(b.n));
		setLeaves(first.leaves);
		setCollected(0);
		setBreath(0);
		setWon(false);
		setNow(Date.now());
		setFades([]);
		setSwirls([]);
		trackGame(GAME_ID, 'game_started');
	}, []);

	useEffect(() => { newGame(0); }, [newGame]);

	const restart = useCallback(() => newGame(diffRef.current, seedRef.current), [newGame]);

	usePlayClock(startRef, !!board && !won);

	/* The wind never stops: one beat every TICK ms, whatever the finger is doing. */
	useEffect(() => {
		const t = window.setInterval(() => {
			const b = boardRef.current;
			const f = flowRef.current;
			if (!b || !f || wonRef.current) return;
			setNow(Date.now());
			const band = FEUILLES_BANDS[diffRef.current] ?? FEUILLES_BANDS[0];
			const r = tickLeaves(b, f.dirs, leavesRef.current);
			let next = r.leaves;
			if (r.collected.length) {
				const fresh = r.collected.map((l) => ({ id: ++idRef.current, glyph: LEAF[l.id % LEAF.length] }));
				setSwirls((prev) => [...prev, ...fresh]);
				const ids = new Set(fresh.map((x) => x.id));
				window.setTimeout(() => setSwirls((prev) => prev.filter((x) => !ids.has(x.id))), 700);
				const total = collectedRef.current + r.collected.length;
				setCollected(total);
				if (total >= band.target) {
					winMsRef.current = Date.now() - startRef.current;
					setLeaves(next);
					setWon(true);
					trackGame(GAME_ID, 'game_won');
					return;
				}
			}
			// And the rain keeps falling.
			if (++beatRef.current % band.spawnEvery === 0) {
				const drop = spawnLeaves(rngRef.current, b, 1, leafIdRef.current);
				leafIdRef.current = drop.nextId;
				next = [...next, ...drop.leaves];
			}
			setLeaves(next);
		}, TICK);
		return () => window.clearInterval(t);
	}, []);

	const cellAt = (x: number, y: number): number => {
		const el = boardElRef.current;
		const b = boardRef.current;
		if (!el || !b) return -1;
		const r = el.getBoundingClientRect();
		const c = Math.floor(((x - r.left) / r.width) * b.n);
		const w = Math.floor(((y - r.top) / r.height) * b.n);
		return c < 0 || c >= b.n || w < 0 || w >= b.n ? -1 : w * b.n + c;
	};

	/* Drawing: each cell the finger leaves gets an arrow toward the next one, so the
	   stroke's last cell stays arrowless — the mouth of the stream, where leaves pool. */
	const swipe = usePointerDrag(
		(x, y) => {
			if (wonRef.current || !flowRef.current) return;
			const s = startStroke(flowRef.current);
			setFlow(s.flow);
			strokeRef.current = s.id;
			lastCellRef.current = cellAt(x, y);
		},
		(x, y) => {
			const b = boardRef.current;
			let f = flowRef.current;
			if (!b || !f || wonRef.current) return;
			const c = cellAt(x, y);
			if (c < 0 || c === lastCellRef.current) return;
			let last = lastCellRef.current;
			if (last < 0) { lastCellRef.current = c; return; }
			let painted = 0;
			const gone: number[] = [];
			let guard = 0;
			while (last !== c && guard++ < 64) {
				const dr = Math.floor(c / b.n) - Math.floor(last / b.n);
				const dc = (c % b.n) - (last % b.n);
				const d: Dir = Math.abs(dc) >= Math.abs(dr) ? (dc > 0 ? 1 : 3) : (dr > 0 ? 2 : 0);
				const r = paint(b, f, strokeRef.current, last, d);
				f = r.flow;
				if (r.painted) painted++;
				gone.push(...r.dissolved);
				last += DR[d] * b.n + DC[d];
			}
			lastCellRef.current = last;
			setFlow(f);
			if (painted) setBreath((k) => k + painted);
			if (gone.length) {
				const fresh = gone.map((idx) => ({ id: ++idRef.current, idx }));
				setFades((prev) => [...prev, ...fresh]);
				const ids = new Set(fresh.map((x) => x.id));
				window.setTimeout(() => setFades((prev) => prev.filter((x) => !ids.has(x.id))), 450);
			}
		},
		() => { lastCellRef.current = -1; },
	);

	/* ---------- Render ---------- */

	const n = board?.n ?? 0;
	const band = FEUILLES_BANDS[diff] ?? FEUILLES_BANDS[0];
	const elapsed = won ? winMsRef.current : Math.max(0, now - startRef.current);

	const at = (idx: number): { left: string; top: string } => ({
		left: `${((idx % n) * 100) / n}%`,
		top: `${(Math.floor(idx / n) * 100) / n}%`,
	});
	const tr = (idx: number): { transform: string } => ({
		transform: `translate(${(idx % n) * 100}%, ${Math.floor(idx / n) * 100}%)`,
	});

	const rocks = board ? board.rocks.flatMap((r, i) => (r ? [i] : [])) : [];
	const { celebrating, showWin } = useCelebration(won);

	return (
		<div className="fl-root" style={{ ['--n' as string]: n }}>
			<style>{CSS}</style>

			<div className="fl-pills" role="tablist" aria-label="Difficulté">
				{TIERS.map((t, i) => (
					<button
						key={t}
						role="tab"
						aria-selected={diff === i}
						className={`fl-pill ${diff === i ? 'active' : ''}`}
						onClick={() => newGame(i)}
					>
						{t}
					</button>
				))}
			</div>

			<div className="fl-bar">
				<span className="fl-chip">🍂 {collected}/{band.target}</span>
				<span className="fl-chip">⏱ {fmt(elapsed)}</span>
				<span className="fl-chip">💨 {breath}</span>
				<button className="fl-btn" onClick={restart} aria-label="Recommencer ce pré">↻</button>
				<button className="fl-act" onClick={() => newGame(diff)}>Nouveau pré</button>
			</div>

			<div className="fl-boardwrap edge-safe">
				{celebrating && <Celebration />}
				<div
					className="fl-board"
					ref={boardElRef}
					onPointerDown={swipe.onPointerDown}
					role="application"
					aria-label="Pré d'automne — dessine des courants d'air"
				>
					{flow?.dirs.map((d, i) => (d != null ? <div key={`c${i}`} className={`fl-cur d${d}`} style={at(i)} /> : null))}
					{fades.map((f) => (
						<div key={f.id} className="fl-fade" style={at(f.idx)} />
					))}
					{rocks.map((i) => (
						<div key={`r${i}`} className="fl-cell fl-rock" style={tr(i)}><span>{OBST[(i * 7 + 1) % 3 === 0 ? 1 : 0]}</span></div>
					))}
					{board && (
						<div className="fl-cell fl-vortex" style={tr(board.vortex)}><span>🌀</span></div>
					)}
					{leaves.map((l) => (
						<div key={l.id} className="fl-cell fl-leaf" style={{ ...tr(l.cell), transitionDuration: `${TICK}ms` }}>
							<span style={jitter(l.id)}><span className="fl-drop">{LEAF[l.id % LEAF.length]}</span></span>
						</div>
					))}
					{board && swirls.map((s) => (
						<div key={s.id} className="fl-cell fl-in" style={tr(board.vortex)}><span>{s.glyph}</span></div>
					))}

					{showWin && (
						<div className="fl-overlay" role="dialog" aria-label="Objectif atteint">
							<div className="fl-card">
								<div className="fl-mark">🌀</div>
								<h2>{band.target} feuilles !</h2>
								<p className="fl-big">⏱ {fmt(winMsRef.current)}</p>
								<p className="fl-sub">💨 {breath} souffle</p>
								<div className="fl-row">
									<button className="fl-start" onClick={restart}>Rejouer</button>
									<button className="fl-start ghost" onClick={() => newGame(diff)}>Nouveau pré</button>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>

			<p className="fl-help">
				Les feuilles tombent sans arrêt sur le pré. Dessine des courants d'air avec le doigt&nbsp;:
				chaque case traversée reçoit une flèche, et les feuilles suivent le courant de leur case,
				battement après battement, jusqu'au tourbillon 🌀 qui les avale. Tracer par-dessus un courant
				le coupe à cet endroit&nbsp;: son amont se déverse dans ton nouveau tracé — fais converger les
				ruisseaux&nbsp;! Les arbres et rochers bloquent le vent. Atteins l'objectif le plus vite
				possible&nbsp;: le chrono, c'est le score.
			</p>
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.fl-root {
  --fl-cell: calc(100cqw / var(--n, 6));
  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.fl-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.75rem; }
.fl-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
}
.fl-pill.active { background: var(--accent-regular); color: var(--accent-text-over); border-color: var(--accent-regular); }

.fl-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.9rem; }
.fl-chip {
  background: var(--gray-900); border-radius: 999px; padding: 6px 12px;
  font-weight: 700; font-size: 14px; font-variant-numeric: tabular-nums;
}
.fl-btn {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-0);
  width: 36px; height: 36px; border-radius: 50%; font-size: 16px; cursor: pointer; line-height: 1;
}
.fl-act {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-0);
  font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 7px 14px; cursor: pointer;
}

.fl-boardwrap { position: relative; width: 100%; max-width: 448px; margin-inline: auto; container-type: inline-size; }
/* An autumn meadow: pale sky melting into gold. */
.fl-board {
  position: relative;
  width: 100%; aspect-ratio: 1 / 1;
  border: 3px solid #8a6d3b;
  border-radius: 16px;
  overflow: hidden;
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent calc(var(--fl-cell) - 1px), rgba(255, 255, 255, 0.16) calc(var(--fl-cell) - 1px), rgba(255, 255, 255, 0.16) var(--fl-cell)),
    repeating-linear-gradient(90deg, transparent 0, transparent calc(var(--fl-cell) - 1px), rgba(255, 255, 255, 0.16) calc(var(--fl-cell) - 1px), rgba(255, 255, 255, 0.16) var(--fl-cell)),
    linear-gradient(170deg, #cde6ef 0%, #e7e0b4 36%, #ddc98f 70%, #d0b878 100%);
  touch-action: none;
  user-select: none;
}

.fl-cell {
  position: absolute; top: 0; left: 0;
  width: calc(100% / var(--n)); height: calc(100% / var(--n));
  display: grid; place-items: center;
  font-size: calc(var(--fl-cell) * 0.62);
  line-height: 1;
  pointer-events: none;
}
.fl-rock span { font-size: calc(var(--fl-cell) * 0.7); filter: drop-shadow(0 2px 2px rgba(60, 45, 15, 0.35)); }

/* A current: flowing dashes plus an arrowhead, rotated into its direction.
   Positioned by left/top so the rotation owns the transform. */
.fl-cur {
  position: absolute;
  width: calc(100% / var(--n)); height: calc(100% / var(--n));
  pointer-events: none; z-index: 1;
  filter: drop-shadow(0 1px 2px rgba(90, 60, 20, 0.55));
}
.fl-cur.d0 { transform: rotate(270deg); }
.fl-cur.d1 { transform: rotate(0deg); }
.fl-cur.d2 { transform: rotate(90deg); }
.fl-cur.d3 { transform: rotate(180deg); }
.fl-cur::before {
  content: ''; position: absolute; left: 4%; right: 26%; top: 38%; bottom: 38%;
  border-radius: 999px;
  background: repeating-linear-gradient(90deg,
    rgba(255, 255, 255, 0.98) 0 calc(var(--fl-cell) * 0.16),
    rgba(255, 255, 255, 0.3) calc(var(--fl-cell) * 0.16) calc(var(--fl-cell) * 0.36));
  animation: fl-run 0.7s linear infinite;
}
.fl-cur::after {
  content: ''; position: absolute; right: 0; top: 50%; transform: translateY(-50%);
  border-left: calc(var(--fl-cell) * 0.24) solid rgba(255, 255, 255, 0.98);
  border-top: calc(var(--fl-cell) * 0.17) solid transparent;
  border-bottom: calc(var(--fl-cell) * 0.17) solid transparent;
}
@keyframes fl-run { to { background-position-x: calc(var(--fl-cell) * 0.36); } }

/* A severed piece of stream evaporates. */
.fl-fade {
  position: absolute;
  width: calc(100% / var(--n)); height: calc(100% / var(--n));
  pointer-events: none; z-index: 1;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.5), transparent 75%);
  animation: fl-out 0.4s ease-out forwards;
}
@keyframes fl-out { to { opacity: 0; } }

.fl-vortex { z-index: 2; }
.fl-vortex span {
  display: inline-block;
  font-size: calc(var(--fl-cell) * 0.72);
  animation: fl-spin 3.2s linear infinite;
  filter: drop-shadow(0 0 6px rgba(80, 140, 200, 0.55));
}
@keyframes fl-spin { to { transform: rotate(360deg); } }

.fl-leaf {
  z-index: 3;
  transition-property: transform;
  transition-timing-function: linear;
  will-change: transform;
}
.fl-leaf > span {
  display: inline-block;
  font-size: calc(var(--fl-cell) * 0.5);
  filter: drop-shadow(0 2px 2px rgba(80, 60, 20, 0.35));
}
/* A fresh leaf flutters down onto its cell. */
.fl-drop { display: inline-block; animation: fl-fall 0.55s ease-in backwards; }
@keyframes fl-fall {
  from { transform: translateY(-260%) rotate(-160deg); opacity: 0; }
  60% { opacity: 1; }
  to { transform: none; }
}

/* Swallowed: one last twirl into the vortex. */
.fl-in { z-index: 4; }
.fl-in span {
  display: inline-block;
  font-size: calc(var(--fl-cell) * 0.5);
  animation: fl-swallow 0.65s ease-in forwards;
}
@keyframes fl-swallow { to { transform: rotate(400deg) scale(0); opacity: 0; } }

.fl-overlay {
  position: absolute; inset: 0; z-index: 6;
  display: grid; place-items: center;
  background: rgba(50, 38, 14, 0.45);
  backdrop-filter: blur(2px);
  border-radius: 13px;
}
.fl-card {
  background: var(--gray-999, #fff); color: var(--gray-0);
  border-radius: 16px; padding: 20px 26px; text-align: center;
  box-shadow: var(--shadow-md, 0 10px 30px rgba(0, 0, 0, 0.25));
  max-width: 86%;
}
.fl-mark { font-size: 34px; }
.fl-card h2 { margin: 6px 0 2px; font-size: 20px; }
.fl-big { font-size: 24px; font-weight: 800; margin: 4px 0 0; font-variant-numeric: tabular-nums; }
.fl-sub { color: var(--gray-300); font-size: 13.5px; margin: 2px 0 0; }
.fl-row { display: flex; gap: 8px; justify-content: center; margin-top: 14px; flex-wrap: wrap; }
.fl-start {
  border: none; background: var(--accent-regular); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 14px; border-radius: 999px; padding: 9px 18px; cursor: pointer;
}
.fl-start.ghost { background: transparent; color: var(--gray-0); border: 1.5px solid var(--gray-700); }

.fl-help {
  max-width: 440px; margin: 1rem auto 0; text-align: center;
  color: var(--gray-300); font-size: 13.5px; line-height: 1.55;
}

:root.theme-dark .fl-board, .theme-dark .fl-board {
  border-color: #5c4a28;
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent calc(var(--fl-cell) - 1px), rgba(255, 255, 255, 0.05) calc(var(--fl-cell) - 1px), rgba(255, 255, 255, 0.05) var(--fl-cell)),
    repeating-linear-gradient(90deg, transparent 0, transparent calc(var(--fl-cell) - 1px), rgba(255, 255, 255, 0.05) calc(var(--fl-cell) - 1px), rgba(255, 255, 255, 0.05) var(--fl-cell)),
    linear-gradient(170deg, #223447 0%, #3a3524 45%, #33291a 100%);
}
`;
