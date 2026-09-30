// Season 2 objects, drawn in SVG like season 1's: one framing per object, one layer per defect, so the
// four restoration states line up exactly (0 arrival, 1 cleaned, 2 repaired, 3 restored).

import type { ReactNode } from 'react';

interface Props {
	state: number;
	size?: number | string;
}

/** Shared grime layer: fractal dust clipped to the object's silhouette. */
function Grime({ id, on, children }: { id: string; on: boolean; children: ReactNode }) {
	return (
		<>
			<defs>
				<filter id={id} x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="17" />
					<feColorMatrix values="0 0 0 0 0.32  0 0 0 0 0.27  0 0 0 0 0.2  0 0 0 -1.8 1.3" />
					<feComposite in2="SourceGraphic" operator="in" />
				</filter>
			</defs>
			<g className="as2-layer" style={{ opacity: on ? 1 : 0 }} filter={`url(#${id})`}>{children}</g>
		</>
	);
}

const fade = (on: boolean) => ({ className: 'as2-layer', style: { opacity: on ? 1 : 0 } });

/* ---------- ch. 8 — the compass, "Y. K. — La Mouette, 1962" ---------- */
export function Boussole({ state, size = 200 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	return (
		<svg viewBox="0 0 200 200" width={size} role="img" aria-label={['Boussole ternie, aiguille bloquée', 'Boussole nettoyée, gravée Y. K. La Mouette 1962', 'Boussole réparée, l’aiguille trouve le nord', 'Boussole restaurée'][Math.min(3, state)]}>
			<circle cx="100" cy="104" r="80" fill="#b8862b" stroke="#5a3b0c" strokeWidth="3" />
			<circle cx="100" cy="104" r="68" fill="#f3e6c8" stroke="#8a5f16" strokeWidth="2" />
			<rect x="88" y="10" width="24" height="18" rx="5" fill="#b8862b" stroke="#5a3b0c" strokeWidth="2.5" />
			{['N', 'E', 'S', 'O'].map((l, i) => {
				const a = (i * Math.PI) / 2;
				return <text key={l} x={100 + Math.sin(a) * 52} y={110 - Math.cos(a) * 52} textAnchor="middle" fontFamily="Georgia, serif" fontSize="15" fontWeight="700" fill="#5a3b0c">{l}</text>;
			})}
			<text x="100" y="150" textAnchor="middle" fontFamily="Georgia, serif" fontSize="7.5" fill="#8a5f16" {...fade(!dirty)}>Y. K. — LA MOUETTE, 1962</text>
			{/* needle: stuck askew until repaired, then on north */}
			<g style={{ transformOrigin: '100px 104px', transform: `rotate(${fixed ? 0 : 118}deg)`, transition: 'transform 1.4s cubic-bezier(.3,.8,.3,1)' }}>
				<path d="M100 56 L108 104 L100 110 L92 104z" fill="#b8321a" />
				<path d="M100 152 L108 104 L100 98 L92 104z" fill="#2c3f63" />
			</g>
			<circle cx="100" cy="104" r="5" fill="#5a3b0c" />
			<path d="M100 40 L126 96" stroke="#fff" strokeWidth="1.8" {...fade(state < 2)} />
			<path d="M52 72 L148 72" stroke="#fff" strokeWidth="6" opacity="0.35" {...fade(done)} />
			<Grime id="as2-g-bou" on={dirty}><circle cx="100" cy="104" r="80" /></Grime>
		</svg>
	);
}

/* ---------- ch. 9 — Henri's lantern, labelled "Mouette" ---------- */
export function Fanal({ state, size = 200 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	return (
		<svg viewBox="0 0 200 220" width={size} role="img" aria-label={['Fanal rouillé, verre brisé', 'Fanal nettoyé, étiqueté Mouette', 'Fanal réparé, la flamme brûle', 'Fanal restauré'][Math.min(3, state)]}>
			<path d="M78 30 Q100 6 122 30" fill="none" stroke="#3a3a3a" strokeWidth="6" />
			<rect x="66" y="30" width="68" height="18" rx="4" fill={dirty ? '#6b5a44' : '#2f5d4a'} stroke="#1f2a24" strokeWidth="2.5" style={{ transition: 'fill 1.2s' }} />
			<rect x="72" y="48" width="56" height="112" rx="6" fill={fixed ? '#ffe7a3' : '#7f8a8c'} opacity="0.85" style={{ transition: 'fill 1.2s' }} />
			<ellipse cx="100" cy="110" rx="22" ry="34" fill="#ffc94d" opacity={fixed ? 0.9 : 0} className="as2-layer" />
			<path d="M100 92 Q108 106 100 122 Q92 106 100 92z" fill="#fff6d6" opacity={fixed ? 1 : 0} className="as2-flame" />
			{[72, 128].map((x) => <rect key={x} x={x - 4} y="48" width="8" height="112" fill={dirty ? '#5a4a36' : '#2f5d4a'} stroke="#1f2a24" style={{ transition: 'fill 1.2s' }} />)}
			<rect x="60" y="158" width="80" height="22" rx="4" fill={dirty ? '#6b5a44' : '#2f5d4a'} stroke="#1f2a24" strokeWidth="2.5" style={{ transition: 'fill 1.2s' }} />
			<g {...fade(!dirty)}>
				<rect x="80" y="186" width="40" height="14" rx="2" fill="#f4ead4" stroke="#b58b4a" />
				<text x="100" y="196" textAnchor="middle" fontFamily="'Segoe Script', cursive" fontSize="8" fill="#3b3a6b">Mouette</text>
			</g>
			<path d="M78 60 L96 92 L86 120 M96 92 L118 84" stroke="#fff" strokeWidth="2" fill="none" {...fade(!fixed)} />
			<path d="M80 56 L84 150" stroke="#fff" strokeWidth="4" opacity="0.4" {...fade(done)} />
			<Grime id="as2-g-fan" on={dirty}><rect x="60" y="30" width="80" height="150" rx="6" /></Grime>
		</svg>
	);
}

/* ---------- ch. 10 — Lucile's spyglass ---------- */
export function LongueVue({ state, size = 220 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	const ext = fixed ? 0 : -44; // the draw tubes, jammed shut until repaired
	return (
		<svg viewBox="0 0 240 120" width={size} role="img" aria-label={['Longue-vue ternie, tubes coincés', 'Longue-vue nettoyée', 'Longue-vue dépliée', 'Longue-vue restaurée, gainée de cuir'][Math.min(3, state)]}>
			<g style={{ transform: `translateX(${ext}px)`, transition: 'transform 1.2s cubic-bezier(.3,.8,.3,1)' }}>
				<rect x="150" y="50" width="70" height="20" rx="3" fill="#c8952f" stroke="#5a3b0c" strokeWidth="2" />
				<rect x="112" y="46" width="60" height="28" rx="3" fill="#d9a441" stroke="#5a3b0c" strokeWidth="2" />
			</g>
			<rect x="20" y="40" width="100" height="40" rx="6" fill={done ? '#6b3a14' : '#b8862b'} stroke="#5a3b0c" strokeWidth="2.5" style={{ transition: 'fill 1.2s' }} />
			<g {...fade(done)}>{[34, 54, 74, 94].map((x) => <path key={x} d={`M${x} 40 v40`} stroke="#4a2408" strokeWidth="1.5" strokeDasharray="3 3" />)}</g>
			<ellipse cx="20" cy="60" rx="6" ry="20" fill="#8fb7d6" stroke="#5a3b0c" strokeWidth="2" />
			<path d="M24 46 L40 76" stroke="#fff" strokeWidth="2" {...fade(state < 2)} />
			<Grime id="as2-g-lv" on={dirty}><rect x="14" y="40" width="210" height="40" rx="6" /></Grime>
		</svg>
	);
}

/* ---------- ch. 11 — the ship's boy's chest, locked for generations ---------- */
export function CoffreMousse({ state, size = 220 }: Props) {
	const dirty = state < 1, open = state === 2, done = state >= 3;
	return (
		<svg viewBox="0 0 220 170" width={size} role="img" aria-label={['Coffre de mousse verrouillé, couvert de moisissure', 'Coffre nettoyé, gravé S. K. 1813', 'Coffre ouvert : un carnet de bord', 'Coffre restauré, poignées de corde neuves'][Math.min(3, state)]}>
			<g {...fade(open)}>
				<path d="M36 76 L184 76 L176 30 L44 30z" fill="#5a3a1c" stroke="#2a1606" strokeWidth="2.5" />
				<rect x="90" y="62" width="40" height="16" rx="2" fill="#e8dcc0" stroke="#8a7a58" transform="rotate(-6 110 70)" />
			</g>
			<g {...fade(!open)}><rect x="30" y="54" width="160" height="26" rx="4" fill="#7a5230" stroke="#2a1606" strokeWidth="2.5" /></g>
			<rect x="30" y="78" width="160" height="72" rx="4" fill="#7a5230" stroke="#2a1606" strokeWidth="2.5" />
			<path d="M30 100 H190 M30 124 H190" stroke="#5a3a1c" strokeWidth="2" />
			<rect x="100" y="80" width="20" height="18" rx="3" fill={done ? '#d9a441' : '#6b5a44'} stroke="#2a1606" strokeWidth="2" style={{ transition: 'fill 1.2s' }} />
			{/* rope handles: frayed, then new */}
			<path d="M14 96 Q8 112 22 118 M206 96 Q212 112 198 118" fill="none" stroke={done ? '#d9b27a' : '#8a7a58'} strokeWidth="5" strokeDasharray={done ? 'none' : '6 4'} style={{ transition: 'stroke 1.2s' }} />
			<text x="110" y="142" textAnchor="middle" fontFamily="Georgia, serif" fontSize="10" fill="#2a1606" {...fade(!dirty)}>S. K. · 1813</text>
			<Grime id="as2-g-cof" on={dirty}><rect x="30" y="54" width="160" height="96" rx="4" /></Grime>
		</svg>
	);
}

/* ---------- ch. 12 — La Mouette, the real dinghy ---------- */
export function Canot({ state, size = 240 }: Props) {
	const dirty = state < 1, fixed = state >= 2, done = state >= 3;
	return (
		<svg viewBox="0 0 260 170" width={size} role="img" aria-label={['Canot fracassé, coque fendue', 'Canot poncé', 'Canot réparé, mât dressé', 'La Mouette prête à naviguer'][Math.min(3, state)]}>
			<g {...fade(fixed)}>
				<rect x="126" y="18" width="5" height="110" fill="#8a5a2b" />
				<path d="M132 24 Q176 70 172 124 L132 124z" fill="#f7f0e0" stroke="#b9a57e" {...fade(done)} />
			</g>
			<path d="M20 110 L240 110 Q226 150 190 156 L70 156 Q34 150 20 110z" fill={done ? '#2c5f8a' : dirty ? '#6b5a44' : '#c8a57a'} stroke="#2a1606" strokeWidth="2.5" style={{ transition: 'fill 1.2s' }} />
			<path d="M26 122 L234 122" stroke={done ? '#f4ead4' : '#8a6a3a'} strokeWidth="3" style={{ transition: 'stroke 1.2s' }} />
			<text x="196" y="143" textAnchor="middle" fontFamily="Georgia, serif" fontSize="11" fontStyle="italic" fill="#f4ead4" {...fade(done)}>La Mouette</text>
			<path d="M92 112 L104 134 L96 154 M150 112 L142 138" stroke="#1a0e04" strokeWidth="3" fill="none" {...fade(!fixed)} />
			<Grime id="as2-g-can" on={dirty}><path d="M20 110 L240 110 Q226 150 190 156 L70 156 Q34 150 20 110z" /></Grime>
		</svg>
	);
}

/* ---------- ch. 13 — the bell of L'Espérance ---------- */
export function Cloche({ state, size = 200 }: Props) {
	const green = state < 1, fixed = state >= 2, done = state >= 3;
	return (
		<svg className={done ? 'as2-ring' : ''} viewBox="0 0 200 210" width={size} role="img" aria-label={['Cloche couverte de vert-de-gris', 'Cloche nettoyée, le nom L’Espérance apparaît', 'Cloche au battant remonté', 'Cloche restaurée qui sonne'][Math.min(3, state)]}>
			<rect x="60" y="14" width="80" height="12" rx="4" fill="#5a3a1c" />
			<rect x="94" y="24" width="12" height="16" fill={green ? '#4f7a63' : '#b8862b'} style={{ transition: 'fill 1.2s' }} />
			<g className="as2-bell">
				<path d="M100 38 Q58 40 54 120 L42 158 L158 158 L146 120 Q142 40 100 38z" fill={green ? '#5f8f76' : '#d9a441'} stroke="#5a3b0c" strokeWidth="2.5" style={{ transition: 'fill 1.4s' }} />
				<path d="M48 146 H152" stroke={green ? '#3f6a55' : '#8a5f16'} strokeWidth="3" />
				<text x="100" y="118" textAnchor="middle" fontFamily="Georgia, serif" fontSize="9.5" fontWeight="700" letterSpacing="0.5" fill="#5a3b0c" {...fade(!green)}>L’ESPÉRANCE</text>
				<text x="100" y="132" textAnchor="middle" fontFamily="Georgia, serif" fontSize="7" fill="#5a3b0c" {...fade(!green)}>1809</text>
				<path d="M70 70 Q66 100 64 130" stroke="#fff" strokeWidth="5" opacity="0.4" fill="none" {...fade(done)} />
				<g {...fade(fixed)}><circle cx="100" cy="166" r="9" fill="#8a5f16" /><rect x="98" y="120" width="4" height="40" fill="#8a5f16" /></g>
			</g>
			<Grime id="as2-g-clo" on={green}><path d="M100 38 Q58 40 54 120 L42 158 L158 158 L146 120 Q142 40 100 38z" /></Grime>
		</svg>
	);
}

export const SAISON2_CSS = `
.as2-layer { transition: opacity 1.4s ease; }
.as2-flame { transition: opacity 1s; animation: as2-flick 1.6s ease-in-out infinite alternate; transform-origin: 100px 120px; }
@keyframes as2-flick { from { transform: scaleY(1); } to { transform: scaleY(0.88); } }
.as2-ring .as2-bell { transform-origin: 100px 30px; animation: as2-swing 1.8s ease-in-out infinite; }
@keyframes as2-swing { 0%, 100% { transform: rotate(-7deg); } 50% { transform: rotate(7deg); } }
@media (prefers-reduced-motion: reduce) { .as2-flame, .as2-ring .as2-bell { animation: none; } }
`;
