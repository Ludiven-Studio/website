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

// ---------- Chapter 12: where the island looks at the port ----------
// Top view of the islet, the rest hidden in mist. The spyglass turns on the islet's centre; the lens shows what lies
// that way. Once the port is in the lens, the cove facing it is the one Samuel meant. Bearings in degrees, 0 = east,
// clockwise (SVG y goes down).
const ISLE = { x: 130, y: 128 };
const SIGHTS = [
	{ id: 'phare', at: 40, label: 'Le phare de la pointe' },
	{ id: 'village', at: 110, label: 'Le village de la falaise' },
	{ id: 'port', at: 200, label: 'Le port : les mâts du bassin, la capitainerie' },
	{ id: 'large', at: 300, label: 'Le large' },
] as const;
const COVES = [20, 80, 140, 200, 260, 320];
const PORT_AT = 200;
const angleGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const islePath = (() => {
	// A lumpy outline with a notch at each cove.
	const pts: string[] = [];
	for (let d = 0; d < 360; d += 10) {
		const notch = COVES.some((c) => angleGap(c, d) < 6) ? 12 : 0;
		const r = 50 + 6 * Math.sin((d * Math.PI) / 45) + 4 * Math.cos((d * Math.PI) / 70) - notch;
		const a = (d * Math.PI) / 180;
		pts.push(`${(ISLE.x + r * Math.cos(a)).toFixed(1)} ${(ISLE.y + r * Math.sin(a)).toFixed(1)}`);
	}
	return `M${pts.join(' L')}Z`;
})();
const coveXY = (d: number) => ({ x: ISLE.x + 46 * Math.cos((d * Math.PI) / 180), y: ISLE.y + 46 * Math.sin((d * Math.PI) / 180) });

/** What the lens shows: a horizon, and the sight within 18 degrees, if any. */
function LensView({ sight }: { sight: (typeof SIGHTS)[number]['id'] | null }) {
	return (
		<svg viewBox="0 0 120 70" className="atl-lens" aria-hidden="true">
			<defs><clipPath id="atl-lens-clip"><circle cx="60" cy="35" r="33" /></clipPath></defs>
			<g clipPath="url(#atl-lens-clip)">
				<rect width="120" height="42" fill="#bcd6e2" />
				<rect y="42" width="120" height="28" fill="#4f7f96" />
				<path d="M0 50 q8 -3 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0" stroke="#d8ecf2" strokeWidth="1" fill="none" opacity="0.7" />
				{sight === 'phare' && <><path d="M44 42 q16 -8 32 0z" fill="#6b6a5a" /><rect x="56" y="12" width="8" height="28" fill="#f4ead4" /><rect x="56" y="18" width="8" height="5" fill="#b8321a" /><rect x="56" y="29" width="8" height="5" fill="#b8321a" /><circle cx="60" cy="11" r="3" fill="#ffd24a" /></>}
				{sight === 'village' && <><path d="M20 42 L30 24 L92 22 L104 42z" fill="#7a6a4a" />{[34, 48, 62, 76].map((x) => <g key={x}><rect x={x} y="16" width="10" height="9" fill="#f4ead4" /><path d={`M${x - 1} 16 l6 -5 l6 5z`} fill="#a0461a" /></g>)}</>}
				{sight === 'port' && <><rect x="14" y="38" width="92" height="5" fill="#6b5a3a" />{[24, 34, 44, 84, 94].map((x) => <path key={x} d={`M${x} 38 v-16 M${x} 24 l6 6 h-6`} stroke="#3a2a1a" strokeWidth="1" fill={x % 20 ? '#f4ead4' : 'none'} />)}<rect x="56" y="16" width="16" height="22" fill="#d8c9a6" /><path d="M54 16 l10 -8 l10 8z" fill="#5a3a22" /><rect x="61" y="22" width="6" height="6" fill="#5a3a22" /></>}
				{sight === 'large' && <path d="M88 38 l6 -10 l6 10z M93 38 v-14" stroke="#3a2a1a" strokeWidth="0.8" fill="#f4ead4" />}
			</g>
			<circle cx="60" cy="35" r="33" fill="none" stroke="#7a5a12" strokeWidth="4" />
		</svg>
	);
}

