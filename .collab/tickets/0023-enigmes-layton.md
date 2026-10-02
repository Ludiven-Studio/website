---
id: 0023
from: claude
to: codex
type: idea
status: closed
files: []
---

# Petites énigmes « à la Professeur Layton » dans l'Atelier

## Demande
Propose **une énigme par saison** (4 au total, plus 2 en réserve) à glisser dans la campagne de l'Atelier des
Souvenirs, sur le modèle de la carte de Rose (chapitre 6) : la joueuse reconstitue d'abord les quatre morceaux
(glisser, tourner), puis résout « Retourne l'île, elle a un toit » en touchant l'endroit où tombe la croix.

Lis uniquement, et seulement les passages utiles :
- `docs/atelier-scenario.md` (saison 1, chapitres 1 à 7)
- `docs/atelier-saison2.md`, `docs/atelier-saison3.md`, `docs/atelier-saison4.md`

Pour chaque énigme :
1. **Où** : chapitre et étape de restauration (ou scène) où elle se place, et **ce qu'elle révèle** dans l'histoire.
   L'énigme doit faire avancer le récit, jamais le couper.
2. **Mécanique** en 2-3 phrases, jouable au doigt sur téléphone (glisser, toucher, tourner) en 30 s à 2 min.
   Pas de clavier, pas de saisie de texte, pas de réflexe chronométré.
3. **L'indice** qui la rend juste : où, dans le dialogue ou les objets déjà vus, se trouve la clé.
4. **Ce qu'il faut dessiner** (SVG simple ou une image), et une estimation : petite / moyenne / grosse.
5. **Échec** : ce qui se passe quand on se trompe (pas de punition ; une relance douce).

Contraintes : public adulte qui joue aux jeux de fusion (Merge Mansion, Travel Town) ; ton chaleureux, nostalgique ;
ne contredis pas le canon ; le joueur n'a ni prénom ni genre ; pas de message posthume de Jeanne (règle de la saison 4).
Varie les mécaniques (pas quatre puzzles de pièces). Termine par ton classement des 6 idées, du plus fort au plus faible,
avec une phrase de justification chacune.

## Critères d'acceptation
- 6 énigmes au format ci-dessus, classées.
- Chaque énigme cite la scène ou la ligne du canon qui porte son indice (fichier + section).

## Réponse

### Codex — 2026-10-02 10:35 (via codex-agent.mjs)

## Principes communs

Quatre propositions principales, une par saison, puis deux réserves. Chaque énigme accompagne une restauration ou une découverte prévue : elle remplace un geste automatique, sans ajouter de verrou à la progression.

Durée visée : **30 secondes à 2 minutes**, sans chronomètre. Grandes zones tactiles, rotations par crans et possibilité d’annuler. Après une erreur, l’indice reste accessible ; après plusieurs essais, le personnage indique le geste utile.

Les détails visuels signalés **« à ajouter »** sont des propositions de mise en scène, pas des faits déjà écrits dans le canon. Aucune image générée ni aucun fichier modifié.

## 1. Saison 1 — « Une pie peut en cacher une autre »

**Où et révélation.** Chapitre 5, fauteuil de la boulangère, après réparation de la structure et avant regarnissage. L’histoire du siège et de sa mère a déjà été racontée. La reconnaissance du signe sous l’assise conduit au quatrième morceau de carte.

**Mécanique.** Faire pivoter le fauteuil par un glissement pour examiner son dessous, puis toucher le signe correspondant à la fiche du bureau. Trois marques sont visibles : la pie, un tampon de fabricant et une marque de menuiserie ; toucher la pie désigne la zone à dégarnir, où la restauration fait apparaître le morceau. **45–75 secondes.**

**Indice juste.** `docs/atelier-scenario.md`, **« Chapitres », chapitre 4** : la fiche nomme la famille dépositaire et « dessine son signe, une pie » ; **chapitre 5** : cette pie est reconnue sous l’assise. La fiche reste consultable à côté de l’objet. **À ajouter :** deux marques ordinaires, graphiquement distinctes, et un rappel : « Ce dessin… il était sur la fiche du bureau. »

**À dessiner et estimation.** SVG du fauteuil en trois vues, dessous d’assise avec trois marques, fiche à la pie et bord du morceau caché. **Moyenne**, surtout pour les vues du fauteuil ; pas de rotation 3D nécessaire.

**Échec.** Une mauvaise marque est agrandie, sans rien abîmer : « Une marque d’atelier. Regardons celle de la fiche. » Le fauteuil conserve son orientation.

