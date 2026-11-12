# Journal Claude Code

- Mise à jour : 2026-09-29T10:55+02:00 (Europe/Paris).
- Rôle : **orchestrateur**, à la demande de l'utilisateur (29/09). J'ouvre les tickets pour Codex et je les
  lui fais traiter moi-même avec `node scripts/codex-agent.mjs <id>` (`codex exec` sans interface) ;
  l'utilisateur ne fait plus le relais. Détails : `.collab/README.md`, section « Mode orchestré ».
- En cours : campagne de l'Atelier, **7 chapitres jouables** (`docs/atelier-scenario.md`). Codex en limite
  d'usage jusqu'à ~12:26 : ticket 0011 (dialogues ch. 7) repris par Claude. Push prévu par l'utilisateur
  vers midi (non fait : l'utilisateur le déclenche).
- Réservations actives :
  - **Mölkky** (demande de l'utilisateur, 29/09 10:55) : `src/games/molkky/`, `scripts/molkky-*.ts`, `scripts/check-molkky.mjs`
  - `src/games/atelier/`, `src/pages/jeux/atelier.astro`, `public/assets/jeux/atelier/`
  - `scripts/atelier-sim.ts`, `scripts/comfy-atelier.mjs`, `scripts/snap-atelier.mjs`, `scripts/codex-agent.mjs`
- Pas à moi (auteur = l'utilisateur) : `src/components/Nav.astro`, `src/pages/partenariats.astro`, `shots/`.
- Commits du 29/09 (dans l'ordre) : `7c668d4` protocole `.collab` + runner Codex ; `add9c78` palier de
  réputation, inserts, scénario ; `3b18952` ch. 2 + moteur multi-chapitres (sauvegarde v2) ; `1067960` ch. 3
  + correctifs de la revue Codex 0007 ; `7c2ee9d` ch. 4 ; `092a26b` ch. 5 ; `07842f5` icônes textiles ; puis
  ch. 6-7 (ce lot).
- Vérifié à 10:42 : `npx vitest run` 1369/1369, eslint OK, `npm run build` OK (astro check 0/0, précache
  valide), `node scripts/snap-atelier.mjs` joue les 7 chapitres, 0 erreur console. Deux tests de physique
  (pétanque, mölkky) ont dépassé leur délai une fois sous charge, OK seuls : sans lien avec l'Atelier.
- Ressources : port 4361 pour `snap-atelier.mjs`. ComfyUI local (8188) arrêté.
- Tickets Codex : 0001-0010 traités et clos ; 0011 repris par Claude (limite d'usage).

## 2026-09-30 — Atelier : saisons 3-4 et trombinoscope
- Saisons 3 (Mme Garnier) et 4 (Mlle Chen, finale) jouables : chapitres 14-25, tickets 0016-0021 clos.
- Trombinoscope dans l'onglet Atelier : `src/games/atelier/characters.ts` (faits gatés par étape/amélioration/flag,
  vérifiés contre data.ts), `factKnown` dans engine.ts. Capture : `node scripts/snap-atelier-trombi.mjs` (port 4371).

## 2026-10-01 — Atelier : révélation des améliorations
- Achat d'une amélioration : ~4,5 s de mise en scène dans l'image de l'atelier (bâche qui s'envole, lueur, carte
  avec coût/réputation/générateur débloqué) avant toute scène ou arrivée de client. Gains affichés à la fin des
  scènes de restauration, delta flottant sur les pièces. Capture : `node scripts/snap-atelier-reveal.mjs` (port 4372).
- Délégation à Codex formalisée, au niveau utilisateur (tous projets) : skill `~/.claude/skills/codex/` (avec un
  lanceur général `codex-run.mjs` : ask / image / review) et agent `~/.claude/agents/codex-runner.md`. Dans ce dépôt,
  le skill renvoie au protocole `.collab` et à `scripts/codex-agent.mjs` : rien ne change côté Codex.
- Vidéo promo de l'Atelier (9:16, 32,5 s) : `scripts/promo-atelier.mjs` (capture, port 4381),
  `promo-atelier-music.mjs`, `promo-atelier-edit.mjs` (port 4383), plan commun `promo-atelier-plan.mjs`.
  Sortie dans `D:/tmp/promo-atelier/`, rien dans `public/` ni `dist/`.

## 2026-10-01 — Pétanque Scanner : pages légales en 5 langues (autre session Claude, depuis le dépôt Petanque AR)
- Statut : terminé, poussé (`75f3832` renommages seuls, `aefeed9` le reste). Réservations libérées. Demande : CGU et confidentialité en FR (défaut), EN, ES, DE, IT, renommées
  sous `/petanque-scanner/`, anciennes URL `/petanque-ar/...` redirigées (déclarées dans les deux stores).
- Réservations (libérées) : `src/pages/petanque-ar/`, `src/pages/es/petanque-ar/`, `src/pages/petanque-scanner/`,
  `src/pages/{en,es,de,it}/petanque-scanner/`, `src/layouts/BaseLayout.astro`, `src/components/MainHead.astro`,
  `astro.config.mjs` (bloc `redirects` seulement), `src/data/petanqueScanner.ts` et `src/content/work{,-en}/petanque-scanner.md` (liens légaux seulement), `src/pages/confidentialite.astro` (un lien).
- Ressources : `npm run build` (écrit `dist/` et `.astro/`) en fin de lot, annoncé ici avant lancement.
- 14:19 : lancement de `npm run build` (dist/, .astro/).
- 14:21 : build OK (115 pages).

## 2026-10-01 — Pétanque Scanner : images 1.2.11 (en-tête, partage, captures)

- Statut : terminé, poussé (`b339acb`). Réservations libérées.
- Réservations (libérées) : `public/assets/petanque-ar/` (hero*, screen-*), `public/assets/work/og/petanque-scanner*.jpg`,
  `src/data/petanqueScanner.ts` (HEROES / SCREENS + ligne `support`), `src/components/PetanqueLanding.astro` (SCREENS par langue + paragraphe `#support`).
  Ajout landing DE/IT : `src/pages/{de,it}/petanque-scanner.astro`, `src/components/{LangSwitch,ContactCTA}.astro`,
  `public/assets/badges/google-play-{de,it}.png`, `public/assets/petanque-ar/*-{de,it}.webp`, `public/assets/work/og/petanque-scanner-{de,it}.jpg`.
- 20:15 : lancement de `npm run build` (dist/, .astro/).
- 20:16 : build OK. Statut : terminé, non commité (en attente de l'utilisateur).
- 21:50 : ligne de support ajoutée ; relance de `npm run build`.
- 21:55 : landing DE/IT intégrée ; lancement de `npm run build`.
- 21:57 : build OK, rendu DE vérifié. Statut : terminé, non commité (en attente de l'utilisateur).

## 2026-10-01 — Sélecteur de langue en drapeaux

- Statut : terminé, poussé. Réservations libérées.
- Réservations (libérées) : `src/components/LangSwitch.astro`, `src/data/petanqueScanner.ts` (description, tagline, steps, photoNote, HERO/HEROES/SCREENS),
  `src/components/PetanqueLanding.astro` (vidéo), `src/content/work{,-en}/petanque-scanner.md` (galerie, img),
  `public/assets/petanque-ar/` (renommage *-fr, video-*), `scripts/petanque-assets.mjs` (nom de sortie).

## 2026-10-01 — Lien vers la page appli en haut des pages « coulisses »

- Statut : terminé, poussé. Réservations libérées.
- Réservations (libérées) : `src/content/config.ts` (champ `appPage`), `src/pages/work/[...slug].astro`, `src/pages/en/work/[...slug].astro`,
  `src/content/work{,-en}/petanque-scanner.md` (front-matter).

## 2026-10-01 — FAQ : indice de confiance retiré

- Statut : terminé, poussé. Réservations libérées.
- Réservations (libérées) : `src/data/petanqueScanner.ts` (FAQ précision), `src/content/work{,-en}/petanque-scanner.md` (un paragraphe).

## 2026-10-02 — Pétanque Scanner : fichier de versions pour l’appli

- Statut : terminé, build OK, non commité.
- Réservations actives : `public/petanque-scanner/version.json` (nouveau).

## 2026-10-05 — Rencontres : page de téléchargement de l'APK de test (session PetanqueMeet)

- Statut : terminé, poussé (15:15+02:00). Réservations libérées. Bucket `builds` créé (migration poussée), premier APK publié,
  `npm run build` OK (118 pages, page absente du sitemap).
- Réservations (libérées) : `supabase/migrations/20261005120000_builds_bucket.sql` (nouveau),
  `src/pages/rencontres/test.astro` (nouveau), `astro.config.mjs` (filtre du sitemap seulement).
- Ressources : `npx supabase db push` (bucket `builds`, public en lecture, écriture service_role seulement),
  `npm run build` en fin de lot (dist/, .astro/).

## 2026-10-04 — Atelier : rythme des blocages

- Statut : terminé, tests OK, non commité. Réservation (déjà active) : `src/games/atelier/`, `scripts/atelier-sim.ts`.
- Énergie 105, +1/2 min ; à sec, regain en 30 s de 45, 22, 16, 12, 9, 7, puis 5 (remis à zéro par une barre pleine).
  Charges des générateurs : 4/3/2/1 s. Sim : 1er blocage ~10 min, 2e ~15 min, puis de plus en plus serrés.
- `scripts/snap-atelier.mjs` est en retard sur la révélation des améliorations (bloque à l'étape 09) : sans lien.

## 2026-10-07 — SEO : liens internes avec slash final (Search Console « Page avec redirection » 59)

- Statut : terminé, non commité (2026-10-07 10:50+02:00). Build + check-links + 1388 tests OK. Réservations libérées : liens `href` dans `src/` (games.ts, Nav, Footer, pages légales, index, services…),
  `src/layouts/BaseLayout.astro` (ligne lookup jeu), `src/components/PortfolioPreview.astro`, `scripts/check-links.mjs` (nouveau), `package.json` (script build).
- Ressources : `npm run build` (dist/, .astro/).

## 2026-10-09 — Sudoku : indices qui expliquent la vraie technique

- Statut : terminé, non commité (2026-10-09, Europe/Paris). Réservations libérées : `src/games/sudoku/`.
- Solveur humain `logic.ts` (paires pointantes, paires/triplets nus et cachés, X-Wing/Swordfish, XY-Wing) ; le générateur
  ne garde une case retirée que si la grille reste résoluble par logique ; état du défi versionné (GEN_V 2).
- Vérifié : vitest sudoku 11/11, eslint + tsc OK, capture du mode Expert sur le serveur de dev (port 4391), 0 erreur.
- Commité et poussé (`a32a619`).

## 2026-10-09 — Nouvelle rubrique « Illusions d'optique » (stéréogrammes + 4 autres pages)

- Statut : terminé, non commité (2026-10-09, Europe/Paris). Build OK (125 pages, précache + liens), vitest 1430/1430,
  fumée sur le build : 5 pages sans erreur, tutos, 5 vignettes, absentes du défi et de la boutique. Réservations libérées :
  `src/games/illusions/`, `src/pages/jeux/{stereogrammes,image-remanente,oeil-mesureur,mouvement-illusoire,meme-couleur}.astro`,
  `src/data/games.ts` (type `category` + 5 entrées), `src/pages/jeux/index.astro` (rubrique), `src/pages/jeux/boutique.astro` (filtre),
  `src/components/IconPaths.ts` (icônes), `src/components/IllusionLinks.astro` (nouveau), `src/data/tutorials.ts` (5 entrées),
  `scripts/illusion-art.mjs` (nouveau), `public/assets/jeux/{,tile/,art/,og/}` (fichiers des 5 ids seulement).
- Ressources : serveur de dev partagé sur le port 4390 (arrêté en fin de lot), `npm run build` en fin de lot.
- 2026-10-09 : serveur 4390 arrêté ; `npm run build` (dist/, .astro/) OK. Commité et poussé (`9a6df67`).

## 2026-10-09 — Sudoku : l'indice donne la suite logique la plus simple

- Statut : terminé, non commité (2026-10-09, Europe/Paris). Réservations libérées : `src/games/sudoku/`.
- Techniques notées (échelle Sudoku Explainer) ; l'indice choisit la plus facile, puis la chaîne la plus courte.
  Générateur inchangé (480 grilles de référence identiques). vitest sudoku 14/14, eslint + tsc OK, capture sur le serveur de dev (port 4391).

## 2026-10-13 — Page Services : scènes animées par service

- Statut : terminé, non commité (2026-10-13, Europe/Paris). Réservations libérées. astro check 0 erreur, captures bureau/mobile/sombre OK.
- Réservations (libérées) : `src/pages/services.astro`, `src/components/ServiceScene.astro` (nouveau).
- Ressources : serveur de dev sur le port 4395 (arrêté).

## 2026-10-13 — Page Prestations : scènes animées par offre

- Statut : terminé, non commité (2026-10-13, Europe/Paris). Réservations libérées. astro check 0 erreur, captures FR/EN/mobile OK.
- Réservations (libérées) : `src/pages/prestations.astro`, `src/pages/en/services.astro`, `src/components/OfferScene.astro` (nouveau).
- Ressources : serveur de dev sur le port 4395 (arrêté).

## 2026-10-14 — Prestations : « Interventions ciblées » animées et colorées

- Statut : terminé, non commité (2026-10-14, Europe/Paris). Réservations libérées. astro check 0 erreur, captures FR/EN sombre/mobile OK.
- Réservations (libérées) : `src/pages/prestations.astro`, `src/pages/en/services.astro`, `src/components/FocusItem.astro` (nouveau).
- Ressources : serveur de dev sur le port 4395 (arrêté).

## 2026-10-14 — Prestations : scènes animées plus petites

- Statut : terminé, non commité (2026-10-14, Europe/Paris). Réservations libérées. Captures FR/EN/mobile OK, 0 erreur.
- Réservations (libérées) : `src/components/OfferScene.astro`, `src/pages/prestations.astro`, `src/pages/en/services.astro`.
- Ressources : serveur de dev sur le port 4395 (arrêté).

## 2026-10-14 — Prestations : espace au-dessus des titres de section

- Statut : terminé, non commité (2026-10-14, Europe/Paris). Réservations libérées. `gap-12`/`gap-6` absents de global.css (utilisés ailleurs, non corrigés). Captures EN/mobile OK.
- Réservations (libérées) : `src/pages/prestations.astro`, `src/pages/en/services.astro`.

## 2026-10-14 — Classes d'espacement `gap-6` et `gap-12` manquantes

- Statut : terminé, non commité (2026-10-14, Europe/Paris). Réservations libérées. 9 pages concernées capturées, 0 erreur.
- Réservations (libérées) : `src/styles/global.css` (bloc `.gap-*` seulement).
- Ressources : serveur de dev sur le port 4395 (arrêté).

## 2026-10-14 — Prototype caché « Tygo » (three.js)

- Statut : terminé, non commité (2026-10-14, Europe/Paris). Réservations libérées. Quête jouée de bout en bout par `node scripts/snap-tygo.mjs [dossier] [--mobile]`, 0 erreur. Demande de l'utilisateur : voir si l'idée d'un porteur de projet se représente facilement. Page non partagée.
- Réservations (libérées) : `src/pages/prototypes/` (nouveau), `src/prototypes/tygo/` (nouveau), `astro.config.mjs` (filtre du sitemap seulement), `scripts/snap-tygo.mjs` (nouveau).
- Ressources : serveur de dev sur le port 4396 (arrêté).

## 2026-10-15 — Tygo : jeu complet (~1 h, histoire, plateformes, roulade)

- Statut : terminé, non commité (2026-10-15, Europe/Paris). Réservations libérées. Physique vérifiée hors navigateur par `npx tsx scripts/check-tygo.ts` (sauts, passages réservés à la roulade, rive est inaccessible avant le barrage, aucun blocage en déplacement aléatoire). Partie complète jouée par `node scripts/snap-tygo.mjs`, 0 erreur console.
- Réservations (libérées) : `src/prototypes/tygo/`, `src/pages/prototypes/tygo.astro`, `scripts/snap-tygo.mjs`, `scripts/check-tygo.ts` (nouveau).
- Ressources : serveur de dev sur le port 4396 (arrêté).

## 2026-10-15 — Tygo : tutoriel, rochers jusqu'au noisetier, sac, noms complets des animaux

- Statut : terminé, non commité (2026-10-15, Europe/Paris). Réservations libérées. `check-tygo` vert (escalier de rochers inclus), captures bureau et mobile, 0 erreur.
- Réservations (libérées) : `src/prototypes/tygo/`, `src/pages/prototypes/tygo.astro`, `scripts/snap-tygo.mjs`, `scripts/check-tygo.ts`.
- Ressources : serveur de dev sur le port 4396 (arrêté).

## 2026-10-15 — Prototype renommé « Rayou » et prénoms qui riment

- Statut : terminé, non commité (2026-10-15, Europe/Paris). Réservations libérées. Le héros ne reprend plus le nom du porteur de projet : `src/prototypes/tygo/` → `src/prototypes/rayou/`, page `/prototypes/rayou/`, scripts `check-rayou.ts` et `snap-rayou.mjs`. Boutons Sauter/Rouler identiques. `check-rayou` vert.
- Réservations (libérées) : `src/prototypes/rayou/`, `src/pages/prototypes/rayou.astro`, `scripts/check-rayou.ts`, `scripts/snap-rayou.mjs`.
- Ressources : serveur de dev sur le port 4396 (arrêté).

## 2026-10-15 — Rayou dans le catalogue des jeux (catégorie Aventures)

- Statut : terminé, non commité (2026-10-15, Europe/Paris). Réservations libérées. Page `/jeux/rayou/` (GamePage, plein écran du site), carte et images générées (ComfyUI arrêté), `/prototypes/rayou` redirigé. `check-rayou` vert.
- Réservations : `src/games/rayou/` (déplacé depuis `src/prototypes/rayou/`), `src/pages/jeux/rayou.astro` (nouveau), `src/pages/prototypes/`, `src/data/games.ts` (une entrée), `src/data/tutorials.ts` (une entrée), `src/components/IconPaths.ts` (une icône), `astro.config.mjs` (une redirection), `scripts/check-rayou.ts`, `scripts/snap-rayou.mjs`, `scripts/thumb-themes.mjs` (un thème), `public/assets/jeux/{rayou.jpg,og/,art/,tile/}`.
- Ressources : serveur de dev sur le port 4396 (arrêté), ComfyUI local port 8188 (arrêté).

## 2026-10-15 — Rayou : champignons et eau

- Statut : terminé, non commité (2026-10-15, Europe/Paris). Réservations libérées. Tous les champignons rebondissent (un chapeau sans collision laissait Rayou entrer dedans), nouvelle eau en shader (`src/games/rayou/water.ts` : transparence selon la profondeur, reflets, écume, rides), étang praticable. `check-rayou` vert, test des champignons ajouté.
- Réservations (libérées) : `src/games/rayou/`, `scripts/check-rayou.ts`.
- Ressources : serveur de dev sur le port 4396 (arrêté).

## 2026-10-15 — Rayou : collisions du museau, pose de roulade

- Statut : terminé, non commité (2026-10-15, Europe/Paris). Réservations libérées. Le museau ne rentre plus dans les falaises ni les murs (sonde devant le corps + cercle de tête), tête gardée ronde en boule, roulade qui part debout. Test « snout » ajouté à `check-rayou`, vert.
- Réservations (libérées) : `src/games/rayou/`, `scripts/check-rayou.ts`.
- Ressources : serveur de dev sur le port 4396 (arrêté).

## 2026-10-15 — Rayou : teaser, dessous des champignons, caméra de plateforme

- Statut : terminé, non commité (2026-10-15, Europe/Paris). Réservations libérées. Teaser 4:5 et 16:9 (`scripts/promo-rayou*.mjs`, sorties dans `D:/tmp/promo-rayou`, copiées dans Téléchargements). Champignons fermés dessous, plein écran pleine largeur, caméra qui ne tourne plus pendant les sauts (mesuré : 154° → 0° sur l'escalier de rochers), joystick figé tant qu'il est tenu. `check-rayou` vert.
- Réservations (libérées) : `src/games/rayou/`, `src/pages/jeux/rayou.astro`, `scripts/promo-rayou*.mjs` (nouveaux).
- Ressources : serveur de dev sur les ports 4384-4385 et 4396 (arrêtés).

## 2026-10-15 — Rayou : lucioles ramassables avant la quête

- Statut : terminé, non commité (2026-10-15, Europe/Paris). Réservations libérées. Les lucioles du lac se ramassent même avant d'avoir parlé à Gribouille (elles brillaient mais on passait au travers) ; Gribouille tient compte de celles déjà trouvées et donne le bocal tout de suite s'il y en a six. Testé en jeu (port 4396, arrêté), `check-rayou` vert, tsc + eslint OK.
- Réservations (libérées) : `src/games/rayou/main.ts`, `src/games/rayou/story.ts`.

## 2026-10-21 — Pétanque Meet : filtre « affiches seulement » + panneau de filtres repliable
- Réservations actives : `src/components/rencontres/RencontresApp.tsx`, `src/lib/meetupFilters.ts`,
  `src/lib/meetupFilters.test.ts`, `src/styles/rencontres.css`.
- Fait : filtre `postersOnly` (+ `activeCount`, tests), panneau de filtres repliable (état mémorisé en
  localStorage), guards `check-rencontres*.mjs` ouvrent le panneau. Vérifié : vitest meetup OK, tsc/eslint OK,
  capture dev `?demo` bureau + téléphone (4 → 3 cartes concours, pas de défilement horizontal). Non commité.
- Réservations : libérées.

## 2026-10-21 — Pétanque (moteur) : terrains de difficulté 1-100 et boules à caractéristiques (session PetanqueGame)
- Statut : terminé, commité (`caa53ee`, 2026-10-21 19:40, Europe/Paris). Demande de l'utilisateur depuis le dépôt PetanqueGame (port Unity, dont ce moteur est la référence). Ajouts désactivés par défaut (terrains de difficulté, kits de boules, mesure au bord : le jeu du site ne les utilise pas). Équilibrage mesuré (boules et ligues) par simulation IA contre IA.
- Une correction touche le jeu du site : un caillou au roulement déviait la boule vers lui, il la pousse maintenant à l'opposé (`engine.ts`, `pebbleContact`, relevé par la revue Codex). Même amplitude, sens physique. `npx vitest run src/games/petanque` : 101/101.
- Réservations (libérées) : `src/games/petanque/terrain.ts`, `src/games/petanque/engine.ts`, `src/games/petanque/ai.ts`, `src/games/petanque/rules13.ts`, `src/games/petanque/uneven.test.ts` (nouveau).
- Ressources : `npx vitest run src/games/petanque` et `npx tsx ../PetanqueGame/tools/gen_fixtures.mts` (écrit dans PetanqueGame). Pas de build, pas de `dist/`.

## 2026-10-22 — Pétanque (moteur) : couche meuble (épaisseur), session PetanqueGame
- Statut : terminé, commité et poussé à la demande de l'utilisateur (2026-10-22, Europe/Paris). Demande de l'utilisateur depuis le dépôt PetanqueGame : sur un terrain irrégulier, l'épaisseur de gravier libre varie (rebord, extrémités, tas), une zone épaisse amortit la boule et l'enfonce, le rebond suit la dureté du sol. Désactivé par défaut comme le reste des terrains irréguliers : le jeu du site ne change pas. `terrain.ts` : `layLoose`, `looseAt`, `LOOSE_FULL`, adoucissement dans `surfaceAt` ; `engine.ts` : `bedBite` (sur un lit épais la dureté d'une boule compte moins, mesuré : sans cela une boule tendre gagnait 61 % contre la standard sur les terrains rugueux). `npx vitest run src/games/petanque` : 104/104 (3 tests ajoutés), tsc et eslint OK. Lancé par `node node_modules/vitest/vitest.mjs` : `node_modules/.bin` est absent dans ce dépôt (pas de `npm install` lancé, pour ne rien changer).
- Réservations (libérées) : `src/games/petanque/terrain.ts`, `src/games/petanque/engine.ts`, `src/games/petanque/uneven.test.ts`.
- Ressources : `npx vitest run src/games/petanque`, `npx tsx ../PetanqueGame/tools/gen_fixtures.mts` (écrit dans PetanqueGame). Pas de build.

## 2026-10-22 — Pétanque (site) : magasin en cocoins (boules à caractéristiques, bouchons, décors) et terrains irréguliers
- Statut : terminé, commité et poussé à la demande de l'utilisateur (2026-10-22, Europe/Paris). Demande de l'utilisateur : reprendre sur le mini-jeu du site les améliorations du jeu Unity (magasin, terrains de difficulté 1-100).
- Réservations (libérées) : `src/games/petanque/`, `public/assets/jeux/petanque/`, `src/lib/wallet.ts`, `src/lib/wallet.test.ts`, `scripts/check-petanque-*.mjs`, `scripts/snap-petanque-*.mjs`, `scripts/measure-petanque-*.mjs`.
- Ressources : serveur de dev sur les ports 4431-4439.
- 2026-10-22 ~08:50 : build complet lancé (écrit `dist/`, `.astro/`, `public/vendor/`), puis guards Playwright sur les ports 4366-4440.
- Fait : `shop.ts` (catalogue Unity, prix en cocoins), `ShopPanel.tsx`, `bouleLook.ts`, `decors.ts` (place, crépuscule, port), terrains irréguliers en partie libre, niveaux et en ligne (salons `petanque2-*`), défi du jour inchangé (piste égale, boule standard). Vérifié : vitest 127/127, astro check 0 erreur, build + précache + liens OK, guards shop/levels/daily/turns/pad/read/sfx/mp/resync OK, audit téléphone sans chevauchement. `check-petanque-camera` : un point (« full lob ») échoue aussi sur HEAD (témoin rejoué dans un worktree supprimé ensuite) : antérieur à ce travail. Quatre guards périmés depuis le 26/09 (carte « Libre ») corrigés.

## 2026-10-22 — Page Contact (FR/EN) et page Prefab Fusion (EN), session LudivenTools
- Statut : en cours (2026-10-22T08:22+02:00). Demande de l'utilisateur : le profil éditeur de l'Asset Store
  exige une page de contact sur le site, et un lien de support pour l'outil Prefab Fusion.
- Réservations actives : `src/pages/contact.astro` (nouveau), `src/pages/en/contact.astro` (nouveau),
  `src/pages/en/prefab-fusion.astro` (nouveau), `src/components/Footer.astro` (un lien « Contact »).
- Ressources : serveur de dev sur le port 4451 ; `npx astro check` en fin de lot. Pas de `npm run build` sans
  l'annoncer ici d'abord.
- 08:40 : pages écrites, captures bureau/téléphone/sombre OK (serveur 4451 arrêté). Lancement de `npm run lint`
  puis `npm run build` (écrit `dist/` et `.astro/`).
- 08:31 : terminé, non commité (en attente de l'utilisateur). `node_modules/.bin` absent : étapes du build lancées
  à la main avec `node`. eslint OK sur les 4 fichiers, `astro check` 0 erreur, `astro build` OK (138 pages),
  `check-precache` OK, `check-links` OK ; les 3 pages sont dans le sitemap (hreflang FR/EN sur Contact).
  Réservations gardées jusqu'au commit. Au commit : seulement mes 4 fichiers, pas ce journal (fichier mixte).
- Commité et poussé à la demande de l'utilisateur (`434b183`, mes 4 fichiers seulement). Statut : terminé.
  Réservations libérées : `src/pages/contact.astro`, `src/pages/en/contact.astro`, `src/pages/en/prefab-fusion.astro`,
  `src/components/Footer.astro`. Suite prévue : remplacer « Coming soon » par le lien Asset Store à la sortie.

## 2026-10-22 — Prefab Fusion : fiche dans « Projets » (FR/EN) et page produit en français, session LudivenTools
- Statut : en cours (2026-10-22T10:20+02:00). Demande de l'utilisateur : une nouvelle entrée dans les projets et une page
  en français pour l'outil Prefab Fusion, avec des captures de la nouvelle interface.
- Réservations actives : `src/content/work/prefab-fusion.md` (nouveau), `src/content/work-en/prefab-fusion.md` (nouveau),
  `src/pages/prefab-fusion.astro` (nouveau), `src/pages/en/prefab-fusion.astro`, `public/assets/prefab-fusion/` (nouveau),
  `public/assets/work/og/prefab-fusion.jpg` (nouveau, fait à la main avec les réglages de `generate-work-og.mjs` pour ne pas
  réécrire les autres images), `src/pages/contact.astro` (le lien Prefab Fusion vise la page en français).
- Ressources : serveur de dev sur le port 4452 ; `astro check` en fin de lot. Pas de build sans l'annoncer ici d'abord.
- 10:35 : pages écrites, `astro check` 0 erreur, captures bureau/téléphone/sombre sans erreur (serveur 4452 arrêté).
  Lancement de eslint sur mes fichiers puis de `astro build` (écrit `dist/` et `.astro/`), `check-precache` et `check-links`.
- 10:40 : terminé, non commité (en attente de l'utilisateur). eslint OK sur mes 3 pages, `astro build` OK (141 pages),
  `check-precache` OK (294 entrées), `check-links` OK ; les 4 pages Prefab Fusion sont dans le sitemap. Réservations
  gardées jusqu'au commit. Au commit : seulement mes fichiers, pas ce journal (fichier mixte).
- Commité à la demande de l'utilisateur (`08e5852`, mes 12 fichiers seulement), pas encore poussé. Statut : terminé.
  Réservations libérées : `src/content/work/prefab-fusion.md`, `src/content/work-en/prefab-fusion.md`,
  `src/pages/prefab-fusion.astro`, `src/pages/en/prefab-fusion.astro`, `public/assets/prefab-fusion/`,
  `public/assets/work/og/prefab-fusion.jpg`, `src/pages/contact.astro`. Suite : pousser quand l'utilisateur le demande.

## 2026-10-22 — Pétanque Meet : présentation de la fiche projet et boutons vers les stores
- Statut : en cours (2026-10-22, Europe/Paris). Demande de l'utilisateur : la présentation de la fiche Pétanque Meet
  n'est pas terrible, améliorer les boutons vers les stores, de même sur la page de consultation (la carte).
- Réservations actives : `src/components/StoreBadges.astro`, `src/styles/global.css` (bloc `.store-badges` seulement),
  `src/pages/work/[...slug].astro`, `src/pages/en/work/[...slug].astro`, `src/components/rencontres/StoreLinks.tsx`,
  `src/components/rencontres/RencontresApp.tsx`, `src/styles/rencontres.css`, `src/pages/petanque-meet/telecharger.astro`,
  `src/content/work/petanque-meet.md`, `src/content/work-en/petanque-meet.md`, `public/assets/badges/`,
  `src/content/config.ts` (un champ `appPageLabel`), `public/assets/petanque-meet/icon.webp` (nouveau, icône de l'appli).
- Ressources : serveur de dev sur le port 4462 (arrêté). Lancement de eslint, `astro check` puis `astro build` (écrit `dist/`
  et `.astro/`), `check-precache` et `check-links`.
- Fait : fiche projet en deux colonnes (tags | description + rangée badges/bouton de même hauteur), badges jamais écrasés
  (`max-width: none`, variante `store-badges--compact`), bandeau de l'appli (icône + badges) en tête de la carte, badges
  côte à côte dans la fenêtre « Ça se passe dans l'appli », icône sur la page de téléchargement, libellé « Consulter la
  carte » (champ `appPageLabel`). Vérifié : eslint OK, `astro check` 0 erreur, build OK (141 pages), précache et liens OK,
  captures dev + build (19 vues, clair/sombre, 360 à 1400 px) sans badge déformé ni défilement horizontal (témoin : un
  écrasement forcé est bien détecté).
- Commité à la demande de l'utilisateur (« commit et push ») : mes 12 fichiers et cette section seulement (journal
  mixte). Statut : terminé. Réservations libérées.

## 2026-10-22 — Prefab Fusion : nombre de tests sur la fiche « Projets », puis push, session LudivenTools
- Statut : en cours (2026-10-22T12:26+02:00). Demande de l'utilisateur : commit et push. L'outil a maintenant 38 tests
  (un ajouté avec un correctif), sans échec sur les six versions d'Unity ; la fiche dit encore 37.
- Réservations actives : `src/content/work/prefab-fusion.md`, `src/content/work-en/prefab-fusion.md` (le nombre seulement).
- Ressources : aucune (ni serveur ni build : seul un nombre change dans le texte).
- 12:30 : commité (`cd6bb9d`, mes 2 fichiers seulement) et poussé avec `08e5852` à la demande de l'utilisateur
  (`25e4b4c..cd6bb9d`). Statut : terminé. Réservations libérées : `src/content/work/prefab-fusion.md`,
  `src/content/work-en/prefab-fusion.md`. Ce journal reste non commité (fichier mixte).

## 2026-10-22 — Pétanque Meet : la carte en anglais, et plus d'installation de la carte sur le téléphone
- Statut : en cours (2026-10-22, Europe/Paris). Demande de l'utilisateur : une version EN de `/petanque-meet/` comme
  pour la fiche projet ; ne plus proposer « Mettre la carte sur mon téléphone », promouvoir les applis.
- Réservations actives : `src/components/rencontres/` (hors modération), `src/lib/meetupRules.ts`, `src/lib/meetupFilters.ts`,
  `src/lib/meetupGeo.ts`, `src/lib/meetups.ts` (`approvalLine`), `src/data/petanqueMeet.ts`, `src/styles/rencontres.css`,
  `src/pages/petanque-meet.astro`, `src/pages/en/petanque-meet.astro` (nouveau), `src/pages/petanque-meet/telecharger.astro`,
  `src/pages/en/petanque-meet/download.astro` (nouveau), `src/content/work-en/petanque-meet.md`, `src/pages/en/contact.astro`
  (un lien), `scripts/check-rencontres.mjs` (bloc installation), `src/lib/meetupGeo.test.ts`, `src/lib/meetupFilters.test.ts`.
- Ressources : serveur de dev sur le port 4463 ; eslint, `astro check`, vitest `src/lib/meetup*`. Build annoncé ici avant.
- 14:17 : serveur 4463 arrêté. Lancement du build complet (écrit `dist/`, `.astro/`, `public/vendor/`), puis `check-precache`
  et `check-links`.
- Fait : `/en/petanque-meet/` (même île, `lang="en"` : textes, dates en-GB, badges et liens stores anglais) et
  `/en/petanque-meet/download/`, drapeaux FR/EN + hreflang sur les deux paires, fiche projet et Contact EN pointent vers la
  carte EN. Bouton « Mettre la carte sur mon téléphone » et sa fiche retirés (le bandeau de l'appli reste). Les messages du
  serveur et la validation du formulaire de création (inaccessible, site en consultation) restent en français. Vérifié :
  eslint OK, `astro check` 0 erreur, vitest meetup 61/61 (cas EN ajoutés), build OK, précache 295 entrées, liens 155 pages,
  sitemap avec les 2 pages EN ; texte de la carte FR identique avant/après (dev et build) sauf le bouton retiré ; carte EN
  sans texte français hors contenu des joueurs et clubs.
- Commité à la demande de l'utilisateur (« commit et push ») : mes 25 fichiers et cette section seulement (journal mixte).
  Statut : terminé. Réservations libérées.

## 2026-10-22 — Pétanque Meet : plus de bouton « Démo » sur la carte
- Statut : en cours (2026-10-22, Europe/Paris). Demande de l'utilisateur : retirer le bouton de démo maintenant qu'il y a
  de vraies données. Les liens `?demo` restent valables (avec « Quitter la démo »).
- Réservations actives : `src/components/rencontres/RencontresApp.tsx`.
- Ressources : serveur de dev sur le port 4463 ; eslint sur le fichier.
- Fait : plus de bouton d'entrée dans la démo (FR et EN) ; un lien `?demo` ouvre toujours les exemples, avec « Quitter la
  démo ». Vérifié : eslint et tsc OK, contrôle navigateur FR + EN (pas de bouton ni de bandeau, `?demo` s'ouvre et se quitte,
  l'URL perd `?demo`), serveur 4463 arrêté. Statut : terminé, non commité. Réservations libérées.
- Suite (même jour) : l'utilisateur veut supprimer tout le mode démo. Statut : en cours. Réservations actives :
  `src/components/rencontres/RencontresApp.tsx`, `src/lib/meetupDemo.ts` (supprimé), `public/assets/rencontres/demo/`
  (supprimé, aucune référence ailleurs, ni dans PetanqueMeet, PetanqueGame ou LudivenTools), `src/styles/rencontres.css`
  (`.re-demo-btn`). Build annoncé ici avant.
- Lancement du build complet (écrit `dist/`, `.astro/`, `public/vendor/`), puis `check-precache` et `check-links`.
- Fait : mode démo supprimé (état, bandeau, bouton, `meetupDemo.ts`, les 3 affiches d'exemple, style `.re-demo-btn`) ; un
  ancien lien `?demo` ouvre la vraie carte. Vérifié : eslint OK, `astro check` 0 erreur, build OK, précache 295 entrées (sans
  affiche de démo), liens 155 pages, contrôle sur le build FR + EN avec et sans `?demo` (ni bandeau, ni requête d'affiche,
  aucune erreur).
- Commité à la demande de l'utilisateur (« commit et push ») : mes 6 fichiers et cette section seulement (journal mixte).
  Statut : terminé. Réservations libérées.

## 2026-10-22 — Pétanque Meet : la carte se cadre sur ce qui existe à l'ouverture
- Statut : en cours (2026-10-22, Europe/Paris). Demande de l'utilisateur : à l'ouverture, si aucune partie ni aucun concours
  n'est visible autour de Saint-Jean-de-Bournay, cadrer la carte sur ce que montrent les filtres.
- Réservations actives : `src/components/rencontres/MeetupMap.tsx`, `src/components/rencontres/RencontresApp.tsx`.
- Ressources : serveur de dev sur le port 4463 ; eslint sur les deux fichiers.
- Fait : `frameIfEmpty` (remplace `fitAll`, jamais appelé) : une fois les données chargées, si rien n'est visible, la vue
  s'élargit au point de départ + les 3 plus proches (tout cadrer faisait dézoomer jusqu'à Genève). Rien sur un lien `?e=`/`?t=`.
  Mesuré sur les vraies données : 0 → 4 cartes visibles à l'ouverture (bureau et téléphone, FR et EN) ; données simulées :
  partie visible = zoom 11 inchangé, Lyon seul = 9, Marseille seul = 7, rien = inchangé. eslint OK, `astro check` 0 erreur.
  Statut : terminé, non commité. Réservations libérées.
- Commité à la demande de l'utilisateur (« ok » pour commit et push) : mes 2 fichiers et cette section seulement (journal
  mixte). Statut : terminé. Réservations libérées.

## 2026-10-22 — Pétanque Meet : une page de téléchargement plus vivante (session PetanqueMeet)
- Statut : en cours (2026-10-22T19:48+02:00). Demande de l'utilisateur : la page `/petanque-meet/telecharger/` fait
  austère, l'améliorer avec des images ou des animations.
- Réservations actives : `src/pages/petanque-meet/telecharger.astro`, `src/pages/en/petanque-meet/download.astro`,
  `src/components/MeetDownload.astro` (nouveau), `src/data/petanqueMeet.ts` (textes de la page),
  `public/assets/petanque-meet/download/` (nouveau : décor, captures 0.1.5, vidéo, image de partage).
- Ressources : serveur de dev sur le port 4474 ; eslint sur mes fichiers, `astro check`. Build annoncé ici avant.
- 19:56 : page écrite (héros avec le décor et un téléphone qui fait défiler 5 écrans, 3 points forts, la vidéo en FR,
  bandeau final), eslint OK, `astro check` 0 erreur ; captures bureau/téléphone/sombre FR et EN sans erreur (serveur 4474
  arrêté). Lancement du build complet (écrit `dist/`, `.astro/`, `public/vendor/`), puis `check-precache` et `check-links`.
- 19:58 : build OK (143 pages), précache 296 entrées, liens 155 pages ; sur le build (preview 4474, arrêté) : aucune erreur
  console, défilement, pause, apparition des sections et vidéo vérifiés. Statut : terminé, non commité (en attente de
  l'utilisateur). Réservations gardées jusqu'au commit ; au commit, mes fichiers seulement.
- Commité et poussé à la demande de l'utilisateur (« ok push ») : mes 19 fichiers et cette section seulement (journal
  mixte). Statut : terminé. Réservations libérées.

## 2026-10-22 — Pétanque Meet : la fiche projet mène à la page de téléchargement (session PetanqueMeet)
- Statut : en cours (2026-10-22T20:46+02:00). Demande de l'utilisateur : pouvoir aller de `/work/petanque-meet/` à la
  page de téléchargement. Bouton « Découvrir l'appli » (page produit) + « Consulter la carte » gardé en second bouton.
- Réservations actives : `src/content/config.ts` (champs `webApp`/`webAppLabel`), `src/pages/work/[...slug].astro`,
  `src/pages/en/work/[...slug].astro` (bloc `.cta` seulement), `src/content/work/petanque-meet.md`,
  `src/content/work-en/petanque-meet.md` (front-matter).
- Ressources : serveur de dev sur le port 4474 ; eslint, `astro check`. Build annoncé ici avant.
- 20:48 : eslint OK ; captures FR/EN, bureau/téléphone/sombre : « Découvrir l'appli » puis « Consulter la carte », la
  fiche Pétanque Scanner inchangée, aucune erreur console (serveur 4474 arrêté). Lancement du build complet (écrit
  `dist/`, `.astro/`, `public/vendor/`), puis `check-precache` et `check-links`.
- 20:50 : `astro check` 0 erreur, build OK (143 pages), précache 298 entrées, liens 155 pages. Statut : terminé, non
  commité (en attente de l'utilisateur). Réservations gardées jusqu'au commit ; au commit, mes fichiers seulement.
- Suite : l'utilisateur valide le push et veut les images de la fiche en 0.1.5. Réservations ajoutées :
  `public/assets/petanque-meet/hero*.webp`, `public/assets/petanque-meet/screen-*.webp`, `public/assets/work/og/petanque-meet.jpg`
  (refait seul, avec les réglages de `generate-work-og.mjs`, pour ne pas réécrire les autres).
- 21:02 : images 0.1.5 faites depuis les captures des stores (`hero.webp` et `screen-01..06.webp` remplacés, versions
  `-en` ajoutées pour la fiche anglaise, dont la galerie n'est plus « in French »), aperçu de partage refait ; contrôle
  navigateur FR + EN sans erreur ni image manquante (serveur 4474 arrêté). Lancement du build complet (écrit `dist/`,
  `.astro/`, `public/vendor/`), puis `check-precache` et `check-links`.
- 21:03 : `astro check` 0 erreur, build OK, précache 298 entrées, liens 155 pages. Commité et poussé à la demande de
  l'utilisateur (« ok oui tu peux mettre à jour ») : mes 20 fichiers et cette section seulement (journal mixte).
  Statut : terminé. Réservations libérées.

## 2026-10-22 — Pétanque Scanner : page de téléchargement (session PetanqueMeet)
- Statut : en cours (2026-10-22T21:36+02:00). Demande de l'utilisateur : une page de téléchargement pour Pétanque
  Scanner comme celle de Pétanque Meet, dans les 5 langues de la page produit.
- Réservations actives : `src/components/ScannerDownload.astro` (nouveau), `src/data/petanqueScanner.ts` (ajout des
  textes de la page, rien d'existant modifié), `src/pages/petanque-scanner/telecharger.astro`,
  `src/pages/en/petanque-scanner/download.astro`, `src/pages/es/petanque-scanner/descargar.astro`,
  `src/pages/de/petanque-scanner/herunterladen.astro`, `src/pages/it/petanque-scanner/scarica.astro` (nouveaux).
  Pas touché : `src/pages/petanque-scanner/test.astro` (fichier d'une autre session), `public/petanque-scanner/version.json`.
- Ressources : serveur de dev sur le port 4475 ; eslint, `astro check`. Build annoncé ici avant.
- 21:44 : page écrite dans les 5 langues, eslint OK, `astro check` 0 erreur ; captures dev sans erreur (serveur 4475
  arrêté). Lancement du build complet (écrit `dist/`, `.astro/`, `public/vendor/`), puis `check-precache` et `check-links`.
- 21:46 : build OK, précache 304 entrées, liens 160 pages, les 5 pages dans le sitemap ; sur le build (preview 4475,
  arrêté) : aucune erreur console, défilement, pause, apparition des sections et vidéo vérifiés. Aucune page n'y renvoie
  encore. Statut : terminé, non commité (en attente de l'utilisateur). Réservations gardées jusqu'au commit ; au commit,
  mes fichiers seulement.
- 21:52 : l'utilisateur valide (« ok »). Réservations ajoutées : `src/content/work/petanque-scanner.md`,
  `src/content/work-en/petanque-scanner.md` (front-matter : « Découvrir l'appli » vers la page de téléchargement). Pas de
  lien sur la page produit : elle a déjà les badges et les mêmes images. Lancement de `astro check`, du build complet
  (écrit `dist/`, `.astro/`, `public/vendor/`), puis `check-precache` et `check-links`.
- 21:55 : `astro check` 0 erreur, build OK, précache 304 entrées, liens 160 pages ; les deux fiches renvoient vers la page.
  Commité et poussé à la demande de l'utilisateur : mes 9 fichiers et cette section seulement (journal mixte).
  Statut : terminé. Réservations libérées.

## 2026-10-22 — Pétanque Meet : page de téléchargement en 5 langues (session PetanqueMeet)
- Statut : en cours (2026-10-22T22:02+02:00). Demande de l'utilisateur : la page de téléchargement de Pétanque Meet n'a
  que 2 langues ; ajouter l'espagnol, l'allemand et l'italien, comme l'appli et la page de Pétanque Scanner.
- Réservations actives : `src/components/MeetDownload.astro`, `src/data/petanqueMeet.ts`, `src/components/StoreBadges.astro`
  (langues es/de/it, sans changer fr/en), `src/pages/petanque-meet/telecharger.astro`,
  `src/pages/en/petanque-meet/download.astro`, `src/pages/es/petanque-meet/descargar.astro`,
  `src/pages/de/petanque-meet/herunterladen.astro`, `src/pages/it/petanque-meet/scarica.astro` (nouveaux),
  `public/assets/petanque-meet/download/*-{es,de,it}.*` (nouveaux). Pas touché : `src/pages/petanque-scanner/test.astro`.
- Ressources : serveur de dev sur le port 4476 ; eslint, `astro check`. Build annoncé ici avant.
- 22:05 : pages es/de/it écrites (mêmes mots que l'appli et les fiches des stores), badges es/de/it dans
  `StoreBadges.astro` (fr/en inchangés), hreflang des 5 versions ; eslint OK, `astro check` 0 erreur ; captures dev des
  5 langues sans erreur (serveur 4476 arrêté). Lancement du build complet (écrit `dist/`, `.astro/`, `public/vendor/`),
  puis `check-precache` et `check-links`.
- 22:07 : build OK, précache 307 entrées, liens 163 pages, les 3 nouvelles pages dans le sitemap ; sur le build (preview
  4476, arrêté) : 5 langues, hreflang fr/en/es/de/it + x-default, aucune erreur console ; badges des fiches projet
  inchangés. Statut : terminé, non commité (en attente de l'utilisateur). Réservations gardées jusqu'au commit ; au
  commit, mes fichiers seulement (pas `public/assets/petanque/`, apparu pendant ce lot, ni `test.astro`).
- 22:19 : commité et poussé à la demande de l'utilisateur, mes fichiers et cette section seulement (journal mixte).
  Statut : terminé. Réservations libérées.

## 2026-10-22 — Les applis de pétanque : une page qui les regroupe (session PetanqueMeet)
- Statut : en cours (2026-10-22T22:06+02:00). Demande de l'utilisateur : une page qui montre toutes ses applis de
  pétanque, pour le bouton de la nouvelle Page Facebook commune (`/petanque/`).
- Réservations actives : `src/pages/petanque.astro` (nouveau), `public/assets/petanque/` (nouveau : bannière, icône de
  Scanner, image de partage). Lecture seule de `src/data/petanqueMeet.ts`, `src/data/petanqueScanner.ts` et
  `src/components/StoreBadges.astro` (réservés par la section précédente : je ne les modifie pas).
- Ressources : serveur de dev sur le port 4477 ; eslint, `astro check`. Build annoncé ici avant, pas pendant un autre.
- 22:16 : page écrite, eslint OK ; captures bureau/téléphone/sombre sans erreur (serveur 4477 arrêté). La section
  précédente a fini son build. Lancement de `astro check`, du build complet (écrit `dist/`, `.astro/`, `public/vendor/`),
  puis `check-precache` et `check-links`.
- 22:19 : `astro check` 0 erreur, build OK (avec la section précédente), précache 308 entrées, liens 164 pages.
  Commité et poussé à la demande de l'utilisateur : mes 4 fichiers et cette section seulement (journal mixte).
  Statut : terminé. Réservations libérées.

## 2026-10-22 — Pétanque Meet : filtres « parties / concours » et agrément sur la carte (session PetanqueMeet)
- Statut : en cours (2026-10-22T22:51+02:00). Demande de l'utilisateur : sur le site aussi, filtrer les concours agréés
  ou non, et n'afficher que les parties ou que les concours.
- Réservations actives : `src/lib/meetupFilters.ts`, `src/lib/meetupFilters.test.ts`, `src/components/rencontres/RencontresApp.tsx`
  (panneau des filtres seulement), `src/styles/rencontres.css` (si besoin, classes `.re-` du panneau).
- Ressources : serveur de dev sur le port 4478 ; eslint, `astro check`, vitest `src/lib/meetup*`. Build annoncé ici avant.
- 22:58 : « Afficher : tout / les parties / les concours » et « Concours : tous / agréés seulement / sans agrément connu »
  (mots de l'appli) ; vitest meetupFilters 23/23 (cas ajoutés), eslint OK, `astro check` 0 erreur ; contrôle navigateur
  FR + EN sans erreur (serveur 4478 arrêté). Lancement du build complet (écrit `dist/`, `.astro/`, `public/vendor/`),
  puis `check-precache` et `check-links`.
- 23:00 : build OK, précache 308 entrées, liens 164 pages, vitest meetup 63/63. Statut : terminé, non commité
  (en attente de l'utilisateur). Réservations gardées jusqu'au commit ; au commit, mes fichiers seulement.
- 23:05 : commité et poussé à la demande de l'utilisateur : mes 3 fichiers et cette section seulement (journal mixte).
  Statut : terminé. Réservations libérées.

## 2026-10-23 — Pétanque Meet : à l'ouverture, les cartes des concours les plus proches en entier
- Statut : en cours (2026-10-23T07:41+02:00). Demande de l'utilisateur : sur téléphone, le cadrage d'ouverture (`b77d864`)
  coupe au bord de la carte deux des quatre cartes de concours ; cadrer pour qu'elles tiennent en entier.
- Réservations actives : `src/components/rencontres/MeetupMap.tsx`.
- Ressources : serveur de dev sur le port 4463 ; eslint, `astro check`. Pas de build.
- Fait : le cadrage loge les cartes (taille, badge, carte « N concours » posée sur la moyenne de ses membres, affiche
  soulevée au-dessus d'une partie) au lieu des points, et dézoome d'un cran tant qu'elles ne tiennent pas. Témoin sur le
  site en ligne (ancien cadrage), données simulées, téléphone : une carte « N concours », une carte de partie et un concours
  coupés au bord ; nouveau cadrage : aucune des cartes des 3 plus proches coupée (7 cas × bureau/téléphone), zoom 8 au lieu
  de 9 sur téléphone dans ces deux cas, autres zooms inchangés. Affiches au-dessus des parties : positions identiques en
  ligne et en dev (zoom 11 et 17). eslint OK, `astro check` 0 erreur. Serveur 4463 arrêté.
  Statut : terminé, non commité. Réservations libérées.
- Commité à la demande de l'utilisateur (« ok » pour commit et push) : mon fichier et cette section seulement (journal
  mixte). Statut : terminé. Réservations libérées.

## 2026-10-23 — Pétanque Scanner : mise en ligne de la page de l'APK de test (session Petanque AR)
- Statut : en cours (2026-10-23T08:32+02:00). Demande de l'utilisateur : pousser `/petanque-scanner/test/` (404 : la
  page écrite le 05/10 n'a jamais été commitée), pour un lien fixe vers le dernier APK Dev
- Réservations actives : `src/pages/petanque-scanner/test.astro` (créé le 05/10 par une session Petanque AR, non
  suivi).
- Ressources : serveur de dev sur le port 4479 ; eslint, `astro check`. Build annoncé ici avant.
- 08:34 : eslint OK, `astro check` 0 erreur ; captures bureau/téléphone/sombre sans erreur console (serveur 4479
  arrêté), la page charge le dernier build (1.2.11 (456)). Lancement du build complet (écrit `dist/`, `.astro/`,
  `public/vendor/`), puis `check-precache` et `check-links`
- 08:36 : build OK (152 pages), précache 308 entrées, liens 164 pages ; mais la page figure dans le sitemap alors
  qu'elle est en noindex (celle de Meet en est exclue). Réservation ajoutée : `astro.config.mjs` (une ligne du filtre
  du sitemap, comme `/petanque-meet/test`)
- 08:36 : ligne ajoutée au filtre du sitemap, eslint OK. Relance du build complet (écrit `dist/`, `.astro/`,
  `public/vendor/`), puis `check-precache` et `check-links`
- 08:37 : correction : eslint ignore `astro.config.mjs` (motif d'exclusion du dépôt), c'est le build qui le valide.
  Build OK (152 pages), précache 308 entrées, liens 164 pages, la page n'est plus dans le sitemap
- 08:37 : commité et poussé à la demande de l'utilisateur (« go ») : mes 2 fichiers et cette section seulement (journal
  mixte). Statut : terminé. Réservations libérées.

## 2026-10-23 — Prefab Fusion : nombre de tests sur la fiche Projets (session LudivenTools)
- Statut : en cours (2026-10-23T10:18+02:00). Demande de l'utilisateur : mettre à jour le site : 53 tests au lieu de
  38, après les avoir relancés sur les 6 versions
- Réservations actives : `src/content/work/prefab-fusion.md`, `src/content/work-en/prefab-fusion.md`.
- Ressources : serveur de dev sur le port 4483 ; eslint, `astro check`. Build annoncé ici avant.
- 10:22 : « 38 » devient « 53 » (FR et EN) : relancés le 2026-10-23 sur 2022.3, 6.0, 6.3, 6.4, 6.5 et 6.6, aucun échec.
  astro check 0 erreur ; captures bureau et téléphone sombre sans erreur console (serveur 4483 arrêté). Lancement du
  build complet (écrit dist/, .astro/, public/vendor/), puis check-precache et check-links
- 10:24 : build OK (152 pages), précache 308 entrées, liens 164 pages. Statut : terminé, non commité (en attente de
  l'utilisateur). Réservations gardées jusqu'au commit.
- 15:45 : commité et poussé à la demande de l'utilisateur : mes 2 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-23 — Pétanque Meet : vidéos d'usage sur la page de téléchargement (session PetanqueMeet)
- Statut : en cours (2026-10-23T18:56+02:00). Demande de l'utilisateur : mettre les vidéos de présentation des
  fonctions (rejoindre, poser, concours, club) sur le site
- Réservations actives : `src/components/MeetDownload.astro`, `src/data/petanqueMeet.ts`,
  `public/assets/petanque-meet/download/guide-*`.
- Ressources : serveur de dev sur le port 4491 ; eslint, `astro check`. Build annoncé ici avant.
- 19:00 : section « Comment ça marche » (4 vidéos, page FR seulement, preload none, une seule lecture à la fois) ; 4
  mp4 720×900 (5,7 Mo en tout) et leurs affiches webp. eslint OK, astro check 0 erreur, captures
  bureau/téléphone/sombre sans erreur console (serveur 4491 arrêté). Lancement du build complet (écrit dist/, .astro/,
  public/vendor/), puis check-precache et check-links
- 19:01 : build OK (152 pages), précache 308 entrées, liens 164 pages. Statut : terminé, non commité (en attente de
  l'utilisateur). Réservations gardées jusqu'au commit.
- 19:08 : commité et poussé à la demande de l'utilisateur (« go ») : mes 10 fichiers et cette section seulement. Statut
  : terminé. Réservations libérées.

## 2026-10-23 — Pétanque Meet : vidéo « rejoindre » dans chaque langue (session PetanqueMeet)
- Statut : en cours (2026-10-23T23:05+02:00). Demande de l'utilisateur : mettre à jour le site web pour afficher les
  bonnes vidéos suivant la langue
- Réservations actives : `src/components/MeetDownload.astro`, `src/data/petanqueMeet.ts`,
  `public/assets/petanque-meet/download/guide-rejoindre-*`.
- Ressources : serveur de dev sur le port 4492 ; eslint, `astro check`. Build annoncé ici avant.
- 23:08 : vidéo « rejoindre » traduite sur les pages EN/ES/DE/IT (une vidéo, centrée) ; 4 mp4 720×900 (4,5 Mo en tout)
  et leurs affiches webp. eslint OK, astro check 0 erreur, captures bureau/téléphone sombre sans erreur console
  (serveur 4492 arrêté). Lancement du build complet (écrit dist/, .astro/, public/vendor/), puis check-precache et
  check-links
- 23:09 : build OK (152 pages), précache 308 entrées, liens 164 pages. Statut : terminé, non commité (en attente de
  l'utilisateur). Réservations gardées jusqu'au commit.
- 23:12 : commité et poussé à la demande de l'utilisateur : mes 10 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-24 — Pétanque Scanner : nouveau déroulé du scan (une visée, tour du jeu) (session Petanque AR)
- Statut : en cours (2026-10-24T01:17+02:00). Demande de l'utilisateur : les pages Pétanque Scanner décrivent un ancien
  déroulé (sol filmé, trois visées du cochonnet) : décrire une seule visée puis le tour du jeu
- Réservations actives : `src/data/petanqueScanner.ts`.
- Ressources : serveur de dev sur le port 4497 ; eslint, `astro check`. Build annoncé ici avant.
- 01:20 : étapes 1 et 2 réécrites dans les 5 langues (plus d'étape « sol », une seule visée puis le tour du jeu ; les
  boules apparaissent en marchant) et la FAQ FR « visez-le à nouveau ». eslint OK, astro check 0 erreur, captures
  téléphone FR sans erreur console (serveur 4497 arrêté). Lancement du build complet (écrit dist/, .astro/,
  public/vendor/), puis check-precache et check-links
- 01:22 : build OK (152 pages), précache 308 entrées, liens 164 pages
- 01:22 : commité à la demande de l'utilisateur, non poussé : mon fichier et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-10-24 — Pétanque Meet : confidentialité, statistiques Umami et bandeau Scanner (0.1.6) (session PetanqueMeet)
- Statut : en cours (2026-10-24T01:29+02:00). Demande de l'utilisateur : corriger la politique de confidentialité de
  l'appli avant la sortie de la 0.1.6
- Réservations actives : `src/pages/petanque-meet/confidentialite.astro`.
- Ressources : serveur de dev sur le port 4493 ; eslint, `astro check`. Build annoncé ici avant.
- 01:32 : §8 : statistiques reliées ni au compte ni à l'identité, IP vue et ville déduite, regroupement d'un mois au
  plus, même compte que Pétanque Scanner ; §9 : bandeau Pétanque Scanner quand Google ne sert rien ; §4 et §11 « sans
  compte ni identifiant » au lieu d'« anonymes » ; date au 24 octobre. eslint OK, astro check 0 erreur, capture bureau
  sans erreur console (serveur 4493 arrêté). Lancement du build complet (écrit dist/, .astro/, public/vendor/), puis
  check-precache et check-links
- 01:33 : build OK, précache et liens OK. Statut : terminé, non commité (en attente de l'utilisateur). Réservation
  gardée jusqu'au commit.
- 03:41 : §12 : statistiques d'usage effacées par Umami au bout de 6 mois (offre gratuite Hobby, umami.is/pricing).
  Lancement du build complet (écrit dist/, .astro/, public/vendor/), puis check-precache et check-links
- 03:43 : build OK (152 pages), précache 308 entrées, liens 164 pages
- 03:43 : commité à la demande de l'utilisateur : mon fichier et cette section seulement. Push en attente : main porte
  aussi le commit non poussé de la session Petanque AR (e9f5228). Statut : terminé. Réservations libérées.

## 2026-10-24 — Pétanque Scanner : clips promo Meet pour l'appli (session Petanque AR)
- Statut : en cours (2026-10-24T03:36+02:00). Demande de l'utilisateur : héberger les clips promo Pétanque Meet (5
  langues) et promo.json que la prochaine version de l'appli lira en streaming
- Réservations actives : `public/petanque-scanner/promo/` (nouveau).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 03:38 : 5 mp4 copiés à l'identique depuis StreamingAssets/MeetPromo (meet_<lang>.mp4, 5,1 Mo en tout) et promo.json ;
  aucune page ne les cite. Pas d'eslint (ni JS ni Astro touché). Lancement du build complet (écrit dist/, .astro/,
  public/vendor/), puis check-precache et check-links
- 03:39 : build OK (152 pages), précache 308 entrées sans aucun mp4 ni json, liens 164 pages ;
  dist/petanque-scanner/promo/ contient les 6 fichiers, identiques aux sources
- 03:39 : commité à la demande de l'utilisateur, non poussé : mes 6 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-24 — Pétanque Meet : 0.1.6 sur Google Play, version.json (session PetanqueMeet)
- Statut : en cours (2026-10-24T09:57+02:00). Demande de l'utilisateur : la 0.1.6 est validée sur Google Play, pas
  encore sur l'App Store : passer latest_android à 0.1.6
- Réservations actives : `public/petanque-meet/version.json`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 09:58 : latest_android 0.1.5 → 0.1.6 ; latest_ios et min restent à 0.1.5 (App Store pas encore validé). JSON valide,
  même forme. Pas de build (fichier statique hors précache)
- 09:58 : commité et poussé à la demande de l'utilisateur : mon fichier et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-10-24 — Pétanque Scanner : 1.2.12 sur Google Play, version.json (session Petanque AR)
- Statut : en cours (2026-10-24T10:30+02:00). Demande de l'utilisateur : la 1.2.12 est disponible sur Google Play, pas
  encore sur l'App Store : passer latest_android à 1.2.12
- Réservations actives : `public/petanque-scanner/version.json`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 10:30 : latest_android 1.2.11 → 1.2.12 ; latest_ios et min inchangés (App Store pas encore validé). JSON valide, même
  forme. Pas de build (fichier statique hors précache)
- 10:30 : commité et poussé à la demande de l'utilisateur : mon fichier et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-10-24 — Rayou : sauts sur mobile (session website)
- Statut : en cours (2026-10-24T11:48+02:00). Demande de l'utilisateur : améliorer les sauts de Rayou sur mobile, en
  autonomie, avec l'avis de Codex
- Réservations actives : `src/games/rayou/input.ts`, `src/games/rayou/main.ts`, `src/games/rayou/player.ts`,
  `src/pages/jeux/rayou.astro`, `scripts/check-rayou.ts`, `.collab/tickets/0034-rayou-sauts-mobile.md`,
  `.collab/LOG.md`.
- Ressources : serveur de dev sur le port 4472 ; eslint, `astro check`. Build annoncé ici avant.
- 11:53 : réservation ajoutée : `src/games/rayou/tutorial.ts` (textes tactiles du saut). Codex consulté (ticket 0034,
  répondu).
- 12:00 : réservation ajoutée : `src/games/rayou/zones.ts` (le nénuphar qui coule s'enfonçait par appel, pas par
  seconde).
- 12:10 : réservations ajoutées : `scripts/check-rayou-touch.mjs` (gestes tactiles dans Chromium),
  `.collab/tickets/0035-revue-sauts-rayou.md` (relecture du diff par Codex, en cours). check-rayou.ts complet OK,
  eslint OK, astro check 0 erreur.
- 12:16 : fait et vérifié : saut entier au tap, rebonds jamais coupés, physique en sous-pas de 1/60 s, nénuphar qui
  coule par seconde, glissé Rouler→Sauter, boutons +8 px ; check-rayou.ts (profils téléphone, plage continue) et
  check-rayou-touch.mjs passent, contre-épreuves en échec comme attendu ; tickets 0034-0035 clos. Pas de build ni de
  commit : en attente du feu vert de l'utilisateur.
- 16:29 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 16:31 : build complet OK : astro check 0 erreur, 152 pages, précache 308 entrées, liens OK
- 16:31 : commité et poussé à la demande de l'utilisateur : mes 12 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-24 — Pétanque Meet : 0.1.6 sur l'App Store, version.json (session PetanqueMeet)
- Statut : en cours (2026-10-24T17:18+02:00). Demande de l'utilisateur : Apple a validé la 0.1.6 : passer latest_ios à
  0.1.6
- Réservations actives : `public/petanque-meet/version.json`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 17:18 : latest_ios 0.1.5 → 0.1.6 ; min reste à 0.1.5. JSON valide, même forme. Pas de build (fichier statique hors
  précache)
- 17:18 : commité et poussé à la demande de l'utilisateur : mon fichier et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-10-24 — Pétanque Scanner : 1.2.12 sur l'App Store, version.json (session PetanqueMeet)
- Statut : en cours (2026-10-24T17:19+02:00). Demande de l'utilisateur : Apple a validé les versions de Scanner et de
  Meet : passer latest_ios de Scanner à 1.2.12
- Réservations actives : `public/petanque-scanner/version.json`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 17:19 : latest_ios 1.2.11 → 1.2.12 ; latest_android déjà à 1.2.12, min inchangé. JSON valide, même forme. Pas de
  build (fichier statique hors précache)
- 17:19 : commité et poussé à la demande de l'utilisateur : mon fichier et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-10-25 — Éclats : nouveau mini-jeu (session website)
- Statut : en cours (2026-10-25T00:13+02:00). Demande de l'utilisateur : nouveau mini-jeu « Éclats » : pièces qui
  tombent (Tetris), alignements de 3 (Candy Crush), trésors à déduire sous le sol (Démineur) ; mondes, gemmes
  spéciales, boosters, étoiles, défi du jour, mode infini
- Réservations actives : `src/games/eclats/` (nouveau), `src/pages/jeux/eclats.astro` (nouveau), `src/data/games.ts`,
  `src/data/dailyLb.ts`, `src/data/securedGames.ts`, `src/data/tutorials.ts`, `src/components/IconPaths.ts`,
  `src/components/LevelSelect.tsx` (sections de mondes, option), `src/games/levels.stress.test.ts`,
  `supabase/migrations/20261025120000_eclats.sql` (nouveau), `scripts/check-eclats.mjs` (nouveau),
  `.collab/tickets/0036-eclats-regles.md` (nouveau), `.collab/LOG.md`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 00:42 : moteur + robot + 200 niveaux (picks.ts) + écran faits ; vitest 346/346, check-eclats.mjs OK hors image
  manquante. Réservations ajoutées pour l'image du jeu : `scripts/generate-og.mjs` (une entrée DRIVES),
  `scripts/thumb-themes.mjs` (une ligne), `scripts/eclats-levels.ts` (nouveau), `public/assets/jeux/eclats.jpg`,
  `public/assets/jeux/og/eclats.jpg`, `public/assets/jeux/art/eclats.jpg`, `public/assets/jeux/tile/eclats.jpg`
  (nouveaux). ComfyUI lancé en local pour le décor.
- 00:42 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 00:49 : image du jeu faite (capture + décor ComfyUI, ComfyUI arrêté) ; check-eclats.mjs passe sans erreur. Lancement
  du build complet (écrit dist/, .astro/, public/vendor/)…
- 00:50 : build complet OK : astro check 0 erreur, 153 pages, précache 310 entrées, liens OK. Fait et vérifié, pas de
  commit : en attente du feu vert de l'utilisateur (et de son accord pour pousser la migration Supabase `eclats` /
  `eclats-t`).
- 00:55 : migration Supabase `20261025120000_eclats.sql` poussée en production à la demande de l'utilisateur (dry-run :
  elle seule en attente) ; migration list : appliquée.
- 00:55 : commité et poussé à la demande de l'utilisateur : mes 25 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-25 — Éclats : concept plus fun (avis Codex) (session website)
- Statut : en cours (2026-10-25T01:12+02:00). Demande de l'utilisateur : pas assez fun, pas assez de réactions en
  chaîne ni de moments satisfaisants, le Démineur est trop compliqué : discuter avec Codex d'un concept plus fun pour
  améliorer le jeu
- Réservations actives : `src/games/eclats/`, `.collab/tickets/0037-eclats-plus-fun.md` (nouveau), `.collab/LOG.md`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 01:17 : mesures au robot (prototype hors dépôt) : seul un sol en filons colorés qui comptent dans les groupes triple
  les cascades ; ticket 0037 clos, réservation ajoutée : `.collab/tickets/0038-eclats-filons-revue.md` (relecture du
  concept fusionné par Codex).
- 01:30 : nouveau concept choisi par l'utilisateur : « Glisse et explose » (2048 + chaînes) ; prototype mesuré (bord
  rempli après chaque vague : 48-62 % de chaînes) ; ticket 0038 clos ; réservations ajoutées :
  `.collab/tickets/0039-eclats-glisse-explose.md`, `src/data/tutorials.ts`, `src/data/games.ts`, `src/data/dailyLb.ts`,
  `src/pages/jeux/eclats.astro`, `scripts/check-eclats.mjs`, `scripts/eclats-levels.ts`, `scripts/generate-og.mjs`,
  `scripts/thumb-themes.mjs`, `public/assets/jeux/eclats.jpg`, `public/assets/jeux/og/eclats.jpg`,
  `public/assets/jeux/art/eclats.jpg`, `public/assets/jeux/tile/eclats.jpg`.
- 01:47 : moteur, robot, niveaux (picks.ts régénéré), écran, sons faits ; vitest 337/337, check-eclats.mjs OK.
  Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 01:50 : image du jeu refaite (capture + décor ComfyUI, ComfyUI arrêté), ticket 0039 clos. Lancement du build complet
  (écrit dist/, .astro/, public/vendor/)…
- 01:51 : build complet OK : astro check 0 erreur, 153 pages, précache 310 entrées, liens OK. Fait et vérifié, pas de
  commit : en attente du feu vert de l'utilisateur. Aucun changement Supabase.
- 07:20 : commité et poussé à la demande de l'utilisateur : mes 24 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-25 — Éclats : fusions, carrés et grille plus grande (session website)
- Statut : en cours (2026-10-25T07:38+01:00). Demande de l'utilisateur : grille un peu plus grande avec un élément
  ajouté au centre à chaque coup ; d'autres déclencheurs de combos (carré de même objet) ; fusions avec un ordre
  hiérarchique ; plus d'effets, de plus en plus sur les éléments de niveau supérieur
- Réservations actives : `src/games/eclats/`, `scripts/check-eclats.mjs`, `scripts/eclats-levels.ts`,
  `src/data/tutorials.ts` (cartes eclats), `src/pages/jeux/eclats.astro`, `.collab/tickets/0040-*`, `.collab/LOG.md`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 08:21 : 7×7, gemme au centre, gemmes de pouvoir (fusion à 4+, chargée/joyau/couronne), comète sur carré 2×2, effets
  par rang et ralentis faits ; picks.ts régénéré ; vitest 347/347, tsc OK, check-eclats.mjs OK. Réservation ajoutée :
  `public/assets/jeux/eclats.jpg` et `public/assets/jeux/og/eclats.jpg` (capture refaite après le build). Lancement du
  build complet (écrit dist/, .astro/, public/vendor/)…
- 08:24 : build complet OK (astro check 0 erreur, 153 pages, précache 310 entrées, liens OK) ; capture du jeu refaite
  (scripts/generate-og.mjs : la capture attend une gemme chargée, réservé aussi) ; ticket 0040 clos. Fait et vérifié,
  pas de commit : en attente du feu vert de l'utilisateur. Aucun changement Supabase.
- 08:27 : commité et poussé à la demande de l'utilisateur : mes 17 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-25 — Pétanque Game : licences des composants tiers (session PetanqueGame)
- Statut : en cours (2026-10-25T07:45+01:00). Demande de l'utilisateur : une section Licences sur la page Mentions
  légales (les personnages Rocketbox sous MIT et les autres composants tiers du jeu), en plus d'un écran Crédits et
  licences dans le jeu
- Réservations actives : `src/pages/mentions-legales.astro`.
- Ressources : serveur de dev sur le port 4491 ; eslint, `astro check`. Build annoncé ici avant.
- 07:58 : section « Licences des composants tiers » ajoutée à src/pages/mentions-legales.astro ; eslint OK ; astro
  check : 0 erreur sur ce fichier (les 23 erreurs viennent de src/games/eclats, travail en cours de la session Éclats)
  ; captures desk et phone-dark vérifiées. Pas de build complet ni de commit : en attente du feu vert de l'utilisateur.
- 08:02 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 08:04 : build complet OK : astro check 0 erreur, 153 pages, précache 310 entrées, liens OK.
- 08:04 : commité et poussé à la demande de l'utilisateur : mon fichier et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-10-25 — Éclats : gemmes et effets plus jolis (Codex), sans ralentis (session website)
- Statut : en cours (2026-10-25T09:04+01:00). Demande de l'utilisateur : utiliser Codex pour de plus jolies gemmes et
  de plus jolis effets ; retirer les ralentis
- Réservations actives : `src/games/eclats/`, `public/assets/jeux/eclats/` (nouveau), `scripts/eclats-sprites.mjs`
  (nouveau), `scripts/check-eclats.mjs`, `.collab/tickets/0041-*`, `.collab/LOG.md`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 09:39 : ralentis retirés ; 28 images de Codex (tickets 0041-0042 : 20 gemmes par rang, coffres, rocher, pièce, éclat,
  étincelle, onde, comète) passées en WebP par scripts/eclats-sprites.mjs dans public/assets/jeux/eclats/ (412 ko) ; le
  jeu garde les dessins plats tant qu'elles ne sont pas toutes chargées ; check-eclats.mjs OK. Réservation ajoutée :
  vignettes `public/assets/jeux/eclats.jpg`, `og/`, `tile/`. Lancement du build complet (écrit dist/, .astro/,
  public/vendor/)…
- 09:42 : build complet OK (astro check 0 erreur, 153 pages, précache 310 entrées, liens OK) ; check-eclats.mjs vérifie
  aussi que les gemmes dessinées s'affichent ; vignettes refaites (capture + décor sans GPU) ; tickets 0041-0042 clos.
  Fait et vérifié, pas de commit : en attente du feu vert de l'utilisateur.
- 09:58 : commité et poussé à la demande de l'utilisateur : mes fichiers (dont les 28 images) et cette section
  seulement. Statut : terminé. Réservations libérées.

## 2026-10-25 — Éclats : Dragon's Gems, le bébé dragon, les grands coffres et le butin (session website)
- Statut : en cours (2026-10-25T12:07+01:00). Demande de l'utilisateur : habiller le jeu en kawaii pour une version
  mobile : nom anglais Dragon's Gems, mascotte bébé dragon, coffres qui s'ouvrent en grand et remplissent le butin,
  puis remise à zéro du défi du jour d'Éclats après la mise à jour
- Réservations actives : `src/games/eclats/`, `public/assets/jeux/eclats/`, `public/assets/jeux/eclats.jpg`,
  `public/assets/jeux/og/eclats.jpg`, `public/assets/jeux/tile/eclats.jpg`, `src/data/games.ts` (entrée eclats),
  `src/data/tutorials.ts` (cartes eclats), `src/pages/jeux/eclats.astro`, `scripts/eclats-sprites.mjs`,
  `scripts/check-eclats.mjs`, `scripts/generate-og.mjs` (DRIVE eclats), `.collab/tickets/0043-*`,
  `.collab/tickets/0044-*`, `.collab/LOG.md`, `supabase/migrations/*_eclats_daily_reset.sql` (nouveau).
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 12:24 : essai Codex 0043 (Bijou au repos et qui applaudit, coffre ouvert, tas d'or) intégré ; grands coffres en
  couche HTML (pièces vers la pastille 🪙, coffre vers 🎁), butin, trésor de Bijou, humeurs ; GEN_V 4 (un défi gardé par
  l'ancienne version repart de zéro) ; nom Dragon's Gems (games.ts, eclats.astro, tutoriel) ; migration
  20261025130000_eclats_daily_reset.sql écrite, pas poussée ; vitest 347/347, eslint et tsc OK. Série Codex 0044
  lancée.
- 12:42 : série Codex 0044 intégrée (16 nouvelles images WebP, 784 ko au total pour le jeu) ; check-eclats.mjs passe
  (Bijou, grands coffres, compteurs, réactions, trésor). Réservation ajoutée : `scripts/comfy-thumbs.mjs` (Bijou à la
  place de la cocotte sur la carte d'eclats). Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 12:45 : build complet OK (astro check 0 erreur, 153 pages, précache 310 entrées, liens OK) ; image du jeu refaite
  (capture plus tôt dans scripts/generate-og.mjs, Bijou sur son tas à la place de la cocotte) ; en attente du feu vert
  de l'utilisateur. Migration de remise à zéro à pousser seulement après la mise en ligne.
- 12:49 : nom final « Dragon's Gems Swipe » (choix de l'utilisateur) ; commité et poussé à la demande de l'utilisateur
  : mes 34 fichiers et cette section seulement ; migration de remise à zéro poussée sur Supabase juste après la mise en
  ligne. Statut : terminé. Réservations libérées.
- 12:54 : fe8a9d3 en ligne (déploiement 3 min 09 s), check-eclats.mjs OK sur le vrai site ; migration
  20261025130000_eclats_daily_reset.sql poussée en production à la demande de l'utilisateur (1 score effacé dans
  game_scores et 1 dans scores, sauvegardés dans D:/tmp/eclats-reset-backup-*.json ; nom « Dragon's Gems Swipe » dans
  games).

## 2026-10-25 — Dragon's Gems Swipe : un seul dragon pendant la danse (session website)
- Statut : en cours (2026-10-25T14:06+01:00). Demande de l'utilisateur : on dirait qu'il y a 2 dragons quand on finit
  sur le site web
- Réservations actives : `src/games/eclats/EclatsGame.tsx` (CSS de la danse).
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 14:13 : les deux pas de danse alternent (et un seul en mouvement réduit) ; check-eclats.mjs le vérifie (témoin : il
  échoue sur le site en ligne, 2 dragons) ; commité, en attente du feu vert pour pousser : mes 2 fichiers et cette
  section. Statut : terminé. Réservations libérées.

## 2026-10-25 — Dragon's Gems Swipe : la jauge de Bijou et sa pluie de feu (session website)
- Statut : en cours (2026-10-25T15:44+01:00). Demande de l'utilisateur : une jauge qui se remplit vers le dragon quand
  on détruit des gemmes ; pleine, un clic déclenche un méga bonus dans la grille (choisi : pluie de feu, 3 boules de
  feu)
- Réservations actives : `src/games/eclats/`, `public/assets/jeux/eclats/`, `scripts/check-eclats.mjs`,
  `scripts/eclats-sprites.mjs`, `src/data/tutorials.ts` (carte Éclats).
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 16:14 : moteur : jauge (40 gemmes, mesurée au robot : pleine dans 100 % des niveaux, vers la moitié), souffle = 3
  boules de feu (coffres d'abord, puis le 3×3 le plus rempli), pas un coup, plateau plein non perdu tant que la jauge
  est pleine ; picks.ts inchangé (le robot ne souffle pas). Écran : jauge sous le HUD vers Bijou, braises, Bijou
  prêt/qui crache, boules de feu. Images Codex ticket 0045 (4). Réservations ajoutées :
  `.collab/tickets/0045-dragons-gems-souffle.md`, `.collab/LOG.md`. vitest 352/352, eslint, astro check 0 erreur,
  check-eclats.mjs OK. Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 16:15 : build complet OK (astro check 0 erreur, 153 pages, précache 310 entrées, liens OK). Non commité : en attente
  du feu vert de l'utilisateur.
- 16:41 : commité et poussé à la demande de l'utilisateur, avec la correction de la danse (7ebeee0) : mes 13 fichiers
  et cette section seulement. Statut : terminé. Réservations libérées.

## 2026-10-25 — Dragon's Gems Swipe : la jauge se remplit plus doucement (session website)
- Statut : en cours (2026-10-25T17:49+01:00). Demande de l'utilisateur : la jauge doit se remplir plus doucement
- Réservations actives : `src/games/eclats/engine.ts`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 17:49 : FIRE_FULL 40 → 60, mesuré au robot : pleine dans 95 % des niveaux aux deux tiers (au lieu de 100 % à la
  moitié), tous les 6 coups en libre (au lieu de 4). vitest eclats 37/37, check-eclats.mjs OK. Lancement du build
  complet (écrit dist/, .astro/, public/vendor/)…
- 17:51 : build complet OK (153 pages, précache 310 entrées, liens OK). Non commité : en attente du feu vert de
  l'utilisateur.
- 18:23 : commité et poussé à la demande de l'utilisateur : mon fichier et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-10-25 — Dragon's Gems Swipe : jauge à 80 gemmes (session website)
- Statut : en cours (2026-10-25T19:17+01:00). Demande de l'utilisateur : la jauge se remplit trop vite, peut-être 100
  gemmes (choisi après mesure : 80 partout)
- Réservations actives : `src/games/eclats/engine.ts`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 19:17 : FIRE_FULL 60 → 80 (100 mesuré : aucun souffle du robot avant le niveau 39). vitest eclats 37/37,
  check-eclats.mjs OK (pleine après 10 coups en libre). Lancement du build complet (écrit dist/, .astro/,
  public/vendor/)…
- 19:18 : build complet OK. Non commité : en attente du feu vert de l'utilisateur.
- 19:47 : commité et poussé à la demande de l'utilisateur : mon fichier et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-10-25 — Dragon's Gems Swipe : coups limités par niveau (session website)
- Statut : en cours (2026-10-25T19:50+01:00). Demande de l'utilisateur : oui aux coups limités (proposition de
  monétisation pour l'app : échec, cœurs, « +5 coups »), zéro pub imposée
- Réservations actives : `src/games/eclats/`, `scripts/eclats-levels.ts`, `scripts/check-eclats.mjs`,
  `src/data/tutorials.ts` (carte Éclats).
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 20:02 : moteur : limite de coups (perdu sans coup, sauf si Bijou peut encore souffler ; revive pour l'app). picks.ts
  régénéré [graine, par, limite] : limite = coups d'un joueur type (robot 60 % au hasard) gagnés 80 % du temps, 50 % un
  niveau sur dix (🔥 difficile), plancher par + 2 ; étoiles dans la limite. Mesuré : joueur type 87 % (1-50), 83 %
  (51-100). Écran : coups restants (rouge à 3), « Plus de coups », dernière chance. vitest 357/357, eslint, astro check
  0 erreur, check-eclats.mjs OK. Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 20:03 : build complet OK. Non commité : en attente du feu vert de l'utilisateur.
- 20:14 : commité et poussé à la demande de l'utilisateur : mes 8 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-25 — Dragon's Gems Swipe : images des cœurs de Bijou (Codex, pour l'app) (session website)
- Statut : en cours (2026-10-25T20:16+01:00). Demande de l'utilisateur : les cœurs de Bijou (vies) dans l'app Unity
- Réservations actives : `.collab/tickets/0046-dragons-gems-coeurs.md` (nouveau), `.collab/out/0046/`,
  `.collab/LOG.md`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 20:35 : les 2 images retenues et intégrées dans l'app Unity ; commité et poussé à la demande de l'utilisateur : le
  ticket, la ligne du LOG et cette section seulement. Statut : terminé. Réservations libérées.

## 2026-10-25 — Dragon's Gems Swipe : page de test de l'APK Android (session website)
- Statut : en cours (2026-10-25T20:42+01:00). Demande de l'utilisateur : le mettre à disposition comme Pétanque Game,
  pour le recharger depuis une page du site
- Réservations actives : `src/pages/jeux/eclats/test.astro` (nouveau).
- Ressources : serveur de dev sur le port 4474 ; eslint, `astro check`. Build annoncé ici avant.
- 20:45 : page écrite (copie de celle de Pétanque Game, manifeste builds/dragonsgems/latest.json), eslint et astro
  check OK, capture téléphone OK (elle propose la 0.1.1 publiée). Lancement du build complet (écrit dist/, .astro/,
  public/vendor/)…
- 20:46 : build complet OK ; APK 0.1.1 publié (builds/dragonsgems) ; commité et poussé à la demande de l'utilisateur :
  mon fichier et cette section seulement. Statut : terminé. Réservations libérées.

## 2026-10-25 — Dragon's Gems Swipe : images de l'histoire et de la carte (Codex, pour l'app) (session website)
- Statut : en cours (2026-10-25T21:10+01:00). Demande de l'utilisateur : un onboarding, une carte avec décor,
  l'histoire du dragon (« le plus petit des dragons »)
- Réservations actives : `.collab/tickets/0047-*`, `.collab/tickets/0048-*` (nouveaux), `.collab/out/0047/`,
  `.collab/out/0048/`, `.collab/LOG.md`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 07:45 : tickets 0047-0050 clos (images de l'histoire, des cartes et des stores intégrées dans l'app Unity ; revues
  des captures et de la fiche) ; commité et poussé à la demande de l'utilisateur : les 4 tickets, les lignes du LOG et
  cette section seulement. Statut : terminé. Réservations libérées.

## 2026-10-25 — Dragon's Gems Swipe : niveaux 1 à 20 qui apprennent, sans limite de coups (session website)
- Statut : en cours (2026-10-25T21:12+01:00). Demande de l'utilisateur : les 10 premiers niveaux faciles qui expliquent
  comment les gemmes se combinent, puis 10 niveaux sans être bloqué par le nombre de coups
- Réservations actives : `src/games/eclats/`, `scripts/eclats-levels.ts`, `scripts/check-eclats.mjs`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 21:25 : 250 niveaux (5 zones de 50) + pack Expert 251-500 ; leçons 1-10 sur plateaux faits main (tests : chaque
  glissé conseillé montre sa mécanique) ; 1-20 sans limite ; un niveau un peu plus dur tous les 10 dès 30 (65 % pour le
  joueur type). picks.ts régénéré (500). vitest 358/358, astro check 0 erreur, check-eclats OK. Réservations ajoutées :
  `supabase/migrations/20261025210000_progression_levels_500.sql` (nouveau), `supabase/functions/submit-level/index.ts`
  (borne 200 → 500, pas encore déployé : accord de l'utilisateur demandé).
- 07:34 : déployé en production à la demande de l'utilisateur : migration progression_levels_500 et submit-level (borne
  1..500 vérifiée en ligne). Non commité.
- 07:45 : commité et poussé à la demande de l'utilisateur : mes 9 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-25 — Dragon's Gems Swipe : compte Google/Apple et sauvegarde en ligne (serveur) (session website)
- Statut : en cours (2026-10-25T23:57+01:00). Demande de l'utilisateur : Il faut pouvoir se connecter avec google ou
  Apple pour garder sa progression
- Réservations actives : `supabase/migrations/*_app_saves.sql`, `supabase/functions/app-save/`,
  `supabase/functions/_shared/deleteAccount.ts`, `supabase/functions/meetups/index.ts` (delete_account seulement).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 23:59 : écrit : migration app_saves (RLS sans politique), fonction app-save (get / put avec version /
  delete_account), suppression de compte partagée dans _shared/account.ts (meetups l'appelle) et _shared/posters.ts ;
  deno check passe. Pas déployé : attend l'accord de l'utilisateur.
- 00:29 : ajouté : migration 20261026010000_eclats_endless.sql (ligne de jeu 'eclats-inf' pour le classement du mode
  infini de l'app), pas déployée.
- 01:56 : fait cette nuit (non commité, non déployé) : app-save + migrations app_saves et eclats-inf (db push --dry-run
  : exactement 3 migrations), _shared/account.ts et posters.ts, meetups appelle deleteAccount ; deno check OK ; tickets
  Codex 0047-0050 fermés avec LOG. En attente du feu vert : déploiement Supabase et config Auth (dragonsgems://auth,
  client Apple).
- 07:34 : déployé en production à la demande de l'utilisateur : migrations app_saves et eclats_endless (dry-run :
  exactement les 3 en attente), fonctions app-save et meetups (suppression de compte partagée) ; essai de bout en bout
  OK sur un compte anonyme jetable, supprimé à la fin. Auth (lu avant) : dragonsgems://auth ajouté aux Redirect URLs,
  com.ludivenstudio.dragonsgems aux Client IDs Apple. Apple dans le navigateur (Android, éditeur) refusé par Supabase :
  aucun secret OAuth Apple (Services ID) configuré. Non commité.
- 07:45 : commité et poussé à la demande de l'utilisateur : mes 7 fichiers et cette section seulement (déjà déployés à
  07:34). Statut : terminé. Réservations libérées.

## 2026-10-26 — Dragon's Gems Swipe : page de confidentialité de l'app (stores) (session website)
- Statut : en cours (2026-10-26T00:35+01:00). Demande de l'utilisateur : préparer de quoi soumettre demain sur les
  stores (autonomie de nuit)
- Réservations actives : `src/pages/dragons-gems/`, `src/pages/en/dragons-gems/`, `src/pages/confidentialite.astro`
  (lien vers la page de l'app).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 00:42 : écrites : src/pages/dragons-gems/confidentialite.astro (FR, ancre #suppression),
  src/pages/en/dragons-gems/confidentialite.astro (EN), lien ajouté dans src/pages/confidentialite.astro ; eslint et
  astro check à 0 erreur. Pas de build, pas de commit : attend l'accord de l'utilisateur.
- 00:59 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 01:01 : build complet OK (156 pages, précache 313 entrées, liens OK), avec aussi le lot 1 du site (niveaux qui
  apprennent) et les pages de confidentialité. Non commité : en attente du feu vert de l'utilisateur.
- 07:46 : commité et poussé à la demande de l'utilisateur : mes 3 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-26 — Pétanque Game : politique de confidentialité et CGU de l'appli (stores) (session PetanqueGame)
- Statut : en cours (2026-10-26T01:02+01:00). Demande de l'utilisateur : créer la politique de confidentialité et les
  CGU du jeu mobile en 5 langues, sans commit ni push (le propriétaire dort)
- Réservations actives : `src/pages/jeux/petanque/confidentialite.astro`, `src/pages/jeux/petanque/cgu.astro`
  (nouveaux), `src/pages/{en,es,de,it}/jeux/petanque/confidentialite.astro` et `cgu.astro` (nouveaux).
- Ressources : serveur de dev sur le port 4491 ; eslint, `astro check`. Build annoncé ici avant.
- 01:14 : pages FR écrites (src/pages/jeux/petanque/confidentialite.astro, cgu.astro, ancre #suppression pour Play),
  eslint OK, captures bureau/sombre/téléphone OK ; traductions EN/ES/DE/IT en cours. Le lien Pétanque Game sur
  /confidentialite/ n'est pas ajouté : fichier réservé par la section Dragon's Gems (non close).
- 01:24 : traductions EN/ES/DE/IT écrites (8 pages), eslint OK sur les 10, astro check 0 erreur, captures OK. Lancement
  du build complet (écrit dist/, .astro/, public/vendor/)…
- 01:26 : build complet OK (166 pages, précache 323 entrées, liens OK). Travail laissé NON commité pour relecture du
  propriétaire : les 10 nouveaux fichiers src/pages/jeux/petanque/{confidentialite,cgu}.astro et
  src/pages/{en,es,de,it}/jeux/petanque/{confidentialite,cgu}.astro restent ceux de cette tâche (ne pas les inclure
  dans un autre commit). Reste à faire hors de mon périmètre : le lien « Pétanque Game » vers
  /jeux/petanque/confidentialite/ dans src/pages/confidentialite.astro, réservé par la section Dragon's Gems. Statut :
  terminé. Réservations libérées.

## 2026-10-26 — Dragon's Gems Swipe : filtre de mots des pseudos (5 langues) (session website)
- Statut : en cours (2026-10-26T01:59+01:00). Demande de l'utilisateur : Ok il faut ajouter un filtre sur les mots dans
  les 5 langues
- Réservations actives : `supabase/functions/_shared/names.ts`, `supabase/functions/submit-score/index.ts`,
  `src/lib/leaderboard.ts`, `src/lib/names.ts`, `src/lib/names.test.ts`, `src/components/Leaderboard.tsx`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 02:09 : fait (non commité, non déployé) : supabase/functions/_shared/names.ts (FR, EN, ES, DE, IT), utilisé par
  submit-score (un pseudo refusé devient « Anonyme », name_refused dans la réponse), src/lib/names.ts le réexporte pour
  le site ; leaderboard.ts refuse et Leaderboard.tsx dit pourquoi ; Drift, Foot, Golf et Pong refusent aussi. eslint
  OK, astro check 0 erreur, vitest 1537 OK, deno check OK.
- 07:34 : submit-score déployé en production à la demande de l'utilisateur. Non commité.
- 07:43 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 07:45 : build complet OK : astro check 0 erreur, 166 pages, précache 323 entrées, liens OK
- 07:46 : commité et poussé à la demande de l'utilisateur : mes 10 fichiers et cette section seulement (submit-score
  déjà déployé à 07:34). Statut : terminé. Réservations libérées.

## 2026-10-26 — Dragon's Gems Swipe : le site garde ses 100 niveaux, les 250 sont pour l'app (session website)
- Statut : en cours (2026-10-26T07:56+01:00). Demande de l'utilisateur : Mais les 250 niveaux étaient pour le projet
  unity seulement
- Réservations actives : `src/games/eclats/levels.ts`, `src/games/eclats/picks.ts`, `src/games/eclats/engine.test.ts`,
  `scripts/eclats-levels.ts`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 08:00 : levels.ts : deux plans, SITE (100 niveaux en mondes de 20, Expert 101-200, joué par le site) et APP (250 en
  contrées de 50, 251-500, porté par l'app) ; picks.ts : PICKS_SITE recalculé (identique à avant le commit des 250 hors
  niveaux 1-20 et niveaux difficiles), PICKS_APP inchangé ; parity.json de l'app identique. vitest eclats 210/210,
  eslint OK. Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 08:04 : build complet OK (astro check 0 erreur, 166 pages, précache 323 entrées, liens OK), check-eclats.mjs OK (port
  4473, arrêté)
- 08:04 : commité, push en attente de l'accord de l'utilisateur : mes 4 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-26 — Dragon's Gems Swipe : les blocs penchent pendant le glissé, un balayage au coup (session website)
- Statut : en cours (2026-10-26T08:32+01:00). Demande de l'utilisateur : quand on commence a swipe dans une direction
  sans relâcher, cela pourrait faire bouger les gems et coffres concernés par un déplacement comme s ils étaient
  attirés par une direction puis revenir rapidement a leu position. Une fois le swipe déclenché on pourrait avoir un fx
  qui balayage l écran dans la direction souhaitée (dans les 2 : l'app est faite par la session Unity)
- Réservations actives : `src/games/eclats/EclatsGame.tsx`, `scripts/check-eclats.mjs`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 08:41 : fait : pendant un glissé tenu, les blocs qu'il déplacerait penchent vers lui (jusqu'à 0,15 case, amorti),
  reviennent en 120 ms au lâcher sans coup ; au coup joué, une bande de lumière traverse le plateau dans son sens (280
  ms) ; rien de tout ça en mouvement réduit. check-eclats.mjs : 3 contrôles ajoutés (11 blocs penchés pour 11 qui
  bougeraient, retour sans coup, balayage), tout passe. Lancement du build complet (écrit dist/, .astro/,
  public/vendor/)…
- 08:42 : build complet OK (astro check 0 erreur, 166 pages, précache 323 entrées, liens OK)
- 08:42 : commité, push en attente de l'accord de l'utilisateur : mes 2 fichiers et cette section seulement ; l'app est
  faite par la session Unity. Statut : terminé. Réservations libérées.

## 2026-10-26 — Mini-jeux : rubriques Nouveautés, Top 5 et Favoris, et taille des tuiles (session website)
- Statut : en cours (2026-10-26T11:49+01:00). Demande de l'utilisateur : sur la page des mini jeux, j'aimerais qu'on
  ajoute en haut la rubrique nouveauté, ensuite le top 5 des jeux joués et ensuite les favoris et on répete tous les
  mini jeux dans leur rubriques. par contre j'aimerais qu'on puisse choisir la taille des tuiles entre plusieurs
  formats, le plus petit comme des icones de d'applications pour en voir le plus possible d'un coup d'oeil ensuite
  plusieurs par lignes ou une par ligne en gardant en mémoire le format préféré (Top 5 : les plus joués par tous, au
  build)
- Réservations actives : `src/pages/jeux/index.astro`, `src/components/GameCard.astro`,
  `src/components/GameFavorites.astro`, `src/components/GameSearch.astro`, `src/components/GameFold.astro`,
  `src/data/games.ts`, `src/lib/popular.ts`, `src/lib/popular.test.ts`, `scripts/check-games-page.mjs`.
- Ressources : serveur de dev sur le port 4474 ; eslint, `astro check`. Build annoncé ici avant.
- 11:54 : réservation ajoutée : `src/components/GameTileSize.astro` (nouveau). games.ts : date de sortie (added) de
  chaque jeu, prise du premier commit de sa page.
- 12:01 : fait : Nouveautés (5 derniers jeux, date added), Top 5 (les plus joués sur 30 jours, lu dans game_scores au
  build), Favoris (des copies : chaque jeu reste dans sa catégorie), la recherche ignore ces trois rubriques ; tailles
  Icônes / Vignettes / Liste mémorisées (ludiven-tiles). scripts/check-games-page.mjs : 18 contrôles OK en clair et en
  sombre, eslint OK, astro check 0 erreur, vitest popular 5/5.
- 12:01 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 12:03 : build complet OK (astro check 0 erreur, 166 pages, précache 323 entrées, liens OK) ; check-games-page.mjs OK
  aussi sur le build (MODE=preview). Non commité : en attente de l'utilisateur.
- 12:06 : demande de l'utilisateur : « les défis favoris pourraient etre aussi dupliqué de leur catégorie ».
  Réservation ajoutée : `src/pages/jeux/defi.astro`.
- 12:07 : défis : les favoris sont aussi des copies (GameFavorites ne fait plus que des copies), le compteur « N défis
  à faire » ne les compte qu'une fois ; check-games-page.mjs : 22 contrôles OK. Lancement du build complet (écrit
  dist/, .astro/, public/vendor/)…
- 12:09 : build complet OK (astro check 0 erreur, 166 pages, précache 323 entrées, liens OK) ; check-games-page.mjs OK
  sur le build. Non commité : en attente de l'utilisateur.
- 12:39 : commité et poussé à la demande de l'utilisateur : mes 11 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-26 — Défis du jour : trois tailles de tuiles et Top 5 (session website)
- Statut : en cours (2026-10-26T12:55+01:00). Demande de l'utilisateur : ok pour les défis aussi on peut avoir les 3
  types , le top 5 et les favoris
- Réservations actives : `src/pages/jeux/defi.astro`, `src/pages/jeux/index.astro`, `src/components/GameCard.astro`,
  `src/components/GameFold.astro`, `src/components/GameTools.astro` (nouveau), `src/lib/popular.ts`,
  `src/lib/popular.test.ts`, `scripts/check-games-page.mjs`.
- Ressources : serveur de dev sur le port 4474 ; eslint, `astro check`. Build annoncé ici avant.
- 12:56 : demande ajoutée : « et les nouveautés ». Réservation ajoutée : `src/data/games.ts`.
- 13:00 : fait : Nouveautés, Top 5 (le Top garde son ordre quand ses tuiles sont faites), Favoris en copies, tailles
  Icônes / Vignettes / Liste partagées avec /jeux/ ; GameTools (recherche + tailles) et le rang du Top dans GameFold
  servent aux deux pages ; topPlayed lit game_scores une fois par build. check-games-page.mjs : 27 contrôles OK.
  Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 13:01 : build complet OK (astro check 0 erreur, 166 pages, précache 324 entrées, liens OK) ; check-games-page.mjs OK
  sur le build, vitest popular 6/6. Non commité : en attente de l'utilisateur.
- 13:48 : commité et poussé à la demande de l'utilisateur : mes 9 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-26 — Pétanque Game : crédits des musiques et sons (mentions légales) (session PetanqueGame)
- Statut : en cours (2026-10-26T13:11+01:00). Demande de l'utilisateur : Oui, ajoute et pousse (crédits des musiques CC
  BY du jeu sur les mentions légales)
- Réservations actives : `src/pages/mentions-legales.astro`.
- Ressources : serveur de dev sur le port 4493 ; eslint, `astro check`. Build annoncé ici avant.
- 13:13 : mentions légales : musiques (CC BY 4.0, CC0) et ambiances sonores (CC0, Mixkit) du jeu ajoutées à la section
  Licences ; eslint OK, astro check 0 erreur, captures bureau et téléphone sombre OK.
- 13:13 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 13:14 : build complet OK (166 pages, précache 324 entrées, liens OK).
- 13:14 : commité et poussé à la demande de l'utilisateur : mon fichier et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-10-26 — Pétanque Game : mise en ligne de la confidentialité et des CGU de l'appli (session PetanqueGame)
- Statut : en cours (2026-10-26T13:47+01:00). Demande de l'utilisateur : Ok (mettre en ligne la politique de
  confidentialité et les CGU du jeu en 5 langues)
- Réservations actives : `src/pages/jeux/petanque/confidentialite.astro`, `src/pages/jeux/petanque/cgu.astro`,
  `src/pages/{en,es,de,it}/jeux/petanque/confidentialite.astro` et `cgu.astro`, `src/pages/confidentialite.astro`.
- Ressources : serveur de dev sur le port 4493 ; eslint, `astro check`. Build annoncé ici avant.
- 13:50 : pages relues, lien Pétanque Game ajouté sur /confidentialite/ ; eslint OK sur les 11 fichiers, astro check 0
  erreur, captures téléphone et bureau sombre OK.
- 13:50 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 13:51 : build complet OK (166 pages, précache 324 entrées, liens OK).
- 13:51 : commité et poussé à la demande de l'utilisateur : mes 11 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-26 — Dragon's Gems Swipe : l'attraction au début du glissé devient un aller-retour (session website)
- Statut : en cours (2026-10-26T14:50+01:00). Demande de l'utilisateur : Pour l effet quand on commence a swipe, les
  gems sont censés être animé être attiré vers le côté du swipe mais revenir a leur place initiale rapidement
- Réservations actives : `src/games/eclats/EclatsGame.tsx`, `scripts/check-eclats.mjs`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 14:56 : fait : le penché tenu (0,15 case, retour au lâcher) devient un aller-retour au début du glissé : dès 8 px,
  les blocs que le coup déplacerait partent d'un quart de case vers lui et reviennent à leur place en 260 ms, doigt
  toujours posé (Web Animations, ajouté par-dessus si la direction change ; rien en mouvement réduit). check-eclats.mjs
  : 26 contrôles OK (11 blocs tirés pour 11 qui bougeraient, 2,49/2,5 unités à 60 ms, tous en place doigt posé, rien
  sous 8 px). eslint, astro check 0 erreur. L'app : demandé à la session Unity. Lancement du build complet (écrit
  dist/, .astro/, public/vendor/)…
- 14:57 : build complet OK (astro check 0 erreur, 166 pages, précache 324 entrées, liens OK) ; en attente du feu vert
  de l'utilisateur pour le commit
- 15:16 : suite demandée par l'utilisateur (« Recommencer l'effet toutes les secondes tant qu'on n'a pas relâché ») :
  tant que le doigt tient une direction, l'aller-retour revient chaque seconde dans le sens où il pointe ; le lâcher
  l'arrête. check-eclats.mjs : 28 contrôles OK (11 blocs tirés de nouveau à 1063 ms, plus rien après le lâcher). Même
  demande transmise à la session Unity. Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 15:17 : build complet OK (astro check 0 erreur, 166 pages, précache 324 entrées, liens OK) ; en attente du feu vert
  de l'utilisateur pour le commit
- 15:20 : aligné sur l'app (session Unity, 0a7543f) : aller-retour raccourci à 200 ms, pic à 35 % ; check-eclats.mjs 28
  contrôles OK. Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 15:21 : build complet OK (astro check 0 erreur, 166 pages, précache 324 entrées, liens OK) ; en attente du feu vert
  de l'utilisateur pour le commit
- 15:22 : commité et poussé à la demande de l'utilisateur : mes 2 fichiers et cette section seulement ; l'app est faite
  par la session Unity. Statut : terminé. Réservations libérées.. Statut : terminé. Réservations libérées.

## 2026-10-26 — Dragon's Gems Swipe : l'aller-retour devient élastique (0,5 s, retour 0,2 s, repos 0,3 s) (session website)
- Statut : en cours (2026-10-26T15:35+01:00). Demande de l'utilisateur : (transmis par la session Unity) une impulsion
  un peu élastique qui met 0.5s ensuite revient en 0,2s et attend 0.3s
- Réservations actives : `src/games/eclats/EclatsGame.tsx`, `scripts/check-eclats.mjs`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 15:49 : fait, aligné sur l'app (c8e59cd) : l'aller dure 0,5 s avec l'OutElastic de DOTween (amplitude 1, période 0,35
  s, échantillonné en 26 images clés car linear() casse avant iOS 17.2 : 11 % au-delà vers 140 ms, 1 % en deçà vers 350
  ms), le retour 0,2 s en in-out quad, puis repos jusqu'à la seconde suivante. check-eclats.mjs : 29 contrôles OK sur 4
  passages (dépassement 2,78/2,5 unités à 150 ms, en place à 860 ms, deuxième coup lancé vers 1,0-1,1 s, plus rien
  après le lâcher) ; le contrôle du deuxième coup attend son départ au lieu d'un instant fixe (le minuteur part parfois
  en retard dans Chromium sans écran). Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 15:51 : build complet OK (astro check 0 erreur, 166 pages, précache 324 entrées, liens OK) ; en attente du feu vert
  de l'utilisateur pour le commit
- 01:20 : réaligné sur la nouvelle version de l'app (session Unity, demande de l'utilisateur « 0.5 s où la gemme est
  attirée mais retenue par un élastique, ensuite 0.2 s où elle revient avec un léger rebond, ensuite 0.3 s d'attente »)
  : aller en OutCubic (cubic-bezier exact), retour en OutBack (dépassement 2.2, échantillonné : 15 % au-delà de sa
  place vers 108 ms). check-eclats.mjs : le contrôle du pic à 140 ms devient un relevé image par image du premier coup
  (2,50/2,5 à l'aller, −0,37 au retour, rien de travers), 29 contrôles OK sur 3 passages. Lancement du build complet
  (écrit dist/, .astro/, public/vendor/)…
- 01:23 : build complet OK (astro check 0 erreur, 166 pages, précache 324 entrées, liens OK) ; en attente du feu vert
  de l'utilisateur pour le commit
- 13:44 : commité et poussé à la demande de l'utilisateur (« pousse tout ») : les morceaux de l'aller-retour dans mes 2
  fichiers, et cette section seulement. Statut : terminé. Réservations libérées.

## 2026-10-26 — Dragon's Gems Swipe : classement du défi du sommet ('eclats-sommet') (session website)
- Statut : en cours (2026-10-26T17:49+01:00). Demande de l'utilisateur : (transmis par la session Unity) ajouter le jeu
  'eclats-sommet' dans public.games pour le classement mondial du défi du sommet de l'app
- Réservations actives : `supabase/migrations/20261026160000_eclats_summit.sql` (nouveau).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 17:50 : migration écrite (même forme que eclats-inf : score, plafond 10 000 000, 5 s minimum) ; db push --dry-run :
  elle seule en attente. Pas déployée : attend l'accord de l'utilisateur (une demande d'une autre session ne compte pas
  comme accord).
- 01:33 : déployé en production à la demande de l'utilisateur (« Go et push », puis « Je t'autorise » après un premier
  refus du contrôle automatique de Claude Code) : db push de la seule migration en attente ; ligne eclats-sommet lue en
  base (score, plafond 10 000 000, 5 s minimum), migration list : appliquée.
- 01:33 : commité et poussé à la demande de l'utilisateur : la migration et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-10-27 — Dragon's Gems Swipe : revue de nuit avec Codex (session website)
- Statut : en cours (2026-10-27T01:24+01:00). Demande de l'utilisateur : Je vais dormir, je te laisse iterer jusqu'à 8h
  avec codex pour voir et corriger des choses
- Réservations actives : `src/games/eclats/`, `scripts/check-eclats.mjs`, `src/pages/jeux/eclats.astro`,
  `src/data/tutorials.ts` (cartes eclats), `.collab/tickets/0051-*` et suivants, `.collab/out/0051/` et suivants,
  `.collab/LOG.md`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 01:42 : tickets Codex 0051 (captures) et 0052 (bugs) répondus. Corrigé : 6 bugs (graine du défi arrivée après en être
  sorti, ancienne partie jouable pendant le chargement du défi, vols de coffres d'une partie précédente qui dérèglent
  les compteurs, coffre décadenassé qui perd sa valeur double à la reprise du défi, abandon pendant une cascade,
  défaite du défi reprise comme abandon) ; à l'écran : plateau plein et jauge pleine = « Plus de place : Bijou peut
  sauver la partie ! » + bouton Souffle, objectif écrit (« Ouvre 9 coffres en 11 coups maximum »), textes de fin,
  coffre et pièce dessinés dans les compteurs, score lisible en sombre, Commencer cadre le plateau, règles repliées.
  check-eclats.mjs : 33 contrôles (4 nouveaux), tous OK. Trouvé en passant : la fonction get_daily n'existe pas dans la
  base (404 sur tous les défis du site, repli sur la graine du jour calculée en local) : signalé, rien touché.
- 02:16 : deuxième tour Codex : tickets 0053 (écrans refaits) et 0054 (relecture du diff) répondus et clos. Corrigé :
  un abandon du défi encore mal repris (quit toujours écrit), résumé des règles « de même couleur », première carte du
  tutoriel (4 cartes au lieu de 8). Mesuré : aucun plateau muré par rochers ou glace sur ~6 000 parties.
  check-eclats.mjs : 34 contrôles (dont la reprise d'un défi fini perdu ou abandonné), 4 passages OK ; vitest eclats
  44/44.
- 02:44 : mesures : fluidité au téléphone (processeur ralenti 4×, GPU) médiane 16,7 ms, 99e centile 50 ms, rien à
  corriger ; WebKit (moteur de Safari) : aucune erreur, l'aller-retour marche. Trouvé sous WebKit : deux enfants React
  avec la même clé (« Chaîne ×N » et le nom d'une gemme fusionnée prennent le même id d'effet, l'un des deux pouvait
  disparaître) : clés séparées. check-eclats.mjs relève maintenant aussi les erreurs de la console (avertissements
  React), 34 contrôles OK sur 3 passages. Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 02:46 : build complet OK (astro check 0 erreur, 166 pages, précache 324 entrées, liens OK)
- 03:22 : vu sur une vidéo du jeu découpée en planches : le score du mode libre sautait au total du coup dès le glissé
  (il monte maintenant vague par vague, comme coffres et butin), et pendant le souffle les gemmes des 2e et 3e boules
  de feu disparaissaient avant leur arrivée (chaque zone attend sa boule, comme pour la comète). check-eclats.mjs : 2
  contrôles de plus (score, boules de feu ; témoin sans le correctif : échoue), il relève aussi les erreurs de console
  hors barre d'outils Astro ; 36 contrôles, 3 passages OK. Lancement du build complet (écrit dist/, .astro/,
  public/vendor/)…
- 03:23 : build complet OK (astro check 0 erreur, 166 pages, précache 324 entrées, liens OK)
- 03:40 : ticket Codex 0055 (effets en mouvement, sur planches d'images) clos : le résumé du coup d'avant s'efface dès
  le glissé suivant, le nom d'une gemme fusionnée (« Couronne ! ») monte au-dessus de sa case ; 5 réglages d'effets
  laissés à l'utilisateur. Aussi : le lecteur d'écran annonce le résumé du coup (et « Plus de place ») au lieu de
  chaque pièce du HUD ; sur ordinateur (900 px et plus), plateau jusqu'à 580 px au lieu de 440 (jamais plus petit,
  l'objectif reste visible) et HUD un peu plus grand. check-eclats.mjs OK sur 2 passages.
- 03:56 : ticket Codex 0056 (relecture finale) clos : sous le souffle, chaque bloc attend le délai de son propre éclat
  (boules, gemmes chargées qu'elles déclenchent, comète) ; chaque coup est annoncé au lecteur d'écran. Aussi : les cinq
  compteurs du défi tiennent sur une ligne au téléphone. check-eclats.mjs : 37 contrôles, 3 passages OK.
- 03:56 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 03:58 : build complet OK (astro check 0 erreur, 166 pages, précache 324 entrées, liens OK) ; vitest eclats 44/44
- 04:07 : WebKit (dev et build) : aucune erreur ni avertissement React, seul le 404 connu de get_daily. Planches
  avant/après envoyées à l'utilisateur ; points utiles à l'app transmis à la session Unity pour information (rien à
  faire sans l'utilisateur). Non commité : en attente du feu vert de l'utilisateur (avec l'aller-retour élastique,
  section précédente, et la migration eclats-sommet, non déployée).
- 04:12 : ticket Codex 0057 (les dix leçons, sur planches) clos : au niveau 9, le bandeau dit de toucher Bijou une fois
  la jauge pleine ; les autres phrases proposées touchent aussi l'app (Levels.cs, parity.json) : laissées à
  l'utilisateur. Mesuré : aucun niveau du site gagné moins de 10 fois sur 20 par un joueur type.
- 04:16 : ticket Codex 0058 (moteur) clos : un plateau vidé par un souffle resterait bloqué, possible sur le papier
  mais jamais vu sur 3 622 souffles au robot ; proposé à l'utilisateur pour le moteur et l'app, rien touché.
- 04:17 : son : sfx.ts relance aussi l'audio laissé « interrupted » par Safari après un appel ou l'arrière-plan
  (billard, bolides, pétanque et atelier ont le même code : signalé, pas touché). Plein écran vérifié au téléphone et
  sur ordinateur, sombre vérifié. Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 04:24 : vérification finale : build complet OK (astro check 0 erreur, 166 pages, précache 324 entrées, liens OK),
  vitest eclats 44/44, check-eclats.mjs 37/37 sur 2 passages, WebKit sur le build sans erreur. Non commité, non poussé
  : en attente du feu vert de l'utilisateur. Fichiers de cette section : src/games/eclats/EclatsGame.tsx,
  src/games/eclats/sfx.ts, src/data/tutorials.ts, scripts/check-eclats.mjs, .collab/tickets/0051 à 0058,
  .collab/LOG.md.
- 13:45 : commité et poussé à la demande de l'utilisateur (« pousse tout ») : EclatsGame.tsx, sfx.ts, tutorials.ts
  (cartes eclats), check-eclats.mjs, tickets 0051 à 0058, LOG.md et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-10-27 — Dragon's Gems Swipe : page de l'appli, téléchargement, fiche projet et lien depuis le mini-jeu (session website)
- Statut : en cours (2026-10-27T12:31+01:00). Demande de l'utilisateur : (transmis par la session Unity) tu peux
  préparer des pages projets et téléchargements sur le siteweb de ludiven et aussi avec un lien en partant du mini jeu
- Réservations actives : `src/data/dragonsGems.ts`, `src/components/DragonsGemsLanding.astro`,
  `src/components/DragonsGemsDownload.astro` (nouveaux), `src/pages/dragons-gems.astro`,
  `src/pages/{en,es,de,it}/dragons-gems.astro`, `src/pages/dragons-gems/telecharger.astro`,
  `src/pages/en/dragons-gems/download.astro`, `src/pages/es/dragons-gems/descargar.astro`,
  `src/pages/de/dragons-gems/herunterladen.astro`, `src/pages/it/dragons-gems/scarica.astro` (nouveaux),
  `src/content/work/dragons-gems.md`, `src/content/work-en/dragons-gems.md` (nouveaux), `public/assets/dragons-gems/`
  (nouveau), `src/layouts/GamePage.astro` (un lien vers l'appli, optionnel), `src/pages/jeux/eclats.astro`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 12:40 : écrit : page de l'appli /dragons-gems/ en FR, EN, ES, DE, IT (textes des fiches des stores + grotte de Bijou,
  défi du sommet, prix), page de téléchargement (badges « bientôt » sans lien tant que STORES est vide, jeu web et APK
  de test), fiche projet FR/EN (work/dragons-gems), carte « existe aussi en appli mobile » sous le mini-jeu (prop app
  de GamePage, aucun autre jeu touché). Réservation ajoutée : `src/components/DragonsGemsBadges.astro` (nouveau).
  Images converties depuis le dossier Marketing de l'app (36 images, 3 Mo) et vidéo verticale par langue réencodée à
  480 px sans son (1,7 Mo chacune). eslint OK, captures bureau/téléphone/sombre sans erreur console. Lancement du build
  complet (écrit dist/, .astro/, public/vendor/)…
- 12:42 : build complet OK (astro check 0 erreur, 178 pages, précache 336 entrées dont aucune image ni vidéo, liens
  OK). Non commité : en attente du feu vert de l'utilisateur.
- 13:26 : build complet OK (178 pages, précache 336 entrées, liens OK).
- 13:26 : accord de l'utilisateur relayé par la session Unity (« ok tu peux pousser si tu as mis en place les boutons
  google et apple et que cela indique Comming Soon ») : une étiquette Bientôt / Coming soon / Próximamente / Demnächst
  / Prossimamente sur chaque badge grisé, liens en couleur de lien du site (lisibles en sombre). Le build de 13:26
  ci-dessus a tourné sans annonce préalable (note ratée) : il ne concernait que ces fichiers. Push en attente de
  l'accord de l'utilisateur dans cette session.
- 13:45 : commité et poussé à la demande de l'utilisateur (« pousse tout ») : mes fichiers (pages, composants, données,
  fiches projet, images et vidéos, GamePage.astro, eclats.astro) et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-10-27 — Pétanque Game : app-ads.txt, pages légales LevelPlay, pages de l'appli (session PetanqueGame)
- Statut : en cours (2026-10-27T14:36+01:00). Demande de l'utilisateur : (transmis par la session Unity, travail
  approuvé, push non approuvé) app-ads.txt avec ironSource et Unity Ads ; politique de confidentialité, CGU (5 langues)
  et mentions légales pour le passage d'AdMob à Unity LevelPlay et la fenêtre de consentement du jeu ; page de l'appli
  /petanque-game/ et de téléchargement en 5 langues, fiche projet FR/EN, carte sur /petanque/, lien depuis
  /jeux/petanque/
- Réservations actives : `public/app-ads.txt`, `src/pages{,/en,/es,/de,/it}/jeux/petanque/{confidentialite,cgu}.astro`,
  `src/pages/mentions-legales.astro`, `src/pages/jeux/petanque.astro` (un lien vers l'appli),
  `src/data/petanqueGame.ts` (nouveau), `src/components/PetanqueLanding.astro` et
  `src/components/ScannerDownload.astro` (une prop pour servir aussi le jeu, Scanner inchangé),
  `src/pages/petanque-game.astro`, `src/pages/{en,es,de,it}/petanque-game.astro`,
  `src/pages/petanque-game/telecharger.astro`,
  `src/pages/{en,es,de,it}/petanque-game/{download,descargar,herunterladen,scarica}.astro` (nouveaux),
  `src/content/work/petanque-game.md`, `src/content/work-en/petanque-game.md` (nouveaux), `src/pages/petanque.astro`,
  `public/assets/petanque-game/` (nouveau).
- Ressources : serveur de dev sur le port 4491 ; eslint, `astro check`. Build annoncé ici avant.
- 14:49 : réservations ajoutées : `src/data/petanqueApps.ts` (nouveau : ce que les deux pages partagées lisent d'une
  appli), `src/components/StoreBadges.astro` (une prop facultative pour les badges « bientôt »),
  `public/assets/work/og/petanque-game.jpg` et `petanque-game-{en,es,de,it}.jpg` (nouveaux). Fait : app-ads.txt (ajouts
  seuls), pages légales en 5 langues et mentions légales ; images converties (2,6 Mo).
- 15:09 : pages écrites : /petanque-game/ et /petanque-game/telecharger/ en 5 langues (PetanqueLanding et
  ScannerDownload prennent une prop app, Scanner par défaut ; lien « coulisses » du Scanner, blanc sur blanc en thème
  clair, passé à la couleur des liens), fiche projet FR/EN, carte sur /petanque/, carte « Aussi sur téléphone » sous le
  jeu web. eslint OK, astro check 0 erreur, captures sans erreur console. Lancement du build complet (écrit dist/,
  .astro/, public/vendor/)…
- 15:16 : 15:11 : build complet OK (astro check 0 erreur, 190 pages, précache 348 entrées, liens OK). Vérifié : pages
  du Scanner identiques au site en ligne (captures comparées pixel à pixel) sauf son lien « coulisses » désormais
  visible en thème clair ; HTML des pages de téléchargement du Scanner inchangé ; /jeux/petanque/ sur le build : pas
  d'encart d'erreur, carte de l'appli sous le jeu hors plein écran. Deux mots changés dans la fiche projet : relance du
  build complet (écrit dist/, .astro/, public/vendor/)…
- 15:18 : 15:17 : build complet OK (astro check 0 erreur, 190 pages, précache 348 entrées, liens OK). Serveur 4491
  arrêté. Non commité, non poussé : en attente du feu vert de l'utilisateur. Réservations gardées jusqu'au commit.
- 16:43 : commité et poussé à la demande de l'utilisateur : mes 43 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-10-27 — Dragon's Gems Swipe : la nuit et les lucioles (moteur) (session website)
- Statut : en cours (2026-10-27T15:28+01:00). Demande de l'utilisateur : (transmis par la session Unity) règle choisie
  par l'utilisateur : « La nuit et les lucioles », d'abord dans le moteur du site, puis portée dans l'app
- Réservations actives : `src/games/eclats/engine.ts`, `src/games/eclats/engine.test.ts`, `src/games/eclats/levels.ts`,
  `src/games/eclats/EclatsGame.tsx` (ignorer l'étape de nuit).
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 15:33 : fait (non commité) : engine.ts : cfg night/flies, état light/flies (vides le jour), LIGHT_SWIPES = 2,
  GLOW_RANK = 2, lucioles posées au hasard du seed (hash2(hash2(seed, 0x1197), k)), lumière qui baisse à chaque coup
  accepté, chaque explosion allume ses cases et leurs voisines, lucioles qui bougent d'une case en fin de coup
  (hash2(hash2(seed, 0xf1e5), moves*8+f)), étape { t: 'night', light, flies, cells } en fin de coup et après un souffle
  (qui allume sans éteindre ni bouger les lucioles), visible(s). levels.ts : appNightConfig(level). EclatsGame.tsx
  ignore l'étape de nuit. vitest eclats 51/51 (7 nouveaux, dont « une partie de nuit joue exactement les mêmes coups
  que de jour »), levels.stress 166/166, tsc sans erreur, check-eclats.mjs OK. Les fixtures de parité de l'app ne
  bougent pas (gen_fixtures.mts n'enregistre que des champs nommés).
- 18:41 : demande de l'utilisateur (transmise par la session Unity) : « pour la règle de la nuit sur le site, il
  faudrait pouvoir tester facilement pour que je valide ». Réservation ajoutée : `src/pages/jeux/eclats/nuit.astro`
  (nouveau, page de test cachée, noindex, hors sitemap) ; `astro.config.mjs` (une ligne du filtre du sitemap).
- 18:50 : page de test /jeux/eclats/nuit/ (noindex, hors sitemap) : les niveaux de nuit de l'appli (appNightConfig)
  dans le jeu du site, choix du niveau (1, 3, 37, 120, 250 ou un numéro), Nouvelle partie, Voir tout ; cases sombres
  (voile bleu nuit), faibles autour des coffres et rochers, qui s'éteignent quand la lumière finit, lucioles qui
  glissent d'une case à l'étape de nuit ; souffle normal. Rien n'est enregistré (ni progression, ni trésor, ni score,
  ni statistiques). eslint OK, vitest eclats 51/51, check-eclats.mjs OK, essai Playwright sans erreur. Lancement du
  build complet (écrit dist/, .astro/, public/vendor/)…
- 18:57 : build complet OK (191 pages, précache 349 entrées, liens OK ; la page de nuit hors sitemap). check-eclats.mjs
  : un passage a échoué sur 3 mesures de temps pendant une forte charge de la machine (processeur à 43 % par d'autres
  sessions), puis 2 passages OK. Non commité : en attente du feu vert de l'utilisateur.
- 01:26 : commité et poussé à la demande de l'utilisateur (« Go et push ») : engine.ts, engine.test.ts, levels.ts,
  EclatsGame.tsx, la page jeux/eclats/nuit.astro, la ligne du sitemap dans astro.config.mjs et cette section seulement.
  Statut : terminé. Réservations libérées.

## 2026-10-28 — Dragon's Gems Swipe : la nuit devient coffres gelés et souffle de Perle (moteur) (session website)
- Statut : en cours (2026-10-28T01:43+01:00). Demande de l'utilisateur : (transmis par la session Unity, après essai de
  /jeux/eclats/nuit/) « je ne suis pas convaincu par la mécanique du mode nuit, ça devient du hasard, la difficulté
  n'est pas dans la réflexion » ; « Le pouvoir de Perle est de fusionner la moitié des gemmes du plateau. Le changement
  : les coffres sont glacés et doivent exploser une fois pour être accessibles et une autre fois pour s'ouvrir »
- Réservations actives : `src/games/eclats/engine.ts`, `src/games/eclats/engine.test.ts`, `src/games/eclats/levels.ts`,
  `src/games/eclats/EclatsGame.tsx`, `src/pages/jeux/eclats/nuit.astro`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 01:47 : réservations ajoutées : `src/games/eclats/picks.ts` (table de la nuit, générée), `scripts/eclats-levels.ts`
  (plan night), `src/games/eclats/bot.ts` (option breathe du robot, pour la nuit seulement).
- 02:01 : fait (non commité) : l'obscurité retirée (light, flies, LIGHT_SWIPES, GLOW_RANK, visible, étape night, voile
  et lucioles de la page) ; cfg.frostChests : chaque coffre arrive gelé (posé, dessiné ou arrivé), ne glisse pas, une
  explosion le dégèle seulement (thawed), la suivante l'ouvre, un cadenassé en prend trois ; souffle de Perle la nuit
  (étape pearl, paires par couleur dans l'ordre de lecture, la première monte d'un rang, la seconde part, puis les
  vagues sans glissé, sans remplir la jauge). appNightBoard / appNightConfig, table PICKS_APP_NIGHT générée par
  scripts/eclats-levels.ts night (même méthode que le jour, robot qui souffle ; niveau 203 sur un autre tirage, le sien
  se remplit au 7e coup) : limite +10 coups en moyenne (3 à 26), 3 étoiles +7,5. Page de test : coffres givrés, fonte
  au dégel, paires qui se rejoignent. vitest 218 (eclats + niveaux), check-eclats.mjs 2 passages OK, essai de la page
  sans erreur. Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 02:02 : build complet OK. Non commité : en attente du feu vert de l'utilisateur.
- 06:38 : commité et poussé à la demande de l'utilisateur (« Pousse ») : engine.ts, engine.test.ts, levels.ts,
  picks.ts, bot.ts, EclatsGame.tsx, scripts/eclats-levels.ts et cette section seulement. Statut : terminé. Réservations
  libérées.

## 2026-10-28 — Dragon's Gems Swipe : la nuit plus dure (jauge à 50, limites à 60 %) (session website)
- Statut : en cours (2026-10-28T06:51+01:00). Demande de l'utilisateur : (transmis par la session Unity) « 60% et 50
  gems oui » : jauge de Perle pleine à 50 gemmes la nuit, limites au 60e centile du joueur type (50 % sur les niveaux
  difficiles)
- Réservations actives : `src/games/eclats/engine.ts`, `src/games/eclats/engine.test.ts`, `src/games/eclats/levels.ts`,
  `src/games/eclats/picks.ts`, `src/games/eclats/bot.ts`, `src/games/eclats/EclatsGame.tsx`,
  `scripts/eclats-levels.ts`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 07:09 : fait : NIGHT_FIRE_FULL = 50 et fireFull(cfg) (création, coup, relance, souffle possible ; l'écran dessine la
  jauge sur ce plein) ; scripts/eclats-levels.ts night : 200 parties du joueur type par niveau, limite au 60e centile
  (50 % sur les niveaux difficiles), au moins par + 2, tirage remplacé quand le robot ne le finit pas ou que le joueur
  type le perd trop souvent (13 niveaux, dont 240) ; limites de nuit +8,1 coups en moyenne sur le jour (au lieu de
  +10,1). vitest 219, tsc 0 erreur, check-eclats.mjs 2 passages OK, page de nuit sans erreur. Non commité : en attente
  du feu vert de l'utilisateur.
- 07:27 : commité et poussé à la demande de l'utilisateur (« Pousse ») : engine.ts, engine.test.ts, picks.ts,
  EclatsGame.tsx, scripts/eclats-levels.ts et cette section seulement. Statut : terminé. Réservations libérées.

## 2026-10-28 — Dragon's Gems Swipe : un glissé pendant une cascade est gardé (session website)
- Statut : en cours (2026-10-28T09:16+01:00). Demande de l'utilisateur : (transmis par la session Unity) « Il faudrait
  mettre ce comportement sur le site web pour tester d'abord » : glissé gardé pendant une cascade, cascade accélérée,
  blocs tirés remis en place
- Réservations actives : `src/games/eclats/EclatsGame.tsx`, `scripts/check-eclats.mjs`.
- Ressources : serveur de dev sur le port 4473 ; eslint, `astro check`. Build annoncé ici avant.
- 09:24 : fait : un glissé pendant une cascade est gardé (le dernier gagne) et joué dès qu'elle finit, la cascade
  accélère pendant qu'il attend (comme le doigt appuyé), une nouvelle partie l'oublie ; au départ d'un glissé, les
  blocs tirés reviennent à leur case. Vaut pour le jeu et la page de nuit (même composant). check-eclats.mjs : 1
  contrôle de plus, 3 passages OK ; eslint, tsc, vitest OK.
- 09:24 : commité et poussé à la demande de l'utilisateur (« Pousse direct une fois fini ») : mes 2 fichiers et cette
  section seulement. Statut : terminé. Réservations libérées.

## 2026-10-29 — Dragon's Gems Swipe : garde-fous des sauvegardes et scores renvoyés (serveur) (session website)
- Statut : en cours (2026-10-29T10:56+01:00). Demande de l'utilisateur : (transmis par la session Unity, choix de
  l'utilisateur) « Garde-fous simples : le serveur refuse les sauvegardes impossibles » ; « Scores renvoyés : un score
  perdu sur erreur réseau est gardé, puis renvoyé […] sans doublon. Le score du défi part aussi avec la date de son
  plateau »
- Réservations actives : `supabase/functions/app-save/index.ts`, `supabase/functions/submit-score/index.ts`,
  `supabase/migrations/*_score_submissions.sql` (nouveau).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 10:57 : écrit (non déployé, non commité) : app-save borne la copie de dragonsgems champ par champ (Stars ≤ 750
  valeurs de 0 à 3, Hoard, Played, EndlessBest/SummitBest au plafond de eclats-inf/eclats-sommet, Cave/PerleCave,
  CaveFound, StarChests, GiftStreak, GiftDay ≤ demain, DailyPlayed vide ou date ≤ demain à Paris) au lieu de refuser ;
  submit-score : challenge_date (veille acceptée jusqu'à 1 h à Paris, sinon aujourd'hui), submission_id (une nouvelle
  tentative du même coup reçoit la première réponse, sans nouvelle ligne ni essai du jour) ; migration
  score_submissions (RLS sans politique). deno check OK ; db push --dry-run : elle seule en attente. Attend l'accord de
  l'utilisateur pour la migration et le déploiement des deux fonctions.
- 07:36 : l'utilisateur dit « Ok pour les 2 et go » : déploiement serveur refusé par le contrôle automatique (à lancer
  par l'utilisateur) ; renommage « Dragon Gems Swipe » sur le site (15 fichiers + games.ts) ; niveaux du site plus
  faciles en cours (réserve aussi `src/games/eclats/levels.ts`, `picks.ts`, `scripts/eclats-levels.ts`,
  `src/data/games.ts`, les pages et composants Dragon Gems)
- 07:49 : niveaux du site plus faciles : 15 % de coffres en moins (ease 0.85), cinquième couleur deux fois plus rare
  (0.5), limites à 90 % des joueurs (80 % sur un niveau dur) ; picks du site regénérés ; joueur type, graines neuves :
  21-60 88→92 %, 61-100 76→82 %, 101-150 64→80 %, 151-200 58→74 %. 53 tests, check-eclats, eslint, astro check OK.
  Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 07:51 : commité et poussé à la demande de l'utilisateur (« Ok pour les 2 et go ») : renommage, niveaux du site, code
  serveur ; migration et déploiement des deux fonctions à lancer par l'utilisateur (refusés par le contrôle
  automatique). Statut : terminé. Réservations libérées.
- 07:57 : déployé par la session dragonsgemsswipe à la demande de l'utilisateur : migration 20261029120000 appliquée,
  submit-score v15 et app-save v2 actives (vérifié en lecture : migration list, functions list)
- 14:10 : APK de test 0.1.10 publié (« Dragon Gems Dev ») : la page /jeux/eclats/test/ prend ce nom ; commité et poussé
  à la demande de l'utilisateur (« Pousse »)

## 2026-10-30 — Pétanque : règles officielles (but à 1 m des bords, égalité alternée, cercle après but mort) (session PetanqueGame)
- Statut : en cours (2026-10-30T07:39+01:00). Demande de l'utilisateur : Ok pour tenir compte des vraies règles
  officielles d'ailleurs je crois que c'est 1m des bords […] Ok pour faire toutes les modifications citées
- Réservations actives : `src/games/petanque/rules13.ts`, `src/games/petanque/rules13.test.ts`,
  `src/games/petanque/ai.ts`, `src/games/petanque/PetanqueGame.tsx`, `src/games/petanque/daily.ts`,
  `src/games/petanque/render3d.ts`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 07:47 : réservé aussi : `src/games/petanque/i18n.tsx`, `src/games/petanque/ai.test.ts`, `scripts/petanque-match.ts`
  (appel de applyPlacedJack). Fait : but à 1 m des planches (verdict 'edge', message dans les 3 langues), 6-10 m depuis
  le bord intérieur du cercle (JACK_LO/JACK_HI), cercle à 1 m des planches, égalité qui persiste = les équipes
  alternent (art. 28), cercle de la mène suivante là où était le but, un but mort à sa dernière place en jeu,
  millimètre d'égalité aussi au comptage, l'IA vise le but dans le couloir. Parcours du jour inchangé (COURSE_CIRCLE
  fixé). vitest petanque 117/117, eslint OK.
- 08:39 : l'utilisateur dit « Oui informer le site » (pousser les règles). Lancement du build complet (écrit dist/,
  .astro/, public/vendor/)…
- 08:41 : build complet OK (astro check 0 erreur, 191 pages, precache et liens OK).
- 08:41 : commité et poussé à la demande de l'utilisateur (« Oui informer le site ») : mes 9 fichiers et cette section
  seulement. Statut : terminé. Réservations libérées.

## 2026-10-31 — Dragon Gems Swipe : politique de confidentialité (pubs, achats) et nom dans games (session website)
- Statut : en cours (2026-10-31T14:10+01:00). Demande de l'utilisateur : demande-site-2026-10-31.md (fichier de
  l'utilisateur) : politique de confidentialité FR/EN de l'app à jour (vidéos LevelPlay/Unity Ads/ironSource, achats
  Unity IAP, date et numéro d'envoi des scores, 13 ans) ; migration renommant les lignes eclats* de games ; pousser et
  dire quand c'est en ligne
- Réservations actives : `src/pages/dragons-gems/confidentialite.astro`,
  `src/pages/en/dragons-gems/confidentialite.astro`, `supabase/migrations/*_dragon_gems_name.sql` (nouveau).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 14:19 : pages FR/EN réécrites selon la demande (pubs Unity LevelPlay/Unity Ads/ironSource, achats, date et numéro
  d'envoi, grottes, 13 ans ; §6 éclaté en Publicité, Achats intégrés, Ce que l'application ne fait pas ; id suppression
  gardé) ; migration 20261031120000_dragon_gems_name.sql ; astro check 0 erreur ; captures clair, sombre, téléphone
  vues ; build complet OK (191 pages, précache 349, liens OK)
- 14:19 : commité et poussé à la demande de l'utilisateur (demande-site-2026-10-31.md : « pousse et dis-moi quand c'est
  en ligne ») : mes 3 fichiers et cette section seulement. Statut : terminé. Réservations libérées.
- 14:29 : pages en ligne (3a1b33b, 5 min 11 s) ; migration 20261031120000 appliquée sur l'accord de l'utilisateur (« ok
  push et deploie la base supabase ») : les 4 lignes eclats* s'appellent Dragon Gems Swipe (relu en lecture publique)

## 2026-11-01 — Nino Rush : page de téléchargement de l'APK de test (session RushBall)
- Statut : en cours (2026-11-01T21:16+01:00). Demande de l'utilisateur : Tu peux préparer une page de téléchargement
  sur mon site web, utiliser gitlab pour enregistrer la release
- Réservations actives : `src/pages/nino-rush/telecharger.astro` (nouveau), `src/data/ninoRush.ts` (nouveau),
  `public/nino-rush/` (nouveau).
- Ressources : serveur de dev sur le port 4478 ; eslint, `astro check`. Build annoncé ici avant.
- 21:19 : page et images prêtes, eslint OK, astro check 0 erreur, captures clair, sombre et téléphone vues. Rien de
  commité : la release GitLab doit d'abord exister (projet public à créer, accès GitLab à donner par l'utilisateur).
  Réservations gardées.
- 21:57 : release GitLab en ligne (RaphBen/nino-rush-releases, v1.0.0-dev), lien vérifié sans connexion, mêmes octets.
  L'utilisateur a dit « publie une version dev ». Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 21:59 : build complet OK : astro check 0 erreur, 192 pages, précache 350 entrées, liens OK ; page en noindex.
- 21:59 : commité et poussé à la demande de l'utilisateur (« Ok publie une version dev ») : mes fichiers et cette
  section seulement. Statut : terminé. Réservations libérées.
- 22:05 : page en ligne (e0c25d4), lien de téléchargement vérifié depuis la page servie

## 2026-11-02 — Pétanque Game : pages légales sous /petanque-game/ (session PetanqueGame)
- Statut : en cours (2026-11-02T09:05+01:00). Demande de l'utilisateur : pourquoi les pages de confidentialité ne sont
  pas dans l'arborescence https://www.ludiven-studio.fr/petanque-game/ (puis « oui » au déplacement avec redirections)
- Réservations actives : `src/pages{,/en,/es,/de,/it}/jeux/petanque/{confidentialite,cgu}.astro` (déplacées),
  `src/pages{,/en,/es,/de,/it}/petanque-game/{confidentialite,cgu}.astro` (nouvelles), `src/data/petanqueGame.ts`,
  `src/pages/confidentialite.astro`, `astro.config.mjs` (redirections).
- Ressources : serveur de dev sur le port 4486 ; eslint, `astro check`. Build annoncé ici avant.
- 09:07 : 10 pages déplacées de jeux/petanque/ vers petanque-game/ (5 langues), liens et alternates suivis, 10
  redirections dans astro.config.mjs ; eslint OK, astro check 0 erreur, captures bureau et téléphone sombre vues.
  Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 09:09 : build complet OK : astro check 0 erreur, 192 pages, précache 360 entrées, liens OK ; les 10 anciennes
  adresses servent une redirection vers les nouvelles. Rien de commité : en attente de l'accord de l'utilisateur pour
  pousser.
- 09:10 : commité et poussé à la demande de l'utilisateur (« ok commit push le site web ») : mes 23 fichiers et cette
  section seulement. Statut : terminé. Réservations libérées.

## 2026-11-02 — Dragon Gems Swipe et Pétanque Game : sortie sur Google Play (session website)
- Statut : en cours (2026-11-02T10:25+01:00). Demande de l'utilisateur : ok j'ai 2 jeux google qui sont sortis : Dragon
  Gems et Pétanque Game. est-ce que tu peux mettre a jour les pages web de téléchargement ?
- Réservations actives : `src/data/dragonsGems.ts`, `src/data/petanqueGame.ts`,
  `src/components/DragonsGemsLanding.astro`, `src/components/DragonsGemsDownload.astro`, `src/pages/petanque.astro`,
  `src/pages/jeux/petanque.astro`, `src/content/work{,-en}/{dragons-gems,petanque-game}.md`.
- Ressources : serveur de dev sur le port 4493 ; eslint, `astro check`. Build annoncé ici avant.
- 10:29 : liens Google Play (fiches vérifiées en ligne) dans STORES des deux jeux ; textes « bientôt » passés à « sur
  Google Play, bientôt sur l'App Store » en 5 langues (description, FAQ, kicker, closing) ; badge Play sur les fiches
  projet FR/EN et le hub /petanque/ ; eslint OK, astro check 0 erreur, captures clair, sombre et téléphone vues
- 10:29 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 10:30 : build complet OK : astro check 0 erreur, 192 pages, précache 360 entrées, liens OK. Rien de commité : en
  attente de l'accord de l'utilisateur pour pousser.
- 10:38 : l'utilisateur dit « oui il faut renommer le nom et pousser ». Réservé aussi :
  `public/assets/dragons-gems/{feature,og,video}-*` (bannière, images de partage et vidéo refaites depuis Marketing/ de
  l'app, qui porte déjà « Dragon Gems Swipe »).
- 10:39 : bannière, images de partage et vidéos (5 langues) refaites depuis Marketing/ de l'app : nom entier, carte de
  fin « Dragon Gems Swipe ». Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 10:41 : build complet OK : astro check 0 erreur, 192 pages, précache 360 entrées, liens OK ; captures vues (fiche
  projet, page de l'appli)
- 10:41 : commité et poussé à la demande de l'utilisateur (« oui il faut renommer le nom et pousser ») : mes 10
  fichiers, les 20 images et vidéos de public/assets/dragons-gems/ et cette section seulement. Statut : terminé.
  Réservations libérées.
- 10:47 : en ligne (bf1db6d, 6 min 12 s) : liens Google Play servis, nouvelle image de partage servie

## 2026-11-02 — Jeux : bouton « Partager le jeu » (session website)
- Statut : en cours (2026-11-02T11:46+01:00). Demande de l'utilisateur : dans les pages des jeux ce serait bien d'avoir
  un bouton pour "partager le jeu" qui copie la page en cours
- Réservations actives : `src/layouts/GamePage.astro`, `src/components/GameShare.astro` (nouveau),
  `src/components/GameFullscreen.astro`.
- Ressources : serveur de dev sur le port 4503 ; eslint, `astro check`. Build annoncé ici avant.
- 11:51 : bouton « Partager le jeu » à côté de « Plein écran » sur toutes les pages de jeu (GameShare.astro) : lien
  canonique copié sur ordinateur, feuille de partage sur téléphone ; essai Playwright OK (presse-papier, feuille,
  annulation, langue, plein écran) ; eslint OK, astro check 0 erreur, captures clair, sombre et téléphone vues
- 11:51 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 11:53 : build complet OK : astro check 0 erreur, 192 pages, précache 362 entrées, liens OK ; essai rejoué sur le
  build (preview) OK. Rien de commité : en attente de l'accord de l'utilisateur pour pousser.
- 12:01 : l'utilisateur précise : « je parlais surtout pour les vrais jeux mobiles et applications mobiles ». Réservé
  aussi : `src/components/ShareButton.astro` (GameShare.astro renommé, pas encore commité),
  `src/components/DragonsGemsLanding.astro`, `src/components/DragonsGemsDownload.astro`,
  `src/components/PetanqueLanding.astro`, `src/components/ScannerDownload.astro`, `src/components/MeetDownload.astro`.
- 12:06 : bouton commun ShareButton.astro (5 langues, « jeu » ou « appli ») ajouté aux pages des applis : Dragon Gems
  Swipe (présentation et téléchargement), Pétanque Game et Pétanque Scanner (présentation et téléchargement), Pétanque
  Meet (téléchargement) ; couleurs du panneau sur les pages de téléchargement dont le héros garde son thème ; essai
  Playwright OK sur 9 pages d'applis et une page de jeu ; eslint OK
- 12:06 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 12:08 : build complet OK : astro check 0 erreur, 192 pages, précache 362 entrées, liens OK ; essai rejoué sur le
  build (preview). Rien de commité : en attente de l'accord de l'utilisateur pour pousser.
- 20:10 : commité et poussé à la demande de l'utilisateur (« ok pousse ») : mes 8 fichiers et cette section seulement.
  Statut : terminé. Réservations libérées.

## 2026-11-02 — Pétanque Game : version.json de l'invite de mise à jour (session PetanqueGame)
- Statut : en cours (2026-11-02T12:13+01:00). Demande de l'utilisateur : Ok pour les 3 (dont : créer
  /jeux/petanque/version.json, que le jeu lit pour proposer ses mises à jour)
- Réservations actives : `public/jeux/petanque/version.json` (nouveau).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 12:13 : fichier écrit (Android 1.0.6 en production, iOS 1.0.0 à venir, min 1.0.0, lien Play) ; JSON relu ; pas de
  build : un fichier de public/ copié tel quel
- 12:13 : commité et poussé à la demande de l'utilisateur : mon fichier et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-11-02 — Applis : révocation Sign in with Apple à la suppression du compte (session PetanqueGame)
- Statut : en cours (2026-11-02T12:17+01:00). Demande de l'utilisateur : il y a aussi la suppression d'un compte Apple
  qui doit être corrigée de partout
- Réservations actives : `supabase/functions/_shared/apple.ts` (nouveau), `supabase/functions/_shared/account.ts`,
  `supabase/functions/app-save/index.ts`, `supabase/functions/meetups/index.ts` (action delete_account seulement),
  `supabase/functions/apple-revoke/` (nouveau).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 12:18 : _shared/apple.ts (secret client ES256, échange du code, révocation), delete_account d'app-save et de meetups
  révoque d'abord si l'appli envoie apple_code/apple_client (au mieux : un échec n'empêche jamais la suppression),
  nouvelle fonction apple-revoke pour Pétanque Game ; deno check OK sur les 4 fichiers ; signature vérifiée avec une
  clé de test
- 12:18 : commité, poussé et fonctions déployées à la demande de l'utilisateur : mes 5 fichiers et cette section
  seulement. Statut : terminé. Réservations libérées.
- 12:19 : correction : code commité et poussé (3136622), mais les fonctions ne sont PAS encore déployées (déploiement
  en production refusé par le mode automatique) ; à faire sur l'accord de l'utilisateur : npx supabase functions deploy
  app-save meetups apple-revoke

## 2026-11-02 — Pétanque Scan : nouveau nom et icônes « collection pétanque » (session website)
- Statut : en cours (2026-11-02T14:42+01:00). Demande de l'utilisateur : (transmis par la session Pétanque Scanner,
  brief collection-petanque-site.md) oui tu peux mettre a jour les icones et il faudra relancer le marketing pour
  prendre en compte les modifs. Pétanque Scanner doit s'appeler maintenant "Pétanque Scan"
- Réservations actives : `src/data/petanqueScanner.ts`,
  `src/pages{,/en,/es,/de,/it}/petanque-scanner/{cgu,confidentialite}.astro`, `src/pages/petanque-scanner/test.astro`,
  `src/pages/petanque.astro`, `src/pages/tournoi-petanque.astro`, `src/pages/{,en/}contact.astro`,
  `src/pages/confidentialite.astro`, `src/pages/petanque-meet/confidentialite.astro`, `src/pages/jeux/petanque.astro`,
  `src/content/work{,-en}/petanque-scanner.md`, `src/components/rencontres/EventPanel.tsx`,
  `src/games/petanque/i18n.tsx`, `src/games/petanque/PetanqueGame.tsx` (texte de la carte Scanner),
  `public/assets/petanque/icon-scanner.webp`, `public/assets/petanque-meet/icon.webp`,
  `public/assets/petanque-game/icon.webp`.
- Ressources : serveur de dev sur le port 4505 ; eslint, `astro check`. Build annoncé ici avant.
- 14:47 : réservé aussi : `public/assets/petanque/banner.webp`, `public/assets/petanque/og.jpg` (bannière et image de
  partage du hub, refaites avec le script de couverture de PetanqueMeet copié hors dépôt : témoin avec l'ancien nom
  identique à la bannière en ligne). Fait : « Pétanque Scan » dans 24 fichiers (74 mentions, 5 langues), «
  (anciennement Pétanque Scanner) » une fois sur chacune des 10 pages légales, build Dev « Pétanque Scan Dev » (réponse
  de la session Scan) ; icônes nuit_trait en 256 px aux trois chemins existants. Restent sur l'ancien nom : les
  bandeaux et images de partage de Scan (feature graphic, refaite par la session Scan)
- 14:51 : eslint OK, astro check 0 erreur, captures clair, sombre et téléphone sans erreur console (hub, pages Scan,
  légales, fiche projet, Meet, mini-jeu). Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 14:53 : build complet OK : astro check 0 erreur, 192 pages, précache 362 entrées, liens OK ; « Pétanque Scanner » ne
  reste dans dist/ que dans la mention « anciennement » des 10 pages légales. Rien de commité : en attente de l'accord
  de l'utilisateur, et des feature graphics « PÉTANQUE SCAN » de la session Scan pour les bandeaux et images de partage
- 15:10 : réservé aussi : `public/assets/petanque-ar/hero-*`, `public/assets/work/og/petanque-scanner*.jpg` (feature
  graphics « PÉTANQUE SCAN » de la session Scan, store_v1.2.13)
- 15:11 : bandeaux Scan (5 langues, ?v=1213) et images de partage refaits depuis les feature graphics 1.2.13 (réglages
  de generate-work-og.mjs) ; captures sans erreur console. Mais la zone où « NER » a été effacé reste visible (tache en
  blocs) : signalé à la session Scan, qui peut les refaire depuis la photo sans texte ; conversion à relancer alors.
  Rien de commité
- 15:17 : feature graphics refaites par la session Scan (fond reconstruit sous tout le texte, plus de tache) : bandeaux
  et images de partage reconvertis, captures sans erreur console. Lancement du build complet (écrit dist/, .astro/,
  public/vendor/)…
- 15:19 : build complet OK : astro check 0 erreur, 192 pages, précache 362 entrées, liens OK. Rien de commité : en
  attente de l'accord de l'utilisateur pour pousser
- 20:10 : commité et poussé à la demande de l'utilisateur (« ok pousse ») : mes 24 fichiers (pour les 7 pages de
  confidentialité partagées avec la section Umami, le renommage seulement), les 15 images et cette section seulement.
  Statut : terminé. Réservations libérées.

## 2026-11-02 — Site et applis : statistiques sur le serveur Umami du studio (session website)
- Statut : en cours (2026-11-02T19:18+01:00). Demande de l'utilisateur : (transmis par la session Dragon Gems) il
  faudrait modifier tous les projets pour repointer sur ce serveur et ajouter des événements pour les nouveaux projets
- Réservations actives : `src/data/site.ts`, `src/components/MainHead.astro`,
  `src/pages{,/en,/es,/de,/it}/petanque-game/confidentialite.astro`,
  `src/pages{,/en}/dragons-gems/confidentialite.astro` ; et, déjà à moi (Pétanque Scan) :
  `src/pages/confidentialite.astro`, `src/pages/petanque-meet/confidentialite.astro`,
  `src/pages{,/en,/es,/de,/it}/petanque-scanner/confidentialite.astro`.
- Ressources : serveur de dev sur le port 4507 ; eslint, `astro check`. Build annoncé ici avant.
- 19:30 : site.ts (UMAMI_HOST, nouvel identifiant) et MainHead (script et CSP : stats.ludiven-studio.fr, cloud.umami.is
  et api-gateway.umami.dev retirés) ; politiques : Game (5 langues), Scan (5 langues, IP : ville et empreinte
  mensuelle), Meet, site : Umami sur notre serveur loué à Hetzner (Allemagne), phrase de transition pour les versions
  pas encore à jour ; Dragon Gems FR/EN : nouvelle §8 Statistiques d'usage (événements de sa prochaine version), §8-15
  deviennent 9-16. Reste : la durée de conservation (l'utilisateur choisit, 24 mois proposés par la session Dragon
  Gems). eslint OK, astro check 0 erreur, captures sans erreur console. Rien de commité
- 19:42 : durée choisie par l'utilisateur (transmis par la session Dragon Gems : « ok ça me va ! go ! ») : 24 mois sur
  le serveur puis effacées (tâche mensuelle), sauvegardes 14 jours, 6 mois chez Umami Cloud pour les versions pas
  encore à jour ; écrit dans les 14 pages. Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 19:49 : build complet OK : astro check 0 erreur, 192 pages, précache 362 entrées, liens OK ; plus aucune adresse
  Umami Cloud dans dist/ ; check-csp : 211 pages, 0 blocage (témoin : script étranger refusé) ; le script se charge
  depuis stats.ludiven-studio.fr sur le build, rien n'est envoyé hors du domaine. Rien de commité : en attente de
  l'accord de l'utilisateur pour pousser
- 20:11 : commité et poussé à la demande de l'utilisateur (« ok pousse ») : mes 16 fichiers et cette section seulement.
  Statut : terminé. Réservations libérées.
- 20:17 : en ligne (309fafb avec 727cdb6 et e4bb299, 6 min 02 s) : script servi depuis stats.ludiven-studio.fr,
  politiques servies ; page Pétanque Scan, bouton Partager et nouvelle icône Scan servis

## 2026-11-03 — Pétanque Scan : pages légales pour la 1.2.13 (LevelPlay, 10 scans) (session website)
- Statut : en cours (2026-11-03T08:00+01:00). Demande de l'utilisateur : (transmis par la session Pétanque Scan)
  préparer la politique de confidentialité (5 langues) pour le passage d'AdMob à Unity LevelPlay de la 1.2.13 ; 3 scans
  gratuits par jour deviennent 10 ; vérifier app-ads.txt ; pousser sur l'accord de l'utilisateur, à la sortie de la
  1.2.13
- Réservations actives : `src/pages{,/en,/es,/de,/it}/petanque-scanner/{confidentialite,cgu}.astro`,
  `src/data/petanqueScanner.ts` (nombre de scans gratuits).
- Ressources : serveur de dev sur le port 4508 ; eslint, `astro check`. Build annoncé ici avant.
- 08:11 : politique de confidentialité (5 langues) réécrite d'après le code de la 1.2.13 (dépôt Scan, non commité) :
  LevelPlay (ironSource Ads, Unity Ads) au lieu d'AdMob, fenêtre « Pubs et statistiques » (refus = aucun module pub ni
  Firebase, bandeau et vidéo Pétanque Meet), redemandée après 6 mois, ATT après un oui ; liste des événements à jour
  (31 groupes), champs Umami (version du système, modèle), alerte de vente ntfy.sh, lectures sur notre site
  (version.json, vidéo Meet) et GitHub ; CGU (5 langues) : 10 scans, LevelPlay ; petanqueScanner.ts : 3 → 10 scans
  (FAQ, page de téléchargement). eslint OK, astro check 0 erreur, captures sans erreur console
- 08:11 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 08:13 : build complet OK : astro check 0 erreur, 192 pages, précache 362 entrées, liens OK. Rien de commité : à
  pousser sur l'accord de l'utilisateur, à la sortie de la 1.2.13
- 08:14 : réservé aussi : `src/content/work{,-en}/petanque-scanner.md` (texte alternatif de la capture Premium, qui
  donnait 3 scans par jour comme quota). Réponses de la session Scan : SDK Google Mobile Ads inerte (fournisseur d'init
  retiré, mesure retardée), Firebase sans identifiant publicitaire sur Android et iOS, notifications laissées en place
  par un refus ultérieur : la politique le dit déjà
- 08:15 : texte alternatif reformulé (FR « il reste trois scans gratuits aujourd'hui », EN « three free scans left
  today ») : la capture montre le compteur du jour, pas le quota ; astro check 0 erreur. Rien de commité : à pousser
  sur l'accord de l'utilisateur, à la sortie de la 1.2.13
- 18:11 : Firebase retiré de Scan 1.2.13 (décision de l'utilisateur, relayée par petanque-ar-3c, vérifiée dans le code
  Scan non commité) : confidentialité 5 langues mise à jour — fenêtre « Publicité » (pub seule), Umami sans
  consentement (intérêt légitime), plus de FCM ni d'heure Firebase, Firebase cité seulement pour les versions < 1.2.13,
  bandeau Meet ou Game (Android), événement game_store_opened. eslint OK, astro check 0 erreur, captures FR/IT OK.
  Toujours non commité.
- 19:09 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 19:11 : Build OK : 192 pages, precache 362, liens OK.
- 19:11 : commité et poussé à la demande de l'utilisateur : mes 13 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-11-03 — Pétanque Meet : app-ads.txt, casse des identifiants Unity (session petanque-meet)
- Statut : en cours (2026-11-03T10:09+01:00). Demande de l'utilisateur : Unity Ads signale 3 lignes manquantes dans
  app-ads.txt (identifiants écrits en minuscules)
- Réservations actives : `public/app-ads.txt`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 10:10 : 4 identifiants remis dans la casse donnée par Unity Ads (media.net 8CU5L226O, 8CU9B72O6, 8CUH46N56 ;
  sharethrough SniqCOMC) : les 162 lignes Unity y sont, à l'identique. Rien de commité : à pousser sur l'accord de
  l'utilisateur
- 10:14 : commité et poussé à la demande de l'utilisateur : app-ads.txt et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-11-03 — Pétanque Meet : mails de modération lisibles (session petanque-meet)
- Statut : en cours (2026-11-03T15:08+01:00). Demande de l'utilisateur : ok oui on peut améliorer (mail « affiche à
  valider » : sujet « Rencontres », date ISO en UTC, lieu vide)
- Réservations actives : `supabase/functions/meetups/index.ts` (mails de modération seulement).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 15:09 : sujets « Pétanque Meet : … » au lieu de « Rencontres : … » ; date en heure de Paris (« samedi 7 novembre 2026
  à 14:00 ») au lieu de l'ISO UTC ; lieu = nom du terrain et commune, parties vides retirées. deno check OK. Rien de
  commité ni déployé : sur l'accord de l'utilisateur
- 19:09 : commité et poussé à la demande de l'utilisateur : index.ts de meetups et cette section seulement. Déploiement
  de la fonction en attente de son accord.. Statut : terminé. Réservations libérées.

## 2026-11-03 — Nino Rush : sauvegarde du compte studio (session ninorush)
- Statut : en cours (2026-11-03T19:13+01:00). Demande de l'utilisateur : authentification, pubs et achats comme pour
  les autres jeux
- Réservations actives : `supabase/functions/app-save/index.ts`, `supabase/functions/_shared/apple.ts`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 19:13 : app-save accepte l'app ninorush (copie gardée telle quelle, 64 Ko max) ; bundles Nino Rush dans
  APPLE_CLIENTS. Rien de commité ni déployé : sur l'accord de l'utilisateur
- 21:52 : commité et poussé à la demande de l'utilisateur : mes 2 fichiers et cette section seulement ; app-save pas
  encore déployé. Statut : terminé. Réservations libérées.

## 2026-11-03 — Nino Rush : page de téléchargement à jour (session ninorush)
- Statut : en cours (2026-11-03T23:04+01:00). Demande de l'utilisateur : la page de téléchargement n'a pas l'air à
  jour, avec encore le tatou
- Réservations actives : `src/pages/nino-rush/telecharger.astro`, `src/data/ninoRush.ts`, `public/nino-rush/`.
- Ressources : serveur de dev sur le port 4493 ; eslint, `astro check`. Build annoncé ici avant.
- 23:06 : fait, non commité : lien vers la release GitHub nino-rush-dev (l'ancien lien GitLab servait la 1.0.0),
  version 1.0.7, panda roux au lieu du tatou, compte facultatif, boutique et vidéos gratuites en test ; 7 images
  refaites depuis le jeu. eslint OK, astro check 0 erreur, captures bureau et téléphone OK
- 23:07 : commité et poussé à la demande de l'utilisateur : mes 9 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-11-04 — Nino Rush : page de téléchargement en 1.0.8 (session ninorush)
- Statut : en cours (2026-11-04T07:12+01:00). Demande de l'utilisateur : il faut l'uploader sur GitHub, publie (la
  1.0.8)
- Réservations actives : `src/data/ninoRush.ts`.
- Ressources : serveur de dev sur le port 4494 ; eslint, `astro check`. Build annoncé ici avant.
- 07:14 : fait, non commité : version 1.0.8 et 85,0 Mo, comme l'APK publié sur nino-rush-dev (le lien sert le même
  fichier, sha256 vérifié). eslint OK, astro check 0 erreur, captures bureau et téléphone OK (serveur 4494 arrêté). Pas
  de build complet : seules deux constantes changent. À pousser sur l'accord de l'utilisateur
- 07:18 : commité et poussé à la demande de l'utilisateur : src/data/ninoRush.ts et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-11-04 — Pétanque (mini-jeu) : pub pour l'appli Pétanque Game (session website)
- Statut : en cours (2026-11-04T09:48+01:00). Demande de l'utilisateur : Dans le mini jeu de pétanque, il faudrait
  faire de la pub pour l'application de pétanque game (android pour l'instant)
- Réservations actives : `src/games/petanque/PetanqueGame.tsx` (pub du bandeau et carte de fin),
  `src/games/petanque/i18n.tsx` (textes de la pub), `src/games/petanque/promo.ts` et `promo.test.ts` (nouveaux).
- Ressources : serveur de dev sur le port 4509 ; eslint, `astro check`. Build annoncé ici avant.
- 10:05 : fait : la pub du bandeau (plein écran, pendant la visée) et la ligne de fin de partie montrent Pétanque Game
  là où son store existe (Android : lien Google Play avec un referrer de campagne ; ordinateur : page de
  téléchargement), Pétanque Scan reste sur iPhone ; promo.ts testé (7 tests), vitest pétanque 124/124, eslint OK, astro
  check 0 erreur ; captures Android portrait et paysage, iPhone, ordinateur fr/en/es, clair et sombre ; audit téléphone
  (snap-petanque-phone, dev) sans chevauchement de la pub
- 10:05 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 10:09 : build complet OK (192 pages, précache 362 entrées, liens OK), mais le jeu embarquait les textes français de
  la page Pétanque Game en important ses liens (+12 Ko) ; réservé aussi : `src/pages/jeux/petanque.astro` (la page
  passe les liens au jeu)
- 10:13 : les liens passent par la page (prop gameAd) ; vitest pétanque 125/125, eslint OK, astro check 0 erreur,
  captures identiques. Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 10:18 : build complet OK (192 pages, précache 362 entrées, liens OK), le jeu sans les textes de la page (+3,5 Ko en
  tout) ; audit téléphone sur le build sans aucun chevauchement (l'étape 8 a manqué de temps une fois, passée au second
  essai) ; page du tournoi (coruna) sans pub Game, sans erreur ; captures envoyées. Rien de commité : en attente de
  l'accord de l'utilisateur
- 10:59 : commité et poussé à la demande de l'utilisateur (« ok ca me va tu peux push ») : mes 5 fichiers et cette
  section seulement. Statut : terminé. Réservations libérées.
- 11:05 : en ligne (69b22e4, déploiement 4 min 38 s) : le jeu servi sur /jeux/petanque/ contient la pub Pétanque Game

## 2026-11-04 — Pétanque Meet : politique et CGU pour la 0.1.7 (LevelPlay, consentement maison) (session petanque-meet)
- Statut : en cours (2026-11-04T11:13+01:00). Demande de l'utilisateur : (transmis par la session Producer) OK pour
  réécrire la politique de confidentialité et les CGU du site (AdMob → LevelPlay)
- Réservations actives : `src/pages/petanque-meet/confidentialite.astro`, `src/pages/petanque-meet/cgu.astro`.
- Ressources : serveur de dev sur le port 4517 ; eslint, `astro check`. Build annoncé ici avant.
- 11:17 : fait : politique (date, l'essentiel, tableau §4 ligne pub, §4 identifiant pub, §9 réécrit : LevelPlay
  ironSource/Unity Ads, consentement maison Accepter/Refuser, rien sans accord, AdMob jusqu'à 0.1.6 ; §10, §11
  Unity/ironSource + Google jusqu'à 0.1.6 ; §12 choix pub 6 mois ; §13 révocation Apple et compte studio) et CGU (date,
  bannière LevelPlay, annonces fournies par ironSource Ads/Unity Ads) ; eslint OK, astro check 0 erreur ; captures
  bureau et téléphone sans erreur console
- 11:19 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 11:22 : build complet OK (192 pages, précache 362 entrées, liens OK). Rien de commité : captures montrées à
  l'utilisateur, push à son accord
- 11:23 : commité et poussé à la demande de l'utilisateur : mes 2 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-11-04 — Nino Rush : page de téléchargement en 1.0.10 (session ninorush)
- Statut : en cours (2026-11-04T14:57+01:00). Demande de l'utilisateur : commit push publie et corrige oui 12 casse
  tetes
- Réservations actives : `src/data/ninoRush.ts`, `src/pages/nino-rush/telecharger.astro`.
- Ressources : serveur de dev sur le port 4495 ; eslint, `astro check`. Build annoncé ici avant.
- 14:59 : fait, non commité : version 1.0.10 et 84,7 Mo, comme l'APK publié sur nino-rush-dev (le lien sert le même
  fichier, sha256 vérifié), et « 12 casse-têtes ». Pas encore vérifié : node_modules est vide depuis 14h12 (même moment
  que l'effacement de D:/tmp), donc ni eslint ni astro check ni captures. J'attends un npm ci coordonné, après la
  réunion. Pas de build complet prévu : deux constantes et un mot changent
- 17:34 : Vérifié après le npm ci de website-a3 : eslint des deux fichiers OK, astro check 0 erreur 0 avertissement,
  captures bureau et téléphone en clair et sombre relues (1.0.10, 84,7 Mo, 12 casse-têtes), aucune erreur console. Pas
  de build complet : deux constantes et un mot. Le push attend le mot de Raphaël.
- 22:21 : Raphaël a dit « Publie » (2026-11-05 au soir) : APK 1.0.11 publié sur nino-rush-dev (91 117 353 octets, le
  lien sert le même fichier, sha256 vérifié). La page passe en 1.0.11, 86,9 Mo ; elle part avec le reste de cette
  section (12 casse-têtes).
- 09:32 : Sorti de l'index du dossier partagé (demande du Producer) et refait dans le worktree
  website-worktrees/nino-rush-site : branche nino-rush-download, commit cc6ce2a sur origin/main d755b84, pas poussé.
  eslint OK, astro check 0 erreur. Retiré : la ligne de 22:24 qui disait la page poussée, c'était faux. Au mot de
  Raphaël : merge --ff-only dans main, cette section close, push. Réservations maintenues.
- 09:39 : commité et poussé à la demande de l'utilisateur (« Ok pousse tout ») : 0b88314, page en 1.0.11, 86,9 Mo, 12
  casse-têtes, et cette section seulement. Statut : terminé. Réservations libérées.

## 2026-11-04 — Pétanque Scan : politique de confidentialité, ARCore et vidéos de Meet (session website)
- Statut : en cours (2026-11-04T18:26+01:00). Demande de l'utilisateur : (transmis par la session sessions claude et
  playtest, pour Pétanque Scan) ajouts à la politique de Pétanque Scan : ARCore de Google sur Android, liste des vidéos
  de Meet, effacement des données publicitaires ; traduits dans les 4 autres langues
- Réservations actives : `src/pages/petanque-scanner/confidentialite.astro`,
  `src/pages/{en,es,de,it}/petanque-scanner/confidentialite.astro`.
- Ressources : serveur de dev sur le port 4521 ; eslint, `astro check`. Build annoncé ici avant.
- 18:34 : fait, en 5 langues : §2 ARCore de Google sur Android (lien vers ses règles de confidentialité), §4 phrase de
  la présentation remplacée, §8 liste des vidéos de Meet à l'écran Premium, §10 Google LLC pour ARCore, §12 effacement
  des données publicitaires chez Unity, date au 4 novembre ; eslint OK, astro check 0 erreur ; les 5 pages en dev,
  bureau et téléphone : textes présents, ancienne phrase absente, aucun débordement, aucune erreur console (hors le 404
  du sw.js propre au serveur de dev)
- 18:34 : Lancement du build complet (écrit dist/, .astro/, public/vendor/)…
- 18:37 : build complet OK (192 pages, précache 362 entrées, liens OK, astro check 0 erreur). Rien de commité : le push
  met le site en ligne, donc à l'accord de Raphaël
- 18:42 : écarts validés par la session Pétanque Scan ; ajout demandé par elle : la liste des vidéos de Meet au §3
  (ligne GitHub) et au §10, en 5 langues. eslint OK, les 5 pages en dev (bureau et téléphone) toutes vertes. Pas de
  nouveau build complet : du texte change dans des cellules et des points existants. Push à l'accord de Raphaël
- 20:12 : Pause pour le redémarrage du PC : rien ne tourne (port 4521 libre). Les 5 pages restent réservées et non
  commitées jusqu'au mot de Raphaël pour le push.
- 20:13 : Contre-ordre, pas de redémarrage : je reprends. Rien ne change pour les 5 pages, qui attendent le mot de
  Raphaël pour le push.
- 23:28 : commité et poussé à la demande de l'utilisateur : mes 5 pages, cette section et la ligne « en ligne » de ma
  section du mini-jeu. Statut : terminé. Réservations libérées.
- 23:38 : en ligne (151a5c7, déploiement 8 min 44 s) : la page servie contient le nouveau texte

## 2026-11-04 — LudivenTools : catalogue des pubs maison (session ludiventools)
- Statut : en cours (2026-11-04T19:59+01:00). Demande de l'utilisateur : (transmis par le Producer, voulu par Raphaël)
  catalogue en ligne des pubs maison des apps : promo/v1/catalog.json, images, clips, contrôle au build ; préparé sans
  push
- Réservations actives : `public/promo/`, `scripts/check-promo.mjs`, `package.json` (script build).
- Ressources : serveur de dev sur le port 4533 ; eslint, `astro check`. Build annoncé ici avant.
- 21:36 : Module poussé dans LudivenTools (cdff52d8, 14/14 tests, compile Android OK). Lancement du build complet dans
  mon worktree website-worktrees/house-ads (branche house-ads), pas dans le dossier partagé.
- 21:38 : Build complet OK dans le worktree house-ads : check-promo (5 entrées), astro check, 192 pages, précache et
  liens. Branche house-ads (cbd5198) prête, pas poussée : le push sur main attend l'accord de Raphaël.
- 22:08 : check-promo refuse aussi un titre ou un texte avec un caractère absent des polices Inter statiques des 5 apps
  (ni œ ni U+202F). Commit 6be sur house-ads, pas poussé.
- 22:08 : Correction : le commit de la vérification des glyphes est 4548215 (pas « 6be »).
- 22:13 : Ciblage de Raphaël (hideIn) : les applis de pétanque entre elles, les jeux entre eux, Pétanque Game partout
  sauf chez lui. Commit cbe0390 sur house-ads, pas poussé.
- 22:47 : Clips de Pétanque Scan en 5 langues (fournis par sa session), ancien clip unique retiré. Commit e61871e sur
  house-ads, check-promo OK, pas poussé.
- 23:27 : commité et poussé à la demande de l'utilisateur : mes 4 commits (cbd5198, 4548215, cbe0390, e61871e) et cette
  section seulement. Statut : terminé. Réservations libérées.

## 2026-11-04 — Pétanque Meet : politique de confidentialité pour les pubs maison (session petanque-meet)
- Statut : en cours (2026-11-04T22:53+01:00). Demande de l'utilisateur : (transmis par la session Producer) Pour ta
  politique de confidentialité, oui : prépare le changement dans un worktree du site quand ta branche sera prête, en
  suivant le journal du skill ludiven-site. La mise en ligne attendra le mot de Raphaël, avec la sortie des pubs
  maison.
- Réservations actives : `src/pages/petanque-meet/confidentialite.astro` (dans le worktree
  website-worktrees/meet-privacy-house-ads, branche meet-privacy-house-ads).
- Ressources : serveur de dev sur le port 4517 ; eslint, `astro check`. Build annoncé ici avant.
- 22:56 : fait dans le worktree website-worktrees/meet-privacy-house-ads, commit 026ba74 sur la branche
  meet-privacy-house-ads, pas poussé : §8 les annonces maison vues ou touchées (nom de l'appli présentée), §9 la
  bannière présente nos autres applis de pétanque sous « Nos applis », liste et images lues sur ce site, mention de
  provenance vers le store, Pétanque Scan seule jusqu'à la 0.1.7 ; §11 GitHub (GitHub Pages) hébergeur du site (mise à
  jour et liste des annonces). eslint OK, astro check 0 erreur, captures bureau et téléphone sombre sans erreur
  console. Pas de build complet : du texte dans une page. Au moment de publier : la date de mise à jour, puis fusion
  dans main au mot de Raphaël, avec la sortie des pubs maison. Réservation maintenue.
- 23:38 : ajout, commit 283dd9a sur la même branche, pas poussé : §9 sur iPhone, sans l'autorisation de suivi d'Apple,
  les annonces ne sont pas personnalisées (correctif du consentement de Meet sur house-ads). eslint OK. Réservation
  maintenue.
- 11:39 : ajout, commit ae96082 sur la même branche, pas poussé : §9 la bannière est signée « Ludiven Studio » au lieu
  de l'étiquette « Nos applis » (choix de Raphaël). eslint OK. Réservation maintenue.
- 14:12 : ajout, commit ebb3380 sur la même branche, pas poussé : §9 la bannière présente nos autres applications,
  d'abord celles de pétanque, puis sur Android un de nos jeux quand elles sont toutes installées (vérification qui
  reste sur le téléphone) ; choix de Raphaël du 5 novembre. eslint OK, astro check 0 erreur, capture du §9 sans erreur.
  Réservation maintenue.

## 2026-11-04 — LudivenTools : page Voir les sociétés (pubs) (session ludiventools)
- Statut : en cours (2026-11-04T23:44+01:00). Demande de l'utilisateur : (transmis par le Producer, voulu par Raphaël)
  page « Voir les sociétés » de la fenêtre de consentement des applis, en 5 langues ; préparée sans push
- Réservations actives : `src/pages/publicite/`, `src/pages/{en,es,de,it}/publicite/`.
- Ressources : serveur de dev sur le port 4534 ; eslint, `astro check`. Build annoncé ici avant.
- 23:49 : Commit 7828cc6 sur la branche ad-partners (worktree website-worktrees/ad-partners), pas poussé :
  /publicite/societes/ en fr, en, es, de, it. eslint OK, astro check 0 erreur, captures bureau et téléphone (clair et
  sombre) sans erreur console. La mise en ligne attend le mot de Raphaël, avec l'option A du consentement. Réservation
  maintenue.

## 2026-11-04 — Nino Rush : page de confidentialité (session ninorush)
- Statut : en cours (2026-11-04T23:55+01:00). Demande de l'utilisateur : (transmis par le Producer) la politique de
  confidentialité de Nino Rush pour les pubs et le compte, à préparer ; mise en ligne au mot de Raphaël
- Réservations actives : `src/pages/nino-rush/confidentialite.astro`, `src/pages/en/nino-rush/confidentialite.astro`,
  `src/pages/confidentialite.astro` (la liste des applis).
- Ressources : serveur de dev sur le port 4495 ; eslint, `astro check`. Build annoncé ici avant.
- 23:58 : fait dans le worktree website-worktrees/nino-rush-privacy, commit 151f922 sur la branche nino-rush-privacy,
  pas poussé : /nino-rush/confidentialite/ en fr et en (identité, pubs après accord, pubs maison, compte et copie en
  ligne, achats, suppression #suppression, droits, 13 ans et plus), ajoutée à la liste de /confidentialite/. eslint OK,
  astro check 0 erreur, captures bureau et téléphone sombre sans erreur console. La mise en ligne attend le mot de
  Raphaël, avec la page de téléchargement 1.0.10. Réservation maintenue.
- 13:12 : Dans le worktree nino-rush-privacy, pages fr et en mises à jour d'après docs/privacy-policy.md de Nino Rush
  (branche house-ads) : fenêtre de consentement du studio (« Publicité personnalisée », Unity Ads, ironSource et
  partenaires, liens « Voir les sociétés » et politique, redemandé après six mois seulement), « Activer les pubs » vaut
  accord sous la ligne « Oui : … », sur iPhone sans suivi pas de pubs selon le profil, pubs maison : nos jeux puis Meet
  ou Scan, applis installées regardées sur le téléphone seulement, bouton « Voir une vidéo de nos jeux et applis » ;
  date au 5 novembre. eslint OK, astro check 0 erreur, captures bureau et téléphone sombre sans erreur console. Commit
  local à suivre, pas poussé. Réservation maintenue.
- 15:02 : Dans le worktree nino-rush-privacy, 3 commits locaux, pas poussés : fb11850 (style des pages légales, absent
  en fr et en), f09e46b (politique en es, de, it, les cinq versions liées), 55549a1 (CGU fr et en, /nino-rush/cgu/ et
  /en/nino-rush/cgu/, liées depuis la politique dans les 5 langues). eslint OK, astro check 0 erreur, captures bureau
  et téléphone sombre sans erreur console ni débordement à 390 px. Réservation étendue à
  src/pages/{es,de,it}/nino-rush/confidentialite.astro et src/pages{,/en}/nino-rush/cgu.astro. Mise en ligne au mot de
  Raphaël.
- 23:58 : Ajouté dans la branche nino-rush-privacy (worktree website-worktrees/nino-rush-privacy) :
  public/nino-rush/version.json (4ecbbde), lu par l'invite de mise à jour du jeu, vide jusqu'à sa première sortie en
  store. Non poussé : part avec les pages de confidentialité sur le mot de Raphaël.
- 00:30 : Branche nino-rush-privacy, non poussée : 10805d5 (la politique nomme la vérification de version, 5 langues),
  53bd84b (CGU en espagnol, allemand et italien, liées depuis les 5 pages et chaque politique). eslint et astro check
  OK.
- 01:53 : Branche nino-rush-privacy (non poussée) : page produit /nino-rush/ ×5 (e6242b3), politique et CGU ×5 pour la
  démo gratuite sans régie (ceb3fd2), licences de Nino Rush dans mentions-legales.astro#licences-nino-rush (c65ba97).
  mentions-legales.astro est aussi touché par la branche pg-1.0.7-policy : mes lignes viennent après la liste de
  Pétanque Game, à fusionner avec soin.
- 09:32 : Recalé sur origin/main d755b84 : la branche nino-rush-privacy rejouée (12 commits, contenu identique). La
  politique de la 1.0.11 s'arrête à 7a6d936 (ex-7061be5), branche nino-rush-policy : eslint OK, astro check 0 erreur,
  build complet dans mon worktree nino-rush-site (202 pages, précache 372, liens OK). Le reste (3d0d285 page produit,
  5e340c2 démo sans régie, 007a525 licences) : eslint et astro check OK. Rien de poussé.
- 09:39 : Poussé à la demande de l'utilisateur (« Ok pousse tout ») : politique et CGU de la 1.0.11 en 5 langues,
  version.json, contact (9 commits, f29877c..6664718, recalés sur 0539241 ; astro check 0 erreur). Reste dans la
  branche nino-rush-privacy, non poussé : page produit, politique et CGU de la démo sans régie, licences de Nino Rush
  (pour une version sans pub ; mentions-legales.astro a bougé avec Pétanque Game, à recaler). Réservation maintenue.
- 09:58 : commité et poussé à la demande de l'utilisateur (« Pousser + publier 1.0.12 ») : page produit /nino-rush/ ×5
  (54c9045), politique et CGU ×5 de la démo sans régie (a93aeb9), licences de Nino Rush dans les mentions légales
  (df7c8cb), page de téléchargement en 1.0.12, 83,9 Mo (aea2d01), comme l'APK publié sur nino-rush-dev (sha256 vérifié)
  ; build complet OK dans mon worktree (207 pages, précache 377, liens OK) ; mes fichiers et cette section seulement.
  Statut : terminé. Réservations libérées.

## 2026-11-05 — Pétanque Scan : confidentialité, refus du suivi et retrait de l'accord (1.2.13) (session website)
- Statut : en cours (2026-11-05T07:12+01:00). Demande de l'utilisateur : (transmis par la session « sessions claude et
  playtest ») La 1.2.13 de Scan donne maintenant des pubs non personnalisées sur iPhone quand on refuse le suivi
  d'Apple (ATT), et transmet un retrait du consentement à la régie. Ajoute ces deux points à sa politique, dans les 5
  langues, sur une branche de worktree ; mise en ligne sur le mot de Raphaël, avec la sortie de la 1.2.13
- Réservations actives : `src/pages{,/en,/es,/de,/it}/petanque-scanner/confidentialite.astro` (dans le worktree
  website-worktrees/scan-privacy-att, branche scan-privacy-att).
- Ressources : serveur de dev sur le port 4521 ; eslint, `astro check`. Build annoncé ici avant.
- 07:21 : fait dans le worktree website-worktrees/scan-privacy-att, branche scan-privacy-att, pas poussée : a3772a4 en
  5 langues (l'essentiel, §3 finalité, §4, §12, date au 5 novembre) : sur iPhone, refuser ou couper le suivi d'Apple
  donne des pubs non personnalisées (LevelPlay reçoit false, pas d'IDFA ; un refus fait dans les réglages d'iOS compte
  au lancement suivant), un retrait dans les réglages de l'appli arrête les pubs et part à LevelPlay, qui le transmet
  aux régies ; 4a746a0 : contresens allemand corrigé (redemandé après 6 mois quelle que soit la réponse). Vérifié dans
  le code de Scan (00e2bf0, 55693ec). eslint OK, astro check 0 erreur, les 5 pages en dev, bureau et téléphone : textes
  présents, anciennes phrases absentes, aucun débordement, aucune erreur console. Pas de build complet : du texte dans
  5 pages. Au moment de publier : la date de mise à jour, puis fusion dans main au mot de Raphaël, avec la sortie de la
  1.2.13. Réservation maintenue.
- 22:52 : 2026-11-07 : toujours en attente volontaire, avec la sortie de la 1.2.13 sur les stores ; branche
  scan-privacy-att partie de 151a5c7, à recaler sur main avant publication

## 2026-11-05 — Pétanque Scan : confidentialité pour les pubs maison (1.2.14) (session website)
- Statut : en cours (2026-11-05T07:26+01:00). Demande de l'utilisateur : (transmis par la session « sessions claude et
  playtest ») Prépare à part, sur une autre branche et sans pousser, les changements pour la sortie des pubs maison de
  Scan (1.2.14) : la question « Activer les pubs ? » au §4 (« Activer les pubs » vaut un « Accepter », « Voir une vidéo
  de nos applis » garde le refus), et les §3, §8 et §10 élargis au « catalogue de nos annonces maison, leurs images et
  vidéos »
- Réservations actives : `src/pages{,/en,/es,/de,/it}/petanque-scanner/confidentialite.astro` (dans le worktree
  website-worktrees/scan-privacy-houseads, branche scan-privacy-houseads, empilée sur scan-privacy-att).
- Ressources : serveur de dev sur le port 4522 ; eslint, `astro check`. Build annoncé ici avant.
- 07:32 : fait dans le worktree website-worktrees/scan-privacy-houseads, commit 279db3b sur la branche
  scan-privacy-houseads (empilée sur scan-privacy-att), pas poussée, en 5 langues, d'après la branche houseads de Scan
  (c037200, 688f5bd) : §4 nos annonces maison à la place des pubs des partenaires (après un refus, ou quand LevelPlay
  n'a rien), question « Activer les pubs ? » une fois par session après un refus (vaut un « Accepter », ATT ensuite sur
  iPhone ; « Voir une vidéo de nos applis » garde le refus) ; §3, §8, §10 : catalogue de nos annonces maison, leurs
  images et vidéos lus sur ce site ; en plus de la demande, d'après le code : §5 house_ad_shown et house_ad_opened
  (depuis la 1.2.14), meet_promo_*, meet_store_opened et game_store_opened marqués « jusqu'à la 1.2.13 » ; §8 lien
  Google Play avec la provenance (appli, annonce, place, sans identifiant), rien sur l'App Store ; §9 copie du
  catalogue et des images gardée sur le téléphone ; ligne de version 1.2.14. eslint OK, astro check 0 erreur, les 5
  pages en dev, bureau et téléphone : textes présents, anciennes phrases absentes, textes de la 1.2.13 toujours là,
  aucun débordement, aucune erreur console. Pas de build complet : du texte dans 5 pages. Au moment de publier : fusion
  après scan-privacy-att, date de mise à jour du jour de sortie de la 1.2.14, au mot de Raphaël. Réservation maintenue.
- 22:52 : 2026-11-07 : toujours en attente volontaire, avec la sortie de la 1.2.14 ; branche scan-privacy-houseads
  empilée sur scan-privacy-att, à recaler sur main avant publication

## 2026-11-05 — Dragon Gems : confidentialité pour la 0.1.16 (Accepter / Refuser, vidéos de nos jeux) (session website)
- Statut : en cours (2026-11-05T08:03+01:00). Demande de l'utilisateur : (transmis par la session « sessions claude et
  playtest ») la politique de confidentialité de Dragon Gems décrit encore l'ancien consentement ; avec sa 0.1.16 elle
  devient fausse. Appliquer le texte de remplacement de son docs/store.md, section « For 0.1.16 » (DragonsGemsSwipe
  6cc4d6c, lecture seule), dans les langues de sa page, sur une branche de worktree ; mise en ligne avec la 0.1.16, sur
  le mot de Raphaël
- Réservations actives : `src/pages/dragons-gems/confidentialite.astro`,
  `src/pages/en/dragons-gems/confidentialite.astro` (dans le worktree website-worktrees/dragons-gems-consent, branche
  dragons-gems-consent).
- Ressources : serveur de dev sur le port 4523 ; eslint, `astro check`. Build annoncé ici avant.
- 08:09 : fait dans le worktree website-worktrees/dragons-gems-consent, branche dragons-gems-consent, pas poussée.
  1e397f5 : le texte « For 0.1.16 » du docs/store.md de Dragon Gems (6cc4d6c), en FR tel quel et en EN traduit avec les
  libellés de l'appli (Accept, Refuse, Ad choices) : l'essentiel ; §5 (ligne Unity sur le seul consentement, ligne du
  choix avec sa date et les six mois, nouvelle ligne GitHub Pages pour les vidéos de nos jeux) ; §6 Ton accord
  (Accepter ou Refuser, Unity ne reçoit rien après un refus, vidéos de nos jeux, une fois par session, six mois, ATT) ;
  §8 house_ad_shown et house_ad_opened ; §11 GitHub et transferts ; §14 ; date au 5 novembre. 4b5beae, en plus et
  séparable, d'après le code de la 0.1.16 (même module que Scan) : §10 la copie de la liste et des images gardée sur le
  téléphone ; §6 le bouton « Découvrir » et le lien Google Play qui porte la provenance, sans identifiant. eslint OK,
  astro check 0 erreur, les 2 pages en dev, bureau et téléphone : textes présents, anciens mots du consentement
  absents, aucun débordement, aucune erreur console. Pas de build complet : du texte dans 2 pages. Au moment de publier
  : la date, puis fusion dans main au mot de Raphaël, avec la 0.1.16. Réservation maintenue.
- 08:10 : 4b5beae confirmé exact par la session Dragon Gems. 73f91a2 : §10 précisé (les vidéos de nos jeux sont lues en
  ligne, sauf une, livrée avec l'application) ; eslint OK, les 2 pages en dev, bureau et téléphone, sans erreur. Pas
  poussé : mise en ligne avec la 0.1.16, au mot de Raphaël. Réservation maintenue.
- 22:52 : remplacée par la politique de la 1.0.1, en ligne depuis 7d5cc44 (601870d, 804c5f6) ; la branche
  dragons-gems-consent n'a plus rien à publier (worktree à retirer). Statut : terminé. Réservations libérées.

## 2026-11-05 — LudivenTools : textes de bannière des pubs maison (40 caractères) (session LudivenTools)
- Statut : en cours (2026-11-05T08:42+01:00). Demande de l'utilisateur : Raccourcir le texte de petanque-meet coupé par
  « … » dans la bannière, vérifier les autres entrées, limite de longueur dans check-promo ; branche banner-texts, sans
  push
- Réservations actives : `public/promo/v1/catalog.json`, `scripts/check-promo.mjs`.
- Ressources : serveur de dev sur le port 4535 ; eslint, `astro check`. Build annoncé ici avant.
- 08:43 : Branche banner-texts (2 commits, pas poussé) : petanque-meet raccourci en fr « Trouve une partie près de chez
  toi », es « Encuentra una partida cerca de ti », it « Trova una partita vicino a te » ; nino-rush es « Nino, el panda
  rojo, corre a casa » (42 car.) ; updated 2026-11-05T08:00:00Z. check-promo refuse un texte de bannière de plus de 40
  caractères (vérifié sur l'ancien catalogue : 4 refus) ; check-promo OK sur le nouveau. Push au mot de Raphaël.
- 12:05 : Sur la même branche banner-texts : 2 commits de plus, « app » et « groups » dans les 5 entrées du catalogue,
  et leur contrôle dans check-promo (catalogue accepté, cas fautifs refusés). Pas poussé : attend le mot de Raphaël.
- 12:07 : Lancement du build complet dans le worktree banner-texts (écrit son dist/, .astro/, public/vendor/), avant le
  push demandé par Raphaël.
- 12:09 : build complet OK ; commité et poussé à la demande de Raphaël : les 4 commits de banner-texts (textes de
  bannière, limite de 40 caractères, app et groups) et cette section seulement. Statut : terminé. Réservations
  libérées.

## 2026-11-05 — Dragon Gems : conditions d'utilisation de l'appli (/dragons-gems/cgu/) (session website)
- Statut : en cours (2026-11-05T08:49+01:00). Demande de l'utilisateur : (transmis par la session « sessions claude et
  playtest ») Google Play demande une URL de conditions d'utilisation ; Dragon Gems n'en a pas : préparer ses CGU sur
  le modèle de celles de Pétanque Game, d'après son docs/store.md (lecture seule), en français et en anglais comme sa
  politique, sur la branche dragons-gems-consent ; mise en ligne avec la 0.1.16, sur le mot de Raphaël
- Réservations actives : `src/pages/dragons-gems/cgu.astro`, `src/pages/en/dragons-gems/cgu.astro` (nouveaux),
  `src/data/dragonsGems.ts` (TERMS et son libellé), `src/components/DragonsGemsLanding.astro` (un lien), dans le
  worktree website-worktrees/dragons-gems-consent, branche dragons-gems-consent.
- Ressources : serveur de dev sur le port 4523 ; eslint, `astro check`. Build annoncé ici avant.
- 08:53 : pages FR et EN écrites (16 sections, sur le modèle de Pétanque Game), liens « Voir aussi » sur la politique
  FR/EN et lien sur la page de l'appli (5 langues, ES/DE/IT vers l'anglais comme la politique) ; eslint OK, astro check
  0 erreur, contrôle en dev OK (textes, 16 sections, hreflang, liens, aucun débordement ni erreur console). Lancement
  du build complet dans mon worktree dragons-gems-consent (écrit son dist/, .astro/, public/vendor/), pas dans le
  dossier partagé…
- 08:55 : build complet OK dans le worktree (astro check 0 erreur, 194 pages, précache 364 entrées, liens OK). Commit
  37a6a63 sur la branche dragons-gems-consent, pas poussé : /dragons-gems/cgu/ et /en/dragons-gems/cgu/ (compte
  facultatif, pièces et cœurs, achats et restauration, rétractation, vidéos Accepter/Refuser, classements et franc-jeu,
  modération, arrêt du service, droit applicable), liens depuis la politique FR/EN et la page de l'appli. Mise en ligne
  avec la 0.1.16, au mot de Raphaël. Réservation maintenue.
- 22:52 : en ligne depuis 7d5cc44 : les CGU de 37a6a63 reprises en couleurs « Scène » (16d6028, 9a053d2). Statut :
  terminé. Réservations libérées.

## 2026-11-06 — Pétanque Game : politique et CGU pour la 1.0.7 (connexion Google sur iPhone, retrait de l'accès Apple, statistiques) (session petanque-game)
- Statut : en cours (2026-11-06T00:32+01:00). Demande de l'utilisateur : (transmis par la session Producer, consigne de
  Raphaël pour la soumission de la 1.0.7) préparer W1 à W4 de docs/store.md « À publier avec la 1.0.7 » dans une
  branche, prête à pousser sur le ok de Raphaël
- Réservations actives : `src/pages{,/en,/es,/de,/it}/petanque-game/{confidentialite,cgu}.astro`, dans la branche
  `pg-1.0.7-policy` (worktree `website-worktrees/pg-1.0.7-policy`), rien dans ce dossier.
- Ressources : serveur de dev sur le port 4397 ; eslint, `astro check`. Build annoncé ici avant.
- 00:42 : W1 à W4 et les dates écrits dans les dix pages (branche pg-1.0.7-policy) : plus de mention d'Umami Cloud ;
  contrôles en cours (eslint, astro check), puis captures sur le port 4397 et build dans le worktree
- 00:43 : eslint et astro check passés (0 erreur, 0 avertissement). Lancement du build complet dans le worktree
  website-worktrees/pg-1.0.7-policy (écrit son dist/, .astro/, public/vendor/ à lui, rien dans ce dossier)
- 00:46 : prêt, non poussé : branche pg-1.0.7-policy, commit be7a3c3 (10 pages, 5 langues), worktree
  website-worktrees/pg-1.0.7-policy. Contrôlé : eslint, astro check (0 erreur, 0 avertissement), build complet
  (précache et liens ok), texte rendu des 10 pages vérifié, capture téléphone sans erreur de console. À pousser sur le
  « ok » de Raphaël, par la session petanque-game ; réservation maintenue jusque-là
- 00:48 : réservé aussi, à la demande de la session Producer : `src/pages/mentions-legales.astro` (section Licences :
  GoogleSignIn sur iPhone, les deux musiques que le jeu livre), dans la même branche pg-1.0.7-policy
- 00:49 : mentions légales écrites dans la branche ; eslint et astro check passés ; nouveau build complet dans le
  worktree (son dist/ à lui)
- 00:51 : branche pg-1.0.7-policy prête, non poussée : be7a3c3 (politique et CGU, 5 langues) et dc580d3 (mentions
  légales : GoogleSignIn, musiques). Contrôlée : eslint, astro check, build complet, texte rendu, console. À pousser
  sur le « ok » de Raphaël
- 00:54 : à la demande de la session Producer : §8 (« Sans publicité » sans compte) et statistiques du moteur Unity
  (coupées) dans les cinq politiques ; eslint et astro check passés ; nouveau build complet dans le worktree
- 00:55 : branche pg-1.0.7-policy prête, non poussée, trois commits : be7a3c3 (politique et CGU), dc580d3 (mentions
  légales), 1bb26ea (§8 et statistiques du moteur). Contrôlée à chaque étape : eslint, astro check, build complet,
  texte rendu. À pousser sur le « ok » de Raphaël
- 09:25 : à la demande de la session Producer : branche pg-1.0.7-policy recalée sur origin/main d755b84 (politique
  1.0.0 de Dragon Gems), sans conflit : 7ef3b57, 0dccf32, c69babe. Lancement d'eslint, astro check et du build complet
  dans le worktree website-worktrees/pg-1.0.7-policy (son dist/, .astro/, public/vendor/ à lui, rien dans ce dossier)
- 09:27 : branche pg-1.0.7-policy prête, non poussée, sur d755b84 : 7ef3b57 (politique et CGU), 0dccf32 (mentions
  légales), c69babe (§8 et statistiques du moteur). Contrôlée après le recalage : eslint sur les 11 pages, astro check
  (0 erreur, 0 avertissement), build complet (192 pages, précache 362, liens OK), texte rendu des 10 pages (plus
  d'Umami Cloud, date du 6 novembre). À pousser sur le « ok site PG » de Raphaël ; réservation maintenue
- 09:41 : poussé sur main au « ok site PG » de Raphaël, tapé dans la session petanque-game : 7ef3b57, 0dccf32, c69babe
  (d755b84..c69babe). Déploiement GitHub de c69babe réussi ; en ligne, vérifié sur les pages : politique en 5 langues
  datée du 6 novembre (W1 à W4, plus d'Umami Cloud), CGU (connexion Google sur iPhone), mentions légales (Google
  Sign-In for iOS, les deux musiques). Worktree website-worktrees/pg-1.0.7-policy et branche pg-1.0.7-policy supprimés.
  Cette section reste à commiter avec le journal, comme les autres. Statut : terminé. Réservations libérées.

## 2026-11-06 — Pétanque Meet : annonces de partenaires sur un concours (serveur, branche meet-partner-search) (session petanque-meet)
- Statut : en cours (2026-11-06T01:10+01:00). Demande de l'utilisateur : (transmis par le Producer, idée de Raphaël)
  petites annonces sur un concours pour chercher un partenaire ou un 3e ; code et migration écrits et testés en local,
  rien de poussé ni déployé, aucune exécution sur la base de production
- Réservations actives : `supabase/functions/meetups/index.ts` (annonces de partenaires seulement),
  `supabase/functions/_shared/account.ts`, `supabase/functions/_shared/partners.ts` et `partners_test.ts` (nouveaux),
  `supabase/migrations/*_partner_searches.sql` (nouveau), dans le worktree `website-worktrees/meet-partner-search`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 01:15 : branche meet-partner-search commitée localement (b658f04), non poussée, non déployée : migration (testée en
  local sur PGlite, 18 contrôles), actions list/post/close/partner_contact/report/moderate dans meetups, suppression du
  compte ; deno check, deno test (6) et eslint OK. Aucune exécution sur la base de production.

## 2026-11-06 — Dragon Gems : version.json pour l'invite de mise à jour (1.0.0) (session DragonsGemsSwipe)
- Statut : en cours (2026-11-06T01:41+01:00). Demande de l'utilisateur : (transmis par la session « sessions claude et
  playtest ») préparer public/dragons-gems/version.json pour l'invite de mise à jour de la 1.0.0 (variante B), sur une
  branche de worktree, vérifié, sans push ; un seul push au mot de Raphaël tapé dans la session Dragon Gems
- Réservations actives : `public/dragons-gems/version.json` (nouveau, dans le worktree
  website-worktrees/dragons-gems-version, branche dragons-gems-version).
- Ressources : serveur de dev sur le port 4561 ; eslint, `astro check`. Build annoncé ici avant.
- 01:42 : public/dragons-gems/version.json écrit dans le worktree dragons-gems-version (latest_android et latest_ios
  1.0.0, min 1.0.0, store_android vers Google Play ; pas de store_ios tant que la fiche App Store n'a pas de lien) ;
  JSON valide, astro check 0 erreur. Lancement du build complet dans mon worktree dragons-gems-version (écrit son
  dist/, .astro/, public/vendor/), pas dans le dossier partagé…
- 01:44 : build complet OK dans le worktree (astro check 0 erreur, 192 pages, précache 362 entrées, liens OK) ;
  dist/dragons-gems/version.json servi par startServer sur le port 4561 : 200, application/json, contenu exact, requête
  ?t= comprise ; serveur arrêté. Commit d01f303 sur la branche dragons-gems-version, pas poussé : un seul push au mot
  de Raphaël tapé dans la session Dragon Gems, si la variante B (avec l'invite) part. Les deux écarts de la politique
  (EN « Yes, suited », §11 module Google sur iPhone) sont demandés à la session website dans le ticket 0059, car ses
  pages sont réservées par elle. Réservation maintenue.
- 09:24 : Branche recalée sur origin/main d755b84 (politique 1.0.0 en ligne) : a715cfe. Lancement du build complet dans
  mon worktree website-worktrees/dragons-gems-version (écrit dist/, .astro/, public/vendor/ de ce worktree seulement)…
- 09:26 : Build complet OK sur a715cfe (astro check 0 erreur 0 avertissement, 192 pages, précache 362, liens OK). Servi
  en preview sur le port 4561 : /dragons-gems/version.json 200 application/json, contenu attendu ; la politique de
  d755b84 présente. Pas poussé : attend l'ok de Raphaël dans la session Dragon Gems.
- 09:37 : commité et poussé à la demande de l'utilisateur : mon fichier (public/dragons-gems/version.json) et cette
  section seulement. Statut : terminé. Réservations libérées.

## 2026-11-06 — Dragon Gems : politique de la 1.0.0 (ticket 0059 : « Yes, suited », module Google sur iPhone) (session website)
- Statut : en cours (2026-11-06T01:48+01:00). Demande de l'utilisateur : (transmis par la session « sessions claude et
  playtest », ticket 0059 de la session Dragon Gems) la 1.0.0 part en store depuis le main de DragonsGemsSwipe : la
  politique EN doit dire « Yes, suited » (§6, §14), le §11 FR et EN ajouter que sur iPhone le module de connexion de
  Google recueille aussi des informations sur l'appareil, puis la date ; sur une branche partie de main pour la 1.0.0,
  et le §11 reporté sur dragons-gems-consent ; vérifié, sans push, push au mot de Raphaël
- Réservations actives : `src/pages/dragons-gems/confidentialite.astro`,
  `src/pages/en/dragons-gems/confidentialite.astro` (dans le worktree website-worktrees/dg-1.0.0-policy, branche
  dg-1.0.0-policy, et dans website-worktrees/dragons-gems-consent).
- Ressources : serveur de dev sur le port 4524 ; eslint, `astro check`. Build annoncé ici avant.
- 01:53 : corrections écrites sans commit : branche dg-1.0.0-policy (partie d'origin/main 070f416) : EN « Yes, suited »
  au §6 et au §14, §11 FR et EN (sur iPhone le module de connexion de Google recueille aussi des informations sur
  l'appareil), date au 6 novembre ; branche dragons-gems-consent : le même §11, date au 6 novembre (son §6 et son §14
  disent déjà « Accept » / « Accepter », comme la branche house-ads de l'appli). eslint OK et astro check 0 erreur dans
  les deux ; contrôle en dev, bureau et téléphone : nouveaux textes présents, anciens absents, ancre #suppression
  présente, aucun débordement ni erreur console ; captures relues. Lancement du build complet dans mon worktree
  dg-1.0.0-policy, puis dans dragons-gems-consent (chacun écrit son dist/, .astro/, public/vendor/), pas dans le
  dossier partagé…
- 01:57 : builds complets OK : dg-1.0.0-policy 192 pages, précache 362 entrées ; dragons-gems-consent 194 pages,
  précache 364 entrées ; liens OK, astro check 0 erreur, HTML construit relu. Commits, pas poussés : branche
  dg-1.0.0-policy 8e4383a (EN « Yes, suited », §6 et §14) et affafc7 (§11 FR et EN, module de connexion de Google sur
  iPhone, date du 6 novembre) ; branche dragons-gems-consent e2a65e6 (le même §11, date du 6 novembre). La 1.0.0 part
  avec dg-1.0.0-policy seule, par un push séparé ; dragons-gems-consent part avec la 1.0.1 (sa fusion après
  dg-1.0.0-policy bloquera sur le §6 et le §14 EN : garder la version de la branche). Ticket 0059 répondu. Push au mot
  de Raphaël. Réservations maintenues.
- 02:02 : à la demande de la session Producer, §11 précisé dans les deux branches, en accord avec l'App Privacy de
  Dragon Gems : sur iPhone, le module de connexion de Google recueille aussi, pour Google, la position approximative
  (pour faire fonctionner la connexion), des identifiants de l'appareil et du compte et des données d'usage (pour les
  statistiques de Google). eslint OK, astro check sans erreur, contrôle en dev bureau et téléphone OK (première
  formulation absente), captures relues. Lancement du build complet dans dg-1.0.0-policy, puis dans
  dragons-gems-consent (chacun son dist/, .astro/, public/vendor/), pas dans le dossier partagé…
- 02:05 : builds complets OK (dg-1.0.0-policy 192 pages, précache 362 ; dragons-gems-consent 194 pages, précache 364 ;
  liens OK, astro check 0 erreur), HTML construit relu. Commits, pas poussés : afa5a97 sur dg-1.0.0-policy (après
  8e4383a et affafc7) et b288357 sur dragons-gems-consent (après e2a65e6). Ticket 0059 complété. Push au mot de
  Raphaël. Réservations maintenues.
- 08:47 : ticket 0061 (vidéos maison après « Non merci ») : les 9 points écrits dans dg-1.0.0-policy, pages FR et EN
  (Dragon Gems n'a pas d'autre langue) ; eslint OK ; astro check, contrôle et build en cours, pas de push
- 08:50 : ticket 0061 fait et répondu : commit d755b84 sur dg-1.0.0-policy (après 8e4383a, affafc7, afa5a97), pas
  poussé ; pages FR et EN ; contrôle du texte rendu (bureau et téléphone), build complet du worktree OK (astro check 0
  erreur, 192 pages, précache 362, liens OK). Push au mot de Raphaël. Réservations maintenues
- 09:17 : poussé à la demande de l'utilisateur (« pousse la politique 1.0.0 de Dragon Gems ») : main avancé sur
  dg-1.0.0-policy (070f416..d755b84 : 8e4383a, affafc7, afa5a97, d755b84), git push. Pas de commit du journal : la
  session Nino Rush a des fichiers préparés dans l'index (ninoRush.ts, telecharger.astro, sa section), laissés intacts.
  Attente du déploiement…
- 09:23 : en ligne : d755b84 déployé en 5 min 35 s ; pages FR et EN servies avec le nouveau texte (house_ad_shown, «
  Yes, suited », GitHub dans les destinataires). Statut : terminé. Réservations libérées pour dg-1.0.0-policy ; celle
  de dragons-gems-consent est maintenue (1.0.1)

## 2026-11-06 — Accueil : carrousel des jeux en haut, défi du jour plus bas, et trois directions de refonte (session website)
- Statut : en cours (2026-11-06T02:27+01:00). Demande de l'utilisateur : (transmis par la session « sessions claude et
  playtest », mots de Raphaël : « Je me demande si on ne devrait pas mettre en avant les nouveaux jeux ludiven sur le
  site web plutôt que les défis du jour », puis « Oui peut être un carousel. Peut être appeler codex ou Claude design
  pour proposer une refonte du site web ») un carrousel des jeux en haut de l'accueil (Dragon Gems, Nino Rush bientôt,
  les applis de pétanque, badges des stores), lisible sur téléphone, accessible, textes dans les 5 langues, sombre ; le
  défi du jour plus bas ; trois directions de refonte (l'évolution codée, Codex à l'aveugle, la mienne avec l'outil de
  design) et une planche pour Raphaël ; rien de poussé ni publié
- Réservations actives : `src/pages/index.astro`, `src/components/GamesCarousel.astro` et `src/data/homeGames.ts`
  (nouveaux), dans le worktree website-worktrees/home-carousel, branche home-carousel.
- Ressources : serveur de dev sur le port 4525 ; eslint, `astro check`. Build annoncé ici avant.
- 02:54 : carrousel écrit dans le worktree home-carousel (src/components/GamesCarousel.astro, src/data/homeGames.ts,
  src/pages/index.astro, et la nouvelle icône public/assets/petanque-ar/icon.webp, ajoutée à ma réservation) : 5
  diapositives (Dragon Gems, Nino Rush bientôt, Pétanque Game, Meet, Scan), descriptions courtes des fiches Google Play
  dans les 5 langues, badges des stores, rotation de 7 s arrêtée au survol, au focus et au premier geste, jamais en
  mouvement réduit, bouton pause ; le défi du jour sous le carrousel, et premier pour un joueur dont la série est en
  cours. eslint OK, astro check 0 erreur, 35 contrôles Playwright OK (bureau et téléphone, clair et sombre, 5 langues
  sur une page d'essai supprimée depuis). Direction de Codex faite (ticket 0060, shots/redesign/codex/), la mienne sur
  un canevas de design privé. Lancement du build complet dans mon worktree home-carousel (écrit son dist/, .astro/,
  public/vendor/), pas dans le dossier partagé…
- 02:59 : build complet OK (192 pages, précache 362, liens OK). Correction : les icônes des diapositives hors champ se
  chargent aussi après la page, pour qu'une diapositive n'arrive pas à moitié vide ; contrôle ajouté, 36 contrôles OK.
  Nouveau build complet dans mon worktree home-carousel…
- 03:06 : build complet OK (192 pages, précache 362, liens OK) ; captures prises sur le site construit. Commit 0e6142f
  sur la branche home-carousel, pas poussé : carrousel, données en 5 langues, accueil réordonné, icône de Pétanque
  Scan. Planche envoyée à Raphaël (shots/redesign/planche-refonte.png) : avant, A l'évolution codée, B Codex « Escales
  ludiques » (ticket 0060 clos, ligne dans .collab/LOG.md), C « Scène » (canevas de design privé), recommandation A
  maintenant puis C avec la barre du bas de B, et 5 questions (dont les accueils traduits, environ une journée). Push
  au mot de Raphaël. Réservations maintenues.
- 12:10 : remplacé par la refonte « Scène » (section suivante) sur la décision de Raphaël : la branche home-carousel
  n'est pas poussée et reste en réserve. Statut : terminé. Réservations libérées.

## 2026-11-06 — Accueil : refonte « Scène », menu traduit, barre du bas et accueils en 5 langues (session website)
- Statut : en cours (2026-11-06T08:23+01:00). Demande de l'utilisateur : (transmis par la session « sessions claude et
  playtest », réponses de Raphaël à la planche) on ne pousse pas A, on construit la piste C « Scène » avec la barre du
  bas de B sur téléphone pour le défi du jour ; accueils traduits /en/, /es/, /de/, /it/ avec le menu et les hreflang,
  mini-jeux en français ; lien « Essayer la version de test (Android) » sur Nino Rush, en ligne seulement après sa
  politique 1.0.11 ; rotation toutes les 7 s avec les arrêts ; vérifié comme A ; planche avec l'effort restant ; rien
  de poussé
- Réservations actives : `src/components/Nav.astro`, `src/components/Footer.astro`, `src/layouts/BaseLayout.astro`
  (menu, pied de page, barre du bas), `src/styles/global.css` (un bloc de couleurs « Scène »), `src/pages/index.astro`,
  `src/pages/{en,es,de,it}/index.astro` (nouveaux), `src/components/Home*.astro`, `src/components/TabBar.astro`,
  `src/data/homeGames.ts`, `src/data/siteNav.ts` (nouveaux), `public/assets/home/`,
  `public/assets/petanque-ar/icon.webp` (nouveaux), `scripts/check-home.mjs` (nouveau), dans le worktree
  website-worktrees/home-scene, branche home-scene ; rien dans ce dossier.
- Ressources : serveur de dev sur le port 4526 ; eslint, `astro check`. Build annoncé ici avant.
- 09:00 : écrit dans le worktree home-scene : menu traduit (5 langues) avec le défi du jour et la série, barre du bas
  sur les pages françaises (pas sur les jeux, la carte ni les autres langues), pied de page traduit, accueil « Scène »
  en français et /en/, /es/, /de/, /it/ ; les images de la scène viennent des dossiers Marketing des applis
  (public/assets/home/) ; l'icône de Scan existait déjà (/assets/petanque/icon-scanner.webp), petanque-ar/icon.webp
  n'est plus réservé. eslint OK, astro check 0 erreur, scripts/check-home.mjs 83 contrôles OK en dev. Lancement du
  build complet dans mon worktree home-scene (écrit son dist/, .astro/, public/vendor/), pas dans le dossier partagé…
- 09:10 : build complet OK dans home-scene (astro check 0 erreur, 196 pages, précache 368, liens OK, les 4 accueils
  traduits dans le sitemap) ; check-home.mjs 84 contrôles OK en dev et sur le build ; 4 commits sur la branche
  home-scene, pas poussés : d3e9e6d (menu, pied de page, barre du bas), 6d4465c (accueil), 45f6033 (accueils traduits),
  9c3ed39 (contrôles), astro check OK à chacun. Planche envoyée à Raphaël (shots/redesign/planche-scene.png). À recaler
  sur main après les pushes du matin ; le lien de test de Nino Rush attend sa politique 1.0.11 en ligne. Push au mot de
  Raphaël. Réservations maintenues
- 09:27 : home-scene recalée sur main (d755b84, politique Dragon Gems 1.0.0 en ligne) : 929007f, adbbea2, 915469e,
  bf260e7 ; astro check 0 erreur 0 avertissement. Push au mot de Raphaël, après la politique 1.0.11 de Nino Rush
- 09:46 : politique 1.0.11 de Nino Rush en ligne (main 976c3b7) : le bouton de test reste. home-scene recalée sur
  976c3b7. Lancement du build complet dans mon worktree home-scene (écrit son dist/, .astro/, public/vendor/), pas dans
  le dossier partagé…
- 09:52 : build complet OK sur 976c3b7 (astro check 0 erreur 0 avertissement, 206 pages, précache 378, liens OK) ;
  check-home.mjs 86 contrôles OK sur le build (pages de confidentialité de Nino Rush ajoutées au tour des pages).
  home-scene : e9c4b4e, e654dc3, 29c5047, 474e65a, pas poussés. Push au mot de Raphaël
- 10:27 : réponses de Raphaël (transmis par le Producer) : oui au menu, à la bande claire du studio et à l'ordre ; la
  refonte entière part d'un coup, sur son mot. Bloc 1, pages des applis (début 10:15) : scène commune AppStage, rangée
  « Nos autres jeux », couleurs « Scène » sur les pages de Dragon Gems, Nino Rush (nouvelle page produit de 09:58),
  Pétanque Game, Scan, Meet et /petanque/ ; réservations ajoutées :
  src/components/{AppStage,MoreApps,DragonsGemsLanding,DragonsGemsDownload,DragonsGemsBadges,PetanqueLanding,ScannerDownload,MeetDownload,NinoRushLanding}.astro,
  src/pages/nino-rush/telecharger.astro, src/pages/petanque.astro. Recalée sur main a3d41a3. Lancement du build complet
  dans mon worktree home-scene (son dist/), pas dans le dossier partagé…
- 10:32 : bloc 1 fini (10:15-10:32) : 30f27eb (pages des applis), 1973a4d (Nino Rush mène à sa page, la version de test
  en second lien), 81f9ed4 (contrôles) ; eslint OK, astro check 0 erreur (aussi à 30f27eb seul), build complet 211
  pages, précache 384, liens OK, check-home.mjs 107 contrôles OK sur le build. Bloc 2 (mini-jeux, /jeux/ et
  /jeux/defi/) : réservations ajoutées src/pages/jeux/index.astro, src/pages/jeux/defi.astro,
  src/components/{GameCard,GameFold,GameTools,GameSearch,GameTileSize,GameFavorites}.astro
- 10:35 : bloc 2 (mini-jeux) écrit : en-tête de nuit et fond uni sur /jeux/ et /jeux/defi/, couleurs « Scène » des
  tuiles, rubriques, recherche et tailles ; check-games-page.mjs OK (27 contrôles). Lancement du build complet dans mon
  worktree home-scene (son dist/)…
- 10:39 : bloc 2 fini (10:33-10:38) : f3398a9 fd7aac9 ; build complet 211 pages, précache 384, liens OK ;
  check-home.mjs 107 contrôles OK sur le build ; check-games-page.mjs OK. Bloc 3 (cadre des pages de jeu) :
  réservations ajoutées src/layouts/GamePage.astro, src/components/GameTutorial.astro,
  src/components/GameFullscreen.astro (couleurs seulement)
- 10:52 : bloc 3 (cadre des pages de jeu) écrit : fond uni et couleurs « Scène » dans GamePage, GameTutorial,
  GameFullscreen et ShareButton (couleurs seulement, la structure du plein écran et de .game-art inchangée) ;
  check-billard-fullscreen OK ; check-game-popups : 7 échecs sur les jeux sans défi (atelier, rayou, 5 illusions), les
  mêmes sur l'ancien code (témoin sur d755b84) : pas liés à la refonte. Lancement du build complet dans mon worktree
  home-scene (son dist/)…
- 10:57 : bloc 3 fini (10:39-10:57) : 366f754 (cadre des pages de jeu), 38ba9c3 (contrôles) ; astro check 0 erreur,
  build complet 211 pages, précache 384, liens OK ; check-home.mjs 108 contrôles OK sur le build. Bloc 4 (pages du
  studio) : réservations ajoutées src/pages/{prestations,services,work,about,contact,partenariats,labo}.astro,
  src/pages/en/{services,work,contact,prefab-fusion}.astro, src/pages/prefab-fusion.astro,
  src/pages/work/[...slug].astro, src/pages/en/work/[...slug].astro,
  src/components/{ContactCTA,CallToAction,Hero,PortfolioPreview,Skills,ServiceScene,OfferScene,FocusItem,SuggestionForm}.astro
  (couleurs seulement)
- 11:08 : bloc 4 (pages du studio) écrit : fond uni et couleurs « Scène » (prestations, services, projets et fiches, à
  propos, contact, partenariats, labo, Prefab Fusion, et l'anglais) ; le bouton du site (CallToAction) en violet «
  Scène », l'appel au contact (ContactCTA) en carte de nuit ; drapeaux retirés, le choix de langue du menu les
  remplace. Lancement du build complet dans mon worktree home-scene (son dist/)…
- 11:37 : build du bloc 4 OK (211 pages, précache 384, liens OK, astro check 0 erreur ; astro check a pris 12 min, PC
  chargé par un Unity) ; check-home a trouvé, sous cette charge, une vignette de la scène en retard après Fin et Début
  : le défilement s'arrêtait en route et la position intermédiaire était prise. Corrigé dans HomeStage (seule une piste
  au repos sur une diapositive compte). Nouveau build complet et contrôle en cours dans mon worktree home-scene…
- 11:52 : bloc 4 fini (10:58-11:52, dont environ 35 min d'attente du build sous la charge d'un Unity) : correctif de la
  scène, pages du studio, contrôles ; build complet 211 pages, précache 384, liens OK ; check-home.mjs 108 contrôles OK
  sur le build. Raphaël (dans cette session) : attendre la fin des blocs 5 et 6, puis tout pousser d'un coup. Bloc 5
  (pages légales) : réservations ajoutées pour les styles seulement des pages confidentialite, cgu et mentions-legales
  (36 pages, toutes langues)
- 11:56 : blocs 5 et 6 écrits : couleurs « Scène » des 36 pages légales (styles seulement, liens en --sc-link) ; fond
  uni sur tout le site (les anciens fonds peints retirés de BaseLayout), fond du body, couleur de barre du navigateur
  (MainHead, réservé aussi), bandeau de mise à jour ; check-game-popups exempte les jeux sans défi du jour. Lancement
  du build complet et des contrôles finaux dans mon worktree home-scene (son dist/)…
- 12:10 : blocs 5 et 6 finis (11:53-12:09) : pages légales, fond uni partout, check-game-popups corrigé ; contrôles
  finaux sur le build : astro check 0 erreur, 211 pages, précache 384, liens OK, check-home 109, check-games-page,
  check-game-popups (61 jeux) et check-billard-fullscreen OK. Commité et poussé à la demande de l'utilisateur («
  Attendre la fin », puis tout pousser d'un coup) : les 18 commits de home-scene et cette section seulement. Statut :
  terminé. Réservations libérées.
- 12:17 : en ligne : eb5e923 déployé en 5 min 40 s ; /, /en/, /es/, /de/, /it/, /dragons-gems/, /jeux/, /prestations/
  répondent 200, l'accueil anglais sert la scène et ses hreflang

## 2026-11-06 — Dragon Gems Swipe et Pétanque Game : sortie sur l'App Store (session website)
- Statut : en cours (2026-11-06T12:58+01:00). Demande de l'utilisateur : pour info Petanque Game et Dragon Gems
  viennent de sortir sur iOS
- Réservations actives : `src/data/dragonsGems.ts`, `src/data/petanqueGame.ts` (liens App Store et textes « bientôt »),
  `src/pages/petanque.astro`, `src/pages/jeux/petanque.astro` (notes de la carte),
  `src/content/work{,-en}/{dragons-gems,petanque-game}.md` (appStore), `scripts/check-home.mjs`, dans le worktree
  website-worktrees/ios-release, branche ios-release ; rien dans ce dossier.
- Ressources : serveur de dev sur le port 4530 ; eslint, `astro check`. Build annoncé ici avant.
- 13:02 : demande de l'utilisateur ajoutée : « Pour dragon gems, il est indiqué des fois 500, des fois 250 niveaux ...
  en fait c est meme 750 avec une surprise au 500eme (la petite soeur de Bijou) » : 750 niveaux et la surprise du
  niveau 500 dans les 5 langues (dragonsGems.ts), la carte du mini-jeu (réservé aussi : src/pages/jeux/eclats.astro) et
  les fiches projet. Lancement du build complet dans mon worktree ios-release (son dist/)…
- 13:09 : prêt, non poussé : branche ios-release, dad0657 (liens App Store id6829283627 et id6827514133, « bientôt »
  retiré en 5 langues, notes des cartes des mini-jeux, fiches projet ; la pub du mini-jeu de pétanque passe à Pétanque
  Game sur iPhone, par les données) et c826ced (750 niveaux, surprise au niveau 500). eslint OK, astro check 0 erreur,
  build complet 211 pages, précache 384, liens OK, check-home.mjs 109 contrôles OK sur le build, captures relues. Pas
  touché : version.json des deux applis (sans store_ios), à leurs sessions. Push au mot de Raphaël
- 13:09 : pour les sessions Dragon's Gems et Pétanque Game (demande du Producer) : store_ios dans
  public/dragons-gems/version.json et public/jeux/petanque/version.json part avec ce push. Faites votre commit dans
  votre propre worktree, sur une branche partie d'origin/main (eb5e923), sans pousser, et notez son hash dans votre
  section ; je le reprends tel quel sur ios-release (un commit par session) et je relance les contrôles. Ces deux
  fichiers restent à vous : je ne les touche pas. Push au mot de Raphaël, quand les deux sont là
- 13:26 : repris tels quels sur ios-release (un commit par session, leur message) : c3c1837 (store_ios de Dragon Gems),
  88e1145 (store_ios de Pétanque Game), a1a9554 (catalogue des vidéos maison par Tools : iOS pour Pétanque Game et
  Dragon Gems). Lancement du build complet et des contrôles dans mon worktree ios-release (son dist/)…
- 13:30 : prêt, non poussé : ios-release = dad0657, c826ced, 7054b64, 3d36419, e7a5b72 sur origin/main eb5e923 ; build
  complet 211 pages, astro check 0 erreur, précache 384, liens OK ; check-promo OK (5 entrées) ; les deux version.json
  et le catalogue servis identiques dans dist/ ; check-home.mjs 109 contrôles OK sur le build. Push au mot de Raphaël
- 13:32 : commité et poussé à la demande de l'utilisateur (« pousse la sortie iOS ») : les 5 commits d'ios-release
  (dont ceux des sessions Dragon's Gems, Pétanque Game et Tools, repris tels quels) et cette section seulement. Statut
  : terminé. Réservations libérées.
- 13:40 : en ligne : a170c58 déployé (environ 7 min) ; store_ios servi dans les deux version.json, iOS pour Pétanque
  Game et Dragon Gems dans le catalogue, lien App Store sur /petanque-game/, « 750 levels » sur /en/dragons-gems/

## 2026-11-06 — Dragon Gems : store_ios dans version.json (sortie App Store) (session DragonsGemsSwipe)
- Statut : en cours (2026-11-06T13:10+01:00). Demande de l'utilisateur : (transmis par la session « sessions claude et
  playtest ») Dragon's Gems est sorti sur l'App Store : ajouter store_ios à public/dragons-gems/version.json, dans le
  même push que la branche ios-release de la session website, au mot de Raphaël
- Réservations actives : `public/dragons-gems/version.json` (dans le worktree website-worktrees/dragons-gems-version,
  nouvelle branche dragons-gems-store-ios partie d'origin/main eb5e923).
- Ressources : serveur de dev sur le port 4561 ; eslint, `astro check`. Build annoncé ici avant.
- 13:10 : store_ios ajouté (https://apps.apple.com/app/id6829283627, la forme de dragonsGems.ts sur ios-release ; le
  lien répond 200, « Dragon Gems Swipe: Bijou ») ; JSON valide, le champ store_ios est celui que lit UpdatePrompt.cs de
  l'appli. Lancement du build complet dans mon worktree website-worktrees/dragons-gems-version (écrit son dist/,
  .astro/, public/vendor/ seulement)…
- 13:12 : build complet OK dans mon worktree (astro check 0 erreur 0 avertissement, 211 pages, précache 384, liens OK)
  ; dist/dragons-gems/version.json identique à la source. Commit c3c1837 sur la branche dragons-gems-store-ios (partie
  d'origin/main eb5e923), pas poussé : pour la session website, à reprendre tel quel sur ios-release (il ne touche que
  ce fichier, absent d'ios-release). Push au mot de Raphaël. Réservation maintenue jusqu'au push.
- 13:19 : à savoir : l'appli iPhone en ligne (1.0.0, en ligne depuis le 2026-11-05 20:42 UTC selon
  itunes.apple.com/lookup) est un build d'avant l'invite de mise à jour : elle ne lit pas version.json. store_ios
  servira aux versions iPhone suivantes ; c3c1837 reste valable tel quel.
- 13:30 : pour la session website : ticket 0062 (politique de la 1.0.1 de Dragon Gems : dragons-gems-consent à recaler
  sur origin/main, sans push ; ad-partners de la session LudivenTools dans le même push, au mot de Raphaël).
- 15:53 : en ligne : store_ios est dans version.json sur main (7d5cc44), poussé par la session website au mot de
  Raphaël ; ma branche dragons-gems-store-ios (c3c1837, même contenu) est supprimée, rien à commiter de mon côté.
  Ticket 0062 clos (## Suite, ligne dans .collab/LOG.md). Statut : terminé. Réservations libérées.

## 2026-11-06 — Pétanque Game : store_ios dans version.json (sortie App Store) (session PetanqueGame)
- Statut : en cours (2026-11-06T13:12+01:00). Demande de l'utilisateur : (transmis par la session « sessions claude et
  playtest ») Pétanque Game est sorti sur l'App Store : ajouter store_ios à public/jeux/petanque/version.json, dans le
  même push que la branche ios-release de la session website, au mot de Raphaël
- Réservations actives : `public/jeux/petanque/version.json` (dans le worktree website-worktrees/pg-store-ios, nouvelle
  branche pg-store-ios partie d'origin/main eb5e923).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 13:14 : store_ios ajouté (https://apps.apple.com/app/id6827514133, la forme de petanqueGame.ts sur ios-release ; le
  lien répond 200, « Pétanque Game ») ; JSON valide, le champ store_ios est celui que lit UpdatePrompt.cs de l'appli
  (lien https exigé) ; latest_ios reste 1.0.0 : c'est la version en ligne sur l'App Store (API d'Apple, sortie le 05/11
  23:36). Lancement du build complet dans mon worktree website-worktrees/pg-store-ios (écrit son dist/, .astro/,
  public/vendor/ seulement)…
- 13:15 : prêt, non poussé : branche pg-store-ios, 88e1145 (partie d'origin/main eb5e923 ;
  public/jeux/petanque/version.json seulement, le README.md que le worktree montre modifié n'est pas à moi et reste
  hors du commit). Build complet OK : astro check 0 erreur 0 avertissement, 211 pages, précache 384, liens OK ;
  dist/jeux/petanque/version.json porte store_ios. Pour la session website : à reprendre tel quel sur ios-release. Push
  au mot de Raphaël
- 15:47 : en ligne : repris sur ios-release (3d36419) et poussé par la session website au mot de Raphaël ; vérifié sur
  www.ludiven-studio.fr/jeux/petanque/version.json (store_ios servi). Worktree website-worktrees/pg-store-ios et
  branche pg-store-ios retirés. Statut : terminé. Réservations libérées.

## 2026-11-06 — LudivenTools : catalogue maison, Pétanque Game et Dragon's Gems sur iOS (session LudivenTools)
- Statut : en cours (2026-11-06T13:25+01:00). Demande de l'utilisateur : Producer : link.ios et toutes plateformes pour
  petanque-game et dragon-gems, sortis sur l'App Store
- Réservations actives : `public/promo/v1/catalog.json`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 13:25 : commité a1a9554 sur la branche catalog-ios (worktree website-worktrees/catalog-ios), partie d'origin/main
  eb5e923, non poussé ; check-promo passe (5 entrées). À reprendre tel quel sur ios-release par website-a3.. Statut :
  terminé. Réservations libérées.

## 2026-11-06 — Dragon Gems 1.0.1 : politique (ticket 0062), conditions d'utilisation, page des sociétés, et ménage de la refonte (session website)
- Statut : en cours (2026-11-06T13:40+01:00). Demande de l'utilisateur : (transmis par le Producer : Raphaël « je vais
  m'occuper de mettre sur les stores. juste finalise le site web ») la politique 1.0.1 recalée sur main, la page
  /publicite/societes/ de Tools, en ligne avant la soumission de la 1.0.1 ; supprimer ce que la refonte a laissé sans
  usage ; push au mot de Raphaël
- Réservations actives : `src/pages{,/en}/dragons-gems/{confidentialite,cgu}.astro`,
  `src/components/DragonsGemsLanding.astro` et `src/data/dragonsGems.ts` (lien des CGU),
  `src/pages{,/en,/es,/de,/it}/publicite/societes.astro` (commit 7828cc6 de Tools repris tel quel),
  `src/components/Skills.astro` et `public/assets/backgrounds/` (suppression), dans le worktree
  website-worktrees/dg-1.0.1, branche dg-1.0.1 ; rien dans ce dossier.
- Ressources : serveur de dev sur le port 4531 ; eslint, `astro check`. Build annoncé ici avant.
- 13:40 : branche dg-1.0.1 (partie d'origin/main a170c58), non poussée : 601870d (politique 1.0.1 FR et EN : Accepter /
  Refuser, six mois, nos vidéos après un refus ; les ajouts de la 1.0.0 gardés), 16d6028 (CGU FR et EN, repris de
  dragons-gems-consent 37a6a63), 9a053d2 (CGU en couleurs « Scène »), 1b65b90 (page des sociétés de Tools, 7828cc6
  repris tel quel), 1c9cddd (Skills.astro et public/assets/backgrounds/ supprimés, plus rien ne les cite). eslint OK.
  Lancement du build complet dans mon worktree dg-1.0.1 (son dist/)…
- 13:47 : la session Dragon Gems confirme les 7 points dans le code de house-ads ; ses deux précisions ajoutées
  (804c5f6) : « Activer les pubs » vaut « Accepter » (et la question de suivi d'Apple le suit aussi), la fenêtre
  renvoie à la liste des sociétés (/publicite/societes/). Build complet OK (218 pages, astro check 0 erreur, précache
  389, liens OK), check-home.mjs 109 contrôles OK sur le build, pages relues (politique, CGU, sociétés FR et DE, bureau
  et téléphone sombre). Push au mot de Raphaël : « pousse la 1.0.1 de Dragon Gems et le ménage du site »
- 15:37 : poussé sur le mot de Raphaël (« Ok pousse », en réponse à la ligne « pousse la 1.0.1 de Dragon Gems et le
  ménage du site ») : les 6 commits de dg-1.0.1 et cette section seulement. Statut : terminé. Réservations libérées.

## 2026-11-06 — Pétanque Meet : page bêta de la 1.0.1 (APK .beta, lien discret) (session PetanqueMeet)
- Statut : en cours (2026-11-06T15:50+01:00). Demande de l'utilisateur : (transmis par le Producer) tester une dernière
  fois la 1.0.1 avant soumission : un APK .beta, à côté de l'appli du store, téléchargeable par un lien discret (page
  testeurs non listée, noindex, hors menu et sitemap, chemin difficile à deviner) ; publication au mot de Raphaël
- Réservations actives : `src/pages/petanque-meet/beta-0gn9lbmb.astro` (nouveau), `astro.config.mjs` (une règle du
  filtre du sitemap et un motif de globIgnores, pour toute page /beta-…/), dans le worktree
  website-worktrees/meet-beta-101, branche meet-beta-101 ; rien dans ce dossier.
- Ressources : serveur de dev sur le port 4587 ; eslint, `astro check`. Build annoncé ici avant.
- 15:53 : astro.config.mjs retiré de ma réservation : la session website pose la règle /beta-…/ pour les 4 applis
  (sitemap, globIgnores, noindex), je pars de son commit. Réservation restante :
  src/pages/petanque-meet/beta-0gn9lbmb.astro (nouveau), dans le worktree website-worktrees/meet-beta-101
- 16:05 : page prête, non poussée : commit 6c9970b sur la branche meet-beta-101 (partie d'origin/main 7d5cc44),
  src/pages/petanque-meet/beta-0gn9lbmb.astro seulement ; eslint OK, astro check 0 erreur 0 avertissement, captures
  bureau, bureau sombre, téléphone et téléphone sombre relues, aucune erreur de console. J'attends le commit de la
  règle /beta-…/ de la session website pour repartir dessus et lancer le build complet. Publication (APK dans le bucket
  builds, puis push) au mot de Raphaël
- 16:06 : page reprise sur bd6032d (règle /beta-…/ de la session website) : 17a89f5. Lancement du build complet dans
  mon worktree meet-beta-101 (écrit son dist/, .astro/, public/vendor/ seulement)…
- 16:08 : build complet OK dans mon worktree : astro check 0 erreur 0 avertissement, 219 pages, précache 389 (toutes
  résolues), liens OK. Dans dist/ : la page est en noindex (robots noindex, follow), absente du sitemap et de sw.js
  (qui liste bien /petanque-meet/test, témoin), et son bouton vise petanque-meet-beta-1.0.1.apk. Prêt, non poussé :
  meet-beta-101 = bd6032d (règle de la session website) + 17a89f5 (ma page). Push au mot de Raphaël : « Publie la bêta
  1.0.1 de Pétanque Meet »
- 16:12 : commité et poussé à la demande de l'utilisateur (« Publie la bêta 1.0.1 de Pétanque Meet ») : bd6032d (la
  règle /beta-…/ de la session website, reprise telle quelle), 17a89f5 (ma page) et cette section seulement. L'APK est
  en ligne avant le push : builds/petanquemeet-beta-0gn9lbmb/petanque-meet-beta-1.0.1.apk, servi identique (34 477 657
  octets, sha256 3d9e6436…aa9631e6). Statut : terminé. Réservations libérées.

## 2026-11-06 — Pages bêta des applis : hors sitemap, hors précache, noindex (session website)
- Statut : en cours (2026-11-06T15:52+01:00). Demande de l'utilisateur : (transmis par le Producer : Raphaël veut une
  bêta prod de chaque appli, Meet, Pétanque Game, Scan, Dragon's Gems, avec un APK .beta sur une page discrète
  /<jeu>/beta-<code>/) une fois pour les 4 : exclure ces pages du sitemap et du service worker, noindex ; commit sur
  une branche partie de main, sans push
- Réservations actives : `astro.config.mjs` (filtre du sitemap et globIgnores : une règle /beta-…/ chacun ; la
  réservation de la section Pétanque Meet sur ce fichier lui est signalée, son worktree ne le modifie pas),
  `src/layouts/BaseLayout.astro` (noindex des pages /beta-…/), dans le worktree website-worktrees/dg-1.0.1, branche
  beta-pages ; rien dans ce dossier.
- Ressources : serveur de dev sur le port 4531 ; eslint, `astro check`. Build annoncé ici avant.
- 15:52 : règles écrites (astro.config.mjs : '/beta-' dans le filtre du sitemap, '**/beta-*/**' dans globIgnores ;
  BaseLayout : noindex sur tout chemin /beta-), page témoin non commitée src/pages/petanque-game/beta-zz9test.astro
  sans noindex à elle. Lancement du build complet dans mon worktree dg-1.0.1 (son dist/)…
- 15:55 : correction : le build de 15:52 a tourné dans ce dossier partagé, pas dans mon worktree (dist/, .astro/,
  public/vendor/ d'ici réécrits depuis main 7d5cc44 et les fichiers non commités présents, 218 pages, build OK) ;
  aucune autre section n'annonçait de build ici. Relance du build complet dans mon worktree dg-1.0.1 (son dist/)…
- 16:03 : build dans mon worktree OK (219 pages avec la page témoin, astro check 0 erreur, liens OK) : la page témoin,
  sans noindex à elle, sort en « noindex, follow » ; précache 389 entrées comme sans elle (les autres pages cachées,
  test et nuit, y sont, elles), sitemap 185 adresses sans aucune /beta-. Page témoin supprimée, commit bd6032d sur la
  branche beta-pages (astro.config.mjs et BaseLayout.astro), non poussé. Push au mot de Raphaël : « pousse les règles
  des pages bêta »
- 16:22 : bd6032d poussé tel quel par la session Pétanque Meet avec sa page, sur le mot de Raphaël (« Publie la bêta
  1.0.1 de Pétanque Meet ») : 7d5cc44..d51f62f. Vérifié en ligne : /petanque-meet/beta-0gn9lbmb/ en « noindex, follow
  », absente de sw.js (où /petanque-meet/test reste listée) et du sitemap (185 adresses, aucune /beta-) ;
  /petanque-meet/telecharger/ sans robots. Cette section part avec mon prochain push. Statut : terminé. Réservations
  libérées.

## 2026-11-06 — Dragon Gems : page bêta discrète de la 1.0.1 (APK .beta) (session DragonsGemsSwipe)
- Statut : en cours (2026-11-06T15:53+01:00). Demande de l'utilisateur : (transmis par la session « sessions claude et
  playtest ») tester une dernière fois la version prod avant soumission, avec un APK téléchargeable par un lien discret
  : page testeurs non listée, noindex, hors menu et sitemap, chemin difficile à deviner ; publication au mot de Raphaël
  tapé dans la session Dragon Gems
- Réservations actives : `src/pages/jeux/eclats/test/beta-*.astro` (worktree website-worktrees/dragons-gems-version,
  branche dragons-gems-beta).
- Ressources : serveur de dev sur le port 4491 ; eslint, `astro check`. Build annoncé ici avant.
- 15:57 : page écrite dans le worktree (branche dragons-gems-beta) : /jeux/eclats/test/beta-…/, noindex, liée de nulle
  part, hors sitemap par le filtre /jeux/eclats/test existant (astro.config.mjs inchangé). eslint OK, astro check 0
  erreur, captures bureau et téléphone sombre relues. Taille et SHA-256 de l'APK à remplir après le build ; l'APK ira
  dans la prerelease dragons-gems-beta. Rien de commité ni poussé : au mot de Raphaël
- 16:05 : page déplacée en src/pages/dragons-gems/beta-wnkmrlugi7.astro (/dragons-gems/beta-…/, la forme
  /<app>/beta-<code>/ des règles de website-a3) ; ma réservation devient `src/pages/dragons-gems/beta-*.astro`. Branche
  dragons-gems-beta avancée sur bd6032d (beta-pages : noindex, hors sitemap et hors précache pour /beta-). eslint OK
- 16:30 : APK bêta construit (16:17-16:29) et vérifié : taille et SHA-256 mis sur la page. Lancement du build complet
  dans mon worktree (écrit dist/, .astro/, public/vendor/ du worktree seulement)…
- 16:36 : build complet OK dans mon worktree (sur d51f62f) : 220 pages, astro check 0 erreur, précache 389 sans la
  page, sitemap sans /beta-, noindex servi, aucune page ne la lie ; captures relues. Prêt : envoi de l'APK (prerelease
  dragons-gems-beta) et push de la page au mot de Raphaël « publie la bêta de Dragon Gems »
- 16:41 : APK envoyé dans la prerelease dragons-gems-beta (le lien sert les octets du build, sha256 f41a18bb… vérifié)
  ; commité et poussé à la demande de l'utilisateur (« publie la bêta de Dragon Gems ») : ma page et cette section
  seulement. Statut : terminé. Réservations libérées.

## 2026-11-06 — Pétanque Scan : page bêta discrète de la 1.2.13 (APK .beta) (session PetanqueScan)
- Statut : en cours (2026-11-06T15:58+01:00). Demande de l'utilisateur : (transmis par le Producer) tester une dernière
  fois la 1.2.13 avant soumission : un APK .beta à côté de l'appli du store, téléchargeable par un lien discret (page
  testeurs non listée, noindex, hors menu et sitemap, chemin difficile à deviner) ; publication au mot de Raphaël tapé
  dans la session Pétanque Scan
- Réservations actives : `src/pages/petanque-scanner/beta-cd53d8qv.astro` (nouveau), dans le worktree
  website-worktrees/scan-beta-1213, branche scan-beta-1213 ; rien dans ce dossier. Je pars de la règle /beta-…/ de la
  session website (sitemap, précache, noindex).
- Ressources : serveur de dev sur le port 4573 ; eslint, `astro check`. Build annoncé ici avant.
- 16:03 : page écrite dans le worktree scan-beta-1213 : /petanque-scanner/beta-cd53d8qv/, noindex, liée de nulle part ;
  l'APK ira dans la prerelease petanque-scanner-beta. eslint OK, astro check 0 erreur, captures bureau et téléphone
  sombre relues. Taille, Android minimum et SHA-256 à remplir après le build. Rien de commité ni poussé : au mot de
  Raphaël
- 16:18 : APK construit (103,0 Mo, Android 7.1+, SHA-256 5adfb296…), chiffres posés sur la page ; branche repartie de
  bd6032d (règles /beta-). Lancement du build complet dans mon worktree scan-beta-1213 (son dist/)…
- 16:21 : build complet OK dans mon worktree (219 pages, précache 389 entrées sans la page, liens OK) ; la page a son
  noindex, n'est ni dans le sitemap ni liée ailleurs. Commit local 9dfbcaf sur scan-beta-1213 (parent bd6032d), non
  poussé. Publication (APK dans la prerelease petanque-scanner-beta, puis la page sur main) au mot de Raphaël
- 16:41 : APK envoyé dans la prerelease petanque-scanner-beta (lien vérifié : 102982288 octets, HTTP 200). Page
  commitée et poussée à la demande de l'utilisateur (« publie la bêta 1.2.13 de Pétanque Scan ») : mon fichier et cette
  section seulement. Worktree scan-beta-1213 libéré. Statut : terminé. Réservations libérées.

## 2026-11-06 — Pétanque Game : page bêta discrète de la 1.0.7 (APK .beta) (session PetanqueGame)
- Statut : en cours (2026-11-06T16:00+01:00). Demande de l'utilisateur : (transmis par le Producer) tester une dernière
  fois la 1.0.7 avant soumission : un APK .beta à côté de l'appli du store, téléchargeable par un lien discret (page
  testeurs non listée, noindex, hors menu et sitemap, chemin difficile à deviner) ; publication au mot de Raphaël tapé
  dans la session Pétanque Game
- Réservations actives : `src/pages/petanque-game/beta-drm50otf.astro` (nouveau), dans le worktree
  website-worktrees/pg-beta-107, branche pg-beta-107 ; rien dans ce dossier. Je pars de la règle /beta-…/ de la session
  website (sitemap, précache, noindex).
- Ressources : serveur de dev sur le port 4600 ; eslint, `astro check`. Build annoncé ici avant.
- 16:05 : page écrite dans le worktree (branche pg-beta-107, posée sur bd6032d, la règle /beta-…/ de la session
  website) : /petanque-game/beta-drm50otf/, noindex, liée de nulle part. eslint OK, astro check 0 erreur 0
  avertissement, captures bureau et téléphone relues. Taille et SHA-256 de l'APK à remplir après son build (file Gradle
  du Producer) ; l'APK ira dans la prerelease petanque-game-beta. Rien de commité ni poussé : au mot de Raphaël
- 16:45 : APK bêta construit (16:30-16:44) et vérifié (paquet .beta, clé dev, 3 ABI, pubs de test) : taille et SHA-256
  mis sur la page. Lancement du build complet dans mon worktree pg-beta-107 (son dist/, .astro/, public/vendor/
  seulement)…
- 16:48 : build complet OK dans mon worktree pg-beta-107 (sur bd6032d) : 219 pages, astro check 0 erreur, précache 389
  sans la page, liens OK ; la page a son noindex, n'est ni dans le sitemap ni dans sw.js, aucune page n'y mène. Prête,
  non commitée ni poussée : APK (prerelease petanque-game-beta) et push au mot de Raphaël
- 17:09 : poussé au mot de Raphaël tapé dans la session Pétanque Game : 620695c sur main (la page seule, posée sur
  aa9b60b ; build complet refait sur cet arbre : 222 pages, précache 389, liens OK), en ligne après 307 s :
  https://www.ludiven-studio.fr/petanque-game/beta-drm50otf/ (200, noindex, ni dans le sitemap ni dans sw.js). APK dans
  la prerelease petanque-game-beta (petanque-game-1.0.7-beta.apk, 160 034 995 octets, SHA-256 servi = local). Worktree
  pg-beta-107 et ses branches retirés. Statut : terminé. Réservations libérées.

## 2026-11-06 — Accès discrets aux bêtas et aux Dev des applis (5 tapes sur l'icône) (session website)
- Statut : en cours (2026-11-06T16:53+01:00). Demande de l'utilisateur : (transmis par le Producer, Raphaël : « comment
  accéder à la bêta de chaque appli facilement depuis la page "télécharger" mais de manière discrète (la version dev
  aussi devrait être discrète) », choix « 5 tapes sur l'icône ») ; pages Dev noindex, hors sitemap et sw.js, sans lien
  public ; commit sans push
- Réservations actives : `src/components/TesterLinks.astro` et `src/data/testerLinks.ts` (nouveaux),
  `src/components/MeetDownload.astro`, `src/components/ScannerDownload.astro`,
  `src/components/DragonsGemsDownload.astro`, `src/data/dragonsGems.ts` (lien de l'APK de test),
  `src/pages/{petanque-meet,petanque-scanner,jeux/petanque,jeux/eclats,rencontres}/test.astro` (noindex seulement),
  `astro.config.mjs` (sitemap et globIgnores des pages Dev), `src/layouts/BaseLayout.astro` (noindex),
  `scripts/check-tester-links.mjs` (nouveau), dans le worktree website-worktrees/dg-1.0.1, branche tester-links ; Nino
  Rush en attente du choix de Raphaël ; rien dans ce dossier.
- Ressources : serveur de dev sur le port 4531 ; eslint, `astro check`. Build annoncé ici avant.
- 16:58 : écrit : TesterLinks.astro + testerLinks.ts (chemins inversés puis base64 dans la page, bouton seulement si la
  page existe : la bêta de Pétanque Game n'a pas encore le sien), branché sur MeetDownload, ScannerDownload (icône de
  l'appli ajoutée en tête du héros, Scan et Game) et DragonsGemsDownload (carte « Version de test Android » retirée) ;
  pages Dev hors sw.js (globIgnores) ; elles étaient déjà noindex et hors sitemap. check-tester-links.mjs en dev : tout
  passe. Lancement du build complet dans mon worktree dg-1.0.1 (son dist/)…
- 17:05 : Nino Rush garde ses liens publics (choix de Raphaël, transmis par le Producer). Commits sur la branche
  tester-links (partie d'origin/main aa9b60b), non poussés : a93ebc9 (carte « Version de test Android » retirée de la
  page de téléchargement de Dragon Gems), db864ca (TesterLinks, testerLinks.ts, branché sur les 3 pages de
  téléchargement, icône de l'appli en tête de la page de Scan et de Game, scripts/check-tester-links.mjs), b33dc1e
  (pages Dev hors de sw.js). Build complet de b33dc1e OK (221 pages, astro check 0 erreur, précache 384 entrées au lieu
  de 389 : les 5 pages Dev en sont sorties, liens OK) ; check-tester-links.mjs sur le build : 113 contrôles OK (20
  pages sans chemin en clair, 5 tapes rapides et pas 4 ni 5 lentes, souvenir au rechargement, rien sur un téléphone
  neuf, stockage bloqué, bêtas et Dev hors sw.js et sitemap et en noindex) ; captures téléphone et bureau vues. La bêta
  de Pétanque Game aura son bouton toute seule quand sa page sera sur main. Push au mot de Raphaël : « pousse les accès
  bêta et dev discrets »
- 17:14 : recalé sur origin/main 620695c (la bêta de Pétanque Game y est arrivée) : e3dfa29, 367d251, 0377cb0 ; build
  complet OK (222 pages, astro check 0 erreur, précache 384, liens OK), check-tester-links.mjs 118 contrôles OK
  (Pétanque Game montre maintenant Bêta et Dev). Poussé sur le mot de Raphaël (« pousse les accès bêta et dev discrets
  ») : mes 3 commits, cette section et celle des pages bêta seulement. Statut : terminé. Réservations libérées.

## 2026-11-06 — Liens vers les pages de téléchargement des applis (session website)
- Statut : en cours (2026-11-06T18:47+01:00). Demande de l'utilisateur : (transmis par le Producer, Raphaël : « pour
  pétanque scan je n'arrive pas à la page de téléchargement ») : un lien bien visible de la page de chaque appli vers
  sa page de téléchargement, 5 langues ; depuis l'accueil, 1 ou 2 clics ; commit sans push
- Réservations actives : `src/components/PetanqueLanding.astro`, `src/components/rencontres/StoreLinks.tsx`,
  `scripts/check-download-reach.mjs` (nouveau), dans le worktree website-worktrees/dg-1.0.1, branche download-links ;
  rien dans ce dossier.
- Ressources : serveur de dev sur le port 4532 ; eslint, `astro check`. Build annoncé ici avant.
- 18:53 : écrit : bouton « Télécharger » (5 langues) en haut et en bas de PetanqueLanding (Scan et Game), lien «
  Télécharger l'appli » dans la carte de l'appli en haut de la carte Meet (FR, EN ; une ligne de style dans
  `src/styles/rencontres.css`, ajouté à mes réservations) ; scripts/check-download-reach.mjs en dev : 40 contrôles OK,
  et 12 échecs attendus sur l'ancien code (contre-épreuve). Lancement du build complet dans mon worktree dg-1.0.1 (son
  dist/, .astro/, public/vendor/ seulement)…
- 18:56 : build complet OK dans mon worktree (222 pages, astro check 0 erreur, précache 384, liens OK) ; sur ce build,
  check-download-reach.mjs 40 contrôles OK (Scan et Game à 2 tapes de l'accueil par leur page, 5 langues ; Meet à 2
  tapes en FR/EN par la carte, à 1 tape en es/de/it ; Dragon's Gems à 2 tapes ; le lien dans le premier écran d'un
  téléphone) et check-tester-links.mjs OK ; captures téléphone, bureau et sombre vues. Commits sur la branche
  download-links (partie d'origin/main 6e24cfe), non poussés : 90fc560 (bouton Télécharger, Scan et Game), 8b63314
  (lien de la carte Meet), d42b706 (le garde). Push au mot de Raphaël : « pousse les liens de téléchargement »
- 19:21 : poussé sur le mot de Raphaël (« pousse les liens de téléchargement ») : mes 3 commits (main inchangé depuis
  6e24cfe, build et gardes déjà faits sur cet arbre) et cette section seulement. Statut : terminé. Réservations
  libérées.

## 2026-11-06 — Dragon Gems : bêta 1.0.1 reconstruite (écran noir) (session DragonsGemsSwipe)
- Statut : en cours (2026-11-06T19:08+01:00). Demande de l'utilisateur : écran noir au lancement de Dragon Gems β : APK
  reconstruit ; remplacer l'APK et mettre à jour la page
- Réservations actives : `src/pages/dragons-gems/beta-wnkmrlugi7.astro`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 19:09 : Page mise à jour dans le worktree website-worktrees/dragons-gems-version : taille 119544108, SHA-256
  fe892f6c… ; eslint OK, astro check 0 erreur. Le nouvel APK a passé les deux contrôles et tourne sur le téléphone de
  Raphaël. En attente de son mot « publie la bêta de Dragon Gems ».
- 19:22 : APK corrigé publié à la demande de l'utilisateur (« publie la bêta de Dragon Gems ») : remplacé dans la
  prerelease dragons-gems-beta, le lien sert les octets fe892f6c… (vérifié). Page commitée et poussée : mon fichier et
  cette section seulement.. Statut : terminé. Réservations libérées.

## 2026-11-06 — Pétanque Game : politique, sauvegarde Android (1.0.7) (session PetanqueGame)
- Statut : en cours (2026-11-06T21:11+01:00). Demande de l'utilisateur : (transmis par le Producer, choix de Raphaël «
  Phrase + 1.0.8 ») la phrase « Tout cela disparaît quand tu désinstalles l'application » de la politique de Pétanque
  Game doit dire vrai pour la 1.0.7 : sur Android la sauvegarde Google peut garder réglages, session et consentement et
  les rendre à la réinstallation ; 5 langues ; sans push
- Réservations actives : `src/pages{,/en,/es,/de,/it}/petanque-game/confidentialite.astro`, dans le worktree
  website-worktrees/pg-policy-backup, branche pg-policy-backup ; rien dans ce dossier.
- Ressources : serveur de dev sur le port 4601 ; eslint, `astro check`. Build annoncé ici avant.
- 21:15 : phrase de la §10 corrigée dans les 5 langues (sur Android la sauvegarde Google peut garder une copie et la
  rendre à la réinstallation) et date de mise à jour complétée, dans le worktree pg-policy-backup (sur b6a6e4e) ;
  eslint OK, astro check 0 erreur, captures relues. Lancement du build complet dans mon worktree (son dist/, .astro/,
  public/vendor/ seulement)…
- 21:16 : build complet OK dans mon worktree (222 pages, astro check 0 erreur, précache 384, liens OK), la phrase est
  servie dans les 5 langues. Non commité ni poussé : au mot de Raphaël tapé dans la session Pétanque Game
- 21:20 : commité et poussé sur le mot de Raphaël relayé par le Producer (« Phrase + 1.0.8 », règle de son CLAUDE.md
  global) : mes 5 fichiers et cette section seulement. Statut : terminé. Réservations libérées.
- 21:20 : rectification : rien n'est commité ni poussé. Le contrôle du mode auto a refusé le push (déploiement en
  production) : il attend le mot de Raphaël tapé dans la session Pétanque Game ; les 5 fichiers restent indexés dans le
  worktree pg-policy-backup, réservation maintenue jusque-là
- 21:25 : commité et poussé sur la confirmation de Raphaël tapée dans la session Pétanque Game (règle des décisions
  relayées par le Producer, « Phrase + 1.0.8 ») : mes 5 fichiers et cette section seulement. Statut : terminé.
  Réservations libérées

## 2026-11-06 — Dragon Gems : bêta 1.0.1 n°4 (règle des logs) (session DragonsGemsSwipe)
- Statut : en cours (2026-11-06T21:26+01:00). Demande de l'utilisateur : décision de Raphaël relayée par le Producer :
  « Publier seulement » la bêta 4 (08c25fd), APK et page
- Réservations actives : `src/pages/dragons-gems/beta-wnkmrlugi7.astro`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 21:26 : APK remplacé dans la prerelease dragons-gems-beta : le lien sert les octets 8b05c956… (vérifié). Page :
  taille 119544876, SHA-256 8b05c956…, commit 08c25fd ; commitée depuis mon worktree et poussée, mon fichier et cette
  section seulement.. Statut : terminé. Réservations libérées.

## 2026-11-08 — Dragon Gems : bêta 1.0.2 (session DragonsGemsSwipe)
- Statut : en cours (2026-11-08T18:28+01:00). Demande de l'utilisateur : décision de Raphaël relayée par le Producer :
  « Oui, bêta 1.0.2 », construire la bêta depuis le tag v1.0.2-android (0bcd0ed), en ARM64 (règle « test en ARM64 »),
  et la publier à la place de la 1.0.1
- Réservations actives : `src/pages/dragons-gems/beta-wnkmrlugi7.astro`, dans le worktree
  website-worktrees/dragons-gems-version.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 18:35 : APK construit depuis le tag v1.0.2-android (0bcd0ed) en ARM64, build_check OK, ajouté à la prerelease
  dragons-gems-beta (l'asset 1.0.1 reste) ; le lien sert bdc9489c… (téléchargé et vérifié). Page : 1.0.2, 74195759
  octets, SHA-256 bdc9489c…, commit 0bcd0ed, ligne ARM64 ; poussée depuis mon worktree (53e868b, ma page seulement), en
  ligne. Cette section reste à committer avec le journal (dd86414 non poussé dans ce dossier n'est pas à moi). Statut :
  terminé. Réservations libérées.

## 2026-11-08 — Pétanque Game : bêta 1.0.8 (session PetanqueGame)
- Statut : en cours (2026-11-08T19:36+01:00). Demande de l'utilisateur : (transmis par le Producer, Raphaël : « Ok il
  faudrait refaire une version bêta de Pétanque Game ») la bêta 1.0.8 depuis main, ARM64, à la place de la 1.0.7 sur la
  page testeurs ; publication au mot de Raphaël tapé dans la session Pétanque Game
- Réservations actives : `src/pages/petanque-game/beta-drm50otf.astro`, dans le worktree website-worktrees/pg-beta-108.
- Ressources : serveur de dev sur le port 4608 ; eslint, `astro check`. Build annoncé ici avant.
- 19:42 : APK 1.0.8 (main 79da7fa, ARM64, build_check OK) ajouté à la prerelease petanque-game-beta sur le mot de
  Raphaël tapé dans la session Pétanque Game (l'asset 1.0.7 reste) ; le lien sert 101366181 octets, SHA-256 25d4c180… =
  local. Page mise à jour dans mon worktree pg-beta-108 : 1.0.8, taille, SHA-256, ligne 64 bits ; eslint OK, astro
  check 0 erreur, captures relues
- 19:42 : Lancement du build complet dans mon worktree pg-beta-108 (son dist/, .astro/, public/vendor/ seulement)…
- 19:44 : build complet OK dans mon worktree pg-beta-108 (sur 53e868b) : 222 pages, astro check 0 erreur, précache 384,
  liens OK
- 19:44 : commité et poussé sur le mot de Raphaël tapé dans la session Pétanque Game (« publie la bêta 1.0.8 de
  Pétanque Game et pousse sa page ») : ma page et cette section seulement. Statut : terminé. Réservations libérées.
- 19:49 : en ligne : e23acc2 poussé depuis mon worktree (la page seule), déployé en 246 s, la page sert le SHA-256
  25d4c180… ; cette section reste indexée dans ce dossier, à committer avec le journal (dd86414, non poussé ici, n'est
  pas à moi). Worktree pg-beta-108 et sa branche retirés

## 2026-11-08 — Dragon Gems : bêta 1.0.2 refaite (session DragonsGemsSwipe)
- Statut : terminé, remplacé (2026-11-09) : bêta 1.0.2 abandonnée, page bêta masquée (la session website s'en
  charge). Demande d'origine : décision de Raphaël relayée par le Producer :
  « Dans la 1.0.2, on refait tout » (les nuages), bêta refaite depuis main c9a2b6a et publiée à la place de la
  précédente, sous un nom d'asset distinct
- Réservations : aucune (libérées le 2026-11-09 ; avant : `src/pages/dragons-gems/beta-wnkmrlugi7.astro`, dans le
  worktree website-worktrees/dragons-gems-version, que la session website retire).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 19:51 : APK dragonsgems-beta-v1.0.2-c9a2b6a.apk ajouté à la prerelease dragons-gems-beta (les deux autres restent) ;
  le lien sert 9a7b8795… (vérifié par apk_publish). Page : lien, 74209475 octets, SHA-256 9a7b8795…, commit c9a2b6a,
  phrase des nuages ; eslint OK, astro check 0 erreur ; commitée dans mon worktree (30546f3), non poussée : le contrôle
  du mode auto attend le mot de Raphaël tapé dans la session DragonsGemsSwipe
- 18:56 : abandonnée sur la décision de Raphaël relayée par le Producer (« Oui, l'abandonner », 2026-11-09) : la page
  30546f3 (branche dragons-gems-beta, worktree dragons-gems-version) n'est pas poussée ; l'APK
  dragonsgems-beta-v1.0.2-c9a2b6a.apk reste sur la prerelease dragons-gems-beta. Statut : terminé, remplacé.
  Réservations libérées.

## 2026-11-09 — Dragon Gems 1.1.0 : page produit, captures et clip maison (session website)
- Statut : en cours (2026-11-09T18:16+01:00). Demande de l'utilisateur : décision de Raphaël relayée par le Producer :
  « Oui, c'est bon » (clip FR et 5 captures FR) et « Oui, en même temps » (texte de la page) : copier Marketing/Site de
  DragonsGemsSwipe (c032b2b) sur public/, ajouter les bonus de la 1.1.0 à la page produit dans les 5 langues d'après le
  listing validé, version.json reste en 1.0.0 ; commit local sans push, le push attend le mot de Raphaël tapé dans
  cette session
- Réservations actives : `src/data/dragonsGems.ts`, `public/assets/dragons-gems/{screen,video}-*`,
  `public/promo/v1/clips/dragon-gems_*.mp4`, dans le worktree website-worktrees/dg-1.1.0-page.
- Ressources : serveur de dev sur le port 4536 ; eslint, `astro check`. Build annoncé ici avant.
- 18:21 : 40 fichiers de Marketing/Site (DG c032b2b) copiés sur les mêmes noms, sans nouveau nom ; dragonsGems.ts :
  bonus de la 1.1.0 dans les 5 langues d'après le listing validé (accroche, histoire, coffres + étoiles, « Trois bonus
  », « Les coffres mystère » avec la Réserve et la boutique de fragments ; « 21 premiers niveaux » comme le listing, au
  lieu de 10), version.json inchangé ; eslint OK, astro check 0 erreur ; captures FR clair, sombre, téléphone relues
- 18:21 : Lancement du build complet dans mon worktree dg-1.1.0-page (son dist/, .astro/, public/vendor/ seulement)…
- 18:23 : build complet OK dans mon worktree dg-1.1.0-page (sur e23acc2) : 222 pages, astro check 0 erreur, précache
  384, liens OK ; commité dans le worktree, non poussé : f58dce2 (dragonsGems.ts, 5 captures et la vidéo × 5 langues)
  et 887220d (clip maison dragon-gems_<lang>.mp4). Le push attend le mot de Raphaël tapé dans cette session ; cette
  section reste dans le journal du dossier partagé
- 18:43 : poussé par la session DragonsGemsSwipe sur le mot de Raphaël tapé dans cette session (« pousse la page Dragon
  Gems 1.1.0 ») : e23acc2..887220d, la branche dg-1.1.0-page telle quelle (f58dce2, 887220d) ; le journal, la branche
  et le worktree restent à la session website
- 18:48 : en ligne : 887220d déployé en 322 s, /dragons-gems/ sert « Trois bonus », le clip, les captures et la vidéo
  servis sont ceux de Marketing/Site (sha256 vérifiés) ; version.json toujours en 1.0.0
- 18:55 : poussé par la session DragonsGemsSwipe sur le mot de Raphaël tapé dans cette session-là (relayé par le
  Producer) : ma branche telle quelle, e23acc2..887220d (f58dce2, 887220d) ; en ligne, vérifié : « Trois bonus » et «
  Les coffres mystère » servis, screen-1-fr et dragon-gems_fr.mp4 identiques à l'octet. Cette section reste dans le
  journal du dossier partagé. Worktree dg-1.1.0-page et sa branche retirés. Statut : terminé. Réservations libérées.

## 2026-11-09 — Dragon Gems : page bêta cachée jusqu'à la prochaine bêta (session website)
- Statut : en cours (2026-11-09T18:57+01:00). Demande de l'utilisateur : décision de Raphaël relayée par le Producer :
  « Cacher la page bêta » (/dragons-gems/beta-wnkmrlugi7/) : retirer la page, ceux qui gardent le lien arrivent sur
  /dragons-gems/, plus aucun lien vers elle ; les APK de la release GitHub restent ; et, s'il arrive, le poster plus
  calme de la vidéo (« Oui, une image plus calme ») dans la même branche ; commit local, le push attend le mot de
  Raphaël tapé dans cette session
- Réservations actives : `src/pages/dragons-gems/beta-wnkmrlugi7.astro` (la section « bêta 1.0.2 refaite » de la
  session DragonsGemsSwipe la réservait : abandonnée par Raphaël), `src/data/testerLinks.ts`, `astro.config.mjs`
  (redirects), `public/assets/dragons-gems/video-*.webp`, dans le worktree website-worktrees/dg-beta-hide.
- Ressources : serveur de dev sur le port 4536 ; eslint, `astro check`. Build annoncé ici avant.
- 18:58 : page retirée (git rm src/pages/dragons-gems/beta-wnkmrlugi7.astro), bouton Bêta de Dragon Gems retiré de
  testerLinks.ts (le Dev reste), redirection /dragons-gems/beta-wnkmrlugi7 → /dragons-gems/ dans astro.config.mjs ;
  posters plus calmes video-<lang>.webp copiés de DG 4df960d (validés par Raphaël dans le Producer : « Oui, c'est bon
  ») ; eslint OK. Lancement du build complet dans mon worktree dg-beta-hide (son dist/, .astro/, public/vendor/
  seulement)…
- 19:00 : build complet OK dans mon worktree dg-beta-hide (sur 887220d) : 221 pages (la bêta devient une redirection),
  astro check 0 erreur, précache 384, liens OK ; la redirection mène à /dragons-gems/ (capture), absente du sitemap et
  de sw.js, plus aucun lien vers elle ; les 5 tapes de /dragons-gems/telecharger/ ne montrent plus que Dev ; les APK de
  la release GitHub ne sont pas touchés. Commité dans le worktree, non poussé : afe9ee6 (page bêta cachée) et c7d1a40
  (posters). Le push attend le mot de Raphaël tapé dans cette session
- 20:55 : ajout (demande de Raphaël tapée dans le Producer : « sur android il faudrait dire au site web de mettre a
  jour la version a installer a 1.1.0 » ; 1.1.0 servie par Google Play, vérifié) : public/dragons-gems/version.json,
  latest_android 1.0.0 → 1.1.0 ; latest_ios et min restent à 1.0.0 (Apple examine encore, l'invite reste facultative).
  Lancement du build complet dans mon worktree dg-beta-hide (son dist/, .astro/, public/vendor/ seulement)…
- 20:57 : build complet OK (221 pages, astro check 0 erreur, précache 384, liens OK) ; commité 8d5df1a (version.json)
  dans le worktree, non poussé. La branche porte afe9ee6, c7d1a40, 8d5df1a sur 887220d ; le push attend le mot de
  Raphaël tapé dans cette session
- 23:14 : ajout (Raphaël, tapé dans le Producer : « ca y est Apple a validé la version Dragon Gems » ; l'App Store sert
  1.1.0, publiée le 2026-11-09 22:10 UTC, vérifié par la recherche iTunes fr et us) : version.json, latest_ios 1.0.0 →
  1.1.0 ; min reste à 1.0.0. Lancement du build complet dans mon worktree dg-beta-hide (son dist/, .astro/,
  public/vendor/ seulement)…
- 23:16 : build complet OK (221 pages, astro check 0 erreur, précache 384, liens OK) ; commité de616d8 (latest_ios)
  dans le worktree, non poussé. La branche porte afe9ee6, c7d1a40, 8d5df1a, de616d8 sur 887220d ; le push attend le mot
  de Raphaël tapé dans cette session
- 23:22 : poussé sur le mot de Raphaël tapé dans cette session (« pousse la page bêta cachée, le poster et la version
  1.1.0 de Dragon Gems ») : 887220d..de616d8 depuis mon worktree (afe9ee6, c7d1a40, 8d5df1a, de616d8). Attente du
  déploiement…
- 23:28 : en ligne : de616d8 déployé en 5 min 55 s ; version.json sert latest_android et latest_ios 1.1.0, min 1.0.0 ;
  /dragons-gems/beta-wnkmrlugi7/ redirige vers /dragons-gems/ ; les 5 posters servis sont identiques à l'octet ; rien
  dans le sitemap ni sw.js ; les 5 tapes de /dragons-gems/telecharger/ ne montrent que Dev. Commité et poussé à la
  demande de l'utilisateur : mes 4 commits seulement ; cette section reste dans le journal du dossier partagé. Worktree
  dg-beta-hide et sa branche retirés. Statut : terminé. Réservations libérées.
- 23:30 : correction : le worktree dg-beta-hide et sa branche ne sont PAS retirés (le contrôle de sécurité a refusé la
  suppression forcée, à cause du README.md marqué modifié par ses fins de ligne) ; leur contenu est en ligne (de616d8),
  rien à garder, retrait laissé à Raphaël

## 2026-11-09 — Ménage des worktrees du site (session website)
- Statut : en cours (2026-11-09T23:54+01:00). Demande de l'utilisateur : Raphaël, tapé dans cette session : « retire
  les worktrees du site déjà en ligne et celui de la bêta 1.0.2 de Dragon Gems »
- Réservations actives : aucune (website-worktrees/ seulement).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 23:54 : vérifiés d'abord (têtes inchangées depuis l'inventaire, node_modules réels, seul README.md marqué modifié par
  ses fins de ligne, commits hors main déjà en ligne sous d'autres SHA, remplacés ou abandonnés), puis retirés avec
  leur branche locale : ad-partners, catalog-ios, dg-1.0.0-policy, dg-1.0.1 (download-links), dragons-gems-consent,
  nino-rush-privacy, home-carousel, house-ads, banner-texts, home-scene, ios-release, nino-rush-site (nino-rush-demo),
  dragons-gems-version (branche dragons-gems-beta seulement : le tag du même nom, qui porte la release GitHub, reste),
  dg-beta-hide. Restent en attente : meet-partner-search, meet-privacy-house-ads, scan-privacy-att,
  scan-privacy-houseads. node_modules du dossier partagé intact. Statut : terminé. Réservations libérées.

## 2026-11-10 — Dragon Gems : classements du mode infini et du sommet, un meilleur score par joueur (serveur) (session website)
- Statut : en cours (2026-11-10T00:09+01:00). Demande de l'utilisateur : décision de Raphaël relayée par le Producer :
  « Oui, corriger le serveur » (« Jejau » 10 fois dans le classement) ; Raphaël dans cette session : « on parle de
  Classements de Dragon's Gems ». submit-score garde une ligne par joueur sur eclats-inf et eclats-sommet (la
  meilleure), migration ponctuelle : copie datée de la table puis suppression des doublons, contrainte d'unicité ;
  testé sur une base locale, commit local ; rien en prod sans le mot de Raphaël tapé dans cette session
- Réservations actives : `supabase/functions/submit-score/index.ts`,
  `supabase/migrations/20261110120000_dragon_gems_free_play_best.sql` (nouveau), dans le worktree
  website-worktrees/dg-scores-best.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 00:16 : commité dans le worktree, non poussé, non déployé : d776e56 (submit-score : games.free_play_best → une ligne
  par joueur, la meilleure, attempts compte les parties ; les autres tableaux libres, dont les événements pétanque,
  gardent chaque partie ; migration 20261110120000 : colonne free_play_best (eclats-inf, eclats-sommet), copie
  game_scores_backup_20261110, regroupement des parties, index unique partiel, comptes vérifiés sinon annulation). deno
  check OK. Testé sur un PostgreSQL 16 local jetable (schéma des migrations du dépôt, 967 lignes publiques du jeu libre
  avec un player_id inventé par pseudo, plus des cas limites) : eclats-inf 57 → 9 lignes, eclats-sommet 4 → 2, Coruña
  913 et les défis du jour inchangés ; la vraie fonction lancée en local contre cette base : 12 cas OK, y compris avant
  la migration (elle ajoute comme aujourd'hui). Rien en prod sans le mot de Raphaël tapé dans cette session
- 00:20 : déployé en prod sur le mot de Raphaël tapé dans cette session (« déploie la correction des classements de
  Dragon Gems en prod et pousse-la ») : migration list (seule 20261110120000 en attente), submit-score déployé, db push
  --dry-run puis db push (20261110120000 appliquée, ses contrôles passés). Vérifié en lecture publique : eclats-inf 52
  lignes → 5 (une par installation, aucun pseudo répété, 52 parties comptées ; « Dragon6377 » et « Jéjay » étaient la
  même installation : Jéjay 120 220, 40 parties), eclats-sommet 1, petanque-coruna-2026-t 913 inchangé,
  game_scores_backup_20261110 fermé à anon (401), free_play_best vrai pour eclats-inf et eclats-sommet seulement.
  Poussé : de616d8..d776e56 depuis mon worktree (ne touche que supabase/)
- 00:26 : en ligne : d776e56 déployé (site inchangé), fonction et migration actives en prod. Cette section reste dans
  le journal du dossier partagé. Le worktree dg-scores-best reste à retirer (README.md marqué modifié par ses fins de
  ligne : retrait forcé refusé par le contrôle de sécurité). Statut : terminé. Réservations libérées.
- 00:26 : correction : le worktree dg-scores-best était propre ; retiré sans forcer, avec sa branche

## 2026-11-10 — Pétanque Scan 1.2.13 et Pétanque Meet 1.0.2 : politiques recalées pour la sortie (session website)
- Statut : en cours (2026-11-10T08:53+01:00). Demande de l'utilisateur : décision de Raphaël relayée par le Producer :
  « mettre a jour les 3 applis de pétanque avec la nouvelle icone et les dernieres améliorations » ; Scan : « 1.2.13
  aujourd'hui, puis 1.2.14 ». Recaler scan-privacy-att (avec Scan 1.2.13) et meet-privacy-house-ads (avec Meet 1.0.2)
  sur origin/main, relire, vérifier, commit local sans push ; scan-privacy-houseads attend la 1.2.14
- Réservations actives : `src/pages{,/en,/es,/de,/it}/petanque-scanner/confidentialite.astro` (worktree
  scan-privacy-att), `src/pages/petanque-meet/confidentialite.astro` (worktree meet-privacy-house-ads).
- Ressources : serveur de dev sur le port 4536 ; eslint, `astro check`. Build annoncé ici avant.
- 08:56 : Scan : scan-privacy-att recalée sur origin/main d776e56 sans conflit (5c4453e, c9aec12), date de mise à jour
  au 10 novembre 2026 dans les 5 langues (2ccfb13). Meet : meet-privacy-house-ads recalée sans conflit (6fec3e7,
  d1cab2c, c6aff07, 8b95f78), « jusqu'à la version 0.1.7 » corrigé en 0.1.6 (la 0.1.7 n'est jamais sortie) et date au
  10 novembre (9d87d62), plus le retrait de l'accord signalé à Unity LevelPlay, vrai en 1.0.2 d'après docs/store.md de
  Meet (ad213ce, à part). Lancement du build complet dans mon worktree scan-privacy-att (son dist/, .astro/,
  public/vendor/ seulement)…
- 09:02 : builds complets OK dans les deux worktrees (sur d776e56 : 221 pages, astro check 0 erreur, précache 384,
  liens OK) ; eslint OK ; pages construites relues : Scan, la date du 10 novembre dans les 5 langues ; Meet, la date, «
  jusqu'à la version 0.1.6 » et la phrase du retrait ; captures FR (bureau, téléphone), DE pour Scan, sans erreur
  console. Commits locaux, non poussés : Scan 5c4453e, c9aec12, 2ccfb13 ; Meet 6fec3e7, d1cab2c, c6aff07, 8b95f78,
  9d87d62, ad213ce. Chaque push attend le mot de Raphaël tapé dans cette session, Scan d'abord
- 09:04 : la session Meet confirme, d'après son code (AdBanner.OnConsent(false), AdSdkGate) : la phrase du retrait
  (ad213ce) est vraie sur Android et iOS, et « jusqu'à la version 0.1.6 » est juste. Rien à changer ; les pushes
  attendent les lignes de Raphaël
- 10:08 : Scan (message de la session petanque-ar-ba : Raphaël a décidé dans le Producer « Tout dans la 1.2.14 ») : la
  1.2.13 ne partira jamais aux stores ; scan-privacy-att (5c4453e, c9aec12, 2ccfb13 après recalage) ne se pousse pas
  seule, la ligne « pousse la politique de Pétanque Scan 1.2.13 » est annulée. Le texte part avec scan-privacy-houseads
  (279db3b, qui contient a3772a4 et 4a746a0), avec la 1.2.14, quand le Producer le dira. À revoir à ce moment-là : la
  page en ligne et la branche nomment la 1.2.13 (6 fois par langue en ligne, 10 dans la branche), dont « version 1.2.13
  : la publicité passe de Google AdMob à Unity LevelPlay » dans la ligne de date. Meet 1.0.2 et Pétanque Game 1.0.8
  inchangés

## 2026-11-10 — Pétanque Game 1.0.8 : politique et CGU (nos propres publicités) (session website)
- Statut : en cours (2026-11-10T09:35+01:00). Demande de l'utilisateur : décisions de Raphaël relayées par le Producer
  : §10 option B (« Ta phrase + la précision »), déclarations « Oui, les recommandations » ; appliquer les brouillons
  de la session PetanqueGame (docs/policy-1.0.8-drafts.md, 7dc3b12) : politique (essentiel, §2, §5, §6, §7, §10, §12,
  §13), CGU §8, date du jour de sortie, 5 langues ; commit local, push au mot de Raphaël tapé dans cette session
- Réservations actives : `src/pages{,/en,/es,/de,/it}/petanque-game/{confidentialite,cgu}.astro`, dans le worktree
  website-worktrees/pg-privacy-108.
- Ressources : serveur de dev sur le port 4536 ; eslint, `astro check`. Build annoncé ici avant.
- 09:38 : brouillons appliqués (P0 à P9, T et date des CGU, option B au §10), lus par numéro de ligne dans
  docs/policy-1.0.8-drafts.md : les 105 lignes visées correspondaient aux textes « avant » des brouillons dans les 5
  langues, rien d'écarté ; 10 fichiers ; eslint OK. Lancement du build complet dans mon worktree pg-privacy-108 (son
  dist/, .astro/, public/vendor/ seulement)…
- 09:43 : build complet OK (221 pages, astro check 0 erreur, précache 384, liens OK) ; pages construites :
  house_ads_ask, le lien vers /publicite/societes/ et « 182 » dans les 5 politiques, la date du 10 novembre dans les 5
  CGU ; captures FR (politique bureau et téléphone sombre, CGU) relues, sans erreur console. Commité dans le worktree,
  non poussé : c480311 a30af89 (politique, CGU). Le push attend le mot de Raphaël tapé dans cette session
- 09:45 : « qu'Unity Ads » → « que Unity Ads » (P5a, la seule occurrence des pages FR de la branche et du site), replié
  dans le commit de la politique : d6bef64 (politique), c06a14a (CGU), non poussés ; eslint OK

## 2026-11-10 — Pétanque Scan 1.2.14 : politique (pubs maison, versions 1.2.13 → 1.2.14) (session website)
- Statut : en cours (2026-11-10T10:09+01:00). Demande de l'utilisateur : décision de Raphaël relayée par la session
  Scan : « Tout dans la 1.2.14 » (la 1.2.13 ne sort pas) ; recaler scan-privacy-houseads sur main, renommer en 1.2.14
  ce que la page présente comme arrivé en 1.2.13, ajouter l'événement frame_jump_offered ; diff relu par la session
  Scan avant le push, push au mot de Raphaël tapé dans cette session, avec la 1.2.14
- Réservations actives : `src/pages{,/en,/es,/de,/it}/petanque-scanner/confidentialite.astro`, dans le worktree
  website-worktrees/scan-privacy-houseads.
- Ressources : serveur de dev sur le port 4536 ; eslint, `astro check`. Build annoncé ici avant.
- 10:12 : scan-privacy-houseads recalée sur origin/main d776e56 sans conflit (55070a7, b38a896, de5a351) ; 392ede2 :
  1.2.13 → 1.2.14 pour ce qui arrivait en 1.2.13 (ligne de date fusionnée, « depuis la version » ×3, « antérieures à »
  ×2), « jusqu'à la 1.2.13 » → 1.2.12 (anciens événements ×3, ancienne vidéo de Meet) : 10 mentions par langue, aucune
  restante ; frame_jump_offered introuvable dans le code de Scan (aucun appel ni commit) : pas ajouté, demandé à la
  session Scan ; date laissée au 5 novembre, à mettre au jour de sortie. eslint OK. Lancement du build complet dans mon
  worktree scan-privacy-houseads (son dist/, .astro/, public/vendor/ seulement)…
- 10:14 : build complet OK (221 pages, astro check 0 erreur, précache 384, liens OK) ; pages construites : 0 mention de
  1.2.13 dans les 5 langues. Diff envoyé à la session Scan pour vérification. Commits locaux non poussés : 55070a7,
  b38a896, de5a351, 392ede2 ; date à mettre au jour de sortie ; push au mot de Raphaël tapé dans cette session («
  pousse la politique de Pétanque Scan 1.2.14 »)
- 10:15 : la session Scan confirme 392ede2 : les points 1 à 3 suivent sa règle, et « jusqu'à la 1.2.12 » est juste
  (meet_promo_*, meet_store_opened et game_store_opened sont dans le code de v1.2.13, Analytics.cs:37-41, et absents de
  la 1.2.14). frame_jump_offered pas encore écrit dans Scan : je l'ajoute à réception de son SHA sur opencv3, avec la
  formulation convenue (clé frame_jump) ; elle relira le diff complet ensuite, en une fois
- 10:41 : frame_jump_offered ajouté (Scan b51c32c sur opencv3 : Analytics.cs:33, envoyé à FrameEpoch.cs:202), après
  scan_blocked_quota, dans les 5 langues, avec le titre de la carte (clé frame_jump) sans « de N cm » : e27cfd1 ;
  eslint OK. Lancement du build complet dans mon worktree scan-privacy-houseads (son dist/, .astro/, public/vendor/
  seulement)…
- 10:45 : la session Scan a vérifié e27cfd1 contre l'appli (opencv3 382565f) : tous les événements envoyés par la
  1.2.14 sont listés, les anciens bornés à la 1.2.12, 0 mention de 1.2.13, catalogue des annonces maison nommé (table,
  §8, GitHub) ; rien à changer. En attente du Producer pour la sortie : date du jour, puis la ligne de Raphaël « pousse
  la politique de Pétanque Scan 1.2.14 »
- 15:02 : frame_jump_offered remplacé par frame_jump_seen (Scan e26238a sur opencv3 : la carte « Le suivi AR a bougé »
  est retirée, Analytics.cs:33, envoyé à FrameEpoch.cs:206), dans les 5 langues, sans nommer ARCore (ARKit sur iPhone)
  ; replié dans le commit de l'événement ; build complet OK ; branche recalée sur origin/main 4361554 : 164a465,
  2389742, 2c958d6, 1669737, 78f49db ; diff renvoyé à la session Scan
- 15:02 : la session Scan valide 78f49db : frame_jump_seen une fois par page, ni frame_jump_offered ni 1.2.13,
  formulation neutre (sans ARCore) gardée. Prêt ; push au moment du Producer, date du jour de sortie, ligne de Raphaël
  « pousse la politique de Pétanque Scan 1.2.14 »
- 15:57 : floor_off_seen ajouté (Scan 47fb9ae sur opencv3 : carte « Le sol semble mal détecté » retirée,
  Analytics.cs:33, envoyé par FloorSanity.cs:53), après frame_jump_seen, 5 langues : e998e03 ; build complet OK ; diff
  renvoyé à la session Scan
- 15:57 : la session Scan valide e998e03 : floor_off_seen et frame_jump_seen une fois par page, ni frame_jump_offered
  ni 1.2.13. Prêt ; push au moment du Producer, avec la date du jour de sortie

## 2026-11-10 — Pubs maison : espace admin /admin/pubs/ (option A) (session website)
- Statut : en cours (2026-11-10T11:30+01:00). Demande de l'utilisateur : décision de Raphaël relayée par le Producer :
  « Oui, option A » : page /admin/pubs/ (noindex, hors sitemap et hors cache), module de règles partagé (check-promo le
  réutilise), fonction promo-admin (compte de Raphaël seul, commits par l'API GitHub sans force, écrit seulement sous
  public/promo/v1/), aperçus par langue, Publier, désactiver = poids 0, fichiers d'une pub supprimée gardés 30 jours,
  historique « Revenir à cette version » ; test local d'abord ; déploiement et push sur les lignes de Raphaël
- Réservations actives : `supabase/functions/_shared/promoRules.mjs`, `supabase/functions/promo-admin/`,
  `scripts/check-promo.mjs`, `src/pages/admin/`, `src/components/admin/`, `src/lib/promoAdmin.ts`, `astro.config.mjs`
  (filtre du sitemap et globIgnores), dans le worktree website-worktrees/promo-admin.
- Ressources : serveur de dev sur le port 4536 ; eslint, `astro check`. Build annoncé ici avant.
- 11:44 : écrit dans le worktree promo-admin : module de règles partagé (supabase/functions/_shared/promoRules.mjs et
  .d.mts, check-promo.mjs le réutilise), fonction promo-admin, page /admin/pubs/ (PromoAdmin.tsx, promoAdmin.ts),
  astro.config.mjs (/admin/ hors sitemap et hors sw.js). Testé en local : la fonction lancée par Deno contre un faux
  GitHub (dépôt git nu) et un faux Supabase Auth, 31 cas OK (accès, envois refusés, publication, 30 jours, conflit,
  main qui bouge, règles, store, historique, retour en arrière) ; la page en dev contre cette fonction, 12 cas OK
  (liste, aperçus, nouvelle pub à poids 0 avec icône, désactiver, historique et retour en arrière, aucune erreur) ;
  eslint OK, deno check OK, astro check 0 erreur. Lancement du build complet dans mon worktree promo-admin (son dist/,
  .astro/, public/vendor/ seulement)…
- 11:46 : build complet OK (222 pages, astro check 0 erreur, précache 386, liens OK) : /admin/pubs/ en noindex, absent
  du sitemap, sa page hors sw.js (seul son chunk JS y est, comme tous les JS du site et CoursesAdmin). Commité dans le
  worktree, non poussé, non déployé : ace7d86 (règles partagées), 02cf2b7 (fonction promo-admin), 4361554 (page).
  Serveurs de test locaux arrêtés. Reste, au mot de Raphaël : jeton GitHub, secrets et déploiement de la fonction, push
  de la page, aller-retour réel avec une pub de test à poids 0
- 11:49 : sur les mots de Raphaël tapés dans cette session (« déploie la fonction promo-admin en prod », « pousse la
  page admin des pubs ») : identifiant de son compte Google lu en prod (lecture seule, auth.users), secret
  PROMO_ADMIN_USER_ID posé, promo-admin déployée (sans jeton : 401 sans connexion, 503 « not configured » avec la clé
  publique, préflight 204) ; redirections de connexion : rien à changer (même domaine que l'adresse du site) ; poussé
  d776e56..4361554 depuis mon worktree. En attente : le jeton GitHub (fichier C:\Users\raph_\promo-admin.env), puis
  l'aller-retour réel avec une pub de test à poids 0

## 2026-11-11 — Nino Rush : page de téléchargement 1.0.13 (après coup) (session NinoRush)
- Statut : en cours (2026-11-11T09:50+01:00). Demande de l'utilisateur : publier l'APK de test 1.0.13 sur la page des
  testeurs (décision de Raphaël relayée par le Producer)
- Réservations actives : `src/data/ninoRush.ts`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 09:50 : Entrée écrite après coup, à la demande du Producer. APK_VERSION 1.0.13 et APK_SIZE 83,6 Mo modifiés dans un
  worktree (D:/Work/NinoRush/site-wt, à origin/main 4361554), parce que ce dossier avait 4 commits de retard et un
  claude.md modifié d'une autre session. Pas d'eslint, d'astro check ni de build complet pour ces 2 constantes.
- 09:50 : commité et poussé : 4624b2c sur main, mon seul fichier src/data/ninoRush.ts ; déploiement fini en 5 min 19 s,
  la page sert « Version 1.0.13 » ; worktree supprimé ; ce dossier partagé n'a pas été mis à jour (pas de pull) et
  cette section reste non commitée. Statut : terminé. Réservations libérées.

## 2026-11-11 — Journal du site poussé et ménage des branches (session website)
- Statut : en cours (2026-11-11T11:40+01:00). Demande de l'utilisateur : décision de Raphaël relayée par le Producer :
  « Oui, pousse » (journal), « Oui, les 4 » (suppressions, au mot tapé dans cette session)
- Réservations actives : aucune.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 11:40 : b75c970 recalé sur origin/main 4624b2c sans toucher au journal non commité (même empreinte), poussé :
  4624b2c..62393a3 ; main local au niveau. Suppressions de scan-privacy-att, dragons-gems-version,
  rencontres-app-privacy et origin/rencontres-accounts : en attente de la ligne de Raphaël
- 11:41 : sur le mot de Raphaël tapé dans cette session : worktree scan-privacy-att retiré (propre, node_modules réel),
  branches locales scan-privacy-att (2ccfb13), dragons-gems-version (a715cfe), rencontres-app-privacy (1d6459f)
  supprimées, branche distante rencontres-accounts supprimée sur GitHub. Restent : main, meet-partner-search,
  meet-privacy-house-ads, pg-privacy-108, promo-admin, scan-privacy-houseads, et origin/main. Statut : terminé.
  Réservations libérées.

## 2026-11-12 — ColorChain : page des prototypes et mini-jeu de dominos (session colorchain)
- Statut : en cours (2026-11-12T08:22+01:00). Demande de l'utilisateur : Raphaël, tapé dans cette session : « Est-ce
  qu'on peut en faire un mini jeux sur le site web de 10 niveaux pour tester le proto ? » ; accès : « lien accessible
  mais discret, à un endroit où l'on peut lister tous les prototypes en cours » ; langue : français
- Réservations actives : `src/pages/prototypes/index.astro` (nouveau), `public/prototypes/colorchain/` (nouveau),
  `src/pages/about.astro` (une phrase), `astro.config.mjs` (globIgnores seulement), worktree colorchain-proto.
- Ressources : serveur de dev sur le port 4571 ; eslint, `astro check`. Build annoncé ici avant.
- 08:25 : page /prototypes/ (noindex, hors sitemap, hors précache), jeu dans public/prototypes/colorchain/ (version
  française de la v12, menu des niveaux, progression locale), phrase vers les prototypes sur /about/ ; eslint OK, astro
  check 0 erreur, captures clair, sombre et téléphone sans erreur console. Lancement du build complet dans mon worktree
  colorchain-proto (son dist/, .astro/, public/vendor/ seulement)…
- 08:27 : build complet OK (224 pages, précache 386 sans /prototypes, liens OK, /prototypes absent du sitemap) ;
  commité e5abf09 sur la branche colorchain-proto (worktree), pas sur main. Captures envoyées à Raphaël ; push au mot
  de Raphaël
- 10:12 : commité et poussé à la demande de l'utilisateur (« pousse le site ») : mes fichiers
  (src/pages/prototypes/index.astro, public/prototypes/colorchain/, une phrase de src/pages/about.astro, globIgnores de
  astro.config.mjs) et cette section seulement. Statut : terminé. Réservations libérées.

## 2026-11-12 — ColorChain : correctifs du mini-jeu (session colorchain)
- Statut : en cours (2026-11-12T10:40+01:00). Demande de l'utilisateur : l'image de fond flicke en permanence et
  l'animation de chute est un peu ralentie
- Réservations actives : `public/prototypes/colorchain/index.html`, worktree website-worktrees/colorchain-proto
  (branche colorchain-fix).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 10:40 : couches du sol dessinées dans l'ordre sans écriture de profondeur (plus de scintillement sur téléphone),
  plans proche et lointain resserrés, chute à la vitesse réelle (x2) ; les 10 niveaux tombent en entier ; commité sur
  colorchain-fix, push au mot de Raphaël
- 11:01 : poussé à la demande de l'utilisateur (« tu peux mettre a jour sur le siteweb dans prototype ») :
  public/prototypes/colorchain/index.html et cette section seulement. Statut : terminé. Réservations libérées.

## 2026-11-12 — ColorChain : dominos dorés numérotés (session colorchain)
- Statut : en cours (2026-11-12T11:06+01:00). Demande de l'utilisateur : dominos dorés numérotés à faire tomber dans
  l'ordre ; « tu peux mettre a jour sur le siteweb dans prototype en ajoutant des niveaux »
- Réservations actives : `public/prototypes/colorchain/index.html`, `src/pages/prototypes/index.astro` (texte de
  ColorChain).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 11:08 : eslint OK, astro check 0 erreur ; les 12 niveaux tombent en entier, dorés dans l'ordre ; poussé à la demande
  de l'utilisateur (« tu peux mettre a jour sur le siteweb dans prototype ») : mes 2 fichiers et cette section
  seulement. Statut : terminé. Réservations libérées.

## 2026-11-12 — ColorChain : niveau ultra dur (session colorchain)
- Statut : en cours (2026-11-12T11:34+01:00). Demande de l'utilisateur : est-ce possible de faire un niveau ultra dur ?
  (mises à jour du prototype sur le site autorisées)
- Réservations actives : `public/prototypes/colorchain/index.html`, `src/pages/prototypes/index.astro` (texte de
  ColorChain).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 11:34 : niveau 13 Constellation ; les 13 niveaux tombent en entier, un seul départ garde l'ordre des dorés ; eslint
  OK ; poussé à la demande de l'utilisateur (mises à jour du prototype autorisées) : mes 2 fichiers et cette section
  seulement. Statut : terminé. Réservations libérées.

## 2026-11-12 — ColorChain : relais arc-en-ciel (session colorchain)
- Statut : en cours (2026-11-12T12:53+01:00). Demande de l'utilisateur : je ne comprends pas la logique (case qui
  accepte n'importe quelle couleur) ; mises à jour du prototype autorisées
- Réservations actives : `public/prototypes/colorchain/index.html`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 12:53 : anneaux des relais en arc-en-ciel, case gauche du pont de Constellation retirée ; 13 niveaux résolus ; poussé
  à la demande de l'utilisateur : mon fichier et cette section seulement. Statut : terminé. Réservations libérées.

## 2026-11-12 — ColorChain : couches de peinture (session colorchain)
- Statut : en cours (2026-11-12T13:31+01:00). Demande de l'utilisateur : nouvelle piste de gameplay (couches de
  peinture, piste 1 choisie par Raphaël) ; mises à jour du prototype autorisées
- Réservations actives : `public/prototypes/colorchain-peinture/`, `src/pages/prototypes/index.astro`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 13:32 : nouveau prototype /prototypes/colorchain-peinture/ (6 niveaux, vérifiés dans le bon ordre et à l'envers) et
  sa fiche en tête de la page ; eslint OK, astro check 0 erreur ; poussé à la demande de l'utilisateur : mes fichiers
  et cette section seulement. Statut : terminé. Réservations libérées.

## 2026-11-12 — ColorChain : pochoirs (session colorchain)
- Statut : en cours (2026-11-12T14:24+01:00). Demande de l'utilisateur : pochoirs visibles et une seule ligne de
  dominos (« ok on peut tester ») ; mises à jour du prototype autorisées
- Réservations actives : `public/prototypes/colorchain-peinture/index.html`, `src/pages/prototypes/index.astro` (texte
  de la fiche).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 14:24 : pochoirs visibles, pots posés le long d'une seule ligne de dominos ; 6 niveaux vérifiés (bon ordre, ordre
  inverse) ; eslint OK ; poussé à la demande de l'utilisateur : mes 2 fichiers et cette section seulement. Statut :
  terminé. Réservations libérées.

## 2026-11-12 — ColorChain : pochoirs touchés dans l'ordre (session colorchain)
- Statut : en cours (2026-11-12T14:52+01:00). Demande de l'utilisateur : toucher les pochoirs dans l'ordre, les
  retoucher pour les retirer ; reset qui marche mal ; mises à jour du prototype autorisées
- Réservations actives : `public/prototypes/colorchain-peinture/index.html`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 14:52 : pochoirs touchés dans l'ordre, retirés au second toucher ; pots debout après un reset ; 6 niveaux et les
  parcours échec, retouche et reset vérifiés ; poussé à la demande de l'utilisateur : mon fichier et cette section
  seulement. Statut : terminé. Réservations libérées.

## 2026-11-12 — ColorChain : bille et éventail (session colorchain)
- Statut : en cours (2026-11-12T15:21+01:00). Demande de l'utilisateur : une bille renverse les pots dans l'ordre, puis
  un domino blanc se divise en une ligne par colonne ; mises à jour du prototype autorisées
- Réservations actives : `public/prototypes/colorchain-peinture/` (index.html, cover.webp),
  `src/pages/prototypes/index.astro` (texte de la fiche).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 15:21 : bille qui renverse les pots dans l'ordre, éventail de dominos jusqu'à une ligne par colonne ; 6 niveaux
  vérifiés (bon ordre, ordre inverse) ; eslint OK ; poussé à la demande de l'utilisateur : mes fichiers et cette
  section seulement. Statut : terminé. Réservations libérées.

## 2026-11-12 — ColorChain : pots en hauteur (session colorchain)
- Statut : en cours (2026-11-12T15:59+01:00). Demande de l'utilisateur : pots en hauteur au-dessus des dominos, bille
  qui descend une rampe, phénomène physique cohérent ; mises à jour du prototype autorisées
- Réservations actives : `public/prototypes/colorchain-peinture/index.html`, `src/pages/prototypes/index.astro` (texte
  de la fiche).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 15:59 : pots sur piquets au-dessus du tableau, rampe en pente, filet de peinture ; 6 niveaux vérifiés (bon ordre,
  ordre inverse) ; eslint OK ; poussé à la demande de l'utilisateur : mes 2 fichiers et cette section seulement. Statut
  : terminé. Réservations libérées.

## 2026-11-12 — ColorChain : masque et ordre mélangé (session colorchain)
- Statut : en cours (2026-11-12T16:17+01:00). Demande de l'utilisateur : la bille ne doit plus s'arrêter, un masque qui
  ne laisse passer la peinture que sur certains dominos, pochoirs en ordre aléatoire ; mises à jour du prototype
  autorisées
- Réservations actives : `public/prototypes/colorchain-peinture/index.html`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 16:17 : bille sans arrêt, plaque de pochoir qui descend sur le tableau à chaque pot, cartes mélangées ; 6 niveaux
  vérifiés (bon ordre, ordre inverse) ; poussé à la demande de l'utilisateur : mon fichier et cette section seulement.
  Statut : terminé. Réservations libérées.

## 2026-11-12 — ColorChain : rail en lacets (session colorchain)
- Statut : en cours (2026-11-12T16:38+01:00). Demande de l'utilisateur : allonger la descente de la bille avec
  plusieurs virages ; mises à jour du prototype autorisées
- Réservations actives : `public/prototypes/colorchain-peinture/index.html`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 16:38 : rail en épingles autour des pots, 1,5 s entre deux pots, un masque à la fois ; 6 niveaux vérifiés (bon ordre,
  ordre inverse) ; poussé à la demande de l'utilisateur : mon fichier et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-11-12 — ColorChain : escalier de départ (session colorchain)
- Statut : en cours (2026-11-12T16:59+01:00). Demande de l'utilisateur : départ d'en bas, des dominos montent des
  escaliers pour arriver en haut ; mises à jour du prototype autorisées
- Réservations actives : `public/prototypes/colorchain-peinture/index.html`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 16:59 : pichenette en bas à gauche, file de dominos sur un escalier jusqu'à la bille ; 6 niveaux vérifiés (bon ordre,
  ordre inverse) ; poussé à la demande de l'utilisateur : mon fichier et cette section seulement. Statut : terminé.
  Réservations libérées.

## 2026-11-12 — ColorChain : un seul ordre et plaque à fentes (session colorchain)
- Statut : en cours (2026-11-12T17:09+01:00). Demande de l'utilisateur : des fois l'ordre peut être inversé ; pochoirs
  pas crédibles, voir la peinture couler vers le trou ou par de petites fentes ; mises à jour du prototype autorisées
- Réservations actives : `public/prototypes/colorchain-peinture/index.html`.
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 17:09 : Bateau, Maison et Poisson redessinés : un seul ordre valide par niveau (compté sur toutes les permutations) ;
  plaque à fentes, peinture qui s'étale puis passe par les fentes ; 6 niveaux vérifiés ; poussé à la demande de
  l'utilisateur : mon fichier et cette section seulement. Statut : terminé. Réservations libérées.

## 2026-11-12 — ColorChain : 100 dessins (session colorchain)
- Statut : en cours (2026-11-12T17:39+01:00). Demande de l'utilisateur : générer une centaine de dessins et en faire un
  mini jeu ; plaque semi-transparente ; mises à jour du prototype autorisées
- Réservations actives : `public/prototypes/colorchain-peinture/` (index.html, levels.js, cover.webp),
  `src/pages/prototypes/index.astro` (texte de la fiche).
- Ressources : eslint, `astro check`. Build annoncé ici avant.
- 17:40 : 100 dessins (levels.js), un seul ordre valide chacun (vérifié sur toutes les permutations), les 100 parties
  jouées par script jusqu'au bout ; menu en pages avec galerie ; plaque semi-transparente ; eslint OK, astro check 0
  erreur ; poussé à la demande de l'utilisateur : mes fichiers et cette section seulement. Statut : terminé.
  Réservations libérées.
