// Rose's sea chest, found under the bench. Drawn in SVG like the other objects, one layer per state.
//   0 grimy, saltpetre, rusted bands and lock     1 cleaned: leather branded with a magpie and R. K.
//   2 lock open, lid ajar on labelled bundles     3 leather fed, brass polished, closed and proud
// Also the chapter 6 map puzzle: turn the island over, it is the workshop's floor plan.

import { useRef, useState } from 'react';
import { MapPieces, MapClips, MapPieceArt, MAP_PIECES } from './Boite';
import { usePointerDrag } from '../usePointerDrag';

interface Props {
	state: number;
	size?: number | string;
}

export default function Malle({ state, size = 220 }: Props) {
	const dirty = state < 1;
	const open = state === 2;
	const done = state >= 3;
	return (
		<svg
			className="atk"
			viewBox="0 0 220 170"
			width={size}
			role="img"
			aria-label={['Malle couverte de salpêtre', 'Malle nettoyée, marquée d’une pie', 'Malle ouverte sur des paquets étiquetés', 'Malle restaurée'][Math.min(3, state)]}
		>
			<defs>
				<linearGradient id="atk-leather" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#8a4a22" />
					<stop offset="1" stopColor="#5a2c10" />
				</linearGradient>
				<filter id="atk-salt" x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.1" numOctaves="3" seed="21" />
					<feColorMatrix values="0 0 0 0 0.86  0 0 0 0 0.84  0 0 0 0 0.78  0 0 0 -2.2 1.3" />
					<feComposite in2="SourceGraphic" operator="in" />
				</filter>
			</defs>

			{/* Open lid and glowing bundles, state 2 only */}
			<g className="atk-layer" style={{ opacity: open ? 1 : 0 }}>
				<path d="M34 70 L186 70 L176 24 L44 24z" fill="#4a2208" stroke="#2a1206" strokeWidth="2.5" />
				<ellipse cx="110" cy="74" rx="70" ry="10" fill="#ffd98a" opacity="0.55" />
				<rect x="54" y="60" width="30" height="16" rx="4" fill="#d8c9a6" stroke="#8a7a58" />
				<rect x="92" y="58" width="34" height="18" rx="4" fill="#cfbf98" stroke="#8a7a58" />
				<rect x="134" y="62" width="28" height="14" rx="4" fill="#d8c9a6" stroke="#8a7a58" />
				<path d="M68 60 l-4 -8 h10z M146 62 l-4 -8 h10z" fill="#f4ead4" stroke="#8a7a58" strokeWidth="0.8" />
			</g>
			{/* Closed lid */}
			<g className="atk-layer" style={{ opacity: open ? 0 : 1 }}>
				<path d="M30 76 Q30 40 110 38 Q190 40 190 76z" fill="url(#atk-leather)" stroke="#2a1206" strokeWidth="2.5" />
				<path d="M70 76 Q70 44 72 40 M148 76 Q148 44 146 40" stroke={done ? '#d9a441' : '#6b4a2a'} strokeWidth="7" fill="none" style={{ transition: 'stroke 1.2s' }} />
			</g>
			{/* Body */}
			<rect x="30" y="76" width="160" height="80" rx="6" fill="url(#atk-leather)" stroke="#2a1206" strokeWidth="2.5" />
			<path d="M72 76 V156 M148 76 V156" stroke={done ? '#d9a441' : '#6b4a2a'} strokeWidth="7" style={{ transition: 'stroke 1.2s' }} />
			<path d="M30 118 H190" stroke={done ? '#c8952f' : '#5a3a22'} strokeWidth="4" style={{ transition: 'stroke 1.2s' }} />
			{/* Lock */}
			<rect x="98" y="80" width="24" height="26" rx="4" fill={done ? '#e2b85a' : '#7a5a3a'} stroke="#2a1206" strokeWidth="2" style={{ transition: 'fill 1.2s' }} />
			<circle cx="110" cy="93" r="3.5" fill="#2a1206" />
			{/* Brand: a magpie and R. K., once clean */}
			<g className="atk-layer" style={{ opacity: dirty ? 0 : 1 }} transform="translate(110 136)">
				<path d="M-3 -1 Q-12 -7 -20 -2 Q-12 0 -6 2z M3 -1 Q12 -7 20 -2 Q12 0 6 2z" fill="#2a1206" opacity="0.8" />
				<text x="0" y="14" textAnchor="middle" fontFamily="Georgia, serif" fontSize="9" fill="#2a1206" opacity="0.8">R. K.</text>
			</g>
			<g className="atk-layer" style={{ opacity: done ? 1 : 0 }}>
				<path d="M40 86 H64 M40 128 H62" stroke="#fff" strokeWidth="3" opacity="0.3" strokeLinecap="round" />
			</g>
			{/* Saltpetre and rust */}
			<g className="atk-layer" style={{ opacity: dirty ? 1 : 0 }}>
				<path d="M30 76 Q30 40 110 38 Q190 40 190 76z" filter="url(#atk-salt)" />
				<rect x="30" y="76" width="160" height="80" rx="6" filter="url(#atk-salt)" />
				<path d="M72 90 v10 M148 100 v12 M104 106 l-3 8" stroke="#a0461a" strokeWidth="3" opacity="0.8" />
			</g>
		</svg>
	);
}

