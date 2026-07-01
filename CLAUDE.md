# CLAUDE.md

## Inspection de fichiers — préférer les outils intégrés
Pour réduire les demandes de permission, n'utilise PAS de one-liners bash pour lire
ou chercher dans les fichiers. Utilise systématiquement les outils intégrés :
- Lire un fichier ou une plage de lignes → outil Read (avec offset/limit).
  Jamais awk, sed, cat, head ni tail pour ça.
- Chercher du texte dans le code → outil Grep. Jamais grep, rg ou awk en ligne de commande.
- Lister ou trouver des fichiers → outil Glob. Jamais find.
- Ne recours à une commande bash pour ces tâches que si l'outil intégré en est
  réellement incapable, et explique alors pourquoi.
