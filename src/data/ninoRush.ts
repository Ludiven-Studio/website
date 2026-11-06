// Nino Rush: its product page in five languages and its Android test build.
// The texts follow the store listings (NinoRush docs/store.md, "Listing copy") and the owner's model of
// 2026-11-06: a free demo, then one purchase, « L'aventure complète ». No count of levels or worlds and
// no price: they may change before the release.

export type Lang = 'fr' | 'en' | 'es' | 'de' | 'it';

export const APP_NAME = 'Nino Rush';

// The Nino Rush test build, published by NinoRush/tools/publish_test_apk.py under a name that never changes.
// Raise the version and size by hand at each new one.
export const APK_URL = 'https://github.com/Ludiven-Studio/website/releases/download/nino-rush-dev/NinoRush-test.apk';
export const APK_VERSION = '1.0.11';
export const APK_SIZE = '86,9 Mo';

export const LANDING_PATHS: Record<Lang, string> = {
	fr: '/nino-rush/',
	en: '/en/nino-rush/',
	es: '/es/nino-rush/',
	de: '/de/nino-rush/',
	it: '/it/nino-rush/',
};

/** The test build's page, in French only. */
export const TEST_PAGE = '/nino-rush/telecharger/';
export const PRIVACY: Record<Lang, string> = {
	fr: '/nino-rush/confidentialite/',
	en: '/en/nino-rush/confidentialite/',
	es: '/es/nino-rush/confidentialite/',
	de: '/de/nino-rush/confidentialite/',
	it: '/it/nino-rush/confidentialite/',
};
export const TERMS: Record<Lang, string> = {
	fr: '/nino-rush/cgu/',
	en: '/en/nino-rush/cgu/',
	es: '/es/nino-rush/cgu/',
	de: '/de/nino-rush/cgu/',
	it: '/it/nino-rush/cgu/',
};
export const CONTACT: Record<Lang, string> = { fr: '/contact/', en: '/en/contact/', es: '/en/contact/', de: '/en/contact/', it: '/en/contact/' };

const A = '/nino-rush';

export const ICON = `${A}/icon.webp`;
export const LOGO = `${A}/logo.webp`;
/** No text but the logo: one share image for every language. */
export const SHARE_IMAGE = `${A}/share.jpg`;
export const SCREENS = [
	{ src: `${A}/hero.webp`, alt: 'Nino roule dans la forêt et attrape une étoile.' },
	{ src: `${A}/workshop.webp`, alt: "L'atelier, où l'on dessine ses propres niveaux." },
	{ src: `${A}/chase.webp`, alt: 'Un gros rocher poursuit Nino.' },
	{ src: `${A}/worlds.webp`, alt: 'La carte des dix mondes du jeu.' },
];
export const feature = (l: Lang): string => `${A}/feature-${l}.webp`;
/** The iPhone store shots, captioned in each language. The volcano and world map shots stay out: their captions count levels and worlds. */
export const screens = (l: Lang): string[] => [1, 2, 3, 4, 5, 6].map((n) => `${A}/screen-${n}-${l}.webp`);

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
	coverAlt: string;
	story: string;
	featuresTitle: string;
	features: Item[];
	galleryTitle: string;
	shotsAlt: string[];
	workshopTitle: string;
	workshop: Item[];
	playTitle: string;
	play: Item[];
	faqTitle: string;
	faq: { q: string; a: string; link?: { label: string; href: string } }[];
	soon: string;
	/** The test build's button: French only, as its page. */
	test?: string;
	support: string;
	supportLink: string;
	privacy: string;
	terms: string;
}