/** Turn the spyglass until the port shows, then tap the cove that faces it. */
export function LongueVuePuzzle({ onSolve }: { onSolve: () => void }) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [angle, setAngle] = useState(320);
	const [found, setFound] = useState(false);
	const [done, setDone] = useState(false);
	const [hint, setHint] = useState<string | null>(null);
	const tapRef = useRef<{ x0: number; y0: number; moved: boolean } | null>(null);
	const sight = SIGHTS.find((s) => angleGap(s.at, angle) < 18) ?? null;
	const toSvg = (cx: number, cy: number) => {
		const m = svgRef.current?.getScreenCTM();
		if (!m) return { x: 0, y: 0 };
		const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
		return { x: p.x, y: p.y };
	};
	const aim = (cx: number, cy: number) => {
		const p = toSvg(cx, cy);
		const a = ((Math.atan2(p.y - ISLE.y, p.x - ISLE.x) * 180) / Math.PI + 360) % 360;
		setAngle(a);
		if (!found && angleGap(a, PORT_AT) < 18) { setFound(true); setHint(null); }
	};
	const { onPointerDown } = usePointerDrag(
		(cx, cy) => {
			if (done) return;
			tapRef.current = { x0: cx, y0: cy, moved: false };
		},
		(cx, cy) => {
			const t = tapRef.current;
			if (!t) return;
			if (!t.moved && Math.hypot(cx - t.x0, cy - t.y0) < 6) return;
			t.moved = true;
			aim(cx, cy);
		},
		(cx, cy) => {
			const t = tapRef.current;
			tapRef.current = null;
			if (!t || t.moved) return;
			const p = toSvg(cx, cy);
			const cove = COVES.find((d) => { const c = coveXY(d); return Math.hypot(c.x - p.x, c.y - p.y) < 14; });
			if (cove === undefined) { aim(cx, cy); return; }
			if (!found) { setHint('D’abord, trouve le port dans la longue-vue : tourne-la autour de l’îlot.'); return; }
			if (cove === PORT_AT) {
				setDone(true);
				setHint(null);
				sfx.restore();
				setTimeout(onSolve, 1600);
			} else setHint(angleGap(cove, PORT_AT) > 90 ? 'De cette crique, on ne voit que le large. Samuel parlait du port.' : 'Presque : la crique doit regarder le port bien en face.');
		},
	);
	const tip = { x: ISLE.x + 64 * Math.cos((angle * Math.PI) / 180), y: ISLE.y + 64 * Math.sin((angle * Math.PI) / 180) };
	return (
		<div className="atg">
			<p>Carnet de Samuel : <em>« La cloche reste. Là où l’île regarde le port. »</em> Tourne la longue-vue depuis l’îlot.</p>
			<div className="atl-lens-wrap">
				<LensView sight={sight?.id ?? null} />
				<span>{sight ? sight.label : 'La mer.'}</span>
			</div>
			<svg ref={svgRef} viewBox="0 0 260 256" className="atg-board atl-board" onPointerDown={onPointerDown} role="img" aria-label="L’îlot vu d’en haut, la longue-vue au centre, six criques">
				<rect width="260" height="256" rx="16" className="atl-sea" />
				<circle cx={ISLE.x} cy={ISLE.y} r="118" className="atl-mist" />
				<path d={islePath} className="atl-isle" />
				{COVES.map((d) => {
					const c = coveXY(d);
					return <circle key={d} cx={c.x} cy={c.y} r="6.5" className={`atl-cove ${found ? 'on' : ''} ${done && d === PORT_AT ? 'win' : ''}`} />;
				})}
				<g className="atl-scope">
					<line x1={ISLE.x} y1={ISLE.y} x2={tip.x} y2={tip.y} />
					<circle cx={tip.x} cy={tip.y} r="5" />
					<circle cx={ISLE.x} cy={ISLE.y} r="6" />
				</g>
			</svg>
			<p className="at-small">{done ? 'Lucas entoure la crique sur sa carte : c’est là que Samuel a caché la cloche.' : hint ?? (found ? 'Le port ! Maintenant, touche la crique de l’îlot qui le regarde.' : 'Fais glisser le doigt autour de l’îlot pour tourner la longue-vue.')}</p>
		</div>
	);
}

