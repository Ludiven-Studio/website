// Checks the apps' house ads catalogue (public/promo/v1/catalog.json) with the rules the apps apply
// (LudivenTools, ExternalTools/HouseAds/HouseCatalog.cs), plus that its images and clips are in public/.
// The apps skip an invalid entry; the build refuses it, so no ad is lost without anyone noticing.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = 'public';
const SITE = 'https://www.ludiven-studio.fr';
const SCHEMA = 1;
const LANG = /^[a-z]{2}$/;
const PACKAGE = /^[A-Za-z]\w*(\.[A-Za-z]\w*)+$/;
const APPLE = /^\d+$/;
const PLATFORMS = ['android', 'ios'];
const SPOTS = ['banner', 'video'];
// Texture2D.LoadImage reads PNG and JPEG only.
const IMAGE = /\.(png|jpe?g)$/i;
// The glyphs every app's static Inter atlas holds (Meet, Scan, PG, Dragon Gems, Nino Rush, 2026-11-04):
// any other character shows as a box. Not in it: œ Œ, the soft hyphen and the narrow no-break space (U+202F).
const GLYPHS = new Set(
	[[0x20, 0x7e], [0xa0, 0xac], [0xae, 0xff], [0x2010, 0x2027], [0x2030, 0x2055], [0x2057, 0x2057], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x25a1, 0x25a1]]
		.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)),
);

/** The public/ file a catalogue URL points to, or null when it is elsewhere. */
function localFile(url, base) {
	const u = new URL(url, base);
	return u.origin === SITE ? join(PUBLIC, decodeURIComponent(u.pathname)) : null;
}

function texts(value, what, errors, { required = false, shown = true } = {}) {
	if (value === undefined && !required) return {};
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		errors.push(`${what} is not an object of languages`);
		return {};
	}
	for (const [k, v] of Object.entries(value)) {
		if (!LANG.test(k)) errors.push(`${what}: "${k}" is not a two-letter language`);
		if (typeof v !== 'string' || !v.trim()) errors.push(`${what}.${k} is empty`);
		else if (shown) {
			const missing = [...new Set([...v].filter((c) => !GLYPHS.has(c.codePointAt(0))))];
			if (missing.length)
				errors.push(`${what}.${k}: ${missing.map((c) => `"${c}" (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`).join(', ')} not in the apps' fonts`);
		}
	}
	return value;
}

function strings(value, what, errors, allowed) {
	if (value === undefined) return;
	if (!Array.isArray(value) || value.some((s) => typeof s !== 'string' || !s)) errors.push(`${what} is not a list of names`);
	else if (allowed) for (const s of value) if (!allowed(s)) errors.push(`${what}: "${s}" is not allowed`);
}

function url(value, what, base, errors, { image = false } = {}) {
	if (typeof value !== 'string' || !value.trim()) return errors.push(`${what} is missing`);
	if (!/^https?:\/\//i.test(value) && value.includes(':')) return errors.push(`${what}: "${value}" is not http(s)`);
	const file = localFile(value, base);
	if (image && !IMAGE.test(new URL(value, base).pathname)) errors.push(`${what}: the apps read PNG and JPEG only`);
	if (file && (image || /\.(mp4|png|jpe?g)$/i.test(file)) && !existsSync(file)) errors.push(`${what}: ${file} does not exist`);
}

function date(value, what, errors) {
	if (value === undefined) return undefined;
	const t = typeof value === 'string' ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value) || !value.includes('T') ? value : value + 'Z') : NaN;
	if (Number.isNaN(t)) errors.push(`${what}: "${value}" is not a date`);
	return t;
}

function checkEntry(e, base, defaultLanguage) {
	const errors = [];
	if (!e || typeof e !== 'object' || Array.isArray(e)) return ['not an object'];
	if (typeof e.id !== 'string' || !e.id) errors.push('no id');
	const title = texts(e.title, 'title', errors, { required: true });
	if (!title[defaultLanguage]) errors.push(`no title in the default language (${defaultLanguage})`);
	texts(e.text, 'text', errors);
	url(e.image, 'image', base, errors, { image: true });
	const clips = texts(e.clips, 'clips', errors, { shown: false });
	for (const [k, v] of Object.entries(clips)) url(v, `clips.${k}`, base, errors);
	const link = e.link;
	if (!link || typeof link !== 'object') errors.push('no link');
	else {
		if (link.android !== undefined && !PACKAGE.test(link.android)) errors.push('bad Android package');
		if (link.ios !== undefined && !APPLE.test(link.ios)) errors.push('bad Apple id (digits only)');
		if (link.web !== undefined) url(link.web, 'link.web', base, errors);
		if (link.android === undefined && link.ios === undefined && link.web === undefined) errors.push('no link');
	}
	strings(e.hideIn, 'hideIn', errors);
	strings(e.platforms, 'platforms', errors, (s) => PLATFORMS.includes(s));
	strings(e.languages, 'languages', errors, (s) => LANG.test(s));
	const start = date(e.start, 'start', errors);
	const end = date(e.end, 'end', errors);
	if (start !== undefined && end !== undefined && end <= start) errors.push('ends before it starts');
	if (e.weight !== undefined && (typeof e.weight !== 'number' || e.weight < 0)) errors.push('bad weight');
	strings(e.spots, 'spots', errors, (s) => SPOTS.includes(s));
	if (e.spots?.includes?.('video') && Object.keys(clips).length === 0) errors.push('a video spot without clips');
	return errors;
}

let failed = false;
const versions = existsSync(join(PUBLIC, 'promo')) ? readdirSync(join(PUBLIC, 'promo')).filter((d) => /^v\d+$/.test(d)) : [];
for (const version of versions) {
	const path = join(PUBLIC, 'promo', version, 'catalog.json');
	if (!existsSync(path)) continue;
	const base = `${SITE}/promo/${version}/catalog.json`;
	let catalog;
	try {
		catalog = JSON.parse(readFileSync(path, 'utf8'));
	} catch (err) {
		console.error(`✗ ${path}: not JSON (${err.message})`);
		failed = true;
		continue;
	}
	const problems = [];
	if (version === 'v1' && catalog.schema !== SCHEMA) problems.push(`schema is not ${SCHEMA}`);
	if (catalog.updated === undefined || Number.isNaN(Date.parse(catalog.updated))) problems.push('"updated" is missing or not a date: the apps keep the newer copy by it');
	const defaultLanguage = LANG.test(catalog.defaultLanguage ?? '') ? catalog.defaultLanguage : 'en';
	if (!Array.isArray(catalog.entries)) problems.push('no entries list');
	const ids = new Set();
	for (const [i, e] of (catalog.entries ?? []).entries()) {
		const name = typeof e?.id === 'string' && e.id ? e.id : `#${i}`;
		const errors = checkEntry(e, base, defaultLanguage);
		if (ids.has(name)) errors.push('duplicate id');
		ids.add(name);
		for (const err of errors) problems.push(`${name}: ${err}`);
	}
	if (problems.length) {
		failed = true;
		console.error(`✗ ${path}:\n  ${problems.join('\n  ')}`);
	} else console.log(`✓ ${path}: ${ids.size} entries`);
}
if (failed) process.exit(1);
