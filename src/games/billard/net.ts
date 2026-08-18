/**
 * BILLARD 8-ball — 2-player transport over Supabase Realtime (no game server). Because the
 * engine is DETERMINISTIC (no Math.random in stepBalls), the two peers stay in lockstep by
 * replaying the SAME shots on the SAME rack — we only sync each shot, not ball positions.
 * Both derive the rack seed from the room id; the host (smallest id) is player 0 and breaks.
 * Matchmaking mirrors foot/pong: joinRandom() first-connected, joinByCode() a friend code.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../data/site';

export const MAX_PLAYERS = 2;
const MAX_ROOMS = 24;
const SYNC_WAIT_MS = 600;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I/L)

export interface BilliardPeer { id: string; name: string; }
/** A fired shot: cue velocity + the cue's position at fire (covers ball-in-hand + keeps peers exact). */
export interface ShotMsg { vx: number; vy: number; px: number; py: number; }
/**
 * Live aim, streamed while the opponent draws back so the other screen can show their cue stick.
 * Cosmetic only — never touches the simulation; `live` false means they let go or are still
 * placing the ball in hand (move the white ball, hide the stick).
 */
export interface AimMsg { px: number; py: number; dx: number; dy: number; power: number; live: boolean; }

export interface BilliardMatch {
	roomId: string;
	code: string | null; // shareable code when joined via a code, else null
	selfId: string;
	isHost: () => boolean;
	sendShot: (s: ShotMsg) => void;
	onShot: (cb: (s: ShotMsg) => void) => void;
	sendAim: (a: AimMsg) => void;
	onAim: (cb: (a: AimMsg) => void) => void;
	onPeers: (cb: (peers: BilliardPeer[]) => void) => void;
	leave: () => void;
}

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
	if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
	// 20/s: the aim stream sends ~12 messages a second on top of the odd shot.
	if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 20 } } });
	return client;
}

export const multiplayerAvailable = (): boolean => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const makeCode = (): string => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

/** Deterministic rack seed shared by both peers (FNV-1a over the room id). */
export function seedFromRoom(roomId: string): number {
	let h = 2166136261;
	for (let i = 0; i < roomId.length; i++) { h ^= roomId.charCodeAt(i); h = Math.imul(h, 16777619); }
	return h >>> 0;
}

const randomId = (): string => `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;

interface PresMeta { id: string; name: string; }

/** All player ids in the room (including self), sorted — smallest is the host / player 0. */
function allIds(ch: RealtimeChannel, selfId: string): string[] {
	const state = ch.presenceState<PresMeta>();
	const ids = new Set<string>([selfId]);
	for (const key of Object.keys(state)) for (const m of state[key]) ids.add(m.id);
	return [...ids].sort();
}

function peersOf(ch: RealtimeChannel, selfId: string): BilliardPeer[] {
	const state = ch.presenceState<PresMeta>();
	const peers: BilliardPeer[] = [];
	for (const key of Object.keys(state)) for (const m of state[key]) if (m.id !== selfId) peers.push({ id: m.id, name: m.name });
	return peers;
}

function subscribeAndSync(ch: RealtimeChannel, selfId: string): Promise<BilliardPeer[]> {
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

async function openRoom(c: SupabaseClient, roomId: string, name: string, code: string | null): Promise<BilliardMatch | null> {
	const selfId = randomId();
	const ch = c.channel(roomId, { config: { presence: { key: selfId }, broadcast: { self: false } } });
	const cb: { shot?: (s: ShotMsg) => void; aim?: (a: AimMsg) => void; peers?: (p: BilliardPeer[]) => void } = {};
	ch.on('broadcast', { event: 'shot' }, ({ payload }) => cb.shot?.(payload as ShotMsg));
	ch.on('broadcast', { event: 'aim' }, ({ payload }) => cb.aim?.(payload as AimMsg));
	ch.on('presence', { event: 'sync' }, () => cb.peers?.(peersOf(ch, selfId)));

	const peers = await subscribeAndSync(ch, selfId);
	if (peers.length >= MAX_PLAYERS) { await ch.unsubscribe(); return null; } // room full
	await ch.track({ id: selfId, name } satisfies PresMeta);

	return {
		roomId,
		code,
		selfId,
		isHost: () => allIds(ch, selfId)[0] === selfId,
		sendShot: (s) => { void ch.send({ type: 'broadcast', event: 'shot', payload: s }); },
		onShot: (fn) => { cb.shot = fn; },
		sendAim: (a) => { void ch.send({ type: 'broadcast', event: 'aim', payload: a }); },
		onAim: (fn) => { cb.aim = fn; },
		onPeers: (fn) => { cb.peers = fn; fn(peersOf(ch, selfId)); },
		leave: () => { void ch.untrack().then(() => ch.unsubscribe()); },
	};
}

/** First-connected matchmaking: the first room with a free slot. */
export async function joinRandom(name: string): Promise<BilliardMatch | null> {
	const c = getClient();
	if (!c) return null;
	for (let slot = 0; slot < MAX_ROOMS; slot++) {
		const m = await openRoom(c, `billard-q-${slot}`, name, null);
		if (m) return m;
	}
	return null;
}

/** Join (or create) the room for a shared friend code. */
export async function joinByCode(name: string, code: string): Promise<BilliardMatch | null> {
	const c = getClient();
	if (!c) return null;
	const norm = code.trim().toUpperCase();
	if (!norm) return null;
	return openRoom(c, `billard-c-${norm}`, name, norm);
}
