// shot-prizes — Pétanque Game's shooting challenge pays the best places of its day and week rankings
// (Unity Leaderboards « shots_day », « shots_week »). A minute before each reset, pg_cron calls
// « snapshot » with the day closing: the paid places are read with Unity's Admin API and kept here by Unity
// player id, no name; each reading is kept as the period's draft, and the first snapshot closes the period from it
// in one transaction (shot_prizes_settle), later ones change nothing; Unity is tried three times. The game then asks for its own (« mine ») with the player's Unity access token, and pays
// each prize once on its side; « forget » deletes a player's rows as their account is deleted. pg_cron
// purges the rows after 30 days on its own. Unity keeps no archive of the rankings.
//
// POST { action: 'snapshot', day: 'YYYY-MM-DD' }  header x-cron-key   -> { kept, closed }
// POST { action: 'mine' }                         header x-unity-token -> { prizes: [{ board, period, rank, score, coins }] }
// POST { action: 'forget' }                       header x-unity-token -> { ok }
// POST { action: 'check' }                        header x-cron-key   -> lines read from Unity, nothing written
//
// Deploy:  supabase functions deploy shot-prizes --no-verify-jwt   (the game holds no Supabase session)
// Tables:  migrations/20261118120000_shot_prizes.sql (shot_prizes, shot_prizes_closed, the cron jobs),
//          20261119100000_shot_prizes_settle.sql (the drafts, shot_prizes_draft_save, shot_prizes_settle)
// Secrets: UNITY_SERVICE_KEY_ID, UNITY_SERVICE_SECRET (a Unity service account allowed to list leaderboard
//          scores), UNITY_PROJECT_ID, UNITY_ENVIRONMENT_ID (production), SHOT_PRIZES_CRON_KEY (also in the
//          vault as « shot_prizes_cron_key », read by the cron job: set it before the first night)

import { createClient } from 'jsr:@supabase/supabase-js@2.117.0';
import { createRemoteJWKSet, jwtVerify } from 'jsr:@panva/jose@6.1.0';
import { closing, DAY_BOARD, paidPlaces, rowsFrom, SPARE_LINES, type UnityScore, WEEK_BOARD } from '../_shared/shotPrizes.ts';

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

/** The Unity player id of a valid, unexpired token of this project (and environment, when it names one), else null. */
async function playerOf(token: string): Promise<string | null> {
	if (!token) return null;
	try {
		const { payload } = await jwtVerify(token, JWKS, {
			issuer: ISSUER,
			algorithms: ['RS256'],
			requiredClaims: ['exp', 'sub', 'project_id'],
		});
		if (payload.project_id !== env('UNITY_PROJECT_ID')) return null;
		const envId = payload.env_id ?? payload.environment_id;
		if (envId !== undefined && envId !== env('UNITY_ENVIRONMENT_ID')) return null;
		return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
	} catch (e) {
		console.warn('token refused', e instanceof Error ? e.message : e);
		return null;
	}
}

/** The best `limit` lines of a ranking, from Unity's Leaderboards Admin API (service account, Basic auth), with
 * their metadata when the API gives it (a deleted account's line is marked gone). Three tries a few seconds apart. */
async function topScores(board: string, limit: number): Promise<UnityScore[]> {
	const url = `https://services.api.unity.com/leaderboards/v1/projects/${env('UNITY_PROJECT_ID')}` +
		`/environments/${env('UNITY_ENVIRONMENT_ID')}/leaderboards/${board}/scores?offset=0&limit=${limit}&includeMetadata=true`;
	const basic = btoa(`${env('UNITY_SERVICE_KEY_ID')}:${env('UNITY_SERVICE_SECRET')}`);
	let last = '';
	for (let attempt = 0; attempt < 3; attempt++) {
		if (attempt > 0) await new Promise((r) => setTimeout(r, 4000));
		const res = await fetch(url, { headers: { Authorization: `Basic ${basic}` } });
		if (res.status === 404) return []; // the ranking not made yet
		if (res.ok) {
			const body = await res.json();
			return Array.isArray(body.results) ? body.results : [];
		}
		last = `${res.status} ${(await res.text()).slice(0, 200)}`;
	}
	throw new Error(`${board} scores: ${last}`);
}

/** Keeps a reading of a period's ranking as its draft (refused once closed, or over a reading of more lines). */
async function saveDraft(board: string, week: boolean, period: string, read: UnityScore[]): Promise<boolean> {
	const rows = rowsFrom(read, board, week, period).map(({ player_id, rank, score, coins }) => ({ player_id, rank, score, coins }));
	const { data, error } = await db.rpc('shot_prizes_draft_save', { p_board: board, p_period: period, p_total: read.length, p_rows: rows });
	if (error) throw new Error('draft: ' + error.message);
	return data === true;
}

/** Closes a period from its draft in one transaction: the rows paid, -1 when closed already, -2 with no draft. */
async function settle(board: string, period: string): Promise<number> {
	const { data, error } = await db.rpc('shot_prizes_settle', { p_board: board, p_period: period });
	if (error) throw new Error('settle: ' + error.message);
	return Number(data);
}

/** Closes the periods ending on `day`: each one once, from the reading kept as its draft. */
async function snapshot(day: string): Promise<Response> {
	const periods = closing(day, new Date());
	if (!periods) return json({ error: 'not today: the rankings may have reset' }, 409);
	let kept = 0;
	const closed: string[] = [];
	for (const { board, week, period } of periods) {
		await saveDraft(board, week, period, await topScores(board, paidPlaces(week) + SPARE_LINES));
		const paid = await settle(board, period);
		if (paid < 0) continue;
		kept += paid;
		closed.push(`${board}:${period}`);
	}
	return json({ kept, closed });
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
		if (action === 'snapshot' || action === 'check') {
			if (!sameSecret(req.headers.get('x-cron-key') ?? '', env('SHOT_PRIZES_CRON_KEY'))) return json({ error: 'forbidden' }, 403);
			if (action === 'snapshot') return await snapshot(String(body.day ?? ''));
			// The snapshot's reading without writing or closing anything: a deploy checks Unity answers mid-day.
			const day = await topScores(DAY_BOARD, paidPlaces(false) + SPARE_LINES);
			const week = await topScores(WEEK_BOARD, paidPlaces(true) + SPARE_LINES);
			return json({ day: day.length, week: week.length, dayPaid: rowsFrom(day, DAY_BOARD, false, 'check').length, weekPaid: rowsFrom(week, WEEK_BOARD, true, 'check').length });
		}
		if (action !== 'mine' && action !== 'forget') return json({ error: 'unknown action' }, 400);
		const player = await playerOf(req.headers.get('x-unity-token') ?? '');
		if (!player) return json({ error: 'sign in first' }, 401);
		if (action === 'forget') {
			for (const table of ['shot_prizes', 'shot_prizes_draft']) {
				const { error } = await db.from(table).delete().eq('player_id', player);
				if (error) throw new Error('forget: ' + error.message);
			}
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