// ---------- Chapter 17: the spool box lid ----------
// A 3 x 3 sliding puzzle in marquetry: a little railway station. Put back, the lid lifts and the ticket is under the spools.
const T = 60;
const SHUFFLE = (() => {
	// A fixed walk of legal moves from the solved lid: always solvable, the same for everyone, no back-and-forth.
	const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];
	let empty = 8, prev = -1, seed = 17;
	// 14 steps: about a dozen moves to solve, one or two minutes by hand (checked by scripts/snap-atelier-taquin.mjs).
	for (let n = 0; n < 14; n++) {
		const r = Math.floor(empty / 3), c = empty % 3;
		const options = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && y < 3 && x >= 0 && x < 3).map(([y, x]) => y * 3 + x).filter((p) => p !== prev);
		seed = (seed * 1103515245 + 12345) % 2147483648;
		const p = options[seed % options.length];
		[cells[empty], cells[p]] = [cells[p], cells[empty]];
		prev = empty;
		empty = p;
	}
	return cells;
})();

/** The lid picture in map units 0-180: a station with a clock, a train, tracks, the sun. */
function StationArt() {
	return (
		<>
			<rect width="180" height="180" fill="#e9c98f" />
			<rect width="180" height="70" fill="#d9a85f" />
			<circle cx="150" cy="30" r="16" fill="#f2c45a" stroke="#a8742a" strokeWidth="2" />
			{/* Every tile gets something of its own: two plain sky tiles would look swappable. */}
			<path d="M8 34 q4 -12 16 -8 q6 -10 18 -2 q12 -2 10 10z" fill="#f4ead4" opacity="0.85" />
			<path d="M84 22 q4 -4 8 0 q4 -4 8 0 M98 36 q3 -3 6 0 q3 -3 6 0" stroke="#6b3a14" strokeWidth="1.6" fill="none" />
			<path d="M10 80 L60 52 L110 80z" fill="#8a4a22" />
			<rect x="18" y="80" width="84" height="56" fill="#c78a4a" stroke="#6b3a14" strokeWidth="2" />
			<rect x="34" y="83" width="52" height="12" fill="#f4ead4" stroke="#6b3a14" strokeWidth="1.5" />
			<text x="60" y="92.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#6b3a14" fontFamily="Georgia, serif">GARE</text>
			<circle cx="60" cy="70" r="9" fill="#f4ead4" stroke="#6b3a14" strokeWidth="2" />
			<path d="M60 64 V70 L64 72" stroke="#3a2a1a" strokeWidth="1.5" fill="none" />
			{[28, 52, 76].map((x) => <path key={x} d={`M${x} 136 V100 a8 8 0 0 1 16 0 V136z`} fill="#6b3a14" />)}
			<path d="M118 112 h44 v24 h-44z M124 98 h14 v14 h-14z" fill="#3a5a4a" stroke="#1f3a2e" strokeWidth="2" />
			<circle cx="128" cy="140" r="6" fill="#2a1a0a" /><circle cx="152" cy="140" r="6" fill="#2a1a0a" />
			<path d="M131 98 q-6 -12 4 -20 q10 -8 2 -18" stroke="#f4ead4" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.9" />
			<rect y="146" width="180" height="34" fill="#a8742a" />
			<path d="M0 156 H180 M0 170 H180" stroke="#5a3a14" strokeWidth="3" />
			{[10, 34, 58, 82, 106, 130, 154].map((x) => <rect key={x} x={x} y="152" width="8" height="22" fill="#6b3a14" />)}
		</>
	);
}

