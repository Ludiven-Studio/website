// Copy for the Pétanque Scanner landing pages (/petanque-scanner/ and /en/petanque-scanner/).
// Kept in one file so the two languages can't drift apart when the app changes.

import type { iconPaths } from '../components/IconPaths';

export interface LandingCopy {
	title: string;
	description: string;
	tagline: string;
	heroAlt: string;
	badges: { play: string; playAlt: string; apple: string; appleAlt: string };
	stepsTitle: string;
	steps: { icon: keyof typeof iconPaths; title: string; body: string }[];
	featuresTitle: string;
	features: { title: string; body: string }[];
	limitsTitle: string;
	limitsIntro: string;
	limits: { title: string; body: string }[];
	priceTitle: string;
	priceBody: string;
	galleryTitle: string;
	faqTitle: string;
	faq: { q: string; a: string }[];
	makingOfTitle: string;
	makingOfBody: string;
	makingOfCta: string;
	makingOfHref: string;
	legalIntro: string;
	privacy: { label: string; href: string };
	terms: { label: string; href: string };
	closing: string;
}

export const APP_NAME = 'Pétanque Scanner';
export const OG_IMAGE = '/assets/work/og/petanque-scanner.jpg';
export const HERO = '/assets/petanque-ar/hero.avif';

export const SCREENS = [
	'/assets/petanque-ar/screen-01.webp',
	'/assets/petanque-ar/screen-02.webp',
	'/assets/petanque-ar/screen-03.webp',
];

