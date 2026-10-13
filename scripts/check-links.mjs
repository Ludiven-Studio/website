// Fails the build when a page links to another page without its trailing slash.
//
// GitHub Pages answers /jeux/tapis with a 301 to /jeux/tapis/. Google crawls every such link and
// files it under "Page avec redirection" in Search Console: 59 of 73 non-indexed URLs, 2026-10.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '');

const pages = [];
(function walk(dir) {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full);
		else if (name.endsWith('.html')) pages.push(full);
	}
})(DIST);

const bad = new Map();
for (const page of pages) {
	const html = readFileSync(page, 'utf8');
	for (const [, p] of html.matchAll(/href="(\/[^"?#]*?[^/"?#])(?:[?#][^"]*)?"/g)) {
		if (/\.[a-z0-9]+$/i.test(p)) continue;
		if (!existsSync(join(DIST, p, 'index.html'))) continue;
		if (!bad.has(p)) bad.set(p, page.slice(DIST.length));
	}
}
if (pages.length < 50) {
	console.error(`links: only ${pages.length} pages found in dist — wrong folder?`);
	process.exit(1);
}
if (bad.size) {
	console.error(`links: ${bad.size} internal link(s) miss the trailing slash (each one is a 301 on GitHub Pages):`);
	for (const [p, from] of bad) console.error(`  ${p}  (e.g. in ${from})`);
	process.exit(1);
}
console.log(`links: ${pages.length} pages, every internal page link ends with a slash`);
