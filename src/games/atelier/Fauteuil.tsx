// The baker's little armchair, drawn in SVG like the other objects: one framing, one layer per state.
//   0 stained, torn upholstery, sagging seat     1 stripped: clean wooden frame, a magpie carved in it
//   2 seat rebuilt, plain calico                 3 new floral cover and gilt braid

interface Props {
	state: number;
	size?: number | string;
}

export default function Fauteuil({ state, size = 200 }: Props) {
	const worn = state < 1;
	const bare = state === 1;
	const padded = state >= 2;
	const done = state >= 3;
	return (
		<svg
			className="atf"
			viewBox="0 0 200 200"
			width={size}
			role="img"
			aria-label={['Fauteuil taché, assise affaissée', 'Fauteuil dégarni, une pie gravée dans le bois', 'Fauteuil à l’assise refaite', 'Fauteuil recouvert à neuf'][Math.min(3, state)]}
		>
			<defs>
				<pattern id="atf-flowers" width="18" height="18" patternUnits="userSpaceOnUse">
					<rect width="18" height="18" fill="#c9504a" />
					<circle cx="5" cy="5" r="2.6" fill="#f7d7a0" />
					<circle cx="14" cy="13" r="2.2" fill="#f7e7c8" />
					<path d="M9 9 l2 -1 M3 13 l1 2" stroke="#6f8a3a" strokeWidth="1.2" />
				</pattern>
				<filter id="atf-stain" x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="12" />
					<feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0 0.12  0 0 0 -1.7 1.3" />
					<feComposite in2="SourceGraphic" operator="in" />
				</filter>
			</defs>

			{/* Wooden frame: back posts, arms, legs */}
			<path d="M46 40 Q100 20 154 40 L150 120 L50 120z" fill="#8a5226" stroke="#4a2408" strokeWidth="2.5" />
			<rect x="34" y="96" width="22" height="70" rx="6" fill="#8a5226" stroke="#4a2408" strokeWidth="2.5" />
			<rect x="144" y="96" width="22" height="70" rx="6" fill="#8a5226" stroke="#4a2408" strokeWidth="2.5" />
			<path d="M50 160 L44 192 M150 160 L156 192 M78 164 L76 190 M122 164 L124 190" stroke="#4a2408" strokeWidth="7" strokeLinecap="round" />

			{/* Stripped: bare frame, webbing, the carved magpie */}
			<g className="atf-layer" style={{ opacity: bare ? 1 : 0 }}>
				<path d="M58 50 Q100 34 142 50 L138 114 L62 114z" fill="#6b3a14" />
				<path d="M66 60 H134 M66 76 H134 M66 92 H134 M82 52 V112 M100 48 V112 M118 52 V112" stroke="#d9c49a" strokeWidth="4" />
				<rect x="56" y="124" width="88" height="32" rx="4" fill="#6b3a14" />
				<path d="M60 132 H140 M60 146 H140" stroke="#d9c49a" strokeWidth="4" />
				{/* The magpie, carved on a pale medallion at the top of the back: the clue of chapter 5. */}
				<ellipse cx="100" cy="36" rx="30" ry="13" fill="#d9b27a" stroke="#4a2408" strokeWidth="2" />
				<g transform="translate(100 37) scale(1.1)">
					<path d="M-3 -1 Q-14 -8 -24 -2 Q-15 0 -7 2z M3 -1 Q14 -8 24 -2 Q15 0 7 2z" fill="#2a1206" />
					<ellipse cx="0" cy="1" rx="5" ry="3.5" fill="#f7f0e0" stroke="#2a1206" strokeWidth="1.2" />
					<circle cx="-3" cy="0" r="1.6" fill="#2a1206" />
				</g>
			</g>

			{/* Padded seat and back, calico then flowers */}
			<g className="atf-layer" style={{ opacity: padded ? 1 : 0 }}>
				<path d="M56 48 Q100 30 144 48 L140 116 L60 116z" fill={done ? 'url(#atf-flowers)' : '#efe3c6'} stroke="#7a5a2a" strokeWidth="2" style={{ transition: 'fill 1s' }} />
				<path d="M48 118 Q100 110 152 118 L150 158 Q100 166 50 158z" fill={done ? 'url(#atf-flowers)' : '#efe3c6'} stroke="#7a5a2a" strokeWidth="2" style={{ transition: 'fill 1s' }} />
			</g>
			<g className="atf-layer" style={{ opacity: done ? 1 : 0 }}>
				<path d="M56 48 Q100 30 144 48 M50 158 Q100 166 150 158" stroke="#d9a441" strokeWidth="4" fill="none" strokeDasharray="2 3" />
			</g>

			{/* Worn: stained torn cover, sagging seat, horsehair poking out */}
			<g className="atf-layer" style={{ opacity: worn ? 1 : 0 }}>
				<path d="M56 48 Q100 30 144 48 L140 116 L60 116z" fill="#9a6a5a" stroke="#5a3a2a" strokeWidth="2" />
				<path d="M48 124 Q100 150 152 124 L150 158 Q100 164 50 158z" fill="#9a6a5a" stroke="#5a3a2a" strokeWidth="2" />
				<path d="M56 48 Q100 30 144 48 L140 116 L60 116z" filter="url(#atf-stain)" />
				<path d="M84 70 L96 84 L90 96" stroke="#3a2418" strokeWidth="3" fill="none" />
				<path d="M112 140 q4 -10 10 -4 q2 -8 8 -2 M116 142 q-3 -8 3 -10" stroke="#3a2a1a" strokeWidth="1.6" fill="none" />
			</g>
		</svg>
	);
}

export const FAUTEUIL_CSS = `
.atf .atf-layer { transition: opacity 1.4s ease; }
`;
