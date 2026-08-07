import { useEffect, useMemo, useState } from 'react';

/**
 * End-of-game beat: the finished board is left alone for a moment, then the cocotte reacts for
 * ~1s over it — confetti and a thumbs-up on a win, a slumped shrug on a loss — and only after
 * that may a popup cover the whole thing.
 * `<Celebration />` is an overlay — drop it inside the board's position:relative wrapper.
 * `useCelebration(won)` gates the free-play win card; `useOutcomeHold()` gates the level card.
 * Honors prefers-reduced-motion (no animation, popup immediate).
 */

const COLORS = ['#ff5d8f', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ff8c42', '#ef476f'];
const PIECES = 26;
const LEAD_MS = 500; // the board keeps the stage for half a second — the last move deserves a look
const HOLD_MS = 1100;

const prefersReducedMotion = (): boolean =>
	typeof window !== 'undefined' &&
	typeof window.matchMedia === 'function' &&
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The three acts of an ending: `board` shows the finished grid untouched, `beat` belongs to the
 * cocotte, `card` lets the popup in. Callers mount on the outcome, win or lose, so it runs on mount.
 */
export function useOutcomeHold(): 'board' | 'beat' | 'card' {
	const [phase, setPhase] = useState<'board' | 'beat' | 'card'>('board');

	useEffect(() => {
		if (prefersReducedMotion()) {
			setPhase('card');
			return;
		}
		const a = setTimeout(() => setPhase('beat'), LEAD_MS);
		const b = setTimeout(() => setPhase('card'), LEAD_MS + HOLD_MS);
		return () => {
			clearTimeout(a);
			clearTimeout(b);
		};
	}, []);

	return phase;
}

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

export default function Celebration({ won = true }: { won?: boolean }) {
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
			{won && pieces.map((p, i) => (
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
			{/* Shared Ludiven mascot: the same plump cocotte cheers a win and sags at a loss. */}
			<svg className={won ? 'lv-cocotte' : 'lv-cocotte sad'} viewBox="0 0 110 108" aria-hidden="true">
				<g fill="#e0413a">
					{won ? (
						<>
							<circle cx="42" cy="21" r="7" />
							<circle cx="52" cy="15" r="8.5" />
							<circle cx="62" cy="21" r="7" />
						</>
					) : (
						/* the comb flops over to one side */
						<g transform="rotate(-15 50 26)">
							<circle cx="40" cy="25" r="6.5" />
							<circle cx="50" cy="20" r="8" />
							<circle cx="61" cy="24" r="6" />
						</g>
					)}
				</g>
				<ellipse cx="18" cy="64" rx="11" ry="19" fill="#eef0ea" />
				{won ? (
					/* raised right wing (arm) */
					<path d="M 70 60 Q 84 60 89 47" stroke="#eef0ea" strokeWidth="12" strokeLinecap="round" fill="none" />
				) : (
					/* both wings hang limp, clear of the body so they read at 60px */
					<g stroke="#eef0ea" strokeWidth="12" strokeLinecap="round" fill="none">
						<path d="M 70 58 Q 86 70 84 88" />
						<path d="M 30 58 Q 14 70 16 88" />
					</g>
				)}
				<ellipse cx="50" cy="62" rx="35" ry="33" fill="#fdfdfb" stroke="#e6e6df" strokeWidth="1.5" />
				{won && (
					/* thumbs-up hand: wide fist + thumb up on the side */
					<g fill="#fdfdfb" stroke="#e6e6df" strokeWidth="1.4">
						<rect x="80" y="32" width="20" height="15" rx="6.5" />
						<rect x="80" y="18" width="9.5" height="17" rx="4.75" />
					</g>
				)}
				{won ? (
					<>
						<circle cx="39" cy="51" r="5" fill="#2a2a2a" />
						<circle cx="61" cy="51" r="5" fill="#2a2a2a" />
						<circle cx="40.6" cy="49.2" r="1.6" fill="#fff" />
						<circle cx="62.6" cy="49.2" r="1.6" fill="#fff" />
					</>
				) : (
					/* shut eyes sagging downwards, under brows raised at the inner ends */
					<g stroke="#2a2a2a" strokeWidth="3.2" strokeLinecap="round" fill="none">
						<path d="M 34 48 Q 39 56 44 49" />
						<path d="M 56 49 Q 61 56 66 48" />
						<path d="M 32 44 L 44 39" strokeWidth="2.6" />
						<path d="M 68 44 L 56 39" strokeWidth="2.6" />
					</g>
				)}
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
/* No bounce on a loss: she comes up short, sinks and tips over. */
.lv-cocotte.sad { animation: lv-cocotte-sad 1s cubic-bezier(0.3, 0.9, 0.4, 1) forwards; }
@keyframes lv-cocotte-sad {
	0% { transform: scale(0.55) translateY(-10px) rotate(0); opacity: 0; }
	45% { transform: scale(1) translateY(0) rotate(0); opacity: 1; }
	100% { transform: scale(1) translateY(5px) rotate(7deg); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) { .lv-celebrate { display: none; } }
`;
