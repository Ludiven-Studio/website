import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.117.0';

/** Drop the caller's signups on a game. A refused delete throws: the app must not read "left". */
export async function leaveEvent(db: SupabaseClient, eventId: string, playerIds: string[]): Promise<void> {
	const { error } = await db.from('meetup_signups').delete().eq('event_id', eventId).in('player_id', playerIds);
	if (error) throw error;
}
