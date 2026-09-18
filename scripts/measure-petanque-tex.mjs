/*
 * Are the generated ground textures actually usable? Four numbers, none of them about taste.
 *
 * The rules come from the plan and are physical, not aesthetic:
 *   1. TILEABLE   — the pitch repeats the texture ~15 times lengthwise, so a seam reads as a grid.
 *   2. NO PAINTED LIGHT — three.js lights the ground; a painted shadow or vignette doubles up.
 *   3. NO PAINTED STONES — the real stones are geometry that really deviates a boule, so a painted
 *      one lies to the player: he expects a deflection and nothing happens.
 *   4. DISTINGUISHABLE — the surface is the only warning that a boule will roll 2 m or 30 cm.
 *
 * The control is the CURRENT procedural grain from render3d.ts, ported here. It already obeys all
 * four rules by construction, so it is the bar: a generated texture that scores worse on 1-3 is not
 * an upgrade no matter how good it looks. Measuring a candidate alone would only tell us it exists.
 *
 * Every image is measured at the same WORK size, so grain frequency cannot skew the comparison.
 *
 * Usage: node scripts/measure-petanque-tex.mjs [--dir D:/tmp/comfy/petanque]
 */
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const DIR = arg('dir', 'D:/tmp/comfy/petanque');
const WORK = 512;
// Set by --selftest, not by taste: 0 false alarms on 8 seamless tiles, 7 of 8 real seams caught.
const SEAM_MAX = 3.0;

// Mirrors SURFACE_TINT and the grain knobs in src/games/petanque/render3d.ts.
const SURFACES = [
	{ id: 'sol-terre-battue', tint: [0xb5763f, 0x8a5426], grains: 1400, dot: 1.5 },
	{ id: 'sol-gravier-fin', tint: [0x9a988f, 0x77746c], grains: 1400, dot: 2.2 },
	{ id: 'sol-gravier-gros', tint: [0x6f6a61, 0x4a463f], grains: 1400, dot: 3.4 },
	{ id: 'sol-sable', tint: [0xe0c489, 0xc4a468], grains: 2600, dot: 1.5 },
];

/**
 * The procedural control, ported from `groundTexture`. Same seeded hash, same dot count, same alpha
 * range. It wraps with a modulo instead of render3d's draw-it-four-times trick — equivalent, and
 * strictly seamless, which is what makes it a fair zero for the seam metric.
 */
function proceduralTile({ tint, grains, dot }, S = 256) {
	const buf = Buffer.alloc(S * S * 3);
	const [base, dark] = tint;
	for (let i = 0; i < S * S; i++) {
		buf[i * 3] = (base >> 16) & 255; buf[i * 3 + 1] = (base >> 8) & 255; buf[i * 3 + 2] = base & 255;
	}
	let h = 0x2f6b21;
	const rnd = () => { h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) | 0; return ((h >>> 8) & 0xffffff) / 0xffffff; };
	for (let k = 0; k < grains; k++) {
		const cx = rnd() * S, cy = rnd() * S, r = dot * (0.4 + rnd());
		const white = rnd() < 0.5;
		const a = 0.10 + rnd() * 0.16;
		const col = white ? [255, 255, 255] : [(dark >> 16) & 255, (dark >> 8) & 255, dark & 255];
		const ri = Math.ceil(r);
		for (let dy = -ri; dy <= ri; dy++) {
			for (let dx = -ri; dx <= ri; dx++) {
				if (dx * dx + dy * dy > r * r) continue;
				const x = ((Math.floor(cx) + dx) % S + S) % S;
				const y = ((Math.floor(cy) + dy) % S + S) % S;
				const o = (y * S + x) * 3;
				for (let c = 0; c < 3; c++) buf[o + c] = Math.round(buf[o + c] * (1 - a) + col[c] * a);
			}
		}
	}
	return sharp(buf, { raw: { width: S, height: S, channels: 3 } });
}

const n2 = (x) => x.toFixed(2).padStart(6);

const lum = (d, w, x, y) => {
	const i = (y * w + x) * 3;
	return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
};

/**
 * Seam score, in standard deviations. A seam is not "a big difference" — on grain, the wrap edge is
 * always somewhat different. It is an OUTLIER among line-to-line differences. So the score is
 * z = (edge - mean(interior)) / std(interior): how far out of the ordinary that one line sits.
 *
 * A plain ratio-to-median was tried and rejected by --selftest: on sparse grain the baseline is tiny
 * and noisy, and a seamless terre-battue scored 1.97 while a genuinely cropped one scored 1.58. Any
 * threshold on that ratio condemns good tiles and passes bad ones.
 *
 * Measured at NATIVE resolution on purpose. Resampling first inflates the score on a tile that is
 * seamless by construction: interpolated interior neighbours collapse the baseline while the two
 * wrap columns stay a whole source pixel apart. The control caught that too — a metric that condemns
 * a provably seamless tile is measuring its own resampling.
 */
