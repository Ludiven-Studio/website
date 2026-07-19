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
	end: () => void,
) {
	return {
		onTouchStart: (e: TouchEvent) => {
			const t = e.touches[0];
			if (t) start(t.clientX, t.clientY);
		},
		onTouchMove: (e: TouchEvent) => {
			const t = e.touches[0];
			if (t) move(t.clientX, t.clientY);
		},
		onTouchEnd: () => end(),
		onTouchCancel: () => end(),
	};
}
