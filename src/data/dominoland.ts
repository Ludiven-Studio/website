// Dominoland: its product page and download page in five languages. The texts follow the store listings
// (DominoWorld docs/store.md, "Listing copy") and the owner's call of 2026-11-26: version 1.0 has no ads, no
// purchases and no account. Not on the stores yet: the badges stay faded under « bientôt ».

export type Lang = 'fr' | 'en' | 'es' | 'de' | 'it';

export const APP_NAME = 'Dominoland';
export const ANDROID_ID = 'com.ludivenstudio.dominoland';

/** The store listings, once the game is on them: the badges link there instead of « coming soon ». */
export const STORES: { play?: string; apple?: string } = {};

export const LANDING_PATHS: Record<Lang, string> = {
	fr: '/dominoland/',
	en: '/en/dominoland/',
	es: '/es/dominoland/',
	de: '/de/dominoland/',
	it: '/it/dominoland/',
};

export const DOWNLOAD_PATHS: Record<Lang, string> = {
	fr: '/dominoland/telecharger/',
	en: '/en/dominoland/download/',
	es: '/es/dominoland/descargar/',
	de: '/de/dominoland/herunterladen/',
	it: '/it/dominoland/scarica/',
};

/** The testers' build, in French only (unlisted: see testerLinks.ts). */
export const TEST_PAGE = '/dominoland/test/';
export const PRIVACY: Record<Lang, string> = {
	fr: '/dominoland/confidentialite/',
	en: '/en/dominoland/confidentialite/',
	es: '/es/dominoland/confidentialite/',
	de: '/de/dominoland/confidentialite/',
	it: '/it/dominoland/confidentialite/',
};
export const TERMS: Record<Lang, string> = {
	fr: '/dominoland/cgu/',
	en: '/en/dominoland/cgu/',
	es: '/es/dominoland/cgu/',
	de: '/de/dominoland/cgu/',
	it: '/it/dominoland/cgu/',
};
export const CONTACT: Record<Lang, string> = { fr: '/contact/', en: '/en/contact/', es: '/en/contact/', de: '/en/contact/', it: '/en/contact/' };

const A = '/assets/dominoland';
export const ICON = `${A}/icon.webp`;
/** No text but the icon: one share image for every language. */
export const SHARE_IMAGE = `${A}/share.jpg`;
/** The page head's art, text-free: Trace 1's sun once revealed. `desk` and `phone` are its object-positions. */
export const STAGE = { src: '/assets/dominoland/stage.webp', w: 1000, h: 980, desk: '50% 40%', phone: '50% 35%' };
/** Phone captures of the game (its ScreenTour test), in each language: a Trace level, its picture, Rhythm, its picture, the endless path. */
export const screens = (l: Lang): string[] => [1, 2, 3, 4, 5].map((n) => `${A}/screen-${n}-${l}.webp`);

/** The store names never break; French also wants a no-break space before : ? ! ; and inside « ». */
const NBSP = String.fromCharCode(160);
export const typo = (l: Lang, s: string): string => {
	const t = s.replace(/(App|Google) (Store|Play)/g, `$1${NBSP}$2`);
	return l === 'fr' ? t.replace(/ ([:?!;»])/g, `${NBSP}$1`).replace(/« /g, `«${NBSP}`) : t;
};

interface Item { title: string; body: string }

export interface Copy {
	title: string;
	description: string;
	kicker: string;
	tagline: string;
	intro: string;
	story: string;
	traceTitle: string;
	trace: Item[];
	galleryTitle: string;
	shotsAlt: string[];
	rhythmTitle: string;
	rhythm: Item[];
	moreTitle: string;
	more: Item[];
	priceTitle: string;
	price: string;
	faqTitle: string;
	faq: { q: string; a: string; link?: { label: string; href: string } }[];
	soon: string;
	soonShort: string;
	support: string;
	supportLink: string;
	privacy: string;
	terms: string;
	dl: { title: string; lead: string; screensTitle: string; back: string };
}

