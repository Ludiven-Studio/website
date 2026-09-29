// Content of the vertical slice: chains, generators, orders, the watch, the workshop.
// Pure data, no logic, so a sim script and the tests read the same tables as the game.

export type ChainId = 'outil' | 'soin' | 'meca';
export type GenId = 'boite' | 'tiroir';

export interface Chain {
	id: ChainId;
	family: string;
	gen: GenId;
	items: string[]; // index 0 = level 1
	/** Coins for selling one item of level n: base * n. */
	sell: number;
}

export const CHAINS: Record<ChainId, Chain> = {
	outil: {
		id: 'outil',
		family: 'Outils',
		gen: 'boite',
		items: ['Petit tournevis', 'Jeu de tournevis', 'Brucelles', 'Trousse d’outils', 'Kit de précision'],
		sell: 1,
	},
	soin: {
		id: 'soin',
		family: 'Entretien',
		gen: 'boite',
		items: ['Chiffon', 'Flacon de nettoyant', 'Kit de nettoyage', 'Cire', 'Kit de finition'],
		sell: 1,
	},
	meca: {
		id: 'meca',
		family: 'Mécanique',
		gen: 'tiroir',
		items: ['Vis', 'Lot de vis', 'Ressort', 'Rouage', 'Mécanisme', 'Mouvement d’horloge'],
		sell: 1,
	},
};

export interface Generator {
	id: GenId;
	name: string;
	/** Weighted outputs; `level` defaults to 1. */
	out: { chain: ChainId; level?: number; w: number }[];
	charges: number;
	/** Milliseconds to get one charge back. */
	chargeMs: number;
}

export const GENERATORS: Record<GenId, Generator> = {
	boite: {
		id: 'boite',
		name: 'Boîte à outils',
		out: [
			{ chain: 'outil', w: 55 },
			{ chain: 'soin', w: 45 },
		],
		charges: 12,
		chargeMs: 8_000,
	},
	tiroir: {
		id: 'tiroir',
		name: 'Tiroir mécanique',
		out: [
			{ chain: 'meca', w: 80 },
			{ chain: 'meca', level: 2, w: 20 },
		],
		charges: 12,
		chargeMs: 8_000,
	},
};

export const COLS = 7;
export const ROWS = 9;

export const ENERGY_MAX = 60;
export const ENERGY_MS = 2 * 60_000;

/** Cocoins → energy, one pack at a time. */
export const ENERGY_PACK = { price: 10, energy: 15 };

export interface Reward {
	coins: number;
	rep: number;
	energy?: number;
	cocoins?: number;
}

export interface Line {
	who: 'morel' | 'garnier' | 'lucas' | 'chen' | 'moi' | 'note';
	text: string;
}

export interface Order {
	id: string;
	kind: 'short' | 'story';
	client: string;
	ask: string;
	needs: string[]; // piece codes, 'chain:level'
	reward: Reward;
	/** Workshop upgrade that must be bought first. */
	after?: string;
	/** Story step reached (orders of kind 'story' advance it by one). */
	step?: number;
	/** Short orders: story step needed before the client comes in. */
	minStep?: number;
	/** Shown in the restoration scene once delivered. */
	scene?: { title: string; lines: Line[] };
}

// Listed in play order. A short order waits for its `after` upgrade; story orders are
// taken one at a time in sequence.
export const ORDERS: Order[] = [
	{
		id: 'garnier-1',
		kind: 'short',
		client: 'Mme Garnier',
		ask: 'Un jeu de tournevis pour mon étagère.',
		needs: ['outil:2'],
		reward: { coins: 10, rep: 1 },
	},
	{
		id: 'lucas-1',
		kind: 'short',
		client: 'Lucas',
		ask: 'Un lot de vis pour mon vélo.',
		needs: ['meca:2'],
		reward: { coins: 8, rep: 1 },
		after: 'etabli',
	},
	{
		id: 'morel-1',
		kind: 'story',
		client: 'M. Morel',
		ask: 'Nettoyer le boîtier terni.',
		needs: ['soin:3'],
		reward: { coins: 12, rep: 3, energy: 10 },
		after: 'etabli',
		step: 1,
		scene: {
			title: 'Nettoyage',
			lines: [
				{ who: 'note', text: 'Sous la crasse, une inscription apparaît au dos du boîtier : « Pour Henri — J., 14 juin 1961 ».' },
				{ who: 'morel', text: 'Je ne l’avais jamais remarquée… Henri, c’était mon père. Mais qui est ce « J. » ?' },
			],
		},
	},
	{
		id: 'garnier-2',
		kind: 'short',
		client: 'Mme Garnier',
		ask: 'Du nettoyant pour l’argenterie de ma mère.',
		needs: ['soin:2'],
		reward: { coins: 10, rep: 1 },
		after: 'etabli',
	},
	{
		id: 'chen-1',
		kind: 'short',
		client: 'Mlle Chen',
		ask: 'Des brucelles pour mes maquettes.',
		needs: ['outil:3'],
		reward: { coins: 12, rep: 1 },
		minStep: 1,
	},
	{
		id: 'morel-2',
		kind: 'story',
		client: 'M. Morel',
		ask: 'Remettre le mécanisme en marche.',
		needs: ['outil:4', 'meca:5'],
		reward: { coins: 15, rep: 3, energy: 10 },
		step: 2,
		scene: {
			title: 'Mécanisme',
			lines: [
				{ who: 'note', text: 'Les aiguilles repartent. Le tic-tac emplit l’atelier pour la première fois depuis des années.' },
				{ who: 'moi', text: 'Le 14 juin 1961… C’est la date écrite sous la vieille photo, près de la porte condamnée.' },
				{ who: 'morel', text: 'Une photo de l’atelier ? Vous pourrez me la montrer quand je reviendrai ?' },
			],
		},
	},
	{
		id: 'lucas-2',
		kind: 'short',
		client: 'Lucas',
		ask: 'Un ressort pour la sonnette de mon vélo.',
		needs: ['meca:3'],
		reward: { coins: 12, rep: 1 },
		minStep: 2,
	},
	{
		id: 'morel-3',
		kind: 'story',
		client: 'M. Morel',
		ask: 'Changer le verre et polir le tout.',
		needs: ['soin:4', 'meca:3'],
		reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 },
		step: 3,
		scene: {
			title: 'Finition',
			lines: [
				{ who: 'note', text: 'Verre neuf, boîtier poli, bracelet resserré : la montre brille comme en 1961.' },
				{ who: 'morel', text: 'Et sur votre photo… c’est mon père, là. Et la femme à côté de lui, c’est Jeanne. Votre grand-mère.' },
				{ who: 'morel', text: 'Ils n’étaient pas seulement voisins, alors. Je reviendrai. J’ai des choses à vous raconter.' },
			],
		},
	},
];

