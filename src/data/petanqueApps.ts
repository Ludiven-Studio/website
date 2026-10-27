// What the shared product page (PetanqueLanding) and download page (ScannerDownload) read of a pétanque app.
// Pétanque Scanner is the default; Pétanque Game passes its own (data/petanqueGame.ts).

import type { iconPaths } from '../components/IconPaths';
import * as scanner from './petanqueScanner';

export type LandingLang = scanner.LandingLang;
type IconName = keyof typeof iconPaths;
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** The landing's copy. The Scanner fills every field; another app may leave a section out. */
export interface AppCopy
	extends Optional<
		Omit<scanner.LandingCopy, 'badges'>,
		| 'photoTitle'
		| 'photoBody'
		| 'photoNote'
		| 'limitsTitle'
		| 'limitsIntro'
		| 'limits'
		| 'makingOfTitle'
		| 'makingOfBody'
		| 'makingOfCta'
		| 'makingOfHref'
	> {
	/** A store with no link yet shows its badge faded, tagged `soonShort`. */
	badges: { play?: string; playAlt: string; apple?: string; appleAlt: string };
	/** « Coming soon on Google Play and the App Store », under badges that have no link yet. */
	soon?: string;
	soonShort?: string;
	/** What each store visual shows, in `screens` order (the Scanner's are decorative). */
	screensAlt?: string[];
}

export interface AppDownloadCopy extends Optional<scanner.DownloadCopy, 'videoTitle'> {
	/** More links under the closing block, such as the web version. */
	links?: { label: string; href: string }[];
}

export interface PetanqueApp {
	id: 'scanner' | 'game';
	name: string;
	/** schema.org applicationCategory. */
	category: string;
	copy: Record<LandingLang, AppCopy>;
	download: Record<LandingLang, AppDownloadCopy>;
	landingPaths: Record<LandingLang, string>;
	downloadPaths: Record<LandingLang, string>;
	heroes: Record<LandingLang, string>;
	ogImages: Record<LandingLang, string>;
	screens: Record<LandingLang, string[]>;
	/** Pixel size of the store visuals in `screens`. */
	shot: { width: number; height: number };
	video?: (lang: LandingLang) => { src: string; poster: string };
	/** The download page's three points: which features, with which icons. */
	points: { features: number[]; icons: IconName[] };
}

export const SCANNER: PetanqueApp = {
	id: 'scanner',
	name: scanner.APP_NAME,
	category: 'SportsApplication',
	copy: scanner.copy,
	download: scanner.download,
	landingPaths: scanner.LANDING_PATHS,
	downloadPaths: scanner.DOWNLOAD_PATHS,
	heroes: scanner.HEROES,
	ogImages: scanner.OG_IMAGES,
	screens: scanner.SCREENS,
	shot: { width: 560, height: 1212 },
	video: (lang) => ({ src: `/assets/petanque-ar/video-${lang}.mp4`, poster: `/assets/petanque-ar/video-${lang}.webp` }),
	points: { features: [1, 2, 3], icons: ['paper-plane-tilt', 'mobile', 'crown'] },
};
