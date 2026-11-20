import { describe, it, expect } from 'vitest';
import {
	UPLOAD_PATH, checkCatalog, checkClip, checkImage, imageInfo, mp4Info, missingGlyphs, sitePath, catalogUrl, BANNER_TEXT_MAX,
} from '../../supabase/functions/_shared/promoRules.mjs';

// Hostile and broken inputs for the house ads rules: the admin page, its function and the build all trust them.
const entry = (over: Record<string, unknown> = {}) => ({
	id: 'meet',
	title: { en: 'Pétanque Meet', fr: 'Pétanque Meet' },
	text: { en: 'Find a game near you', fr: 'Trouve une partie' },
	image: 'img/meet.png',
	link: { android: 'com.ludivenstudio.meet', ios: '123456' },
	...over,
});
const catalog = (entries: unknown[], over: Record<string, unknown> = {}) => ({
	schema: 1, updated: '2026-11-20T10:00:00Z', defaultLanguage: 'en', entries, ...over,
});
const problems = (c: unknown, strict = false) => checkCatalog(c, { strict }).problems as string[];

describe('UPLOAD_PATH: only plain names under img/ or clips/', () => {
	it.each([
		'public/promo/v1/img/meet-20261120093512345.png',
		'public/promo/v1/img/a.jpeg',
		'public/promo/v1/clips/meet_fr-1.mp4',
	])('accepts %s', (p) => expect(UPLOAD_PATH.test(p)).toBe(true));

	it.each([
		'public/promo/v1/img/../catalog.json',
		'public/promo/v1/img/../../../src/data/site.png',
		'public/promo/v1/catalog.json',
		'public/promo/v1/img/.hidden.png',
		'public/promo/v1/img/sub/a.png',
		'public/promo/v1/img/a.svg',
		'public/promo/v1/img/a.png.html',
		'public/promo/v1/img/A.png',
		'public/promo/v1/img/a\\b.png',
		'public/promo/v1/img/a.png\n',
		'/public/promo/v1/img/a.png',
		'public/promo/v1/clips/a.png',
		'public/promo/v1/img/a.mp4',
		'public/promo/v1/img/é.png',
		'',
	])('refuses %j', (p) => expect(UPLOAD_PATH.test(p)).toBe(false));
});

describe('checkCatalog: broken shapes never throw', () => {
	it.each([null, undefined, 42, 'catalog', [], true])('refuses %j as a catalogue', (c) => {
		expect(problems(c)).toEqual(['not a JSON object']);
	});

	it('flags a missing entries list, a bad schema and a bad date', () => {
		const p = problems({ schema: 2, updated: 'yesterday', entries: 'none' });
		expect(p).toContain('no entries list');
		expect(p).toContain('schema is not 1');
		expect(p.some((x) => x.startsWith('"updated"'))).toBe(true);
	});

	it.each([null, 7, 'meet', []])('names entry %j as not an object', (e) => {
		expect(problems(catalog([e])).some((x) => x.includes('not an object'))).toBe(true);
	});

	it('survives an entry full of wrong types', () => {
		const bad = { id: 5, title: 'x', text: ['a'], image: 3, clips: 'x', link: 'store', spots: 'banner', hideIn: {}, app: 'x', weight: '3' };
		expect(() => problems(catalog([bad]))).not.toThrow();
		expect(problems(catalog([bad])).length).toBeGreaterThan(4);
	});
});

describe('checkCatalog: values an attacker or a typo could send', () => {
	it('accepts a sound entry', () => {
		expect(problems(catalog([entry()]))).toEqual([]);
	});

	it.each(['javascript:alert(1)', 'data:image/png;base64,AAAA', 'file:///etc/passwd.png'])('refuses the image %s', (image) => {
		expect(problems(catalog([entry({ image })])).some((x) => x.includes('not http(s)'))).toBe(true);
	});

	it('refuses a script link for the web', () => {
		expect(problems(catalog([entry({ link: { web: 'javascript:alert(1)' } })])).some((x) => x.includes('not http(s)'))).toBe(true);
	});

	it.each([
		[{ android: 'com.x; rm -rf /' }, 'bad Android package'],
		[{ android: '' }, 'bad Android package'],
		[{ ios: '12a' }, 'bad Apple id (digits only)'],
		[{ ios: '' }, 'bad Apple id (digits only)'],
		[{}, 'no link'],
	])('refuses the link %j', (link, msg) => {
		expect(problems(catalog([entry({ link })]))).toContain(`meet: ${msg}`);
	});

	it.each([NaN, -1, Infinity, '2', null])('refuses the weight %j', (weight) => {
		expect(problems(catalog([entry({ weight })]))).toContain('meet: bad weight');
	});

	it('accepts a zero weight (a paused ad)', () => {
		expect(problems(catalog([entry({ weight: 0 })]))).toEqual([]);
	});

	it('refuses an end before the start, and dates that are not dates', () => {
		expect(problems(catalog([entry({ start: '2026-12-01', end: '2026-11-01' })]))).toContain('meet: ends before it starts');
		expect(problems(catalog([entry({ start: '2026-12-01', end: '2026-12-01' })]))).toContain('meet: ends before it starts');
		expect(problems(catalog([entry({ start: 'soon' })])).some((x) => x.includes('is not a date'))).toBe(true);
		expect(problems(catalog([entry({ end: 1764547200000 })])).some((x) => x.includes('is not a date'))).toBe(true);
	});

	it('refuses a duplicate id, and one app claimed by two entries', () => {
		const a = entry({ app: ['com.a.b'], hideIn: ['com.a.b'] });
		const b = entry({ app: ['com.a.b'], hideIn: ['com.a.b'] });
		const p = problems(catalog([a, b]));
		expect(p).toContain('meet: duplicate id');
		expect(p.some((x) => x.includes('is already meet'))).toBe(true);
	});

	it('counts banner text in characters and flags glyphs the apps lack', () => {
		const long = 'é'.repeat(BANNER_TEXT_MAX + 1);
		expect(problems(catalog([entry({ text: { en: long, fr: 'ok' } })])).some((x) => x.includes(`${BANNER_TEXT_MAX + 1} characters`))).toBe(true);
		expect(problems(catalog([entry({ text: { en: 'é'.repeat(BANNER_TEXT_MAX), fr: 'ok' } })]))).toEqual([]);
		expect(problems(catalog([entry({ text: { en: 'Go \u{1F3AF}', fr: 'ok' } })])).some((x) => x.includes('U+1F3AF'))).toBe(true);
		expect(missingGlyphs('a\u0000b œ')).toEqual(['"\u0000" (U+0000)', '" " (U+202F)', '"œ" (U+0153)']);
	});

	it('refuses an empty or blank text and a language that is not two letters', () => {
		expect(problems(catalog([entry({ title: { en: '   ' } })]))).toContain('meet: title.en is empty');
		expect(problems(catalog([entry({ title: { en: 'x', english: 'x' } })])).some((x) => x.includes('"english" is not a two-letter language'))).toBe(true);
	});

	it('wants a strict id and all five languages from the admin', () => {
		const p = problems(catalog([entry({ id: 'Meet_App' })]), true);
		expect(p).toContain('Meet_App: the id takes lowercase letters, digits and hyphens');
		expect(p).toContain('Meet_App: no title in de');
	});
});

