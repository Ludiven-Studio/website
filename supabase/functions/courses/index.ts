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

interface ItemRow { id: string; label: string; qty: string | null; checked: boolean; sort: number; category_id: string | null; created_at: string; }
interface ListRow { id: string; space_id: string; title: string; archived_at: string | null; created_at: string; }
interface CategoryRow { id: string; name: string; sort: number; }

const ITEM_COLS = 'id, label, qty, checked, sort, category_id, created_at';

/** Aisles a brand-new space starts with, in supermarket walking order. All editable. */
const DEFAULT_CATEGORIES = [
	'Fruits et légumes', 'Boulangerie', 'Viande & poisson', 'Frais', 'Surgelés',
	'Épicerie', "P'tit dej", 'Goûters', 'Boissons', 'Entretien',
];

/** Fold case + accents so "Lait", "lait" and "LAIT" share one filing memory.
 *  Combining marks are dropped by code point rather than by a regex holding
 *  literal combining characters, which would be invisible and encoding-fragile. */
const labelKey = (label: string): string =>
	[...label.normalize('NFD')]
		.filter((ch) => { const c = ch.codePointAt(0)!; return c < 0x300 || c > 0x36f; })
		.join('')
		.toLowerCase()
		.trim();

/** Operator key for the admin dashboard. It lives ONLY here: the site is a
 *  static build, so anything shipped to the browser would be public. Unset =
 *  the dashboard stays locked rather than open. */
const ADMIN_KEY = Deno.env.get('COURSES_ADMIN_KEY') ?? '';
function isAdmin(v: unknown): boolean {
	if (!ADMIN_KEY || typeof v !== 'string' || v.length !== ADMIN_KEY.length) return false;
	let diff = 0;
	for (let i = 0; i < v.length; i++) diff |= v.charCodeAt(i) ^ ADMIN_KEY.charCodeAt(i);
	return diff === 0; // compare every char so a wrong key can't be found byte by byte
}

/** Ensure a space exists. Returns its id or null. */
async function requireSpace(db: SupabaseClient, spaceId: unknown): Promise<string | null> {
	if (!isUuid(spaceId)) return null;
	const { data } = await db.from('courses_spaces').select('id').eq('id', spaceId).maybeSingle();
	return data ? (data.id as string) : null;
}

/** A space's aisles, seeding the defaults the first time (covers spaces created
 *  before categories existed, so no migration backfill is needed). */
async function categoriesOf(db: SupabaseClient, spaceId: string): Promise<CategoryRow[]> {
	const read = async (): Promise<CategoryRow[]> => {
		const { data } = await db.from('courses_categories').select('id, name, sort').eq('space_id', spaceId).order('sort').order('created_at');
		return (data ?? []) as CategoryRow[];
	};
	const existing = await read();
	if (existing.length) return existing;
	await db.from('courses_categories').insert(
		DEFAULT_CATEGORIES.map((name, i) => ({ space_id: spaceId, name, sort: i + 1 })),
	);
	return read();
}

/** Confirm a category belongs to the space. Null id = the "Sans catégorie" bucket. */
async function categoryInSpace(db: SupabaseClient, spaceId: string, categoryId: unknown): Promise<string | null | false> {
	if (categoryId === null || categoryId === undefined || categoryId === '') return null;
	if (!isUuid(categoryId)) return false;
	const { data } = await db.from('courses_categories').select('id').eq('id', categoryId).eq('space_id', spaceId).maybeSingle();
	return data ? (data.id as string) : false;
}

/** Where this label was filed last time, if anywhere. */
async function rememberedCategory(db: SupabaseClient, spaceId: string, label: string): Promise<string | null> {
	const { data } = await db.from('courses_item_memory').select('category_id')
		.eq('space_id', spaceId).eq('label_key', labelKey(label)).maybeSingle();
	return data ? (data.category_id as string) : null;
}

