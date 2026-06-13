# Briefing — Plateforme de mini-jeux de logique pour Ludiven Studio

Ce document est une passation. Il résume un travail de conception fait en amont
et te confie la suite : intégrer une section de mini-jeux de logique dans le site
vitrine existant de **Ludiven Studio** (studio de développement).

---

## 1. Le concept

Une plateforme de **mini-jeux de logique** à tuiles, façon LinkedIn Games / Wordle /
Human Benchmark. Chaque tuile = un gameplay différent, avec ses propres règles, qui
produit un **score ou un temps**. Orientation **maths ludiques + logique** (esprit
Sudoku / Picross / Calcudoku), pensée pour ne PAS décourager : les maths sont
présentes mais cachées derrière le plaisir de déduction, jamais scolaires.

### Pourquoi l'intégrer au site du studio
Le site vitrine attire des visiteurs ; les jeux les retiennent et les font revenir
chaque jour. Chaque joueur quotidien devient une vitrine vivante du savoir-faire de
Ludiven Studio. **Le jeu est la démo commerciale.** L'intégration doit donc renforcer
l'image du studio, pas créer un site à part.

---

## 2. Décisions déjà prises (à respecter sauf raison technique)

### Stack & hébergement
- **Web pur** (HTML/CSS/JS), surtout PAS de moteur lourd type Unity.
- Le prototype fourni est en **React**. À adapter à la stack réelle du site (à
  découvrir en analysant le repo — voir §5).
- **Mobile-first impératif** : ça doit être parfait au doigt sur téléphone.
- Cible PWA à terme (installable, jouable hors-ligne pour le mode infini).
- Hébergement recommandé : Vercel / Netlify / Cloudflare Pages (déploiement auto au
  push, HTTPS, CDN gratuit). PAS de VPS au début — friction inutile pour un side project.

### Modèle de jeu (les deux modes se nourrissent l'un l'autre)
- **Défi du jour (en ligne)** : la MÊME énigme pour tout le monde, générée à partir
  d'une **graine déterministe basée sur la date**. Un seul essai, classement au
  temps/score, résultat partageable en emojis (façon Wordle, sans spoiler). C'est le
  moteur de viralité et de rétention (rendez-vous quotidien + streak).
- **Mode infini / entraînement (hors-ligne possible)** : énigmes générées côté client,
  difficulté croissante, "va le plus loin possible", meilleur score personnel.

### Scoring & difficulté
- Difficulté progressive ; le score augmente avec la difficulté.
- Rythme hebdomadaire possible pour le défi du jour (lundi facile → dimanche diabolique,
  façon mots croisés du NYT).

### Anti-triche (à anticiper, pas à implémenter tout de suite)
- Un classement en ligne implique des scores envoyés via l'API → triche possible.
  À garder en tête dès la conception du backend. Le classement est l'actif principal :
  s'il perd toute crédibilité, le projet perd sa valeur.

### Monétisation (NE PAS implémenter maintenant — noté pour mémoire)
- À penser en DERNIER, seulement avec des milliers de joueurs quotidiens.
- Pistes viables : pub discrète + premium sans pub (modèle NYT Games), cosmétique
  (thèmes, badges), jetons d'indice / jokers de streak.
- **À éviter** : monnaie virtuelle lourde + boutique façon free-to-play (public
  allergique, casse la pureté du concept). Ne JAMAIS permettre d'acheter un bon score.

---

## 3. Le premier jeu : "Somme Toute" (prototype fourni)

Fichier : `somme-toute-prototype.jsx` (React, un seul fichier, autonome).

### Règle
Une grille NxN partiellement remplie. Chaque ligne et chaque colonne affiche une
**somme cible**. Le joueur remplit les cases vides (nombres de 1 à maxVal) pour que
toutes les lignes ET colonnes atteignent leur cible.

### Pourquoi ce jeu en premier
- **Génération mathématiquement sûre** : on construit d'abord une grille pleine (donc
  une solution valide existe par construction), on calcule les sommes, puis on retire
  des cases une à une en vérifiant à chaque retrait que la **solution reste unique**
  (solveur par backtracking inclus dans le proto).
- **Difficulté paramétrable finement** : taille de grille, plage de nombres, nombre de
  cases retirées.
- **Accessibilité maths réglable** : petites additions pour débutants, grandes grilles
  pour les mordus, même moteur.

