// Pétanque Game, the studio's mobile pétanque game: its product page and download page in five languages.
// The texts follow the store listings (PetanqueGame docs/store.md and Marketing/Texts); the store visuals
// come from its Marketing folder. The web version of the game is /jeux/petanque/.

import type { AppCopy, AppDownloadCopy, LandingLang, PetanqueApp } from './petanqueApps';

export const APP_NAME = 'Pétanque Game';
export const ANDROID_ID = 'com.ludivenstudio.petanquegame';

/**
 * The store listings, once the game is on them: the badges link there instead of « coming soon ».
 * Google Play: `https://play.google.com/store/apps/details?id=${ANDROID_ID}`.
 * App Store: `https://apps.apple.com/app/id<number>`, with no country code (Apple picks the visitor's store).
 */
export const STORES: { play?: string; apple?: string } = {};

const play = (lang: LandingLang): string | undefined => STORES.play && `${STORES.play}&hl=${lang}`;

export const LANDING_PATHS: Record<LandingLang, string> = {
	fr: '/petanque-game/',
	en: '/en/petanque-game/',
	es: '/es/petanque-game/',
	de: '/de/petanque-game/',
	it: '/it/petanque-game/',
};

export const DOWNLOAD_PATHS: Record<LandingLang, string> = {
	fr: '/petanque-game/telecharger/',
	en: '/en/petanque-game/download/',
	es: '/es/petanque-game/descargar/',
	de: '/de/petanque-game/herunterladen/',
	it: '/it/petanque-game/scarica/',
};

/** The game in the browser, where it started. */
export const WEB_GAME = '/jeux/petanque/';

const A = '/assets/petanque-game';
export const ICON = `${A}/icon.webp`;
const langs: LandingLang[] = ['fr', 'en', 'es', 'de', 'it'];
const perLang = (f: (l: LandingLang) => string) =>
	Object.fromEntries(langs.map((l) => [l, f(l)])) as Record<LandingLang, string>;
/** The Play feature graphic, its strapline painted in each language. */
const HEROES = perLang((l) => `${A}/feature-${l}.webp`);
const OG_IMAGES = perLang((l) => `/assets/work/og/petanque-game${l === 'fr' ? '' : `-${l}`}.jpg`);
/** The Play store visuals, captioned in each language: aim, point, teams, online, settings, boules, leagues, rules. */
const SCREENS = Object.fromEntries(
	langs.map((l) => [l, [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `${A}/screen-0${n}-${l}.webp`)]),
) as Record<LandingLang, string[]>;

/** French wants a no-break space before : ? ! ; » and after «. */
const NBSP = String.fromCharCode(160);
function typoFr<T>(v: T): T {
	if (typeof v === 'string') return v.replace(/ ([:?!;»])/g, `${NBSP}$1`).replace(/« /g, `«${NBSP}`) as T;
	if (Array.isArray(v)) return v.map(typoFr) as T;
	if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typoFr(x)])) as T;
	return v;
}

/** What each store visual says, in SCREENS order (its painted caption). */
const SHOTS: Record<LandingLang, string[]> = {
	fr: [
		'La vraie pétanque en 3D : roulette, demi-portée, portée, plombée',
		'Le point au centimètre : des cercles autour du bouchon',
		'Seul ou en équipe : tête-à-tête, doublette ou triplette',
		'Joue en ligne : avec un ami, ou en partie classée',
		'Quatre décors de Provence : choisis où tu joues',
		'Des boules de caractère : poids, diamètre, dureté, 14 modèles',
		'Ligues et coupes : de Bronze à Diamant, gagne des trophées',
		'Les règles en images : six pages pour bien débuter',
	],
	en: [
		'Real pétanque in 3D: roll, half lob, lob or high lob',
		'Every centimetre counts: distance rings around the jack',
		'Solo or in teams: singles, doubles or triples',
		'Play online: with a friend, or in ranked matches',
		'Four settings in Provence: choose where you play',
		'Boules with character: weight, size, hardness, 14 models',
		'Leagues and cups: from Bronze to Diamond, win trophies',
		'The rules in pictures: six pages to get started',
	],
	es: [
		'Petanca de verdad en 3D: rodada, medio lob, lob o lob alto',
		'Cada centímetro cuenta: círculos de distancia al boliche',
		'Solo o en equipo: individual, dupletas o tripletas',
		'Juega en línea: con un amigo o en partidas clasificadas',
		'Cuatro escenarios de Provenza: elige dónde juegas',
		'Bolas con carácter: peso, diámetro, dureza, 14 modelos',
		'Ligas y copas: de Bronce a Diamante, gana trofeos',
		'Las reglas en imágenes: seis páginas para empezar',
	],
	de: [
		'Echtes Boule in 3D: Rollen, halber Lob, Lob, hoher Lob',
		'Jeder Zentimeter zählt: Abstandskreise um die Zielkugel',
		'Allein oder im Team: Tête-à-tête, Doublette, Triplette',
		'Spiel online: mit Freunden oder in gewerteten Partien',
		'Vier Schauplätze der Provence: Wähle, wo du spielst',
		'Kugeln mit Charakter: Gewicht, Größe, Härte, 14 Modelle',
		'Ligen und Pokale: von Bronze bis Diamant, hol Trophäen',
		'Die Regeln in Bildern: sechs Seiten für den Einstieg',
	],
	it: [
		'La vera pétanque in 3D: rotolata, mezzo lob, lob o lob alto',
		'Conta ogni centimetro: cerchi di distanza dal pallino',
		'Da solo o a squadre: individuale, coppie o terne',
		'Gioca online: con un amico o in partite classificate',
		'Quattro scenari di Provenza: scegli dove giocare',
		'Bocce con carattere: peso, diametro, durezza, 14 modelli',
		'Leghe e coppe: da Bronzo a Diamante, vinci trofei',
		'Le regole per immagini: sei pagine per iniziare',
	],
};

