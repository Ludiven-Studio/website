---
hidden: true
title: Dominoland - 2026
publishDate: 2026-11-26 00:00:00
img: /assets/dominoland/stage.webp
img_alt: Dominoland — la vague a fait tomber les dominos, et un soleil souriant apparaît
role: Développeur
org: Ludiven Studio
appPage: /dominoland/
appPageLabel: Découvrir le jeu
description: |
  Un jeu mobile où l'on trace des lignes de dominos au doigt : la vague les fait tomber, et les pièces tombées forment un dessin. Les règles tournent en C# pur, sans le moteur, et un solveur fixe pour chaque tableau la boîte de dominos et les étoiles. Bientôt sur l'App Store et Google Play.
tags:
  - Unity 6
  - C#
  - Solveur
  - Tests
  - Android
  - iOS
galleryTitle: Le jeu en images
galleryLayout: phone
gallery:
  - src: /assets/dominoland/screen-1-fr.webp
    alt: "Tracé 1 : la boîte de 30 dominos, le domino doré et les morceaux de l'image à atteindre"
  - src: /assets/dominoland/screen-2-fr.webp
    alt: "Trois étoiles : la vague a fait tomber les morceaux, et un soleil souriant apparaît"
  - src: /assets/dominoland/screen-3-fr.webp
    alt: "Le Rythme : la vague court le long d'un parcours en zigzag"
  - src: /assets/dominoland/screen-4-fr.webp
    alt: "Chaîne parfaite : au bout du parcours, une lune se dessine"
---
<p>
  Cette page raconte la <strong>fabrication</strong> de Dominoland. Pour le jeu lui-même, la
  <a href="/dominoland/">page du jeu</a> est faite pour ça.
</p>

<h2>Des règles sans le moteur</h2>
<p>
  Les règles du Tracé et du Rythme sont écrites en C# pur, sans aucune référence à Unity. Le Tracé est né d'un
  prototype en JavaScript&nbsp;: un outil en ligne de commande rejoue les mêmes tableaux des deux côtés et vérifie
  que le résultat est identique, domino par domino. Un changement de règle qui ferait diverger les deux est refusé.
</p>

<h2>Un solveur pour chaque tableau</h2>
<p>
  Pour chaque tableau, un solveur cherche le plus petit nombre de dominos qui découvre tout le dessin, et un
  joueur naïf simulé compte ce qu'il en poserait. La taille de la boîte et les seuils des deuxième et troisième
  étoiles se calculent à partir de ces deux nombres&nbsp;: aucun n'est choisi à la main.
</p>

<h2>Des dessins et des notes</h2>
<p>
  La plupart des dessins du Rythme sont tirés d'emojis libres, réduits à 22 cases sur 20 et recolorés. Les instruments sont
  joués note par note depuis une banque de sons libre. Des tests jouent les niveaux jusqu'au dessin, puis
  photographient chaque écran dans les cinq langues, sur un téléphone à encoche et sur une tablette.
</p>
