import { describe, it, expect } from 'vitest';
import { readBetaBuild } from './betaBuild';

const good = {
	url: 'https://github.com/Ludiven-Studio/website/releases/download/petanque-game-dev/petanquegame-dev-v0.1.50.apk',
	version: '0.1.50',
	date: '2026-11-19T18:00:00Z',
	size: 61_234_567,
	commit: 'e59ade5',
	notes: ['Nouveau : le tir', 'Corrigé : le son'],
};

describe('readBetaBuild', () => {
	it('reads the manifest the publish scripts write', () => {
		const b = readBetaBuild(good)!;
		expect(b.url).toBe(good.url);
		expect(b.version).toBe('0.1.50');
		expect(b.date?.toISOString()).toBe('2026-11-19T18:00:00.000Z');
		expect(b.size).toBe(61_234_567);
		expect(b.notes).toHaveLength(2);
	});

	it.each([null, undefined, 42, 'x', [], [good]])('offers nothing for %j', (m) => {
		expect(readBetaBuild(m)).toBeNull();
	});

	it.each([
		'javascript:alert(1)//.apk',
		'http://github.com/x/app.apk',
		'data:application/vnd.android.package-archive;base64,AAAA',
		'https://evil.example/login.html',
		'https://github.com/x/app.apk.html',
		'//github.com/x/app.apk',
		'',
		'not a url',
	])('refuses the link %j', (url) => {
		expect(readBetaBuild({ ...good, url })).toBeNull();
	});

	it.each([undefined, '', '   ', 3])('refuses a version %j', (version) => {
		expect(readBetaBuild({ ...good, version })).toBeNull();
	});

	it('shows a dash rather than NaN or Invalid Date for broken details', () => {
		const b = readBetaBuild({ ...good, date: 'yesterday', size: 'big', commit: 7, notes: 'none' })!;
		expect(b.date).toBeNull();
		expect(b.size).toBeNull();
		expect(b.commit).toBe('');
		expect(b.notes).toEqual([]);
	});

	it.each([NaN, Infinity, -5, 0])('drops a size of %s', (size) => {
		expect(readBetaBuild({ ...good, size })!.size).toBeNull();
	});

	it('keeps only the notes that are text, as text (the page sets textContent, never HTML)', () => {
		const b = readBetaBuild({ ...good, notes: ['<img src=x onerror=alert(1)>', null, 5, '', { a: 1 }, 'ok'] })!;
		expect(b.notes).toEqual(['<img src=x onerror=alert(1)>', 'ok']);
	});
});
