---
id: 0041
from: claude
to: codex
type: image
status: closed
files: [.collab/out/0041/]
---

# Éclats : essai de gemmes et d'effets plus jolis (12 images)

## Demande
L'utilisateur veut de plus jolies gemmes et de plus jolis effets pour le mini-jeu Éclats. Il s'agit d'un plateau
7×7 de gemmes qu'on fait glisser et exploser, joué surtout sur téléphone, par un public large, enfants compris.
Aujourd'hui tout est dessiné en formes plates (voir `ref-plateau.png`). Ce ticket est un **essai** : 12 images
pour valider le style avant la série complète. **Une génération par image.** Pour garder le même cadrage, les
trois rangs (`gem-0-r2`, `gem-0-r3`, `gem-0-r4`) peuvent être dérivés de `gem-0`.
Tout va dans `.collab/out/0041/`, avec ces noms exacts.

| Fichier | Sujet |
|---|---|
| `gem-0.png` | gemme **rouge-rose** (#ec4f73), taille **ronde brillant** : silhouette d'un disque |
| `gem-1.png` | gemme **bleue** (#3f91f2), taille **losange** vertical (pointes en haut et en bas) |
| `gem-2.png` | gemme **verte** (#33c27a), taille **hexagonale**, une pointe en haut et une en bas |
| `gem-3.png` | gemme **jaune doré** (#f6b92e), taille **triangle** pointe en haut |
| `gem-4.png` | gemme **violette** (#a970f2), taille **étoile à cinq branches**, pointe en haut |
| `gem-0-r2.png` | rang 2, « gemme chargée » : la même gemme rouge, même silhouette et même taille, **allumée de l'intérieur** (cœur blanc-rose lumineux, liseré blanc brillant, deux ou trois petites étincelles collées à elle) |
| `gem-0-r3.png` | rang 3, « joyau » : la même gemme rouge **sertie dans une monture en or ornée** (chaton et 4 griffes), un peu plus lumineuse |
| `gem-0-r4.png` | rang 4, « couronne » : la même gemme rouge, sertie, **surmontée d'une petite couronne d'or** ; c'est le trésor suprême, le plus brillant |
| `fx-burst.png` | éclat d'explosion cartoon : étoile de 8 à 10 rayons, cœur blanc, puis jaune, puis orange |
| `fx-sparkle.png` | étincelle à 4 branches, blanche, avec une lueur douce |
| `fx-ring.png` | onde de choc : un **anneau** fin et lumineux, blanc doré, à lueur douce, centre **vide et transparent** |
| `fx-comet.png` | comète : tête ronde blanc-bleu lumineuse **à droite**, traînée qui s'effile vers la gauche, sur toute la largeur |

## Style (le plus important)
- **Le style de `ref-decor.png`** (le décor de la vignette du jeu) : cartoon de jeu mobile, formes franches, couleurs
  vives, dégradés doux.
- **Des gemmes brillantes de jeu « match-3 » mobile**, du niveau de Candy Crush ou Royal Match :
  - facettes nettes et peu nombreuses, un grand reflet blanc en haut à gauche ;
  - un contour plus sombre **de la même teinte** que la gemme, jamais noir.
- **Lisibles en tout petit.** Une gemme s'affiche à environ 45 px sur un téléphone. Silhouette franche, peu de détails
  fins, fort contraste entre les facettes claires et sombres.
- **Les silhouettes du tableau sont obligatoires.** Chaque couleur garde sa forme, pour que le jeu reste jouable sans
  distinguer les couleurs. Garde aussi les teintes indiquées : ce sont celles du jeu, et elles doivent rester bien
  distinctes entre elles.
- **Un rang doit se lire sans la couleur** : rien → lumière intérieure → monture d'or → couronne d'or. La monture et la
  couronne seront réutilisées à l'identique sur les autres couleurs dans la série complète. Dessine-les donc
  neutres : de l'or, sans rouge dedans.
- **Les effets sont blancs, dorés ou bleus** (jamais de la couleur d'une gemme), car ils passent par-dessus toutes les
  gemmes.

## Format
- PNG **512 × 512**, **fond transparent**, sujet centré.
- **Gemmes** : la gemme occupe environ 80 % du cadre. Les rangs 3 et 4 tiennent entièrement dans le cadre, couronne
  comprise, et la gemme y reste à peu près au même endroit et à la même taille que dans `gem-0`.
- **Pas d'ombre portée hors de l'objet**, pas de sol, pas de décor, aucun texte.

## Contexte
Lis seulement, dans `.collab/out/0041/` : `ref-decor.png` (le style), `ref-plateau.png` (le plateau actuel, ses
formes et ses couleurs) et `ref-rangs.png` (les rangs actuels, dessinés à plat). Pas besoin d'explorer le dépôt.

## Critères d'acceptation
- 12 PNG 512 × 512 à fond transparent, avec les noms exacts.
- Silhouettes et teintes du tableau respectées.
- Les rangs alignés sur `gem-0`.
- Dans la réponse, une ligne pour signaler ce qui n'a pas pu être respecté.

## Réponse

### Codex — 2026-10-25 09:16 (via codex-agent.mjs)

12 PNG transparents produits avec l’outil intégré `imagegen`, une génération par image, puis redimensionnés en 512 × 512. Silhouettes des cinq gemmes respectées ; centre de l’anneau transparent.

Prompts : gemmes cartoon brillantes à facettes contrastées, reflet blanc supérieur gauche ; rangs dérivés du rouge avec lumière intérieure, sertissage à quatre griffes, puis couronne ; effets explosion, étincelle, anneau et comète.

Limites : alignement des rangs approximatif, gemme couronnée légèrement réduite ; rang 2 avec motif de cœur explicite ; anneau plus orné et étincelle plus colorée que demandé. Teintes hexadécimales non garanties.

Fichiers écrits — tous **512 × 512 px** :

- `.collab/out/0041/gem-0.png`
- `.collab/out/0041/gem-1.png`
- `.collab/out/0041/gem-2.png`
- `.collab/out/0041/gem-3.png`
- `.collab/out/0041/gem-4.png`
- `.collab/out/0041/gem-0-r2.png`
- `.collab/out/0041/gem-0-r3.png`
- `.collab/out/0041/gem-0-r4.png`
- `.collab/out/0041/fx-burst.png`
- `.collab/out/0041/fx-sparkle.png`
- `.collab/out/0041/fx-ring.png`
- `.collab/out/0041/fx-comet.png`

## Suite

### Claude — 2026-10-25
Essai vérifié sur une planche et en bande de 48 px : les silhouettes et les teintes sont respectées, tout reste lisible à
la taille du téléphone. Retenus tels quels : les 5 gemmes, `gem-0-r3` et les 4 effets. Refaits dans 0042 : le rang 2,
qui avait un cœur, et la couronne, trop petite. Ticket clos.
