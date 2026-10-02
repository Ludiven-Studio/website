// Content of the campaign: chains, generators, projects (one restored object per chapter),
// orders, the workshop. Pure data, no logic, so a sim script and the tests read the same
// tables as the game. The story behind it: docs/atelier-scenario.md.

export type ChainId = 'outil' | 'soin' | 'meca' | 'elec' | 'bois' | 'tissu' | 'marin';
export type GenId = 'boite' | 'tiroir' | 'caisse' | 'coffre' | 'malle' | 'greeur';
export type ProjectId = 'montre' | 'radio' | 'voilier' | 'boite' | 'fauteuil' | 'malle' | 'musique'
	| 'boussole' | 'fanal' | 'longuevue' | 'coffre' | 'mouette' | 'cloche'
	| 'cadre' | 'travailleuse' | 'tabouret' | 'bobines' | 'carnet' | 'valise'
	| 'etal' | 'presentoir' | 'balance' | 'caissette' | 'casier' | 'toupie';

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
	marin: {
		id: 'marin',
		family: 'Marine',
		gen: 'greeur',
		items: ['Bout de corde', 'Nœud marin', 'Poulie', 'Voile', 'Gréement'],
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
	greeur: {
		id: 'greeur',
		name: 'Sac du gréeur',
		out: [
			{ chain: 'marin', w: 80 },
			{ chain: 'marin', level: 2, w: 20 },
		],
		charges: 12,
		chargeMs: 8_000,
		unlock: 'hangar',
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
	who: 'morel' | 'garnier' | 'lucas' | 'chen' | 'boulangere' | 'lucile' | 'yves' | 'lemoine' | 'moi' | 'note';
	text: string;
	/** Shown in place of the object while this line is on screen: the clue the line talks about. */
	show?: 'back' | 'mechanism' | 'photo' | 'postcard' | 'label' | 'broadcast' | 'dedication' | 'box' | 'key' | 'office' | 'map'
		| 'piece4' | 'lucile' | 'tag' | 'yvesnote' | 'carnet' | 'ticket' | 'receipt' | 'jtag' | 'open';
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

/** "Précédemment…": one line before each chapter's arrival, for players who lost the thread. Only the 12 named
 *  characters appear; everyone else goes by their role. Never says what the new chapter reveals. */
export const RECAPS: Partial<Record<ProjectId, string>> = {
	radio: 'La montre d’Henri, le père de M. Morel, était signée « J. » : sur la photo de 1961, il pose avec Jeanne, votre grand-mère. En mars 1962, elle a fermé son bureau à clé.',
	voilier: 'Une archive radio de 1961 a révélé les « Pirates du retour » : Jeanne, sa sœur Lucile et Henri. Mme Garnier garde une boîte destinée à Lucile, qu’elle n’a jamais envoyée.',
	boite: 'Le voilier de Lucas, dédicacé « Au capitaine du retour », a navigué au bassin. Mme Garnier vous a enfin remis la boîte de Lucile, la sœur de Jeanne : son tiroir est bloqué.',
	fauteuil: 'La clé cachée dans la boîte de Lucile a ouvert le bureau de Jeanne : le carnet de Rose « la Pie », pirate de 1813, une carte en trois morceaux, et une consigne : « Chercher la pie ».',
	malle: 'Le fauteuil de la boulangère cachait le quatrième morceau de carte. Dans sa lettre, Lucile, la sœur de Jeanne, rappelait le mot de la Pie : « Rien n’est jamais là où on le croit. »',
	musique: 'Sous l’atelier dormait la malle de Rose « la Pie » : elle avait volé, puis rendu presque tout. Au fond restait une boîte à musique étiquetée « Famille Chen, 1812 ».',
	boussole: 'La boîte à musique est rentrée chez les Chen, et Lucile, la sœur de Jeanne, est revenue à l’atelier. Enfant, Lucas avait reçu de son grand-père un voilier dédicacé « Au capitaine du retour ».',
	fanal: 'La boussole d’Yves, le grand-père de Lucas, portait « La Mouette, 1962 », un nom que personne ne connaissait, et son aiguille restait bloquée sur le cap de l’îlot de la carte.',
	longuevue: 'Le fanal d’Henri, le père de M. Morel, et la boussole d’Yves, le grand-père de Lucas, portaient le même nom : La Mouette. Les deux hommes étaient à bord pendant la tempête de mars 1962.',
	coffre: 'Lucile, la sœur de Jeanne, a avoué avoir poussé Yves, le grand-père de Lucas, à prendre la mer en 1962. Et le troisième morceau de carte venait de la famille de Lucas, depuis 1813.',
	mouette: 'Dans le coffre du mousse de Rose, l’ancêtre de Lucas, un carnet : la cloche de L’Espérance attend sur l’îlot depuis 1813. Pour aller la chercher, il faut La Mouette.',
	cloche: 'Avec M. Morel et le club de voile, Lucas a remis La Mouette à flot. Cap sur l’îlot, vers la crique où le mousse de Rose a caché la cloche de L’Espérance.',
	cadre: 'Lucas a rapporté la cloche de L’Espérance, et Yves, son grand-père, lui a dit qu’il était le vrai « capitaine du retour ». À la cérémonie, Mme Garnier s’est figée devant l’un des noms gravés.',
	travailleuse: 'Au dos du portrait que gardait Mme Garnier : « Étienne Roussel », le même nom que sur la cloche de L’Espérance.',
	tabouret: 'Mme Garnier descend d’Étienne Roussel, charpentier de L’Espérance, le navire pillé par l’équipage de Rose. Dans sa famille, on répétait : « Ce qui est pris ne revient pas. »',
	bobines: 'Mme Garnier a gardé soixante ans la boîte destinée à Lucile, la sœur de Jeanne. Au tabouret des ourlets, elle l’a avoué : elle aimerait recoudre avec quelqu’un, plus toute seule.',
	carnet: 'En 1962, Mme Garnier n’a jamais pris son train pour Lucile, la sœur de Jeanne, de peur que Jeanne la croie dans son camp. Elle voudrait l’appeler, sans savoir par où commencer.',
	valise: 'Dans la reliure du carnet de Rose, un reçu de 1813 : la Pie avait remis trois cents francs à Étienne Roussel, l’ancêtre de Mme Garnier. Mme Garnier a décidé d’appeler Lucile.',
	etal: 'Mme Garnier a enfin rejoint Lucile, la sœur de Jeanne, avec sa valise réparée. Mlle Chen, elle, garde une pièce de son tout premier lot de brocante, et promet de vous la raconter.',
	presentoir: 'La valise de Mlle Chen, son premier lot de brocante, sans doublure et percée de trous, tient enfin debout. Elle a appelé Mme Lemoine, la brocanteuse qui la lui a vendue.',
	balance: 'Pour Mme Lemoine, la valise de Mlle Chen était son étal de marché. Et Mlle Chen gardait avec elle quatre objets étiquetés « Réparation J. », de la main de Jeanne.',
	caissette: 'Mlle Chen gardait quatre réparations de Jeanne, étiquetées « Réparation J. ». Et depuis quelque temps, elle pose beaucoup de questions sur les marchés de village…',
	casier: 'Mlle Chen part en tournée des marchés avec la valise-étal. Elle y rendra les réparations de Jeanne, venues du stock racheté par Mme Lemoine : trois ont un nom, la quatrième non.',
	toupie: 'L’étal de Mlle Chen est prêt, l’itinéraire passe par les trois familles des étiquettes. Reste la quatrième réparation de Jeanne, sans nom de client : Mlle Chen veut vous la montrer.',
};

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
	// ---- Season 2: « Le capitaine du retour » (docs/atelier-saison2.md) ----
	{
		id: 'boussole',
		chapter: 8,
		object: 'Boussole',
		title: 'La boussole de marine',
		client: 'Lucas',
		steps: 3,
		arrival: [
			{ who: 'lucas', text: 'Salut ! J’ai seize ans maintenant, et c’est moi qui range le grenier de mon grand-père Yves.' },
			{ who: 'lucas', text: 'J’ai trouvé cette boussole dans un étui. Grand-père ne veut pas en parler. Vous pourriez la réparer ?' },
			{ who: 'moi', text: 'Boîtier terni, aiguille bloquée… Elle retrouvera le nord.' },
		],
	},
	{
		id: 'fanal',
		chapter: 9,
		object: 'Fanal',
		title: 'Le fanal d’Henri',
		client: 'M. Morel',
		steps: 3,
		arrival: [
			{ who: 'morel', text: 'En vidant la cave de mon père, j’ai trouvé ce vieux fanal. Il y a une étiquette dessus, à moitié effacée.' },
			{ who: 'moi', text: 'Verre brisé, rouille… On va le rallumer.' },
		],
	},
	{
		id: 'longuevue',
		chapter: 10,
		object: 'Longue-vue',
		title: 'La longue-vue de Lucile',
		client: 'Lucile',
		steps: 3,
		arrival: [
			{ who: 'lucile', text: 'Lucas m’a écrit pour la boussole. Alors je suis revenue, avec ceci : ma longue-vue de 1961.' },
			{ who: 'lucile', text: 'Réparez-la, et je vous raconterai ce que personne ne vous a dit sur La Mouette.' },
		],
	},
	{
		id: 'coffre',
		chapter: 11,
		object: 'Coffre',
		title: 'Le coffre du mousse',
		client: 'Lucas',
		steps: 3,
		arrival: [
			{ who: 'lucas', text: 'Au fond du grenier, il y a un coffre de marin fermé à clé. Personne n’a jamais eu la clé. Pas même grand-père.' },
			{ who: 'moi', text: 'On l’ouvrira sans le forcer. Doucement.' },
		],
	},
	{
		id: 'mouette',
		chapter: 12,
		object: 'Canot',
		title: 'La Mouette',
		client: 'Lucas',
		steps: 3,
		arrival: [
			{ who: 'lucas', text: 'Elle est là, dans le hangar : La Mouette. Fendue, mais entière. Grand-père l’a gardée soixante ans sans la regarder.' },
			{ who: 'morel', text: 'Mon père a navigué sur ce canot. Je vous aide. Et le club de voile viendra vérifier qu’elle tient la mer.' },
		],
	},
	{
		id: 'cloche',
		chapter: 13,
		object: 'Cloche',
		title: 'La cloche de L’Espérance',
		client: 'Lucas',
		steps: 3,
		arrival: [
			{ who: 'note', text: 'Mer d’huile, vent léger. Le club de voile accompagne La Mouette jusqu’à l’îlot ; vous suivez tout à la radio de Mme Garnier.' },
			{ who: 'lucas', text: '… « là où l’île regarde le port ». Il y a une faille dans le rocher. Je la vois ! Elle est lourde… On la ramène.' },
			{ who: 'moi', text: 'Verte de sel, battant perdu. Deux siècles sous l’eau et le vent.' },
		],
	},
	// ---- Season 3: « Le prochain départ » (docs/atelier-saison3.md) ----
	{
		id: 'cadre', chapter: 14, object: 'Cadre', title: 'Le portrait d’Étienne', client: 'Mme Garnier', steps: 3,
		arrival: [
			{ who: 'garnier', text: 'Depuis la cérémonie de la cloche, je n’arrête pas d’y penser. Tenez : le portrait que ma mère gardait au salon.' },
			{ who: 'garnier', text: 'Le cadre se défait. Et je voudrais revoir la liste des noms de la cloche. Pour vous montrer ce que j’y ai reconnu.' },
		],
	},
	{
		id: 'travailleuse', chapter: 15, object: 'Travailleuse', title: 'La travailleuse de sa mère', client: 'Mme Garnier', steps: 3,
		arrival: [
			{ who: 'garnier', text: 'La travailleuse de ma mère. Et dans le tiroir, la notice de famille. Je l’ai relue dix fois cette semaine.' },
		],
	},
	{
		id: 'tabouret', chapter: 16, object: 'Tabouret', title: 'Le tabouret des ourlets', client: 'La boulangère', steps: 3,
		arrival: [
			{ who: 'boulangere', text: 'Le tabouret où Mme Garnier faisait nos ourlets. Elle ne m’a jamais fait payer ma première tenue de travail.' },
			{ who: 'garnier', text: 'Oh, ce vieux tabouret… Dites, une vieille valise, ça se répare ?' },
		],
	},
	{
		id: 'bobines', chapter: 17, object: 'Coffret', title: 'Le coffret à bobines', client: 'Mme Garnier', steps: 3,
		arrival: [
			{ who: 'garnier', text: 'Mon coffret à bobines. Je vais le vider moi-même. Il y a dedans quelque chose que je dois vous montrer.' },
		],
	},
	{
		id: 'carnet', chapter: 18, object: 'Carnet', title: 'Le carnet de Rose', client: 'Vous', steps: 3,
		arrival: [
			{ who: 'note', text: 'Au bureau, la reliure du carnet de Rose achève de se défaire. Il est temps de la reprendre.' },
		],
	},
	{
		id: 'valise', chapter: 19, object: 'Valise', title: 'La valise', client: 'Mme Garnier', steps: 3,
		arrival: [
			{ who: 'garnier', text: 'La voilà, ma vieille valise. Poignée cassée, serrures rouillées. Il me la faut pour dans quinze jours.' },
		],
	},
	// ---- Season 4: « À bientôt » (docs/atelier-saison4.md) ----
	{
		id: 'etal', chapter: 20, object: 'Valise-étal', title: 'La valise de Mlle Chen', client: 'Mlle Chen', steps: 3,
		arrival: [
			{ who: 'chen', text: 'Voilà la valise de la poignée. Mon tout premier lot. Je l’ai démontée il y a des années, et je n’ai jamais osé la remonter.' },
			{ who: 'chen', text: 'Celle-là, je n’ai jamais réussi à la mettre en vente. Il y a des trous partout à l’intérieur, et aucune doublure.' },
		],
	},
	{
		id: 'presentoir', chapter: 21, object: 'Présentoir', title: 'Le présentoir de Mme Lemoine', client: 'Mme Lemoine', steps: 3,
		arrival: [
			{ who: 'lemoine', text: 'Alors c’est vous qui réparez tout, maintenant ? La petite Chen m’a appelée. J’ai apporté ce qui va avec sa valise.' },
		],
	},
	{
		id: 'balance', chapter: 22, object: 'Balance', title: 'La balance de la boulangerie', client: 'La boulangère', steps: 3,
		arrival: [
			{ who: 'boulangere', text: 'La balance de ma grand-mère. Elle penche toujours du même côté. Je voudrais la remettre au comptoir.' },
		],
	},
	{
		id: 'caissette', chapter: 23, object: 'Caissette', title: 'La caissette de monnaie', client: 'Mlle Chen', steps: 3,
		arrival: [
			{ who: 'chen', text: 'Ma caissette. Je la vide devant vous : pas de trésor, juste mes économies et un plan. J’ai un projet.' },
		],
	},
	{
		id: 'casier', chapter: 24, object: 'Casier', title: 'Le casier de l’étal', client: 'Mlle Chen', steps: 3,
		arrival: [
			{ who: 'chen', text: 'Un petit casier pour l’étal. Je veux qu’il soit à moi, pas une copie de la photo de Mme Lemoine.' },
		],
	},
	{
		id: 'toupie', chapter: 25, object: 'Toupie', title: 'La toupie', client: 'Vous', steps: 3,
		arrival: [
			{ who: 'chen', text: 'La quatrième étiquette, il n’y a pas de nom de client. Juste « toupie, pointe changée ». Tenez, c’est elle.' },
			{ who: 'moi', text: 'Cette bande bleue maladroite… C’est moi qui l’ai peinte. J’étais tout petit. C’est ma toupie.' },
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
	/** Shown in the restoration scene once delivered; `puzzle` is played first and does the restoration. */
	scene?: { title: string; lines: Line[]; puzzle?: PuzzleId };
}

/** Small "Professor Layton" puzzles inside restoration scenes (docs/atelier-enigmes.md). */
export type PuzzleId = 'gears' | 'longuevue' | 'taquin' | 'pesee'
	// Gestures (Gestures.tsx): short and no-fail.
	| 'frottage' | 'vertdegris' | 'dosducadre' | 'radio' | 'nettete' | 'notice' | 'rabat' | 'etal' | 'musique' | 'boussole'
	| 'fanal' | 'loquet' | 'marque' | 'cale' | 'caissette' | 'valise' | 'presentoir' | 'casier' | 'coffre' | 'toupie';

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
			puzzle: 'gears',
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
			title: 'La voix du quai', puzzle: 'radio',
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
			puzzle: 'frottage',
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
			title: 'Le tiroir', puzzle: 'loquet',
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
			title: 'La structure', puzzle: 'marque',
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
				{ who: 'moi', text: 'Rose, la Pie. Deux cents ans sous le plancher.' },
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
				{ who: 'note', text: 'Sous la poussière, le couvercle laqué montre un port, des jonques et des voiliers mêlés. Et un nom gravé : Chen.' },
				{ who: 'chen', text: 'Chen… c’est notre nom. On disait que l’arrière-grand-mère de ma grand-mère avait tout perdu en mer, en 1812.' },
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
			title: 'Ce que l’on rend', puzzle: 'musique',
			lines: [
				{ who: 'note', text: 'Chez les Chen, la grand-mère soulève le couvercle. Elle fredonne avant même la première note.' },
				{ who: 'chen', text: 'Deux cents ans, et elle revient. Merci. Et merci à cette Rose, malgré tout ce qu’elle a pris.' },
				{ who: 'note', text: 'Quelques jours plus tard, un taxi s’arrête devant l’atelier. Une vieille dame en descend, une canne dans une main, la boîte à ouvrage sous le bras.' },
				{ who: 'lucile', text: 'J’ai lu la lettre de Jeanne. Soixante ans pour se dire pardon… Nous étions têtues, toutes les deux.' },
				{ who: 'lucile', text: 'Rose a rendu ce qu’elle a pu. Jeanne a gardé la porte ouverte pour les autres. Et vous, vous avez fini le travail.' },
				{ who: 'note', text: 'Devant l’atelier, M. Morel, Mme Garnier, Lucas, Mlle Chen, la boulangère et Lucile posent pour une photo. Comme en 1961.', show: 'photo' },
				{ who: 'note', text: 'Fin de la saison 1. L’atelier reste ouvert : le quartier continue de passer, avec ses objets et ses souvenirs.' },
			],
		},
	},

	// ================= Season 2: « Le capitaine du retour » =================
	// ---- Chapter 8: the compass ----
	{
		id: 'boussole-1', kind: 'story', client: 'Lucas', ask: 'Nettoyer le boîtier.',
		needs: ['soin:3', 'meca:2'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'musique', step: 3 }, project: 'boussole', step: 1,
		scene: {
			title: 'L’étui',
			lines: [
				{ who: 'note', text: 'Sous le vert-de-gris, une gravure : « Y. K. — La Mouette, 1962 ». Dans l’étui, une photo de Lucas enfant au bassin, et un mot.' },
				{ who: 'note', text: '« Pour le capitaine du retour, le jour du bassin. Y. »', show: 'yvesnote' },
				{ who: 'lucas', text: 'Y. K., c’est grand-père. Le capitaine, c’était lui, alors ? Mais La Mouette… je n’ai jamais entendu ce nom.' },
			],
		},
	},
	{
		id: 'chen-5', kind: 'short', client: 'Mlle Chen', ask: 'Un lot de vis pour une vitrine de brocante.',
		needs: ['meca:2'], reward: { coins: 10, rep: 1 }, when: { project: 'boussole', step: 1 },
	},
	{
		id: 'boussole-2', kind: 'story', client: 'Lucas', ask: 'Débloquer l’aiguille.',
		needs: ['meca:4', 'outil:3'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'boussole', step: 2,
		scene: {
			title: 'Le nord', puzzle: 'boussole',
			lines: [
				{ who: 'note', text: 'L’aiguille frémit, puis se cale sur le nord. Elle était bloquée sur le cap de l’îlot.' },
				{ who: 'lucas', text: 'Le cap de l’îlot… Comme sur la carte du bureau de Jeanne.' },
			],
		},
	},
	{
		id: 'boussole-3', kind: 'story', client: 'Lucas', ask: 'Changer le verre et polir.',
		needs: ['soin:4', 'elec:2'], reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 }, project: 'boussole', step: 3,
		scene: {
			title: 'Y. K.',
			lines: [
				{ who: 'lucas', text: 'Je l’ai montrée à grand-père. Il l’a tenue longtemps, et il a dit : « Elle marche encore, elle. » Rien d’autre.' },
				{ who: 'note', text: 'Fin du chapitre 8.' },
			],
		},
	},

	// ---- Chapter 9: Henri's lantern ----
	{
		id: 'fanal-1', kind: 'story', client: 'M. Morel', ask: 'Dérouiller la cage.',
		needs: ['soin:3', 'bois:2'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'boussole', step: 3 }, project: 'fanal', step: 1,
		scene: {
			title: 'L’étiquette',
			lines: [
				{ who: 'note', text: 'Sous la rouille, l’étiquette se lit : « Mouette ». L’écriture est celle d’Henri.' },
				{ who: 'morel', text: 'Mouette ? Mon père n’avait pas de bateau. Pourquoi aurait-il gardé le fanal d’un canot ?' },
			],
		},
	},
	{
		id: 'boulangere-3', kind: 'short', client: 'La boulangère', ask: 'Du fil électrique pour l’enseigne.',
		needs: ['elec:2'], reward: { coins: 10, rep: 1 }, when: { project: 'fanal', step: 1 },
	},
	{
		id: 'fanal-2', kind: 'story', client: 'M. Morel', ask: 'Rallumer la mèche.',
		needs: ['elec:4', 'meca:3'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'fanal', step: 2,
		scene: {
			title: 'La flamme', puzzle: 'fanal',
			lines: [
				{ who: 'note', text: 'La flamme reprend. Au fond du réservoir, un papier plié : un bulletin de météo marine, mars 1962. « Avis de coup de vent. »' },
				{ who: 'moi', text: 'Mars 1962. La tempête. Henri était donc à bord de La Mouette.' },
			],
		},
	},
	{
		id: 'fanal-3', kind: 'story', client: 'M. Morel', ask: 'Poser un verre neuf et repeindre.',
		needs: ['soin:4', 'elec:3'], reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 }, project: 'fanal', step: 3,
		scene: {
			title: 'Le même canot',
			lines: [
				{ who: 'lucas', text: 'La Mouette, 1962… sur la boussole de grand-père. Et sur le fanal de votre père.' },
				{ who: 'morel', text: 'Alors ils étaient dans le même bateau, cette nuit-là. Mon père, et ton grand-père.' },
				{ who: 'note', text: 'Fin du chapitre 9.' },
			],
		},
	},

	// ---- Chapter 10: Lucile's spyglass ----
	{
		id: 'longuevue-1', kind: 'story', client: 'Lucile', ask: 'Nettoyer les lentilles.',
		needs: ['soin:4', 'outil:2'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'fanal', step: 3 }, project: 'longuevue', step: 1,
		scene: {
			title: 'Notre capitaine', puzzle: 'nettete',
			lines: [
				{ who: 'lucile', text: 'Yves avait dix-sept ans quand il nous a donné son morceau de carte, au printemps 1961. On l’appelait « notre capitaine ».' },
				{ who: 'lucile', text: 'Un morceau de carte que sa famille gardait depuis toujours, sans savoir pourquoi.' },
			],
		},
	},
	{
		id: 'garnier-5', kind: 'short', client: 'Mme Garnier', ask: 'Un coupon de tissu pour un rideau.',
		needs: ['tissu:2'], reward: { coins: 10, rep: 1 }, when: { project: 'longuevue', step: 1 },
	},
	{
		id: 'longuevue-2', kind: 'story', client: 'Lucile', ask: 'Débloquer les tubes.',
		needs: ['meca:4', 'outil:4'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'longuevue', step: 2,
		scene: {
			title: 'Mars 1962',
			lines: [
				{ who: 'lucile', text: 'Le ciel était mauvais. Yves ne voulait pas partir. C’est moi qui ai insisté. Il a cédé pour ne pas passer pour un froussard.' },
				{ who: 'lucile', text: 'Il nous a ramenés, tous. Et il ne s’est jamais pardonné d’avoir accepté. Ni de n’avoir pas su nous garder ensemble, après.' },
			],
		},
	},
	{
		id: 'longuevue-3', kind: 'story', client: 'Lucile', ask: 'Regainer de cuir.',
		needs: ['tissu:3', 'soin:3'], reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 }, project: 'longuevue', step: 3,
		scene: {
			title: 'La famille de Lucas',
			lines: [
				{ who: 'lucile', text: 'Lucas, le troisième morceau de la carte… c’était celui de ta famille. Elle le gardait depuis 1813.' },
				{ who: 'lucas', text: 'Depuis 1813 ? Alors mon ancêtre… il était sur le bateau de Rose ?' },
				{ who: 'note', text: 'Fin du chapitre 10.' },
			],
		},
	},

	// ---- Chapter 11: the ship's boy's chest ----
	{
		id: 'coffre-1', kind: 'story', client: 'Lucas', ask: 'Ouvrir la serrure sans la forcer.',
		needs: ['outil:4', 'bois:2'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'longuevue', step: 3 }, project: 'coffre', step: 1,
		scene: {
			title: 'S. K., 1813', puzzle: 'coffre',
			lines: [
				{ who: 'note', text: 'La serrure cède. Sur le couvercle, gravé au couteau : « S. K. · 1813 ». Le coffre du mousse de Rose, l’ancêtre de Lucas. Quatorze ans.' },
				{ who: 'lucas', text: 'Un mousse de quatorze ans. Presque mon âge.' },
			],
		},
	},
	{
		id: 'lucas-7', kind: 'short', client: 'Lucas', ask: 'Un cadre pour la photo du bassin.',
		needs: ['bois:4'], reward: { coins: 14, rep: 1 }, when: { project: 'coffre', step: 1 },
	},
	{
		id: 'coffre-2', kind: 'story', client: 'Lucas', ask: 'Consolider le fond et les charnières.',
		needs: ['bois:4', 'meca:3'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'coffre', step: 2,
		scene: {
			title: 'Le carnet',
			lines: [
				{ who: 'note', text: 'Au fond, un carnet de bord. Le mousse y raconte 1813 : le second de Rose et lui partent rendre des objets volés, chacun de son côté. Pas une fuite : une promesse.', show: 'carnet' },
				{ who: 'note', text: '« Reste la cloche de L’Espérance, trop lourde pour la route. Je l’ai mise là où l’île regarde le port. Je la rendrai un jour. »' },
			],
		},
	},
	{
		id: 'coffre-3', kind: 'story', client: 'Lucas', ask: 'Changer les poignées de corde.',
		needs: ['tissu:4', 'soin:3'], reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 }, project: 'coffre', step: 3,
		scene: {
			title: 'L’îlot',
			lines: [
				{ who: 'lucas', text: 'L’îlot n’était pas qu’un leurre. Le mousse y a caché la cloche. Et personne n’est jamais allé la chercher.' },
				{ who: 'lucas', text: 'Il nous faut un bateau. Il nous faut La Mouette.' },
				{ who: 'note', text: 'Fin du chapitre 11. Dans l’atelier, on peut maintenant ouvrir le hangar à bateaux.' },
			],
		},
	},

	// ---- Chapter 12: La Mouette ----
	{
		id: 'mouette-1', kind: 'story', client: 'Lucas', ask: 'Poncer la coque.',
		needs: ['bois:4', 'soin:3'], reward: { coins: 16, rep: 3, energy: 10 },
		after: 'hangar', when: { project: 'coffre', step: 3 }, project: 'mouette', step: 1,
		scene: {
			title: 'Le bois nu',
			lines: [
				{ who: 'morel', text: 'Mon père disait qu’un bateau poncé, c’est un bateau qui respire. Je ne savais pas qu’il parlait de celui-là.' },
			],
		},
	},
	{
		id: 'facteur-2', kind: 'short', client: 'Le facteur', ask: 'Un bout de corde pour mon vélo de tournée.',
		needs: ['marin:2'], reward: { coins: 10, rep: 1 }, after: 'hangar',
	},
	{
		id: 'mouette-2', kind: 'story', client: 'Lucas', ask: 'Réparer la coque et dresser le mât.',
		needs: ['marin:3', 'bois:4'], reward: { coins: 18, rep: 3, energy: 10 }, project: 'mouette', step: 2,
		scene: {
			title: 'Le mât',
			lines: [
				{ who: 'note', text: 'Le mât se dresse, les poulies tournent. Le club de voile passe au hangar : la coque tient, La Mouette est apte à naviguer.' },
			],
		},
	},
	{
		id: 'morel-6', kind: 'short', client: 'M. Morel', ask: 'Une poulie pour la corde à linge.',
		needs: ['marin:3'], reward: { coins: 12, rep: 1 }, when: { project: 'mouette', step: 2 },
	},
	{
		id: 'mouette-3', kind: 'story', client: 'Lucas', ask: 'Gréer et hisser la voile.',
		needs: ['marin:4', 'tissu:3'], reward: { coins: 22, rep: 5, energy: 10, cocoins: 10 }, project: 'mouette', step: 3,
		scene: {
			title: 'Prête',
			puzzle: 'longuevue',
			lines: [
				{ who: 'lucas', text: 'La Mouette flotte ! Demain, s’il fait beau, on part à l’îlot, droit sur la crique que vous avez trouvée. Le club nous accompagne.' },
				{ who: 'note', text: 'Fin du chapitre 12.' },
			],
		},
	},

	// ---- Chapter 13: the bell of L'Espérance ----
	{
		id: 'cloche-1', kind: 'story', client: 'Lucas', ask: 'Retirer le vert-de-gris.',
		needs: ['soin:4', 'outil:3'], reward: { coins: 16, rep: 3, energy: 10 },
		when: { project: 'mouette', step: 3 }, project: 'cloche', step: 1,
		scene: {
			title: 'Un nom',
			puzzle: 'vertdegris',
			lines: [
				{ who: 'note', text: 'Sous le vert-de-gris : « L’ESPÉRANCE · 1809 ». Puis, tout autour, les noms de son équipage. Des marins de ce port, pillés en 1811.' },
			],
		},
	},
	{
		id: 'chen-6', kind: 'short', client: 'Mlle Chen', ask: 'Un gréement pour une maquette de brocante.',
		needs: ['marin:4'], reward: { coins: 14, rep: 1 }, when: { project: 'cloche', step: 1 },
	},
	{
		id: 'cloche-2', kind: 'story', client: 'Lucas', ask: 'Remonter le battant.',
		needs: ['marin:3', 'meca:3'], reward: { coins: 18, rep: 3, energy: 10 }, project: 'cloche', step: 2,
		scene: {
			title: 'Le battant',
			lines: [
				{ who: 'note', text: 'Le battant retrouve sa place. Un premier coup, un peu sourd, fait taire tout l’atelier.' },
			],
		},
	},
	{
		id: 'cloche-3', kind: 'story', client: 'Lucas', ask: 'Polir et suspendre la cloche.',
		needs: ['soin:4', 'marin:4'], reward: { coins: 30, rep: 6, energy: 10, cocoins: 20 }, project: 'cloche', step: 3,
		scene: {
			title: 'Tout l’équipage',
			lines: [
				{ who: 'note', text: 'Sous la fenêtre de la maison de retraite, Lucas sonne la cloche de L’Espérance. Une fenêtre s’ouvre.' },
				{ who: 'yves', text: 'Ce mot dans la boussole… « le capitaine du retour », ce n’était pas moi, petit. C’était toi.' },
				{ who: 'yves', text: 'Au bassin, tu avais abandonné la course pour ramener les bateaux des autres. Moi, en 1962, je n’avais pas su garder mon équipage. Toi, tu savais déjà.' },
				{ who: 'yves', text: 'Tout l’équipage est rentré.' },
				{ who: 'note', text: 'Le lendemain, la cloche est rendue au port, à la capitainerie, avec les noms de L’Espérance. Pendant la cérémonie, Mme Garnier reste longtemps devant l’un d’eux. Puis elle se tait.' },
				{ who: 'note', text: 'Fin de la saison 2.' },
			],
		},
	},

	// ================= Season 3: « Le prochain départ » =================
	// ---- Chapter 14: the oval frame ----
	{
		id: 'cadre-1', kind: 'story', client: 'Mme Garnier', ask: 'Nettoyer le portrait.',
		needs: ['soin:3', 'outil:2'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'cloche', step: 3 }, project: 'cadre', step: 1,
		scene: { title: 'Le nom', puzzle: 'dosducadre', lines: [
			{ who: 'note', text: 'Sous la crasse, un homme aux mains larges. Au dos, à l’encre : « Étienne Roussel ».' },
			{ who: 'garnier', text: 'Le même nom que sur la cloche. Je l’ai lu pendant la cérémonie, et je n’ai rien pu dire.' },
		] },
	},
	{
		id: 'lucas-8', kind: 'short', client: 'Lucas', ask: 'Un nœud marin pour l’amarre de La Mouette.',
		needs: ['marin:2'], reward: { coins: 10, rep: 1 }, when: { project: 'cadre', step: 1 },
	},
	{
		id: 'cadre-2', kind: 'story', client: 'Mme Garnier', ask: 'Recoller la bordure.',
		needs: ['bois:3', 'meca:3'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'cadre', step: 2,
		scene: { title: 'La liste', lines: [
			{ who: 'garnier', text: 'Sur la liste de la cloche : « Étienne Roussel ». Mon arrière-arrière-grand-père portait ce nom. Ce n’est peut-être qu’un homonyme.' },
		] },
	},
	{
		id: 'cadre-3', kind: 'story', client: 'Mme Garnier', ask: 'Refermer le cadre.',
		needs: ['soin:4', 'bois:2'], reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 }, project: 'cadre', step: 3,
		scene: { title: 'Au salon', lines: [
			{ who: 'garnier', text: 'Il retourne au salon. Je vous apporterai la travailleuse de ma mère : il y a une notice de famille dans le tiroir.' },
			{ who: 'note', text: 'Fin du chapitre 14.' },
		] },
	},

	// ---- Chapter 15: the sewing table ----
	{
		id: 'travailleuse-1', kind: 'story', client: 'Mme Garnier', ask: 'Nettoyer le bois.',
		needs: ['soin:4', 'bois:2'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'cadre', step: 3 }, project: 'travailleuse', step: 1,
		scene: { title: 'La notice', puzzle: 'notice', lines: [
			{ who: 'note', text: 'La notice de famille, d’une écriture ancienne : « Étienne Roussel, charpentier, ruiné par les pirates en 1811. Ce qui est pris ne revient pas. »' },
			{ who: 'garnier', text: 'Charpentier, 1811, des pirates… La cloche de L’Espérance. Ce n’est pas un homonyme.' },
		] },
	},
	{
		id: 'morel-7', kind: 'short', client: 'M. Morel', ask: 'Une ampoule pour la lampe de chevet.',
		needs: ['elec:3'], reward: { coins: 12, rep: 1 }, when: { project: 'travailleuse', step: 1 },
	},
	{
		id: 'travailleuse-2', kind: 'story', client: 'Mme Garnier', ask: 'Réparer le pied et les charnières.',
		needs: ['bois:4', 'meca:3'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'travailleuse', step: 2,
		scene: { title: 'De l’autre côté', lines: [
			{ who: 'garnier', text: 'À la cérémonie, j’ai compris. Avant, je ne savais pas. Mon ancêtre était de L’Espérance. Celle que l’équipage de Rose a pillée.' },
			{ who: 'garnier', text: 'Et moi, pendant soixante ans, j’ai été l’amie de la descendante de la Pie. Drôle d’histoire.' },
		] },
	},
	{
		id: 'travailleuse-3', kind: 'story', client: 'Mme Garnier', ask: 'Garnir les casiers.',
		needs: ['tissu:3', 'soin:3'], reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 }, project: 'travailleuse', step: 3,
		scene: { title: 'La maxime', lines: [
			{ who: 'garnier', text: '« Ce qui est pris ne revient pas. » Ma mère le répétait. Moi, je l’ai pris pour : n’attends rien de personne.' },
			{ who: 'note', text: 'Fin du chapitre 15.' },
		] },
	},

	// ---- Chapter 16: the stool (a breather) ----
	{
		id: 'tabouret-1', kind: 'story', client: 'La boulangère', ask: 'Nettoyer et dégarnir.',
		needs: ['soin:3', 'tissu:2'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'travailleuse', step: 3 }, project: 'tabouret', step: 1,
		scene: { title: 'Les ourlets', lines: [
			{ who: 'boulangere', text: 'Tout le quartier s’est assis là, le temps d’un ourlet. Elle disait : « Tiens-toi droite, ou je raccourcis de travers. »' },
		] },
	},
	{
		id: 'chen-7', kind: 'short', client: 'Mlle Chen', ask: 'Un coupon de tissu pour une housse.',
		needs: ['tissu:2'], reward: { coins: 10, rep: 1 }, when: { project: 'tabouret', step: 1 },
	},
	{
		id: 'tabouret-2', kind: 'story', client: 'La boulangère', ask: 'Consolider le pied et regarnir.',
		needs: ['bois:4', 'tissu:3'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'tabouret', step: 2,
		scene: { title: 'Droite', puzzle: 'cale', lines: [
			{ who: 'garnier', text: 'Tiens-toi droite… Oh, pardon, l’habitude. J’aimerais bien recoudre avec quelqu’un, vous savez. Plus toute seule.' },
		] },
	},
	{
		id: 'tabouret-3', kind: 'story', client: 'La boulangère', ask: 'Poser le tissu neuf.',
		needs: ['tissu:4', 'soin:3'], reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 }, project: 'tabouret', step: 3,
		scene: { title: 'Une place', lines: [
			{ who: 'boulangere', text: 'Il retourne à la boutique, à côté du fauteuil de ma mère. Deux places pour quelqu’un, maintenant.' },
			{ who: 'note', text: 'Fin du chapitre 16.' },
		] },
	},

	// ---- Chapter 17: the spool box and the ticket ----
	{
		id: 'bobines-1', kind: 'story', client: 'Mme Garnier', ask: 'Redresser le couvercle.',
		needs: ['bois:3', 'outil:3'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'tabouret', step: 3 }, project: 'bobines', step: 1,
		scene: { title: 'Le billet', puzzle: 'taquin', lines: [
			{ who: 'note', text: 'Sous les bobines, un billet de train, avril 1962, jamais composté. Destination : la ville où vit Lucile.', show: 'ticket' },
			{ who: 'garnier', text: 'Je devais lui porter la boîte moi-même. Le billet était acheté.' },
		] },
	},
	{
		id: 'facteur-3', kind: 'short', client: 'Le facteur', ask: 'Une poulie pour le monte-colis.',
		needs: ['marin:3'], reward: { coins: 12, rep: 1 }, when: { project: 'bobines', step: 1 },
	},
	{
		id: 'bobines-2', kind: 'story', client: 'Mme Garnier', ask: 'Réparer la charnière et les casiers.',
		needs: ['meca:4', 'bois:3'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'bobines', step: 2,
		scene: { title: 'Le retard', lines: [
			{ who: 'garnier', text: 'J’ai eu peur que Jeanne croie que je choisissais le camp de Lucile. Alors j’ai attendu « le bon moment ».' },
			{ who: 'garnier', text: 'À la fin, ce n’était plus le moment qui manquait. Je n’osais plus expliquer le retard.' },
		] },
	},
	{
		id: 'bobines-3', kind: 'story', client: 'Mme Garnier', ask: 'Ranger les bobines et polir.',
		needs: ['soin:4', 'tissu:3'], reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 }, project: 'bobines', step: 3,
		scene: { title: 'Appeler', lines: [
			{ who: 'garnier', text: 'J’aimerais appeler Lucile. Pour de vrai, cette fois. Mais je ne sais pas par où commencer.' },
			{ who: 'note', text: 'Fin du chapitre 17.' },
		] },
	},

	// ---- Chapter 18: Rose's logbook and the 1813 receipt ----
	{
		id: 'carnet-1', kind: 'story', client: 'Vous', ask: 'Dépoussiérer la couverture.',
		needs: ['soin:4', 'outil:2'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'bobines', step: 3 }, project: 'carnet', step: 1,
		scene: { title: 'La couverture', lines: [
			{ who: 'note', text: 'La pie gravée sur le cuir réapparaît, et les initiales : R. K., 1813.' },
		] },
	},
	{
		id: 'boulangere-4', kind: 'short', client: 'La boulangère', ask: 'Du galon pour les rideaux de la boutique.',
		needs: ['tissu:4'], reward: { coins: 14, rep: 1 }, when: { project: 'carnet', step: 1 },
	},
	{
		id: 'carnet-2', kind: 'story', client: 'Vous', ask: 'Recoudre la reliure.',
		needs: ['tissu:4', 'outil:3'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'carnet', step: 2,
		scene: { title: 'Le rabat', puzzle: 'rabat', lines: [
			{ who: 'note', text: 'En recousant le dos, un papier plié glisse du rabat : « 1813. Reçu de la Pie la somme de trois cents francs. Étienne Roussel, charpentier. »', show: 'receipt' },
			{ who: 'moi', text: 'Rose avait tenté de réparer. En partie seulement : trois cents francs ne rendent pas un navire. Mais quelque chose était revenu.' },
		] },
	},
	{
		id: 'carnet-3', kind: 'story', client: 'Vous', ask: 'Cirer le cuir.',
		needs: ['soin:4', 'bois:3'], reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 }, project: 'carnet', step: 3,
		scene: { title: 'Pas toute l’histoire', lines: [
			{ who: 'garnier', text: '« Ce qui est pris ne revient pas »… Ma famille ne disait pas toute l’histoire. Ça ne répare rien, mais ça change quelque chose.' },
			{ who: 'garnier', text: 'Ce soir, j’appelle Lucile. Pas pour la cloche. Pour moi.' },
			{ who: 'note', text: 'Fin du chapitre 18.' },
		] },
	},

	// ---- Chapter 19: the suitcase ----
	{
		id: 'valise-1', kind: 'story', client: 'Mme Garnier', ask: 'Nettoyer la coque.',
		needs: ['soin:4', 'meca:2'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'carnet', step: 3 }, project: 'valise', step: 1,
		scene: { title: 'Au téléphone', lines: [
			{ who: 'garnier', text: 'On a parlé une heure. De couture, surtout. Elle m’attend dans quinze jours. J’ai eu le temps de lui dire pourquoi je n’étais pas venue.' },
		] },
	},
	{
		id: 'lucas-9', kind: 'short', client: 'Lucas', ask: 'Un gréement pour la saison de voile.',
		needs: ['marin:4'], reward: { coins: 14, rep: 1 }, when: { project: 'valise', step: 1 },
	},
	{
		id: 'valise-2', kind: 'story', client: 'Mme Garnier', ask: 'Réparer la poignée et la doublure.',
		needs: ['tissu:4', 'meca:3'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'valise', step: 2,
		scene: { title: 'Plus joli', lines: [
			{ who: 'garnier', text: 'J’aurais pu lui faire quelque chose de plus joli, pour l’arrivée… Non. On le fera ensemble.' },
		] },
	},
	{
		id: 'valise-3', kind: 'story', client: 'Mme Garnier', ask: 'Remonter les fermoirs.',
		needs: ['meca:4', 'soin:4'], reward: { coins: 30, rep: 6, energy: 10, cocoins: 20 }, project: 'valise', step: 3,
		scene: { title: 'Le prochain départ', puzzle: 'valise', lines: [
			{ who: 'note', text: 'Cette fois, elle fait elle-même le voyage qu’elle avait toujours reporté. La valise claque, le taxi attend.' },
			{ who: 'note', text: 'Deux semaines plus tard, une photo arrive à l’atelier : Mme Garnier et Lucile, penchées sur un ouvrage à moitié fini.' },
			{ who: 'garnier', text: 'On a surtout parlé. Je dois y retourner pour finir.' },
			{ who: 'chen', text: 'Pour vos prochaines valises : une poignée de mon tout premier lot de brocante. J’en ai gardé une pièce, moi aussi. Un jour, je vous raconterai.' },
			{ who: 'note', text: 'Fin de la saison 3.' },
		] },
	},

	// ================= Season 4: « À bientôt » =================
	// ---- Chapter 20: the suitcase stall ----
	{
		id: 'etal-1', kind: 'story', client: 'Mlle Chen', ask: 'Nettoyer la coque et l’intérieur.',
		needs: ['soin:4', 'bois:2'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'valise', step: 3 }, project: 'etal', step: 1,
		scene: { title: 'Les tasseaux', lines: [
			{ who: 'note', text: 'Propre, l’intérieur montre des tasseaux vissés et des trous alignés. Pas de doublure : elle n’en a jamais eu.' },
			{ who: 'chen', text: 'Une valise sans doublure, avec des trous partout. Je n’ai jamais compris à quoi elle servait.' },
		] },
	},
	{
		id: 'garnier-6', kind: 'short', client: 'Mme Garnier', ask: 'Du fil, pour l’ouvrage à finir avec Lucile.',
		needs: ['tissu:2'], reward: { coins: 10, rep: 1 }, when: { project: 'etal', step: 1 },
	},
	{
		id: 'etal-2', kind: 'story', client: 'Mlle Chen', ask: 'Remonter les charnières.',
		needs: ['meca:4', 'outil:3'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'etal', step: 2,
		scene: { title: 'Elle tient', puzzle: 'etal', lines: [
			{ who: 'chen', text: 'Elle s’ouvre et elle tient debout. J’appelle Mme Lemoine, la brocanteuse qui me l’a vendue. Elle saura.' },
		] },
	},
	{
		id: 'etal-3', kind: 'story', client: 'Mlle Chen', ask: 'Cirer et remettre les coins.',
		needs: ['soin:4', 'bois:3'], reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 }, project: 'etal', step: 3,
		scene: { title: 'La première pièce', lines: [
			{ who: 'chen', text: 'Ma première réparation abandonnée, enfin finie. J’avais peur d’abîmer un objet auquel quelqu’un avait tenu.' },
			{ who: 'note', text: 'Fin du chapitre 20.' },
		] },
	},

	// ---- Chapter 21: the folding display ----
	{
		id: 'presentoir-1', kind: 'story', client: 'Mme Lemoine', ask: 'Nettoyer les lattes.',
		needs: ['soin:3', 'bois:3'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'etal', step: 3 }, project: 'presentoir', step: 1,
		scene: { title: 'Un étal', puzzle: 'presentoir', lines: [
			{ who: 'lemoine', text: 'Ce n’est pas une valise, ma petite : c’est mon étal. Le présentoir se range dedans, les tasseaux le tiennent. Quarante ans de marchés.' },
			{ who: 'note', text: 'Elle montre une photo : un marché de village, et la valise ouverte en éventail, couverte d’objets.' },
		] },
	},
	{
		id: 'lucas-10', kind: 'short', client: 'Lucas', ask: 'Une voile pour la régate du port.',
		needs: ['marin:4'], reward: { coins: 14, rep: 1 }, when: { project: 'presentoir', step: 1 },
	},
	{
		id: 'presentoir-2', kind: 'story', client: 'Mme Lemoine', ask: 'Remplacer les lattes cassées.',
		needs: ['bois:4', 'meca:3'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'presentoir', step: 2,
		scene: { title: 'La boîte', lines: [
			{ who: 'chen', text: 'Avec la valise, j’avais aussi gardé une boîte de petits objets. Je ne les ai jamais vendus : ils étaient à quelqu’un.' },
			{ who: 'note', text: 'Quatre objets, chacun avec une étiquette jaunie : « Réparation J. ».', show: 'jtag' },
		] },
	},
	{
		id: 'presentoir-3', kind: 'story', client: 'Mme Lemoine', ask: 'Vernir le présentoir.',
		needs: ['soin:4', 'bois:3'], reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 }, project: 'presentoir', step: 3,
		scene: { title: 'Réparation J.', lines: [
			{ who: 'moi', text: '« Réparation J. »… C’est l’écriture de Jeanne. Ce sont des réparations de l’atelier.' },
			{ who: 'note', text: 'Fin du chapitre 21.' },
		] },
	},

	// ---- Chapter 22: the scales (a breather) ----
	{
		id: 'balance-1', kind: 'story', client: 'La boulangère', ask: 'Nettoyer les plateaux.',
		needs: ['soin:4', 'meca:2'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'presentoir', step: 3 }, project: 'balance', step: 1,
		scene: { title: 'Le cuivre', lines: [
			{ who: 'boulangere', text: 'Ma grand-mère y pesait la farine pour tout le quartier. Elle disait qu’une balance juste, c’est un commerce honnête.' },
		] },
	},
	{
		id: 'morel-8', kind: 'short', client: 'M. Morel', ask: 'Un rouage pour la pendule d’Henri.',
		needs: ['meca:4'], reward: { coins: 14, rep: 1 }, when: { project: 'balance', step: 1 },
	},
	{
		id: 'balance-2', kind: 'story', client: 'La boulangère', ask: 'Redresser le fléau.',
		needs: ['meca:4', 'outil:4'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'balance', step: 2,
		scene: { title: 'Les marchés', lines: [
			{ who: 'chen', text: 'Vous savez quels villages ont un marché le mardi ? Et combien de temps il vous faut pour une réparation, en général ?' },
		] },
	},
	{
		id: 'balance-3', kind: 'story', client: 'La boulangère', ask: 'Polir le cuivre.',
		needs: ['soin:4', 'elec:2'], reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 }, project: 'balance', step: 3,
		scene: { title: 'Au comptoir', puzzle: 'pesee', lines: [
			{ who: 'boulangere', text: 'Elle est juste, à nouveau. Mlle Chen, vous posez beaucoup de questions sur les marchés, vous…' },
			{ who: 'note', text: 'Fin du chapitre 22.' },
		] },
	},

	// ---- Chapter 23: the cash box and the project ----
	{
		id: 'caissette-1', kind: 'story', client: 'Mlle Chen', ask: 'Débosseler la caissette.',
		needs: ['outil:4', 'meca:3'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'balance', step: 3 }, project: 'caissette', step: 1,
		scene: { title: 'Le projet', puzzle: 'caissette', lines: [
			{ who: 'chen', text: 'Mon projet : une tournée des marchés, avec la valise-étal. Je n’osais pas la transformer : elle était à Mme Lemoine avant moi.' },
			{ who: 'lemoine', text: 'Les trous, c’est moi qui les ai percés. Tu peux en percer d’autres. Un étal, ça sert, ou ça moisit.' },
		] },
	},
	{
		id: 'facteur-4', kind: 'short', client: 'Le facteur', ask: 'Une ampoule pour la lampe du bureau de poste.',
		needs: ['elec:3'], reward: { coins: 12, rep: 1 }, when: { project: 'caissette', step: 1 },
	},
	{
		id: 'caissette-2', kind: 'story', client: 'Mlle Chen', ask: 'Réparer la serrure et la poignée.',
		needs: ['meca:4', 'bois:3'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'caissette', step: 2,
		scene: { title: 'D’où venait le lot', lines: [
			{ who: 'lemoine', text: 'Ce lot-là ? Je l’avais acheté au notaire, quand l’atelier de Jeanne a fermé. Tout son stock. Une boîte de réparations a dû s’y mêler.' },
			{ who: 'chen', text: 'Alors ces quatre objets attendaient leurs propriétaires depuis tout ce temps. Et moi, je les gardais sans le savoir.' },
		] },
	},
	{
		id: 'caissette-3', kind: 'story', client: 'Mlle Chen', ask: 'Repeindre la caissette.',
		needs: ['soin:4', 'tissu:3'], reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 }, project: 'caissette', step: 3,
		scene: { title: 'Un but', lines: [
			{ who: 'chen', text: 'Ma tournée aura un but en plus : rendre ces réparations. Trois étiquettes ont un nom. La quatrième, non.' },
			{ who: 'note', text: 'Fin du chapitre 23.' },
		] },
	},

	// ---- Chapter 24: the drawer cabinet ----
	{
		id: 'casier-1', kind: 'story', client: 'Mlle Chen', ask: 'Décoincer les tiroirs.',
		needs: ['bois:4', 'outil:3'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'caissette', step: 3 }, project: 'casier', step: 1,
		scene: { title: 'À sa façon', lines: [
			{ who: 'chen', text: 'Pas comme sur la photo. Les petits objets devant, les réparations à rendre à part, dans ce tiroir-là.' },
		] },
	},
	{
		id: 'chen-8', kind: 'short', client: 'Mlle Chen', ask: 'Un nœud marin pour attacher l’étal au vélo.',
		needs: ['marin:2'], reward: { coins: 10, rep: 1 }, when: { project: 'casier', step: 1 },
	},
	{
		id: 'casier-2', kind: 'story', client: 'Mlle Chen', ask: 'Réparer les glissières.',
		needs: ['meca:4', 'bois:3'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'casier', step: 2,
		scene: { title: 'L’itinéraire', lines: [
			{ who: 'chen', text: 'Mardi, le marché du bourg. Jeudi, retour ici. Samedi, la côte. Les trois familles des étiquettes sont sur la route.' },
		] },
	},
	{
		id: 'casier-3', kind: 'story', client: 'Mlle Chen', ask: 'Étiqueter les tiroirs.',
		needs: ['tissu:3', 'soin:4'], reward: { coins: 20, rep: 5, energy: 10, cocoins: 10 }, project: 'casier', step: 3,
		scene: { title: 'Prête', puzzle: 'casier', lines: [
			{ who: 'chen', text: 'L’étal est prêt. Il ne reste que la quatrième réparation, celle sans nom. Venez voir.' },
			{ who: 'note', text: 'Fin du chapitre 24.' },
		] },
	},

	// ---- Chapter 25: the spinning top ----
	{
		id: 'toupie-1', kind: 'story', client: 'Vous', ask: 'Nettoyer la toupie.',
		needs: ['soin:3', 'bois:2'], reward: { coins: 15, rep: 3, energy: 10 },
		when: { project: 'casier', step: 3 }, project: 'toupie', step: 1,
		scene: { title: 'Toupie, pointe changée', lines: [
			{ who: 'note', text: 'L’étiquette, de la main de Jeanne : « toupie, pointe changée ». Rien d’autre. Jeanne l’avait réparée, et gardée.', show: 'jtag' },
		] },
	},
	{
		id: 'boulangere-5', kind: 'short', client: 'La boulangère', ask: 'Un casse-croûte pour la route de Mlle Chen… et une ampoule pour la vitrine.',
		needs: ['elec:3'], reward: { coins: 12, rep: 1 }, when: { project: 'toupie', step: 1 },
	},
	{
		id: 'toupie-2', kind: 'story', client: 'Vous', ask: 'Changer la pointe, encore.',
		needs: ['meca:3', 'outil:4'], reward: { coins: 16, rep: 3, energy: 10 }, project: 'toupie', step: 2,
		scene: { title: 'La pointe', lines: [
			{ who: 'note', text: 'L’ancienne réparation a cédé pendant toutes ces années au fond d’une boîte. Vous changez la pointe, comme elle l’avait fait.' },
		] },
	},
	{
		id: 'toupie-3', kind: 'story', client: 'Vous', ask: 'Repeindre, sans toucher à la bande bleue.',
		needs: ['soin:4', 'tissu:2'], reward: { coins: 30, rep: 6, energy: 10, cocoins: 20 }, project: 'toupie', step: 3,
		scene: { title: 'À bientôt', puzzle: 'toupie', lines: [
			{ who: 'note', text: 'La toupie tourne sur l’établi, longtemps. La bande bleue maladroite passe et repasse.' },
			{ who: 'chen', text: 'Je repasse jeudi. J’aurai sûrement quelque chose pour vous.' },
			{ who: 'moi', text: 'J’avais rouvert l’atelier pour retrouver quelque chose d’elle. Maintenant, j’ai aussi envie de voir ce qui entre.' },
			{ who: 'note', text: 'Vous retournez le panneau sur « Ouvert ». Quelqu’un frappe.', show: 'open' },
			{ who: 'note', text: '« Vous pourriez regarder ça ? »' },
			{ who: 'note', text: 'Fin de L’Atelier des Souvenirs. Merci d’avoir tout réparé avec nous. L’atelier reste ouvert : le quartier continue de passer.' },
		] },
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
	yves: 'Yves',
	lemoine: 'Mme Lemoine',
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
		id: 'hangar',
		name: 'Ouvrir le hangar à bateaux',
		desc: 'Le vieux hangar du port, où dort La Mouette. Et le sac du gréeur.',
		cost: 35,
		when: { project: 'coffre', step: 3 },
		rep: 3,
		scene: {
			title: 'Le hangar',
			lines: [
				{ who: 'note', text: 'La porte du hangar grince. Sous une bâche, une coque fendue : La Mouette. Contre le mur, le sac du gréeur, plein de cordages.' },
			],
		},
	},
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
				{ who: 'note', text: 'Au mur, une carte marine : un îlot entouré de rouge, et trois morceaux de carte épinglés. Sur le bureau, un carnet de bord : celui de Rose, dite « la Pie », 1813.', show: 'map' },
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
	Yves: 'yves',
	'Mme Lemoine': 'lemoine',
	Jeanne: 'jeanne',
	'Henri Morel': 'henri',
	Rose: 'rose',
};
export const FACE_EMOJI: Record<string, string> = { Vous: '🗝️' };