/** Tap a tile next to the gap to slide it; the picture on the side shows what the lid looked like. */
export function TaquinPuzzle({ onSolve }: { onSolve: () => void }) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [cells, setCells] = useState(SHUFFLE);
	const [moves, setMoves] = useState(0);
	const [done, setDone] = useState(false);
	const tapRef = useRef<{ x0: number; y0: number } | null>(null);
	const slide = (pos: number) => {
		if (done) return;
		const empty = cells.indexOf(8);
		if (Math.abs(Math.floor(pos / 3) - Math.floor(empty / 3)) + Math.abs((pos % 3) - (empty % 3)) !== 1) return;
		const next = cells.slice();
		[next[empty], next[pos]] = [next[pos], next[empty]];
		setCells(next);
		setMoves(moves + 1);
		if (next.every((t, i) => t === i)) {
			setDone(true);
			sfx.restore();
			setTimeout(onSolve, 1500);
		}
	};
	const { onPointerDown } = usePointerDrag(
		(cx, cy) => { tapRef.current = { x0: cx, y0: cy }; },
		() => {},
		() => {
			const t = tapRef.current;
			tapRef.current = null;
			const m = svgRef.current?.getScreenCTM();
			if (!t || !m) return;
			// Read where the finger went down: a tap or a short swipe started on a tile both slide it.
			const p = new DOMPoint(t.x0, t.y0).matrixTransform(m.inverse());
			const c = Math.floor(p.x / T), r = Math.floor(p.y / T);
			if (c >= 0 && c < 3 && r >= 0 && r < 3) slide(r * 3 + c);
		},
	);
	return (
		<div className="atg">
			<p>Le couvercle du coffret est en marqueterie, mais les carreaux ont été remis dans le désordre. Touche un carreau voisin du vide pour le faire glisser.</p>
			<div className="att-row">
				<svg ref={svgRef} viewBox="0 0 180 180" className="atg-board att-board" onPointerDown={onPointerDown} role="img" aria-label={`Taquin du couvercle, ${moves} coups`}>
					<defs>{Array.from({ length: 9 }, (_, k) => <clipPath key={k} id={`att-${k}`}><rect x={(k % 3) * T} y={Math.floor(k / 3) * T} width={T} height={T} /></clipPath>)}</defs>
					<rect width="180" height="180" className="att-hole" />
					{cells.map((tile, pos) => {
						if (tile === 8 && !done) return null;
						const dx = ((pos % 3) - (tile % 3)) * T, dy = (Math.floor(pos / 3) - Math.floor(tile / 3)) * T;
						return (
							<g key={tile} className={`att-tile ${tile === 8 ? 'last' : ''}`} style={{ transform: `translate(${dx}px, ${dy}px)` }}>
								<g clipPath={`url(#att-${tile})`}><StationArt /></g>
								{!done && <rect x={(tile % 3) * T + 1} y={Math.floor(tile / 3) * T + 1} width={T - 2} height={T - 2} className="att-edge" />}
							</g>
						);
					})}
				</svg>
				<div className="att-ref">
					<svg viewBox="0 0 180 180" aria-label="Le dessin d’origine du couvercle"><StationArt /></svg>
					<span>le dessin d’origine</span>
				</div>
			</div>
			<p className="at-small">{done ? 'Le couvercle se soulève. Sous les bobines, un papier plié…' : `${moves} coup${moves > 1 ? 's' : ''}`}</p>
			{!done && moves > 0 && <button className="at-link" onClick={() => { setCells(SHUFFLE); setMoves(0); }}>Recommencer</button>}
		</div>
	);
}

// ---------- Chapter 22: the fair scale ----------
// Six brass weights, one too heavy; two weighings. The heavy one is not drawn in advance: each weighing gets the
// outcome that leaves the most suspects, so only a sound method (2 v 2 or 3 v 3, then 1 v 1) can be sure. A lucky
// guess is caught out like a wrong one.
type Place = 'tray' | 'left' | 'right';
const N_WEIGHTS = 6;
const ALL = Array.from({ length: N_WEIGHTS }, (_, k) => k);

