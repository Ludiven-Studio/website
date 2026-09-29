// Lucile's sewing box, drawn in SVG like the other objects: one framing, one layer per defect.
//   0 grimy, lid askew on a broken hinge, drawer jammed     1 clean: the marquetry shows a magpie
//   2 hinges mended, drawer open on a letter and a key      3 remounted and polished, ready to travel
// Also the three map fragments pinned in Jeanne's office. The island is drawn from the workshop's floor
// plan, flipped: chapter 6 asks the player to turn it back ("Retourne l'île, elle a un toit").

interface Props {
	state: number;
	size?: number | string;
}

export default function Boite({ state, size = 220 }: Props) {
	const dirty = state < 1;
	const fixed = state >= 2;
	const done = state >= 3;
	const open = state === 2;
	return (
		<svg
			className="atb"
			viewBox="0 0 220 180"
			width={size}
			role="img"
			aria-label={['Boîte encrassée au tiroir bloqué', 'Boîte nettoyée, une pie en marqueterie', 'Boîte réparée, tiroir ouvert sur une lettre et une clé', 'Boîte restaurée'][Math.min(3, state)]}
		>
			<defs>
				<linearGradient id="atb-wood" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#b8773f" />
					<stop offset="1" stopColor="#7a4418" />
				</linearGradient>
				<filter id="atb-grime" x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="4" />
					<feColorMatrix values="0 0 0 0 0.28  0 0 0 0 0.22  0 0 0 0 0.14  0 0 0 -1.6 1.35" />
					<feComposite in2="SourceGraphic" operator="in" />
				</filter>
			</defs>

			{/* Body */}
			<rect x="30" y="72" width="160" height="92" rx="8" fill="url(#atb-wood)" stroke="#4a2408" strokeWidth="2.5" />
			<rect x="30" y="160" width="160" height="8" rx="3" fill="#5a2e0e" />
			{/* Drawer: jammed and crooked, then shut straight; open at state 2 */}
			<g className="atb-layer" style={{ opacity: open ? 0 : 1 }}>
				<rect x="72" y="118" width="76" height="30" rx="4" fill="#8a5226" stroke="#3a1c06" strokeWidth="2"
					transform={fixed ? undefined : 'rotate(-3 110 133)'} />
				<rect x="102" y="129" width="16" height="6" rx="3" fill="#d9a441" />
			</g>
			<g className="atb-layer" style={{ opacity: open ? 1 : 0 }}>
				<path d="M64 128 L156 128 L162 160 L58 160z" fill="#6b3a14" stroke="#3a1c06" strokeWidth="2" />
				<rect x="72" y="134" width="46" height="22" rx="2" fill="#f4ead4" stroke="#b58b4a" transform="rotate(-6 95 145)" />
				<circle cx="96" cy="146" r="4" fill="#9c2a1a" />
				<g transform="translate(128 140) rotate(20)">
					<circle cx="0" cy="0" r="6" fill="none" stroke="#d9a441" strokeWidth="3" />
					<path d="M6 0 H22 M16 0 V5 M20 0 V4" stroke="#d9a441" strokeWidth="3" />
				</g>
			</g>

			{/* Lid: askew on a broken hinge, straight once mended */}
			<g style={{ transformOrigin: '30px 72px', transform: fixed ? 'none' : 'rotate(-7deg)', transition: 'transform 1.2s' }}>
				<rect x="24" y="44" width="172" height="32" rx="8" fill="url(#atb-wood)" stroke="#4a2408" strokeWidth="2.5" />
				{/* Marquetry: a magpie, wings open, in pale and dark wood */}
				<g transform="translate(110 60)">
					<ellipse cx="0" cy="0" rx="46" ry="11" fill="#e8c893" opacity="0.85" />
					<path d="M-4 -2 Q-20 -12 -36 -4 Q-22 -2 -10 2z" fill="#2a1a0e" />
					<path d="M4 -2 Q20 -12 36 -4 Q22 -2 10 2z" fill="#2a1a0e" />
					<ellipse cx="0" cy="1" rx="8" ry="5" fill="#f7f0e0" stroke="#2a1a0e" strokeWidth="1.5" />
					<path d="M0 6 L-3 12 L3 12z" fill="#2a1a0e" />
					<circle cx="-5" cy="-1" r="3" fill="#2a1a0e" />
				</g>
				<text className="atb-layer" x="110" y="40" textAnchor="middle" fontFamily="'Segoe Script', 'Bradley Hand', cursive" fontSize="12" fill="#5a2e0e" style={{ opacity: done ? 1 : 0 }}>Lucile</text>
			</g>
			<g className="atb-layer" style={{ opacity: fixed ? 0 : 1 }}>
				<path d="M34 70 L40 76 M36 76 L42 70" stroke="#2a1206" strokeWidth="2.5" />
			</g>
			<g className="atb-layer" style={{ opacity: done ? 1 : 0 }}>
				<path d="M40 82 L80 82" stroke="#fff" strokeWidth="3" opacity="0.4" strokeLinecap="round" />
				<path d="M40 50 L70 50" stroke="#fff" strokeWidth="3" opacity="0.4" strokeLinecap="round" />
			</g>

			{/* Grime over the whole box, marquetry included */}
			<g className="atb-layer" style={{ opacity: dirty ? 1 : 0 }}>
				<g transform="rotate(-7 30 72)"><rect x="24" y="44" width="172" height="32" rx="8" fill="#5a4a34" opacity="0.8" /></g>
				<rect x="30" y="72" width="160" height="92" rx="8" filter="url(#atb-grime)" />
			</g>
		</svg>
	);
}

