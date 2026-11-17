// shot-prizes — Pétanque Game's shooting challenge pays the best places of its day and week rankings
// (Unity Leaderboards « shots_day », « shots_week »). A minute before each reset, pg_cron calls
// « snapshot »: the paid places are read with Unity's Admin API and kept here by Unity player id, no
// name, for 30 days. The game then asks for its own (« mine ») with the player's Unity access token, and
// pays each prize once on its side; « forget » deletes a player's rows as their account is deleted.
// Unity keeps no archive of the rankings: a deleted account leaves nothing behind there.
//
// POST { action: 'snapshot' }  header x-cron-key  -> { kept }
// POST { action: 'mine' }      header x-unity-token -> { prizes: [{ board, period, rank, score, coins }] }
// POST { action: 'forget' }    header x-unity-token -> { ok }
//
// Deploy:  supabase functions deploy shot-prizes --no-verify-jwt   (the game holds no Supabase session)
// Table:   migrations/20261118120000_shot_prizes.sql (shot_prizes, the cron job)
// Secrets: UNITY_SERVICE_KEY_ID, UNITY_SERVICE_SECRET (a Unity service account allowed to list leaderboard
//          scores), UNITY_PROJECT_ID, UNITY_ENVIRONMENT_ID (production), SHOT_PRIZES_CRON_KEY (also in the
//          vault as « shot_prizes_cron_key », read by the cron job)

import { createClient } from 'jsr:@supabase/supabase-js@2.117.0';
import { createRemoteJWKSet, jwtVerify } from 'jsr:@panva/jose@6.1.0';
import { closing, KEEP_DAYS, paidPlaces, rowsFrom, type UnityScore } from '../_shared/shotPrizes.ts';

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-unity-token',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const env = (name: string): string => Deno.env.get(name) ?? '';

const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

// Unity Authentication's player tokens (docs: « Validate the player's ID token »).
const ISSUER = 'https://player-auth.services.api.unity.com';
const JWKS = createRemoteJWKSet(new URL(ISSUER + '/.well-known/jwks.json'));

const DAY_MS = 86_400_000;
const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);

function sameSecret(a: string, b: string): boolean {
	if (a.length === 0 || a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** The Unity player id of a valid token of this project, else null. */
async function playerOf(token: string): Promise<string | null> {
	if (!token) return null;
	try {
		const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER });
		if (payload.project_id !== undefined && payload.project_id !== env('UNITY_PROJECT_ID')) return null;
		return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
	} catch {
		return null;
	}
}

/** The best `limit` lines of a ranking, from Unity's Leaderboards Admin API (service account, Basic auth). */
async function topScores(board: string, limit: number): Promise<UnityScore[]> {
	const url = `https://services.api.unity.com/leaderboards/v1/projects/${env('UNITY_PROJECT_ID')}` +
		`/environments/${env('UNITY_ENVIRONMENT_ID')}/leaderboards/${board}/scores?offset=0&limit=${limit}`;
	const basic = btoa(`${env('UNITY_SERVICE_KEY_ID')}:${env('UNITY_SERVICE_SECRET')}`);
	const res = await fetch(url, { headers: { Authorization: `Basic ${basic}` } });
	if (res.status === 404) return []; // the ranking not made yet
	if (!res.ok) throw new Error(`${board} scores: ${res.status} ${(await res.text()).slice(0, 200)}`);
	const body = await res.json();
	return Array.isArray(body.results) ? body.results : [];
}

async function snapshot(): Promise<Response> {
	let kept = 0;
	for (const { board, week, period } of closing(new Date())) {
		const rows = rowsFrom(await topScores(board, paidPlaces(week)), board, week, period);
		if (rows.length === 0) continue;
		const { error } = await db.from('shot_prizes').upsert(rows, { onConflict: 'board,period,player_id' });
		if (error) throw new Error('upsert: ' + error.message);
		kept += rows.length;
	}
	const { error } = await db.from('shot_prizes').delete().lt('period', iso(Date.now() - KEEP_DAYS * DAY_MS));
	if (error) console.error('purge', error.message);
	return json({ kept });
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
	if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

	let body: Record<string, unknown>;
	try {
		body = await req.json();
	} catch {
		return json({ error: 'invalid JSON body' }, 400);
	}
	const action = String(body.action ?? '');

	try {
		if (action === 'snapshot') {
			if (!sameSecret(req.headers.get('x-cron-key') ?? '', env('SHOT_PRIZES_CRON_KEY'))) return json({ error: 'forbidden' }, 403);
			return await snapshot();
		}
		if (action !== 'mine' && action !== 'forget') return json({ error: 'unknown action' }, 400);
		const player = await playerOf(req.headers.get('x-unity-token') ?? '');
		if (!player) return json({ error: 'sign in first' }, 401);
		if (action === 'forget') {
			const { error } = await db.from('shot_prizes').delete().eq('player_id', player);
			if (error) throw new Error('forget: ' + error.message);
			return json({ ok: true });
		}
		const { data, error } = await db.from('shot_prizes')
			.select('board, period, rank, score, coins')
			.eq('player_id', player)
			.gte('period', iso(Date.now() - 15 * DAY_MS))
			.order('period', { ascending: true });
		if (error) throw new Error('mine: ' + error.message);
		return json({ prizes: data ?? [] });
	} catch (e) {
		console.error('shot-prizes', action, e instanceof Error ? e.message : e);
		return json({ error: 'failed' }, 500);
	}
});
