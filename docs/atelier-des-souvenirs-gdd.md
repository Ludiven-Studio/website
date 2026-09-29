# L’Atelier des Souvenirs — document de game design

**Version :** 0.1 · 28 septembre 2026  
**Statut :** concept et hypothèses de prototype  
**Plateforme cible :** mobile iOS / Android · portrait · Unity  
**Genre :** merge-2, restauration d’objets, progression narrative  
**Titre anglais provisoire :** *The Forgotten Workshop*

> **Promesse :** « Réparez les objets auxquels les gens tiennent. Chaque restauration révèle une histoire, et certaines éclairent le mystère de votre grand-mère. »

## 1. Vision

Le joueur hérite de l’atelier fermé de sa grand-mère. Des habitants lui confient des objets abîmés. Il produit et fusionne des fournitures sur un plateau, honore des commandes, restaure visuellement les objets et réaménage l’atelier. Des souvenirs personnels et des indices laissés par la grand-mère relient peu à peu les clients à une intrigue centrale.

Le cœur du jeu doit offrir trois satisfactions à un rythme régulier : **fusionner** un objet de niveau supérieur, **voir** une restauration concrète, **découvrir** un détail de l’histoire. L’atelier et les objets finis sont les traces durables de la progression.

### Piliers

1. **Un résultat visible.** Une commande importante modifie un objet en plusieurs étapes illustrées ; l’objet peut ensuite être exposé dans l’atelier ou remis au client.
2. **Des histoires courtes et humaines.** Chaque objet mémorable possède un propriétaire, un souvenir et une petite révélation, sans exiger de longs dialogues.
3. **Une économie de merge lisible.** Le joueur sait de quel générateur provient l’objet demandé et comprend le prochain palier de fusion.
4. **Une production réaliste pour un petit studio.** Interface 2D, personnages illustrés, variations d’état d’un même objet et contenu piloté par données. La profondeur vient des chaînes, des commandes et des récits, pas d’un grand monde 3D.

## 2. Public et positionnement

Public visé : amateurs de merge-2 mobile et de jeux de décoration ou de récits chaleureux. Ton : nostalgique, curieux et réconfortant, avec un mystère léger. Direction artistique : objets stylisés, volumineux et lisibles en petite taille ; atelier chaleureux, poussiéreux au départ puis lumineux. Éviter une imitation de personnages, d’interface, de noms ou d’assets d’un jeu existant.

**Différence proposée :** chaque chaîne aboutit à un geste de réparation identifiable et à une transformation avant/après. La décoration concerne surtout l’atelier et la présentation des objets restaurés ; elle ne remplace pas leur histoire.

## 3. Boucle de jeu

1. Un client présente son objet et ses besoins : par exemple une montre bloquée, une vitre rayée et un bracelet usé.
2. Le joueur touche des générateurs, dépense de l’énergie et reçoit des objets de faible niveau sur la grille.
3. Il fusionne deux objets identiques de même niveau pour obtenir le niveau suivant ; il gère la place disponible.
4. Il livre les objets exacts d’une commande. Celle-ci donne des pièces, de la réputation et, pour une commande narrative, une étape de restauration.
5. Une courte séquence montre l’état de l’objet changer. Un échange avec le client révèle un souvenir ou un indice.
6. Le joueur dépense des pièces pour débloquer une zone, améliorer l’atelier ou présenter un objet terminé ; les nouvelles zones ouvrent des chaînes et des clients.

**Session cible à tester :** 3 à 8 minutes pour remplir une ou deux commandes courtes et avancer vers une restauration. Le jeu sauvegarde après chaque action afin que la session puisse s’arrêter immédiatement.

## 4. Plateau et interactions

