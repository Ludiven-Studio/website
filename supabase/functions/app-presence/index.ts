// app-presence — how many play an app right now. Each phone in the app beats with a random id made at
// each launch (Pétanque Game: every 5 min, 15 s while searching, 5 s on an online screen; the other apps every
// minute); the answer is how many were heard in the last six minutes (migration 20261125130000).
// Nothing about the player is kept: no player id, no IP, rows gone minutes after the app closes.
// The app's key is public, so a count can be forged: a session counts from its second beat (the table),
// and each IP brings so many sessions and beats, held in this instance's memory only (_shared/presence.ts).
//
// A phone searching for an online game adds { seek: { nick, players, game } } to its beats (every 15 s while it
// searches): the others are told the newest search, so a player waiting finds an opponent. The name is shown
// only while its owner searches, and goes with the row.
//
// From 1.0.20 the beats carry the game's online protocol: the count and the search told are those of the phones of
// the same protocol, and the phones beating without one (before 1.0.20) are a group of their own
// (migration 20261127120000). Still one call a beat.
//
// POST { app, session, proto?, seek? } -> { online, seeker: { nick, players, game, proto, since } | null }
//
// Deploy:  supabase functions deploy app-presence, after the migrations: before 20261127120000 every beat fails
// Table:   migrations/20261114120000_app_presence.sql, 20261117120000_app_presence_confirmed.sql,
//          20261118130000_app_presence_seek.sql, 20261127120000_app_presence_proto.sql (presence_beat_seek)

import { createClient } from 'jsr:@supabase/supabase-js@2.117.0';
import { BeatLimiter, clientIp, isSession, parseProto, parseSeek } from '../_shared/presence.ts';

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

	const seek = parseSeek(body.seek);
	const { data, error } = await db.rpc('presence_beat_seek', {
		p_app: app,
		p_session: session,
		p_nick: seek?.nick ?? null,
		p_players: seek?.players ?? null,
		p_game: seek?.game ?? null,
		p_proto: parseProto(body.proto),
	});
	if (error) {
		console.error('presence_beat_seek', error.message);
		return json({ error: 'not counted' }, 500);
	}
	const answer = (data ?? {}) as { online?: number; seeker?: unknown };
	return json({ online: Number(answer.online) || 0, seeker: answer.seeker ?? null });
});
