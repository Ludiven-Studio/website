/**
 * Live sync for a shared grocery list over Supabase Realtime broadcast (no game
 * server). Both devices join the channel courses-<spaceId>; after any mutation a
 * client calls nudge(), and every peer refetches the space snapshot from the
 * `courses` Edge Function. A grocery list is tiny, so a full refetch on each
 * change is simpler and more robust than diff-merging — and always converges.
 * Presence carries a name only for a "someone else is here" indicator.
 * Mirrors the transport shape of src/games/foot/net.ts.
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../data/site';

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
	if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
	if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 5 } } });
	return client;
}

export interface CoursesLink {
	nudge: () => void;                       // tell peers "I changed something, refetch"
	onNudge: (cb: () => void) => void;       // a peer changed something
	onPeers: (cb: (count: number) => void) => void; // number of OTHER devices connected
	leave: () => void;
}

const randomId = (): string => `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;

/** Join the live channel for a space. Returns null when Realtime is unavailable. */
export function joinSpace(spaceId: string): CoursesLink | null {
	const c = getClient();
	if (!c) return null;
	const selfId = randomId();
	const ch: RealtimeChannel = c.channel(`courses-${spaceId}`, {
		config: { presence: { key: selfId }, broadcast: { self: false } },
	});

	const cb: { nudge?: () => void; peers?: (n: number) => void } = {};
	const otherCount = (): number => {
		const state = ch.presenceState();
		const ids = new Set<string>();
		for (const key of Object.keys(state)) for (const m of state[key] as { id?: string }[]) if (m.id && m.id !== selfId) ids.add(m.id);
		return ids.size;
	};

	ch.on('broadcast', { event: 'nudge' }, () => cb.nudge?.());
	ch.on('presence', { event: 'sync' }, () => cb.peers?.(otherCount()));
	ch.subscribe((status) => { if (status === 'SUBSCRIBED') void ch.track({ id: selfId }); });

	return {
		nudge: () => { void ch.send({ type: 'broadcast', event: 'nudge', payload: {} }); },
		onNudge: (fn) => { cb.nudge = fn; },
		onPeers: (fn) => { cb.peers = fn; fn(otherCount()); },
		leave: () => { void ch.untrack().then(() => ch.unsubscribe()); },
	};
}
