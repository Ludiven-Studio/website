// Small "Professor Layton" puzzles played inside restoration scenes (docs/atelier-enigmes.md).
// Touch input goes through usePointerDrag, the only drag path that holds on a real iPhone.

import { useRef, useState } from 'react';
import { usePointerDrag } from '../usePointerDrag';
import * as sfx from './sfx';

// ---------- Chapter 1: the watch movement ----------
// A chain of meshing wheels from the barrel (turns by itself) to the hand pinion. Pegs come from the chain, so
// only one placement meshes: each wheel's size fits exactly one gap. Units are the SVG's.
const CHAIN = [
	{ r: 30, a: 0 },
	{ r: 22, a: -40 },
	{ r: 16, a: 35 },
	{ r: 28, a: -20 },
	{ r: 12, a: 30 },
];
const PEGS = (() => {
	const out = [{ x: 50, y: 112 }];
	for (let k = 1; k < CHAIN.length; k++) {
		const p = out[k - 1], d = CHAIN[k - 1].r + CHAIN[k].r, a = (CHAIN[k].a * Math.PI) / 180;
		out.push({ x: p.x + d * Math.cos(a), y: p.y + d * Math.sin(a) });
	}
	return out;
})();
const BARREL = 0, PINION = PEGS.length - 1;
// The three loose wheels, shuffled in the tray.
const WHEELS = [CHAIN[3].r, CHAIN[1].r, CHAIN[2].r];
const TRAY = [{ x: 60, y: 209 }, { x: 130, y: 209 }, { x: 200, y: 209 }];
// The chain sits between y 59 (hand tip) and 156 (labels): the view starts just above it.
const W = 260, TOP = 36, H = 206;

/** A wheel outline centred on 0,0: teeth about 7 units apart, so wheels of any size look like they mesh. */
function wheelPath(r: number): string {
	const n = Math.max(8, Math.round((2 * Math.PI * r) / 7));
	const pts: string[] = [];
	for (let k = 0; k < n; k++) {
		for (const [f, rr] of [[0, r - 2.2], [0.2, r + 2.2], [0.5, r + 2.2], [0.7, r - 2.2]] as const) {
			const a = ((k + f) / n) * 2 * Math.PI;
			pts.push(`${(rr * Math.cos(a)).toFixed(2)} ${(rr * Math.sin(a)).toFixed(2)}`);
		}
	}
	return `M${pts.join(' L')}Z`;
}

function Wheel({ r, spin, dir, jam, hand }: { r: number; spin: boolean; dir: number; jam?: boolean; hand?: boolean }) {
	return (
		<g className={`atg-wheel ${spin ? 'spin' : ''} ${jam ? 'jam' : ''}`} style={{ animationDuration: `${(r / 12).toFixed(2)}s`, animationDirection: dir > 0 ? 'normal' : 'reverse' }}>
			<path d={wheelPath(r)} />
			<circle r={r * 0.62} className="atg-rim" />
			{r > 14 && [0, 1, 2, 3].map((k) => <rect key={k} x={-1.6} y={-r * 0.6} width={3.2} height={r * 0.6} transform={`rotate(${k * 90})`} className="atg-spoke" />)}
			<circle r={3} className="atg-hub" />
			{/* An invisible ring as long as the hand keeps the box centred, so fill-box spins it on its hub. */}
			{hand && <><circle r={46} fill="none" /><path d="M0 0 L0 -46" className="atg-hand" /></>}
		</g>
	);
}

