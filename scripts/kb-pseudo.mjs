/* Throwaway: type a pseudo full of steering letters on every game page and check nothing is
   eaten. Reproduces the player report ("a, z, d don't work in the pseudo field").
   A page that cannot be driven counts as UNRESOLVED, never as a pass. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:4321';
// Every letter a game binds (z q s d w a r), the tool/power digits, and a space.
const TYPED = 'azerty wsdr 1234';

const PAGES = (process.env.ONLY || [
	'course-de-peinture', '2048', 'snake', 'luge', 'drift', 'foot', 'pong', 'esquive',
	'flappy', 'casse-briques', 'cocotte-mineuse', 'sudoku', 'suguru', 'calcudoku',
	'somme-toute', 'tectonique', 'souffle', 'lumen', 'pavage', 'tempo', 'flechettes',
	'mot-secret',
].join(',')).split(',');

const browser = await chromium.launch();
const bad = [], unresolved = [];

for (const slug of PAGES) {
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	try {
		await page.goto(`${BASE}/jeux/${slug}`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1200); // the React island must hydrate before its tabs answer clicks

		// The how-to-play overlay swallows clicks on first visit.
		const overlay = page.locator('.tuto-overlay:not([hidden])');
		if (await overlay.count()) {
			await page.locator('.tuto-skip').first().click({ timeout: 4000 }).catch(() => {});
			await page.locator('.tuto-close').first().click({ timeout: 2000 }).catch(() => {});
			await overlay.waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
		}

		// The leaderboard lives on the daily tab, inside a collapsed fold.
		const tab = page.getByRole('tab', { name: /Défi/ });
		if (await tab.count()) await tab.first().click({ timeout: 6000 });
		const fold = page.getByRole('button', { name: /Classement/ });
		if (await fold.count()) await fold.first().click({ timeout: 6000 });

		const link = page.locator('.lb-link').first();
		await link.waitFor({ state: 'visible', timeout: 10000 });
		await link.click();

		const input = page.locator('.lb-name input');
		await input.waitFor({ state: 'visible', timeout: 5000 });
		await input.fill('');
		await input.focus();
		// pressSequentially sends real keydown/keyup, so a global game handler sees them too.
		await input.pressSequentially(TYPED, { delay: 12 });

		const got = await input.inputValue();
		if (got === TYPED) console.log(`ok     ${slug.padEnd(20)} "${got}"`);
		else { console.log(`MANGÉ  ${slug.padEnd(20)} "${got}"  (attendu "${TYPED}")`); bad.push(slug); }
	} catch (e) {
		console.log(`?      ${slug.padEnd(20)} ${e.message.split('\n')[0]}`);
		unresolved.push(slug);
	}
	await page.close();
}

await browser.close();
console.log(`\n${PAGES.length - bad.length - unresolved.length} ok · ${bad.length} cassée(s) · ${unresolved.length} non testée(s)`);
if (bad.length) console.log(`cassées : ${bad.join(', ')}`);
if (unresolved.length) console.log(`NON TESTÉES (pas une réussite) : ${unresolved.join(', ')}`);
process.exit(bad.length || unresolved.length ? 1 : 0);