| Élément | Règle initiale proposée |
| --- | --- |
| Grille | 7 × 9 cases, à valider sur petit écran ; quelques cases occupées au départ. |
| Fusion | Glisser un objet sur le même type et le même niveau : 2 objets deviennent 1 objet de niveau supérieur. |
| Déplacement | Glisser vers une case libre. Déposer sur un autre type échange éventuellement les cases, selon le résultat des tests d’ergonomie. |
| Générateur | Toucher pour produire un objet dans une case libre ; coût indicatif : 1 énergie par objet. |
| Plateau plein | Aucune production possible ; explication visible, avec possibilité de fusionner, ranger ou vendre. |
| Inventaire | Quelques emplacements déblocables par progression ; conserver le choix stratégique de l’espace sans bloquer le débutant. |
| Annulation | Annuler au moins la dernière vente pendant quelques secondes ; protection contre la vente d’un objet rare ou demandé. |
| Lisibilité | Un appui affiche la chaîne, le niveau, la source et les commandes concernées. Les objets livrables sont signalés. |

**Invariant de fusion :** deux exemplaires du même `itemId` et du même niveau deviennent exactement un objet défini par `nextItemId`. Une recette de restauration n’est pas une fusion sur le plateau : elle consomme les objets livrés via l’interface de commande. Cette séparation évite de confondre merge-2 et assemblage de pièces différentes.

### Générateurs et chaînes de départ

Les chaînes ci-dessous sont des exemples de progression visuelle, **pas** des nomenclatures définitives. Un outil avancé ne doit pas apparaître inexplicablement en fusionnant deux outils sans lien : les icônes et noms doivent évoquer un équipement de valeur ou de complexité croissante.

| Générateur | Chaîne illustrative | Usage narratif |
| --- | --- | --- |
| Boîte à outils | petit tournevis → set de tournevis → trousse d’outils → kit de précision | Réparation générale, horlogerie. |
| Tiroir mécanique | vis → lot de vis → ressort → mécanisme → mouvement d’horloge | Montres, radios, boîtes à musique. |
| Établi bois | chute de bois → planche → pièce taillée → cadre → structure assemblée | Meubles, jouets, cadres. |
| Boîte de couture | fil → bobine → pièce de tissu → rembourrage → kit textile | Peluches, fauteuils. |
| Armoire à finitions | chiffon → nettoyant → cire → vernis → kit de finition | Nettoyage et dernières étapes. |

**V1 :** commencer avec 2 générateurs et 2 chaînes de 5 à 7 niveaux. Ajouter textile, bois et finitions seulement si le plateau et les commandes restent compréhensibles.

### Comportement des générateurs

- Un générateur a une table de sorties et un stock de charges. Il peut produire plusieurs chaînes si l’interface indique clairement les probabilités ou au minimum les familles possibles.
- Une fois ses charges épuisées, il se recharge avec le temps ; le temps court même lorsque l’application est fermée.
- Les générateurs peuvent être améliorés avec des pièces ou des fragments, mais cette mécanique reste hors du tout premier prototype.
- Un générateur ne consomme pas d’énergie et ne déclenche pas de cooldown si le plateau est plein ou si l’action échoue.

## 5. Commandes et restauration

Trois types de commandes structurent le rythme :

| Type | Exemple | Récompense / rôle |
| --- | --- | --- |
| Commande courte | Fournir un kit de nettoyage. | Pièces et réputation ; objectif rapide. |
| Étape d’objet | Fournir un kit de précision et un ressort. | Change visuellement l’objet : démonté → réparé. |
| Final d’histoire | Fournir le dernier élément d’une restauration. | Animation avant/après, scène client, indice, nouvelle zone éventuelle. |

Chaque objet phare possède une fiche : propriétaire, défaut, 3 ou 4 états illustrés, besoins de chaque étape, répliques brèves, récompenses et lien éventuel avec l’intrigue. Les étapes doivent décrire une opération compréhensible : **nettoyer → réparer → remonter → rendre**. Une livraison consomme les articles requis uniquement après confirmation ; les objets générateurs et les indices narratifs ne sont jamais consommés comme simples fournitures.

