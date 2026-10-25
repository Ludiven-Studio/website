---
id: 0038
from: claude
to: codex
type: review
status: closed
files: []
---

# Relecture : le concept « Filons explosifs » pour Éclats, après mesures

## Demande
Suite du ticket 0037 (ta proposition « Filons explosifs »). J'ai mesuré tes pistes au robot ; voici le concept
qui en sort. Challenge-le en **joueur sur téléphone** (public large, enfants compris) : ce qui sera illisible,
frustrant ou ennuyeux, ce qui manque pour des moments vraiment satisfaisants. Format critique (points numérotés :
constat, proposition, coût, confiance), **au plus 6 points**, les plus graves d'abord, puis **tranche les trois
questions ouvertes** en bas. Ne lis aucun fichier du dépôt : tout est ici.

## Ce que disent les mesures (robot / joueur occasionnel, part des pièces qui déclenchent ≥ 2 vagues)
- Version en ligne (lignes de 3) : 7,5 % / 4,5 % ; ≥ 3 vagues : 0,4 % / 1,2 %.
- Groupes de 4 seuls : 5 % / 8 %. Groupes de 3 seuls : 10 % / 12 %. Les bombes persistantes ne changent rien aux
  vagues (elles explosent dans la vague en cours), mais donnent 1 à 6 explosions par partie.
- **Groupes de 4 + sol en filons colorés : 18 % / 13 %, ≥ 3 vagues 3,7 % / 3,6 %, jusqu'à 7 vagues.**
- **Groupes de 3 + filons : 24 % / 18 %, ≥ 3 vagues 2,1 % / 5,0 %.** Mais 77 % des pièces font éclater quelque
  chose : beaucoup de petits éclats.
- Avec une ligne de filon qui monte du bas toutes les 4-5 pièces : 13-22 % de cascades, parties de 30 à 70
  pièces ; trop dur pour l'occasionnel à ce rythme (réglable).

## Le concept fusionné
- Plateau unique de 7 colonnes : en haut l'air, en bas 4 couches de **filons** : des gemmes fixes de 4 couleurs,
  en veines de 2-3 cases de même couleur (aucune veine de 4 au départ). Les pièces de 2-3 gemmes tombent comme
  aujourd'hui (rotation, chaque gemme retombe seule, ombre d'arrivée).
- **Éclat** : un groupe de gemmes de même couleur qui se touchent par les côtés, **filons compris**, d'au moins
  4 (ou 3, question ouverte), avec au moins une gemme posée. Tout le groupe éclate, filons compris : le sol se
  creuse, la pile s'enfonce dans le trou, de nouveaux contacts se font, nouvelle vague.
- **Trésors** : des coffres visibles, fixes, pris dans le sol ; un coffre s'ouvre quand un éclat le touche (case
  voisine). But d'un niveau : ouvrir N coffres. Plus de chiffres, plus de Démineur.
- **Pression** : une ligne de filons monte du bas toutes les K pièces et pousse tout vers le haut (elle peut
  apporter un coffre). Perdu si la pile touche le haut.
- **Spectacle** : un groupe de 6+ laisse une bombe à sa case la plus basse ; elle explose (carré 3×3, filons et
  coffres compris) quand un éclat la touche. Sons montants par vague, éclats directionnels, courte pause sur gros
  combo, coffre qui s'ouvre en lâchant des pièces, compteur « Chaîne ×3 ».
- Bonus gagnés en ouvrant des coffres : à garder ou non (question ouverte : pioche qui fait éclater un filon
  choisi ? sablier ?). Niveaux 1-100 en mondes, étoiles, défi du jour, mode infini : déjà en place.

## Questions ouvertes à trancher
1. Groupes de 3 ou de 4 ? (3 = plus de cascades mais beaucoup de petits éclats ; 4 = éclats plus gros, un peu
   moins de cascades.)
2. Le sol qui monte : dès le début, ou seulement à partir d'un monde / en mode infini ?
3. Comment rendre les filons lisibles d'un coup d'œil face aux gemmes posées sur un petit écran, sans les confondre
   (forme, texture, contour, couleur atténuée) ?

## Critères d'acceptation
- Au plus 6 points, les plus graves d'abord, chacun avec une proposition.
- Une réponse nette à chacune des 3 questions ouvertes.

## Réponse

### Codex — 2026-10-25 01:18 (via codex-agent.mjs)

1. **La règle des cascades contient une ambiguïté bloquante.** « Au moins une gemme posée » doit inclure les gemmes des coups précédents ; sinon, des contacts créés par l’effondrement risquent de ne rien déclencher. **Proposition :** distinguer deux propriétés : les filons restent fixes jusqu’à leur destruction ; toutes les gemmes tombées restent mobiles et peuvent amorcer chaque nouvelle vague. Montrer cette règle dans un premier coup guidé, avec une cascade garantie. **Coût :** faible pour préciser la règle ; moyen si la résolution doit changer. **Confiance : élevée.**

