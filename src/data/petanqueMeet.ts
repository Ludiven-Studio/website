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
		closing: 'Ready to play?',
		browser: { before: 'Not on your phone? The map is also open ', link: 'in your browser', after: '.', href: '/en/petanque-meet/' },
		legal: [
			{ label: 'What is stored', href: '/petanque-meet/confidentialite/' },
			{ label: 'Terms', href: '/petanque-meet/cgu/' },
		],
		legalNote: '(in French)',
	},
} as const;
