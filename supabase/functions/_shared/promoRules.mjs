// The house ads catalogue (public/promo/v1/catalog.json) and the rules the apps apply to it (LudivenTools,
// ExternalTools/HouseAds: HouseCatalog.cs and its README). Shared by the build's check (scripts/check-promo.mjs),
// the admin page (/admin/pubs/) and its function (promo-admin): plain JavaScript, so Node, Vite and Deno all read it.

export const SITE = 'https://www.ludiven-studio.fr';
export const CATALOG_PATH = 'public/promo/v1/catalog.json';
export const CATALOG_URL = `${SITE}/promo/v1/catalog.json`;
export const PROMO_DIR = 'public/promo/v1/';
export const SCHEMA = 1;
/** The apps' languages: the admin wants every shown text in each of them. */
export const LANGUAGES = ['fr', 'en', 'es', 'de', 'it'];
// A banner's text line holds about 40 characters at 15 pt (Pétanque Scan, 2026-11-05); a longer one ends in "…".
export const BANNER_TEXT_MAX = 40;
// The icons the apps draw in the banner's square, 256 px today; Texture2D.LoadImage reads PNG and JPEG only.
export const IMAGE_RULES = { minSide: 128, maxSide: 1024, maxBytes: 300_000 };
export const CLIP_MAX_BYTES = 3_000_000;
// The apps fit the clip whole (AspectRatioFitter from its own size): 540×960 for 9:16, 960×960 for a square.
export const CLIP_MAX_SIDE = 960;
// About 20 s of the app, plus the 2.5 s end card (ludiventools' visuals script).
export const CLIP_SECONDS = [20, 30];
/** Files the admin may write: under promo/v1/, in img/ or clips/, with a plain name. */
export const UPLOAD_PATH = /^public\/promo\/v1\/(img\/[a-z0-9][a-z0-9._-]*\.(png|jpe?g)|clips\/[a-z0-9][a-z0-9._-]*\.mp4)$/;

const LANG = /^[a-z]{2}$/;
const PACKAGE = /^[A-Za-z]\w*(\.[A-Za-z]\w*)+$/;
const APPLE = /^\d+$/;
const PLATFORMS = ['android', 'ios'];
const SPOTS = ['banner', 'video'];
const IMAGE = /\.(png|jpe?g)$/i;
// The glyphs every app's static Inter atlas holds (Meet, Scan, PG, Dragon Gems, Nino Rush, 2026-11-04):
// any other character shows as a box. Not in it: œ Œ, the soft hyphen and the narrow no-break space (U+202F).
const GLYPHS = new Set(
	[[0x20, 0x7e], [0xa0, 0xac], [0xae, 0xff], [0x2010, 0x2027], [0x2030, 0x2055], [0x2057, 0x2057], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x25a1, 0x25a1]]
		.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)),
);

/** The characters of `s` the apps' fonts lack, as « "x" (U+0078) ». */
export function missingGlyphs(s) {
	return [...new Set([...s].filter((c) => !GLYPHS.has(c.codePointAt(0))))]
		.map((c) => `"${c}" (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`);
}

/** The repo path (public/…) a catalogue URL points to on this site, or null when it is elsewhere. */
export function sitePath(url, base = CATALOG_URL) {
	try {
		const u = new URL(url, base);
		return u.origin === SITE ? 'public' + decodeURIComponent(u.pathname) : null;
	} catch {
		return null;
	}
}

/** A site path as the catalogue writes it: relative to promo/v1/ when inside it, else from the site's root. */
export function catalogUrl(path) {
	return path.startsWith(PROMO_DIR) ? path.slice(PROMO_DIR.length) : path.slice('public'.length);
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
			const missing = missingGlyphs(v);
			if (missing.length) errors.push(`${what}.${k}: ${missing.join(', ')} not in the apps' fonts`);
		}
	}
	return value;
}

function strings(value, what, errors, allowed) {
	if (value === undefined) return;
	if (!Array.isArray(value) || value.some((s) => typeof s !== 'string' || !s)) errors.push(`${what} is not a list of names`);
	else if (allowed) for (const s of value) if (!allowed(s)) errors.push(`${what}: "${s}" is not allowed`);
}

function url(value, what, base, errors, files, { image = false } = {}) {
	if (typeof value !== 'string' || !value.trim()) return errors.push(`${what} is missing`);
	if (!/^https?:\/\//i.test(value) && value.includes(':')) return errors.push(`${what}: "${value}" is not http(s)`);
	let path;
	try {
		path = new URL(value, base).pathname;
	} catch {
		return errors.push(`${what}: "${value}" is not a URL`);
	}
	if (image && !IMAGE.test(path)) errors.push(`${what}: the apps read PNG and JPEG only`);
	const file = sitePath(value, base);
	if (file && (image || /\.(mp4|png|jpe?g)$/i.test(file))) files.push({ path: file, what });
}

function date(value, what, errors) {
	if (value === undefined) return undefined;
	const t = typeof value === 'string' ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value) || !value.includes('T') ? value : value + 'Z') : NaN;
	if (Number.isNaN(t)) errors.push(`${what}: "${value}" is not a date`);
	return t;
}

