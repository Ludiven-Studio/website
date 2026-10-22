import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CATALOG, kitOf, traits, modelOf, loadEquipped, equip, itemById, otherLook, buyItem, decorOf, type BouleModel } from './shop';
import { STANDARD_KIT } from './engine';
import { earn, resetWalletCache } from '../../lib/wallet';

class MemStorage {
	private m = new Map<string, string>();
	getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
	setItem(k: string, v: string): void { this.m.set(k, v); }
	removeItem(k: string): void { this.m.delete(k); }
	clear(): void { this.m.clear(); }
}

beforeEach(() => {
	vi.stubGlobal('localStorage', new MemStorage());
	resetWalletCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('boule makes', () => {
	it('plays the free Classique exactly as the standard boule', () => {
		expect(kitOf(modelOf('boule_inox'))).toBe(STANDARD_KIT);
	});

	it('turns a make into the same kit as the app (Core/Boules.cs MakeKit)', () => {
		const k = kitOf(modelOf('boule_bronze')); // 720 g, 76 mm, tendre
		expect(k.m).toBe(0.72);
		expect(k.r).toBe(0.038);
		expect(k.e).toBe(0.86);
		expect(k.bite).toBe(0.99);
		expect(k.aim).toBeCloseTo(1 + (0.72 - 0.7) + 4 * (0.038 - 0.0375), 12);
		const d = kitOf(modelOf('boule_massive')); // 790 g, 79 mm, dure
		expect([d.e, d.bite]).toEqual([0.93, 1.01]);
	});

	it('names what each make trades', () => {
		expect(traits(modelOf('boule_inox'))).toEqual([]);
		expect(traits(modelOf('boule_massive'))).toEqual(['heavy', 'big', 'hard']);
		expect(traits(modelOf('boule_plume'))).toEqual(['light', 'small']);
		// Every model but the Classique trades something.
		for (const it of CATALOG.filter((i) => i.model && i.id !== 'boule_inox')) expect(traits(it.model!).length).toBeGreaterThan(0);
	});

	it('falls back to the standard make for an unknown id', () => {
		expect(modelOf('boule_nope')).toBe(modelOf('boule_inox'));
	});
});

describe('catalog', () => {
	it('has unique ids, one free item per kind, and a price on everything else', () => {
		expect(new Set(CATALOG.map((i) => i.id)).size).toBe(CATALOG.length);
		for (const kind of ['boule', 'jack', 'decor'] as const) {
			expect(CATALOG.filter((i) => i.kind === kind && i.price === 0)).toHaveLength(1);
		}
		for (const it of CATALOG) expect(it.price).toBeGreaterThanOrEqual(0);
	});

	it('dresses the opponent in a look that never passes for the player\'s', () => {
		const same = (a: BouleModel, b: { finish: string; pattern: string; inlay?: number }): boolean =>
			a.finish === b.finish && a.pattern === b.pattern && a.inlay === b.inlay;
		for (const it of CATALOG.filter((i) => i.model)) expect(same(it.model!, otherLook(it.model!))).toBe(false);
	});
});

describe('what the player wears', () => {
	it('starts on the free items', () => {
		expect(loadEquipped()).toEqual({ boule: 'boule_inox', jack: 'jack_orange', decor: 'decor_jardin' });
	});

	it('refuses to wear what was never paid for, even from an edited save', () => {
		localStorage.setItem('petanque-shop', JSON.stringify({ boule: 'boule_damas', jack: 'jack_buis', decor: 'decor_port' }));
		expect(loadEquipped()).toEqual({ boule: 'boule_inox', jack: 'jack_orange', decor: 'decor_jardin' });
		expect(equip(loadEquipped(), itemById('boule_damas')!)).toBeNull();
	});

	it('buys with cocoins, wears it, and keeps it across a reload', () => {
		earn(200);
		const it = itemById('decor_port')!;
		expect(buyItem(it)).toBe(true);
		const next = equip(loadEquipped(), it)!;
		expect(next.decor).toBe('decor_port');
		resetWalletCache();
		expect(loadEquipped().decor).toBe('decor_port');
		expect(decorOf(loadEquipped())).toBe('port');
	});

	it('cannot buy what the balance does not cover', () => {
		earn(10);
		expect(buyItem(itemById('boule_bronze')!)).toBe(false);
	});
});
