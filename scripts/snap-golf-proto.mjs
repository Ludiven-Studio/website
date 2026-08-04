import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:4342';

const browser = await chromium.launch();
const ctx = await browser.newContext({ serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

await page.setViewportSize({ width: 1280, height: 1000 });
await page.goto(`${BASE}/labo/`, { waitUntil: 'networkidle' });

const root = page.locator('.gp-root');
await root.scrollIntoViewIfNeeded();
await page.waitForTimeout(3000);

const stage = page.locator('.gp-stage');
const shot = async (name) => { await stage.screenshot({ path: `D:/tmp/gp-${name}.png` }); };
const click = async (name) => { await page.getByRole('button', { name }).click(); await page.waitForTimeout(1200); };
const chips = () => page.evaluate(() => [...document.querySelectorAll('.gp-chip')].map((c) => c.textContent.trim()));

const pitch = page.locator('.gp-slider input').nth(0);
const zoom = page.locator('.gp-slider input').nth(2);
const relief = page.locator('.gp-slider input').nth(3);
const bank = page.locator('.gp-slider input').nth(4);

// Pull the ball back down the fairway: aim drag from the ball toward the camera.
// Returns the peak speed just after release — the honest measure of shot power, since
// how far the ball rolls also depends on the walls it hits.
const swing = async (pull = 55, drift = 12) => {
	const b = await stage.boundingBox();
	const p = await page.evaluate(() => window.__gpBall);
	const cx = b.x + (p ? p.x : b.width / 2), cy = b.y + (p ? p.y : b.height * 0.72);
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx + drift, cy + pull, { steps: 12 });
	await page.mouse.up();
	let peak = 0;
	for (let i = 0; i < 10; i++) {
		peak = Math.max(peak, (await page.evaluate(() => window.__gpBall)).speed);
		await page.waitForTimeout(60);
	}
	await page.waitForTimeout(4000);
	return peak;
};

// ---- Wide format: framing sweep.
await shot('fit-default');
await relief.fill('0'); await page.waitForTimeout(1200); await shot('fit-flat');
await relief.fill('1.6'); await page.waitForTimeout(1200); await shot('fit-relief16');
await relief.fill('0.1'); await page.waitForTimeout(1200);

// ---- Banking: same turn, cross slope off then on. Needs a shape with a real bend and
// a close framing — on the long random ribbon the tilt is a couple of pixels.
await click('Fer à cheval');
await zoom.fill('2');
await bank.fill('0'); await page.waitForTimeout(1600); await shot('bank-off');
await bank.fill('5'); await page.waitForTimeout(1600); await shot('bank-mid');
await bank.fill('10'); await page.waitForTimeout(1600); await shot('bank-max');
await bank.fill('5'); await zoom.fill('1'); await page.waitForTimeout(1400);
await click('Aléatoire (moteur)');

// ---- Authored shapes: one shot per figure, at the default framing.
const SHAPES = [['Ligne droite', 'straight'], ['Coude', 'elbow'], ['Double virage', 'ess'],
	['Fer à cheval', 'horseshoe'], ['Spirale', 'spiral']];
for (const [label, slug] of SHAPES) {
	await click(label);
	await page.waitForTimeout(1200);
	await shot(`shape-${slug}`);
}
// Low angle on a short hole: the only view that shows whether the arch is open.
await click('Ligne droite');
await pitch.fill('20'); await page.waitForTimeout(1400); await shot('bridge-low');
await pitch.fill('45'); await page.waitForTimeout(600);
await click('Aléatoire (moteur)');

for (const p of [20, 30, 60]) {
	await pitch.fill(String(p));
	await page.waitForTimeout(1200);
	await shot(`fit-p${p}`);
}
await click(/Vue du dessus/);
await shot('topdown');
// Zoom pulls the framing in on the ball — the top view was the ask.
for (const z of [2.5, 5]) {
	await zoom.fill(String(z));
	await page.waitForTimeout(1200);
	await shot(`topdown-zoom${z}`);
}
await zoom.fill('1'); await page.waitForTimeout(800);
await click(/Trou entier/);

// ---- The cup, close up. Zoom tracks the ball, so the only way to frame the hole is to
// play down to it: swing until it drops, then come in tight on where it landed.
await click('Ligne droite');
for (let n = 0; n < 12; n++) {
	if ((await chips()).some((c) => c.includes('Dans le trou'))) break;
	await swing(110);
}
await zoom.fill('3.5'); await page.waitForTimeout(1200); await shot('cup-approach');
await zoom.fill('6'); await page.waitForTimeout(1500); await shot('cup-zoom');
await zoom.fill('1'); await page.waitForTimeout(800);
await click('Aléatoire (moteur)');

// ---- Phone format: the numbers that matter.
await click(/Format téléphone/);
const report = {};
for (const p of [20, 30, 45]) {
	await pitch.fill(String(p));
	await page.waitForTimeout(1500);
	await swing();
	await shot(`phone-fit-p${p}`);
	report[`fit ${p}°`] = (await chips()).slice(1, 3).join(' / ');
}

await click(/Caméra d'épaule/);
await pitch.fill('30');
await page.waitForTimeout(1500);
await shot('phone-shoulder');
await swing();
await shot('phone-shoulder-rolling');
report['épaule 30°'] = (await chips()).slice(1, 3).join(' / ');

// ---- Launch power per camera. Aim used to be measured on the ground plane, so the same
// drag was worth half the speed from a shoulder camera. These two lines should now match.
await click(/Format large/);
await click('Ligne droite');
for (const [mode, label] of [['large', /Trou entier/], ['épaule', /Caméra d'épaule/]]) {
	await click(label);
	const peaks = [];
	for (const frac of [0.15, 0.3]) {
		await click('Nouveau trou');
		const box = await stage.boundingBox();
		peaks.push(`${frac * 100}%h → ${(await swing(box.height * frac, 0)).toFixed(1)} u/s`);
	}
	report[`tir ${mode}`] = peaks.join(' · ');
}

console.log(JSON.stringify(report, null, 1));
await browser.close();
