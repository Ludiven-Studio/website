---
id: 0048
from: claude
to: codex
type: image
status: closed
files: [.collab/out/0048/]
---

# Dragon's Gems : l'icône, le visuel des stores, l'histoire, les cartes, la fin (12 images)

## Demande
Suite de l'essai 0047, qui est validé (`ref-story-1.png`, `ref-map-1.png` : garder exactement ce style).
L'app sort sur les stores : il faut son icône, son visuel de fiche, la suite de l'histoire de Bijou, les
décors des quatre autres contrées, la fin du jeu, et deux petits objets d'interface.

**Une génération par image, dans l'ordre du tableau** : les premières sont les plus urgentes. Tout va dans
`.collab/out/0048/`, avec ces noms exacts.

L'histoire : *Bijou vient d'éclore, et il n'a pas de trésor. Chez les dragons, on ne grandit qu'avec son
trésor. Il traverse les cinq contrées pour réunir des gemmes et devenir un grand dragon.*

**Bijou est exactement le dragon de `ref-bijou-idle.png`** :
- le même turquoise et le même ventre crème ;
- les mêmes cornes crème et les mêmes ailes ;
- la même gemme-cœur rouge sur le front ;
- les mêmes grands yeux à reflets et les mêmes joues roses.

| # | Fichier | Format | Sujet |
|---|---|---|---|
| 1 | `icon.png` | 1024 × 1024, opaque | **L'icône de l'app.** La tête et le haut du corps de Bijou, de face, grand, souriant, qui serre contre lui une grosse gemme brillante. Il occupe le centre, et tout ce qui compte tient dans le cercle central (80 % de la largeur) : Android rogne les bords. Le fond est un dégradé chaud et simple (violet profond vers turquoise), avec quelques étincelles. Lisible à 48 px : formes simples, gros contrastes. Pas de texte, pas de cadre, pas de coins arrondis. |
| 2 | `feature.png` | 1536 × 1024, opaque | **La bannière de la fiche Google Play** (elle sera recadrée en 1024 × 500 sur la bande centrale, entre les lignes 262 et 762). Bijou à gauche, assis sur un tas d'or et de gemmes (style `ref-hoard-4.png`), joyeux. À droite, des gemmes de couleur qui explosent en étincelles au-dessus d'un plateau de jeu flou. Le tiers droit reste assez calme pour y poser le titre. Tout l'important dans la bande centrale. Sans texte. |
| 3 | `story-2.png` | 1024 × 1024, opaque | **Les grands dragons.** Dans une immense salle de pierre, trois grands dragons (de couleurs différentes de Bijou, bienveillants), chacun couché sur un énorme trésor d'or et de gemmes. Le plus vieux se penche vers Bijou, tout petit au premier plan, qui lève les yeux, admiratif. |
| 4 | `story-3.png` | 1024 × 1024, opaque | **Les cinq contrées.** Bijou de dos, assis à l'entrée de sa grotte, au soleil levant. Devant lui s'étend le pays : une prairie verte au premier plan, puis des ruines de pierre avec des coffres, un canyon de rochers, un glacier blanc, et tout au loin un sommet où brillent cinq grosses gemmes de couleur. |
| 5 | `story-4.png` | 1024 × 1024, opaque | **Le départ.** Bijou marche, joyeux, sur un chemin de terre qui entre dans la prairie (la même que `ref-map-1.png`), un petit baluchon sur l'épaule, la queue en l'air. |
| 6 | `ending.png` | 1024 × 1024, opaque | **La fin : Bijou est devenu grand.** La grotte de `ref-story-1.png`, mais remplie d'un immense trésor d'or et de gemmes des cinq couleurs. Bijou, maintenant un jeune grand dragon (même dessin, mêmes couleurs, plus grand, ailes déployées), trône au sommet, fier et heureux. Des confettis d'étincelles. |
| 7 | `map-2.png` | 1024 × 1536, opaque | **Les coffres-forts** : des ruines d'une vieille forteresse de pierre moussue, des coffres cerclés de fer et des cadenas, quelques gemmes. |
| 8 | `map-3.png` | 1024 × 1536, opaque | **Les rochers** : un canyon de grès chaud, de gros rochers ronds, quelques gemmes et un coffre. |
| 9 | `map-4.png` | 1024 × 1536, opaque | **Le glacier** : neige, glace bleutée, un lac gelé, des cristaux de glace, des gemmes prises dans la glace. |
| 10 | `map-5.png` | 1024 × 1536, opaque | **La cinquième gemme** : le flanc d'une montagne magique au crépuscule (ciel violet et doré), des lucioles ; le chemin monte vers le haut de l'image, où brillent cinq grosses gemmes de couleur. |
| 11 | `paw.png` | 512 × 512, **fond transparent** | **La patte de Bijou qui montre** : une patte de dragon turquoise aux coussinets crème, l'index tendu qui pointe vers le haut à gauche, comme une main de tutoriel. Contour net, sans ombre sur le fond. |
| 12 | `gift.png` | 512 × 512, **fond transparent** | **Le cadeau du jour** : une petite boîte-cadeau turquoise avec un ruban doré, et une gemme-cœur rouge sur le nœud. Contour net, sans ombre sur le fond. |

Les cartes 7 à 10 suivent `ref-map-1.png` à la lettre :
- une vue de dessus en légère perspective, pour une carte qui défile de bas en haut ;
- **un chemin clair et large qui serpente du bas au haut** : il entre au milieu du bord bas et sort au milieu
  du bord haut, et reste dégagé, car les niveaux seront posés dessus ;
- le bas et le haut de l'image restent un sol simple, sans objet.

## Style
- Exactement celui des références : `ref-story-1.png` et `ref-map-1.png` (l'essai validé), `ref-bijou-idle.png`
  (Bijou), `ref-decor.png`, `ref-chest.png`, `ref-gem.png` et `ref-hoard-4.png` (les objets et l'or).
- Kawaii, couleurs douces et lumineuses, contours nets.
- Sans texte, sans bordure, sans cadre.

## Contexte
Lis seulement les `ref-*.png` de `.collab/out/0048/`. Pas besoin d'explorer le dépôt.

## Critères d'acceptation
- 12 PNG aux tailles demandées, avec les noms exacts ; les deux derniers sur fond transparent.
- Le même Bijou partout.
- Sur les cartes, un chemin net du bas au haut, et des bords haut et bas sans objet.
- Dans la réponse, une ligne par image qui n'a pas pu respecter la demande.

## Suite
Les 12 images sont retenues.
- L'icône devient l'icône de l'app, avec une couche adaptative Android.
- La bannière est recadrée en 1024 × 500 pour la fiche Google Play.
- Les pages 2 à 4 de l'histoire et la fin vont dans `MenuStory`.
- Les cartes 2 à 5 deviennent les contrées de la carte : chaque chemin est relevé par `tools/map_paths.py`.
- La patte montre le geste des leçons, et le cadeau est prévu pour le cadeau du jour.
