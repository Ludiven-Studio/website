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
