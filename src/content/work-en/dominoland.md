---
hidden: true
title: Dominoland - 2026
publishDate: 2026-11-26 00:00:00
img: /assets/dominoland/stage.webp
img_alt: Dominoland — the wave has toppled the dominoes, and a smiling sun appears
role: Developer
org: Ludiven Studio
appPage: /en/dominoland/
appPageLabel: Discover the game
description: |
  A mobile game where you draw lines of dominoes with your finger: the wave topples them, and the fallen pieces make a picture. The rules run in plain C#, with no engine, and a solver sets each puzzle's box of dominoes and its stars. Coming soon to the App Store and Google Play.
tags:
  - Unity 6
  - C#
  - Solver
  - Tests
  - Android
  - iOS
galleryTitle: The game in pictures
galleryLayout: phone
gallery:
  - src: /assets/dominoland/screen-1-en.webp
    alt: "Trace 1: the box of 30 dominoes, the gold domino and the pieces of the picture to reach"
  - src: /assets/dominoland/screen-2-en.webp
    alt: "Three stars: the wave has toppled the pieces, and a smiling sun appears"
  - src: /assets/dominoland/screen-3-en.webp
    alt: "Rhythm: the wave runs along a zigzag course"
  - src: /assets/dominoland/screen-4-en.webp
    alt: "Perfect chain: at the end of the course, a moon appears"
---
<p>
  This page tells how Dominoland is <strong>made</strong>. For the game itself, the
  <a href="/en/dominoland/">game's page</a> is the place to go.
</p>

<h2>Rules without the engine</h2>
<p>
  The rules of The Trace and of Rhythm are written in plain C#, with no reference to Unity. The Trace began as a
  JavaScript prototype: a command-line tool replays the same puzzles on both sides and checks that the result is
  the same, domino by domino. A rule change that would make them drift apart is refused.
</p>

<h2>A solver for each puzzle</h2>
<p>
  For each puzzle, a solver looks for the fewest dominoes that reveal the whole picture, and a simulated naive
  player counts how many it would place. The size of the box and the thresholds of the second and third stars are
  computed from these two numbers: none is picked by hand.
</p>

<h2>Pictures and notes</h2>
<p>
  Most of Rhythm's pictures are drawn from free emojis, reduced to 22 by 20 cells and recoloured. The instruments are
  played note by note from a free sound bank. Tests play the levels through to the picture, then shoot every screen
  in the five languages, on a notched phone and on a tablet.
</p>
