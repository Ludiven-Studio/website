import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import LumenGame, { BoardView, MASK_COLOR } from './LumenGame';
import { DIFFS, generateLumen, solutionPlacements, type LumenPuzzle } from './engine';
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

describe('BoardView — beam FX', () => {
	// 3×3, source at (1,0) firing east into a wall at (1,2): spark + flow + charge.
	const walled: LumenPuzzle = {
		size: 3,
		fixed: [
			{ idx: 3, piece: { type: 'source', rot: 1, fixed: true } },
			{ idx: 5, piece: { type: 'wall', rot: 0, fixed: true } },
		],
		tray: [],
		solution: [],
		start: [],
	};

	it('a beam into a wall sparks, flows and shows the source charge', () => {
		const html = renderToStaticMarkup(<BoardView puzzle={walled} placements={[]} />);
		expect(html).toContain('lum-spark');
		expect(html).toContain('lum-flow');
		expect(html).toContain('lum-throb');
	});

	it('a beam leaving the grid fades out instead of sparking', () => {
		const open: LumenPuzzle = { ...walled, fixed: [walled.fixed[0]] };
		const html = renderToStaticMarkup(<BoardView puzzle={open} placements={[]} />);
		expect(html).not.toContain('lum-spark');
		expect(html).toContain('lum-flow');
	});
});
