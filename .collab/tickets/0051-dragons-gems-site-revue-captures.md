---
id: 0051
from: claude
to: codex
type: review
status: closed
files: []
---

# Dragon's Gems Swipe (site) : regard critique sur les écrans du mini-jeu web

## Demande
Le mini-jeu « Dragon's Gems Swipe » de ludiven-studio.fr (`/jeux/eclats/`) est la version web de l'app mobile.
L'utilisateur me laisse la nuit pour le revoir avec toi et corriger ce qui cloche. Regarde les captures de
`.collab/out/0051/` (seulement celles-ci ; téléphone 390 × 844 sauf 16-17, bureau) :
- `01-first-visit.png` : la première visite, avec les cartes « Comment jouer » ;
- `02-level1-ready.png`, `03-level1-lesson.png` : le niveau 1 (une leçon) avant et après « Commencer » ;
- `04-chest-pops.png` : un coffre qui s'ouvre en grand et vole vers le butin ;
- `05-level-end.png` : un niveau gagné ;
- `07-level30-ready.png`, `08-level30-play.png`, `09-level30-end.png` : le niveau 30 (coups limités), perdu ;
- `11-daily-ready.png`, `12-daily-play.png` : le défi du jour ;
- `13-free-play.png`, `14-free-play-dark.png`, `15-free-end.png` : le mode libre (infini), jauge pleine, en
  clair et en sombre ; dans 15 le plateau est plein et seul le souffle de Bijou peut le débloquer ;
- `16-desktop-ready.png`, `17-desktop-play.png` : sur ordinateur.

Le jeu : on fait glisser tous les blocs d'un plateau 7 × 7 vers un bord (comme 2048) ; 3 gemmes de même couleur
qui se touchent explosent, 4 et plus fusionnent en gemmes plus fortes ; une explosion à côté d'un coffre l'ouvre et
ses pièces vont au butin ; chaque gemme détruite remplit la jauge de souffle de Bijou, le bébé dragon, qui crache
alors trois boules de feu. Pendant qu'on glisse, les blocs qui vont bouger sont tirés vers le doigt et ceux qui vont
exploser brillent. Le cadre du site (en-tête, onglets Niveaux / Défi / Libre, texte des règles sous le plateau,
bouton trophée en bas à droite) est commun à tous les mini-jeux : critique-le seulement s'il gêne ce jeu-ci.

Je veux un regard de joueur et de directeur artistique : **ce qui fait amateur, ce qui gêne la lecture ou la
compréhension, ce qui manque pour que ce soit satisfaisant et donne envie de rejouer**. Je corrige moi-même ensuite.

## Format de la réponse
- 8 à 12 points numérotés, du plus important au moins important.
- Pour chaque point : la capture, le constat, la correction proposée (concrète : taille, couleur, place, texte
  exact en français), le coût estimé (petit / moyen / gros) et ta confiance.
- Puis une ligne : les 3 corrections que tu ferais d'abord.

## Contexte
Lis seulement les PNG listés. Pas besoin d'explorer le dépôt.

## Réponse

### Codex — 2026-10-27 01:32 (via codex-agent.mjs)

Revue limitée aux captures fournies : les durées, les sons et la sensation du glissement ne sont pas évaluables. Les tailles proposées sont en pixels CSS, pour un téléphone de 390 px de large.

1. **Rendre le sauvetage du plateau impossible à manquer.**  
   **Captures :** `13`, `14`, surtout `15-free-end.png`.  
   **Constat :** en 15, le plateau est plein mais la partie reste sauvable. L’interface ressemble pourtant à un état ordinaire : « Touche Bijou ! » est loin du blocage, et le dragon ne ressemble pas clairement à un bouton.  
   **Correction :** afficher à cet instant « Plateau plein ? Bijou peut te sauver ! », puis un bouton de 44 px de haut minimum « 🔥 Lancer le souffle », directement au-dessus du plateau. Rendre également la jauge et Bijou activables. Sur ordinateur : « Lancer le souffle · Espace ». Garder la grille visible.  
   **Coût :** moyen. **Confiance :** élevée.

2. **Expliquer l’objectif avec des mots et le bon objet.**  
   **Captures :** `02`, `07`, `08`, `11`.  
   **Constat :** le cadeau « 🎁 0/9 » n’évoque pas les coffres du plateau. Au niveau 30, « ★★★ en 9 coups » concurrence « 11 coups restants » : on doit déduire la différence entre objectif, limite et bonus.  
   **Correction :** avant le départ, afficher « Ouvre 9 coffres en 11 coups maximum », puis une ligne secondaire « 3 étoiles : 9 coups ou moins ». Pendant la partie : miniature du coffre + « Coffres 0/9 » et « Coups restants 8 ». Pour le défi : « Ouvre 8 coffres », avec la fonction du chronomètre explicitée selon le classement réel.  
   **Coût :** petit. **Confiance :** élevée.

