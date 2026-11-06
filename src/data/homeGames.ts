// The studio's games and apps on the homepage stage, in five languages. Each pitch is the app's Google Play short
// description (its repo's docs/store.md); its page and store links come from its own data file, so the stage follows
// the app pages. The stage art is text-free (cut from each app's Marketing/ key art), as the stage writes the name.
import * as dragonsGems from './dragonsGems';
import * as petanqueGame from './petanqueGame';
import { MEET_DOWNLOAD, MEET_STORES } from './petanqueMeet';
import * as scanner from './petanqueScanner';
import { ICON as NINO_ICON } from './ninoRush';

export type Lang = 'fr' | 'en' | 'es' | 'de' | 'it';
export type PerLang = Record<Lang, string>;

export const LANGS: Lang[] = ['fr', 'en', 'es', 'de', 'it'];
const each = (f: (l: Lang) => string): PerLang => ({ fr: f('fr'), en: f('en'), es: f('es'), de: f('de'), it: f('it') });

/** French wants a no-break space before : ? ! ; */
const NBSP = String.fromCharCode(160);
export const fr = (s: string): string => s.replace(/ ([:?!;])/g, `${NBSP}$1`);

export type Kind = 'new' | 'soon' | 'live';

export interface HomeGame {
	id: string;
	name: string;
	/** The name on a phone's thumbnail, when the full one is too long. */
	short?: string;
	kind: Kind;
	/** A game or an app: picks the words of the main button. */
	type: 'game' | 'app';
	icon: string;
	/** Text-free art; `desk` and `phone` are the object-positions of its two frames. */
	art: { src: PerLang; w: number; h: number; desk: string; phone: string };
	kicker: PerLang;
	pitch: PerLang;
	/** Its page on the site; none while the game has no public page. */
	href?: PerLang;
	/** Its store pages; a store left out shows its badge faded under « coming soon ». */
	play?: PerLang;
	apple?: PerLang;
	/** The same game in the browser: French pages only, as the site's games are in French. */
	web?: string;
	/** A testers' build to download (a French page). */
	test?: string;
}

const withHl = (url: string | undefined): PerLang | undefined => (url ? each((l) => `${url}&hl=${l}`) : undefined);
const same = (s: string): PerLang => each(() => s);

