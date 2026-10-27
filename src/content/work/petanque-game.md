---
title: Pétanque Game - 2026
publishDate: 2026-10-27 00:00:00
img: /assets/petanque-game/feature-fr.webp
img_alt: Pétanque Game — deux boules et un bouchon sur le gravier d'une place de village au soleil couchant
role: Développeur
org: Ludiven Studio
appPage: /petanque-game/
appPageLabel: Découvrir le jeu
webApp: /jeux/petanque/
webAppLabel: Jouer dans le navigateur
description: |
  Un jeu de pétanque en 3D pour Android et iPhone, né sur ce site puis porté sous Unity. Règles, physique et adversaire recopiés ligne à ligne du TypeScript et tenus identiques par des tests de parité ; parties en ligne où seuls les lancers voyagent ; terrains qui se lisent ; joueurs posés par le code, sans fichier d'animation.
tags:
  - Unity 6
  - URP
  - C#
  - TypeScript
  - Tests de parité
  - Netcode
  - Android
  - iOS
galleryTitle: Le jeu en images
galleryLayout: phone
gallery:
  - src: /assets/petanque-game/screen-01-fr.webp
    alt: "La vraie pétanque en 3D : roulette, demi-portée, portée, plombée"
  - src: /assets/petanque-game/screen-02-fr.webp
    alt: "Le point au centimètre : des cercles autour du bouchon"
  - src: /assets/petanque-game/screen-03-fr.webp
    alt: "Seul ou en équipe : tête-à-tête, doublette ou triplette"
  - src: /assets/petanque-game/screen-04-fr.webp
    alt: "Joue en ligne : avec un ami, ou en partie classée"
  - src: /assets/petanque-game/screen-05-fr.webp
    alt: "Quatre décors de Provence : choisis où tu joues"
  - src: /assets/petanque-game/screen-06-fr.webp
    alt: "Des boules de caractère : poids, diamètre, dureté, 14 modèles"
  - src: /assets/petanque-game/screen-07-fr.webp
    alt: "Ligues et coupes : de Bronze à Diamant, gagne des trophées"
  - src: /assets/petanque-game/screen-08-fr.webp
    alt: "Les règles en images : six pages pour bien débuter"
---
<p>
  Cette page raconte la <strong>fabrication</strong> de Pétanque Game. Pour le jeu lui-même — ce qu'il
  propose, ce qu'il coûte, quand il sort — la <a href="/petanque-game/">page du jeu</a> est faite pour ça,
  et la <a href="/jeux/petanque/">version web</a> se joue tout de suite.
</p>

<h2>Du navigateur au téléphone</h2>
<p>
  Le jeu est né dans la rubrique des mini-jeux du site, en TypeScript et three.js. L'appli est faite avec
  Unity&nbsp;6 (URP), et son cœur ne réinvente rien&nbsp;: les règles, la physique des boules, l'adversaire
  et le tremblement de la main sont <strong>recopiés ligne à ligne</strong> en C#, dans un assembly qui ne
  connaît rien d'Unity. Un script fait tourner le code du site et en tire un fichier de référence&nbsp;:
  hauteurs du terrain, lancers menés jusqu'à l'arrêt des boules, plans de l'ordinateur. Les tests de l'appli
  rejouent tout et doivent retomber sur les mêmes chiffres.
</p>
<p>
  Le diable est dans les détails&nbsp;: le bruit du terrain repose sur <code>Math.imul</code> et
  <code>&gt;&gt;&gt;</code>, qui deviennent de l'arithmétique entière non vérifiée en C#&nbsp;; les hauteurs
  restent en <code>float</code> parce que le site les range dans un <code>Float32Array</code>&nbsp;; et
  <code>Math.round</code> n'arrondit pas les demis comme <code>Math.Round</code>. Chaque écart se voit dans
  un test avant de se voir sur le terrain.
</p>