function seam(d, w, h) {
	const line = (n, a, b) => {
		let s = 0;
		for (let k = 0; k < n; k++) s += Math.abs(a(k) - b(k));
		return s / n;
	};
	const colDiff = (x0, x1) => line(h, (k) => lum(d, w, x0, k), (k) => lum(d, w, x1, k));
	const rowDiff = (y0, y1) => line(w, (k) => lum(d, w, k, y0), (k) => lum(d, w, k, y1));

	// Robust z (median / MAD). Grain gives a heavy-tailed, spiky distribution where a handful of
	// isolated dots inflate the mean and the sd, so a textbook z-score understates real seams and
	// overstates harmless ones.
	const med = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
	const z = (edge, pop) => {
		const m = med(pop);
		// Floor the spread: a degenerate image (constant rows) has MAD 0 and would report a
		// meaningless 1e8 sigma. 0.05 is well under any real grain, so it never moves a live score.
		const mad = Math.max(med(pop.map((x) => Math.abs(x - m))) * 1.4826, 0.05);
		return (edge - m) / mad;
	};
	const cols = [], rows2 = [];
	for (let x = 0; x < w - 1; x++) cols.push(colDiff(x, x + 1));
	for (let y = 0; y < h - 1; y++) rows2.push(rowDiff(y, y + 1));
	return { h: z(colDiff(w - 1, 0), cols), v: z(rowDiff(h - 1, 0), rows2) };
}

/** Painted light: luminance spread once the grain is averaged away. A flat-lit tile trends to 0. */
async function blotch(img) {
	const { data } = await img.clone().removeAlpha().resize(16, 16, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
	const v = [];
	for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) v.push(lum(data, 16, x, y));
	const m = v.reduce((a, b) => a + b, 0) / v.length;
	return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
}

/**
 * How much grain is actually there. Every other column here is an upper bound — a flat colour scores
 * a perfect 0 on seam, blotch and mid-scale and would sail through. This is the only column that can
 * fail downwards, and it exists because the tint post-process in comfy-petanque.mjs can crush the
 * texture to nothing while improving all three others.
 *
 * Measured at WORK so the two sources are compared at the same physical scale (1 tile = 1 m).
 */
async function grain(img) {
	const src = img.clone().removeAlpha().resize(WORK, WORK, { fit: 'fill' });
	const [sharpB, soft] = await Promise.all([src.clone().raw().toBuffer(), src.clone().blur(3).raw().toBuffer()]);
	let s = 0, s2 = 0;
	const n = WORK * WORK;
	for (let y = 0; y < WORK; y++) {
		for (let x = 0; x < WORK; x++) {
			const d = lum(sharpB, WORK, x, y) - lum(soft, WORK, x, y);
			s += d; s2 += d * d;
		}
	}
	return Math.sqrt(s2 / n - (s / n) ** 2);
}

/**
 * Painted stones: energy at the scale of a stone and nothing else. Grain lives below the small
 * blur, lighting above the large one; a drawn pebble is exactly what survives in between. Reported
 * as the share of the tile carrying such structure.
 */
async function midScale(img) {
	const src = img.clone().removeAlpha().resize(WORK, WORK, { fit: 'fill' });
	const [fine, coarse] = await Promise.all([
		src.clone().blur(2).raw().toBuffer(),
		src.clone().blur(16).raw().toBuffer(),
	]);
	let hits = 0;
	for (let y = 0; y < WORK; y++) {
		for (let x = 0; x < WORK; x++) {
			if (Math.abs(lum(fine, WORK, x, y) - lum(coarse, WORK, x, y)) > 12) hits++;
		}
	}
	return (100 * hits) / (WORK * WORK);
}

const meanRGB = async (img) => {
	const { channels } = await img.clone().removeAlpha().stats();
	return channels.slice(0, 3).map((c) => c.mean);
};

// sRGB -> Lab, so "are these four telling apart?" is asked in a space where distance means something.
function lab([r, g, b]) {
	const f = (u) => { u /= 255; return u > 0.04045 ? ((u + 0.055) / 1.055) ** 2.4 : u / 12.92; };
	const [R, G, B] = [f(r), f(g), f(b)];
	const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.9505;
	const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
	const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.089;
	const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
	return [116 * k(Y) - 16, 500 * (k(X) - k(Y)), 200 * (k(Y) - k(Z))];
}
const dE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

async function measure(img) {
	const { data, info } = await img.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
	const s = seam(data, info.width, info.height);
	return { seamH: s.h, seamV: s.v, blotch: await blotch(img), mid: await midScale(img), grain: await grain(img), rgb: await meanRGB(img), px: info.width };
}

/* A green metric proves nothing until it goes red on the fault it claims to catch. The positive
   control is the same grain generated larger and centre-cropped: cropping destroys the wrap, so its
   opposite edges are unrelated — exactly how a non-tileable texture fails. Anything the seam score
   cannot separate here, it cannot separate on a real candidate either. */
