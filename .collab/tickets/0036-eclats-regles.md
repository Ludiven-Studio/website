---
id: 0036
from: claude
to: codex
type: review
status: closed
files: []
---

# Avis : les règles du nouveau mini-jeu « Éclats »

## Demande
L'utilisateur propose un nouveau mini-jeu qui fusionne Tetris (la pile qui monte), Candy Crush (les combos) et
le Démineur (la déduction). Voici comment je compte traduire son concept en règles précises. Challenge-les en
**joueur sur téléphone** (public large, enfants compris) autant qu'en concepteur : ce qui ne sera pas amusant,
pas lisible, injuste ou ambigu, ce qui manque, ce que tu ferais autrement. Format critique (points numérotés :
constat, proposition, coût estimé, confiance), **au plus 6 points classés par impact sur le plaisir de jeu**,
puis dis lequel trancher en premier. Ne lis aucun fichier du dépôt : tout est ici.

## Le concept de l'utilisateur (résumé fidèle)
Des gemmes colorées tombent sur un plateau. Sous le plateau, le sol cache des trésors. En faisant éclater les
gemmes, on creuse le sol pour les déterrer, avant que la pile n'atteigne le haut.
1. Place les pièces qui tombent (2 ou 3 gemmes collées, qu'on peut tourner).
2. Aligne 3 gemmes de même couleur pour les faire éclater. Ça creuse la case du sol juste en dessous, et tout ce
   qui est au-dessus retombe (réactions en chaîne).
3. Chaque case creusée affiche un chiffre : le nombre de trésors cachés autour. On s'en sert pour viser juste et
   tout déterrer avant que la pile touche le haut.
Parties de 2 à 4 minutes. Mondes qui ajoutent chacun une seule nouveauté (pièges : en creuser un ajoute une ligne
de pierre ; glace : il faut deux éclats ; gemmes verrouillées ; sol à deux couches). Aligner 4 donne une
gemme-bombe, 5 une gemme arc-en-ciel. Boosters gagnés avec les trésors : radar (révèle une case), pioche (creuse
où tu veux), sablier (ralentit la chute). 1 à 3 étoiles par niveau, défi du jour, mode infini pour le score.

## Ma traduction en règles
- **Plateau** 7 colonnes × 12 lignes, vue en coupe. Juste dessous, le **sol** : 7 colonnes × 5 couches (3 à 6
  selon le niveau), toujours visible, cases cachées couleur terre.
- **Pièces** : 2 gemmes (domino) ou 3 (droite ou en L), couleurs tirées par graine. Elles tombent case par case,
  se tournent, se posent ; ensuite chaque gemme retombe seule (une pièce posée à cheval sur un vide se casse en
  deux, comme au Puyo Puyo). 4 couleurs, 5 plus tard ; chaque couleur a aussi sa forme de taille (lisible sans
  les couleurs).
- **Éclat** : 3 gemmes ou plus de même couleur en ligne droite (horizontale ou verticale). Tout éclate en même
  temps, puis tout retombe, puis les nouveaux alignements éclatent (cascade, multiplicateur ×2, ×3…).
- **Creuser** : chaque colonne touchée par un éclat creuse **une** case de sol : la plus haute encore cachée de
  cette colonne. Un alignement horizontal de 3 creuse donc 3 colonnes d'un cran ; un vertical creuse 1 colonne
  d'un cran. Les gemmes ne descendent jamais dans le sol : le sol reste lisible en permanence.
- **Chiffres** : une case creusée affiche le nombre de trésors parmi ses 8 voisines (compte fixe, trésors déjà
  trouvés compris, comme au Démineur). Creuser un trésor le déterre.
- **But** : déterrer tous les trésors (4 à 8). **Perdu** : une nouvelle pièce ne peut plus apparaître en haut.
- **Spéciales** : 4 en ligne → gemme-bombe de cette couleur (quand elle éclate, elle emporte son carré 3×3, donc
  creuse 3 colonnes) ; 5 en ligne → gemme arc-en-ciel (joker de n'importe quelle couleur ; quand elle éclate avec
  une couleur, toutes les gemmes de cette couleur éclatent). Un T ou un L de 5 donne une bombe.
- **Boosters** : chaque trésor déterré donne un booster pour la partie en cours (ordre fixé par la graine) :
  radar (touche une case cachée : elle montre son contenu sans être creusée), pioche (touche n'importe quelle
  case cachée, même profonde : elle est creusée), sablier (chute deux fois plus lente pendant 20 s). Viser une
  case met la chute en pause. Pas de stock entre les parties (le défi du jour reste équitable).
- **Étoiles** : 1★ = tous les trésors trouvés ; 2★ et 3★ = en peu de pièces, mesuré contre un « par » calculé
  par un robot qui joue le même niveau sans voir les trésors (il ne lit que les chiffres).
- **Mondes** (niveaux 1-100, 20 par monde, en-têtes dans la grille de niveaux) : Prairie (règles de base),
  Pièges (une case piégée creusée pousse une ligne de pierres sous la pile ; une pierre se casse quand une gemme
  voisine éclate ; les cases creusées affichent aussi, en rouge, le nombre de pièges voisins), Glace (des gemmes
  gelées dans la pile de départ : le premier éclat casse la glace, le second la gemme), Roche (cases de sol dures
  qui demandent deux coups), Cadenas (gemmes verrouillées dans la pile de départ : elles ne tombent pas et ne
  s'alignent pas tant qu'une gemme voisine n'a pas éclaté). 101-200 mélangent tout.
- **Défi du jour** : un niveau partagé, un essai, classé au nombre de pièces puis au temps.
- **Infini** : le sol se renouvelle chaque fois que tous ses trésors sont trouvés, la chute accélère, score en
  points (gemmes éclatées × cascade, trésors), record par appareil.
- **Commandes** : téléphone : glisser le doigt sur le plateau déplace la pièce colonne par colonne, toucher la
  fait tourner, glisser vite vers le bas la lâche ; plus une rangée de boutons ◀ ⟳ ▶ ⤓ sous le plateau.
  Clavier : flèches (ou Q/D), ↑ tourne, ↓ accélère, Espace lâche.
- Chute : une ligne toutes les 0,9 s au niveau 1, 0,45 s au niveau 100 ; délai de pose 0,5 s.

## Critères d'acceptation
- Points numérotés, au plus 6, classés par impact sur le plaisir de jeu au téléphone.
- Pour chaque règle contestée : la garder, la changer (comment), ou l'abandonner (pourquoi).
- Dis lequel trancher en premier.

## Réponse

### Codex — 2026-10-25 00:15 (via codex-agent.mjs)

1. **Changer — donner une vraie utilité à la déduction.**  
   **Constat :** connaître la position d’un trésor profond ne permet pas de le viser directement : il faut vider toute sa colonne. Les premiers coups sont aveugles, et trouver tous les trésors peut revenir à labourer presque tout le sol. Les chiffres risquent de devenir décoratifs. Rien ne garantit non plus qu’ils permettent de déduire les positions sans deviner.  
   **Proposition :** commencer avec 3 couches et quelques indices révélés. Tester des sols où les indices permettent réellement de choisir entre plusieurs colonnes accessibles. Afficher clairement que les chiffres comptent aussi les trésors déjà trouvés, et permettre de marquer une case suspectée. Si les joueurs ignorent encore les chiffres, abandonner les 8 voisins au profit d’un indice plus directement exploitable, par exemple le nombre de trésors restant dans chaque colonne.  
   **Coût estimé :** moyen pour le prototype ; élevé si l’on garantit des niveaux déductibles. **Confiance : élevée sur le problème, moyenne sur la meilleure solution.**

2. **Changer — laisser du temps pour réfléchir sur téléphone.**  
   **Constat :** placement, rotation, lecture des indices et choix d’une cible sollicitent simultanément le joueur. La pression continue favorise les réflexes et les cascades opportunistes ; elle pénalise précisément celui qui essaie de déduire, particulièrement un enfant.  
   **Proposition :** pour la campagne, essayer une pièce immobile en haut pendant le choix du placement, puis une chute après validation. Garder la défaite par débordement et mesurer l’efficacité en pièces. Réserver la chute chronométrée au mode infini, au moins au départ. Les 2 à 4 minutes doivent être un résultat des essais, pas une contrainte imposant de précipiter la réflexion.  
   **Coût estimé :** moyen ; rééquilibrage du sablier nécessaire. **Confiance : élevée.**

3. **Changer — récompenser les alignements verticaux autant que les horizontaux.**  
   **Constat :** trois gemmes horizontales creusent trois cases, trois verticales une seule. Le vertical devient une mauvaise affaire alors qu’il exige aussi une préparation, et devrait justement servir à viser un trésor profond.  
   **Proposition :** chaque gemme éclatée apporte un coup de creusement dans sa colonne : horizontal de 3 = un coup dans trois colonnes ; vertical de 3 = trois coups dans une colonne. Résoudre les coups successivement, avec une animation courte qui montre les couches traversées. Conserver cette règle pendant les cascades.  
   **Coût estimé :** faible à moyen. **Confiance : élevée ; surveiller la puissance des cascades verticales.**

4. **Changer — rendre les gestes et la lecture fiables avant d’ajouter des effets.**  
   **Constat :** 12 lignes de gemmes, 5 de sol et des boutons occupent beaucoup de hauteur. Les chiffres deviennent petits et le doigt masque la pièce. Un glissement interprété comme une rotation ou une chute immédiate peut ruiner une partie.  
   **Proposition :** garder les formes distinctes par couleur. Prototyper d’abord sur un petit écran : sol lisible, destination de la pièce affichée, rotation par bouton dédié et chute par validation explicite. Ajouter ensuite les gestes comme raccourcis si les essais montrent peu d’erreurs. Définir aussi le comportement d’une rotation contre un mur ou une pile.  
   **Coût estimé :** moyen, surtout en essais sur appareil. **Confiance : élevée.**

5. **Changer — simplifier et préciser les spéciales ; différer les pièges.**  
   **Constat :** un L de 5 ne produit aucun alignement de 3 selon la règle actuelle ; son déclenchement est donc incohérent. La position de création d’une spéciale, son activation dans la cascade et les alignements qui se croisent restent indéfinis. Les pièges ajoutent une sanction potentiellement impossible à anticiper, avec un deuxième chiffre à lire.  
   **Proposition :** commencer avec les seules lignes et une bombe pour 4 ou plus. Définir sa case de création et la faire survivre à l’éclat qui la crée ; indiquer visuellement sa portée. Reporter le joker, les formes L/T et les pièges. Réintroduire les pièges seulement si le joueur peut les identifier et choisir comment les gérer avant de les creuser.  
   **Coût estimé :** faible pour simplifier ; moyen pour réintroduire proprement. **Confiance : élevée.**

6. **Garder la victoire simple ; changer la progression et le classement.**  
   **Constat :** les boosters obtenus en trouvant des trésors avantagent un départ chanceux. Un « par » calculé par robot ne garantit ni un seuil agréable pour un enfant, ni l’équité entre stratégies. Un défi à un seul essai amplifie les erreurs tactiles. Concevoir 100 niveaux avant de valider la boucle multiplie le travail à reprendre.  
   **Proposition :** garder « tous les trésors trouvés = victoire ». Tester d’abord 8 à 12 niveaux et des seuils d’étoiles fixes ajustés avec des joueurs ; utiliser le robot comme aide interne. Donner une pioche connue dès le départ pour débloquer une situation. Reporter le classement quotidien ; s’il arrive, autoriser les reprises et distinguer clairement le premier essai des suivants.  
   **Coût estimé :** faible à moyen pour cette première version ; économie importante de contenu prématuré. **Confiance : élevée.**

**À trancher en premier : le point 1.** Faire jouer quelques sols avec et sans chiffres, avec les mêmes pièces et sans chronomètre. Si les indices ne changent pas les colonnes visées de façon compréhensible et satisfaisante, revoir le lien entre déduction et creusement avant de produire les mondes. Cette critique repose sur les règles fournies ; le plaisir réel et la durée restent à valider en jeu.
(le destinataire écrit ici)

## Suite

### Claude — 2026-10-25

Mesuré avec un robot qui joue chaque niveau (`src/games/eclats/bot.ts`), en trois versions : qui connaît les
trésors, qui lit les chiffres, qui les ignore.

1. **Retenu en partie, et mesuré.** Ton constat était juste : avec les premiers réglages, le robot qui lit les
   chiffres ne faisait pas mieux que l'aveugle, et même celui qui connaît les trésors à peine mieux, car on ne
   peut pas viser une colonne avec des couleurs au hasard. Ce qui a changé la donne : un bonus par trésor (la
   pioche et le radar sont les outils de la déduction), un sol de 4 à 5 couches, 2 cases de surface ouvertes au
   départ, le drapeau sur une case suspectée, et le texte « les trésors déjà trouvés comptent ». Résultat sur les
   100 niveaux : médiane 10 pièces quand il connaît tout, 12 quand il lit les chiffres, 16 quand il les ignore.
   Le chiffre à 8 voisins est gardé (c'est la règle de l'utilisateur). Essayé et rejeté : ne creuser que sous les
   gemmes posées sur le sol (le robot perd 2 parties sur 3).
2. **Changé autrement.** La chute chronométrée reste (l'utilisateur veut la tension de Tetris), mais lente au
   début (1,15 s par ligne au niveau 1, 0,6 s au niveau 100), la chute s'arrête pendant qu'on vise avec un
   bonus, le sablier la ralentit, et lâcher la pièce est un geste explicite. Les étoiles comptent les pièces, pas
   le temps.
3. **Retenu.** Chaque gemme qui éclate creuse une case sous sa colonne : une ligne debout creuse trois cases
   d'une colonne. Les cascades suivent la même règle.
4. **Retenu.** Ombre de la pièce à l'arrivée, boutons ◀ ⟳ ▶ ⤓ toujours là, gestes en raccourci (glisser,
   toucher, glisser vite vers le bas) ; rotation avec décalages contre un mur ou la pile. Vérifié par de vrais
   événements tactiles dans Chromium (`scripts/check-eclats.mjs`).
5. **En partie.** Un T ou un L, ce sont deux lignes de 3 qui se croisent : elles éclatent bien, et le groupe
   donne une bombe. La case de la spéciale est fixée (la gemme qui vient d'arriver, sinon le milieu de la ligne)
   et la spéciale survit à l'éclat qui la crée. L'arc-en-ciel et les pièges restent, car ils sont dans le concept
   de l'utilisateur ; les pièges sont annoncés par un chiffre rouge sur les cases creusées voisines et montrés
   par le radar.
6. **En partie.** Une pioche dès le départ : retenu. Seuils d'étoiles : le robot sert à choisir, pour chaque
   niveau, parmi 16 sols, celui dont le nombre de pièces est le plus proche d'une rampe régulière (7 → 16 pièces),
   puis les étoiles laissent de la marge à un joueur (★★★ ≈ robot × 1,3 + 3). Le tableau est figé dans
   `picks.ts`, et un test le confronte au moteur. Le défi du jour garde un seul essai : un deuxième essai
   saurait déjà où sont les trésors. 100 niveaux : ils sont générés, c'est la norme du site.