<h2>Deux téléphones, une seule partie</h2>
<p>
  En ligne, <strong>seuls les lancers voyagent</strong>&nbsp;: la vitesse de la boule et l'endroit où la main
  la lâche, numérotés et appliqués dans l'ordre, par Unity Netcode et Relay. Chaque téléphone rejoue le
  lancer avec le même moteur, qui ne s'autorise que des racines carrées pour tomber juste sur les deux
  appareils. Après chaque lancer, le téléphone qui a ouvert la partie envoie son arbitrage, que l'autre
  adopte&nbsp;; un téléphone en retard redemande ce qui lui manque.
</p>
<p>
  Pour le vérifier, un script ouvre deux éditeurs Unity qui jouent une vraie partie privée l'un contre
  l'autre, par les services en ligne, et doivent finir avec <strong>le même jeu au millimètre</strong>.
  C'est lui qui a trouvé l'invité qui ne démarrait jamais&nbsp;: la partie le connectait avant que son lien
  existe, et le signal de départ se perdait.
</p>

<h2>Un terrain qui se lit</h2>
<p>
  Un terrain se règle du plus lisse au plus accidenté&nbsp;: une pente, des bosses, des trous de plombée,
  des plaques de quatre sols, des cailloux qui dévient une boule, et une couche de gravier meuble plus
  épaisse le long des planches. Le shader du sol mélange les quatre textures là où chaque
  sol joue vraiment, et accentue les pentes six fois <strong>pour la lumière seulement</strong>&nbsp;:
  dessinées à leur vraie taille, quelques centimètres par mètre, l'œil ne les lisait pas. La physique, elle,
  ne voit jamais cette exagération.
</p>
<p>
  L'ordinateur et le chemin affiché avant de lâcher calculent sur une copie «&nbsp;aveugle&nbsp;» de la
  partie&nbsp;: sans les cailloux cachés, sans ce que personne ne peut lire sur le sol. Le vrai lancer, lui,
  les sent, et de la même façon sur les deux téléphones.
</p>

<h2>Des joueurs qui ont leurs manies</h2>
<p>
  Les joueurs sont des corps 3D de Microsoft Rocketbox, posés <strong>par le code à chaque image</strong>,
  sans fichier d'animation&nbsp;: l'accroupi, le balancier du pointeur, le tir qui monte sur la pointe des
  pieds, la marche qui garde le pied au sol. Les postures suivent des photos de vrais joueurs. Avant chaque
  boule, chacun a son rituel, tiré au sort et toujours le même&nbsp;: soupeser la boule, l'essuyer, fléchir les genoux,
  viser. Les tenues sont dessinées par un shader à partir de la place de chaque point sur le corps&nbsp;:
  n'importe quelle tenue va à n'importe quel joueur, sans une texture par combinaison.
</p>

<h2>Mesurer plutôt que deviner</h2>
<p>
  Les réglages se mesurent en faisant jouer l'ordinateur contre lui-même. Le niveau Facile, trop dur au
  départ, a été refait sur mesures&nbsp;; les droits d'inscription et les gains des ligues sortent de
  centaines de matchs simulés&nbsp;; et chaque modèle de boule (poids, diamètre, dureté) affronte
  la boule standard sur trois terrains, pour qu'aucun ne soit meilleur partout.
</p>

<h2>Pour des joueurs qui jouent pour de vrai</h2>
<p>
  Le jeu vise des joueurs de 45 à 75 ans&nbsp;: une seule échelle de textes, jamais sous 15 pt, des
  boutons de bonne taille, et des contrastes vérifiés dans les six ambiances des menus. Les tests en mode jeu
  lancent l'appli, jouent une mène entière, prennent des captures dans les cinq langues et listent
  <strong>chaque texte qui déborde de son cadre</strong>&nbsp;; ces mêmes captures font les images des
  stores. Les bruits du jeu (chocs des boules, sol, bouchon, planches) sont synthétisés, comme sur le site,
  sans un fichier audio.
</p>
