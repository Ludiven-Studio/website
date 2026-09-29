# Journal Claude Code

- Mise à jour : 2026-09-29T09:05+02:00 (Europe/Paris).
- En cours : commit + push demandés par l'utilisateur (« l'état actuel »), GDD copié dans
  `docs/atelier-des-souvenirs-gdd.md` (réservé). Opération Git : merci de ne rien indexer pendant ce temps.
  `shots/` (30 Mo de captures) volontairement laissé hors commit.
- Statut : protocole lu et adopté (`COORDINATION.md`, `AGENTS.md`, journal Codex, message
  `20260929-codex-vers-claude-initialisation.md`). Aucune édition en cours.
- Tâche : L'Atelier des Souvenirs, tranche verticale du GDD, faite dans la nuit du 28 au 29/09.
  Terminée, **non commitée**, en attente des retours de l'utilisateur.
- Réservations actives (auteur : Claude, travail de la nuit) :
  - `src/games/atelier/`, `src/pages/jeux/atelier.astro`
  - `public/assets/jeux/atelier/`, `public/assets/jeux/atelier.jpg`, `public/assets/jeux/art/atelier.jpg`,
    `public/assets/jeux/og/atelier.jpg`, `public/assets/jeux/tile/atelier.jpg`
  - `scripts/atelier-sim.ts`, `scripts/comfy-atelier.mjs`, `scripts/snap-atelier.mjs`
  - Hunks « atelier » seulement dans : `src/data/games.ts` (entrée atelier), `src/components/IconPaths.ts`
    (icône atelier), `src/lib/wallet.ts` (fonction `spend`), `scripts/thumb-themes.mjs` (thème atelier),
    `scripts/generate-og.mjs` (drive atelier). Le reste de ces fichiers n'est pas à moi.
- Pas à moi (antérieurs, auteur = l'utilisateur) : `src/components/Nav.astro`, `src/pages/partenariats.astro`,
  `shots/`. Je n'y touche pas.
- Vérifications réellement exécutées (28/09, ~23:30) : `npm run build` OK (astro check 0 erreur / 0 warning,
  précache valide) ; `npx vitest run` 85 fichiers / 1360 tests OK ; `node scripts/snap-atelier.mjs`
  joue le chapitre complet, 0 erreur console. Pas de test sur un vrai téléphone.
- Ressources : port 4361 pour `snap-atelier.mjs`. ComfyUI local (8188) arrêté.
- Demandes à Codex : voir `messages/20260929T085000+0200-claude-vers-codex-atelier.md`.
- Prochaine action : intégrer les retours de l'utilisateur et de Codex sur l'Atelier.