if (process.argv.includes('--selftest')) {
	console.log('\ncontrôle du métrique de couture — même grain, tuilable vs recadré\n');
	console.log('sol                 tuilable↔  tuilable↕   recadré↔  recadré↕');
	let falseAlarm = 0, caught = 0, total = 0;
	for (const s of SURFACES) {
		const good = await measure(proceduralTile(s));
		const cut = await measure(proceduralTile(s, 320).extract({ left: 32, top: 32, width: 256, height: 256 }));
		console.log(`${s.id.padEnd(18)} ${n2(good.seamH)}  ${n2(good.seamV)}  ${n2(cut.seamH)}  ${n2(cut.seamV)}`);
		for (const v of [good.seamH, good.seamV]) if (v > SEAM_MAX) falseAlarm++;
		for (const v of [cut.seamH, cut.seamV]) { total++; if (v > SEAM_MAX) caught++; }
	}
	console.log(`\nseuil ${SEAM_MAX} · fausses alertes ${falseAlarm}/8 · coutures détectées ${caught}/${total}`);
	console.log('Angle mort connu : terre battue à la verticale. Sa texture est presque plate, donc');
	console.log('une couture n’y a quasiment rien à interrompre — c’est la planche 2x2 qui tranche.');
	// A false alarm makes the metric unusable; a miss on the flattest surface is a declared cost.
	process.exit(falseAlarm ? 1 : 0);
}

const files = await readdir(DIR).catch(() => []);
const rows = [];

for (const s of SURFACES) {
	rows.push({ id: s.id, src: 'procédural (témoin)', ...(await measure(proceduralTile(s))) });
	// The generator writes <id>.png next to <id>-raw.png and <id>-2x2.png; only the first is the tile.
	const hit = files.find((f) => f === `${s.id}.png` || f === `${s.id}.webp`);
	if (hit) rows.push({ id: s.id, src: 'ComfyUI', ...(await measure(sharp(resolve(DIR, hit)))) });
}

console.log(`\ncouture mesurée en natif · taches et mi-échelle à ${WORK}²  ·  dossier ${DIR}\n`);
console.log('sol                source                natif  couture↔  couture↕   taches  mi-échelle%    grain   RVB moyen');
for (const r of rows) {
	console.log(`${r.id.padEnd(18)} ${r.src.padEnd(20)}${String(r.px).padStart(6)}  ${n2(r.seamH)}  ${n2(r.seamV)}  ${n2(r.blotch)}  ${n2(r.mid)}   ${n2(r.grain)}   ${r.rgb.map((v) => Math.round(v)).join(',')}`);
}

const gen = rows.filter((r) => r.src === 'ComfyUI');
const ctl = rows.filter((r) => r.src !== 'ComfyUI');
const sep = (set) => {
	let worst = Infinity, pair = '';
	for (let i = 0; i < set.length; i++) {
		for (let j = i + 1; j < set.length; j++) {
			const d = dE(set[i].rgb, set[j].rgb);
			if (d < worst) { worst = d; pair = `${set[i].id} / ${set[j].id}`; }
		}
	}
	return { worst, pair };
};
const cs = sep(ctl);
console.log(`\nséparation des teintes (ΔE min) · témoin  : ${cs.worst.toFixed(1)}  (${cs.pair})`);
if (gen.length > 1) {
	const gs = sep(gen);
	console.log(`séparation des teintes (ΔE min) · ComfyUI : ${gs.worst.toFixed(1)}  (${gs.pair})`);
}

if (!gen.length) {
	console.log('\nAucune texture générée trouvée — seul le témoin est mesuré.');
	console.log('Lancer d’abord : node scripts/comfy-petanque.mjs --out tmp');
	process.exit(0);
}

/* The bar is the control, not a number I picked. A candidate that seams more, carries more painted
   light, or shows more stone-scale structure is a regression however good it looks. */
const by = (set, id) => set.find((r) => r.id === id);
let bad = 0;
console.log('');
for (const g of gen) {
	const c = by(ctl, g.id);
	const fails = [];
	if (Math.max(g.seamH, g.seamV) > SEAM_MAX) fails.push(`couture ${Math.max(g.seamH, g.seamV).toFixed(2)}σ (témoin ${Math.max(c.seamH, c.seamV).toFixed(2)})`);
	if (g.blotch > Math.max(3 * c.blotch, 2)) fails.push(`lumière peinte ${g.blotch.toFixed(2)} (témoin ${c.blotch.toFixed(2)})`);
	if (g.mid > Math.max(3 * c.mid, 5)) fails.push(`structures mi-échelle ${g.mid.toFixed(1)} % (témoin ${c.mid.toFixed(1)} %)`);
	// Two-sided on purpose: a texture with less grain than the procedural one is not an upgrade, it
	// is a flat colour that happens to score well on every upper-bound column above.
	if (g.grain < 0.7 * c.grain) fails.push(`grain écrasé ${g.grain.toFixed(2)} (témoin ${c.grain.toFixed(2)})`);
	console.log(fails.length ? `FAIL  ${g.id} — ${fails.join(' · ')}` : `ok    ${g.id}`);
	if (fails.length) bad++;
}
console.log(bad ? `\n${bad} texture(s) en dessous du témoin — ne pas livrer.` : '\nToutes au niveau du témoin.');
process.exit(bad ? 1 : 0);
