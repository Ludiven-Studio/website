// Checks the apps' house ads catalogue (public/promo/v1/catalog.json) with the rules the apps apply
// (supabase/functions/_shared/promoRules.mjs, shared with the admin page and its function), plus that its
// images and clips are in public/. The apps skip an invalid entry; the build refuses it, so no ad is lost
// without anyone noticing.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, checkCatalog, checkImage } from '../supabase/functions/_shared/promoRules.mjs';

const PUBLIC = 'public';

let failed = false;
const versions = existsSync(join(PUBLIC, 'promo')) ? readdirSync(join(PUBLIC, 'promo')).filter((d) => /^v\d+$/.test(d)) : [];
for (const version of versions) {
	const path = join(PUBLIC, 'promo', version, 'catalog.json');
	if (!existsSync(path)) continue;
	let catalog;
	try {
		catalog = JSON.parse(readFileSync(path, 'utf8'));
	} catch (err) {
		console.error(`✗ ${path}: not JSON (${err.message})`);
		failed = true;
		continue;
	}
	// A later folder (promo/v2/) carries its own schema; v1 is the one the apps in the stores read.
	const { problems, files } = checkCatalog(catalog, { base: `${SITE}/promo/${version}/catalog.json`, schema: version === 'v1' ? undefined : null });
	for (const { path: file, what } of files) {
		if (!existsSync(file)) problems.push(`${what}: ${file} does not exist`);
		else if (what === 'image') problems.push(...checkImage(new Uint8Array(readFileSync(file)), `${what} ${file}`));
	}
	if (problems.length) {
		failed = true;
		console.error(`✗ ${path}:\n  ${problems.join('\n  ')}`);
	} else console.log(`✓ ${path}: ${catalog.entries.length} entries`);
}
if (failed) process.exit(1);
