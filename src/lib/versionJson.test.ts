import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// The apps read these at launch to propose or force an update. A broken one either blocks every player
// (a min above the store's version) or silently stops the prompts.
const FILES = [
	...readdirSync('public').map((d) => join('public', d, 'version.json')),
	join('public', 'jeux', 'petanque', 'version.json'),
].filter((f) => existsSync(f));

const SEMVER = /^\d+\.\d+\.\d+$/;
const parts = (v: string): number[] => v.split('.').map(Number);
const atMost = (a: string, b: string): boolean => {
	const [x, y] = [parts(a), parts(b)];
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
	return true;
};

describe('version.json files the apps read', () => {
	it('finds the five apps', () => {
		expect(FILES.length).toBeGreaterThanOrEqual(5);
	});

	describe.each(FILES)('%s', (file) => {
		const raw = readFileSync(file, 'utf8');

		it('is a JSON object with no byte-order mark', () => {
			expect(raw.charCodeAt(0)).not.toBe(0xfeff);
			const v = JSON.parse(raw);
			expect(v && typeof v === 'object' && !Array.isArray(v)).toBe(true);
		});

		const v = JSON.parse(raw) as Record<string, unknown>;

		it('names a plain x.y.z latest version per platform', () => {
			expect(v.latest_android).toMatch(SEMVER);
			expect(v.latest_ios).toMatch(SEMVER);
		});

		it('never forces an update to a version the stores do not have', () => {
			// "" means no forced update (Nino Rush, to be confirmed with its session).
			expect(typeof v.min).toBe('string');
			if (v.min === '') return;
			expect(v.min).toMatch(SEMVER);
			expect(atMost(v.min as string, v.latest_android as string)).toBe(true);
			expect(atMost(v.min as string, v.latest_ios as string)).toBe(true);
		});

		it('links only to the real stores, over https', () => {
			if (v.store_android !== undefined) expect(v.store_android).toMatch(/^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.ludivenstudio\.[a-z0-9]+$/);
			if (v.store_ios !== undefined) expect(v.store_ios).toMatch(/^https:\/\/apps\.apple\.com\/app\/id\d+$/);
		});
	});
});

describe('the version comparison used above', () => {
	it.each([
		['1.0.0', '1.0.0', true],
		['1.0.9', '1.0.10', true],
		['1.10.0', '1.9.9', false],
		['2.0.0', '1.99.99', false],
	])('%s <= %s is %s', (a, b, want) => expect(atMost(a, b)).toBe(want));
});
