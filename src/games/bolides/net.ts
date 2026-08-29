/**
 * BOLIDES — multiplayer transport over Supabase Realtime (no game server). Up to 4 drivers
 * per room; empty seats are held by bots. Presence = the roster, and its sorted id list is
 * also the seat order, so every client agrees on who drives which car without asking.
 * Host = smallest id. It owns the grid (trails, captures, kills, scores) and broadcasts a
 * `sim` tick; everyone else owns only their own car and broadcasts a `pose`.
 * Matchmaking mirrors src/games/foot/net.ts: joinRandom() probes fixed rooms, joinByCode()
 * joins a shared invite-code room.
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../data/site';
import type { NetPose, SimMsg } from './engine';
import { DEFAULT_CAR } from './cars';

export const MAX_PLAYERS = 4;
const MAX_ROOMS = 16;
const SYNC_WAIT_MS = 600;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I/L)

export interface BolidePeer { id: string; name: string; playing: boolean }

/** A driver's own car, sent by whoever owns it. */
export interface PoseMsg { i: string; p: NetPose }
/** Host -> everyone: the race starts now. `ids` freezes the seat order for the whole race,
 *  `cars` the bolide each seat drives (parallel to `ids`; missing entries = the default car). */
export interface GoMsg { seed: number; diff: number; ids: string[]; cars?: string[] }

/** Seat -> bolide id, tolerant of an older host, a short list or a garbage payload. */
export function goCars(go: GoMsg, seats: number): string[] {
	const src = Array.isArray(go.cars) ? go.cars : [];
	return Array.from({ length: seats }, (_, i) => (typeof src[i] === 'string' ? src[i] : DEFAULT_CAR));
}
/** Host -> everyone while waiting: seconds left on the auto-start, or -1 for "still alone". */
export interface LobbyMsg { in: number }

export interface Match {
	roomId: string;
	code: string | null; // shareable code when joined via a code, else null
	selfId: string;
	isHost: () => boolean;
	/** Every driver id in the room, sorted. Index in this list = seat = car id − 1. */
	ids: () => string[];
	peers: () => BolidePeer[];
	setPlaying: (v: boolean) => void;
	sendPose: (m: PoseMsg) => void;
	sendSim: (m: SimMsg) => void;
	sendGo: (m: GoMsg) => void;
	sendLobby: (m: LobbyMsg) => void;
	onPose: (cb: (m: PoseMsg) => void) => void;
	onSim: (cb: (m: SimMsg) => void) => void;
	onGo: (cb: (m: GoMsg) => void) => void;
	onLobby: (cb: (m: LobbyMsg) => void) => void;
	onPeers: (cb: (peers: BolidePeer[]) => void) => void;
	leave: () => void;
}

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
	if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
	if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 40 } } });
	return client;
}

export const multiplayerAvailable = (): boolean => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const makeCode = (): string => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

const randomId = (): string => `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;

interface PresMeta { id: string; name: string; playing: boolean }

function peersOf(ch: RealtimeChannel, selfId: string): BolidePeer[] {
	const state = ch.presenceState<PresMeta>();
	const peers: BolidePeer[] = [];
	for (const key of Object.keys(state)) {
		for (const m of state[key]) if (m.id !== selfId) peers.push({ id: m.id, name: m.name, playing: !!m.playing });
	}
	peers.sort((a, b) => (a.id < b.id ? -1 : 1));
	return peers;
}

/** Subscribe, wait for the first presence sync (or a short timeout), and report current peers. */
function subscribeAndSync(ch: RealtimeChannel, selfId: string): Promise<BolidePeer[]> {
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

/** Subscribe to a room, join its presence, and build the Match handle.
 *  Returns null when the room can't take us: full, or (for quick match) already racing. */
async function openRoom(c: SupabaseClient, roomId: string, name: string, code: string | null, skipBusy: boolean): Promise<Match | null> {
	const selfId = randomId();
	const ch = c.channel(roomId, { config: { presence: { key: selfId }, broadcast: { self: false } } });

	const cb: {
		pose?: (m: PoseMsg) => void; sim?: (m: SimMsg) => void; go?: (m: GoMsg) => void;
		lobby?: (m: LobbyMsg) => void; peers?: (p: BolidePeer[]) => void;
	} = {};
	ch.on('broadcast', { event: 'pose' }, ({ payload }) => cb.pose?.(payload as PoseMsg));
	ch.on('broadcast', { event: 'sim' }, ({ payload }) => cb.sim?.(payload as SimMsg));
	ch.on('broadcast', { event: 'go' }, ({ payload }) => cb.go?.(payload as GoMsg));
	ch.on('broadcast', { event: 'lobby' }, ({ payload }) => cb.lobby?.(payload as LobbyMsg));
	ch.on('presence', { event: 'sync' }, () => cb.peers?.(peersOf(ch, selfId)));

	const found = await subscribeAndSync(ch, selfId);
	if (found.length >= MAX_PLAYERS || (skipBusy && found.some((p) => p.playing))) {
		await ch.unsubscribe();
		return null;
	}
	let playing = false;
	await ch.track({ id: selfId, name, playing } satisfies PresMeta);

	const ids = () => [selfId, ...peersOf(ch, selfId).map((p) => p.id)].sort();
	const send = (event: string, payload: unknown) => { void ch.send({ type: 'broadcast', event, payload }); };

	return {
		roomId,
		code,
		selfId,
		isHost: () => ids()[0] === selfId,
		ids,
		peers: () => peersOf(ch, selfId),
		setPlaying: (v) => { if (v === playing) return; playing = v; void ch.track({ id: selfId, name, playing } satisfies PresMeta); },
		sendPose: (m) => send('pose', m),
		sendSim: (m) => send('sim', m),
		sendGo: (m) => send('go', m),
		sendLobby: (m) => send('lobby', m),
		onPose: (fn) => { cb.pose = fn; },
		onSim: (fn) => { cb.sim = fn; },
		onGo: (fn) => { cb.go = fn; },
		onLobby: (fn) => { cb.lobby = fn; },
		onPeers: (fn) => { cb.peers = fn; fn(peersOf(ch, selfId)); },
		leave: () => { void ch.untrack().then(() => ch.unsubscribe()); },
	};
}

/** Auto-match into the first room that is neither full nor already racing.
 *  Probing in order means everyone piles into the same room, which is what fills a grid. */
export async function joinRandom(name: string): Promise<Match | null> {
	const c = getClient();
	if (!c) return null;
	for (let slot = 0; slot < MAX_ROOMS; slot++) {
		const m = await openRoom(c, `bolides-q-${slot}`, name, null, true);
		if (m) return m;
	}
	return null;
}

/** Join (or create) the room for a shared code; null if multiplayer is off or that room is full. */
export async function joinByCode(name: string, code: string): Promise<Match | null> {
	const c = getClient();
	if (!c) return null;
	const norm = code.trim().toUpperCase();
	if (!norm) return null;
	return openRoom(c, `bolides-c-${norm}`, name, norm, false);
}
