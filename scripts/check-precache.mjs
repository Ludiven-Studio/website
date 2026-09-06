// Fails the build when the service worker precache manifest is wrong.
//
// Workbox installs a precache all-or-nothing: one URL that 404s aborts the whole install, so
// nobody gets a service worker and anyone holding an old one stays frozen on it. Nothing warns
// you — not the build, not the console. It went unnoticed for months once, so it is checked here.
//
// Two ways the manifest goes bad, both seen in production:
//   A. an entry points at nothing the host can serve;
//   B. a precached chunk imports a chunk that is NOT precached — fine today, 404 after the next
//      deploy changes that chunk's hash, and the island never mounts (blank game page).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '');

// Every file in dist, as host-relative posix paths.
const files = new Set();
(function walk(dir, prefix) {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full, prefix ? `${prefix}/${name}` : name);
		else files.add(prefix ? `${prefix}/${name}` : name);
	}
})(DIST, '');

const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
// Minified workbox writes unquoted keys. Read the real file before trusting this pattern: an
// empty match set is a silent pass, which is worse than no check at all — hence the floor below.
const entries = [...sw.matchAll(/\{url:"([^"]+)",revision:(?:null|"[^"]*")\}/g)].map((m) => m[1]);
if (entries.length < 100) {
	console.error(`precache: only ${entries.length} entries parsed from sw.js — the workbox format changed, fix the pattern in scripts/check-precache.mjs`);
	process.exit(1);
}

// Resolve a precache URL the way a static host does. Astro strips ".html" and "/index.html" from
// the URLs it hands workbox, so most entries are extensionless.
function resolve(url) {
	const p = decodeURIComponent(url).replace(/^\//, '').replace(/\/$/, '');
	if (p === '') return files.has('index.html') ? 'index.html' : null;
	if (files.has(p)) return p;
	if (files.has(`${p}.html`)) return `${p}.html`;
	if (files.has(`${p}/index.html`)) return `${p}/index.html`;
	return null;
}

const failures = [];
const inManifest = new Set(entries.map((u) => decodeURIComponent(u).replace(/^\//, '')));

for (const url of entries) {
	const file = resolve(url);
	if (!file) {
		failures.push(`A. "${url}" resolves to no file in dist — this one entry disables the whole PWA`);
		continue;
	}
	if (!file.endsWith('.js')) continue;
	const code = readFileSync(join(DIST, file), 'utf8');
	// Relative specifiers only: bare ones are bundled, absolute ones are not chunks. A literal
	// that is not really an import resolves to nothing and is skipped, so this cannot false-alarm.
	for (const m of code.matchAll(/["'](\.{1,2}\/[^"'`\s]+\.js)["']/g)) {
		const target = posix.normalize(posix.join(posix.dirname(file), m[1]));
		if (files.has(target) && !inManifest.has(target)) {
			failures.push(`B. "${file}" imports "${target}", which is not precached — it will 404 once its hash changes`);
		}
	}
}

if (failures.length) {
	console.error(`precache: ${failures.length} problem(s) in ${entries.length} entries`);
	for (const f of [...new Set(failures)]) console.error(`  ${f}`);
	process.exit(1);
}
console.log(`precache: ${entries.length} entries, all resolve and all their imports are precached`);
