// stats-admin — the studio dashboard's figures (/admin/stats/ and the tiles of /admin/), for Raphaël's account
// only: each app's visitors, purchases, sign-ins, house ads and retention, read from the self-hosted Umami with a
// view-only user, cached 10 minutes in admin_stats_cache; and the studio board of /admin/versions/ (studio_board,
// written by the studio's board.py); and the ad revenue of /admin/revenus/, read from the LevelPlay Reporting API
// and cached an hour in admin_stats_cache. The logic is in _shared/statsAdmin.mjs.
//
// Secrets: UMAMI_URL (https://stats.ludiven-studio.fr), UMAMI_USER and UMAMI_PASSWORD (the view-only
// « dashboard » user), PROMO_ADMIN_USER_ID (Raphaël's Supabase user id, the same as promo-admin),
// LEVELPLAY_SECRET_KEY and LEVELPLAY_REFRESH_TOKEN (LevelPlay, My Account).
// Deploy: supabase functions deploy stats-admin --project-ref mzrdfahmzllgbpudpsdi

import { createClient } from 'jsr:@supabase/supabase-js@2.117.0';
// @deno-types="../_shared/statsAdmin.d.mts"
import { statsHandler } from '../_shared/statsAdmin.mjs';
import type { BoardRow } from '../_shared/statsAdmin.d.mts';

const env = Deno.env.toObject();
const db = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function isAdmin(req: Request): Promise<boolean> {
	const admin = env.PROMO_ADMIN_USER_ID;
	const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
	if (!admin || !jwt) return false;
	const { data } = await createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!).auth.getUser(jwt);
	return data?.user?.id === admin;
}

const cache = {
	async get(key: string) {
		const { data, error } = await db.from('admin_stats_cache').select('body, fetched_at').eq('key', key).maybeSingle();
		if (error || !data) return null;
		return { body: data.body as unknown, fetchedAt: data.fetched_at as string };
	},
	async put(key: string, body: unknown) {
		await db.from('admin_stats_cache').upsert({ key, body, fetched_at: new Date().toISOString() });
	},
};

const board = {
	async list(): Promise<BoardRow[]> {
		const { data, error } = await db.from('studio_board').select('app, data, updated_at');
		if (error) throw new Error(error.message);
		return (data ?? []) as BoardRow[];
	},
};

Deno.serve(statsHandler({ env, isAdmin, cache, board }));
