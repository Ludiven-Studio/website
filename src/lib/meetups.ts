// Client for the `meetups` Edge Function (/rencontres). Reads go through it too:
// the meetup_* tables have RLS on and no policies, so there is no PostgREST path
// to them — deliberately, because meetup_events carries the organizer `secret`.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../data/site';
import { MAX_ACTIVE_EVENTS } from './meetupRules';
import { accessToken } from './meetupAuth';
import type { Format, MeetupEvent, MeetupSignup, MeetupSpot, ReportReason, Role } from './meetupRules';

export const meetupsEnabled = (): boolean => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** A 401: the action needs an account. The page answers with the login sheet. */
export class LoginRequired extends Error {}

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
	// The account when there is one; legacy playerId / secret fields still ride in
	// the body for games and signups made before accounts.
	const token = await accessToken();
	const res = await fetch(`${SUPABASE_URL}/functions/v1/meetups`, {
		method: 'POST',
		headers: {
			apikey: SUPABASE_ANON_KEY,
			Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ action, ...payload }),
	});
	const data = await res.json().catch(() => ({}));
	const reason = (data as { error?: string }).error ?? `HTTP ${res.status}`;
	if (res.status === 401) throw new LoginRequired(reason);
	if (!res.ok) throw new Error(reason);
	return data as T;
}

export interface EventInput {
	playerId: string;
	spotId?: string;
	lat?: number;
	lng?: number;
	startsAt: string;
	endsAt: string;
	format: Format;
	playersNeeded: number;
	roleNeeded: Role;
	organizerName: string;
	organizerSeats: number;
}

/** Everything the page needs, in one invocation. */
export const listMeetups = (): Promise<{ events: MeetupEvent[]; spots: MeetupSpot[] }> => call('list');

/** The ?e= link. Returns cancelled and finished events too — a signed-up player
 *  has no other way of learning the game is off. */
export const getMeetup = (eventId: string, playerId: string, secret?: string): Promise<{ event: MeetupEvent; signups: MeetupSignup[]; isOrganizer: boolean }> =>
	call('get_event', { eventId, playerId, secret });

/** `secret` comes back exactly once. The account owns the game; the secret is a
 *  local fallback. */
export const createMeetup = (input: EventInput): Promise<{ id: string; secret: string }> =>
	call('create_event', input as unknown as Record<string, unknown>);

export const updateMeetup = (eventId: string, secret: string | undefined, patch: Partial<EventInput>): Promise<{ ok: true }> =>
	call('update_event', { eventId, secret, ...patch });

export const cancelMeetup = (eventId: string, secret: string | undefined): Promise<{ ok: true }> =>
	call('cancel_event', { eventId, secret });

/** Refused with 409 once anyone has signed up — cancel then, so the link keeps
 *  telling them the game is off. */
export const deleteMeetup = (eventId: string, secret: string | undefined): Promise<{ ok: true }> =>
	call('delete_event', { eventId, secret });

export const joinMeetup = (eventId: string, playerId: string, playerName: string, seats: number, role: Role): Promise<{ ok: true }> =>
	call('join', { eventId, playerId, playerName, seats, role });

export const leaveMeetup = (eventId: string, playerId: string): Promise<{ ok: true }> =>
	call('leave', { eventId, playerId });

/** 'no_show' is only taken from a signed-up player once the game started. */
export const reportMeetup = (eventId: string, playerId: string, reason: ReportReason): Promise<{ ok: true }> =>
	call('report', { eventId, playerId, reason });

/** The organizer flags one signed-up player who never came. */
export const reportSignup = (eventId: string, secret: string | undefined, signupId: string): Promise<{ ok: true }> =>
	call('report_signup', { eventId, secret, signupId });

/** Apple requires it. Open games are cancelled server side; the caller signs out. */
export const deleteAccount = (): Promise<{ ok: true }> => call('delete_account');

// ---- moderation, behind the per-game token of the report mail ----

export interface ModSignup { id: string; player_name: string; seats: number; no_shows: number; }
export interface ModReport { reason: ReportReason; created_at: string; }
export type ModAction = 'restore' | 'remove' | 'ban_organizer' | 'ban_signup';

export const modGet = (eventId: string, token: string): Promise<{ event: MeetupEvent; signups: ModSignup[]; reports: ModReport[] }> =>
	call('mod_get', { eventId, token });

export const moderate = (eventId: string, token: string, what: ModAction, signupId?: string): Promise<{ ok: true }> =>
	call('moderate', { eventId, token, do: what, signupId });

// ---- muted organizers, kept on the device ----

const MUTED_KEY = 'ludiven-meetup-muted';

export const readMuted = (): string[] => {
	try {
		const v = JSON.parse(localStorage.getItem(MUTED_KEY) ?? '[]') as unknown;
		return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [];
	} catch { return []; }
};

export const saveMuted = (tags: readonly string[]): void => {
	try { localStorage.setItem(MUTED_KEY, JSON.stringify(tags)); } catch { /* private mode */ }
};

// ---- organizer secrets, kept on the device ----

const SECRETS_KEY = 'ludiven-meetup-secrets';
const NAME_KEY = 'ludiven-meetup-name';

type SecretMap = Record<string, string>;

const readSecrets = (): SecretMap => {
	try { return JSON.parse(localStorage.getItem(SECRETS_KEY) ?? '{}') as SecretMap; } catch { return {}; }
};

export const rememberSecret = (eventId: string, secret: string): void => {
	try { localStorage.setItem(SECRETS_KEY, JSON.stringify({ ...readSecrets(), [eventId]: secret })); } catch { /* private mode */ }
};

/** The ?k= in the URL wins: it is how a cleared browser gets back in. */
export const secretFor = (eventId: string, fromUrl?: string | null): string | undefined =>
	fromUrl || readSecrets()[eventId];

export const hasSecret = (eventId: string): boolean => Boolean(readSecrets()[eventId]);

export const forgetSecret = (eventId: string): void => {
	try {
		const { [eventId]: _gone, ...rest } = readSecrets();
		localStorage.setItem(SECRETS_KEY, JSON.stringify(rest));
	} catch { /* private mode */ }
};

/** « Mes parties »: the account's games, plus the ones this device posted before
 *  accounts, looked up by secret. */
export const myMeetups = async (playerId: string): Promise<{ events: MeetupEvent[]; active: number; max: number }> => {
	const items = Object.entries(readSecrets()).map(([eventId, secret]) => ({ eventId, secret }));
	// Nothing to look up and nothing to show: skip the round trip on every first visit.
	if (!items.length && !(await accessToken())) return { events: [], active: 0, max: MAX_ACTIVE_EVENTS };
	return call('my_events', { playerId, items });
};

export const savedName = (): string => {
	try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
};

export const saveName = (name: string): void => {
	try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode */ }
};
