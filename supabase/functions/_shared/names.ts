// The names players show each other on the leaderboards: insults and slurs refused in the five EFIGS languages
// (French, English, Spanish, German, Italian). Plain TypeScript with no Deno import, so the site imports it too
// (src/lib/names.ts); the Dragon's Gems app ports it (Core/Names.cs, checked against these lists by its parity
// fixtures). Not a wall: a guard against the obvious.
//
// A name is folded first: lower case, no accents, the usual digit and symbol swaps (0→o, 1→i, 3→e, 4/@→a, 5/$→s).
// Short words match whole words only ("con" must not refuse "Constance", "cul" not "Hercule", "arsch" not
// "Marsch"); stems long enough to be unambiguous match anywhere once the separators are gone ("f.u.c.k").

export const MAX_NAME = 20;

export const BAD_WORDS = [
	// French
	'con', 'cons', 'conne', 'connes', 'pd', 'pede', 'tg', 'ntm', 'fdp', 'pute', 'putes', 'bite', 'bites', 'zob',
	'nazi', 'nazis', 'negre', 'negres', 'bougnoule', 'youpin', 'gouine', 'tapette', 'merde', 'cul', 'teub', 'chier',
	'nique', 'niquer',
	// English
	'ass', 'fag', 'fags', 'cock', 'cocks', 'cum', 'rape', 'rapist', 'slut', 'sluts', 'tits', 'twat', 'piss', 'kkk',
	'heil',
	// Spanish
	'puta', 'putas', 'puto', 'putos', 'culo', 'cono', 'polla', 'mierda', 'verga', 'zorra', 'marica', 'capullo',
	'joto',
	// German
	'arsch', 'fick', 'hure', 'huren', 'nutte', 'kacke', 'titten', 'pimmel', 'spast', 'neger', 'mongo',
	// Italian
	'troia', 'figa', 'fica', 'merda', 'minchia', 'frocio', 'froci',
];

export const BAD_STEMS = [
	// French
	'connard', 'connass', 'encul', 'salope', 'salaud', 'enfoire', 'batard', 'niquetamere', 'hitler', 'pedophil',
	'couille', 'branleur', 'putain', 'trouduc', 'bougnoul',
	// English
	'fuck', 'shit', 'bitch', 'nigger', 'nigga', 'asshole', 'cunt', 'whore', 'faggot', 'motherf', 'bastard',
	'dickhead', 'retarded', 'pussy', 'penis', 'vagina', 'porn', 'wanker',
	// Spanish
	'gilipollas', 'cabron', 'hijodeputa', 'hijoputa', 'maricon', 'pendejo', 'chingad', 'chingar', 'follar',
	'cojon', 'putamadre',
	// German
	'arschloch', 'ficken', 'fotze', 'wichser', 'hurensohn', 'schlampe', 'schwuchtel', 'scheiss', 'missgeburt',
	'judensau', 'untermensch',
	// Italian
	'vaffanculo', 'stronz', 'puttan', 'coglion', 'cazzo', 'porcodio', 'dioporco', 'porcamadonna',
];

/** The name as the lists read it: lower case, no accents, the usual digit and symbol swaps. */
export function foldName(name: string): string {
	return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
		.replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's');
}

export function isOffensive(name: string): boolean {
	const words = foldName(name).split(/[^a-z]+/).filter(Boolean);
	if (words.some((w) => BAD_WORDS.includes(w))) return true;
	const joined = words.join('');
	return BAD_STEMS.some((b) => joined.includes(b));
}

/** The name to show, or '' when it may not be shown (an insult, a link or a tag): the player is then « Anonyme ». */
export function cleanPlayerName(raw: unknown): string {
	const s = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
	if (/[<>]/.test(s) || /https?:\/\/|www\.|\.(com|fr|net|org|io)\b/i.test(s)) return '';
	return isOffensive(s) ? '' : s;
}
