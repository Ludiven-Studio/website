// Client for the `courses` Edge Function (grocery lists). All reads/writes go
// through the function (service_role); the space uuid in the URL is the shared
// secret. Live sync between the two devices is handled separately in
// src/games/courses/net.ts (Supabase Realtime broadcast).

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../data/site';

export interface CourseItem {
	id: string;
	label: string;
	qty: string | null;
	checked: boolean;
	sort: number;
	created_at: string;
}

export interface HistoryEntry {
	id: string;
	title: string;
	created_at: string;
	archived_at: string;
	count: number;
}

export interface Snapshot {
	spaceId: string;
	active: { id: string; title: string; items: CourseItem[] };
	history: HistoryEntry[];
}

export const coursesEnabled = (): boolean => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
	const res = await fetch(`${SUPABASE_URL}/functions/v1/courses`, {
		method: 'POST',
		headers: {
			apikey: SUPABASE_ANON_KEY,
			Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ action, ...payload }),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
	return data as T;
}

export const createSpace = (): Promise<Snapshot> => call('create_space');
export const getSpace = (spaceId: string): Promise<Snapshot> => call('get_space', { spaceId });
export const getList = (spaceId: string, listId: string): Promise<{ id: string; title: string; created_at: string; items: CourseItem[] }> =>
	call('get_list', { spaceId, listId });
export const addItem = (spaceId: string, label: string, qty?: string): Promise<{ item: CourseItem }> =>
	call('add_item', { spaceId, label, qty });
export const updateItem = (spaceId: string, itemId: string, patch: { checked?: boolean; label?: string; qty?: string }): Promise<{ item: CourseItem }> =>
	call('update_item', { spaceId, itemId, ...patch });
export const deleteItem = (spaceId: string, itemId: string): Promise<{ ok: true }> =>
	call('delete_item', { spaceId, itemId });
export const clearChecked = (spaceId: string, listId: string): Promise<{ ok: true }> =>
	call('clear_checked', { spaceId, listId });
export const renameList = (spaceId: string, listId: string, title: string): Promise<{ ok: true }> =>
	call('rename_list', { spaceId, listId, title });
export const newList = (spaceId: string, title = ''): Promise<Snapshot> =>
	call('new_list', { spaceId, title });
export const reuseList = (spaceId: string, sourceListId: string, title = ''): Promise<Snapshot> =>
	call('reuse_list', { spaceId, sourceListId, title });

// ---- Recent spaces (so a returning device finds its list without the SMS) ----

const RECENT_KEY = 'ludiven-courses-spaces';

export interface RecentSpace { id: string; title: string; savedAt: number; }

export function recentSpaces(): RecentSpace[] {
	try {
		const raw = localStorage.getItem(RECENT_KEY);
		return raw ? (JSON.parse(raw) as RecentSpace[]) : [];
	} catch {
		return [];
	}
}

export function rememberSpace(id: string, title = ''): void {
	try {
		const list = recentSpaces().filter((s) => s.id !== id);
		list.unshift({ id, title, savedAt: Date.now() });
		localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
	} catch {
		/* storage unavailable — ignore */
	}
}

export function forgetSpace(id: string): void {
	try {
		localStorage.setItem(RECENT_KEY, JSON.stringify(recentSpaces().filter((s) => s.id !== id)));
	} catch {
		/* ignore */
	}
}
