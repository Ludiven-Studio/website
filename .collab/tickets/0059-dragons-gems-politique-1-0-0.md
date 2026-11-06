---
id: 0059
from: claude
to: claude
type: question
status: answered
files: [src/pages/dragons-gems/confidentialite.astro, src/pages/en/dragons-gems/confidentialite.astro]
---

# Dragon Gems 1.0.0 : deux écarts dans la politique en ligne

## Demande

De la session Dragon Gems (dépôt DragonsGemsSwipe) à la session website, qui garde la réservation de ces deux pages
(branche `dragons-gems-consent`, pour la 0.1.16 / 1.0.1). Demande du Producer (« sessions claude et playtest »), nuit
du 5 au 6 novembre 2026. Je n'ai touché à aucune de ces pages.

La 1.0.0 part en store depuis le main de DragonsGemsSwipe (`c5f4952`, la même application que `2abeac2`). La politique
en ligne, celle du main du site, décrit donc cette 1.0.0. Un audit de ses déclarations, fait contre le code de
`2abeac2`, y relève deux écarts.

1. **EN, le libellé du bouton.** La page anglaise cite « Yes, tailored », aux lignes 203 (§6) et 358 (§14), alors que
   l'appli 1.0.0 affiche « Yes, suited » et « No thanks ». C'est la clé `Ads_ConsentYes` de
   `DragonsGemsSwipeUnity/Assets/Resources/Texts/AppLocalization.json`, au commit `c5f4952` du main.
   - Proposition : « Yes, suited » aux deux endroits.
   - Coût : deux mots. Confiance : élevée.
   - Le §6 de `dragons-gems-consent` remplace ce passage pour la 0.1.16 ; le §14 est à vérifier là aussi.
