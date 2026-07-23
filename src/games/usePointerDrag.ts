// Unified drag / aim / swipe for mouse, touch AND pen via Pointer Events only.
// Fixes iOS Safari, where mixing touch events with pointer handlers made drags do nothing.
// No setPointerCapture (that breaks iOS); a document-level pointermove/up tracks the drag
// after the finger leaves the element. The element MUST have `touch-action: none` so the
// page doesn't scroll during a drag.
//
//   const { onPointerDown } = usePointerDrag(start, move, end);
//   <canvas onPointerDown={onPointerDown} /> // with touch-action:none in CSS
//
// start/move/end all receive (clientX, clientY); callbacks that don't need the args ignore them.

import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export function usePointerDrag(
	start: (clientX: number, clientY: number) => void,
	move: (clientX: number, clientY: number) => void,
	end: (clientX: number, clientY: number) => void,
): { onPointerDown: (e: ReactPointerEvent) => void } {
	const s = useRef(start); s.current = start;
	const m = useRef(move); m.current = move;
	const e = useRef(end); e.current = end;
	const active = useRef(false);

	useEffect(() => {
		const onMove = (ev: PointerEvent): void => { if (active.current) m.current(ev.clientX, ev.clientY); };
		const onUp = (ev: PointerEvent): void => {
			if (!active.current) return;
			active.current = false;
			e.current(ev.clientX, ev.clientY);
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
			active.current = true;
			s.current(ev.clientX, ev.clientY);
		},
	};
}
