---
title: Pétanque Scanner - 2026
publishDate: 2026-08-22 00:00:00
img: /assets/petanque-ar/hero.avif
img_alt: Pétanque Scanner — mesurer le point au centimètre avec son téléphone
role: Développeur
org: Ludiven Studio
description: |
  Application mobile de réalité augmentée qui tranche les fins de mène : on tourne autour des boules, l'IA embarquée les reconnaît, et l'app affiche la distance au cochonnet au centimètre près.
tags:
  - Unity
  - AR Foundation
  - IA embarquée
  - Android
  - iOS
  - Pétanque
galleryTitle: L'application en images
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
  Fin de mène, deux boules au ras du cochonnet, et personne autour du terrain n'est d'accord.
  <strong>Pétanque Scanner</strong> tranche&nbsp;: on lance un scan, on tourne autour des boules quelques
  secondes, et l'application affiche la distance de chaque boule au cochonnet, au centimètre près,
  posée en réalité augmentée sur le terrain.
</p>

<h2>Comment ça marche</h2>
<p>
  Pas de mètre ruban, pas de serveur. Chaque image de la caméra passe dans un détecteur d'objets
  <strong>YOLOX embarqué</strong> (ONNX, exécuté par OpenCV DNN) qui repère les boules et le cochonnet.
  Chaque détection devient un rayon partant de la caméra, dont la pose est fournie par
  <strong>AR Foundation</strong> (ARCore / ARKit). En tournant autour du jeu, on accumule des dizaines de
  rayons&nbsp;: leur intersection donne la position 3D de chaque boule, et le taux de convergence sert
  d'indice de confiance affiché en direct pendant le scan.
</p>
<p>
  Le reste, c'est du travail de robustesse&nbsp;: regroupement des détections en boules distinctes,
  verrouillage sur le plan du sol, filtrage des poses tremblantes, et un mode «&nbsp;magnétise&nbsp;»
  pour recaler une boule à la main quand la lumière joue des tours.
</p>

<h2>Ce qui compte</h2>
<ul>
  <li><strong>Tout est calculé sur le téléphone.</strong> Aucune image ne part vers un serveur — il n'y a d'ailleurs pas de serveur, ni de compte utilisateur.</li>
  <li><strong>Un jeu de données synthétique.</strong> Le modèle est entraîné sur des scènes générées, pas sur des photos collectées : c'est ce qui permet de couvrir tous les terrains, toutes les lumières et toutes les boules sans campagne de prise de vue.</li>
  <li><strong>Gratuit, avec 3 scans par jour</strong>, une publicité facultative pour en recharger, et un achat unique «&nbsp;Premium à vie&nbsp;» qui débloque les mesures illimitées et retire la publicité.</li>
</ul>

<h2>Disponibilité</h2>
<p>
  L'application est disponible sur le
  <a href="https://play.google.com/store/apps/details?id=com.raphbenpro.petanquear&hl=fr" target="_blank">Google Play Store</a>.
  La version iOS est en cours de validation chez Apple&nbsp;: <strong>bientôt sur l'App Store</strong>.
</p>
<p>
  À consulter également&nbsp;: la <a href="/petanque-ar/confidentialite">politique de confidentialité</a>
  et les <a href="/petanque-ar/cgu">conditions d'utilisation</a> de l'application.
</p>
