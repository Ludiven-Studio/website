// The Nino Rush test build, published by NinoRush/tools/publish_test_apk.py under a name that never changes.
// Raise the version and size by hand at each new one.
export const APK_URL = 'https://github.com/Ludiven-Studio/website/releases/download/nino-rush-dev/NinoRush-test.apk';
export const APK_VERSION = '1.0.11';
export const APK_SIZE = '86,9 Mo';

const A = '/nino-rush';

export const ICON = `${A}/icon.webp`;
export const LOGO = `${A}/logo.webp`;
export const SHARE_IMAGE = `${A}/share.jpg`;
export const SCREENS = [
	{ src: `${A}/hero.webp`, alt: 'Nino roule dans la forêt et attrape une étoile.' },
	{ src: `${A}/workshop.webp`, alt: "L'atelier, où l'on dessine ses propres niveaux." },
	{ src: `${A}/chase.webp`, alt: 'Un gros rocher poursuit Nino.' },
	{ src: `${A}/worlds.webp`, alt: 'La carte des dix mondes du jeu.' },
];
