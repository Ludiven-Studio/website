---
title: Pétanque Scanner - 2026
publishDate: 2026-08-22 00:00:00
img: /assets/petanque-ar/hero.avif
img_alt: Pétanque Scanner — mesurer le point au centimètre avec son téléphone
role: Développeur
org: Ludiven Studio
description: |
  Mesurer une distance au centimètre sur un terrain de pétanque avec un simple téléphone, sans capteur de profondeur ni repère posé au sol. Détecteur de vision entraîné entièrement sur images de synthèse, triangulation par accumulation de rayons, et le journal des expériences — y compris celles qui ont échoué.
tags:
  - Unity
  - AR Foundation
  - Vision par ordinateur
  - YOLOX
  - Données synthétiques
  - ONNX
  - Android
  - iOS
galleryTitle: L'application en situation
galleryLayout: phone
gallery:
  - src: /assets/petanque-ar/screen-01.webp
    alt: Scan en cours — trois boules mesurées à 15,1 cm, 19,0 cm et 28,3 cm du cochonnet
  - src: /assets/petanque-ar/screen-02.webp
    alt: Autre configuration de boules, avec le classement des distances affiché en réalité augmentée
  - src: /assets/petanque-ar/screen-03.webp
    alt: Écran Premium — regarder une publicité pour recharger ses scans, ou passer en Premium à vie
  - src: /assets/petanque-ar/premium.webp
    alt: Visuel Premium à vie — mesures illimitées et sans publicité
---
<p>
  Cette page décrit la <strong>démarche technique</strong> derrière Pétanque Scanner. Si vous cherchez
  l'application elle-même — ce qu'elle fait, ce qu'elle coûte, où la télécharger — la
  <a href="/petanque-scanner/">page de l'application</a> est faite pour ça.
</p>

<h2>Le problème</h2>
<p>
  Mesurer l'écart entre deux boules et un cochonnet demande une position 3D, au centimètre, sur un sol
  irrégulier. Avec un téléphone seul, aucune des voies évidentes ne tient&nbsp;: une image unique ne
  donne aucune échelle, et les API de profondeur varient trop d'un appareil à l'autre pour être fiables
  sur du gravier fin à un mètre cinquante. Poser un marqueur au sol réglerait l'échelle, mais imposerait
  au joueur un accessoire — c'est exactement ce que l'application est censée remplacer.
</p>

<h2>L'approche&nbsp;: accumuler des rayons</h2>
<p>
  Le geste naturel de l'utilisateur devient la source de l'information. Chaque image de la caméra passe
  dans un détecteur d'objets qui repère les boules et le cochonnet en 2D. Chaque détection est convertie
  en un <strong>rayon partant de la caméra</strong>, dont la pose est fournie par AR Foundation
  (ARCore&nbsp;/&nbsp;ARKit). En tournant autour du jeu, on accumule des dizaines de rayons issus de
  points de vue différents&nbsp;: leur intersection donne la position 3D de chaque boule.
</p>
<p>
  Le sous-produit est aussi utile que le résultat&nbsp;: <strong>le degré de convergence des rayons est
  une mesure de confiance gratuite</strong>. Des rayons qui se croisent proprement signifient une position
  fiable&nbsp;; des rayons dispersés signalent une détection instable. C'est cet indice qui s'affiche en
  direct pendant le scan, et il évite d'annoncer un chiffre faux avec aplomb.
</p>

<h2>Les données&nbsp;: tout en synthèse</h2>
<p>
  Constituer et annoter à la main un jeu de données couvrant toutes les surfaces, toutes les lumières et
  toutes les finitions de boules n'était pas réaliste en solo. Le jeu d'entraînement est donc
  <strong>rendu dans Unity</strong>, avec randomisation de domaine et des annotations exactes au pixel
  produites par le moteur — aucune annotation manuelle.
</p>
<p>
  Un premier passage sur photos réelles a d'abord servi de socle&nbsp;: sur 471 photos nettoyées, passer
  de YOLOX tiny&nbsp;@416 à YOLOX-s&nbsp;@640 a rapporté <strong>+9,25 points de mAP@.50:.95</strong>
  (67,19 → 76,44), en confirmant au passage que la capacité du modèle comptait davantage que la
  résolution, l'augmentation ou le nombre d'époques.
</p>

<h2>Ce qui a marché, et ce qui a échoué</h2>
<p>
  Les données synthétiques se sont révélées beaucoup moins dociles que prévu. Trois expériences, une
  réussie et deux ratées&nbsp;:
