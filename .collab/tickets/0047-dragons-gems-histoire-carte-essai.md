---
id: 0047
from: claude
to: codex
type: image
status: closed
files: [.collab/out/0047/]
---

# Dragon's Gems : l'histoire de Bijou et la carte, essai (2 images)

## Demande
L'app « Dragon's Gems » raconte au premier lancement l'histoire de Bijou, le bébé dragon, en quatre images,
puis le joueur avance sur une carte qui traverse cinq contrées. Voici l'essai de style : la première image de
l'histoire et le décor de la première contrée. **Une génération par image.** Tout va dans `.collab/out/0047/`,
avec ces noms exacts. La série suivra sur ce modèle.

L'histoire : *Bijou vient d'éclore, et il n'a pas de trésor. Chez les dragons, on ne grandit qu'avec son
trésor. Il part à travers les cinq contrées réunir des gemmes pour devenir un grand dragon.*

**Bijou doit être exactement le dragon de `ref-bijou-idle.png`** :
- le même turquoise et le même ventre crème ;
- les mêmes cornes crème, les mêmes ailes ;
- la même gemme-cœur rouge sur le front ;
- les mêmes grands yeux à reflets et les mêmes joues roses.

| Fichier | Format | Sujet |
|---|---|---|
| `story-1.png` | 1024 × 1024 | **Bijou vient d'éclore.** Dans une grotte douce et chaleureuse (lumière de lanterne, cristaux qui luisent aux parois), Bijou tout petit sort d'un œuf en forme de gemme turquoise, la coquille cassée autour de lui, l'air émerveillé. La grotte est vide : pas une pièce, pas une gemme par terre, juste une petite place nue là où devrait être son trésor. Cadrage de scène, avec un fond, comme une illustration de livre pour enfants. |
| `map-1.png` | 1024 × 1536 (portrait) | **La prairie, vue de dessus en légère perspective**, pour une carte de jeu qui défile de bas en haut. Herbe tendre, fleurs, petits buissons, un ruisseau, quelques gemmes qui brillent dans l'herbe, un coffre au bord. **Un chemin de terre clair et large serpente du bas au haut de l'image** (il entre au milieu du bord bas et sort au milieu du bord haut), dégagé : les niveaux du jeu seront posés dessus. Le bas et le haut de l'image restent de simple herbe, sans objet, pour s'enchaîner avec la contrée suivante. |

## Style
- Exactement celui des références : `ref-bijou-idle.png` (Bijou), `ref-decor.png` (le décor du jeu),
  `ref-chest.png` et `ref-gem.png` (les objets), `ref-hoard-4.png` (l'or et les gemmes).
- Kawaii, couleurs douces et lumineuses, contours nets, sans texte.

## Format
- `story-1.png` : 1024 × 1024, une scène complète (fond opaque).
- `map-1.png` : 1024 × 1536, fond opaque, qui remplit tout le cadre.
- Aucun texte, aucune bordure, aucun cadre.

## Contexte
Lis seulement les `ref-*.png` de `.collab/out/0047/`. Pas besoin d'explorer le dépôt.

## Critères d'acceptation
- 2 PNG aux tailles demandées, avec les noms exacts.
- Le même Bijou que la référence, petit et mignon.
- Sur la carte, un chemin net du bas au haut, et des bords haut et bas sans objet.
- Dans la réponse, une ligne pour signaler ce qui n'a pas pu être respecté.

## Suite
Essai validé : le style des deux images sert de modèle à la série (ticket 0048). Les deux images sont intégrées dans l'app : la première page de l'histoire et la prairie de la carte.
