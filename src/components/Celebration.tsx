import { useEffect, useMemo, useState } from 'react';

/**
 * Victory celebration: a ~1s confetti burst over the solved board, then the popup.
 * `<Celebration />` is an overlay — drop it inside the board's position:relative wrapper.
 * `useCelebration(won)` gates the final popup: hold it for ~1s while confetti plays, so the
 * solved grid stays visible. Honors prefers-reduced-motion (no confetti, popup immediate).
 */

const COLORS = ['#ff5d8f', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ff8c42', '#ef476f'];
const PIECES = 26;
const HOLD_MS = 1100;

const prefersReducedMotion = (): boolean =>
	typeof window !== 'undefined' &&
	typeof window.matchMedia === 'function' &&
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** While `won` is true: `celebrating` for ~1s, then `showWin` flips on (popup gate). */
export function useCelebration(won: boolean): { celebrating: boolean; showWin: boolean } {
	const [celebrating, setCelebrating] = useState(false);
	const [showWin, setShowWin] = useState(false);

	useEffect(() => {
		if (!won) {
			setCelebrating(false);
			setShowWin(false);
			return;
		}
		if (prefersReducedMotion()) {
			setShowWin(true);
			return;
		}
		setCelebrating(true);
		setShowWin(false);
		const t = setTimeout(() => {
			setShowWin(true);
			setCelebrating(false);
		}, HOLD_MS);
		return () => clearTimeout(t);
	}, [won]);

	// AND with the live `won`: state is updated in an effect (one render late), so without
	// this the flags would leak for one render when switching mode / starting a new game.
	return { celebrating: celebrating && won, showWin: showWin && won };
}

export default function Celebration() {
	const pieces = useMemo(
		() =>
			Array.from({ length: PIECES }, (_, i) => ({
				angle: (i / PIECES) * 360 + (i % 3) * 7,
				dist: 36 + (i % 6) * 12,
				drift: (i % 2 === 0 ? 1 : -1) * (6 + (i % 4) * 4),
				delay: (i % 5) * 30,
				color: COLORS[i % COLORS.length],
			})),
		[],
	);
	return (
		<div className="lv-celebrate" aria-hidden="true">
			{pieces.map((p, i) => (
				<span
					key={i}
					className="lv-confetti"
					style={{
						['--a' as string]: `${p.angle}deg`,
						['--d' as string]: `${p.dist}px`,
						['--drift' as string]: `${p.drift}px`,
						background: p.color,
						animationDelay: `${p.delay}ms`,
					}}
				/>
			))}
			{/* Shared Ludiven mascot: a plump front-facing cocotte gives a thumbs-up on every win. */}
			<svg className="lv-cocotte" viewBox="0 0 110 108" aria-hidden="true">
				<g fill="#e0413a">
					<circle cx="42" cy="21" r="7" />
					<circle cx="52" cy="15" r="8.5" />
					<circle cx="62" cy="21" r="7" />
				</g>
				<ellipse cx="18" cy="64" rx="11" ry="19" fill="#eef0ea" />
				{/* raised right wing (arm) */}
				<path d="M 70 60 Q 84 60 89 47" stroke="#eef0ea" strokeWidth="12" strokeLinecap="round" fill="none" />
				<ellipse cx="50" cy="62" rx="35" ry="33" fill="#fdfdfb" stroke="#e6e6df" strokeWidth="1.5" />
				{/* thumbs-up hand: wide fist + thumb up on the side */}
				<g fill="#fdfdfb" stroke="#e6e6df" strokeWidth="1.4">
					<rect x="80" y="32" width="20" height="15" rx="6.5" />
					<rect x="80" y="18" width="9.5" height="17" rx="4.75" />
				</g>
				<circle cx="39" cy="51" r="5" fill="#2a2a2a" />
				<circle cx="61" cy="51" r="5" fill="#2a2a2a" />
				<circle cx="40.6" cy="49.2" r="1.6" fill="#fff" />
				<circle cx="62.6" cy="49.2" r="1.6" fill="#fff" />
				<polygon points="50,56 43,63 57,63" fill="#f5a623" />
				<circle cx="46" cy="68" r="3.6" fill="#e0413a" />
				<circle cx="54" cy="68" r="3.6" fill="#e0413a" />
				<g stroke="#f5a623" strokeWidth="3.4" strokeLinecap="round">
					<line x1="42" y1="93" x2="42" y2="100" />
					<line x1="58" y1="93" x2="58" y2="100" />
				</g>
			</svg>
			<style>{CSS}</style>
		</div>
	);
}

const CSS = `
.lv-celebrate {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	pointer-events: none;
	overflow: visible;
	z-index: 4;
}
.lv-confetti {
	position: absolute;
	width: 9px;
	height: 9px;
	border-radius: 2px;
	opacity: 0;
	transform: rotate(var(--a)) translateY(0) scale(0.3);
	animation: lv-burst 1s cubic-bezier(0.16, 0.7, 0.3, 1) forwards;
}
@keyframes lv-burst {
	0% { opacity: 1; transform: rotate(var(--a)) translateY(0) translateX(0) scale(0.3); }
	70% { opacity: 1; }
	100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--d) * -1)) translateX(var(--drift)) scale(1); }
}
/* Cocotte mascot — the common thread across every game's victory. */
.lv-cocotte {
	position: absolute;
	width: 60px;
	height: 59px;
	filter: drop-shadow(0 4px 8px rgba(0,0,0,0.28));
	transform-origin: center bottom;
	animation: lv-cocotte-in 0.9s cubic-bezier(0.2, 1.5, 0.4, 1) forwards;
	z-index: 5;
}
@keyframes lv-cocotte-in {
	0% { transform: scale(0) rotate(-18deg); opacity: 0; }
	55% { transform: scale(1.06) rotate(0); opacity: 1; }
	72% { transform: scale(1) translateY(0); }
	86% { transform: scale(1) translateY(-6px); }
	100% { transform: scale(1) translateY(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) { .lv-celebrate { display: none; } }
`;
