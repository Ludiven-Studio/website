---
id: 0031
from: claude
to: codex
type: image
status: closed
files: [.collab/out/0031/]
---

# Objets d'histoire en cartoon : lot 1 (saisons 1-2)

## Demande
Suite de l'essai 0028, validé par l'utilisateur (« Oui c'est ça ! »). 8 objets, **deux images chacun**
(16 images), une génération par image (la version `-3` peut être dérivée de la `-0` pour garder le cadrage).
Tout dans `.collab/out/0031/`, noms exacts.

| Fichiers | Objet | Abîmé (`-0`) | Restauré (`-3`) |
|---|---|---|---|
| `radio-0.png`, `radio-3.png` | **Radio des années 60 de Mme Garnier** | meuble en bois poussiéreux, grille de tissu déchirée, cadran éteint | bois ciré, grille neuve, cadran allumé ambré, voyant, petites notes de musique |
| `voilier-0.png`, `voilier-3.png` | **Voilier jouet de Lucas** | coque fendue et sale, mât cassé, voiles déchirées | coque vernie bleue et bois, voiles blanches gonflées, fanion rouge, sur un peu d'eau |
| `boite-0.png`, `boite-3.png` | **Boîte à couture de Lucile** | encrassée, couvercle de travers, tiroir bloqué | bois verni, une pie en marqueterie sur le couvercle, poignée de laiton, le nom « Lucile » |
| `fauteuil-0.png`, `fauteuil-3.png` | **Petit fauteuil de la boulangère** | tissu taché et déchiré, assise affaissée | bois ciré, tissu neuf rouge à pois blancs, galon doré |
| `malle-0.png`, `malle-3.png` | **Malle de marin de Rose (1813)** | salpêtre, cerclages rouillés, serrure grippée | cuir nourri brun, cerclages et serrure en laiton brillants, une pie et « R. K. » marqués sur le cuir |
| `musique-0.png`, `musique-3.png` | **Boîte à musique de la famille Chen** | laque terne et poussiéreuse, couvercle fermé | laque rouge brillante avec un petit port peint, couvercle ouvert, petit voilier qui tourne, notes de musique |
| `boussole-0.png`, `boussole-3.png` | **Boussole de La Mouette** | boîtier terni, verre sale, aiguille bloquée | laiton brillant, cadran crème N / E / S / O, aiguille rouge et bleue, gravure « Y. K. — La Mouette, 1962 » |
| `fanal-0.png`, `fanal-3.png` | **Fanal (lanterne de bateau)** | rouillé, verre brisé, éteint | cadre vert sapin, verre neuf, flamme jaune qui brille, petite étiquette « Mouette » |

## Style demandé (le plus important)
- **Exactement le style de `montre-0.png` / `montre-3.png`** (essai validé par l'utilisateur) et de l'icône `outil-4.png` :
  cartoon enfantin et mignon, formes rondes, contour prune `#4a1f45` épais et régulier, couleurs saturées et gaies,
  reflet blanc doux, peu de détails.
- Chaque objet : **deux images, la même chose et le même cadrage** (le jeu passe de l'une à l'autre en fondu au fil des
  étapes). `-0` = l'objet tel qu'il arrive, abîmé (poussière, taches, fêlures, couleurs ternies) mais déjà mignon ;
  `-3` = le même objet restauré, éclatant, une petite étoile brillante.
- `ref-<id>-0.png` / `ref-<id>-3.png` sont les dessins actuels (trop plats et réalistes) : garde leur **forme, leur
  couleur dominante et leurs détails d'histoire** (inscriptions courtes, pie gravée…). Une inscription peut être
  simplifiée si elle devient illisible, mais ne pas en inventer.
- **Fond transparent**, carré **640 × 640**, PNG, l'objet centré, occupant environ 85 % de sa plus grande dimension.
- Pas de personnage, pas de décor autour (un peu d'eau sous un bateau restauré est permis).

## Contexte
Lis seulement, dans `.collab/out/0031/` : `montre-0.png`, `montre-3.png`, `outil-4.png`, et `ref-radio-0.png`, `ref-radio-3.png`, `ref-voilier-0.png`, `ref-voilier-3.png`, `ref-boite-0.png`, `ref-boite-3.png`, `ref-fauteuil-0.png`, `ref-fauteuil-3.png`, `ref-malle-0.png`, `ref-malle-3.png`, `ref-musique-0.png`, `ref-musique-3.png`, `ref-boussole-0.png`, `ref-boussole-3.png`, `ref-fanal-0.png`, `ref-fanal-3.png`.
Pas besoin d'explorer le dépôt.

## Critères d'acceptation
- 16 PNG 640 × 640 à fond transparent, noms exacts, paires alignées, série cohérente avec la montre.

## Réponse

## Suite

Claude, 03/10 : livraison vérifiée (tailles, fond transparent, paires alignées), intégrée dans `public/assets/jeux/atelier/` (portraits 256 px JPEG, objets `obj/<id>-0|3.png` 320 px en palette, décors JPEG). Ticket clos.

Note 0031 : le lanceur a coupé à 20 min, mais les 16 images étaient déjà écrites et conformes.
