// Throwaway E2E check for /courses: two independent browsers (her + him) on the
// same shared link, verifying live sync in both directions. Run with the preview
// server up:  node scripts/courses-e2e.mjs
import { chromium } from 'playwright';

const BASE = 'http://localhost:4331';
const shot = (n) => `D:/Projects/LudivenStudio/website/dist/_e2e-${n}.png`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = [];
const ko = [];
const check = (cond, label) => (cond ? ok : ko).push(label);

const browser = await chromium.launch();
// Phone-sized viewports — this is a mobile tool.
const her = await browser.newContext({ viewport: { width: 390, height: 844 } });
const him = await browser.newContext({ viewport: { width: 390, height: 844 } });
const A = await her.newPage();
const B = await him.newPage();
const errors = [];
for (const p of [A, B]) p.on('pageerror', (e) => errors.push(e.message));

// ---- 1. She lands on /courses and creates a list ----
await A.goto(`${BASE}/courses`, { waitUntil: 'networkidle' });
await A.getByRole('button', { name: 'Créer ma liste' }).click();
await A.waitForFunction(() => new URLSearchParams(location.search).get('l'), null, { timeout: 15000 });
const shared = A.url();
check(/\?l=[0-9a-f-]{36}$/.test(shared), 'lien secret genere dans l URL');

// ---- 2. She adds three items ----
const initial = [['Lait', '2'], ['Pain', ''], ['Tomates', '500 g']];
for (const [i, [label, qty]] of initial.entries()) {
	await A.getByPlaceholder('Ajouter un article…').fill(label);
	if (qty) await A.getByPlaceholder('Qté').fill(qty);
	await A.getByPlaceholder('Ajouter un article…').press('Enter');
	// Wait for the row to actually land (add + refetch round-trip), not a fixed delay.
	await A.locator('.co-row').nth(i).waitFor({ timeout: 15000 });
	await A.waitForFunction(
		(n) => document.querySelectorAll('.co-row').length === n,
		i + 1, { timeout: 15000 },
	);
}
const rowsA = await A.locator('.co-row').count();
check(rowsA === 3, `3 articles chez elle (vu: ${rowsA})`);
check((await A.locator('.co-qty').allInnerTexts()).includes('500 g'), 'quantite texte libre "500 g" conservee');
await A.screenshot({ path: shot('1-elle') });

// ---- 3. He opens the shared link ----
await B.goto(shared, { waitUntil: 'networkidle' });
await B.locator('.co-row').first().waitFor({ timeout: 15000 });
const rowsB = await B.locator('.co-row').count();
check(rowsB === 3, `il voit les 3 articles via le lien (vu: ${rowsB})`);

// Presence indicator should now show 2 connected devices.
await A.waitForTimeout(2500);
const peerA = await A.locator('.co-peer').count();
check(peerA === 1, 'indicateur de presence affiche chez elle');

// ---- 4. He checks "Pain" -> she must see it live, without reloading ----
// .click() not .check(): ticking reorders the row (checked items sink), so the
// element detaches and .check()'s state assertion loops on a stale handle.
await B.locator('.co-row', { hasText: 'Pain' }).locator('input[type=checkbox]').click();
await A.waitForFunction(
	() => [...document.querySelectorAll('.co-row-done')].some((r) => r.textContent.includes('Pain')),
	null, { timeout: 15000 },
);
check(true, 'SYNCHRO LIVE: il coche -> elle le voit (sans rafraichir)');
await A.screenshot({ path: shot('2-sync-elle') });

// ---- 5. She adds an item -> he must see it live ----
await A.getByPlaceholder('Ajouter un article…').fill('Café');
await A.getByPlaceholder('Ajouter un article…').press('Enter');
await B.waitForFunction(
	() => [...document.querySelectorAll('.co-label')].some((r) => r.textContent.includes('Café')),
	null, { timeout: 15000 },
);
check(true, 'SYNCHRO LIVE: elle ajoute -> il le voit (sens inverse)');

// ---- 6. Checked items sink to the bottom ----
const order = await A.locator('.co-label').allInnerTexts();
check(order[order.length - 1] === 'Pain', `article coche descend en bas (ordre: ${order.join(', ')})`);

// ---- 7. Archive + reuse ----
await A.getByRole('button', { name: 'Nouvelle liste' }).click();
await A.waitForTimeout(2000);
check((await A.locator('.co-row').count()) === 0, 'nouvelle liste demarre vide');
await A.getByRole('button', { name: 'Historique' }).click();
await A.locator('.co-hrow').first().waitFor({ timeout: 10000 });
check((await A.locator('.co-hrow').count()) === 1, 'ancienne liste archivee dans l historique');
await A.screenshot({ path: shot('3-historique') });
await A.locator('.co-hrow').first().click();
await A.getByRole('button', { name: 'Réutiliser cette liste' }).click();
await A.waitForTimeout(2500);
const reused = await A.locator('.co-row').count();
check(reused === 4, `reutilisation recree les 4 articles (vu: ${reused})`);
check((await A.locator('.co-row-done').count()) === 0, 'articles reutilises sont tous decoches');
await A.screenshot({ path: shot('4-reutilisee') });

// ---- 8. A returning device finds the list without the link ----
const back = await her.newPage();
await back.goto(`${BASE}/courses`, { waitUntil: 'networkidle' });
check((await back.locator('.co-recent').count()) >= 1, 'listes recentes proposees sans le lien');

check(errors.length === 0, `aucune erreur JS (${errors.length ? errors.join(' | ') : 'ok'})`);

await browser.close();
console.log('\n=== RESULTATS ===');
for (const t of ok) console.log(`  OK   ${t}`);
for (const t of ko) console.log(`  ECHEC ${t}`);
console.log(`\n${ok.length} reussis, ${ko.length} echecs`);
process.exit(ko.length ? 1 : 0);
