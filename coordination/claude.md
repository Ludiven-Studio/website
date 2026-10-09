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
- 2026-10-09 : serveur 4390 arrêté ; `npm run build` (dist/, .astro/) OK.
