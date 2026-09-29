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