/** Teach the space where this label belongs (or forget it when uncategorised). */
async function rememberCategory(db: SupabaseClient, spaceId: string, label: string, categoryId: string | null): Promise<void> {
	const key = labelKey(label);
	if (!key) return;
	if (categoryId === null) {
		await db.from('courses_item_memory').delete().eq('space_id', spaceId).eq('label_key', key);
		return;
	}
	await db.from('courses_item_memory')
		.upsert({ space_id: spaceId, label_key: key, category_id: categoryId, updated_at: new Date().toISOString() },
			{ onConflict: 'space_id,label_key' });
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
	const { data } = await db.from('courses_items').select(ITEM_COLS).eq('list_id', listId).order('sort').order('created_at');
	return (data ?? []) as ItemRow[];
};

/** Whole-space snapshot: aisles + active list + its items + archived history. */
async function snapshot(db: SupabaseClient, spaceId: string) {
	const categories = await categoriesOf(db, spaceId);
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
	return { spaceId, categories, active: { id: active.id, title: active.title, items }, history };
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

		// Admin dashboard: it spans every space, so it is gated by the operator
		// key instead of a space uuid.
		if (action === 'admin_list' || action === 'admin_delete_space') {
			if (!isAdmin(body.adminKey)) return bad('forbidden', 403);

			if (action === 'admin_delete_space') {
				if (!isUuid(body.targetSpaceId)) return bad('bad space id');
				// Lists, items, aisles and filing memory all cascade from the space.
				await db.from('courses_spaces').delete().eq('id', body.targetSpaceId);
				return json({ ok: true });
			}

			const { data: spaces } = await db.from('courses_spaces').select('id, created_at').limit(500);
			const { data: lists } = await db.from('courses_lists').select('id, space_id, title, archived_at, created_at').limit(2000);
			const { data: items } = await db.from('courses_items').select('list_id, checked, created_at').limit(20000);

			const listsOfSpace = new Map<string, ListRow[]>();
			for (const l of (lists ?? []) as ListRow[]) {
				if (!listsOfSpace.has(l.space_id)) listsOfSpace.set(l.space_id, []);
				listsOfSpace.get(l.space_id)!.push(l);
			}
			const statsOfList = new Map<string, { total: number; checked: number; last: string }>();
			for (const it of (items ?? []) as { list_id: string; checked: boolean; created_at: string }[]) {
				const s = statsOfList.get(it.list_id) ?? { total: 0, checked: 0, last: '' };
				s.total++;
				if (it.checked) s.checked++;
				if (it.created_at > s.last) s.last = it.created_at;
				statsOfList.set(it.list_id, s);
			}

			const rows = ((spaces ?? []) as { id: string; created_at: string }[]).map((sp) => {
				const own = listsOfSpace.get(sp.id) ?? [];
				const active = own.find((l) => !l.archived_at) ?? null;
				const stats = active ? statsOfList.get(active.id) : undefined;
				// ISO timestamps sort lexicographically, so a plain > works here.
				let last = sp.created_at;
				for (const l of own) {
					if (l.created_at > last) last = l.created_at;
					const s = statsOfList.get(l.id);
					if (s && s.last > last) last = s.last;
				}
				return {
					id: sp.id,
					created_at: sp.created_at,
					title: active?.title ?? '',
					activeListId: active?.id ?? null, // lets the dashboard reuse rename_list
					items: stats?.total ?? 0,
					checked: stats?.checked ?? 0,
					archived: own.filter((l) => l.archived_at).length,
					lastActivity: last,
				};
			});
			rows.sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
			return json({ spaces: rows });
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
				await categoriesOf(db, spaceId); // seed aisles before any filing happens
				// Explicit category wins; otherwise fall back to where this label went last time.
				let categoryId: string | null;
				if ('categoryId' in body) {
					const resolved = await categoryInSpace(db, spaceId, body.categoryId);
					if (resolved === false) return bad('unknown category', 404);
					categoryId = resolved;
					await rememberCategory(db, spaceId, label, categoryId);
				} else {
					categoryId = await rememberedCategory(db, spaceId, label);
				}
				const { data: last } = await db.from('courses_items').select('sort').eq('list_id', list.id).order('sort', { ascending: false }).limit(1).maybeSingle();
				const sort = (last?.sort ?? 0) + 1;
				const { data: item, error } = await db.from('courses_items')
					.insert({ list_id: list.id, label, qty: clean(body.qty, 40) || null, sort, category_id: categoryId })
					.select(ITEM_COLS).single<ItemRow>();
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
				if ('categoryId' in body) {
					const resolved = await categoryInSpace(db, spaceId, body.categoryId);
					if (resolved === false) return bad('unknown category', 404);
					patch.category_id = resolved;
				}
				if (!Object.keys(patch).length) return bad('nothing to update');
				const { data: item, error } = await db.from('courses_items').update(patch).eq('id', body.itemId)
					.select(ITEM_COLS).single<ItemRow>();
				if (error) throw error;
				// Filing an item by hand teaches the space where that label belongs.
				if ('categoryId' in body) await rememberCategory(db, spaceId, item.label, item.category_id);
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

			// One action covers both dropping an item elsewhere in its aisle and
			// dragging it into another: the client sends the target aisle's full
			// order. Items left behind keep their relative order (their sorts just
			// leave a gap), so the source aisle needs no second round-trip.
			case 'reorder_items': {
				const ids = Array.isArray(body.orderedIds) ? body.orderedIds : null;
				if (!ids || !ids.every(isUuid)) return bad('orderedIds must be uuids');
				if (ids.length > 300) return bad('too many items');
				const resolved = await categoryInSpace(db, spaceId, body.categoryId);
				if (resolved === false) return bad('unknown category', 404);
				const list = await activeList(db, spaceId);
				// Every id must be an item of this space's active list — never trust the client.
				const { data: owned } = await db.from('courses_items').select('id, label').eq('list_id', list.id).in('id', ids);
				const rows = (owned ?? []) as { id: string; label: string }[];
				if (rows.length !== ids.length) return bad('unknown item', 404);
				const byId = new Map(rows.map((r) => [r.id, r.label]));
				await Promise.all(ids.map((id, i) =>
					db.from('courses_items').update({ sort: i + 1, category_id: resolved }).eq('id', id),
				));
				// Dragging into an aisle is also a filing decision worth remembering.
				await Promise.all(ids.map((id) => rememberCategory(db, spaceId, byId.get(id as string)!, resolved)));
				return json({ ok: true });
			}

			case 'add_category': {
				const name = clean(body.name, 40);
				if (!name) return bad('empty name');
				const cats = await categoriesOf(db, spaceId);
				if (cats.length >= 40) return bad('too many categories');
				const sort = (cats.at(-1)?.sort ?? 0) + 1;
				const { data: category, error } = await db.from('courses_categories')
					.insert({ space_id: spaceId, name, sort }).select('id, name, sort').single<CategoryRow>();
				if (error) throw error;
				return json({ category });
			}

			case 'rename_category': {
				const resolved = await categoryInSpace(db, spaceId, body.categoryId);
				if (resolved === false || resolved === null) return bad('unknown category', 404);
				const name = clean(body.name, 40);
				if (!name) return bad('empty name');
				await db.from('courses_categories').update({ name }).eq('id', resolved);
				return json({ ok: true });
			}

			// Items filed under a deleted aisle are NOT deleted — the FK is ON DELETE
			// SET NULL, so they drop back into "Sans catégorie".
			case 'delete_category': {
				const resolved = await categoryInSpace(db, spaceId, body.categoryId);
				if (resolved === false || resolved === null) return bad('unknown category', 404);
				await db.from('courses_categories').delete().eq('id', resolved);
				return json({ ok: true });
			}

			case 'reorder_categories': {
				const ids = Array.isArray(body.orderedIds) ? body.orderedIds : null;
				if (!ids || !ids.every(isUuid)) return bad('orderedIds must be uuids');
				const { data: owned } = await db.from('courses_categories').select('id').eq('space_id', spaceId).in('id', ids);
				if ((owned ?? []).length !== ids.length) return bad('unknown category', 404);
				await Promise.all(ids.map((id, i) => db.from('courses_categories').update({ sort: i + 1 }).eq('id', id)));
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
					const rows = srcItems.map((it, i) => ({ list_id: fresh.id, label: it.label, qty: it.qty, checked: false, sort: i + 1, category_id: it.category_id }));
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