### Exemple complet : la montre de M. Morel

| Étape | État visible | Commande | Révélation |
| --- | --- | --- | --- |
| Arrivée | Montre ternie, verre fendu. | Aucun. | « Elle appartenait à mon père. » |
| Nettoyage | Boîtier propre, défauts visibles. | Kit de nettoyage. | Une inscription apparaît au dos. |
| Mécanisme | Cadran démonté puis aiguilles remises en mouvement. | Kit de précision + mouvement. | La date gravée correspond à une photo de l’atelier. |
| Finition | Verre et bracelet remplacés ; montre animée. | Pièce de finition + bracelet. | Le client reconnaît la grand-mère sur la photo et promet de revenir. |

Le **bracelet** doit provenir d’une chaîne textile/cuir disponible à ce moment du jeu ; pour le prototype limité à deux générateurs, remplacer cette dernière étape par une pièce issue des chaînes accessibles.

### Autres objets et potentiel de contenu

Radio des années 60, ours en peluche, appareil photo, guitare, chaise, vélo, horloge, boîte à musique, cheval à bascule. Chacun doit justifier ses chaînes de fournitures et offrir un avant/après assez fort pour être compris sans texte.

## 6. Progression de l’atelier

L’écran principal représente un atelier fixe en illustration 2D, découpé en zones : accueil, établi, étagères, coin textile, réserve, puis bureau condamné. Chaque zone a quelques améliorations visuelles distinctes. Une amélioration coûte des pièces, modifie immédiatement l’image et débloque parfois un générateur, un emplacement d’exposition ou un client.

**Ordre indicatif d’ouverture :**

1. Dégager l’établi et accueillir le premier client.
2. Restaurer la montre ; exposer la première photo trouvée.
3. Ouvrir les étagères et obtenir un second générateur.
4. Réparer la radio ; entendre un enregistrement évoquant la grand-mère.
5. Découvrir la porte condamnée de la réserve ; constituer plusieurs indices avant de l’ouvrir.

Le joueur choisit éventuellement entre 2 ou 3 styles pour certains éléments de décoration. Ce choix est cosmétique et réversible, sans impact sur les commandes. Pour la V1, un seul style par étape suffit.

## 7. Trame narrative

**Situation initiale.** Le personnage hérite de l’atelier de sa grand-mère, fermé depuis plusieurs années. Il veut le rouvrir ; les premiers clients le connaissaient et hésitent à raconter ce qui s’y passait.

**Question centrale.** Pourquoi la grand-mère avait-elle condamné son bureau, et quel lien unit les objets que les habitants rapportent ? Le mystère reste humain : elle a conservé les traces d’un événement ancien touchant le quartier. Sa nature exacte devra être écrite avant la production de la campagne, afin que les indices soient cohérents.

**Structure des épisodes.** Un objet constitue une mini-histoire autonome en 3 à 5 scènes courtes : demande, découverte pendant la réparation, restitution, retombée. Tous les objets ne portent pas un indice majeur. Une histoire principale relie environ un objet phare sur deux, pour laisser respirer la progression.

**Exemple de moment fort.** Une cliente apporte un appareil photo du voyage de Rome de 1978. Pendant la réparation, une pellicule est découverte. Une photo montre la grand-mère avec une personne inconnue. Au chapitre suivant, la réparation d’une radio fait entendre le nom de cette personne.

**Règles d’écriture.** Dialogues brefs, personnage du joueur actif, révélations préparées par des indices antérieurs, respect des souvenirs des clients. Finir les épisodes sur une question précise plutôt que multiplier les suspenses artificiels.

## 8. Économie et équilibrage

| Ressource | Entrée | Dépense | Intention |
| --- | --- | --- | --- |
| Énergie | Régénération temporelle, récompenses de chapitre | Production des générateurs | Cadence des sessions. |
| Pièces | Commandes | Réparations de l’atelier, inventaire | Progression visible. |
| Réputation | Commandes et objets rendus | Seuils de déblocage, sans consommation | Marque la confiance des habitants. |
| Gemmes (après validation du jeu) | Succès, achat éventuel | Confort, énergie, accélération | Monétisation éventuelle ; absentes du prototype. |

