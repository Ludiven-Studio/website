---
title: Pétanque Scanner - 2026
publishDate: 2026-08-22 00:00:00
img: /assets/petanque-ar/hero.avif
img_alt: Pétanque Scanner — measure the point with your phone, in augmented reality
role: Developer
org: Ludiven Studio
description: |
  Measuring how far each boule sits from the jack with nothing but a phone — no depth sensor, no marker on the ground. A detector trained entirely on synthetic images, triangulation by accumulated rays, and three experiments written up, two of which failed.
tags:
  - Unity
  - AR Foundation
  - Computer vision
  - YOLOX
  - Synthetic data
  - ONNX
  - Android
  - iOS
galleryTitle: The app in use
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
  This page covers the <strong>engineering behind</strong> Pétanque Scanner. If you're after the app
  itself — what it does, what it costs, where to get it — the
  <a href="/en/petanque-scanner/">app page</a> is the one you want.
</p>

<h2>The problem</h2>
<p>
  Measuring the gap between boules and the jack needs a 3D position down to the millimetre, on
  uneven ground. With nothing but a phone, none of the obvious routes hold up: a single image carries no
  scale, and depth APIs vary too much between devices to be trusted on fine gravel at a metre and a half.
  Placing a marker on the ground would fix the scale, but it would force an accessory on the player —
  which is precisely what the app is meant to replace.
</p>

<h2>The approach: accumulate rays</h2>
<p>
  The user's natural movement becomes the source of information. Every camera frame runs through an object
  detector that finds the boules and the jack in 2D. Each detection is turned into a
  <strong>ray cast from the camera</strong>, whose pose comes from AR Foundation (ARCore&nbsp;/&nbsp;ARKit).
  Walking around the game accumulates dozens of rays from different viewpoints, and where they intersect
  is the 3D position of a boule.
</p>
<p>
  The by-product is as useful as the result: <strong>how tightly the rays converge is a free confidence
  metric</strong>. Rays that cross cleanly mean a reliable position; scattered rays mean an unstable
  detection. That is the score shown live during the scan, and it is what stops the app from announcing a
  wrong number with confidence.
</p>
<p>
  Worth stating plainly: <strong>the app displays the millimetre, it does not guarantee it</strong>. The
  resolution of a number is not its accuracy: accuracy tops out at a few millimetres in good conditions,
  and degrades as soon as the boules are poorly seen. That is exactly what the confidence score is for:
  saying when the millimetre on screen means anything.
</p>

<h2>The data: fully synthetic</h2>
<p>
  Shooting and hand-labelling a dataset covering every surface, every lighting condition and every finish
  of boule was not realistic for one person. So the training set is <strong>rendered in Unity</strong>,
  with domain randomisation and pixel-exact labels produced by the engine — no manual annotation at all.
</p>
<p>
  A first pass on real photos set the floor: across 471 cleaned photos, moving from YOLOX tiny&nbsp;@416 to
  YOLOX-s&nbsp;@640 was worth <strong>+9.25 mAP@.50:.95</strong> (67.19 → 76.44), and confirmed along the
  way that model capacity mattered more than resolution, augmentation or epoch count.
</p>

<h2>What worked, and what failed</h2>
<p>
  Synthetic data turned out to be far less obliging than expected. Three experiments, one win and two
  losses:
</p>
<ul>
  <li><strong>+1500 simple synthetic scenes: a win.</strong> Roughly +3.5 AP on the jack, the class that
  bottlenecks everything else.</li>
  <li><strong>A richer generator with decor and clutter: a loss.</strong> The intent was to bring the
  renders closer to a real scene. It scored worse than the simple generator.</li>
  <li><strong>1500 scenes built around jack occlusion: a loss.</strong> And this is the dominant failure
  case. Jack recall dropped to 86.1% against 88.9% for the incumbent model. Experiment abandoned, model
  never shipped.</li>
</ul>
<p>
  The lesson I take from it: with synthetic data, <strong>covering the distribution pays and targeting
  the hard cases punishes</strong>. I ran the occlusion experiment a second time, convinced I had botched
  the first — the "mine the hard examples" instinct is stubborn, and it was wrong here.
</p>

<h2>The shipped model</h2>
<p>
  The on-device model is a YOLOX-s at 448&nbsp;px, exported to ONNX (34&nbsp;MB) and run by OpenCV DNN on
  the phone. It is evaluated on a validation set deliberately built to match real use: photos taken with a
  phone held over the pitch — not images scraped from the web, which over-represent competition shots and
  product photography.
</p>
<table>
  <thead>
    <tr><th>Class</th><th>Recall</th><th>Precision</th></tr>
  </thead>
  <tbody>
    <tr><td>Boule</td><td>99.4%</td><td>100%</td></tr>
    <tr><td>Jack</td><td>88.9%</td><td>91.4%</td></tr>
  </tbody>
</table>
<p>
  Methodology: confidence threshold 0.25, IoU&nbsp;&gt;&nbsp;0.5, greedy one-to-one matching against ground
  truth. <strong>The validation set holds only 34 photos</strong> — enough to pick between two models, not
  enough to publish as a definitive figure, and the first thing I would grow.
</p>
<p>
  The remaining jack failures are nearly all the same two: too small in frame, or hidden behind a boule.
  That is an acceptable limit here because the app does not work on a single image but on a sequence — a
  missed frame is caught by the next ones.
</p>

<h2>The robustness work</h2>
<p>
  Most of the development time went not into the model but around it: clustering successive detections
  into distinct boules, locking the scene onto the ground plane, filtering shaky poses before they
  pollute the accumulation, and offering a "magnet" mode to nudge a boule back into place when the light
  plays tricks. That is the gap between a demo that works and an app you're willing to publish.
</p>

<h2>On-device constraints</h2>
<p>
  Everything runs on the phone: no image is uploaded, and there is neither a server nor a user account.
  The price is binary size — the ONNX models discarded along the way were pulled out of the shipped
  assets, giving about <strong>145&nbsp;MB</strong> back to the APK.
</p>

<h2>Availability</h2>
<p>
  The app is available on <strong>Android</strong> and <strong>iOS</strong>:
</p>
<div class="store-badges">
  <a href="https://play.google.com/store/apps/details?id=com.raphbenpro.petanquear&hl=en" target="_blank" rel="noopener">
    <img class="badge-play" src="/assets/badges/google-play-en.png" alt="Get it on Google Play">
  </a>
  <a href="https://apps.apple.com/app/id6670211733" target="_blank" rel="noopener">
    <img class="badge-appstore" src="/assets/badges/app-store-en.svg" alt="Download on the App Store">
  </a>
</div>
<p>
  See also: the <a href="/en/petanque-scanner/">app page</a>, its
  <a href="/petanque-ar/confidentialite">privacy policy</a> and
  <a href="/petanque-ar/cgu">terms of use</a>.
</p>
