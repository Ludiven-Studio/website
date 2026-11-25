import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newestFirst } from './testHub';
import { TEST_APPS } from '../data/testBuilds';

const page = (path: string) => `src/pages${path.replace(/\/$/, '')}`;

describe('the /tests/ hub', () => {
	it('puts the newest build first, then the cards without a date in the list order', () => {
		const cards = [{ id: 'a', date: null, order: 0 }, { id: 'b', date: 100, order: 1 }, { id: 'c', date: 300, order: 2 }, { id: 'd', date: null, order: 3 }, { id: 'e', date: 300, order: 4 }];
		expect(newestFirst(cards).map((c) => c.id)).toEqual(['c', 'e', 'b', 'a', 'd']);
	});

	it("links each app's own test page, which exists, and reads its manifest from the builds bucket", () => {
		for (const a of TEST_APPS) {
			expect(existsSync(`${page(a.page)}.astro`) || existsSync(`${page(a.page)}/index.astro`), a.page).toBe(true);
			if (a.latest) expect(a.latest).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/builds\/[a-z0-9-]+\/latest\.json$/);
			else expect(a.apk?.url).toMatch(/^https:\/\/.+\.apk$/);
		}
	});

	it('never lists a page with a secret address, nor the private Cap Étoile', () => {
		// The pages whose address is the secret: a slug with a random part after beta- or test-.
		const secret = (readdirSync('src/pages', { recursive: true }) as string[])
			.map((f) => f.replaceAll('\\', '/'))
			.filter((f) => /(^|\/)(beta|test)-[a-z0-9]*\d[a-z0-9]*\.astro$/.test(f))
			.map((f) => `/${f.replace(/\.astro$/, '')}`);
		expect(secret.length).toBeGreaterThan(3);
		const src = readFileSync('src/data/testBuilds.ts', 'utf8') + readFileSync('src/pages/tests/index.astro', 'utf8');
		for (const s of [...secret, '/cap-etoile']) expect(src, s).not.toContain(s);
	});
});
