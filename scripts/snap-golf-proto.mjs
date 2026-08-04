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
const relief = page.locator('.gp-slider input').nth(2);

// Pull the ball back down the fairway: aim drag from the ball toward the camera.
const swing = async () => {
	const b = await stage.boundingBox();
	const cx = b.x + b.width / 2, cy = b.y + b.height * 0.72;
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx + 12, cy + 55, { steps: 12 });
	await page.mouse.up();
	await page.waitForTimeout(4500);
};

// ---- Wide format: framing sweep.
await shot('fit-default');
await relief.fill('0'); await page.waitForTimeout(1200); await shot('fit-flat');
await relief.fill('1.6'); await page.waitForTimeout(1200); await shot('fit-relief16');
await relief.fill('0.5'); await page.waitForTimeout(1200);

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
await click(/Trou entier/);

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

console.log(JSON.stringify(report, null, 1));
await browser.close();
