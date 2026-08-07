/* Throwaway: draw a rope by hand and see what Cordes actually looks like. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4342;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 520, height: 980 }, deviceScaleFactor: 3, hasTouch: true });
await ctx.addInitScript(() => {
	localStorage.setItem('ludiven-tuto-seen', '["cordes"]');
	// Owning the pack is what puts the Expert pill on screen — the widest frame we ship.
	localStorage.setItem('ludiven-cocottes', JSON.stringify({ balance: 0, owned: ['expert:cordes'] }));
});
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

const shot = (name) => page.locator('.cor-boardwrap').screenshot({ path: resolve(`D:/tmp/cordes-${name}.png`) });
const viewShot = (name) => page.screenshot({ path: resolve(`D:/tmp/cordes-${name}.png`) });
const gauge = () => page.locator('.cor-gauge').textContent();

async function fresh(label) {
	await page.goto(`${base}/jeux/cordes/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.dt-seg');
	// The game opens on Niveaux; free play is where the pills and the ungated hint live.
	await page.locator('.dt-seg', { hasText: 'Libre' }).click();
	await page.waitForSelector('.cor-board');
	if (label) {
		await page.locator('.cor-pill', { hasText: label }).click();
		await page.waitForSelector('.cor-board');
	}
	await sleep(400);
}

/** Where the pegs are, in page pixels. */
async function pegs() {
	const box = await page.locator('.cor-board').boundingBox();
	return page.evaluate(({ box }) => {
		const svg = document.querySelector('.cor-svg');
		return [...svg.querySelectorAll('.cor-peg')].map((c) => ({
			x: box.x + (+c.getAttribute('cx') / 100) * box.width,
			y: box.y + (+c.getAttribute('cy') / 100) * box.height,
		}));
	}, { box });
}

/** Drag from a to b in `steps` moves, like a finger would. */
async function drag(a, b, steps = 40) {
	await page.mouse.move(a.x, a.y);
	await page.mouse.down();
	for (let i = 1; i <= steps; i++) {
		await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
		await sleep(8);
	}
	await page.mouse.up();
}

/* ---- 1. A fresh board: four pegs, no rope. ---- */
await fresh();
console.log('--- facile, fresh ---', await gauge());
console.log('pegs on the board:', await page.locator('.cor-peg').count());
await shot('1-fresh');
await viewShot('1b-viewport');

// Does the fixed leaderboard pill really sit over a peg at the natural scroll position?
const clash = await page.evaluate(() => {
	const pill = document.querySelector('.lbc-pill')?.getBoundingClientRect();
	if (!pill) return 'no pill';
	const hidden = [...document.querySelectorAll('.cor-peg')].filter((c) => {
		const r = c.getBoundingClientRect();
		return r.right > pill.left && r.left < pill.right && r.bottom > pill.top && r.top < pill.bottom;
	}).length;
	const board = document.querySelector('.cor-board').getBoundingClientRect();
	return { hidden, pillTop: Math.round(pill.top), boardBottom: Math.round(board.bottom), scrollable: document.documentElement.scrollHeight > innerHeight };
});
console.log('pill vs pegs:', JSON.stringify(clash));

/* ---- 2. Drag one rope straight across: it should stick where it cannot pass. ---- */
const p = await pegs();
await drag(p[0], p[1]);
await sleep(200);
console.log('--- after a straight drag ---', await gauge());
console.log('ropes drawn:', await page.locator('.cor-rope').count(), '· drafts:', await page.locator('.cor-rope.draft').count());
await shot('2-one-rope');

/* ---- 3. Let the hints finish it. ---- */
const hintBtn = page.locator('.cor-act').first();
for (let i = 0; i < 12 && !(await page.locator('.cor-win').count()); i++) {
	if (!(await hintBtn.count()) || await hintBtn.isDisabled()) break;
	await hintBtn.click();
	await sleep(150);
}
console.log('--- after hints ---', await gauge().catch(() => '(won)'));
await sleep(500);
await shot('3-solved');

/* ---- 4. Difficile: five ropes have to stay readable. ---- */
await fresh('Difficile');
console.log('--- difficile, fresh ---', await gauge());
const q = page.locator('.cor-act').first();
for (let i = 0; i < 12 && !(await page.locator('.cor-win').count()); i++) {
	if (!(await q.count()) || await q.isDisabled()) break;
	await q.click();
	await sleep(150);
}
await sleep(500);
await shot('4-difficile-solved');

/* ---- 5. Expert: seven ropes on a 10x10 frame — pegs must stay big enough to tap. ---- */
await fresh('Expert');
console.log('--- expert, fresh ---', await gauge());
await shot('5-expert');

console.log('→ D:/tmp/cordes-*.png');
await browser.close();
server.kill();
process.exit(0);
