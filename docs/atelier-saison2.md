# L'Atelier des Souvenirs — saison 2 : « Le capitaine du retour »

**Statut :** version commune de Claude et Codex (tickets `.collab/tickets/0014` et `0015`, les trois changements
demandés au ticket 0015 intégrés). Validée par l'utilisateur le 30/09 et **jouable** (chapitres 8 à 13,
`src/games/atelier/`, capture complète : `node scripts/snap-atelier-s2.mjs`).
Personnage central : **Lucas**, 16-17 ans (le garçon au voilier du chapitre 3). Les saisons 3 (Mme Garnier) et
4 (Mlle Chen) suivront : cette saison ne consomme pas leurs mystères.

Ce qui ne change pas : la boucle (fusion, restauration en 4 états, restitution), l'atelier, les chaînes et la
progression des joueurs. Suite de `docs/atelier-scenario.md` (saison 1), à ne pas contredire.

## La vérité

Les deux compagnons de Rose en 1813 sont **Élie Varenne**, le second, et **Samuel Kerbrat**, le mousse, 14 ans.
Après avoir caché la malle, ils quittent le port séparément pour rapporter chacun quelques objets confiés : leur
départ poursuit la promesse, ce n'est pas une trahison. Chacun emporte un morceau de carte. Élie Varenne ne
revient jamais : avant de s'embarquer pour de bon, il renvoie le sien par lettre à la famille de Rose, qui en
garde donc deux. Samuel Kerbrat revient s'installer au port ; son morceau, son carnet et son coffre de mousse
restent chez les Kerbrat, le coffre fermé à clé, la clé perdue depuis des générations.

Au **printemps 1961**, **Yves Kerbrat**, 17 ans, apprenti marin et futur grand-père de Lucas, donne au trio le
morceau des Kerbrat : avec les deux de la famille de Rose, ce sont les trois du bureau de Jeanne. En mars 1962,
c'est lui qui barre **La Mouette**, le canot qui emmène Jeanne, Lucile et Henri vers l'îlot. Le ciel est
menaçant ; Lucile insiste, et Yves accepte de partir pour ne pas passer pour un trouillard. Dans la tempête,
Henri sauve Jeanne et Yves ramène le canot fracassé : **tout le monde revient**, mais le groupe se brise.
Yves ne se pardonne pas d'avoir accepté de partir, ni de n'avoir pas su garder l'équipage ensemble après. Il
remise l'épave dans un hangar, ne veut plus entendre parler de la carte et n'ouvre jamais le coffre du mousse.

Le carnet du mousse révèle ce que l'équipage n'a pas pu rendre : **la cloche de L'Espérance**, un navire
marchand de ce port pillé en 1811, gravée des noms de son équipage à lui. Trop lourde et trop reconnaissable
pour voyager avec les restitutions, Samuel l'a cachée sur l'îlot en 1813, « là où l'île regarde le port »,
en se promettant de la rendre un jour au port. Il n'a jamais pu. L'îlot était un leurre pour la malle, pas
pour la cloche.

Et la dédicace « Au capitaine du retour » ne parle ni du mousse ni d'Yves : **elle désigne Lucas**. Enfant, au
bassin, il avait abandonné une course pour ramener les petits bateaux des autres, restés en panne. Yves, qui
n'avait pas su garder son équipage, a reconnu dans ce choix d'enfant ce qu'il aurait voulu être. La famille
fournit une piste ; la valeur du geste est à Lucas seul.

## Chronologie (faits nouveaux)

| Date | Faits |
|---|---|
| 1813 | Élie Varenne et Samuel Kerbrat quittent le port pour d'autres restitutions ; Samuel cache la cloche sur l'îlot. |
| 1813-1814 | Élie Varenne renvoie son morceau à la famille de Rose avant de partir pour toujours. |
| printemps 1961 | Yves Kerbrat, 17 ans, donne le morceau de carte des Kerbrat au trio. |
| mars 1962 | Yves accepte de partir malgré le ciel ; il barre La Mouette dans la tempête, ramène tout le monde ; le canot est détruit. |
| enfance de Lucas | Au bassin, Lucas ramène les bateaux des autres ; Yves construit le voilier et le dédicace. |
| présent | Yves, très âgé, vit dans une maison de retraite au bord du port. |

