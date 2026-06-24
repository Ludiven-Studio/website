/**
 * DRIFT — multiplayer transport over Supabase Realtime (no game server).
 * Matchmaking probes a few fixed room channels and joins the first with < 4 players (auto-lobby).
 * Each room is a Realtime channel: Presence = the up-to-4 players (pseudo + colour), Broadcast =
 * car poses (~12 Hz) and best-lap updates. Ghosts only → no authoritative physics.
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../data/site';

export const MAX_PLAYERS = 4;
const MAX_ROOMS = 24;
const SYNC_WAIT_MS = 600;

export interface Peer {
	id: string;
	name: string;
	color: number;
	kind: string;
}
export interface PosMsg {
	id: string;
	x: number;
	z: number;
	heading: number;
}
export interface LapMsg {
	id: string;
	name: string;
	bestMs: number;
}

export interface Race {
	roomId: string;
	seed: number;
	selfId: string;
	sendPos: (p: { x: number; z: number; heading: number }) => void;
	sendLap: (bestMs: number) => void;
	onPos: (cb: (m: PosMsg) => void) => void;
	onLap: (cb: (m: LapMsg) => void) => void;
	onPeers: (cb: (peers: Peer[]) => void) => void;
	leave: () => void;
}

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
	if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
	if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 20 } } });
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
	kind: string;
}

const flattenPeers = (ch: RealtimeChannel, selfId: string): { peers: Peer[]; seed: number | null } => {
	const state = ch.presenceState<PresMeta>();
	const peers: Peer[] = [];
	let seed: number | null = null;
	for (const key of Object.keys(state)) {
		for (const meta of state[key]) {
			if (seed == null) seed = meta.seed;
			if (meta.id !== selfId) peers.push({ id: meta.id, name: meta.name, color: meta.color, kind: meta.kind });
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
	prefix: string; // room channel namespace (separates Libre vs Défi rooms)
	fixedSeed?: number; // forces the circuit (Défi du jour → same track for everyone)
	kind: string; // car archetype chosen by this player (shown on their ghost)
}

/** Auto-match into the first room with a free slot; returns null if multiplayer is off or all rooms are full. */
export async function joinRace(name: string, color: number, opts: JoinOpts): Promise<Race | null> {
	const c = getClient();
	if (!c) return null;
	const selfId = randomId();

	for (let slot = 0; slot < MAX_ROOMS; slot++) {
		const roomId = `${opts.prefix}-${slot}`;
		const ch = c.channel(roomId, { config: { presence: { key: selfId }, broadcast: { self: false } } });

		// Live callbacks (set by the component after join).
		const cb: { pos?: (m: PosMsg) => void; lap?: (m: LapMsg) => void; peers?: (p: Peer[]) => void } = {};
		ch.on('broadcast', { event: 'pos' }, ({ payload }) => cb.pos?.(payload as PosMsg));
		ch.on('broadcast', { event: 'lap' }, ({ payload }) => cb.lap?.(payload as LapMsg));
		ch.on('presence', { event: 'sync' }, () => cb.peers?.(flattenPeers(ch, selfId).peers));

		const { peers, seed: existingSeed } = await subscribeAndSync(ch, selfId);
		if (peers.length >= MAX_PLAYERS) {
			await ch.unsubscribe();
			continue; // room full → try the next slot
		}

		const seed = opts.fixedSeed ?? existingSeed ?? randomSeed();
		await ch.track({ id: selfId, name, color, seed, kind: opts.kind } satisfies PresMeta);

		return {
			roomId,
			seed,
			selfId,
			sendPos: (p) => {
				void ch.send({ type: 'broadcast', event: 'pos', payload: { id: selfId, ...p } });
			},
			sendLap: (bestMs) => {
				void ch.send({ type: 'broadcast', event: 'lap', payload: { id: selfId, name, bestMs } });
			},
			onPos: (fn) => {
				cb.pos = fn;
			},
			onLap: (fn) => {
				cb.lap = fn;
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
