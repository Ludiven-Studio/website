// app-save — the ONLY access path to app_saves (service_role, bypasses RLS). A studio
// app keeps a signed-in player's progress here: one JSON copy per (account, app). The
// account is the Supabase Auth session (Google or Apple) sent as the Authorization
// bearer, the same account as Pétanque Meet and the site.
//
// Actions (POST { action, ... }):
//   get    { app }              -> { data, version }  (data null, version 0: nothing saved yet)
//   put    { app, data, base }  -> { version }  written over the version `base` the copy came
//                                  from (0 = none yet); 409 { data, version } when the cloud
//                                  moved since: the app merges and puts again.
//   delete_account              -> { ok }  the whole studio account (_shared/account.ts)
//
// Deploy:  supabase functions deploy app-save

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.117.0';
import { deleteAccount } from '../_shared/account.ts';

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const bad = (reason: string, status = 400): Response => json({ error: reason }, status);

const APPS = new Set(['dragonsgems']);
const MAX_BYTES = 64 * 1024;

/** The signed-in account, or null. The anon key is a JWT too, with no user in it. */
async function authUid(db: SupabaseClient, req: Request): Promise<string | null> {
	const h = req.headers.get('Authorization') ?? '';
	const jwt = h.startsWith('Bearer ') ? h.slice(7) : '';
	if (!jwt) return null;
	const { data } = await db.auth.getUser(jwt);
	return data.user?.id ?? null;
}

async function read(db: SupabaseClient, uid: string, app: string): Promise<{ data: unknown; version: number }> {
	const { data: row, error } = await db.from('app_saves').select('data, version')
		.eq('user_id', uid).eq('app', app).maybeSingle();
	if (error) throw error;
	return { data: row?.data ?? null, version: row?.version ?? 0 };
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
	if (req.method !== 'POST') return bad('method not allowed', 405);

	let body: Record<string, unknown>;
	try { body = await req.json(); } catch { return bad('invalid JSON body'); }

	const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
	const uid = await authUid(db, req);
	if (!uid) return bad('sign in first', 401);
	const action = String(body.action ?? '');
	const app = String(body.app ?? '');
	if (action !== 'delete_account' && !APPS.has(app)) return bad('unknown app');

	try {
		switch (action) {
			case 'get':
				return json(await read(db, uid, app));

			case 'put': {
				const data = body.data;
				const base = body.base;
				if (typeof data !== 'object' || data === null || Array.isArray(data)) return bad('data must be an object');
				if (!Number.isInteger(base) || (base as number) < 0) return bad('base must be a version');
				if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_BYTES) return bad('data too large', 413);
				const version = (base as number) + 1;
				const updated_at = new Date().toISOString();
				if (base === 0) {
					const { error } = await db.from('app_saves').insert({ user_id: uid, app, data, version, updated_at });
					if (!error) return json({ version });
					// 23505: another phone saved first.
					if (error.code !== '23505') throw error;
				} else {
					const { data: rows, error } = await db.from('app_saves').update({ data, version, updated_at })
						.eq('user_id', uid).eq('app', app).eq('version', base).select('version');
					if (error) throw error;
					if (rows?.length) return json({ version });
				}
				return json(await read(db, uid, app), 409);
			}

			case 'delete_account':
				await deleteAccount(db, uid);
				return json({ ok: true });

			default:
				return bad(`unknown action '${action}'`);
		}
	} catch (e) {
		console.error(action, e);
		return bad('server error', 500);
	}
});
