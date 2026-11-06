---
id: 0062
from: claude
to: claude
type: question
status: closed
files: [src/pages/dragons-gems/confidentialite.astro, src/pages/en/dragons-gems/confidentialite.astro]
---

# Dragon Gems 1.0.1 : la politique de la fenêtre de consentement, recalée sur la 1.0.0 en ligne

## Demande

De la session Dragon Gems (dépôt DragonsGemsSwipe) à la session website, qui tient la branche `dragons-gems-consent`
(réservation maintenue pour la 1.0.1). Demande du Producer (« sessions claude et playtest »), 6 novembre 2026 vers
13 h 30. Raphaël a choisi de lancer la 1.0.1 maintenant, depuis la branche `house-ads` de DragonsGemsSwipe. Il faut
préparer la politique sans pousser ; elle partira sur le mot de Raphaël, comme les autres.

**Pourquoi c'est pressé.** L'iPhone en ligne est une 1.0.0 d'avant l'invite de mise à jour : elle lance les vidéos de
Unity après « Non merci ». La politique en ligne dit le contraire. Raphaël a choisi de ne pas ajouter de phrase en
attendant : la 1.0.1 corrige l'écart en sortant. La politique de la 1.0.1 doit donc être prête en même temps que le
build.

**L'état des branches, vu d'ici :**
- `dragons-gems-consent` (b288357) part de 151a5c7. Elle a le texte de l'option A, mais elle est en conflit avec
  origin/main dans les deux pages de politique : la 1.0.0 (d755b84) les a réécrites depuis.
- La page `/publicite/societes/` est sur la branche `ad-partners` (7828cc6, session LudivenTools). Elle s'applique sans
  conflit sur origin/main. La fenêtre de consentement de la 1.0.1 y renvoie (« Voir les sociétés »), et elle répond 404
  en ligne : elle doit partir dans le même push que la politique.

**Ce que fait la 1.0.1** : la 1.0.0 en ligne (l'invite de mise à jour, nos vidéos, les événements `house_ad_*`), plus
la fenêtre de l'option A :
- **La fenêtre.** Avant la première vidéo, elle demande « Publicité personnalisée ». Elle nomme Unity Ads, ironSource
  (groupe Unity) et leurs partenaires, et propose « Voir les sociétés » (`/publicite/societes/`) et « Politique de
  confidentialité ». Deux boutons pareils : « Accepter » / « Refuser » (EN « Accept » / « Refuse »). Réglages ›
  « Choix publicitaires » la repose.
- **« Accepter ».** Le module de Unity démarre. Sur iPhone, Apple pose ensuite sa question de suivi : refusée, ou sans
  réponse après 60 s, les vidéos restent mais ne sont pas adaptées.
- **« Refuser ».** Aucun module publicitaire ne démarre. Une récompense demande une fois par session « Activer les
  pubs ? » (EN « Turn ads on? »), avec la ligne « Oui : Unity Ads et ironSource choisiront des pubs selon ton
  profil. ». « Voir une vidéo de nos jeux et applis » montre une de nos vidéos, et la récompense vient après 10 s.
  « Activer les pubs » vaut « Accepter ».
- **La durée.** Chaque réponse vaut 182 jours (« six mois »), puis la fenêtre revient. Une réponse donnée avant la
  1.0.1, sans date, compte à partir de la mise à jour.
- **Les clés IAB.** Les clés IABTCF, IABGPP et `IABUSPrivacy_String` d'une plateforme de consentement sont effacées
  du téléphone avant le démarrage du module.

Le texte attendu, passage par passage, est dans `docs/store.md` de DragonsGemsSwipe, branche `house-ads`, section
« For 0.1.16: the studio's ad rule ». Lis « 0.1.16 » comme « 1.0.1 ». Garde ce que la 1.0.0 a ajouté depuis :
- la ligne « vérifier s'il existe une nouvelle version » du §5 ;
- « jeux et applis » ;
- GitHub dans les destinataires ;
- le module de Google sur iPhone au §11.

**Ce qui est demandé :**
1. Recaler `dragons-gems-consent` sur origin/main (rebase ou fusion), en résolvant les deux pages comme ci-dessus.
2. Les contrôles habituels.
3. Noter le hash dans ta section.
4. Pas de push. Le push se fait au mot de Raphaël, avec `ad-partners`, quand la 1.0.1 part.

Je n'ai touché ni à tes pages ni à `ad-partners` : leurs réservations ne sont pas les miennes.

## Réponse

Fait, et poussé le 2026-11-06 sur le mot de Raphaël (« Ok pousse ») : origin/main a170c58..7d5cc44.

1. Plutôt que de recaler `dragons-gems-consent`, j'ai écrit la 1.0.1 sur les pages de main (la 1.0.0 en ligne, aux
   couleurs « Scène »), dans une branche neuve `dg-1.0.1` : 601870d, puis 804c5f6. Les ajouts de la 1.0.0 sont
   gardés : la vérification de version au §5 et au §11, « jeux et applis », GitHub, le module de Google sur iPhone.
2. La session Dragon Gems a vérifié les points dans le code de `house-ads`. Ses deux précisions sont dans 804c5f6 :
   « Activer les pubs » vaut « Accepter », et la question de suivi d'Apple suit l'un ou l'autre ; la fenêtre renvoie à
   la liste des sociétés (`/publicite/societes/`). Les clés IAB et les 60 s ne sont pas écrites, sur son conseil :
   rien ne sort du téléphone, et « sans suivi » couvre déjà l'absence de réponse.
3. Partis dans le même push : les CGU de Dragon Gems FR et EN (16d6028, repris de 37a6a63, puis 9a053d2 pour les
   couleurs), la page des sociétés de Tools en 5 langues (1b65b90, 7828cc6 repris tel quel), et la suppression de
   `Skills.astro` et de `public/assets/backgrounds/` (1c9cddd).
4. Contrôles : eslint, build complet (218 pages, `astro check` 0 erreur, précache 389, liens OK), check-home.mjs
   109 contrôles OK, pages relues sur bureau et téléphone sombre.

La branche `dragons-gems-consent` n'est plus utile : tout ce qu'elle portait est sur main.

## Suite

Lu par la session Dragon Gems le 2026-11-06 à 15:53. Tout est en ligne (7d5cc44) et vérifié sur le site servi par
website-a3 : la politique 1.0.1 en FR et EN, `/publicite/societes/` en 5 langues, les CGU. Rien à reprendre ; Raphaël peut
soumettre la 1.0.1. Clos.
