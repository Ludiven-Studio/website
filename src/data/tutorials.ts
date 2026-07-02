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
	flechettes: [
		{ emoji: '🎯', title: 'Le but (501)', body: 'Tu pars de 501 et tu dois tomber pile à 0 en un minimum de fléchettes. La dernière fléchette doit finir sur un DOUBLE (ou le bullseye).' },
		{ emoji: '👆', title: 'Viser & lancer', body: 'Glisse le cadre sur la zone que tu veux viser. Le viseur oscille à l\'intérieur du cadre : tape dedans au bon moment pour lancer. Triple = ×3, Double = ×2, bull = 25, bullseye = 50.' },
		{ emoji: '⚠️', title: 'Bust', body: 'Si un lancer te fait passer en dessous de 2, ou pile à 0 sans double, c\'est « bust » : rien n\'est soustrait mais la fléchette est gâchée. Au défi du jour, même cible mobile pour tous ; le chrono départage.' },
	],
	fruits: [
		{ emoji: '🍎', title: 'Le but', body: 'Chaque fruit cache un nombre. À partir des équations affichées, trouve combien vaut le fruit demandé.' },
		{ emoji: '🧮', title: 'Comment jouer', body: 'Résous pas à pas en partant de l\'équation la plus simple (un fruit répété donne directement sa valeur), puis remplace dans les suivantes. Choisis la bonne valeur parmi les 4 propositions.' },
		{ emoji: '✅', title: 'Astuce', body: 'Indice enlève une mauvaise option ; « Voir la réponse » montre les étapes. Au défi du jour, résous 3 énigmes le plus vite possible.' },
	],
	matrices: [
		{ emoji: '🧩', title: 'Le but', body: 'Une grille 3×3 de figures suit une logique cachée ; une case manque. Trouve la figure qui la complète, façon test de QI.' },
		{ emoji: '🔍', title: 'La logique', body: 'Observe ce qui change le long des lignes et des colonnes : la forme, la couleur, le nombre d\'éléments, l\'orientation. Souvent chaque ligne (ou colonne) contient les 3 valeurs, ou bien ça progresse.' },
		{ emoji: '✅', title: 'Comment jouer', body: 'Choisis la bonne figure parmi les 3 options. Indice élimine une mauvaise option ; « Voir la réponse » dévoile la logique. Au défi du jour, résous-en 3 le plus vite possible.' },
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
	pavage: [
		{ emoji: '🧩', title: 'Le but', body: 'Emboîte toutes les pièces dans la grille pour couvrir chaque case libre, sans chevauchement ni dépassement.' },
		{ emoji: '🚫', title: 'La règle', body: 'Deux pièces de même couleur ne doivent jamais se toucher côte à côte. Une seule disposition respecte tout : à toi de la trouver.' },
		{ emoji: '🖱️', title: 'Comment jouer', body: 'Glisse une pièce du bac vers la grille (un aperçu rouge = pose interdite). Reprends une pièce posée en la glissant. En difficile, les pièces se tournent avec ⟳ ou la touche R. Les cases barrées sont bloquées. Indice et solution sont là si tu bloques.' },
	],
	tubes: [
		{ emoji: '🧪', title: 'Le but', body: 'Verse les liquides pour que chaque tube soit vide ou entièrement rempli d\'une seule couleur.' },
		{ emoji: '💧', title: 'Verser', body: 'Touche un tube (source) puis un autre (destination). On ne peut verser que sur une case vide ou sur la même couleur, et s\'il reste de la place. Tout le bloc de couleur du dessus part d\'un coup.' },
		{ emoji: '🛟', title: 'Les outils', body: 'Annuler revient en arrière, Recommencer remet la grille à zéro, Indice surligne un bon coup, et le bouton ➕ ajoute un tube vide (une fois) pour te débloquer.' },
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
		{ emoji: '🔊', title: 'Sonar', body: 'Tu as quelques sonars : active le bouton Sonar puis clique une zone — il révèle le nombre de cases-navire dans le carré 3×3. La flotte à couler (tailles des navires) est affichée en haut. Au défi du jour, même flotte pour tous, classement au moins d\'actions.' },
	],
	codecolor: [
		{ emoji: '🎨', title: 'Le but', body: 'Un code de couleurs est caché. Devine-le en un minimum d\'essais. Le code n\'a que des couleurs différentes (pas de doublon).' },
		{ emoji: '🕹️', title: 'Comment jouer', body: 'Touche une couleur de la palette pour la placer dans la prochaine case (touche une case posée pour l\'enlever), puis appuie sur Valider quand la ligne est complète. Une couleur déjà posée n\'est plus sélectionnable.' },
		{ emoji: '🔢', title: 'Les indices', body: 'Chaque essai renvoie deux nombres : ✓ « bien placés » (bonne couleur, bonne position) et ○ « présents » (bonne couleur, mauvaise position) — sans dire lesquels. Au défi du jour, même code pour tous, classement au moins d\'essais.' },
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
	golf: [
		{ emoji: '🏌️', title: 'Le but', body: 'Rentre la balle dans le trou (le drapeau) en un minimum de coups. Le parcours est généré à chaque partie.' },
		{ emoji: '🎯', title: 'Viser à la fronde', body: 'Touche/clique près de la balle et tire dans le sens OPPOSÉ à la direction voulue : un élastique part de la balle. Plus tu tires loin, plus le coup est puissant. Relâche pour frapper.' },
		{ emoji: '↩️', title: 'Rebonds & fantômes', body: 'La balle rebondit sur les bords et les murs : sers-t\'en pour contourner les obstacles. Au défi du jour, même trou pour tous, 10 essais, et tu vois les balles fantômes des autres joueurs en direct (classement au moins de coups).' },
	],
	angry: [
		{ emoji: '🐔', title: 'Le but', body: 'Fais tomber tous les renards en lançant la cocotte, avec le moins de cocottes possible.' },
		{ emoji: '🎯', title: 'Viser à la fronde', body: 'Glisse depuis la cocotte et tire dans le sens OPPOSÉ à la direction voulue : plus tu tires loin, plus le lancer est puissant. Relâche pour lancer. Une trajectoire en pointillés t\'aide à viser.' },
		{ emoji: '🦊', title: 'Structures & renards', body: 'Casse les caisses et tonneaux pour faire s\'effondrer les structures : chaque impact entame la vie des renards, et ils explosent à 0. Au défi du jour, même niveau pour tous ; le chrono départage.' },
	],
	billard: [
		{ emoji: '🎱', title: 'Le but', body: 'Rentre toutes les boules colorées dans les trous à l\'aide de la boule blanche, en un minimum de coups (3 en facile, 4 en moyen, 5 en difficile).' },
		{ emoji: '🎯', title: 'Viser à la fronde', body: 'Glisse depuis la boule blanche et tire dans le sens OPPOSÉ à la direction voulue : plus tu tires loin, plus le coup est puissant. Relâche pour frapper. La boule rebondit sur les bandes.' },
		{ emoji: '⚪', title: 'Fausse blanche', body: 'Si la boule blanche tombe dans un trou, elle revient à sa place de départ et coûte 1 coup de pénalité. Au défi du jour, même table pour tous ; le chrono départage les ex æquo.' },
	],
	drift: [
		{ emoji: '🏁', title: 'Le but', body: 'Cours sur un circuit fermé aléatoire et réalise le tour le plus rapide possible. Ton meilleur tour est ton score.' },
		{ emoji: '🎮', title: 'Contrôles', body: 'La voiture accélère et drifte toute seule. Tu tournes seulement avec les flèches / Q-D (ou les deux gros boutons). Maintiens le braquage à vitesse pour partir en drift ; hors-piste, ça ralentit.' },
		{ emoji: '🏎️', title: 'Les voitures', body: 'Trois voitures au choix avant la course (jauges Vitesse / Accél / Drift) : Équilibrée, Bolide (rapide mais tourne moins) et Drifteuse (glisse à fond, vitesse de pointe plus basse).' },
		{ emoji: '👥', title: 'Multijoueur', body: 'Jusqu\'à 4 pilotes par course, mis en relation automatiquement. Les autres apparaissent en fantômes (sans collision) avec leur pseudo, et leurs meilleurs tours s\'affichent en direct.' },
	],
	pong: [
		{ emoji: '🎯', title: 'Le but', body: 'Le Pong classique à deux : renvoie la balle avec ta raquette. Si tu la laisses passer, l\'adversaire marque. Premier à 7 points gagne.' },
		{ emoji: '🎮', title: 'Contrôles', body: 'Déplace ta raquette avec les flèches ↑ / ↓ (ou Z/S), ou en glissant le doigt sur le terrain. Frappe la balle près du bord de la raquette pour changer son angle.' },
		{ emoji: '👥', title: 'Jouer ensemble', body: 'Partie rapide pour être appairé au hasard, ou « Créer une partie » : un code s\'affiche, ton ami le saisit pour te rejoindre. Pas d\'adversaire ? Entraîne-toi contre l\'ordinateur.' },
		{ emoji: '⚡', title: 'Pouvoirs (optionnels)', body: 'Au menu, choisis « Classique » ou « Power-ups ». En Power-ups : ta jauge se remplit à chaque renvoi (pleine au 5e), clique un des 4 pouvoirs (touches 1-4) — ⚡ Speed max, 🌀 trajectoire courbée, 🌫️ brouillage (des balles leurres apparaissent partout chez l\'adversaire), 🛡️ raquette XXL. Des power-ups apparaissent aussi sur le terrain : touche-les avec la balle pour déclencher leur effet.' },
	],
	foot: [
		{ emoji: '⚽', title: 'Le but', body: 'Match de foot vu de côté, en 1v1 ou 2v2 (au choix — en 2v2 tu as un coéquipier bot) : envoie le ballon dans le but adverse. Premier à 5 buts gagne. Le ballon rebondit beaucoup et part en tir dès qu\'une cocotte le touche — au sol, il décolle.' },
		{ emoji: '🎮', title: 'Contrôles', body: 'Déplace-toi avec ◀ ▶ (ou ← →) et saute avec SAUT (ou Espace / ↑). Re-tape SAUT en l\'air pour battre des ailes et planer. Double-tape une direction (◀◀ / ▶▶) pour un dash-éclair : un grand bond rapide qui bouscule les autres poules — pratique pour revenir en défense ou dégager. Fonce dans le ballon pour le frapper : ta vitesse donne la puissance et la direction du tir. Tu es la cocotte cerclée d\'or.' },
		{ emoji: '👥', title: 'Jouer ensemble', body: 'Partie rapide pour être appairé au hasard, ou « Jouer avec un ami » : un code s\'affiche, ton ami le saisit pour te rejoindre — chacun avec son coéquipier bot. Pas d\'adversaire ? Joue contre le bot.' },
	],
	esquive: [
		{ emoji: '🚀', title: 'Le but', body: 'Pilote ton vaisseau qui fonce dans l\'espace et évite les astéroïdes le plus longtemps possible. Ton temps de survie est ton score.' },
		{ emoji: '🎮', title: 'Contrôles', body: 'Déplace-toi avec les flèches ou ZQSD, ou en glissant le doigt/la souris : tu bouges en haut/bas ET gauche/droite pour esquiver. Plus ça dure, plus ça accélère.' },
		{ emoji: '🏆', title: 'Défi du jour', body: 'En défi du jour, les astéroïdes sont identiques pour tout le monde (le niveau dépend du jour). Jusqu\'à 10 essais : ton meilleur temps de la journée est classé.' },
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