function checkEntry(e, base, defaultLanguage, strict, files) {
	const errors = [];
	if (!e || typeof e !== 'object' || Array.isArray(e)) return ['not an object'];
	if (typeof e.id !== 'string' || !e.id) errors.push('no id');
	else if (strict && !/^[a-z0-9][a-z0-9-]*$/.test(e.id)) errors.push('the id takes lowercase letters, digits and hyphens');
	const title = texts(e.title, 'title', errors, { required: true });
	if (!title[defaultLanguage]) errors.push(`no title in the default language (${defaultLanguage})`);
	const text = texts(e.text, 'text', errors);
	if (strict)
		for (const lang of LANGUAGES) {
			if (!title[lang]) errors.push(`no title in ${lang}`);
			if (!text[lang]) errors.push(`no text in ${lang}`);
		}
	if (!Array.isArray(e.spots) || e.spots.includes('banner'))
		for (const [k, v] of Object.entries(text))
			if (typeof v === 'string' && [...v].length > BANNER_TEXT_MAX)
				errors.push(`text.${k} has ${[...v].length} characters: a banner shows ${BANNER_TEXT_MAX} at most`);
	url(e.image, 'image', base, errors, files, { image: true });
	const clips = texts(e.clips, 'clips', errors, { shown: false });
	for (const [k, v] of Object.entries(clips)) url(v, `clips.${k}`, base, errors, files);
	if (strict && Object.keys(clips).length && !clips[defaultLanguage]) errors.push(`no clip in the default language (${defaultLanguage})`);
	const link = e.link;
	if (!link || typeof link !== 'object') errors.push('no link');
	else {
		if (link.android !== undefined && !PACKAGE.test(link.android)) errors.push('bad Android package');
		if (link.ios !== undefined && !APPLE.test(link.ios)) errors.push('bad Apple id (digits only)');
		if (link.web !== undefined) url(link.web, 'link.web', base, errors, files);
		if (link.android === undefined && link.ios === undefined && link.web === undefined) errors.push('no link');
	}
	strings(e.hideIn, 'hideIn', errors);
	// The apps built since 2026-11-05 hide an entry only in its own app; the older ones still read hideIn.
	strings(e.app, 'app', errors, (s) => PACKAGE.test(s));
	if (Array.isArray(e.app))
		for (const id of e.app) if (!e.hideIn?.includes?.(id)) errors.push(`app "${id}" is not in hideIn: the apps built before "app" would show it in itself`);
	strings(e.groups, 'groups', errors);
	strings(e.platforms, 'platforms', errors, (s) => PLATFORMS.includes(s));
	strings(e.languages, 'languages', errors, (s) => LANG.test(s));
	const start = date(e.start, 'start', errors);
	const end = date(e.end, 'end', errors);
	if (start !== undefined && end !== undefined && end <= start) errors.push('ends before it starts');
	if (e.weight !== undefined && (typeof e.weight !== 'number' || !Number.isFinite(e.weight) || e.weight < 0)) errors.push('bad weight');
	strings(e.spots, 'spots', errors, (s) => SPOTS.includes(s));
	if (e.spots?.includes?.('video') && Object.keys(clips).length === 0) errors.push('a video spot without clips');
	return errors;
}

/**
 * The catalogue's problems, as the apps would refuse or skip it, and the site files it points to (the caller
 * checks they exist: on disk for the build, in the repo's tree for the function).
 * strict: the admin's own rules on top, every shown text in the five languages and a clip in the default one.
 * schema: the one expected, null for none (a later promo/vN/ folder).
 */
export function checkCatalog(catalog, { strict = false, base = CATALOG_URL, schema = SCHEMA } = {}) {
	const problems = [];
	const files = [];
	if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return { problems: ['not a JSON object'], files };
	if (schema !== null && catalog.schema !== schema) problems.push(`schema is not ${schema}`);
	if (catalog.updated === undefined || Number.isNaN(Date.parse(catalog.updated))) problems.push('"updated" is missing or not a date: the apps keep the newer copy by it');
	const defaultLanguage = LANG.test(catalog.defaultLanguage ?? '') ? catalog.defaultLanguage : 'en';
	if (!Array.isArray(catalog.entries)) problems.push('no entries list');
	const ids = new Set();
	const apps = new Map();
	for (const [i, e] of (Array.isArray(catalog.entries) ? catalog.entries : []).entries()) {
		const name = typeof e?.id === 'string' && e.id ? e.id : `#${i}`;
		const errors = checkEntry(e, base, defaultLanguage, strict, files);
		if (ids.has(name)) errors.push('duplicate id');
		ids.add(name);
		for (const err of errors) problems.push(`${name}: ${err}`);
		for (const id of Array.isArray(e?.app) ? e.app : []) {
			if (apps.has(id)) problems.push(`${name}: app "${id}" is already ${apps.get(id)}'s: an app takes the groups of one entry`);
			else apps.set(id, name);
		}
	}
	return { problems, files };
}

