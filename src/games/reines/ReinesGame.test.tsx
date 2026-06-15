import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ReinesGame from './ReinesGame';
import { PALETTE } from './engine';

/**
 * Locks the invariant the user surfaced: a cell's painted colour must match its
 * region index. Colour and index are two properties of the same <button> derived
 * from the same `regions[r][c]`, so in a clean render they can never diverge.
 * (A mismatch in the dev session was a stale Fast Refresh artefact, not the code.)
 */
describe('ReinesGame — colour matches region index', () => {
	it('every board cell background-color === PALETTE[data-region]', () => {
		for (let i = 0; i < 25; i++) {
			const html = renderToStaticMarkup(<ReinesGame gameId="reines" />);
			const buttons = html.match(/<button\b[^>]*>/g) ?? [];
			let cells = 0;
			for (const tag of buttons) {
				const region = /data-region="(\d+)"/.exec(tag)?.[1];
				if (region == null) continue; // skip pills / new / verify buttons
				const bg = /background-color:\s*([^;"]+)/i.exec(tag)?.[1]?.trim().toLowerCase();
				cells++;
				expect(bg).toBe(PALETTE[Number(region)].toLowerCase());
			}
			expect(cells).toBeGreaterThanOrEqual(36); // at least a 6×6 board
		}
	});
});