3. **Faire entrer le jeu dans le premier écran.**  
   **Captures :** `02`, `07`, `11`, `16`.  
   **Constat :** au premier affichage mobile, le plateau commence très bas ; sur ordinateur aussi, il est coupé avant le départ. Cela donne davantage l’impression d’une page à parcourir que d’un jeu prêt à lancer.  
   **Correction :** compacter localement l’espace au-dessus de ce mini-jeu : titre mobile à 24 px, marges verticales de 12–16 px, commande plein écran près du titre plutôt qu’en ligne entière. Au démarrage, cadrer automatiquement le bloc objectif–commandes–plateau. Viser un plateau entièrement visible avec ses commandes à 390 × 844.  
   **Coût :** moyen. **Confiance :** élevée.

4. **Remplacer l’entrée en matière textuelle par un premier geste guidé.**  
   **Captures :** `01`, `02`, `03`.  
   **Constat :** huit points de pagination annoncent un long tutoriel avant une leçon qui répète déjà la règle. Les trois gemmes roses encadrées ne montrent pas explicitement que **tout** le plateau bougera.  
   **Correction :** proposer d’abord « Apprendre en jouant » et « Passer ». Dans la leçon, garder « Glisse vers la gauche ← » et montrer une flèche traversant le plateau, avec les positions d’arrivée des trois roses en transparence. Après réussite : « Bien joué ! Ouvre maintenant 3 coffres. » Déplacer l’aide détaillée derrière « Comment jouer ».  
   **Coût :** moyen. **Confiance :** élevée.

5. **Réduire la taille du coffre de récompense et clarifier sa destination.**  
   **Captures :** `04`, `05`, `12`.  
   **Constat :** le gros coffre masque plusieurs cases et chevauche d’autres coffres ; l’action devient difficile à lire. Deux compteurs de pièces montrent aussi des valeurs différentes (`12` : 100 en haut, 0 sous Bijou) sans expliquer leur rôle.  
   **Correction :** limiter le coffre ouvert à environ 1,3 case, puis faire voyager uniquement les pièces vers le compteur « Butin ». Réserver au dragon un compteur explicitement nommé « Trésor », ou le masquer pendant la partie. Au résultat : « +50 pièces versées au trésor ». Viser une séquence de récompense de 500–700 ms, à ajuster en jeu.  
   **Coût :** moyen. **Confiance :** élevée sur la lisibilité ; moyenne sur le rythme.

6. **Donner une raison concrète de retenter après l’échec.**  
   **Captures :** `09-level30-end.png`.  
   **Constat :** « Échoué » et « le butin (70) est perdu » mettent surtout la sanction en avant. Les trois coups encore disponibles rendent nécessaire une explication nette de la fin.  
   **Correction :** titre « Plateau bloqué », puis « 4 coffres ouverts sur 9 · 3 coups inutilisables ». Ajouter « Astuce : garde de la place pour les nouvelles gemmes. » et une ligne secondaire « 70 pièces de butin perdues ». Bouton principal « Réessayer le niveau 30 » ; secondaire « Carte ». Vérifier que cet échec n’est prononcé qu’après exclusion d’un souffle utilisable.  
   **Coût :** petit pour la présentation ; moyen si la condition doit évoluer. **Confiance :** élevée sur le texte, moyenne sur la logique non observable.

7. **Aérer les gemmes et rendre leurs évolutions systématiques.**  
   **Captures :** `08`, `12`, `15`.  
   **Constat :** les gemmes touchent presque les voisines ; sur un plateau plein, les facettes et éclats saturent la lecture. La couronne, les scintillements et les contours ne composent pas encore une progression immédiatement évidente. Les formes différentes selon les couleurs sont en revanche à conserver.  
   **Correction :** inscrire les gemmes ordinaires dans 82–86 % de la case. Réserver les débordements aux effets temporaires. Définir trois signes constants pour les évolutions : anneau lumineux, double anneau, couronne ; les présenter dans une petite légende « Chargée · Joyau · Couronne » avec leur portée respective.  
   **Coût :** moyen. **Confiance :** élevée sur l’espacement, moyenne sur les marqueurs à tester à taille réelle.

