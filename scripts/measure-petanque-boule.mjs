/* Measurement: do the boules read as spheres, or as flat discs?
   The report was "j'ai l'impression que les boules ne sont pas en vrai 3D et sont plates", and a
   screenshot is a bad judge of it — a dark disc and a dark sphere look alike at a glance.

   What separates them is the SHADING GRADIENT across the body. A lit sphere runs bright near the
   light and dark at the silhouette; a flat disc is one value. So the number here is the luminance
   spread inside the boule's own screen disc, read from the live render:
     - `ecart`  standard deviation of luminance over the disc — a flat disc trends to 0;
     - `ampl`   p95 - p5, i.e. how many levels separate the lit side from the dark side.

   The jack is the built-in control. It is the SAME sphere geometry with a non-metal material, so if
   the jack shades and the boules do not, the geometry is fine and the material is the fault.

   `ombre` is the second half, and it turned out to be the real one: a body can be perfectly shaded
   and still look pasted on if nothing darkens the ground under it. It compares the darkest ground
   just outside the body against the ground further away.

   The aim halos are the trap: makeHalo draws a ring on the ground at ~20 px, i.e. exactly where the
   contact shadow lives, so it cannot be excluded geometrically without excluding the thing measured.
   They are dropped by COLOUR instead, and the physics is what makes that sound: a shadow scales the
   ground's RGB down without turning it, a halo replaces it at 0.75 opacity with #30d158 / #ff5f56 /
   #ffc107. So the filter keeps only pixels whose unit RGB still points where the far ground points.
   `rej` is printed because a filter that never fires and a filter that eats everything both look
   like a clean number here.

   Usage: node scripts/measure-petanque-boule.mjs [--tag avant]
*/
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const TAG = arg('tag', 'now');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4372;
const OUT = 'D:/tmp/comfy';
const base = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`THROW ${e.message}`));

await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.pe-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch { /* no tutorial */ }
await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });
/* Defi, not Libre. Libre needs boules thrown by a mouse drag, and the drag lands them somewhere
   different every run — `ombre` fell 46 to 2 between 2.3 m and 4.9 m in the same build, so a 19 to 6
   move across two builds said nothing at all. Defi's first station is a FIXED 6 m target placed
   without a throw, so two runs of the same build produce the same pixels and an A/B is a real A/B.
   Mode segments declare role="tab", which overrides the implicit button role. */
await page.getByRole('tab', { name: /Défi/ }).click();
await sleep(700);
await page.evaluate(() => {
	document.querySelector('.game-page')?.classList.add('gf-full');
	document.documentElement.classList.add('gf-full');
	window.dispatchEvent(new Event('resize'));
});
await sleep(1500);

const state = () => page.evaluate(() => window.__petanque());

// Walk up and go first person: the probe needs the bodies as many pixels wide as the game can make
// them, otherwise it measures the resampler rather than the shading. A fixed step count, so the
// distance column is a constant of the instrument and not a per-run variable.
for (let i = 0; i < Number(arg('walk', 5)); i++) { await page.keyboard.press('w'); await sleep(120); }
await page.keyboard.press('v');
await sleep(1400);

