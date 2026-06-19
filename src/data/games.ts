import type { iconPaths } from '../components/IconPaths';

export interface GameTile {
	id: string; // stable slug — favorite key
	title: string;
	pitch: string;
	icon: keyof typeof iconPaths;
	href?: string;
	status: 'play' | 'soon';
}

export const games: GameTile[] = [
	{
		id: 'somme-toute',
		title: 'Somme Toute',
		pitch: 'Équilibre chaque ligne et chaque colonne pour atteindre la somme cible. Pure déduction.',
		icon: 'scales',
		href: '/jeux/somme-toute',
		status: 'play',
	},
	{
		id: 'sudoku',
		title: 'Sudoku',
		pitch: 'Le grand classique de la logique en grille, en 4×4, 6×6 ou 9×9, plusieurs niveaux.',
		icon: 'grid-nine',
		href: '/jeux/sudoku',
		status: 'play',
	},
	{
		id: 'reines',
		title: 'Reines',
		pitch: 'Une reine par ligne, colonne et couleur, sans qu\'elles se touchent. À la LinkedIn Queens.',
		icon: 'crown',
		href: '/jeux/reines',
		status: 'play',
	},
	{
		id: 'calcudoku',
		title: 'Calcudoku',
		pitch: 'Des cages avec une cible et une opération. Le Sudoku qui calcule.',
		icon: 'cage-sum',
		href: '/jeux/calcudoku',
		status: 'play',
	},
	{
		id: 'chemin',
		title: 'Le chemin',
		pitch: 'Relie tous les nombres dans l\'ordre en remplissant la grille, façon Zip.',
		icon: 'winding-path',
		href: '/jeux/chemin',
		status: 'play',
	},
	{
		id: 'suite',
		title: 'Suite mystère',
		pitch: 'Devine la règle cachée et complète la séquence. En choix multiple.',
		icon: 'sequence',
		href: '/jeux/suite',
		status: 'play',
	},
	{
		id: 'rond-carre',
		title: 'Rond & Carré',
		pitch: 'Équilibre ronds et carrés, jamais 3 d\'affilée, avec des contraintes = / ≠. Façon Tango.',
		icon: 'circle-square',
		href: '/jeux/rond-carre',
		status: 'play',
	},
	{
		id: 'suguru',
		title: 'Suguru',
		pitch: 'Remplis chaque zone avec 1 à sa taille, sans que deux mêmes chiffres ne se touchent.',
		icon: 'grid-dots',
		href: '/jeux/suguru',
		status: 'play',
	},
	{
		id: 'motifs',
		title: 'Motifs',
		pitch: 'Découpe la grille en rectangles et carrés d\'après les indices de forme.',
		icon: 'partition',
		href: '/jeux/motifs',
		status: 'play',
	},
	{
		id: 'colorgramme',
		title: 'Colorgramme',
		pitch: 'Un nonogramme en couleurs : reconstitue l\'image grâce aux indices de chaque ligne et colonne.',
		icon: 'palette',
		href: '/jeux/colorgramme',
		status: 'play',
	},
	{
		id: 'tente',
		title: 'Tente',
		pitch: 'Plante une tente près de chaque arbre, sans qu\'elles se touchent. Façon Tents & Trees.',
		icon: 'tent',
		href: '/jeux/tente',
		status: 'play',
	},
	{
		id: 'bataille',
		title: 'Bataille navale',
		pitch: 'Retrouve la flotte cachée grâce aux compteurs de lignes et colonnes. Logique pure, façon Bimaru.',
		icon: 'ship',
		href: '/jeux/bataille',
		status: 'play',
	},
	{
		id: 'aquarium',
		title: 'Aquarium',
		pitch: 'Remplis les bassins : l\'eau monte par le bas et respecte les compteurs. Déduction tout en douceur.',
		icon: 'water',
		href: '/jeux/aquarium',
		status: 'play',
	},
];