// The island, turned a half-turn around the map's centre, is the workshop's floor plan (see Boite.tsx).
const PLAN = 'M150 112 L98 118 L92 100 L68 96 L64 52 L110 46 L114 66 L144 62 Z';
const ZONES = [
	{ id: 'etageres', label: 'Étagères', x: 66, y: 50, w: 40, h: 14 },
	{ id: 'couture', label: 'Couture', x: 70, y: 80, w: 22, h: 14 },
	{ id: 'etabli', label: 'Établi', x: 96, y: 70, w: 34, h: 20 },
	{ id: 'porte', label: 'Porte', x: 132, y: 70, w: 14, h: 36 },
];

interface Bit { x: number; y: number; turns: number; placed: boolean; z: number }
// Pile below the frame: where each piece starts (its centre) and how many quarter turns it is off.
const PILE: { x: number; y: number; turns: number }[] = [
	{ x: 152, y: 276, turns: 2 },
	{ x: 58, y: 206, turns: 3 },
	{ x: 66, y: 276, turns: 1 },
	{ x: 160, y: 204, turns: 1 },
];
const SNAP = 16;
// Board height in map units: the frame, then room for the pile, turned pieces included.
const H = 336;

/** The four pieces scattered and turned: drag each onto the frame, tap it to turn it a quarter. */
function MapAssembly({ onDone }: { onDone: () => void }) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [bits, setBitsState] = useState<Bit[]>(() => PILE.map((p, k) => ({ ...p, placed: false, z: k })));
	// Pointer moves render a frame late: the handlers read and write this, always current.
	const live = useRef(bits);
	const setBits = (next: Bit[]) => { live.current = next; setBitsState(next); };
	const [hint, setHint] = useState<string | null>(null);
	const drag = useRef<{ k: number; ox: number; oy: number; x0: number; y0: number; moved: boolean } | null>(null);
	const [dragging, setDragging] = useState<number | null>(null);
	const toMap = (cx: number, cy: number) => {
		const m = svgRef.current?.getScreenCTM();
		if (!m) return { x: 0, y: 0 };
		const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
		return { x: p.x, y: p.y };
	};
	const drop = (k: number, b: Bit): Bit => {
		const [hx, hy] = MAP_PIECES[k].c;
		const near = Math.hypot(b.x - hx, b.y - hy) < SNAP;
		if (near && b.turns % 4 === 0) { setHint(null); return { ...b, x: hx, y: hy, placed: true }; }
		if (near) setHint('C’est la bonne place, mais pas le bon sens : touche le morceau pour le tourner.');
		return { ...b, x: Math.max(10, Math.min(200, b.x)), y: Math.max(10, Math.min(H - 10, b.y)) };
	};
	const update = (k: number, f: (b: Bit) => Bit) => setBits(live.current.map((b, i) => (i === k ? f(b) : b)));
	const { onPointerDown } = usePointerDrag(
		(cx, cy) => {
			const el = document.elementFromPoint(cx, cy)?.closest('[data-bit]');
			const k = el ? Number(el.getAttribute('data-bit')) : -1;
			const bs = live.current;
			if (k < 0 || bs[k].placed) { drag.current = null; return; }
			const p = toMap(cx, cy);
			drag.current = { k, ox: p.x - bs[k].x, oy: p.y - bs[k].y, x0: cx, y0: cy, moved: false };
			const top = Math.max(...bs.map((b) => b.z)) + 1;
			update(k, (b) => ({ ...b, z: top }));
		},
		(cx, cy) => {
			const d = drag.current;
			if (!d) return;
			if (!d.moved && Math.hypot(cx - d.x0, cy - d.y0) < 6) return;
			d.moved = true;
			setDragging(d.k);
			const p = toMap(cx, cy);
			update(d.k, (b) => ({ ...b, x: p.x - d.ox, y: p.y - d.oy }));
		},
		() => {
			const d = drag.current;
			drag.current = null;
			setDragging(null);
			if (!d) return;
			// A tap turns the piece; a turn can also complete it if it already sits at home.
			const b = live.current[d.k];
			const nb = drop(d.k, d.moved ? b : { ...b, turns: b.turns + 1 });
			const next = live.current.map((x, i) => (i === d.k ? nb : x));
			setBits(next);
			if (next.every((x) => x.placed)) setTimeout(onDone, 900);
		},
	);
	const order = bits.map((b, k) => ({ b, k })).sort((a, c) => (a.b.placed === c.b.placed ? a.b.z - c.b.z : a.b.placed ? -1 : 1));
	const left = bits.filter((b) => !b.placed).length;
	return (
		<>
			<p>{left ? 'Reconstitue la carte : fais glisser chaque morceau sur le cadre, touche-le pour le tourner.' : 'La carte est entière.'}</p>
			<svg ref={svgRef} className="at-assemble" viewBox={`0 0 210 ${H}`} onPointerDown={onPointerDown} role="img" aria-label={`Carte à reconstituer, ${left} morceau${left > 1 ? 'x' : ''} à placer`}>
				<MapClips id="atp" />
				<rect className="at-assemble-frame" x="20" y="20" width="170" height="130" rx="2" />
				{left > 0 && <text className="at-assemble-tray" x="105" y="172" textAnchor="middle">morceaux</text>}
				{order.map(({ b, k }) => {
					const [hx, hy] = MAP_PIECES[k].c;
					return (
						<g
							key={k}
							data-bit={k}
							className={`at-bit ${b.placed ? 'placed' : ''} ${dragging === k ? 'dragging' : ''}`}
							style={{ transform: `translate(${b.x - hx}px, ${b.y - hy}px) rotate(${b.turns * 90}deg)`, transformOrigin: `${hx}px ${hy}px` }}
						>
							<MapPieceArt k={k} id="atp" />
						</g>
					);
				})}
			</svg>
			{hint && left > 0 && <p className="at-small">{hint}</p>}
		</>
	);
}

