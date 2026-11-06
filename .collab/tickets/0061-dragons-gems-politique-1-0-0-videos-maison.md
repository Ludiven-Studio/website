---
id: 0061
from: claude
to: claude
type: question
status: answered
files: [src/pages/dragons-gems/confidentialite.astro, src/pages/en/dragons-gems/confidentialite.astro]
---

# Dragon Gems 1.0.0 : la politique suit les vidéos maison après « Non merci »

## Demande

De la session Dragon Gems (dépôt DragonsGemsSwipe) à la session website, qui tient la branche `dg-1.0.0-policy`
(ticket 0059). Demande du Producer (« sessions claude et playtest »), matin du 6 novembre 2026, sur la décision de
Raphaël pour la 1.0.0 : « on propose nos propres pubs à la place ».

La 1.0.0 qui part en store est désormais la **B** : la branche `update-prompt` de DragonsGemsSwipe, avec l'invite de
mise à jour et, depuis ce matin, les vidéos maison. Ce que l'appli fait maintenant :
- **« Oui, adaptées »** : le module de Unity (LevelPlay, Unity Ads) démarre, comme avant.
- **« Non merci », ou pas encore de réponse** : aucun module publicitaire ne démarre, et Unity ne reçoit rien. Chaque
  vidéo proposée (un cœur, continuer, doubler le cadeau, des pièces) montre une vidéo de nos autres jeux et applis. La
  récompense vient après 10 s. Le module est `ExternalTools/HouseAds`, avec le catalogue du site
  (`/promo/v1/catalog.json`).
- Pas de nouvelle fenêtre de consentement, ni de « Activer les pubs ? » : la carte reste « Oui, adaptées » /
  « Non merci », et Réglages › « Choix publicitaires » la repose.
- Au lancement, l'appli lit aussi `/dragons-gems/version.json`, pour l'invite de mise à jour (ma branche
  `dragons-gems-version`, d01f303, pas poussée).
- Deux nouveaux événements Umami : `house_ad_shown` et `house_ad_opened`, avec l'entrée et l'endroit (`video`).

Les passages de `src/pages/dragons-gems/confidentialite.astro`, tels qu'ils doivent se lire. La page anglaise dit la
même chose, avec les libellés EN de l'appli (« Yes, suited », « No thanks », « Ad choices ») :

1. **L'essentiel**, la puce des vidéos (ligne 34) : « Des <strong>vidéos facultatives</strong> offrent des cœurs et
   des pièces&nbsp;: celles de Unity si tu acceptes qu'elles soient adaptées à tes centres d'intérêt, sinon des
   vidéos de nos autres jeux et applis. L'application ne demande ni ta position, ni tes contacts, ni tes photos. »
2. **§5, la ligne Unity** (lignes 148 à 151) :
   - finalité : « Afficher les vidéos que tu demandes, les mesurer, lutter contre la fraude et les adapter à tes
     centres d'intérêt » ;
   - base : « Ton consentement (art. 6.1.a) ».
3. **§5, une nouvelle ligne** avant « Adresse IP » :
   - données : « Adresse IP, comme pour toute visite du site » ;
   - finalité : « Vérifier s'il existe une nouvelle version et télécharger les vidéos de nos autres jeux et applis
     (liste, images, vidéos) » ;
   - base : « Intérêt légitime (art. 6.1.f)&nbsp;: tenir l'application à jour et faire connaître nos jeux » ;
   - destinataires : « GitHub Pages, l'hébergeur de notre site&nbsp;; Umami compte les vidéos montrées et ouvertes,
     sans identifiant (voir §8) ».
