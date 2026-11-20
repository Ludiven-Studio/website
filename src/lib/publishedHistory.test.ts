import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { checkCatalog, CATALOG_PATH, type Catalog } from '../../supabase/functions/_shared/promoRules.mjs';
import { baseAppId, shares } from './promoShares';

// Apps already installed keep reading what the site published before: a kept catalogue's images and clips,
// and the keys of version.json. This replays every published version from git history; a shallow clone
// (CI checks out one commit) has no history and skips.
function versions(path: string): { sha: string; text: string }[] {
	try {
		const shas = execFileSync('git', ['log', '--format=%h', '--', path], { encoding: 'utf8' }).split('\n').filter(Boolean);
		return shas.flatMap((sha) => {
			try {
				return [{ sha, text: execFileSync('git', ['show', `${sha}:${path}`], { encoding: 'utf8' }) }];
			} catch {
				return [];
			}
		});
	} catch {
		return [];
	}
}

const catalogs = versions(CATALOG_PATH);
// The first day's catalogue pointed at one clip for every language, replaced within hours (e61871e).
const FIRST_DAY = new Set(['cbd5198', 'cbe0390']);
const VERSION_FILES = ['dragons-gems', 'jeux/petanque', 'nino-rush', 'petanque-meet', 'petanque-scanner'].map((d) => `public/${d}/version.json`);

const atLeast = (a: string, b: string): boolean => {
	const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)];
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
	return true;
};

describe.skipIf(catalogs.length < 2)('house ads catalogues published before', () => {
	it.each(catalogs.filter((c) => !FIRST_DAY.has(c.sha)).map((c) => [c.sha, c.text]))('%s: every image and clip it names is still on the site', (_, text) => {
		const { files } = checkCatalog(JSON.parse(text) as Catalog);
		expect(files.map((f) => f.path).filter((p) => !existsSync(p))).toEqual([]);
	});

	it.each(catalogs.map((c) => [c.sha, c.text]))('%s: the admin page can replay its shares on both platforms', (_, text) => {
		const catalog = JSON.parse(text) as Catalog;
		const apps = new Set(catalog.entries.map((e) => (typeof e.app === 'string' ? baseAppId(e.app) : '')).filter(Boolean));
		for (const app of apps)
			for (const platform of ['android', 'ios'] as const)
				for (const spot of ['banner', 'video'] as const) {
					const r = shares(catalog, app, { platform, spot });
					const total = r.rows.filter((row) => row.state === 'shown').reduce((s, row) => s + row.share, 0);
					if (r.rows.some((row) => row.state === 'shown')) expect(total).toBeCloseTo(1, 6);
				}
	});
});

describe.each(VERSION_FILES)('%s against its published history', (file) => {
	const past = versions(file).map((v) => JSON.parse(v.text) as Record<string, string>);
	const now = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;

	it.skipIf(past.length < 2)('keeps every key an app version may read, with the same type', () => {
		for (const v of past) for (const [k, val] of Object.entries(v)) expect(typeof now[k], `${k}`).toBe(typeof val);
	});

	it.skipIf(past.length < 2)('never goes back below a latest version it already announced', () => {
		for (const v of past) {
			expect(atLeast(now.latest_android, v.latest_android)).toBe(true);
			expect(atLeast(now.latest_ios, v.latest_ios)).toBe(true);
		}
	});
});
