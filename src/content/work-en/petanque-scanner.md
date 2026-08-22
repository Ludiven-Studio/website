---
title: Pétanque Scanner - 2026
publishDate: 2026-08-22 00:00:00
img: /assets/petanque-ar/hero.avif
img_alt: Pétanque Scanner — measure the point to the centimetre with your phone
role: Developer
org: Ludiven Studio
description: |
  An augmented-reality mobile app that settles the end of a round: walk around the boules, the on-device AI recognises them, and the app shows each distance to the jack down to the centimetre.
tags:
  - Unity
  - AR Foundation
  - On-device AI
  - Android
  - iOS
  - Pétanque
galleryTitle: The app in pictures
galleryLayout: phone
gallery:
  - src: /assets/petanque-ar/screen-01.webp
    alt: Scan in progress — three boules measured at 15.1 cm, 19.0 cm and 28.3 cm from the jack
  - src: /assets/petanque-ar/screen-02.webp
    alt: Another layout of boules, with the distance ranking drawn in augmented reality
  - src: /assets/petanque-ar/screen-03.webp
    alt: Premium screen — watch an ad to refill your scans, or buy the lifetime Premium
  - src: /assets/petanque-ar/premium.webp
    alt: Lifetime Premium artwork — unlimited measurements, no ads
---
<p>
  End of a round, two boules within a hair of the jack, and nobody around the pitch agrees.
  <strong>Pétanque Scanner</strong> settles it: start a scan, walk around the boules for a few seconds,
  and the app shows how far each boule is from the jack — to the centimetre, drawn in augmented reality
  right on the ground.
</p>

<h2>How it works</h2>
<p>
  No tape measure, no server. Every camera frame runs through an <strong>on-device YOLOX detector</strong>
  (ONNX, executed by OpenCV DNN) that finds the boules and the jack. Each detection becomes a ray cast
  from the camera, whose pose comes from <strong>AR Foundation</strong> (ARCore / ARKit). Walking around
  the game accumulates dozens of rays: where they intersect is the 3D position of a boule, and how well
  they converge becomes the live confidence score shown during the scan.
</p>
<p>
  The rest is robustness work: clustering detections into distinct boules, locking onto the ground plane,
  filtering shaky poses, and a "magnet" mode to nudge a boule back into place when the light plays tricks.
</p>

<h2>What matters</h2>
<ul>
  <li><strong>Everything runs on the phone.</strong> No image ever leaves the device — there is no server at all, and no user account.</li>
  <li><strong>A synthetic dataset.</strong> The model is trained on generated scenes rather than collected photos, which covers every pitch, every lighting condition and every kind of boule without a photo campaign.</li>
  <li><strong>Free, with 3 scans a day</strong>, an optional ad to refill them, and a one-off "lifetime Premium" purchase that unlocks unlimited measurements and removes ads.</li>
</ul>

<h2>Availability</h2>
<p>
  The app is available on the
  <a href="https://play.google.com/store/apps/details?id=com.raphbenpro.petanquear&hl=en" target="_blank">Google Play Store</a>.
  The iOS build is in review at Apple: <strong>coming soon to the App Store</strong>.
</p>
<p>
  See also the app's <a href="/petanque-ar/confidentialite">privacy policy</a> and
  <a href="/petanque-ar/cgu">terms of use</a>.
</p>
