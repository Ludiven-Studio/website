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
	/** The app's support line: the page doubles as the store listings' support URL. */
	support: string;
	privacy: { label: string; href: string };
	terms: { label: string; href: string };
	closing: string;
}

export const APP_NAME = 'Pétanque Scanner';
export const OG_IMAGE = '/assets/work/og/petanque-scanner.jpg';
export const HERO = '/assets/petanque-ar/hero-fr.avif';

/** The store visuals carry their caption and the app's own UI, so each language gets its set. */
const screens = (suffix: string) =>
	[1, 2, 3, 4, 5, 6].map((n) => `/assets/petanque-ar/screen-0${n}${suffix}.webp`);
export const SCREENS: Record<LandingLang, string[]> = {
	fr: screens('-fr'),
	en: screens('-en'),
	es: screens('-es'),
	de: screens('-de'),
	it: screens('-it'),
};

export type LandingLang = 'fr' | 'en' | 'es' | 'de' | 'it';

/** Every language version of the landing, for hreflang and the language switch. */
export const LANDING_PATHS: Record<LandingLang, string> = {
	fr: '/petanque-scanner/',
	en: '/en/petanque-scanner/',
	es: '/es/petanque-scanner/',
	de: '/de/petanque-scanner/',
	it: '/it/petanque-scanner/',
};

/** The hero has its strapline baked into the pixels, so each language gets a repainted copy and its own share card. */
export const HEROES: Record<LandingLang, string> = {
	fr: HERO,
	en: '/assets/petanque-ar/hero-en.webp?v=1211',
	es: '/assets/petanque-ar/hero-es.webp?v=1211',
	de: '/assets/petanque-ar/hero-de.webp',
	it: '/assets/petanque-ar/hero-it.webp',
};
export const OG_IMAGES: Record<LandingLang, string> = {
	fr: OG_IMAGE,
	en: '/assets/work/og/petanque-scanner-en.jpg',
	es: '/assets/work/og/petanque-scanner-es.jpg',
	de: '/assets/work/og/petanque-scanner-de.jpg',
	it: '/assets/work/og/petanque-scanner-it.jpg',
};

