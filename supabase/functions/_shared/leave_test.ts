// deno test supabase/functions/_shared/leave_test.ts
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.117.0';
import { leaveEvent } from './leave.ts';

/** The one chain leaveEvent calls, answering `error`, and what it was asked. */
function fakeDb(error: unknown) {
	const asked: unknown[] = [];
	const chain = {
		delete: () => chain,
		eq: (k: string, v: unknown) => (asked.push([k, v]), chain),
		in: (k: string, v: unknown) => (asked.push([k, v]), Promise.resolve({ error })),
	};
	const db = { from: (t: string) => (asked.push(t), chain) } as unknown as SupabaseClient;
	return { db, asked };
}

Deno.test("the caller's signups on that game are deleted", async () => {
	const { db, asked } = fakeDb(null);
	await leaveEvent(db, 'e1', ['me', 'device']);
	assertEquals(asked, ['meetup_signups', ['event_id', 'e1'], ['player_id', ['me', 'device']]]);
});

Deno.test('a delete the database refuses is an error, never a quiet ok', async () => {
	const { db } = fakeDb({ code: '57014', message: 'canceling statement due to statement timeout' });
	await assertRejects(() => leaveEvent(db, 'e1', ['me']));
});
