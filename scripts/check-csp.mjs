/* Guard: the Content-Security-Policy <meta> (MainHead.astro) blocks nothing the site needs.
   Visits every built page, lets it run a few seconds (3D games fetch textures and audio late),
   and collects each `securitypolicyviolation` event. A single one fails the run: a blocked
   request usually degrades silently (a flat texture, a missing leaderboard), so nobody would
   report it. Then proves the policy is live at all: an injected foreign script must be refused,
   or a policy that never loaded would pass this guard forever.
   Needs `npm run build` first (astro preview serves dist/ and never builds).
   Usage: node scripts/check-csp.mjs [--wait 2500] [--only jeux/petanque] */
import { chromium } from 'playwright';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { startServer } from './preview-server.mjs';

const arg = (name, dflt) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? process.argv[i + 1] : dflt;
};
const WAIT = Number(arg('wait', 2500));
const ONLY = arg('only', '');
const PORT = 4391;

const pages = [];
const walk = (dir) => {
	for (const f of readdirSync(dir)) {
		const p = join(dir, f);
		if (statSync(p).isDirectory()) walk(p);
		else if (f === 'index.html') pages.push('/' + relative('dist', dir).split(sep).join('/'));
	}
};
walk('dist');
const targets = pages.map((p) => (p === '/' ? '/' : `${p}/`)).filter((p) => p.includes(ONLY)).sort();

const server = await startServer(PORT);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const fail = [];
try {
	const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, serviceWorkers: 'block' });
	await ctx.addInitScript(() => {
		window.__csp = [];
		document.addEventListener('securitypolicyviolation', (e) =>
			window.__csp.push(`${e.effectiveDirective} ${e.blockedURI || '(inline)'}`));
	});
	const page = await ctx.newPage();
	for (const path of targets) {
		try {
			await page.goto(`${server.base}${path}`, { waitUntil: 'load', timeout: 30000 });
			await page.waitForTimeout(WAIT);
			const v = [...new Set(await page.evaluate(() => window.__csp))];
			console.log(`${v.length ? 'FAIL' : 'ok  '}  ${path}${v.length ? `  ${v.join(' | ')}` : ''}`);
			if (v.length) fail.push(path);
		} catch (e) {
			console.log(`FAIL  ${path}  ${e.message.split('\n')[0]}`);
			fail.push(path);
		}
	}

	// Control: a foreign script host must be refused, or the policy is not in force.
	await page.goto(`${server.base}/`, { waitUntil: 'load' });
	const refused = await page.evaluate(() => new Promise((res) => {
		const s = document.createElement('script');
		s.src = 'https://example.com/evil.js';
		document.addEventListener('securitypolicyviolation', () => res(true), { once: true });
		s.onload = () => res(false);
		setTimeout(() => res(false), 4000);
		document.head.appendChild(s);
	}));
	console.log(`${refused ? 'ok  ' : 'FAIL'}  control: a foreign script is refused`);
	if (!refused) fail.push('control');
} finally {
	await browser.close();
	server.stop();
}
console.log(`\n${targets.length} pages, ${fail.length} failing`);
process.exit(fail.length ? 1 : 0);