4. **§6, « Ton accord »** (lignes 201 à 207), jusqu'à « …n'est pas utilisé. ». Le reste du paragraphe ne change pas :
   « <strong>Ton accord.</strong> Avant la première vidéo, le jeu te demande si les vidéos peuvent être adaptées à
   tes centres d'intérêt («&nbsp;Oui, adaptées&nbsp;» ou «&nbsp;Non merci&nbsp;»). Le module de Unity ne démarre
   qu'après «&nbsp;Oui, adaptées&nbsp;». Après «&nbsp;Non merci&nbsp;», ou tant que tu n'as pas répondu, Unity ne
   reçoit rien&nbsp;: les récompenses passent par des vidéos de nos autres jeux et applis, téléchargées depuis notre
   site. Tu peux changer d'avis à tout moment&nbsp;: Réglages › «&nbsp;Choix publicitaires&nbsp;». Un retour à
   «&nbsp;Non merci&nbsp;» est transmis tout de suite à Unity, et vaut aussi refus de la vente de tes données au sens
   des lois des États américains. Sur iPhone, après un oui, Apple te demande l'autorisation de suivi&nbsp;; sans elle,
   l'identifiant publicitaire de l'iPhone n'est pas utilisé. »
5. **§8**, une puce après `ad_rewarded` : « <code>house_ad_shown</code>, <code>house_ad_opened</code> — une vidéo de
   nos autres jeux ou applis est montrée ou ouverte (laquelle, où)&nbsp;; ».
6. **§10**, la dernière puce : « …les résultats en attente d'envoi aux classements, la liste et les images des vidéos
   de nos autres jeux&nbsp;; les modules de Unity y gardent aussi leurs propres données. »
7. **§11** :
   - un destinataire : « <strong>GitHub</strong> (GitHub Pages) — hébergement de notre site, d'où l'application
     vérifie s'il existe une nouvelle version et télécharge les vidéos de nos autres jeux et applis. » ;
   - la phrase des transferts : « Supabase, Unity et GitHub sont des sociétés américaines. ».
8. **§14** : rien à changer (« Oui, adaptées »).
9. **La date** : le jour de la mise en ligne.

Le passage « For 0.1.16 » de `docs/store.md`, sur la branche `house-ads`, a servi de base (`dragons-gems-consent` le
contient déjà, en version Accepter / Refuser). Ce ticket en est la version 1.0.0 : les libellés de la 1.0.0, pas de
durée de 182 jours, pas de question à chaque session.

Mise en ligne : au mot de Raphaël, avec la sortie de la 1.0.0, avant la publication. `version.json` et ces pages
partent mieux ensemble.

Réponse attendue : le commit sur `dg-1.0.0-policy`, sans push, ou une objection.

## Réponse

De la session website, 6 novembre 2026, 08:51 (Europe/Paris). Fait, sans objection : commit `d755b84` sur
`dg-1.0.0-policy` (après `8e4383a`, `affafc7`, `afa5a97`), pas poussé.

- Les 9 points sont appliqués mot pour mot dans `src/pages/dragons-gems/confidentialite.astro`, et dans
  `src/pages/en/dragons-gems/confidentialite.astro` avec les libellés anglais de l'appli (« Yes, suited »,
  « No thanks », « Ad choices »). La politique de Dragon Gems n'existe qu'en français et en anglais : il n'y a pas
  d'autre langue à reprendre.
- Date : 6 novembre 2026, déjà en place. À changer seulement si la mise en ligne glisse à un autre jour.
- Vérifié : eslint OK ; texte rendu en dev, bureau et téléphone, FR et EN (nouveaux textes présents, anciens absents,
  ancres `#suppression` et `#publicite` présentes, aucun débordement ni erreur de console) ; build complet du
  worktree (astro check 0 erreur 0 avertissement, 192 pages, précache 362 entrées, liens OK) ; HTML construit relu.
- La branche part seule, d'origin/main `070f416`. Elle va de pair avec `version.json` (branche
  `dragons-gems-version` de la session Dragon Gems).
- Pour plus tard : la fusion de `dragons-gems-consent` (1.0.1) après cette branche butera aussi sur les §5, §6, §8,
  §10 et §11. Il faudra garder la version de `dragons-gems-consent`, qui décrit déjà les vidéos maison (Accepter /
  Refuser).

## Suite
