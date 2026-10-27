// Dragon's Gems Swipe, the mobile app: its product page and download page in five languages.
// The texts follow the store listings (DragonsGemsSwipe docs/store.md, "Listing copy"); the cave, the summit
// challenge and the shop prices come from the app itself. The web mini-game is /jeux/eclats/.

export type Lang = 'fr' | 'en' | 'es' | 'de' | 'it';

export const APP_NAME = "Dragon's Gems Swipe";
export const ANDROID_ID = 'com.ludivenstudio.dragonsgems';

/** The store listings, once the game is on them: the badges link there instead of « coming soon ». */
export const STORES: { play?: string; apple?: string } = {};

export const LANDING_PATHS: Record<Lang, string> = {
	fr: '/dragons-gems/',
	en: '/en/dragons-gems/',
	es: '/es/dragons-gems/',
	de: '/de/dragons-gems/',
	it: '/it/dragons-gems/',
};

export const DOWNLOAD_PATHS: Record<Lang, string> = {
	fr: '/dragons-gems/telecharger/',
	en: '/en/dragons-gems/download/',
	es: '/es/dragons-gems/descargar/',
	de: '/de/dragons-gems/herunterladen/',
	it: '/it/dragons-gems/scarica/',
};

/** The web game, its Android test build, the making-of and the privacy policy (French and English only). */
export const WEB_GAME = '/jeux/eclats/';
export const TEST_APK = '/jeux/eclats/test/';
export const MAKING_OF: Record<Lang, string> = { fr: '/work/dragons-gems/', en: '/en/work/dragons-gems/', es: '/en/work/dragons-gems/', de: '/en/work/dragons-gems/', it: '/en/work/dragons-gems/' };
export const PRIVACY: Record<Lang, string> = { fr: '/dragons-gems/confidentialite/', en: '/en/dragons-gems/confidentialite/', es: '/en/dragons-gems/confidentialite/', de: '/en/dragons-gems/confidentialite/', it: '/en/dragons-gems/confidentialite/' };
export const CONTACT: Record<Lang, string> = { fr: '/contact/', en: '/en/contact/', es: '/en/contact/', de: '/en/contact/', it: '/en/contact/' };

const A = '/assets/dragons-gems';
export const ICON = `${A}/icon.webp`;
export const feature = (l: Lang): string => `${A}/feature-${l}.webp`;
export const ogImage = (l: Lang): string => `${A}/og-${l}.jpg`;
export const video = (l: Lang): { src: string; poster: string } => ({ src: `${A}/video-${l}.mp4`, poster: `${A}/video-${l}.webp` });
/** The App Store screenshots, captioned in each language: a level, the story, the map, the breath, the daily. */
export const screens = (l: Lang): string[] => [1, 2, 3, 4, 5].map((n) => `${A}/screen-${n}-${l}.webp`);

/** French wants a no-break space before : ? ! ; and inside « ». */
const NBSP = String.fromCharCode(160);
export const typo = (l: Lang, s: string): string => (l === 'fr' ? s.replace(/ ([:?!;»])/g, `${NBSP}$1`).replace(/« /g, `«${NBSP}`) : s);

interface Item { title: string; body: string }

export interface Copy {
	title: string;
	description: string;
	kicker: string;
	tagline: string;
	intro: string;
	story: string;
	featuresTitle: string;
	features: Item[];
	modesTitle: string;
	modes: Item[];
	galleryTitle: string;
	shotsAlt: string[];
	videoLabel: string;
	priceTitle: string;
	price: string[];
	faqTitle: string;
	faq: { q: string; a: string }[];
	soon: string;
	soonShort: string;
	playWeb: string;
	playWebNote: string;
	testApk: string;
	testApkNote: string;
	download: string;
	makingOfTitle: string;
	makingOf: string;
	makingOfCta: string;
	support: string;
	supportLink: string;
	privacy: string;
	dl: { title: string; kicker: string; lead: string; waiting: string; screensTitle: string; back: string };
}