const MOBILE_GAME: PerLang = { fr: 'jeu mobile', en: 'mobile game', es: 'juego móvil', de: 'Handyspiel', it: 'gioco mobile' };
const NEW: PerLang = { fr: 'Nouveau', en: 'New', es: 'Nuevo', de: 'Neu', it: 'Novità' };
export const SOON: PerLang = { fr: 'Bientôt', en: 'Coming soon', es: 'Próximamente', de: 'Demnächst', it: 'Prossimamente' };
const PETANQUE: PerLang = { fr: 'pétanque', en: 'pétanque', es: 'petanca', de: 'Pétanque', it: 'pétanque' };
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const HOME_GAMES: HomeGame[] = [
	{
		id: 'dragons-gems',
		name: dragonsGems.APP_NAME,
		short: 'Dragon Gems',
		kind: 'new',
		type: 'game',
		icon: dragonsGems.ICON,
		art: { src: same('/assets/home/stage-dragons-gems.webp'), w: 891, h: 901, desk: '50% 50%', phone: '50% 55%' },
		kicker: each((l) => `${NEW[l]} · ${MOBILE_GAME[l]}`),
		pitch: {
			fr: 'Glisse le plateau, fais exploser les gemmes et remplis le trésor du bébé dragon.',
			en: "Slide the board, blast the gems and fill the baby dragon's treasure.",
			es: 'Desliza el tablero, haz explotar las gemas y llena el tesoro del dragón bebé.',
			de: 'Wisch das Spielfeld, spreng die Edelsteine und füll den Schatz des Babydrachen.',
			it: 'Fai scorrere le gemme, falle esplodere e riempi il tesoro del cucciolo di drago.',
		},
		href: dragonsGems.LANDING_PATHS,
		play: withHl(dragonsGems.STORES.play),
		apple: dragonsGems.STORES.apple ? same(dragonsGems.STORES.apple) : undefined,
		web: '/jeux/eclats/',
	},
	{
		id: 'nino-rush',
		name: 'Nino Rush',
		kind: 'soon',
		type: 'game',
		icon: NINO_ICON,
		art: { src: same('/assets/home/stage-nino-rush.webp'), w: 1000, h: 1042, desk: '50% 50%', phone: '50% 50%' },
		kicker: each((l) => `${SOON[l]} · ${MOBILE_GAME[l]}`),
		pitch: {
			fr: fr("Jeu de plateforme physique : aide Nino le panda roux à rouler jusqu'au terrier."),
			en: 'A physics platformer: help Nino the red panda roll all the way home.',
			es: 'Un plataformas con física: ayuda a Nino, el panda rojo, a rodar hasta casa.',
			de: 'Ein Physik-Plattformer: Roll mit dem Roten Panda Nino bis nach Hause.',
			it: 'Un platform con la fisica: aiuta il panda rosso Nino a rotolare fino alla tana.',
		},
		test: '/nino-rush/telecharger/',
	},
	{
		id: 'petanque-game',
		name: petanqueGame.APP_NAME,
		kind: 'live',
		type: 'game',
		icon: petanqueGame.ICON,
		art: { src: same('/assets/petanque-game/hero.webp'), w: 1024, h: 500, desk: '50% 50%', phone: '50% 60%' },
		kicker: each((l) => `${cap(MOBILE_GAME[l])} · ${PETANQUE[l]}`),
		pitch: {
			fr: fr("Jeu de boules en 3D : contre l'ordinateur, à deux ou en ligne, seul ou en équipe."),
			en: 'Boules in 3D: pétanque against the computer, for two or online, singles or teams.',
			es: 'Petanca en 3D: contra la máquina, entre dos o en línea, individual o por equipos.',
			de: 'Boule in 3D: Pétanque gegen den Computer, zu zweit oder online, auch im Team.',
			it: 'Bocce in 3D: pétanque contro il computer, in due o online, da soli o a squadre.',
		},
		href: petanqueGame.LANDING_PATHS,
		play: withHl(petanqueGame.STORES.play),
		apple: petanqueGame.STORES.apple ? same(petanqueGame.STORES.apple) : undefined,
		web: '/jeux/petanque/',
	},
	{
		id: 'petanque-meet',
		name: 'Pétanque Meet',
		kind: 'live',
		type: 'app',
		icon: '/assets/petanque-meet/icon.webp',
		// Its header art holds the app's map on a phone, in each language.
		art: { src: each((l) => `/assets/home/stage-petanque-meet-${l}.webp`), w: 1000, h: 1125, desk: '60% 50%', phone: '55% 25%' },
		kicker: each((l) => `App · ${PETANQUE[l]}`),
		pitch: {
			fr: 'Parties et concours de pétanque près de chez toi. Pose la tienne en un geste.',
			en: 'Pétanque games and tournaments near you. Post your own in one tap.',
			es: 'Partidas y torneos de petanca cerca de ti. Publica la tuya en segundos.',
			de: 'Boule-Spiele und Turniere in deiner Nähe. Stell dein Spiel in Sekunden ein.',
			it: 'Partite e tornei di pétanque vicino a te. Pubblica la tua in un attimo.',
		},
		// The product page exists in French and English; the other languages have the download page.
		href: each((l) => (l === 'fr' ? '/petanque-meet/' : l === 'en' ? '/en/petanque-meet/' : MEET_DOWNLOAD[l].path)),
		play: each((l) => MEET_STORES[l].play),
		apple: each((l) => MEET_STORES[l].apple),
	},
	{
		id: 'petanque-scan',
		name: scanner.APP_NAME,
		kind: 'live',
		type: 'app',
		icon: '/assets/petanque/icon-scanner.webp',
		art: { src: same('/assets/home/stage-petanque-scan.webp'), w: 535, h: 500, desk: '50% 50%', phone: '50% 50%' },
		kicker: each((l) => `App · ${PETANQUE[l]}`),
		pitch: {
			fr: "Mesure l'écart entre les boules et le cochonnet, jusqu'au millimètre.",
			en: 'Measure the gap between the boules and the jack, down to the millimetre.',
			es: 'Mide la distancia entre las bolas y el boliche, hasta el milímetro.',
			de: 'Miss den Abstand der Kugeln zur Zielkugel, bis auf den Millimeter.',
			it: 'Misura la distanza tra le bocce e il pallino, fino al millimetro.',
		},
		href: scanner.LANDING_PATHS,
		play: each((l) => scanner.copy[l].badges.play),
		apple: each((l) => scanner.copy[l].badges.apple),
	},
];