**Valeurs de départ pour test, non promesses d’équilibrage :** 60 énergies au lancement ; 1 énergie par production ; régénération d’1 énergie toutes les 2 minutes ; 8 à 12 charges par générateur avant une courte recharge ; 2 commandes courtes visibles plus 1 commande d’histoire. Éviter de demander un objet de haut niveau tant que son coût moyen en énergie n’a pas été simulé et joué.

Pour une chaîne déterministe, un objet niveau `n` nécessite théoriquement `2^(n−1)` sorties de niveau 1. Avec des sorties aléatoires, de l’espace limité et plusieurs chaînes, le coût réel est supérieur. Suivre le **coût médian en énergie**, le **nombre de taps**, le **temps jusqu’à la première restauration** et les **blocages de grille**. Ajuster les demandes et récompenses à partir de ces mesures.

### Monétisation envisagée, après test de rétention

Jeu gratuit ; achats facultatifs d’énergie ou de confort et publicité récompensée volontaire (énergie, recharge ou seconde récompense clairement indiquée). Éviter une publicité imposée entre deux étapes émouvantes. Ne pas bâtir le premier prototype autour des achats : valider d’abord que la boucle et la restauration donnent envie de revenir.

## 9. Interface et parcours

**Écran atelier :** zone restaurée, objet en cours, prochain objectif, accès au plateau. Les changements du décor s’y voient immédiatement.  
**Écran merge :** grille centrale, commandes visibles en haut, énergie et inventaire accessibles, source d’un item consultable en un appui.  
**Écran restauration :** objet avant/après, étape suivante et ses fournitures, animation courte de réparation.  
**Dialogue :** portraits 2D, 1 à 3 bulles par scène, possibilité de passer et de relire les indices dans un carnet.  
**Carnet :** objets terminés, clients, photos et indices ; pas nécessaire au tout premier prototype.

Premier démarrage guidé : produire un objet, fusionner deux objets, livrer une petite commande, voir le premier changement de l’atelier. Le tutoriel laisse ensuite le joueur agir seul. Les cibles tactiles et icônes doivent rester lisibles sur téléphone compact ; les textes et tailles d’interface doivent accepter la localisation.

## 10. Direction artistique et audio

- **Objets du plateau :** silhouettes reconnaissables, couleurs distinctes par famille, détails limités aux hauts niveaux ; états « demandé » et « prêt » visibles sans dépendre uniquement de la couleur.
- **Objets restaurés :** 3 à 4 illustrations par objet phare, mêmes cadrage et proportions pour rendre la transformation frappante. Poussière, rouille et fissures disparaissent par étapes.
- **Atelier :** ambiance chaude, matériaux bois et métal, transition progressive de sombre/encombré à clair/accueillant.
- **Personnages :** portraits illustrés simples et expressifs ; réutiliser poses et expressions.
- **Sons :** fusion courte et douce, outils propres à chaque réparation, petit motif musical lors de la restitution ; options de désactivation indépendantes musique/effets.

## 11. Architecture Unity proposée

**Données séparées de l’interface :** `ItemDefinition` (identifiant stable, niveau, chaîne, prochain item, icône), `GeneratorDefinition` (sorties, charges, recharge), `OrderDefinition` (demandes, récompenses, prérequis), `RestorationDefinition` (états et étapes), `DialogueDefinition`, `WorkshopUpgradeDefinition`. Des ScriptableObjects conviennent au prototype ; une couche d’import et de validation peut être ajoutée quand le volume de contenu augmente.