export const copy: Record<Lang, Copy> = {
	fr: {
		title: 'Nino Rush — le jeu de plateforme du petit panda roux',
		description: 'Roule, saute et rebondis avec Nino, le petit panda roux, à travers des mondes pleins de lumière. Sème le gros rocher et dessine tes propres niveaux. Bientôt sur iPhone, iPad et Android, avec une démo gratuite.',
		kicker: 'Jeu mobile · iPhone, iPad et Android',
		tagline: 'Le petit panda roux qui fonce',
		intro: "Un jeu de plateforme où tout passe par l'élan : roule, saute et rebondis à travers des mondes pleins de lumière, sème le gros rocher et dessine tes propres niveaux.",
		coverAlt: 'Nino, le petit panda roux, roulé en boule et lancé à pleine vitesse parmi des pièces dorées, sous le logo Nino Rush.',
		story: "Nino est un petit panda roux qui a une drôle de façon de voyager : il se met en boule et il fonce. Aide-le à retrouver son terrier, de la prairie du matin jusqu'à l'aurore polaire.",
		featuresTitle: 'Comment on joue',
		features: [
			{ title: 'Roule, saute, rebondis', body: "Reste appuyé d'un côté de l'écran pour rouler, glisse le doigt vers le haut pour sauter. C'est tout. Le reste, c'est de l'élan : prends de la vitesse dans les descentes, franchis les trous, saute de paroi en paroi." },
			{ title: 'Des mondes pleins de lumière', body: "Chaque monde a sa lumière, ses décors et sa nouveauté : des champignons qui rebondissent, de la glace qui glisse, des tourbillons qui t'attirent, des portails, de la lave, la gravité inversée…" },
			{ title: 'Des montagnes à gravir', body: "Des tunnels en lacets creusés dans la roche, à monter d'étage en étage. Et parfois, une route passe derrière la piste : un champignon t'y envoie." },
			{ title: 'Trois étoiles par niveau', body: "Certaines sont sur ta route, d'autres bien cachées. Rejoue pour toutes les trouver, bats le chrono d'un niveau pour gagner sa couronne et fais la course contre le fantôme de ton meilleur temps." },
			{ title: 'Le rocher arrive !', body: "Dans chaque monde, une course-poursuite t'attend : sème le gros rocher grincheux avant qu'il ne te rattrape." },
			{ title: 'Jamais coincé', body: 'Tu tournes en rond ? Lumi la luciole connaît le chemin et vole devant toi. Et chaque jour, une petite balade te propose de revisiter un niveau.' },
		],
		galleryTitle: 'Le jeu en images',
		shotsAlt: [
			'« Roule, saute, file au terrier » : Nino, roulé en boule, dévale une colline de la prairie sous les pièces et une étoile.',
			'« Sème le rocher grincheux » : un énorme rocher à la mine renfrognée roule derrière Nino.',
			"« Dessine tes propres niveaux » : l'atelier, avec une colline percée d'un tunnel et la barre des objets à poser.",
			'« Rebondis sur les champignons » : Nino bondit au-dessus de champignons orange, dans une forêt baignée de soleil.',
			'« Habille Nino à ton goût » : le dressing et ses chapeaux, de la casquette à hélice à la couronne.',
			"« Vole d'île en île » : Nino saute par-dessus des ronces violettes, entre des arbres en fleurs et des îles flottantes.",
		],
		workshopTitle: "L'atelier de Nino",
		workshop: [
			{ title: 'Dessine tes niveaux', body: 'Au doigt : dessine le sol, creuse des grottes, pose champignons, ronces, pièces et étoiles, puis teste ton niveau aussitôt.' },
			{ title: 'Partage-les par code', body: 'Envoie ton niveau à un ami avec un simple code, et voyez qui fait le meilleur temps.' },
			{ title: 'Des casse-têtes à la pelle', body: 'Creuse le bon chemin avec ta pelle pour ouvrir la route du terrier.' },
		],
		playTitle: 'Joue comme tu veux',
		play: [
			{ title: 'Une démo gratuite', body: "Les premiers mondes se jouent gratuitement, en démo. Un seul achat intégré, « L'aventure complète », ouvre ensuite tout le jeu." },
			{ title: 'Des looks à gagner', body: "Les chapeaux, les couleurs et les traînées de Nino se gagnent avec les pièces ramassées en jouant. À la fin d'un niveau, si tu veux, une courte vidéo de nos autres jeux double tes pièces. Le « grand dressing », un achat facultatif, ouvre tous les looks d'un coup." },
			{ title: 'Avec ou sans compte', body: 'Le jeu marche hors ligne. Ta progression reste sur ton téléphone ; un compte facultatif en garde une copie, pour la retrouver sur un autre téléphone.' },
		],
		faqTitle: 'Questions',
		faq: [
			{ q: 'Quand sort le jeu ?', a: "Bientôt, sur l'App Store pour iPhone et iPad et sur Google Play pour Android. En attendant, tu peux essayer la version de test Android.", link: { label: 'La version de test', href: TEST_PAGE } },
			{ q: 'Le jeu est-il gratuit ?', a: "La démo, oui : les premiers mondes se jouent gratuitement. Un seul achat, « L'aventure complète », ouvre ensuite tout le jeu. Le seul autre achat, facultatif, est le « grand dressing », qui ouvre tous les looks d'un coup." },
			{ q: 'Faut-il une connexion ?', a: 'Non, le jeu marche hors ligne. Il en faut une pour les achats, pour les vidéos qui doublent tes pièces et pour garder une copie de ta progression en ligne.' },
			{ q: 'Comment garder ma progression ?', a: 'Elle reste sur ton téléphone. Si tu veux, connecte-toi à un compte Ludiven Studio dans Réglages › Compte : il en garde une copie, pour la retrouver sur un autre téléphone. Tu peux le supprimer à tout moment, depuis le jeu.' },
			{ q: 'Comment partager un niveau ?', a: "Dans l'atelier, touche « Partager » : le jeu copie un code, que tu envoies où tu veux. Ton ami le colle dans son atelier avec « Coller un code »." },
			{ q: 'Sur quels appareils, dans quelles langues ?', a: 'iPhone, iPad et Android, en paysage. En français, anglais, espagnol, allemand et italien.' },
		],
		soon: "Bientôt sur l'App Store et Google Play",
		test: 'Tester sur Android',
		support: 'Une question, un souci ?',
		supportLink: 'Écris-nous',
		privacy: 'Politique de confidentialité',
		terms: "Conditions d'utilisation",
	},
	en: {
		title: "Nino Rush — the little red panda's platformer",
		description: 'Roll, jump and bounce with Nino, the little red panda, through worlds full of light. Outrun the big boulder and draw your own levels. Coming soon to iPhone, iPad and Android, with a free demo.',
		kicker: 'Mobile game · iPhone, iPad and Android',
		tagline: 'The little red panda on a roll',
		intro: "A platformer where it's all about momentum: roll, jump and bounce through worlds full of light, outrun the big boulder and draw your own levels.",
		coverAlt: 'Nino, the little red panda, curled into a ball and rolling at full speed among golden coins, under the Nino Rush logo.',
		story: 'Nino is a little red panda with a funny way to travel: he curls up into a ball and goes. Help him find his burrow, from the morning meadow all the way to the polar aurora.',
		featuresTitle: 'How it plays',
		features: [
			{ title: 'Roll, jump, bounce', body: "Hold one side of the screen to roll, swipe up to jump. That's it. The rest is momentum: build up speed on the slopes, clear the gaps, jump from wall to wall." },
			{ title: 'Worlds full of light', body: 'Each world has its own light, scenery and twist: bouncy mushrooms, slippery ice, swirls that pull you in, portals, lava, flipped gravity…' },
			{ title: 'Mountains to climb', body: 'Winding tunnels bored through the rock, to climb floor by floor. And sometimes a road runs behind the track: a mushroom sends you there.' },
			{ title: 'Three stars per level', body: "Some are on your way, others are well hidden. Play again to find them all, beat a level's clock to win its crown, and race the ghost of your best time." },
			{ title: 'Here comes the boulder!', body: 'Every world has a chase: outrun the big grumpy boulder before it catches you.' },
			{ title: 'Never stuck', body: 'Going in circles? Lumi the firefly knows the way and flies ahead of you. And each day, a little stroll invites you back to a level.' },
		],
		galleryTitle: 'The game in pictures',
		shotsAlt: [
			'"Roll, jump, rush home": Nino, curled into a ball, rolls down a meadow hill under coins and a star.',
			'"Outrun the grumpy boulder": a huge scowling boulder rolls after Nino.',
			'"Draw your own levels": the workshop, with a hill bored by a tunnel and the bar of items to place.',
			'"Bounce on mushrooms": Nino leaps over orange mushrooms in a sunlit forest.',
			'"Dress Nino your way": the wardrobe and its hats, from the propeller cap to the crown.',
			'"Fly from isle to isle": Nino jumps over purple brambles, among blossoming trees and floating islands.',
		],
		workshopTitle: "Nino's workshop",
		workshop: [
			{ title: 'Draw your levels', body: 'With a finger: draw the ground, dig caves, place mushrooms, brambles, coins and stars, then test your level right away.' },
			{ title: 'Share them with a code', body: 'Send a level to a friend with a simple code and see who gets the best time.' },
			{ title: 'Shovel puzzles', body: 'Dig the right path with your shovel to open the way home.' },
		],
		playTitle: 'Play your way',
		play: [
			{ title: 'A free demo', body: 'The first worlds are free to play as a demo. A single in-app purchase, "The full adventure", then unlocks the whole game.' },
			{ title: 'Looks to earn', body: 'Nino\'s hats, colors and trails are earned with the coins you pick up as you play. At the end of a level, if you like, a short video of our other games doubles your coins. "The big wardrobe", an optional purchase, unlocks every look at once.' },
			{ title: 'With or without an account', body: 'The game works offline. Your progress stays on your phone; an optional account keeps a copy, so you can pick it up on another phone.' },
		],
		faqTitle: 'Questions',
		faq: [
			{ q: 'When does it come out?', a: 'Soon, on the App Store for iPhone and iPad and on Google Play for Android.' },
			{ q: 'Is it free?', a: 'The demo is: the first worlds are free to play. A single purchase, "The full adventure", then unlocks the whole game. The only other purchase, optional, is "The big wardrobe", which unlocks every look at once.' },
			{ q: 'Do I need a connection?', a: 'No, the game works offline. You need one for purchases, for the videos that double your coins and to keep a copy of your progress online.' },
			{ q: 'How do I keep my progress?', a: 'It stays on your phone. If you like, sign in to a Ludiven Studio account in Settings › Account: it keeps a copy, so you can pick it up on another phone. You can delete it at any time, from the game.' },
			{ q: 'How do I share a level?', a: 'In the workshop, tap "Share": the game copies a code that you send however you like. Your friend pastes it into their workshop with "Paste a code".' },
			{ q: 'Which devices, which languages?', a: 'iPhone, iPad and Android, in landscape. In English, French, Spanish, German and Italian.' },
		],
		soon: 'Coming soon to the App Store and Google Play',
		support: 'A question, a problem?',
		supportLink: 'Write to us',
		privacy: 'Privacy policy',
		terms: 'Terms of use',
	},
	es: {
		title: 'Nino Rush — el juego de plataformas del pequeño panda rojo',
		description: 'Rueda, salta y rebota con Nino, el pequeño panda rojo, por mundos llenos de luz. Escapa de la gran roca y dibuja tus propios niveles. Muy pronto en iPhone, iPad y Android, con una demo gratis.',
		kicker: 'Juego para móvil · iPhone, iPad y Android',
		tagline: 'El pequeño panda rojo veloz',
		intro: 'Un juego de plataformas donde todo es cuestión de impulso: rueda, salta y rebota por mundos llenos de luz, escapa de la gran roca y dibuja tus propios niveles.',
		coverAlt: 'Nino, el pequeño panda rojo, hecho una bola y lanzado a toda velocidad entre monedas doradas, bajo el logo de Nino Rush.',
		story: 'Nino es un pequeño panda rojo con una forma curiosa de viajar: se hace una bola y sale disparado. Ayúdalo a encontrar su madriguera, de la pradera del alba hasta la aurora polar.',
		featuresTitle: 'Cómo se juega',
		features: [
			{ title: 'Rueda, salta, rebota', body: 'Mantén pulsado un lado de la pantalla para rodar y desliza hacia arriba para saltar. Eso es todo. Lo demás es impulso: coge velocidad en las bajadas, cruza los huecos y salta de pared en pared.' },
			{ title: 'Mundos llenos de luz', body: 'Cada mundo tiene su luz, sus paisajes y su novedad: setas que rebotan, hielo resbaladizo, remolinos que te atraen, portales, lava, gravedad invertida…' },
			{ title: 'Montañas por escalar', body: 'Túneles en zigzag excavados en la roca, para subir piso a piso. Y a veces, un camino pasa por detrás de la pista: una seta te lleva hasta él.' },
			{ title: 'Tres estrellas por nivel', body: 'Algunas están en tu camino, otras bien escondidas. Vuelve a jugar para encontrarlas todas, bate el reloj de un nivel para ganar su corona y compite contra el fantasma de tu mejor tiempo.' },
			{ title: '¡Que viene la roca!', body: 'En cada mundo te espera una persecución: escapa de la gran roca gruñona antes de que te alcance.' },
			{ title: 'Nunca atascado', body: '¿Das vueltas sin salida? Lumi la luciérnaga conoce el camino y vuela delante de ti. Y cada día, un pequeño paseo te invita a volver a un nivel.' },
		],
		galleryTitle: 'El juego en imágenes',
		shotsAlt: [
			'«Rueda, salta, vuelve a casa»: Nino, hecho una bola, baja por una colina de la pradera entre monedas y una estrella.',
			'«Escapa de la roca gruñona»: una roca enorme con cara de pocos amigos rueda detrás de Nino.',
			'«Dibuja tus propios niveles»: el taller, con una colina atravesada por un túnel y la barra de objetos para colocar.',
			'«Rebota en las setas»: Nino salta sobre setas naranjas en un bosque bañado de sol.',
			'«Viste a Nino a tu gusto»: el armario y sus sombreros, de la gorra con hélice a la corona.',
			'«Vuela de isla en isla»: Nino salta sobre zarzas moradas, entre árboles en flor e islas flotantes.',
		],
		workshopTitle: 'El taller de Nino',
		workshop: [
			{ title: 'Dibuja tus niveles', body: 'Con el dedo: dibuja el suelo, excava cuevas, coloca setas, zarzas, monedas y estrellas, y prueba tu nivel al momento.' },
			{ title: 'Compártelos con un código', body: 'Envía tu nivel a un amigo con un simple código y a ver quién hace el mejor tiempo.' },
			{ title: 'Rompecabezas con pala', body: 'Excava el camino correcto con tu pala para abrir la ruta a casa.' },
		],
		playTitle: 'Juega a tu manera',
		play: [
			{ title: 'Una demo gratis', body: 'Los primeros mundos se juegan gratis, como demo. Una sola compra integrada, «La aventura completa», desbloquea después todo el juego.' },
			{ title: 'Looks por ganar', body: 'Los sombreros, colores y estelas de Nino se ganan con las monedas que recoges jugando. Al final de un nivel, si quieres, un breve vídeo de nuestros otros juegos duplica tus monedas. «El gran armario», una compra opcional, desbloquea todos los looks de una vez.' },
			{ title: 'Con o sin cuenta', body: 'El juego funciona sin conexión. Tu progreso se queda en tu teléfono; una cuenta opcional guarda una copia para recuperarlo en otro teléfono.' },
		],
		faqTitle: 'Preguntas',
		faq: [
			{ q: '¿Cuándo sale el juego?', a: 'Muy pronto, en el App Store para iPhone y iPad y en Google Play para Android.' },
			{ q: '¿El juego es gratis?', a: 'La demo, sí: los primeros mundos se juegan gratis. Una sola compra, «La aventura completa», desbloquea después todo el juego. La única otra compra, opcional, es «El gran armario», que desbloquea todos los looks de una vez.' },
			{ q: '¿Hace falta conexión?', a: 'No, el juego funciona sin conexión. La necesitas para las compras, para los vídeos que duplican tus monedas y para guardar una copia de tu progreso en línea.' },
			{ q: '¿Cómo guardo mi progreso?', a: 'Se queda en tu teléfono. Si quieres, inicia sesión con una cuenta Ludiven Studio en Ajustes › Cuenta: guarda una copia para recuperarlo en otro teléfono. Puedes eliminarla cuando quieras, desde el juego.' },
			{ q: '¿Cómo comparto un nivel?', a: 'En el taller, toca «Compartir»: el juego copia un código que envías por donde quieras. Tu amigo lo pega en su taller con «Pegar un código».' },
			{ q: '¿En qué dispositivos y en qué idiomas?', a: 'iPhone, iPad y Android, en horizontal. En español, francés, inglés, alemán e italiano.' },
		],
		soon: 'Muy pronto en el App Store y Google Play',
		support: '¿Una pregunta, un problema?',
		supportLink: 'Escríbenos',
		privacy: 'Política de privacidad',
		terms: 'Condiciones de uso',
	},
	de: {
		title: 'Nino Rush — der Plattformer mit dem kleinen Roten Panda',
		description: 'Roll, spring und hüpf mit Nino, dem kleinen Roten Panda, durch Welten voller Licht. Entkomm dem großen Felsen und zeichne eigene Level. Bald für iPhone, iPad und Android, mit kostenloser Demo.',
		kicker: 'Handyspiel · iPhone, iPad und Android',
		tagline: 'Der kleine Rote Panda saust',
		intro: 'Ein Plattformer, bei dem alles am Schwung hängt: Roll, spring und hüpf durch Welten voller Licht, entkomm dem großen Felsen und zeichne deine eigenen Level.',
		coverAlt: 'Nino, der kleine Rote Panda, zur Kugel gerollt und in vollem Tempo zwischen goldenen Münzen unterwegs, unter dem Logo von Nino Rush.',
		story: 'Nino ist ein kleiner Roter Panda mit einer lustigen Art zu reisen: Er rollt sich zusammen und saust los. Hilf ihm, seinen Bau zu finden, von der Morgenwiese bis zum Polarlicht.',
		featuresTitle: 'So wird gespielt',
		features: [
			{ title: 'Rollen, springen, hüpfen', body: 'Halte eine Seite des Bildschirms gedrückt, um zu rollen, und wische nach oben, um zu springen. Das ist alles. Der Rest ist Schwung: Nimm an Hängen Tempo auf, überwinde Lücken und spring von Wand zu Wand.' },
			{ title: 'Welten voller Licht', body: 'Jede Welt hat ihr eigenes Licht, ihre Landschaft und ihre Überraschung: Pilze, die dich hochfedern, glattes Eis, Wirbel, die dich anziehen, Portale, Lava, umgekehrte Schwerkraft …' },
			{ title: 'Berge zum Erklimmen', body: 'Serpentinentunnel tief im Fels, Stockwerk um Stockwerk nach oben. Und manchmal führt ein Weg hinter der Strecke entlang: Ein Pilz schickt dich hin.' },
			{ title: 'Drei Sterne pro Level', body: 'Manche liegen auf deinem Weg, andere sind gut versteckt. Spiel noch einmal, um alle zu finden, schlage die Uhr eines Levels für seine Krone und tritt gegen den Geist deiner Bestzeit an.' },
			{ title: 'Der Felsen kommt!', body: 'In jeder Welt wartet eine Jagd: Entkomm dem großen grantigen Felsen, bevor er dich einholt.' },
			{ title: 'Nie festgefahren', body: 'Du drehst dich im Kreis? Lumi, das Glühwürmchen, kennt den Weg und fliegt vor dir her. Und jeden Tag lädt dich ein kleiner Spaziergang zu einem Level ein.' },
		],
		galleryTitle: 'Das Spiel in Bildern',
		shotsAlt: [
			'„Rollen, springen, heimsausen“: Nino rollt als Kugel einen Wiesenhügel hinab, unter Münzen und einem Stern.',
			'„Entkomm dem grantigen Felsen“: Ein riesiger, grimmiger Felsen rollt hinter Nino her.',
			'„Zeichne deine eigenen Level“: das Atelier, mit einem Hügel samt Tunnel und der Leiste der Objekte zum Setzen.',
			'„Hüpf auf Pilzen“: Nino springt über orangefarbene Pilze in einem sonnendurchfluteten Wald.',
			'„Style Nino, wie du magst“: der Kleiderschrank mit seinen Hüten, von der Propellermütze bis zur Krone.',
			'„Flieg von Insel zu Insel“: Nino springt über violette Dornen, zwischen blühenden Bäumen und schwebenden Inseln.',
		],
		workshopTitle: 'Ninos Atelier',
		workshop: [
			{ title: 'Zeichne deine Level', body: 'Mit dem Finger: Zeichne den Boden, grabe Höhlen, setze Pilze, Dornen, Münzen und Sterne und teste dein Level sofort.' },
			{ title: 'Teile sie per Code', body: 'Schick dein Level per Code an Freunde und schaut, wer die beste Zeit schafft.' },
			{ title: 'Schaufelrätsel', body: 'Grab mit deiner Schaufel den richtigen Weg nach Hause.' },
		],
		playTitle: 'Spiel, wie du willst',
		play: [
			{ title: 'Eine kostenlose Demo', body: 'Die ersten Welten spielst du kostenlos als Demo. Ein einziger In-App-Kauf, „Das komplette Abenteuer“, schaltet danach das ganze Spiel frei.' },
			{ title: 'Looks zum Erspielen', body: 'Ninos Hüte, Farben und Spuren erspielst du mit den Münzen, die du unterwegs sammelst. Am Ende eines Levels verdoppelt ein kurzes Video unserer anderen Spiele deine Münzen, wenn du willst. „Der große Schrank“, ein optionaler Kauf, schaltet alle Looks auf einmal frei.' },
			{ title: 'Mit oder ohne Konto', body: 'Das Spiel läuft offline. Dein Fortschritt bleibt auf deinem Handy; ein optionales Konto bewahrt eine Kopie, damit du ihn auf einem anderen Handy wiederfindest.' },
		],
		faqTitle: 'Fragen',
		faq: [
			{ q: 'Wann erscheint das Spiel?', a: 'Bald, im App Store für iPhone und iPad und bei Google Play für Android.' },
			{ q: 'Ist das Spiel kostenlos?', a: 'Die Demo schon: Die ersten Welten spielst du kostenlos. Ein einziger Kauf, „Das komplette Abenteuer“, schaltet danach das ganze Spiel frei. Der einzige andere Kauf ist optional: „Der große Schrank“ schaltet alle Looks auf einmal frei.' },
			{ q: 'Brauche ich eine Internetverbindung?', a: 'Nein, das Spiel läuft offline. Du brauchst eine für Käufe, für die Videos, die deine Münzen verdoppeln, und um eine Kopie deines Fortschritts online zu sichern.' },
			{ q: 'Wie behalte ich meinen Fortschritt?', a: 'Er bleibt auf deinem Handy. Wenn du willst, melde dich unter Einstellungen › Konto mit einem Ludiven-Studio-Konto an: Es bewahrt eine Kopie, damit du ihn auf einem anderen Handy wiederfindest. Du kannst das Konto jederzeit im Spiel löschen.' },
			{ q: 'Wie teile ich ein Level?', a: 'Tippe im Atelier auf „Teilen“: Das Spiel kopiert einen Code, den du verschickst, wie du willst. Deine Freunde fügen ihn in ihrem Atelier mit „Code einfügen“ ein.' },
			{ q: 'Welche Geräte, welche Sprachen?', a: 'iPhone, iPad und Android, im Querformat. Auf Deutsch, Französisch, Englisch, Spanisch und Italienisch.' },
		],
		soon: 'Bald im App Store und bei Google Play',
		support: 'Eine Frage, ein Problem?',
		supportLink: 'Schreib uns',
		privacy: 'Datenschutzerklärung',
		terms: 'Nutzungsbedingungen',
	},
	it: {
		title: 'Nino Rush — il platform del piccolo panda rosso',
		description: 'Rotola, salta e rimbalza con Nino, il piccolo panda rosso, in mondi pieni di luce. Sfuggi al grosso masso e disegna i tuoi livelli. Presto su iPhone, iPad e Android, con una demo gratuita.',
		kicker: 'Gioco per cellulare · iPhone, iPad e Android',
		tagline: 'Il piccolo panda rosso veloce',
		intro: 'Un platform dove tutto è questione di slancio: rotola, salta e rimbalza in mondi pieni di luce, sfuggi al grosso masso e disegna i tuoi livelli.',
		coverAlt: 'Nino, il piccolo panda rosso, appallottolato e lanciato a tutta velocità tra monete dorate, sotto il logo di Nino Rush.',
		story: "Nino è un piccolo panda rosso con uno strano modo di viaggiare: si appallottola e parte. Aiutalo a ritrovare la sua tana, dal prato del mattino fino all'aurora polare.",
		featuresTitle: 'Come si gioca',
		features: [
			{ title: 'Rotola, salta, rimbalza', body: "Tieni premuto un lato dello schermo per rotolare, scorri verso l'alto per saltare. Tutto qui. Il resto è slancio: prendi velocità nelle discese, supera i buchi e salta di parete in parete." },
			{ title: 'Mondi pieni di luce', body: 'Ogni mondo ha la sua luce, i suoi paesaggi e la sua novità: funghi che fanno rimbalzare, ghiaccio scivoloso, vortici che ti attirano, portali, lava, gravità invertita…' },
			{ title: 'Montagne da scalare', body: 'Tunnel a tornanti scavati nella roccia, da salire piano dopo piano. E a volte una strada passa dietro il percorso: un fungo ti ci manda.' },
			{ title: 'Tre stelle per livello', body: 'Alcune sono sulla tua strada, altre ben nascoste. Rigioca per trovarle tutte, batti il tempo di un livello per vincere la sua corona e sfida il fantasma del tuo miglior tempo.' },
			{ title: 'Arriva il masso!', body: 'In ogni mondo ti aspetta un inseguimento: sfuggi al grosso masso brontolone prima che ti raggiunga.' },
			{ title: 'Mai bloccato', body: 'Giri in tondo? Lumi la lucciola conosce la strada e vola davanti a te. E ogni giorno una piccola passeggiata ti invita a tornare in un livello.' },
		],
		galleryTitle: 'Il gioco in immagini',
		shotsAlt: [
			'«Rotola, salta, corri a casa»: Nino, appallottolato, scende da una collina del prato tra monete e una stella.',
			"«Sfuggi al masso brontolone»: un enorme masso dall'aria imbronciata rotola dietro a Nino.",
			"«Disegna i tuoi livelli»: l'atelier, con una collina attraversata da un tunnel e la barra degli oggetti da piazzare.",
			'«Rimbalza sui funghi»: Nino salta sopra funghi arancioni in un bosco inondato di sole.',
			"«Vesti Nino come vuoi»: il guardaroba e i suoi cappelli, dal berretto con l'elica alla corona.",
			'«Vola di isola in isola»: Nino salta sopra rovi viola, tra alberi in fiore e isole sospese.',
		],
		workshopTitle: "L'atelier di Nino",
		workshop: [
			{ title: 'Disegna i tuoi livelli', body: 'Con un dito: disegna il suolo, scava grotte, piazza funghi, rovi, monete e stelle e prova subito il tuo livello.' },
			{ title: 'Condividili con un codice', body: 'Invia il tuo livello a un amico con un semplice codice e scoprite chi fa il tempo migliore.' },
			{ title: 'Rompicapi con la pala', body: 'Scava la strada giusta con la pala per tornare a casa.' },
		],
		playTitle: 'Gioca come vuoi',
		play: [
			{ title: 'Una demo gratuita', body: "I primi mondi si giocano gratis, come demo. Un solo acquisto in-app, «L'avventura completa», sblocca poi tutto il gioco." },
			{ title: 'Look da vincere', body: 'I cappelli, i colori e le scie di Nino si vincono con le monete raccolte giocando. Alla fine di un livello, se vuoi, un breve video dei nostri altri giochi raddoppia le tue monete. «Il grande guardaroba», un acquisto facoltativo, sblocca tutti i look in una volta.' },
			{ title: 'Con o senza account', body: 'Il gioco funziona offline. I tuoi progressi restano sul tuo telefono; un account facoltativo ne conserva una copia, per ritrovarli su un altro telefono.' },
		],
		faqTitle: 'Domande',
		faq: [
			{ q: 'Quando esce il gioco?', a: 'Presto, su App Store per iPhone e iPad e su Google Play per Android.' },
			{ q: 'Il gioco è gratis?', a: "La demo sì: i primi mondi si giocano gratis. Un solo acquisto, «L'avventura completa», sblocca poi tutto il gioco. L'unico altro acquisto, facoltativo, è «Il grande guardaroba», che sblocca tutti i look in una volta." },
			{ q: 'Serve una connessione?', a: 'No, il gioco funziona offline. Serve per gli acquisti, per i video che raddoppiano le tue monete e per conservare una copia dei tuoi progressi online.' },
			{ q: 'Come conservo i miei progressi?', a: 'Restano sul tuo telefono. Se vuoi, accedi con un account Ludiven Studio in Impostazioni › Account: ne conserva una copia, per ritrovarli su un altro telefono. Puoi eliminarlo quando vuoi, dal gioco.' },
			{ q: 'Come condivido un livello?', a: "Nell'atelier, tocca «Condividi»: il gioco copia un codice che invii dove vuoi. Il tuo amico lo incolla nel suo atelier con «Incolla un codice»." },
			{ q: 'Su quali dispositivi, in quali lingue?', a: 'iPhone, iPad e Android, in orizzontale. In italiano, francese, inglese, spagnolo e tedesco.' },
		],
		soon: 'Presto su App Store e Google Play',
		support: 'Una domanda, un problema?',
		supportLink: 'Scrivici',
		privacy: 'Informativa sulla privacy',
		terms: "Condizioni d'uso",
	},
};
