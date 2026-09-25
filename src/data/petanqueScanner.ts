// Copy for the Pétanque Scanner landing pages (French, English and Spanish).
// Kept in one file so the languages can't drift apart when the app changes.

// App Store links carry no country code on purpose: Apple then redirects to the
// visitor's own storefront. A hardcoded /fr/ or /us/ shows a "switch store?" wall
// to everyone abroad — Belgian and Swiss players read the French page too.

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
	photoTitle: string;
	photoBody: string;
	photoNote: string;
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
	'/assets/petanque-ar/screen-04.webp',
	'/assets/petanque-ar/screen-05.webp',
	'/assets/petanque-ar/screen-06.webp',
];

export type LandingLang = 'fr' | 'en' | 'es';

/** Every language version of the landing, for hreflang and the language switch. */
export const LANDING_PATHS: Record<LandingLang, string> = {
	fr: '/petanque-scanner/',
	en: '/en/petanque-scanner/',
	es: '/es/petanque-scanner/',
};

export const copy: Record<LandingLang, LandingCopy> = {
	fr: {
		title: 'Pétanque Scanner — savoir qui a le point avec votre téléphone',
		description:
			'Application gratuite de réalité augmentée : visez les boules, tournez autour, et lisez la distance de chaque boule au cochonnet. Un mode photo prend le relais sur les téléphones sans AR. Tout est calculé sur le téléphone, sans réseau ni compte.',
		tagline:
			'Deux boules de chaque côté du cochonnet, à un mètre ou deux, et l\'œil ne tranche pas : de loin, on ne compare pas deux distances. Lancez un scan, tournez quelques secondes autour du jeu, et l\'application affiche la distance de chaque boule — posée en réalité augmentée sur le terrain.',
		heroAlt: 'Trois boules et un cochonnet sur un terrain, avec les mesures affichées en réalité augmentée',
		badges: {
			play: 'https://play.google.com/store/apps/details?id=com.raphbenpro.petanquear&hl=fr',
			playAlt: 'Disponible sur Google Play',
			apple: 'https://apps.apple.com/app/id6670211733',
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
				title: 'Sans se baisser',
				body: 'Chaque boule est mesurée par rapport au cochonnet, et le classement s\'affiche directement sur le terrain, pas dans un tableau. Personne n\'a besoin de s\'accroupir pour trancher.',
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
		photoTitle: 'Et si votre téléphone ne gère pas la réalité augmentée ?',
		photoBody:
			'Il y a un mode photo. Vous tenez le téléphone à plat au-dessus du jeu, vous prenez une seule photo, et l\'application y place le cochonnet et les boules : la plus proche est cerclée de vert, avec l\'écart qui la sépare de la suivante. Aucune réalité augmentée n\'est nécessaire — il suffit d\'une caméra.',
		photoNote:
			'Sur un appareil non compatible, l\'application bascule toute seule dans ce mode : pas de menu, rien à régler. Sur les autres, le mode photo reste accessible dans les réglages, pratique quand la place manque pour tourner autour du jeu. La contrepartie est connue : une seule photo donne une mesure moins sûre qu\'un scan sous plusieurs angles.',
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
				title: 'À quelques millimètres, sortez le mètre',
				body: 'L\'application tranche les écarts visibles. Quand deux boules sont à quasi-égale distance du cochonnet — peu importe qu\'elles en soient à dix centimètres ou à deux mètres — l\'écart passe sous la précision de la mesure, et seul un vrai mètre les départagera.',
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
				a: 'Non. En partie officielle, seule la mesure de l\'arbitre compte. L\'application est faite pour les parties amicales, quand personne n\'a de mètre sous la main.',
			},
			{
				q: 'Quelle est la précision réelle ?',
				a: 'L\'affichage descend au millimètre, mais la justesse est autre chose : quelques millimètres au mieux, quand les boules sont bien visibles et que vous avez tourné autour du jeu. Un indice de confiance s\'affiche pendant le scan : s\'il reste bas, c\'est que la mesure ne doit pas être prise au sérieux.',
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
				a: 'Le scan en réalité augmentée demande un Android compatible ARCore ou un iPhone compatible ARKit, soit la grande majorité des modèles sortis depuis 2018. Sur les téléphones qui ne le sont pas, l\'application bascule automatiquement en mode photo : elle reste utilisable.',
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
		title: 'Pétanque Scanner — see who has the point with your phone',
		description:
			'A free augmented-reality app: point your phone at the boules, walk around them, and read how far each one is from the jack. A photo mode takes over on phones without AR. Everything runs on the phone, with no signal and no account.',
		tagline:
			'Two boules either side of the jack, a metre or two out, and your eye can\'t call it: at that range you cannot compare two distances. Start a scan, walk around the game for a few seconds, and the app shows how far each boule is — drawn in augmented reality right on the ground.',
		heroAlt: 'Three boules and a jack on a pitch, with the measurements drawn in augmented reality',
		badges: {
			play: 'https://play.google.com/store/apps/details?id=com.raphbenpro.petanquear&hl=en',
			playAlt: 'Get it on Google Play',
			apple: 'https://apps.apple.com/app/id6670211733',
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
				title: 'Nobody crouches down',
				body: 'Every boule is measured against the jack, and the ranking is drawn on the pitch itself, not buried in a table. No one has to kneel down to settle it.',
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
		photoTitle: 'What if your phone has no augmented reality?',
		photoBody:
			'There is a photo mode. Hold the phone flat above the game, take a single photo, and the app places the jack and the boules on it: the closest one is circled in green, with the gap to the next one. No augmented reality needed — a camera is enough.',
		photoNote:
			'On a device without AR support the app switches to this mode by itself: no menu, nothing to set up. On every other phone the photo mode stays available in the settings, which helps when there is no room to walk around the game. The trade-off is plain: one photo is a less reliable measurement than a scan from several angles.',
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
				title: 'Within a few millimetres, get the tape measure out',
				body: 'The app settles gaps you can see. When two boules sit almost the same distance from the jack — whether that is ten centimetres or two metres away — the gap falls below what the measurement can resolve, and only a real tape measure will separate them.',
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
				a: 'No. In an official game, only the referee\'s measurement counts. The app is built for friendly games, when nobody has a tape measure to hand.',
			},
			{
				q: 'How accurate is it really?',
				a: 'The reading goes down to the millimetre, but accuracy is another matter: a few millimetres at best, when the boules are clearly visible and you have walked around the game. A confidence score is shown during the scan: if it stays low, the measurement should not be trusted.',
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
				a: 'The augmented-reality scan needs an Android with ARCore or an iPhone with ARKit, which covers the large majority of models released since 2018. Phones without it fall back to photo mode automatically, so the app stays usable.',
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
	es: {
		title: 'Pétanque Scanner — saber quién tiene el punto con el móvil',
		description:
			'Aplicación gratuita de realidad aumentada: apunta a las bolas, rodéalas y lee la distancia de cada bola al boliche. Un modo foto toma el relevo en los móviles sin realidad aumentada. Todo se calcula en el móvil, sin conexión ni cuenta.',
		tagline:
			'Dos bolas a cada lado del boliche, a uno o dos metros, y el ojo no sabe decidir: de lejos no se pueden comparar dos distancias. Lanza un escaneo, rodea el juego unos segundos y la aplicación muestra la distancia de cada bola, dibujada en realidad aumentada sobre el terreno.',
		heroAlt: 'Tres bolas y un boliche en un terreno, con las medidas mostradas en realidad aumentada',
		badges: {
			play: 'https://play.google.com/store/apps/details?id=com.raphbenpro.petanquear&hl=es',
			playAlt: 'Disponible en Google Play',
			apple: 'https://apps.apple.com/app/id6670211733',
			appleAlt: 'Consíguelo en el App Store',
		},
		stepsTitle: 'Cómo funciona',
		steps: [
			{
				icon: 'mobile',
				title: 'Lanza el escaneo',
				body: 'Deja las bolas exactamente donde están, abre la aplicación y apunta al juego. No hay nada que poner en el suelo ni ninguna marca que colocar.',
			},
			{
				icon: 'winding-path',
				title: 'Rodea el juego',
				body: 'Da unos pasos alrededor de las bolas sin perder el boliche de vista. Un índice de confianza sube en directo mientras la aplicación reúne puntos de vista.',
			},
			{
				icon: 'grid-dots',
				title: 'Lee la clasificación',
				body: 'Las distancias aparecen sobre el suelo, de la más corta a la más larga. Sabes quién tiene el punto sin que nadie se agache.',
			},
		],
		featuresTitle: 'Lo que cambia',
		features: [
			{
				title: 'Sin agacharse',
				body: 'Cada bola se mide respecto al boliche, y la clasificación se muestra directamente sobre el terreno, no en una tabla. Nadie tiene que agacharse para decidir.',
			},
			{
				title: 'Sin conexión',
				body: 'El reconocimiento funciona en tu móvil. Ningún terreno está demasiado lejos de una antena para que la aplicación funcione.',
			},
			{
				title: 'Nada sale del móvil',
				body: 'Sin servidor, sin cuenta, sin registro. Las imágenes de la cámara nunca salen del dispositivo.',
			},
			{
				title: 'Sin suscripción',
				body: 'Gratis todos los días. Si quieres escaneos ilimitados, es una compra única, sin cargos mensuales.',
			},
		],
		photoTitle: '¿Y si tu móvil no admite la realidad aumentada?',
		photoBody:
			'Hay un modo foto. Sostienes el móvil en horizontal por encima del juego, haces una sola foto y la aplicación sitúa en ella el boliche y las bolas: la más cercana aparece rodeada en verde, con la diferencia que la separa de la siguiente. No hace falta realidad aumentada: basta con una cámara.',
		photoNote:
			'En un dispositivo no compatible, la aplicación cambia sola a este modo: sin menú, nada que configurar. En los demás, el modo foto sigue disponible en los ajustes, útil cuando no hay sitio para rodear el juego. La contrapartida es conocida: una sola foto da una medida menos fiable que un escaneo desde varios ángulos.',
		limitsTitle: 'Lo que la aplicación no hace',
		limitsIntro: 'Mejor decirlo desde el principio, así no habrá sorpresas en el terreno.',
		limits: [
			{
				title: 'No tiene ningún valor oficial',
				body: 'En competición, la medida del árbitro es la que cuenta. Pétanque Scanner está pensado para partidas entre amigos, de vacaciones o en el club.',
			},
			{
				title: 'Necesita ver las bolas',
				body: 'Sol rasante, sombra muy marcada o una bola medio hundida en la grava: la detección se vuelve mucho más difícil.',
			},
			{
				title: 'El boliche es lo más difícil',
				body: 'Es pequeño y a menudo queda tapado por una bola. Es lo que más veces hace fallar a la aplicación; un modo «imán» permite recolocarlo a mano.',
			},
			{
				title: 'A pocos milímetros, saca el metro',
				body: 'La aplicación decide las diferencias visibles. Cuando dos bolas están casi a la misma distancia del boliche, da igual que sea a diez centímetros o a dos metros, la diferencia queda por debajo de la precisión de la medida y solo un metro de verdad las separará.',
			},
		],
		priceTitle: 'Cuánto cuesta',
		priceBody:
			'La aplicación es gratuita, con 3 escaneos al día. Puedes ver un anuncio opcional para recargarlos, o pasar una sola vez a Premium de por vida: medidas ilimitadas y ningún anuncio más. No hay suscripción, y no hace falta ninguna compra para usar la aplicación.',
		galleryTitle: 'La aplicación en imágenes',
		faqTitle: 'Preguntas frecuentes',
		faq: [
			{
				q: '¿Puedo usarla en competición?',
				a: 'No. En una partida oficial solo cuenta la medida del árbitro. La aplicación está pensada para partidas amistosas, cuando nadie tiene un metro a mano.',
			},
			{
				q: '¿Qué precisión tiene de verdad?',
				a: 'La pantalla muestra hasta el milímetro, pero la exactitud es otra cosa: unos pocos milímetros en el mejor de los casos, cuando las bolas se ven bien y has rodeado el juego. Durante el escaneo se muestra un índice de confianza: si se queda bajo, la medida no debe tomarse en serio.',
			},
			{
				q: '¿Funciona sin conexión?',
				a: 'Sí, por completo. El reconocimiento de las bolas se ejecuta en el móvil y no hay ningún servidor.',
			},
			{
				q: '¿Se envían mis fotos a algún sitio?',
				a: 'No. Ninguna imagen sale del dispositivo, y la aplicación no pide crear ninguna cuenta.',
			},
			{
				q: '¿Qué móviles son compatibles?',
				a: 'El escaneo en realidad aumentada necesita un Android compatible con ARCore o un iPhone compatible con ARKit, es decir, la gran mayoría de los modelos lanzados desde 2018. En los que no lo son, la aplicación cambia automáticamente al modo foto y sigue siendo utilizable.',
			},
			{
				q: '¿Hay que poner una marca en el suelo?',
				a: 'No. La aplicación se orienta sola en el terreno a partir de la cámara y de los sensores de movimiento del móvil.',
			},
			{
				q: '¿La aplicación está en español?',
				a: 'Todavía no: por ahora está en francés y en inglés, y un móvil configurado en español la muestra en inglés. Tiene poco texto y se usa sin problema.',
			},
		],
		makingOfTitle: 'Cómo está hecha',
		makingOfBody:
			'La detección de las bolas se basa en un modelo de visión entrenado solo con imágenes sintéticas, y la medida en una triangulación por acumulación de rayos. He escrito el detalle del proceso, incluidos los experimentos que no funcionaron (en inglés).',
		makingOfCta: 'Leer los detalles técnicos',
		makingOfHref: '/en/work/petanque-scanner/',
		legalIntro: 'Consulta también (en francés):',
		privacy: { label: 'política de privacidad', href: '/petanque-ar/confidentialite/' },
		terms: { label: 'condiciones de uso', href: '/petanque-ar/cgu/' },
		closing: 'Disponible en Android e iOS',
	},
};
