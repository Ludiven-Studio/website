/**
 * PETANQUE — 2-player transport over Supabase Realtime (no game server). Mirrors billard/net.ts:
 * both peers derive the terrain seed from the room id, the host (smallest id) is side 0 and throws
 * the first jack, and only THROWS travel — never per-frame state.
 *
 * One deliberate difference from billard, and the reason this file is not a copy. Billard trusts
 * pure lockstep, which assumes sin/cos/sqrt agree bit-for-bit across JS engines. That is not
 * guaranteed, and pétanque runs far longer per throw (a boule flies, bounces, then rolls for
 * seconds over a hashed terrain), so any divergence has time to grow. Here the host is authoritative
 * at rest: once the boules stop it broadcasts their positions AND the resulting rules state, and the
 * guest adopts both. That is one message per throw, about 7 boules of floats — negligible next to
 * the aim stream, and it makes drift structurally impossible rather than merely unlikely.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../data/site';
import type { Match13 } from './rules13';

export const MAX_PLAYERS = 2;
const MAX_ROOMS = 24;
const SYNC_WAIT_MS = 600;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I/L)

export interface PetanquePeer { id: string; name: string; }

/** A thrown boule: velocity only. Angles would need sin/cos, which peers may round differently. */
export interface ThrowMsg { vx: number; vy: number; vz: number; jack: boolean; }

/** The jack placed by hand after an illegal throw. */
export interface PlaceMsg { x: number; y: number; }

/**
 * Live aim, streamed while the opponent draws back so the other screen can show their arc forming.
 * Cosmetic only — never touches the simulation. `live` false means they let go or are not aiming.
 */
export interface AimMsg { yaw: number; power: number; loft: number; live: boolean; }

/**
 * Host ruling at rest. `bs` is flat [x, y, z, live] per boule in simulation order, so the guest can
 * adopt positions without trusting its own float path; `match` is the rules state the host derived.
 */
export interface SyncMsg { bs: number[]; match: Match13; }

export interface PetanqueMatchNet {
	roomId: string;
	code: string | null; // shareable code when joined via a code, else null
	selfId: string;
	isHost: () => boolean;
	sendThrow: (t: ThrowMsg) => void;
	onThrow: (cb: (t: ThrowMsg) => void) => void;
	sendPlace: (p: PlaceMsg) => void;
	onPlace: (cb: (p: PlaceMsg) => void) => void;
	sendAim: (a: AimMsg) => void;
	onAim: (cb: (a: AimMsg) => void) => void;
	sendSync: (s: SyncMsg) => void;
	onSync: (cb: (s: SyncMsg) => void) => void;
	onPeers: (cb: (peers: PetanquePeer[]) => void) => void;
	leave: () => void;
}

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
	if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
	// 20/s: the aim stream sends ~12 messages a second on top of the odd throw.
	if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 20 } } });
	return client;
}

export const multiplayerAvailable = (): boolean => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const makeCode = (): string => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

/** Deterministic terrain seed shared by both peers (FNV-1a over the room id). */
export function seedFromRoom(roomId: string): number {
	let h = 2166136261;
	for (let i = 0; i < roomId.length; i++) { h ^= roomId.charCodeAt(i); h = Math.imul(h, 16777619); }
	return h >>> 0;
}

