// Throwaway E2E check for /courses: two independent browsers (her + him) on the
// same shared link, verifying live sync, aisles, drag & drop and history reuse.
// Run with the preview server up:  node scripts/courses-e2e.mjs
import { chromium } from 'playwright';

const BASE = 'http://localhost:4331';
const shot = (n) => `D:/Projects/LudivenStudio/website/dist/_e2e-${n}.png`;
const ok = [];
const ko = [];
const check = (cond, label) => (cond ? ok : ko).push(label);

/** Drag one element onto another with real pointer events (useDragSort listens
 *  on pointerdown + document pointermove/up, so a synthetic dispatch won't do). */
async function dragOnto(page, handle, target) {
	const h = await handle.boundingBox();
	const t = await target.boundingBox();
	await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
	await page.mouse.down();
	// Several small steps: the sorter reads elementFromPoint on each move.
	for (let i = 1; i <= 6; i++) {
		await page.mouse.move(
			h.x + h.width / 2 + ((t.x - h.x) * i) / 6,
			h.y + h.height / 2 + ((t.y + t.height / 2 - h.y - h.height / 2) * i) / 6,
		);
		await page.waitForTimeout(40);
	}
	await page.mouse.up();
	await page.waitForTimeout(1200);
}

const labelsIn = (page, section) =>
	page.locator('.co-sec', { hasText: section }).locator('.co-label').allInnerTexts();

const browser = await chromium.launch();
const her = await browser.newContext({ viewport: { width: 390, height: 844 } });
const him = await browser.newContext({ viewport: { width: 390, height: 844 } });
const A = await her.newPage();
const B = await him.newPage();
const errors = [];
for (const p of [A, B]) p.on('pageerror', (e) => errors.push(e.message));

