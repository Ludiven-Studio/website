// Press-and-hold button that works on iOS Safari. React's synthetic onPointerDown +
// e.preventDefault() is passive (a no-op), so iOS treats a held touch as a gesture and
// fires pointercancel — releasing the hold. The fix is NATIVE non-passive touch listeners
// with preventDefault. Returns a callback ref to put on the button; mouse is handled too.
//
//   const holdLeft = useHoldButton(() => keys.left = true, () => keys.left = false);
//   <button ref={holdLeft}>◀</button>   // give it touch-action: none in CSS

import { useCallback, useRef } from 'react';

export function useHoldButton(
	onDown: () => void,
	onUp: () => void,
): (el: HTMLElement | null) => void {
	const d = useRef(onDown); d.current = onDown;
	const u = useRef(onUp); u.current = onUp;
	const detach = useRef<(() => void) | null>(null);

	return useCallback((el: HTMLElement | null) => {
		detach.current?.();
		detach.current = null;
		if (!el) return;
		const start = (e: Event): void => { e.preventDefault(); d.current(); };
		const end = (): void => u.current();
		const mdown = (): void => d.current();
		el.addEventListener('touchstart', start, { passive: false });
		el.addEventListener('touchend', end);
		el.addEventListener('touchcancel', end);
		el.addEventListener('mousedown', mdown);
		el.addEventListener('mouseup', end);
		el.addEventListener('mouseleave', end);
		detach.current = () => {
			el.removeEventListener('touchstart', start);
			el.removeEventListener('touchend', end);
			el.removeEventListener('touchcancel', end);
			el.removeEventListener('mousedown', mdown);
			el.removeEventListener('mouseup', end);
			el.removeEventListener('mouseleave', end);
		};
	}, []);
}
