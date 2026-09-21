# MVP « Rencontres » — carte des parties de pétanque

Spec d'implémentation pour le repo `ludiven-studio/website`. Périmètre volontairement fermé :
tout ce qui n'est pas listé en §1 est **hors sujet**, y compris les idées plausibles listées en §11.

## 1. Ce que le MVP fait, et rien d'autre

Une page publique qui affiche une carte du coin. Sur la carte, des **événements** : un lieu épinglé,
une date, un créneau horaire, un format, un nombre de joueurs et un rôle recherché.

1. Voir les événements sur une carte et dans une liste.
2. Filtrer par date, rôle, places restantes.
3. Créer un événement (en posant une épingle).
4. S'inscrire à un événement.
5. **Se désinscrire.**
6. **Modifier / annuler son événement.**
7. Les événements passés **disparaissent seuls**.

Les points 5 à 7 ne sont pas des bonus : sans eux les compteurs mentent en une semaine, or
« il manque 2 joueurs » est toute la valeur de la page.

**Pas de compte, pas de mail, pas de mot de passe.** Conséquence assumée : rien ne prévient
personne. Si un organisateur annule, les inscrits ne le voient qu'en rouvrant le lien. Le `.ics`
est le seul filet, et il ne rattrape pas une annulation. Ne pas essayer de compenser.

## 2. Contraintes du repo — à lire avant de coder

| Contrainte | Conséquence |
|---|---|
| Astro v5 en **statique** (aucun adapter, pas de `output: 'server'`) | Aucune route serveur possible. Tout le dynamique passe par Supabase depuis le navigateur, ou par une Edge Function. |
| Supabase déjà câblé (`@supabase/supabase-js`, `supabase/migrations/`, Edge Functions) | **Réutiliser** l'instance et les conventions existantes. Ne pas monter un second backend. |
| Pattern de sécurité déjà en place (`20260716120000_secure_scores.sql`) | Le client ne fait que **lire** ; toutes les écritures passent par une Edge Function en `service_role` qui contourne RLS. Reproduire ce schéma tel quel. |
| `playerId()` dans `src/lib/scores.ts` | Identité anonyme stable (uuid en `localStorage`) **déjà existante**. La réutiliser. Ne pas créer un second identifiant. |
| PWA workbox précache tout le shell, `npm run build` lance `scripts/check-precache.mjs` | Une page neuve doit passer ce contrôle. Le JSON Supabase n'est jamais mis en cache (autre origine) — rien à faire de ce côté. |
| Pages FR/EN appairées par hreflang | **Le MVP est FR seulement.** Lancement autour de Saint-Jean-de-Bournay (38). Garder la structure d'URL compatible avec un jumeau `/en/` plus tard, ne pas l'écrire. |

### Le piège des URLs d'événement

Le site étant statique, `/rencontres/e/[id]` **ne peut pas** être prégénéré : l'id n'existe pas au
build. Le lien profond est donc `/rencontres/?e=<id>`, résolu côté client par la même île React.

Conséquence à connaître : l'aperçu Open Graph d'un lien partagé sur Facebook sera la carte
**générique** de la page, pas l'événement. Acceptable pour le MVP ; ne pas tenter de contourner.

## 3. URLs

- `/rencontres/` — la page, unique. Titre et contenu disent explicitement « pétanque ».
- `/rencontres/?e=<id>` — ouvre la fiche d'un événement.
- `/rencontres/?e=<id>&k=<secret>` — ouvre la fiche en mode organisateur (modifier / annuler).

Court, ça se colle dans un post Facebook. Ne pas la ranger sous `/petanque-scanner/` : la page doit
vivre seule, c'est elle qui ramènera du monde vers l'app, pas l'inverse.

À ajouter au `filter` du sitemap ? **Non** — cette page doit être indexée.

## 4. Modèle de données

Trois tables, préfixe `meetup_`. Migration `supabase/migrations/<date>_meetups.sql`.

### `meetup_spots` — les lieux

| Colonne | Type | Note |
|---|---|---|
| `id` | uuid pk | |
| `lat`, `lng` | double precision | |
| `label` | text | **écrit par l'Edge Function uniquement**, jamais par le client |
| `commune` | text | |
| `source` | text | `'osm'` \| `'user'` |
| `confirmed` | boolean default false | voir §6 |
| `created_at` | timestamptz default now() | |

### `meetup_events`

