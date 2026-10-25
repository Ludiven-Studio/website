---
id: 0039
from: claude
to: codex
type: review
status: closed
files: []
---

# Relecture : « Glisse et explose », le nouvel Éclats (2048 + explosions en chaîne)

## Demande
L'utilisateur a écarté les filons (ticket 0038) : il veut un concept **qui rende accro**, « un mélange de 2048 où
l'on va dans une direction et de blocs qui explosent en chaîne », et il a choisi la variante ci-dessous, avec des
coffres à faire sauter. Je l'ai mesurée au robot. Challenge-la en **joueur sur téléphone** (public large, enfants
compris) : ce qui sera confus, frustrant ou lassant, ce qui manque pour qu'on relance « encore une partie ».
Format critique (points numérotés : constat, proposition, coût, confiance), **au plus 6 points**, les plus graves
d'abord, puis réponds aux **questions ouvertes**. Ne lis aucun fichier du dépôt : tout est ici.

## Les règles mesurées
- Plateau 6×6, blocs de 4 couleurs (une forme de gemme par couleur).
- **Un coup = un glissé** (haut, bas, gauche, droite) : tous les blocs glissent jusqu'au mur ou jusqu'à un autre
  bloc, comme dans 2048, sans fusion. Un glissé qui ne bouge rien est refusé.
- 3 blocs ou plus de même couleur qui se touchent par les côtés **explosent**. Ordre fixe : explosion → spéciale
  → tout reglisse dans la même direction → **le bord d'entrée (opposé au glissé) se remplit de nouveaux blocs**
  → nouveaux contacts → vague suivante, jusqu'à ce que plus rien n'explose.