export const copy: Record<Lang, Copy> = {
	fr: {
		title: 'Dominoland — trace la chaîne de dominos, découvre le dessin',
		description: "Trace des lignes de dominos au doigt, lance la vague : les pièces tombées forment un dessin. Le Tracé, 1000 niveaux de rythme et un chemin infini. Gratuit, sans pub ni achat. Bientôt sur iPhone et Android.",
		kicker: 'Jeu mobile · iPhone et Android',
		tagline: 'Dessine la chaîne de dominos',
		intro: "Trace des lignes de dominos au doigt, lance la vague, et les pièces tombées s'assemblent en un dessin. Trois façons de jouer : le Tracé, le Rythme et le Chemin infini.",
		story: "Dominoland, c'est le plaisir de la réaction en chaîne. Tu dessines au doigt une ligne de dominos, tu lances la vague, et les pièces qui tombent s'assemblent en un dessin qui s'anime.",
		traceTitle: 'Le Tracé',
		trace: [
			{ title: '27 dessins cachés', body: 'Vingt-sept tableaux à résoudre, chacun avec son dessin caché : un soleil, un chat, une fusée, un dragon…' },
			{ title: 'Trace, puis lance', body: "Trace tes lignes depuis le domino doré jusqu'aux morceaux de l'image, puis touche Lancer. Une ligne peut se séparer en deux, et un morceau tombé passe la vague à son tour." },
			{ title: 'Pas de chrono', body: "Si la chaîne s'arrête, tes lignes restent. Complète-les, annule le dernier trait ou efface tout, et relance." },
			{ title: 'Trois étoiles', body: 'Chaque tableau te donne une boîte de dominos. Découvre le dessin pour une étoile ; fais-le avec peu de dominos pour la deuxième et la troisième. Avec trois étoiles, le jeu te montre le minimum connu.' },
			{ title: 'Des mécanismes', body: "Au fil des tableaux : l'eau et les ponts, la bille et son levier, la catapulte à tourner, le plateau tournant, le pont-levis à attendre, les vagues de couleurs et la passerelle à deux étages." },
		],
		galleryTitle: 'Le jeu en images',
		shotsAlt: [
			"Tracé 1 : la boîte de 30 dominos, le domino doré et les morceaux de l'image à atteindre.",
			'Trois étoiles : la vague a fait tomber les morceaux, et un soleil souriant apparaît.',
			"Le Rythme : la vague court le long d'un parcours en zigzag, une flèche montre le geste à faire.",
			'Chaîne parfaite : au bout du parcours, une lune se dessine.',
			"Le Chemin infini : des lignes de dominos de toutes les couleurs, et « La chaîne s'arrête ! »",
		],
		rhythmTitle: 'Le Rythme',
		rhythm: [
			{ title: '1000 niveaux', body: '40 mondes de 25 niveaux, dans 12 décors : jardin, plage, neige, désert, ville, bonbons, forêt, nuit, volcan, océan, ferme et cristaux.' },
			{ title: 'Au bon moment', body: 'La vague court le long du parcours. À chaque trou, glisse le doigt dans le sens de la flèche, au bon moment : « Parfait », « Bien » ou « De justesse ». Un geste bien lancé compte double.' },
			{ title: 'Chaque niveau sa musique', body: "Jouée avec de vrais instruments : chaque geste réussi joue sa note. Au bout du parcours, un dessin se découvre. Et les mondes apportent leurs nouveautés : la spirale, le moulin, la fontaine, la grande roue, le petit train…" },
		],
		moreTitle: 'Et aussi',
		more: [
			{ title: 'Le Chemin infini', body: "Un parcours sans fin, qui change de musique à chaque dessin. Va le plus loin possible : un seul arrêt, et c'est fini. Ton record reste." },
			{ title: 'Un parc pour accueil', body: 'Un parc en 3D, où chaque mode a sa porte.' },
			{ title: 'Sans compte, hors ligne', body: 'Le jeu se joue sans internet, et ta progression reste sur ton téléphone. En français, anglais, espagnol, allemand et italien.' },
		],
		priceTitle: 'Gratuit, sans pub',
		price: "Le jeu est gratuit. Pas de publicité, pas d'achat intégré, pas de compte : tu joues, c'est tout.",
		faqTitle: 'Questions',
		faq: [
			{ q: 'Quand sort le jeu ?', a: "Bientôt, sur l'App Store pour iPhone et sur Google Play pour Android. Cette page le dira dès sa sortie." },
			{ q: 'Faut-il une connexion ?', a: "Non, le jeu se joue hors ligne. Quand le téléphone est connecté, le jeu regarde au lancement s'il existe une version plus récente, et envoie des statistiques d'usage sans identifiant.", link: { label: 'Politique de confidentialité', href: '/dominoland/confidentialite/' } },
			{ q: 'Comment garder ma progression ?', a: "Elle est enregistrée sur ton téléphone, sans compte. Si la sauvegarde de ton téléphone est activée, elle en garde une copie." },
			{ q: 'À partir de quel âge ?', a: "Le jeu s'adresse à tout le monde, à partir de 13 ans." },
			{ q: 'Dans quelles langues ?', a: 'En français, anglais, espagnol, allemand et italien. Le jeu suit la langue du téléphone ; tu peux la changer dans les Options.' },
		],
		soon: "Bientôt sur l'App Store et Google Play",
		soonShort: 'Bientôt',
		support: 'Une question, un souci ?',
		supportLink: 'Écris-nous',
		privacy: 'Politique de confidentialité',
		terms: "Conditions d'utilisation",
		dl: {
			title: 'Télécharger Dominoland',
			lead: 'Trace des lignes de dominos, lance la vague : les pièces tombées font un dessin.',
			screensTitle: 'Le jeu en images',
			back: 'Tout sur le jeu',
		},
	},
	en: {
		title: 'Dominoland — draw the domino chain, reveal the picture',
		description: 'Draw lines of dominoes with your finger, start the wave: the fallen pieces make a picture. The Trace, 1000 rhythm levels and an endless path. Free, no ads, no purchases. Coming soon to iPhone and Android.',
		kicker: 'Mobile game · iPhone and Android',
		tagline: 'Draw the domino chain',
		intro: 'Draw lines of dominoes with your finger, start the wave, and the fallen pieces come together into a picture. Three ways to play: The Trace, Rhythm and the Endless path.',
		story: 'Dominoland is the joy of a chain reaction. Draw a line of dominoes with your finger, start the wave, and the pieces that fall come together into a picture that comes to life.',
		traceTitle: 'The Trace',
		trace: [
			{ title: '27 hidden pictures', body: 'Twenty-seven puzzles to solve, each with its hidden picture: a sun, a cat, a rocket, a dragon…' },
			{ title: 'Draw, then go', body: 'Draw your lines from the gold domino to the pieces of the picture, then tap Go. A line can split in two, and a fallen piece passes the wave on.' },
			{ title: 'No timer', body: 'If the chain stops, your lines stay. Finish them, undo the last stroke or clear them all, and go again.' },
			{ title: 'Three stars', body: 'Each puzzle gives you a box of dominoes. Reveal the picture for one star; use few dominoes for the second and the third. With three stars, the game shows you the best known minimum.' },
			{ title: 'Contraptions', body: 'As you go: water and bridges, the marble and its lever, the catapult to turn, the turntable, the drawbridge to wait for, waves of colours and the two-level deck.' },
		],
		galleryTitle: 'The game in pictures',
		shotsAlt: [
			'Trace 1: the box of 30 dominoes, the gold domino and the pieces of the picture to reach.',
			'Three stars: the wave has toppled the pieces, and a smiling sun appears.',
			'Rhythm: the wave runs along a zigzag course, an arrow shows the flick to make.',
			'Perfect chain: at the end of the course, a moon appears.',
			'The Endless path: lines of dominoes in every colour, and "The chain stops!"',
		],
		rhythmTitle: 'Rhythm',
		rhythm: [
			{ title: '1000 levels', body: '40 worlds of 25 levels, across 12 settings: garden, beach, snow, desert, city, candy, forest, night, volcano, ocean, farm and crystals.' },
			{ title: 'Right on time', body: 'The wave runs along the course. At each gap, swipe the way the arrow points, right on time: "Perfect", "Good" or "Just in time". A well-aimed flick counts double.' },
			{ title: 'A tune for every level', body: 'Played with real instruments: every good flick plays its note. At the end of the course, a picture appears. And the worlds bring new things: the spiral, the windmill, the fountain, the big wheel, the little train…' },
		],
		moreTitle: 'And also',
		more: [
			{ title: 'The Endless path', body: 'A course with no end, with a new tune at each picture. Go as far as you can: one stop and it is over. Your best score stays.' },
			{ title: 'A park to start', body: 'A 3D park as the home screen, where each mode has its gate.' },
			{ title: 'No account, offline', body: 'The game plays with no internet, and your progress stays on your phone. In English, French, Spanish, German and Italian.' },
		],
		priceTitle: 'Free, no ads',
		price: 'The game is free. No ads, no in-app purchases, no account: you just play.',
		faqTitle: 'Questions',
		faq: [
			{ q: 'When is it out?', a: 'Soon, on the App Store for iPhone and on Google Play for Android. This page will say so the day it is out.' },
			{ q: 'Do I need a connection?', a: 'No, the game plays offline. When your phone is online, the game checks at launch for a newer version, and sends usage statistics with no ID.', link: { label: 'Privacy policy', href: '/en/dominoland/confidentialite/' } },
			{ q: 'How do I keep my progress?', a: "It is saved on your phone, with no account. If your phone's backup is on, it keeps a copy." },
			{ q: 'What age is it for?', a: 'The game is for everyone, aged 13 and up.' },
			{ q: 'Which languages?', a: "English, French, Spanish, German and Italian. The game follows your phone's language; you can change it in Options." },
		],
		soon: 'Coming soon to the App Store and Google Play',
		soonShort: 'Coming soon',
		support: 'A question, a problem?',
		supportLink: 'Write to us',
		privacy: 'Privacy policy',
		terms: 'Terms of use',
		dl: {
			title: 'Download Dominoland',
			lead: 'Draw lines of dominoes, start the wave: the fallen pieces make a picture.',
			screensTitle: 'The game in pictures',
			back: 'All about the game',
		},
	},
	es: {
		title: 'Dominoland — traza la cadena de fichas, descubre el dibujo',
		description: 'Traza con el dedo líneas de fichas, lanza la ola: las piezas caídas forman un dibujo. El Trazo, 1000 niveles de ritmo y un camino infinito. Gratis, sin anuncios ni compras. Muy pronto en iPhone y Android.',
		kicker: 'Juego para móvil · iPhone y Android',
		tagline: 'Dibuja la cadena de dominó',
		intro: 'Traza con el dedo líneas de fichas, lanza la ola, y las piezas caídas se juntan en un dibujo. Tres formas de jugar: El Trazo, Ritmo y el Camino infinito.',
		story: 'Dominoland es el placer de la reacción en cadena. Dibujas con el dedo una línea de fichas, lanzas la ola, y las piezas que caen se juntan en un dibujo que cobra vida.',
		traceTitle: 'El Trazo',
		trace: [
			{ title: '27 dibujos escondidos', body: 'Veintisiete tableros que resolver, cada uno con su dibujo escondido: un sol, un gato, un cohete, un dragón…' },
			{ title: 'Traza y lanza', body: 'Traza tus líneas desde la ficha dorada hasta las piezas de la imagen y toca Lanzar. Una línea puede dividirse en dos, y una pieza caída pasa la ola a su vez.' },
			{ title: 'Sin reloj', body: 'Si la cadena se para, tus líneas se quedan. Complétalas, deshaz el último trazo o bórralo todo, y vuelve a lanzar.' },
			{ title: 'Tres estrellas', body: 'Cada tablero te da una caja de fichas. Descubre el dibujo para una estrella; hazlo con pocas fichas para la segunda y la tercera. Con tres estrellas, el juego te muestra el mínimo conocido.' },
			{ title: 'Mecanismos', body: 'Por el camino: el agua y los puentes, la canica y su palanca, la catapulta que girar, el plato giratorio, el puente levadizo que esperar, las olas de colores y la pasarela de dos pisos.' },
		],
		galleryTitle: 'El juego en imágenes',
		shotsAlt: [
			'Trazo 1: la caja de 30 fichas, la ficha dorada y las piezas de la imagen que alcanzar.',
			'Tres estrellas: la ola ha tumbado las piezas, y aparece un sol sonriente.',
			'Ritmo: la ola recorre un camino en zigzag, una flecha muestra el gesto que hacer.',
			'Cadena perfecta: al final del camino, se dibuja una luna.',
			'El Camino infinito: líneas de fichas de todos los colores, y «¡La cadena se para!»',
		],
		rhythmTitle: 'Ritmo',
		rhythm: [
			{ title: '1000 niveles', body: '40 mundos de 25 niveles, en 12 escenarios: jardín, playa, nieve, desierto, ciudad, dulces, bosque, noche, volcán, océano, granja y cristales.' },
			{ title: 'Justo a tiempo', body: 'La ola recorre el camino. En cada hueco, desliza el dedo hacia donde apunta la flecha, justo a tiempo: «¡Perfecto!», «¡Bien!» o «Por poco». Un toque bien dado vale doble.' },
			{ title: 'Cada nivel, su música', body: 'Tocada con instrumentos de verdad: cada gesto acertado toca su nota. Al final del camino se descubre un dibujo. Y los mundos traen sus novedades: la espiral, el molino, la fuente, la noria, el trenecito…' },
		],
		moreTitle: 'Y además',
		more: [
			{ title: 'El Camino infinito', body: 'Un camino sin fin, que cambia de música en cada dibujo. Llega lo más lejos posible: una parada y se acabó. Tu récord se queda.' },
			{ title: 'Un parque de inicio', body: 'Un parque en 3D como pantalla de inicio, donde cada modo tiene su puerta.' },
			{ title: 'Sin cuenta, sin conexión', body: 'El juego se juega sin internet, y tu progreso se queda en tu teléfono. En español, francés, inglés, alemán e italiano.' },
		],
		priceTitle: 'Gratis, sin anuncios',
		price: 'El juego es gratis. Sin anuncios, sin compras integradas, sin cuenta: solo juegas.',
		faqTitle: 'Preguntas',
		faq: [
			{ q: '¿Cuándo sale el juego?', a: 'Muy pronto, en el App Store para iPhone y en Google Play para Android. Esta página lo dirá en cuanto salga.' },
			{ q: '¿Hace falta conexión?', a: 'No, el juego se juega sin conexión. Cuando el teléfono está conectado, el juego mira al abrirse si hay una versión más reciente, y envía estadísticas de uso sin identificador.', link: { label: 'Política de privacidad', href: '/es/dominoland/confidentialite/' } },
			{ q: '¿Cómo guardo mi progreso?', a: 'Se guarda en tu teléfono, sin cuenta. Si la copia de seguridad de tu teléfono está activada, guarda una copia.' },
			{ q: '¿Para qué edad es?', a: 'El juego es para todo el mundo, a partir de 13 años.' },
			{ q: '¿En qué idiomas?', a: 'En español, francés, inglés, alemán e italiano. El juego sigue el idioma del teléfono; puedes cambiarlo en Opciones.' },
		],
		soon: 'Muy pronto en el App Store y Google Play',
		soonShort: 'Próximamente',
		support: '¿Una pregunta, un problema?',
		supportLink: 'Escríbenos',
		privacy: 'Política de privacidad',
		terms: 'Condiciones de uso',
		dl: {
			title: 'Descargar Dominoland',
			lead: 'Traza líneas de fichas, lanza la ola: las piezas caídas forman un dibujo.',
			screensTitle: 'El juego en imágenes',
			back: 'Todo sobre el juego',
		},
	},
	de: {
		title: 'Dominoland — zeichne die Dominokette, deck das Bild auf',
		description: 'Zeichne mit dem Finger Linien aus Dominosteinen, starte die Welle: Die gefallenen Teile ergeben ein Bild. Die Spur, 1000 Rhythmus-Level und ein Endlosweg. Kostenlos, ohne Werbung und Käufe. Bald für iPhone und Android.',
		kicker: 'Handyspiel · iPhone und Android',
		tagline: 'Zeichne die Dominokette',
		intro: 'Zeichne mit dem Finger Linien aus Dominosteinen, starte die Welle, und die gefallenen Teile setzen sich zu einem Bild zusammen. Drei Arten zu spielen: Die Spur, Rhythmus und der Endlosweg.',
		story: 'Dominoland ist die Freude an der Kettenreaktion. Du zeichnest mit dem Finger eine Linie aus Dominosteinen, startest die Welle, und die fallenden Teile setzen sich zu einem Bild zusammen, das lebendig wird.',
		traceTitle: 'Die Spur',
		trace: [
			{ title: '27 versteckte Bilder', body: 'Siebenundzwanzig Rätsel, jedes mit seinem versteckten Bild: eine Sonne, eine Katze, eine Rakete, ein Drache…' },
			{ title: 'Zeichnen, dann los', body: 'Zeichne deine Linien vom goldenen Stein bis zu den Teilen des Bildes, dann tippe auf Los. Eine Linie kann sich teilen, und ein gefallenes Teil gibt die Welle weiter.' },
			{ title: 'Keine Uhr', body: 'Stoppt die Kette, bleiben deine Linien. Ergänze sie, nimm den letzten Strich zurück oder lösche alles, und starte neu.' },
			{ title: 'Drei Sterne', body: 'Jedes Rätsel gibt dir eine Schachtel Steine. Deck das Bild auf für einen Stern; schaffe es mit wenigen Steinen für den zweiten und dritten. Mit drei Sternen zeigt dir das Spiel das bekannte Minimum.' },
			{ title: 'Mechanismen', body: 'Nach und nach: Wasser und Brücken, die Murmel und ihr Hebel, das Katapult zum Drehen, die Drehscheibe, die Zugbrücke, auf die man warten muss, Wellen in Farben und die Brücke mit zwei Ebenen.' },
		],
		galleryTitle: 'Das Spiel in Bildern',
		shotsAlt: [
			'Spur 1: die Schachtel mit 30 Steinen, der goldene Stein und die Teile des Bildes, die erreicht werden müssen.',
			'Drei Sterne: Die Welle hat die Teile umgeworfen, und eine lächelnde Sonne erscheint.',
			'Rhythmus: Die Welle läuft eine Zickzackstrecke entlang, ein Pfeil zeigt die Wischbewegung.',
			'Perfekte Kette: Am Ende der Strecke erscheint ein Mond.',
			'Der Endlosweg: Linien aus Steinen in allen Farben, und „Die Kette stoppt!“',
		],
		rhythmTitle: 'Rhythmus',
		rhythm: [
			{ title: '1000 Level', body: '40 Welten zu je 25 Level, in 12 Landschaften: Garten, Strand, Schnee, Wüste, Stadt, Süßes, Wald, Nacht, Vulkan, Ozean, Bauernhof und Kristalle.' },
			{ title: 'Genau im Takt', body: 'Die Welle läuft die Strecke entlang. An jeder Lücke wischst du in Pfeilrichtung, genau im Takt: „Perfekt!“, „Gut!“ oder „Gerade noch“. Ein guter Schnipp zählt doppelt.' },
			{ title: 'Jedes Level seine Musik', body: 'Gespielt mit echten Instrumenten: Jeder gelungene Schnipp spielt seine Note. Am Ende der Strecke erscheint ein Bild. Und die Welten bringen Neues: die Spirale, die Windmühle, den Brunnen, das Riesenrad, die kleine Bahn…' },
		],
		moreTitle: 'Außerdem',
		more: [
			{ title: 'Der Endlosweg', body: 'Eine Strecke ohne Ende, mit neuer Musik bei jedem Bild. Komm so weit wie möglich: ein Stopp, und es ist vorbei. Dein Rekord bleibt.' },
			{ title: 'Ein Park zum Start', body: 'Ein 3D-Park als Startbildschirm, in dem jeder Modus sein Tor hat.' },
			{ title: 'Ohne Konto, offline', body: 'Das Spiel läuft ohne Internet, und dein Fortschritt bleibt auf deinem Handy. Auf Deutsch, Französisch, Englisch, Spanisch und Italienisch.' },
		],
		priceTitle: 'Kostenlos, ohne Werbung',
		price: 'Das Spiel ist kostenlos. Keine Werbung, keine In-App-Käufe, kein Konto: Du spielst einfach.',
		faqTitle: 'Fragen',
		faq: [
			{ q: 'Wann erscheint das Spiel?', a: 'Bald, im App Store für iPhone und bei Google Play für Android. Diese Seite sagt es, sobald es da ist.' },
			{ q: 'Brauche ich eine Internetverbindung?', a: 'Nein, das Spiel läuft offline. Ist dein Handy online, prüft das Spiel beim Start, ob es eine neuere Version gibt, und sendet Nutzungsstatistiken ohne Kennung.', link: { label: 'Datenschutzerklärung', href: '/de/dominoland/confidentialite/' } },
			{ q: 'Wie behalte ich meinen Fortschritt?', a: 'Er wird auf deinem Handy gespeichert, ohne Konto. Ist die Datensicherung deines Handys an, behält sie eine Kopie.' },
			{ q: 'Ab welchem Alter?', a: 'Das Spiel ist für alle, ab 13 Jahren.' },
			{ q: 'Welche Sprachen?', a: 'Deutsch, Französisch, Englisch, Spanisch und Italienisch. Das Spiel folgt der Sprache deines Handys; in den Optionen kannst du sie ändern.' },
		],
		soon: 'Bald im App Store und bei Google Play',
		soonShort: 'Demnächst',
		support: 'Eine Frage, ein Problem?',
		supportLink: 'Schreib uns',
		privacy: 'Datenschutzerklärung',
		terms: 'Nutzungsbedingungen',
		dl: {
			title: 'Dominoland herunterladen',
			lead: 'Zeichne Dominolinien, starte die Welle: Die gefallenen Teile ergeben ein Bild.',
			screensTitle: 'Das Spiel in Bildern',
			back: 'Alles über das Spiel',
		},
	},
	it: {
		title: 'Dominoland — traccia la catena di tessere, scopri il disegno',
		description: "Traccia col dito linee di tessere, lancia l'onda: i pezzi caduti formano un disegno. La Traccia, 1000 livelli di ritmo e un percorso infinito. Gratis, senza pubblicità né acquisti. Presto su iPhone e Android.",
		kicker: 'Gioco per cellulare · iPhone e Android',
		tagline: 'Disegna la catena di domino',
		intro: "Traccia col dito linee di tessere, lancia l'onda, e i pezzi caduti si uniscono in un disegno. Tre modi di giocare: La Traccia, Ritmo e il Percorso infinito.",
		story: "Dominoland è il piacere della reazione a catena. Disegni col dito una linea di tessere, lanci l'onda, e i pezzi che cadono si uniscono in un disegno che prende vita.",
		traceTitle: 'La Traccia',
		trace: [
			{ title: '27 disegni nascosti', body: 'Ventisette quadri da risolvere, ognuno con il suo disegno nascosto: un sole, un gatto, un razzo, un drago…' },
			{ title: 'Traccia, poi via', body: "Traccia le tue linee dalla tessera dorata fino ai pezzi dell'immagine, poi tocca Via. Una linea può dividersi in due, e un pezzo caduto passa l'onda a sua volta." },
			{ title: 'Niente cronometro', body: "Se la catena si ferma, le tue linee restano. Completale, annulla l'ultimo tratto o cancella tutto, e rilancia." },
			{ title: 'Tre stelle', body: 'Ogni quadro ti dà una scatola di tessere. Scopri il disegno per una stella; fallo con poche tessere per la seconda e la terza. Con tre stelle, il gioco ti mostra il minimo noto.' },
			{ title: 'Meccanismi', body: "Strada facendo: l'acqua e i ponti, la biglia e la sua leva, la catapulta da girare, il piatto girevole, il ponte levatoio da aspettare, le onde di colori e la passerella a due piani." },
		],
		galleryTitle: 'Il gioco in immagini',
		shotsAlt: [
			"Traccia 1: la scatola di 30 tessere, la tessera dorata e i pezzi dell'immagine da raggiungere.",
			"Tre stelle: l'onda ha fatto cadere i pezzi, e appare un sole sorridente.",
			"Ritmo: l'onda corre lungo un percorso a zigzag, una freccia mostra il gesto da fare.",
			'Catena perfetta: alla fine del percorso, si disegna una luna.',
			'Il Percorso infinito: linee di tessere di tutti i colori, e «La catena si ferma!»',
		],
		rhythmTitle: 'Ritmo',
		rhythm: [
			{ title: '1000 livelli', body: '40 mondi da 25 livelli, in 12 ambienti: giardino, spiaggia, neve, deserto, città, dolci, foresta, notte, vulcano, oceano, fattoria e cristalli.' },
			{ title: 'Al momento giusto', body: "L'onda corre lungo il percorso. A ogni buco, scorri il dito nel verso della freccia, al momento giusto: «Perfetto!», «Bene!» o «Per un pelo». Un colpo ben dato vale doppio." },
			{ title: 'Ogni livello la sua musica', body: 'Suonata con strumenti veri: ogni gesto riuscito suona la sua nota. Alla fine del percorso si scopre un disegno. E i mondi portano le loro novità: la spirale, il mulino, la fontana, la ruota panoramica, il trenino…' },
		],
		moreTitle: 'E poi',
		more: [
			{ title: 'Il Percorso infinito', body: 'Un percorso senza fine, che cambia musica a ogni disegno. Vai più lontano che puoi: uno stop ed è finita. Il tuo record resta.' },
			{ title: 'Un parco come inizio', body: 'Un parco in 3D come schermata iniziale, dove ogni modalità ha la sua porta.' },
			{ title: 'Senza account, offline', body: 'Il gioco funziona senza internet, e i tuoi progressi restano sul telefono. In italiano, francese, inglese, spagnolo e tedesco.' },
		],
		priceTitle: 'Gratis, senza pubblicità',
		price: 'Il gioco è gratuito. Niente pubblicità, niente acquisti in-app, niente account: giochi e basta.',
		faqTitle: 'Domande',
		faq: [
			{ q: 'Quando esce il gioco?', a: 'Presto, su App Store per iPhone e su Google Play per Android. Questa pagina lo dirà appena esce.' },
			{ q: 'Serve una connessione?', a: "No, il gioco funziona offline. Quando il telefono è connesso, all'avvio il gioco controlla se c'è una versione più recente, e invia statistiche d'uso senza identificativo.", link: { label: 'Informativa sulla privacy', href: '/it/dominoland/confidentialite/' } },
			{ q: 'Come conservo i miei progressi?', a: 'Sono salvati sul tuo telefono, senza account. Se il backup del telefono è attivo, ne tiene una copia.' },
			{ q: 'Per quale età?', a: 'Il gioco è per tutti, dai 13 anni in su.' },
			{ q: 'In quali lingue?', a: 'In italiano, francese, inglese, spagnolo e tedesco. Il gioco segue la lingua del telefono; puoi cambiarla nelle Opzioni.' },
		],
		soon: 'Presto su App Store e Google Play',
		soonShort: 'Prossimamente',
		support: 'Una domanda, un problema?',
		supportLink: 'Scrivici',
		privacy: 'Informativa sulla privacy',
		terms: "Condizioni d'uso",
		dl: {
			title: 'Scarica Dominoland',
			lead: "Traccia linee di tessere, lancia l'onda: i pezzi caduti formano un disegno.",
			screensTitle: 'Il gioco in immagini',
			back: 'Tutto sul gioco',
		},
	},
};
