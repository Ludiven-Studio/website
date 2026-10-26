// Deleting a studio account. One Supabase Auth user signs in to Pétanque Meet, the site
// and the apps, so deleting it from any of them erases every app's data, then the user.
// app_saves goes with the user (on delete cascade).

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.117.0';
import { dropPosters } from './posters.ts';

/** Apple requires it in the apps. Open games are cancelled, not deleted, so signed-up
 *  players still learn they are off. A ban outlives the account: meetup_bans keeps only
 *  the id, which is no personal data on its own. The first steps are best effort, as they were in meetups;
 *  it throws when the follows, the claims or the user itself cannot be deleted. */
export async function deleteAccount(db: SupabaseClient, uid: string): Promise<void> {
	const nowIso = new Date().toISOString();
	await db.from('meetup_events').update({ status: 'cancelled', hidden: true, updated_at: nowIso })
		.eq('organizer_id', uid).eq('status', 'open');
	await db.from('meetup_events').update({ organizer_name: 'Compte supprimé' }).eq('organizer_id', uid);
	await db.from('meetup_signups').delete().eq('player_id', uid);
	await db.from('meetup_reports').delete().eq('reporter_id', uid);
	// Tournaments have no signups to warn: they go, posters with them.
	const { data: tours } = await db.from('meetup_tournaments').select('poster_path').eq('organizer_id', uid);
	await dropPosters(db, (tours ?? []).map((t) => t.poster_path as string | null));
	await db.from('meetup_tournaments').delete().eq('organizer_id', uid);
	await db.from('meetup_tournament_reports').delete().eq('reporter_id', uid);
	const { error: fErr } = await db.from('meetup_tournament_follows').delete().eq('player_id', uid);
	if (fErr) throw fErr;
	// A claim holds the name and phone the claimer typed, and no foreign key removes it.
	const { error: cErr } = await db.from('meetup_tournament_claims').delete().eq('player_id', uid);
	if (cErr) throw cErr;
	const { error } = await db.auth.admin.deleteUser(uid);
	if (error) throw error;
}
