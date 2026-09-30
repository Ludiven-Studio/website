// Season 4 objects (Mlle Chen), drawn in SVG like the others: one framing each, one layer per defect
// (0 arrival, 1 cleaned, 2 repaired, 3 restored).

import type { ReactNode } from 'react';

interface Props {
	state: number;
	size?: number | string;
}

function Grime({ id, on, children }: { id: string; on: boolean; children: ReactNode }) {
	return (
		<>
			<defs>
				<filter id={id} x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="29" />
					<feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.26  0 0 0 0 0.2  0 0 0 -1.8 1.3" />
					<feComposite in2="SourceGraphic" operator="in" />
				</filter>
			</defs>
			<g className="as4-layer" style={{ opacity: on ? 1 : 0 }} filter={`url(#${id})`}>{children}</g>
		</>
	);
}

const fade = (on: boolean) => ({ className: 'as4-layer', style: { opacity: on ? 1 : 0 } });
const label = (states: string[], s: number) => states[Math.min(3, s)];

/* ch. 20 — the suitcase stall, taken apart */
export function ValiseEtal({ state, size = 220 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	return (
		<svg viewBox="0 0 220 170" width={size} role="img" aria-label={label(['Valise démontée, charnières arrachées', 'Valise nettoyée, tasseaux visibles', 'Charnières remontées, valise ouverte', 'Valise-étal restaurée'], state)}>
			{/* Open lid, upright once the hinges are back */}
			<g style={{ transformOrigin: '110px 92px', transform: fixed ? 'none' : 'rotate(-18deg) translate(-14px, 6px)', transition: 'transform 1.2s' }}>
				<rect x="30" y="20" width="160" height="72" rx="8" fill={done ? '#c86b3a' : dirty ? '#7a5a44' : '#a07050'} stroke="#3a1c06" strokeWidth="2.5" style={{ transition: 'fill 1.2s' }} />
				{[50, 80, 110, 140, 170].map((x) => <circle key={x} cx={x} cy="56" r="3" fill="#3a1c06" />)}
			</g>
			<rect x="30" y="92" width="160" height="60" rx="8" fill={done ? '#c86b3a' : dirty ? '#7a5a44' : '#a07050'} stroke="#3a1c06" strokeWidth="2.5" style={{ transition: 'fill 1.2s' }} />
			<path d="M44 104 H176 M44 124 H176 M44 144 H176" stroke="#5a3a1c" strokeWidth="3" {...fade(!dirty)} />
			<g {...fade(fixed)}>{[60, 160].map((x) => <rect key={x} x={x - 7} y="88" width="14" height="8" rx="2" fill="#d9a441" />)}</g>
			<Grime id="as4-g-val" on={dirty}><rect x="30" y="20" width="160" height="132" rx="8" /></Grime>
		</svg>
	);
}

/* ch. 21 — the folding display */
export function Presentoir({ state, size = 200 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	const spread = fixed ? 1 : 0.35;
	return (
		<svg viewBox="0 0 200 180" width={size} role="img" aria-label={label(['Présentoir plié, lattes cassées', 'Présentoir nettoyé', 'Présentoir déplié', 'Présentoir garni'], state)}>
			{[-2, -1, 0, 1, 2].map((k) => (
				<g key={k} style={{ transformOrigin: '100px 160px', transform: `rotate(${k * 16 * spread}deg)`, transition: 'transform 1.2s' }}>
					<rect x="94" y="30" width="12" height="130" rx="3" fill={dirty ? '#7a6a4a' : '#b8844a'} stroke="#4a2408" strokeWidth="1.5" style={{ transition: 'fill 1.2s' }} />
					<g {...fade(done)}><circle cx="100" cy="44" r="7" fill={['#c9504a', '#4f9dff', '#d9a441', '#6f8a3a', '#9b5de5'][k + 2]} /></g>
				</g>
			))}
			<path d="M84 90 L116 110" stroke="#1a0e04" strokeWidth="3" {...fade(!fixed)} />
			<Grime id="as4-g-pre" on={dirty}><rect x="40" y="30" width="120" height="130" /></Grime>
		</svg>
	);
}

/* ch. 22 — the baker's scales */
export function Balance({ state, size = 200 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	const tilt = fixed ? 0 : 14;
	return (
		<svg viewBox="0 0 200 180" width={size} role="img" aria-label={label(['Balance ternie, fléau bloqué de travers', 'Balance nettoyée', 'Fléau réparé, à l’équilibre', 'Balance restaurée'], state)}>
			<rect x="60" y="150" width="80" height="16" rx="4" fill={done ? '#b8862b' : '#6b5a44'} stroke="#3a2a14" strokeWidth="2" style={{ transition: 'fill 1.2s' }} />
			<rect x="95" y="70" width="10" height="82" fill={done ? '#d9a441' : '#7a6a4a'} style={{ transition: 'fill 1.2s' }} />
			<g style={{ transformOrigin: '100px 70px', transform: `rotate(${tilt}deg)`, transition: 'transform 1.2s' }}>
				<rect x="30" y="66" width="140" height="8" rx="3" fill={done ? '#d9a441' : '#7a6a4a'} style={{ transition: 'fill 1.2s' }} />
				{[40, 160].map((x) => <g key={x}><path d={`M${x} 74 L${x - 18} 110 M${x} 74 L${x + 18} 110`} stroke="#3a2a14" strokeWidth="1.5" /><path d={`M${x - 26} 110 Q${x} 128 ${x + 26} 110z`} fill={done ? '#e2b85a' : '#8a7a58'} stroke="#3a2a14" strokeWidth="2" style={{ transition: 'fill 1.2s' }} /></g>)}
			</g>
			<circle cx="100" cy="70" r="7" fill="#3a2a14" />
			<Grime id="as4-g-bal" on={dirty}><rect x="10" y="60" width="180" height="106" /></Grime>
		</svg>
	);
}

/* ch. 23 — the cash box */
export function Caissette({ state, size = 190 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	return (
		<svg viewBox="0 0 190 160" width={size} role="img" aria-label={label(['Caissette cabossée, poignée tordue', 'Caissette nettoyée', 'Serrure et poignée réparées', 'Caissette repeinte'], state)}>
			<path d="M70 40 Q70 18 95 18 Q120 18 120 40" fill="none" stroke="#3a3a3a" strokeWidth="7" {...fade(fixed)} />
			<path d="M70 40 Q66 26 80 22" fill="none" stroke="#3a3a3a" strokeWidth="7" {...fade(!fixed)} />
			<rect x="24" y="40" width="142" height="100" rx="8" fill={done ? '#2f6b4a' : dirty ? '#5a5a52' : '#7a8a7a'} stroke="#1a1a14" strokeWidth="2.5" style={{ transition: 'fill 1.2s' }} />
			<path d="M24 70 H166" stroke="#1a1a14" strokeWidth="2" />
			<rect x="86" y="62" width="18" height="18" rx="3" fill={done ? '#d9a441' : '#5a5a52'} stroke="#1a1a14" style={{ transition: 'fill 1.2s' }} />
			<path d="M40 100 Q60 110 50 128" stroke="#1a1a14" strokeWidth="3" fill="none" {...fade(!fixed)} />
			<Grime id="as4-g-cai" on={dirty}><rect x="24" y="40" width="142" height="100" rx="8" /></Grime>
		</svg>
	);
}

/* ch. 24 — the drawer cabinet */
export function Casier({ state, size = 190 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	return (
		<svg viewBox="0 0 180 190" width={size} role="img" aria-label={label(['Casier aux tiroirs coincés', 'Casier nettoyé', 'Tiroirs réparés', 'Casier restauré, étiqueté'], state)}>
			<rect x="30" y="20" width="120" height="156" rx="6" fill={dirty ? '#6b5a44' : '#9a6a3a'} stroke="#3a1c06" strokeWidth="2.5" style={{ transition: 'fill 1.2s' }} />
			{[0, 1, 2, 3].map((r) => [0, 1].map((c) => (
				<g key={`${r}-${c}`} transform={`translate(${40 + c * 52} ${30 + r * 36})`}>
					<rect width="48" height="30" rx="3" fill={done ? '#c89560' : '#8a5a2a'} stroke="#3a1c06" strokeWidth="1.5"
						transform={!fixed && (r + c) % 3 === 0 ? 'rotate(-5 24 15)' : undefined} style={{ transition: 'fill 1.2s' }} />
					<circle cx="24" cy="15" r="3" fill="#d9a441" />
					<g {...fade(done)}><rect x="8" y="3" width="32" height="7" rx="1" fill="#f4ead4" /></g>
				</g>
			)))}
			<Grime id="as4-g-cas" on={dirty}><rect x="30" y="20" width="120" height="156" rx="6" /></Grime>
		</svg>
	);
}

/* ch. 25 — the player's childhood spinning top, with its clumsy blue band */
export function Toupie({ state, size = 170 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	return (
		<svg className={done ? 'as4-spin' : ''} viewBox="0 0 170 190" width={size} role="img" aria-label={label(['Toupie poussiéreuse, pointe cassée', 'Toupie nettoyée, une bande bleue maladroite', 'Pointe changée', 'Toupie repeinte, qui tourne'], state)}>
			<g className="as4-top">
				<rect x="78" y="14" width="14" height="34" rx="5" fill="#8a5a2a" />
				<path d="M20 70 Q85 36 150 70 Q130 130 85 164 Q40 130 20 70z" fill={done ? '#e2593b' : dirty ? '#8a6a5a' : '#c9704a'} stroke="#3a1c06" strokeWidth="2.5" style={{ transition: 'fill 1.2s' }} />
				<path d="M30 84 Q85 64 140 84" stroke="#2c6fd1" strokeWidth="9" fill="none" strokeLinecap="round" strokeDasharray="30 6 18 4" {...fade(!dirty)} />
				<path d="M44 108 Q85 94 126 108" stroke="#f4d98a" strokeWidth="5" fill="none" {...fade(done)} />
			</g>
			<path d="M85 164 L85 182" stroke="#3a3a3a" strokeWidth="4" strokeLinecap="round" {...fade(fixed)} />
			<path d="M85 164 L78 172" stroke="#3a3a3a" strokeWidth="4" strokeLinecap="round" {...fade(!fixed)} />
			<Grime id="as4-g-tou" on={dirty}><path d="M20 70 Q85 36 150 70 Q130 130 85 164 Q40 130 20 70z" /></Grime>
		</svg>
	);
}

export const SAISON4_CSS = `
.as4-layer { transition: opacity 1.4s ease; }
.as4-spin .as4-top { transform-origin: 85px 110px; animation: as4-wobble 1.4s ease-in-out infinite; }
@keyframes as4-wobble { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
@media (prefers-reduced-motion: reduce) { .as4-spin .as4-top { animation: none; } }
`;
