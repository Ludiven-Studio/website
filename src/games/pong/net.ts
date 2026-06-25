/**
 * PONG — multiplayer transport over Supabase Realtime (no game server). 2 players per room.
 * Matchmaking: joinRandom() probes a few fixed rooms; joinByCode() joins a shared code room.
 * Presence = the players; Broadcast = paddle positions (both) and full game state (host only).
 * Host is deterministic: the player with the smallest id (so both sides agree, no double-host).
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../data/site';
import type { PongState } from './engine';

export const MAX_PLAYERS = 2;
const MAX_ROOMS = 24;
const SYNC_WAIT_MS = 600;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I/L)

export interface PongPeer {
	id: string;
	name: string;
}
export interface PaddleMsg {
	id: string;
	y: number;
}

export interface Match {
	roomId: string;
	code: string | null; // shareable code when joined via a code, else null
	selfId: string;
	isHost: () => boolean;
	sendPaddle: (y: number) => void;
	sendState: (s: PongState) => void;
	onPaddle: (cb: (m: PaddleMsg) => void) => void;
	onState: (cb: (s: PongState) => void) => void;
	onPeers: (cb: (peers: PongPeer[]) => void) => void;
	leave: () => void;
}

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
	if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
	if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 30 } } });
	return client;
}

export const multiplayerAvailable = (): boolean => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const makeCode = (): string => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

const randomId = (): string => `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;

interface PresMeta {
	id: string;
	name: string;
}

/** All player ids in the room (including self), sorted — smallest is the host. */
function allIds(ch: RealtimeChannel, selfId: string): string[] {
	const state = ch.presenceState<PresMeta>();
	const ids = new Set<string>([selfId]);
	for (const key of Object.keys(state)) for (const m of state[key]) ids.add(m.id);
	return [...ids].sort();
}

function peersOf(ch: RealtimeChannel, selfId: string): PongPeer[] {
	const state = ch.presenceState<PresMeta>();
	const peers: PongPeer[] = [];
	for (const key of Object.keys(state)) for (const m of state[key]) if (m.id !== selfId) peers.push({ id: m.id, name: m.name });
	return peers;
}

/** Subscribe, wait for the first presence sync (or a short timeout), and report current peers. */
function subscribeAndSync(ch: RealtimeChannel, selfId: string): Promise<PongPeer[]> {
	return new Promise((resolve) => {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			resolve(peersOf(ch, selfId));
		};
		ch.on('presence', { event: 'sync' }, finish);
		ch.subscribe((status) => {
			if (status === 'SUBSCRIBED') setTimeout(finish, SYNC_WAIT_MS);
			else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve([]);
		});
	});
}

/** Subscribe to a room, join its presence, and build the Match handle. Returns null if the room is full. */
async function openRoom(c: SupabaseClient, roomId: string, name: string, code: string | null): Promise<Match | null> {
	const selfId = randomId();
	const ch = c.channel(roomId, { config: { presence: { key: selfId }, broadcast: { self: false } } });

	const cb: { paddle?: (m: PaddleMsg) => void; state?: (s: PongState) => void; peers?: (p: PongPeer[]) => void } = {};
	ch.on('broadcast', { event: 'paddle' }, ({ payload }) => cb.paddle?.(payload as PaddleMsg));
	ch.on('broadcast', { event: 'state' }, ({ payload }) => cb.state?.(payload as PongState));
	ch.on('presence', { event: 'sync' }, () => cb.peers?.(peersOf(ch, selfId)));

	const peers = await subscribeAndSync(ch, selfId);
	if (peers.length >= MAX_PLAYERS) {
		await ch.unsubscribe();
		return null; // room already full
	}
	await ch.track({ id: selfId, name } satisfies PresMeta);

	return {
		roomId,
		code,
		selfId,
		isHost: () => allIds(ch, selfId)[0] === selfId,
		sendPaddle: (y) => {
			void ch.send({ type: 'broadcast', event: 'paddle', payload: { id: selfId, y } });
		},
		sendState: (s) => {
			void ch.send({ type: 'broadcast', event: 'state', payload: s });
		},
		onPaddle: (fn) => {
			cb.paddle = fn;
		},
		onState: (fn) => {
			cb.state = fn;
		},
		onPeers: (fn) => {
			cb.peers = fn;
			fn(peersOf(ch, selfId));
		},
		leave: () => {
			void ch.untrack().then(() => ch.unsubscribe());
		},
	};
}

/** Auto-match into the first room with a free slot; null if multiplayer is off or all rooms are full. */
export async function joinRandom(name: string): Promise<Match | null> {
	const c = getClient();
	if (!c) return null;
	for (let slot = 0; slot < MAX_ROOMS; slot++) {
		const m = await openRoom(c, `pong-q-${slot}`, name, null);
		if (m) return m;
	}
	return null;
}

/** Join (or create) the room for a shared code; null if multiplayer is off or that room is already full. */
export async function joinByCode(name: string, code: string): Promise<Match | null> {
	const c = getClient();
	if (!c) return null;
	const norm = code.trim().toUpperCase();
	if (!norm) return null;
	return openRoom(c, `pong-c-${norm}`, name, norm);
}
