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

Validée par l'utilisateur le 02/10. **Les quatre sont jouables** (`src/games/atelier/Puzzles.tsx`, `scene.puzzle`
sur l'étape ; « Passer l'énigme » toujours possible). Emplacements réels : rouages à `morel-2` (ch. 1), longue-vue
à `mouette-3` (fin du ch. 12, juste avant la sortie vers l'îlot), taquin à `bobines-1` (ch. 17), pesée à `balance-3`
(ch. 22 ; le faux poids est choisi au fil des pesées pour qu'un coup de chance ne suffise pas). Captures :
`node scripts/snap-atelier-{gears,longuevue,taquin,pesee}.mjs`.

**Étape suivante demandée** : une interaction dans **chaque** chapitre (25), pas seulement une énigme par saison.
Les quatre énigmes en restent les temps forts ; les autres chapitres auront des gestes plus courts (10-30 s),
puisés dans la réserve et dans les objets eux-mêmes. Liste chapitre par chapitre à proposer.

## Un geste par chapitre (validé le 02/10)

**Les 20 gestes sont jouables** (02/10) : `Rub` dans `Puzzles.tsx`, les autres dans `Gestures.tsx` (slide, crank,
hold, choose, coins, place, pins, fling). Écarts avec le tableau : ch. 15, on **tire le petit tiroir** de la
travailleuse (la notice est à l'étape 1, pas de machine à coudre) ; ch. 24, les étiquettes portent un **lieu**
(le bourg, ici, la côte), jamais un nom de famille, règle des 12 personnages oblige. Étapes : `scene.puzzle` dans data.ts.
Capture générique : `node scripts/snap-atelier-gesture.mjs <id de commande>...` (ajouter le geste dans `PLAY`/`KIND`).
Noms de l'équipage gravés sur la cloche : Étienne Roussel (canon) et quatre marins sans histoire (Le Gall, Morvan,
Tanguy, Corre).

Les énigmes (ch. 1, 6, 12, 17, 22) restent les temps forts. Les 20 autres chapitres reçoivent un **geste** court
(10-30 s), sans échec possible : on fait soi-même le geste de métier que la scène raconte, et il dévoile la
révélation de l'étape. Bandeau « Geste » au lieu de « Énigme ». Pour tenir le coût, huit gestes réutilisables :
**frotter** (révéler sous la crasse), **tourner** (un bouton, une manivelle), **tenir** (le doigt appuyé),
**glisser à sa place**, **choisir** (toucher le bon élément), **tracer** (suivre un chemin), **lancer** (un geste vif),
**aligner** (des goupilles).

| Ch. | Objet · étape | Geste | Ce qu'il dévoile |
|---|---|---|---|
| 2 | Radio · régler la réception | **tourner** le bouton : le grésillement se lisse en voix | « Mémoires du port », l'archive de 1961 |
| 3 | Voilier · poncer la coque | **frotter** au crayon sur un papier posé sur le socle (frottage) | « Au capitaine du retour » |
| 4 | Boîte de Lucile · le tiroir bloqué | **choisir** le motif de marqueterie qui cache le loquet (le seul qui bouge sous le doigt) | le tiroir s'ouvre : lettre et petite clé |
| 5 | Fauteuil · sous l'assise | **choisir** la pie parmi trois marques (Codex) | le quatrième morceau de carte |
| 7 | Boîte à musique des Chen | **tourner** la manivelle (geste circulaire) | la mélodie revient, la famille Chen se souvient |
| 8 | Boussole · débloquer l'aiguille | **tourner** le boîtier jusqu'à ce que l'aiguille trouve le nord | l'aiguille repart ; le mot du couvercle |
| 9 | Fanal · rallumer la mèche | **tenir** le doigt sur la mèche jusqu'à ce qu'elle prenne | à la lueur, l'étiquette « Mouette » |
| 10 | Longue-vue · nettoyer les lentilles | **glisser** le tube jusqu'à la netteté | le port de 1962 vu par Lucile |
| 11 | Coffre du mousse · ouvrir sans forcer | **aligner** trois goupilles, une à une | le carnet de Samuel |
| 13 | Cloche · retirer le vert-de-gris | **frotter** : « L'ESPÉRANCE · 1809 », puis les noms | l'équipage, nom après nom |
| 14 | Cadre ovale · nettoyer | **frotter** le dos du cadre | « Étienne Roussel » |
| 15 | Travailleuse · garnir les casiers | **tracer** le chemin du fil dans la vieille machine | le fil passe, la machine coud ; la notice |
| 16 | Tabouret · consolider le pied | **choisir** la bonne cale pour qu'il ne boite plus | « Deux places pour quelqu'un, maintenant » |
| 18 | Carnet de Rose · recoudre la reliure | **glisser** le rabat épais (Codex) | le reçu d'Étienne Roussel, 1813 |
| 19 | Valise · remonter les fermoirs | **glisser à sa place** ce que Mme Garnier emporte (la boîte pour Lucile en dernier) | les fermoirs claquent, elle part |
| 20 | Valise-étal · remonter les charnières | **glisser** pour l'ouvrir en éventail : elle tient debout | « Elle s'ouvre et elle tient debout » |
| 21 | Présentoir · remplacer les lattes | **glisser à sa place** le présentoir dans les tasseaux (Codex) | c'était un étal |
| 23 | Caissette · la serrure | **choisir** les pièces pour faire l'appoint d'un vieux prix en francs | Mme Lemoine raconte d'où venait le lot |
| 24 | Casier · étiqueter les tiroirs | **glisser à sa place** les réparations « J. » dans les tiroirs de la tournée | la quatrième reste sans tiroir |
| 25 | Toupie · repeindre | **lancer** la toupie d'un geste vif | elle tourne longtemps, la bande bleue passe et repasse |

Coût estimé : huit composants de geste (un à deux par séance), puis un dessin SVG léger par chapitre ; les objets
eux-mêmes sont déjà dessinés en quatre états et peuvent souvent servir de support.

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
