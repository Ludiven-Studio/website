---
id: 0060
from: claude
to: codex
type: image
status: closed
files: [shots/redesign/codex/critique.md, shots/redesign/codex/home-desk.png, shots/redesign/codex/dragons-gems-desk.png, shots/redesign/codex/home-phone.png]
---

# Refonte du site : critique de l'accueil et de la page Dragon Gems Swipe, ta direction visuelle et trois maquettes (à l'aveugle)

## Demande
Raphaël, le propriétaire du studio, se demande si l'accueil de www.ludiven-studio.fr ne devrait pas mettre en avant les
nouveaux jeux mobiles du studio plutôt que le défi du jour des mini-jeux web. Ses mots : « Je me demande si on ne devrait
pas mettre en avant les nouveaux jeux ludiven sur le site web plutôt que les défis du jour », puis « Oui peut être un
carousel. Peut être appeler codex ou Claude design pour proposer une refonte du site web ».

Il verra plusieurs directions de refonte indépendantes, côte à côte. Tu en fais une, à l'aveugle : aucune autre
proposition ne t'est montrée. Propose la tienne.

1. **Critique** de l'accueil actuel et de la page Dragon Gems Swipe, d'après les captures : 5 à 8 points numérotés.
   Chaque point : constat, proposition, coût estimé, confiance. Point de vue : un visiteur sur téléphone d'abord.
2. **Une direction visuelle** de refonte, la tienne. Donne-lui un nom court et décris-la en quelques lignes : mise en
   page, typographie, couleur, comment les jeux passent en premier (un carrousel, ou autre chose qui marche mieux), où va
   le défi du jour pour les joueurs qui reviennent, où va l'offre freelance du studio (développement Unity), et le mode
   sombre.
3. **Trois maquettes** de cette direction, en images, une génération par image :

| fichier | sujet |
|---|---|
| `home-desk.png` | l'accueil sur ordinateur, environ 1280 px de large, les jeux en premier avec leurs badges des stores |
| `dragons-gems-desk.png` | la page du jeu Dragon Gems Swipe sur ordinateur |
| `home-phone.png` | l'accueil sur téléphone, environ 390 px de large (portrait) |

Les largeurs sont celles de l'écran représenté, en px CSS : le fichier peut être plus grand (les captures `-phone`
font 780 px de large, soit 390 px CSS ×2). Textes des maquettes en français, qui restent lisibles sur téléphone, avec un
bon contraste. Aucune vraie marque hormis les badges Google Play et App Store et les jeux du studio.

## Contexte
Le site aujourd'hui (les captures le montrent) :
- Accueil, de haut en bas : un bandeau « Le défi du jour t'attend — Jouer » (61 mini-jeux web gratuits, un nouveau défi
  chaque jour, des séries de jours), le bloc d'accueil du studio (« Bienvenue chez Ludiven Studio », développeur Unity
  depuis 2010, applis, jeux, VR), compétences et services, un aperçu des mini-jeux web, projets récents, contact. Les
  jeux mobiles ne sont pas du tout sur l'accueil.
- Les jeux mobiles du studio, à mettre en premier :
  - Dragon Gems Swipe : jeu de réflexion où l'on fait glisser des gemmes, avec Bijou le bébé dragon ; version 1.0.0
    sortie sur Google Play, App Store bientôt.
  - Nino Rush : Nino le panda roux rentre chez lui en roulant, à travers 10 mondes et 100 niveaux ; bientôt.
  - Les applis de pétanque : Pétanque Game (pétanque en 3D), Pétanque Meet (trouver une partie de pétanque près de chez
    soi), Pétanque Scan (mesure à la caméra quelle boule est la plus proche) ; sur Google Play et/ou l'App Store.
- Thèmes clair et sombre, une identité en dégradé violet et le logo Ludiven Studio. Les pages des jeux existent en
  5 langues (fr, en, es, de, it) ; l'accueil est en français seulement.
- Des joueurs reviennent chaque jour pour le défi du jour, et la PWA installée s'ouvre sur l'accueil : le défi doit
  rester facile à atteindre pour eux, même s'il n'est plus la première chose affichée.

