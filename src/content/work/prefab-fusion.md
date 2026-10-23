---
title: Prefab Fusion - Outil Unity - 2026
publishDate: 2026-10-22 00:00:00
img: /assets/prefab-fusion/cover.webp
img_alt: Les fenêtres de Prefab Fusion dans l'éditeur Unity — une partie répétée quatre fois, et sa fenêtre d'extraction
role: Développeur
org: Ludiven Studio
appPage: /prefab-fusion/
description: |
  Un outil pour l'éditeur Unity qui restructure les prefabs : les blocs copiés-collés deviennent un seul prefab imbriqué, les quasi-copies deviennent des variantes, sur place, sans perdre une valeur ni une référence. Bientôt sur l'Unity Asset Store.
tags:
  - Unity
  - Outil éditeur
  - C#
  - Prefabs
  - Asset Store
galleryTitle: L'outil en images
galleryLayout: wide
gallery:
  - src: /assets/prefab-fusion/main.webp
    alt: "Fenêtre principale : l'arbre du prefab, la partie Offer marquée ×4 car elle se répète dans le projet"
  - src: /assets/prefab-fusion/extract.webp
    alt: "Extraction : les quatre copies deviennent des instances du nouveau prefab, chacune garde ses valeurs en overrides"
  - src: /assets/prefab-fusion/variant.webp
    alt: "Variante sur place : 100 % de structure commune, 5 overrides, un enfant ajouté"
  - src: /assets/prefab-fusion/shared-parts.webp
    alt: "Scan d'un dossier : les blocs répétés entre prefabs, les plus gros gains en premier"
  - src: /assets/prefab-fusion/prefab-pairs.webp
    alt: "Scan d'un dossier : SampleCardGold pourrait être une variante de SampleCard"
---
<p>
  Cette page décrit la <strong>démarche technique</strong> derrière Prefab Fusion. Pour l'outil lui-même — ce
  qu'il fait, ce qu'il demande, où le trouver — la <a href="/prefab-fusion/">page de l'outil</a> est faite pour ça.
</p>

<h2>Le problème</h2>
<p>
  Dans un projet Unity, une interface grandit vite par copier-coller&nbsp;: un bloc dupliqué avec Ctrl+D dans dix
  écrans, un prefab copié puis retouché au lieu d'en faire une variante. Le jour où ce bloc doit changer, il faut
  le changer dix fois. Restructurer à la main coûte cher&nbsp;: chaque objet recréé change d'identifiant, et les
  références des scènes et des autres prefabs qui pointaient vers lui se cassent, overrides compris.
</p>

<h2>L'approche</h2>
<p>
  Prefab Fusion lit chaque prefab comme un arbre&nbsp;: les objets, leurs composants, et chaque champ sérialisé
  qui diffère d'un composant neuf. Deux parties ont la même structure quand leurs noms et leurs types de
  composants concordent, même si leurs textes, leurs couleurs ou leurs sprites diffèrent.
</p>
<p>
  <strong>Extraire en prefab imbriqué</strong>&nbsp;: une partie devient un prefab à part entière, et les parties de
  même structure dans les autres prefabs deviennent des instances de ce prefab, leurs propres valeurs gardées en
  overrides. <strong>Faire une variante, sur place</strong>&nbsp;: un prefab existant devient une variante d'un
  autre&nbsp;; il garde son chemin et son GUID, donc rien de ce qui l'utilise ne casse. Dans les deux cas, les
  références des scènes, des prefabs et des assets suivent les objets déplacés, overrides compris.
</p>

<h2>La sécurité d'abord</h2>
<p>
  Un outil qui réécrit des prefabs doit inspirer confiance. Rien ne change avant un aperçu complet. Les fichiers
  concernés sont sauvegardés, et les dix dernières restructurations s'annulent. Dans un dépôt git, l'outil signale
  les fichiers aux modifications non commitées. Surtout, après chaque restructuration, chaque valeur de chaque
  prefab touché est comparée à sa valeur d'avant&nbsp;: le rapport se termine par
  <code>check: every value is the same as before</code>, ou liste ce qui diffère.
</p>

<h2>Trouver quoi restructurer</h2>
<p>
  Un scan liste les blocs répétés entre les prefabs d'un dossier, et les paires de prefabs assez proches pour être
  des variantes. La première version ne comparait que les prefabs de même forme et noyait les bonnes pistes&nbsp;:
  sur un projet de 284 prefabs, 4&nbsp;999 suggestions, des objets d'un seul nœud en tête. Or deux nœuds se
  correspondent quand leurs chemins de noms concordent&nbsp;: le nombre de chemins que partagent deux prefabs borne
  donc leur score, et ce calcul très léger écarte presque toutes les paires sans espoir avant la comparaison
  complète. Sur le même projet, le scan propose désormais 88 paires, les vraies quasi-copies en tête, et il va plus
  de deux fois plus vite.
</p>

<h2>Tests</h2>
<p>
  Une suite de 53 tests automatisés tourne sans échec sous Windows, sur Unity 2022.3, 6.0, 6.3, 6.4, 6.5 et 6.6.
  Sur quatre projets réels, 687 prefabs sur 722 reviennent identiques, valeur par valeur, après un aller-retour en
  JSON&nbsp;; presque tous les autres utilisent un script absent du projet.
</p>
