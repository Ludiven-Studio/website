/* Every word the pétanque island shows, in French, English and Spanish. The game logic keeps ids
   (difficulty, surface, loft band…) and only this file turns them into words. */

import type { ReactNode } from 'react';
import type { GameLang } from '../../lib/gameLang';
import type { SurfaceId } from './terrain';
import type { Grade } from './daily';
import type { MatchEvent, Side } from './rules13';
import type { Hardness, ItemKind, Trait } from './shop';

export const LANG_KEY = 'petanque-lang';

type Diff = 'facile' | 'moyen' | 'difficile' | 'expert';
type Band = 'roulette' | 'demi' | 'portee' | 'plomb';
type View = 'jeu' | 'tete' | 'dessus';
type Kind = 'nue' | 'masque' | 'serree';

const plural = (n: number, one: string, many: string): string => (n > 1 ? many : one);

const fr = {
	langName: 'Français',
	langTitle: 'Langue / Language / Idioma',
	diff: { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile', expert: 'Expert' } as Record<Diff, string>,
	surface: { 'terre-battue': 'Terre battue', 'gravier-fin': 'Gravier fin', 'gravier-gros': 'Gravier gros', sable: 'Sable' } as Record<SurfaceId, string>,
	surfaceHint: {
		'terre-battue': 'roule loin, dévie peu',
		'gravier-fin': 'accroche un peu',
		'gravier-gros': 'freine sec, part de travers',
		sable: 's’arrête net, aucun rebond',
	} as Record<SurfaceId, string>,
	loft: { plomb: 'Plomb', portee: 'Portée', demi: 'Demi-portée', roulette: 'Roulette' } as Record<Band, string>,
	band: { roulette: 'Roulette', demi: 'Demi', portee: 'Portée', plomb: 'Plomb' } as Record<Band, string>,
	view: { jeu: 'Vue de jeu', tete: 'Zoom sur les boules', dessus: 'Vue de dessus' } as Record<View, string>,
	grade: { 5: 'Carreau !', 4: 'Palet (presque carreau)', 3: 'Cible sortie', 1: 'Touchée, en place', 0: 'Manqué' } as Record<Grade, string>,
	kind: { nue: 'Boule nue', masque: 'Boule masquée', serree: 'Boule serrée' } as Record<Kind, string>,
	weekday: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],

	lobbySearching: 'Recherche des joueurs en ligne…',
	lobbyNobody: 'Personne d’autre en ligne pour l’instant',
	lobbyNobodyInvite: 'Personne d’autre en ligne · invite un ami avec un code',
	lobbyOthers: (n: number, play: number) => `${n} ${plural(n, 'autre joueur', 'autres joueurs')} en ligne${play ? ` · ${play} en partie` : ''}`,
	tableCap: 'Distances au bouchon',
	you: 'Toi',
	adv: 'Adv',
	foe: 'l’adversaire',
	turnMine: 'À toi de jouer',
	turnFoe: (name: string) => `À ${name} de jouer`,
	turnMineLeft: (n: number) => `À toi · encore ${n} ${plural(n, 'boule', 'boules')}`,
	outMine: 'Ta boule est sortie',
	outFoe: 'Boule adverse sortie',
	pointRetake: 'Tu reprends le point !',
	pointKeep: 'Tu gardes le point',
	pointHave: 'Tu as le point',
	foeRetake: 'L’adversaire reprend le point',
	foeKeep: 'L’adversaire garde le point',
	foeHave: 'L’adversaire a le point',
	tie: 'Égalité !',
	points: (n: number) => `${n} ${plural(n, 'point', 'points')}`,
	nullEnd: 'Mène nulle',
	finish: 'Fin',
	oppLeft: 'Adversaire parti',
	oppAway: 'Adversaire déconnecté — on attend son retour…',
	reconnecting: 'Connexion perdue — reconnexion…',
	mpUnavailable: 'Multijoueur indisponible',
	noFreeGame: 'Aucune partie libre, réessaie',
	connError: 'Erreur de connexion',
	codeBad: 'Code plein ou invalide',

	dailyDone: (p: number, max: number) => `Parcours terminé · ${p} / ${max}`,
	rolling: 'La boule roule…',
	station: (kind: string, d: number) => `${kind} à ${d} m — tire !`,
	preparing: 'Préparation du défi…',
	placeMine: '✋ Touche le sol dans l’anneau jaune',
	placeFoe: 'L’adversaire place le bouchon…',
	foeThrowing: 'L’adversaire tire…',
	foePlaying: 'L’adversaire joue…',
	foeThinking: 'L’adversaire réfléchit…',
	aimJack: '🎯 Touche le sol pour viser',
	pressBoard: '▲ Pose le doigt sur la planche, puis remonte',
	backToGame: '👁 Touche la planche pour revenir en vue Jeu',
	orient: '◀ ▶ oriente · lâche pour lancer',
	releaseNothing: '✖ Lâche ici et rien ne part — remonte pour armer',

	stationNo: 'Atelier',
	level: 'Niveau',
	diffTitle: 'Force de l’adversaire et terrain',
	groundBtn: 'Choisir le terrain',
	distsBtn: 'Cercles de distance au bouchon',
	leaveOnline: 'Quitter la partie en ligne',
	restart: 'Recommencer',
	soundOff: 'Couper le son',
	soundOn: 'Activer le son',
	effetOn: 'Mode expert : donner de l’effet (poser le doigt à gauche ou à droite de la planche)',
	effetOff: 'Mode simple : sans effet',
	effet: 'effet',
	dailyTag: (weekday: string, surface: string) => `Défi du jour · ${weekday} · ${surface}`,
	opponent: 'Adversaire',
	ai: 'IA',
	endOf: (n: number, target: number) => `Mène ${n} · en ${target}`,
	viewsAria: 'Vue de la caméra',
	goal: (n: number): ReactNode => <>Partie en <strong>{n}</strong> points</>,
	loading: 'Chargement du terrain…',
	noWebgl: 'Ton appareil ne peut pas afficher le terrain 3D (WebGL indisponible).',
	loftLocked: 'angle verrouillé',
	loftHint: 'plus bas = plus lobé',
	zoomIn: 'Zoomer sur les boules',
	zoomInTitle: 'Zoomer (W, molette)',
	zoomAria: 'Zoom sur les boules',
	zoomValue: (m: string) => `grossissement ${m} fois`,
	zoomOut: 'Dézoomer',
	zoomOutTitle: 'Dézoomer (S, molette)',
	yourTurn: 'À toi',
	gripAria: 'Déplacer la planche de tir',
	gripTitle: 'Glisse pour déplacer la planche',
	promoLine: 'Qui a le point ? Mesurez en vrai, au téléphone.',
	promoFree: 'Appli gratuite ›',
	promoClose: 'Fermer la publicité Pétanque Scanner',
	placeHere: '✓ Poser ici',
	throwJackHere: '🎯 Lancer le bouchon ici',
	continue: 'Continuer ›',
	courseDone: '🎯 Parcours terminé',
	eventTab: 'Défi',
	eventTag: (n: number) => `Défi du tournoi · ${n} boules`,
	eventBoard: 'Classement du défi',
	eventEmpty: 'Personne n’a encore relevé le défi. À toi d’ouvrir le classement !',
	retry: 'Rejouer',
	carreauMine: '💥 Carreau !',
	carreauFoe: (who: string) => `💥 Carreau de ${who} !`,
	youWin: '🏆 Tu gagnes la partie !',
	foeWins: '❌ L’adversaire gagne',
	quit: 'Quitter',
	newGame: 'Nouvelle partie',
	mpTitle: 'Jouer en ligne',
	quick: '⚡ Partie rapide',
	quickWaiting: (n: number) => `⚡ Partie rapide · ${n} ${plural(n, 'joueur t’attend', 'joueurs t’attendent')}`,
	createCode: '🔑 Créer un code ami',
	codeAria: 'Code ami',
	join: 'Rejoindre',
	back: 'Retour',
	connecting: 'Connexion…',
	waiting: 'En attente d’un joueur…',
	codeIs: 'Code :',
	cancel: 'Annuler',
	groundTitle: 'Partie libre',
	diffLab: 'Adversaire',
	surfaceLab: 'Surface',
	random: 'Au hasard',
	surfaceAuto: 'Surface suivant la difficulté',
	pitchLab: 'Terrain',
	pitchAutoPill: (n: number) => `Auto (${n})`,
	pitchHint: (n: number) => `${n}/100 · ${n < 20 ? 'presque ratissé, la boule va droit'
		: n < 40 ? 'quelques bosses, des plaques d’un autre sol'
		: n < 60 ? 'bosses, cailloux, du gravier meuble le long des planches'
		: n < 80 ? 'creux de plombées, tas de gravier, cailloux partout'
		: 'terrain défoncé : rien ne va droit'}`,
	pitchLine: (surface: string, n: number) => `${surface} · terrain ${n}/100`,
	shop: {
		btn: 'Magasin',
		title: 'Magasin',
		tabs: { boule: 'Boules', jack: 'Bouchons', decor: 'Décors' } as Record<ItemKind, string>,
		note: 'Poids, taille et dureté : chaque boule joue à sa façon.',
		jackNote: 'Rien qu’une couleur : le bouchon roule et se mesure pareil.',
		decorNote: 'Le décor ne joue rien : la piste est la même partout.',
		items: {
			boule_inox: 'La Classique', boule_bronze: 'La Bronze', boule_cuivre: 'La Cuivrée', boule_bleue: 'La Nuit',
			boule_rouge: 'La Rouge', boule_verte: 'La Verte', boule_carbone: 'La Carbone', boule_tireuse: 'La Tireuse',
			boule_pointeuse: 'La Pointeuse', boule_plume: 'La Plume', boule_massive: 'La Massive', boule_doree: 'La Dorée',
			boule_provencale: 'La Provençale', boule_damas: 'La Damas',
			jack_orange: 'Bouchon orange', jack_jaune: 'Bouchon jaune', jack_vert: 'Bouchon vert', jack_rose: 'Bouchon rose',
			jack_buis: 'Bouchon en buis',
			decor_jardin: 'Le jardin provençal', decor_place: 'La place du village', decor_soir: 'La place au crépuscule',
			decor_port: 'Le port',
		} as Record<string, string>,
		decorText: {
			decor_jardin: 'La haie, le muret de pierre sèche, les cyprès et le village perché au loin.',
			decor_place: 'Un après-midi d’été sous les platanes.',
			decor_soir: 'Le soleil se couche, les guirlandes s’allument, le café est ouvert.',
			decor_port: 'Sur le quai, entre les palmiers et les pointus amarrés, la mer jusqu’au phare.',
		} as Record<string, string>,
		make: (g: number, mm: number, hard: string) => `${g} g · ${mm} mm · ${hard}`,
		hardness: { tendre: 'tendre', demi: 'demi-tendre', dure: 'dure' } as Record<Hardness, string>,
		pro: { heavy: 'stable', light: 'précise', big: 'touche mieux', small: 'dure à toucher', soft: 'colle au sol', hard: 'roule loin' } as Record<Trait, string>,
		con: { heavy: 'moins précise', light: 'dévie plus', big: 'cible plus grosse', small: 'perd à la mesure', soft: 'roule moins', hard: 'rebondit plus' } as Record<Trait, string>,
		text: {
			heavy: 'Lourde : les cailloux et le gravier la dévient moins, elle s’enfonce dans le sol meuble et se laisse peu chasser. Mais la main la tient moins bien.',
			light: 'Légère : la main la lance plus juste. Mais les cailloux la dévient plus, elle file sur le sol meuble et se fait chasser facilement.',
			big: 'Grosse : elle touche plus facilement en tir et se mesure de plus près. Mais l’adversaire la touche plus facilement aussi.',
			small: 'Petite : l’adversaire la touche moins facilement. Mais elle perd à la mesure : à distance égale, la plus grosse est plus près.',
			soft: 'Tendre : elle colle au sol en tombant, bien pour plomber. Mais elle roule moins : une roulette doit partir plus fort.',
			hard: 'Dure : elle roule plus loin après sa chute, bien pour la roulette. Mais elle rebondit plus quand on plombe.',
		} as Record<Trait, string>,
		balanced: 'Polyvalente : la référence',
		balancedText: 'Polyvalente : la boule de référence, ni lourde ni légère, ni grosse ni petite.',
		buy: 'Acheter',
		buyAria: (name: string, n: number) => `Acheter ${name} pour ${n} cocoins`,
		equip: 'Choisir',
		equipped: '✓ Équipé',
		bought: '✓ Acheté !',
		free: 'Offert',
		short: (n: number) => `Encore ${n} cocoins`,
		balance: 'cocoins',
		nextMatch: 'Elle entre en jeu à la prochaine partie.',
		fairDaily: 'Au défi du jour, toutes les boules jouent comme La Classique : le classement reste juste.',
		earn: 'Les cocoins se gagnent avec les étoiles des niveaux et le défi du jour.',
	},
	play: 'Jouer',
	levelWon: (a: number, b: number) => `Gagné ${a} — ${b}`,
	levelLost: (a: number, b: number) => `Battu ${a} — ${b}`,

	event: (ev: MatchEvent, me: Side): string => {
		const who = (s: Side) => (s === me ? 'pour toi' : 'pour l’adversaire');
		switch (ev.k) {
			case 'jack-short': return 'Bouchon trop court — à l’adversaire de le placer';
			case 'jack-long': return 'Bouchon trop long — à l’adversaire de le placer';
			case 'jack-out': return 'Bouchon hors du terrain — à l’adversaire de le placer';
			case 'jack-edge': return 'Bouchon à moins d’un mètre du bord — à l’adversaire de le placer';
			case 'jack-dead': return ev.side === null ? 'Bouchon sorti — mène nulle' : `Bouchon sorti — ${fr.points(ev.points)} ${who(ev.side)}`;
			case 'match-won': return `${fr.points(ev.points)} — partie gagnée`;
			case 'end': return ev.side === null ? 'Mène nulle — on rejoue' : `${fr.points(ev.points)} ${who(ev.side)}`;
		}
	},

	tipTitle: 'Le jeu te plaît ? Offre au développeur…',
	coffeeBtn: '☕ un café · 1,50 €',
	tipBtn: '🥂 un verre · dès 2 €',
	tipWink: '… ou un pastis ?',
	barLabel: '🍺 Un verre ?',
	barTitle: '🍺 La buvette',
	close: 'Fermer',
	scannerTitle: 'Tu joues pour de vrai ?',
	scannerBtn: '📱 Pétanque Scanner mesure tes points',
	scannerHref: '/petanque-scanner/',

	help: (daily: boolean, stations: number, target: number): ReactNode => (
		<>
			Partout sur l’image, tu <strong>tournes la caméra librement</strong> — elle ne touche jamais au tir.
			Le <strong>pavé en bas au centre</strong>, c’est ta <strong>planche d’envol</strong> : la hauteur à laquelle tu
			poses le doigt choisit l’angle — <strong>tout en bas = plomb</strong>, tout en haut = roulette au ras du sol — et
			la graduation te dit où tu en es.
			Glisse vers le haut pour la puissance, sur le côté pour corriger la direction, relâche pour lancer.
			Le curseur 🔍 (ou la molette) t’<strong>avance sur les boules</strong> pour les voir de près, sans jamais toucher au tir.
			Le <strong>bouchon se vise</strong> : vu de dessus, touche le terrain pour poser le cercle, puis lance-le dessus.
			{daily
				? ` Défi du jour : ${stations} ateliers, une boule chacun. Carreau = 5 pts, cible sortie = 3, touchée en place = 1. Le chrono départage les ex æquo.`
				: ` Bouchon entre 6 et 10 m, sinon c’est à l’adversaire de le poser. Celui qui n’a pas le point rejoue. Premier à ${target}.`}
		</>
	),
};

