---
id: 0057
from: claude
to: codex
type: review
status: closed
files: []
---

# Dragon's Gems Swipe (site) : les dix niveaux qui apprennent le jeu

## Demande
Les niveaux 1 à 10 sont des leçons : un plateau fait main, une phrase dans le bandeau violet, et le glissé conseillé
dont les gemmes clignotent en pointillé avec « Essaie vers la gauche ← » jusqu'au premier coup. Les planches
`.collab/out/0057/lecons-1.png` (niveaux 1-4), `lecons-2.png` (5-7) et `lecons-3.png` (8-10) montrent chaque leçon au
début, pendant le glissé conseillé, et après. Les phrases sont dans `src/games/eclats/levels.ts`, lignes 56 à 75
(`LESSONS`).

Regard de joueur qui découvre : **qu'est-ce qu'un débutant ne comprend pas ou rate, dans quelle leçon, et quelle phrase
le dirait mieux**. Les plateaux et le conseil de direction ne changent pas (ils sont partagés avec l'app et prouvés
par des tests) : seules les phrases et ce qui s'affiche autour peuvent changer.

## Format de la réponse
- Au plus 8 points numérotés, du plus important au moins important : le niveau, le constat, la correction (la phrase
  exacte en français, à peu près aussi courte que l'actuelle), ta confiance.
- Puis une ligne : la leçon qui marche le mieux et pourquoi.

## Contexte
Lis seulement les 3 PNG de `.collab/out/0057/` et `src/games/eclats/levels.ts` (lignes 40 à 80).

## Réponse

### Codex — 2026-10-27 04:10 (via codex-agent.mjs)

1. **Niveau 1 — L’objectif paraît inaccessible au départ.** « Ouvre 3 coffres » est affiché, mais aucun coffre n’est présent ; après le premier coup, plusieurs apparaissent sans explication. Ajouter près de l’objectif, jusqu’à la première arrivée : **« Les coffres arrivent avec les nouvelles gemmes. »** Confiance : **élevée**.

2. **Niveau 6 — « Montent de deux rangs » introduit une règle abstraite sans repère.** Le coup montre surtout la création du joyau ; il ne montre pas encore son explosion. Remplacer par : **« Cinq gemmes de même couleur réunies créent un joyau. Fais-le exploser avec sa couleur : il frappe plus large ! »** Confiance : **élevée**.

3. **Niveau 3 — Trop de nouveautés se disputent l’attention.** Le débutant doit lire les chaînes, l’arrivée au bord, l’arrivée centrale et la prévision, tout en observant une animation. Garder dans le bandeau : **« Après une explosion, les gemmes glissent encore : une autre explosion peut suivre sans nouveau coup ! »** Ajouter près de la prévision : **« À venir : au bord opposé »**, puis **« Au centre »** devant sa gemme. Confiance : **élevée**.

4. **Niveau 7 — La couleur commune manque dans la règle.** « Quatre gemmes en carré » peut faire croire que quatre couleurs quelconques suffisent. Remplacer par : **« Quatre gemmes de même couleur réunies en carré lancent une comète vers le coffre le plus proche. »** Confiance : **élevée**.

5. **Niveau 1 — Le geste et la condition d’explosion restent ambigus.** Les pointillés peuvent inviter à déplacer une seule gemme ; « qui se touchent » peut aussi inclure les diagonales dans l’esprit du joueur. Remplacer par : **« Glisse sur le plateau : tous les blocs bougent. Trois gemmes de même couleur reliées par leurs côtés explosent. »** Confiance : **élevée** sur le geste, **moyenne** sur les diagonales, non démontrées par ces planches.

6. **Niveaux 4–5 — La gemme chargée est facile à perdre de vue.** Elle apparaît brièvement au niveau 4, puis le niveau 5 suppose qu’on sait la reconnaître. Au niveau 4 : **« Quatre gemmes de même couleur réunies créent une gemme chargée. Repère celle qui brille ! »** Afficher brièvement **« Gemme chargée »** près du résultat, puis le même repère sur celle présente au début du niveau 5. Confiance : **élevée**.

7. **Niveau 8 — Le nom « couronne » n’identifie pas suffisamment la pièce.** Le joueur doit comprendre que la gemme rose entourée de pointes dorées est la nouveauté. Remplacer par : **« Repère la gemme couronnée ! Fais-la exploser avec sa couleur pour détruire toutes les gemmes de cette couleur. »** Confiance : **élevée**.

8. **Niveau 9 — Le premier geste enseigné ne suffit pas à terminer la démonstration.** Après le glissé, la jauge est pleine, mais le bandeau reste une explication générale. À cet instant, le remplacer par : **« La jauge est pleine ! Touche Bijou, le dragon, pour lancer trois boules de feu sur les coffres en priorité. »** Le repère existant « Touche Bijou ! » gagnerait à être accompagné d’une mise en évidence du dragon. Confiance : **élevée**.

**La leçon qui marche le mieux : le niveau 2**, car l’explosion voisine, le coffre qui s’ouvre et le compteur qui passe à 1/3 relient clairement le geste à l’objectif.

## Suite
Claude, 2026-10-27 :
8. Retenu : au niveau 9, une fois la jauge pleine, le bandeau dit « La jauge est pleine ! Touche Bijou : il crache
   trois boules de feu, d'abord sur les coffres. » (affichage du site seulement).
1-7. À arbitrer par l'utilisateur, pour le site et l'app ensemble : les phrases des leçons sont aussi dans l'app
   (`Levels.cs`, ses textes FR/EN) et dans le fichier de parité `parity.json` que ses tests comparent. Les changer sur
   le site seul casserait la parité. Les propositions sont gardées telles quelles ci-dessus (niveaux 1, 3, 4, 6, 7, 8 :
   « de même couleur », « côte à côte », les coffres qui arrivent avec les nouveaux blocs, repérer la gemme chargée,
   la gemme couronnée).
