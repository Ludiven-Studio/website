---
title: Nino Rush - 2026
publishDate: 2026-11-18 00:00:00
img: /assets/nino-rush-work/cover.webp
img_alt: Nino Rush — Nino, the red panda adventurer, leaps over a meadow collecting coins
role: Developer
org: Ludiven Studio
appPage: /en/nino-rush/
appPageLabel: Discover the game
description: |
  A physics platformer where Nino, a red panda, curls into a ball and rushes through a hundred levels. Each level is written as a recipe, built by a generator, and kept only if a robot finishes it in one go, with each of its stars, in the game's real physics.
tags:
  - Unity 6
  - C#
  - Physics
  - Level generation
  - Solver
  - Tests
  - Android
  - iOS
galleryTitle: The game in pictures
galleryLayout: wide
gallery:
  - src: /assets/nino-rush-work/level-rest.webp
    alt: "Nino at rest in a lab level"
  - src: /assets/nino-rush-work/last-leap.webp
    alt: "The last leap: a boost pad and a ring throw Nino towards the top star"
  - src: /assets/nino-rush-work/burrow.webp
    alt: "In a burrow, under the level's ground"
  - src: /assets/nino-rush-work/hat.webp
    alt: "Nino in his cowboy hat, in the forest"
  - src: /assets/nino-rush-work/graph.webp
    alt: "A level's graph: the side to hold on each passage, and the detours to the stars"
---
<p>
  This page tells how Nino Rush was <strong>made</strong>. For the game itself, the
  <a href="/en/nino-rush/">game's page</a> is the place to go.
</p>

<h2>Levels proved by a robot</h2>
<p>
  No level is drawn by hand. Each one is a <strong>recipe</strong> of a few words: a high start, a ring, a burrow's
  gallery, a last leap. A generator turns it into ground, coins and stars. A robot then searches the way, decision
  by decision, in the game's real physics. The level is kept only if a single unbroken run reaches the burrow and
  each of the three stars. The exact print of every step of the hundred routes is recorded: a change that would
  move a single one is refused by the tests.
</p>

<h2>A graph rather than a simpler level</h2>
<p>
  When the robot could not find its way, the temptation was to simplify the level. The rule is the opposite: a
  level is never changed for the robot. So the generator lays, with each passage, the side to hold and how to get
  there, like a 3D game's navigation graph. The robot follows it, and a pilot in the game reads it at every step
  to replay the levels and film them.
</p>

<h2>Levels to explore</h2>
<p>
  In the levels of the new style, the stars follow a simple rule: an easy one near the start, a harder one
  towards the end, and a hidden one you have to explore for. The burrows, dug like an anthill, never kill, and
  the level ends with a big leap to try as high as you can. In November 2026 Nino was redrawn: the old ball of fluff became an adventurer, scarf and
  backpack on.
</p>
