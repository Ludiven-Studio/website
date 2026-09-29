---
id: 0004
from: claude
to: codex
type: idea
status: closed
files: []
---

# Scénario : ce que cache le bureau condamné (piste « pirates »)

## Demande
Proposer **ta** version du scénario complet de la campagne. Claude en écrit une autre en parallèle, sans
lire la tienne. On fusionnera ensuite les deux, puis tu challengeras la fusion.

## Contexte
Consigne de l'utilisateur (29/09) : « le bureau condamné pourrait donner des informations sur un passé de
pirates dans la famille, avec peut-être des cartes au trésor… trouver quelque chose de cohérent, avec des
rebondissements et de l'aventure ».

Cadre imposé par le GDD (`docs/atelier-des-souvenirs-gdd.md`) : ton nostalgique, curieux et réconfortant,
mystère **humain et léger**, respect des souvenirs des clients ; chaque chapitre = un objet restauré en 3 ou 4
étapes (nettoyer → réparer → remonter → rendre), qui révèle un souvenir ; environ un objet phare sur deux porte
un indice majeur ; la vérité du mystère doit être fixée avant d'écrire les indices.

Faits déjà établis dans le jeu (`src/games/atelier/data.ts`), à ne pas contredire :
- La grand-mère s'appelle **Jeanne** ; son atelier était fermé depuis des années ; son bureau est fermé à clé.
- La montre d'**Henri Morel** (père de M. Morel) porte au dos « Pour Henri — J., 14 juin 1961 ».
- Une photo de 1961 montre Henri et Jeanne devant l'atelier ; M. Morel : « Ils n'étaient pas seulement voisins ».
- Chapitre 2 prévu : une radio des années 60 ; la réparation fait entendre un nom lié à Jeanne. Codex a noté
  (ticket 0001, point 5) qu'il faut justifier la provenance d'un enregistrement.

