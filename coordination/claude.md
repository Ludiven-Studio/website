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
