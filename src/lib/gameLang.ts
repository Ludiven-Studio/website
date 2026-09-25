/* The language of a game's own UI: French, English or Spanish. Opt-in per game — the shared
   components take an optional `lang` and stay French without it, so the other games are untouched.
   The page chrome around the island (fullscreen button, tagline) follows through LANG_EVENT. */

export type GameLang = 'fr' | 'en' | 'es';

export const GAME_LANGS: readonly GameLang[] = ['fr', 'en', 'es'];

/** Fired on `document` with `detail: GameLang` whenever a game switches language. */
export const LANG_EVENT = 'ludiven:lang';

const isLang = (v: unknown): v is GameLang => v === 'fr' || v === 'en' || v === 'es';

/** The language the player picked by hand, if any. */
export function storedGameLang(key: string): GameLang | null {
	try {
		const saved = localStorage.getItem(key);
		return isLang(saved) ? saved : null;
	} catch {
		return null; // private mode
	}
}

/** The stored choice, else the browser's first known language, else English. */
export function detectGameLang(key: string): GameLang {
	const saved = storedGameLang(key);
	if (saved) return saved;
	const wanted = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];
	for (const l of wanted) {
		const base = l?.slice(0, 2).toLowerCase();
		if (isLang(base)) return base;
	}
	return 'en';
}

export function saveGameLang(key: string, lang: GameLang): void {
	try {
		localStorage.setItem(key, lang);
	} catch {
		/* private mode */
	}
	announceGameLang(lang);
}

/** Tells the page chrome which language the game is in. */
export function announceGameLang(lang: GameLang): void {
	if (typeof document === 'undefined') return;
	document.documentElement.lang = lang;
	document.dispatchEvent(new CustomEvent<GameLang>(LANG_EVENT, { detail: lang }));
}

/** The next language in the FR → EN → ES cycle. */
export const nextGameLang = (lang: GameLang): GameLang => GAME_LANGS[(GAME_LANGS.indexOf(lang) + 1) % GAME_LANGS.length];

/** Picks the entry for `lang`. */
export const tr = <T>(lang: GameLang, v: Record<GameLang, T>): T => v[lang];
