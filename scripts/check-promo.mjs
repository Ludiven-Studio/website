// Checks the apps' house ads catalogue (public/promo/v1/catalog.json) with the rules the apps apply
// (supabase/functions/_shared/promoRules.mjs, shared with the admin page and its function), plus that its
// images and clips are in public/. The apps skip an invalid entry; the build refuses it, so no ad is lost
// without anyone noticing.
// Each entry must be complete: image, title and text in the five languages (an error). A clip missing in a
// language, or of an unusual length, is a warning: the apps fall back to the default language's clip.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, checkCatalog, checkClip, checkImage, clipWarnings, mp4Info } from '../supabase/functions/_shared/promoRules.mjs';

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
	const base = `${SITE}/promo/${version}/catalog.json`;
	const { problems, files } = checkCatalog(catalog, { base, strict: true, schema: version === 'v1' ? undefined : null });
	for (const { path: file, what } of files) {
		if (!existsSync(file)) problems.push(`${what}: ${file} does not exist`);
		else if (what === 'image') problems.push(...checkImage(new Uint8Array(readFileSync(file)), `${what} ${file}`));
		else if (what.startsWith('clips.')) problems.push(...checkClip(new Uint8Array(readFileSync(file)), `${what} ${file}`));
	}
	const warnings = [];
	for (const e of Array.isArray(catalog.entries) ? catalog.entries : []) {
		const lengths = {};
		for (const { path: file, what } of checkCatalog({ ...catalog, entries: [e] }, { base }).files)
			if (what.startsWith('clips.') && existsSync(file)) {
				const info = mp4Info(new Uint8Array(readFileSync(file)));
				if (info) lengths[what.slice('clips.'.length)] = info.seconds;
			}
		warnings.push(...clipWarnings(e, lengths));
	}
	for (const w of warnings) console.warn(`⚠ ${path}: ${w}`);
	if (problems.length) {
		failed = true;
		console.error(`✗ ${path}:\n  ${problems.join('\n  ')}`);
	} else console.log(`✓ ${path}: ${catalog.entries.length} entries${warnings.length ? `, ${warnings.length} warning(s)` : ''}`);
}
if (failed) process.exit(1);
