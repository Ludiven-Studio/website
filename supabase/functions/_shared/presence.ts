// app-presence's checks, apart so they are tested without a database (presence_test.ts).
// Anyone can call the function with the app's public key, so nothing here is a secret: it makes a forged
// count costly. A session counts from its second beat (the table), a random v4 id only, and each IP may
// bring so many sessions and beats, kept in the function's memory only, never stored.

/** A random id as the game makes it (C# Guid.NewGuid: version 4, RFC 4122 variant). */
export const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isSession = (s: string): boolean => SESSION_RE.test(s);

/** The caller's address as Supabase's edge passes it: the first of x-forwarded-for, else cf-connecting-ip. */
export function clientIp(headers: Headers): string {
	const forwarded = headers.get('x-forwarded-for');
	if (forwarded) return forwarded.split(',')[0].trim();
	return headers.get('cf-connecting-ip')?.trim() ?? '';
}

export interface Limits {
	/** New sessions one IP may bring in a window: a club's wifi or a carrier's NAT puts many phones behind one. */
	sessionsPerIp: number;
	sessionWindowMs: number;
	/** Beats one IP may send a minute, its sessions together (a phone beats once a minute, every 15 s while it looks for an opponent). */
	beatsPerMinute: number;
}

export const LIMITS: Limits = { sessionsPerIp: 20, sessionWindowMs: 10 * 60_000, beatsPerMinute: 120 };

/**
 * Per-IP limits in memory: what this function's instance has heard in the last minutes, nothing written.
 * Each instance keeps its own; a burst spread over many instances gets through a few times over, still bounded.
 */
export class BeatLimiter {
	private readonly seen = new Map<string, { sessions: Map<string, number>; beats: number[] }>();

	constructor(private readonly limits: Limits = LIMITS, private readonly now: () => number = Date.now) {}

	/** True when this beat may be counted; a refused one changes nothing. */
	allow(ip: string, session: string): boolean {
		const t = this.now();
		this.prune(t);
		const key = ip || 'unknown';
		let entry = this.seen.get(key);
		if (!entry) {
			entry = { sessions: new Map(), beats: [] };
			this.seen.set(key, entry);
		}
		if (entry.beats.length >= this.limits.beatsPerMinute) return false;
		if (!entry.sessions.has(session) && entry.sessions.size >= this.limits.sessionsPerIp) return false;
		entry.sessions.set(session, t);
		entry.beats.push(t);
		return true;
	}

	/** Addresses kept in memory, for the tests: none stays once its window is over. */
	get size(): number {
		return this.seen.size;
	}

	private prune(t: number): void {
		for (const [ip, entry] of this.seen) {
			entry.beats = entry.beats.filter((b) => t - b < 60_000);
			for (const [s, at] of entry.sessions) if (t - at >= this.limits.sessionWindowMs) entry.sessions.delete(s);
			if (entry.beats.length === 0 && entry.sessions.size === 0) this.seen.delete(ip);
		}
	}
}

/** A search for an opponent, as a beat carries it: the name played under, the format, the Unity session to join. */
export interface Seek {
	nick: string;
	players: number;
	game: string;
}

/** Unity's session ids: letters, digits, dashes. */
const GAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The beat's search, or null for none or a malformed one. The name is shown to other players: kept to 20
 * characters, without control characters or the angle brackets of the game's rich text. The game still passes
 * it through its own name filter before showing it.
 */
export function parseSeek(raw: unknown): Seek | null {
	if (raw === null || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	const nick = String(r.nick ?? '').replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim().slice(0, 20).trim();
	const players = Number(r.players);
	const game = String(r.game ?? '');
	if (!nick || !Number.isInteger(players) || players < 1 || players > 3 || !GAME_RE.test(game)) return null;
	return { nick, players, game };
}
