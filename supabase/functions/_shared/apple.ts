// Sign in with Apple: an app that deletes an account must revoke Apple's grant too (App Store
// rule 5.1.1(v)). At deletion the phone asks Apple again and sends the fresh authorization code;
// it is swapped here for Apple's tokens, which are revoked at once. Nothing from Apple is kept.
//
// Secrets (set by the owner, never in the repo):
//   APPLE_KEY_ID        the id of a "Sign in with Apple" key of team APPLE_TEAM_ID
//   APPLE_PRIVATE_KEY   that key's .p8, as written (-----BEGIN PRIVATE KEY----- …)
//   APPLE_TEAM_ID       optional, the studio's team by default
// The key is tied to a primary App ID: the other apps' App IDs are grouped with it in the Apple
// Developer portal, or Apple answers invalid_client for them.

const APPLE = 'https://appleid.apple.com';
const TEAM_ID = Deno.env.get('APPLE_TEAM_ID') ?? '94CYUHGL67';

/** The bundle ids the studio's apps sign in with, Dev builds included. */
export const APPLE_CLIENTS = new Set([
	'com.ludivenstudio.petanquegame', 'com.ludivenstudio.petanquegame.dev',
	'com.ludivenstudio.dragonsgems', 'com.ludivenstudio.dragonsgems.dev',
	'com.ludivenstudio.petanquemeet', 'com.ludivenstudio.petanquemeetdev',
	'com.ludivenstudio.ninorush', 'com.ludivenstudio.ninorush.dev',
]);

/** An authorization code as Apple writes them: short, URL-safe. */
export const isAppleCode = (v: unknown): v is string =>
	typeof v === 'string' && v.length >= 16 && v.length <= 512 && /^[A-Za-z0-9._-]+$/.test(v);

const b64url = (bytes: Uint8Array): string =>
	btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const text = (s: string) => new TextEncoder().encode(s);

/** The ES256 JWT Apple takes as client_secret, valid five minutes. WebCrypto signs ECDSA as
 *  r || s, which is what JWS wants. */
export async function clientSecret(clientId: string, keyId: string, pem: string, now = Date.now()): Promise<string> {
	const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
	const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
	const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
	const iat = Math.floor(now / 1000);
	const header = b64url(text(JSON.stringify({ alg: 'ES256', kid: keyId })));
	const claims = b64url(text(JSON.stringify({ iss: TEAM_ID, iat, exp: iat + 300, aud: APPLE, sub: clientId })));
	const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, text(`${header}.${claims}`));
	return `${header}.${claims}.${b64url(new Uint8Array(signature))}`;
}

async function post(path: string, form: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
	const res = await fetch(`${APPLE}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(form),
	});
	const body = await res.json().catch(() => ({})) as Record<string, unknown>;
	return { status: res.status, body };
}

/** Swaps the code for Apple's tokens and revokes them. Throws with Apple's reason. */
export async function revokeApple(code: string, clientId: string): Promise<void> {
	if (!APPLE_CLIENTS.has(clientId)) throw new Error(`unknown Apple client ${clientId}`);
	if (!isAppleCode(code)) throw new Error('not an Apple authorization code');
	const keyId = Deno.env.get('APPLE_KEY_ID');
	const pem = Deno.env.get('APPLE_PRIVATE_KEY');
	if (!keyId || !pem) throw new Error('APPLE_KEY_ID or APPLE_PRIVATE_KEY is not set');
	const secret = await clientSecret(clientId, keyId, pem);
	const auth = { client_id: clientId, client_secret: secret };
	const tokens = await post('/auth/token', { ...auth, code, grant_type: 'authorization_code' });
	if (tokens.status !== 200) throw new Error(`Apple token ${tokens.status} ${tokens.body.error ?? ''}`);
	const refresh = tokens.body.refresh_token;
	const token = typeof refresh === 'string' ? refresh : tokens.body.access_token;
	if (typeof token !== 'string') throw new Error('Apple sent no token');
	const revoked = await post('/auth/revoke', {
		...auth, token, token_type_hint: typeof refresh === 'string' ? 'refresh_token' : 'access_token',
	});
	if (revoked.status !== 200) throw new Error(`Apple revoke ${revoked.status} ${revoked.body.error ?? ''}`);
}

/** What a deletion request carries when the account signed in with Apple: the fresh code and
 *  the app it was asked for. Null when it carries none. */
export function appleOf(body: Record<string, unknown>): { code: string; clientId: string } | null {
	const code = body.apple_code;
	const clientId = body.apple_client;
	return isAppleCode(code) && typeof clientId === 'string' && APPLE_CLIENTS.has(clientId) ? { code, clientId } : null;
}