export const copy: Record<LandingLang, LandingCopy> = {
	fr: {
		title: 'Pétanque Scanner — savoir qui a le point avec votre téléphone',
		description:
			'Application gratuite de réalité augmentée : visez le cochonnet, passez au-dessus des boules, et lisez la distance de chaque boule au cochonnet. Un mode photo prend le relais sur les téléphones sans AR. Tout est calculé sur le téléphone, sans réseau ni compte.',
		tagline:
			'Deux boules de chaque côté du cochonnet, à un mètre ou deux, et l\'œil ne tranche pas : de loin, on ne compare pas deux distances. Lancez un scan, visez le cochonnet, passez au-dessus de chaque boule, et l\'application affiche la distance de chaque boule — posée en réalité augmentée sur le terrain.',
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
				title: 'Placez le cochonnet',
				body: 'Laissez les boules où elles sont, ouvrez l\'application et filmez le sol autour du jeu. Visez ensuite le cochonnet sous trois angles, un pas de côté entre chaque visée : il est placé.',
			},
			{
				icon: 'winding-path',
				title: 'Passez au-dessus des boules',
				body: 'Filmez les boules depuis trois endroits — plusieurs à la fois, c\'est permis — puis tenez le téléphone au-dessus de chacune : la mesure se verrouille toute seule, un cadenas l\'indique.',
			},
			{
				icon: 'grid-dots',
				title: 'Lisez le classement',
				body: 'Validez : le classement s\'affiche vu du dessus, de la plus proche à la plus éloignée, avec l\'écart bord à bord de chaque boule. Personne n\'a besoin de s\'accroupir.',
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
			'Sur un appareil non compatible, l\'application bascule toute seule dans ce mode : pas de menu, rien à régler. Sur les autres, le mode photo se choisit dès l\'écran d\'accueil, pratique quand la place manque pour tourner autour du jeu. La contrepartie est connue : une seule photo donne une mesure moins sûre qu\'un scan sous plusieurs angles.',
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
				a: 'L\'affichage descend au millimètre, mais la justesse est autre chose : quelques millimètres au mieux, quand les boules sont bien visibles et que vous avez tourné autour du jeu. Pendant le scan, la jauge « Précision cochonnet » indique si le cochonnet est bien placé, et une boule n\'est mesurée qu\'une fois son cadenas affiché. Si la jauge reste basse, touchez « Retrouver le cochonnet » et refaites ses visées.',
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
		support: 'Une question, un souci avec l\'application ? Écrivez-moi :',
		privacy: { label: 'politique de confidentialité', href: '/petanque-scanner/confidentialite/' },
		terms: { label: 'conditions d\'utilisation', href: '/petanque-scanner/cgu/' },
		closing: 'Disponible sur Android et iOS',
	},
	en: {
		title: 'Pétanque Scanner — see who has the point with your phone',
		description:
			'Free augmented reality app: aim at the jack, hold the phone above the boules, and read each boule\'s distance to the jack. A photo mode takes over on phones without AR. Everything is computed on the phone, with no network or account.',
		tagline:
			'Two boules either side of the jack, a metre or two out, and your eye can\'t call it: at that range you cannot compare two distances. Start a scan, aim at the jack, hold the phone above each boule, and the app shows how far each boule is — drawn in augmented reality right on the ground.',
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
				title: 'Place the jack',
				body: 'Leave the boules where they are, open the app and film the ground around the game. Then aim at the jack from three angles, one step aside between shots: it is placed.',
			},
			{
				icon: 'winding-path',
				title: 'Go over the boules',
				body: 'Film the boules from three spots — several at once is fine — then hold the phone above each one: the measure locks by itself, a padlock shows it.',
			},
			{
				icon: 'grid-dots',
				title: 'Read the ranking',
				body: 'Confirm: the ranking appears seen from above, nearest first, with the edge-to-edge gap of each boule. Nobody has to crouch down.',
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
			'On a device without AR support the app switches to this mode by itself: no menu, nothing to set up. On every other phone the photo mode can be picked right from the home screen, which helps when there is no room to walk around the game. The trade-off is plain: one photo is a less reliable measurement than a scan from several angles.',
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
				a: 'The reading goes down to the millimetre, but accuracy is another matter: a few millimetres at best, when the boules are clearly visible and you have walked around the game. During the scan, the “Jack accuracy” gauge shows whether the jack is well placed, and a boule is only measured once its padlock shows. If the gauge stays low, tap “Find the jack again” and aim at it once more.',
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
		support: 'A question or a problem with the app? Write to me:',
		privacy: { label: 'privacy policy', href: '/en/petanque-scanner/confidentialite/' },
		terms: { label: 'terms of use', href: '/en/petanque-scanner/cgu/' },
		closing: 'Available on Android and iOS',
	},
	es: {
		title: 'Pétanque Scanner — saber quién tiene el punto con el móvil',
		description:
			'Aplicación gratuita de realidad aumentada: apunta al boliche, colócate encima de las bolas y lee la distancia de cada bola al boliche. Un modo foto toma el relevo en los móviles sin RA. Todo se calcula en el teléfono, sin red ni cuenta.',
		tagline:
			'Dos bolas a cada lado del boliche, a uno o dos metros, y el ojo no sabe decidir: de lejos no se pueden comparar dos distancias. Lanza un escaneo, apunta al boliche, colócate encima de cada bola y la aplicación muestra la distancia de cada bola, dibujada en realidad aumentada sobre el terreno.',
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
				title: 'Sitúa el boliche',
				body: 'Deja las bolas donde están, abre la aplicación y graba el suelo alrededor del juego. Luego apunta al boliche desde tres ángulos, con un paso al lado entre cada toma: queda situado.',
			},
			{
				icon: 'winding-path',
				title: 'Pasa por encima de las bolas',
				body: 'Graba las bolas desde tres sitios —varias a la vez, sin problema— y luego sostén el móvil encima de cada una: la medida se bloquea sola, un candado lo indica.',
			},
			{
				icon: 'grid-dots',
				title: 'Lee la clasificación',
				body: 'Valida: la clasificación aparece vista desde arriba, de la más cercana a la más lejana, con la distancia borde a borde de cada bola. Nadie tiene que agacharse.',
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
			'En un dispositivo no compatible, la aplicación cambia sola a este modo: sin menú, nada que configurar. En los demás, el modo foto se elige desde la pantalla de inicio, útil cuando no hay sitio para rodear el juego. La contrapartida es conocida: una sola foto da una medida menos fiable que un escaneo desde varios ángulos.',
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
				a: 'La pantalla muestra hasta el milímetro, pero la exactitud es otra cosa: unos pocos milímetros en el mejor de los casos, cuando las bolas se ven bien y has rodeado el juego. Durante el escaneo, la barra «Precisión boliche» indica si el boliche está bien situado, y una bola solo se mide cuando aparece su candado. Si la barra se queda baja, pulsa «Volver a encontrar el boliche» y apunta de nuevo.',
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
		legalIntro: 'Consulta también:',
		support: '¿Una pregunta o un problema con la aplicación? Escríbeme:',
		privacy: { label: 'política de privacidad', href: '/es/petanque-scanner/confidentialite/' },
		terms: { label: 'condiciones de uso', href: '/es/petanque-scanner/cgu/' },
		closing: 'Disponible para Android e iOS',
	},
	de: {
		title: 'Pétanque Scanner — mit dem Handy sehen, wer den Punkt hat',
		description:
			'Kostenlose Augmented-Reality-App: Ziel auf die Zielkugel, halte das Handy über die Kugeln und lies den Abstand jeder Kugel zur Zielkugel ab. Ein Fotomodus springt auf Handys ohne AR ein. Alles wird auf dem Handy berechnet, ohne Netz und ohne Konto.',
		tagline:
			'Zwei Kugeln links und rechts der Zielkugel, ein, zwei Meter entfernt, und das Auge kann es nicht entscheiden: Aus der Distanz lassen sich zwei Abstände nicht vergleichen. Starte einen Scan, ziel auf die Zielkugel, halte das Handy über jede Kugel, und die App zeigt den Abstand jeder Kugel an — in Augmented Reality direkt auf den Boden gelegt.',
		heroAlt: 'Drei Kugeln und eine Zielkugel auf einem Platz, mit den Messwerten in Augmented Reality eingeblendet',
		badges: {
			play: 'https://play.google.com/store/apps/details?id=com.raphbenpro.petanquear&hl=de',
			playAlt: 'Jetzt bei Google Play',
			apple: 'https://apps.apple.com/app/id6670211733',
			appleAlt: 'Download on the App Store',
		},
		stepsTitle: 'So funktioniert es',
		steps: [
			{
				icon: 'mobile',
				title: 'Zielkugel platzieren',
				body: 'Lass die Kugeln, wo sie sind, öffne die App und filme den Boden rund um das Spiel. Dann ziel aus drei Winkeln auf die Zielkugel, mit einem Schritt zur Seite zwischen den Aufnahmen: Sie ist platziert.',
			},
			{
				icon: 'winding-path',
				title: 'Über die Kugeln gehen',
				body: 'Filme die Kugeln von drei Stellen aus — mehrere auf einmal sind erlaubt — und halte das Handy dann über jede: Die Messung rastet von selbst ein, ein Schloss zeigt es an.',
			},
			{
				icon: 'grid-dots',
				title: 'Rangfolge ablesen',
				body: 'Bestätigen: Die Wertung erscheint von oben gesehen, die nächste zuerst, mit dem Abstand Rand zu Rand jeder Kugel. Niemand muss sich hinhocken.',
			},
		],
		featuresTitle: 'Was es dir bringt',
		features: [
			{
				title: 'Ohne sich zu bücken',
				body: 'Jede Kugel wird an der Zielkugel gemessen, und die Rangfolge erscheint direkt auf dem Platz, nicht in einer Tabelle. Niemand muss sich hinhocken, um zu entscheiden.',
			},
			{
				title: 'Ohne Netz',
				body: 'Die Erkennung läuft auf deinem Handy. Kein Platz liegt zu weit vom nächsten Funkmast entfernt, als dass die App nicht funktionieren würde.',
			},
			{
				title: 'Nichts verlässt das Handy',
				body: 'Kein Server, kein Konto, keine Anmeldung. Die Kamerabilder verlassen nie das Gerät.',
			},
			{
				title: 'Ohne Abo',
				body: 'Jeden Tag kostenlos. Wenn du unbegrenzt scannen willst, ist das ein einmaliger Kauf — keine monatlichen Kosten.',
			},
		],
		photoTitle: 'Und wenn dein Handy kein Augmented Reality kann?',
		photoBody:
			'Dafür gibt es einen Fotomodus. Du hältst das Handy flach über das Spiel, machst ein einziges Foto, und die App findet darauf die Zielkugel und die Kugeln: Die nächste wird grün umkreist, mit dem Abstand zur folgenden. Augmented Reality ist nicht nötig — eine Kamera reicht.',
		photoNote:
			'Auf einem nicht kompatiblen Gerät wechselt die App von selbst in diesen Modus: kein Menü, nichts einzustellen. Auf allen anderen lässt sich der Fotomodus direkt auf dem Startbildschirm wählen, praktisch, wenn kein Platz ist, um das Spiel zu umrunden. Der Preis dafür ist bekannt: Ein einzelnes Foto liefert eine weniger sichere Messung als ein Scan aus mehreren Blickwinkeln.',
		limitsTitle: 'Was die App nicht kann',
		limitsIntro: 'Besser gleich gesagt, dann gibt es auf dem Platz keine bösen Überraschungen.',
		limits: [
			{
				title: 'Sie ist nicht offiziell',
				body: 'Im Wettkampf zählt allein die Messung des Schiedsrichters. Pétanque Scanner ist für Partien unter Freunden gedacht, im Urlaub oder im Verein.',
			},
			{
				title: 'Sie muss die Kugeln sehen',
				body: 'Tief stehende Sonne, harter Schatten oder eine halb im Kies versunkene Kugel: Dann wird die Erkennung deutlich schwieriger.',
			},
			{
				title: 'Die Zielkugel ist der Knackpunkt',
				body: 'Klein und oft von einer Kugel verdeckt. An ihr scheitert die App am häufigsten — der Modus „Einrasten“ lässt dich sie von Hand zurechtrücken.',
			},
			{
				title: 'Bei wenigen Millimetern: Maßband raus',
				body: 'Die App entscheidet sichtbare Abstände. Liegen zwei Kugeln fast gleich weit von der Zielkugel entfernt — egal ob zehn Zentimeter oder zwei Meter —, fällt der Unterschied unter die Genauigkeit der Messung, und nur ein echtes Maßband trennt sie.',
			},
		],
		priceTitle: 'Was es kostet',
		priceBody:
			'Die App ist kostenlos, mit 3 Scans pro Tag. Du kannst dir freiwillig eine Werbung ansehen, um sie aufzuladen, oder einmalig Premium auf Lebenszeit kaufen: unbegrenzte Messungen und keine Werbung mehr. Es gibt kein Abo, und für die Nutzung der App ist kein Kauf nötig.',
		galleryTitle: 'Die App in Bildern',
		faqTitle: 'Häufige Fragen',
		faq: [
			{
				q: 'Kann ich sie im Wettkampf benutzen?',
				a: 'Nein. In einer offiziellen Partie zählt nur die Messung des Schiedsrichters. Die App ist für Freundschaftsspiele gedacht, wenn gerade niemand ein Maßband dabeihat.',
			},
			{
				q: 'Wie genau ist sie wirklich?',
				a: 'Die Anzeige geht bis auf den Millimeter, aber Genauigkeit ist etwas anderes: bestenfalls ein paar Millimeter, wenn die Kugeln gut sichtbar sind und du um das Spiel herumgegangen bist. Während des Scans zeigt die Leiste „Genauigkeit Schweinchen“, ob die Zielkugel gut platziert ist, und eine Kugel wird erst gemessen, wenn ihr Schloss erscheint. Bleibt die Leiste niedrig, tippe auf „Schweinchen neu finden“ und ziele erneut.',
			},
			{
				q: 'Funktioniert sie ohne Internet?',
				a: 'Ja, vollständig. Die Erkennung der Kugeln läuft auf dem Handy, und es gibt keinen Server.',
			},
			{
				q: 'Werden meine Fotos irgendwohin geschickt?',
				a: 'Nein. Kein Bild verlässt das Gerät, und die App verlangt kein Konto.',
			},
			{
				q: 'Welche Handys werden unterstützt?',
				a: 'Der 3D-Scan braucht ein Android-Gerät mit ARCore oder ein iPhone mit ARKit, also die große Mehrheit der Modelle seit 2018. Auf Handys ohne diese Unterstützung wechselt die App automatisch in den Fotomodus und bleibt nutzbar.',
			},
			{
				q: 'Muss ich eine Markierung auf den Boden legen?',
				a: 'Nein. Die App orientiert sich selbst auf dem Platz, mithilfe der Kamera und der Bewegungssensoren des Handys.',
			},
		],
		makingOfTitle: 'Wie sie gebaut ist',
		makingOfBody:
			'Die Erkennung der Kugeln beruht auf einem Bildmodell, das ausschließlich mit synthetischen Bildern trainiert wurde, die Messung auf einer Triangulation aus gesammelten Sichtstrahlen. Ich habe den ganzen Weg aufgeschrieben — samt der Experimente, die nicht funktioniert haben (auf Englisch).',
		makingOfCta: 'Den technischen Hintergrund lesen',
		makingOfHref: '/en/work/petanque-scanner/',
		legalIntro: 'Siehe auch:',
		support: 'Eine Frage oder ein Problem mit der App? Schreib mir:',
		privacy: { label: 'Datenschutzerklärung', href: '/de/petanque-scanner/confidentialite/' },
		terms: { label: 'Nutzungsbedingungen', href: '/de/petanque-scanner/cgu/' },
		closing: 'Erhältlich für Android und iOS',
	},
	it: {
		title: 'Pétanque Scanner — scopri chi ha il punto con il telefono',
		description:
			'App gratuita di realtà aumentata: inquadra il pallino, tieni il telefono sopra le bocce e leggi la distanza di ogni boccia dal pallino. Una modalità foto subentra sui telefoni senza AR. Tutto è calcolato sul telefono, senza rete né account.',
		tagline:
			'Due bocce ai lati del pallino, a uno o due metri, e l\'occhio non sa decidere: da lontano non si confrontano due distanze. Avvia una scansione, inquadra il pallino, tieni il telefono sopra ogni boccia e l\'app mostra la distanza di ogni boccia, disegnata in realtà aumentata direttamente sul campo.',
		heroAlt: 'Tre bocce e un pallino su un campo, con le misure mostrate in realtà aumentata',
		badges: {
			play: 'https://play.google.com/store/apps/details?id=com.raphbenpro.petanquear&hl=it',
			playAlt: 'Disponibile su Google Play',
			apple: 'https://apps.apple.com/app/id6670211733',
			appleAlt: 'Download on the App Store',
		},
		stepsTitle: 'Come funziona',
		steps: [
			{
				icon: 'mobile',
				title: 'Posiziona il pallino',
				body: 'Lascia le bocce dove sono, apri l\'app e inquadra il terreno intorno al gioco. Poi inquadra il pallino da tre angolazioni, con un passo di lato tra uno scatto e l\'altro: è posizionato.',
			},
			{
				icon: 'winding-path',
				title: 'Passa sopra le bocce',
				body: 'Riprendi le bocce da tre punti — anche più alla volta — poi tieni il telefono sopra ciascuna: la misura si blocca da sola, lo indica un lucchetto.',
			},
			{
				icon: 'grid-dots',
				title: 'Leggi la classifica',
				body: 'Conferma: la classifica appare vista dall\'alto, dalla più vicina alla più lontana, con la distanza bordo a bordo di ogni boccia. Nessuno deve accovacciarsi.',
			},
		],
		featuresTitle: 'Cosa cambia',
		features: [
			{
				title: 'Senza chinarsi',
				body: 'Ogni boccia viene misurata rispetto al pallino, e la classifica compare direttamente sul campo, non in una tabella. Nessuno deve accovacciarsi per decidere.',
			},
			{
				title: 'Senza rete',
				body: 'Il riconoscimento gira sul tuo telefono. Nessun campo è troppo lontano da un\'antenna perché l\'app funzioni.',
			},
			{
				title: 'Niente esce dal telefono',
				body: 'Nessun server, nessun account, nessuna registrazione. Le immagini della fotocamera non lasciano mai il dispositivo.',
			},
			{
				title: 'Senza abbonamento',
				body: 'Gratis ogni giorno. Se vuoi l\'illimitato, è un acquisto unico: nessun addebito mensile.',
			},
		],
		photoTitle: 'E se il tuo telefono non supporta la realtà aumentata?',
		photoBody:
			'C\'è una modalità foto. Tieni il telefono in piano sopra il gioco, scatti una sola foto e l\'app ci colloca il pallino e le bocce: la più vicina è cerchiata di verde, con lo scarto che la separa dalla successiva. Non serve la realtà aumentata: basta una fotocamera.',
		photoNote:
			'Su un dispositivo non compatibile, l\'app passa da sola a questa modalità: nessun menu, niente da impostare. Sugli altri, la modalità foto si sceglie direttamente dalla schermata iniziale, comoda quando manca lo spazio per girare intorno al gioco. Il compromesso è noto: una sola foto dà una misura meno sicura di una scansione da più angolazioni.',
		limitsTitle: 'Cosa l\'app non fa',
		limitsIntro: 'Meglio dirlo subito, così sul campo non ci saranno brutte sorprese.',
		limits: [
			{
				title: 'Non ha alcun valore ufficiale',
				body: 'In gara fa fede la misura dell\'arbitro. Pétanque Scanner è pensata per le partite tra amici, in vacanza o al circolo.',
			},
			{
				title: 'Ha bisogno di vedere le bocce',
				body: 'Sole radente, ombra molto marcata o una boccia mezza affondata nella ghiaia: il riconoscimento diventa molto più difficile.',
			},
			{
				title: 'Il pallino è il punto debole',
				body: 'È piccolo e spesso nascosto da una boccia. È lui a mettere più spesso in difficoltà l\'app: la modalità «Aggancia» permette di riposizionarlo a mano.',
			},
			{
				title: 'Per pochi millimetri, tira fuori il metro',
				body: 'L\'app decide gli scarti visibili. Quando due bocce sono quasi alla stessa distanza dal pallino, che sia a dieci centimetri o a due metri, lo scarto scende sotto la precisione della misura e solo un vero metro potrà separarle.',
			},
		],
		priceTitle: 'Quanto costa',
		priceBody:
			'L\'app è gratuita, con 3 scansioni al giorno. Puoi guardare una pubblicità facoltativa per ricaricarle, oppure passare una volta per tutte a Premium a vita: misure illimitate e nessuna pubblicità. Non c\'è abbonamento, e non serve alcun acquisto per usare l\'app.',
		galleryTitle: 'L\'app in immagini',
		faqTitle: 'Domande frequenti',
		faq: [
			{
				q: 'Posso usarla in gara?',
				a: 'No. In una partita ufficiale conta solo la misura dell\'arbitro. L\'app è pensata per le partite amichevoli, quando nessuno ha un metro a portata di mano.',
			},
			{
				q: 'Quanto è precisa davvero?',
				a: 'La lettura scende al millimetro, ma la precisione è un\'altra cosa: qualche millimetro nel migliore dei casi, quando le bocce sono ben visibili e hai girato intorno al gioco. Durante la scansione, la barra «Precisione pallino» indica se il pallino è ben posizionato, e una boccia viene misurata solo quando compare il suo lucchetto. Se la barra resta bassa, tocca «Ritrova il pallino» e inquadralo di nuovo.',
			},
			{
				q: 'Funziona senza connessione?',
				a: 'Sì, completamente. Il riconoscimento delle bocce avviene sul telefono e non c\'è alcun server.',
			},
			{
				q: 'Le mie foto vengono inviate da qualche parte?',
				a: 'No. Nessuna immagine lascia il dispositivo, e l\'app non chiede di creare alcun account.',
			},
			{
				q: 'Quali telefoni sono compatibili?',
				a: 'La scansione in realtà aumentata richiede un Android compatibile con ARCore o un iPhone compatibile con ARKit, cioè la grande maggioranza dei modelli usciti dal 2018. Sui telefoni che non lo sono, l\'app passa automaticamente alla modalità foto: resta utilizzabile.',
			},
			{
				q: 'Bisogna mettere un riferimento a terra?',
				a: 'No. L\'app si orienta da sola sul campo, grazie alla fotocamera e ai sensori di movimento del telefono.',
			},
		],
		makingOfTitle: 'Come è stata costruita',
		makingOfBody:
			'Il riconoscimento delle bocce si basa su un modello di visione addestrato solo su immagini sintetiche, e la misura su una triangolazione per accumulo di raggi. Ho raccontato tutto il procedimento, compresi gli esperimenti che non hanno funzionato (in inglese).',
		makingOfCta: 'Leggi il dietro le quinte tecnico',
		makingOfHref: '/en/work/petanque-scanner/',
		legalIntro: 'Da consultare anche:',
		support: 'Una domanda o un problema con l\'app? Scrivimi:',
		privacy: { label: 'informativa sulla privacy', href: '/it/petanque-scanner/confidentialite/' },
		terms: { label: 'condizioni d\'uso', href: '/it/petanque-scanner/cgu/' },
		closing: 'Disponibile per Android e iOS',
	},
};