/** The thumbnail's second line: new, coming soon, or the stores it is on. */
export const note = (g: HomeGame, l: Lang): string => {
	if (g.kind === 'new') return NEW[l];
	if (g.kind === 'soon') return SOON[l];
	return [g.play && 'Android', g.apple && 'iPhone'].filter(Boolean).join(', ');
};

export interface StageText {
	title: string;
	carousel: string;
	slide: string;
	of: string;
	stop: string;
	start: string;
	game: string;
	app: string;
	web: string;
	test: string;
}

/** The labels follow the WAI-ARIA carousel pattern: role descriptions, « 2 of 5 », stop and start rotation. */
export const UI: Record<Lang, StageText> = {
	fr: {
		title: 'Nos jeux et applis',
		carousel: 'carrousel',
		slide: 'diapositive',
		of: 'sur',
		stop: 'Arrêter le défilement automatique',
		start: 'Lancer le défilement automatique',
		game: 'Découvrir le jeu',
		app: "Découvrir l'appli",
		web: 'Jouer dans le navigateur',
		test: 'Essayer la version de test (Android)',
	},
	en: {
		title: 'Our games and apps',
		carousel: 'carousel',
		slide: 'slide',
		of: 'of',
		stop: 'Stop automatic slide show',
		start: 'Start automatic slide show',
		game: 'Discover the game',
		app: 'Discover the app',
		web: 'Play in the browser',
		test: 'Try the test version (Android)',
	},
	es: {
		title: 'Nuestros juegos y apps',
		carousel: 'carrusel',
		slide: 'diapositiva',
		of: 'de',
		stop: 'Detener el pase automático',
		start: 'Iniciar el pase automático',
		game: 'Descubrir el juego',
		app: 'Descubrir la app',
		web: 'Jugar en el navegador',
		test: 'Probar la versión de prueba (Android)',
	},
	de: {
		title: 'Unsere Spiele und Apps',
		carousel: 'Karussell',
		slide: 'Folie',
		of: 'von',
		stop: 'Automatischen Wechsel anhalten',
		start: 'Automatischen Wechsel starten',
		game: 'Spiel entdecken',
		app: 'App entdecken',
		web: 'Im Browser spielen',
		test: 'Testversion ausprobieren (Android)',
	},
	it: {
		title: 'I nostri giochi e app',
		carousel: 'carosello',
		slide: 'diapositiva',
		of: 'di',
		stop: 'Ferma lo scorrimento automatico',
		start: 'Avvia lo scorrimento automatico',
		game: 'Scopri il gioco',
		app: "Scopri l'app",
		web: 'Gioca nel browser',
		test: 'Prova la versione di test (Android)',
	},
};

/** The « coming soon » tag on a store's faded badge, as Dragon Gems words it in each language. */
export const soon = (l: Lang): string => dragonsGems.copy[l].soonShort;