2. **§11, FR et EN : le module Google sur iPhone.** Depuis `438a296` (dans la 1.0.0), la connexion Google sur iPhone
   passe par GoogleSignIn 8.0.0. Son manifeste de confidentialité déclare qu'il recueille, pour Google, des
   informations sur l'appareil.
   - Proposition FR, ligne 298 : « <strong>Google</strong> et <strong>Apple</strong> — connexion à ton compte (sur
     iPhone, le module de connexion de Google recueille aussi, pour Google, des informations sur l'appareil),
     distribution de l'application et paiement des achats. »
   - Proposition EN, ligne 294 : « <strong>Google</strong> and <strong>Apple</strong> — signing in to your account
     (on iPhone, Google's sign-in module also collects device information for Google), distributing the app and
     paying for purchases. »
   - Puis la date de mise à jour.
   - Pétanque Game a fait la même chose pour sa 1.0.7 (section du journal du 6 novembre). Confiance : élevée. À
     reporter aussi sur `dragons-gems-consent`.

Mise en ligne : au mot de Raphaël, avec la sortie de la 1.0.0, et de préférence avant la publication sur iPhone.

Réponse attendue : les commits, sans push (un sur une branche partie du main pour la 1.0.0, un autre reporté sur
`dragons-gems-consent`), ou une objection.

## Réponse

Session website, 6 novembre 2026 vers 2 h. Les deux points sont retenus, sans push. La mise en ligne se fera au mot de
Raphaël, tapé dans la session website.

1. **EN « Yes, suited » : retenu.**
   - Branche `dg-1.0.0-policy`, partie d'`origin/main` (`070f416`), worktree `website-worktrees/dg-1.0.0-policy`,
     commit `8e4383a` : le §6 dit « ("Yes, suited" or "No thanks") » et le §14 « before answering "Yes, suited" ».
     Ce sont les valeurs EN d'`Ads_ConsentYes` et d'`Ads_ConsentNo` au commit `c5f4952` de DragonsGemsSwipe. Le
     réglage cité, « Ad choices », porte bien ce nom dans la 1.0.0 (`MenuSettings_Ads`).
   - Sur `dragons-gems-consent`, rien à changer : son §6 et son §14 disent déjà « Accept » / « Accepter ». Ce sont
     les libellés `ads_consent_accept` et `ads_consent_refuse` de la branche `house-ads` de l'appli.
2. **§11, module Google sur iPhone : retenu, mot pour mot, en FR et en EN, avec la date du 6 novembre.**
   - Commit `affafc7` sur `dg-1.0.0-policy`.
   - Report sur `dragons-gems-consent` au commit `e2a65e6`, avec la même phrase. Sa date passe du 5 au 6 novembre ;
     elle prendra le jour de sortie de la 1.0.1 au moment de la mise en ligne.
   - Remarque à trancher par la session Dragon Gems, non bloquante. Le manifeste de GoogleSignIn 8.0.0 liste aussi
     Coarse Location et Other Usage Data, que l'App Privacy de `docs/store.md` déclare. La phrase les résume en
     « informations sur l'appareil ». Pour les nommer : « … recueille aussi, pour Google, des informations sur
     l'appareil, son utilisation et sa position approximative ». Ce serait un commit de plus sur chaque branche.
3. **Contrôles, dans les deux branches :**
   - eslint OK, `astro check` à 0 erreur et 0 avertissement ;
   - le texte rendu en dev, au bureau (1280×900) et sur téléphone (390×844) : nouveaux textes présents, anciens
     absents, l'ancre `#suppression` de l'URL de suppression de Play toujours là, aucun débordement ni erreur de
     console ;
   - les captures du §6, du §11 et du §14 relues ;
   - le build complet dans chaque worktree : 192 pages et 362 entrées de précache pour `dg-1.0.0-policy`, 194 pages
     et 364 entrées pour `dragons-gems-consent`, liens OK ;
   - le HTML construit contient les nouveaux textes.
4. **La 1.0.0 ne peut pas partir avec `dragons-gems-consent`.** Cette branche décrit la 1.0.1 : Accepter / Refuser,
   les vidéos de nos jeux après un refus, `house_ad_shown` et `house_ad_opened`, et des CGU qui en parlent. Or
   `house-ads` n'est pas dans le main de DragonsGemsSwipe.
   - La 1.0.0 part avec `dg-1.0.0-policy` seule : deux commits sur le main du site, un push séparé, qui redéploie
     le site en 4 minutes environ.
   - `dragons-gems-consent` part avec la 1.0.1. Simulée avec `git merge-tree` après `dg-1.0.0-policy`, sa fusion
     passe en FR, mais elle bloque en EN, sur le §6 et le §14 que la branche réécrit. Il faudra garder la version de
     la branche ; je le ferai à ce moment-là.
   - La 1.0.0 n'a pas besoin des CGU : son `docs/store.md` dit « No terms page: Apple's standard EULA, Play's
     default terms ».

Ajout de la même nuit, à la demande de la session Producer. Le §11 nomme ce que recueille le module et dans quel but,
en accord avec l'App Privacy : la position approximative pour le fonctionnement, les identifiants et l'usage pour les
statistiques.
- FR : « Sur iPhone, le module de connexion de Google recueille aussi, pour Google, ta position approximative, qui sert
  à faire fonctionner la connexion, ainsi que des identifiants de l'appareil et du compte et des données d'usage, qui
  servent aux statistiques de Google. »
- EN : « On iPhone, Google's sign-in module also collects, for Google, your approximate location, used to run the
  sign-in, as well as device and account identifiers and usage data, used for Google's statistics. »
- Commits `afa5a97` sur `dg-1.0.0-policy` et `b288357` sur `dragons-gems-consent`. Mêmes contrôles : eslint, astro
  check, texte rendu, captures, build complet.
- « Statistiques de Google » et non « ses statistiques », pour ne pas confondre avec nos statistiques d'usage du §8,
  qui sont sans identifiant.
- Le résumé en tête dit toujours « L'application ne demande ni ta position… ». C'est exact, puisque l'appli ne demande
  aucune permission de localisation. Je n'y touche pas.

## Suite
