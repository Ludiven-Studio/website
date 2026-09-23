// Client for the `meetups` Edge Function (/rencontres). Reads go through it too:
// the meetup_* tables have RLS on and no policies, so there is no PostgREST path
// to them — deliberately, because meetup_events carries the organizer `secret`.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../data/site';
import { MAX_ACTIVE_EVENTS } from './meetupRules';
import type { Format, MeetupEvent, MeetupSignup, MeetupSpot, Role } from './meetupRules';

export const meetupsEnabled = (): boolean => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
	const res = await fetch(`${SUPABASE_URL}/functions/v1/meetups`, {
		method: 'POST',
		headers: {
			apikey: SUPABASE_ANON_KEY,
			Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ action, ...payload }),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
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

/** `secret` comes back exactly once. Keep it or the event is orphaned. */
export const createMeetup = (input: EventInput): Promise<{ id: string; secret: string }> =>
	call('create_event', input as unknown as Record<string, unknown>);

export const updateMeetup = (eventId: string, secret: string, patch: Partial<EventInput>): Promise<{ ok: true }> =>
	call('update_event', { eventId, secret, ...patch });

export const cancelMeetup = (eventId: string, secret: string): Promise<{ ok: true }> =>
	call('cancel_event', { eventId, secret });

/** Refused with 409 once anyone has signed up — cancel then, so the link keeps
 *  telling them the game is off. */
export const deleteMeetup = (eventId: string, secret: string): Promise<{ ok: true }> =>
	call('delete_event', { eventId, secret });

export const joinMeetup = (eventId: string, playerId: string, playerName: string, seats: number, role: Role): Promise<{ ok: true }> =>
	call('join', { eventId, playerId, playerName, seats, role });

export const leaveMeetup = (eventId: string, playerId: string): Promise<{ ok: true }> =>
	call('leave', { eventId, playerId });

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

export const forgetSecret = (eventId: string): void => {
	try {
		const { [eventId]: _gone, ...rest } = readSecrets();
		localStorage.setItem(SECRETS_KEY, JSON.stringify(rest));
	} catch { /* private mode */ }
};

/** « Mes parties ». The device is the only place that knows which games are mine,
 *  so the list is a lookup by secret — the server never indexes by browser. */
export const myMeetups = async (playerId: string): Promise<{ events: MeetupEvent[]; active: number; max: number }> => {
	const items = Object.entries(readSecrets()).map(([eventId, secret]) => ({ eventId, secret }));
	// Nothing to look up and nothing to show: skip the round trip on every first visit.
	if (!items.length) return { events: [], active: 0, max: MAX_ACTIVE_EVENTS };
	return call('my_events', { playerId, items });
};

export const savedName = (): string => {
	try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
};

export const saveName = (name: string): void => {
	try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode */ }
};
