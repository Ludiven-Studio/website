# L'Atelier des Souvenirs — énigmes « à la Professeur Layton »

**Statut :** fusion proposée, à valider par l'utilisateur. Deux versions écrites à l'aveugle : Claude (ci-dessous)
et Codex (réponse complète dans `.collab/tickets/0023-enigmes-layton.md`). Modèle déjà en jeu : la carte de Rose
(chapitre 6), puzzle de pièces puis énigme.

## Fusion retenue (une par saison)

| Saison | Chapitre | Énigme | Origine | Mécanique |
|---|---|---|---|---|
| 1 | 1, étape 2 | **Le mouvement de la montre** | Claude | poser 3 rouages pour que le tic-tac reparte |
| 2 | 13 | **Là où l'île regarde le port** | Codex (les deux l'ont trouvée) | tourner la longue-vue restaurée au ch. 10 jusqu'au port, toucher le rivage en face |
| 3 | 17, étape 1 | **Le couvercle du coffret** | Claude | taquin 3 × 3 ; l'image reformée (une gare) libère le billet d'avril 1962 |
| 4 | 22 | **La balance juste** | Claude | trouver le faux poids parmi 6 en deux pesées |

Validée par l'utilisateur le 02/10. **Saison 1 jouable** (`src/games/atelier/Puzzles.tsx`, `scene.puzzle` sur
l'étape ; capture : `node scripts/snap-atelier-gears.mjs`). Saisons 2 à 4 à faire.

**Étape suivante demandée** : une interaction dans **chaque** chapitre (25), pas seulement une énigme par saison.
Les quatre énigmes en restent les temps forts ; les autres chapitres auront des gestes plus courts (10-30 s),
puisés dans la réserve et dans les objets eux-mêmes. Liste chapitre par chapitre à proposer.

Pourquoi ce choix : quatre mécaniques différentes (assembler, orienter, faire coulisser, déduire), aucune ne refait
le puzzle de pièces de la carte ; la première arrive dès le chapitre 1, pour que la joueuse comprenne tout de suite
que le jeu en contient. La saison 2 est la seule idée trouvée par les deux : la phrase de Samuel était faite pour ça,
et la version Codex réutilise un objet restauré par la joueuse (la longue-vue).

**Réserve, par ordre de préférence** : le présentoir qui s'emboîte dans la valise (Codex, ch. 21 : la restauration
produit le rebondissement, mais c'est encore un assemblage) ; la toupie qu'on tourne pour trouver la bande bleue
(Codex, ch. 25 : plutôt une reconnaissance interactive, à faire pour l'émotion) ; la radio à accorder (Claude, ch. 2) ;
le casier de la tournée (Claude, ch. 24) ; la pie sous l'assise (Codex, ch. 5) ; le rabat du carnet (Codex, ch. 18) ;
le nom sur la cloche (Codex, ch. 14).

Principes : une énigme par saison pour commencer ; elle **révèle** quelque chose (jamais un mur entre deux scènes) ;
jouable au doigt en 30 s à 2 min ; l'indice est dans ce que la joueuse a déjà vu ; se tromper relance doucement,
sans perte ; un bouton « Plus tard » comme pour la carte.

## Version Claude

### 1. Saison 1 — Le mouvement de la montre (chapitre 1, étape 2 « Mécanisme »)
- **Révèle** : le tic-tac qui repart, « pour la première fois depuis des années ». C'est le premier miracle du jeu :
  le faire faire à la joueuse au lieu de le raconter.
- **Mécanique** : trois rouages à poser sur quatre axes pour relier le barillet (qui tourne) à l'aiguille. Les tailles
  doivent s'engrener ; un rouage mal placé tourne dans le vide. Glisser, déposer. Quand la chaîne est bonne, tout tourne.
- **Indice** : visuel (les dents qui se touchent) ; une relance « Ce rouage tourne, mais rien ne le suit ».
- **À dessiner** : 3 rouages + platine en SVG. **Petite.**
- **Échec** : les rouages mal placés tournent seuls ; rien d'autre.

### 2. Saison 2 — La boussole de Samuel (chapitre 11, carnet de Samuel)
- **Révèle** : où est la cloche. Le carnet dit « Élie au levant, moi au couchant… La cloche reste. Là où l'île regarde le port. »
- **Mécanique** : la carte marine du port ; tourner la rose des vents jusqu'au nord (le clocher sert de repère),
  puis toucher la crique que la pointe de l'île « regarde ». Deux temps, comme la carte de Rose.
- **Indice** : la phrase du carnet (`docs/atelier-saison2.md`, carnet de Samuel), la boussole restaurée au chapitre 8.
- **À dessiner** : carte du port + rose des vents SVG. **Moyenne.**
- **Échec** : la boussole revient au nord magnétique de travers ; relance « Samuel lisait sa carte depuis la mer ».

### 3. Saison 3 — La boîte à couture de Mme Garnier (chapitre 17, coffret à bobines)
- **Révèle** : le billet de train d'avril 1962, sous les bobines (étape 1, « Le billet »).
- **Mécanique** : taquin coulissant 3 × 3 sur le couvercle en marqueterie ; une fois l'image (une gare stylisée)
  reformée, le casier des bobines se soulève. Faire glisser les carreaux.
- **Indice** : l'image à reformer est dessinée sur le couvercle (vue avant de commencer).
- **À dessiner** : une image découpée en 9 carreaux. **Petite.**
- **Échec** : aucun ; bouton « Remélanger ».

### 4. Saison 4 — La balance de la boulangère (chapitre 22, la balance juste)
- **Révèle** : la respiration du chapitre devient un moment complice : « une balance juste, c'est un commerce honnête ».
- **Mécanique** : énigme de pesée classique : parmi 6 poids en laiton, un est faux ; le trouver en deux pesées en
  posant des poids sur les plateaux. Toucher pour poser, bouton « Peser ».
- **Indice** : de méthode, donné par la boulangère si on bloque : « Ma grand-mère commençait toujours trois contre trois. »
- **À dessiner** : balance SVG (déjà dessinée pour l'objet) + 6 poids. **Petite.**
- **Échec** : après deux pesées sans réponse, on peut recommencer.

### Réserve
- **R1. La radio (chapitre 2, étape 3)** : tourner le bouton pour caler l'aiguille sur « Mémoires du port » en suivant le
  grésillement (la forme d'onde se lisse). Petite, très tactile.
- **R2. Le casier de Mlle Chen (chapitre 24)** : ranger les quatre réparations « J. » dans les tiroirs de la tournée
  (mardi bourg, jeudi ici, samedi côte) d'après les étiquettes ; celle qui ne va nulle part est la toupie. Moyenne,
  logique pure.