export const copy: Record<Lang, Copy> = {
	fr: {
		title: "Dragon's Gems Swipe — le puzzle de gemmes du bébé dragon",
		description: "Glisse le plateau, fais exploser les gemmes et remplis le trésor de Bijou, le bébé dragon : 500 niveaux, un défi du jour, un mode infini. Bientôt sur iPhone, iPad et Android.",
		kicker: 'Jeu mobile · iPhone, iPad et Android',
		tagline: 'Puzzle de gemmes à glisser',
		intro: 'Aide Bijou, un bébé dragon né sans trésor, à traverser cinq mondes : 250 niveaux à glisser, un défi du jour pour tout le monde et un mode infini.',
		story: "Bijou vient d'éclore, et sa grotte est vide : pas une pièce, pas une gemme. Or chez les dragons, on ne grandit qu'avec son trésor. Aide-le : glisse le plateau, fais exploser les gemmes et ouvre les coffres.",
		featuresTitle: 'Comment on joue',
		features: [
			{ title: 'Glisse, ça explose', body: "Un geste, et tout le plateau glisse jusqu'au bord. Trois gemmes de la même couleur qui se touchent explosent, et les explosions s'enchaînent." },
			{ title: "Jusqu'à la couronne", body: 'Quatre gemmes ou plus fusionnent en une gemme plus forte : gemme chargée, joyau, puis couronne, qui fait sauter toutes les gemmes de sa couleur. Quatre gemmes en carré lancent une comète vers un coffre.' },
			{ title: 'Les coffres', body: "Une explosion juste à côté d'un coffre l'ouvre en grand. Gagne le niveau, et son butin rejoint le trésor de Bijou." },
			{ title: 'Le souffle de Bijou', body: 'Chaque gemme détruite remplit sa jauge. Pleine, touche Bijou : il crache trois boules de feu, d’abord sur les coffres.' },
			{ title: 'Cinq contrées, 500 niveaux', body: 'La prairie, les coffres-forts, les rochers, le glacier et la cinquième gemme, chacune avec sa surprise. Puis 250 niveaux experts dans les profondeurs. Les 10 premiers niveaux apprennent le jeu pas à pas.' },
			{ title: 'La grotte de Bijou', body: 'Vingt trésors à découvrir, un tous les 25 niveaux ou achetés avec tes pièces, et trois merveilles, bien plus chères, pour les plus patients.' },
		],
		modesTitle: 'Et chaque jour',
		modes: [
			{ title: 'Le défi du jour', body: 'Le même plateau pour tout le monde, un seul essai pour ouvrir ses coffres en le moins de coups possible, et un classement mondial partagé avec le jeu du site.' },
			{ title: 'Le mode infini', body: 'Chaque gemme rapporte des points : tiens le plus longtemps possible et vise le classement mondial.' },
			{ title: 'Le défi du sommet', body: 'Après le niveau 250 : le mode infini sur une grille fixe, la même pour tous, et un classement de tous les temps.' },
			{ title: 'Un cadeau chaque jour', body: "Des pièces, un peu plus chaque jour d'affilée, jusqu'au septième." },
		],
		galleryTitle: "L'appli en images",
		shotsAlt: ['Un niveau : glisse les gemmes, déclenche les explosions', "L'histoire de Bijou, au premier lancement", 'La carte des cinq contrées', 'Le souffle du petit dragon', 'Le défi du jour'],
		videoLabel: 'Le jeu en vidéo',
		priceTitle: 'Gratuit',
		price: [
			'Le jeu est gratuit. Tu as cinq cœurs : un niveau perdu en coûte un, et il en revient un toutes les 30 minutes.',
			'Des vidéos, toujours à ton choix, offrent un cœur, une partie qui continue ou des pièces. La boutique vend les cœurs illimités pour toujours (6,99 €) et des pièces : 2 000 pour 1,99 €, 6 000 pour 4,99 €, 15 000 pour 9,99 €.',
		],
		faqTitle: 'Questions',
		faq: [
			{ q: 'Quand sort le jeu ?', a: "Bientôt sur l'App Store et Google Play. En attendant, la version web se joue tout de suite dans le navigateur, et les testeurs Android ont une version de test." },
			{ q: 'Faut-il une connexion ?', a: 'Non pour les niveaux, qui se jouent hors ligne. Le défi du jour et les classements en demandent une.' },
			{ q: 'Comment garder ma progression ?', a: 'Elle est gardée sur ton téléphone. Connecte-toi avec Google ou Apple, si tu veux, pour la retrouver sur tous tes appareils ; tu peux supprimer ton compte quand tu veux depuis les Réglages.' },
			{ q: 'Sur quels appareils, dans quelles langues ?', a: 'iPhone, iPad (en plein écran) et Android, en français, anglais, espagnol, allemand et italien.' },
			{ q: 'Et sur ordinateur ?', a: 'Le jeu existe aussi sur ludiven-studio.fr : 100 niveaux, le mode libre et le même défi du jour, avec le même classement que l’appli.' },
		],
		soon: "Bientôt sur l'App Store et Google Play",
		soonShort: 'Bientôt',
		playWeb: 'Jouer dans le navigateur',
		playWebNote: 'La version web, tout de suite : 100 niveaux et le défi du jour.',
		testApk: 'Version de test Android',
		testApkNote: 'Pour les testeurs : le dernier APK de test, à installer à la main.',
		download: 'Télécharger',
		makingOfTitle: 'Comment le jeu est fait',
		makingOf: 'Le moteur du jeu, la parité entre le site et l’appli, les sons synthétisés, les captures et vidéos tournées par un robot : la fiche projet raconte les coulisses.',
		makingOfCta: 'Lire la fiche projet',
		support: 'Une question, un souci ?',
		supportLink: 'Écris-nous',
		privacy: 'Politique de confidentialité',
		dl: {
			title: "Télécharger Dragon's Gems Swipe",
			kicker: 'Bientôt sur les stores',
			lead: 'Glisse le plateau, fais exploser les gemmes et remplis le trésor du bébé dragon.',
			waiting: "Le jeu arrive bientôt sur l'App Store et Google Play. En attendant :",
			screensTitle: "L'appli en images",
			back: "Tout sur l'appli",
		},
	},
	en: {
		title: "Dragon's Gems Swipe — the baby dragon's gem puzzle",
		description: "Slide the board, blast the gems and fill the treasure of Bijou, the baby dragon: 500 levels, a daily challenge, an endless mode. Coming soon to iPhone, iPad and Android.",
		kicker: 'Mobile game · iPhone, iPad and Android',
		tagline: 'Gem puzzle: slide and blast',
		intro: 'Help Bijou, a baby dragon born without a treasure, cross five lands: 250 levels to slide, a daily challenge shared by everyone and an endless mode.',
		story: 'Bijou has just hatched, and his cave is empty: not one coin, not one gem. But dragons only grow with their treasure. Help him: slide the board, blast the gems and open the chests.',
		featuresTitle: 'How it plays',
		features: [
			{ title: 'Slide and blast', body: 'One swipe and the whole board slides to the edge. Three gems of the same color that touch explode, and the explosions chain.' },
			{ title: 'Up to the crown', body: 'Four gems or more fuse into a stronger gem: a charged gem, a jewel, then a crown, which blasts every gem of its color. Four gems in a square launch a comet at a chest.' },
			{ title: 'The chests', body: "An explosion right next to a chest pops it open. Win the level and its loot goes into Bijou's treasure." },
			{ title: "Bijou's breath", body: 'Every gem destroyed fills his gauge. When it is full, tap Bijou: he breathes three fireballs, chests first.' },
			{ title: 'Five lands, 500 levels', body: 'The meadow, the strongboxes, the rocks, the glacier and the fifth gem, each with its own twist. Then 250 expert levels in the depths. The first 10 levels teach the game step by step.' },
			{ title: "Bijou's cave", body: 'Twenty treasures to find, one every 25 levels or bought with your coins, and three wonders, far dearer, for the most patient.' },
		],
		modesTitle: 'And every day',
		modes: [
			{ title: 'The daily challenge', body: 'The same board for everyone, one try to open its chests in as few moves as you can, and a world leaderboard shared with the web game.' },
			{ title: 'Endless mode', body: 'Every gem scores points: last as long as you can and aim for the world leaderboard.' },
			{ title: 'The summit challenge', body: 'After level 250: endless mode on a fixed board, the same for everyone, with an all-time leaderboard.' },
			{ title: 'A gift every day', body: 'Coins, a little more each day in a row, up to the seventh.' },
		],
		galleryTitle: 'The app in pictures',
		shotsAlt: ['A level: slide the gems, set off the explosions', "Bijou's story, the first time you play", 'The map of the five lands', "The little dragon's breath", 'The daily challenge'],
		videoLabel: 'The game on video',
		priceTitle: 'Free to play',
		price: [
			'The game is free. You have five hearts: a lost level costs one, and one comes back every 30 minutes.',
			'Videos, always your choice, give a heart, a level that plays on or coins. The shop sells unlimited hearts for good (€6.99) and coins: 2,000 for €1.99, 6,000 for €4.99, 15,000 for €9.99 (prices in euros; your store shows yours).',
		],
		faqTitle: 'Questions',
		faq: [
			{ q: 'When does it come out?', a: 'Soon on the App Store and Google Play. Until then, the web version plays right away in your browser, and Android testers have a test build.' },
			{ q: 'Do I need a connection?', a: 'Not for the levels, which play offline. The daily challenge and the leaderboards need one.' },
			{ q: 'How do I keep my progress?', a: 'It is kept on your phone. Sign in with Google or Apple, if you like, to find it on all your devices; you can delete your account whenever you want from Settings.' },
			{ q: 'Which devices, which languages?', a: 'iPhone, iPad (full screen) and Android, in English, French, Spanish, German and Italian.' },
			{ q: 'And on a computer?', a: 'The game also plays on ludiven-studio.fr: 100 levels, free play and the same daily challenge, with the same leaderboard as the app.' },
		],
		soon: 'Coming soon to the App Store and Google Play',
		soonShort: 'Coming soon',
		playWeb: 'Play in your browser',
		playWebNote: 'The web version, right now: 100 levels and the daily challenge.',
		testApk: 'Android test build',
		testApkNote: 'For testers: the latest test APK, installed by hand.',
		download: 'Download',
		makingOfTitle: 'How the game is made',
		makingOf: 'The game engine, the parity between the website and the app, the synthesised sounds, the screenshots and videos shot by a bot: the project page tells the making-of.',
		makingOfCta: 'Read the project page',
		support: 'A question, a problem?',
		supportLink: 'Write to us',
		privacy: 'Privacy policy',
		dl: {
			title: "Download Dragon's Gems Swipe",
			kicker: 'Coming soon to the stores',
			lead: "Slide the board, blast the gems and fill the baby dragon's treasure.",
			waiting: 'The game is coming soon to the App Store and Google Play. Until then:',
			screensTitle: 'The app in pictures',
			back: 'All about the app',
		},
	},
	es: {
		title: "Dragon's Gems Swipe — el puzle de gemas del dragón bebé",
		description: 'Desliza el tablero, haz explotar las gemas y llena el tesoro de Bijou, el dragón bebé: 500 niveles, un reto del día y un modo infinito. Muy pronto en iPhone, iPad y Android.',
		kicker: 'Juego para móvil · iPhone, iPad y Android',
		tagline: 'Puzle de gemas para deslizar',
		intro: 'Ayuda a Bijou, un dragón bebé nacido sin tesoro, a cruzar cinco mundos: 250 niveles para deslizar, un reto del día para todos y un modo infinito.',
		story: 'Bijou acaba de nacer, y su cueva está vacía: ni una moneda, ni una gema. Pero entre los dragones, solo se crece con el tesoro. Ayúdale: desliza el tablero, haz explotar las gemas y abre los cofres.',
		featuresTitle: 'Cómo se juega',
		features: [
			{ title: 'Desliza y explota', body: 'Un gesto, y todo el tablero se desliza hasta el borde. Tres gemas del mismo color que se tocan explotan, y las explosiones se encadenan.' },
			{ title: 'Hasta la corona', body: 'Cuatro gemas o más se fusionan en una gema más fuerte: gema cargada, joya y luego corona, que hace saltar todas las gemas de su color. Cuatro gemas en cuadrado lanzan un cometa hacia un cofre.' },
			{ title: 'Los cofres', body: 'Una explosión justo al lado de un cofre lo abre de par en par. Gana el nivel y su botín se suma al tesoro de Bijou.' },
			{ title: 'El aliento de Bijou', body: 'Cada gema destruida llena su medidor. Cuando está lleno, toca a Bijou: escupe tres bolas de fuego, primero sobre los cofres.' },
			{ title: 'Cinco mundos, 500 niveles', body: 'La pradera, las cajas fuertes, las rocas, el glaciar y la quinta gema, cada uno con su sorpresa. Después, 250 niveles expertos en las profundidades. Los 10 primeros niveles enseñan el juego paso a paso.' },
			{ title: 'La cueva de Bijou', body: 'Veinte tesoros por descubrir, uno cada 25 niveles o comprados con tus monedas, y tres maravillas, mucho más caras, para los más pacientes.' },
		],
		modesTitle: 'Y cada día',
		modes: [
			{ title: 'El reto del día', body: 'El mismo tablero para todos, un solo intento para abrir sus cofres con el menor número de movimientos, y una clasificación mundial compartida con el juego web.' },
			{ title: 'El modo infinito', body: 'Cada gema da puntos: aguanta todo lo que puedas y apunta a la clasificación mundial.' },
			{ title: 'El reto de la cumbre', body: 'Después del nivel 250: el modo infinito en un tablero fijo, el mismo para todos, con una clasificación de todos los tiempos.' },
			{ title: 'Un regalo cada día', body: 'Monedas, un poco más por cada día seguido, hasta el séptimo.' },
		],
		galleryTitle: 'La app en imágenes',
		shotsAlt: ['Un nivel: desliza las gemas, provoca las explosiones', 'La historia de Bijou, la primera vez que juegas', 'El mapa de los cinco mundos', 'El aliento del pequeño dragón', 'El reto del día'],
		videoLabel: 'El juego en vídeo',
		priceTitle: 'Gratis',
		price: [
			'El juego es gratis. Tienes cinco corazones: un nivel perdido cuesta uno, y recuperas uno cada 30 minutos.',
			'Los vídeos, siempre a tu elección, dan un corazón, una partida que continúa o monedas. La tienda vende corazones ilimitados para siempre (6,99 €) y monedas: 2.000 por 1,99 €, 6.000 por 4,99 €, 15.000 por 9,99 €.',
		],
		faqTitle: 'Preguntas',
		faq: [
			{ q: '¿Cuándo sale el juego?', a: 'Muy pronto en el App Store y Google Play. Mientras tanto, la versión web se juega ya en el navegador, y los testers de Android tienen una versión de prueba.' },
			{ q: '¿Hace falta conexión?', a: 'No para los niveles, que se juegan sin conexión. El reto del día y las clasificaciones la necesitan.' },
			{ q: '¿Cómo guardo mi progreso?', a: 'Se guarda en tu teléfono. Inicia sesión con Google o Apple, si quieres, para recuperarlo en todos tus dispositivos; puedes eliminar tu cuenta cuando quieras desde Ajustes.' },
			{ q: '¿En qué dispositivos y en qué idiomas?', a: 'iPhone, iPad (a pantalla completa) y Android, en español, francés, inglés, alemán e italiano.' },
			{ q: '¿Y en el ordenador?', a: 'El juego también está en ludiven-studio.fr: 100 niveles, el modo libre y el mismo reto del día, con la misma clasificación que la app.' },
		],
		soon: 'Muy pronto en el App Store y Google Play',
		soonShort: 'Próximamente',
		playWeb: 'Jugar en el navegador',
		playWebNote: 'La versión web, ahora mismo: 100 niveles y el reto del día.',
		testApk: 'Versión de prueba para Android',
		testApkNote: 'Para los testers: el último APK de prueba, para instalar a mano.',
		download: 'Descargar',
		makingOfTitle: 'Cómo está hecho el juego',
		makingOf: 'El motor del juego, la paridad entre la web y la app, los sonidos sintetizados, las capturas y los vídeos grabados por un robot: la ficha del proyecto cuenta cómo se hizo (en inglés).',
		makingOfCta: 'Leer la ficha del proyecto',
		support: '¿Una pregunta, un problema?',
		supportLink: 'Escríbenos',
		privacy: 'Política de privacidad (en inglés)',
		dl: {
			title: "Descargar Dragon's Gems Swipe",
			kicker: 'Muy pronto en las tiendas',
			lead: 'Desliza el tablero, haz explotar las gemas y llena el tesoro del dragón bebé.',
			waiting: 'El juego llega muy pronto al App Store y a Google Play. Mientras tanto:',
			screensTitle: 'La app en imágenes',
			back: 'Todo sobre la app',
		},
	},
	de: {
		title: "Dragon's Gems Swipe — das Edelstein-Puzzle des Babydrachen",
		description: 'Wisch das Spielfeld, spreng die Edelsteine und füll den Schatz von Bijou, dem Babydrachen: 500 Level, eine Tagesaufgabe und ein Endlosmodus. Bald für iPhone, iPad und Android.',
		kicker: 'Handyspiel · iPhone, iPad und Android',
		tagline: 'Puzzle: Edelsteine wischen',
		intro: 'Hilf Bijou, einem Babydrachen, der ohne Schatz geschlüpft ist, fünf Welten zu durchqueren: 250 Level zum Wischen, eine Tagesaufgabe für alle und ein Endlosmodus.',
		story: 'Bijou ist gerade geschlüpft, und seine Höhle ist leer: keine Münze, kein Edelstein. Doch bei den Drachen wächst man nur mit seinem Schatz. Hilf ihm: Wisch über das Spielfeld, lass die Edelsteine explodieren und öffne die Truhen.',
		featuresTitle: 'So wird gespielt',
		features: [
			{ title: 'Wischen und sprengen', body: 'Einmal wischen, und das ganze Spielfeld rutscht bis zum Rand. Drei Edelsteine derselben Farbe, die sich berühren, explodieren, und die Explosionen verketten sich.' },
			{ title: 'Bis zur Krone', body: 'Vier oder mehr Edelsteine verschmelzen zu einem stärkeren: erst zum geladenen Edelstein, dann zum Juwel, dann zur Krone, die alle Edelsteine ihrer Farbe sprengt. Vier Edelsteine im Quadrat schießen einen Kometen auf eine Truhe.' },
			{ title: 'Die Truhen', body: 'Eine Explosion direkt neben einer Truhe öffnet sie weit. Gewinn das Level, und seine Beute kommt in Bijous Schatz.' },
			{ title: 'Bijous Feueratem', body: 'Jeder zerstörte Edelstein füllt seine Leiste. Ist sie voll, tipp auf Bijou: Er spuckt drei Feuerbälle, zuerst auf die Truhen.' },
			{ title: 'Fünf Welten, 500 Level', body: 'Die Wiese, die Tresore, die Felsen, der Gletscher und der fünfte Edelstein, jede mit ihrer eigenen Überraschung. Danach 250 Expertenlevel in den Tiefen. Die ersten 10 Level bringen dir das Spiel Schritt für Schritt bei.' },
			{ title: 'Bijous Höhle', body: 'Zwanzig Schätze zu entdecken, einer alle 25 Level oder mit deinen Münzen gekauft, und drei Wunder, viel teurer, für die Geduldigsten.' },
		],
		modesTitle: 'Und jeden Tag',
		modes: [
			{ title: 'Die Tagesaufgabe', body: 'Dasselbe Spielfeld für alle, ein einziger Versuch, um seine Truhen mit so wenigen Zügen wie möglich zu öffnen, und eine Weltrangliste, gemeinsam mit dem Webspiel.' },
			{ title: 'Der Endlosmodus', body: 'Jeder Edelstein bringt Punkte: Halte so lange durch wie möglich und greif nach der Weltrangliste.' },
			{ title: 'Die Gipfelaufgabe', body: 'Nach Level 250: der Endlosmodus auf einem festen Spielfeld, für alle gleich, mit einer ewigen Bestenliste.' },
			{ title: 'Jeden Tag ein Geschenk', body: 'Münzen, mit jedem Tag in Folge etwas mehr, bis zum siebten.' },
		],
		galleryTitle: 'Die App in Bildern',
		shotsAlt: ['Ein Level: Edelsteine wischen, Explosionen auslösen', 'Bijous Geschichte beim ersten Start', 'Die Karte der fünf Welten', 'Der Feueratem des kleinen Drachen', 'Die Tagesaufgabe'],
		videoLabel: 'Das Spiel im Video',
		priceTitle: 'Kostenlos',
		price: [
			'Das Spiel ist kostenlos. Du hast fünf Herzen: Ein verlorenes Level kostet eins, und alle 30 Minuten kommt eins zurück.',
			'Videos, immer freiwillig, bringen ein Herz, ein Level, das weitergeht, oder Münzen. Im Shop gibt es unbegrenzte Herzen für immer (6,99 €) und Münzen: 2.000 für 1,99 €, 6.000 für 4,99 €, 15.000 für 9,99 €.',
		],
		faqTitle: 'Fragen',
		faq: [
			{ q: 'Wann erscheint das Spiel?', a: 'Bald im App Store und bei Google Play. Bis dahin läuft die Webversion sofort im Browser, und Android-Tester haben eine Testversion.' },
			{ q: 'Brauche ich eine Internetverbindung?', a: 'Nicht für die Level, die offline laufen. Die Tagesaufgabe und die Ranglisten brauchen eine.' },
			{ q: 'Wie behalte ich meinen Fortschritt?', a: 'Er wird auf deinem Handy gespeichert. Melde dich mit Google oder Apple an, wenn du willst, um ihn auf all deinen Geräten wiederzufinden; dein Konto kannst du jederzeit in den Einstellungen löschen.' },
			{ q: 'Welche Geräte, welche Sprachen?', a: 'iPhone, iPad (im Vollbild) und Android, auf Deutsch, Französisch, Englisch, Spanisch und Italienisch.' },
			{ q: 'Und am Computer?', a: 'Das Spiel gibt es auch auf ludiven-studio.fr: 100 Level, freies Spiel und dieselbe Tagesaufgabe, mit derselben Rangliste wie die App.' },
		],
		soon: 'Bald im App Store und bei Google Play',
		soonShort: 'Demnächst',
		playWeb: 'Im Browser spielen',
		playWebNote: 'Die Webversion, sofort: 100 Level und die Tagesaufgabe.',
		testApk: 'Android-Testversion',
		testApkNote: 'Für Tester: das neueste Test-APK, von Hand zu installieren.',
		download: 'Herunterladen',
		makingOfTitle: 'Wie das Spiel entsteht',
		makingOf: 'Die Spiel-Engine, die Parität zwischen Website und App, die synthetisierten Klänge, die Screenshots und Videos, die ein Bot dreht: Die Projektseite erzählt, wie es gemacht ist (auf Englisch).',
		makingOfCta: 'Zur Projektseite',
		support: 'Eine Frage, ein Problem?',
		supportLink: 'Schreib uns',
		privacy: 'Datenschutzerklärung (auf Englisch)',
		dl: {
			title: "Dragon's Gems Swipe herunterladen",
			kicker: 'Bald in den Stores',
			lead: 'Wisch das Spielfeld, spreng die Edelsteine und füll den Schatz des Babydrachen.',
			waiting: 'Das Spiel kommt bald in den App Store und zu Google Play. Bis dahin:',
			screensTitle: 'Die App in Bildern',
			back: 'Alles über die App',
		},
	},
	it: {
		title: "Dragon's Gems Swipe — il puzzle di gemme del cucciolo di drago",
		description: 'Fai scorrere il tabellone, fai esplodere le gemme e riempi il tesoro di Bijou, il cucciolo di drago: 500 livelli, una sfida del giorno e una modalità infinita. Presto su iPhone, iPad e Android.',
		kicker: 'Gioco per cellulare · iPhone, iPad e Android',
		tagline: 'Puzzle di gemme da scorrere',
		intro: 'Aiuta Bijou, un cucciolo di drago nato senza tesoro, ad attraversare cinque mondi: 250 livelli da scorrere, una sfida del giorno per tutti e una modalità infinita.',
		story: 'Bijou è appena nato, e la sua grotta è vuota: neanche una moneta, neanche una gemma. Ma tra i draghi si cresce solo con il proprio tesoro. Aiutalo: fai scorrere il tabellone, fai esplodere le gemme e apri i forzieri.',
		featuresTitle: 'Come si gioca',
		features: [
			{ title: 'Scorri ed esplodi', body: 'Un gesto, e tutto il tabellone scivola fino al bordo. Tre gemme dello stesso colore che si toccano esplodono, e le esplosioni si concatenano.' },
			{ title: 'Fino alla corona', body: 'Quattro gemme o più si fondono in una gemma più forte: gemma carica, gioiello, poi corona, che fa saltare tutte le gemme del suo colore. Quattro gemme in quadrato lanciano una cometa verso un forziere.' },
			{ title: 'I forzieri', body: "Un'esplosione proprio accanto a un forziere lo spalanca. Vinci il livello e il suo bottino va nel tesoro di Bijou." },
			{ title: 'Il soffio di Bijou', body: 'Ogni gemma distrutta riempie la sua barra. Quando è piena, tocca Bijou: sputa tre palle di fuoco, prima sui forzieri.' },
			{ title: 'Cinque mondi, 500 livelli', body: 'Il prato, le casseforti, le rocce, il ghiacciaio e la quinta gemma, ognuno con la sua sorpresa. Poi 250 livelli esperti nelle profondità. I primi 10 livelli insegnano il gioco passo dopo passo.' },
			{ title: 'La grotta di Bijou', body: 'Venti tesori da scoprire, uno ogni 25 livelli o comprati con le tue monete, e tre meraviglie, molto più care, per i più pazienti.' },
		],
		modesTitle: 'E ogni giorno',
		modes: [
			{ title: 'La sfida del giorno', body: 'Lo stesso tabellone per tutti, un solo tentativo per aprirne i forzieri con meno mosse possibile, e una classifica mondiale condivisa con il gioco web.' },
			{ title: 'La modalità infinita', body: 'Ogni gemma dà punti: resisti il più a lungo possibile e punta alla classifica mondiale.' },
			{ title: 'La sfida della vetta', body: 'Dopo il livello 250: la modalità infinita su un tabellone fisso, uguale per tutti, con una classifica di sempre.' },
			{ title: 'Un regalo ogni giorno', body: 'Monete, un po’ di più per ogni giorno di fila, fino al settimo.' },
		],
		galleryTitle: "L'app in immagini",
		shotsAlt: ['Un livello: fai scorrere le gemme, provoca le esplosioni', 'La storia di Bijou, al primo avvio', 'La mappa dei cinque mondi', 'Il soffio del piccolo drago', 'La sfida del giorno'],
		videoLabel: 'Il gioco in video',
		priceTitle: 'Gratis',
		price: [
			'Il gioco è gratuito. Hai cinque cuori: un livello perso ne costa uno, e ne torna uno ogni 30 minuti.',
			'I video, sempre a tua scelta, danno un cuore, una partita che continua o monete. Il negozio vende cuori illimitati per sempre (6,99 €) e monete: 2.000 per 1,99 €, 6.000 per 4,99 €, 15.000 per 9,99 €.',
		],
		faqTitle: 'Domande',
		faq: [
			{ q: 'Quando esce il gioco?', a: 'Presto su App Store e Google Play. Nel frattempo, la versione web si gioca subito nel browser, e i tester Android hanno una versione di prova.' },
			{ q: 'Serve una connessione?', a: 'Non per i livelli, che si giocano offline. La sfida del giorno e le classifiche ne richiedono una.' },
			{ q: 'Come conservo i miei progressi?', a: 'Sono salvati sul tuo telefono. Accedi con Google o Apple, se vuoi, per ritrovarli su tutti i tuoi dispositivi; puoi eliminare il tuo account quando vuoi dalle Impostazioni.' },
			{ q: 'Su quali dispositivi, in quali lingue?', a: 'iPhone, iPad (a schermo intero) e Android, in italiano, francese, inglese, spagnolo e tedesco.' },
			{ q: 'E sul computer?', a: 'Il gioco è anche su ludiven-studio.fr: 100 livelli, la modalità libera e la stessa sfida del giorno, con la stessa classifica dell’app.' },
		],
		soon: 'Presto su App Store e Google Play',
		soonShort: 'Prossimamente',
		playWeb: 'Gioca nel browser',
		playWebNote: 'La versione web, subito: 100 livelli e la sfida del giorno.',
		testApk: 'Versione di prova per Android',
		testApkNote: "Per i tester: l'ultimo APK di prova, da installare a mano.",
		download: 'Scarica',
		makingOfTitle: 'Come è fatto il gioco',
		makingOf: 'Il motore del gioco, la parità tra il sito e l’app, i suoni sintetizzati, le schermate e i video girati da un robot: la scheda del progetto racconta il dietro le quinte (in inglese).',
		makingOfCta: 'Leggi la scheda del progetto',
		support: 'Una domanda, un problema?',
		supportLink: 'Scrivici',
		privacy: 'Informativa sulla privacy (in inglese)',
		dl: {
			title: "Scarica Dragon's Gems Swipe",
			kicker: 'Presto negli store',
			lead: 'Fai scorrere il tabellone, fai esplodere le gemme e riempi il tesoro del cucciolo di drago.',
			waiting: 'Il gioco arriva presto su App Store e Google Play. Nel frattempo:',
			screensTitle: "L'app in immagini",
			back: "Tutto sull'app",
		},
	},
};
