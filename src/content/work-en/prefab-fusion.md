---
title: Prefab Fusion - Unity tool - 2026
publishDate: 2026-10-22 00:00:00
img: /assets/prefab-fusion/cover.webp
img_alt: Prefab Fusion windows in the Unity editor — a part repeated four times, and its extraction window
role: Developer
org: Ludiven Studio
appPage: /en/prefab-fusion/
description: |
  A Unity editor tool that refactors prefabs: copy-pasted blocks become one nested prefab, near-copies become variants, in place, without losing a value or a reference. Coming soon to the Unity Asset Store.
tags:
  - Unity
  - Editor tool
  - C#
  - Prefabs
  - Asset Store
galleryTitle: The tool in pictures
galleryLayout: wide
gallery:
  - src: /assets/prefab-fusion/main.webp
    alt: "Main window: the prefab tree, with the Offer part marked ×4 because it repeats across the project"
  - src: /assets/prefab-fusion/extract.webp
    alt: "Extraction: the four copies become instances of the new prefab, each keeping its values as overrides"
  - src: /assets/prefab-fusion/variant.webp
    alt: "Variant in place: 100% shared structure, 5 overrides, one added child"
  - src: /assets/prefab-fusion/shared-parts.webp
    alt: "Folder scan: blocks repeated across prefabs, largest savings first"
  - src: /assets/prefab-fusion/prefab-pairs.webp
    alt: "Folder scan: SampleCardGold could be a variant of SampleCard"
---
<p>
  This page covers the <strong>technical approach</strong> behind Prefab Fusion. For the tool itself — what it
  does, what it needs, where to get it — see the <a href="/en/prefab-fusion/">tool page</a>.
</p>

<h2>The problem</h2>
<p>
  In a Unity project, a UI grows fast through copy and paste: a block duplicated with Ctrl+D across ten screens,
  a prefab copied and tweaked instead of made a variant. The day that block has to change, it changes ten times.
  Refactoring by hand is costly: every rebuilt object gets a new id, and the references that scenes and other
  prefabs held to it break, overrides included.
</p>

<h2>The approach</h2>
<p>
  Prefab Fusion reads each prefab as a tree: the objects, their components, and every serialized field that
  differs from a fresh component. Two parts have the same structure when their names and component types match,
  even when their texts, colours or sprites differ.
</p>
<p>
  <strong>Extract to Nested Prefab</strong>: a part becomes a prefab of its own, and the parts with the same
  structure in other prefabs become instances of it, their own values kept as overrides. <strong>Make Variant, in
  place</strong>: an existing prefab becomes a variant of another one; it keeps its path and GUID, so nothing that
  uses it breaks. Either way, references from scenes, prefabs and assets follow the moved objects, overrides
  included.
</p>

<h2>Safety first</h2>
<p>
  A tool that rewrites prefabs has to earn trust. Nothing changes before a full preview. The files involved are
  backed up, and the last ten restructures can be undone. In a git repository, the tool flags files with
  uncommitted changes. Above all, after each restructure, every value of every prefab it touched is compared with
  its value before: the report ends with <code>check: every value is the same as before</code>, or lists what
  differs.
</p>

<h2>Finding what to refactor</h2>
<p>
  A scan lists the blocks repeated across the prefabs of a folder, and the prefab pairs close enough to be
  variants. The first version only compared prefabs of the same shape and buried the good leads: on a project of
  284 prefabs, 4,999 suggestions, single-node objects first. Yet two nodes match when their name paths match, so
  the paths two prefabs share bound their score, and that very cheap count rules out almost every hopeless pair
  before the full compare. On the same project, the scan now suggests 88 pairs, the real near-copies first, and
  runs more than twice as fast.
</p>

<h2>Tests</h2>
<p>
  A suite of 37 automated tests runs with no failure on Windows, on Unity 2022.3, 6.0, 6.3, 6.4, 6.5 and 6.6. On
  four real projects, 687 prefabs out of 722 come back identical, value by value, after a round trip through JSON;
  nearly all the others use a script missing from the project.
</p>