/** PNG or JPEG size from the file's first bytes, or null. */
export function imageInfo(bytes) {
	const b = bytes;
	if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
		const be = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
		return { type: 'png', width: be(16), height: be(20) };
	}
	if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
		for (let i = 2; i + 9 < b.length; ) {
			if (b[i] !== 0xff) return null;
			const marker = b[i + 1];
			const len = (b[i + 2] << 8) | b[i + 3];
			// SOF0 to SOF15 carry the size; C4 (DHT), C8 and CC are not frames.
			if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
				return { type: 'jpeg', width: (b[i + 7] << 8) | b[i + 8], height: (b[i + 5] << 8) | b[i + 6] };
			i += 2 + len;
		}
	}
	return null;
}

/** An icon's problems: PNG or JPEG, square, between the bounds, not too heavy. */
export function checkImage(bytes, what = 'image') {
	const info = imageInfo(bytes);
	if (!info) return [`${what}: not a PNG or JPEG`];
	const problems = [];
	const { minSide, maxSide, maxBytes } = IMAGE_RULES;
	if (info.width !== info.height) problems.push(`${what}: ${info.width}×${info.height}, the banner's icon is square`);
	if (Math.min(info.width, info.height) < minSide || Math.max(info.width, info.height) > maxSide)
		problems.push(`${what}: ${info.width}×${info.height}, between ${minSide} and ${maxSide} px`);
	if (bytes.length > maxBytes) problems.push(`${what}: ${Math.round(bytes.length / 1000)} kB, ${maxBytes / 1000} kB at most`);
	return problems;
}

/** An MP4's video size and length, read from its tkhd and mvhd boxes (no ffprobe on the build machine), or null. */
export function mp4Info(bytes) {
	const b = bytes;
	const u32 = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
	const find = (tag, from = 0) => {
		const t = [...tag].map((c) => c.charCodeAt(0));
		for (let i = Math.max(4, from); i + 4 <= b.length; i++)
			if (b[i] === t[0] && b[i + 1] === t[1] && b[i + 2] === t[2] && b[i + 3] === t[3]) return i;
		return -1;
	};
	let width = 0;
	let height = 0;
	// Each track has a tkhd; the video's carries the size, in 16.16 fixed point, in its last 8 bytes.
	for (let i = find('tkhd'); i > 0; i = find('tkhd', i + 4)) {
		const end = i - 4 + u32(i - 4);
		if (end > b.length || end < i + 8) break;
		const w = u32(end - 8) / 65536;
		const h = u32(end - 4) / 65536;
		if (w * h > width * height) [width, height] = [w, h];
	}
	const m = find('mvhd');
	if (m < 0 || !width) return null;
	const v1 = b[m + 4] === 1;
	const scale = u32(m + (v1 ? 24 : 16));
	const length = v1 ? u32(m + 28) * 2 ** 32 + u32(m + 32) : u32(m + 20);
	return { width: Math.round(width), height: Math.round(height), seconds: scale ? length / scale : 0 };
}

/** A clip's problems: an MP4 (its « ftyp » box first), not too heavy, its long side within CLIP_MAX_SIDE. */
export function checkClip(bytes, what = 'clip') {
	const problems = [];
	const ftyp = bytes.length > 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
	if (!ftyp) problems.push(`${what}: not an MP4`);
	if (bytes.length > CLIP_MAX_BYTES) problems.push(`${what}: ${(bytes.length / 1e6).toFixed(1)} MB, ${CLIP_MAX_BYTES / 1e6} MB at most`);
	const info = ftyp ? mp4Info(bytes) : null;
	if (info && Math.max(info.width, info.height) > CLIP_MAX_SIDE) problems.push(`${what}: ${info.width}×${info.height}, ${CLIP_MAX_SIDE} px at most on the long side`);
	return problems;
}

/** What a complete entry still lacks, as warnings: a clip in each language, and clips of CLIP_SECONDS. */
export function clipWarnings(entry, lengths = {}) {
	const warnings = [];
	const clips = entry?.clips && typeof entry.clips === 'object' ? entry.clips : {};
	const missing = LANGUAGES.filter((l) => !clips[l]);
	if (missing.length) warnings.push(`${entry?.id}: no clip in ${missing.join(', ')}`);
	for (const [lang, seconds] of Object.entries(lengths))
		if (seconds < CLIP_SECONDS[0] || seconds > CLIP_SECONDS[1])
			warnings.push(`${entry?.id}: clip ${lang} lasts ${seconds.toFixed(1)} s, ${CLIP_SECONDS[0]} to ${CLIP_SECONDS[1]} s expected`);
	return warnings;
}
