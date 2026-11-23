// One colour per studio app, the same on every admin page. The values live in admin.css (--app-<key>), light and
// dark; the order below is the order they were checked in for colour-blind separation.
export const APP_KEYS = ['petanque-game', 'dragon-gems', 'petanque-meet', 'nino-rush', 'petanque-scan'] as const;
export type AppKey = (typeof APP_KEYS)[number];

const MATCH: [RegExp, AppKey][] = [
	[/petanque ?game|petanquegame/, 'petanque-game'],
	[/dragon/, 'dragon-gems'],
	[/meet/, 'petanque-meet'],
	[/nino/, 'nino-rush'],
	[/scan/, 'petanque-scan'],
];

const plain = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The app behind a name, a domain, a bundle id or a catalogue id; null for anything else. */
export function appKey(...names: (string | null | undefined)[]): AppKey | null {
	for (const name of names) {
		if (!name) continue;
		const hit = MATCH.find(([re]) => re.test(plain(name)));
		if (hit) return hit[1];
	}
	return null;
}

/** The CSS colour of an app, grey when it is none of the studio's known apps. */
export function appColor(...names: (string | null | undefined)[]): string {
	const key = appKey(...names);
	return key ? `var(--app-${key})` : 'var(--app-other)';
}
