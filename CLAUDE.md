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

## Scripts Playwright — toujours `startServer`, jamais `spawn('npx', …)`
Tout script de `scripts/` qui a besoin d'un serveur Astro (les `snap-*`, `check-*`,
`measure-*`, `generate-og`) démarre ce serveur avec le module partagé :

```js
import { startServer } from './preview-server.mjs';
const server = await startServer(PORT);          // { mode: 'dev' } si besoin du serveur de dev
try { /* … */ } finally { server.stop(); }
```

N'écris **jamais** `spawn('npx', ['astro', …], { shell: true })` suivi d'un `server.kill()` :
sous Windows l'enfant direct est `cmd.exe`, donc `kill()` tue le wrapper et le petit-fils `node`
survit, port toujours ouvert. Un orphelin par exécution, et ça s'empile en silence — 101 d'entre eux
ont fini par manger toute la mémoire validée de la machine, plus aucun build ne passait
(`Fatal process out of memory`, puis Chromium `GPU process launch failed`, aucun des deux ne nommant
la vraie cause). `startServer` lance l'entrée Astro sous le `node` courant : il n'y a plus de wrapper
à perdre.

Le module refuse aussi un port qui répond déjà : un port squatté répond très bien à `fetch`, et le
script tire alors sur le `dist` de quelqu'un d'autre — ça ressort en timeout de sélecteur sur un
balisage pourtant correct.

Pas besoin de boucle d'attente : `startServer` ne rend la main que quand le serveur répond.