8. **Faire de la prévision des prochaines pièces une information exploitable.**  
   **Captures :** `03`, `08`, `13`, `15`.  
   **Constat :** « À venir » suivi de quatre icônes puis « au centre » reste ambigu : ordre des coups, groupe entrant au prochain coup, emplacement ? Le cercle pointillé central n’explique pas sa relation avec cette ligne.  
   **Correction :** séparer deux groupes : « Prochaine entrée » au-dessus des quatre pièces et « Au centre » au-dessus de la pièce isolée. Pendant le glissement, montrer sur le bord concerné les emplacements d’entrée prévus, ainsi qu’un aperçu central. Ne numéroter les quatre pièces que si cet ordre correspond réellement à la mécanique.  
   **Coût :** moyen. **Confiance :** moyenne : la prévisualisation interactive existante n’est pas vérifiable sur ces images.

9. **Unifier la direction artistique autour du plateau et de Bijou.**  
   **Captures :** `13`, `14`, `16`, `17`.  
   **Constat :** les gemmes et Bijou ont une présence séduisante, mais les émojis, capsules génériques, dégradés pastel et immense décor flouté donnent une impression d’assemblage. Sur bureau, le décor rivalise avec le petit plateau. En sombre, le score violet manque de contraste.  
   **Correction :** conserver le violet pour les actions, l’or pour les récompenses et le bleu nuit pour le jeu. Utiliser les miniatures existantes de coffre et de pièce à la place des émojis correspondants. Atténuer fortement le décor derrière la zone jouable ; en sombre, passer le score à un lavande clair, par exemple `#D8B4FE`.  
   **Coût :** moyen. **Confiance :** élevée.

10. **Transformer les fins et les règles en invitations à continuer.**  
    **Captures :** `05`, `12`, `13`, `17`.  
    **Constat :** le résultat victorieux affiche des seuils mathématiques peu gratifiants ; le mode libre montre un palier sans prochaine cible visible. Le long paragraphe sous le plateau mélange toutes les mécaniques et dilue les informations utiles.  
    **Correction :** victoire : « 3 étoiles ! », puis « 3 coffres requis · 5 ouverts · 5 coups » et « +50 pièces au trésor ». En libre, afficher la condition réelle du prochain palier sous le score. Remplacer le pavé permanent par « 3 gemmes : explosion · 4 ou plus : fusion · Explosion près d’un coffre : butin », puis un accordéon « Toutes les règles ». Déplacer le bandeau de chaîne hors des cases jouables.  
    **Coût :** petit à moyen. **Confiance :** élevée.

**Les 3 corrections que je ferais d’abord :** rendre le souffle évident sur plateau plein ; expliciter coffres, limite de coups et étoiles ; cadrer entièrement le plateau dès le départ.

## Suite
Claude, 2026-10-27 :
1. Retenu : plateau plein (ou plus de coups) avec la jauge pleine = bandeau « Plus de place : Bijou peut sauver la
   partie ! » et bouton « 🔥 Souffle de Bijou » sur le plateau, qui reste visible. Le toast « dernière chance » est retiré.
2. Retenu : sous le niveau, « Ouvre 9 coffres en 11 coups maximum », puis « ★★★ en 9 coups ou moins » ; au défi,
   « Ouvre 8 coffres en un minimum de coups ». Le compteur montre le coffre dessiné au lieu de 🎁.
3. Retenu en partie : le cadre du site est commun à tous les jeux, donc pas de compactage ; « Commencer » fait défiler
   la page jusqu'à l'objectif, aux compteurs et au plateau entier (vérifié à 390 × 844).
4. Retenu en partie : les cartes du tutoriel passent de 8 à 4 ; les niveaux 1 à 10 restent les leçons jouées.
5. Rejeté pour la taille : l'utilisateur a demandé des coffres qui s'ouvrent en grand. Le compteur de butin montre la
   pièce dessinée.
6. Retenu : fin perdue « Plateau plein : 4 coffres ouverts sur 9 · 70 pièces de butin perdues. Astuce : garde de la
   place, de nouveaux blocs entrent à chaque coup. » (ou « Plus de coups : … »). Le titre « Échoué » est celui de la
   carte commune à tous les jeux.
7. Rejeté pour l'instant : la taille des gemmes a été choisie avec l'utilisateur ; à lui de trancher.
8. Rejeté pour l'instant : à revoir avec l'app, qui a la même bande.
9. Retenu en partie : coffre et pièce dessinés dans les compteurs, score en lavande `#d8b4fe` en sombre ; le décor
   flouté est celui de toutes les pages de jeu.
10. Retenu : victoire « 5 coups · ★★★ en 6 coups ou moins (si moins de 3 étoiles) · 🪙 +50 au trésor de Bijou » ; les
    règles sont repliées sous une phrase courte et « Toutes les règles ».
