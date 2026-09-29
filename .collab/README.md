# Tickets Claude Code ↔ Codex

Canal commun des demandes, réponses et décisions. Les **réservations de fichiers** restent régies par
`COORDINATION.md` et les journaux de `coordination/` : un ticket ne libère jamais une réservation.
Codex ne peut pas réveiller Claude ; Claude, lui, lance Codex (voir « Mode orchestré »).

## Mode orchestré (depuis le 29/09, à la demande de l'utilisateur)
Claude Code est l'orchestrateur, Codex un sous-agent. Claude ouvre un ticket `to: codex`, puis le fait
traiter lui-même : `node scripts/codex-agent.mjs <id>`, qui lance `codex exec` sans interface.
- Tickets `review`, `idea`, `question` : bac à sable **lecture seule**. Codex n'écrit aucun fichier ; le
  script recopie sa réponse finale dans « ## Réponse » et passe le ticket en `answered`.
- Tickets `image` : écriture autorisée, limitée par la consigne aux chemins de `files:` (zone de dépôt).
- Journal complet de chaque exécution : `D:/tmp/codex-runs/`. En cas d'échec, le ticket repasse `open`.
- Claude lit la réponse, écrit « ## Suite », intègre et clôt. L'utilisateur n'arbitre que les désaccords.
Une session Codex ouverte par l'utilisateur reste possible : elle suit les mêmes tickets.

## Rôles par défaut (ajustables par l'utilisateur)
- **Claude Code** : code, intégration dans le site, tests, équilibrage, scripts Playwright.
- **Codex** : génération d'images, regard critique (challenger une idée, relire un design, proposer).
- Chacun peut ouvrir un ticket pour l'autre. L'utilisateur arbitre les désaccords.

## Tickets
Un ticket = `.collab/tickets/NNNN-slug.md`, copié de `TEMPLATE.md`. Numéro suivant ; vérifier les
fichiers existants avant de choisir, ne jamais écraser, réessayer avec un autre numéro en cas de collision.

```yaml
id: 0003
from: claude | codex | user
to: claude | codex
type: image | review | idea | question
status: open | in-progress | answered | closed
files: [chemins que le destinataire peut modifier pour ce ticket]
```

Cycle : l'émetteur écrit `open` → le destinataire passe `in-progress`, répond dans **## Réponse**, passe
`answered` → l'émetteur écrit **## Suite** et passe `closed`. Chacun n'écrit que dans ses sections ;
on n'efface jamais une réponse, on ajoute dessous.

## Règles
1. **Images : zone de dépôt.** Les images générées vont dans `.collab/out/<id>/` (ignoré par git), jamais
   directement dans `public/`. L'intégrateur (Claude par défaut) vérifie taille, détourage et style,
   optimise et place.
2. **Pas de commit ni de push** sans demande explicite de l'utilisateur.
3. Tickets en français. Code, commentaires et commits en anglais (voir `CLAUDE.md`).
4. **Critique = points numérotés** : constat, proposition, coût estimé, confiance. Réponse point par
   point : retenu / rejeté (avec la raison) / à arbitrer par l'utilisateur.
5. Une affirmation sur le jeu s'appuie sur une mesure ou un fichier (`chemin:ligne`, sortie de script).

## Journal
`.collab/LOG.md` : une ligne par ticket fermé (date, id, résumé, décision).
