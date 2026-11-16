// app-presence — how many play an app right now. Each phone in the app beats once a minute with a
// random id made at each launch; the answer is how many were heard in the last two minutes.
// Nothing about the player is kept: no player id, no IP, rows gone minutes after the app closes.
// The app's key is public, so a count can be forged: a session counts from its second beat (the table),
// and each IP brings so many sessions and beats, held in this instance's memory only (_shared/presence.ts).
//
// POST { app, session } -> { online }
//
// Deploy:  supabase functions deploy app-presence
// Table:   migrations/20261114120000_app_presence.sql, 20261117120000_app_presence_confirmed.sql (presence_beat)

import { createClient } from 'jsr:@supabase/supabase-js@2.117.0';
import { BeatLimiter, clientIp, isSession } from '../_shared/presence.ts';

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// The apps that beat; anything else is refused, so the table holds no stranger's rows.
const APPS = new Set(['petanquegame']);

const limiter = new BeatLimiter();

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
	auth: { persistSession: false },
});

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
	if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

	let body: Record<string, unknown>;
	try {
		body = await req.json();
	} catch {
		return json({ error: 'invalid JSON body' }, 400);
	}
	const app = String(body.app ?? '');
	const session = String(body.session ?? '');
	if (!APPS.has(app)) return json({ error: 'unknown app' }, 400);
	if (!isSession(session)) return json({ error: 'bad session' }, 400);
	if (!limiter.allow(clientIp(req.headers), session)) return json({ error: 'too many' }, 429);

	const { data, error } = await db.rpc('presence_beat', { p_app: app, p_session: session });
	if (error) {
		console.error('presence_beat', error.message);
		return json({ error: 'not counted' }, 500);
	}
	return json({ online: Number(data) || 0 });
});