| Colonne | Type | Note |
|---|---|---|
| `id` | uuid pk | |
| `spot_id` | uuid → `meetup_spots` | |
| `starts_at`, `ends_at` | timestamptz | le créneau ; `ends_at` pilote l'expiration |
| `format` | text | `tete-a-tete` \| `doublette` \| `triplette` \| `melee` \| `mini-tournoi` |
| `players_needed` | int | total de places, y compris l'organisateur |
| `role_needed` | text | `any` \| `tireur` \| `pointeur` |
| `organizer_id` | uuid | le `playerId()` du navigateur |
| `organizer_name` | text | prénom, ≤ 24 car. |
| `organizer_seats` | int default 1 | un couple sur un seul navigateur compte pour 2 |
| `secret` | text | jeton admin, `gen_random_uuid()` ; **jamais exposé en lecture** |
| `status` | text default `'open'` | `open` \| `cancelled` |
| `created_at`, `updated_at` | timestamptz | |

### `meetup_signups`

| Colonne | Type | Note |
|---|---|---|
| `id` | uuid pk | |
| `event_id` | uuid → `meetup_events` on delete cascade | |
| `player_id` | uuid | |
| `player_name` | text | prénom, ≤ 24 car. |
| `seats` | int default 1 | |
| `role` | text | `any` \| `tireur` \| `pointeur` |
| `created_at` | timestamptz | |

`unique (event_id, player_id)` — on ne s'inscrit qu'une fois, on modifie `seats` sinon.

### Lecture

Une vue `meetup_events_public` qui **exclut `secret`**, joint le lieu, et expose
`seats_taken = organizer_seats + coalesce(sum(signups.seats), 0)`.

RLS : `select` autorisé à `anon` sur la vue et sur `meetup_spots` ; **aucun** `insert` / `update` /
`delete` pour `anon` sur les trois tables. Si le client peut écrire, le MVP est spammable le jour où
quelqu'un ouvre l'onglet réseau.

## 5. Écritures — Edge Function `meetups`

Une seule fonction, champ `action` dans le corps (le repo a les deux styles ; une seule fonction
évite trois déploiements). Elle valide, géocode, écrit, et renvoie l'état.

| Action | Entrée | Règles |
|---|---|---|
| `create_event` | lat/lng ou spot_id, dates, format, places, rôle, prénom, sièges | crée/réutilise le lieu (§6), renvoie `{id, secret}` **une seule fois** |
| `update_event` | id, secret, champs modifiables | refuse si `secret` faux |
| `cancel_event` | id, secret | passe `status='cancelled'`, ne supprime pas |
| `join` | event_id, player_id, prénom, sièges, rôle | refuse si complet, annulé, ou passé |
| `leave` | event_id, player_id | supprime la ligne |

**Validations non négociables** (côté fonction, jamais côté client seul) :

- `starts_at` dans le futur, `ends_at > starts_at`, durée ≤ 12 h, date ≤ 60 jours à l'avance ;
- `players_needed` ∈ {2, 4, 6, 8, 12, 16}, `seats` ∈ [1, 4] ;
- `seats_taken + seats <= players_needed` — calculé **en base**, dans une transaction, pas d'après
  ce que le client croit savoir ;
- prénoms : ≤ 24 caractères, URLs et `<>` rejetés. **C'est le seul texte libre du produit** ;
  tout le reste est une liste fermée ou une date.

**Quotas anti-abus**, sans compte : par `player_id` et par hash d'IP, max 3 créations / jour et
20 inscriptions / jour. Le repo a déjà ce réflexe (`max_attempts_per_day` dans `public.games`).

## 6. Les lieux : épingle libre, nom fermé

C'est le point de conception central. Un joueur doit pouvoir signaler la petite place ou le chemin
que seuls les joueurs connaissent — sinon la carte ne sert à rien. Mais personne ne tape de nom.

1. **Amorçage** : script ponctuel (`scripts/seed-meetup-spots.mjs`) qui importe via Overpass les
   éléments `sport=boules` dans un rayon de 25 km autour de 45.4489, 5.1381 (≈ 143 trouvés), en
   `source='osm'`, `confirmed=true`. Deux réserves : le tag mélange pétanque et boule lyonnaise, et
   **il n'y a rien à moins de 5 km de Saint-Jean-de-Bournay** — d'où la nécessité de l'épingle libre.
   Overpass refuse les requêtes sans `User-Agent`.
2. **Épingle libre** : l'utilisateur pose un point n'importe où. Une coordonnée n'est pas du contenu
   publiable, donc rien à modérer.
3. **Nom dérivé** : l'Edge Function appelle le géocodage inverse Nominatim (jamais depuis le
   navigateur — la politique d'usage impose un `User-Agent` et 1 req/s) et compose
   `« <commune> — <lieu-dit ou rue> »`. Le résultat est mis en cache dans `meetup_spots`.
