// The site's menu, footer and phone tab bar, in the five languages of its pages. French pages hold the whole site;
// the others hold the apps and the studio, so their menu is shorter and their contact is the mail address.
export type Lang = 'fr' | 'en' | 'es' | 'de' | 'it';

export const LANGS: Lang[] = ['fr', 'en', 'es', 'de', 'it'];
export const HOME: Record<Lang, string> = { fr: '/', en: '/en/', es: '/es/', de: '/de/', it: '/it/' };
/** Each language named in itself: it is read by someone who does not speak the page's. */
export const LANG_NAMES: Record<Lang, string> = { fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano' };
export const MAIL = 'contact@ludiven-studio.fr';

export interface NavLink {
	label: string;
	href: string;
	/** Other paths that light this link up. */
	also?: RegExp;
}

export interface NavText {
	nav: string;
	menu: string;
	language: string;
	links: NavLink[];
	footer: NavLink[];
	footerLabel: string;
	follow: (name: string) => string;
}

// The apps' own pages count as the « games » part of the site.
const APPS = /^\/(?:(?:en|es|de|it)\/)?(?:dragons-gems|nino-rush|petanque-game|petanque-meet|petanque-scanner|petanque)(?:\/|$)/;

export const NAV: Record<Lang, NavText> = {
	fr: {
		nav: 'Menu principal',
		menu: 'Menu',
		language: 'Langue',
		links: [
			{ label: 'Jeux', href: '/', also: APPS },
			{ label: 'Mini-jeux', href: '/jeux/', also: /^\/jeux\// },
			{ label: 'Le studio', href: '/prestations/', also: /^\/(?:prestations|services|partenariats|contact|labo)\// },
			{ label: 'Projets', href: '/work/', also: /^\/work\// },
			{ label: 'À propos', href: '/about/' },
		],
		footer: [
			{ label: 'Prestations', href: '/prestations/' },
			{ label: 'Services en ligne', href: '/services/' },
			{ label: 'Partenariats', href: '/partenariats/' },
			{ label: 'Contact', href: '/contact/' },
			{ label: 'Mentions légales', href: '/mentions-legales/' },
			{ label: 'Confidentialité', href: '/confidentialite/' },
		],
		footerLabel: 'Liens du pied de page',
		follow: (n) => `${n} de Raphaël Benedetto`,
	},
	en: {
		nav: 'Main menu',
		menu: 'Menu',
		language: 'Language',
		links: [
			{ label: 'Games', href: '/en/', also: APPS },
			{ label: 'Studio', href: '/en/services/' },
			{ label: 'Projects', href: '/en/work/', also: /^\/en\/work\// },
			{ label: 'Contact', href: '/en/contact/' },
		],
		footer: [
			{ label: 'Services', href: '/en/services/' },
			{ label: 'Contact', href: '/en/contact/' },
			{ label: 'Legal notice (French)', href: '/mentions-legales/' },
			{ label: 'Privacy (French)', href: '/confidentialite/' },
		],
		footerLabel: 'Footer links',
		follow: (n) => `Raphaël Benedetto on ${n}`,
	},
	es: {
		nav: 'Menú principal',
		menu: 'Menú',
		language: 'Idioma',
		links: [
			{ label: 'Juegos', href: '/es/', also: APPS },
			{ label: 'Estudio', href: '/es/#studio' },
			{ label: 'Contacto', href: `mailto:${MAIL}` },
		],
		footer: [
			{ label: 'Contacto', href: `mailto:${MAIL}` },
			{ label: 'Aviso legal (en francés)', href: '/mentions-legales/' },
			{ label: 'Privacidad (en francés)', href: '/confidentialite/' },
		],
		footerLabel: 'Enlaces del pie de página',
		follow: (n) => `Raphaël Benedetto en ${n}`,
	},
	de: {
		nav: 'Hauptmenü',
		menu: 'Menü',
		language: 'Sprache',
		links: [
			{ label: 'Spiele', href: '/de/', also: APPS },
			{ label: 'Studio', href: '/de/#studio' },
			{ label: 'Kontakt', href: `mailto:${MAIL}` },
		],
		footer: [
			{ label: 'Kontakt', href: `mailto:${MAIL}` },
			{ label: 'Impressum (auf Französisch)', href: '/mentions-legales/' },
			{ label: 'Datenschutz (auf Französisch)', href: '/confidentialite/' },
		],
		footerLabel: 'Links in der Fußzeile',
		follow: (n) => `Raphaël Benedetto auf ${n}`,
	},
	it: {
		nav: 'Menu principale',
		menu: 'Menu',
		language: 'Lingua',
		links: [
			{ label: 'Giochi', href: '/it/', also: APPS },
			{ label: 'Studio', href: '/it/#studio' },
			{ label: 'Contatti', href: `mailto:${MAIL}` },
		],
		footer: [
			{ label: 'Contatti', href: `mailto:${MAIL}` },
			{ label: 'Note legali (in francese)', href: '/mentions-legales/' },
			{ label: 'Privacy (in francese)', href: '/confidentialite/' },
		],
		footerLabel: 'Link a piè di pagina',
		follow: (n) => `Raphaël Benedetto su ${n}`,
	},
};

/** The daily challenge: French pages only, as the mini-games are in French. */
export const DAILY = {
	href: '/jeux/defi/',
	label: 'Défi du jour',
	streak: (n: number): string => `Série${String.fromCharCode(160)}: ${n} jour${n > 1 ? 's' : ''}`,
	streakLabel: (n: number): string => `Défi du jour, série de ${n} jour${n > 1 ? 's' : ''}`,
};

/** The phone tab bar of French pages: the games, the mini-games, the daily challenge, the studio. */
export const TABS: { id: 'games' | 'mini' | 'daily' | 'studio'; label: string; href: string; match: RegExp }[] = [
	{ id: 'games', label: 'Jeux', href: '/', match: /^\/$|^\/(?:dragons-gems|nino-rush|petanque-game|petanque-meet|petanque-scanner|petanque)(?:\/|$)/ },
	{ id: 'mini', label: 'Mini-jeux', href: '/jeux/', match: /^\/jeux\/(?!defi\/)/ },
	{ id: 'daily', label: 'Défi du jour', href: '/jeux/defi/', match: /^\/jeux\/defi\// },
	{ id: 'studio', label: 'Studio', href: '/prestations/', match: /^\/(?:prestations|services|partenariats|contact|work|about|labo)(?:\/|$)/ },
];

/** Social profiles, shown in the footer. */
export const SOCIALS = [
	{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/raphael-benedetto/', icon: 'linkedin-logo' },
	{ label: 'TikTok', href: 'https://www.tiktok.com/@raphbenpro', icon: 'tiktok-logo' },
	{ label: 'Instagram', href: 'https://www.instagram.com/raphben/', icon: 'instagram-logo' },
] as const;