/** Chapter 6: put the map back together, read the rule, turn the map, point at the spot. Calls onSolve on the right zone. */
export function MapPuzzle({ onSolve, onClose }: { onSolve: () => void; onClose: () => void }) {
	const [assembled, setAssembled] = useState(false);
	const [flipped, setFlipped] = useState(false);
	const [miss, setMiss] = useState<string | null>(null);
	if (!assembled) {
		return (
			<div className="at-card at-puzzle">
				<h3>La carte de Rose</h3>
				<MapAssembly onDone={() => setAssembled(true)} />
				<button className="at-btn ghost small" onClick={onClose}>Plus tard</button>
			</div>
		);
	}
	return (
		<div className="at-card at-puzzle">
			<h3>La carte de Rose</h3>
			<p>La carte est entière. Au dos d’un morceau, d’une écriture ancienne : <em>« Retourne l’île, elle a un toit. »</em></p>
			<div className="at-puzzle-map">
				<div className="at-puzzle-turn" style={{ transform: flipped ? 'rotate(180deg)' : 'none' }}>
					<MapPieces count={4} joined={flipped} />
				</div>
				{flipped && (
					<svg className="at-puzzle-plan" viewBox="0 0 210 170" aria-label="Plan de l’atelier : où tombe la croix ?">
						<path d={PLAN} fill="none" stroke="#2c3f63" strokeWidth="1.5" strokeDasharray="4 3" />
						{ZONES.map((z) => (
							<g key={z.id} className="at-zone" onClick={() => {
								if (z.id === 'etabli') onSolve();
								else setMiss(z.label);
							}}>
								<rect x={z.x} y={z.y} width={z.w} height={z.h} rx="3" />
								<text x={z.x + z.w / 2} y={z.y + z.h / 2 + 3} textAnchor="middle">{z.label}</text>
							</g>
						))}
					</svg>
				)}
			</div>
			{!flipped ? (
				<button className="at-btn" onClick={() => setFlipped(true)}>Retourner la carte</button>
			) : (
				<p className="at-small">
					{miss
						? `Pas ${miss === 'Porte' ? 'devant la porte' : `sous « ${miss} »`}… « Rien n’est jamais là où on le croit », écrivait Lucile. Regarde où tombe la croix.`
						: 'Retournée, l’île a la forme exacte de l’atelier. Touche l’endroit où tombe la croix.'}
				</p>
			)}
			<button className="at-btn ghost small" onClick={onClose}>Plus tard</button>
		</div>
	);
}

