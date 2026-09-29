// M. Morel's watch, drawn in SVG so every restoration state shares one exact framing.
// Each defect is its own layer and fades out when its step is delivered:
//   0 tarnished case, grimy dial, cracked glass, worn strap, hands stopped
//   1 case and dial clean            2 hands running            3 new glass and strap

interface Props {
	state: number;
	size?: number | string;
	className?: string;
}

const TICKS = Array.from({ length: 60 }, (_, i) => i);

export default function Watch({ state, size = 180, className }: Props) {
	const dirty = state < 1;
	const running = state >= 2;
	const mended = state >= 3;
	return (
		<svg
			className={`atw ${running ? 'atw-run' : ''} ${className ?? ''}`}
			viewBox="0 0 200 300"
			width={size}
			role="img"
			aria-label={['Montre ternie et arrêtée', 'Montre nettoyée, encore arrêtée', 'Montre qui repart', 'Montre restaurée'][Math.min(3, state)]}
		>
			<defs>
				<linearGradient id="atw-case" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="#fff6dc" />
					<stop offset="0.35" stopColor="#e2b85a" />
					<stop offset="0.7" stopColor="#a8761e" />
					<stop offset="1" stopColor="#f3d27c" />
				</linearGradient>
				<linearGradient id="atw-tarnish" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="#8a7b5e" />
					<stop offset="0.5" stopColor="#5d513c" />
					<stop offset="1" stopColor="#7a6a4b" />
				</linearGradient>
				<radialGradient id="atw-dial" cx="0.45" cy="0.4" r="0.7">
					<stop offset="0" stopColor="#fffaf0" />
					<stop offset="1" stopColor="#efe2c4" />
				</radialGradient>
				<linearGradient id="atw-strap-old" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0" stopColor="#4a3525" />
					<stop offset="0.5" stopColor="#6b5039" />
					<stop offset="1" stopColor="#453022" />
				</linearGradient>
				<linearGradient id="atw-strap-new" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0" stopColor="#6d2f12" />
					<stop offset="0.5" stopColor="#9c4a1f" />
					<stop offset="1" stopColor="#6a2d10" />
				</linearGradient>
				<filter id="atw-grime" x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="7" />
					<feColorMatrix values="0 0 0 0 0.25  0 0 0 0 0.2  0 0 0 0 0.12  0 0 0 -2.2 1.35" />
					<feComposite in2="SourceGraphic" operator="in" />
				</filter>
				<clipPath id="atw-face"><circle cx="100" cy="150" r="61" /></clipPath>
			</defs>

			{/* Strap: the worn one fades out over the new one at the last step. */}
			<g className="atw-strap">
				<path d="M72 0h56l-4 88H76z M76 212h48l4 88H72z" fill="url(#atw-strap-new)" />
				<path d="M79 6v76M121 6v76M79 218v76M121 218v76" stroke="#e8c089" strokeWidth="1.4" strokeDasharray="4 3" fill="none" opacity="0.8" />
				<rect x="84" y="250" width="32" height="7" rx="3" fill="#2c160a" opacity="0.5" />
				<rect x="84" y="266" width="32" height="7" rx="3" fill="#2c160a" opacity="0.5" />
			</g>
			<g className="atw-layer" style={{ opacity: mended ? 0 : 1 }}>
				<path d="M72 0h56l-4 88H76z M76 212h48l4 88H72z" fill="url(#atw-strap-old)" />
				<path d="M86 20c6 4 10 3 16 8M110 44c-5 3-9 9-18 8M96 230c6 5 14 2 18 9M84 262c9-2 14 4 24 1M104 284c-6-3-8 3-16 1" stroke="#2a1c12" strokeWidth="1.6" fill="none" strokeLinecap="round" />
				<path d="M72 0l3 10-3 8 4 12-2 10M128 0l-3 9 3 9-4 10 2 12M72 300l3-10-3-9 4-11M128 300l-3-8 3-10-4-10" stroke="#2a1c12" strokeWidth="1.3" fill="none" />
			</g>

			{/* Lugs + crown */}
			<path d="M64 92l10-14h52l10 14M64 208l10 14h52l10-14" fill="none" stroke={dirty ? '#5d513c' : '#b8862b'} strokeWidth="9" strokeLinejoin="round" style={{ transition: 'stroke 1.2s' }} />
			<rect x="168" y="141" width="14" height="18" rx="3" fill={dirty ? '#5d513c' : '#c8952f'} style={{ transition: 'fill 1.2s' }} />

			{/* Case */}
			<circle cx="100" cy="150" r="74" fill="url(#atw-case)" stroke="#6b4a12" strokeWidth="2" />
			<circle className="atw-layer" cx="100" cy="150" r="74" fill="url(#atw-tarnish)" style={{ opacity: dirty ? 1 : 0 }} />
			<circle cx="100" cy="150" r="66" fill="none" stroke="#7a5518" strokeWidth="3" opacity="0.6" />

			{/* Dial */}
			<circle cx="100" cy="150" r="62" fill="url(#atw-dial)" />
			{TICKS.map((i) => {
				const a = (i / 60) * Math.PI * 2;
				const big = i % 5 === 0;
				const r1 = big ? 50 : 55, r2 = 58;
				return (
					<line
						key={i}
						x1={100 + Math.sin(a) * r1}
						y1={150 - Math.cos(a) * r1}
						x2={100 + Math.sin(a) * r2}
						y2={150 - Math.cos(a) * r2}
						stroke="#3b2a14"
						strokeWidth={big ? 2.6 : 0.9}
					/>
				);
			})}
			<g fontFamily="Georgia, serif" fontSize="15" fill="#3b2a14" textAnchor="middle" fontWeight="700">
				<text x="100" y="118">12</text>
				<text x="136" y="155">3</text>
				<text x="100" y="192">6</text>
				<text x="64" y="155">9</text>
			</g>
			<text x="100" y="134" fontFamily="Georgia, serif" fontSize="6.5" fill="#6b4a12" textAnchor="middle" letterSpacing="1">J. ATELIER</text>

			{/* Hands. Stopped at 4:37. Mended, they are set to 10:08 — a still frame must show the repair
			    too (reduced motion drops the ticking) — then the second hand ticks and the minute creeps. */}
			<g className="atw-hour" style={{ transformOrigin: '100px 150px', transform: `rotate(${running ? 304 : 138}deg)` }}>
				<path d="M97 150 L100 118 L103 150z" fill="#241809" />
			</g>
			<g className="atw-min" style={{ transformOrigin: '100px 150px', transform: `rotate(${running ? 48 : 222}deg)` }}>
				<path d="M98 150 L100 100 L102 150z" fill="#241809" />
			</g>
			<g className="atw-sec" style={{ transformOrigin: '100px 150px', transform: `rotate(${running ? 0 : 222}deg)` }}>
				<path d="M99.4 162 L100 98 L100.6 162z" fill="#b8321a" />
			</g>
			<circle cx="100" cy="150" r="3.2" fill="#241809" />

			{/* Grime on the dial */}
			<g className="atw-layer" style={{ opacity: dirty ? 1 : 0 }} clipPath="url(#atw-face)">
				<rect x="38" y="88" width="124" height="124" filter="url(#atw-grime)" />
				<circle cx="100" cy="150" r="62" fill="#8a6a3a" opacity="0.25" />
			</g>

			{/* Glass: cracked until the last step, then a clean glint. */}
			<g className="atw-layer" style={{ opacity: mended ? 0 : 1 }} clipPath="url(#atw-face)">
				<path d="M128 104 L108 138 L118 150 L96 188 M108 138 L84 130 L66 136 M118 150 L146 162 M96 188 L78 206 M84 130 L74 112" stroke="#fff" strokeWidth="1.6" fill="none" opacity="0.85" strokeLinejoin="round" />
				<path d="M128 104 L108 138 L118 150 L96 188" stroke="#4a4a4a" strokeWidth="0.6" fill="none" opacity="0.6" transform="translate(1 1)" />
			</g>
			<g className="atw-layer" style={{ opacity: mended ? 1 : 0 }} clipPath="url(#atw-face)">
				<path d="M58 118 L96 90 L104 94 L64 126z" fill="#fff" opacity="0.45" />
				<path d="M70 132 L112 98 L116 101 L74 136z" fill="#fff" opacity="0.25" />
			</g>
		</svg>
	);
}

