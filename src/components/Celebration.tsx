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
			{/* Shared Ludiven mascot: a crowned cocotte pops in the centre of every victory burst. */}
			<span className="lv-cocotte">🐔</span>
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
/* Crowned cocotte mascot — the common thread across every game's victory. */
.lv-cocotte {
	position: absolute;
	font-size: 46px;
	line-height: 1;
	filter: drop-shadow(0 4px 8px rgba(0,0,0,0.32));
	transform-origin: center bottom;
	animation: lv-cocotte-in 0.9s cubic-bezier(0.2, 1.5, 0.4, 1) forwards;
	z-index: 5;
}
.lv-cocotte::before {
	content: '👑';
	position: absolute;
	left: 50%;
	top: -0.4em;
	transform: translateX(-50%) rotate(-8deg);
	font-size: 0.5em;
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