export const copy: Record<'fr' | 'en', LandingCopy> = {
	fr: {
		title: 'Pétanque Scanner — mesurez le point au centimètre avec votre téléphone',
		description:
			'Application gratuite de réalité augmentée : visez les boules, tournez autour, et lisez la distance de chaque boule au cochonnet. Tout est calculé sur le téléphone, sans réseau ni compte. Android et iOS.',
		tagline:
			'Fin de mène, deux boules au ras du cochonnet, et personne autour du terrain n\'est d\'accord. Lancez un scan, tournez quelques secondes autour du jeu, et l\'application affiche la distance de chaque boule — posée en réalité augmentée sur le terrain.',
		heroAlt: 'Trois boules et un cochonnet sur un terrain, avec les mesures affichées en réalité augmentée',
		badges: {
			play: 'https://play.google.com/store/apps/details?id=com.raphbenpro.petanquear&hl=fr',
			playAlt: 'Disponible sur Google Play',
			apple: 'https://apps.apple.com/fr/app/petanque-scanner/id6670211733',
			appleAlt: 'Télécharger dans l\'App Store',
		},
		stepsTitle: 'Comment ça marche',
		steps: [
			{
				icon: 'mobile',
				title: 'Lancez le scan',
				body: 'Laissez les boules exactement où elles sont, ouvrez l\'application et visez le jeu. Rien à poser au sol, aucun repère à placer.',
			},
			{
				icon: 'winding-path',
				title: 'Tournez autour',
				body: 'Faites quelques pas autour des boules en gardant le cochonnet dans le cadre. Un indice de confiance monte en direct pendant que l\'application accumule les points de vue.',
			},
			{
				icon: 'grid-dots',
				title: 'Lisez le classement',
				body: 'Les distances s\'affichent au sol, de la plus courte à la plus longue. Vous savez qui a le point sans que personne ne s\'accroupisse.',
			},
		],
		featuresTitle: 'Ce que ça change',
		features: [
			{
				title: 'Au centimètre',
				body: 'Chaque boule est mesurée par rapport au cochonnet et le classement est affiché directement sur le terrain, pas dans un tableau.',
			},
			{
				title: 'Sans réseau',
				body: 'La reconnaissance tourne sur votre téléphone. Aucun terrain n\'est trop loin d\'une antenne pour que l\'application fonctionne.',
			},
			{
				title: 'Rien ne sort du téléphone',
				body: 'Pas de serveur, pas de compte, pas d\'inscription. Les images de la caméra ne quittent jamais l\'appareil.',
			},
			{
				title: 'Sans abonnement',
				body: 'Gratuit tous les jours. Si vous voulez l\'illimité, c\'est un achat unique — aucun prélèvement mensuel.',
			},
		],
		limitsTitle: 'Ce que l\'application ne fait pas',
		limitsIntro: 'Autant le dire tout de suite, ça évitera les mauvaises surprises sur le terrain.',
		limits: [
			{
				title: 'Elle n\'a aucune valeur officielle',
				body: 'En compétition, la mesure de l\'arbitre fait foi. Pétanque Scanner est fait pour les parties entre amis, en vacances ou au club.',
			},
			{
				title: 'Elle a besoin de voir les boules',
				body: 'Soleil rasant, ombre très marquée ou boule à moitié enfoncée dans le gravier : la détection devient nettement plus difficile.',
			},
			{
				title: 'Le cochonnet est le point dur',
				body: 'Petit, et souvent masqué par une boule. C\'est lui qui met l\'application en échec le plus souvent — un mode « magnétise » permet de le recaler à la main.',
			},
			{
				title: 'À quelques millimètres, sortez le réglet',
				body: 'L\'application tranche les écarts visibles. Deux boules collées au cochonnet resteront une affaire de mesure manuelle.',
			},
		],
		priceTitle: 'Combien ça coûte',
		priceBody:
			'L\'application est gratuite, avec 3 scans par jour. Vous pouvez regarder une publicité facultative pour en recharger, ou passer une seule fois en Premium à vie : mesures illimitées et plus aucune publicité. Il n\'y a pas d\'abonnement, et aucun achat n\'est nécessaire pour se servir de l\'application.',
		galleryTitle: 'L\'application en images',
		faqTitle: 'Questions fréquentes',
		faq: [
			{
				q: 'Est-ce que je peux l\'utiliser en compétition ?',
				a: 'Non. En partie officielle, seule la mesure de l\'arbitre compte. L\'application est faite pour les parties amicales, quand personne n\'a de réglet sous la main.',
			},
			{
				q: 'Quelle est la précision réelle ?',
				a: 'De l\'ordre du centimètre quand les boules sont bien visibles. Un indice de confiance s\'affiche pendant le scan : s\'il reste bas, c\'est que la mesure ne doit pas être prise au sérieux.',
			},
			{
				q: 'Est-ce que ça fonctionne sans connexion ?',
				a: 'Oui, entièrement. La reconnaissance des boules s\'exécute sur le téléphone et il n\'y a aucun serveur.',
			},
			{
				q: 'Mes photos sont-elles envoyées quelque part ?',
				a: 'Non. Aucune image ne quitte l\'appareil, et l\'application ne demande la création d\'aucun compte.',
			},
			{
				q: 'Quels téléphones sont compatibles ?',
				a: 'Les téléphones Android compatibles ARCore et les iPhone compatibles ARKit, soit la grande majorité des modèles sortis depuis 2018.',
			},
			{
				q: 'Faut-il poser un repère au sol ?',
				a: 'Non. L\'application se repère seule sur le terrain, à partir de la caméra et des capteurs de mouvement du téléphone.',
			},
		],
		makingOfTitle: 'Comment c\'est construit',
		makingOfBody:
			'La détection des boules repose sur un modèle de vision entraîné uniquement sur des images de synthèse, et la mesure sur une triangulation par accumulation de rayons. J\'ai écrit le détail de la démarche — y compris les expériences qui n\'ont pas marché.',
		makingOfCta: 'Lire les coulisses techniques',
		makingOfHref: '/work/petanque-scanner/',
		legalIntro: 'À consulter également :',
		privacy: { label: 'politique de confidentialité', href: '/petanque-ar/confidentialite/' },
		terms: { label: 'conditions d\'utilisation', href: '/petanque-ar/cgu/' },
		closing: 'Disponible sur Android et iOS',
	},
	en: {
		title: 'Pétanque Scanner — measure the point to the centimetre with your phone',
		description:
			'A free augmented-reality app: point your phone at the boules, walk around them, and read how far each one is from the jack. Everything runs on the phone, with no signal and no account. Android and iOS.',
		tagline:
			'End of a round, two boules within a hair of the jack, and nobody around the pitch agrees. Start a scan, walk around the game for a few seconds, and the app shows how far each boule is — drawn in augmented reality right on the ground.',
		heroAlt: 'Three boules and a jack on a pitch, with the measurements drawn in augmented reality',
		badges: {
			play: 'https://play.google.com/store/apps/details?id=com.raphbenpro.petanquear&hl=en',
			playAlt: 'Get it on Google Play',
			apple: 'https://apps.apple.com/us/app/petanque-scanner/id6670211733',
			appleAlt: 'Download on the App Store',
		},
		stepsTitle: 'How it works',
		steps: [
			{
				icon: 'mobile',
				title: 'Start the scan',
				body: 'Leave the boules exactly where they are, open the app and point it at the game. Nothing to put on the ground, no marker to place.',
			},
			{
				icon: 'winding-path',
				title: 'Walk around',
				body: 'Take a few steps around the boules, keeping the jack in frame. A confidence score climbs live while the app gathers viewpoints.',
			},
			{
				icon: 'grid-dots',
				title: 'Read the ranking',
				body: 'Distances appear on the ground, shortest to longest. You know who has the point without anyone crouching down.',
			},
		],
		featuresTitle: 'What it gives you',
		features: [
			{
				title: 'Down to the centimetre',
				body: 'Every boule is measured against the jack and the ranking is drawn on the pitch itself, not buried in a table.',
			},
			{
				title: 'Works with no signal',
				body: 'Detection runs on your phone. No pitch is too far from a cell tower for the app to work.',
			},
			{
				title: 'Nothing leaves your phone',
				body: 'No server, no account, no sign-up. Camera frames never leave the device.',
			},
			{
				title: 'No subscription',
				body: 'Free every day. If you want unlimited, it is a one-off purchase — nothing monthly.',
			},
		],
		limitsTitle: 'What it does not do',
		limitsIntro: 'Better said upfront, so the pitch holds no surprises.',
		limits: [
			{
				title: 'It carries no official weight',
				body: 'In competition, the referee\'s measurement is the only one that counts. This is built for games among friends, on holiday or at the club.',
			},
			{
				title: 'It needs to see the boules',
				body: 'Low sun, harsh shade or a boule half sunk into gravel and detection gets considerably harder.',
			},
			{
				title: 'The jack is the hard part',
				body: 'Small, and often hidden behind a boule. It is what trips the app up most often — a "magnet" mode lets you nudge it back into place by hand.',
			},
			{
				title: 'Within a few millimetres, go get the measure',
				body: 'The app settles gaps you can see. Two boules touching the jack stay a job for a proper measuring tool.',
			},
		],
		priceTitle: 'What it costs',
		priceBody:
			'The app is free, with 3 scans a day. You can watch an optional ad to refill them, or buy lifetime Premium once: unlimited measurements and no more ads. There is no subscription, and no purchase is needed to use the app.',
		galleryTitle: 'The app in pictures',
		faqTitle: 'Frequently asked questions',
		faq: [
			{
				q: 'Can I use it in competition?',
				a: 'No. In an official game, only the referee\'s measurement counts. The app is built for friendly games, when nobody has a measure to hand.',
			},
			{
				q: 'How accurate is it really?',
				a: 'Around a centimetre when the boules are clearly visible. A confidence score is shown during the scan: if it stays low, the measurement should not be trusted.',
			},
			{
				q: 'Does it work offline?',
				a: 'Yes, completely. Boule detection runs on the phone and there is no server involved.',
			},
			{
				q: 'Are my photos sent anywhere?',
				a: 'No. No image ever leaves the device, and the app asks you to create no account.',
			},
			{
				q: 'Which phones are supported?',
				a: 'Android phones with ARCore and iPhones with ARKit, which covers the large majority of models released since 2018.',
			},
			{
				q: 'Do I need to place a marker on the ground?',
				a: 'No. The app locates itself on the pitch from the camera and the phone\'s motion sensors.',
			},
		],
		makingOfTitle: 'How it was built',
		makingOfBody:
			'Boule detection runs on a vision model trained purely on synthetic images, and the measurement comes from triangulating accumulated rays. I wrote up the whole approach — including the experiments that did not work.',
		makingOfCta: 'Read the technical write-up',
		makingOfHref: '/en/work/petanque-scanner/',
		legalIntro: 'See also:',
		privacy: { label: 'privacy policy', href: '/petanque-ar/confidentialite/' },
		terms: { label: 'terms of use', href: '/petanque-ar/cgu/' },
		closing: 'Available on Android and iOS',
	},
};
