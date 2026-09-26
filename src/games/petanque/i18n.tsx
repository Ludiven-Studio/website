/* Every word the pétanque island shows, in French, English and Spanish. The game logic keeps ids
   (difficulty, surface, loft band…) and only this file turns them into words. */

import type { ReactNode } from 'react';
import type { GameLang } from '../../lib/gameLang';
import type { SurfaceId } from './terrain';
import type { Grade } from './daily';
import type { MatchEvent, Side } from './rules13';

export const LANG_KEY = 'petanque-lang';

type Diff = 'facile' | 'moyen' | 'difficile' | 'expert';
type Relief = 'plat' | 'vallonne' | 'accidente';
type Band = 'roulette' | 'demi' | 'portee' | 'plomb';
type View = 'jeu' | 'tete' | 'dessus';
type Kind = 'nue' | 'masque' | 'serree';

const plural = (n: number, one: string, many: string): string => (n > 1 ? many : one);

const fr = {
	langName: 'Français',
	langTitle: 'Langue / Language / Idioma',
	diff: { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile', expert: 'Expert' } as Record<Diff, string>,
	relief: { plat: 'Plat', vallonne: 'Vallonné', accidente: 'Accidenté' } as Record<Relief, string>,
	reliefHint: { plat: 'ratissé, la boule va droit', vallonne: 'des bosses et des creux', accidente: 'faux plat marqué' } as Record<Relief, string>,
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
	grade: { 5: 'Carreau !', 3: 'Cible sortie', 1: 'Touchée, en place', 0: 'Manqué' } as Record<Grade, string>,
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
	reliefLab: 'Relief',
	random: 'Au hasard',
	surfaceAuto: 'Surface suivant la difficulté',
	reliefAuto: 'relief suivant la difficulté',
	play: 'Jouer',
	levelWon: (a: number, b: number) => `Gagné ${a} — ${b}`,
	levelLost: (a: number, b: number) => `Battu ${a} — ${b}`,

	event: (ev: MatchEvent, me: Side): string => {
		const who = (s: Side) => (s === me ? 'pour toi' : 'pour l’adversaire');
		switch (ev.k) {
			case 'jack-short': return 'Bouchon trop court — à l’adversaire de le placer';
			case 'jack-long': return 'Bouchon trop long — à l’adversaire de le placer';
			case 'jack-out': return 'Bouchon hors du terrain — à l’adversaire de le placer';
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
	relief: { plat: 'Flat', vallonne: 'Rolling', accidente: 'Rough' },
	reliefHint: { plat: 'raked smooth, the boule runs straight', vallonne: 'bumps and hollows', accidente: 'a marked slope' },
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
	grade: { 5: 'Carreau!', 3: 'Target knocked out', 1: 'Hit, stayed put', 0: 'Missed' },
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
	reliefLab: 'Relief',
	random: 'Random',
	surfaceAuto: 'Surface set by the difficulty',
	reliefAuto: 'relief set by the difficulty',
	play: 'Play',
	levelWon: (a, b) => `Won ${a} — ${b}`,
	levelLost: (a, b) => `Lost ${a} — ${b}`,

	event: (ev, me) => {
		const who = (s: Side) => (s === me ? 'for you' : 'for your opponent');
		switch (ev.k) {
			case 'jack-short': return 'Jack too short — your opponent places it';
			case 'jack-long': return 'Jack too long — your opponent places it';
			case 'jack-out': return 'Jack off the pitch — your opponent places it';
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
	relief: { plat: 'Llano', vallonne: 'Ondulado', accidente: 'Accidentado' },
	reliefHint: { plat: 'rastrillado, la bola va recta', vallonne: 'baches y hondonadas', accidente: 'pendiente marcada' },
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
	grade: { 5: '¡Carreau!', 3: 'Bola sacada', 1: 'Tocada, en su sitio', 0: 'Fallo' },
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
	reliefLab: 'Relieve',
	random: 'Al azar',
	surfaceAuto: 'Superficie según la dificultad',
	reliefAuto: 'relieve según la dificultad',
	play: 'Jugar',
	levelWon: (a, b) => `Ganado ${a} — ${b}`,
	levelLost: (a, b) => `Perdido ${a} — ${b}`,

	event: (ev, me) => {
		const who = (s: Side) => (s === me ? 'para ti' : 'para el rival');
		switch (ev.k) {
			case 'jack-short': return 'Boliche demasiado corto — lo coloca el rival';
			case 'jack-long': return 'Boliche demasiado largo — lo coloca el rival';
			case 'jack-out': return 'Boliche fuera del terreno — lo coloca el rival';
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
