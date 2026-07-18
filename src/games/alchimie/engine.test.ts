import { describe, it, expect } from 'vitest';
import { ELEMENTS, BASE_IDS, TOTAL, combine, getElement } from './engine';

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

	it('combine is commutative, supports self-combine, and returns null for unknown pairs', () => {
		expect(combine('feu', 'eau')).toBe('vapeur');
		expect(combine('eau', 'feu')).toBe('vapeur'); // commutative
		expect(combine('eau', 'eau')).toBe('mer'); // self
		expect(combine('feu', 'or')).toBeNull(); // no such recipe
		expect(getElement('vapeur')?.name).toBe('Vapeur');
	});
});