/** Pegs 1-3 are empty; drop the three wheels so the barrel drives the hand. */
export function GearsPuzzle({ onSolve }: { onSolve: () => void }) {
	const svgRef = useRef<SVGSVGElement>(null);
	// Where each loose wheel sits: a peg index (1-3) or -1 (in the tray).
	const [on, setOnState] = useState<number[]>([-1, -1, -1]);
	const live = useRef(on);
	const setOn = (next: number[]) => { live.current = next; setOnState(next); };
	const [drag, setDrag] = useState<{ w: number; x: number; y: number } | null>(null);
	const dragRef = useRef<{ w: number; x0: number; y0: number; moved: boolean } | null>(null);
	const [done, setDone] = useState(false);
	const [hint, setHint] = useState<string | null>(null);

	const toSvg = (cx: number, cy: number) => {
		const m = svgRef.current?.getScreenCTM();
		if (!m) return { x: 0, y: 0 };
		const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
		return { x: p.x, y: p.y };
	};
	const radiusOn = (peg: number, at = live.current): number | null => {
		if (peg === BARREL) return CHAIN[0].r;
		if (peg === PINION) return CHAIN[PINION].r;
		const w = at.indexOf(peg);
		return w < 0 ? null : WHEELS[w];
	};
	/** Which pegs turn, and which wheels jam (too big for their gap). */
	const run = (at: number[]) => {
		const jam = new Set<number>();
		for (let p = 1; p < PINION; p++) {
			const r = radiusOn(p, at);
			if (r === null) continue;
			for (let q = 0; q < PEGS.length; q++) {
				const rq = radiusOn(q, at);
				if (q === p || rq === null) continue;
				if (Math.hypot(PEGS[p].x - PEGS[q].x, PEGS[p].y - PEGS[q].y) < r + rq - 2) jam.add(p);
			}
		}
		const turn = new Map<number, number>([[BARREL, 1]]);
		const queue = [BARREL];
		while (queue.length) {
			const p = queue.shift()!;
			for (let q = 0; q < PEGS.length; q++) {
				const rp = radiusOn(p, at), rq = radiusOn(q, at);
				if (turn.has(q) || rq === null || rp === null || jam.has(q)) continue;
				if (Math.abs(Math.hypot(PEGS[p].x - PEGS[q].x, PEGS[p].y - PEGS[q].y) - (rp + rq)) < 1.5) {
					turn.set(q, -turn.get(p)!);
					queue.push(q);
				}
			}
		}
		return { turn, jam };
	};
	const { turn, jam } = run(on);

	const place = (w: number, peg: number) => {
		const next = live.current.map((p, k) => (k === w ? peg : p === peg && peg >= 0 ? live.current[w] : p));
		setOn(next);
		const r = run(next);
		if (r.turn.has(PINION)) {
			setHint(null);
			setDone(true);
			sfx.restore();
			setTimeout(onSolve, 1600);
		} else if (peg > 0 && r.jam.has(peg)) setHint('Trop grand pour cet axe : il se coince contre son voisin.');
		else if (peg > 0 && !r.turn.has(peg)) setHint('Ce rouage ne touche rien qui tourne. Les dents doivent se toucher, ni trop près, ni trop loin.');
		else setHint(null);
	};

	const { onPointerDown } = usePointerDrag(
		(cx, cy) => {
			if (done) return;
			const el = document.elementFromPoint(cx, cy)?.closest('[data-wheel]');
			if (!el) { dragRef.current = null; return; }
			dragRef.current = { w: Number(el.getAttribute('data-wheel')), x0: cx, y0: cy, moved: false };
		},
		(cx, cy) => {
			const d = dragRef.current;
			if (!d) return;
			if (!d.moved && Math.hypot(cx - d.x0, cy - d.y0) < 6) return;
			d.moved = true;
			setDrag({ w: d.w, ...toSvg(cx, cy) });
		},
		(cx, cy) => {
			const d = dragRef.current;
			dragRef.current = null;
			setDrag(null);
			if (!d) return;
			const p = toSvg(cx, cy);
			if (!d.moved) {
				// A tap sends a placed wheel back to the tray.
				if (live.current[d.w] >= 0) place(d.w, -1);
				return;
			}
			let best = -1, bestD = 26;
			for (let q = 1; q < PINION; q++) {
				const dist = Math.hypot(PEGS[q].x - p.x, PEGS[q].y - p.y);
				if (dist < bestD) { best = q; bestD = dist; }
			}
			place(d.w, best);
		},
	);

	return (
		<div className="atg">
			<p>Le mouvement est démonté. Pose les trois rouages sur les axes vides : le barillet doit entraîner l’aiguille.</p>
			<svg ref={svgRef} viewBox={`0 ${TOP} ${W} ${H}`} className="atg-board" onPointerDown={onPointerDown} role="img" aria-label="Platine de la montre : trois axes vides, trois rouages à poser">
				<rect x="6" y="40" width={W - 12} height="132" rx="18" className="atg-plate" />
				{PEGS.map((p, k) => (
					<g key={k} transform={`translate(${p.x} ${p.y})`}>
						<circle r={k === BARREL || k === PINION ? 4 : 5} className={`atg-peg ${drag && k > 0 && k < PINION ? 'open' : ''}`} />
					</g>
				))}
				<text x={PEGS[BARREL].x} y={PEGS[BARREL].y + 44} className="atg-label">barillet</text>
				<text x={PEGS[PINION].x} y={PEGS[PINION].y + 30} className="atg-label">aiguille</text>
				<g transform={`translate(${PEGS[BARREL].x} ${PEGS[BARREL].y})`}><Wheel r={CHAIN[0].r} spin dir={1} /></g>
				<g transform={`translate(${PEGS[PINION].x} ${PEGS[PINION].y})`}><Wheel r={CHAIN[PINION].r} spin={turn.has(PINION)} dir={turn.get(PINION) ?? 1} hand /></g>
				<rect x="6" y="180" width={W - 12} height="58" rx="12" className="atg-tray" />
				{WHEELS.map((r, w) => {
					if (drag?.w === w) return null;
					const peg = on[w];
					const at = peg >= 0 ? PEGS[peg] : TRAY[w];
					return (
						<g key={w} data-wheel={w} transform={`translate(${at.x} ${at.y})`} className="atg-loose">
							<Wheel r={r} spin={peg >= 0 && turn.has(peg)} dir={turn.get(peg) ?? 1} jam={peg >= 0 && jam.has(peg)} />
						</g>
					);
				})}
				{drag && (
					<g transform={`translate(${drag.x} ${drag.y})`} className="atg-loose dragging">
						<Wheel r={WHEELS[drag.w]} spin={false} dir={1} />
					</g>
				)}
			</svg>
			<p className="at-small">{done ? 'Tic, tac… Le mouvement repart.' : hint ?? 'Fais glisser un rouage sur un axe ; touche-le pour le reprendre.'}</p>
		</div>
	);
}

