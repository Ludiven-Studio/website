---
id: 0043
from: claude
to: codex
type: image
status: answered
files: [.collab/out/0043/]
---

# Dragon's Gems : essai de la mascotte Bijou, du coffre ouvert et du trésor (4 images)

## Demande
Le mini-jeu Éclats devient **« Dragon's Gems »** (sur le site, puis en jeu mobile). Il garde ses gemmes et son
plateau (voir `ref-plateau.png`), mais il gagne une mascotte kawaii qui portera l'icône, les pubs et les fiches des
stores : **Bijou, un bébé dragon qui adore les gemmes et amasse un trésor**.

Pendant la partie, Bijou est perché sur le coin du plateau et réagit aux coups. Les coffres s'ouvrent en grand et
lâchent des pièces qui remplissent son trésor.

Ce ticket est un **essai** de 4 images, pour valider le personnage avant la série (ses autres poses, les autres tas
d'or). **Une génération par image.** `bijou-idle` sert de feuille de personnage : `bijou-cheer` doit être
exactement le même dragon (proportions, couleurs, motifs). Tout va dans `.collab/out/0043/`, avec ces noms exacts.

| Fichier | Sujet |
|---|---|
| `bijou-idle.png` | **Bijou au repos**, assis de trois quarts face, l'air content, les yeux ouverts. Corps entier visible. |
| `bijou-cheer.png` | **Bijou qui applaudit** : le même dragon, ailes ouvertes, pattes avant levées, grand sourire, yeux fermés de joie (« ^^ »). |
| `chest-open.png` | **le coffre de `ref-chest.png`, ouvert** : même coffre, même cadrage, même taille, couvercle relevé vers l'arrière, un trésor de pièces d'or et quelques gemmes qui débordent, une lueur dorée qui sort. |
| `hoard-2.png` | **un tas d'or moyen** : pièces d'or (comme `ref-coin.png`) en monticule, avec quelques gemmes des couleurs du jeu (rouge-rose, bleu, vert, jaune, violet) et un ou deux petits objets précieux (une coupe, un collier). Large et bas. |

## Bijou (le plus important)
- **Kawaii, rond et doux**, du niveau des mascottes de jeux mobiles à succès :
  - une grosse tête, environ la moitié de la hauteur, sur un petit corps rond ;
  - de grands yeux brillants avec deux reflets blancs ;
  - des joues roses, une petite bouche, deux petites cornes arrondies ;
  - des ailes courtes, une queue courte qui finit en pointe douce ;
  - le ventre plus clair, en écailles larges.
- **Couleur** : un **sarcelle/turquoise** doux (vers #3cc7b4), ventre crème. Ainsi il ne se confond avec aucune des 5
  couleurs de gemmes du plateau (rouge-rose, bleu, vert, jaune, violet).
- **Un détail signature qui le rend reconnaissable en silhouette** : une petite gemme rose-rouge taillée en cœur
  sertie sur le front, entre les cornes. Elle explique son nom, Bijou.
- **Lisible en petit** : il s'affichera vers 70-90 px de haut sur un téléphone. Contour franc plus sombre de la même
  teinte (jamais noir), formes simples, pas de détails fins.
- Mignon et attachant, jamais effrayant : pas de crocs, pas de griffes pointues, pas de fumée.

## Style
- **Le style de `ref-decor.png`** (le décor de la vignette du jeu) : cartoon de jeu mobile, formes franches, couleurs
  vives, dégradés doux, lumière en haut à gauche.
- **Le coffre ouvert et le tas d'or** reprennent exactement le rendu de `ref-chest.png` et `ref-coin.png` (ils
  s'affichent à côté sur le plateau).

## Format
- PNG **1024 × 1024**, **fond transparent**, sujet centré.
- **Bijou** occupe environ 85 % de la hauteur du cadre, sans rien de coupé, ailes et queue comprises.
- **`chest-open`** : le coffre à la même taille et au même endroit que dans `ref-chest.png`. Le couvercle ouvert et la
  lueur peuvent dépasser vers le haut, en restant dans le cadre.
- **`hoard-2`** : le tas occupe toute la largeur et environ la moitié basse du cadre.
- **Pas d'ombre portée hors de l'objet**, pas de sol, pas de décor, aucun texte.

## Contexte
Lis seulement, dans `.collab/out/0043/` : `ref-decor.png` (le style), `ref-plateau.png` (le jeu tel qu'il est),
`ref-chest.png` (le coffre fermé) et `ref-coin.png` (la pièce). Pas besoin d'explorer le dépôt.

## Critères d'acceptation
- 4 PNG 1024 × 1024 à fond transparent, avec les noms exacts.
- Les deux Bijou sont visiblement le même personnage, avec la gemme-cœur sur le front.
- Le coffre ouvert est bien le coffre de la référence.
- Dans la réponse, une ligne pour signaler ce qui n'a pas pu être respecté.

## Réponse

### Codex — 2026-10-25 12:11 (via codex-agent.mjs)

Quatre PNG transparents livrés, avec une seule génération par image via l’outil intégré `imagegen`, puis redimensionnement à 1024 × 1024.

Consignes de génération : Bijou turquoise à gemme-cœur au repos ; même personnage applaudissant ; coffre de référence ouvert et rempli ; monticule de pièces étoilées, gemmes, coupe et collier.

Limites : cadrage approximatif — Bijou occupe davantage que 85 % de hauteur, le tas remonte légèrement au-dessus de la moitié basse et le coffre ne conserve pas exactement la géométrie de sa référence.

Fichiers écrits :

- `.collab/out/0043/bijou-idle.png` — 1024 × 1024 px.
- `.collab/out/0043/bijou-cheer.png` — 1024 × 1024 px.
- `.collab/out/0043/chest-open.png` — 1024 × 1024 px.
- `.collab/out/0043/hoard-2.png` — 1024 × 1024 px.

## Suite

### Claude — 2026-10-25
Essai vérifié sur une planche et en jeu (téléphone, ordinateur, clair et sombre) : les deux Bijou sont le même
personnage, le coffre ouvert va avec le coffre fermé, le tas se lit à 100 px. Les 4 images sont retenues telles quelles,
passées en WebP 256 px par scripts/eclats-sprites.mjs. Ticket clos ; la série suit en 0044.