const copy: Record<LandingLang, AppCopy> = {
	fr: typoFr<AppCopy>({
		title: 'Pétanque Game — le jeu de boules en 3D sur ton téléphone',
		description:
			"Pétanque en 3D sur Android et iPhone : contre l'ordinateur, à deux sur un téléphone ou en ligne, en tête-à-tête, doublette ou triplette. Ligues, défis du jour, 14 boules, quatre décors. Bientôt sur Google Play et l'App Store.",
		tagline:
			"Une partie sur la place du village, à l'ombre des platanes. Les boules roulent, rebondissent et se choquent comme pour de vrai, le terrain a ses pentes et ses cailloux, et la partie se joue en 13 points, selon les règles de la pétanque. Le jeu est fait pour ceux qui jouent pour de vrai : on pointe, on tire, on lit le terrain avant de lancer.",
		heroAlt: "Deux boules et un bouchon sur le gravier d'une place de village au soleil couchant, sous le titre Pétanque Game",
		badges: { play: play('fr'), playAlt: 'Disponible sur Google Play', apple: STORES.apple, appleAlt: "Télécharger dans l'App Store" },
		soon: "Bientôt sur Google Play et l'App Store",
		soonShort: 'Bientôt',
		stepsTitle: 'Comment on lance',
		steps: [
			{
				icon: 'mobile',
				title: 'Choisis ton lancer',
				body: 'Pose le doigt sur la planche, à la hauteur du lancer : roulette, demi-portée, portée ou plombée.',
			},
			{
				icon: 'winding-path',
				title: 'Dose et vise',
				body: 'Remonte le doigt pour doser, glisse à gauche ou à droite pour viser. Le chemin de la boule se dessine avant que tu lâches.',
			},
			{
				icon: 'petanque',
				title: 'Lâche',
				body: "Ton joueur lance. La boule roule, rebondit et choque comme pour de vrai, sur un terrain qui a ses pentes et ses cailloux. En mode expert, donne de l'effet.",
			},
		],
		featuresTitle: 'Ce que tu trouveras',
		features: [
			{
				title: "Contre l'ordinateur ou à deux",
				body: 'Quatre niveaux, de Facile au champion du village, ou à deux sur le même téléphone, chacun son tour. En tête-à-tête, en doublette ou en triplette, ici comme en ligne.',
			},
			{
				title: 'En ligne',
				body: '« Avec un ami » : une partie privée grâce à un code. « Trouver un adversaire » : un joueur en ligne, et tes tête-à-tête te font monter ou descendre au classement, de Place du village à National.',
			},
			{
				title: 'Les ligues',
				body: 'De Bronze à Diamant : des coupes en trois matchs à élimination, des trophées et des terrains de plus en plus durs. Chaque semaine, une coupe de Bronze est offerte.',
			},
			{
				title: 'Chaque jour',
				body: "Trois défis qui rapportent des pièces, tous faisables contre l'ordinateur, et un bonus quand tu reviens jouer. Des succès et tes statistiques : biberons, carreaux, fannies…",
			},
			{
				title: 'Un terrain qui compte',
				body: 'Terre battue, gravier fin, gros gravier ou sable, du plus lisse au plus accidenté. Accroupis-toi pour lire les pentes, ou va voir le jeu de près avant de jouer.',
			},
			{
				title: 'Des boules de caractère',
				body: "14 modèles, de 650 à 790 g et de 71 à 79 mm, tendres ou dures. Une lourde résiste aux cailloux, une tendre colle au sol, une dure roule plus loin : aucune n'est meilleure partout.",
			},
			{
				title: 'Ton joueur, ton équipe',
				body: 'Douze joueurs et joueuses, ton pseudo et la tenue de toute ton équipe. Dans le cercle, chacun a son petit rituel avant de lancer, comme les vrais joueurs.',
			},
			{
				title: 'Quatre décors',
				body: 'La place du village, la place au crépuscule et ses guirlandes, le boulodrome de campagne, le port et son phare. Une musique douce et les bruits du lieu : cigales, vagues, grillons le soir.',
			},
		],
		photoTitle: 'Apprendre sans peine',
		photoBody:
			"« Comment jouer » montre les règles en six pages illustrées, et une main y fait le lancer sur la planche. Avec « S'entraîner », tu lances toutes les boules, sans adversaire, et un coach te dit si ta boule était trop courte, trop longue, à gauche ou à droite, et comment corriger.",
		photoNote:
			"Il t'aide aussi dans tes premières parties. Les textes sont grands, les boutons aussi, sur téléphone comme sur tablette, et le jeu se règle à ta main : droitier ou gaucher, vue derrière le joueur ou à la première personne, cercles de distance autour du bouchon.",
		limitsTitle: 'Bon à savoir',
		limitsIntro: 'Ce qui marche sans internet, ce qui demande un compte, et la publicité.',
		limits: [
			{
				title: 'Sans internet ni compte',
				body: "Contre l'ordinateur, à deux sur un téléphone et à l'entraînement, tu joues hors ligne, sans rien créer.",
			},
			{
				title: 'Avec un compte',
				body: 'Les pièces, le magasin, les ligues, le jeu en ligne et le classement demandent internet et un compte Google (Android) ou Apple (iPhone), pour retrouver ta progression sur un autre téléphone. Tu le supprimes quand tu veux, dans Options.',
			},
			{
				title: "La publicité, si tu l'acceptes",
				body: "Au premier lancement, le jeu te demande si tu acceptes la publicité. Si tu refuses, tu joues normalement, sans pub et sans les vidéos qui donnent des pièces. Tu peux changer d'avis dans Options › Choix publicitaires.",
			},
			{
				title: 'Pas de chat',
				body: 'En ligne, ton adversaire voit ton pseudo, ton joueur et tes lancers, rien de plus. Les pseudos grossiers sont filtrés, et tu peux en signaler un.',
			},
		],
		priceTitle: 'Combien ça coûte',
		priceBody:
			"Le jeu est gratuit. Si tu acceptes la publicité, tu vois au plus une pub toutes les deux parties libres contre l'ordinateur, et des vidéos facultatives te donnent des pièces. « Sans publicité » retire les pubs entre les parties. Des pièces s'achètent aussi, mais tout ce qui coûte des pièces se gagne en jouant.",
		galleryTitle: 'Le jeu en images',
		screensAlt: SHOTS.fr,
		faqTitle: 'Questions fréquentes',
		faq: [
			{
				q: 'Quand sort le jeu ?',
				a: "Bientôt, sur Google Play et l'App Store. En attendant, la pétanque se joue déjà dans ton navigateur, sur ce site.",
			},
			{
				q: 'Faut-il internet ?',
				a: "Non pour jouer contre l'ordinateur, à deux sur un téléphone ou à l'entraînement. Oui pour le jeu en ligne, les ligues, le magasin et le classement.",
			},
			{
				q: 'Pourquoi un compte ?',
				a: 'Tes pièces et tes objets sont gardés sur ton compte : tu les retrouves sur un autre téléphone. Tu te connectes avec Google sur Android, avec Apple sur iPhone, et tu supprimes ton compte quand tu veux, dans Options.',
			},
			{
				q: 'Les règles sont-elles les vraies ?',
				a: "Oui : la partie se joue en 13 points, mène après mène, et c'est le côté qui n'a pas le point qui rejoue. « Comment jouer » explique tout en six pages illustrées.",
			},
			{
				q: 'Sur quels appareils, dans quelles langues ?',
				a: 'Téléphones et tablettes Android, iPhone et iPad, en français, anglais, espagnol, allemand et italien.',
			},
			{
				q: 'Et sur ordinateur ?',
				a: "La pétanque du site se joue dans le navigateur, sans rien installer : c'est de là qu'est parti le jeu.",
			},
		],
		makingOfTitle: 'Comment le jeu est fait',
		makingOfBody:
			'Le jeu est né sur ce site : la pétanque du navigateur a été portée sous Unity, avec ses règles, sa physique et son adversaire recopiés ligne à ligne et tenus identiques par des tests. La fiche projet raconte la suite : le jeu en ligne, les joueurs, le terrain.',
		makingOfCta: 'Lire la fiche projet',
		makingOfHref: '/work/petanque-game/',
		legalIntro: 'À lire aussi :',
		support: 'Une question, une idée ? Écris-nous :',
		privacy: { label: 'politique de confidentialité', href: '/jeux/petanque/confidentialite/' },
		terms: { label: "conditions d'utilisation", href: '/jeux/petanque/cgu/' },
		closing: 'Bientôt sur Android et iPhone',
	}),
	en: {
		title: 'Pétanque Game — French boules in 3D on your phone',
		description:
			'Pétanque in 3D for Android and iPhone: against the computer, two on one phone or online, in singles, doubles or triples. Leagues, daily challenges, 14 boules, four settings. Coming soon to Google Play and the App Store.',
		tagline:
			'A match on the village square, in the shade of the plane trees. The boules roll, bounce and knock each other away as they do for real, the ground has its slopes and its stones, and the match is played to 13 points, by the rules of pétanque. The game is made for people who play for real: you point, you shoot, you read the ground before you throw.',
		heroAlt: 'Two boules and a jack on the gravel of a village square at sunset, under the title Pétanque Game',
		badges: { play: play('en'), playAlt: 'Get it on Google Play', apple: STORES.apple, appleAlt: 'Download on the App Store' },
		soon: 'Coming soon to Google Play and the App Store',
		soonShort: 'Coming soon',
		stepsTitle: 'How you throw',
		steps: [
			{
				icon: 'mobile',
				title: 'Pick your throw',
				body: 'Put a finger on the pad at the height of the throw: roll, half lob, lob or high lob.',
			},
			{
				icon: 'winding-path',
				title: 'Set the power, aim',
				body: "Slide up to set the power, left or right to aim. The boule's path is drawn before you let go.",
			},
			{
				icon: 'petanque',
				title: 'Let go',
				body: 'Your player throws. The boule rolls, bounces and knocks as it does for real, on ground with its slopes and its stones. In expert mode, add spin.',
			},
		],
		featuresTitle: "What you'll find",
		features: [
			{
				title: 'The computer, or two on one phone',
				body: 'Four levels, from Easy to the village champion, or two players on one phone, taking turns. In singles, doubles or triples, here as online.',
			},
			{
				title: 'Online',
				body: '"With a friend": a private game through a code. "Find an opponent": a player online, and your singles matches move you up or down the ranking, from Village square to National.',
			},
			{
				title: 'Leagues',
				body: 'From Bronze to Diamond: knockout cups of three matches, trophies, and rougher pitches as you go up. Every week, one Bronze cup entry is free.',
			},
			{
				title: 'Every day',
				body: 'Three challenges that pay coins, all doable against the computer, and a bonus when you come back to play. Achievements and your stats: kisses of the jack, carreaux, 13-0 wins…',
			},
			{
				title: 'Ground that matters',
				body: 'Hard-packed earth, fine gravel, coarse gravel or sand, from smooth to rough. Crouch to read the slopes, or walk up to the head before you play.',
			},
			{
				title: 'Boules with character',
				body: '14 models, from 650 to 790 g and 71 to 79 mm, soft or hard. A heavy one resists stones, a soft one sticks where it lands, a hard one runs on: none is better everywhere.',
			},
			{
				title: 'Your player, your team',
				body: 'Twelve men and women, your name and the outfit your whole team wears. In the circle, each player has their own little ritual before throwing, as real players do.',
			},
			{
				title: 'Four settings',
				body: 'The village square, the square at dusk with its string lights, the country ground, the harbour with its lighthouse. Gentle music and the sounds of the place: cicadas, waves, crickets in the evening.',
			},
		],
		photoTitle: 'Easy to learn',
		photoBody:
			'"How to play" shows the rules in six illustrated pages, and a hand throws on the pad for you to watch. With "Practice", you throw every boule with no opponent, and a coach tells you when a boule was too short, too long, left or right, and how to fix it.',
		photoNote:
			'It also helps in your first matches. The text is large, and so are the buttons, on a phone or a tablet, and the game fits your hand: right- or left-handed, view from behind the player or first person, distance rings around the jack.',
		limitsTitle: 'Good to know',
		limitsIntro: 'What works offline, what needs an account, and the ads.',
		limits: [
			{
				title: 'No internet, no account',
				body: 'Against the computer, two on one phone and in practice, you play offline, with nothing to sign up for.',
			},
			{
				title: 'With an account',
				body: 'Coins, the shop, the leagues, online play and the ranking need internet and a Google (Android) or Apple (iPhone) account, so you keep your progress on another phone. You can delete it at any time in Options.',
			},
			{
				title: 'Ads, only if you accept them',
				body: 'At first launch, the game asks whether you accept ads. If you decline, you play as usual, with no ads and without the videos that give coins. You can change your mind in Options › Ad choices.',
			},
			{
				title: 'No chat',
				body: 'Online, your opponent sees your name, your player and your throws, nothing more. Rude names are filtered, and you can report one.',
			},
		],
		priceTitle: 'What it costs',
		priceBody:
			'The game is free. If you accept ads, you see at most one ad every two free matches against the computer, and optional videos give you coins. "No ads" removes the ads between matches. Coins can also be bought, but everything that costs coins can be earned by playing.',
		galleryTitle: 'The game in pictures',
		screensAlt: SHOTS.en,
		faqTitle: 'Questions',
		faq: [
			{
				q: 'When does the game come out?',
				a: 'Soon, on Google Play and the App Store. Until then, pétanque already plays in your browser, on this website.',
			},
			{
				q: 'Do I need internet?',
				a: 'Not to play against the computer, two on one phone or in practice. Yes for online play, the leagues, the shop and the ranking.',
			},
			{
				q: 'Why an account?',
				a: 'Your coins and items are kept on your account, so you find them on another phone. You sign in with Google on Android, with Apple on iPhone, and you can delete your account at any time in Options.',
			},
			{
				q: 'Are the rules the real ones?',
				a: 'Yes: the match is played to 13 points, end after end, and the side that does not hold the point plays again. "How to play" explains it all in six illustrated pages.',
			},
			{
				q: 'Which devices, which languages?',
				a: 'Android phones and tablets, iPhone and iPad, in French, English, Spanish, German and Italian.',
			},
			{
				q: 'And on a computer?',
				a: "The website's pétanque plays in the browser, with nothing to install: that is where the game started.",
			},
		],
		makingOfTitle: 'How the game is made',
		makingOfBody:
			'The game started on this website: the browser pétanque was ported to Unity, its rules, physics and computer opponent copied line by line and kept identical by tests. The project page tells the rest: online play, the players, the ground.',
		makingOfCta: 'Read the project page',
		makingOfHref: '/en/work/petanque-game/',
		legalIntro: 'See also:',
		support: 'A question, an idea? Write to us:',
		privacy: { label: 'privacy policy', href: '/en/jeux/petanque/confidentialite/' },
		terms: { label: 'terms of use', href: '/en/jeux/petanque/cgu/' },
		closing: 'Coming soon to Android and iPhone',
	},
	es: {
		title: 'Pétanque Game — la petanca en 3D en tu móvil',
		description:
			'Petanca en 3D para Android y iPhone: contra la máquina, entre dos en un teléfono o en línea, individual, dupletas o tripletas. Ligas, desafíos diarios, 14 bolas, cuatro escenarios. Próximamente en Google Play y el App Store.',
		tagline:
			'Una partida en la plaza del pueblo, a la sombra de los plátanos. Las bolas ruedan, rebotan y se golpean como de verdad, el terreno tiene sus pendientes y sus piedras, y la partida se juega a 13 puntos, con las reglas de la petanca. El juego está hecho para quienes juegan de verdad: se arrima, se tira, se lee el terreno antes de lanzar.',
		heroAlt: 'Dos bolas y un boliche sobre la grava de una plaza de pueblo al atardecer, bajo el título Pétanque Game',
		badges: { play: play('es'), playAlt: 'Disponible en Google Play', apple: STORES.apple, appleAlt: 'Consíguelo en el App Store' },
		soon: 'Próximamente en Google Play y el App Store',
		soonShort: 'Próximamente',
		stepsTitle: 'Cómo se lanza',
		steps: [
			{
				icon: 'mobile',
				title: 'Elige tu lanzamiento',
				body: 'Pon el dedo en la plataforma a la altura del lanzamiento: rodada, medio lob, lob o lob alto.',
			},
			{
				icon: 'winding-path',
				title: 'Dosifica y apunta',
				body: 'Desliza el dedo hacia arriba para dosificar, a izquierda o derecha para apuntar. El camino de la bola se dibuja antes de soltar.',
			},
			{
				icon: 'petanque',
				title: 'Suelta',
				body: 'Tu jugador lanza. La bola rueda, rebota y golpea como de verdad, en un terreno con sus pendientes y sus piedras. En modo experto, dale efecto.',
			},
		],
		featuresTitle: 'Lo que encontrarás',
		features: [
			{
				title: 'Contra la máquina o entre dos',
				body: 'Cuatro niveles, de Fácil al campeón del pueblo, o dos jugadores en el mismo teléfono, por turnos. Individual, dupletas o tripletas, aquí y en línea.',
			},
			{
				title: 'En línea',
				body: '«Con un amigo»: una partida privada gracias a un código. «Buscar un rival»: un jugador en línea, y tus partidas uno contra uno te hacen subir o bajar en la clasificación, de Plaza del pueblo a Nacional.',
			},
			{
				title: 'Ligas',
				body: 'De Bronce a Diamante: copas de tres partidas a eliminación, trofeos y terrenos cada vez más duros. Cada semana, una copa de Bronce es gratis.',
			},
			{
				title: 'Cada día',
				body: 'Tres desafíos que dan monedas, todos posibles contra la máquina, y un bono cuando vuelves a jugar. Logros y tus estadísticas: «biberones», «carreaux», victorias 13 a 0…',
			},
			{
				title: 'Un terreno que cuenta',
				body: 'Tierra batida, grava fina, grava gruesa o arena, de liso a accidentado. Agáchate para leer las pendientes, o acércate a ver el juego antes de lanzar.',
			},
			{
				title: 'Bolas con carácter',
				body: '14 modelos, de 650 a 790 g y de 71 a 79 mm, blandas o duras. Una pesada resiste mejor las piedras, una blanda se queda donde cae, una dura rueda más lejos: ninguna gana en todo.',
			},
			{
				title: 'Tu jugador, tu equipo',
				body: 'Doce jugadores y jugadoras, tu apodo y la equipación de todo tu equipo. En el círculo, cada uno tiene su pequeño ritual antes de lanzar, como los jugadores de verdad.',
			},
			{
				title: 'Cuatro escenarios',
				body: 'La plaza del pueblo, la plaza al atardecer con sus guirnaldas, la cancha de campo, el puerto con su faro. Música suave y los sonidos del lugar: cigarras, olas, grillos por la noche.',
			},
		],
		photoTitle: 'Fácil de aprender',
		photoBody:
			'«Cómo se juega» muestra las reglas en seis páginas ilustradas, y una mano hace el lanzamiento en la plataforma. Con «Entrenar», lanzas todas las bolas sin rival, y un entrenador te dice si tu bola se quedó corta, se pasó, se fue a la izquierda o a la derecha, y cómo corregirlo.',
		photoNote:
			'También te ayuda en tus primeras partidas. Los textos son grandes, y los botones también, en el teléfono o en la tableta, y el juego se adapta a tu mano: diestro o zurdo, vista detrás del jugador o en primera persona, círculos de distancia alrededor del boliche.',
		limitsTitle: 'Conviene saber',
		limitsIntro: 'Qué funciona sin internet, qué necesita una cuenta, y la publicidad.',
		limits: [
			{
				title: 'Sin internet ni cuenta',
				body: 'Contra la máquina, entre dos en un teléfono y en el entrenamiento, juegas sin conexión y sin registrarte.',
			},
			{
				title: 'Con una cuenta',
				body: 'Las monedas, la tienda, las ligas, el juego en línea y la clasificación necesitan internet y una cuenta de Google (Android) o de Apple (iPhone), para recuperar tu progreso en otro teléfono. Puedes eliminarla cuando quieras en Opciones.',
			},
			{
				title: 'Publicidad, solo si la aceptas',
				body: 'En el primer inicio, el juego te pregunta si aceptas la publicidad. Si la rechazas, juegas igual, sin anuncios y sin los vídeos que dan monedas. Puedes cambiar de opinión en Opciones › Opciones de anuncios.',
			},
			{
				title: 'Sin chat',
				body: 'En línea, tu rival ve tu apodo, tu jugador y tus lanzamientos, nada más. Los apodos groseros se filtran, y puedes denunciar uno.',
			},
		],
		priceTitle: 'Cuánto cuesta',
		priceBody:
			'El juego es gratis. Si aceptas la publicidad, ves como mucho un anuncio cada dos partidas libres contra la máquina, y los vídeos opcionales te dan monedas. «Sin anuncios» quita los anuncios entre partidas. También se pueden comprar monedas, pero todo lo que cuesta monedas se gana jugando.',
		galleryTitle: 'El juego en imágenes',
		screensAlt: SHOTS.es,
		faqTitle: 'Preguntas frecuentes',
		faq: [
			{
				q: '¿Cuándo sale el juego?',
				a: 'Muy pronto, en Google Play y el App Store. Mientras tanto, la petanca ya se juega en tu navegador, en esta web.',
			},
			{
				q: '¿Hace falta internet?',
				a: 'No para jugar contra la máquina, entre dos en un teléfono o en el entrenamiento. Sí para el juego en línea, las ligas, la tienda y la clasificación.',
			},
			{
				q: '¿Por qué una cuenta?',
				a: 'Tus monedas y tus objetos se guardan en tu cuenta: los recuperas en otro teléfono. Inicias sesión con Google en Android, con Apple en iPhone, y puedes eliminar tu cuenta cuando quieras en Opciones.',
			},
			{
				q: '¿Las reglas son las de verdad?',
				a: 'Sí: la partida se juega a 13 puntos, ronda tras ronda, y vuelve a jugar el equipo que no tiene el punto. «Cómo se juega» lo explica todo en seis páginas ilustradas.',
			},
			{
				q: '¿En qué dispositivos y en qué idiomas?',
				a: 'Teléfonos y tabletas Android, iPhone y iPad, en francés, inglés, español, alemán e italiano.',
			},
			{
				q: '¿Y en el ordenador?',
				a: 'La petanca de esta web se juega en el navegador, sin instalar nada: de ahí salió el juego.',
			},
		],
		makingOfTitle: 'Cómo está hecho el juego',
		makingOfBody:
			'El juego nació en esta web: la petanca del navegador se llevó a Unity, con sus reglas, su física y su rival copiados línea a línea y mantenidos idénticos por pruebas. La ficha del proyecto (en inglés) cuenta el resto: el juego en línea, los jugadores, el terreno.',
		makingOfCta: 'Leer la ficha del proyecto',
		makingOfHref: '/en/work/petanque-game/',
		legalIntro: 'Consulta también:',
		support: '¿Una pregunta, una idea? Escríbenos:',
		privacy: { label: 'política de privacidad', href: '/es/jeux/petanque/confidentialite/' },
		terms: { label: 'condiciones de uso', href: '/es/jeux/petanque/cgu/' },
		closing: 'Próximamente en Android y iPhone',
	},
	de: {
		title: 'Pétanque Game — Boule in 3D auf deinem Handy',
		description:
			'Boule in 3D für Android und iPhone: gegen den Computer, zu zweit auf einem Handy oder online, im Tête-à-tête, in der Doublette oder Triplette. Ligen, tägliche Aufgaben, 14 Kugeln, vier Spielorte. Demnächst bei Google Play und im App Store.',
		tagline:
			'Eine Partie auf dem Dorfplatz, im Schatten der Platanen. Die Kugeln rollen, springen und treffen sich wie in echt, der Platz hat seine Neigungen und Steine, und gespielt wird bis 13 Punkte, nach den Regeln der Pétanque. Das Spiel ist für alle gemacht, die selbst spielen: Du legst, du schießt, du liest den Boden, bevor du wirfst.',
		heroAlt: 'Zwei Kugeln und eine Zielkugel auf dem Kies eines Dorfplatzes bei Sonnenuntergang, unter dem Titel Pétanque Game',
		badges: { play: play('de'), playAlt: 'Jetzt bei Google Play', apple: STORES.apple, appleAlt: 'Download on the App Store' },
		soon: 'Demnächst bei Google Play und im App Store',
		soonShort: 'Demnächst',
		stepsTitle: 'So wirfst du',
		steps: [
			{
				icon: 'mobile',
				title: 'Wähle deinen Wurf',
				body: 'Leg den Finger auf das Brett, auf die Höhe des Wurfs: Rollen, halber Lob, Lob oder hoher Lob.',
			},
			{
				icon: 'winding-path',
				title: 'Kraft und Richtung',
				body: 'Zieh nach oben für die Kraft, schieb nach links oder rechts zum Zielen. Der Weg der Kugel wird gezeichnet, bevor du loslässt.',
			},
			{
				icon: 'petanque',
				title: 'Lass los',
				body: 'Deine Figur wirft. Die Kugel rollt, springt und trifft wie in echt, auf einem Boden mit seinen Neigungen und Steinen. Im Expertenmodus gibst du Effet.',
			},
		],
		featuresTitle: 'Was dich erwartet',
		features: [
			{
				title: 'Gegen den Computer oder zu zweit',
				body: 'Vier Stufen, von Leicht bis zum Dorfmeister, oder zu zweit auf einem Handy, abwechselnd. Im Tête-à-tête, in der Doublette oder Triplette, hier wie online.',
			},
			{
				title: 'Online',
				body: '„Mit einem Freund“: eine private Partie über einen Code. „Gegner finden“: ein Spieler online, und deine Partien eins gegen eins bringen dich in der Rangliste nach oben oder unten, vom Dorfplatz bis National.',
			},
			{
				title: 'Ligen',
				body: 'Von Bronze bis Diamant: Pokale mit drei K.-o.-Partien, Trophäen und immer schwierigere Plätze. Jede Woche ist ein Bronze-Pokal gratis.',
			},
			{
				title: 'Jeden Tag',
				body: 'Drei Aufgaben, die Münzen bringen, alle gegen den Computer machbar, und ein Bonus, wenn du wieder spielst. Erfolge und deine Statistik: Kugeln an der Zielkugel, Carreaux, 13:0-Siege…',
			},
			{
				title: 'Ein Boden, der zählt',
				body: 'Lehm, feiner Kies, grober Kies oder Sand, von glatt bis holprig. Geh in die Hocke, um die Neigungen zu lesen, oder schau dir das Spiel vorher aus der Nähe an.',
			},
			{
				title: 'Kugeln mit Charakter',
				body: '14 Modelle, von 650 bis 790 g und von 71 bis 79 mm, weich oder hart. Eine schwere hält besser gegen Steine, eine weiche bleibt liegen, wo sie landet, eine harte rollt weiter: Keine ist überall im Vorteil.',
			},
			{
				title: 'Deine Figur, dein Team',
				body: 'Zwölf Spielerinnen und Spieler, dein Name und das Trikot deines ganzen Teams. Im Kreis hat jeder vor dem Wurf sein kleines Ritual, wie echte Spieler.',
			},
			{
				title: 'Vier Spielorte',
				body: 'Der Dorfplatz, der Platz in der Abenddämmerung mit seinen Lichterketten, der Platz auf dem Land, der Hafen mit seinem Leuchtturm. Ruhige Musik und die Geräusche des Ortes: Zikaden, Wellen, Grillen am Abend.',
			},
		],
		photoTitle: 'Leicht zu lernen',
		photoBody:
			'„So wird gespielt“ zeigt die Regeln auf sechs bebilderten Seiten, und eine Hand macht dir den Wurf auf dem Brett vor. Bei „Üben“ wirfst du alle Kugeln ohne Gegner, und ein Trainer sagt dir, ob deine Kugel zu kurz, zu weit, links oder rechts lag, und wie du es besser machst.',
		photoNote:
			'Er hilft auch in deinen ersten Partien. Die Schrift ist groß, die Knöpfe auch, auf dem Handy wie auf dem Tablet, und das Spiel passt sich deiner Hand an: Rechts- oder Linkshänder, Ansicht hinter dem Spieler oder aus der Ich-Perspektive, Abstandskreise um die Zielkugel.',
		limitsTitle: 'Gut zu wissen',
		limitsIntro: 'Was ohne Internet geht, was ein Konto braucht, und die Werbung.',
		limits: [
			{
				title: 'Ohne Internet und ohne Konto',
				body: 'Gegen den Computer, zu zweit auf einem Handy und beim Üben spielst du offline, ohne dich anzumelden.',
			},
			{
				title: 'Mit einem Konto',
				body: 'Münzen, Shop, Ligen, Online-Spiel und Rangliste brauchen Internet und ein Google-Konto (Android) oder Apple-Konto (iPhone), damit du deinen Fortschritt auch auf einem anderen Handy hast. Du löschst es jederzeit unter Optionen.',
			},
			{
				title: 'Werbung nur, wenn du zustimmst',
				body: 'Beim ersten Start fragt dich das Spiel, ob du Werbung akzeptierst. Lehnst du ab, spielst du ganz normal, ohne Werbung und ohne die Videos, die Münzen bringen. Ändern kannst du das unter Optionen › Werbeeinstellungen.',
			},
			{
				title: 'Kein Chat',
				body: 'Online sieht dein Gegner deinen Namen, deine Figur und deine Würfe, mehr nicht. Grobe Namen werden gefiltert, und du kannst einen melden.',
			},
		],
		priceTitle: 'Was es kostet',
		priceBody:
			'Das Spiel ist kostenlos. Wenn du Werbung akzeptierst, siehst du höchstens eine Werbung alle zwei freien Partien gegen den Computer, und freiwillige Videos bringen dir Münzen. „Ohne Werbung“ entfernt die Werbung zwischen den Partien. Münzen kann man auch kaufen, aber alles, was Münzen kostet, lässt sich durch Spielen verdienen.',
		galleryTitle: 'Das Spiel in Bildern',
		screensAlt: SHOTS.de,
		faqTitle: 'Häufige Fragen',
		faq: [
			{
				q: 'Wann erscheint das Spiel?',
				a: 'Bald, bei Google Play und im App Store. Bis dahin lässt sich Pétanque schon im Browser spielen, auf dieser Website.',
			},
			{
				q: 'Brauche ich Internet?',
				a: 'Nicht gegen den Computer, zu zweit auf einem Handy oder beim Üben. Ja für das Online-Spiel, die Ligen, den Shop und die Rangliste.',
			},
			{
				q: 'Warum ein Konto?',
				a: 'Deine Münzen und Gegenstände liegen in deinem Konto: So hast du sie auch auf einem anderen Handy. Du meldest dich mit Google unter Android an, mit Apple auf dem iPhone, und du löschst dein Konto jederzeit unter Optionen.',
			},
			{
				q: 'Sind das die echten Regeln?',
				a: 'Ja: Gespielt wird bis 13 Punkte, Runde für Runde, und es spielt die Seite weiter, die den Punkt nicht hat. „So wird gespielt“ erklärt alles auf sechs bebilderten Seiten.',
			},
			{
				q: 'Auf welchen Geräten, in welchen Sprachen?',
				a: 'Android-Handys und -Tablets, iPhone und iPad, auf Französisch, Englisch, Spanisch, Deutsch und Italienisch.',
			},
			{
				q: 'Und am Computer?',
				a: 'Das Pétanque dieser Website läuft im Browser, ohne Installation: Von dort ist das Spiel ausgegangen.',
			},
		],
		makingOfTitle: 'Wie das Spiel entsteht',
		makingOfBody:
			'Das Spiel ist auf dieser Website entstanden: Das Pétanque aus dem Browser wurde nach Unity übertragen, Regeln, Physik und Computergegner Zeile für Zeile übernommen und durch Tests identisch gehalten. Die Projektseite (auf Englisch) erzählt den Rest: das Online-Spiel, die Figuren, den Boden.',
		makingOfCta: 'Zur Projektseite',
		makingOfHref: '/en/work/petanque-game/',
		legalIntro: 'Siehe auch:',
		support: 'Eine Frage, eine Idee? Schreib uns:',
		privacy: { label: 'Datenschutzerklärung', href: '/de/jeux/petanque/confidentialite/' },
		terms: { label: 'Nutzungsbedingungen', href: '/de/jeux/petanque/cgu/' },
		closing: 'Demnächst für Android und iPhone',
	},
	it: {
		title: 'Pétanque Game — le bocce in 3D sul tuo telefono',
		description:
			"Pétanque in 3D per Android e iPhone: contro il computer, in due su un telefono o online, individuale, coppie o terne. Leghe, sfide del giorno, 14 bocce, quattro ambientazioni. Presto su Google Play e sull'App Store.",
		tagline:
			"Una partita nella piazza del paese, all'ombra dei platani. Le bocce rotolano, rimbalzano e si colpiscono come dal vero, il campo ha le sue pendenze e i suoi sassi, e la partita si gioca a 13 punti, con le regole della pétanque. Il gioco è fatto per chi gioca davvero: si accosta, si boccia, si legge il terreno prima di lanciare.",
		heroAlt: 'Due bocce e un pallino sulla ghiaia di una piazza di paese al tramonto, sotto il titolo Pétanque Game',
		badges: { play: play('it'), playAlt: 'Disponibile su Google Play', apple: STORES.apple, appleAlt: 'Download on the App Store' },
		soon: "Presto su Google Play e sull'App Store",
		soonShort: 'Presto',
		stepsTitle: 'Come si lancia',
		steps: [
			{
				icon: 'mobile',
				title: 'Scegli il lancio',
				body: "Metti il dito sulla pedana all'altezza del lancio: rotolata, mezzo lob, lob o lob alto.",
			},
			{
				icon: 'winding-path',
				title: 'Dosa e mira',
				body: 'Scorri in su per dosare la forza, a sinistra o a destra per mirare. Il percorso della boccia si disegna prima che tu la lasci.',
			},
			{
				icon: 'petanque',
				title: 'Lascia',
				body: "Il tuo giocatore lancia. La boccia rotola, rimbalza e colpisce come dal vero, su un terreno con le sue pendenze e i suoi sassi. In modalità esperto, dai l'effetto.",
			},
		],
		featuresTitle: 'Cosa troverai',
		features: [
			{
				title: 'Contro il computer o in due',
				body: 'Quattro livelli, da Facile al campione del paese, o in due sullo stesso telefono, a turno. Individuale, coppie o terne, qui come online.',
			},
			{
				title: 'Online',
				body: '«Con un amico»: una partita privata grazie a un codice. «Trova un avversario»: un giocatore online, e le tue partite uno contro uno ti fanno salire o scendere in classifica, da Piazza del paese a Nazionale.',
			},
			{
				title: 'Leghe',
				body: 'Da Bronzo a Diamante: coppe di tre partite a eliminazione, trofei e campi sempre più difficili. Ogni settimana, una coppa di Bronzo è gratuita.',
			},
			{
				title: 'Ogni giorno',
				body: 'Tre sfide che danno monete, tutte possibili contro il computer, e un bonus quando torni a giocare. Traguardi e le tue statistiche: «biberon», «carreau», vittorie 13 a 0…',
			},
			{
				title: 'Un terreno che conta',
				body: 'Terra battuta, ghiaia fine, ghiaia grossa o sabbia, da liscio ad accidentato. Accovacciati per leggere le pendenze, o vai a vedere il gioco da vicino prima di lanciare.',
			},
			{
				title: 'Bocce con carattere',
				body: '14 modelli, da 650 a 790 g e da 71 a 79 mm, tenere o dure. Una pesante resiste meglio ai sassi, una tenera resta dove cade, una dura rotola più lontano: nessuna vince ovunque.',
			},
			{
				title: 'Il tuo giocatore, la tua squadra',
				body: 'Dodici giocatori e giocatrici, il tuo nome e la divisa di tutta la tua squadra. Nel cerchio, ognuno ha il suo piccolo rituale prima di lanciare, come i veri giocatori.',
			},
			{
				title: 'Quattro ambientazioni',
				body: 'La piazza del paese, la piazza al tramonto con le sue luci, il campo di campagna, il porto con il suo faro. Musica tranquilla e i suoni del luogo: cicale, onde, grilli la sera.',
			},
		],
		photoTitle: 'Facile da imparare',
		photoBody:
			'«Come si gioca» mostra le regole in sei pagine illustrate, e una mano fa il lancio sulla pedana. Con «Allenarsi» lanci tutte le bocce senza avversario, e un coach ti dice se la tua boccia era corta, lunga, a sinistra o a destra, e come correggere.',
		photoNote:
			'Ti aiuta anche nelle prime partite. I testi sono grandi, e anche i pulsanti, sul telefono come sul tablet, e il gioco si adatta alla tua mano: destrimano o mancino, visuale dietro il giocatore o in prima persona, cerchi di distanza intorno al pallino.',
		limitsTitle: 'Da sapere',
		limitsIntro: 'Cosa funziona senza internet, cosa richiede un account, e la pubblicità.',
		limits: [
			{
				title: 'Senza internet né account',
				body: 'Contro il computer, in due su un telefono e in allenamento, giochi offline, senza registrarti.',
			},
			{
				title: 'Con un account',
				body: 'Le monete, il negozio, le leghe, il gioco online e la classifica richiedono internet e un account Google (Android) o Apple (iPhone), per ritrovare i tuoi progressi su un altro telefono. Puoi eliminarlo quando vuoi in Opzioni.',
			},
			{
				title: 'Pubblicità solo se la accetti',
				body: 'Al primo avvio, il gioco ti chiede se accetti la pubblicità. Se rifiuti, giochi normalmente, senza pubblicità e senza i video che danno monete. Puoi cambiare idea in Opzioni › Scelte pubblicitarie.',
			},
			{
				title: 'Niente chat',
				body: 'Online, il tuo avversario vede il tuo nome, il tuo giocatore e i tuoi lanci, niente di più. I nomi volgari vengono filtrati, e puoi segnalarne uno.',
			},
		],
		priceTitle: 'Quanto costa',
		priceBody:
			'Il gioco è gratis. Se accetti la pubblicità, vedi al massimo una pubblicità ogni due partite libere contro il computer, e i video facoltativi ti danno monete. «Senza pubblicità» toglie la pubblicità tra le partite. Le monete si possono anche comprare, ma tutto ciò che costa monete si guadagna giocando.',
		galleryTitle: 'Il gioco in immagini',
		screensAlt: SHOTS.it,
		faqTitle: 'Domande frequenti',
		faq: [
			{
				q: 'Quando esce il gioco?',
				a: "Presto, su Google Play e sull'App Store. Nel frattempo, la pétanque si gioca già nel browser, su questo sito.",
			},
			{
				q: 'Serve internet?',
				a: 'No per giocare contro il computer, in due su un telefono o in allenamento. Sì per il gioco online, le leghe, il negozio e la classifica.',
			},
			{
				q: 'Perché un account?',
				a: 'Le tue monete e i tuoi oggetti sono salvati sul tuo account: li ritrovi su un altro telefono. Accedi con Google su Android, con Apple su iPhone, e puoi eliminare il tuo account quando vuoi in Opzioni.',
			},
			{
				q: 'Le regole sono quelle vere?',
				a: 'Sì: la partita si gioca a 13 punti, mano dopo mano, e rigioca la squadra che non ha il punto. «Come si gioca» spiega tutto in sei pagine illustrate.',
			},
			{
				q: 'Su quali dispositivi, in quali lingue?',
				a: 'Telefoni e tablet Android, iPhone e iPad, in francese, inglese, spagnolo, tedesco e italiano.',
			},
			{
				q: 'E sul computer?',
				a: 'La pétanque di questo sito si gioca nel browser, senza installare nulla: è da lì che è nato il gioco.',
			},
		],
		makingOfTitle: 'Come è fatto il gioco',
		makingOfBody:
			'Il gioco è nato su questo sito: la pétanque del browser è stata portata su Unity, con regole, fisica e avversario copiati riga per riga e mantenuti identici dai test. La scheda del progetto (in inglese) racconta il resto: il gioco online, i giocatori, il terreno.',
		makingOfCta: 'Leggi la scheda del progetto',
		makingOfHref: '/en/work/petanque-game/',
		legalIntro: 'Da consultare anche:',
		support: "Una domanda, un'idea? Scrivici:",
		privacy: { label: 'informativa sulla privacy', href: '/it/jeux/petanque/confidentialite/' },
		terms: { label: "condizioni d'uso", href: '/it/jeux/petanque/cgu/' },
		closing: 'Presto su Android e iPhone',
	},
};

