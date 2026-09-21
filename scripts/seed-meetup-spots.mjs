// One-off import of the OSM `sport=boules` places around Saint-Jean-de-Bournay
// into meetup_spots, so /rencontres does not open on an empty map.
//
// Writes through the meetups function's seed_spots action, not with the
// service_role key: the master credential never leaves Supabase, and routing the
// import through the same 30 m merge path as a real pin makes re-running it a
// no-op. Run it twice — the second pass must report "cree: 0".
//
//   $env:MEETUPS_ADMIN_KEY = '...'; node scripts/seed-meetup-spots.mjs
//
// Overpass refuses requests without a User-Agent.

import { readFileSync } from 'node:fs';

const CENTER = [45.4489, 5.1381];
const RADIUS_M = 25000;
const BATCH = 100;
const UA = 'ludiven-studio-seed/1.0 (https://ludiven-studio.fr; raphael.benedetto.pro@gmail.com)';
// Tried in order. The main instance answers 504 "server is probably too busy"
// often enough that a single endpoint makes the script a coin flip.
const MIRRORS = [
	'https://overpass-api.de/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter',
	'https://overpass.osm.ch/api/interpreter',
];

const KEY = process.env.MEETUPS_ADMIN_KEY;
if (!KEY) { console.error('MEETUPS_ADMIN_KEY manquante'); process.exit(2); }

// Read the project URL from the same file the site ships, rather than keeping a
// second copy that can drift.
const site = readFileSync(new URL('../src/data/site.ts', import.meta.url), 'utf8');
const pick = (name) => site.match(new RegExp(`${name}\\s*=\\s*'([^']+)'`))?.[1];
const SUPABASE_URL = pick('SUPABASE_URL');
const SUPABASE_ANON_KEY = pick('SUPABASE_ANON_KEY');
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { console.error('src/data/site.ts: Supabase non configure'); process.exit(2); }

const query = `[out:json][timeout:90];
(
  node["sport"="boules"](around:${RADIUS_M},${CENTER[0]},${CENTER[1]});
  way["sport"="boules"](around:${RADIUS_M},${CENTER[0]},${CENTER[1]});
  relation["sport"="boules"](around:${RADIUS_M},${CENTER[0]},${CENTER[1]});
);
out center tags;`;

console.log(`Overpass: sport=boules dans ${RADIUS_M / 1000} km de ${CENTER.join(', ')}…`);
let elements = null;
for (const url of MIRRORS) {
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
			body: `data=${encodeURIComponent(query)}`,
		});
		if (!res.ok) { console.log(`  ${new URL(url).host}: ${res.status}, miroir suivant…`); continue; }
		({ elements = [] } = await res.json());
		console.log(`  ${new URL(url).host}: ok`);
		break;
	} catch (e) {
		console.log(`  ${new URL(url).host}: ${e.message}, miroir suivant…`);
	}
}
if (!elements) { console.error('Tous les miroirs Overpass ont refuse. Relance plus tard.'); process.exit(1); }

const spots = [];
for (const el of elements) {
	const lat = el.lat ?? el.center?.lat;
	const lng = el.lon ?? el.center?.lon;
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
	const t = el.tags ?? {};
	spots.push({
		osmId: `${el.type}/${el.id}`,
		lat,
		lng,
		label: t.name || t['name:fr'] || 'Boulodrome',
		commune: t['addr:city'] || '',
	});
}
console.log(`${elements.length} elements, ${spots.length} exploitables.`);
if (!spots.length) process.exit(0);

let seen = 0;
let created = 0;
for (let i = 0; i < spots.length; i += BATCH) {
	const chunk = spots.slice(i, i + BATCH);
	const r = await fetch(`${SUPABASE_URL}/functions/v1/meetups`, {
		method: 'POST',
		headers: {
			apikey: SUPABASE_ANON_KEY,
			Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ action: 'seed_spots', adminKey: KEY, spots: chunk }),
	});
	const body = await r.json().catch(() => ({}));
	if (!r.ok) { console.error(`seed_spots ${r.status}: ${body.error ?? ''}`); process.exit(1); }
	seen += body.seen ?? 0;
	created += body.created ?? 0;
	console.log(`  lot ${i / BATCH + 1}: ${body.seen} envoyes, ${body.created} crees`);
}

console.log(`Termine: ${seen} envoyes, ${created} crees.`);
console.log(created === 0 ? 'Rien de neuf — idempotent.' : 'Relance le script : le second passage doit creer 0.');
