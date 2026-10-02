// The Chen family's music box, the last object of the campaign. SVG like the others, one layer per state.
//   0 dusty, lacquer dull, lid shut, figurine loose     1 cleaned: the lacquered harbour and "Chen"
//   2 mechanism mended: lid open, cylinder showing       3 little ship back on its post, turning; notes rise

interface Props {
	state: number;
	size?: number | string;
}

export default function Musique({ state, size = 220 }: Props) {
	const dusty = state < 1;
	const open = state >= 2;
	const playing = state >= 3;
	return (
		<svg
			className={`atu ${playing ? 'atu-play' : ''}`}
			viewBox="0 0 220 190"
			width={size}
			role="img"
			aria-label={['Boîte à musique poussiéreuse', 'Boîte nettoyée, un port laqué et un nom : Chen', 'Boîte ouverte, le cylindre réparé', 'Boîte qui joue, un petit voilier tourne'][Math.min(3, state)]}
		>
			<defs>
				<linearGradient id="atu-lacquer" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#a8322a" />
					<stop offset="1" stopColor="#6a1612" />
				</linearGradient>
				<filter id="atu-dust" x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" seed="31" />
					<feColorMatrix values="0 0 0 0 0.6  0 0 0 0 0.56  0 0 0 0 0.48  0 0 0 -1.8 1.3" />
					<feComposite in2="SourceGraphic" operator="in" />
				</filter>
			</defs>

			{/* Notes rising once it plays */}
			<g className="atu-notes" style={{ opacity: playing ? 1 : 0 }} fill="#d9a441" fontSize="18" fontFamily="Georgia, serif">
				<text x="40" y="40">♪</text>
				<text x="166" y="30">♫</text>
				<text x="186" y="64">♪</text>
			</g>

			{/* Open lid, standing up behind the box */}
			<g className="atu-layer" style={{ opacity: open ? 1 : 0 }}>
				<rect x="40" y="40" width="140" height="62" rx="6" fill="url(#atu-lacquer)" stroke="#3a0a06" strokeWidth="2.5" />
				<rect x="50" y="48" width="120" height="46" rx="4" fill="#c9b38a" opacity="0.5" />
			</g>

			{/* Body */}
			<rect x="32" y="100" width="156" height="70" rx="8" fill="url(#atu-lacquer)" stroke="#3a0a06" strokeWidth="2.5" />
			<path d="M40 110 H180 M40 160 H180" stroke="#d9a441" strokeWidth="2" />
			<rect x="96" y="176" width="28" height="8" rx="3" fill="#3a0a06" />

			{/* Inside: cylinder and comb, then the ship on its post */}
			<g className="atu-layer" style={{ opacity: open ? 1 : 0 }}>
				<rect x="46" y="100" width="128" height="14" rx="3" fill="#2a0e08" />
				<rect x="64" y="102" width="60" height="10" rx="5" fill="#d9a441" />
				<path d="M70 104 v6 M78 103 v8 M86 105 v5 M94 103 v7 M102 104 v6 M110 103 v8 M118 105 v5" stroke="#7a5a1a" strokeWidth="1.5" />
			</g>
			<g className="atu-layer" style={{ opacity: playing ? 1 : 0 }}>
				<rect x="146" y="80" width="4" height="22" fill="#d9a441" />
				<g className="atu-ship">
					<path d="M134 80 L162 80 Q158 88 148 88 Q138 88 134 80z" fill="#8a4a22" stroke="#3a0a06" strokeWidth="1" />
					<path d="M148 80 V58 L162 76z" fill="#f7f0e0" stroke="#b9a57e" strokeWidth="0.8" />
					<path d="M147 62 L136 78 H147z" fill="#f7f0e0" stroke="#b9a57e" strokeWidth="0.8" />
				</g>
			</g>

			{/* Closed lid, with the lacquered harbour once clean */}
			<g className="atu-layer" style={{ opacity: open ? 0 : 1 }}>
				<rect x="28" y="84" width="164" height="22" rx="6" fill="url(#atu-lacquer)" stroke="#3a0a06" strokeWidth="2.5" />
				<g className="atu-layer" style={{ opacity: dusty ? 0 : 1 }}>
					<path d="M44 100 Q70 92 96 100 T150 98 T180 100" stroke="#d9a441" strokeWidth="1.5" fill="none" />
					<path d="M70 96 L78 88 L80 96z M120 96 L128 86 L132 96z" fill="#f4ead4" />
					<text x="160" y="96" fontFamily="Georgia, serif" fontSize="7" fill="#f4d98a" textAnchor="middle">Chen</text>
				</g>
			</g>
			{/* The loose figurine lying on the lid, until it is mounted again */}
			<g className="atu-layer" style={{ opacity: playing ? 0 : 1 }} transform="translate(60 132) rotate(-18)">
				<path d="M0 0 L22 0 Q19 6 11 6 Q3 6 0 0z" fill="#8a4a22" stroke="#3a0a06" strokeWidth="1" />
				<path d="M11 0 V-14 L20 -2z" fill="#e2d6bb" />
			</g>

			{/* Dust */}
			<g className="atu-layer" style={{ opacity: dusty ? 1 : 0 }}>
				<rect x="28" y="84" width="164" height="22" rx="6" filter="url(#atu-dust)" />
				<rect x="32" y="100" width="156" height="70" rx="8" filter="url(#atu-dust)" />
			</g>
		</svg>
	);
}

export const MUSIQUE_CSS = `
.atu .atu-layer, .atu .atu-notes { transition: opacity 1.4s ease; }
.atu-play .atu-ship { transform-origin: 148px 80px; animation: atu-sway 2.4s ease-in-out infinite; }
.atu-play .atu-notes text { animation: atu-rise 2.6s ease-in-out infinite; }
.atu-play .atu-notes text:nth-child(2) { animation-delay: -0.9s; }
.atu-play .atu-notes text:nth-child(3) { animation-delay: -1.7s; }
@keyframes atu-sway { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
@keyframes atu-rise { 0% { transform: translateY(6px); opacity: 0; } 40% { opacity: 1; } 100% { transform: translateY(-10px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .atu-play .atu-ship, .atu-play .atu-notes text { animation: none; } }
`;
