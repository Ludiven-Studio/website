// Mini-tutos par jeu — fiches explicatives (objectif → règle(s) → astuce).
// Affichés à la 1re visite d'un jeu, rejouables via « Comment jouer ? ».

export interface TutorialStep {
	emoji?: string;
	title: string;
	body: string;
}

export const TUTORIALS: Record<string, TutorialStep[]> = {
	'lettres-croisees': [
		{ emoji: '🎯', title: 'Le but', body: 'Remplis la grille croisée : chaque mot à trouver se compose UNIQUEMENT avec les lettres de la roue, en bas. Le plus long utilise toutes les lettres. Quand tous les mots de la grille sont trouvés, c\'est gagné.' },
		{ emoji: '👆', title: 'Composer un mot', body: 'Glisse d\'une lettre à l\'autre sur la roue sans lever le doigt (reviens en arrière pour corriger), puis relâche pour valider. Tu peux aussi taper les lettres une à une et confirmer avec ✓. Le bouton 🔀 mélange la roue pour voir les lettres autrement.' },
		{ emoji: '✨', title: 'Mots bonus', body: 'Un mot français valide qui n\'est pas dans la grille compte en bonus : il fait briller le compteur ✨ mais ne remplit pas la grille. De quoi flamber au passage.' },
		{ emoji: '💡', title: 'Indice', body: 'Bloqué ? Le bouton Indice révèle un mot de la grille, disponible toutes les 30 secondes. Au défi du jour, l\'attente compte dans ton chrono — à utiliser avec parcimonie !' },
		{ emoji: '🏆', title: 'Défi du jour', body: 'Même grille pour tout le monde (graine partagée). Remplis-la le plus vite possible : ton meilleur temps entre au classement.' },
	],
	'mot-secret': [
		{ emoji: '🎯', title: 'Le but', body: 'Devine le mot secret en 6 essais maximum. Sa première lettre est affichée, et chaque essai doit être un mot français de la bonne longueur commençant par cette lettre.' },
		{ emoji: '🟥', title: 'Les indices', body: 'Après chaque essai : carré ROUGE = lettre bien placée, rond JAUNE = lettre présente ailleurs dans le mot, case sombre = lettre absente. Les lettres confirmées s\'affichent en filigrane sur la ligne suivante.' },
		{ emoji: '⌨️', title: 'Le clavier', body: 'Tape avec le clavier à l\'écran (ou ton vrai clavier). Les touches se colorent selon ce que tu as appris : rouge, jaune ou éteinte. Les accents ne comptent pas — tout s\'écrit sans accent.' },
		{ emoji: '🏆', title: 'Défi du jour', body: 'Même mot pour tout le monde, un seul essai par jour. Moins tu utilises d\'essais, mieux tu es classé. Un échec est classé après les gagnants — reviens demain !' },
	],
	'meli-melo': [
		{ emoji: '🎯', title: 'Le but', body: 'Forme un maximum de mots français (3 lettres ou plus) en 90 secondes dans la grille 4×4, en reliant des lettres voisines — dans les 8 directions, chaque case au plus une fois par mot.' },
		{ emoji: '👆', title: 'Tracer', body: 'Glisse de case en case pour tracer le mot puis relâche pour valider (reviens en arrière pour corriger). Tu peux aussi taper les cases une à une et confirmer avec ✓.' },
		{ emoji: '💎', title: 'Les points', body: 'Plus c\'est long, plus ça rapporte : 3-4 lettres = 1 pt, 5 = 2 pts, 6 = 3 pts, 7 = 5 pts, 8 = 11 pts. À la fin, tu découvres les mots que tu as manqués.' },
		{ emoji: '🏆', title: 'Défi du jour', body: 'Même grille pour tout le monde, une seule tentative chrono. Le chrono continue même si tu recharges la page — pas de pause ! Ton total de points entre au classement.' },
	],
	'cocottes-renards': [
		{ emoji: '🎯', title: 'Le but', body: 'Un tower defense façon Plants vs Zombies : les renards sortent de la forêt à droite et avancent voie par voie vers les nids du poulailler, tout à gauche. Un renard qui atteint un nid pille la ligne : elle est perdue, mais tu peux la reconstruire (1000 blé) et tu continues sur les autres. Plus aucun nid = partie terminée.' },
		{ emoji: '🌾', title: 'Ramasser le blé', body: 'Les pondeuses troquent leurs œufs en blé, et il en tombe aussi du ciel : clique les jetons pour les encaisser. Attention, un jeton laissé trop longtemps perd de la valeur (compteur au-dessus) avant d\'être ramassé automatiquement au minimum. Le blé sert à poser tes défenses et à reconstruire un nid.' },
		{ emoji: '🐔', title: 'Poser des cocottes', body: 'Sélectionne une carte puis clique une case. Lanceuse et mitrailleuse tirent des œufs, la poule des neiges ralentit, la poule gémeaux tire double, l\'œuf-mine explose au contact, la costaude bloque, la poule laser (500) brûle d\'un rayon continu, et le coq piment nettoie toute une voie.' },
		{ emoji: '🥚', title: 'Bien démarrer', body: 'Tu as ~20 s avant la 1re vague : profites-en ! Pose d\'abord 2 ou 3 pondeuses sur les colonnes de gauche pour lancer ton économie de blé, et ramasse vite leurs œufs. Ajoute ensuite des lanceuses devant (à droite) pour arrêter les renards, puis étoffe : neiges pour ralentir, laser contre les gros. Garde toujours quelques pondeuses en fond pour financer la suite.' },
		{ emoji: '🦊', title: 'Vagues & méga renard', body: 'Les vagues sont de plus en plus dures. Toutes les 5 vagues débarque un méga renard (parfois deux en fin de partie) qui renforce la meute : adapte tes défenses ou le poulailler tombera.' },
		{ emoji: '🏆', title: 'Défi du jour', body: 'En défi du jour, les vagues de renards sont les mêmes pour tout le monde (graine partagée). Jusqu\'à 3 essais : ton meilleur score (renards repoussés) est classé.' },
	],
	'solitaire': [
		{ emoji: '🎯', title: 'Le but', body: 'Le solitaire à billes : le plateau est plein sauf un trou. Retire les billes une à une jusqu\'à n\'en laisser qu\'une seule — au centre pour un sans-faute sur la croix.' },
		{ emoji: '🫧', title: 'Sauter', body: 'Tape une bille puis un trou vide situé deux cases plus loin, en ligne droite, avec une bille à sauter entre les deux (ou fais-la glisser). La bille survolée est retirée.' },
		{ emoji: '🧭', title: 'Croix ou triangle', body: 'Sur la croix (33 billes) les sauts sont horizontaux et verticaux. Sur le triangle (15 billes) ils suivent aussi les diagonales. Les deux se résolvent jusqu\'à une seule bille.' },
		{ emoji: '💡', title: 'Aides', body: 'Bloqué ? Annule ton dernier coup, demande un indice (il montre un coup qui garde une solution) ou recommence. Ton meilleur résultat (le moins de billes restantes) est gardé.' },
		{ emoji: '⏱️', title: 'Défi du jour', body: 'Un mini-plateau identique pour tout le monde (quelques billes seulement, la même graine partagée). Vide-le jusqu’à une seule bille le plus vite possible : ton meilleur temps entre au classement.' },
	],
	'mots-tournes': [
		{ emoji: '🎯', title: 'Le but', body: 'La grille de lettres est découpée en « serpents », un par mot d\'un même thème (ex. Fruits). Trace chaque mot pour colorer sa région : quand tous les mots sont tracés, la grille entière est pavée — c\'est gagné.' },
		{ emoji: '✏️', title: 'Tracer un mot', body: 'Pars d\'une lettre et glisse de case en case VOISINE (haut, bas, gauche, droite — jamais en diagonale) pour dessiner le chemin sinueux du mot. Dès que le tracé forme un mot du thème, il se verrouille et prend une couleur.' },
		{ emoji: '🔢', title: 'Les indices', body: 'Le thème est affiché en haut. En bas, une pastille par mot restant donne sa LONGUEUR (des points) — mais pas le mot : à toi de le deviner à partir des lettres. Les chemins ne se croisent jamais et couvrent toutes les cases.' },
		{ emoji: '🏆', title: 'Défi du jour', body: 'Même grille pour tout le monde (graine partagée). Pave-la le plus vite possible : ton meilleur temps entre au classement. Bloqué ? Annule ton dernier mot pour retenter.' },
	],
	'reussite': [
		{ emoji: '🎯', title: 'Le but', body: 'La Réussite (Klondike) : monte les quatre familles sur les fondations, de l\'As au Roi, chacune dans sa couleur (♠ ♥ ♦ ♣). Quand les 52 cartes y sont, c\'est gagné.' },
		{ emoji: '🃏', title: 'Ranger les colonnes', body: 'Dans les 7 colonnes, empile en DESCENDANT et en ALTERNANT les couleurs (un 7 rouge sur un 8 noir). Une colonne vide n\'accueille qu\'un Roi. Tu peux déplacer d\'un coup toute une suite déjà rangée.' },
		{ emoji: '👆', title: 'Tap ou glisser', body: 'Touche une carte pour l\'envoyer automatiquement à sa meilleure place (une fondation en priorité), ou fais-la glisser pour la poser où tu veux.' },
		{ emoji: '🂠', title: 'La pioche', body: 'Clique la pioche pour retourner des cartes (1 en facile, 3 en difficile). Quand elle est vide, elle se recycle — mais en difficile le nombre de passages est limité.' },
		{ emoji: '🃏', title: '3 jokers', body: 'Bloqué&nbsp;? Tu as 3 « déplacements libres » par partie. Active le Joker, choisis une carte (elle emporte celles posées dessus), puis une colonne où la poser — couleur et rang ignorés. Impossible sur les fondations : ton score reste honnête. Annuler rembourse le joker.' },
		{ emoji: '🏆', title: 'Défi du jour', body: 'Même donne pour tout le monde (graine partagée), un seul essai. Ton score = le nombre de cartes montées aux fondations, le temps départageant les ex æquo.' },
	],
	'tempo': [
		{ emoji: '🎹', title: 'Le but', body: 'Un « piano tiles » sans fin : une mélodie générée défile dans 6 colonnes (grave à gauche, aigu à droite) et ACCÉLÈRE peu à peu. Tape chaque tuile pile quand elle touche la ligne — une musique (batterie, basse, cordes) donne le tempo, cale-toi dessus.' },
		{ emoji: '👆', title: 'Contrôles', body: 'Clique/tape la colonne d\'une tuile, ou utilise les touches S D F J K L au clavier. Vise le meilleur timing : Parfait / Bien / Ok. Les tuiles allongées se MAINTIENNENT — garde la colonne enfoncée jusqu\'au bout pour un bonus qui grimpe.' },
		{ emoji: '❤️', title: 'Énergie & combos', body: 'Ton énergie (barre du haut) baisse quand tu rates et remonte quand tu enchaînes : la partie s\'arrête à zéro. Les réussites enchaînées montent un combo qui multiplie le score (jusqu\'à ×4).' },
		{ emoji: '🏆', title: 'Défi du jour', body: 'Même mélodie pour tout le monde (graine partagée). Rejoue autant que tu veux pour améliorer ton meilleur score, qui entre au classement.' },
	],
	'spectro': [
		{ emoji: '🎵', title: 'Le but', body: 'Un runner musical : une mélodie défile vers la gauche et passe sous une ligne (le « présent »). Suis le contour des notes pour marquer un maximum de points.' },
		{ emoji: '🖱️', title: 'Suivre la mélodie', body: 'Bouge la souris (ou le doigt) de haut en bas pour régler ta hauteur. Ta note sonne en continu : quand tu approches la cible, tu entends des battements qui ralentissent — pile dessus, ils disparaissent.' },
		{ emoji: '✨', title: 'Combos & rangs', body: 'Chaque note est jugée sur le temps : Parfait / Bien / Ok / Raté. Les réussites enchaînées montent un combo qui multiplie le score. En fin de morceau, tu obtiens un rang de S à D.' },
		{ emoji: '🏆', title: 'Défi du jour', body: 'Même mélodie pour tout le monde (graine partagée). Rejoue autant que tu veux pour améliorer ton meilleur score, qui entre au classement.' },
	],
	'2048': [
		{ emoji: '🎯', title: 'Le but', body: 'Fais glisser toutes les tuiles dans une direction : deux tuiles de même valeur qui se rencontrent fusionnent et s\'additionnent. Atteins la tuile 2048… puis va chercher le plus gros score !' },
		{ emoji: '🎮', title: 'Contrôles', body: 'Flèches ou ZQSD/WASD au clavier, ou glisse le doigt dans une direction sur mobile. À chaque coup, une nouvelle tuile (2 ou 4) apparaît.' },
		{ emoji: '🏆', title: 'Défi du jour', body: 'En défi du jour, les tuiles apparaissent dans le même ordre pour tout le monde (graine partagée), et tu n\'as qu\'un seul essai : ton score final est classé.' },
	],
	'mots-meles': [
		{ emoji: '🎯', title: 'Le but', body: 'Retrouve dans la grille tous les mots de la liste (un thème). Chaque mot est caché en ligne droite parmi les lettres.' },
		{ emoji: '👆', title: 'Comment jouer', body: 'Glisse le doigt (ou la souris) de la première à la dernière lettre d\'un mot pour le surligner : s\'il est dans la liste, il est validé et barré.' },
		{ emoji: '↘️', title: 'Sens & difficulté', body: 'Les mots peuvent être horizontaux, verticaux ou en diagonale, et même écrits à l\'envers dès le niveau moyen (dans les 8 sens en difficile). Chaque mot trouvé prend une couleur. Au défi du jour, même grille pour tous, le chrono départage.' },
	],
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
	'cocotte-mineuse': [
		{ emoji: '⛏️', title: 'Le but', body: 'Creuse dans le sable et ramasse les minerais : plus c\'est profond, plus c\'est précieux. Ton score = profondeur + minerais + bonus des bijoux. Objectif ultime : réunir de quoi forger la COURONNE à l\'atelier — la fabriquer remporte la partie ! Sinon la run s\'arrête quand la lampe s\'éteint… ou avant.' },
		{ emoji: '🪨', title: 'Gare à ce qui tombe', body: 'Déplace la cocotte case par case (flèches/ZQSD, glisse-doigt ou pavé tactile) ; maintiens pour avancer. Rien ne tient en l\'air : creuse sous une pierre ou une gemme et, dès que tu quittes la case, elle TREMBLE puis tombe. Une pierre OU un diamant qui te tombe dessus t\'écrase — file sur le côté pour esquiver, et mine les gemmes par le côté plutôt que par en dessous.' },
		{ emoji: '💎', title: 'Pierres & pyramides', body: 'Les pierres sont carrées : elles s\'empilent à plat. Les gemmes sont rondes : posée sur une autre gemme, une gemme roule sur un côté libre et forme des pyramides. Creuse dans une poche de diamants avec prudence, ça déferle !' },
		{ emoji: '🛠️', title: 'L\'atelier', body: 'Le bouton Atelier met en pause (la lampe brûle au ralenti). Combine 2 ressources : torche (charbon+silex, recharge la lampe), bombe (charbon+fer), étai (fer+cuivre, cale une pierre), détecteur (cuivre+cristal). Les bijoux (bague, collier) donnent un bonus de score en plus de tes minerais ; la couronne (bague+diamant) est la victoire.' },
		{ emoji: '🏆', title: 'Défi du jour', body: 'Même mine pour tout le monde (graine partagée). Jusqu\'à 10 essais : ton meilleur score de la journée est classé.' },
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
	luge: [
		{ emoji: '🛷', title: 'Le but', body: 'Dévale une montagne enneigée en luge. Chaque mètre rapporte des points multipliés par ta vitesse (le ×N affiché suit ton compteur, jusqu\'à ×2,5) : rester lancé paie, se traîner après un crash ne rapporte presque rien. Ramasse les étoiles dorées (+5) et les anneaux bleus (boost) posés sur la trajectoire idéale.' },
		{ emoji: '🎮', title: 'Contrôles', body: 'La luge fonce toute seule — tu diriges seulement à gauche/droite avec les flèches / Q-D, ou les deux gros boutons tactiles. Évite les sapins et les rochers : chaque choc coûte une vie (3 vies) et casse ta vitesse. Tu peux mordre sur les berges de neige pour esquiver — ça freine un peu et la pente te ramène sur la piste.' },
		{ emoji: '❄️', title: 'Sections spéciales', body: 'Aux bifurcations, choisis ton côté (foncer dans le séparateur = crash !) : la rampe de surf surélevée file plus vite et rapporte +50 points et un boost, mais la luge glisse sur le flanc et c\'est un numéro d\'équilibriste — touche gauche/droite pour rester droit, si ça penche trop la luge tombe. Sur les tremplins, garde de l\'élan pour franchir la fosse — trop lent, tu t\'écrases dedans. Dans les grottes, le sol glisse et des stalagmites barrent le passage — grimpe sur les parois pour les éviter. Et dans les pistes de bobsleigh gelées, plus tu carves haut dans les virages, plus tu vas vite.' },
		{ emoji: '🏆', title: 'Défi du jour', body: 'En défi du jour, la descente est identique pour tout le monde et c\'est le meilleur score qui compte. Jusqu\'à 10 essais : seul ton meilleur score de la journée est envoyé au classement.' },
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
