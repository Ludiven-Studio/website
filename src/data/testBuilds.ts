// The /tests/ hub: every app's Android test build in one place. Each card reads the app's testers' manifest
// (builds/<folder>/latest.json, written by its publish script) and links to the app's own test page, which stays the
// testers' address. Beta pages with a secret address are left out on purpose: listing them here would make them public.
import { SUPABASE_URL } from './site';
import { APK_URL as NINO_APK, APK_VERSION as NINO_VERSION, ICON as NINO_ICON } from './ninoRush';
import { ICON as DG_ICON } from './dragonsGems';
import { ICON as PG_ICON } from './petanqueGame';

export interface TestApp {
	id: string;
	name: string;
	/** One line on what the app is. */
	tag: string;
	/** The square icon; null draws the initials on the app's colour. */
	icon: string | null;
	initials: string;
	color: string;
	/** The testers' manifest the card reads live; null for an app that has none. */
	latest: string | null;
	/** Without a manifest: the fixed APK and its version. */
	apk?: { url: string; version: string };
	/** The app's own test page. */
	page: string;
}

const manifest = (folder: string) => `${SUPABASE_URL}/storage/v1/object/public/builds/${folder}/latest.json`;

export const TEST_APPS: TestApp[] = [
	{ id: 'table-tennis', name: 'Table Tennis Tactics', tag: 'Le tennis de table en consignes tracées', icon: null, initials: 'TT', color: '#0c8599', latest: manifest('tabletennis'), page: '/table-tennis-tactics/test/' },
	{ id: 'drone-battle', name: 'Drone Battle', tag: 'Combats de drones dans une forêt, seul ou en duel', icon: null, initials: 'DB', color: '#2f9e44', latest: manifest('dronebattle'), page: '/drone-battle/test/' },
	{ id: 'dominoland', name: 'Dominoland', tag: 'Le jeu de dominos', icon: '/assets/tests/dominoland.webp', initials: 'DL', color: '#e8b04a', latest: manifest('dominoland'), page: '/dominoland/test/' },
	{ id: 'petanque-game', name: 'Pétanque Game', tag: 'La pétanque en 3D, version de développement', icon: PG_ICON, initials: 'PG', color: '#2f7fd1', latest: manifest('petanquegame'), page: '/jeux/petanque/test/' },
	{ id: 'dragons-gems', name: "Dragon's Gems", tag: 'Le jeu de gemmes de Bijou, version de développement', icon: DG_ICON, initials: 'DG', color: '#d6409f', latest: manifest('dragonsgems'), page: '/jeux/eclats/test/' },
	{ id: 'petanque-meet', name: 'Pétanque Meet', tag: 'Trouver une partie de pétanque près de chez soi', icon: '/assets/petanque-meet/icon.webp', initials: 'PM', color: '#1098ad', latest: manifest('petanquemeet'), page: '/petanque-meet/test/' },
	{ id: 'petanque-scan', name: 'Pétanque Scan', tag: 'Mesurer les boules avec la caméra', icon: '/assets/petanque/icon-scanner.webp', initials: 'PS', color: '#6741d9', latest: manifest('petanquear'), page: '/petanque-scanner/test/' },
	{ id: 'nino-rush', name: 'Nino Rush', tag: 'Un panda roux à toute vitesse', icon: NINO_ICON, initials: 'NR', color: '#c47a14', latest: null, apk: { url: NINO_APK, version: NINO_VERSION }, page: '/nino-rush/telecharger/' },
];
