// Content of the campaign: chains, generators, projects (one restored object per chapter),
// orders, the workshop. Pure data, no logic, so a sim script and the tests read the same
// tables as the game. The story behind it: docs/atelier-scenario.md.

export type ChainId = 'outil' | 'soin' | 'meca' | 'elec' | 'bois' | 'tissu';
export type GenId = 'boite' | 'tiroir' | 'caisse' | 'coffre' | 'malle';
export type ProjectId = 'montre' | 'radio' | 'voilier' | 'boite' | 'fauteuil' | 'malle' | 'musique';

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
	elec: {
		id: 'elec',
		family: 'Électricité',
		gen: 'caisse',
		items: ['Fusible', 'Bobine de fil', 'Ampoule', 'Lampe radio', 'Transformateur'],
		sell: 1,
	},
	bois: {
		id: 'bois',
		family: 'Menuiserie',
		gen: 'coffre',
		items: ['Chute de bois', 'Planche', 'Pièce taillée', 'Cadre', 'Structure assemblée'],
		sell: 1,
	},
	tissu: {
		id: 'tissu',
		family: 'Textile',
		gen: 'malle',
		items: ['Fil', 'Coupon de tissu', 'Rembourrage', 'Galon et clous', 'Kit de tapissier'],
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
	/** Workshop upgrade that puts it on the board. None: there from the start. */
	unlock?: string;
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
	caisse: {
		id: 'caisse',
		name: 'Caisse d’électricien',
		out: [
			{ chain: 'elec', w: 80 },
			{ chain: 'elec', level: 2, w: 20 },
		],
		charges: 12,
		chargeMs: 8_000,
		unlock: 'etageres',
	},
	coffre: {
		id: 'coffre',
		name: 'Coffre du menuisier',
		out: [
			{ chain: 'bois', w: 80 },
			{ chain: 'bois', level: 2, w: 20 },
		],
		charges: 12,
		chargeMs: 8_000,
		unlock: 'menuiserie',
	},
	malle: {
		id: 'malle',
		name: 'Malle à tissus',
		out: [
			{ chain: 'tissu', w: 80 },
			{ chain: 'tissu', level: 2, w: 20 },
		],
		charges: 12,
		chargeMs: 8_000,
		unlock: 'couture',
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
	who: 'morel' | 'garnier' | 'lucas' | 'chen' | 'boulangere' | 'lucile' | 'moi' | 'note';
	text: string;
	/** Shown in place of the object while this line is on screen: the clue the line talks about. */
	show?: 'back' | 'mechanism' | 'photo' | 'postcard' | 'label' | 'broadcast' | 'dedication' | 'box' | 'key' | 'office' | 'map'
		| 'piece4' | 'lucile' | 'tag';
}

/** Reached once a project has delivered `step` restoration steps. */
export interface Gate {
	project: ProjectId;
	step: number;
}

export interface Project {
	id: ProjectId;
	/** Chapter number, as shown to the player. */
	chapter: number;
	/** Short label for the order cards. */
	object: string;
	title: string;
	client: string;
	steps: number;
	/** Played when its first story order opens. */
	arrival: Line[];
}

export const PROJECTS: Project[] = [
	{
		id: 'montre',
		chapter: 1,
		object: 'Montre',
		title: 'La montre de M. Morel',
		client: 'M. Morel',
		steps: 3,
		arrival: [
			{ who: 'morel', text: 'Bonjour… Vous êtes de la famille de Jeanne ? Enfin quelqu’un rouvre l’atelier.' },
			{ who: 'morel', text: 'Cette montre était à mon père. Elle s’est arrêtée le jour où il est parti. Je n’ai jamais osé la faire réparer.' },
			{ who: 'moi', text: 'Boîtier terni, verre fendu, mécanisme bloqué… On va la remettre en état, étape par étape.' },
		],
	},
	{
		id: 'radio',
		chapter: 2,
		object: 'Radio',
		title: 'La radio de Mme Garnier',
		client: 'Mme Garnier',
		steps: 3,
		arrival: [
			{ who: 'garnier', text: 'Vous avez fait des merveilles avec la montre d’Henri. Ma radio, elle, se tait depuis des années.' },
			{ who: 'garnier', text: 'J’écoutais l’émission du port en cousant. Il paraît que la radio locale rediffuse ses vieilles archives, le dimanche.' },
			{ who: 'moi', text: 'Coffret poussiéreux, lampe grillée, aiguille bloquée… Elle va rechanter, promis.' },
		],
	},
	{
		id: 'voilier',
		chapter: 3,
		object: 'Voilier',
		title: 'Le voilier de Lucas',
		client: 'Lucas',
		steps: 3,
		arrival: [
			{ who: 'lucas', text: 'Mon grand-père me l’avait construit quand j’étais petit. Il n’a jamais navigué : le mât s’est cassé le premier jour.' },
			{ who: 'lucas', text: 'Il disait toujours : « Un bon capitaine ramène tout son équipage. » J’aimerais le faire naviguer au bassin, pour lui.' },
			{ who: 'moi', text: 'Coque fendue, mât brisé, voiles en lambeaux… On va le remettre à flot.' },
		],
	},
	{
		id: 'boite',
		chapter: 4,
		object: 'Boîte',
		title: 'La boîte de Lucile',
		client: 'Mme Garnier',
		steps: 3,
		arrival: [
			{ who: 'garnier', text: 'Jeanne me l’a confiée au printemps 1962, pour Lucile. « Quand elle reviendra », disait-elle. Lucile n’est jamais revenue.' },
			{ who: 'garnier', text: 'Le tiroir est bloqué depuis toujours. Je n’ai jamais voulu le forcer.' },
			{ who: 'moi', text: 'Marqueterie encrassée, charnière cassée, tiroir coincé… On va l’ouvrir sans rien abîmer.' },
		],
	},
	{
		id: 'fauteuil',
		chapter: 5,
		object: 'Fauteuil',
		title: 'Le fauteuil de la boulangère',
		client: 'La boulangère',
		steps: 3,
		arrival: [
			{ who: 'boulangere', text: 'Ma mère gardait ce fauteuil près de la vitrine, pour les clients fatigués. « Il faut toujours garder une place pour quelqu’un », disait-elle.' },
			{ who: 'boulangere', text: 'Il est tout affaissé. J’aimerais le remettre dans la boutique.' },
			{ who: 'moi', text: 'Tissu taché, assise effondrée… On va lui refaire une beauté.' },
		],
	},
	{
		id: 'malle',
		chapter: 6,
		object: 'Malle',
		title: 'La malle de Rose',
		client: 'Vous',
		steps: 3,
		arrival: [
			{ who: 'note', text: 'Sous l’établi, une latte sonne creux. Une trappe ! Dessous, cerclée de fer, une malle couverte de salpêtre.' },
			{ who: 'moi', text: 'L’îlot n’était qu’un leurre. La malle de Rose dormait sous l’atelier depuis 1813.' },
			{ who: 'note', text: 'Jeanne a travaillé toute sa vie juste au-dessus, sans le savoir.' },
		],
	},
	{
		id: 'musique',
		chapter: 7,
		object: 'Boîte à musique',
		title: 'La boîte à musique des Chen',
		client: 'Mlle Chen',
		steps: 3,
		arrival: [
			{ who: 'chen', text: 'Une boîte à musique… pour ma famille ? Ma grand-mère fredonne un air dont personne ne connaît l’origine.' },
			{ who: 'chen', text: 'Si c’est la sienne, je voudrais qu’elle l’entende jouer. Une fois, au moins.' },
			{ who: 'moi', text: 'Laque ternie, ressort cassé, figurine détachée… On va la faire chanter.' },
		],
	},
];

export interface Order {
	id: string;
	kind: 'short' | 'story';
	client: string;
	ask: string;
	needs: string[]; // piece codes, 'chain:level'
	reward: Reward;
	/** Workshop upgrade that must be bought first. */
	after?: string;
	/** Story order: the project it restores and the step it delivers (taken in sequence). */
	project?: ProjectId;
	step?: number;
	/** Progress needed before the client comes in. */
	when?: Gate;
	/** A `seen` flag the player sets by acting (the chapter 6 map puzzle). */
	flag?: string;
	/** Shown in the restoration scene once delivered. */
	scene?: { title: string; lines: Line[] };
}

// Listed in play order. Story orders are taken one at a time, in sequence per project.
export const ORDERS: Order[] = [
	// ---- Chapter 1: the watch ----
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
		project: 'montre',
		step: 1,
		scene: {
			title: 'Nettoyage',
			lines: [
				{ who: 'note', text: 'Sous la crasse, une inscription apparaît au dos du boîtier : « Pour Henri — J., 14 juin 1961 ».', show: 'back' },
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
		when: { project: 'montre', step: 1 },
	},
	{
		id: 'morel-2',
		kind: 'story',
		client: 'M. Morel',
		ask: 'Remettre le mécanisme en marche.',
		needs: ['outil:4', 'meca:5'],
		reward: { coins: 15, rep: 3, energy: 10 },
		project: 'montre',
		step: 2,
		scene: {
			title: 'Mécanisme',
			lines: [
				{ who: 'note', text: 'Le mécanisme, démonté puis remonté pièce par pièce, repart. Le tic-tac emplit l’atelier pour la première fois depuis des années.', show: 'mechanism' },
				{ who: 'moi', text: 'Le 14 juin 1961… C’est la date écrite sous la vieille photo, près de la porte condamnée.', show: 'photo' },
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
		when: { project: 'montre', step: 2 },
	},
	{
		id: 'morel-3',
		kind: 'story',
		client: 'M. Morel',
		ask: 'Changer le verre et polir le tout.',
		needs: ['soin:4', 'meca:3'],
		reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 },
		project: 'montre',
		step: 3,
		scene: {
			title: 'Finition',
			lines: [
				{ who: 'note', text: 'Verre neuf, boîtier poli, bracelet resserré : la montre brille comme en 1961.' },
				{ who: 'morel', text: 'Et sur votre photo… c’est mon père, là. Et la femme à côté de lui, c’est Jeanne. Votre grand-mère.', show: 'photo' },
				{ who: 'morel', text: 'Ils n’étaient pas seulement voisins, alors. Je reviendrai. J’ai des choses à vous raconter.' },
			],
		},
	},

	// ---- Chapter 2: the radio (opens once the 1961 photo is on the wall) ----
	{
		id: 'radio-1',
		kind: 'story',
		client: 'Mme Garnier',
		ask: 'Dépoussiérer le coffret et dégager la grille.',
		needs: ['soin:3', 'outil:2'],
		reward: { coins: 14, rep: 3, energy: 10 },
		after: 'photo',
		project: 'radio',
		step: 1,
		scene: {
			title: 'Le coffret',
			lines: [
				{ who: 'note', text: 'Sous la poussière, le bois verni et la toile de la grille réapparaissent. Au fond du coffret, une étiquette de l’atelier.', show: 'label' },
				{ who: 'garnier', text: '« Réparation J. — à finir ». Jeanne ne l’a jamais terminée. C’était au printemps 1962, je crois.' },
			],
		},
	},
	{
		id: 'facteur-1',
		kind: 'short',
		client: 'Le facteur',
		ask: 'De quoi nettoyer ma vieille sacoche.',
		needs: ['soin:3'],
		reward: { coins: 12, rep: 1 },
		when: { project: 'radio', step: 1 },
	},
	{
		id: 'chen-2',
		kind: 'short',
		client: 'Mlle Chen',
		ask: 'Du fil électrique pour une lampe de brocante.',
		needs: ['elec:2'],
		reward: { coins: 10, rep: 1 },
		after: 'etageres',
	},
	{
		id: 'radio-2',
		kind: 'story',
		client: 'Mme Garnier',
		ask: 'Changer la lampe et rétablir le courant.',
		needs: ['elec:4', 'outil:3'],
		reward: { coins: 16, rep: 3, energy: 10 },
		after: 'etageres',
		project: 'radio',
		step: 2,
		scene: {
			title: 'Le courant',
			lines: [
				{ who: 'note', text: 'La lampe neuve rougeoie, le voyant s’allume, le cadran s’éclaire. Un grésillement, puis des voix lointaines.' },
				{ who: 'garnier', text: 'Oh… Ce ronronnement. J’avais oublié ce bruit-là. Il faut juste trouver la bonne station.' },
			],
		},
	},
	{
		id: 'lucas-3',
		kind: 'short',
		client: 'Lucas',
		ask: 'Une ampoule pour le phare de mon vélo.',
		needs: ['elec:3'],
		reward: { coins: 12, rep: 1 },
		when: { project: 'radio', step: 2 },
	},
	{
		id: 'radio-3',
		kind: 'story',
		client: 'Mme Garnier',
		ask: 'Régler la réception.',
		needs: ['elec:5', 'meca:4'],
		reward: { coins: 22, rep: 5, energy: 10, cocoins: 10 },
		project: 'radio',
		step: 3,
		scene: {
			title: 'La voix du quai',
			lines: [
				{ who: 'note', text: 'Dimanche, « Mémoires du port ». L’animatrice annonce une archive de l’été 1961.' },
				{ who: 'note', text: '« … et voici nos Pirates du retour : Jeanne, Lucile et Henri ! Mademoiselle Lucile, qu’est-ce que vous rendez, au juste ? »', show: 'broadcast' },
				{ who: 'moi', text: 'Lucile ? Jeanne avait une sœur ? Et… des pirates ?' },
				{ who: 'garnier', text: 'Je vous dois une vérité. J’ai chez moi une boîte que Jeanne m’avait confiée pour sa sœur. Je n’ai jamais osé l’envoyer. Je vous l’apporterai.' },
				{ who: 'note', text: 'Fin du chapitre 2.' },
			],
		},
	},

	// ---- Chapter 3: Lucas's sailboat, a breather; Lucile's box comes in at the end ----
	{
		id: 'voilier-1',
		kind: 'story',
		client: 'Lucas',
		ask: 'Nettoyer et poncer la coque.',
		needs: ['soin:3', 'outil:3'],
		reward: { coins: 14, rep: 3, energy: 10 },
		when: { project: 'radio', step: 3 },
		project: 'voilier',
		step: 1,
		scene: {
			title: 'La coque',
			lines: [
				{ who: 'note', text: 'Sous le socle, une dédicace au crayon, presque effacée : « Au capitaine du retour ».', show: 'dedication' },
				{ who: 'lucas', text: 'Le capitaine du retour… Grand-père racontait les « Pirates du retour » comme une vieille histoire du port. Je croyais qu’il l’inventait.' },
			],
		},
	},
	{
		id: 'boulangere-1',
		kind: 'short',
		client: 'La boulangère',
		ask: 'Une ampoule pour ma vitrine.',
		needs: ['elec:3'],
		reward: { coins: 12, rep: 1 },
		when: { project: 'voilier', step: 1 },
	},
	{
		id: 'chen-3',
		kind: 'short',
		client: 'Mlle Chen',
		ask: 'Une planche pour une étagère de brocante.',
		needs: ['bois:2'],
		reward: { coins: 10, rep: 1 },
		after: 'menuiserie',
	},
	{
		id: 'voilier-2',
		kind: 'story',
		client: 'Lucas',
		ask: 'Réparer le mât et le gouvernail.',
		needs: ['bois:4', 'meca:3'],
		reward: { coins: 16, rep: 3, energy: 10 },
		after: 'menuiserie',
		project: 'voilier',
		step: 2,
		scene: {
			title: 'Le mât',
			lines: [
				{ who: 'note', text: 'Le mât redressé tient droit, le gouvernail tourne sans forcer. Il ne manque plus que les voiles.' },
				{ who: 'lucas', text: 'Il a l’air d’un vrai bateau, maintenant. Grand-père serait fier.' },
			],
		},
	},
	{
		id: 'morel-4',
		kind: 'short',
		client: 'M. Morel',
		ask: 'Un rouage pour la pendule de mon salon.',
		needs: ['meca:4'],
		reward: { coins: 14, rep: 1 },
		when: { project: 'voilier', step: 2 },
	},
	{
		id: 'voilier-3',
		kind: 'story',
		client: 'Lucas',
		ask: 'Recoudre et hisser les voiles.',
		needs: ['bois:4', 'soin:4'],
		reward: { coins: 22, rep: 5, energy: 10, cocoins: 10 },
		project: 'voilier',
		step: 3,
		scene: {
			title: 'Au bassin',
			lines: [
				{ who: 'note', text: 'Au bassin du quartier, le petit voilier file droit sous le vent. Des enfants courent le long du bord.' },
				{ who: 'lucas', text: 'Il navigue ! Et il revient tout seul vers moi. Un bon capitaine…' },
				{ who: 'garnier', text: 'Tenez. La boîte de Lucile. Je l’ai gardée soixante ans sans oser l’envoyer. C’est à vous de l’ouvrir, maintenant.', show: 'box' },
				{ who: 'note', text: 'Fin du chapitre 3. La boîte à ouvrage de Lucile attend sur l’établi. Son tiroir est bloqué.' },
			],
		},
	},

	// ---- Chapter 4: Lucile's box, the key, and Jeanne's office ----
	{
		id: 'boite-1',
		kind: 'story',
		client: 'Mme Garnier',
		ask: 'Nettoyer la marqueterie.',
		needs: ['soin:4', 'outil:3'],
		reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'voilier', step: 3 },
		project: 'boite',
		step: 1,
		scene: {
			title: 'La marqueterie',
			lines: [
				{ who: 'note', text: 'Sous la crasse, la marqueterie du couvercle réapparaît : une pie, ailes ouvertes, en bois clair et en bois sombre.' },
				{ who: 'garnier', text: 'Une pie… Jeanne en dessinait dans les marges de ses factures. Je n’ai jamais su pourquoi.' },
			],
		},
	},
	{
		id: 'lucas-4',
		kind: 'short',
		client: 'Lucas',
		ask: 'Une pièce taillée pour le socle du voilier.',
		needs: ['bois:3'],
		reward: { coins: 12, rep: 1 },
		when: { project: 'boite', step: 1 },
	},
	{
		id: 'boite-2',
		kind: 'story',
		client: 'Mme Garnier',
		ask: 'Réparer les charnières et débloquer le tiroir.',
		needs: ['bois:3', 'meca:4'],
		reward: { coins: 16, rep: 3, energy: 10 },
		project: 'boite',
		step: 2,
		scene: {
			title: 'Le tiroir',
			lines: [
				{ who: 'note', text: 'Le tiroir cède enfin. Dedans : une lettre cachetée, « Pour Lucile », et une petite clé étiquetée « bureau ».', show: 'key' },
				{ who: 'moi', text: 'La clé du bureau. Jeanne l’avait cachée là… pour que sa sœur puisse l’ouvrir.' },
				{ who: 'garnier', text: 'Allez-y. Moi, je n’en ai jamais eu le courage. La lettre, en revanche, ce n’est pas à nous de la lire.' },
			],
		},
	},
	{
		id: 'chen-4',
		kind: 'short',
		client: 'Mlle Chen',
		ask: 'Un rouage pour une boîte à musique de brocante.',
		needs: ['meca:4'],
		reward: { coins: 14, rep: 1 },
		when: { project: 'boite', step: 2 },
	},
	{
		id: 'boite-3',
		kind: 'story',
		client: 'Mme Garnier',
		ask: 'Remonter le couvercle et polir la boîte.',
		needs: ['bois:4', 'soin:3'],
		reward: { coins: 22, rep: 5, energy: 10, cocoins: 10 },
		after: 'bureau',
		project: 'boite',
		step: 3,
		scene: {
			title: 'Pour Lucile',
			lines: [
				{ who: 'note', text: 'La boîte brille, prête à voyager. Vous y glissez la lettre de Jeanne, et un mot de vous.' },
				{ who: 'garnier', text: 'Voilà l’adresse de Lucile. Je l’ai toujours gardée, sans jamais oser m’en servir.' },
				{ who: 'note', text: 'Vous postez le colis. La réponse de Lucile mettra du temps à venir.' },
				{ who: 'note', text: 'Fin du chapitre 4.' },
			],
		},
	},

	// ---- Chapter 5: the baker's armchair, the 4th map piece, Lucile's reply ----
	{
		id: 'fauteuil-1',
		kind: 'story',
		client: 'La boulangère',
		ask: 'Dégarnir et nettoyer la structure.',
		needs: ['soin:4', 'outil:3'],
		reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'boite', step: 3 },
		project: 'fauteuil',
		step: 1,
		scene: {
			title: 'La structure',
			lines: [
				{ who: 'note', text: 'Sous le vieux tissu, gravée dans le bois du cadre : une pie, ailes ouvertes. La même que sur la boîte de Lucile.' },
				{ who: 'moi', text: '« Chercher la pie »… La fiche du bureau parlait de votre famille.' },
				{ who: 'boulangere', text: 'Ce vieux signe ? Ma grand-mère disait que c’était la marque de la maison. Je n’ai jamais su d’où ça venait.' },
			],
		},
	},
	{
		id: 'garnier-3',
		kind: 'short',
		client: 'Mme Garnier',
		ask: 'Un coupon de tissu pour une nappe.',
		needs: ['tissu:2'],
		reward: { coins: 10, rep: 1 },
		after: 'couture',
	},
	{
		id: 'fauteuil-2',
		kind: 'story',
		client: 'La boulangère',
		ask: 'Refaire l’assise.',
		needs: ['tissu:3', 'bois:3'],
		reward: { coins: 16, rep: 3, energy: 10 },
		after: 'couture',
		project: 'fauteuil',
		step: 2,
		scene: {
			title: 'L’assise',
			lines: [
				{ who: 'note', text: 'En retirant le vieux crin, un papier plié tombe de l’assise : un morceau de carte, bordé de la même encre que ceux du bureau.', show: 'piece4' },
				{ who: 'moi', text: 'Le quatrième morceau. Votre famille le gardait depuis 1813, sans le savoir.' },
				{ who: 'boulangere', text: 'Alors la pie, c’était une promesse… Prenez-le. Il sera mieux avec les trois autres.' },
			],
		},
	},
	{
		id: 'lucas-5',
		kind: 'short',
		client: 'Lucas',
		ask: 'Une lampe radio pour le poste de ma grand-mère.',
		needs: ['elec:4'],
		reward: { coins: 14, rep: 1 },
		when: { project: 'fauteuil', step: 2 },
	},
	{
		id: 'fauteuil-3',
		kind: 'story',
		client: 'La boulangère',
		ask: 'Poser le tissu neuf et le galon.',
		needs: ['tissu:4', 'soin:3'],
		reward: { coins: 22, rep: 5, energy: 10, cocoins: 10 },
		project: 'fauteuil',
		step: 3,
		scene: {
			title: 'Une place pour quelqu’un',
			lines: [
				{ who: 'note', text: 'Le fauteuil retrouve sa place dans la vitrine de la boulangerie. Une cliente s’y assoit déjà.' },
				{ who: 'note', text: 'Le facteur passe : une enveloppe à votre nom, d’une écriture tremblée. Lucile.', show: 'lucile' },
				{ who: 'note', text: '« Merci pour la boîte, et pour la lettre de Jeanne. Vous méritez la vérité. En mars 1962, nous sommes partis tous les trois vers l’îlot de la carte. La tempête nous a pris. Henri a sauvé Jeanne de la noyade. »' },
				{ who: 'note', text: '« Ensuite, j’ai voulu continuer à chercher, à terre, pour les familles. Jeanne a refusé : elle avait eu trop peur de perdre Henri. Nous nous sommes dit des mots terribles, et je suis partie. »' },
				{ who: 'note', text: '« Si vous avez trouvé le quatrième morceau, souvenez-vous de ce que répétait la Pie : rien n’est jamais là où on le croit. Lucile. »' },
				{ who: 'note', text: 'Fin du chapitre 5. Dans le bureau, les quatre morceaux de carte attendent d’être assemblés.' },
			],
		},
	},

	// ---- Chapter 6: the map turned over, the trapdoor, Rose's chest ----
	{
		id: 'malle-1',
		kind: 'story',
		client: 'Vous',
		ask: 'Dégager et nettoyer la malle.',
		needs: ['soin:4', 'outil:4'],
		reward: { coins: 16, rep: 3, energy: 10 },
		flag: 'map-solved',
		project: 'malle',
		step: 1,
		scene: {
			title: 'Le salpêtre',
			lines: [
				{ who: 'note', text: 'Le salpêtre part, le cuir réapparaît. Marqués au fer : une pie, et deux lettres, R. K.' },
				{ who: 'moi', text: 'Rose Kerdoual. La Pie. Deux cents ans sous le plancher.' },
			],
		},
	},
	{
		id: 'boulangere-2',
		kind: 'short',
		client: 'La boulangère',
		ask: 'Du rembourrage pour les coussins de la boutique.',
		needs: ['tissu:3'],
		reward: { coins: 12, rep: 1 },
		when: { project: 'malle', step: 1 },
	},
	{
		id: 'malle-2',
		kind: 'story',
		client: 'Vous',
		ask: 'Dérouiller et ouvrir la serrure.',
		needs: ['meca:5', 'outil:4'],
		reward: { coins: 18, rep: 3, energy: 10 },
		project: 'malle',
		step: 2,
		scene: {
			title: 'La serrure',
			lines: [
				{ who: 'note', text: 'La serrure cède dans un grincement. Dedans, des objets roulés dans de la toile cirée, chacun avec une étiquette de la main de Rose : un nom, un port, une année.' },
				{ who: 'note', text: 'Et des compartiments vides, plus nombreux que les pleins. Sur chacun, une étiquette barrée : « Rendu ».' },
				{ who: 'moi', text: 'Rose a volé, puis elle a rendu presque tout, dès 1813. Il ne reste que ce qu’elle n’a pas pu rendre.' },
			],
		},
	},
	{
		id: 'morel-5',
		kind: 'short',
		client: 'M. Morel',
		ask: 'Une lampe radio pour le vieux poste de mon père.',
		needs: ['elec:4'],
		reward: { coins: 14, rep: 1 },
		when: { project: 'malle', step: 2 },
	},
	{
		id: 'malle-3',
		kind: 'story',
		client: 'Vous',
		ask: 'Nourrir le cuir et polir les ferrures.',
		needs: ['tissu:4', 'bois:4'],
		reward: { coins: 24, rep: 5, energy: 10, cocoins: 10 },
		project: 'malle',
		step: 3,
		scene: {
			title: 'Ce qui reste',
			lines: [
				{ who: 'note', text: 'La malle de Rose brille comme au premier jour, au milieu de l’atelier.' },
				{ who: 'note', text: 'Au fond, une petite boîte à musique enveloppée de soie. L’étiquette : « Famille Chen, 1812 ».', show: 'tag' },
				{ who: 'moi', text: 'Chen… Mlle Chen cherchait justement un rouage pour une boîte à musique.' },
				{ who: 'note', text: 'Fin du chapitre 6.' },
			],
		},
	},

	// ---- Chapter 7: the last restitution, Lucile at the workshop ----
	{
		id: 'musique-1',
		kind: 'story',
		client: 'Mlle Chen',
		ask: 'Dépoussiérer le coffret laqué.',
		needs: ['soin:4', 'bois:3'],
		reward: { coins: 16, rep: 3, energy: 10 },
		when: { project: 'malle', step: 3 },
		project: 'musique',
		step: 1,
		scene: {
			title: 'La laque',
			lines: [
				{ who: 'note', text: 'Sous la poussière, le couvercle laqué montre un port, des jonques et des voiliers mêlés. Et un nom gravé : Mei Chen.' },
				{ who: 'chen', text: 'Mei… C’était l’arrière-grand-mère de ma grand-mère. On disait qu’elle avait tout perdu en mer, en 1812.' },
			],
		},
	},
	{
		id: 'lucas-6',
		kind: 'short',
		client: 'Lucas',
		ask: 'Un cadre pour la photo du voilier.',
		needs: ['bois:4'],
		reward: { coins: 14, rep: 1 },
		when: { project: 'musique', step: 1 },
	},
	{
		id: 'musique-2',
		kind: 'story',
		client: 'Mlle Chen',
		ask: 'Réparer le cylindre et le ressort.',
		needs: ['meca:5', 'outil:4'],
		reward: { coins: 18, rep: 3, energy: 10 },
		project: 'musique',
		step: 2,
		scene: {
			title: 'Le cylindre',
			lines: [
				{ who: 'note', text: 'Le cylindre tourne. Les premières notes s’égrènent, fragiles, un peu voilées.' },
				{ who: 'chen', text: '… C’est l’air. C’est exactement l’air de ma grand-mère.' },
			],
		},
	},
	{
		id: 'garnier-4',
		kind: 'short',
		client: 'Mme Garnier',
		ask: 'Du galon pour la nappe de la fête.',
		needs: ['tissu:4'],
		reward: { coins: 14, rep: 1 },
		when: { project: 'musique', step: 2 },
	},
	{
		id: 'musique-3',
		kind: 'story',
		client: 'Mlle Chen',
		ask: 'Remonter la figurine et le couvercle.',
		needs: ['bois:4', 'tissu:3'],
		reward: { coins: 30, rep: 6, energy: 10, cocoins: 20 },
		project: 'musique',
		step: 3,
		scene: {
			title: 'Ce que l’on rend',
			lines: [
				{ who: 'note', text: 'Chez les Chen, la grand-mère soulève le couvercle. Elle fredonne avant même la première note.' },
				{ who: 'chen', text: 'Deux cents ans, et elle revient. Merci. Et merci à cette Rose, malgré tout ce qu’elle a pris.' },
				{ who: 'note', text: 'Quelques jours plus tard, un taxi s’arrête devant l’atelier. Une vieille dame en descend, une canne dans une main, la boîte à ouvrage sous le bras.' },
				{ who: 'lucile', text: 'J’ai lu la lettre de Jeanne. Soixante ans pour se dire pardon… Nous étions têtues, toutes les deux.' },
				{ who: 'lucile', text: 'Rose a rendu ce qu’elle a pu. Jeanne a gardé la porte ouverte pour les autres. Et vous, vous avez fini le travail.' },
				{ who: 'note', text: 'Devant l’atelier, M. Morel, Mme Garnier, Lucas, Mlle Chen, la boulangère et Lucile posent pour une photo. Comme en 1961.', show: 'photo' },
				{ who: 'note', text: 'Fin de l’histoire. L’atelier reste ouvert : le quartier continue de passer, avec ses objets et ses souvenirs.' },
			],
		},
	},
];

export const INTRO: Line[] = [
	{ who: 'note', text: 'L’atelier de Jeanne, votre grand-mère, est resté fermé des années. La poussière recouvre tout.' },
	{ who: 'moi', text: 'Tout est encore là : ses outils, ses tiroirs… et ce bureau au fond, fermé à clé.' },
	{ who: 'garnier', text: 'Ah, vous rouvrez ? Jeanne réparait tout, ici. Vous auriez un jeu de tournevis pour moi ?' },
];

export const EPILOGUE: Line[] = [
	{ who: 'note', text: 'La photo de 1961 a retrouvé sa place, bien en vue. Derrière vous, la porte du bureau reste fermée.' },
	{ who: 'moi', text: 'Qu’est-ce que Jeanne gardait là-dedans ?' },
	{ who: 'note', text: 'Fin du chapitre 1.' },
];

export const SPEAKERS: Record<Line['who'], string> = {
	morel: 'M. Morel',
	garnier: 'Mme Garnier',
	lucas: 'Lucas',
	chen: 'Mlle Chen',
	boulangere: 'La boulangère',
	lucile: 'Lucile',
	moi: 'Vous',
	note: '',
};

export interface Upgrade {
	id: string;
	name: string;
	desc: string;
	cost: number;
	/** Progress needed before it can be bought. */
	when?: Gate;
	rep: number;
	/** Played once, when bought. */
	scene?: { title: string; lines: Line[] };
}

export const UPGRADES: Upgrade[] = [
	{ id: 'etabli', name: 'Dégager l’établi', desc: 'Faire de la place pour recevoir les clients.', cost: 8, rep: 1 },
	{ id: 'lampe', name: 'Rallumer la lampe', desc: 'La vieille lampe de Jeanne éclaire à nouveau l’établi.', cost: 20, when: { project: 'montre', step: 1 }, rep: 2 },
	{ id: 'photo', name: 'Accrocher la photo', desc: 'La photo de 1961, remise au mur, bien en vue.', cost: 15, when: { project: 'montre', step: 3 }, rep: 3 },
	{ id: 'etageres', name: 'Ouvrir les étagères', desc: 'Les étagères de Jeanne, et sa caisse d’électricien.', cost: 25, when: { project: 'radio', step: 1 }, rep: 2 },
	{ id: 'menuiserie', name: 'Aménager le coin menuiserie', desc: 'Le coffre du menuisier et un bout d’établi pour le bois.', cost: 30, when: { project: 'voilier', step: 1 }, rep: 2 },
	{ id: 'couture', name: 'Installer le coin couture', desc: 'La malle à tissus de Jeanne, et sa vieille machine à coudre.', cost: 30, when: { project: 'fauteuil', step: 1 }, rep: 2 },
	{
		id: 'souvenirs',
		name: 'Ouvrir la salle des souvenirs',
		desc: 'Le bureau de Jeanne, ouvert à tout le quartier.',
		cost: 40,
		when: { project: 'musique', step: 3 },
		rep: 5,
		scene: {
			title: 'La salle des souvenirs',
			lines: [
				{ who: 'note', text: 'Le carnet de Rose, la malle, les quatre morceaux de carte, la photo de 1961 et celle d’aujourd’hui : le bureau de Jeanne est devenu une salle ouverte à tous.' },
				{ who: 'lucile', text: 'Jeanne aurait aimé ça. Une porte ouverte, et du monde qui passe.' },
			],
		},
	},
	{
		id: 'bureau',
		name: 'Ouvrir le bureau de Jeanne',
		desc: 'La petite clé de la boîte de Lucile tourne dans la serrure.',
		cost: 20,
		when: { project: 'boite', step: 2 },
		rep: 3,
		scene: {
			title: 'Le bureau de Jeanne',
			lines: [
				{ who: 'note', text: 'La clé tourne. Le bureau sent le papier et la cire. Tout est rangé, comme en attente.', show: 'office' },
				{ who: 'note', text: 'Au mur, une carte marine : un îlot entouré de rouge, et trois morceaux de carte épinglés. Sur le bureau, un carnet de bord : celui de Rose Kerdoual, dite « la Pie », 1813.', show: 'map' },
				{ who: 'moi', text: 'Jeanne ne réparait pas seulement des objets. Elle cherchait quelque chose… avec Lucile et Henri.' },
				{ who: 'note', text: 'Sur une fiche, une pie dessinée à l’encre : « 4ᵉ morceau. Famille dépositaire. Chercher la pie. »' },
				{ who: 'moi', text: 'Des pirates dans la famille… et une carte au trésor. Il faut que j’écrive à Lucile.' },
			],
		},
	},
];

/** Board at a fresh start: both generators, and a few pieces to show what a merge is. */
export const START_BOARD: Record<number, string> = {
	[4 * COLS + 1]: 'g:boite',
	[4 * COLS + 5]: 'g:tiroir',
	[2 * COLS + 2]: 'outil:1',
	[6 * COLS + 3]: 'meca:1',
	[6 * COLS + 4]: 'meca:1',
};

export interface RepTier {
	id: string;
	at: number;
	title: string;
	reward: { energy: number };
	lines: Line[];
}

// Reputation never gets spent: each threshold is the neighbourhood's trust, paid once in a visit.
export const REP_TIERS: RepTier[] = [
	{
		id: 'rep-5',
		at: 5,
		title: 'L’atelier reprend vie',
		reward: { energy: 10 },
		lines: [
			{ who: 'garnier', text: 'Tout le quartier parle de la montre d’Henri ! Tenez, j’ai retrouvé ça en rangeant. Jeanne me l’avait envoyée.' },
			{ who: 'note', text: 'Une carte postale du port, datée de mars 1962 : « L’atelier restera ouvert. Le bureau, je le ferme. Ne me demande pas pourquoi. J. »', show: 'postcard' },
			{ who: 'moi', text: 'Mars 1962… un an après la montre. Qu’est-ce qui a pu se passer ?' },
		],
	},
];

// Neighbourhood orders once the campaign's list runs out. Drawn from the save's rng.
export const LOCALS = ['Mme Garnier', 'Lucas', 'M. Morel', 'La boulangère', 'Le facteur', 'Mlle Chen'];

/** Portrait file per client; the others get an emoji. */
export const FACES: Record<string, string> = {
	'Mme Garnier': 'garnier',
	Lucas: 'lucas',
	'M. Morel': 'morel',
	'Mlle Chen': 'chen',
	'La boulangère': 'boulangere',
	'Le facteur': 'facteur',
	Lucile: 'lucile',
};
export const FACE_EMOJI: Record<string, string> = { Vous: '🗝️' };