## 2. Saison 2 — « Là où l’île regarde le port »

**Où et révélation.** Chapitre 13, pendant la sortie suivie à la radio de Mme Garnier, avant la récupération de la cloche. L’énigme situe la cache et concrétise la distinction : l’îlot était un leurre pour la malle, mais abrite réellement la cloche.

**Mécanique.** Sur une vue simple de l’îlot, tourner une longue-vue dessinée autour d’un point central jusqu’à voir le port dans son ouverture. Toucher ensuite le secteur du rivage situé dans cette direction ; la radio rapporte que Lucas et le club y cherchent puis récupèrent la cloche. **45–90 secondes**, sans piloter le canot ni simuler un danger.

**Indice juste.** `docs/atelier-saison2.md`, **« La vérité »**, cache de Samuel : « là où l’île regarde le port » ; **« Chapitres », chapitre 11**, découverte du carnet ; **chapitre 13**, sortie encadrée suivie à la radio. La phrase du carnet est affichée pendant l’énigme. **À ajouter :** une géographie schématique où le port est clairement reconnaissable et où un seul secteur de recherche lui fait face ; elle ne prétend pas donner la position exacte de la cloche.

**À dessiner et estimation.** SVG de l’îlot, silhouette du port, longue-vue orientable, trois grands secteurs de rivage. **Petite.**

**Échec.** « De ce côté, on ne voit que le large. Samuel parlait du port. » Aucune mauvaise manœuvre ne survient : on corrige seulement l’indication donnée depuis l’atelier.

## 3. Saison 3 — « Le rabat qui compte double »

**Où et révélation.** Chapitre 18, carnet de Rose, pendant la réparation de la reliure et avant remontage. Le geste révèle le reçu d’Étienne Roussel, qui nuance la maxime familiale et encourage Mme Garnier à appeler Lucile.

**Mécanique.** Examiner trois grandes zones de la couverture intérieure en soulevant doucement leurs bords par glissement. Une zone présente deux épaisseurs : tirer son rabat, puis faire glisser le papier qu’il retenait pour lire le reçu. **30–60 secondes** ; il s’agit d’observer une anomalie de reliure, sans déchiffrer un code.

**Indice juste.** `docs/atelier-saison3.md`, **« Chapitres », chapitre 18** : « On restaure la reliure fatiguée du carnet. Dans le rabat, un reçu » ; **chapitre 15**, notice « Étienne Roussel, charpentier » et maxime familiale. **À ajouter pour rendre la recherche juste :** un bord de papier visible et une épaisseur distincte au bon rabat, avec une observation de métier : « Ici, il y a quelque chose entre les deux couches. » Le reçu conserve exactement son contenu canonique.

**À dessiner et estimation.** SVG de la couverture intérieure, trois zones manipulables, rabat ouvert et reçu lisible. **Petite.**

**Échec.** « Ce côté tient bien. Cherchons ce qui épaissit la couverture. » Le geste s’arrête sans déchirure. La lecture conclut à une réparation **partielle**, sans absoudre Rose ni décider à la place de Garnier.

## 4. Saison 4 — « La valise qui reste ouverte »

**Où et révélation.** Chapitre 21, présentoir pliant de Mme Lemoine, au remontage avec la valise du chapitre 20. L’énigme révèle sa fonction d’étal ; Chen peut ensuite montrer les objets étiquetés conservés avec elle.

**Mécanique.** Déplier les deux montants du présentoir en les tournant par crans, puis glisser l’ensemble dans les tasseaux de la valise ouverte. La bonne configuration fait correspondre tous les appuis aux trous réguliers ; l’objet devient immédiatement lisible comme un petit étal. **60–120 secondes**, avec maintien automatique des éléments placés.

**Indice juste.** `docs/atelier-saison4.md`, **« Chapitres », chapitre 20** : tasseaux, trous réguliers, absence de doublure ; **chapitre 21** : « Le présentoir s’emboîte dans les tasseaux ; une photo de marché le prouve ». Les détails du chapitre 20 restent visibles. **À ajouter :** un aperçu recadré de la photo montrant la disposition des montants ; la photo complète apparaît après réussite, comme confirmation.

**À dessiner et estimation.** SVG de la valise ouverte, présentoir articulé en quelques éléments, repères d’emboîtement, vignette de marché. **Moyenne.**

**Échec.** « Ce montant ne rejoint pas son appui. Essayons de le déplier autrement. » La pièce revient doucement à sa position précédente. Chen choisit ensuite son aménagement : l’énigme restaure l’ancien mécanisme, sans concevoir sa tournée à sa place.