**État sauvegardé :** grille par coordonnées et `itemId`, générateurs/charges/horodatages, énergie et dernier horodatage, commandes actives et progrès, pièces, réputation, zones, choix décoratifs et drapeaux narratifs. La sauvegarde doit être versionnée et migrable. Calculer les recharges à partir d’horodatages UTC, avec plafonds ; gérer une horloge appareil incohérente sans faire disparaître la progression.

**Services logiques :** `BoardService` valide déplacement/fusion/place disponible ; `GeneratorService` produit ; `OrderService` vérifie et consomme la livraison ; `ProgressionService` débloque contenus ; `SaveService` persiste après transaction. Une livraison, ses récompenses et l’étape de restauration forment une seule transaction logique pour éviter récompenses en double ou objets perdus après fermeture.

**Outils de contenu :** validation automatique des références et recettes, détecteur de chaîne sans source, simulation du coût énergétique des commandes et aperçu des étapes de restauration. Les événements analytiques utiles sont `tutorial_step`, `generator_tap`, `merge`, `order_completed`, `restoration_step`, `board_full`, `energy_empty` et `session_end`, sans données personnelles superflues.

## 12. Prototype jouable et critères de réussite

### Vertical slice recommandée

- 1 atelier avec 3 changements visuels ; 1 objet phare (la montre) et 1 client.
- Grille, déplacement/fusion, 2 générateurs, 2 chaînes, énergie, charges et recharge hors ligne.
- 3 commandes courtes et 3 étapes de restauration ; livraison avec animation avant/après.
- Sauvegarde locale robuste et tutoriel de quelques actions.
- Aucun achat, publicité, événement temporaire ou choix de décoration dans cette tranche.

**Ordre de réalisation :** données et plateau → générateurs et sauvegarde → commandes → restauration visuelle → tutoriel → équilibrage avec joueurs. Préparer d’abord les illustrations d’un seul objet fini afin de tester la promesse visuelle dès la première tranche.

### Questions à vérifier auprès de joueurs

1. Comprennent-ils sans aide comment produire, fusionner et livrer ?
2. La première transformation arrive-t-elle assez tôt pour donner envie de continuer ?
3. Reconnaissent-ils l’objet et la réparation en regardant une courte vidéo sans texte ?
4. Les commandes semblent-elles atteignables, ou la grille et l’énergie créent-elles une frustration excessive ?
5. Ont-ils envie de découvrir le client et le prochain objet, puis de revenir après une pause ?

Mesurer le temps jusqu’à première livraison/restauration, les abandons du tutoriel, les sessions avec plateau plein et les retours le lendemain. Aucun seuil chiffré de rétention n’est supposé avant un test réel.

## 13. Extension après validation

Ajouter progressivement de nouvelles familles d’objets et de matériaux, le carnet d’indices, des choix cosmétiques, des chapitres, des collections d’objets exposés et des événements limités dans le temps. Chaque ajout doit réutiliser la boucle centrale et être évalué sur son coût de production : nombre d’icônes, états d’objet, scènes, tests et équilibrage.

## 14. Risques de conception

| Risque | Réponse proposée |
| --- | --- |
| Trop d’icônes et d’histoires à produire | Réutiliser les chaînes entre objets ; produire un seul chapitre complet avant extension. |
| Commandes de hauts niveaux trop coûteuses | Simuler les coûts, introduire progressivement les niveaux et proposer plusieurs objectifs courts. |
| Plateau frustrant | Démarrage aéré, inventaire progressif, vente avec annulation, indication de la source des items. |
| Mystère décevant | Définir la réponse et la chronologie avant de rédiger les premiers indices. |
| Restauration réduite à une simple animation | Exiger des états visuels distincts liés aux fournitures réellement livrées. |
| Dépendance aux pubs pour progresser | Équilibrer d’abord la progression sans publicité ni achat. |

---

**Décision de production la plus importante :** construire une montre restaurée de bout en bout et observer si le joueur veut réparer le prochain objet. Le reste du contenu et de la monétisation dépend de cette preuve.
