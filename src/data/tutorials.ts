// Mini-tutos par jeu — fiches explicatives (objectif → règle(s) → astuce).
// Affichés à la 1re visite d'un jeu, rejouables via « Comment jouer ? ».

export interface TutorialStep {
	emoji?: string;
	title: string;
	body: string;
}

export const TUTORIALS: Record<string, TutorialStep[]> = {
	'somme-toute': [
		{ emoji: '🎯', title: 'Le but', body: 'Remplis les cases vides pour que chaque ligne et chaque colonne atteigne exactement sa somme cible (les pastilles).' },
		{ emoji: '✍️', title: 'Comment jouer', body: 'Touche une case vide puis choisis un nombre. Les pastilles deviennent vertes quand la somme est juste.' },
		{ emoji: '💡', title: 'Astuce', body: 'Pure déduction : il existe toujours une seule solution. Bloqué ? Le bouton Indice corrige ou révèle une case.' },
	],
	sudoku: [
		{ emoji: '🎯', title: 'Le but', body: 'Remplis la grille pour que chaque ligne, chaque colonne et chaque bloc contienne tous les chiffres une seule fois.' },
		{ emoji: '✍️', title: 'Comment jouer', body: 'Touche une case puis tape/choisis un chiffre. Disponible en 4×4, 6×6 ou 9×9.' },
		{ emoji: '💡', title: 'Astuce', body: 'Solution unique garantie. Indice corrige une erreur ou dévoile une case ; après 1 min, tu peux voir la solution.' },
	],
	reines: [
		{ emoji: '👑', title: 'Le but', body: 'Place une reine par ligne, par colonne et par zone de couleur.' },
		{ emoji: '🚫', title: 'La règle', body: 'Deux reines ne doivent jamais se toucher, même en diagonale. Touche une case pour cycler : marque, puis reine.' },
		{ emoji: '💡', title: 'Astuce', body: 'Pose une croix sur les cases sûrement interdites pour t\'y retrouver. Indice place une reine correcte si tu bloques.' },
	],
	calcudoku: [
		{ emoji: '🎯', title: 'Le but', body: 'Chaque ligne et chaque colonne contient les chiffres de 1 à N, sans répétition.' },
		{ emoji: '🧮', title: 'Les cages', body: 'Les zones aux bords épais portent une cible et une opération (+, −, ×, ÷) : les chiffres de la cage doivent la produire.' },
		{ emoji: '💡', title: 'Astuce', body: 'Le bouton « ? » détaille les opérations avec des exemples. Indice / Voir la solution sont là si besoin.' },
	],
	chemin: [
		{ emoji: '🎯', title: 'Le but', body: 'Trace un seul chemin qui remplit toutes les cases en passant par les nombres dans l\'ordre, du 1 jusqu\'au dernier.' },
		{ emoji: '🖱️', title: 'Comment jouer', body: 'Glisse depuis le 1 pour dessiner. Touche une case déjà tracée pour revenir en arrière.' },
		{ emoji: '💡', title: 'Astuce', body: 'Les murs bloquent certains passages. Indice prolonge le chemin correct ; après 1 min, tu peux voir la solution.' },
	],
	suite: [
		{ emoji: '🔢', title: 'Le but', body: 'Devine le terme suivant d\'une suite gouvernée par une règle cachée.' },
		{ emoji: '✅', title: 'Comment jouer', body: 'Choisis la bonne réponse. Bonne réponse → on enchaîne et le score monte ; une erreur termine la manche.' },
		{ emoji: '💡', title: 'Astuce', body: 'Indice élimine une mauvaise option ; « Voir la réponse » te montre la bonne si tu cales.' },
	],
	'rond-carre': [
		{ emoji: '🎯', title: 'Le but', body: 'Remplis la grille de ronds ● et de carrés ■, autant de chacun par ligne et par colonne.' },
		{ emoji: '🚫', title: 'Les règles', body: 'Jamais 3 mêmes symboles d\'affilée. Les signes = relient deux cases identiques, ≠ deux cases différentes.' },
		{ emoji: '💡', title: 'Astuce', body: 'Touche une case pour cycler ●, ■, vide. Indice corrige une case fausse ou en remplit une correcte.' },
	],
	suguru: [
		{ emoji: '🎯', title: 'Le but', body: 'Chaque zone de k cases se remplit avec les chiffres de 1 à k.' },
		{ emoji: '🚫', title: 'La règle', body: 'Deux mêmes chiffres ne peuvent jamais se toucher, même en diagonale.' },
		{ emoji: '💡', title: 'Astuce', body: 'Commence par les petites zones. Indice corrige une erreur ou révèle une case ; solution dispo après 1 min.' },
	],
	motifs: [
		{ emoji: '🎯', title: 'Le but', body: 'Découpe toute la grille en rectangles et carrés, un par indice.' },
		{ emoji: '📐', title: 'Les indices', body: 'Chaque indice donne la forme de sa pièce — ◻ carré, ▯ rectangle haut, ▭ large, ◇ libre — et parfois son nombre de cases.' },
		{ emoji: '🖱️', title: 'Comment jouer', body: 'Glisse pour tracer un rectangle autour d\'un indice. Touche une pièce pour l\'effacer. Indice révèle une pièce.' },
	],
	colorgramme: [
		{ emoji: '🎨', title: 'Le but', body: 'Toutes les cases sont coloriées. Reconstitue l\'image cachée d\'après les indices de chaque ligne et colonne.' },
		{ emoji: '🔍', title: 'La déduction', body: 'Choisis une couleur : tu ne vois que SES blocs, dans l\'ordre. Les blocs des autres couleurs sont cachés → déduis où commencent les tiens grâce aux colonnes.' },
		{ emoji: '🖌️', title: 'Les outils', body: 'Crayon pour peindre, Gomme pour effacer, ✕ pour marquer « pas cette couleur ici » (une croix colorée par couleur).' },
	],
};
