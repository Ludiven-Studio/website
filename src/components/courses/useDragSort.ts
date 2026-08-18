// Pointer-based sortable list. Built on usePointerDrag because plain React touch
// handlers and setPointerCapture are dead on real iOS Safari.
//
// Rather than floating a clone and computing offsets, the dragged row is
// reordered live and the drop target is read straight from the DOM with
// elementFromPoint — so the caller only needs to answer "put A before/after B".
// Rows must carry data-drag-id; drop zones (section headers) data-drop-zone.
// The drag handle needs `touch-action: none` or the page scrolls instead.

import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { usePointerDrag } from '../../games/usePointerDrag';

interface DragSortOptions {
	/** Pointer is over another row: move the dragged item before or after it. */
	onHoverRow: (draggedId: string, targetId: string, before: boolean) => void;
	/** Pointer is over an empty zone / section header: move it into that zone. */
	onHoverZone: (draggedId: string, zone: string) => void;
	/** Pointer released — persist the order. */
	onDrop: (draggedId: string) => void;
}

export function useDragSort(opts: DragSortOptions): {
	draggingId: string | null;
	handleProps: (id: string) => { onPointerDown: (e: ReactPointerEvent) => void };
} {
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const dragging = useRef<string | null>(null);
	const o = useRef(opts); o.current = opts;

	const move = (x: number, y: number): void => {
		const id = dragging.current;
		if (!id) return;
		const el = document.elementFromPoint(x, y);
		if (!el) return;

		const row = el.closest('[data-drag-id]') as HTMLElement | null;
		if (row) {
			const targetId = row.dataset.dragId!;
			if (targetId === id) return; // hovering itself — nothing to do
			const r = row.getBoundingClientRect();
			o.current.onHoverRow(id, targetId, y < r.top + r.height / 2);
			return;
		}
		const zone = el.closest('[data-drop-zone]') as HTMLElement | null;
		if (zone) o.current.onHoverZone(id, zone.dataset.dropZone!);
	};

	const end = (): void => {
		const id = dragging.current;
		dragging.current = null;
		setDraggingId(null);
		if (id) o.current.onDrop(id);
	};

	const base = usePointerDrag(() => { /* start position unused: the DOM is the model */ }, move, end);

	return {
		draggingId,
		handleProps: (id: string) => ({
			onPointerDown: (e: ReactPointerEvent): void => {
				e.preventDefault(); // keep iOS from starting a text selection / scroll
				dragging.current = id;
				setDraggingId(id);
				base.onPointerDown(e);
			},
		}),
	};
}
