// apple-revoke — revokes Sign in with Apple's grant for an app whose accounts are not the
// studio's (Pétanque Game: Unity Authentication). The app asks Apple again as the player deletes
// their account and sends the fresh code here; the code is the proof, so no session is needed.
// Studio accounts revoke within delete_account (app-save, meetups) instead.
//
// POST { code, client_id } -> { ok }   502 { error } when Apple refuses
//
// Deploy:  supabase functions deploy apple-revoke
// Secrets: APPLE_KEY_ID, APPLE_PRIVATE_KEY (_shared/apple.ts)

import { APPLE_CLIENTS, isAppleCode, revokeApple } from '../_shared/apple.ts';

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
	if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

	let body: Record<string, unknown>;
	try { body = await req.json(); } catch { return json({ error: 'invalid JSON body' }, 400); }
	const clientId = String(body.client_id ?? '');
	if (!APPLE_CLIENTS.has(clientId)) return json({ error: 'unknown app' }, 400);
	if (!isAppleCode(body.code)) return json({ error: 'not an Apple code' }, 400);

	try {
		await revokeApple(body.code, clientId);
		return json({ ok: true });
	} catch (e) {
		console.error('apple revoke', clientId, e instanceof Error ? e.message : e);
		return json({ error: 'Apple refused' }, 502);
	}
});
