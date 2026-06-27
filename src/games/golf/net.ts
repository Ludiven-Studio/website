/**
 * MINI-GOLF — multiplayer ghosts over Supabase Realtime (no game server).
 * Auto-matchmaking probes fixed room channels and joins the first with a free slot.
 * Each room is a Realtime channel: Presence = the up-to-5 players (pseudo + colour),
 * Broadcast = ball positions (~12 Hz) and score updates. Ghosts only → no collisions.
 * Mirrors src/games/drift/net.ts.
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../data/site';

export const MAX_PLAYERS = 5; // self + up to 4 ghosts
const MAX_ROOMS = 24;
const SYNC_WAIT_MS = 600;

export interface Peer {
	id: string;
	name: string;
	color: number;
}
export interface PosMsg {
	id: string;
	x: number;
	z: number;
}
export interface ScoreMsg {
	id: string;
	name: string;
	strokes: number;
	done: boolean;
	time: number; // seconds (final time when done; running time otherwise)
}

export interface Lobby {
	roomId: string;
	seed: number;
	selfId: string;
	sendPos: (p: { x: number; z: number }) => void;
	sendScore: (s: { strokes: number; done: boolean; time: number }) => void;
	onPos: (cb: (m: PosMsg) => void) => void;
	onScore: (cb: (m: ScoreMsg) => void) => void;
	onPeers: (cb: (peers: Peer[]) => void) => void;
	leave: () => void;
}

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
	if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
	if (!client)
		client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
			realtime: { params: { eventsPerSecond: 20 } },
		});
	return client;
}

export const multiplayerAvailable = (): boolean => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const randomId = (): string => `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31);

interface PresMeta {
	id: string;
	name: string;
	color: number;
	seed: number;
}

const flattenPeers = (ch: RealtimeChannel, selfId: string): { peers: Peer[]; seed: number | null } => {
	const state = ch.presenceState<PresMeta>();
	const peers: Peer[] = [];
	let seed: number | null = null;
	for (const key of Object.keys(state)) {
		for (const meta of state[key]) {
			if (seed == null) seed = meta.seed;
			if (meta.id !== selfId) peers.push({ id: meta.id, name: meta.name, color: meta.color });
		}
	}
	return { peers, seed };
};

/** Subscribe, wait for the first presence sync (or a short timeout), and report current presence. */
function subscribeAndSync(ch: RealtimeChannel, selfId: string): Promise<{ peers: Peer[]; seed: number | null }> {
	return new Promise((resolve) => {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			resolve(flattenPeers(ch, selfId));
		};
		ch.on('presence', { event: 'sync' }, finish);
		ch.subscribe((status) => {
			if (status === 'SUBSCRIBED') setTimeout(finish, SYNC_WAIT_MS);
			else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve({ peers: [], seed: null });
		});
	});
}

export interface JoinOpts {
	prefix: string; // room namespace (separates Libre vs Défi rooms)
	fixedSeed?: number; // forces the hole (Défi du jour → same hole for everyone)
}

/** Auto-match into the first room with a free slot; null if multiplayer is off or all full. */
export async function joinGolf(name: string, color: number, opts: JoinOpts): Promise<Lobby | null> {
	const c = getClient();
	if (!c) return null;
	const selfId = randomId();

	for (let slot = 0; slot < MAX_ROOMS; slot++) {
		const roomId = `${opts.prefix}-${slot}`;
		const ch = c.channel(roomId, { config: { presence: { key: selfId }, broadcast: { self: false } } });

		const cb: { pos?: (m: PosMsg) => void; score?: (m: ScoreMsg) => void; peers?: (p: Peer[]) => void } = {};
		ch.on('broadcast', { event: 'pos' }, ({ payload }) => cb.pos?.(payload as PosMsg));
		ch.on('broadcast', { event: 'score' }, ({ payload }) => cb.score?.(payload as ScoreMsg));
		ch.on('presence', { event: 'sync' }, () => cb.peers?.(flattenPeers(ch, selfId).peers));

		const { peers, seed: existingSeed } = await subscribeAndSync(ch, selfId);
		if (peers.length >= MAX_PLAYERS) {
			await ch.unsubscribe();
			continue; // room full → try the next slot
		}

		const seed = opts.fixedSeed ?? existingSeed ?? randomSeed();
		await ch.track({ id: selfId, name, color, seed } satisfies PresMeta);

		return {
			roomId,
			seed,
			selfId,
			sendPos: (p) => {
				void ch.send({ type: 'broadcast', event: 'pos', payload: { id: selfId, ...p } });
			},
			sendScore: (s) => {
				void ch.send({ type: 'broadcast', event: 'score', payload: { id: selfId, name, ...s } });
			},
			onPos: (fn) => {
				cb.pos = fn;
			},
			onScore: (fn) => {
				cb.score = fn;
			},
			onPeers: (fn) => {
				cb.peers = fn;
				fn(flattenPeers(ch, selfId).peers);
			},
			leave: () => {
				void ch.untrack().then(() => ch.unsubscribe());
			},
		};
	}
	return null; // every room is full
}
