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
		{ emoji: '✍️', title: 'Comment jouer', body: 'Touche une case vide puis choisis un nombre. Chaque pastille montre la somme actuelle face à l\'objectif : bleu quand la somme est atteinte, orange sinon.' },
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
	symboles: [
		{ emoji: '🔷', title: 'Le but', body: 'Une suite de symboles obéit à une logique cachée : devine le symbole qui vient ensuite.' },
		{ emoji: '✅', title: 'Comment jouer', body: 'Choisis la bonne réponse. Bonne réponse → on enchaîne et le score monte ; une erreur termine la manche.' },
		{ emoji: '💡', title: 'Astuce', body: 'Repère ce qui change : la forme, la couleur, la rotation, le reflet (miroir) ou le nombre d\'éléments. Indice élimine une option ; « Voir la réponse » dévoile la règle.' },
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
	tente: [
		{ emoji: '⛺', title: 'Le but', body: 'Place une tente à côté de chaque arbre — autant de tentes que d\'arbres.' },
		{ emoji: '🚫', title: 'Les règles', body: 'Chaque tente touche son arbre (haut/bas/gauche/droite). Deux tentes ne se touchent jamais, même en diagonale. Les compteurs donnent le nombre de tentes par ligne et colonne.' },
		{ emoji: '💡', title: 'Comment jouer', body: 'Touche une case pour cycler : tente, puis herbe (case sûrement vide), puis vide. Indice corrige ou pose une tente ; solution dispo après 1 min.' },
	],
	bataille: [
		{ emoji: '🚢', title: 'Le but', body: 'Une flotte est cachée dans la grille. Coule tous les navires en un minimum d\'actions (le score = tirs + sonars).' },
		{ emoji: '🎯', title: 'Tirer', body: 'Clique une case pour tirer : ✸ = touché, point = manqué. Un navire entièrement touché est coulé — comme les navires ne se touchent jamais, l\'eau autour se dévoile alors toute seule.' },
		{ emoji: '🔊', title: 'Sonar', body: 'Tu as quelques sonars : active le bouton Sonar puis clique une zone — il révèle le nombre de cases-navire dans le carré 5×5. La flotte à couler (tailles des navires) est affichée en haut. Au défi du jour, même flotte pour tous, classement au moins d\'actions.' },
	],
	demineur: [
		{ emoji: '💣', title: 'Le but', body: 'Découvre toutes les cases sûres sans cliquer sur une mine. Les chiffres indiquent combien de mines touchent la case (diagonales comprises). Une ouverture sûre est révélée pour démarrer.' },
		{ emoji: '🧠', title: 'Sans devinette', body: 'Chaque grille est garantie résolvable par pure logique : tu n\'es jamais obligé de deviner. En cas de doute, le bouton Indice trouve une case forcément sûre (ou une mine) et l\'explique.' },
		{ emoji: '🚩', title: 'Marquer les mines', body: 'Clic = révéler. Clic droit, ou le bouton « Mode drapeau » puis tap, = poser/retirer un drapeau 🚩 sur une mine suspectée. Cliquer une mine = partie terminée — mais au défi du jour tu apparais quand même au classement, selon les bombes restantes.' },
	],
	snake: [
		{ emoji: '🎯', title: 'Le but', body: 'Mange les pommes pour grandir et faire le plus gros score. Ne touche jamais les murs, ta propre queue ni les rochers, sinon c\'est terminé.' },
		{ emoji: '🎮', title: 'Contrôles', body: 'Dirige le serpent aux flèches (ou ZQSD/WASD), ou en glissant le doigt. Tu accélères en grandissant. Choisis ta difficulté : plus dur = plus rapide et davantage de rochers.' },
		{ emoji: '🏆', title: 'Défi du jour', body: 'En défi du jour, pommes et rochers sont les mêmes pour tout le monde (le niveau dépend du jour). Jusqu\'à 10 essais : ton meilleur score de la journée est classé.' },
	],
	flappy: [
		{ emoji: '🐔', title: 'Le but', body: 'Fais franchir à la cocotte un maximum de tuyaux sans les toucher ni tomber. Chaque tuyau passé vaut 1 point.' },
		{ emoji: '🎮', title: 'Contrôles', body: 'Espace, clic ou tap pour battre des ailes. Plus tu maintiens, plus la cocotte monte haut ; un petit tap = petit saut. Choisis ta difficulté : écart et taille des ouvertures varient.' },
		{ emoji: '🏆', title: 'Défi du jour', body: 'En défi du jour, les tuyaux sont identiques pour tout le monde (le niveau dépend du jour). Jusqu\'à 10 essais : ton meilleur score de la journée est classé.' },
	],
	aquarium: [
		{ emoji: '💧', title: 'Le but', body: 'Remplis d\'eau les bassins colorés pour respecter les compteurs de chaque ligne et colonne.' },
		{ emoji: '⬇️', title: 'La règle', body: 'Dans un bassin, l\'eau est de niveau et monte par le bas : si une case est remplie, toutes celles du même bassin en dessous le sont aussi.' },
		{ emoji: '💡', title: 'Comment jouer', body: 'Touche/glisse pour cycler : eau, puis « pas d\'eau » (✕), puis vide. Indice corrige une case ; solution dispo après 1 min.' },
	],
};