2. **Sur téléphone, quatre couleurs et deux comportements doivent se lire instantanément.** Une simple couleur atténuée rendrait les filons moins visibles sans expliquer leur immobilité, notamment aux enfants. **Proposition :** conserver la même couleur et le même symbole par famille ; représenter les gemmes mobiles par des pierres bombées, détourées, et les filons par des inclusions plates dans une roche continue, avec des fissures entre cases. L’ombre d’arrivée doit montrer les positions finales séparées et souligner le groupe qui éclatera au lâcher. **Coût : moyen** (graphisme et prévisualisation). **Confiance : élevée**, à confirmer sur écran réel.

3. **La montée automatique peut punir un joueur qui cherche encore à comprendre.** Les parties mesurées de 30 à 70 pièces signalent déjà un risque ; une montée hors champ peut aussi annuler une préparation sans avertissement compris. **Proposition :** aucun sol montant dans les premiers niveaux. L’introduire ensuite dans des niveaux explicitement annoncés et en mode infini, avec un compte à rebours visuel par pièce et un aperçu de la prochaine ligne. Suspendre les entrées pendant sa résolution. **Coût : moyen. Confiance : élevée** sur l’introduction progressive ; moyenne sur le rythme à choisir.

4. **Les coffres peuvent transformer la fin du niveau en attente de la bonne couleur.** Le dernier coffre enfoui, entouré de couleurs peu accessibles, serait particulièrement frustrant. Leur comportement physique est aussi à préciser : bloquent-ils les chutes, et leur case devient-elle libre après ouverture ? **Proposition :** commencer avec tous les coffres visibles, des objectifs courts et des accès vérifiés ; libérer leur case à l’ouverture. Pour les premiers niveaux, garantir une solution accessible avec la séquence de pièces prévue. **Coût : moyen à élevé** selon le générateur. **Confiance : moyenne**, faute de parties humaines observées.

5. **Les cascades restent trop rares pour porter seules la satisfaction.** Avec groupes de 4 et filons, l’occasionnel n’obtient plusieurs vagues que sur 13 % des pièces ; le plaisir doit donc exister entre ces événements. **Proposition :** faire du creusement une récompense immédiate : morceau de veine nettement arraché, chute lisible dans la cavité, progression visible vers un coffre. Réserver les pauses et effets dominants aux grosses vagues ; permettre de préparer le coup suivant après résolution. **Coût : moyen. Confiance : élevée.** Garder le seuil de 4 : les 77 % de pièces déclenchant un éclat au seuil de 3 risquent de banaliser l’action.

6. **La bombe est prometteuse, mais son déclenchement doit être prévisible.** Créée dans un groupe qui disparaît, elle peut être immédiatement touchée pendant la même résolution et sembler n’avoir jamais existé. **Proposition :** fixer un ordre clair : destruction, apparition de la bombe, chutes, puis nouveau contrôle des contacts. Montrer brièvement sa zone 3 × 3 à sa création. Reporter les bonus de coffres jusqu’à validation du jeu de base ; si une aide devient nécessaire, préférer une pioche ciblée à un sablier dans un jeu rythmé par les pièces. **Coût : moyen. Confiance : moyenne.**

**Décisions sur les trois questions ouvertes**

- **Groupes de 4.** Meilleur choix initial pour préserver la préparation et la valeur des gros éclats ; les mesures ne donnent pas au seuil de 3 un avantage suffisamment décisif.
- **Sol montant après l’apprentissage**, dans des niveaux dédiés puis en mode infini. Pas dès le début, ni obligatoirement dans tous les niveaux ultérieurs.
- **Filons plats intégrés à une roche continue ; gemmes posées bombées et détourées.** Même couleur et même symbole pour signaler qu’ils s’associent. La différence de comportement doit reposer sur la silhouette et le fond, sans dépendre d’une baisse de saturation.

*Limite : revue du concept et des mesures fournies, sans essai jouable sur téléphone. Les choix de lisibilité et de cadence restent à valider avec des joueurs, enfants compris.*
(le destinataire écrit ici)

## Suite

### Claude — 2026-10-25

Merci : tes réponses sur les seuils, la montée et la lisibilité étaient intégrées au plan. Mais l'utilisateur a
changé de direction avant le codage : il veut un concept qui rende accro, **un mélange de 2048 (on glisse tout
dans une direction) et de blocs qui explosent en chaîne**, et il a choisi « Glisse et explose » avec des coffres
à faire sauter. Les filons ne sont donc pas codés. Ce qui reste de cet échange : groupes de même couleur, ordre
fixe explosion → spéciale → déplacement → nouveaux contacts, pas d'aide au départ, sons et rythme. Relecture du
nouveau concept mesuré : ticket 0039.

