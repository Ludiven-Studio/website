// Games still being made, to try before everyone else. Not listed in the menu nor the sitemap: /prototypes/ and the
// /tests/ hub list them.
export interface Prototype { name: string; tag: string; href: string; cover: string; date: string; text: string; tip: string }

export const PROTOTYPES: Prototype[] = [
	{
		name: 'Kart Galactique',
		tag: 'Course de karts en 3D',
		href: '/prototypes/kart-galactique/',
		cover: '/prototypes/kart-galactique/cover.webp',
		date: '14 novembre 2026',
		text: 'Une course de karts sur une route qui flotte dans l’espace, entre les astéroïdes et une planète à anneaux. Choisis ton vaisseau parmi cinq engins farfelus : la Caravane Stellaire, le Croiseur Démesuré au capot interminable, le Taxi Cabossé, la Boîte de Conserve à réaction ou la Part de Pizza, une part géante qui file pointe devant. Dérape dans les virages pour charger un turbo, ramasse les boîtes surprises et sors le laser, la mine à paillettes, le saut hyperespace ou le rayon tracteur contre le premier. Trois tours contre cinq pilotes.',
		tip: 'Au clavier ou sur téléphone, de préférence à l’horizontale.',
	},
	{
		name: 'Domino Path : le pont de dominos',
		tag: 'Dominos et réflexion',
		href: '/prototypes/domino-pont/',
		cover: '/prototypes/domino-pont/cover.webp',
		date: '13 novembre 2026',
		text: 'Un chemin de dominos monte vers un tableau, mais des trous le coupent. Chaque trou se bouche avec les dominos de ta main, selon la règle du vrai jeu : deux dominos se touchent par le même nombre. Un domino peut aller à plusieurs endroits, un seul choix bouche tout. Ensuite, une pichenette sur le domino doré : la vague passe les ponts et fait tomber le tableau. Vingt-quatre niveaux, du plus simple au plus retors.',
		tip: 'Sur téléphone, en mode portrait.',
	},
	{
		name: 'ColorChain : relais de dominos',
		tag: 'Dominos et rythme',
		href: '/prototypes/colorchain-relais/',
		cover: '/prototypes/colorchain-relais/cover.webp',
		date: '12 novembre 2026',
		text: 'Une longue chaîne de dominos monte en zigzag vers un tableau blanc. À chaque trou, la vague s’arrête : touche l’écran au moment où elle arrive pour la relancer. Si la chaîne tient jusqu’en haut, le tableau tombe et révèle son dessin. Cent dessins à découvrir, et un chemin infini qui accélère : un seul arrêt et la partie est finie.',
		tip: 'Sur téléphone, en mode portrait.',
	},
	{
		name: 'ColorChain : couches de peinture',
		tag: 'Dominos et peinture',
		href: '/prototypes/colorchain-peinture/',
		cover: '/prototypes/colorchain-peinture/cover.webp',
		date: '12 novembre 2026',
		text: 'Cent dessins à peindre en dominos. Chaque couleur a son pochoir : compare-les au modèle pour trouver ce qui passe devant, touche-les dans l’ordre, puis une pichenette. Des dominos grimpent un escalier, lancent une bille qui renverse les pots un par un au-dessus du tableau, puis un domino blanc se divise jusqu’à une ligne par colonne et fait tout tomber. Les dessins réussis remplissent une galerie.',
		tip: 'Sur téléphone, en mode portrait.',
	},
	{
		name: 'ColorChain : chaînes de couleurs',
		tag: 'Dominos, première piste',
		href: '/prototypes/colorchain/',
		cover: '/prototypes/colorchain/cover.webp',
		date: '12 novembre 2026',
		text: 'Treize niveaux de dominos colorés, du plus simple au plus rusé : une pichenette, des lignes qui se séparent, des planches qui lancent tout un arc-en-ciel, des champs qui révèlent une image, des billes et des aiguillages, puis des dominos dorés numérotés à faire tomber dans l’ordre, jusqu’à un dernier niveau ultra dur. Le but : tout faire tomber d’une seule pichenette.',
		tip: 'Sur téléphone, en mode portrait.',
	},
];

