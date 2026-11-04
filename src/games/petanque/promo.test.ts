import { describe, it, expect } from 'vitest';
import { platformOf, gameStore, gameHref, type GameAd } from './promo';
import { DOWNLOAD_PATHS, ICON, STORES } from '../../data/petanqueGame';

const PLAY = 'https://play.google.com/store/apps/details?id=com.ludivenstudio.petanquegame';
const APPLE = 'https://apps.apple.com/app/id123';
const DOWNLOAD = { fr: '/fr/dl/', en: '/en/dl/', es: '/es/dl/' };
const ad = (stores: { play?: string; apple?: string }): GameAd => ({ ...stores, download: DOWNLOAD, icon: '/icon.webp' });
const ANDROID_ONLY = ad({ play: PLAY });
const BOTH = ad({ play: PLAY, apple: APPLE });
const NONE = ad({});

const UA = {
	android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
	iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
	ipadOld: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
	mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
	windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

describe('platformOf', () => {
	it('tells phones from computers', () => {
		expect(platformOf(UA.android, 5)).toBe('android');
		expect(platformOf(UA.iphone, 5)).toBe('ios');
		expect(platformOf(UA.ipadOld, 5)).toBe('ios');
		expect(platformOf(UA.windows, 0)).toBe('desktop');
		expect(platformOf(UA.mac, 0)).toBe('desktop');
	});

	it('takes a Mac with a touch screen for an iPad', () => {
		expect(platformOf(UA.mac, 5)).toBe('ios');
	});
});

describe('gameHref', () => {
	it('sends Android straight to Google Play, in the game language, with the spot in the referrer', () => {
		const url = new URL(gameHref('android', 'es', 'band', ANDROID_ONLY)!);
		expect(`${url.origin}${url.pathname}`).toBe('https://play.google.com/store/apps/details');
		expect(url.searchParams.get('id')).toBe('com.ludivenstudio.petanquegame');
		expect(url.searchParams.get('hl')).toBe('es');
		const ref = new URLSearchParams(url.searchParams.get('referrer')!);
		expect(ref.get('utm_source')).toBe('ludiven-studio.fr');
		expect(ref.get('utm_content')).toBe('band');
		const end = new URL(gameHref('android', 'fr', 'end', ANDROID_ONLY)!);
		expect(new URLSearchParams(end.searchParams.get('referrer')!).get('utm_content')).toBe('end');
	});

	it('sends a computer to the download page of its language', () => {
		expect(gameHref('desktop', 'fr', 'band', ANDROID_ONLY)).toBe('/fr/dl/');
		expect(gameHref('desktop', 'en', 'end', ANDROID_ONLY)).toBe('/en/dl/');
	});

	it('has no ad for an iPhone until the game is on the App Store', () => {
		expect(gameHref('ios', 'fr', 'band', ANDROID_ONLY)).toBeNull();
		expect(gameStore('ios', ANDROID_ONLY)).toBeNull();
		expect(gameHref('ios', 'fr', 'band', BOTH)).toBe(APPLE);
		expect(gameStore('ios', BOTH)).toBe('App Store');
	});

	it('has no ad before the game is out, or when the page gives none', () => {
		for (const p of ['android', 'ios', 'desktop'] as const) {
			expect(gameHref(p, 'fr', 'band', NONE)).toBeNull();
			expect(gameStore(p, NONE)).toBeNull();
			expect(gameHref(p, 'fr', 'band', undefined)).toBeNull();
		}
	});

	it('names the store the link leads to', () => {
		expect(gameStore('android', ANDROID_ONLY)).toBe('Google Play');
		expect(gameStore('desktop', ANDROID_ONLY)).toBe('Google Play');
		expect(gameStore('desktop', ad({ apple: APPLE }))).toBe('App Store');
		expect(gameStore('android', ad({ apple: APPLE }))).toBeNull();
	});

	it('works on what the page passes, the data of the download pages', () => {
		const real: GameAd = { ...STORES, download: DOWNLOAD_PATHS, icon: ICON };
		expect(gameHref('desktop', 'fr', 'band', real)).toBe('/petanque-game/telecharger/');
		expect(gameHref('android', 'fr', 'band', real)).toMatch(/^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.ludivenstudio\.petanquegame&hl=fr&referrer=/);
	});
});
