/* The mini-games page (/jeux/): its shortcut sections and its tile sizes.
     · Nouveautés, then the Top, then Favoris come before the categories, and every game is
       still in its category: the shortcuts hold copies.
     · A heart adds a copy to Favoris and leaves the card in its category; the copy's heart
       takes it out again.
     · The search hides the shortcuts, so each game shows and counts once.
     · Icons, tiles and list change the grid, and the choice survives a reload.
     · The daily challenges page (/jeux/defi/) copies its favorites too, and counts them once.
   The browser's calls to the scores backend are stubbed empty (the Top is read by the server).
   MODE=preview after a build (default: dev). SHOTS=<dir> also writes a capture of each size,
   THEME=dark in the dark theme. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { startServer } from './preview-server.mjs';

const PORT = 4474;
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const server = await startServer(PORT, { mode: process.env.MODE || 'dev' });
const browser = await chromium.launch();
const fail = [];
const line = (ok, what) => {
	console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
	if (!ok) fail.push(what);
};

const open = async (viewport, path = '/jeux/', favorites = null) => {
	const ctx = await browser.newContext({
		locale: 'fr-FR',
		viewport,
		reducedMotion: 'reduce',
		colorScheme: process.env.THEME === 'dark' ? 'dark' : 'light',
	});
	await ctx.route(/supabase\.co\/(rest|functions)\//, (r) =>
		r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }),
	);
	if (favorites) await ctx.addInitScript((f) => localStorage.setItem('ludiven-favorites', f), JSON.stringify(favorites));
	const page = await ctx.newPage();
	const errs = [];
	page.on('pageerror', (e) => errs.push(e.message));
	await page.goto(`${server.base}${path}`, { waitUntil: 'networkidle' });
	await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
	return { ctx, page, errs };
};

// Fold titles in page order, the visible ones only.
const folds = (page) =>
	page.$$eval('.game-fold', (fs) =>
		fs.map((f) => ({
			id: f.dataset.foldId,
			shown: !f.hidden && getComputedStyle(f).display !== 'none',
			ids: Array.from(f.querySelectorAll('.game-card-wrap')).map((w) => w.dataset.gameId),
			extra: f.hasAttribute('data-fold-extra'),
		})),
	);
// The sections from the tools down, once the size buttons have finished their fade.
const shoot = async (page, name) => {
	await page.evaluate(() => document.querySelector('.games-tools').scrollIntoView({ block: 'start' }));
	await page.waitForTimeout(400);
	await page.screenshot({ path: `${shots}/${name}.png` });
};
const columns = (page, fold) =>
	page.$eval(`.game-fold[data-fold-id="${fold}"] .games-grid`, (g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);

try {
	const { ctx, page, errs } = await open({ width: 1366, height: 900 });

	let all = await folds(page);
	const order = all.filter((f) => f.shown).map((f) => f.id);
	line(order[0] === 'nouveautes' && order[1] === 'top' && !all.find((f) => f.id === 'favoris').shown,
		`Nouveautés, then the Top, then the categories (Favoris hidden while empty): ${order.slice(0, 4).join(', ')}…`);
	const fresh = all.find((f) => f.id === 'nouveautes').ids;
	const top = all.find((f) => f.id === 'top')?.ids ?? [];
	line(fresh.length === 5, `5 new games: ${fresh.join(', ')}`);
	line(top.length >= 1 && top.length <= 5, `a Top of ${top.length}: ${top.join(', ')}`);
	const ranks = await page.$$eval('.games-grid.ranked > li', (ls) => ls.map((l) => getComputedStyle(l, '::before').content));
	line(ranks.length === top.length && ranks.every((r) => r && r !== 'none'), 'each Top tile carries its rank');
	const inCategories = all.filter((f) => !f.extra).flatMap((f) => f.ids);
	const total = Number(await page.$eval('#game-search-status', (s) => s.dataset.total));
	line(inCategories.length === total && new Set(inCategories).size === total,
		`every game once in the categories: ${inCategories.length} of ${total}`);
	line([...fresh, ...top].every((id) => inCategories.includes(id)), 'the shortcuts repeat games of the categories');

	// Favorites: a copy, the category keeps its card.
	const fav = inCategories[0];
	await page.locator(`.game-fold:not([data-fold-extra]) .fav-toggle[data-game-id="${fav}"]`).click();
	await page.waitForTimeout(100);
	all = await folds(page);
	const favFold = all.find((f) => f.id === 'favoris');
	line(favFold.shown && favFold.ids.join() === fav, `the heart puts a copy of ${fav} in Favoris`);
	line(all.filter((f) => !f.extra).flatMap((f) => f.ids).length === total, 'its card stays in its category');
	await page.locator(`.game-fold[data-fold-id="favoris"] .fav-toggle[data-game-id="${fav}"]`).click();
	await page.waitForTimeout(100);
	all = await folds(page);
	line(!all.find((f) => f.id === 'favoris').shown, 'the copy’s heart empties Favoris again');

	// Search: the shortcuts step aside, the count is per game.
	await page.fill('#game-search', fresh[0]);
	await page.waitForTimeout(100);
	all = await folds(page);
	const shownExtras = all.filter((f) => f.extra && f.shown).length;
	const hits = await page.$$eval('.game-fold:not([data-fold-extra]) li:not(.gs-hidden)', (ls) => ls.length);
	const said = await page.$eval('#game-search-status', (s) => s.textContent);
	line(shownExtras === 0 && said.startsWith(`${hits} jeu`), `searching « ${fresh[0]} » hides the shortcuts and says ${said}`);
	await page.fill('#game-search', '');
	await page.waitForTimeout(100);

	// Tile sizes.
	const sizes = {};
	for (const [label, size] of [['Vignettes', 'grid'], ['Icônes', 'icon'], ['Liste', 'list']]) {
		await page.getByRole('button', { name: label }).click();
		const cols = await columns(page, 'maths');
		const short = await columns(page, 'nouveautes');
		const pressed = await page.getByRole('button', { name: label }).getAttribute('aria-pressed');
		const media = await page.$eval('.game-fold[data-fold-id="nouveautes"] .game-card-media', (m) => {
			const r = m.getBoundingClientRect();
			return r.width / r.height;
		});
		const pitch = await page.$eval('.game-fold[data-fold-id="nouveautes"] .art-pitch', (p) => getComputedStyle(p).display !== 'none');
		sizes[size] = { cols, short, pressed, media, pitch };
		if (shots) await shoot(page, `desk-${size}`);
	}
	line(sizes.grid.cols === 4 && sizes.grid.short === 5 && Math.abs(sizes.grid.media - 1.6) < 0.05,
		`Vignettes at 1366 px: ${sizes.grid.cols} per row, the shortcuts' five on one row (${sizes.grid.short})`);
	line(sizes.icon.cols >= 9 && sizes.icon.short === sizes.icon.cols && Math.abs(sizes.icon.media - 1) < 0.05,
		`Icônes: square icons, ${sizes.icon.cols} per row`);
	line(sizes.list.cols === 1 && sizes.list.short === 1 && sizes.list.pitch && !sizes.grid.pitch, 'Liste: one per row, with the pitch');
	line(Object.values(sizes).every((v) => v.pressed === 'true'), 'the chosen size shows pressed');

	await page.reload({ waitUntil: 'networkidle' });
	const kept = await page.$eval('.games-sections', (s) => s.dataset.tiles);
	const keptPressed = await page.getByRole('button', { name: 'Liste' }).getAttribute('aria-pressed');
	line(kept === 'list' && keptPressed === 'true', `the size survives a reload (${kept})`);
	line(errs.length === 0, `no page error${errs.length ? `: ${errs.join(' | ')}` : ''}`);
	await ctx.close();

	// Phone: icons fill a row, the list stays readable.
	const phone = await open({ width: 390, height: 844 });
	const counts = {};
	for (const [label, size] of [['Icônes', 'icon'], ['Vignettes', 'grid'], ['Liste', 'list']]) {
		await phone.page.getByRole('button', { name: label }).click();
		counts[size] = await columns(phone.page, 'maths');
		if (shots) await shoot(phone.page, `phone-${size}`);
	}
	const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
	line(counts.icon === 4 && counts.grid === 2 && counts.list === 1, `phone: ${counts.icon} icons, ${counts.grid} tiles, ${counts.list} row per line`);
	line(!overflow, 'phone: no sideways scroll');
	await phone.ctx.close();

	// Daily challenges: a favorite is copied, and the « N défis à faire » counts it once.
	const defi = await open({ width: 1366, height: 900 }, '/jeux/defi/', ['sudoku', 'tubes']);
	const dFolds = await folds(defi.page);
	const dFav = dFolds.find((f) => f.id === 'favoris');
	const dCats = dFolds.filter((f) => !f.extra).flatMap((f) => f.ids);
	const counter = await defi.page.$eval('#defi-count', (c) => c.textContent);
	line(dFav.shown && dFav.ids.sort().join() === 'sudoku,tubes', `défi: Favoris holds copies of ${dFav.ids.join(', ')}`);
	line(['sudoku', 'tubes'].every((id) => dCats.includes(id)), 'défi: both stay in their category');
	line(counter.includes(`/${dCats.length} `), `défi: the counter counts each game once (${counter})`);
	line(defi.errs.length === 0, `défi: no page error${defi.errs.length ? `: ${defi.errs.join(' | ')}` : ''}`);
	await defi.ctx.close();
} finally {
	await browser.close();
	server.stop();
}

console.log(fail.length ? `\n${fail.length} FAIL` : '\nall ok');
process.exit(fail.length ? 1 : 0);
