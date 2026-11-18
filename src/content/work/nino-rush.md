---
title: Nino Rush - 2026
publishDate: 2026-11-18 00:00:00
img: /assets/nino-rush-work/cover.webp
img_alt: Nino Rush — Nino, le panda roux aventurier, bondit au-dessus d'une prairie en ramassant des pièces
role: Développeur
org: Ludiven Studio
appPage: /nino-rush/
appPageLabel: Découvrir le jeu
description: |
  Un jeu de plateforme physique où Nino, un panda roux, se roule en boule et fonce dans cent niveaux. Chaque niveau est écrit comme une recette, construit par un générateur et gardé seulement si un robot le termine d'une traite, avec chacune de ses étoiles, dans la vraie physique du jeu.
tags:
  - Unity 6
  - C#
  - Physique
  - Génération de niveaux
  - Solveur
  - Tests
  - Android
  - iOS
galleryTitle: Le jeu en images
galleryLayout: wide
gallery:
  - src: /assets/nino-rush-work/level-rest.webp
    alt: "Nino au repos dans un niveau du labo"
  - src: /assets/nino-rush-work/last-leap.webp
    alt: "Le saut final : un tremplin et un anneau lancent Nino vers l'étoile du haut"
  - src: /assets/nino-rush-work/burrow.webp
    alt: "Dans un terrier, sous le sol du niveau"
  - src: /assets/nino-rush-work/hat.webp
    alt: "Nino et son chapeau de cowboy, dans la forêt"
  - src: /assets/nino-rush-work/graph.webp
    alt: "Le graphe d'un niveau : le côté à tenir sur chaque passage, et les détours vers les étoiles"
---
<p>
  Cette page raconte la <strong>fabrication</strong> de Nino Rush. Pour le jeu lui-même, la
  <a href="/nino-rush/">page du jeu</a> est faite pour ça.
</p>

<h2>Des niveaux prouvés par un robot</h2>
<p>
  Aucun niveau n'est dessiné à la main. Chacun est une <strong>recette</strong> de quelques mots&nbsp;: un départ
  en hauteur, un anneau, une galerie de terrier, un saut final. Un générateur en tire le relief, les pièces et
  les étoiles. Un robot cherche ensuite le chemin, décision par décision, dans la vraie physique du jeu. Le niveau
  n'est gardé que si une seule course, sans aucune coupure, atteint le terrier et chacune des trois étoiles.
  L'empreinte exacte de chaque pas des cent parcours est enregistrée&nbsp;: un changement qui en déplacerait un
  seul est refusé par les tests.
</p>

<h2>Un graphe plutôt qu'un niveau simplifié</h2>
<p>
  Quand le robot ne trouvait pas son chemin, la tentation était de simplifier le niveau. La règle est inverse&nbsp;:
  on ne change jamais un niveau pour le robot. Le générateur pose donc, avec chaque passage, le côté à tenir et
  la façon d'y aller, comme le graphe de navigation d'un jeu en 3D. Le robot le suit, et un pilote du jeu le lit
  à chaque instant pour rejouer les niveaux et les filmer.
</p>

<h2>Des niveaux à explorer</h2>
<p>
  Dans les niveaux du nouveau style, les étoiles suivent une règle simple&nbsp;: une facile au début, une plus
  dure vers la fin, et une cachée qu'il faut aller chercher en explorant. Les terriers, creusés comme une
  fourmilière, ne tuent jamais, et le niveau finit par un grand saut à tenter le plus haut possible. En novembre 2026, Nino a été redessiné&nbsp;:
  l'ancienne boule de peluche est devenue un aventurier, foulard et sac au dos.
</p>
