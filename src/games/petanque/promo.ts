// The app the mini-game advertises: Pétanque Game wherever its store is out, Pétanque Scan elsewhere
// (iPhone, until the App Store link is in data/petanqueGame.ts).
import type { GameLang } from '../../lib/gameLang';

/**
 * What the page tells the game about Pétanque Game, out of data/petanqueGame.ts. A prop rather than an
 * import: importing that file put its page copy in the game's bundle (+12 kB).
 */
export type GameAd = { play?: string; apple?: string; download: Record<GameLang, string>; icon: string };
export type Platform = 'android' | 'ios' | 'desktop';
export type PromoSpot = 'band' | 'end';

/** iPadOS reports a Mac UA, so touch points are what tell it from a desktop. */
export function platformOf(ua: string, touchPoints: number): Platform {
	if (/iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ios';
	if (/Android/.test(ua)) return 'android';
	return 'desktop';
}

/** The store that has Pétanque Game for this platform, or null when it is not out there yet. */
export function gameStore(platform: Platform, ad: GameAd | undefined): 'Google Play' | 'App Store' | null {
	if (!ad) return null;
	if (platform === 'ios') return ad.apple ? 'App Store' : null;
	if (platform === 'android') return ad.play ? 'Google Play' : null;
	return ad.play ? 'Google Play' : ad.apple ? 'App Store' : null;
}

/**
 * Where the Pétanque Game ad leads, or null when the game is not out for this platform. A phone goes
 * straight to its store, a computer to the download page. The Play link carries a referrer, so the
 * Play Console counts the installs that came from each spot of the mini-game.
 */
export function gameHref(platform: Platform, lang: GameLang, spot: PromoSpot, ad: GameAd | undefined): string | null {
	if (!ad || !gameStore(platform, ad)) return null;
	if (platform === 'ios') return ad.apple ?? null;
	if (platform === 'desktop') return ad.download[lang];
	const referrer = `utm_source=ludiven-studio.fr&utm_medium=mini-jeu&utm_campaign=petanque&utm_content=${spot}`;
	return `${ad.play}&hl=${lang}&referrer=${encodeURIComponent(referrer)}`;
}
