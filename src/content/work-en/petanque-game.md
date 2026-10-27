---
title: Pétanque Game - 2026
publishDate: 2026-10-27 00:00:00
img: /assets/petanque-game/feature-en.webp
img_alt: Pétanque Game — two boules and a jack on the gravel of a village square at sunset
role: Developer
org: Ludiven Studio
appPage: /en/petanque-game/
appPageLabel: Discover the game
webApp: /jeux/petanque/
webAppLabel: Play in your browser
description: |
  A 3D pétanque game for Android and iPhone, born on this website and ported to Unity. Rules, physics and computer opponent copied line by line from TypeScript and kept identical by parity tests; online matches where only the throws travel; pitches you can read; players posed by code, with no animation files.
tags:
  - Unity 6
  - URP
  - C#
  - TypeScript
  - Parity tests
  - Netcode
  - Android
  - iOS
galleryTitle: The game in pictures
galleryLayout: phone
gallery:
  - src: /assets/petanque-game/screen-01-en.webp
    alt: "Real pétanque in 3D: roll, half lob, lob or high lob"
  - src: /assets/petanque-game/screen-02-en.webp
    alt: "Every centimetre counts: distance rings around the jack"
  - src: /assets/petanque-game/screen-03-en.webp
    alt: "Solo or in teams: singles, doubles or triples"
  - src: /assets/petanque-game/screen-04-en.webp
    alt: "Play online: with a friend, or in ranked matches"
  - src: /assets/petanque-game/screen-05-en.webp
    alt: "Four settings in Provence: choose where you play"
  - src: /assets/petanque-game/screen-06-en.webp
    alt: "Boules with character: weight, size, hardness, 14 models"
  - src: /assets/petanque-game/screen-07-en.webp
    alt: "Leagues and cups: from Bronze to Diamond, win trophies"
  - src: /assets/petanque-game/screen-08-en.webp
    alt: "The rules in pictures: six pages to get started"
---
<p>
  This page tells how Pétanque Game is <strong>made</strong>. For the game itself — what it offers, what it
  costs, when it comes out — the <a href="/en/petanque-game/">game's page</a> is the place, and the
  <a href="/jeux/petanque/">web version</a> plays right away.
</p>

<h2>From the browser to the phone</h2>
<p>
  The game started among the website's mini-games, in TypeScript and three.js. The app is built with
  Unity&nbsp;6 (URP), and its core reinvents nothing: the rules, the physics of the boules, the computer
  opponent and the sway of the hand are <strong>copied line by line</strong> into C#, in an assembly that
  knows nothing of Unity. A script runs the website's code and writes a reference file: pitch heights,
  throws run until the boules stop, the computer's plans. The app's tests replay it all and must land on the
  same numbers.
</p>
<p>
  The devil is in the details: the pitch noise relies on <code>Math.imul</code> and <code>&gt;&gt;&gt;</code>,
  which become unchecked integer arithmetic in C#; heights stay <code>float</code> because the website keeps
  them in a <code>Float32Array</code>; and <code>Math.round</code> does not round halves the way
  <code>Math.Round</code> does. Each gap shows up in a test before it shows up on the pitch.
</p>

<h2>Two phones, one match</h2>
<p>
  Online, <strong>only the throws travel</strong>: the boule's speed and where the hand lets it go, numbered
  and applied in order, over Unity Netcode and Relay. Each phone replays the throw with the same engine,
  which allows itself nothing but square roots so that both devices land on the same result. After each
  throw, the phone that opened the match sends its ruling and the other one adopts it; a phone that falls
  behind asks again for what it lacks.
</p>
<p>
  To check it, a script opens two Unity editors that play a real private match against each other through
  the online services, and must end with <strong>the same head, to the millimetre</strong>. It is what found
  the guest that never started: the session connected it before its link existed, and the start signal got
  lost.
</p>

<h2>A pitch you can read</h2>
<p>
  A pitch goes from smooth to rough: a tilt, bumps, craters from high lobs, patches of four grounds, stones
  that send a boule off, and a layer of loose gravel, thicker along the planks. The ground shader blends the
  four textures where each ground really plays, and steepens the slopes six times <strong>for the light
  only</strong>: drawn at their true size, a few centimetres per metre, the eye could not read them. The
  physics never sees that exaggeration.
</p>
<p>
  The computer, and the path shown before you let go, work on a "blind" copy of the match: without the hidden
  stones, without what nobody can read on the ground. The real throw feels them, and the same way on both
  phones.
</p>

<h2>Players with their habits</h2>
<p>
  The players are 3D bodies from Microsoft Rocketbox, posed <strong>by code on every frame</strong>, with no
  animation files: the crouch, the pointer's pendulum swing, the shot that rises onto the toes, the walk that
  keeps the foot on the ground. The stances follow photos of real players. Before each boule, everyone has a
  ritual, drawn at random and always the same: weighing the boule, wiping it, bending the knees, aiming. The
  outfits are drawn by a shader from where each point sits on the body, so any outfit fits any player, with
  no texture per combination.
</p>

<h2>Measure, don't guess</h2>
<p>
  Settings are measured by making the computer play itself. The Easy level, too hard at first, was redone on
  measurements; the leagues' entry fees and prizes come from hundreds of simulated matches; and each boule
  model (weight, diameter, hardness) faces the standard boule on three pitches, so that none is better
  everywhere.
</p>

<h2>For people who play for real</h2>
<p>
  The game is aimed at players aged 45 to 75: a single type scale, never below 15 pt, buttons of a good
  size, and contrast checked in the menus' six colour themes. The play-mode tests launch the app, play a whole
  end, take screenshots in the five languages and list <strong>every text that overflows its frame</strong>;
  the same screenshots make the store images. The game's sounds (boules knocking, the ground, the jack, the
  planks) are synthesised, as on the website, without a single audio file.
</p>
