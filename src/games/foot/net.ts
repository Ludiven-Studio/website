/**
 * COCOTTE FOOT — multiplayer transport over Supabase Realtime (no game server). 2 players/room.
 * Presence = the players; Broadcast = each cocotte's position (both) + the ball & score (host only).
 * Host is deterministic: the player with the smallest id (both sides agree, no double-host).
 * Matchmaking: joinRandom() probes fixed rooms; joinByCode() joins a shared invite-code room.
 * Mirrors src/games/pong/net.ts.
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../data/site';

export const MAX_PLAYERS = 2;
const MAX_ROOMS = 24;
const SYNC_WAIT_MS = 600;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I/L)

export interface FootPeer { id: string; name: string; }
export interface PosMsg { id: string; x: number; y: number; vx: number; vy: number; face: 1 | -1; }
export interface BallSync { x: number; y: number; vx: number; vy: number; l: number; r: number; ko: number; }

export interface Match {
	roomId: string;
	code: string | null; // shareable code when joined via a code, else null
	selfId: string;
	isHost: () => boolean;
	sendPos: (p: Omit<PosMsg, 'id'>) => void;
	sendBall: (b: BallSync) => void;
	onPos: (cb: (m: PosMsg) => void) => void;
	onBall: (cb: (b: BallSync) => void) => void;
	onPeers: (cb: (peers: FootPeer[]) => void) => void;
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

interface PresMeta { id: string; name: string; }

/** All player ids in the room (including self), sorted — smallest is the host. */
function allIds(ch: RealtimeChannel, selfId: string): string[] {
	const state = ch.presenceState<PresMeta>();
	const ids = new Set<string>([selfId]);
	for (const key of Object.keys(state)) for (const m of state[key]) ids.add(m.id);
	return [...ids].sort();
}

function peersOf(ch: RealtimeChannel, selfId: string): FootPeer[] {
	const state = ch.presenceState<PresMeta>();
	const peers: FootPeer[] = [];
	for (const key of Object.keys(state)) for (const m of state[key]) if (m.id !== selfId) peers.push({ id: m.id, name: m.name });
	return peers;
}

/** Subscribe, wait for the first presence sync (or a short timeout), and report current peers. */
function subscribeAndSync(ch: RealtimeChannel, selfId: string): Promise<FootPeer[]> {
	return new Promise((resolve) => {
		let done = false;
		const finish = () => { if (done) return; done = true; resolve(peersOf(ch, selfId)); };
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

	const cb: { pos?: (m: PosMsg) => void; ball?: (b: BallSync) => void; peers?: (p: FootPeer[]) => void } = {};
	ch.on('broadcast', { event: 'pos' }, ({ payload }) => cb.pos?.(payload as PosMsg));
	ch.on('broadcast', { event: 'ball' }, ({ payload }) => cb.ball?.(payload as BallSync));
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
		sendPos: (p) => { void ch.send({ type: 'broadcast', event: 'pos', payload: { id: selfId, ...p } }); },
		sendBall: (b) => { void ch.send({ type: 'broadcast', event: 'ball', payload: b }); },
		onPos: (fn) => { cb.pos = fn; },
		onBall: (fn) => { cb.ball = fn; },
		onPeers: (fn) => { cb.peers = fn; fn(peersOf(ch, selfId)); },
		leave: () => { void ch.untrack().then(() => ch.unsubscribe()); },
	};
}

/** Auto-match into the first room with a free slot; null if multiplayer is off or all rooms are full. */
export async function joinRandom(name: string): Promise<Match | null> {
	const c = getClient();
	if (!c) return null;
	for (let slot = 0; slot < MAX_ROOMS; slot++) {
		const m = await openRoom(c, `foot-q-${slot}`, name, null);
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
	return openRoom(c, `foot-c-${norm}`, name, norm);
}