const download: Record<LandingLang, AppDownloadCopy> = {
	fr: typoFr<AppDownloadCopy>({
		title: 'Télécharger Pétanque Game sur Android et iPhone | Ludiven Studio',
		kicker: 'Jeu de boules en 3D',
		shots: SHOTS.fr,
		pause: 'Mettre le défilement en pause',
		more: 'Tout savoir sur le jeu',
		links: [{ label: 'Jouer dans le navigateur', href: WEB_GAME }],
	}),
	en: {
		title: 'Download Pétanque Game for Android and iPhone | Ludiven Studio',
		kicker: 'Boules in 3D',
		shots: SHOTS.en,
		pause: 'Pause the slideshow',
		more: 'All about the game',
		links: [{ label: 'Play in your browser', href: WEB_GAME }],
	},
	es: {
		title: 'Descargar Pétanque Game para Android y iPhone | Ludiven Studio',
		kicker: 'Petanca en 3D',
		shots: SHOTS.es,
		pause: 'Pausar el pase de imágenes',
		more: 'Todo sobre el juego',
		links: [{ label: 'Jugar en el navegador', href: WEB_GAME }],
	},
	de: {
		title: 'Pétanque Game für Android und iPhone herunterladen | Ludiven Studio',
		kicker: 'Boule in 3D',
		shots: SHOTS.de,
		pause: 'Bilderfolge anhalten',
		more: 'Alles über das Spiel',
		links: [{ label: 'Im Browser spielen', href: WEB_GAME }],
	},
	it: {
		title: 'Scarica Pétanque Game per Android e iPhone | Ludiven Studio',
		kicker: 'Bocce in 3D',
		shots: SHOTS.it,
		pause: 'Metti in pausa le immagini',
		more: 'Tutto sul gioco',
		links: [{ label: 'Gioca nel browser', href: WEB_GAME }],
	},
};

export const GAME: PetanqueApp = {
	id: 'game',
	name: APP_NAME,
	category: 'GameApplication',
	copy,
	download,
	landingPaths: LANDING_PATHS,
	downloadPaths: DOWNLOAD_PATHS,
	heroes: HEROES,
	ogImages: OG_IMAGES,
	screens: SCREENS,
	shot: { width: 540, height: 960 },
	points: { features: [0, 1, 2], icons: ['petanque', 'paper-plane-tilt', 'trophy'] },
};