</p>
<ul>
  <li><strong>+1500 scènes synthétiques simples&nbsp;: gain.</strong> Environ +3,5 points d'AP sur le
  cochonnet, la classe qui limite tout le reste.</li>
  <li><strong>Un générateur enrichi en décor et objets parasites&nbsp;: perte.</strong> L'idée était de
  rapprocher les rendus d'une scène réelle. Le résultat a été moins bon que le générateur simple.</li>
  <li><strong>1500 scènes centrées sur l'occlusion du cochonnet&nbsp;: perte.</strong> C'est pourtant le
  cas d'échec dominant. Le rappel sur cochonnet est descendu à 86,1&nbsp;% contre 88,9&nbsp;% pour le
  modèle en place. Expérience abandonnée, modèle non déployé.</li>
</ul>
<p>
  La leçon que j'en tire&nbsp;: en synthèse, <strong>couvrir la distribution paie, et cibler les cas
  difficiles punit</strong>. J'ai relancé l'expérience d'occlusion une deuxième fois, convaincu d'avoir
  raté quelque chose au premier essai — le réflexe «&nbsp;il faut miner les exemples durs&nbsp;» est
  tenace, et il était faux ici.
</p>

<h2>Le modèle déployé</h2>
<p>
  Le modèle embarqué est un YOLOX-s à 448&nbsp;px, exporté en ONNX (34&nbsp;Mo) et exécuté par OpenCV DNN
  sur l'appareil. Il est évalué sur un jeu de validation volontairement représentatif de l'usage réel&nbsp;:
  des photos prises au téléphone, tenu au-dessus du terrain — et non des images collectées sur le web,
  qui surreprésentent les plans de compétition et les photos produits.
</p>
<table>
  <thead>
    <tr><th>Classe</th><th>Rappel</th><th>Précision</th></tr>
  </thead>
  <tbody>
    <tr><td>Boule</td><td>99,4&nbsp;%</td><td>100&nbsp;%</td></tr>
    <tr><td>Cochonnet</td><td>88,9&nbsp;%</td><td>91,4&nbsp;%</td></tr>
  </tbody>
</table>
<p>
  Méthodologie&nbsp;: seuil de confiance 0,25, IoU&nbsp;&gt;&nbsp;0,5, appariement glouton un-à-un avec la
  vérité terrain. <strong>Le jeu de validation ne compte que 34 photos</strong> — assez pour trancher entre
  deux modèles, pas pour publier un chiffre définitif, et c'est la première chose que j'élargirais.
</p>
<p>
  Les échecs restants sur le cochonnet sont presque tous les mêmes&nbsp;: trop petit dans l'image, ou
  masqué par une boule. C'est une limite acceptable ici parce que l'application ne travaille pas sur une
  image isolée mais sur une séquence&nbsp;: une frame ratée est rattrapée par les suivantes.
</p>

<h2>Le travail de robustesse</h2>
<p>
  L'essentiel du temps de développement n'est pas passé dans le modèle, mais autour&nbsp;: regrouper des
  détections successives en boules distinctes, verrouiller la scène sur le plan du sol, filtrer les poses
  tremblantes avant qu'elles ne polluent l'accumulation, et offrir un mode
  «&nbsp;magnétise&nbsp;» pour recaler une boule à la main quand la lumière joue des tours. C'est ce qui
  sépare une démonstration qui marche d'une application qu'on ose publier.
</p>

<h2>Contraintes d'embarqué</h2>
<p>
  Tout tourne sur le téléphone&nbsp;: aucune image n'est envoyée, il n'y a ni serveur ni compte
  utilisateur. Le prix à payer est le poids du binaire — les modèles ONNX écartés au fil des expériences
  ont été sortis des assets embarqués, ce qui a rendu environ <strong>145&nbsp;Mo</strong> à l'APK.
</p>

<h2>Disponibilité</h2>
<p>
  L'application est disponible sur <strong>Android</strong> et <strong>iOS</strong>&nbsp;:
</p>
<div class="store-badges">
  <a href="https://play.google.com/store/apps/details?id=com.raphbenpro.petanquear&hl=fr" target="_blank" rel="noopener">
    <img class="badge-play" src="/assets/badges/google-play-fr.png" alt="Disponible sur Google Play">
  </a>
  <a href="https://apps.apple.com/fr/app/petanque-scanner/id6670211733" target="_blank" rel="noopener">
    <img class="badge-appstore" src="/assets/badges/app-store-fr.svg" alt="Télécharger dans l'App Store">
  </a>
</div>
<p>
  Voir aussi&nbsp;: la <a href="/petanque-scanner/">page de l'application</a>, sa
  <a href="/petanque-ar/confidentialite">politique de confidentialité</a> et ses
  <a href="/petanque-ar/cgu">conditions d'utilisation</a>.
</p>
