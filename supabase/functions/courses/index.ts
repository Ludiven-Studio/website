// courses — the ONLY access path to the courses_* tables (service_role, bypasses
// RLS). A grocery-list tool: one SPACE (uuid = shared secret in the URL) holds an
// active LIST plus archived history; lists hold ITEMS. Every action is gated by a
// valid space uuid, and every list/item op is checked to belong to that space, so
// knowing one space's uuid never leaks another's. Live sync is done client-side
// over Realtime broadcast (channel courses-<spaceId>); this function is only the
// persistence gateway.
//
// Deploy:  supabase functions deploy courses
// Local:   supabase functions serve courses

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const bad = (reason: string, status = 400): Response => json({ error: reason }, status);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
const clean = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max);

interface ItemRow { id: string; label: string; qty: string | null; checked: boolean; sort: number; created_at: string; }
interface ListRow { id: string; space_id: string; title: string; archived_at: string | null; created_at: string; }

/** Ensure a space exists. Returns its id or null. */
async function requireSpace(db: SupabaseClient, spaceId: unknown): Promise<string | null> {
	if (!isUuid(spaceId)) return null;
	const { data } = await db.from('courses_spaces').select('id').eq('id', spaceId).maybeSingle();
	return data ? (data.id as string) : null;
}

/** Load a list and confirm it belongs to the given space. */
async function listInSpace(db: SupabaseClient, spaceId: string, listId: unknown): Promise<ListRow | null> {
	if (!isUuid(listId)) return null;
	const { data } = await db.from('courses_lists').select('*').eq('id', listId).eq('space_id', spaceId).maybeSingle<ListRow>();
	return data ?? null;
}

/** The active (non-archived) list of a space, creating one if none exists. */
async function activeList(db: SupabaseClient, spaceId: string): Promise<ListRow> {
	const { data } = await db.from('courses_lists').select('*').eq('space_id', spaceId).is('archived_at', null).maybeSingle<ListRow>();
	if (data) return data;
	const { data: created, error } = await db.from('courses_lists').insert({ space_id: spaceId, title: '' }).select('*').single<ListRow>();
	if (error) throw error;
	return created;
}

const itemsOf = async (db: SupabaseClient, listId: string): Promise<ItemRow[]> => {
	const { data } = await db.from('courses_items').select('id, label, qty, checked, sort, created_at').eq('list_id', listId).order('sort').order('created_at');
	return (data ?? []) as ItemRow[];
};

/** Whole-space snapshot: active list + its items + archived history (with item counts). */
async function snapshot(db: SupabaseClient, spaceId: string) {
	const active = await activeList(db, spaceId);
	const items = await itemsOf(db, active.id);
	const { data: archived } = await db.from('courses_lists')
		.select('id, title, created_at, archived_at, courses_items(count)')
		.eq('space_id', spaceId).not('archived_at', 'is', null)
		.order('archived_at', { ascending: false }).limit(60);
	const history = (archived ?? []).map((l: Record<string, unknown>) => ({
		id: l.id, title: l.title, created_at: l.created_at, archived_at: l.archived_at,
		count: Array.isArray(l.courses_items) && l.courses_items[0] ? (l.courses_items[0] as { count: number }).count : 0,
	}));
	return { spaceId, active: { id: active.id, title: active.title, items }, history };
}