const randomId = (): string => `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;

interface PresMeta { id: string; name: string; }

/** All player ids in the room (including self), sorted — smallest is the host / side 0. */
function allIds(ch: RealtimeChannel, selfId: string): string[] {
	const state = ch.presenceState<PresMeta>();
	const ids = new Set<string>([selfId]);
	for (const key of Object.keys(state)) for (const m of state[key]) ids.add(m.id);
	return [...ids].sort();
}

function peersOf(ch: RealtimeChannel, selfId: string): PetanquePeer[] {
	const state = ch.presenceState<PresMeta>();
	const peers: PetanquePeer[] = [];
	for (const key of Object.keys(state)) for (const m of state[key]) if (m.id !== selfId) peers.push({ id: m.id, name: m.name });
	return peers;
}

function subscribeAndSync(ch: RealtimeChannel, selfId: string): Promise<PetanquePeer[]> {
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

interface Callbacks {
	throw?: (t: ThrowMsg) => void;
	place?: (p: PlaceMsg) => void;
	aim?: (a: AimMsg) => void;
	sync?: (s: SyncMsg) => void;
	peers?: (p: PetanquePeer[]) => void;
}

async function openRoom(c: SupabaseClient, roomId: string, name: string, code: string | null): Promise<PetanqueMatchNet | null> {
	const selfId = randomId();
	const ch = c.channel(roomId, { config: { presence: { key: selfId }, broadcast: { self: false } } });
	const cb: Callbacks = {};
	ch.on('broadcast', { event: 'throw' }, ({ payload }) => cb.throw?.(payload as ThrowMsg));
	ch.on('broadcast', { event: 'place' }, ({ payload }) => cb.place?.(payload as PlaceMsg));
	ch.on('broadcast', { event: 'aim' }, ({ payload }) => cb.aim?.(payload as AimMsg));
	ch.on('broadcast', { event: 'sync' }, ({ payload }) => cb.sync?.(payload as SyncMsg));
	ch.on('presence', { event: 'sync' }, () => cb.peers?.(peersOf(ch, selfId)));

	const peers = await subscribeAndSync(ch, selfId);
	if (peers.length >= MAX_PLAYERS) { await ch.unsubscribe(); return null; } // room full
	await ch.track({ id: selfId, name } satisfies PresMeta);

	return {
		roomId,
		code,
		selfId,
		isHost: () => allIds(ch, selfId)[0] === selfId,
		sendThrow: (t) => { void ch.send({ type: 'broadcast', event: 'throw', payload: t }); },
		onThrow: (fn) => { cb.throw = fn; },
		sendPlace: (p) => { void ch.send({ type: 'broadcast', event: 'place', payload: p }); },
		onPlace: (fn) => { cb.place = fn; },
		sendAim: (a) => { void ch.send({ type: 'broadcast', event: 'aim', payload: a }); },
		onAim: (fn) => { cb.aim = fn; },
		sendSync: (s) => { void ch.send({ type: 'broadcast', event: 'sync', payload: s }); },
		onSync: (fn) => { cb.sync = fn; },
		onPeers: (fn) => { cb.peers = fn; fn(peersOf(ch, selfId)); },
		leave: () => { void ch.untrack().then(() => ch.unsubscribe()); },
	};
}

/* ---------- the lobby: who is around ---------- */

/** What a player is doing: in the online menu, waiting in quick match, waiting for a friend, playing. */
export type LobbyState = 'browse' | 'wait' | 'friend' | 'play';
/** Counts include the local player; `wait` is how many sit in quick match, ready to be joined. */
export interface LobbyCounts { total: number; wait: number; play: number; selfWaiting: boolean; }
export interface Lobby { set: (s: LobbyState) => void; leave: () => void; }

/**
 * One shared presence channel for everyone with the online tab open (not the whole page: each
 * connection counts against the Realtime quota, and players vs the AI need no count). Only presence,
 * no broadcast: a join or a state change is one small message.
 */
export function joinLobby(onCounts: (c: LobbyCounts) => void): Lobby | null {
	const c = getClient();
	if (!c) return null;
	const selfId = randomId();
	const ch = c.channel('petanque-lobby', { config: { presence: { key: selfId } } });
	let state: LobbyState = 'browse';
	let ready = false;
	const count = (): void => {
		const all = ch.presenceState<{ state: LobbyState }>();
		const n: LobbyCounts = { total: 0, wait: 0, play: 0, selfWaiting: state === 'wait' };
		for (const key of Object.keys(all)) {
			const s = all[key][all[key].length - 1]?.state;
			n.total++;
			if (s === 'wait') n.wait++;
			if (s === 'play') n.play++;
		}
		onCounts(n);
	};
	ch.on('presence', { event: 'sync' }, count);
	ch.subscribe((status) => {
		if (status !== 'SUBSCRIBED') return;
		ready = true;
		void ch.track({ state });
	});
	return {
		set: (s) => { if (s === state) return; state = s; if (ready) void ch.track({ state }); },
		leave: () => { void ch.untrack().then(() => ch.unsubscribe()); },
	};
}

/** First-connected matchmaking: the first room with a free slot. */
export async function joinRandom(name: string): Promise<PetanqueMatchNet | null> {
	const c = getClient();
	if (!c) return null;
	for (let slot = 0; slot < MAX_ROOMS; slot++) {
		const m = await openRoom(c, `petanque-q-${slot}`, name, null);
		if (m) return m;
	}
	return null;
}

/** Join (or create) the room for a shared friend code. */
export async function joinByCode(name: string, code: string): Promise<PetanqueMatchNet | null> {
	const c = getClient();
	if (!c) return null;
	const norm = code.trim().toUpperCase();
	if (!norm) return null;
	return openRoom(c, `petanque-c-${norm}`, name, norm);
}
