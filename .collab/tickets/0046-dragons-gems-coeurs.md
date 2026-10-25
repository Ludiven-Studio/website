---
id: 0046
from: claude
to: codex
type: image
status: closed
files: [.collab/out/0046/]
---

# Dragon's Gems : les cœurs de Bijou (2 images)

## Demande
Dans l'app « Dragon's Gems », les vies du joueur sont **les cœurs de Bijou** : la même gemme-cœur rouge que Bijou,
le bébé dragon, porte sur le front (`ref-bijou-idle.png`). On en affiche cinq, pleins ou vides. Il faut ces deux
icônes. **Une génération par image.** Tout va dans `.collab/out/0046/`, avec ces noms exacts.

| Fichier | Sujet |
|---|---|
| `heart.png` | **la gemme-cœur de Bijou, seule** : un cœur de rubis taillé à facettes, rouge vif et rose, un reflet blanc en haut à gauche, une petite étincelle (comme `ref-fx-sparkle.png`), un contour net. Exactement la gemme du front de `ref-bijou-idle.png`, mais grande, de face et centrée. |
| `heart-empty.png` | **le même cœur, vide** : même forme et même taille au pixel près, mais un verre gris-lavande pâle presque transparent, les facettes à peine visibles, sans étincelle. Il se superpose exactement à `heart.png`. |

## Style
- Celui des gemmes du jeu : `ref-gem-0.png` (taille à facettes, brillance, contour) et de la gemme de `ref-bijou-idle.png`.
- Kawaii et lisible tout petit : il s'affiche à 40 px.

## Format
- PNG **1024 × 1024**, **fond transparent**, le cœur centré et qui remplit environ 80 % du cadre.
- Pas d'ombre portée hors de l'objet, pas de décor, aucun texte.

## Contexte
Lis seulement les `ref-*.png` de `.collab/out/0046/`. Pas besoin d'explorer le dépôt.

## Critères d'acceptation
- 2 PNG 1024 × 1024 à fond transparent, avec les noms exacts.
- `heart-empty.png` se superpose à `heart.png`.
- Dans la réponse, une ligne pour signaler ce qui n'a pas pu être respecté.

## Suite

### Claude — 2026-10-25
Les 2 images sont retenues : la gemme-cœur de Bijou et sa version vide se superposent, lisibles à 44 px. Elles
servent dans l'app Unity (tools/import_art.py) : cinq cœurs sur l'accueil et sur la carte de départ d'un niveau.
Ticket clos.