export const PUZZLE_CSS = `
.atg { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.atg p { margin: 0; }
.atg-board { width: min(80vw, 320px); max-height: 46vh; touch-action: none; -webkit-user-select: none; user-select: none; }
.atg-board * { touch-action: none; }
.atg-plate { fill: #d8b866; stroke: #9a7a2a; stroke-width: 2; }
.atg-tray { fill: rgba(107, 74, 42, 0.12); stroke: #b39a6a; stroke-dasharray: 4 3; }
.atg-peg { fill: #6b4a12; }
.atg-peg.open { fill: #f2c45a; stroke: #6b4a12; stroke-width: 1.5; }
.atg-label { font-size: 9px; fill: #6b4a12; text-anchor: middle; font-style: italic; }
.atg-wheel path { fill: #e8c25a; stroke: #7a5a12; stroke-width: 1.2; }
.atg-wheel .atg-rim { fill: none; stroke: #b08a2a; stroke-width: 1.5; }
.atg-wheel .atg-spoke { fill: #b08a2a; }
.atg-wheel .atg-hub { fill: #7a5a12; }
.atg-wheel .atg-hand { stroke: #2a1a0a; stroke-width: 3; stroke-linecap: round; }
.atg-wheel { transform-box: fill-box; transform-origin: center; }
.atg-wheel.spin { animation: atg-spin linear infinite; }
.atg-wheel.jam path { fill: #e0a080; stroke: #a0461a; }
@keyframes atg-spin { to { transform: rotate(360deg); } }
.atg-loose { cursor: grab; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3)); }
.atg-loose.dragging { pointer-events: none; opacity: 0.85; filter: drop-shadow(0 6px 6px rgba(0,0,0,0.35)); }
@media (prefers-reduced-motion: reduce) { .atg-wheel.spin { animation-duration: 6s !important; } }
`;