4. **Fusion à 30 m** : une épingle posée près d'un lieu existant le réutilise. Sans ça on obtient
   douze variantes du même boulodrome. Calcul haversine en SQL — **ne pas ajouter PostGIS** pour ça.
5. **Promotion par l'usage** : un lieu `source='user'` naît `confirmed=false` et s'affiche en creux.
   Il passe `confirmed=true` dès qu'un **second** `organizer_id` distinct y crée un événement. Une
   épingle posée dans un jardin privé reste en creux et meurt d'elle-même. Aucun modérateur.

## 7. Expiration

Un événement disparaît de la carte quand `ends_at < now()` — **filtre dans la requête de lecture**,
pas un cron (site statique, pas d'ordonnanceur garanti). Purge des lignes de plus de 30 jours :
optionnelle, `pg_cron`, hors MVP.

Un événement `cancelled` disparaît aussi de la carte, mais reste accessible par son lien direct en
affichant « annulé » — c'est la seule façon pour un inscrit de comprendre ce qui s'est passé.

## 8. Interface

Île React `client:only="react"`, comme les jeux.

- **Carte** : Leaflet 1.9 + tuiles OSM. Pas de MapLibre ni Google : les deux demandent une clé de
  tuiles, et Google ajoute un bandeau de consentement. Attribution OSM obligatoire, visible.
- **Géolocalisation du visiteur** : bouton « autour de moi » uniquement, jamais automatique.
  Mentionner les tuiles tierces sur la page confidentialité.
- **Liste sous la carte**, triée par date, synchronisée avec la carte (survol ↔ épingle). Sur
  mobile la liste prime : c'est là que ça se lit.
- **Filtres** : date (aujourd'hui / ce week-end / 7 jours / tout), rôle, « places restantes ».
  Filtrage **côté client** sur l'ensemble déjà chargé — au lancement il y aura 20 événements, pas
  20 000. Ne pas écrire de filtrage serveur.
- **Créer** : formulaire entièrement fermé (listes déroulantes + date + carte), un seul champ
  texte : le prénom.
- **Fiche événement** : lieu, quand, format, `seats_taken / players_needed`, rôle recherché, liste
  des prénoms inscrits, bouton s'inscrire / se désinscrire, bouton `.ics`, bouton copier le lien.
- **`.ics`** : généré côté client, chaîne à la main, aucune dépendance.

### Identité sans compte

- `playerId()` de `src/lib/scores.ts` — **réutiliser**, ne pas dupliquer.
- Prénom mémorisé en `localStorage`.
- Le `secret` d'organisateur est renvoyé une fois : le stocker en `localStorage` **et** afficher le
  lien `?e=<id>&k=<secret>` à copier, avec la mention « garde ce lien pour modifier ou annuler ».
  Un navigateur vidé sans ce lien orpheline l'événement — c'est le prix du « sans mail », et il doit
  être écrit à l'écran, pas caché.

## 9. Mesure

Umami est déjà installé (`src/components/MainHead.astro`). Événements à poser dès la première
version, sinon chaque décision ultérieure est une devinette :

`meetup_view`, `meetup_create`, `meetup_join`, `meetup_leave`, `meetup_cancel`,
`meetup_ics`, `meetup_share`, `meetup_scanner_click`.

**Critère d'arrêt, à écrire maintenant et à tenir.** Six semaines après le premier partage dans les
groupes Facebook :

- moins de 10 événements créés par des personnes autres que toi, **ou**
- moins de 30 % des événements atteignant leur nombre de joueurs

⇒ le besoin n'est pas là où on le croyait, on arrête et on n'entretient pas une carte vide.

## 10. Lien vers l'app

Un bloc discret sur la fiche événement : « vous jouez le <date> ? Pétanque Scanner compte les
points au téléphone », vers `/petanque-scanner/`, tracké `meetup_scanner_click`. C'est le seul
endroit où l'app apparaît. La carte n'est pas une publicité pour l'app, c'est un service qui se
suffit — et c'est précisément pour ça qu'elle en ramènera.

## 11. Hors périmètre — explicitement

Notes / réputation entre joueurs, messagerie, comptes, mail, notifications push, version EN, images
Open Graph par événement, interface de modération, carte dans l'app mobile, historique de parties,
profils. Chacune a été discutée et écartée pour ce lot. Si l'une redevient nécessaire, ce sera après
les chiffres du §9, pas avant.
