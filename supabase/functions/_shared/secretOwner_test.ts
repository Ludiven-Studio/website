// deno test supabase/functions/_shared/secretOwner_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { secretRows } from './secretOwner.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const DEVICE = '33333333-3333-4333-8333-333333333333';
const accounts = new Set([A, B]);
const lookups: string[] = [];
const isAccount = (id: string) => {
	lookups.push(id);
	return Promise.resolve(accounts.has(id));
};

Deno.test("another account's game is not proved by its secret", async () => {
	const rows = [{ id: 'a1', organizer_id: A }, { id: 'old', organizer_id: DEVICE }];
	assertEquals((await secretRows(rows, B, isAccount)).map((r) => r.id), ['old']);
});

Deno.test("signed out, a secret proves only a game posted before accounts", async () => {
	const rows = [{ id: 'a1', organizer_id: A }, { id: 'old', organizer_id: DEVICE }];
	assertEquals((await secretRows(rows, null, isAccount)).map((r) => r.id), ['old']);
});

Deno.test('the caller keeps their own games, without a lookup', async () => {
	lookups.length = 0;
	assertEquals((await secretRows([{ id: 'a1', organizer_id: A }], A, isAccount)).length, 1);
	assertEquals(lookups, []);
});

Deno.test('each organizer is looked up once, and a row without one is dropped', async () => {
	lookups.length = 0;
	const rows = [{ id: '1', organizer_id: DEVICE }, { id: '2', organizer_id: DEVICE }, { id: '3', organizer_id: null }];
	assertEquals((await secretRows(rows, B, isAccount)).map((r) => r.id), ['1', '2']);
	assertEquals(lookups, [DEVICE]);
});