/** The watch's arrival, before any delivery. */
export const ARRIVAL: Line[] = [
	{ who: 'morel', text: 'Bonjour… Vous êtes de la famille de Jeanne ? Enfin quelqu’un rouvre l’atelier.' },
	{ who: 'morel', text: 'Cette montre était à mon père. Elle s’est arrêtée le jour où il est parti. Je n’ai jamais osé la faire réparer.' },
	{ who: 'moi', text: 'Boîtier terni, verre fendu, mécanisme bloqué… On va la remettre en état, étape par étape.' },
];

export const INTRO: Line[] = [
	{ who: 'note', text: 'L’atelier de Jeanne, votre grand-mère, est resté fermé des années. La poussière recouvre tout.' },
	{ who: 'moi', text: 'Tout est encore là : ses outils, ses tiroirs… et ce bureau au fond, fermé à clé.' },
	{ who: 'garnier', text: 'Ah, vous rouvrez ? Jeanne réparait tout, ici. Vous auriez un jeu de tournevis pour moi ?' },
];

export const EPILOGUE: Line[] = [
	{ who: 'note', text: 'La photo de 1961 a retrouvé sa place, bien en vue. Derrière vous, la porte du bureau reste fermée.' },
	{ who: 'moi', text: 'Qu’est-ce que Jeanne gardait là-dedans ?' },
	{ who: 'note', text: 'Fin du premier chapitre. Les gens du quartier continuent de passer avec leurs commandes.' },
];

export const SPEAKERS: Record<Line['who'], string> = {
	morel: 'M. Morel',
	garnier: 'Mme Garnier',
	lucas: 'Lucas',
	chen: 'Mlle Chen',
	moi: 'Vous',
	note: '',
};

export interface Upgrade {
	id: string;
	name: string;
	desc: string;
	cost: number;
	/** Story step needed before it can be bought. */
	step?: number;
	rep: number;
}

export const UPGRADES: Upgrade[] = [
	{ id: 'etabli', name: 'Dégager l’établi', desc: 'Faire de la place pour recevoir les clients.', cost: 8, rep: 1 },
	{ id: 'lampe', name: 'Rallumer la lampe', desc: 'La vieille lampe de Jeanne éclaire à nouveau l’établi.', cost: 20, step: 1, rep: 2 },
	{ id: 'photo', name: 'Accrocher la photo', desc: 'La photo de 1961, remise au mur, bien en vue.', cost: 15, step: 3, rep: 3 },
];

/** Board at a fresh start: both generators, and a few pieces to show what a merge is. */
export const START_BOARD: Record<number, string> = {
	[4 * COLS + 1]: 'g:boite',
	[4 * COLS + 5]: 'g:tiroir',
	[2 * COLS + 2]: 'outil:1',
	[6 * COLS + 3]: 'meca:1',
	[6 * COLS + 4]: 'meca:1',
};

export const WATCH_STEPS = 3;

// Neighbourhood orders once the chapter's list runs out. Drawn from the save's rng.
export const LOCALS = ['Mme Garnier', 'Lucas', 'M. Morel', 'La boulangère', 'Le facteur', 'Mlle Chen'];

/** Portrait file per client; the others get an emoji. */
export const FACES: Record<string, string> = {
	'Mme Garnier': 'garnier',
	Lucas: 'lucas',
	'M. Morel': 'morel',
	'Mlle Chen': 'chen',
};
export const FACE_EMOJI: Record<string, string> = { 'La boulangère': '🥖', 'Le facteur': '📮' };