/** Archive the current active list (if any) so a fresh one can take its place. */
async function archiveActive(db: SupabaseClient, spaceId: string, nowIso: string): Promise<void> {
	await db.from('courses_lists').update({ archived_at: nowIso }).eq('space_id', spaceId).is('archived_at', null);
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
	if (req.method !== 'POST') return bad('method not allowed', 405);

	let body: Record<string, unknown>;
	try { body = await req.json(); } catch { return bad('invalid JSON body'); }

	const action = String(body.action ?? '');
	const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
	const now = new Date().toISOString();

	try {
		// Create a brand-new space with one empty active list. No space uuid needed.
		if (action === 'create_space') {
			const { data: space, error } = await db.from('courses_spaces').insert({}).select('id').single();
			if (error) throw error;
			return json(await snapshot(db, space.id as string));
		}

		// Everything else needs a valid space uuid.
		const spaceId = await requireSpace(db, body.spaceId);
		if (!spaceId) return bad('unknown space', 404);

		switch (action) {
			case 'get_space':
				return json(await snapshot(db, spaceId));

			case 'get_list': {
				const list = await listInSpace(db, spaceId, body.listId);
				if (!list) return bad('unknown list', 404);
				return json({ id: list.id, title: list.title, created_at: list.created_at, items: await itemsOf(db, list.id) });
			}

			case 'add_item': {
				const list = await activeList(db, spaceId);
				const label = clean(body.label, 120);
				if (!label) return bad('empty label');
				const { data: last } = await db.from('courses_items').select('sort').eq('list_id', list.id).order('sort', { ascending: false }).limit(1).maybeSingle();
				const sort = (last?.sort ?? 0) + 1;
				const { data: item, error } = await db.from('courses_items')
					.insert({ list_id: list.id, label, qty: clean(body.qty, 40) || null, sort })
					.select('id, label, qty, checked, sort, created_at').single<ItemRow>();
				if (error) throw error;
				return json({ item });
			}

			case 'update_item': {
				if (!isUuid(body.itemId)) return bad('bad itemId');
				// Verify the item's list belongs to this space before touching it.
				const { data: owned } = await db.from('courses_items')
					.select('id, courses_lists!inner(space_id)').eq('id', body.itemId)
					.eq('courses_lists.space_id', spaceId).maybeSingle();
				if (!owned) return bad('unknown item', 404);
				const patch: Record<string, unknown> = {};
				if (typeof body.checked === 'boolean') patch.checked = body.checked;
				if (typeof body.label === 'string') { const l = clean(body.label, 120); if (l) patch.label = l; }
				if ('qty' in body) patch.qty = clean(body.qty, 40) || null;
				if (!Object.keys(patch).length) return bad('nothing to update');
				const { data: item, error } = await db.from('courses_items').update(patch).eq('id', body.itemId)
					.select('id, label, qty, checked, sort, created_at').single<ItemRow>();
				if (error) throw error;
				return json({ item });
			}

			case 'delete_item': {
				if (!isUuid(body.itemId)) return bad('bad itemId');
				const { data: owned } = await db.from('courses_items')
					.select('id, courses_lists!inner(space_id)').eq('id', body.itemId)
					.eq('courses_lists.space_id', spaceId).maybeSingle();
				if (!owned) return bad('unknown item', 404);
				await db.from('courses_items').delete().eq('id', body.itemId);
				return json({ ok: true });
			}

			case 'clear_checked': {
				const list = await listInSpace(db, spaceId, body.listId) ?? await activeList(db, spaceId);
				await db.from('courses_items').delete().eq('list_id', list.id).eq('checked', true);
				return json({ ok: true });
			}

			case 'rename_list': {
				const list = await listInSpace(db, spaceId, body.listId);
				if (!list) return bad('unknown list', 404);
				await db.from('courses_lists').update({ title: clean(body.title, 80) }).eq('id', list.id);
				return json({ ok: true });
			}

			case 'new_list': {
				await archiveActive(db, spaceId, now);
				const { error } = await db.from('courses_lists').insert({ space_id: spaceId, title: clean(body.title, 80) });
				if (error) throw error;
				return json(await snapshot(db, spaceId));
			}

			case 'reuse_list': {
				const source = await listInSpace(db, spaceId, body.sourceListId);
				if (!source) return bad('unknown list', 404);
				const srcItems = await itemsOf(db, source.id);
				await archiveActive(db, spaceId, now);
				const { data: fresh, error } = await db.from('courses_lists')
					.insert({ space_id: spaceId, title: clean(body.title, 80) || source.title })
					.select('*').single<ListRow>();
				if (error) throw error;
				if (srcItems.length) {
					// Copy items unchecked, keep their order.
					const rows = srcItems.map((it, i) => ({ list_id: fresh.id, label: it.label, qty: it.qty, checked: false, sort: i + 1 }));
					await db.from('courses_items').insert(rows);
				}
				return json(await snapshot(db, spaceId));
			}

			default:
				return bad(`unknown action '${action}'`);
		}
	} catch (e) {
		return json({ error: 'server error', detail: String(e) }, 500);
	}
});
