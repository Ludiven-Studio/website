// Tournament posters in storage: the pending bucket (before moderation) and the public one.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.117.0';

/** The map cards' small copy, stored next to the poster. */
export const thumbOf = (path: string): string => path.replace(/\.(jpg|png)$/, '_t.jpg');

/** Removes posters and their thumbnails from both buckets; a missing object is not an error. */
export async function dropPosters(db: SupabaseClient, paths: (string | null | undefined)[]): Promise<void> {
	const list = paths.filter((p): p is string => Boolean(p)).flatMap((p) => [p, thumbOf(p)]);
	if (!list.length) return;
	await db.storage.from('posters-pending').remove(list);
	await db.storage.from('posters').remove(list);
}