/** Map fragments from Jeanne's office. `count` pieces of 4 (the 4th one turns up in chapter 5). */
export function MapPieces({ count = 3, size = '100%' }: { count?: number; size?: number | string }) {
	// Island outline = the workshop's floor plan, mirrored and rotated a half turn.
	const island = 'M60 58 L112 52 L118 70 L142 74 L146 118 L100 124 L96 104 L66 108 Z';
	const pieces = [
		{ clip: 'M20 20 L104 20 L100 62 L96 90 L20 88 Z', dx: -3, dy: -3, r: -3 },
		{ clip: 'M104 20 L190 20 L190 86 L128 92 L100 62 Z', dx: 4, dy: -2, r: 2 },
		{ clip: 'M20 88 L96 90 L100 62 L128 92 L122 150 L20 150 Z', dx: -2, dy: 4, r: 1.5 },
		{ clip: 'M128 92 L190 86 L190 150 L122 150 Z', dx: 3, dy: 3, r: -2 },
	];
	return (
		<svg viewBox="0 0 210 170" width={size} role="img" aria-label={`${count} morceaux de carte : un îlot marqué d’une croix`}>
			<defs>
				{pieces.map((p, k) => <clipPath key={k} id={`atm-${k}`}><path d={p.clip} /></clipPath>)}
			</defs>
			{pieces.slice(0, count).map((p, k) => (
				<g key={k} transform={`translate(${p.dx} ${p.dy}) rotate(${p.r} 105 85)`}>
					<g clipPath={`url(#atm-${k})`}>
						<rect x="20" y="20" width="170" height="130" fill="#ecdcb0" />
						<path d="M20 40 Q60 34 100 42 T190 38 M20 130 Q70 124 120 132 T190 128" stroke="#b9a57e" strokeWidth="1" fill="none" />
						<path d={island} fill="#cdb886" stroke="#6b4a12" strokeWidth="2" />
						<path d="M92 86 L102 96 M102 86 L92 96" stroke="#b8321a" strokeWidth="3" strokeLinecap="round" />
						<circle cx="97" cy="91" r="34" fill="none" stroke="#b8321a" strokeWidth="1.8" strokeDasharray="5 3" />
					</g>
					<path d={p.clip} fill="none" stroke="#8a6a3a" strokeWidth="1.2" />
				</g>
			))}
		</svg>
	);
}

export const BOITE_CSS = `
.atb .atb-layer { transition: opacity 1.4s ease; }
`;