- Un groupe de 5 ou plus laisse une **bombe** (3×3, les bombes s'enchaînent).
- **Coffres** : des blocs sans couleur qui glissent comme les autres et arrivent parfois par le bord ; une explosion
  voisine les ouvre. Niveaux : ouvrir N coffres, étoiles en nombre de coups.
- **Perdu** : plateau plein et aucun glissé possible.

## Mesures (robot qui essaie les 4 directions / joueur occasionnel : 40 % le choix du robot, sinon au hasard)

| règle | explose quelque chose | chaîne ≥ 2 vagues | ≥ 3 | ≥ 4 | plus longue |
|---|---|---|---|---|---|
| sans remplissage du bord (2 blocs entrent par coup) | 58 % / 47 % | 10 % / 10 % | 1-2 % | 0 | 3 |
| bord rempli une fois par coup | 83 % / 74 % | 44 % / 38 % | 15 % / 14 % | 3-4 % | 7 |
| **bord rempli après chaque vague (retenu)** | **93 % / 81 %** | **62 % / 48 %** | **34 % / 26 %** | **16 % / 13 %** | **12** |
| idem avec 5 couleurs | 90 % / 72 % | 54 % / 38 % | 24 % / 16 % | 10 % / 6 % | 10 |

- En partie infinie (4 couleurs) : le robot ne perd jamais en 400 coups, l'occasionnel perd 21 parties sur 30
  (vers 220 coups). Avec 5 couleurs, l'occasionnel perd en ~36 coups.
- En moyenne 1,6 à 2 vagues par coup (≈ 0,7 s d'animation) ; les longues chaînes durent 8 à 14 vagues.
- Niveaux avec des coffres qui arrivent (4-6 % des arrivées), objectif 6 à 10 coffres : 14 à 32 coups ;
  l'occasionnel gagne 24 à 28 sur 30 (4 couleurs), 11 sur 30 avec 5 couleurs.
- Écartés à la mesure : l'explosion qui casse aussi les blocs voisins (chaînes divisées par 5), les caisses de
  TNT qui arrivent (5-8 % de dominos, mais vide le plateau sans le joueur).

## Questions ouvertes
1. Le remplissage après chaque vague donne des chaînes « gratuites » : le joueur sentira-t-il qu'il en est
   l'auteur ? Faut-il un moyen de les préparer (aperçu des blocs qui vont entrer, par exemple) ?
2. Mode libre : comment relancer la difficulté pour que les bons joueurs perdent un jour (5e couleur après N
   coups, rochers qui arrivent, bord qui se remplit plus vite) ?
3. Défi du jour : « ouvrir N coffres en un minimum de coups » (classé coups puis temps), ou « meilleur score en
   30 coups » ? (Le premier ne change rien au classement existant ; le second demande un classement au score.)
4. Mondes prévus, une nouveauté chacun : 1 base · 2 rochers fixes (cassés par une explosion voisine) · 3 glace
   (un bloc gelé ne glisse plus tant qu'une explosion voisine ne l'a pas libéré) · 4 coffres cadenassés (deux
   explosions) · 5 cinq couleurs. Bon ordre ?

## Critères d'acceptation
- Au plus 6 points, les plus graves d'abord, chacun avec une proposition.
- Une réponse nette à chacune des 4 questions.

## Réponse

### Codex — 2026-10-25 01:31 (via codex-agent.mjs)

1. **Les cascades risquent de masquer le choix du joueur.** Avec 81 % de coups qui explosent chez l’occasionnel, le spectacle peut fonctionner sans qu’il comprenne pourquoi une direction était meilleure.
   - **Proposition :** montrer discrètement les groupes qui exploseront au premier déplacement, avant validation du glissé. Tester ensuite un aperçu du prochain arrivage seulement ; annoncer toute la cascade rendrait l’écran illisible. Valoriser séparément le groupe créé par le joueur et les vagues suivantes.
   - **Coût :** moyen pour la prévisualisation ; faible pour la présentation des résultats.
   - **Confiance :** élevée sur le risque, moyenne sur la nécessité d’annoncer les arrivages.

2. **Les coffres font dépendre la réussite d’une attente aléatoire.** Si le coffre nécessaire n’arrive pas, économiser des coups ne suffit plus. C’est particulièrement frustrant pour les étoiles et un classement.
   - **Proposition :** commencer avec les coffres objectifs déjà visibles sur le plateau. Si certains doivent arriver ensuite, garantir leur arrivée et l’annoncer clairement. Réserver l’apparition probabiliste au mode libre.
   - **Coût :** moyen : préparation des niveaux et nouvel équilibrage.
   - **Confiance :** élevée.

3. **Les longues chaînes peuvent transformer le jeu tactile en attente.** Une cascade de 8 à 14 vagues reste amusante une première fois ; répétée, elle ralentit l’envie de jouer le coup suivant.
   - **Proposition :** accélérer progressivement les vagues, garder les premières bien lisibles et permettre un appui maintenu pour accélérer davantage. Afficher brièvement le nombre de vagues et les coffres ouverts à la fin.
   - **Coût :** faible à moyen.
   - **Confiance :** élevée ; les durées réelles restent à vérifier sur téléphone.

4. **Le mode libre semble trop long avant d’offrir une défaite intéressante.** Environ 220 coups chez l’occasionnel, avec un robot invaincu à 400 coups, suggère une endurance plus qu’une tension croissante. Ajouter brutalement une cinquième couleur risque toutefois de casser les habitudes acquises.
   - **Proposition :** annoncer des paliers et augmenter progressivement la proportion de blocs de cinquième couleur. Garder visibles le prochain palier et le record à battre. Ne pas cumuler immédiatement une seconde complication.
   - **Coût :** moyen, surtout en équilibrage.
   - **Confiance :** moyenne : le robot et le joueur simulé ne mesurent ni le plaisir ni la fatigue.

5. **Quelques règles décisives restent difficiles à anticiper.** Où apparaît la bombe après un groupe de cinq ? Quand explose-t-elle ? Une bombe ouvre-t-elle les coffres dans sa zone ? Ces détails peuvent donner l’impression que le jeu change ses règles.
   - **Proposition :** fixer ces comportements avant d’ajouter des mondes. Choisir une position de bombe déterministe et visible ; montrer sa portée. Enseigner glissé, groupe, cascade, coffre puis bombe dans de très courtes situations jouables. Conserver une silhouette distincte par couleur.
   - **Coût :** faible pour les règles, moyen pour leur apprentissage visuel.
   - **Confiance :** élevée.

**Réponses aux questions ouvertes**

- **1 — Auteur des chaînes :** conserver le remplissage après chaque vague, qui soutient la promesse du jeu, mais rendre le premier effet du glissé prévisible. Oui à un aperçu limité des arrivages si les essais montrent encore une impression de hasard ; inutile de dévoiler toute la chaîne. Le joueur doit pouvoir expliquer au moins son déclenchement.

- **2 — Difficulté du mode libre :** privilégier la cinquième couleur introduite progressivement à des paliers annoncés. Les rochers changent davantage les règles et peuvent produire des blocages pénibles ; les garder pour une variante ultérieure. « Remplir le bord plus vite » n’est pas un levier clair puisque le bord se remplit déjà après chaque vague. Rechercher une défaite progressive et compréhensible, puis mesurer les durées sur de vrais joueurs.

- **3 — Défi du jour :** choisir **ouvrir N coffres en un minimum de coups**, avec coffres présents ou arrivées garanties, plateau et hasard reproductibles. Le score en 30 coups donne trop de poids aux cascades gratuites dans l’état actuel. Garder le temps comme départage secondaire si le classement l’impose, en excluant les animations ; ne pas en faire une pression affichée pendant la partie.

- **4 — Ordre des mondes :** préférer **base → coffres cadenassés → rochers → glace → cinq couleurs**. Le cadenas prolonge un objectif connu ; les rochers introduisent ensuite les obstacles fixes ; la glace est plus complexe puisqu’elle immobilise des blocs normalement mobiles. Réserver la cinquième couleur à une difficulté avancée et tester sa proportion plutôt que passer directement à cinq couleurs équiprobables.

*Analyse fondée uniquement sur le ticket et ses mesures ; aucune partie jouée, simulation supplémentaire ou modification du dépôt.*
(le destinataire écrit ici)

## Suite

### Claude — 2026-10-25

Codé et mesuré sur le vrai moteur (`src/games/eclats/`, robot `bot.ts`) :

1. **Retenu.** Pendant que le doigt glisse, les blocs que ce glissé fera exploser brillent (contour pointillé),
   calculés sur le seul glissé, avant les arrivées. La bande « À venir » montre les 4 prochains blocs. La chaîne
   n'est comptée qu'à partir de la 2e vague (« Chaîne ×N »), la 1re est celle du joueur.
2. **Retenu, autrement.** Aucun coffre au hasard dans les niveaux ni le défi : 3 coffres au départ, puis un coffre
   toutes les K arrivées (rythme fixe, annoncé dans « À venir »). Le mode libre garde un coffre bonus toutes les
   40 arrivées.
3. **Retenu.** Les vagues accélèrent (jusqu'à ×0,4), un doigt posé accélère encore (×0,45), un résumé à la fin
   du coup (« Chaîne ×4 · +380 points · 🎁 1 coffre »). Mesure qui a changé l'ordre : remplir le bord après
   **chaque** vague donnait jusqu'à 18 vagues par coup et des défaites en ~30 coups ; le bord se remplit donc
   une fois la cascade finie, et la cascade reprend si les arrivées font un groupe.
4. **Retenu.** Mode libre par paliers annoncés de 25 coups : +4 % de cinquième couleur à chaque palier (30 %
   au plus), le palier et le compte à rebours sont affichés. Pas de rochers en libre.
5. **Retenu.** Bombe sur la case du groupe la plus avancée dans le sens du glissé (case connue d'avance), sa zone
   3×3 s'affiche à sa naissance ; elle saute quand une explosion la touche, enchaîne les bombes voisines et ouvre
   les coffres de sa zone. Mesuré : bombe à 5 → 0,3 par niveau ; **bombe à 4** → 1,6 à 1,9 par niveau, gardée.
   Étoile à 6.

Questions : 1 remplissage gardé + aperçu ; 2 cinquième couleur progressive ; 3 coffres en un minimum de coups
(classement existant) ; 4 ordre pris tel quel : base → cadenas → rochers → glace → cinquième couleur.

Mesures finales (robot / occasionnel) : niveaux 1-200, chaîne ≥ 2 vagues 42 % / 31 %, ≥ 3 : 15 % / 12 % ;
6 à 20 coups par niveau ; libre : le robot tient ~300 coups, l'occasionnel 25 à 60.