export const MALLE_CSS = `
.atk .atk-layer { transition: opacity 1.4s ease; }
.at-puzzle { text-align: center; align-items: center; }
.at-puzzle em { color: #9c2a1a; }
.at-puzzle-map { position: relative; width: min(78vw, 300px); }
.at-puzzle-turn { transition: transform 1.2s cubic-bezier(.3,.8,.3,1); }
.at-puzzle-plan { position: absolute; inset: 0; width: 100%; height: 100%; animation: at-in-plan 0.6s ease 1s both; }
@keyframes at-in-plan { from { opacity: 0; } to { opacity: 1; } }
.at-zone { cursor: pointer; }
.at-zone rect { fill: rgba(44, 63, 99, 0.12); stroke: #2c3f63; stroke-width: 1; }
.at-zone:hover rect, .at-zone:focus rect { fill: rgba(44, 63, 99, 0.3); }
.at-zone text { font-size: 7px; fill: #2c3f63; font-weight: 700; pointer-events: none; }
.at-assemble { width: min(78vw, 300px); max-height: 56vh; touch-action: none; -webkit-user-select: none; user-select: none; }
.at-assemble * { touch-action: none; }
.at-assemble-frame { fill: rgba(107, 74, 42, 0.12); stroke: #8a6a3a; stroke-width: 1.2; stroke-dasharray: 4 3; }
.at-assemble-tray { font-size: 8px; fill: #9c6a3a; font-style: italic; }
.at-bit { cursor: grab; transition: transform 0.25s ease; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.35)); }
.at-bit.dragging { transition: none; cursor: grabbing; filter: drop-shadow(0 6px 6px rgba(0,0,0,0.4)); }
.at-bit.placed { cursor: default; filter: none; animation: at-bit-snap 0.5s ease; }
@keyframes at-bit-snap { 0% { filter: brightness(1.5); } 100% { filter: none; } }
`;
