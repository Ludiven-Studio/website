// deno test supabase/functions/_shared/presence_test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { BeatLimiter, clientIp, isSession, parseSeek } from './presence.ts';

const LIMITS = { sessionsPerIp: 3, sessionWindowMs: 10 * 60_000, beatsPerMinute: 5 };
const id = (n: number): string => `0000000${n}-1111-4222-8333-444444444444`.slice(-36);

Deno.test('a session is a random v4 id, as the game makes it', () => {
	assert(isSession('3f2b8c1e-9d4a-4b7e-a1c2-5e6f7a8b9c0d'));
	assert(isSession('3F2B8C1E-9D4A-4B7E-B1C2-5E6F7A8B9C0D'));
	assert(!isSession('3f2b8c1e-9d4a-1b7e-a1c2-5e6f7a8b9c0d'), 'version 1');
	assert(!isSession('3f2b8c1e-9d4a-4b7e-71c2-5e6f7a8b9c0d'), 'not the RFC variant');
	assert(!isSession('00000000-0000-0000-0000-000000000000'));
	assert(!isSession(''));
	assert(!isSession('3f2b8c1e-9d4a-4b7e-a1c2-5e6f7a8b9c0d '), 'nothing around it');
});

Deno.test("the caller's address is the first forwarded one", () => {
	assertEquals(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })), '203.0.113.7');
	assertEquals(clientIp(new Headers({ 'cf-connecting-ip': ' 198.51.100.2 ' })), '198.51.100.2');
	assertEquals(clientIp(new Headers()), '');
});

Deno.test('one address brings so many sessions in a window, its own ones still beating', () => {
	let t = 0;
	const limiter = new BeatLimiter({ ...LIMITS, beatsPerMinute: 100 }, () => t);
	for (let i = 1; i <= 3; i++) assert(limiter.allow('203.0.113.7', id(i)));
	assert(!limiter.allow('203.0.113.7', id(4)), 'a fourth new session is refused');
	assert(limiter.allow('203.0.113.7', id(2)), 'a session already heard beats on');
	assert(limiter.allow('198.51.100.2', id(4)), 'another address is not held back');
	t += 10 * 60_000;
	assert(limiter.allow('203.0.113.7', id(4)), 'the window over, new sessions come in again');
});

Deno.test('one address sends so many beats a minute', () => {
	let t = 0;
	const limiter = new BeatLimiter(LIMITS, () => t);
	for (let i = 0; i < 5; i++) assert(limiter.allow('203.0.113.7', id(1)));
	assert(!limiter.allow('203.0.113.7', id(1)), 'the sixth beat in a minute is refused');
	t += 60_000;
	assert(limiter.allow('203.0.113.7', id(1)), 'a minute later it beats again');
});

Deno.test('nothing about an address stays once its window is over', () => {
	let t = 0;
	const limiter = new BeatLimiter(LIMITS, () => t);
	limiter.allow('203.0.113.7', id(1));
	assertEquals(limiter.size, 1);
	t += 10 * 60_000;
	limiter.allow('198.51.100.2', id(2));
	assertEquals(limiter.size, 1, 'only the address just heard');
});

Deno.test('a search carries a clean name, a format and a session to join', () => {
	assertEquals(parseSeek({ nick: ' Bébert ', players: 1, game: 'aB3-x_9' }), { nick: 'Bébert', players: 1, game: 'aB3-x_9' });
	assertEquals(parseSeek({ nick: '<b>Marcel</b>\u0007', players: 2, game: 'g1' })?.nick, 'bMarcel/b', 'no rich text, no control');
	assertEquals(parseSeek({ nick: 'x'.repeat(40), players: 3, game: 'g1' })?.nick.length, 20);
	assertEquals(parseSeek({ nick: 'Bébert', players: 4, game: 'g1' }), null, 'one to three a side');
	assertEquals(parseSeek({ nick: '   ', players: 1, game: 'g1' }), null, 'a name');
	assertEquals(parseSeek({ nick: 'Bébert', players: 1, game: 'a b' }), null, 'a session id');
	assertEquals(parseSeek(undefined), null);
	assertEquals(parseSeek('Bébert'), null);
});