const shotPath = resolve(`${OUT}/pet-boule-${TAG}.png`);
await page.screenshot({ path: shotPath });
const { data, info } = await sharp(shotPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const px3 = (x, y) => { const i = (y * info.width + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
const lum = (x, y) => { const c = px3(x, y); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const unit = (c) => { const n = Math.sqrt(c[0] ** 2 + c[1] ** 2 + c[2] ** 2) || 1; return [c[0] / n, c[1] / n, c[2] / n]; };
const med = (v) => v.length ? [...v].sort((a, c) => a - c)[v.length >> 1] : NaN;

const s = await state();

/** Pixels of an annulus around a body, skipping every other body and its own halo. */
function annulus(b, r0, r1, others) {
	const out = [];
	for (let y = Math.round(b.py - r1); y <= b.py + r1; y++) {
		for (let x = Math.round(b.px - r1); x <= b.px + r1; x++) {
			if (x < 0 || y < 0 || x >= info.width || y >= info.height) continue;
			const d2 = (x - b.px) ** 2 + (y - b.py) ** 2;
			if (d2 < r0 * r0 || d2 > r1 * r1) continue;
			let blocked = false;
			for (const o of others) {
				const k = (Math.max(o.body, o.halo) / 2) * 1.15;
				if ((x - o.px) ** 2 + (y - o.py) ** 2 < k * k) { blocked = true; break; }
			}
			if (!blocked) out.push(px3(x, y));
		}
	}
	return out;
}

console.log(`\n${TAG} · gradient DANS le disque, puis ombre de contact AUTOUR`);
console.log(`vue ${info.width}x${info.height} · corps ${JSON.stringify(s.seen)}\n`);
console.log('corps          taille    dist   écart   ampl    sol  ombre    %   rej%');
const rows = [];
for (const b of s.seen) {
	// 0.72 of the radius: the silhouette pixels are half ground, and they would report a contrast
	// with the background as if it were shading on the body.
	const r = (b.body / 2) * 0.72;
	if (r < 3) continue;
	const v = [];
	for (let y = Math.round(b.py - r); y <= b.py + r; y++) {
		for (let x = Math.round(b.px - r); x <= b.px + r; x++) {
			if (x < 0 || y < 0 || x >= info.width || y >= info.height) continue;
			if ((x - b.px) ** 2 + (y - b.py) ** 2 > r * r) continue;
			v.push(lum(x, y));
		}
	}
	if (v.length < 12) continue;
	v.sort((a, c) => a - c);
	const m = v.reduce((a, c) => a + c, 0) / v.length;
	const sd = Math.sqrt(v.reduce((a, c) => a + (c - m) ** 2, 0) / v.length);
	const amp = v[Math.floor(v.length * 0.95)] - v[Math.floor(v.length * 0.05)];

	/* The far ring defines what "untouched ground" looks like here — both its level and its hue.
	   Taking it from the image rather than from the texture file means the reference already carries
	   the sun, the relief and the tone mapping, so `ombre` is a pure local drop. */
	const others = s.seen.filter((o) => o !== b);
	const rb = b.body / 2;
	const far = annulus(b, rb * 3.2, rb * 5.5, others);
	// 1.1 to 1.85 radii: the contact shadow, and nothing else. The halo ring lands at 1.9-2.5 radii
	// close up, so a wider annulus would be mostly halo pixels that the colour filter then throws
	// away — measuring the shadow on whatever scraps were left over.
	const near = annulus(b, rb * 1.1, rb * 1.85, others);
	if (far.length < 40 || near.length < 20) continue;
	const ref = unit([0, 1, 2].map((k) => med(far.map((c) => c[k]))));
	const keep = (list) => list.filter((c) => { const u = unit(c); return u[0] * ref[0] + u[1] * ref[1] + u[2] * ref[2] > 0.99; });
	const nk = keep(near), fk = keep(far);
	const rej = 100 * (1 - nk.length / near.length);
	const L = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
	const sol = med(fk.map(L));
	const nl = nk.map(L).sort((a, c) => a - c);
	const dark = nl.length ? nl[Math.floor(nl.length * 0.1)] : NaN;
	const ombre = sol - dark;

	const name = b.side < 0 ? 'cochonnet' : `boule s${b.side}`;
	rows.push({ name, jack: b.side < 0, sd, amp, ombre, pct: (100 * ombre) / sol });
	console.log(`${name.padEnd(13)} ${String(b.body).padStart(5)}px ${`${b.m}m`.padStart(7)} ${sd.toFixed(1).padStart(7)} ${amp.toFixed(1).padStart(6)} ${sol.toFixed(0).padStart(6)} ${ombre.toFixed(1).padStart(6)} ${((100 * ombre) / sol).toFixed(0).padStart(4)} ${rej.toFixed(0).padStart(6)}`);
}

/* The floor. `ombre` compares a p10 against a median, so it reads positive on any textured surface
   even with nothing casting anything — without this column "4 levels" could mean a faint shadow or
   mean literally zero. Same radii, same filter, on bare ground beside each body. */
console.log('\ntémoin nul · même mesure sur du sol vide à côté de chaque corps');
for (const b of s.seen) {
	const rb = b.body / 2;
	if (rb < 3) continue;
	const ghost = { ...b, px: b.px + Math.round(rb * 9), py: b.py };
	const others = s.seen;
	const far = annulus(ghost, rb * 3.2, rb * 5.5, others);
	const near = annulus(ghost, rb * 1.15, rb * 2.6, others);
	const ref = unit([0, 1, 2].map((k) => med(far.map((c) => c[k]))));
	const L = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
	const keep = (l) => l.filter((c) => { const u = unit(c); return u[0] * ref[0] + u[1] * ref[1] + u[2] * ref[2] > 0.99; });
	const nl = keep(near).map(L).sort((a, c) => a - c);
	if (far.length < 40 || nl.length < 20) { console.log(`  à côté de ${(b.side < 0 ? 'cochonnet' : `boule s${b.side}`).padEnd(11)} pas assez de sol vide (loin ${far.length}, près ${nl.length})`); continue; }
	const sol = med(keep(far).map(L));
	const ombre = sol - nl[Math.floor(nl.length * 0.1)];
	console.log(`  à côté de ${(b.side < 0 ? 'cochonnet' : `boule s${b.side}`).padEnd(11)} sol ${sol.toFixed(0).padStart(4)}  ombre ${ombre.toFixed(1).padStart(5)} (${((100 * ombre) / sol).toFixed(0)} %)`);
}

/* A zoomed crop around the head. The numbers above describe the body alone; whether it reads as an
   object sitting on the ground is also about its contact shadow, which lives just OUTSIDE the disc
   and no per-body statistic can see. Nearest-neighbour, so the upscale invents nothing. */
const live = s.seen.filter((b) => b.body >= 3 && b.px > 0 && b.py > 0 && b.px < info.width && b.py < info.height);
if (live.length) {
	const pad = 70;
	const x0 = Math.max(0, Math.round(Math.min(...live.map((b) => b.px)) - pad));
	const y0 = Math.max(0, Math.round(Math.min(...live.map((b) => b.py)) - pad));
	const w = Math.min(info.width - x0, Math.round(Math.max(...live.map((b) => b.px)) + pad) - x0);
	const h = Math.min(info.height - y0, Math.round(Math.max(...live.map((b) => b.py)) + pad) - y0);
	await sharp(shotPath).extract({ left: x0, top: y0, width: w, height: h })
		.resize(w * 4, h * 4, { kernel: 'nearest' })
		.toFile(resolve(`${OUT}/pet-boule-${TAG}-zoom.png`));
	console.log(`zoom    : ${resolve(`${OUT}/pet-boule-${TAG}-zoom.png`)}`);
}

// The Defi course carries no jack, so its column is usually absent. It was the control for "is this
// the metal material?", and that question is answered — the bodies shade fine either way.
const avg = (f, k) => { const p = rows.filter(f); return p.length ? p.reduce((a, c) => a + c[k], 0) / p.length : null; };
const show = (v) => (v === null ? '—' : v.toFixed(1));
console.log(`\namplitude moyenne · cochonnet (témoin, non métallique) ${show(avg((r) => r.jack, 'amp'))}  ·  boules ${show(avg((r) => !r.jack, 'amp'))}`);
console.log(`ombre de contact moyenne ${show(avg(() => true, 'ombre'))} niveaux (${(avg(() => true, 'pct') ?? 0).toFixed(0)} % du sol)`);
console.log(`capture : ${shotPath}`);

await browser.close();
server.stop();
process.exit(0);