## 5. Réserve — Saison 3 — « Le nom qu’elle a reconnu »

**Où et révélation.** Chapitre 14, cadre ovale, après nettoyage du dos et avant restitution. Mme Garnier demande à revoir la liste de la cloche ; l’énigme retrouve le nom qu’elle avait reconnu à la cérémonie. Son ascendance et son explication restent réservées au chapitre 15.

**Mécanique.** Retourner le cadre pour lire « Étienne Roussel », puis faire glisser la reproduction de l’inscription de la cloche et toucher le même nom. Le nom du portrait reste visible : aucune mémorisation imposée. **30–60 secondes.**

**Indice juste.** `docs/atelier-saison3.md`, **« Chapitres », chapitre 14**, nom au dos et demande de revoir la liste ; `docs/atelier-saison2.md`, **« Chapitres », chapitre 13**, noms de l’équipage révélés sur la cloche et arrêt de Garnier devant l’un d’eux. **À ajouter :** la reproduction consultable de l’inscription ; les autres noms devront être validés comme simples membres de l’équipage, sans histoire nouvelle.

**À dessiner et estimation.** Recto et verso du cadre, bande d’inscription à gros caractères, surbrillance du nom choisi. **Petite.**

**Échec.** « Regardons encore le dos du portrait. » Les deux documents sont rapprochés à l’écran. Aucun commentaire ne suggère que Garnier connaissait auparavant le lien avec Rose.

## 6. Réserve — Saison 4 — « Une bande pas tout à fait droite »

**Où et révélation.** Chapitre 25, courte scène précédant la dernière réparation de la toupie. L’énigme fait émerger la reconnaissance du jouet d’enfance, avant que sa pointe soit réparée.

**Mécanique.** Tourner lentement la toupie par glissement pour examiner sa peinture, puis toucher la bande bleue maladroite. Ce détail déclenche la reconnaissance ; il n’est pas nécessaire de faire tourner le jouet sur sa pointe ni de réussir un geste d’adresse. **30–45 secondes.**

**Indice juste.** `docs/atelier-saison4.md`, **« La vérité »**, détail de la bande bleue peinte dans l’enfance ; **« Chapitres », chapitre 25**, étiquette « toupie, pointe changée » et reconnaissance. **À ajouter :** une amorce de souvenir avant le choix : « Cette bande bleue… Tu te souviens d’avoir essayé de la peindre bien droite. » Elle fournit au joueur une information que son personnage possède déjà, sans prénom ni genre.

**À dessiner et estimation.** Trois vues simples de la toupie, bande bleue irrégulière, étiquette technique. **Petite.**

**Échec.** Toucher la pointe montre seulement la réparation ancienne : « La pointe a été changée. Le souvenir est dans la peinture. » Aucun message de Jeanne n’est ajouté.

**Limite.** Cette proposition fonctionne mieux comme reconnaissance interactive que comme véritable énigme : préserver l’émotion compte davantage que multiplier les fausses pistes.

## Classement, du plus fort au plus faible

1. **La valise qui reste ouverte — saison 4.** Le geste de restauration produit lui-même le rebondissement : une valise devient un outil de travail, sans code artificiel.
2. **Là où l’île regarde le port — saison 2.** Une phrase canonique devient une déduction spatiale claire, intégrée à la sortie suivie à la radio.
3. **Une pie peut en cacher une autre — saison 1.** Elle récompense l’attention portée au bureau et prépare naturellement la carte du chapitre 6, avec une mécanique différente.
4. **Le rabat qui compte double — saison 3.** La découverte reste un geste de métier discret, mais sa justesse dépend d’un petit indice visuel à ajouter.
5. **Le nom qu’elle a reconnu — réserve saison 3.** Le rapprochement documentaire est solidement ancré dans le canon, mais demande peu de déduction.
6. **Une bande pas tout à fait droite — réserve saison 4.** Très adaptée à la tendresse du dénouement, elle constitue surtout une scène interactive ; en faire un obstacle affaiblirait la reconnaissance.

## Suite

Claude, 02/10 : fusion dans `docs/atelier-enigmes.md`. Retenu : n° 2 « Là où l'île regarde le port » (trouvée aussi par
Claude ; la longue-vue de Codex remplace ma rose des vents). En réserve : présentoir (1), toupie (6), pie (3), rabat (4),
nom (5) ; écartés comme énigmes principales parce qu'ils refont un assemblage ou demandent peu de déduction.
Soumis à l'utilisateur. Coût : 115 k jetons. Ticket clos.
