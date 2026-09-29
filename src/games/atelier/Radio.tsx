// Mme Garnier's 1960s radio, drawn in SVG like the watch: one framing, one layer per defect.
//   0 dusty cabinet, torn grille, dark     1 cabinet and grille clean
//   2 valve on: pilot light and dial lit   3 needle on the station, sound waves

interface Props {
	state: number;
	size?: number | string;
}

const SCALE = Array.from({ length: 21 }, (_, i) => i);

export default function Radio({ state, size = 220 }: Props) {
	const dusty = state < 1;
	const lit = state >= 2;
	const tuned = state >= 3;
	return (
		<svg
			className={`atr ${tuned ? 'atr-on' : ''}`}
			viewBox="0 0 240 180"
			width={size}
			role="img"
			aria-label={['Radio poussiéreuse, grille déchirée', 'Radio nettoyée, éteinte', 'Radio allumée, sans station', 'Radio qui joue'][Math.min(3, state)]}
		>
			<defs>
				<linearGradient id="atr-wood" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#b8733a" />
					<stop offset="0.5" stopColor="#8f4f22" />
					<stop offset="1" stopColor="#6b3814" />
				</linearGradient>
				<pattern id="atr-weave" width="6" height="6" patternUnits="userSpaceOnUse">
					<rect width="6" height="6" fill="#e3cf9f" />
					<path d="M0 3h6M3 0v6" stroke="#c9ad73" strokeWidth="1.2" />
				</pattern>
				<radialGradient id="atr-glow" cx="0.5" cy="0.5" r="0.6">
					<stop offset="0" stopColor="#fff2b8" />
					<stop offset="1" stopColor="#f4c96a" />
				</radialGradient>
				<filter id="atr-dust" x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="3" seed="3" />
					<feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.52  0 0 0 0 0.46  0 0 0 -1.8 1.25" />
					<feComposite in2="SourceGraphic" operator="in" />
				</filter>
			</defs>

			{/* Sound waves, behind the cabinet so they seem to come out of it. */}
			<g className="atr-waves" style={{ opacity: tuned ? 1 : 0 }} fill="none" stroke="#e0a13a" strokeWidth="4" strokeLinecap="round">
				<path d="M20 60 Q6 90 20 120" />
				<path d="M8 48 Q-10 90 8 132" />
				<path d="M220 60 Q234 90 220 120" />
				<path d="M232 48 Q250 90 232 132" />
			</g>

			{/* Cabinet */}
			<rect x="24" y="22" width="192" height="138" rx="18" fill="url(#atr-wood)" stroke="#4a2408" strokeWidth="3" />
			<rect x="34" y="32" width="172" height="118" rx="12" fill="none" stroke="#d99a5c" strokeWidth="1.5" opacity="0.5" />
			<rect x="60" y="160" width="14" height="10" rx="2" fill="#4a2408" />
			<rect x="166" y="160" width="14" height="10" rx="2" fill="#4a2408" />

			{/* Grille */}
			<rect x="40" y="40" width="96" height="102" rx="8" fill="url(#atr-weave)" stroke="#5a2e0e" strokeWidth="2" />
			<g className="atr-layer" style={{ opacity: dusty ? 1 : 0 }}>
				<rect x="40" y="40" width="96" height="102" rx="8" fill="#6b5a40" opacity="0.45" />
				<path d="M88 70 L100 88 L94 104 L106 122" stroke="#3a2a14" strokeWidth="3" fill="none" strokeLinecap="round" />
				<path d="M92 80 L102 90" stroke="#2a1a08" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
			</g>

			{/* Dial window */}
			<rect x="146" y="40" width="60" height="54" rx="6" fill={lit ? 'url(#atr-glow)' : '#d8c9a6'} stroke="#5a2e0e" strokeWidth="2" style={{ transition: 'fill 1s' }} />
			{SCALE.map((i) => (
				<line key={i} x1={150 + i * 2.6} y1={i % 5 === 0 ? 50 : 54} x2={150 + i * 2.6} y2={58} stroke="#5a3a14" strokeWidth={i % 5 === 0 ? 1.4 : 0.8} />
			))}
			<g fontFamily="Georgia, serif" fontSize="6" fill="#5a3a14" textAnchor="middle">
				<text x="156" y="70">PO</text>
				<text x="176" y="70">GO</text>
				<text x="196" y="70">OC</text>
			</g>
			<line className="atr-needle" x1="0" y1="44" x2="0" y2="88" stroke="#b8321a" strokeWidth="2"
				style={{ transform: `translateX(${tuned ? 184 : 152}px)` }} />

			{/* Knobs + pilot light */}
			<circle cx="160" cy="122" r="11" fill="#3a1d08" stroke="#d99a5c" strokeWidth="2" />
			<line x1="160" y1="122" x2="160" y2="113" stroke="#e8c089" strokeWidth="2" />
			<circle cx="192" cy="122" r="11" fill="#3a1d08" stroke="#d99a5c" strokeWidth="2" />
			<line x1="192" y1="122" x2={tuned ? 199 : 192} y2={tuned ? 115 : 113} stroke="#e8c089" strokeWidth="2" />
			<circle cx="176" cy="104" r="4" fill={lit ? '#ffb13b' : '#4a3a28'} style={{ transition: 'fill 0.8s' }} />
			<circle className="atr-layer" cx="176" cy="104" r="9" fill="#ffb13b" opacity={lit ? 0.35 : 0} />

			{/* Dust over the whole cabinet */}
			<g className="atr-layer" style={{ opacity: dusty ? 1 : 0 }}>
				<rect x="24" y="22" width="192" height="138" rx="18" filter="url(#atr-dust)" />
				<path d="M30 24 Q60 18 96 26" stroke="#e8e0cf" strokeWidth="3" opacity="0.5" fill="none" />
			</g>
		</svg>
	);
}

export const RADIO_CSS = `
.atr .atr-layer, .atr .atr-waves { transition: opacity 1.4s ease; }
.atr .atr-needle { transition: transform 1.4s cubic-bezier(.3,.8,.3,1); }
.atr-on .atr-waves { animation: atr-pulse 1.6s ease-in-out infinite; }
@keyframes atr-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .atr-on .atr-waves { animation: none; } }
`;
