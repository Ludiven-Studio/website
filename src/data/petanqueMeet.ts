// Pétanque Meet's store pages, out on both stores since October 2026.
export const MEET_STORES = {
	fr: {
		play: 'https://play.google.com/store/apps/details?id=com.ludivenstudio.petanquemeet&hl=fr',
		apple: 'https://apps.apple.com/fr/app/id6823583416',
	},
	en: {
		play: 'https://play.google.com/store/apps/details?id=com.ludivenstudio.petanquemeet&hl=en',
		apple: 'https://apps.apple.com/app/id6823583416',
	},
	es: {
		play: 'https://play.google.com/store/apps/details?id=com.ludivenstudio.petanquemeet&hl=es',
		apple: 'https://apps.apple.com/es/app/id6823583416',
	},
	de: {
		play: 'https://play.google.com/store/apps/details?id=com.ludivenstudio.petanquemeet&hl=de',
		apple: 'https://apps.apple.com/de/app/id6823583416',
	},
	it: {
		play: 'https://play.google.com/store/apps/details?id=com.ludivenstudio.petanquemeet&hl=it',
		apple: 'https://apps.apple.com/it/app/id6823583416',
	},
} as const;

// The download page. `screens` are the phone's slides, in order: their images are
// /assets/petanque-meet/download/<id>-<lang>.webp, the app's 0.1.5 store captures.
export const MEET_DOWNLOAD = {
	fr: {
		path: '/petanque-meet/telecharger/',
		title: 'Télécharger Pétanque Meet sur Android et iPhone | Ludiven Studio',
		description:
			"L'appli Pétanque Meet sur le Play Store et l'App Store : les parties et les concours de pétanque autour de chez toi, sur ton téléphone.",
		h1: 'Trouve une partie de pétanque près de chez toi',
		lead: 'Les parties qui cherchent des joueurs et les concours des clubs, sur une carte. Rejoins-en une, ou pose la tienne quand il te manque du monde.',
		free: 'Gratuit sur Android et iPhone',
		screens: [
			{ id: 'carte', title: 'La carte des parties', sub: 'Celles qui cherchent des joueurs, près de chez toi', alt: 'La carte : les parties qui cherchent des joueurs et les concours des clubs' },
			{ id: 'partie', title: 'Rejoins-la en un geste', sub: "Le terrain, l'heure, qui joue déjà", alt: "Une partie : le terrain, l'heure, le format et qui joue déjà" },
			{ id: 'poser', title: 'Pose la tienne en quelques secondes', sub: 'Les joueurs du coin la voient sur la carte', alt: "Poser une partie : le terrain, l'heure, le format et le nombre de joueurs" },
			{ id: 'concours', title: 'Les concours des clubs', sub: "Avec leur affiche et l'agrément FFPJP", alt: 'Un concours de club, avec son affiche et son agrément FFPJP' },
			{ id: 'agenda', title: 'Ton agenda', sub: 'Tes parties et tes concours, réunis', alt: "L'agenda : les parties organisées, celles rejointes et les concours suivis" },
		],
		pause: "Mettre l'animation en pause",
		points: [
			{ icon: 'eye', title: 'Gratuit, sans compte pour regarder', body: 'La carte se consulte librement. Pour poser ou rejoindre une partie, tu te connectes avec Google sur Android, ou Apple sur iPhone.' },
			{ icon: 'trophy', title: 'Pour les clubs aussi', body: "Ton club organise un concours ? Annonce-le dans l'appli avec son affiche : les joueurs du coin le voient sur la carte." },
			{ icon: 'check', title: 'Un rappel avant chaque partie', body: 'Ton agenda réunit tes parties et tes concours, et ton téléphone te prévient une heure avant de jouer.' },
		],
		video: {
			title: 'En vidéo',
			body: "Trouver une partie, la rejoindre, poser la sienne, suivre les concours : l'appli en 20 secondes.",
			label: 'Vidéo de présentation de Pétanque Meet',
		},
		// Flows filmed in the app: /assets/petanque-meet/download/guide-<id>.mp4 and its .webp poster.
		guides: {
			title: 'Comment ça marche',
			body: "Quatre gestes, filmés dans l'appli.",
			items: [
				{ id: 'rejoindre', title: 'Rejoindre une partie', sub: 'Un appui sur « Je viens », et la partie est dans ton agenda.' },
				{ id: 'poser', title: 'Poser ta partie', sub: "Il te manque un joueur : le terrain, le jour, le format, et c'est en ligne." },
				{ id: 'concours', title: 'Suivre un concours', sub: "Son affiche, son format, son agrément, et il t'attend dans ton agenda." },
				{ id: 'club', title: 'Annoncer le concours de ton club', sub: "Le nom, les épreuves, l'affiche : les joueurs du coin le voient." },
			],
		},
		closing: 'Prêt à jouer ?',
		browser: { before: 'Pas sur ton téléphone ? La carte se consulte aussi ', link: 'dans le navigateur', after: '.', href: '/petanque-meet/' },
		legal: [
			{ label: 'Ce qui est stocké', href: '/petanque-meet/confidentialite/' },
			{ label: 'Conditions', href: '/petanque-meet/cgu/' },
		],
		legalNote: '',
	},
	en: {
		path: '/en/petanque-meet/download/',
		title: 'Download Pétanque Meet for Android and iPhone | Ludiven Studio',
		description: 'The Pétanque Meet app on Google Play and the App Store: the pétanque games and tournaments near you, on your phone.',
		h1: 'Find a pétanque game near you',
		lead: 'Games looking for players and club tournaments, on a map. Join one, or post your own when you are a player short.',
		free: 'Free on Android and iPhone',
		screens: [
			{ id: 'carte', title: 'The map of games', sub: 'The ones looking for players, near you', alt: 'The map: games looking for players and club tournaments' },
			{ id: 'partie', title: 'Join in one tap', sub: 'The pitch, the time, who is already playing', alt: 'A game: the pitch, the time, the format and who is already playing' },
			{ id: 'poser', title: 'Post yours in seconds', sub: 'Players nearby see it on the map', alt: 'Posting a game: the pitch, the time, the format and the number of players' },
			{ id: 'concours', title: 'Club tournaments', sub: 'With their poster and FFPJP approval', alt: 'A club tournament, with its poster and FFPJP approval' },
			{ id: 'agenda', title: 'Your agenda', sub: 'Your games and tournaments, together', alt: 'The agenda: the games you organize, the ones you joined and the tournaments you follow' },
		],
		pause: 'Pause the animation',
		points: [
			{ icon: 'eye', title: 'Free, no account to browse', body: 'The map is open to everyone. To post or join a game, sign in with Google on Android, or Apple on iPhone.' },
			{ icon: 'trophy', title: 'For clubs too', body: 'Your club is running a tournament? Post it in the app with its poster: players nearby see it on the map.' },
			{ icon: 'check', title: 'A reminder before each game', body: 'Your agenda gathers your games and tournaments, and your phone reminds you an hour before you play.' },
		],
		// The teaser speaks French.
		video: null,
		guides: null,
		closing: 'Ready to play?',
		browser: { before: 'Not on your phone? The map is also open ', link: 'in your browser', after: '.', href: '/en/petanque-meet/' },
		legal: [
			{ label: 'What is stored', href: '/petanque-meet/confidentialite/' },
			{ label: 'Terms', href: '/petanque-meet/cgu/' },
		],
		legalNote: '(in French)',
	},
	// es/de/it: the app's own words (AppLocalization) and the store listings'. Club tournaments are
	// only on the map in France so far, which these say; the map on the web is in English.
	es: {
		path: '/es/petanque-meet/descargar/',
		title: 'Descargar Pétanque Meet para Android y iPhone | Ludiven Studio',
		description:
			'La app Pétanque Meet en Google Play y en el App Store: las partidas de petanca cerca de ti y, en Francia, los torneos de los clubes.',
		h1: 'Encuentra una partida de petanca cerca de ti',
		lead: 'Las partidas que buscan jugadores, en un mapa, y en Francia también los torneos de los clubes. Apúntate a una, o publica la tuya cuando te falte gente.',
		free: 'Gratis en Android y iPhone',
		screens: [
			{ id: 'carte', title: 'El mapa de las partidas', sub: 'Las que buscan jugadores, cerca de ti', alt: 'El mapa: las partidas que buscan jugadores y los torneos de los clubes' },
			{ id: 'partie', title: 'Apúntate en un toque', sub: 'El terreno, la hora, quién juega ya', alt: 'Una partida: el terreno, la hora, el formato y quién juega ya' },
			{ id: 'poser', title: 'Publica la tuya en segundos', sub: 'Los jugadores de la zona la ven en el mapa', alt: 'Publicar una partida: el terreno, la hora, el formato y el número de jugadores' },
			{ id: 'concours', title: 'Los torneos de los clubes', sub: 'Con su cartel y el teléfono del organizador', alt: 'Un torneo de club, con su cartel y el teléfono del organizador' },
			{ id: 'agenda', title: 'Tu agenda', sub: 'Tus partidas y tus torneos, juntos', alt: 'La agenda: las partidas que organizas, a las que te apuntas y los torneos que sigues' },
		],
		pause: 'Pausar la animación',
		points: [
			{ icon: 'eye', title: 'Gratis, sin cuenta para mirar', body: 'El mapa es libre. Para publicar una partida o apuntarte, inicia sesión con Google en Android o con Apple en iPhone.' },
			{ icon: 'trophy', title: 'Sigue los torneos', body: 'En Francia, los torneos de los clubes ya están en el mapa, con su cartel. Sigue uno y lo tendrás en tu agenda.' },
			{ icon: 'check', title: 'Un recordatorio antes de cada partida', body: 'Tu agenda reúne tus partidas y tus torneos, y el móvil te avisa una hora antes de jugar.' },
		],
		video: null,
		guides: null,
		closing: '¿Jugamos?',
		browser: { before: '¿No estás en el móvil? El mapa también se abre ', link: 'en tu navegador', after: ' (en inglés).', href: '/en/petanque-meet/' },
		legal: [
			{ label: 'Lo que se guarda', href: '/petanque-meet/confidentialite/' },
			{ label: 'Condiciones', href: '/petanque-meet/cgu/' },
		],
		legalNote: '(en francés)',
	},
	de: {
		path: '/de/petanque-meet/herunterladen/',
		title: 'Pétanque Meet für Android und iPhone herunterladen | Ludiven Studio',
		description:
			'Die App Pétanque Meet bei Google Play und im App Store: Boule-Spiele in deiner Nähe und, in Frankreich, die Turniere der Vereine.',
		h1: 'Finde ein Boule-Spiel in deiner Nähe',
		lead: 'Spiele, die noch Spieler suchen, auf einer Karte, und in Frankreich auch die Turniere der Vereine. Spiel bei einem mit oder stell dein eigenes ein, wenn dir Mitspieler fehlen.',
		free: 'Kostenlos für Android und iPhone',
		screens: [
			{ id: 'carte', title: 'Die Karte der Spiele', sub: 'Die noch Spieler suchen, in deiner Nähe', alt: 'Die Karte: Spiele, die noch Spieler suchen, und die Turniere der Vereine' },
			{ id: 'partie', title: 'Mitspielen mit einem Tipp', sub: 'Platz, Uhrzeit und wer schon dabei ist', alt: 'Ein Spiel: Platz, Uhrzeit, Format und wer schon dabei ist' },
			{ id: 'poser', title: 'Stell deins in Sekunden ein', sub: 'Spieler in der Nähe sehen es auf der Karte', alt: 'Ein Spiel einstellen: Platz, Uhrzeit, Format und Anzahl der Spieler' },
			{ id: 'concours', title: 'Die Turniere der Vereine', sub: 'Mit Plakat und der Nummer des Veranstalters', alt: 'Ein Vereinsturnier mit Plakat und der Nummer des Veranstalters' },
			{ id: 'agenda', title: 'Deine Termine', sub: 'Deine Spiele und Turniere an einem Ort', alt: 'Die Termine: Spiele, die du organisierst oder bei denen du mitspielst, und Turniere, denen du folgst' },
		],
		pause: 'Animation anhalten',
		points: [
			{ icon: 'eye', title: 'Kostenlos, ohne Konto zum Schauen', body: 'Die Karte ist frei. Um ein Spiel einzustellen oder mitzuspielen, meldest du dich mit Google auf Android oder mit Apple auf dem iPhone an.' },
			{ icon: 'trophy', title: 'Turnieren folgen', body: 'In Frankreich stehen die Vereinsturniere schon auf der Karte, mit ihrem Plakat. Folge einem, und es steht in deinen Terminen.' },
			{ icon: 'check', title: 'Eine Erinnerung vor jedem Spiel', body: 'Deine Termine zeigen deine Spiele und Turniere, und dein Handy erinnert dich eine Stunde vor dem Spiel.' },
		],
		video: null,
		guides: null,
		closing: 'Bereit zum Spielen?',
		browser: { before: 'Nicht am Handy? Die Karte gibt es auch ', link: 'im Browser', after: ' (auf Englisch).', href: '/en/petanque-meet/' },
		legal: [
			{ label: 'Was gespeichert wird', href: '/petanque-meet/confidentialite/' },
			{ label: 'Nutzungsbedingungen', href: '/petanque-meet/cgu/' },
		],
		legalNote: '(auf Französisch)',
	},
	it: {
		path: '/it/petanque-meet/scarica/',
		title: 'Scarica Pétanque Meet per Android e iPhone | Ludiven Studio',
		description:
			"L'app Pétanque Meet su Google Play e sull'App Store: le partite di pétanque vicino a te e, in Francia, i tornei dei club.",
		h1: 'Trova una partita di pétanque vicino a te',
		lead: 'Le partite che cercano giocatori, su una mappa, e in Francia anche i tornei dei club. Partecipa a una, o pubblica la tua quando ti mancano giocatori.',
		free: 'Gratis su Android e iPhone',
		screens: [
			{ id: 'carte', title: 'La mappa delle partite', sub: 'Quelle che cercano giocatori, vicino a te', alt: 'La mappa: le partite che cercano giocatori e i tornei dei club' },
			{ id: 'partie', title: 'Partecipa con un tocco', sub: "Il campo, l'ora, chi gioca già", alt: "Una partita: il campo, l'ora, il formato e chi gioca già" },
			{ id: 'poser', title: 'Pubblica la tua in pochi secondi', sub: 'I giocatori della zona la vedono sulla mappa', alt: "Pubblicare una partita: il campo, l'ora, il formato e il numero di giocatori" },
			{ id: 'concours', title: 'I tornei dei club', sub: "Con la locandina e il numero dell'organizzatore", alt: "Un torneo di club, con la locandina e il numero dell'organizzatore" },
			{ id: 'agenda', title: 'La tua agenda', sub: 'Le tue partite e i tuoi tornei, insieme', alt: "L'agenda: le partite che organizzi, quelle a cui partecipi e i tornei che segui" },
		],
		pause: "Metti in pausa l'animazione",
		points: [
			{ icon: 'eye', title: 'Gratis, senza account per guardare', body: 'La mappa è libera. Per pubblicare una partita o partecipare, accedi con Google su Android o con Apple su iPhone.' },
			{ icon: 'trophy', title: 'Segui i tornei', body: 'In Francia i tornei dei club sono già sulla mappa, con la loro locandina. Seguine uno e lo ritrovi nella tua agenda.' },
			{ icon: 'check', title: 'Un promemoria prima di ogni partita', body: "La tua agenda riunisce le tue partite e i tuoi tornei, e il telefono ti avvisa un'ora prima di giocare." },
		],
		video: null,
		guides: null,
		closing: 'Giochiamo?',
		browser: { before: 'Non sei sul telefono? La mappa si apre anche ', link: 'nel browser', after: ' (in inglese).', href: '/en/petanque-meet/' },
		legal: [
			{ label: 'Cosa viene salvato', href: '/petanque-meet/confidentialite/' },
			{ label: 'Condizioni', href: '/petanque-meet/cgu/' },
		],
		legalNote: '(in francese)',
	},
} as const;
