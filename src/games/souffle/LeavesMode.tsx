import { useState, useEffect, useRef, useCallback } from 'react';
import { trackGame } from '../../lib/analytics';
import Celebration, { useCelebration } from '../../components/Celebration';
import { mulberry32 } from '../prng';
import { usePointerDrag } from '../usePointerDrag';
import { DR, DC, type Dir } from './engine';
import {
	LEAVES_BANDS,
	allCollected,
	emptyFlow,
	generateLeaves,
	paint,
	startStroke,
	tickLeaves,
	type FlowState,
	type LeavesPuzzle,
} from './leaves';

/* =====================================================
   SOUFFLE — leaves mode island (continuous wind).
   The finger draws currents; every beat, every leaf rides the arrow of its cell,
   and the vortex swallows what reaches it. Drawing over a stream cuts it there,
   so brooks merge into rivers. Collect all the leaves for the least breath.
   ===================================================== */

const GAME_ID = 'souffle';
const TICK = 420; // one beat of wind

const TIERS = ['Brise', 'Vent', 'Tempête'];
const LEAF = ['🍂', '🍁', '🍃'];

interface Fade { id: number; idx: number }
interface Swirl { id: number; glyph: string }

/** Each leaf sits a little off-centre, its own way — piles read as piles. */
const jitter = (i: number): { transform: string } => ({
	transform: `translate(${((i * 37) % 26) - 13}%, ${((i * 53) % 26) - 13}%) rotate(${((i * 71) % 44) - 22}deg)`,
});

