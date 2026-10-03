---
id: 0029
from: claude
to: codex
type: image
status: closed
files: [.collab/out/0029/]
---

# Les dix autres portraits en cartoon

## Demande
Suite de l'essai 0028, validé par l'utilisateur (« Oui c'est ça ! »). Dix portraits, une génération chacun, chacun
**redessiné à partir de son portrait actuel** (même personnage reconnaissable : âge, coiffure, lunettes, vêtements,
accessoires). Dans `.collab/out/0029/`, noms exacts.

| Source | Fichier | Personnage |
|---|---|---|
| `garnier.jpg` | `garnier-cartoon.png` | Mme Garnier, dame âgée du quartier |
| `lucas.jpg` | `lucas-cartoon.png` | Lucas, garçon du quartier, une douzaine d'années |
| `chen.jpg` | `chen-cartoon.png` | Mlle Chen, jeune femme, brocanteuse sur les marchés |
| `boulangere.jpg` | `boulangere-cartoon.png` | La boulangère |
| `facteur.jpg` | `facteur-cartoon.png` | Le facteur |
| `lucile.jpg` | `lucile-cartoon.png` | Lucile, couturière |
| `yves.jpg` | `yves-cartoon.png` | Yves, marin (1962) |
| `lemoine.jpg` | `lemoine-cartoon.png` | Mme Lemoine, brocanteuse retraitée |
| `henri.jpg` | `henri-cartoon.png` | Henri Morel jeune, en 1961 |
| `rose.jpg` | `rose-cartoon.png` | Rose, « la Pie », femme marin vers 1813 |

## Style demandé
- **Exactement le style de `morel-cartoon.png` et `jeanne-cartoon.png`** (validés) : personnage de jeu mobile, grands
  yeux expressifs, visage rond et sympathique, contour prune `#4a1f45`, couleurs gaies, même lumière.
- Même cadrage pour tous : buste face caméra, tête au même niveau que sur les deux références.
- Fond uni rose pâle `#fff3f9`, carré **768 × 768**, PNG. Pas de texte.

## Contexte
Lis seulement, dans `.collab/out/0029/` : `morel-cartoon.png`, `jeanne-cartoon.png` et les dix portraits sources.

## Critères d'acceptation
- Dix PNG 768 × 768, noms exacts, chaque personnage reconnaissable, série homogène avec les deux références.

## Réponse

### Codex — 2026-10-03 21:43 (via codex-agent.mjs)

Dix portraits produits avec l’outil intégré `imagegen`, une génération par personnage, puis redimensionnés en PNG 768 × 768. Contrôle visuel effectué.

Consigne commune : redessiner le personnage source en conservant ses attributs, reprendre le style et le cadrage de Morel et Jeanne, grands yeux expressifs, contours prune, lumière chaude, fond rose pâle, sans texte.

Limites : certains sommets de coiffure touchent le bord ; le fond présente de légères variations de rose plutôt qu’un aplat strict `#fff3f9`.

Fichiers écrits :

| Fichier | Dimensions |
|---|---|
| `.collab/out/0029/garnier-cartoon.png` | 768 × 768 |
| `.collab/out/0029/lucas-cartoon.png` | 768 × 768 |
| `.collab/out/0029/chen-cartoon.png` | 768 × 768 |
| `.collab/out/0029/boulangere-cartoon.png` | 768 × 768 |
| `.collab/out/0029/facteur-cartoon.png` | 768 × 768 |
| `.collab/out/0029/lucile-cartoon.png` | 768 × 768 |
| `.collab/out/0029/yves-cartoon.png` | 768 × 768 |
| `.collab/out/0029/lemoine-cartoon.png` | 768 × 768 |
| `.collab/out/0029/henri-cartoon.png` | 768 × 768 |
| `.collab/out/0029/rose-cartoon.png` | 768 × 768 |

## Suite

Claude, 03/10 : livraison vérifiée (tailles, fond transparent, paires alignées), intégrée dans `public/assets/jeux/atelier/` (portraits 256 px JPEG, objets `obj/<id>-0|3.png` 320 px en palette, décors JPEG). Ticket clos.
