// Lucas's toy sailboat, drawn in SVG like the watch and the radio: one framing, one layer per defect.
//   0 grimy cracked hull, snapped mast, torn sails     1 hull sanded and varnished
//   2 mast and rudder mended, sails still furled       3 sails up, pennant, on the water

interface Props {
	state: number;
	size?: number | string;
}

export default function Voilier({ state, size = 200 }: Props) {
	const dirty = state < 1;
	const mended = state >= 2;
	const sailing = state >= 3;
	return (
		<svg
			className={`atv ${sailing ? 'atv-sail' : ''}`}
			viewBox="0 0 200 220"
			width={size}
			role="img"
			aria-label={['Voilier abîmé, mât cassé', 'Voilier à la coque poncée', 'Voilier au mât réparé', 'Voilier toutes voiles dehors'][Math.min(3, state)]}
		>
			<defs>
				<linearGradient id="atv-hull" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#c46a2c" />
					<stop offset="1" stopColor="#7a3510" />
				</linearGradient>
				<linearGradient id="atv-sail" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0" stopColor="#fffaf0" />
					<stop offset="1" stopColor="#e9dfc8" />
				</linearGradient>
				<filter id="atv-grime" x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" seed="9" />
					<feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.24  0 0 0 0 0.16  0 0 0 -2 1.3" />
					<feComposite in2="SourceGraphic" operator="in" />
				</filter>
			</defs>

			{/* Water, only once she sails */}
			<g className="atv-layer" style={{ opacity: sailing ? 1 : 0 }}>
				<path className="atv-water" d="M0 190 Q25 182 50 190 T100 190 T150 190 T200 190 V220 H0z" fill="#7fb7d6" />
				<path d="M10 200 Q35 194 60 200 M110 204 Q135 198 160 204" stroke="#e8f4fa" strokeWidth="2.5" fill="none" strokeLinecap="round" />
			</g>
			{/* Stand, until she sails */}
			<g className="atv-layer" style={{ opacity: sailing ? 0 : 1 }}>
				<path d="M70 196 L60 214 M130 196 L140 214" stroke="#5a3616" strokeWidth="6" strokeLinecap="round" />
				<rect x="50" y="210" width="100" height="8" rx="3" fill="#5a3616" />
			</g>

			{/* Mended mast, boom and sails */}
			<g className="atv-layer" style={{ opacity: mended ? 1 : 0 }}>
				<rect x="97" y="30" width="6" height="146" rx="2" fill="#8a5a2b" />
				<path d="M100 170 L150 170" stroke="#8a5a2b" strokeWidth="4" strokeLinecap="round" />
			</g>
			<g className="atv-layer" style={{ opacity: sailing ? 1 : 0 }}>
				<path d="M104 36 Q150 96 150 166 L104 166z" fill="url(#atv-sail)" stroke="#b9a57e" strokeWidth="1.5" />
				<path d="M96 52 Q60 110 58 160 L96 160z" fill="url(#atv-sail)" stroke="#b9a57e" strokeWidth="1.5" />
				<path d="M103 30 L124 36 L103 42z" fill="#c8321e" className="atv-flag" />
			</g>
			<g className="atv-layer" style={{ opacity: mended && !sailing ? 1 : 0 }}>
				<path d="M104 60 Q116 110 108 164 L104 164z" fill="#e2d6bb" stroke="#b9a57e" strokeWidth="1.2" />
			</g>

			{/* Broken mast and torn sails, until mended */}
			<g className="atv-layer" style={{ opacity: mended ? 0 : 1 }}>
				<rect x="97" y="104" width="6" height="72" rx="2" fill="#6b4520" />
				<path d="M97 104 L100 98 L103 104" fill="#6b4520" />
				<path d="M100 104 L74 66" stroke="#6b4520" strokeWidth="6" strokeLinecap="round" />
				<path d="M104 112 L140 164 L118 160 L126 146 L110 150z" fill="#cfc2a4" stroke="#8a7a58" strokeWidth="1.2" />
				<path d="M96 120 L70 162 L84 156 L80 144z" fill="#cfc2a4" stroke="#8a7a58" strokeWidth="1.2" />
			</g>

			{/* Hull */}
			<path d="M28 172 L172 172 Q162 200 134 204 L66 204 Q38 200 28 172z" fill="url(#atv-hull)" stroke="#4a1f06" strokeWidth="2.5" />
			<path d="M34 180 L166 180" stroke="#e9b27a" strokeWidth="2" opacity="0.7" />
			<path d="M150 196 L162 214" stroke="#4a1f06" strokeWidth="5" strokeLinecap="round" className="atv-layer" style={{ opacity: mended ? 1 : 0 }} />
			<g className="atv-layer" style={{ opacity: dirty ? 1 : 0 }}>
				<path d="M28 172 L172 172 Q162 200 134 204 L66 204 Q38 200 28 172z" filter="url(#atv-grime)" />
				<path d="M88 176 L96 190 L90 202" stroke="#2a1206" strokeWidth="2" fill="none" />
			</g>
		</svg>
	);
}

export const VOILIER_CSS = `
.atv .atv-layer { transition: opacity 1.4s ease; }
.atv-sail .atv-water { animation: atv-bob 2.4s ease-in-out infinite; }
.atv-sail .atv-flag { transform-origin: 103px 36px; animation: atv-flap 1.2s ease-in-out infinite alternate; }
@keyframes atv-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(3px); } }
@keyframes atv-flap { from { transform: scaleX(1); } to { transform: scaleX(0.8); } }
@media (prefers-reduced-motion: reduce) { .atv-sail .atv-water, .atv-sail .atv-flag { animation: none; } }
`;