describe('sitePath and catalogUrl', () => {
	it('maps a catalogue URL to its repo path, and anything off the site to null', () => {
		expect(sitePath('img/a.png')).toBe('public/promo/v1/img/a.png');
		expect(sitePath('/jeux/x.png')).toBe('public/jeux/x.png');
		expect(sitePath('https://evil.example/promo/v1/img/a.png')).toBeNull();
		expect(sitePath('https://www.ludiven-studio.fr.evil.example/a.png')).toBeNull();
		expect(sitePath('//evil.example/a.png')).toBeNull();
	});

	it('resolves a literal .. before mapping, so it cannot climb out of public/', () => {
		expect(sitePath('img/../../../../src/secret.png')).toBe('public/src/secret.png');
	});

	// Known hole: sitePath decodes %2F after the URL resolved the dots, so "..%2F" survives. Only an admin
	// writes the catalogue, and the function finds no such file in the repo's tree, so it refuses the publish.
	// The fix sits in this file, shared with the promo-admin function: it waits for Raphaël's OK to redeploy.
	it.fails('never climbs out of public/ through an escaped slash either', () => {
		const p = sitePath('img/x%2F..%2F..%2F..%2F..%2Fsrc%2Fsecret.png');
		expect(p === null || !p.split('/').includes('..')).toBe(true);
	});

	it('never throws on a malformed escape', () => {
		expect(() => sitePath('img/%E0%A4%A.png')).not.toThrow();
		expect(sitePath('img/%E0%A4%A.png')).toBeNull();
	});

	it('round-trips through catalogUrl', () => {
		expect(catalogUrl('public/promo/v1/img/a.png')).toBe('img/a.png');
		expect(catalogUrl('public/jeux/x.png')).toBe('/jeux/x.png');
	});
});

describe('media checks on hostile bytes', () => {
	const bytes = (...b: number[]) => new Uint8Array(b);

	it.each([
		['empty', bytes()],
		['a PNG signature alone', bytes(0x89, 0x50, 0x4e, 0x47)],
		['a JPEG start with no frame', bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02)],
		['a JPEG whose segments claim length zero', bytes(0xff, 0xd8, ...Array.from({ length: 40 }, (_, i) => (i % 4 === 0 ? 0xff : i % 4 === 1 ? 0xe1 : 0)))],
		['text', new TextEncoder().encode('<svg onload="alert(1)"></svg>')],
	])('reads %s as no image, without hanging', (_, b) => {
		expect(imageInfo(b)).toBeNull();
		expect(checkImage(b)).toEqual(['image: not a PNG or JPEG']);
	});

	it('flags a PNG that is not square or too large, from its header only', () => {
		const png = (w: number, h: number) => {
			const b = new Uint8Array(33);
			b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
			new DataView(b.buffer).setUint32(16, w);
			new DataView(b.buffer).setUint32(20, h);
			return b;
		};
		expect(checkImage(png(256, 256))).toEqual([]);
		expect(checkImage(png(256, 255)).some((x) => x.includes('square'))).toBe(true);
		expect(checkImage(png(0xffffffff, 0xffffffff)).some((x) => x.includes('between'))).toBe(true);
	});

	it('reads garbage and a box claiming a huge size as no clip, without throwing', () => {
		expect(mp4Info(bytes())).toBeNull();
		const lying = new Uint8Array(64);
		lying.set([0xff, 0xff, 0xff, 0xff, 0x74, 0x6b, 0x68, 0x64], 8); // a tkhd that claims 4 GB
		expect(() => mp4Info(lying)).not.toThrow();
		expect(mp4Info(lying)).toBeNull();
		expect(checkClip(bytes(1, 2, 3))).toEqual(['clip: not an MP4']);
	});
});