try {
// ---- 1. She creates a list ----
await A.goto(`${BASE}/courses`, { waitUntil: 'networkidle' });
await A.getByRole('button', { name: 'Créer ma liste' }).click();
await A.waitForFunction(() => new URLSearchParams(location.search).get('l'), null, { timeout: 15000 });
const shared = A.url();
check(/\?l=[0-9a-f-]{36}$/.test(shared), 'lien secret genere dans l URL');

// ---- 2. Three items, all unfiled at first ----
for (const [i, [label, qty]] of [['Lait', '2'], ['Pain', ''], ['Tomates', '500 g']].entries()) {
	await A.getByPlaceholder('Ajouter un article…').fill(label);
	if (qty) await A.getByPlaceholder('Qté').fill(qty);
	await A.getByPlaceholder('Ajouter un article…').press('Enter');
	await A.waitForFunction((n) => document.querySelectorAll('.co-row').length === n, i + 1, { timeout: 15000 });
}
check((await A.locator('.co-row').count()) === 3, '3 articles ajoutes');
check((await A.locator('.co-sec', { hasText: 'Sans catégorie' }).count()) === 1, 'articles non classes vont dans "Sans categorie"');

// ---- 3. File "Lait" into Frais via the item editor ----
await A.locator('.co-label-btn', { hasText: 'Lait' }).click();
await A.locator('.co-sheet').waitFor({ timeout: 10000 });
await A.locator('.co-sheet select').selectOption({ label: 'Frais' });
await A.getByRole('button', { name: 'Enregistrer' }).click();
await A.locator('.co-sheet').waitFor({ state: 'detached', timeout: 10000 });
await A.waitForTimeout(1200);
check((await labelsIn(A, 'Frais')).includes('Lait'), '"Lait" classe dans Frais via la fiche article');
await A.screenshot({ path: shot('5-rayons') });

// ---- 3a. Name the list itself (the title doubles as the dashboard label) ----
await A.locator('.co-title-btn').click();
await A.locator('.co-sheet input').fill('Courses de la semaine');
await A.getByRole('button', { name: 'Enregistrer' }).click();
await A.locator('.co-sheet').waitFor({ state: 'detached', timeout: 10000 });
await A.waitForFunction(() => document.querySelector('.co-title-btn')?.textContent === 'Courses de la semaine', null, { timeout: 15000 });
check(true, 'liste renommee depuis son titre');

// ---- 3b. Rename an item, set then clear its quantity ----
const openEditor = async (row) => {
	await A.locator('.co-row', { hasText: row }).locator('.co-main').click();
	await A.locator('.co-sheet').waitFor({ timeout: 10000 });
};
const saveEditor = async () => {
	await A.getByRole('button', { name: 'Enregistrer' }).click();
	await A.locator('.co-sheet').waitFor({ state: 'detached', timeout: 10000 });
	await A.waitForTimeout(1200);
};
await openEditor('Pain');
await A.locator('.co-sheet input').first().fill('Pain complet');
await A.locator('.co-sheet input').nth(1).fill('1 gros');
await saveEditor();
check((await A.locator('.co-row', { hasText: 'Pain complet' }).count()) === 1, 'article renomme');
check(
	(await A.locator('.co-row', { hasText: 'Pain complet' }).locator('.co-qty').innerText()) === '1 gros',
	'quantite modifiee',
);
await openEditor('Pain complet');
await A.locator('.co-sheet input').nth(1).fill('');
await saveEditor();
check(
	(await A.locator('.co-row', { hasText: 'Pain complet' }).locator('.co-qty').innerText()).includes('qté'),
	'quantite effacee',
);

// ---- 4. The filing is remembered for the next time that label is typed ----
await A.getByPlaceholder('Ajouter un article…').fill('LAIT');
await A.getByPlaceholder('Ajouter un article…').press('Enter');
await A.waitForTimeout(1500);
check((await labelsIn(A, 'Frais')).includes('LAIT'), 'MEMOIRE: re-taper "LAIT" le range seul dans Frais');

// ---- 5. Drag "Tomates" from "Sans catégorie" into "Fruits et légumes" ----
const tomatesGrip = A.locator('.co-row', { hasText: 'Tomates' }).locator('.co-grip');
// An aisle with nothing in it is a chip in the strip under the list, not a section.
const legumesChip = A.locator('.co-chip', { hasText: 'Fruits et légumes' });
await dragOnto(A, tomatesGrip, legumesChip);
check((await labelsIn(A, 'Fruits et légumes')).includes('Tomates'), 'GLISSER-DEPOSER: "Tomates" depose dans Fruits et legumes');

// Dragging is also a filing decision -> it must be remembered too.
await A.getByPlaceholder('Ajouter un article…').fill('tomates');
await A.getByPlaceholder('Ajouter un article…').press('Enter');
await A.waitForTimeout(1500);
check((await labelsIn(A, 'Fruits et légumes')).includes('tomates'), 'MEMOIRE: le glisser-deposer memorise aussi le rayon');

// ---- 6. Reorder within an aisle by dragging one row past another ----
const before = await labelsIn(A, 'Fruits et légumes');
const firstGrip = A.locator('.co-sec', { hasText: 'Fruits et légumes' }).locator('.co-row').first().locator('.co-grip');
const lastRow = A.locator('.co-sec', { hasText: 'Fruits et légumes' }).locator('.co-row').last();
await dragOnto(A, firstGrip, lastRow);
const after = await labelsIn(A, 'Fruits et légumes');
check(before.join() !== after.join(), `GLISSER-DEPOSER: ordre change dans le rayon (${before.join()} -> ${after.join()})`);

// The new order must survive a full reload (i.e. it was persisted, not just local).
await A.reload({ waitUntil: 'networkidle' });
await A.locator('.co-row').first().waitFor({ timeout: 15000 });
check((await labelsIn(A, 'Fruits et légumes')).join() === after.join(), 'ordre persiste apres rechargement');

// ---- 7. Collapse a section (per-device preference) ----
await A.locator('.co-sec-head', { hasText: 'Frais' }).click();
await A.waitForTimeout(400);
const fraisRows = await A.locator('.co-sec', { hasText: 'Frais' }).locator('.co-row').count();
check(fraisRows === 0, 'section repliee masque ses articles');
await A.reload({ waitUntil: 'networkidle' });
await A.locator('.co-row').first().waitFor({ timeout: 15000 });
check((await A.locator('.co-sec', { hasText: 'Frais' }).locator('.co-row').count()) === 0, 'repli conserve apres rechargement');
await A.locator('.co-sec-head', { hasText: 'Frais' }).click();
await A.waitForTimeout(400);

// ---- 8. Live sync still works, and aisles propagate ----
await B.goto(shared, { waitUntil: 'networkidle' });
await B.locator('.co-row').first().waitFor({ timeout: 15000 });
check((await labelsIn(B, 'Frais')).includes('Lait'), 'il voit les memes rayons via le lien');
await B.locator('.co-row', { hasText: 'Pain' }).locator('input[type=checkbox]').click();
await A.waitForFunction(
	() => [...document.querySelectorAll('.co-row-done')].some((r) => r.textContent.includes('Pain')),
	null, { timeout: 15000 },
);
check(true, 'SYNCHRO LIVE: il coche -> elle le voit');

// ---- 9. Manage aisles: add, rename, reorder, delete ----
await A.getByRole('button', { name: 'Rayons' }).click();
await A.locator('.co-row').first().waitFor({ timeout: 10000 });
const catCount = await A.locator('.co-row').count();
check(catCount === 10, `10 rayons par defaut (vu: ${catCount})`);
await A.getByPlaceholder('Nouveau rayon…').fill('Rayon bébé');
await A.getByPlaceholder('Nouveau rayon…').press('Enter');
await A.waitForFunction((n) => document.querySelectorAll('.co-row').length === n, catCount + 1, { timeout: 15000 });
check(true, 'rayon personnalise ajoute');
await A.locator('.co-label-btn', { hasText: 'Rayon bébé' }).click();
await A.locator('.co-sheet input').fill('Bébé');
await A.getByRole('button', { name: 'Enregistrer' }).click();
await A.waitForTimeout(1500);
check((await A.locator('.co-label-btn', { hasText: 'Bébé' }).count()) === 1, 'rayon renomme');

const catsBefore = await A.locator('.co-label-btn').allInnerTexts();
const moved = catsBefore[catsBefore.length - 1];
await dragOnto(A, A.locator('.co-row').last().locator('.co-grip'), A.locator('.co-row').first());
const catsAfter = await A.locator('.co-label-btn').allInnerTexts();
// Dropping on a row's midpoint files just after it, so index 1 is the expected landing.
check(catsAfter.indexOf(moved) < catsBefore.length - 1, `GLISSER-DEPOSER: le rayon "${moved}" remonte (${catsBefore.length - 1} -> ${catsAfter.indexOf(moved)})`);
await A.reload({ waitUntil: 'networkidle' });
await A.getByRole('button', { name: 'Rayons' }).click();
await A.locator('.co-row').first().waitFor({ timeout: 10000 });
check((await A.locator('.co-label-btn').allInnerTexts()).join() === catsAfter.join(), 'ordre des rayons persiste apres rechargement');
await A.screenshot({ path: shot('6-gestion-rayons') });

// Deleting an aisle must keep its items, moving them back to "Sans catégorie".
await A.locator('.co-row', { hasText: 'Frais' }).locator('.co-del').click();
await A.waitForTimeout(1500);
await A.getByRole('button', { name: 'Retour' }).click();
await A.locator('.co-row').first().waitFor({ timeout: 10000 });
const allLabels = await A.locator('.co-label, .co-label-btn').allInnerTexts();
check(allLabels.some((l) => l === 'Lait'), 'rayon supprime -> ses articles sont conserves');
check((await labelsIn(A, 'Sans catégorie')).includes('Lait'), 'ils repassent en "Sans categorie"');

// ---- 10. Aisles survive a new list, and reuse keeps the filing ----
await A.getByRole('button', { name: 'Nouvelle liste' }).click();
await A.waitForTimeout(2000);
await A.getByRole('button', { name: 'Historique' }).click();
await A.locator('.co-hrow').first().waitFor({ timeout: 10000 });
await A.locator('.co-hrow').first().click();
await A.getByRole('button', { name: 'Réutiliser cette liste' }).click();
await A.waitForTimeout(2500);
check((await labelsIn(A, 'Fruits et légumes')).length > 0, 'liste reutilisee conserve les rayons des articles');
check((await A.locator('.co-row-done').count()) === 0, 'articles reutilises tous decoches');
await A.screenshot({ path: shot('7-reutilisee') });

check(errors.length === 0, `aucune erreur JS (${errors.length ? errors.join(' | ') : 'ok'})`);
} catch (e) {
	// Report what already passed instead of dying on the first stuck locator.
	ko.push(`CRASH: ${e.message.split('\n')[0]}`);
	await A.screenshot({ path: shot('crash') }).catch(() => {});
}

await browser.close();
console.log('\n=== RESULTATS ===');
for (const t of ok) console.log(`  OK    ${t}`);
for (const t of ko) console.log(`  ECHEC ${t}`);
console.log(`\n${ok.length} reussis, ${ko.length} echecs`);
process.exit(ko.length ? 1 : 0);
