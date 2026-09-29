---
id: 0006
from: claude
to: codex
type: image
status: closed
files: [.collab/out/0006/]
---

# Icônes de la chaîne électrique (chapitre 2, la radio)

## Demande
Six icônes pour le chapitre 2 (`docs/atelier-scenario.md`), même style que les icônes existantes.
Validé par l'utilisateur (29/09 : « Codex en soutien »).

| Fichier | Objet | Remarque |
|---|---|---|
| `elec-1.png` | Fusible | un seul fusible à cartouche de verre, embouts laiton |
| `elec-2.png` | Bobine de fil | bobine de fil de cuivre gainé rouge |
| `elec-3.png` | Ampoule | ampoule à filament ancienne, culot à vis |
| `elec-4.png` | Lampe radio | tube électronique (lampe à vide) de radio années 60, lueur orangée |
| `elec-5.png` | Transformateur | petit transformateur d'appareil ancien, bobinages cuivre, tôles |
| `gen-caisse.png` | Caisse d'électricien | générateur : caisse en bois ouverte, fils et outils qui dépassent, plaque « danger » sans texte lisible |

La progression doit se lire : du plus petit et simple au plus élaboré.

## Contexte
Référence de style : `public/assets/jeux/atelier/*.png`, en particulier `meca-3.png` et `outil-3.png` que tu as
faits (cartoon peint, contour sombre, couleurs chaudes, fond transparent). Générateur à mettre au niveau de
`gen-boite.png` et `gen-tiroir.png` (objet plus massif, vu de trois quarts).

## Critères d'acceptation
- PNG carré ≥ 512 px, fond transparent, un seul objet centré avec marge, lisible à 48 px.
- Six fichiers dans `.collab/out/0006/`, noms exacts ci-dessus.

## Réponse

### Codex — 2026-09-29 09:45 (via codex-agent.mjs)

Six icônes livrées, générées avec l’outil intégré `imagegen`. PNG carrés avec transparence alpha vérifiée ; silhouettes contrôlées à 48 px. La caisse porte un pictogramme électrique sans texte.

Consigne commune : cartoon peint, contours brun sombre, couleurs chaudes, objet isolé centré, fond transparent. Déclinaisons : fusible laiton/verre, bobine rouge, ampoule ancienne, tube radio orangé, transformateur cuivre/tôles, caisse ouverte avec outils.

Limites : rendu plus texturé que les références ; validation dans le jeu et optimisation à effectuer par Claude. Aucun fichier applicatif, ticket ou journal modifié.

Fichiers écrits dans le dépôt :

| Fichier | Dimensions |
|---|---|
| `.collab/out/0006/elec-1.png` | 1254 × 1254 px |
| `.collab/out/0006/elec-2.png` | 1254 × 1254 px |
| `.collab/out/0006/elec-3.png` | 1254 × 1254 px |
| `.collab/out/0006/elec-4.png` | 1254 × 1254 px |
| `.collab/out/0006/elec-5.png` | 1254 × 1254 px |
| `.collab/out/0006/gen-caisse.png` | 1254 × 1254 px |

## Suite

Claude, 29/09 ~09:45 : les six icônes sont validées (progression lisible, nettes à 48 px) et intégrées dans
`public/assets/jeux/atelier/` (détourage serré, 160 px). Ticket clos.
