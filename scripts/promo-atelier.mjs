/* Atelier promo, step 1: play scripted shots of the real game on a phone viewport and record them (1080x1920).
   Writes D:/tmp/promo-atelier/raw.mp4 (30 fps) and shots.json (name, start, end in seconds of raw.mp4), for
   scripts/promo-atelier-edit.mjs to cut and caption.
   Playwright's recordVideo ignores deviceScaleFactor (the page lands in a corner at 1x), so frames come from a
   CDP screencast, at device pixels thanks to --force-device-scale-factor, then ffmpeg makes a constant-rate video.
   Usage: node scripts/promo-atelier.mjs [out dir] */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/promo-atelier');
const PORT = 4381;
const W = 432, H = 768, DPR = 2.5;
// Room at the top of the frame for the captions burnt in by the edit step.
const TOP = 150;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FRAMES = join(OUT, 'frames');
await rm(FRAMES, { recursive: true, force: true });
await mkdir(FRAMES, { recursive: true });

const server = await startServer(PORT, { mode: 'dev' });
const errors = [];
const shots = [];
const frames = [];
const writes = [];
try {
	// Without the flag the screencast stays at CSS pixels, whatever the context's deviceScaleFactor.
	const browser = await chromium.launch({ args: [`--force-device-scale-factor=${DPR}`] });
	const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, bypassCSP: true });
	await ctx.addInitScript((top) => {
		localStorage.setItem('ludiven-tuto-seen', '["atelier"]');
		const css = `astro-dev-toolbar { display: none !important; }
			.backgrounds > :not(.game-page), .game-page > :not(astro-island) { display: none !important; }
			.game-page { padding-top: ${top}px !important; padding-bottom: 40vh !important; }
			html { scroll-behavior: auto !important; }`;
		document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); });
	}, TOP);
	const page = await ctx.newPage();
	const cdp = await ctx.newCDPSession(page);
	cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
		const file = join(FRAMES, `${String(frames.length).padStart(5, '0')}.jpg`);
		frames.push({ file, ts: metadata.timestamp });
		writes.push(writeFile(file, Buffer.from(data, 'base64')));
		cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
	});
	await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * DPR, maxHeight: H * DPR });
	// Shot marks share the screencast's clock (epoch seconds); made relative to the first frame at the end.
	const now = () => Date.now() / 1000;
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fetching the script')) errors.push(m.text()); });

	const url = `http://localhost:${PORT}/jeux/atelier/`;
	await page.goto(url, { waitUntil: 'networkidle' });
	await page.waitForSelector('.at-root');

	/** Build a save from a fresh game, then reload on it. `fn` runs in the page with (st, engine, data). */
	const load = async (fn) => {
		await page.evaluate(async (src) => {
			const engine = await import('/src/games/atelier/engine.ts');
			const data = await import('/src/games/atelier/data.ts');
			const st = engine.newGame(Date.now(), 4242);
			// eslint-disable-next-line no-new-func
			new Function('st', 'engine', 'data', src)(st, engine, data);
			localStorage.setItem('ludiven-atelier', JSON.stringify(st));
		}, `(${fn})(st, engine, data)`);
		await page.reload({ waitUntil: 'networkidle' });
		await page.waitForSelector('.at-root');
		await sleep(600);
	};
	const shot = async (name, fn) => {
		const start = now();
		await fn();
		shots.push({ name, start, end: now() });
	};
	const cell = async (r, c) => {
		const b = await page.locator('.at-cell').nth(r * 7 + c).boundingBox();
		return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
	};
	const drag = async (from, to) => {
		const a = await cell(...from), b = await cell(...to);
		await page.mouse.move(a.x, a.y);
		await page.mouse.down();
		await page.mouse.move(a.x + 6, a.y + 6, { steps: 2 });
		await page.mouse.move(b.x, b.y, { steps: 14 });
		await sleep(120);
		await page.mouse.up();
		await sleep(380);
	};
	const next = async () => { await page.locator('.at-talk-nav .at-btn:not(.ghost)').click(); };
	const closeTalks = async () => {
		while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn.ghost').click(); await sleep(200); }
	};
	const toWorkshop = async () => {
		await closeTalks();
		if (!(await page.locator('.at-shop').count())) await page.locator('.at-tab', { hasText: 'Atelier' }).click();
		// Same spot as the reveal's own scrollIntoView, so buying an upgrade does not jump the frame.
		await page.evaluate(() => document.querySelector('.at-scene').scrollIntoView({ block: 'center' }));
		await sleep(400);
	};
	const buy = (name) => page.locator('.at-up', { hasText: name }).locator('button').click();
	const allUpTo = (lastProject, lastStep) => `
		for (const p of data.PROJECTS) {
			if (p.id === '${lastProject}') { st.progress[p.id] = ${lastStep}; break; }
			st.progress[p.id] = p.steps;
		}
		const told = (o) => o.project && st.progress[o.project] >= o.step;
		st.done = data.ORDERS.filter(told).map((o) => o.id);
		st.seen = ['intro', 'chapter', 'epilogue', 'rep-5', 'map-solved', ...data.PROJECTS.map((p) => 'arrival:' + p.id), ...data.UPGRADES.map((u) => 'up:' + u.id)];
		st.tut = 4;`;

	// 1. The dusty workshop: the intro card of a fresh game.
	await page.evaluate(() => localStorage.removeItem('ludiven-atelier'));
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForSelector('.at-talk');
	await shot('intro', () => sleep(3500));

	// 2. Merges: a bench one cascade away from the watch's last step.
	await load(`(st, engine, data) => {
		${allUpTo('montre', 2)}
		st.upgrades = ['etabli', 'lampe'];
		st.coins = 42; st.rep = 9;
		st.board = st.board.map((p) => (p && p.startsWith('g:') ? p : null));
		const put = (r, c, p) => { st.board[r * 7 + c] = p; };
		put(1, 1, 'soin:1'); put(1, 2, 'soin:1'); put(1, 4, 'soin:2'); put(2, 3, 'soin:3');
		put(6, 1, 'meca:1'); put(6, 3, 'meca:1'); put(6, 5, 'meca:2');
		put(0, 0, 'outil:2'); put(0, 6, 'meca:4'); put(3, 0, 'outil:1'); put(7, 6, 'soin:2'); put(8, 2, 'outil:3'); put(3, 6, 'meca:1');
	}`);
	await closeTalks();
	await page.evaluate((top) => { const r = document.querySelector('.at-orders').getBoundingClientRect(); scrollTo(0, scrollY + r.top - top); }, TOP);
	await sleep(500);
	await shot('merge', async () => {
		const g = await cell(4, 1);
		await page.mouse.click(g.x, g.y); await sleep(450);
		await page.mouse.click(g.x, g.y); await sleep(450);
		await drag([1, 1], [1, 2]);
		await drag([1, 2], [1, 4]);
		await drag([1, 4], [2, 3]);
		await drag([6, 1], [6, 3]);
		await drag([6, 3], [6, 5]);
		await sleep(700);
	});

	// 3. Deliver: the watch shines, then the 1961 photo.
	await shot('deliver', async () => {
		await page.locator('.at-order.story .at-give').click();
		await page.waitForSelector('.at-talk');
		await sleep(3200);
	});
	await shot('photo', async () => { await next(); await sleep(3300); });

	// 4. The workshop changes: the sheet flies off, the lamp comes on, the photo goes up.
	await load(`(st) => { st.tut = 3; st.coins = 8; st.seen = ['intro']; }`);
	await toWorkshop();
	await shot('etabli', async () => { await buy('Dégager l’établi'); await sleep(3000); });
	await load(`(st, engine, data) => { ${allUpTo('montre', 1)} st.upgrades = ['etabli']; st.coins = 25; st.rep = 4; }`);
	await toWorkshop();
	await shot('lampe', async () => { await buy('Rallumer la lampe'); await sleep(2800); });
	await load(`(st, engine, data) => { ${allUpTo('montre', 3)} st.upgrades = ['etabli', 'lampe']; st.coins = 20; st.rep = 12; st.seen = st.seen.filter((x) => x !== 'chapter' && x !== 'epilogue'); }`);
	await toWorkshop();
	await shot('photo-up', async () => { await buy('Accrocher la photo'); await sleep(2800); });

	// 5. The story: Jeanne's postcard, then her locked office and the map.
	await load(`(st, engine, data) => { ${allUpTo('montre', 1)} st.upgrades = ['etabli']; st.rep = 5; st.seen = st.seen.filter((x) => x !== 'rep-5'); }`);
	await page.waitForSelector('.at-talk');
	await next();
	await shot('postcard', () => sleep(3800));
	await load(`(st, engine, data) => {
		${allUpTo('boite', 2)}
		st.upgrades = data.UPGRADES.filter((u) => ['etabli', 'lampe', 'photo', 'etageres', 'menuiserie'].includes(u.id)).map((u) => u.id);
		st.coins = 60; st.rep = 40;
		st.seen = st.seen.filter((x) => x !== 'up:bureau');
	}`);
	await toWorkshop();
	await shot('bureau', async () => { await buy('Ouvrir le bureau de Jeanne'); await sleep(2200); });
	await page.locator('.at-reveal').click();
	await page.waitForSelector('.at-talk');
	await shot('office', () => sleep(2600));
	await next();
	await shot('map', () => sleep(3600));

	await sleep(300);
	await cdp.send('Page.stopScreencast');
	await browser.close();
} finally {
	server.stop();
}
await Promise.all(writes);
// A frame comes only when the page changes: each one lasts until the next.
const t0 = frames[0].ts;
const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, '/')}'\nduration ${((frames[i + 1]?.ts ?? f.ts + 0.1) - f.ts).toFixed(4)}`);
list.push(`file '${frames.at(-1).file.replace(/\\/g, '/')}'`);
await writeFile(join(OUT, 'frames.txt'), list.join('\n'));
const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(OUT, 'frames.txt'),
	'-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', join(OUT, 'raw.mp4')], { stdio: 'inherit' });
if (ff.status !== 0) { console.log('ffmpeg failed'); process.exitCode = 1; }
const rel = shots.map((s) => ({ name: s.name, start: +(s.start - t0).toFixed(3), end: +(s.end - t0).toFixed(3) }));
await writeFile(join(OUT, 'shots.json'), JSON.stringify(rel, null, 1));
for (const s of rel) console.log(`${s.name}: ${s.start} → ${s.end}`);
console.log(`${frames.length} frames → raw.mp4 + shots.json in ${OUT}`);
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