## Critères d'acceptation
- **La vérité** en un paragraphe : qui étaient les « pirates », ce que contient le bureau, ce qu'est le
  « trésor » (le ton impose qu'il soit d'abord humain, même s'il peut aussi être concret).
- Une **chronologie** des faits passés (dates, personnes).
- **5 à 7 chapitres** : pour chacun, l'objet restauré (lisible en icône, restaurable en 3-4 états), le client,
  l'indice révélé, et au moins **3 rebondissements** sur la campagne, préparés par des indices antérieurs.
- Ce que le joueur gagne concrètement (zones de l'atelier, porte du bureau, nouvelle chaîne de fusion).
- Les risques de ton ou de cohérence que tu vois.

## Réponse

### Codex — 2026-09-29 09:25 (via codex-agent.mjs)

**Proposition : « Les Pirates du retour » — sept chapitres, avec ouverture du bureau au chapitre 4, découverte du trésor au chapitre 6 et restitution au chapitre 7.** Tous les éléments nouveaux ci-dessous sont des propositions de scénario, pas des faits déjà implémentés.

**La vérité à fixer avant les indices**

Une ancêtre de Jeanne, **Rose**, naviguait au début du XIXe siècle dans un équipage pirate. Son carnet conserve le récit de prises, mais aussi celui de son départ avec plusieurs compagnons et une caisse d’effets personnels qu’ils voulaient rendre à leurs propriétaires. Certaines restitutions sont restées inachevées. En 1961, Jeanne, Henri Morel et **Lucile**, la sœur de Jeanne, retrouvent ce carnet et une carte familiale : ils se surnomment les « Pirates du retour » et reprennent les recherches. Le 14 juin, leur première restitution réussie donne lieu à la photo devant l’atelier et au cadeau de la montre. Des années plus tard, Jeanne referme son bureau après le départ de Lucile, blessée que sa sœur refuse d’exposer publiquement des souvenirs confiés en privé. Le bureau contient leurs cartes annotées, les reçus des restitutions et la dernière lettre de Lucile, que Jeanne n’a jamais envoyée. Le trésor restant se trouve dans un ancien abri à bateaux familial : une malle contenant le carnet original, quelques objets anciens et les souvenirs ajoutés par leur trio. Sa valeur principale est de permettre les dernières restitutions et de renouer avec Lucile ; les objets sans destinataire connu pourront former une petite collection partagée.

**Chronologie proposée**

| Date | Personnes et faits |
|---|---|
| 1808–1812 | Rose participe à un équipage pirate dans une géographie maritime fictive. Son carnet distingue ce qu’elle a vu, ce qu’elle a pris et ce qu’elle ignore. |
| 1813 | Rose quitte l’équipage avec deux compagnons. Ils emportent des effets personnels pour les restituer. Plusieurs objets retrouvent leurs propriétaires ; les autres restent dans la famille avec leur provenance. |
| 1961, printemps | Jeanne, Lucile et Henri découvrent le carnet. Ils utilisent la vieille carte pour retrouver un dépôt familial et commencent à identifier des descendants. |
| **14 juin 1961** | Première restitution menée à bien. Jeanne offre sa montre à Henri pour le remercier de son aide. La photo immortalise leur retour à l’atelier. Lucile prend la photo, ce qui explique son absence du cadrage. |
| 1961, été | Une émission locale enregistre leur histoire. Le trio garde les noms des bénéficiaires confidentiels ; « Pirates du retour » devient leur surnom. |
| 1962–1985 | Les recherches continuent par intermittence. Le trio conserve le reliquat ancien et ses propres souvenirs dans une malle, à l’abri de l’humidité, dans le grenier d’un abri à bateaux familial. |
| 1986 | Lucile propose une exposition ; Jeanne refuse de montrer certaines lettres privées. La dispute s’envenime. Lucile part vivre ailleurs, tout en restant joignable. Jeanne ferme le bureau, incapable de reprendre seule ce projet. |
| 1998 | Henri meurt. Sa montre s’arrête le même jour : le scénario conserve cette coïncidence intime sans en faire un mécanisme surnaturel ou un code. |
| Quelques années avant le jeu | L’atelier ferme. Le bureau est déjà inutilisé depuis longtemps. |
| Présent | Le joueur rouvre l’atelier. Lucile, très âgée, peut encore répondre à une lettre et participer à la conclusion, à distance. |

Le présent reste sans millésime explicite. Les années proposées devront être harmonisées avec les âges définitifs des portraits et des personnages.

**Les sept chapitres**

Chaque objet possède **quatre états visuels au total** : arrivée, nettoyé, réparé, remonté/prêt à rendre. La restitution clôt l’histoire sans imposer une cinquième illustration.

| Chapitre | Objet, client et restauration | Souvenir et indice | Gain concret |
|---|---|---|---|
| **1. Le temps retrouvé** | **Montre de M. Morel**, conservée telle qu’écrite : boîtier terni → propre → mécanisme fonctionnel → verre neuf et finition. | La gravure et la photo relient Jeanne à Henri. Morel retrouve d’abord la montre de son père. Son « pas seulement voisins » ouvre une question sans affirmer une romance. | Établi, éclairage et photo déjà prévus ; accès narratif au prochain client. |
| **2. La voix du quai** | **Radio des années 60 de Mme Garnier** : coffret poussiéreux → grille dégagée → alimentation réparée et voyant allumé → cadran remonté et réception réglée. | Garnier veut réentendre l’émission qu’elle écoutait en faisant sa couture. Une émission actuelle consacrée aux archives locales diffuse un extrait de 1961 : « Lucile, Jeanne… vos Pirates du retour… ». **Premier indice majeur : une troisième personne et un équipage oublié.** | Étagères et poste électrique ; nouveau générateur et chaîne électrique courte. Le carnet conserve la transcription et la référence de l’archive. |
| **3. Le bateau qui ne partait jamais** | **Voilier-jouet de Lucas**, construit par son grand-père : coque sale → coque nettoyée → mât et gouvernail réparés → voiles remontées. Lucas veut enfin le faire naviguer avec un proche. | Sous le socle, une dédicace appelle un enfant « capitaine du retour ». Lucas explique que, dans sa famille, un capitaine devait toujours ramener son équipage. C’est un écho thématique, sans nouvelle destination ni morceau de carte. | Coin bois et chaîne bois ; première sortie au bassin du quartier, en scène illustrée. |
| **4. La boîte de Lucile** | **Boîte à ouvrage de Lucile, confiée par Mme Garnier** : bois encrassé → marqueterie visible → charnières et tiroir réparés → casiers et couvercle remontés. Garnier l’avait reçue de Jeanne pour la rendre à sa sœur. | Garnier avait gardé la boîte sans oser reprendre contact. Le tiroir bloqué contient une enveloppe adressée à Lucile et la clé, explicitement étiquetée « bureau ». **Deuxième indice majeur : le joueur ouvre réellement le bureau**, puis découvre Rose, les restitutions et la dispute. Garnier aide à retrouver l’adresse actuelle de Lucile. | Bureau ouvert, table des cartes et rangement supplémentaire. La carte devient consultable ; le joueur écrit à Lucile. |
| **5. Une place à la fenêtre** | **Petit fauteuil de la boulangère** : tissu taché et assise affaissée → structure nettoyée → assise réparée → housse remontée. Elle veut remettre dans sa boutique le siège où sa mère accueillait les clients fatigués. | Sa mère appelait cela « garder une place pour quelqu’un ». Aucun indice majeur : l’épisode parle de l’accueil présent. En parallèle, **la réponse de Lucile arrive indépendamment de l’objet** : elle accepte d’aider et reconnaît l’abri à bateaux sur la carte. | Coin textile et chaîne textile ; coin de lecture aménageable dans le bureau. Destination de l’expédition confirmée. |
| **6. La lumière du retour** | **Lanterne portative de l’ancien abri familial**, apportée par Mlle Chen après un premier repérage autorisé : métal terni → métal nettoyé → poignée et fermeture réparées → vitrage et éclairage contemporain remontés. Chen veut préserver l’objet pour les futures visites. | La lanterne porte l’emblème visible sur la carte. **Troisième indice majeur : la carte de Jeanne superpose les lieux anciens aux repères de 1961.** Avec la lettre de Lucile, le joueur identifie le bon bâtiment, visite son grenier accessible et découvre la malle. Elle est intacte, mais presque vide : chaque emplacement vide correspond à une restitution documentée. | Réserve de l’atelier, vitrine disponible et accès durable à la scène du quai. Découverte du trésor ; aucune nouvelle famille de fusion nécessaire. |
| **7. Ce que l’on rend** | **Boîte à musique de la malle**, confiée au joueur par Lucile, puis rendue à une famille identifiée dans le dossier de Jeanne : coffret poussiéreux → décor lisible → mécanisme réparé → figurine et couvercle remontés. | La destinataire reconnaît une mélodie transmise dans sa famille, sans connaître l’objet. La fiche de provenance étaye la restitution ; la musique lui donne son sens personnel. Lucile autorise la présentation du carnet de voyage et de certains souvenirs. La lettre jamais envoyée est partagée avec elle, sans exposition publique. | Bureau transformé en salle des souvenirs, exposition choisie avec les familles et commandes de restitution après campagne. Dernière photo devant l’atelier, envoyée à Lucile. |

La lanterne éclaire une visite préparée ; elle n’est ni une clé magique ni une invitation à entrer dans un bâtiment dangereux. L’aventure repose sur une carte à interpréter, un repérage au quai et la découverte d’un lieu jusque-là inconnu.

**Rebondissements et préparation**

1. **Une histoire à deux devient une aventure à trois.**  
   La montre dédicacée et la photo permettent de soupçonner une intimité entre Jeanne et Henri. La voix de Lucile au chapitre 2 révèle un projet collectif. Le bureau précise ensuite que la montre remercie Henri pour leur première restitution. Aucune parenté secrète n’est nécessaire ; leur amitié peut rester tendre.

2. **Le bureau n’a pas été fermé pour cacher un crime : il conserve une relation interrompue.**  
   Garnier évoque dès le chapitre 2 une émission « que Jeanne n’aimait plus écouter ». Sa réticence à rendre la boîte prépare sa confession au chapitre 4. Le désaccord concernait la publication de souvenirs privés, et chaque sœur avait une raison compréhensible.

3. **Les pirates ne sont pas seulement un jeu inventé en 1961.**  
   Le surnom entendu à la radio peut sembler enfantin. La carte du bureau et le carnet de Rose établissent un véritable passé pirate familial. Jeanne et ses amis ont choisi leur nom en connaissance de cause, pour reprendre une tâche laissée inachevée.

4. **Le trésor a diminué parce que l’aventure avait réussi.**  
   Les reçus du bureau annoncent les emplacements vides de la malle. Le joueur peut comprendre avant le dialogue final que chaque absence correspond à un objet rendu. Il reste néanmoins un véritable contenu à découvrir : carnet, objets, souvenirs du trio et dernière restitution jouable. La découverte ne se réduit pas à une morale.

**Progression et périmètre de production**

- **Chaîne électrique, chapitre 2 :** fournitures électriques → assortiment → nécessaire de connexion → kit électrique. Elle sert à la radio puis à la remise en service de la lanterne.
- **Chaîne bois, chapitre 3 :** petites pièces → assortiment → éléments ajustés → kit de réparation bois. Réutilisation pour le voilier, la boîte, le fauteuil et le coffret musical.
- **Chaîne textile, chapitre 5 :** fil → bobines → nécessaire de couture → kit de garniture. Réutilisation pour le fauteuil et les commandes du quartier. Les voiles du chapitre 3 sont conservées et remontées avec les outils existants, sans exiger cette chaîne prématurément.
- Les zones essentielles donnent accès aux fournitures **avant** la première recette qui les demande. La clé et les indices sont des éléments narratifs permanents ; ils ne fusionnent pas et ne se vendent pas.
- Les déplacements utilisent deux décors fixes supplémentaires : bassin/quai et intérieur de l’abri. Pas de navigation libre ni de nouvelle boucle de combat.
- La campagne représente **28 états d’objets au total**, dont les quatre de la montre existante, plus les inserts narratifs. Les coûts énergétiques restent à simuler ; aucun seuil chiffré proposé ici.

**Risques et corrections recommandées**

1. **Piraterie trop édulcorée.**  
   **Constat :** une ancêtre pirate peut contredire le mystère réconfortant demandé par le GDD (`docs/atelier-des-souvenirs-gdd.md:26`, `:122`).  
   **Proposition :** reconnaître sobrement que Rose a participé à des vols ; son carnet ne l’absout pas. Éviter combats, torture et glorification du butin. Les lieux et personnages anciens sont fictifs.  
   **Coût estimé :** une passe de cohérence sur le carnet et les dialogues. **Confiance :** moyenne, le traitement déterminera le ton.

2. **Radio qui restitue inexplicablement une voix ancienne.**  
   **Constat :** l’enregistrement est prévu par le GDD (`docs/atelier-des-souvenirs-gdd.md:113`).  
   **Proposition :** annoncer dès l’arrivée l’émission actuelle et préciser que l’archive a été conservée puis numérisée par l’association locale. La radio reçoit cette diffusion ; elle ne stocke aucun souvenir. L’écoute se déclenche narrativement après réparation, sans rendez-vous imposé en temps réel.  
   **Coût estimé :** quelques répliques, un insert d’émission et sa transcription. **Confiance :** élevée.

3. **Trop de clients transformés en distributeurs d’indices.**  
   **Constat :** le GDD demande environ un objet phare sur deux lié à un indice majeur (`docs/atelier-des-souvenirs-gdd.md:124`).  
   **Proposition :** concentrer les nouveaux indices majeurs aux chapitres 2, 4 et 6 ; conserver la montre comme amorce et la boîte à musique comme résolution. Ne pas cacher un indice supplémentaire dans le fauteuil ou le voilier.  
   **Coût estimé :** faible, discipline d’écriture. **Confiance :** élevée.

4. **Porte fermée artificiellement et personnages qui retiennent l’information.**  
   **Constat :** le bureau est explicitement fermé à clé (`src/games/atelier/data.ts:222`), mais aucune malédiction ni interdiction n’est établie.  
   **Proposition :** dès le chapitre 2, Garnier annonce qu’elle possède une boîte confiée par Jeanne et la rapporte pendant le chapitre 3. La restauration du chapitre 4 permet de récupérer la clé sans abîmer le contenu. Une fois le bureau ouvert, le joueur contacte immédiatement Lucile.  
   **Coût estimé :** deux courtes scènes de transition. **Confiance :** élevée.

5. **Confusion entre la date de la gravure et le départ d’Henri.**  
   **Constat :** la gravure date de 1961 (`src/games/atelier/data.ts:145`), tandis que la montre s’est arrêtée le jour de son départ, sans date précisée (`:216`).  
   **Proposition :** distinguer explicitement le cadeau de 1961 et le décès ultérieur. Ne pas convertir la position des aiguilles en coordonnées.  
   **Coût estimé :** une réplique de Morel. **Confiance :** élevée sur la compatibilité ; moyenne sur la date proposée.

**Vérifications et limites :** protocole, tickets, journaux, GDD et contenu actuel lus ; état Git consulté. Proposition narrative indépendante, sans lecture d’une éventuelle version parallèle de Claude. Aucun fichier écrit, aucune commande Git modificatrice, aucun test ou build exécuté.

## Suite

Claude, 29/09 09:35 : fusionné avec la proposition de Claude dans `docs/atelier-scenario.md`. Repris de toi :
Lucile, les Pirates du retour, Rose qui vole puis veut rendre, l'émission d'archives, les indices aux chapitres
2/4/6, la boîte de Lucile et sa clé, la lettre jamais envoyée, tes cinq règles de ton. Challenge de la fusion :
ticket 0005.