export type Strings = typeof fr;

const en: Strings = {
	langName: 'English',
	langTitle: 'Langue / Language / Idioma',
	diff: { facile: 'Easy', moyen: 'Medium', difficile: 'Hard', expert: 'Expert' },
	surface: { 'terre-battue': 'Packed clay', 'gravier-fin': 'Fine gravel', 'gravier-gros': 'Coarse gravel', sable: 'Sand' },
	surfaceHint: {
		'terre-battue': 'rolls far, barely drifts',
		'gravier-fin': 'grips a little',
		'gravier-gros': 'brakes hard, kicks sideways',
		sable: 'stops dead, no bounce',
	},
	loft: { plomb: 'High lob', portee: 'Lob', demi: 'Half lob', roulette: 'Roll' },
	band: { roulette: 'Roll', demi: 'Half', portee: 'Lob', plomb: 'High' },
	view: { jeu: 'Game view', tete: 'Zoom on the boules', dessus: 'Top view' },
	grade: { 5: 'Carreau!', 4: 'Palet (near carreau)', 3: 'Target knocked out', 1: 'Hit, stayed put', 0: 'Missed' },
	kind: { nue: 'Open boule', masque: 'Hidden boule', serree: 'Tight boule' },
	weekday: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],

	lobbySearching: 'Looking for players online…',
	lobbyNobody: 'Nobody else online right now',
	lobbyNobodyInvite: 'Nobody else online · invite a friend with a code',
	lobbyOthers: (n, play) => `${n} other ${plural(n, 'player', 'players')} online${play ? ` · ${play} in a game` : ''}`,
	tableCap: 'Distances to the jack',
	you: 'You',
	adv: 'Opp',
	foe: 'your opponent',
	turnMine: 'Your turn',
	turnFoe: (name) => `${name.charAt(0).toUpperCase()}${name.slice(1)} to play`,
	turnMineLeft: (n) => `Your turn · ${n} ${plural(n, 'boule', 'boules')} left`,
	outMine: 'Your boule went out',
	outFoe: 'Opponent’s boule went out',
	pointRetake: 'You take the point back!',
	pointKeep: 'You keep the point',
	pointHave: 'You have the point',
	foeRetake: 'Your opponent takes the point back',
	foeKeep: 'Your opponent keeps the point',
	foeHave: 'Your opponent has the point',
	tie: 'Tie!',
	points: (n) => `${n} ${plural(n, 'point', 'points')}`,
	nullEnd: 'Dead end',
	finish: 'End',
	oppLeft: 'Opponent left',
	oppAway: 'Opponent disconnected — waiting for them…',
	reconnecting: 'Connection lost — reconnecting…',
	mpUnavailable: 'Multiplayer unavailable',
	noFreeGame: 'No open game, try again',
	connError: 'Connection error',
	codeBad: 'Code full or invalid',

	dailyDone: (p, max) => `Course finished · ${p} / ${max}`,
	rolling: 'The boule is rolling…',
	station: (kind, d) => `${kind} at ${d} m — shoot!`,
	preparing: 'Setting up the challenge…',
	placeMine: '✋ Touch the ground inside the yellow ring',
	placeFoe: 'Your opponent is placing the jack…',
	foeThrowing: 'Your opponent throws…',
	foePlaying: 'Your opponent is playing…',
	foeThinking: 'Your opponent is thinking…',
	aimJack: '🎯 Touch the ground to aim',
	pressBoard: '▲ Put your finger on the board, then slide up',
	backToGame: '👁 Touch the board to go back to the game view',
	orient: '◀ ▶ steer · release to throw',
	releaseNothing: '✖ Release here and nothing goes — slide up to arm',

	stationNo: 'Station',
	level: 'Level',
	diffTitle: 'Opponent strength and ground',
	groundBtn: 'Choose the ground',
	distsBtn: 'Distance rings around the jack',
	leaveOnline: 'Leave the online game',
	restart: 'Restart',
	soundOff: 'Mute',
	soundOn: 'Unmute',
	effetOn: 'Expert mode: add spin (press the left or right of the board)',
	effetOff: 'Simple mode: no spin',
	effet: 'spin',
	dailyTag: (weekday, surface) => `Daily challenge · ${weekday} · ${surface}`,
	opponent: 'Opponent',
	ai: 'AI',
	endOf: (n, target) => `End ${n} · to ${target}`,
	viewsAria: 'Camera view',
	goal: (n) => <>Game to <strong>{n}</strong> points</>,
	loading: 'Loading the ground…',
	noWebgl: 'Your device cannot display the 3D ground (WebGL unavailable).',
	loftLocked: 'angle locked',
	loftHint: 'lower = higher lob',
	zoomIn: 'Zoom in on the boules',
	zoomInTitle: 'Zoom in (W, wheel)',
	zoomAria: 'Zoom on the boules',
	zoomValue: (m) => `magnified ${m} times`,
	zoomOut: 'Zoom out',
	zoomOutTitle: 'Zoom out (S, wheel)',
	yourTurn: 'You',
	gripAria: 'Move the throwing board',
	gripTitle: 'Drag to move the board',
	promoLine: 'Who has the point? Measure it for real, with your phone.',
	promoFree: 'Free app ›',
	promoClose: 'Close the Pétanque Scanner ad',
	placeHere: '✓ Place here',
	throwJackHere: '🎯 Throw the jack here',
	continue: 'Continue ›',
	courseDone: '🎯 Course finished',
	eventTab: 'Challenge',
	eventTag: (n) => `Tournament challenge · ${n} boules`,
	eventBoard: 'Challenge leaderboard',
	eventEmpty: 'Nobody has taken the challenge yet. Open the leaderboard!',
	retry: 'Play again',
	carreauMine: '💥 Carreau!',
	carreauFoe: (who) => `💥 Carreau by ${who}!`,
	youWin: '🏆 You win the game!',
	foeWins: '❌ Your opponent wins',
	quit: 'Leave',
	newGame: 'New game',
	mpTitle: 'Play online',
	quick: '⚡ Quick match',
	quickWaiting: (n) => `⚡ Quick match · ${n} ${plural(n, 'player is', 'players are')} waiting`,
	createCode: '🔑 Create a friend code',
	codeAria: 'Friend code',
	join: 'Join',
	back: 'Back',
	connecting: 'Connecting…',
	waiting: 'Waiting for a player…',
	codeIs: 'Code:',
	cancel: 'Cancel',
	groundTitle: 'Free play',
	diffLab: 'Opponent',
	surfaceLab: 'Surface',
	random: 'Random',
	surfaceAuto: 'Surface set by the difficulty',
	pitchLab: 'Pitch',
	pitchAutoPill: (n: number) => `Auto (${n})`,
	pitchHint: (n: number) => `${n}/100 · ${n < 20 ? 'almost raked, the boule runs straight'
		: n < 40 ? 'a few bumps, patches of another ground'
		: n < 60 ? 'bumps, stones, loose gravel along the planks'
		: n < 80 ? 'lob craters, heaps of gravel, stones everywhere'
		: 'a battered pitch: nothing runs straight'}`,
	pitchLine: (surface: string, n: number) => `${surface} · pitch ${n}/100`,
	shop: {
		btn: 'Shop',
		title: 'Shop',
		tabs: { boule: 'Boules', jack: 'Jacks', decor: 'Scenery' },
		note: 'Weight, size and hardness: each boule plays its own way.',
		jackNote: 'Just a colour: the jack rolls and measures the same.',
		decorNote: 'Scenery plays nothing: the pitch is the same everywhere.',
		items: {
			boule_inox: 'Classic', boule_bronze: 'Bronze', boule_cuivre: 'Copper', boule_bleue: 'Midnight',
			boule_rouge: 'Red', boule_verte: 'Green', boule_carbone: 'Carbon', boule_tireuse: 'Shooter',
			boule_pointeuse: 'Pointer', boule_plume: 'Feather', boule_massive: 'Heavyweight', boule_doree: 'Golden',
			boule_provencale: 'Provençal', boule_damas: 'Damascus',
			jack_orange: 'Orange jack', jack_jaune: 'Yellow jack', jack_vert: 'Green jack', jack_rose: 'Pink jack',
			jack_buis: 'Boxwood jack',
			decor_jardin: 'The Provençal garden', decor_place: 'The village square', decor_soir: 'The square at dusk',
			decor_port: 'The harbour',
		},
		decorText: {
			decor_jardin: 'The hedge, the dry-stone wall, the cypresses and the hilltop village in the distance.',
			decor_place: 'A summer afternoon under the plane trees.',
			decor_soir: 'The sun goes down, the string lights come on, the café is open.',
			decor_port: 'On the quay, between the palms and the moored fishing boats, the sea out to the lighthouse.',
		},
		make: (g: number, mm: number, hard: string) => `${g} g · ${mm} mm · ${hard}`,
		hardness: { tendre: 'soft', demi: 'medium', dure: 'hard' },
		pro: { heavy: 'steady', light: 'accurate', big: 'hits more', small: 'hard to hit', soft: 'sticks on landing', hard: 'runs on' },
		con: { heavy: 'less accurate', light: 'deflects more', big: 'bigger target', small: 'loses close calls', soft: 'rolls less', hard: 'bounces more' },
		text: {
			heavy: 'Heavy: stones and gravel push it off line less, it digs into loose ground and is hard to knock away. But the hand holds it less steady.',
			light: 'Light: the hand throws it more accurately. But stones push it off line more, it skips on loose ground and is easily knocked away.',
			big: 'Big: it hits more easily when shooting and measures closer. But it is easier for the opponent to hit too.',
			small: 'Small: harder for the opponent to hit. But it loses close calls: at the same distance, the bigger boule is nearer.',
			soft: 'Soft: it sticks where it lands, good for lobs. But it rolls less: a rolling throw needs more pace.',
			hard: 'Hard: it rolls further after landing, good for rolling throws. But it bounces more on a lob.',
		},
		balanced: 'All-rounder: the reference',
		balancedText: 'All-rounder: the reference boule, neither heavy nor light, neither big nor small.',
		buy: 'Buy',
		buyAria: (name: string, n: number) => `Buy ${name} for ${n} cocoins`,
		equip: 'Use',
		equipped: '✓ Equipped',
		bought: '✓ Bought!',
		free: 'Free',
		short: (n: number) => `${n} more cocoins`,
		balance: 'cocoins',
		nextMatch: 'It comes into play from the next match.',
		fairDaily: 'In the daily challenge every boule plays like the Classic: the leaderboard stays fair.',
		earn: 'Cocoins come from level stars and the daily challenge.',
	},
	play: 'Play',
	levelWon: (a, b) => `Won ${a} — ${b}`,
	levelLost: (a, b) => `Lost ${a} — ${b}`,

	event: (ev, me) => {
		const who = (s: Side) => (s === me ? 'for you' : 'for your opponent');
		switch (ev.k) {
			case 'jack-short': return 'Jack too short — your opponent places it';
			case 'jack-long': return 'Jack too long — your opponent places it';
			case 'jack-out': return 'Jack off the pitch — your opponent places it';
			case 'jack-edge': return 'Jack within a metre of the edge — your opponent places it';
			case 'jack-dead': return ev.side === null ? 'Jack out — dead end' : `Jack out — ${en.points(ev.points)} ${who(ev.side)}`;
			case 'match-won': return `${en.points(ev.points)} — game won`;
			case 'end': return ev.side === null ? 'Dead end — replayed' : `${en.points(ev.points)} ${who(ev.side)}`;
		}
	},

	tipTitle: 'Enjoying the game? Buy the developer…',
	coffeeBtn: '☕ a coffee · €1.50',
	tipBtn: '🥂 a drink · from €2',
	tipWink: '… or a pastis?',
	barLabel: '🍺 A drink?',
	barTitle: '🍺 The bar',
	close: 'Close',
	scannerTitle: 'Playing for real?',
	scannerBtn: '📱 Pétanque Scanner measures your points',
	scannerHref: '/en/petanque-scanner/',

	help: (daily, stations, target) => (
		<>
			Anywhere on the picture, you <strong>turn the camera freely</strong> — it never touches the throw.
			The <strong>pad at the bottom</strong> is your <strong>throwing board</strong>: the height where you
			put your finger sets the angle — <strong>very bottom = high lob</strong>, very top = a roll along the ground — and
			the marks tell you where you are.
			Slide up for power, sideways to correct the direction, release to throw.
			The 🔍 slider (or the mouse wheel) <strong>walks you up to the boules</strong> to see them close, without touching the throw.
			You <strong>aim the jack</strong>: from above, touch the ground to set the ring, then throw it there.
			{daily
				? ` Daily challenge: ${stations} stations, one boule each. Carreau = 5 pts, target knocked out = 3, hit and stayed put = 1. The clock breaks ties.`
				: ` Jack between 6 and 10 m, otherwise your opponent places it. Whoever does not hold the point plays next. First to ${target}.`}
		</>
	),
};