export default function LeavesMode() {
	const [puzzle, setPuzzle] = useState<LeavesPuzzle | null>(null);
	const [flow, setFlow] = useState<FlowState | null>(null);
	const [leaves, setLeaves] = useState<number[]>([]);
	const [breath, setBreath] = useState(0);
	const [won, setWon] = useState(false);
	const [diff, setDiff] = useState(0);
	const [fades, setFades] = useState<Fade[]>([]);
	const [swirls, setSwirls] = useState<Swirl[]>([]);

	const idRef = useRef(0);
	const boardRef = useRef<HTMLDivElement>(null);
	const puzzleRef = useRef(puzzle);
	puzzleRef.current = puzzle;
	const flowRef = useRef(flow);
	flowRef.current = flow;
	const leavesRef = useRef(leaves);
	leavesRef.current = leaves;
	const wonRef = useRef(won);
	wonRef.current = won;
	const strokeRef = useRef(0);
	const lastCellRef = useRef(-1);

	const newGame = useCallback((d: number) => {
		setDiff(d);
		const p = generateLeaves(mulberry32(Math.floor(Math.random() * 0xffffffff)), LEAVES_BANDS[d] ?? LEAVES_BANDS[0]);
		setPuzzle(p);
		setFlow(emptyFlow(p.n));
		setLeaves(p.leaves.slice());
		setBreath(0);
		setWon(false);
		setFades([]);
		setSwirls([]);
		trackGame(GAME_ID, 'game_started');
	}, []);

	useEffect(() => { newGame(0); }, [newGame]);

	const restart = useCallback(() => {
		const p = puzzleRef.current;
		if (!p) return;
		setFlow(emptyFlow(p.n));
		setLeaves(p.leaves.slice());
		setBreath(0);
		setWon(false);
		setFades([]);
		setSwirls([]);
	}, []);

	/* The wind never stops: one beat every TICK ms, whatever the finger is doing. */
	useEffect(() => {
		const t = window.setInterval(() => {
			const p = puzzleRef.current;
			const f = flowRef.current;
			if (!p || !f || wonRef.current) return;
			const r = tickLeaves(p, f.dirs, leavesRef.current);
			if (r.collected.length) {
				const fresh = r.collected.map((i) => ({ id: ++idRef.current, glyph: LEAF[i % LEAF.length] }));
				setSwirls((prev) => [...prev, ...fresh]);
				const ids = new Set(fresh.map((x) => x.id));
				window.setTimeout(() => setSwirls((prev) => prev.filter((x) => !ids.has(x.id))), 700);
			}
			if (!r.moved && !r.collected.length) return;
			setLeaves(r.leaves);
			if (allCollected(r.leaves)) {
				setWon(true);
				trackGame(GAME_ID, 'game_won');
			}
		}, TICK);
		return () => window.clearInterval(t);
	}, []);

	const cellAt = (x: number, y: number): number => {
		const el = boardRef.current;
		const p = puzzleRef.current;
		if (!el || !p) return -1;
		const r = el.getBoundingClientRect();
		const c = Math.floor(((x - r.left) / r.width) * p.n);
		const w = Math.floor(((y - r.top) / r.height) * p.n);
		return c < 0 || c >= p.n || w < 0 || w >= p.n ? -1 : w * p.n + c;
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
			const p = puzzleRef.current;
			let f = flowRef.current;
			if (!p || !f || wonRef.current) return;
			const c = cellAt(x, y);
			if (c < 0 || c === lastCellRef.current) return;
			let last = lastCellRef.current;
			if (last < 0) { lastCellRef.current = c; return; }
			let painted = 0;
			const gone: number[] = [];
			let guard = 0;
			while (last !== c && guard++ < 64) {
				const dr = Math.floor(c / p.n) - Math.floor(last / p.n);
				const dc = (c % p.n) - (last % p.n);
				const d: Dir = Math.abs(dc) >= Math.abs(dr) ? (dc > 0 ? 1 : 3) : (dr > 0 ? 2 : 0);
				const r = paint(p, f, strokeRef.current, last, d);
				f = r.flow;
				if (r.painted) painted++;
				gone.push(...r.dissolved);
				last += DR[d] * p.n + DC[d];
			}
			lastCellRef.current = last;
			setFlow(f);
			if (painted) setBreath((b) => b + painted);
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

	const n = puzzle?.n ?? 0;
	const total = puzzle?.leaves.length ?? 0;
	const inFlight = leaves.filter((c) => c >= 0).length;

	const at = (idx: number): { left: string; top: string } => ({
		left: `${((idx % n) * 100) / n}%`,
		top: `${(Math.floor(idx / n) * 100) / n}%`,
	});
	const tr = (idx: number): { transform: string } => ({
		transform: `translate(${(idx % n) * 100}%, ${Math.floor(idx / n) * 100}%)`,
	});

	const rocks = puzzle ? puzzle.rocks.flatMap((r, i) => (r ? [i] : [])) : [];
	const { celebrating, showWin } = useCelebration(won);

	return (
		<div className="sf-root" style={{ ['--n' as string]: n }}>
			<style>{SL_CSS}</style>

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
				<span className="sf-chip">💨 {breath}</span>
				<span className="sf-chip">🎯 par {puzzle?.par ?? 0}</span>
				<span className="sf-chip">🍂 {total - inFlight}/{total}</span>
				<button className="sf-btn" onClick={restart} disabled={breath === 0 && inFlight === total} aria-label="Recommencer ce pré">↻</button>
				<button className="sf-act" onClick={() => newGame(diff)}>Nouveau pré</button>
			</div>

			<div className="sf-boardwrap edge-safe">
				{celebrating && <Celebration />}
				<div
					className="sf-board sl-board"
					ref={boardRef}
					onPointerDown={swipe.onPointerDown}
					role="application"
					aria-label="Pré d'automne — dessine des courants d'air"
				>
					{flow?.dirs.map((d, i) => (d != null ? <div key={`c${i}`} className={`sl-cur d${d}`} style={at(i)} /> : null))}
					{fades.map((f) => (
						<div key={f.id} className="sl-fade" style={at(f.idx)} />
					))}
					{rocks.map((i) => (
						<div key={`r${i}`} className="sf-cell sf-rock" style={tr(i)}><span>🪨</span></div>
					))}
					{puzzle && (
						<div className="sf-cell sl-vortex" style={tr(puzzle.vortex)}><span>🌀</span></div>
					)}
					{leaves.map((c, i) => (c >= 0 ? (
						<div key={`l${i}`} className="sf-cell sl-leaf" style={{ ...tr(c), transitionDuration: `${TICK}ms` }}>
							<span style={jitter(i)}>{LEAF[i % LEAF.length]}</span>
						</div>
					) : null))}
					{puzzle && swirls.map((s) => (
						<div key={s.id} className="sf-cell sl-in" style={tr(puzzle.vortex)}><span>{s.glyph}</span></div>
					))}

					{showWin && puzzle && (
						<div className="sf-overlay" role="dialog" aria-label="Pré ramassé">
							<div className="sf-card">
								<div className="sf-mark">🌀</div>
								<h2>Toutes les feuilles !</h2>
								<p className="sf-big">💨 {breath}</p>
								<p className="sf-sub">{breath <= puzzle.par ? 'Le vent n\'aurait pas fait plus court 🎐' : `par ${puzzle.par}`}</p>
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
				Dessine des courants d'air avec le doigt&nbsp;: chaque case traversée reçoit une flèche, et les
				feuilles suivent le courant de leur case, battement après battement, jusqu'au tourbillon 🌀 qui
				les avale. Tracer par-dessus un courant le coupe à cet endroit&nbsp;: son amont se déverse dans
				ton nouveau tracé — fais converger les ruisseaux&nbsp;! Une feuille sans courant se pose et
				attend. Chaque case dessinée coûte 1 souffle&nbsp;: ramasse tout le pré en soufflant le moins
				possible — le par, c'est le réseau du vent lui-même.
			</p>
		</div>
	);
}

/* ---------- Styles (autumn variant over the shared .sf- chrome) ---------- */

const SL_CSS = `
/* The same meadow, turned to autumn gold. */
.sl-board {
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.16) calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.16) var(--sf-cell)),
    repeating-linear-gradient(90deg, transparent 0, transparent calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.16) calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.16) var(--sf-cell)),
    linear-gradient(170deg, #cde6ef 0%, #e7e0b4 36%, #ddc98f 70%, #d0b878 100%);
  border-color: #8a6d3b;
}

/* A current: flowing dashes plus an arrowhead, rotated into its direction.
   Positioned by left/top so the rotation owns the transform. */
.sl-cur {
  position: absolute;
  width: calc(100% / var(--n)); height: calc(100% / var(--n));
  pointer-events: none; z-index: 1;
  opacity: 0.8;
}
.sl-cur.d0 { transform: rotate(270deg); }
.sl-cur.d1 { transform: rotate(0deg); }
.sl-cur.d2 { transform: rotate(90deg); }
.sl-cur.d3 { transform: rotate(180deg); }
.sl-cur::before {
  content: ''; position: absolute; left: 6%; right: 22%; top: 44%; bottom: 44%;
  border-radius: 999px;
  background: repeating-linear-gradient(90deg,
    rgba(255, 255, 255, 0.85) 0 calc(var(--sf-cell) * 0.14),
    rgba(255, 255, 255, 0.15) calc(var(--sf-cell) * 0.14) calc(var(--sf-cell) * 0.34));
  animation: sl-run 0.8s linear infinite;
}
.sl-cur::after {
  content: ''; position: absolute; right: 4%; top: 50%; transform: translateY(-50%);
  border-left: calc(var(--sf-cell) * 0.17) solid rgba(255, 255, 255, 0.85);
  border-top: calc(var(--sf-cell) * 0.12) solid transparent;
  border-bottom: calc(var(--sf-cell) * 0.12) solid transparent;
}
@keyframes sl-run { to { background-position-x: calc(var(--sf-cell) * 0.34); } }

/* A severed piece of stream evaporates. */
.sl-fade {
  position: absolute;
  width: calc(100% / var(--n)); height: calc(100% / var(--n));
  pointer-events: none; z-index: 1;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.5), transparent 75%);
  animation: sl-out 0.4s ease-out forwards;
}
@keyframes sl-out { to { opacity: 0; } }

.sl-vortex { z-index: 2; }
.sl-vortex span {
  display: inline-block;
  font-size: calc(var(--sf-cell) * 0.72);
  animation: sl-spin 3.2s linear infinite;
  filter: drop-shadow(0 0 6px rgba(80, 140, 200, 0.55));
}
@keyframes sl-spin { to { transform: rotate(360deg); } }

.sl-leaf {
  z-index: 3;
  transition-property: transform;
  transition-timing-function: linear;
  will-change: transform;
}
.sl-leaf span {
  display: inline-block;
  font-size: calc(var(--sf-cell) * 0.56);
  filter: drop-shadow(0 2px 2px rgba(80, 60, 20, 0.35));
}

/* Swallowed: one last twirl into the vortex. */
.sl-in { z-index: 4; }
.sl-in span {
  display: inline-block;
  font-size: calc(var(--sf-cell) * 0.56);
  animation: sl-swallow 0.65s ease-in forwards;
}
@keyframes sl-swallow { to { transform: rotate(400deg) scale(0); opacity: 0; } }

:root.theme-dark .sl-board, .theme-dark .sl-board {
  border-color: #5c4a28;
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.05) calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.05) var(--sf-cell)),
    repeating-linear-gradient(90deg, transparent 0, transparent calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.05) calc(var(--sf-cell) - 1px), rgba(255, 255, 255, 0.05) var(--sf-cell)),
    linear-gradient(170deg, #223447 0%, #3a3524 45%, #33291a 100%);
}
`;
