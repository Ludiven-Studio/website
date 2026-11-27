import { describe, expect, it } from 'vitest';
import { NAV, TABS } from './siteNav';

// What Nav.astro and TabBar.astro light up for a path (always with its trailing slash).
const menu = (path: string): string[] => NAV.fr.links.filter((l) => path === l.href || !!l.also?.test(path)).map((l) => l.label);
const tab = (path: string): string[] => TABS.filter((t) => t.match.test(path)).map((t) => t.id);

describe('site menu', () => {
	it("lights « Jeux » on the apps' testers' pages, even under /jeux/", () => {
		for (const path of ['/jeux/petanque/test/', '/jeux/eclats/test/']) {
			expect(menu(path), path).toEqual(['Jeux']);
			expect(tab(path), path).toEqual(['games']);
		}
	});

	it("lights « Jeux » on every app's pages and on the testers' hub", () => {
		for (const path of ['/dominoland/', '/dominoland/test/', '/drone-battle/test/', '/nino-rush/telecharger/', '/petanque-game/', '/petanque-scanner/test/', '/petanque/', '/tests/']) {
			expect(menu(path), path).toEqual(['Jeux']);
			expect(tab(path), path).toEqual(['games']);
		}
		expect(NAV.en.links[0].also?.test('/en/dragons-gems/'), 'another language').toBe(true);
	});

	it('keeps the mini-games, their own test pages and the daily challenge where they were', () => {
		for (const path of ['/jeux/', '/jeux/petanque/', '/jeux/eclats/', '/jeux/eclats/nuit/', '/jeux/sudoku/']) {
			expect(menu(path), path).toEqual(['Mini-jeux']);
			expect(tab(path), path).toEqual(['mini']);
		}
		expect(menu('/jeux/defi/')).toEqual(['Mini-jeux']);
		expect(tab('/jeux/defi/')).toEqual(['daily']);
		expect(tab('/')).toEqual(['games']);
		expect(menu('/work/petanque-game/')).toEqual(['Projets']);
	});
});
