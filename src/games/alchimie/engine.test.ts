import { describe, it, expect } from 'vitest';
import { ELEMENTS, SECRET_ELEMENTS, BASE_IDS, TOTAL, SECRET_TOTAL, combine, getElement, dailyTarget } from './engine';

const ids = new Set(ELEMENTS.map((e) => e.id));
const nonBase = ELEMENTS.filter((e) => e.recipe);

describe('alchimie element tree', () => {
	it('has ~150 elements with unique ids, names and emojis', () => {
		expect(TOTAL).toBeGreaterThanOrEqual(140);
		expect(ids.size).toBe(ELEMENTS.length); // ids unique
		for (const e of ELEMENTS) {
			expect(e.name.length, e.id).toBeGreaterThan(0);
			expect(e.emoji.length, e.id).toBeGreaterThan(0);
		}
	});

	it('exactly 5 bases (feu, eau, terre, air, bois) with no recipe', () => {
		expect(BASE_IDS.sort()).toEqual(['air', 'bois', 'eau', 'feu', 'terre']);
	});

	it('every non-base recipe references two existing elements', () => {
		for (const e of nonBase) {
			expect(ids.has(e.recipe![0]), `${e.id} ← ${e.recipe![0]}`).toBe(true);
			expect(ids.has(e.recipe![1]), `${e.id} ← ${e.recipe![1]}`).toBe(true);
		}
	});

	it('no two elements share the same pair (no ambiguous combination)', () => {
		const seen = new Map<string, string>();
		const dups: string[] = [];
		for (const e of nonBase) {
			const [a, b] = e.recipe!;
			const k = a < b ? `${a}|${b}` : `${b}|${a}`;
			if (seen.has(k)) dups.push(`${k} → ${seen.get(k)} & ${e.id}`);
			else seen.set(k, e.id);
		}
		expect(dups, dups.join(', ')).toEqual([]);
	});

	it('every element is reachable from the bases (DAG, no cycle, no orphan)', () => {
		const reachable = new Set(BASE_IDS);
		for (let changed = true; changed; ) {
			changed = false;
			for (const e of ELEMENTS) {
				if (reachable.has(e.id) || !e.recipe) continue;
				if (reachable.has(e.recipe[0]) && reachable.has(e.recipe[1])) { reachable.add(e.id); changed = true; }
			}
		}
		const orphans = ELEMENTS.filter((e) => !reachable.has(e.id)).map((e) => e.id);
		expect(orphans, `unreachable: ${orphans.join(', ')}`).toEqual([]);
	});

	it('combine is order-independent, supports self-combine, and returns null for unknown combos', () => {
		expect(combine(['feu', 'eau'])).toBe('vapeur');
		expect(combine(['eau', 'feu'])).toBe('vapeur'); // order-independent
		expect(combine(['eau', 'eau'])).toBe('mer'); // self
		expect(combine(['feu', 'or'])).toBeNull(); // no such recipe
		expect(getElement('vapeur')?.name).toBe('Vapeur');
	});
});

describe('alchimie daily (secret) pool', () => {
	const mainIds = new Set(ELEMENTS.map((e) => e.id));

	it('has ≥50 secret elements, unique ids disjoint from the main tree', () => {
		expect(SECRET_TOTAL).toBeGreaterThanOrEqual(50);
		const sids = new Set<string>();
		for (const e of SECRET_ELEMENTS) {
			expect(e.name.length && e.emoji.length, e.id).toBeTruthy();
			expect(sids.has(e.id), `dup secret id ${e.id}`).toBe(false);
			expect(mainIds.has(e.id), `secret id clashes with main ${e.id}`).toBe(false);
			sids.add(e.id);
		}
	});

	it('every secret recipe is 2-3 EXISTING main elements (always reachable from the bases)', () => {
		for (const e of SECRET_ELEMENTS) {
			expect(e.recipe, e.id).toBeDefined();
			expect(e.recipe!.length >= 2 && e.recipe!.length <= 3, `${e.id} arity`).toBe(true);
			for (const ing of e.recipe!) expect(mainIds.has(ing), `${e.id} ← ${ing}`).toBe(true);
		}
	});

	it('no secret combo collides with a main combo or another secret combo', () => {
		const key = (r: string[]) => [...r].sort().join('|');
		const mainKeys = new Set(nonBase.map((e) => key(e.recipe!)));
		const seen = new Map<string, string>();
		const clashes: string[] = [];
		for (const e of SECRET_ELEMENTS) {
			const k = key(e.recipe!);
			if (mainKeys.has(k)) clashes.push(`${e.id} clashes with main combo`);
			else if (seen.has(k)) clashes.push(`${k} → ${seen.get(k)} & ${e.id}`);
			else seen.set(k, e.id);
		}
		expect(clashes, clashes.join(', ')).toEqual([]);
	});

	it('secret combos only fire when includeSecret=true; dailyTarget is deterministic', () => {
		const cafeLait = SECRET_ELEMENTS.find((e) => e.id === 'cafe-au-lait')!;
		expect(combine(cafeLait.recipe!)).toBeNull(); // hidden in free play
		expect(combine(cafeLait.recipe!, true)).toBe('cafe-au-lait'); // craftable in the daily
		expect(combine(['pain', 'fromage', 'salade'], true)).toBe('sandwich'); // 3-ingredient
		expect(getElement('sandwich')?.name).toBe('Sandwich');
		expect(dailyTarget(42)).toBe(dailyTarget(42));
		expect(SECRET_ELEMENTS.some((e) => e.id === dailyTarget(7))).toBe(true);
	});
});
