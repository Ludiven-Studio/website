---
title: Félicité Smart Data Services - 2023
publishDate: 2023-12-15 00:00:00
img: /assets/U2P-Platform.jpg
img_alt: Félicité WebGL app
role: Unity / web developer
org: U2P
description: |
  A tool to show the spaces of a large facility in 3D: a big building is split into blocks, each block into floors.
  Every floor then opens up to reveal its rooms and display temperature, light or energy readings through a preset colour code.
tags:
  - Unity
  - WebGL
  - AssetBundles
  - Javascript
  - JSON
---

<a href ="https://felicite-sds.opencaps.io/login-sso" target="_blank">Félicité Smart Data Services</a>, built by
<a href="https://www.opencaps.io/" target="_blank"> OpenCaps</a>, lets you navigate a group of buildings named "Félicité".
I built the 3D part of that navigation with Unity in WebGL, embedded in a VueJS site.
Unity and VueJS talk to each other through JSON messages, to receive the data to display and to react to what the user does.

<div>
  <p>
    <ul>
      <li>Camera control to orbit, zoom or snap to preset views
      <li>The camera smoothly frames whichever block is selected
      <li>Building blocks defined and opened from JSON files
      <li>Hover labels showing each block's readings
      <li>Blocks and spaces coloured according to the incoming data
      <li>Sun-like lighting driven by the timestamp of the data
      <li>AssetBundles used to download the objects of each floor
    </ul>
  </p>
</div>
