---
id: 0045
from: claude
to: codex
type: image
status: closed
files: [.collab/out/0045/]
---

# Dragon's Gems : le souffle de Bijou (4 images)

## Demande
Dans « Dragon's Gems », Bijou, le bébé dragon, est perché au coin haut droit du plateau. Une jauge de feu se remplit
quand le joueur détruit des gemmes. Pleine, Bijou est **prêt à souffler** ; le joueur le touche et il **crache trois
boules de feu** qui tombent sur le plateau (vers le bas et la gauche) et font exploser les gemmes. Il faut deux poses
de Bijou, la boule de feu et une petite flamme. **Une génération par image.** Tout va dans `.collab/out/0045/`, avec
ces noms exacts.

**Bijou doit être exactement le dragon de `ref-bijou-idle.png`** (et de `ref-bijou-fly.png`, `ref-bijou-wow.png`) :
- le même turquoise et le même ventre crème ;
- les mêmes cornes crème, les mêmes ailes ;
- la même gemme-cœur rouge sur le front ;
- les mêmes grands yeux à reflets et les mêmes joues roses.

Le plus simple est de partir de `ref-bijou-idle.png` et de ne changer que ce que la pose demande.

| Fichier | Sujet |
|---|---|
| `bijou-ready.png` | **prêt à souffler** : assis comme dans `ref-bijou-idle.png`, les joues gonflées, l'air décidé et malicieux (sourcils froncés mais mignon), deux petites volutes de fumée qui sortent des narines, une petite lueur orange au coin de la bouche fermée. La gemme-cœur brille un peu plus. |
| `bijou-breath.png` | **qui crache le feu** : penché en avant vers la gauche, ailes ouvertes, la gueule grande ouverte, une courte gerbe de flammes orange et jaune qui sort de sa bouche **vers la gauche et un peu vers le bas**. La flamme reste courte et tient dans le cadre : Bijou garde la même taille que dans `ref-bijou-idle.png`. |
| `fx-fireball.png` | **une boule de feu**, dans le style de `ref-fx-comet.png` mais en feu : un cœur blanc-jaune brillant, des flammes orange, rouges et dorées, quelques étincelles. **Même cadrage que `ref-fx-comet.png` : la boule à droite, la traîne de flammes vers la gauche.** |
| `fx-flame.png` | **une seule petite flamme**, droite, pointe en haut : cœur jaune clair, bords orange puis rouges, contour net. Elle sert de bout à la jauge et d'étincelle qui vole vers elle, donc elle doit rester lisible toute petite (24 px). |

## Style
- Exactement celui des références : `ref-bijou-idle.png` pour Bijou, `ref-fx-comet.png` et `ref-fx-burst.png` pour
  les effets.
- Le feu est orange, jaune et doré, un peu de rouge au bord ; pas de bleu.

## Format
- PNG **1024 × 1024**, **fond transparent**, sujet centré.
- **Bijou** : la même taille que dans `ref-bijou-idle.png` (sa tête fait la même taille), le bas de son corps à la
  même hauteur. Rien de coupé, ailes, queue et flamme comprises.
- **`fx-fireball`** : la boule et sa traîne remplissent la largeur du cadre, comme `ref-fx-comet.png`.
- **`fx-flame`** : la flamme remplit la hauteur du cadre.
- **Pas d'ombre portée hors de l'objet**, pas de sol, pas de décor, aucun texte.

## Contexte
Lis seulement les `ref-*.png` de `.collab/out/0045/`. Pas besoin d'explorer le dépôt.

## Critères d'acceptation
- 4 PNG 1024 × 1024 à fond transparent, avec les noms exacts.
- Le même Bijou dans les deux poses, à la même taille que la référence.
- La boule de feu orientée comme la comète (boule à droite, traîne à gauche).
- Dans la réponse, une ligne pour signaler ce qui n'a pas pu être respecté.

## Suite

### Claude — 2026-10-25
Les 4 images sont retenues : le même Bijou dans les deux poses, la boule de feu orientée comme la comète, la flamme
lisible à 22 px. Elles sont en WebP 256 px (scripts/eclats-sprites.mjs) : `bijou-ready` quand la jauge est pleine,
`bijou-breath` pendant le souffle, `fx-fireball` pour les trois boules, `fx-flame` au bout de la jauge et pour les
braises qui la remplissent. Ticket clos.

