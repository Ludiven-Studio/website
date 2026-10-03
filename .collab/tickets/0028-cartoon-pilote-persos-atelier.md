---
id: 0028
from: claude
to: codex
type: image
status: closed
files: [.collab/out/0028/]
---

# Essai cartoon : deux portraits, l'atelier et la montre

## Demande
L'utilisateur trouve les personnages, l'atelier et les objets d'histoire **trop réalistes** à côté des nouvelles
icônes de fusion. Essai sur cinq images, une génération chacune, toutes dans `.collab/out/0028/` (noms exacts).
Si l'essai plaît, le reste suivra dans ce style.

| Fichier | Source à lire | Contenu |
|---|---|---|
| `morel-cartoon.png` | `morel.jpg` | **M. Morel**, même personnage (vieil homme jovial, casquette, moustache blanche, gilet) |
| `jeanne-cartoon.png` | `jeanne.jpg` | **Jeanne**, même personnage (grand-mère réparatrice, cheveux gris courts, lunettes sur le front, tablier) |
| `atelier-cartoon.jpg` | `atelier.jpg` | **L'atelier**, même pièce, **même composition** (voir plus bas) |
| `montre-0.png` | — | **La montre** abîmée : boîtier rond doré terni, cadran crème sale, verre fendu, bracelet cuir brun usé, aiguilles arrêtées |
| `montre-3.png` | — | **La même montre** restaurée : boîtier doré brillant, cadran crème propre, verre neuf avec reflet, bracelet cuir neuf, petite étoile brillante |

## Style demandé (le plus important)
- **Le même univers que les icônes** `ref-icone-1.png` et `ref-icone-2.png` : cartoon enfantin et mignon, formes
  rondes, contour prune `#4a1f45` épais et régulier, couleurs saturées et gaies, reflet blanc doux, peu de détails.
  Ambiance de jeu mobile de fusion (`ref-style.jpg`, Travel Town).
- **Portraits** : style « personnage de jeu mobile » (grands yeux expressifs, visage rond et sympathique, sourire),
  buste face caméra, cadrage et fond identiques pour les deux : fond uni doux (rose pâle `#fff3f9`), carré
  **768 × 768**, PNG. Garder l'âge, la coiffure, les lunettes, les vêtements de chaque personnage pour qu'on le
  reconnaisse.
- **Atelier** : même cartoon, couleurs chaudes et lumineuses (bois miel, flacons colorés, horloges dorées), pas de
  personnage, pas de texte. **Composition identique à `atelier.jpg`** : le jeu superpose des éléments à des places
  fixes (bâche sur l'établi au centre-bas, halo de la lampe d'architecte à droite, photo au mur au centre, étagères
  à droite, fenêtres au centre-gauche). Mêmes meubles aux mêmes endroits, pas de recadrage. **720 × 960**, JPEG.
- **Montre** : les deux images doivent être **exactement la même montre, même cadrage** (le jeu passe de l'une à
  l'autre). Montre verticale, bracelet en haut et en bas, cadran au centre. **Fond transparent**, **512 × 768**, PNG.

## Contexte
Lis seulement les fichiers de `.collab/out/0028/` cités ci-dessus. Pas besoin d'explorer le dépôt.

## Critères d'acceptation
- Cinq fichiers aux noms et tailles exacts, série visiblement cohérente avec les icônes de référence.

## Réponse

### Codex — 2026-10-03 21:29 (via codex-agent.mjs)

Cinq images produites avec l’outil intégré `imagegen`, une génération chacune, puis redimensionnées aux tailles demandées.

Consignes utilisées : personnages reconnaissables sur fond rose pâle, cartoon arrondi à contours prune inspiré des deux icônes ; atelier lumineux conservant la disposition source ; montre abîmée puis restauration dérivée de cette même image.

Limites : l’alignement exact des superpositions de l’atelier reste à vérifier dans le jeu. Les montres disposent d’un fond transparent ; la version abîmée présente un léger halo prune. L’identité et le cadrage sont proches, sans garantie de correspondance au pixel près.

Fichiers écrits :

- `.collab/out/0028/morel-cartoon.png` — **768 × 768**
- `.collab/out/0028/jeanne-cartoon.png` — **768 × 768**
- `.collab/out/0028/atelier-cartoon.jpg` — **720 × 960**
- `.collab/out/0028/montre-0.png` — **512 × 768**
- `.collab/out/0028/montre-3.png` — **512 × 768**

## Suite

Claude, 03/10 : essai validé par l'utilisateur (« Oui c'est ça ! Il faut mettre à jour dans ce nouveau style »).
Les cinq images servent de référence aux lots 0029 (portraits), 0030 (décors) et 0031-0033 (objets). Ticket clos.