const es: Strings = {
	langName: 'Español',
	langTitle: 'Langue / Language / Idioma',
	diff: { facile: 'Fácil', moyen: 'Medio', difficile: 'Difícil', expert: 'Experto' },
	surface: { 'terre-battue': 'Tierra batida', 'gravier-fin': 'Grava fina', 'gravier-gros': 'Grava gruesa', sable: 'Arena' },
	surfaceHint: {
		'terre-battue': 'rueda lejos, se desvía poco',
		'gravier-fin': 'agarra un poco',
		'gravier-gros': 'frena en seco, sale de lado',
		sable: 'se para en seco, sin rebote',
	},
	loft: { plomb: 'A plomo', portee: 'Bolea', demi: 'Media bolea', roulette: 'Rodada' },
	band: { roulette: 'Rodada', demi: 'Media', portee: 'Bolea', plomb: 'Plomo' },
	view: { jeu: 'Vista de juego', tete: 'Zoom en las bolas', dessus: 'Vista aérea' },
	grade: { 5: '¡Carreau!', 4: 'Palet (casi carreau)', 3: 'Bola sacada', 1: 'Tocada, en su sitio', 0: 'Fallo' },
	kind: { nue: 'Bola libre', masque: 'Bola tapada', serree: 'Bola arrimada' },
	weekday: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],

	lobbySearching: 'Buscando jugadores en línea…',
	lobbyNobody: 'No hay nadie más en línea por ahora',
	lobbyNobodyInvite: 'No hay nadie más en línea · invita a un amigo con un código',
	lobbyOthers: (n, play) => `${n} ${plural(n, 'jugador más', 'jugadores más')} en línea${play ? ` · ${play} en partida` : ''}`,
	tableCap: 'Distancias al boliche',
	you: 'Tú',
	adv: 'Riv',
	foe: 'el rival',
	turnMine: 'Te toca',
	turnFoe: (name) => `Le toca a ${name}`,
	turnMineLeft: (n) => `Te toca · ${plural(n, 'queda', 'quedan')} ${n} ${plural(n, 'bola', 'bolas')}`,
	outMine: 'Tu bola se ha salido',
	outFoe: 'La bola del rival se ha salido',
	pointRetake: '¡Recuperas el punto!',
	pointKeep: 'Mantienes el punto',
	pointHave: 'Tienes el punto',
	foeRetake: 'El rival recupera el punto',
	foeKeep: 'El rival mantiene el punto',
	foeHave: 'El rival tiene el punto',
	tie: '¡Empate!',
	points: (n) => `${n} ${plural(n, 'punto', 'puntos')}`,
	nullEnd: 'Mano nula',
	finish: 'Fin',
	oppLeft: 'El rival se ha ido',
	oppAway: 'Rival desconectado — esperando a que vuelva…',
	reconnecting: 'Conexión perdida — reconectando…',
	mpUnavailable: 'Multijugador no disponible',
	noFreeGame: 'No hay partidas libres, vuelve a intentarlo',
	connError: 'Error de conexión',
	codeBad: 'Código lleno o no válido',

	dailyDone: (p, max) => `Recorrido terminado · ${p} / ${max}`,
	rolling: 'La bola rueda…',
	station: (kind, d) => `${kind} a ${d} m — ¡tira!`,
	preparing: 'Preparando el reto…',
	placeMine: '✋ Toca el suelo dentro del anillo amarillo',
	placeFoe: 'El rival coloca el boliche…',
	foeThrowing: 'El rival tira…',
	foePlaying: 'El rival juega…',
	foeThinking: 'El rival piensa…',
	aimJack: '🎯 Toca el suelo para apuntar',
	pressBoard: '▲ Pon el dedo en la tabla y desliza hacia arriba',
	backToGame: '👁 Toca la tabla para volver a la vista de juego',
	orient: '◀ ▶ orienta · suelta para lanzar',
	releaseNothing: '✖ Si sueltas aquí no sale nada — sube para armar',

	stationNo: 'Taller',
	level: 'Nivel',
	diffTitle: 'Nivel del rival y terreno',
	groundBtn: 'Elegir el terreno',
	distsBtn: 'Círculos de distancia al boliche',
	leaveOnline: 'Salir de la partida en línea',
	restart: 'Volver a empezar',
	soundOff: 'Silenciar',
	soundOn: 'Activar el sonido',
	effetOn: 'Modo experto: dar efecto (apoya el dedo a la izquierda o a la derecha de la tabla)',
	effetOff: 'Modo simple: sin efecto',
	effet: 'efecto',
	dailyTag: (weekday, surface) => `Reto del día · ${weekday} · ${surface}`,
	opponent: 'Rival',
	ai: 'IA',
	endOf: (n, target) => `Mano ${n} · a ${target}`,
	viewsAria: 'Vista de la cámara',
	goal: (n) => <>Partida a <strong>{n}</strong> puntos</>,
	loading: 'Cargando el terreno…',
	noWebgl: 'Tu dispositivo no puede mostrar el terreno 3D (WebGL no disponible).',
	loftLocked: 'ángulo fijado',
	loftHint: 'más abajo = más bombeado',
	zoomIn: 'Acercar las bolas',
	zoomInTitle: 'Acercar (W, rueda)',
	zoomAria: 'Zoom en las bolas',
	zoomValue: (m) => `ampliado ${m} veces`,
	zoomOut: 'Alejar',
	zoomOutTitle: 'Alejar (S, rueda)',
	yourTurn: 'Tú',
	gripAria: 'Mover la tabla de tiro',
	gripTitle: 'Desliza para mover la tabla',
	promoLine: '¿Quién tiene el punto? Mídelo de verdad, con el móvil.',
	promoFree: 'App gratuita ›',
	promoClose: 'Cerrar el anuncio de Pétanque Scanner',
	placeHere: '✓ Colocar aquí',
	throwJackHere: '🎯 Lanzar el boliche aquí',
	continue: 'Continuar ›',
	courseDone: '🎯 Recorrido terminado',
	eventTab: 'Desafío',
	eventTag: (n) => `Desafío del torneo · ${n} bolas`,
	eventBoard: 'Clasificación del desafío',
	eventEmpty: 'Nadie ha jugado el desafío todavía. ¡Estrena tú la clasificación!',
	retry: 'Volver a intentarlo',
	carreauMine: '💥 ¡Carreau!',
	carreauFoe: (who) => `💥 ¡Carreau de ${who}!`,
	youWin: '🏆 ¡Ganas la partida!',
	foeWins: '❌ Gana el rival',
	quit: 'Salir',
	newGame: 'Nueva partida',
	mpTitle: 'Jugar en línea',
	quick: '⚡ Partida rápida',
	quickWaiting: (n) => `⚡ Partida rápida · ${n} ${plural(n, 'jugador te espera', 'jugadores te esperan')}`,
	createCode: '🔑 Crear un código de amigo',
	codeAria: 'Código de amigo',
	join: 'Unirse',
	back: 'Volver',
	connecting: 'Conectando…',
	waiting: 'Esperando a un jugador…',
	codeIs: 'Código:',
	cancel: 'Cancelar',
	groundTitle: 'Partida libre',
	diffLab: 'Rival',
	surfaceLab: 'Superficie',
	random: 'Al azar',
	surfaceAuto: 'Superficie según la dificultad',
	pitchLab: 'Terreno',
	pitchAutoPill: (n: number) => `Auto (${n})`,
	pitchHint: (n: number) => `${n}/100 · ${n < 20 ? 'casi rastrillado, la bola va recta'
		: n < 40 ? 'algunos baches, manchas de otro suelo'
		: n < 60 ? 'baches, piedras, grava suelta junto a las tablas'
		: n < 80 ? 'hoyos de bombeo, montones de grava, piedras por todas partes'
		: 'terreno destrozado: nada va recto'}`,
	pitchLine: (surface: string, n: number) => `${surface} · terreno ${n}/100`,
	shop: {
		btn: 'Tienda',
		title: 'Tienda',
		tabs: { boule: 'Bolas', jack: 'Boliches', decor: 'Escenarios' },
		note: 'Peso, tamaño y dureza: cada bola juega a su manera.',
		jackNote: 'Solo un color: el boliche rueda y se mide igual.',
		decorNote: 'El escenario no juega: la pista es la misma en todos.',
		items: {
			boule_inox: 'Clásica', boule_bronze: 'Bronce', boule_cuivre: 'Cobre', boule_bleue: 'Noche',
			boule_rouge: 'Roja', boule_verte: 'Verde', boule_carbone: 'Carbono', boule_tireuse: 'Tiradora',
			boule_pointeuse: 'Arrimadora', boule_plume: 'Pluma', boule_massive: 'Maciza', boule_doree: 'Dorada',
			boule_provencale: 'Provenzal', boule_damas: 'Damasco',
			jack_orange: 'Boliche naranja', jack_jaune: 'Boliche amarillo', jack_vert: 'Boliche verde', jack_rose: 'Boliche rosa',
			jack_buis: 'Boliche de boj',
			decor_jardin: 'El jardín provenzal', decor_place: 'La plaza del pueblo', decor_soir: 'La plaza al atardecer',
			decor_port: 'El puerto',
		},
		decorText: {
			decor_jardin: 'El seto, el muro de piedra seca, los cipreses y el pueblo encaramado a lo lejos.',
			decor_place: 'Una tarde de verano bajo los plátanos.',
			decor_soir: 'El sol se pone, las guirnaldas se encienden, el café está abierto.',
			decor_port: 'En el muelle, entre las palmeras y las barcas amarradas, el mar hasta el faro.',
		},
		make: (g: number, mm: number, hard: string) => `${g} g · ${mm} mm · ${hard}`,
		hardness: { tendre: 'blanda', demi: 'semiblanda', dure: 'dura' },
		pro: { heavy: 'estable', light: 'precisa', big: 'acierta más', small: 'difícil de tocar', soft: 'se pega al suelo', hard: 'rueda lejos' },
		con: { heavy: 'menos precisa', light: 'se desvía más', big: 'blanco mayor', small: 'pierde en la medición', soft: 'rueda menos', hard: 'rebota más' },
		text: {
			heavy: 'Pesada: las piedras y la grava la desvían menos, se hunde en el suelo blando y cuesta sacarla. Pero la mano la controla peor.',
			light: 'Ligera: la mano la lanza con más precisión. Pero las piedras la desvían más, se escapa en el suelo blando y es fácil de sacar.',
			big: 'Grande: acierta con más facilidad al tirar y se mide más cerca. Pero el rival también la toca más fácilmente.',
			small: 'Pequeña: al rival le cuesta más tocarla. Pero pierde en la medición: a igual distancia, la más grande está más cerca.',
			soft: 'Blanda: se pega al suelo al caer, buena para bombear. Pero rueda menos: una rodada necesita más fuerza.',
			hard: 'Dura: rueda más lejos tras caer, buena para la rodada. Pero rebota más al bombear.',
		},
		balanced: 'Polivalente: la referencia',
		balancedText: 'Polivalente: la bola de referencia, ni pesada ni ligera, ni grande ni pequeña.',
		buy: 'Comprar',
		buyAria: (name: string, n: number) => `Comprar ${name} por ${n} cocoins`,
		equip: 'Usar',
		equipped: '✓ Equipado',
		bought: '✓ ¡Comprado!',
		free: 'Gratis',
		short: (n: number) => `Faltan ${n} cocoins`,
		balance: 'cocoins',
		nextMatch: 'Entra en juego en la próxima partida.',
		fairDaily: 'En el reto del día todas las bolas juegan como la Clásica: la clasificación es justa.',
		earn: 'Los cocoins se ganan con las estrellas de los niveles y el reto del día.',
	},
	play: 'Jugar',
	levelWon: (a, b) => `Ganado ${a} — ${b}`,
	levelLost: (a, b) => `Perdido ${a} — ${b}`,

	event: (ev, me) => {
		const who = (s: Side) => (s === me ? 'para ti' : 'para el rival');
		switch (ev.k) {
			case 'jack-short': return 'Boliche demasiado corto — lo coloca el rival';
			case 'jack-long': return 'Boliche demasiado largo — lo coloca el rival';
			case 'jack-out': return 'Boliche fuera del terreno — lo coloca el rival';
			case 'jack-edge': return 'Boliche a menos de un metro del borde — lo coloca el rival';
			case 'jack-dead': return ev.side === null ? 'Boliche fuera — mano nula' : `Boliche fuera — ${es.points(ev.points)} ${who(ev.side)}`;
			case 'match-won': return `${es.points(ev.points)} — partida ganada`;
			case 'end': return ev.side === null ? 'Mano nula — se repite' : `${es.points(ev.points)} ${who(ev.side)}`;
		}
	},

	tipTitle: '¿Te gusta el juego? Invita al desarrollador a…',
	coffeeBtn: '☕ un café · 1,50 €',
	tipBtn: '🍺 una caña · desde 2 €',
	tipWink: '… ¿o a un pastís?',
	barLabel: '🍺 ¿Una caña?',
	barTitle: '🍺 El bar',
	close: 'Cerrar',
	scannerTitle: '¿Juegas de verdad?',
	scannerBtn: '📱 Pétanque Scanner mide tus puntos',
	scannerHref: '/es/petanque-scanner/',

	help: (daily, stations, target) => (
		<>
			En cualquier punto de la imagen <strong>giras la cámara libremente</strong> — nunca afecta al tiro.
			El <strong>recuadro de abajo</strong> es tu <strong>tabla de tiro</strong>: la altura a la que
			pones el dedo elige el ángulo — <strong>abajo del todo = a plomo</strong>, arriba del todo = rodada a ras de suelo — y
			las marcas te dicen dónde estás.
			Desliza hacia arriba para la fuerza, hacia los lados para corregir la dirección, y suelta para lanzar.
			El control 🔍 (o la rueda del ratón) te <strong>acerca a las bolas</strong> para verlas de cerca, sin tocar el tiro.
			El <strong>boliche se apunta</strong>: desde arriba, toca el terreno para poner el círculo y lánzalo allí.
			{daily
				? ` Reto del día: ${stations} talleres, una bola cada uno. Carreau = 5 ptos, bola sacada = 3, tocada en su sitio = 1. El cronómetro desempata.`
				: ` Boliche entre 6 y 10 m; si no, lo coloca el rival. Juega quien no tiene el punto. Gana el primero en llegar a ${target}.`}
		</>
	),
};

export const STRINGS: Record<GameLang, Strings> = { fr, en, es };

/** Stripe Payment Links behind the tip buttons: a drink (pay what you want, from 2 €) and a
 *  coffee (1.50 €). An empty one hides its button. */
export const TIP_URL = 'https://buy.stripe.com/3cI9AS34L7sH3MJbNNaVa00';
export const COFFEE_URL = 'https://buy.stripe.com/cNi14mgVB28nern5ppaVa01';
