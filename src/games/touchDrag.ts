// Bridge native touch events to (clientX, clientY) drag callbacks. iOS Safari can
// drop pointermove after setPointerCapture, so touch-driven drag/aim/swipe games
// route touch here (reliable) and keep Pointer Events for mouse/pen only.
//
// Usage in a component:
//   <div {...touchDrag(startDrag, moveDrag, endDrag)}
//        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />
// where the pointer handlers early-return on `e.pointerType === 'touch'`.

import type { TouchEvent } from 'react';

export function touchDrag(
	start: (clientX: number, clientY: number) => void,
	move: (clientX: number, clientY: number) => void,
	// Called with the FINAL touch position (from changedTouches) — reliable even for a fast
	// flick where touchmove never fired. Callbacks that don't need it can ignore the args.
	end: (clientX: number, clientY: number) => void,
) {
	const finish = (e: TouchEvent) => {
		const t = e.changedTouches[0];
		if (t) end(t.clientX, t.clientY);
		else end(0, 0);
	};
	return {
		onTouchStart: (e: TouchEvent) => {
			const t = e.touches[0];
			if (t) start(t.clientX, t.clientY);
		},
		onTouchMove: (e: TouchEvent) => {
			const t = e.touches[0];
			if (t) move(t.clientX, t.clientY);
		},
		onTouchEnd: finish,
		onTouchCancel: finish,
	};
}
