import { useEffect, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { isTextField } from '../lib/keyboard';

/* The one popup of the game pages (level picker, full leaderboard): a card over a dimmed page,
   a fixed head with its close, a body that scrolls. Closes on ✕, on a click beside it, on Escape. */

interface Props {
	title: ReactNode;
	onClose: () => void;
	closeLabel: string;
	children: ReactNode;
	/** The scrolling body, for a caller that pages on scroll. */
	bodyRef?: Ref<HTMLDivElement>;
	/** Card width cap in px. */
	width?: number;
}

export default function GameModal({ title, onClose, closeLabel, children, bodyRef, width = 520 }: Props) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isTextField(e.target)) onClose(); };
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	return createPortal(
		<div className="gm-back" onClick={onClose}>
			<style>{CSS}</style>
			<div className="gm-card" role="dialog" aria-modal="true" style={{ width: `min(${width}px, 100%)` }} onClick={(e) => e.stopPropagation()}>
				<div className="gm-head">
					<h3>{title}</h3>
					<button type="button" className="gm-x" onClick={onClose} aria-label={closeLabel}>✕</button>
				</div>
				<div className="gm-body" ref={bodyRef}>{children}</div>
			</div>
		</div>,
		// Inside the game page: native fullscreen shows that element only, so a portal to <body> would vanish.
		document.querySelector('.game-page') ?? document.body,
	);
}

const CSS = `
/* Above everything, the fullscreen exit included: this has its own close. */
.gm-back {
  position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center;
  background: rgba(8, 10, 16, 0.5);
  padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
}
.gm-card {
  display: flex; flex-direction: column; max-height: min(720px, 100%); overflow: hidden;
  background: var(--gray-999); color: var(--gray-0); border: 2px solid var(--accent-regular); border-radius: 16px;
  box-shadow: var(--shadow-lg); font-family: var(--font-body); text-align: left;
}
.gm-head { position: relative; flex: none; padding: 14px 48px 12px; border-bottom: 1px solid var(--gray-800); text-align: center; }
.gm-head h3 { margin: 0; font-size: 18px; line-height: 1.25; color: var(--gray-0); }
.gm-x {
  position: absolute; top: 50%; right: 8px; transform: translateY(-50%); border: none; background: transparent;
  color: var(--gray-300); font-size: 18px; line-height: 1; padding: 8px; cursor: pointer; border-radius: 999px;
}
.gm-x:hover, .gm-x:focus-visible { color: var(--gray-0); background: var(--gray-800); }
.gm-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px 14px 16px; }
`;
