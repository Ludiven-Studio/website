import { describe, expect, it } from 'vitest';
import { GIS_CSP, makeNonce, sha256Hex, usesGoogleButton } from './googleIdentity';
import { GOOGLE_WEB_CLIENT_ID } from '../data/site';

describe('the admin pages’ Google button', () => {
	it('hashes the nonce with SHA-256, as Google puts it in the token and Supabase checks it', async () => {
		expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
		const a = await makeNonce(), b = await makeNonce();
		expect(a.hashed).toBe(await sha256Hex(a.raw));
		expect(a.raw).toMatch(/^[A-Za-z0-9]{40,}$/);
		expect(a.raw).not.toBe(b.raw);
	});

	it('is used on the admin pages only, so Meet’s map keeps its own brand on the redirect', () => {
		for (const p of ['/admin/', '/admin/revenus/', '/admin/pubs/', '/admin']) expect(usesGoogleButton(p)).toBe(true);
		for (const p of ['/', '/rencontres/', '/petanque-meet/', '/administration/']) expect(usesGoogleButton(p)).toBe(false);
	});

	it('opens only Google’s sign-in paths in the policy', () => {
		for (const v of Object.values(GIS_CSP)) expect(v.startsWith('https://accounts.google.com/gsi/')).toBe(true);
	});

	it('is a client ID or nothing: nothing keeps every page on the redirect', () => {
		expect(GOOGLE_WEB_CLIENT_ID === '' || /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(GOOGLE_WEB_CLIENT_ID)).toBe(true);
	});
});