## Chapitres (8 à 13 de la campagne)

| # | Objet · client | Ce qui se révèle | Gain |
|---|---|---|---|
| 8 | **Boussole de marine** · Lucas | Gravée « Y. K. — La Mouette, 1962 ». Lucas ne connaît pas ce bateau ; son grand-père n'a jamais parlé de 1962. Dans l'étui, une photo de Lucas enfant au bassin, entouré de petits bateaux, et un mot d'Yves : « Pour le capitaine du retour, le jour du bassin. » Lucas croit qu'Yves parle de lui-même. | Panneau d'enquête dans le bureau. |
| 9 | **Fanal de bateau** · M. Morel (cave d'Henri, étiqueté « Mouette ») | **Rebondissement 1 : Henri et le grand-père de Lucas étaient dans le même canot pendant la tempête.** | — |
| 10 | **Longue-vue** · Lucile | Lucile, à qui l'on montre la boussole, complète ce qu'elle seule sait : Yves avait 17 ans quand il leur a donné la carte, c'était « notre capitaine » ; c'est elle qui l'a poussé à partir malgré le ciel, et il s'en est voulu toute sa vie. **Rebondissement 2 : la famille de Lucas gardait un morceau de la carte depuis 1813.** | — |
| 11 | **Coffre du mousse** · Lucas (grenier) | Fermé depuis des générations : on force doucement la serrure. Le carnet de Samuel Kerbrat : les départs de 1813 étaient des restitutions, pas une fuite ; la cloche de L'Espérance, jamais rendue, cachée sur l'îlot. | Chaîne **Marine** (corde → nœud → poulie → voile → gréement), générateur « Coffre du gréeur ». |
| 12 | **La Mouette** · Lucas et M. Morel (hangar) | On restaure le vrai canot ; le club de voile le déclare apte à naviguer. Respiration : Morel raconte Henri marin. Lucas prépare la sortie avec le club. | Zone « Hangar à bateaux ». |
| 13 | **La cloche de L'Espérance** · le climax | Par temps calme, encadré par le club de voile, Lucas barre La Mouette jusqu'à l'îlot ; tu suis la sortie à la radio de Mme Garnier. Il rapporte la cloche ; on la restaure. Sous le vert-de-gris réapparaissent le nom de L'Espérance et ceux de son équipage. Avant de la rendre au port, Lucas la sonne sous la fenêtre de la maison de retraite. **Rebondissement 3 (Codex) : Yves explique enfin le mot de la boussole : « le capitaine du retour », c'est Lucas, le jour où il a ramené les bateaux des autres au bassin.** Yves : « Tout l'équipage est rentré. » | La cloche rendue à la capitainerie du port ; une photo de la cérémonie au mur de l'atelier. |

Fil vers la saison 3 : pendant la cérémonie, Mme Garnier s'arrête longtemps devant un nom de l'équipage de
L'Espérance, puis se tait. Un simple point d'interrogation, sans révéler son secret.

## Règles de ton (ajouts de la saison 2)
- Mer et tempête restent dans le récit. La seule sortie jouée se fait par temps calme, encadrée, et le joueur
  la suit depuis l'atelier : aucun danger, aucun accident possible.
- Yves n'est pas un coupable : il a sauvé tout le monde ; c'est lui qui ne se pardonne pas.
- Pas de « tout le monde descend d'un pirate » : les Kerbrat gardaient un morceau de carte, et le titre de
  capitaine revient à Lucas pour un geste, pas pour son sang.
- Rendre ne lave pas les vols de l'équipage de Rose : on documente une tentative de réparation, on ne
  l'absout pas. La cloche revient au port de L'Espérance, pas à l'atelier.

## Production
- Une seule nouvelle chaîne (Marine), 6 nouveaux objets SVG en 4 états, un décor de hangar (Codex).
- Le « Fin de l'histoire » de la saison 1 devient « Fin de la saison 1 ».
