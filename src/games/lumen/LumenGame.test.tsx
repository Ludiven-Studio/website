import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import LumenGame, { BoardView, MASK_COLOR } from './LumenGame';
import { DIFFS, generateLumen, solutionPlacements } from './engine';
import { mulberry32 } from '../prng';

describe('LumenGame — SSR smoke', () => {
	it('first render is SSR-safe (generation lives in useEffect)', () => {
		const html = renderToStaticMarkup(<LumenGame gameId="lumen" />);
		expect(html).toContain('lum-root');
		expect(html).toContain('Génération');
	});
});

describe('BoardView — sensor ring colour matches its contract', () => {
	it('every sensor ring stroke === MASK_COLOR[data-expect]', () => {
		for (let s = 0; s < 8; s++) {
			const p = generateLumen(DIFFS.moyen, mulberry32(600 + s * 13));
			const html = renderToStaticMarkup(
				<BoardView puzzle={p} placements={p.tray.map(() => null)} />,
			);
			const rings = html.match(/<circle\b[^>]*data-expect="\d+"[^>]*>/g) ?? [];
			expect(rings.length).toBeGreaterThanOrEqual(1);
			for (const tag of rings) {
				const expect_ = Number(/data-expect="(\d+)"/.exec(tag)?.[1]);
				const stroke = /stroke="([^"]+)"/.exec(tag)?.[1]?.toLowerCase();
				expect(stroke).toBe(MASK_COLOR[expect_].toLowerCase());
			}
		}
	});

	it('with the solution placed, every sensor pastille shows its expected mask', () => {
		for (let s = 0; s < 8; s++) {
			const p = generateLumen(DIFFS.facile, mulberry32(6600 + s * 13));
			const html = renderToStaticMarkup(
				<BoardView puzzle={p} placements={solutionPlacements(p)} />,
			);
			const rings = html.match(/<circle\b[^>]*data-expect="\d+"[^>]*>/g) ?? [];
			const gots = html.match(/<circle\b[^>]*data-got="\d+"[^>]*>/g) ?? [];
			expect(gots.length).toBe(rings.length);
			const expects = rings.map((t) => /data-expect="(\d+)"/.exec(t)?.[1]);
			const got = gots.map((t) => /data-got="(\d+)"/.exec(t)?.[1]);
			expect(got).toEqual(expects);
			expect(html).toContain('✓');
			expect(html).not.toContain('✕');
		}
	});
});
