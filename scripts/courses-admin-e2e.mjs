// Throwaway check for /courses/admin: the key gate, the listing, copy-link and
// delete. The key is never in this file — pass it in the environment:
//   $env:COURSES_ADMIN_KEY = '...'; node scripts/courses-admin-e2e.mjs
import { chromium } from 'playwright';

const BASE = 'http://localhost:4331';
const KEY = process.env.COURSES_ADMIN_KEY;
if (!KEY) { console.error('COURSES_ADMIN_KEY manquante'); process.exit(2); }

const ok = [];
const ko = [];
const check = (cond, label) => (cond ? ok : ko).push(label);

const browser = await chromium.launch();
const ctx = await browser.newContext({
	viewport: { width: 390, height: 844 },
	permissions: ['clipboard-read', 'clipboard-write'],
});
const P = await ctx.newPage();
const errors = [];
P.on('pageerror', (e) => errors.push(e.message));

try {
	// ---- 1. Locked without a key ----
	await P.goto(`${BASE}/courses/admin`, { waitUntil: 'networkidle' });
	await P.getByPlaceholder('Clé admin').waitFor({ timeout: 15000 });
	check((await P.locator('.co-card').count()) === 0, 'sans cle: rien ne fuit');

	// ---- 2. A wrong key is refused, and stays refused ----
	await P.getByPlaceholder('Clé admin').fill('not-the-key');
	await P.getByRole('button', { name: 'Ouvrir' }).click();
	await P.locator('.co-error').waitFor({ timeout: 15000 });
	check((await P.locator('.co-error').innerText()).includes('refus'), 'mauvaise cle: refusee');
	check((await P.locator('.co-card').count()) === 0, 'mauvaise cle: aucune liste affichee');

	// ---- 3. The right key opens it ----
	await P.getByPlaceholder('Clé admin').fill(KEY);
	await P.getByRole('button', { name: 'Ouvrir' }).click();
	await P.locator('.co-card').first().waitFor({ timeout: 15000 });
	check((await P.locator('.co-card').count()) > 0, `${await P.locator('.co-card').count()} listes affichees`);
	check((await P.locator('.co-card-meta').first().innerText()).includes('à prendre'), 'chaque carte montre le reste a prendre');
	await P.screenshot({ path: 'D:/Projects/LudivenStudio/website/dist/_e2e-admin.png', fullPage: false });

	// ---- 4. The key is remembered, so the bookmark works ----
	await P.goto(`${BASE}/courses/admin`, { waitUntil: 'networkidle' });
	await P.locator('.co-card').first().waitFor({ timeout: 15000 });
	check(true, 'cle memorisee: pas de re-saisie au retour');

	// ---- 5. Copy link gives the real shared URL ----
	await P.locator('.co-card').first().getByRole('button', { name: 'Copier le lien' }).click();
	const clip = await P.evaluate(() => navigator.clipboard.readText());
	check(/\/courses\?l=[0-9a-f-]{36}$/.test(clip), `lien copie utilisable (${clip})`);

	// ---- 6. Open goes to that list ----
	await P.locator('.co-card').first().getByRole('link', { name: 'Ouvrir' }).click();
	await P.locator('.co-add').waitFor({ timeout: 15000 });
	check(P.url().includes('?l='), 'Ouvrir mene bien a la liste');
	await P.goBack({ waitUntil: 'networkidle' });
	await P.locator('.co-card').first().waitFor({ timeout: 15000 });

	// ---- 7. Delete removes a space for good. Make our own throwaway one first:
	// deleting is irreversible, so the test must never touch a real list.
	await P.goto(`${BASE}/courses`, { waitUntil: 'networkidle' });
	await P.getByRole('button', { name: 'Créer ma liste' }).click();
	await P.waitForFunction(() => new URLSearchParams(location.search).get('l'), null, { timeout: 15000 });
	const doomed = new URL(P.url()).searchParams.get('l');

	await P.goto(`${BASE}/courses/admin`, { waitUntil: 'networkidle' });
	const card = P.locator(`.co-card[data-space-id="${doomed}"]`);
	await card.waitFor({ timeout: 15000 });
	check(true, 'la liste tout juste creee apparait dans le dashboard');

	// Renaming from the dashboard: otherwise every card reads "Liste de courses".
	await card.getByRole('button', { name: 'Renommer' }).click();
	await P.locator('.co-sheet input').fill('Courses du samedi');
	await P.getByRole('button', { name: 'Enregistrer' }).click();
	await P.locator('.co-sheet').waitFor({ state: 'detached', timeout: 15000 });
	await P.waitForFunction(
		(id) => document.querySelector(`.co-card[data-space-id="${id}"] .co-card-title`)?.textContent === 'Courses du samedi',
		doomed, { timeout: 20000 },
	);
	check(true, 'renommage depuis le dashboard');

	P.once('dialog', (d) => d.accept());
	await card.getByRole('button', { name: 'Supprimer' }).click();
	await card.waitFor({ state: 'detached', timeout: 20000 });
	check(true, 'suppression effective, et seulement de la liste visee');

	check(errors.length === 0, `aucune erreur JS (${errors.length ? errors.join(' | ') : 'ok'})`);
} catch (e) {
	ko.push(`CRASH: ${e.message.split('\n')[0]}`);
	await P.screenshot({ path: 'D:/Projects/LudivenStudio/website/dist/_e2e-admin-crash.png' }).catch(() => {});
}

await browser.close();
console.log('\n=== RESULTATS ADMIN ===');
for (const t of ok) console.log(`  OK    ${t}`);
for (const t of ko) console.log(`  ECHEC ${t}`);
console.log(`\n${ok.length} reussis, ${ko.length} echecs`);
process.exit(ko.length ? 1 : 0);