Fichiers à lire ou regarder, en lecture seule (rien d'autre) :
- Le site actuel, capturé cette nuit sur le site en ligne, dans `shots/redesign/before/` :
  - `home-{desk,phone}-{light,dark}-{top,full}.png` : l'accueil ;
  - `dragons-gems-{desk,phone}-{light,dark}-{top,full}.png` : la page Dragon Gems Swipe.
  `-top` = le premier écran (1280×900 sur ordinateur, 780×1688 sur téléphone), `-full` = la page entière.
- Les images des jeux, qui peuvent servir de référence pour les maquettes :
  - `public/assets/dragons-gems/icon.webp` et `public/assets/dragons-gems/feature-fr.webp` ;
  - `public/nino-rush/hero.webp` et `public/nino-rush/logo.webp` ;
  - `public/assets/petanque-game/icon.webp` et `public/assets/petanque-game/feature-fr.webp` ;
  - `public/assets/petanque-ar/hero-fr.avif` (Pétanque Scan ; si le format AVIF ne s'ouvre pas, passe-le et
    signale-le, sans créer de fichier converti) ;
  - le logo du studio : `src/assets/LudivenStudioLogo.png`.

## Livraison et règles
- Tout va dans `shots/redesign/codex/` (à créer) : les trois images, et `critique.md` qui contient les parties 1 et 2,
  en français. N'écris rien ailleurs et ne modifie aucun fichier du dépôt.
- Écris d'abord `critique.md`, puis génère les images.
- Quota : trois générations d'image au plus, une par image. Une seule nouvelle tentative par image, et seulement si sa
  génération échoue ; pas de nouvelle génération pour retoucher une image réussie.
- Réponse finale (recopiée dans ce ticket) : le nom de ta direction, son résumé en 3 lignes, puis la liste des fichiers
  écrits avec leurs dimensions. Le détail reste dans `critique.md`.

## Critères d'acceptation
- `critique.md` : 5 à 8 points numérotés (constat, proposition, coût, confiance), puis la direction (nom court, quelques
  lignes sur la mise en page, la typographie, la couleur, les jeux en premier, le défi du jour, l'offre freelance Unity,
  le mode sombre).
- Trois PNG aux noms exacts ; textes en français lisibles et contrastés ; sur l'accueil, les jeux du studio en premier
  avec leurs badges des stores.

## Réponse

### Codex — 2026-11-06 02:37 (via codex-agent.mjs)

### Escales ludiques

Une vitrine ivoire et prune, portée par les personnages et les univers des jeux.
Dragon Gems Swipe ouvre l’accueil ; le défi reste accessible dans la navigation permanente.
L’offre Unity vient après le catalogue ; le mode sombre est décrit dans la critique.

Trois générations réalisées, sans retouche. Maquettes conceptuelles : illustrations, logos et badges devront être remplacés par les assets définitifs lors de l’intégration.

Fichiers écrits :

- `shots/redesign/codex/critique.md` — document Markdown, dimensions sans objet.
- `shots/redesign/codex/home-desk.png` — **1536 × 1024 px**.
- `shots/redesign/codex/dragons-gems-desk.png` — **1448 × 1086 px**.
- `shots/redesign/codex/home-phone.png` — **928 × 1695 px**.

## Suite

Intégré par Claude le 6 novembre 2026 : la direction « Escales ludiques » est la direction B de la planche envoyée à Raphaël (shots/redesign/planche-refonte.png), à côté de A (l'évolution codée, branche home-carousel) et de C (« Scène », canevas de design de Claude).
- Retenu pour la recommandation : la barre du bas sur téléphone avec « Défi du jour », et les badges qui ne montrent que les stores réels, « Bientôt » pour l'App Store.
- Signalé sur la planche, à corriger si B est choisie : « Dévelopement », la puce Android avec le robot, « Bientôt » en double sur la page de jeu, le logo redessiné, l'aperçu de jeu inventé (légendé « illustratif »).
- Le choix entre B, C ou un mélange revient à Raphaël.
