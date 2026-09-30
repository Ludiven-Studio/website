// Season 3 objects (Mme Garnier), drawn in SVG like the others: one framing each, one layer per defect
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
					<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="23" />
					<feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0 0.18  0 0 0 -1.8 1.3" />
					<feComposite in2="SourceGraphic" operator="in" />
				</filter>
			</defs>
			<g className="as3-layer" style={{ opacity: on ? 1 : 0 }} filter={`url(#${id})`}>{children}</g>
		</>
	);
}

const fade = (on: boolean) => ({ className: 'as3-layer', style: { opacity: on ? 1 : 0 } });
const label = (states: string[], s: number) => states[Math.min(3, s)];

/* ch. 14 — the oval frame and its portrait */
export function CadreOvale({ state, size = 180 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	return (
		<svg viewBox="0 0 180 220" width={size} role="img" aria-label={label(['Cadre ovale encrassé, disjoint', 'Portrait dégagé', 'Cadre consolidé', 'Cadre restauré et refermé'], state)}>
			<ellipse cx="90" cy="110" rx="76" ry="96" fill={done ? '#c8952f' : '#8a6a3a'} stroke="#4a2408" strokeWidth="3" style={{ transition: 'fill 1.2s' }} />
			<ellipse cx="90" cy="110" rx="60" ry="80" fill="#e8dcc0" />
			<g {...fade(!dirty)}>
				<circle cx="90" cy="92" r="24" fill="#c9a882" />
				<path d="M54 172 Q58 128 90 124 Q122 128 126 172z" fill="#3a3d4a" />
				<path d="M72 80 Q90 62 108 80" fill="#5a4030" />
			</g>
			<path d="M20 64 L34 70 M152 150 L162 160" stroke="#1a0e04" strokeWidth="4" {...fade(!fixed)} />
			<path d="M40 60 Q52 40 74 32" stroke="#fff" strokeWidth="5" fill="none" opacity="0.45" {...fade(done)} />
			<Grime id="as3-g-cad" on={dirty}><ellipse cx="90" cy="110" rx="76" ry="96" /></Grime>
		</svg>
	);
}

/* ch. 15 — the sewing work table */
export function Travailleuse({ state, size = 200 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	return (
		<svg viewBox="0 0 200 200" width={size} role="img" aria-label={label(['Travailleuse ternie, pied cassé', 'Travailleuse nettoyée', 'Pied et charnières réparés', 'Travailleuse restaurée, casiers garnis'], state)}>
			<g {...fade(done)}>
				<path d="M40 60 L100 20 L160 60z" fill="#8a4a22" stroke="#4a2408" strokeWidth="2.5" />
				{[70, 100, 130].map((x, k) => <circle key={x} cx={x} cy={52} r="6" fill={['#c9504a', '#4f9dff', '#d9a441'][k]} />)}
			</g>
			<rect x="36" y="60" width="128" height="56" rx="6" fill={dirty ? '#6b5236' : '#a0602c'} stroke="#4a2408" strokeWidth="2.5" style={{ transition: 'fill 1.2s' }} />
			<rect x="80" y="80" width="40" height="10" rx="3" fill="#d9a441" />
			<path d="M52 116 L44 186 M148 116 L156 186" stroke="#6b3a14" strokeWidth="8" strokeLinecap="round" />
			<path d="M100 116 L100 150" stroke="#6b3a14" strokeWidth="8" {...fade(fixed)} />
			<path d="M100 116 L112 146" stroke="#6b3a14" strokeWidth="8" strokeLinecap="round" {...fade(!fixed)} />
			<Grime id="as3-g-tra" on={dirty}><rect x="36" y="60" width="128" height="56" rx="6" /></Grime>
		</svg>
	);
}

/* ch. 16 — the sewing stool */
export function Tabouret({ state, size = 170 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	return (
		<svg viewBox="0 0 170 190" width={size} role="img" aria-label={label(['Tabouret à l’assise déchirée', 'Tabouret nettoyé', 'Pied consolidé, assise regarnie', 'Tabouret restauré'], state)}>
			<path d="M40 70 L28 176 M130 70 L142 176 M60 74 L56 176 M110 74 L114 176" stroke="#6b3a14" strokeWidth="9" strokeLinecap="round" />
			<path d="M34 130 H136" stroke="#6b3a14" strokeWidth="6" {...fade(fixed)} />
			<ellipse cx="85" cy="64" rx="62" ry="22" fill={done ? '#6f8a3a' : fixed ? '#efe3c6' : '#9a6a5a'} stroke="#4a2408" strokeWidth="2.5" style={{ transition: 'fill 1.2s' }} />
			<path d="M60 62 L80 70 L72 78" stroke="#3a2418" strokeWidth="3" fill="none" {...fade(!fixed)} />
			<g {...fade(done)}><ellipse cx="85" cy="64" rx="62" ry="22" fill="none" stroke="#d9a441" strokeWidth="3" strokeDasharray="3 3" /></g>
			<Grime id="as3-g-tab" on={dirty}><ellipse cx="85" cy="64" rx="62" ry="22" /></Grime>
		</svg>
	);
}

/* ch. 17 — the spool box, with the old train ticket */
export function CoffretBobines({ state, size = 200 }: Props) {
	const dirty = state < 1, open = state >= 2, done = state >= 3;
	return (
		<svg viewBox="0 0 200 170" width={size} role="img" aria-label={label(['Coffret à bobines, couvercle de travers', 'Coffret nettoyé', 'Coffret ouvert, casiers réparés', 'Coffret restauré, bobines rangées'], state)}>
			<g {...fade(open)}>
				<path d="M30 72 L170 72 L160 30 L40 30z" fill="#b0703a" stroke="#4a2408" strokeWidth="2.5" />
				{[56, 82, 108, 134].map((x, k) => <g key={x}><rect x={x - 9} y="58" width="18" height="16" rx="3" fill={['#c9504a', '#4f9dff', '#d9a441', '#6f8a3a'][k]} {...fade(done)} /><rect x={x - 3} y="54" width="6" height="24" fill="#e8dcc0" {...fade(done)} /></g>)}
			</g>
			<g {...fade(!open)}><rect x="26" y="54" width="148" height="24" rx="5" fill="#b0703a" stroke="#4a2408" strokeWidth="2.5" transform={dirty ? 'rotate(-5 30 66)' : undefined} /></g>
			<rect x="30" y="76" width="140" height="72" rx="6" fill={dirty ? '#7a5a3a' : '#9a5a2a'} stroke="#4a2408" strokeWidth="2.5" style={{ transition: 'fill 1.2s' }} />
			<path d="M30 100 H170 M30 124 H170" stroke="#6b3a14" strokeWidth="2" />
			<Grime id="as3-g-cof" on={dirty}><rect x="26" y="54" width="148" height="94" rx="6" /></Grime>
		</svg>
	);
}

/* ch. 18 — Rose's logbook, rebound */
export function CarnetRose({ state, size = 190 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	return (
		<svg viewBox="0 0 190 200" width={size} role="img" aria-label={label(['Carnet de Rose, reliure déchirée', 'Carnet nettoyé', 'Reliure recousue', 'Carnet restauré'], state)}>
			<rect x="30" y="20" width="130" height="164" rx="6" fill={done ? '#6b2a14' : '#7a4a2a'} stroke="#2a1206" strokeWidth="3" style={{ transition: 'fill 1.2s' }} />
			<rect x="30" y="20" width="16" height="164" fill="#4a2408" />
			<g {...fade(fixed)}>{[40, 70, 100, 130, 160].map((y) => <path key={y} d={`M32 ${y} h12`} stroke="#d9b27a" strokeWidth="2" />)}</g>
			<path d="M46 20 L60 60 L46 90" stroke="#1a0e04" strokeWidth="3" fill="none" {...fade(!fixed)} />
			<g transform="translate(96 96)" {...fade(!dirty)}>
				<path d="M-3 -1 Q-14 -8 -24 -2 Q-15 0 -7 2z M3 -1 Q14 -8 24 -2 Q15 0 7 2z" fill="#e8c893" />
				<ellipse cx="0" cy="1" rx="5" ry="3.5" fill="#f7f0e0" />
			</g>
			<text x="96" y="130" textAnchor="middle" fontFamily="Georgia, serif" fontSize="11" fill="#e8c893" {...fade(!dirty)}>R. K. · 1813</text>
			<path d="M60 30 L150 30" stroke="#fff" strokeWidth="4" opacity="0.3" {...fade(done)} />
			<Grime id="as3-g-car" on={dirty}><rect x="30" y="20" width="130" height="164" rx="6" /></Grime>
		</svg>
	);
}

/* ch. 19 — the suitcase */
export function Valise({ state, size = 210 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	return (
		<svg viewBox="0 0 220 170" width={size} role="img" aria-label={label(['Valise sale, poignée cassée', 'Valise nettoyée', 'Poignée et doublure réparées', 'Valise prête au départ'], state)}>
			<path d="M88 44 Q88 20 110 20 Q132 20 132 44" fill="none" stroke="#4a2408" strokeWidth="8" {...fade(fixed)} />
			<path d="M88 44 Q86 30 96 26" fill="none" stroke="#4a2408" strokeWidth="8" {...fade(!fixed)} />
			<rect x="24" y="44" width="172" height="112" rx="12" fill={done ? '#2c5f8a' : dirty ? '#6b5a44' : '#8a7a58'} stroke="#2a1606" strokeWidth="3" style={{ transition: 'fill 1.2s' }} />
			<path d="M24 64 H196 M24 136 H196" stroke={done ? '#d9a441' : '#4a3a28'} strokeWidth="4" style={{ transition: 'stroke 1.2s' }} />
			{[60, 160].map((x) => <rect key={x} x={x - 8} y="56" width="16" height="16" rx="3" fill={done ? '#e2b85a' : '#6b5a44'} stroke="#2a1606" style={{ transition: 'fill 1.2s' }} />)}
			<g {...fade(done)}><rect x="130" y="96" width="46" height="26" rx="4" fill="#f4ead4" stroke="#b58b4a" transform="rotate(6 153 109)" /></g>
			<Grime id="as3-g-val" on={dirty}><rect x="24" y="44" width="172" height="112" rx="12" /></Grime>
		</svg>
	);
}

export const SAISON3_CSS = `
.as3-layer { transition: opacity 1.4s ease; }
`;