/** Tap a weight to move it tray → left pan → right pan → tray; "Peser" twice at most; then point at the heavy one. */
export function PeseePuzzle({ onSolve }: { onSolve: () => void }) {
	const [place, setPlace] = useState<Place[]>(() => ALL.map(() => 'tray'));
	const [suspects, setSuspects] = useState<number[]>(ALL);
	const [weighings, setWeighings] = useState(0);
	const [tilt, setTilt] = useState(0);
	const [picking, setPicking] = useState(false);
	const [msg, setMsg] = useState<string | null>(null);
	const [fails, setFails] = useState(0);
	const [done, setDone] = useState(false);
	const left = ALL.filter((k) => place[k] === 'left');
	const right = ALL.filter((k) => place[k] === 'right');

	const weigh = () => {
		if (weighings >= 2 || done) return;
		if (!left.length || left.length !== right.length) { setMsg('Il faut le même nombre de poids sur chaque plateau.'); return; }
		const outcomes: [number, number[]][] = [
			[0, suspects.filter((k) => place[k] === 'tray')],
			[-1, suspects.filter((k) => place[k] === 'left')],
			[1, suspects.filter((k) => place[k] === 'right')],
		];
		const [t, rest] = outcomes.reduce((a, b) => (b[1].length > a[1].length ? b : a));
		setTilt(t);
		setSuspects(rest);
		setWeighings(weighings + 1);
		setMsg(t === 0 ? 'Les plateaux restent à l’équilibre.' : `Le plateau de ${t < 0 ? 'gauche' : 'droite'} descend.`);
	};
	const choose = (k: number) => {
		setPicking(false);
		if (suspects.length === 1 && suspects[0] === k) {
			setDone(true);
			setMsg(null);
			sfx.restore();
			setTimeout(onSolve, 1600);
			return;
		}
		const other = suspects.find((s) => s !== k);
		setFails(fails + 1);
		const advice = ' La boulangère : « Ma grand-mère commençait par deux contre deux. »';
		setMsg((other === undefined
			? 'Celui-là est juste. Recommençons.'
			: `Pas sûr : ça pouvait aussi être le n° ${other + 1}. Recommençons, avec deux pesées bien choisies.`) + (fails > 0 ? advice : ''));
		setPlace(ALL.map(() => 'tray'));
		setSuspects(ALL);
		setWeighings(0);
		setTilt(0);
	};
	const tapWeight = (k: number) => {
		if (done) return;
		if (picking) { choose(k); return; }
		if (weighings > 0 && tilt !== 0) setTilt(0);
		setPlace(place.map((p, i) => (i === k ? (p === 'tray' ? 'left' : p === 'left' ? 'right' : 'tray') : p)));
	};
	const tapRef = useRef<{ k: number } | null>(null);
	const { onPointerDown } = usePointerDrag(
		(cx, cy) => {
			const el = document.elementFromPoint(cx, cy)?.closest('[data-weight]');
			tapRef.current = el ? { k: Number(el.getAttribute('data-weight')) } : null;
		},
		() => {},
		() => {
			const t = tapRef.current;
			tapRef.current = null;
			if (t) tapWeight(t.k);
		},
	);
	// Where each weight is drawn: stacked on its pan (which moves with the tilt) or in its tray slot.
	const beamY = (side: -1 | 1) => 70 + side * tilt * 12;
	const pos = (k: number) => {
		if (place[k] === 'tray') return { x: 30 + k * 40, y: 168 };
		const side = place[k] === 'left' ? -1 : 1;
		const row = (place[k] === 'left' ? left : right).indexOf(k);
		return { x: 130 + side * 78 + ((row % 3) - 1) * 20, y: beamY(side) + 42 - Math.floor(row / 3) * 18 };
	};
	return (
		<div className="atg">
			<p>Un des six poids de la boulangère est faux : un peu trop lourd. Pose-les sur les plateaux et trouve-le en <strong>deux pesées</strong>.</p>
			<svg viewBox="0 52 260 136" className="atg-board atp-board" onPointerDown={onPointerDown} role="img" aria-label={`Balance à plateaux, ${weighings} pesée${weighings > 1 ? 's' : ''} sur 2`}>
				<rect x="122" y="70" width="16" height="78" className="atp-post" />
				<path d="M100 150 h60 l-8 -8 h-44z" className="atp-post" />
				<g className="atp-beam" style={{ transform: `rotate(${tilt * 8}deg)`, transformOrigin: '130px 70px' }}>
					<rect x="40" y="66" width="180" height="8" rx="4" />
				</g>
				{([-1, 1] as const).map((side) => (
					<g key={side} className="atp-pan" style={{ transform: `translateY(${side * tilt * 12}px)` }}>
						<path d={`M${130 + side * 78} 70 L${130 + side * 78 - 34} 112 M${130 + side * 78} 70 L${130 + side * 78 + 34} 112`} className="atp-cord" />
						<path d={`M${130 + side * 78 - 40} 112 h80 q-8 14 -40 14 q-32 0 -40 -14z`} className="atp-plate" />
					</g>
				))}
				<circle cx="130" cy="70" r="6" className="atp-pivot" />
				<rect x="6" y="150" width="248" height="36" rx="10" className="atg-tray" />
				{ALL.map((k) => {
					const p = pos(k);
					return (
						<g key={k} data-weight={k} className={`atp-weight ${picking ? 'pick' : ''} ${done && suspects[0] === k ? 'win' : ''}`} style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
							<path d="M-9 0 h18 l-2 -14 h-14z" />
							<rect x="-4" y="-18" width="8" height="5" rx="2" />
							<text y="-4" textAnchor="middle">{k + 1}</text>
						</g>
					);
				})}
			</svg>
			<div className="atp-actions">
				<button className="at-btn small" disabled={weighings >= 2 || done || picking} onClick={weigh}>Peser ({2 - weighings})</button>
				<button className={`at-btn small ${picking ? '' : 'ghost'}`} disabled={done} onClick={() => setPicking(!picking)}>{picking ? 'Touche le poids faux' : 'Désigner le faux'}</button>
			</div>
			<p className="at-small">
				{done ? 'Le n° ' + (suspects[0] + 1) + ' ! « Une balance juste, c’est un commerce honnête. »'
					: msg ?? 'Touche un poids pour le poser à gauche, à droite, ou le reprendre.'}
			</p>
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
.atg em { color: #9c2a1a; }
.atl-lens-wrap { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; color: #5a3a12; min-height: 70px; }
.atl-lens { width: 110px; flex: none; }
.atl-board { max-height: 40vh; }
.atl-sea { fill: #6f9bb0; }
.atl-mist { fill: rgba(232, 240, 244, 0.45); }
.atl-isle { fill: #c9b27a; stroke: #7a6a3a; stroke-width: 2; }
.atl-cove { fill: rgba(255, 255, 255, 0.25); stroke: #f4ead4; stroke-width: 1.5; stroke-dasharray: 2 2; }
.atl-cove.on { fill: rgba(242, 196, 90, 0.55); stroke: #7a5a12; stroke-dasharray: none; }
.atl-cove.win { fill: #b8321a; stroke: #fff4d6; }
.atl-scope line { stroke: #b08a2a; stroke-width: 7; stroke-linecap: round; }
.atl-scope circle { fill: #7a5a12; }
.atp-board { width: min(84vw, 330px); }
.atp-post { fill: #8a5a2a; }
.atp-beam rect { fill: #c9922f; stroke: #7a5a12; stroke-width: 1.2; }
.atp-beam, .atp-pan, .atp-weight { transition: transform 0.5s cubic-bezier(.3,1.4,.5,1); }
.atp-cord { stroke: #7a5a12; stroke-width: 1.2; fill: none; }
.atp-plate { fill: #e2b85a; stroke: #7a5a12; stroke-width: 1.5; }
.atp-pivot { fill: #7a5a12; }
.atp-weight { cursor: pointer; }
.atp-weight path, .atp-weight rect { fill: #d9a441; stroke: #6b4a12; stroke-width: 1.2; }
.atp-weight text { font-size: 8px; font-weight: 800; fill: #4a2a08; pointer-events: none; }
.atp-weight.pick path { fill: #f2d27a; stroke: #b8321a; stroke-width: 1.8; }
.atp-weight.win path { fill: #b8321a; }
.atp-actions { display: flex; gap: 8px; }
.att-row { display: flex; align-items: center; gap: 12px; }
.att-board { width: min(58vw, 230px); }
.att-hole { fill: #5a3a14; }
.att-tile { transition: transform 0.15s ease; cursor: pointer; }
.att-tile.last { animation: atg-fade 0.6s ease; }
@keyframes atg-fade { from { opacity: 0; } }
.att-edge { fill: none; stroke: #5a3a14; stroke-width: 1.5; }
.att-ref { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 22vw; max-width: 90px; font-size: 11px; font-style: italic; color: #6b4a12; }
.att-ref svg { width: 100%; border: 2px solid #8a6a3a; border-radius: 4px; }
`;
