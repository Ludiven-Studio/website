---
title: Dragon Gems Swipe - 2026
publishDate: 2026-10-27 00:00:00
img: /assets/dragons-gems/feature-en.webp
img_alt: Dragon Gems Swipe — Bijou, the baby dragon, on his pile of gold, in front of a board of gems
role: Developer
org: Ludiven Studio
appPage: /en/dragons-gems/
appPageLabel: Discover the app
webApp: /jeux/eclats/
webAppLabel: Play in your browser
description: |
  A gem puzzle you slide, born as a mini-game on this website and then brought to iPhone, iPad and Android. A rules engine written once in TypeScript, copied line by line into C# and kept identical by parity tests; sounds synthesised without a single audio file; screenshots and videos shot by a bot.
tags:
  - Unity 6
  - C#
  - TypeScript
  - Parity tests
  - Procedural audio
  - Android
  - iOS
galleryTitle: The app in pictures
galleryLayout: phone
gallery:
  - src: /assets/dragons-gems/screen-1-en.webp
    alt: "A level: slide the gems, set off the explosions"
  - src: /assets/dragons-gems/screen-2-en.webp
    alt: "Bijou's story, the first time you play"
  - src: /assets/dragons-gems/screen-3-en.webp
    alt: "The map of the five lands"
  - src: /assets/dragons-gems/screen-4-en.webp
    alt: "The little dragon's breath"
  - src: /assets/dragons-gems/screen-5-en.webp
    alt: "The daily challenge"
---
<p>
  This page tells how Dragon Gems Swipe is <strong>made</strong>. For the game itself — what it offers,
  what it costs, where to get it — the <a href="/en/dragons-gems/">app page</a> is the place, and the
  <a href="/jeux/eclats/">web version</a> plays right away (in French).
</p>

<h2>A mini-game first</h2>
<p>
  The game was born on this website, among its mini-games. One swipe slides the whole board to the edge, as
  in 2048; three gems of the same color that touch explode, and the board slides again. Every rule was kept
  or dropped on a measurement: a bot plays thousands of games to tell whether a variant makes more chains,
  whether a level can be won, in how many moves. The bot also picks the map's 250 levels and their move
  limits: enough for an average player to win four in five, a little less one level in ten.
</p>

<h2>One engine, two platforms</h2>
<p>
  The rules live in a pure engine written in TypeScript for the website. The app does not rewrite them: it
  <strong>copies them line by line</strong> into C#, in an assembly that knows nothing of Unity, with the same
  pseudo-random generator. A script replays the TypeScript engine on reference games and writes a parity file;
  the app's tests replay the same games and compare every state, move by move.
</p>
<p>
  The rule between the two: <strong>when a parity test fails, the port is wrong, never the file</strong>.
  That is what lets the daily challenge be the same board on the website and in the app, with a single world
  leaderboard for both.
</p>

<h2>Tests that play</h2>
<p>
  The website's bot exists in C# too. In the app's tests <strong>it plays every level</strong> to the end: an
  impossible level, or a rule broken by a change, shows up before it reaches a phone.
</p>

<h2>Sounds without files</h2>
<p>
  None of the game's sounds is a recording. The website synthesises its effects live (WebAudio); the app ports
  that code to C# and <strong>builds each sound the first time it plays</strong>, with a Freeverb-style room and
  a compressor modelled on WebAudio's. The web game and the app sound the same, without one audio file in the
  package.
</p>

<h2>A generated interface</h2>
<p>
  The app is built with Unity 6 (URP), on the studio's app template. Its screens are <strong>never edited by
  hand</strong>: editor scripts generate them, with <a href="/en/prefab-fusion/">Prefab Fusion</a>, the
  studio's tool to build and change prefabs from a description. A screen is rebuilt by running its script
  again, in the game's five languages.
</p>

<h2>Screenshots shot by a bot</h2>
<p>
  The store screenshots and the promo videos come out of play-mode tests: the bot plays at 30 frames per second
  of game time, every frame is saved, and the sounds played are logged and remixed onto the video. Redoing
  every image after a screen changes, for iPhone, iPad and Android and in each language, takes one command.
</p>
