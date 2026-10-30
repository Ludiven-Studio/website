---
title: Dragon Gems Swipe - 2026
publishDate: 2026-10-27 00:00:00
img: /assets/dragons-gems/feature-fr.webp
img_alt: Dragon Gems Swipe — Bijou, le bébé dragon, sur son tas d'or, devant un plateau de gemmes
role: Développeur
org: Ludiven Studio
appPage: /dragons-gems/
appPageLabel: Découvrir l'appli
webApp: /jeux/eclats/
webAppLabel: Jouer dans le navigateur
description: |
  Un puzzle de gemmes à glisser, né mini-jeu sur ce site puis porté en appli iPhone, iPad et Android. Un moteur de règles écrit une fois en TypeScript, recopié ligne à ligne en C# et tenu identique par des tests de parité ; des sons synthétisés sans un seul fichier audio ; des captures et des vidéos tournées par un robot.
tags:
  - Unity 6
  - C#
  - TypeScript
  - Tests de parité
  - Son procédural
  - Android
  - iOS
galleryTitle: L'application en images
galleryLayout: phone
gallery:
  - src: /assets/dragons-gems/screen-1-fr.webp
    alt: "Un niveau : glisse les gemmes, déclenche les explosions"
  - src: /assets/dragons-gems/screen-2-fr.webp
    alt: "L'histoire de Bijou, au premier lancement"
  - src: /assets/dragons-gems/screen-3-fr.webp
    alt: "La carte des cinq contrées"
  - src: /assets/dragons-gems/screen-4-fr.webp
    alt: "Le souffle du petit dragon"
  - src: /assets/dragons-gems/screen-5-fr.webp
    alt: "Le défi du jour"
---
<p>
  Cette page raconte la <strong>fabrication</strong> de Dragon Gems Swipe. Pour le jeu lui-même — ce qu'il
  propose, ce qu'il coûte, où le télécharger — la <a href="/dragons-gems/">page de l'appli</a> est faite pour
  ça, et la <a href="/jeux/eclats/">version web</a> se joue tout de suite.
</p>

<h2>Un mini-jeu d'abord</h2>
<p>
  Le jeu est né sur ce site, dans la rubrique des mini-jeux. Un geste fait glisser tout le plateau jusqu'au
  bord, comme dans 2048&nbsp;; trois gemmes de la même couleur qui se touchent explosent, et le plateau
  reglisse. Chaque règle a été gardée ou jetée sur une mesure&nbsp;: un robot joue des milliers de parties
  pour dire si une variante fait plus de chaînes, si un niveau se gagne, en combien de coups. C'est lui qui
  choisit les 250 niveaux de la carte et leur nombre de coups&nbsp;: assez pour qu'un joueur moyen en gagne
  quatre sur cinq, un peu moins un niveau sur dix.
</p>

<h2>Un seul moteur, deux plateformes</h2>
<p>
  Les règles tiennent dans un moteur pur écrit en TypeScript pour le site. L'appli ne les réécrit pas&nbsp;:
  elle les <strong>recopie ligne à ligne</strong> en C#, dans un assembly qui ne connaît rien d'Unity, avec
  le même générateur pseudo-aléatoire. Un script rejoue le moteur TypeScript sur des parties de référence et
  en tire un fichier de parité&nbsp;; les tests de l'appli rejouent les mêmes parties et comparent chaque
  état, coup par coup.
</p>
<p>
  La règle du jeu entre les deux&nbsp;: <strong>quand un test de parité échoue, c'est le portage qui a tort,
  jamais le fichier</strong>. C'est ce qui permet au défi du jour d'être le même plateau sur le site et dans
  l'appli, avec un seul classement mondial pour les deux.
</p>

<h2>Des tests qui jouent</h2>
<p>
  Le robot du site existe aussi en C#. Dans les tests de l'appli, <strong>il joue chacun des niveaux</strong>
  jusqu'au bout&nbsp;: un niveau impossible ou une règle cassée par un changement se voit avant d'arriver
  sur un téléphone.
</p>

<h2>Des sons sans fichiers</h2>
<p>
  Aucun son du jeu n'est un enregistrement. Les effets du site sont synthétisés en direct (WebAudio)&nbsp;;
  l'appli porte ce code en C# et <strong>fabrique chaque son à sa première utilisation</strong>, avec une
  réverbération de type Freeverb et un compresseur calqué sur celui de WebAudio. Le jeu web et l'appli
  sonnent donc pareil, sans un fichier audio dans le paquet.
</p>

<h2>Une interface générée</h2>
<p>
  L'appli est faite avec Unity&nbsp;6 (URP), sur le gabarit des applis du studio. Ses écrans ne sont
  <strong>jamais retouchés à la main</strong>&nbsp;: des scripts d'éditeur les génèrent, avec
  <a href="/prefab-fusion/">Prefab Fusion</a>, l'outil du studio pour construire et modifier des prefabs
  par description. Un écran se refait donc en relançant son script, dans les cinq langues du jeu.
</p>

<h2>Des captures tournées par un robot</h2>
<p>
  Les captures des stores et les vidéos de présentation sortent des tests en mode jeu&nbsp;: le robot joue
  à 30 images par seconde de temps de jeu, chaque image est enregistrée, et les sons joués sont notés puis
  remixés sur la vidéo. Refaire toutes les images après un changement d'écran, pour l'iPhone, l'iPad et
  Android et dans chaque langue, ne demande qu'une commande.
</p>
