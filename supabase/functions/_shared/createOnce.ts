// One game per create key: a phone that lost the answer and sends again gets its first game back.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Unique index behind the key, see migration 20261117100000_meetup_create_key.sql. */
export const CREATE_KEY_INDEX = 'meetup_events_create_key_idx';

/** The key sent with a new game, or null: older apps send none, and anything else is ignored. */
export function createKeyOf(body: Record<string, unknown>): string | null {
	const key = body.createKey;
	return typeof key === 'string' && UUID_RE.test(key) ? key.toLowerCase() : null;
}

/** The insert lost a race to a twin request carrying the same key. */
export function isTwinInsert(error: { code?: string; message?: string } | null | undefined): boolean {
	return error?.code === '23505' && String(error.message ?? '').includes(CREATE_KEY_INDEX);
}
