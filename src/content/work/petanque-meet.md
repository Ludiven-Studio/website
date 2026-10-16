---
title: Pétanque Meet - 2026
publishDate: 2026-10-16 00:00:00
img: /assets/petanque-meet/hero.webp
img_alt: Pétanque Meet — trouve des joueurs de pétanque près de chez toi
role: Développeur
org: Ludiven Studio
appPage: /petanque-meet/
description: |
  Projet en cours. La carte des parties et des concours de pétanque, sur le web et en appli mobile : un seul serveur pour les deux, des comptes Apple et Google, du contenu public à modérer, et une interface Unity générée par script.
tags:
  - Unity
  - Supabase
  - TypeScript
  - Astro
  - React
  - Python
  - Android
  - iOS
galleryTitle: L'application
galleryLayout: phone
gallery:
  - src: /assets/petanque-meet/screen-01.webp
    alt: "La carte : les parties qui cherchent des joueurs et les concours des clubs"
  - src: /assets/petanque-meet/screen-02.webp
    alt: "Une partie : le terrain, l'heure, le format et qui joue déjà"
  - src: /assets/petanque-meet/screen-03.webp
    alt: "Un concours de club, avec son affiche et le numéro de l'organisateur"
  - src: /assets/petanque-meet/screen-04.webp
    alt: "Poser une partie : le terrain, l'heure, le format et le nombre de joueurs"
  - src: /assets/petanque-meet/screen-05.webp
    alt: "L'agenda : les parties organisées, celles rejointes et les concours suivis"
  - src: /assets/petanque-meet/screen-06.webp
    alt: "La même carte en thème sombre"
---
<p>
  Cette page décrit la <strong>démarche technique</strong> derrière Pétanque Meet, un projet
  <strong>en cours</strong>&nbsp;: l'appli est en cours de publication sur le Play Store et l'App Store.
  Pour trouver une partie, la <a href="/petanque-meet/">carte des parties</a> est faite pour ça.
</p>

<h2>Le besoin</h2>
<p>
  Envie de jouer, mais personne pour compléter la doublette&nbsp;? Les parties entre amis
  s'organisent au téléphone, et les concours des clubs sur des affiches au boulodrome. Pétanque Meet
  met les deux sur une même carte&nbsp;: les parties qui cherchent des joueurs, combien il en manque,
  et les concours à venir avec leur affiche.
</p>

<h2>Un seul serveur pour le site et l'appli</h2>
<p>
  La carte est d'abord née sur ce site, puis l'appli Unity est venue la compléter. Les deux parlent
  au <strong>même serveur</strong>&nbsp;: une fonction Supabase (Edge Function, en TypeScript) est le seul
  point d'entrée. Les tables n'ont aucune règle d'accès publique, seule cette fonction les lit et les
  écrit. Une partie posée dans l'appli apparaît sur le site, et inversement.
</p>
<p>
  La fonction porte toutes les règles&nbsp;: validation, places restantes, limites anti-abus par joueur
  et par adresse IP hachée. Ses messages de refus sont rédigés en français, et l'appli les affiche tels
  quels. Les recopier dans l'appli aurait créé une deuxième source de vérité, qui aurait divergé le jour
  où le serveur ajoute un cas.
</p>

<h2>Regarder sans compte, agir avec un compte</h2>
<p>
  La carte se consulte librement. Poser une partie, s'inscrire, suivre un concours ou signaler demande
  un compte&nbsp;: «&nbsp;Se connecter avec Apple&nbsp;» sur iPhone, Google sur Android (dans le
  navigateur, avec PKCE). Les premières parties dataient d'avant les comptes et reposaient sur un
  identifiant d'appareil et un secret par partie&nbsp;: l'appli envoie encore les deux tant que ces
  parties n'ont pas expiré, pour que personne ne perde la main sur la sienne.
</p>

<h2>Du contenu public, donc de la modération</h2>
<ul>
  <li>Les prénoms et les textes des concours sont vérifiés par le serveur&nbsp;: ni lien, ni balisage.</li>
  <li>Une affiche reste privée tant qu'un modérateur ne l'a pas validée.</li>
  <li>Chaque partie et chaque concours a «&nbsp;Signaler ou masquer&nbsp;», qui peut aussi masquer
  toutes les parties d'un organisateur.</li>
  <li>Le compte se supprime depuis l'appli&nbsp;: les parties à venir sont annulées et le prénom
  disparaît.</li>
</ul>

<h2>Une interface Unity écrite en Python</h2>
<p>
  Les écrans de l'appli ne sont pas montés à la main dans l'éditeur Unity. Chaque écran est décrit par
  un script Python, puis construit en prefab par <strong>PrefabFusion</strong>, l'outil maison de
  Ludiven Studio. Les scripts imposent une charte (tailles de texte, grille, rayons, rôles de couleur)&nbsp;:
  aucune taille ni couleur n'est écrite en dur. Changer une marge ou une teinte se fait une fois, et tous
  les écrans suivent. C'est ce qui rend possibles <strong>cinq palettes, chacune en clair et en
  sombre</strong>.
</p>

<h2>Vie privée</h2>
<p>
  La position GPS ne quitte jamais le téléphone&nbsp;: le centrage de la carte et les distances sont
  calculés sur l'appareil. Les rappels avant une partie sont des notifications locales, sans jeton envoyé
  à un serveur. La mesure d'audience (Umami) est anonyme et sans cookie&nbsp;: des codes fixes, sans
  identifiant de compte ni d'appareil.
</p>

<h2>Cinq langues, vérifiées</h2>
<p>
  Les textes vivent dans un tableur traduit en français, anglais, espagnol, allemand et italien. Un
  script en exporte le fichier lu par l'appli, et un autre bloque la livraison s'il manque une clé, si un
  texte français traîne dans le code, ou si un caractère n'existe pas dans la police embarquée. Le carré
  vide à la place d'un «&nbsp;ß&nbsp;» se voit avant la publication, pas après.
</p>

<h2>Où en est le projet</h2>
<p>
  La carte web est en ligne. L'appli Android se télécharge déjà depuis la
  <a href="/petanque-meet/telecharger/">page de téléchargement</a>, et la publication sur le Play Store
  et l'App Store est en cours.
</p>
<p>
  Voir aussi&nbsp;: la <a href="/petanque-meet/">carte des parties</a>, la
  <a href="/petanque-meet/confidentialite/">politique de confidentialité</a> et les
  <a href="/petanque-meet/cgu/">conditions d'utilisation</a>.
</p>
