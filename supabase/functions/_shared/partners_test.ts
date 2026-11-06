// deno test supabase/functions/_shared/partners_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { cleanPartnerNote, cleanPartnerPhone, findContest, missing, partnerFields, shapePartnerSearch, teamSize } from './partners.ts';

const NOW = Date.parse('2026-11-06T09:00:00Z');
const CONTESTS = [
	{ starts_at: '2026-11-08T08:00:00.000Z', format: 'doublette', category: 'open', entry_fee_cents: 500 },
	{ starts_at: '2026-11-08T13:00:00.000Z', format: 'triplette', category: 'open', entry_fee_cents: 500 },
	{ starts_at: '2026-11-09T08:00:00.000Z', format: 'tete-a-tete', category: 'open', entry_fee_cents: null },
];
const never = () => false;
const body = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
	poster: 'solo', contestStartsAt: '2026-11-08T08:00:00Z', format: 'doublette', category: 'open',
	level: 'confirme', note: 'Tireur, du club de Bourgoin.', phone: '06 12 34 56 78', ...patch,
});

Deno.test('a team format needs one or two more players', () => {
	assertEquals(teamSize('triplette'), 3);
	assertEquals(missing('doublette', 'solo'), 1);
	assertEquals(missing('doublette', 'pair'), 0);
	assertEquals(missing('triplette', 'solo'), 2);
	assertEquals(missing('triplette', 'pair'), 1);
	assertEquals(missing('melee', 'solo'), 0);
});

Deno.test('the note is one short line without link nor markup', () => {
	assertEquals(cleanPartnerNote('  Tireur,\r\ndispo   le matin. ', never), 'Tireur, dispo le matin.');
	assertEquals(cleanPartnerNote(undefined, never), '');
	assertEquals(cleanPartnerNote('a'.repeat(200), never)?.length, 120);
	assertEquals(cleanPartnerNote('voir www.monclub.fr', never), null);
	assertEquals(cleanPartnerNote('<b>urgent</b>', never), null);
	assertEquals(cleanPartnerNote('gros mot', () => true), null);
});

Deno.test('a search names one of the tournament contests', () => {
	assertEquals(findContest(CONTESTS, '2026-11-08T13:00:00Z', 'triplette', 'open')?.format, 'triplette');
	assertEquals(findContest(CONTESTS, '2026-11-08T13:00:00Z', 'doublette', 'open'), null);
	assertEquals(findContest(CONTESTS, 'demain', 'doublette', 'open'), null);
	assertEquals(findContest(null, '2026-11-08T08:00:00Z', 'doublette', 'open'), null);
});

Deno.test('a valid search becomes its row fields', () => {
	const f = partnerFields(body(), CONTESTS, NOW, never);
	assertEquals(f, {
		poster: 'solo', level: 'confirme', note: 'Tireur, du club de Bourgoin.', phone: '+33612345678',
		contest_starts_at: '2026-11-08T08:00:00.000Z', format: 'doublette', category: 'open',
	});
});

Deno.test('refusals come in the order the app checks them', () => {
	assertEquals(partnerFields(body({ format: 'tete-a-tete', contestStartsAt: '2026-11-09T08:00:00Z' }), CONTESTS, NOW, never),
		'Choisis une épreuve en équipe de ce concours.');
	assertEquals(partnerFields(body(), CONTESTS, Date.parse('2026-11-08T08:00:00Z'), never), 'Cette épreuve a déjà commencé.');
	assertEquals(partnerFields(body({ poster: 'pair' }), CONTESTS, NOW, never), 'Ton équipe est déjà complète pour cette épreuve.');
	assertEquals(partnerFields(body({ level: 'pro' }), CONTESTS, NOW, never), 'Niveau inconnu.');
	assertEquals(partnerFields(body({ note: 'https://x.io' }), CONTESTS, NOW, never), 'Mot invalide (120 caractères, sans lien).');
	assertEquals(partnerFields(body({ phone: '12 34' }), CONTESTS, NOW, never),
		'Donne un numéro de téléphone pour qu’on te joigne : français, ou avec son indicatif (+32…).');
	assertEquals(typeof partnerFields(body({ poster: 'pair', contestStartsAt: '2026-11-08T13:00:00Z', format: 'triplette' }),
		CONTESTS, NOW, never), 'object');
});

Deno.test('the shape never carries the number nor the author id', () => {
	const row = {
		id: 's1', tournament_id: 't1', player_id: 'p1', first_name: 'Camille', poster: 'solo',
		contest_starts_at: '2026-11-08T08:00:00Z', format: 'doublette', category: 'open', level: 'loisir', note: '',
		phone: '0612345678',
	};
	const seen = shapePartnerSearch(row, 'p2');
	assertEquals('phone' in seen || 'player_id' in seen || 'contacts' in seen, false);
	assertEquals(seen.mine, false);
	assertEquals(shapePartnerSearch(row, 'p1', 3).contacts, 3);
	assertEquals(shapePartnerSearch(row, null).mine, false);
});

Deno.test('a number is stored with its country code', () => {
	assertEquals(cleanPartnerPhone('06 12 34 56 78'), '+33612345678');
	assertEquals(cleanPartnerPhone('+33 6 12 34 56 78'), '+33612345678');
	assertEquals(cleanPartnerPhone('0032 470 12 34 56'), '+32470123456');
	assertEquals(cleanPartnerPhone('+49 151 2345 6789'), '+4915123456789');
	assertEquals(cleanPartnerPhone('+34 612-345-678'), '+34612345678');
	assertEquals(cleanPartnerPhone('+44 20 7946 0958'), '+442079460958');
	assertEquals(cleanPartnerPhone(''), null);
	assertEquals(cleanPartnerPhone('612345678'), null);
	assertEquals(cleanPartnerPhone('+0612345678'), null);
	assertEquals(cleanPartnerPhone('+1234567890123456'), null);
});
