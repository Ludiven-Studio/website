# Coordination Codex / Claude Code

Lire également `.collab/README.md` : les tickets `.collab/tickets/` sont le canal
commun des demandes, réponses et décisions. Ses règles de rôles, de livraison des
images et d'absence de commit/push sans demande explicite s'appliquent. Les rôles
par défaut restent ajustables par l'utilisateur. Ce fichier complète ce protocole
pour protéger le travail simultané ; un ticket ne libère pas une réservation existante.

Les journaux dans `coordination/` donnent
l'état courant. Ils sont partagés uniquement si les deux agents travaillent dans
ce même dossier ; dans des clones ou worktrees distincts, il faut synchroniser les
informations ou organiser une passation par Git avant de se fier à ces journaux.

## Démarrer et travailler

1. Lire ce fichier, `.collab/README.md`, les tickets ouverts, les deux journaux
   et les messages d'installation de `coordination/messages/`.
   Examiner aussi `git status --short` : une modification existante n'est jamais
   considérée comme libre simplement parce qu'elle n'a pas de réservation.
2. Chaque agent modifie uniquement son propre journal : `codex.md` ou `claude.md`.
   Y inscrire la tâche, le statut, la date avec fuseau, les chemins précis réservés
   et les commandes ou ressources partagées nécessaires (port, `dist/`, etc.).
3. Relire le journal de l'autre avant chaque lot d'éditions et avant une commande
   qui écrit des fichiers. Des périmètres disjoints peuvent avancer en parallèle.
4. Si les périmètres se chevauchent, ne pas éditer les fichiers concernés : envoyer
   une demande dans un ticket `.collab/tickets/` et attendre un accord explicite
   dans le journal ou un message de l'autre agent. Continuer sur un périmètre libre.
5. Publier les résultats à chaque étape utile : fichiers changés, vérifications
   réellement exécutées et résultats, limites, prochaine action. Libérer explicitement
   les réservations à la fin et indiquer le destinataire d'une éventuelle passation.

Les journaux sont une convention de coopération, pas un verrou informatique.
En cas de réservation simultanée ou ambiguë, les deux agents arrêtent les éditions
sur le périmètre commun et conviennent d'un propriétaire avant de reprendre.
Un silence, une date ancienne ou un statut « bloqué » ne libère jamais une réservation.
L'utilisateur peut arbitrer si un agent n'est plus disponible.

## Messages et passations

Utiliser les tickets et le modèle de `.collab/README.md` pour les nouveaux échanges.
`coordination/messages/` conserve uniquement le message initial d'installation ;
ne pas y créer une seconde boîte de réception. Respecter l'auteur de chaque section
du ticket et son cycle de passation. Avant de choisir un numéro, vérifier les fichiers
existants ; si un nom existe déjà, ne jamais l'écraser. En cas de création simultanée,
réessayer avec un nouveau numéro. Aucun secret ou identifiant sensible dans ces fichiers.

Un message indique : auteur, destinataire, objet, chemins concernés, demande ou décision,
et réponse attendue. Une passation doit nommer les chemins libérés et les travaux restants.
Ne jamais déclarer un accord ou un résultat de test au nom de l'autre agent.

## Ressources et Git

- Ne pas lancer simultanément des builds ou générations qui écrivent dans les mêmes
  sorties (`dist/`, `.astro/`, `public/vendor/`, images générées). Réserver ces sorties
  et annoncer la commande avant de la lancer ; demander leur libération si occupées.
- Employer un port distinct pour chaque serveur et respecter `scripts/preview-server.mjs`
  comme décrit dans `CLAUDE.md`. Arrêter uniquement ses propres processus.
- Pas de changement de branche, stash, reset, nettoyage global ou manipulation globale
  de l'index pendant que l'autre travaille dans ce dossier. Coordonner ces opérations.
- Un commit éventuel ne doit contenir que les changements attribués à sa tâche : pas de
  `git add .`. Vérifier le diff et l'index ; demander une passation pour un fichier mixte.
- Une modification des règles communes (`COORDINATION.md`, `AGENTS.md`, `CLAUDE.md`)
  après l'installation doit être annoncée et coordonnée comme tout périmètre partagé.

## Limites de la communication

Écrire un fichier ne réveille pas l'autre agent. Chaque agent consulte les messages
au début de son travail, entre deux étapes et avant sa réponse finale. Une session
déjà ouverte doit recevoir une première demande de lecture de l'utilisateur.
Il n'y a ni surveillance permanente ni garantie d'accusé de réception automatique.

## Installation du 29 septembre 2026

Codex installe uniquement ces consignes et les fichiers de coordination. Les modifications
applicatives préexistantes (notamment `atelier`, navigation, catalogue, wallet et scripts
d'images) restent réservées à leur auteur, dont l'identité n'est pas encore confirmée.
Claude est invité à déclarer son périmètre ; aucune tâche de développement supplémentaire
ne lui est assignée par cette installation.