/** The caseback, engraved: the clue found at the cleaning step. */
export function WatchBack({ size = 180 }: { size?: number | string }) {
	return (
		<svg viewBox="0 0 200 200" width={size} role="img" aria-label="Dos du boîtier gravé : Pour Henri, J., 14 juin 1961">
			<defs>
				<radialGradient id="atw-back" cx="0.4" cy="0.35" r="0.75">
					<stop offset="0" stopColor="#fff3cf" />
					<stop offset="0.55" stopColor="#d9ad55" />
					<stop offset="1" stopColor="#9c6d1c" />
				</radialGradient>
			</defs>
			<circle cx="100" cy="100" r="92" fill="url(#atw-back)" stroke="#6b4a12" strokeWidth="3" />
			<circle cx="100" cy="100" r="80" fill="none" stroke="#8a5f16" strokeWidth="1.5" strokeDasharray="2 3" />
			<g fontFamily="Georgia, serif" fill="#5a3b0c" textAnchor="middle" fontStyle="italic">
				<text x="100" y="82" fontSize="17">Pour Henri</text>
				<text x="100" y="108" fontSize="22" fontWeight="700" fontStyle="normal">J.</text>
				<text x="100" y="132" fontSize="14">14 juin 1961</text>
			</g>
			<path d="M40 70 Q60 40 96 34" stroke="#fff" strokeWidth="5" opacity="0.35" fill="none" strokeLinecap="round" />
		</svg>
	);
}

export const WATCH_CSS = `
.atw .atw-layer { transition: opacity 1.4s ease; }
.atw .atw-hour, .atw .atw-min { transition: transform 1.2s cubic-bezier(.3,.8,.3,1); }
.atw-run .atw-sec { animation: atw-sec 60s steps(60) infinite; }
.atw-run .atw-min { animation: atw-min 3600s linear 1.2s infinite; }
@keyframes atw-sec { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes atw-min { from { transform: rotate(48deg); } to { transform: rotate(408deg); } }
@media (prefers-reduced-motion: reduce) { .atw-run .atw-sec, .atw-run .atw-min { animation: none; } }
`;
