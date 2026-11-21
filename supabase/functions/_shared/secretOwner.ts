// A game's secret proves ownership only of a game posted before accounts (organizer = a device id).
// A game posted with an account belongs to that account alone: on a shared phone, the secrets the
// app keeps from another account must not list nor manage its games.

/** True when the id is a Supabase account, false for an old device id. */
export type AccountLookup = (id: string) => Promise<boolean>;

/** The rows a secret may show or act on: the caller's own, and games posted before accounts. */
export async function secretRows<T extends { organizer_id?: unknown }>(
	rows: T[], uid: string | null, isAccount: AccountLookup,
): Promise<T[]> {
	const known = new Map<string, boolean>();
	const kept: T[] = [];
	for (const row of rows) {
		const organizer = String(row.organizer_id ?? '');
		if (uid && organizer === uid) {
			kept.push(row);
			continue;
		}
		if (!organizer) continue;
		if (!known.has(organizer)) known.set(organizer, await isAccount(organizer));
		if (!known.get(organizer)) kept.push(row);
	}
	return kept;
}
