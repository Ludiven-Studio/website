// deno test supabase/functions/_shared/createOnce_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { CREATE_KEY_INDEX, createKeyOf, isTwinInsert, TOURNAMENT_CREATE_KEY_INDEX } from './createOnce.ts';

const KEY = '3F2B8C1A-0D4E-4B6F-9A7C-5E1D2C3B4A59';

Deno.test('a create key is a uuid, read the same whatever its case', () => {
	assertEquals(createKeyOf({ createKey: KEY }), KEY.toLowerCase());
	assertEquals(createKeyOf({}), null);
	assertEquals(createKeyOf({ createKey: '' }), null);
	assertEquals(createKeyOf({ createKey: 'not-a-key' }), null);
	assertEquals(createKeyOf({ createKey: 42 }), null);
});

Deno.test('only a clash on the key index is a twin request', () => {
	const clash = { code: '23505', message: `duplicate key value violates unique constraint "${CREATE_KEY_INDEX}"` };
	assertEquals(isTwinInsert(clash), true);
	assertEquals(isTwinInsert({ code: '23505', message: 'duplicate key value violates unique constraint "meetup_events_pkey"' }), false);
	assertEquals(isTwinInsert({ code: '23503', message: CREATE_KEY_INDEX }), false);
	assertEquals(isTwinInsert(null), false);
	assertEquals(isTwinInsert(undefined), false);
});

Deno.test("a tournament's twin clashes on its own index, not the games' one", () => {
	const clash = { code: '23505', message: `duplicate key value violates unique constraint "${TOURNAMENT_CREATE_KEY_INDEX}"` };
	assertEquals(isTwinInsert(clash, TOURNAMENT_CREATE_KEY_INDEX), true);
	assertEquals(isTwinInsert(clash), false);
	const game = { code: '23505', message: `duplicate key value violates unique constraint "${CREATE_KEY_INDEX}"` };
	assertEquals(isTwinInsert(game, TOURNAMENT_CREATE_KEY_INDEX), false);
});
