// Multi-touch drag: one independent gesture per finger, via Pointer Events only.
// Same constraints as usePointerDrag — no setPointerCapture (it breaks iOS), document-level
// pointermove/up so a finger keeps tracking after it leaves the element, and the element
// MUST have `touch-action: none`.
//
//   const { onPointerDown } = useMultiPointerDrag({
//     start: (x, y) => grabLine(x, y),   // return null to ignore that finger
//     move:  (g, x, y) => g.dragTo(x, y),
//     end:   (g) => g.release(),
//   });
//
// `start` returns the per-finger state, handed back to `move`/`end`: keep it mutable.

import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface DragHandlers<T> {
	start: (clientX: number, clientY: number) => T | null;
	move: (state: T, clientX: number, clientY: number) => void;
	end: (state: T) => void;
}

export function useMultiPointerDrag<T>(handlers: DragHandlers<T>): { onPointerDown: (e: ReactPointerEvent) => void } {
	const h = useRef(handlers);
	h.current = handlers;
	const live = useRef(new Map<number, T>());

	useEffect(() => {
		const onMove = (ev: PointerEvent): void => {
			const s = live.current.get(ev.pointerId);
			if (s !== undefined) h.current.move(s, ev.clientX, ev.clientY);
		};
		const onUp = (ev: PointerEvent): void => {
			const s = live.current.get(ev.pointerId);
			if (s === undefined) return;
			live.current.delete(ev.pointerId);
			h.current.end(s);
		};
		document.addEventListener('pointermove', onMove);
		document.addEventListener('pointerup', onUp);
		document.addEventListener('pointercancel', onUp);
		return () => {
			document.removeEventListener('pointermove', onMove);
			document.removeEventListener('pointerup', onUp);
			document.removeEventListener('pointercancel', onUp);
		};
	}, []);

	return {
		onPointerDown: (ev: ReactPointerEvent): void => {
			const s = h.current.start(ev.clientX, ev.clientY);
			if (s !== null) live.current.set(ev.pointerId, s);
		},
	};
}