### Ce que le prototype contient déjà
- Générateur à solution unique (`generatePuzzle`, `countSolutions`).
- 3 difficultés (Facile 4x4 / Moyen 5x5 / Difficile 6x6).
- Feedback live (pastilles vertes si somme atteinte, rouges si dépassée).
- Timer, écran de victoire, pavé tactile (mobile) + support clavier (desktop).
- Accessibilité de base : focus clavier, `prefers-reduced-motion`, aria-labels.

### Limite connue du prototype
Le générateur et l'UI sont dans le MÊME fichier. Première tâche de refactoring
recommandée : **séparer le moteur (logique pure, testable) du composant d'affichage**,
pour pouvoir réutiliser/tester le moteur et poser le patron des futurs jeux.

---

## 4. Autres jeux envisagés (backlog d'idées, pour plus tard)

Familles explorées, à puiser quand viendra le 2e/3e jeu (la structure à tuiles prend
son sens à partir de là) :
- **Calcudoku / KenKen simplifié** : cages avec cible + opération (12x, 5+, 3-).
- **Suguru / Tectonic** : zones de tailles variables, 1..N, voisins différents.
- **Picross arithmétique** : indices de picross donnés sous forme de mini-calculs.
- **Suite mystère** : compléter une séquence (règle mathématique, visuelle ou linguistique).
- **L'intrus**, **Machine logique** (deviner la fonction entrée→sortie), **coffre-fort**
  (Mastermind à indices logiques), **suite en grille** (chemin façon Zip de LinkedIn).

Critère de choix prioritaire : **génération algorithmique** (tourne tout seule) plutôt
que création manuelle de chaque énigme (corvée quotidienne qui tue un side project solo).

---

## 5. Tâches pour Claude Code (dans l'ordre)

1. **Analyser le repo existant** (`D:\Projects\LudivenStudio\website`) : identifier la
   stack (framework, bundler, routeur, système de styles), la structure des pages et la
   navigation. NE RIEN casser de l'existant.
2. **Proposer un point d'intégration** pour une section "Jeux" cohérente avec le site
   du studio (route/page dédiée, entrée dans la navigation, cohérence visuelle avec la
   charte Ludiven Studio).
3. **Intégrer "Somme Toute"** à partir de `somme-toute-prototype.jsx`, adapté à la stack
   réelle (si le site n'est pas en React, porter la logique ; le moteur est du JS pur et
   se transpose facilement).
4. **Refactorer** : séparer le moteur de jeu (génération + validation, pur, testé) de
   l'UI. Poser une structure qui accueillera d'autres jeux en tuiles.
5. **Mettre en place la coquille à tuiles** : une page d'accueil "Jeux" listant les jeux
   (un seul pour l'instant), prête à en recevoir d'autres.
6. **Préparer le défi du jour** : générateur paramétré par une graine déterministe issue
   de la date (même grille pour tous le même jour). PRNG seedé, pas de `Math.random` brut
   pour ce mode.

### Plus tard (ne pas faire maintenant)
- Backend classement (Supabase/Firebase) + réflexion anti-triche.
- Partage de résultat en emojis. Streaks. Stats perso. PWA / hors-ligne.
- Comptes utilisateurs (synchro multi-appareils).

---

## 6. Principes de conception à garder

- **Mobile-first**, jouable au doigt, règles comprises en ~5 secondes.
- **Habillage = identité** : le même puzzle paraît austère ou délicieux selon l'habillage.
  Éviter le "chiffres noirs sur fond blanc façon manuel de maths". Couleurs chaudes,
  animations satisfaisantes à la validation. (Le proto propose déjà une direction
  verte/ambre — à harmoniser avec la charte Ludiven Studio.)
- **Pas de compte obligatoire pour jouer** au début (pseudo local suffit pour le classement).
- **Le contenu quotidien est un engagement** : 365 énigmes/an → privilégier des jeux
  générables algorithmiquement.
- La vraie difficulté du projet n'est ni la techno ni la monétisation : c'est d'avoir
  1-2 gameplays assez bons pour mériter le rituel quotidien. Tout le reste est de
  l'emballage autour de ça.

---

## 7. Validation rapide attendue avant d'industrialiser

Faire valider le **plaisir de déduction** et la **calibration de difficulté** de Somme
Toute en y jouant, avant de construire toute la plateforme autour. Tordre le gameplay
tant qu'il est petit.
