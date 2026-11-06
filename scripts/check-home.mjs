/* The homepages (/, /en/, /es/, /de/, /it/) and the site's menu, footer and phone tab bar.
     · Each homepage, desk and phone, light and dark: its stage of five games in its language, its links and
       badges, its studio, its alternates; the French one alone has the daily challenge, the mini-games and the
       tab bar. No overflow, no console error, every stage picture loaded soon after the page.
     · The stage (WAI-ARIA tabbed carousel): a slide every 7 s, held by the pointer or the focus, stopped for good
       by a thumbnail, a key or a swipe, never started under reduced motion; the button starts and stops it.
     · The streak: in the menu, the tab bar and the daily card when alive, nowhere when lapsed.
     · The menu: its panel on a phone, its language list on a desk, the right link lit on other pages, the tab bar
       on French pages but not on a game, the map or another language.
   MODE=preview after a build (default: dev). SHOTS=<dir> writes captures of the homepages. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { startServer } from './preview-server.mjs';

const PORT = 4527;
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const server = await startServer(PORT, { mode: process.env.MODE || 'dev' });
const browser = await chromium.launch();
const fail = [];
const line = (ok, what, detail = '') => {
	console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${!ok && detail ? ` — ${detail}` : ''}`);
	if (!ok) fail.push(what);
};

const VIEWS = {
	desk: { viewport: { width: 1280, height: 900 } },
	phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const parisDay = (d) => {
	const p = {};
	new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
		.formatToParts(d)
		.forEach((x) => (p[x.type] = x.value));
	return `${p.year}-${p.month}-${p.day}`;
};
const TODAY = parisDay(new Date());
const YESTERDAY = parisDay(new Date(Date.now() - 864e5));
const LAPSED = parisDay(new Date(Date.now() - 4 * 864e5));
const swDev404 = 'A bad HTTP response code (404) was received when fetching the script.';

async function open(path, view, { scheme = 'light', reduced = 'reduce', streak } = {}) {
	const ctx = await browser.newContext({ ...VIEWS[view], colorScheme: scheme, reducedMotion: reduced, locale: 'fr-FR' });
	// The statistics script answers empty: no count from a test, and no failed request in the console.
	await ctx.route(/stats\.ludiven-studio\.fr/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
	if (streak) await ctx.addInitScript((s) => localStorage.setItem('ludiven-streak-global', JSON.stringify(s)), streak);
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error' && m.text() !== swDev404 && !m.text().includes('astro-dev-toolbar')) errors.push(m.text());
	});
	await page.goto(server.base + path, { waitUntil: 'load', timeout: 120000 });
	await page.waitForTimeout(500);
	return { ctx, page, errors };
}

// The stage as its thumbnails, its track and its button say it.
const stage = (page) =>
	page.evaluate(() => {
		const root = document.querySelector('[data-stage]');
		const track = root.querySelector('[data-track]');
		const tabs = [...root.querySelectorAll('[data-tab]')];
		const slides = [...root.querySelectorAll('[data-slide]')];
		const toggle = root.querySelector('[data-toggle]');
		return {
			tab: tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'),
			focusable: tabs.filter((t) => t.tabIndex === 0).length,
			shown: Math.round(track.scrollLeft / track.clientWidth),
			open: slides.map((s) => (s.inert ? '0' : '1')).join(''),
			toggle: toggle.dataset.state,
			label: toggle.getAttribute('aria-label'),
			live: track.getAttribute('aria-live'),
			run: root.dataset.run ?? '',
		};
	});
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const imagesMissing = (page) =>
	page.$$eval('[data-stage] img', (imgs) => imgs.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.getAttribute('src')));

const LANG = {
	fr: { title: 'Nos jeux et applis', pitch: 'Glisse le plateau', main: "Découvrir le jeu", dg: '/dragons-gems/', studio: 'Développeur Unity depuis 2010', contact: '/contact/', nav: ['Jeux', 'Mini-jeux', 'Le studio', 'Projets', 'À propos'] },
	en: { title: 'Our games and apps', pitch: 'Slide the board', main: 'Discover the game', dg: '/en/dragons-gems/', studio: 'Unity developer since 2010', contact: '/en/contact/', nav: ['Games', 'Studio', 'Projects', 'Contact'] },
	es: { title: 'Nuestros juegos y apps', pitch: 'Desliza el tablero', main: 'Descubrir el juego', dg: '/es/dragons-gems/', studio: 'Desarrollador Unity desde 2010', contact: 'mailto:contact@ludiven-studio.fr', nav: ['Juegos', 'Estudio', 'Contacto'] },
	de: { title: 'Unsere Spiele und Apps', pitch: 'Wisch das Spielfeld', main: 'Spiel entdecken', dg: '/de/dragons-gems/', studio: 'Unity-Entwickler seit 2010', contact: 'mailto:contact@ludiven-studio.fr', nav: ['Spiele', 'Studio', 'Kontakt'] },
	it: { title: 'I nostri giochi e app', pitch: 'Fai scorrere le gemme', main: 'Scopri il gioco', dg: '/it/dragons-gems/', studio: 'Sviluppatore Unity dal 2010', contact: 'mailto:contact@ludiven-studio.fr', nav: ['Giochi', 'Studio', 'Contatti'] },
};
const HOME = { fr: '/', en: '/en/', es: '/es/', de: '/de/', it: '/it/' };

try {
	// 1. Each homepage in each view.
	for (const [l, want] of Object.entries(LANG)) {
		for (const view of ['desk', 'phone']) {
			for (const scheme of ['light', 'dark']) {
				const { ctx, page, errors } = await open(HOME[l], view, { scheme });
				await page.waitForTimeout(2000);
				const s = await stage(page);
				const got = await page.evaluate(
					({ want, l }) => {
						const root = document.querySelector('[data-stage]');
						const first = root.querySelector('[data-slide]');
						const alt = [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((a) => `${a.hreflang}:${new URL(a.href).pathname}`);
						return {
							lang: document.documentElement.lang,
							title: root.querySelector('h2')?.textContent,
							pitch: first.querySelector('.slide-pitch')?.textContent.startsWith(want.pitch),
							main: first.querySelector('.slide-main')?.textContent.trim(),
							dg: first.querySelector('.slide-main')?.getAttribute('href'),
							slides: root.querySelectorAll('[data-slide]').length,
							tabs: root.querySelectorAll('[data-tab]').length,
							studio: document.querySelector('#studio h2')?.textContent,
							contact: document.querySelector('#studio .studio-cta')?.getAttribute('href'),
							nav: [...document.querySelectorAll('.sn-links a')].map((a) => a.textContent.trim()),
							lit: document.querySelector('.sn-links a[aria-current="page"]')?.textContent.trim() ?? null,
							alt: alt.sort().join(' '),
							daily: !!document.querySelector('#daily-title'),
							dailyButton: !!document.querySelector('.sn-daily'),
							mini: [...document.querySelectorAll('[data-mini] li')].filter((li) => !li.hidden).length,
							tabBar: !!document.querySelector('.tb'),
							web: !!first.querySelector('.slide-link[href="/jeux/eclats/"]'),
						};
					},
					{ want, l },
				);
				const fr = l === 'fr';
				const altWant = 'de:/de/ en:/en/ es:/es/ fr:/ it:/it/ x-default:/';
				const ok =
					got.lang === l && got.title === want.title && got.pitch && got.main === want.main && got.dg === want.dg &&
					got.slides === 5 && got.tabs === 5 && got.studio === want.studio && got.contact === want.contact &&
					got.nav.join('|') === want.nav.join('|') && got.lit === want.nav[0] && got.alt === altWant &&
					got.daily === fr && got.dailyButton === fr && got.mini === (fr ? 4 : 0) && got.tabBar === fr && got.web === fr &&
					s.tab === 0 && s.focusable === 1 && s.open === '10000' && s.toggle === 'stopped';
				line(ok, `${l} ${view} ${scheme}: texts, links, alternates, sections, tab bar, stage at rest`, JSON.stringify({ got, s }));
				const missing = await imagesMissing(page);
				line(!missing.length && !(await overflow(page)) && !errors.length, `${l} ${view} ${scheme}: pictures loaded, no overflow, no error`, JSON.stringify({ missing, errors }));
				if (shots && (l === 'fr' || scheme === 'light')) {
					await page.screenshot({ path: `${shots}/home-${l}-${view}-${scheme}-top.png` });
					if (l === 'fr') await page.screenshot({ path: `${shots}/home-${l}-${view}-${scheme}-full.png`, fullPage: true });
				}
				await ctx.close();
			}
		}
	}

	// 2. The rotation, on a desk with motion.
	{
		const { ctx, page } = await open('/', 'desk', { reduced: 'no-preference' });
		await page.mouse.move(5, 895);
		let s = await stage(page);
		line(s.toggle === 'playing' && s.live === 'off' && s.label === 'Arrêter le défilement automatique', 'rotation on at load, slides not announced', JSON.stringify(s));
		await page.waitForTimeout(1000);
		s = await stage(page);
		line(s.run === 'on', 'the bar under the first thumbnail counts the 7 s', JSON.stringify(s));
		await page.waitForTimeout(7000);
		s = await stage(page);
		line(s.tab === 1 && s.shown === 1 && s.open === '01000', 'after 7 s: slide 2, alone open', JSON.stringify(s));
		await page.click('[data-tab] >> nth=3');
		await page.waitForTimeout(900);
		s = await stage(page);
		line(s.tab === 3 && s.shown === 3 && s.toggle === 'stopped' && s.live === 'polite' && s.label === 'Lancer le défilement automatique' && s.run === '',
			'thumbnail 4: slide 4, rotation stopped for good, slides announced', JSON.stringify(s));
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(900);
		s = await stage(page);
		const focused = await page.evaluate(() => [...document.querySelectorAll('[data-tab]')].indexOf(document.activeElement));
		line(s.tab === 4 && s.shown === 4 && focused === 4, 'ArrowRight: slide 5, its thumbnail focused', JSON.stringify({ s, focused }));
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(900);
		s = await stage(page);
		line(s.tab === 0 && s.shown === 0, 'ArrowRight from the last: back to the first', JSON.stringify(s));
		await page.keyboard.press('End');
		await page.waitForTimeout(900);
		s = await stage(page);
		line(s.tab === 4, 'End: the last slide', JSON.stringify(s));
		await page.keyboard.press('Home');
		await page.waitForTimeout(900);
		s = await stage(page);
		line(s.tab === 0, 'Home: the first slide', JSON.stringify(s));
		await page.click('[data-toggle]');
		await page.mouse.move(5, 895);
		s = await stage(page);
		line(s.toggle === 'playing' && s.label === 'Arrêter le défilement automatique', 'the button starts it again', JSON.stringify(s));
		await page.waitForTimeout(7800);
		s = await stage(page);
		line(s.tab === 1, 'and it moves on 7 s later', JSON.stringify(s));
		await ctx.close();
	}
	{
		const { ctx, page } = await open('/', 'desk', { reduced: 'no-preference' });
		const box = await page.locator('[data-stage] [data-track]').boundingBox();
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
		await page.waitForTimeout(8000);
		let s = await stage(page);
		line(s.tab === 0 && s.run === '', 'held while the pointer is over it, its bar reset', JSON.stringify(s));
		await page.mouse.move(5, 895);
		await page.waitForTimeout(7600);
		s = await stage(page);
		line(s.tab === 1, 'moves 7 s after the pointer leaves', JSON.stringify(s));
		await page.focus('[data-slide]:not([inert]) .slide-main');
		await page.waitForTimeout(8000);
		s = await stage(page);
		line(s.tab === 1, 'held while the focus is inside', JSON.stringify(s));
		await ctx.close();
	}
	{
		const { ctx, page } = await open('/', 'desk', { reduced: 'reduce' });
		await page.waitForTimeout(8000);
		const s = await stage(page);
		line(s.tab === 0 && s.toggle === 'stopped' && s.label === 'Lancer le défilement automatique', 'reduced motion: no rotation', JSON.stringify(s));
		await ctx.close();
	}

	// 3. A phone: swipe, slides, Nino Rush's test version, the menu panel, the tab bar.
	{
		const { ctx, page, errors } = await open('/', 'phone', { reduced: 'no-preference' });
		await page.evaluate(() => {
			const track = document.querySelector('[data-track]');
			track.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
			track.scrollTo({ left: 3 * track.clientWidth, behavior: 'auto' });
		});
		await page.waitForTimeout(700);
		const s = await stage(page);
		const thumbIn = await page.evaluate(() => {
			const row = document.querySelector('[data-tabs]').getBoundingClientRect();
			const t = document.querySelectorAll('[data-tab]')[3].getBoundingClientRect();
			return t.left >= row.left - 1 && t.right <= row.right + 1;
		});
		line(s.tab === 3 && s.toggle === 'stopped' && s.open === '00010' && thumbIn, 'phone: a swipe to slide 4 selects its thumbnail, in view, and stops the rotation', JSON.stringify({ s, thumbIn }));
		const names = await page.$$eval('[data-tab]', (tabs) => tabs.map((t) => t.querySelector('.thumb-full')?.textContent ?? t.querySelector('.thumb-name').textContent));
		const read = await page.locator('[data-tab]').first().evaluate((t) => [...t.querySelectorAll('.thumb-name > *')].filter((el) => el.getAttribute('aria-hidden') !== 'true').map((el) => el.textContent).join(''));
		line(names[0] === 'Dragon Gems Swipe' && read === 'Dragon Gems Swipe', 'the first thumbnail reads out the full name on a phone', JSON.stringify({ names, read }));
		const slides = await page.$$eval('[data-stage] [data-slide]', (els) =>
			els.map((el) => ({
				name: el.querySelector('h3').textContent,
				stores: [...el.querySelectorAll('.store-badges a')].map((a) => new URL(a.href).hostname).join(' '),
				faded: el.querySelectorAll('.store-badges .soon').length,
				main: el.querySelector('.slide-main')?.getAttribute('href') ?? null,
				label: el.querySelector('.slide-main')?.textContent.trim() ?? null,
			})),
		);
		const want = [
			['Dragon Gems Swipe', 'play.google.com', 1, '/dragons-gems/', 'Découvrir le jeu'],
			['Nino Rush', '', 2, '/nino-rush/', 'Découvrir le jeu'],
			['Pétanque Game', 'play.google.com', 1, '/petanque-game/', 'Découvrir le jeu'],
			['Pétanque Meet', 'play.google.com apps.apple.com', 0, '/petanque-meet/', "Découvrir l'appli"],
			['Pétanque Scan', 'play.google.com apps.apple.com', 0, '/petanque-scanner/', "Découvrir l'appli"],
		];
		want.forEach(([name, stores, faded, main, label], i) => {
			const g = slides[i];
			line(g && g.name === name && g.stores === stores && g.faded === faded && g.main === main && g.label === label,
				`slide ${i + 1}: ${name}, its stores, faded badges and main link`, JSON.stringify(g));
		});
		const test = await page.$$eval('[data-slide]', (els) => els[1].querySelector('.slide-link')?.getAttribute('href'));
		line(test === '/nino-rush/telecharger/', 'Nino Rush: the test build as its second link', String(test));
		if (shots) await page.locator('[data-stage]').screenshot({ path: `${shots}/stage-phone-slide4.png` });

		const tb = await page.evaluate(() => ({
			links: [...document.querySelectorAll('.tb a')].map((a) => `${a.textContent.trim()}>${a.getAttribute('href')}`).join(' | '),
			current: document.querySelector('.tb a[aria-current="page"]')?.getAttribute('href'),
			fixed: getComputedStyle(document.querySelector('.tb')).position,
			count: document.querySelector('.tb [data-streak-count]').hidden,
		}));
		line(tb.links === 'Jeux>/ | Mini-jeux>/jeux/ | Défi du jour>/jeux/defi/ | Studio>/prestations/' && tb.current === '/' && tb.fixed === 'fixed' && tb.count,
			'tab bar: four links, Jeux current, no streak count without a streak', JSON.stringify(tb));

		await page.click('[data-menu]');
		let menu = await page.evaluate(() => ({
			open: !document.querySelector('[data-panel]').hidden,
			expanded: document.querySelector('[data-menu]').getAttribute('aria-expanded'),
			links: [...document.querySelectorAll('.sn-panel-links a')].map((a) => a.textContent.trim().replace(/\s+/g, ' ')).join(' | '),
			langs: [...document.querySelectorAll('.sn-panel-langs a')].map((a) => a.getAttribute('href')).join(' '),
		}));
		line(menu.open && menu.expanded === 'true' && menu.links === 'Jeux | Mini-jeux | Défi du jour | Le studio | Projets | À propos' && menu.langs === '/en/ /es/ /de/ /it/',
			'phone menu: the panel opens with the links, the daily challenge and the languages', JSON.stringify(menu));
		if (shots) await page.screenshot({ path: `${shots}/menu-phone-open.png` });
		await page.keyboard.press('Escape');
		menu = await page.evaluate(() => ({ open: !document.querySelector('[data-panel]').hidden, focus: document.activeElement?.hasAttribute('data-menu') }));
		line(!menu.open && menu.focus, 'Escape closes it and gives the focus back to its button', JSON.stringify(menu));
		line(!errors.length, 'phone: no error', errors.join(' / '));
		await ctx.close();
	}

	// 4. The streak: alive today, at stake since yesterday, lapsed.
	for (const [lastDate, label] of [[TODAY, 'kept today'], [YESTERDAY, 'at stake'], [LAPSED, 'lapsed']]) {
		for (const view of ['phone', 'desk']) {
			const { ctx, page, errors } = await open('/', view, { streak: { count: 4, lastDate } });
			const got = await page.evaluate(() => ({
				pill: document.querySelector('.sn-daily')?.dataset.alive ?? null,
				chip: document.querySelector('.sn-daily [data-streak]')?.hidden === false ? document.querySelector('.sn-daily [data-streak]').textContent : null,
				tab: document.querySelector('.tb [data-streak-count]')?.hidden === false ? document.querySelector('.tb [data-streak-count]').textContent : null,
				card: document.querySelector('[data-daily-streak]')?.hidden === false ? document.querySelector('[data-daily-streak]').textContent : null,
				pillShown: getComputedStyle(document.querySelector('.sn-daily')).display !== 'none',
			}));
			const alive = lastDate !== LAPSED;
			const cardWant = lastDate === TODAY ? 'Série en cours : 4 jours. Défi du jour fait, un autre ?' : "Ta série de 4 jours est en jeu : joue un défi aujourd'hui !";
			const ok = alive
				? got.pill === '4' && got.chip === 'Série : 4 jours' && got.tab === '4' && got.card === cardWant && got.pillShown
				: got.pill === null && got.chip === null && got.tab === null && got.card === null && got.pillShown === (view === 'desk');
			line(ok && !errors.length, `streak ${label}, ${view}: menu, tab bar and daily card`, JSON.stringify({ got, errors }));
			if (shots && lastDate === TODAY) await page.screenshot({ path: `${shots}/home-fr-${view}-light-streak.png` });
			await ctx.close();
		}
	}

	// 5. The language list on a desk.
	{
		const { ctx, page } = await open('/dragons-gems/', 'desk');
		await page.click('[data-lang] summary');
		let got = await page.evaluate(() => ({
			open: document.querySelector('[data-lang]').open,
			links: [...document.querySelectorAll('.sn-lang-list a')].map((a) => `${a.hreflang}:${a.getAttribute('href')}`).join(' '),
		}));
		line(got.open && got.links === 'en:/en/dragons-gems/ es:/es/dragons-gems/ de:/de/dragons-gems/ it:/it/dragons-gems/',
			'language list: this page in the other languages', JSON.stringify(got));
		await page.locator('h1').first().click();
		got = await page.evaluate(() => document.querySelector('[data-lang]').open);
		line(!got, 'a click elsewhere closes it');
		await ctx.close();
	}

	// 6. The menu on other pages: the lit link, the tab bar where it belongs, the fullscreen selectors.
	const PAGES = [
		['/jeux/', 'Mini-jeux', true, true],
		['/jeux/defi/', 'Mini-jeux', true, true],
		['/jeux/sudoku/', 'Mini-jeux', false, true],
		['/jeux/eclats/', 'Mini-jeux', false, true],
		['/prestations/', 'Le studio', true, true],
		['/dragons-gems/', 'Jeux', true, true],
		['/petanque-meet/', 'Jeux', false, false],
		['/work/', 'Projets', true, true],
		['/mentions-legales/', null, true, false],
		['/en/dragons-gems/', 'Games', false, true],
		['/en/services/', 'Studio', false, true],
		['/es/petanque-scanner/', 'Juegos', false, true],
		['/nino-rush/confidentialite/', 'Jeux', true, false],
		['/de/nino-rush/confidentialite/', 'Spiele', false, false],
		['/nino-rush/', 'Jeux', true, true],
		['/en/nino-rush/', 'Games', false, true],
		['/it/petanque-game/scarica/', 'Giochi', false, true],
		['/petanque-meet/telecharger/', 'Jeux', true, true],
	];
	for (const [path, lit, tabBar, ground] of PAGES) {
		const { ctx, page, errors } = await open(path, 'phone');
		const got = await page.evaluate(() => ({
			lit: document.querySelector('.sn-links a.is-lit')?.textContent.trim() ?? null,
			tabBar: !!document.querySelector('.tb'),
			chrome: !!document.querySelector('.backgrounds > nav.sn') && !!document.querySelector('.backgrounds > footer.sf'),
			ground: document.querySelector('.backgrounds').classList.contains('scene'),
		}));
		line(got.lit === lit && got.tabBar === tabBar && got.chrome && got.ground === ground && !(await overflow(page)) && !errors.length,
			`${path}: ${lit ?? 'no link'} lit, ${tabBar ? 'with' : 'without'} the tab bar, ${ground ? 'the « Scène » ground' : 'its old ground'}, no overflow, no error`, JSON.stringify({ got, errors }));
		await ctx.close();
	}

	// 7. The apps' pages: one title, the plain ground, the other four apps at the foot (never the page's own).
	const APPS = [
		['/dragons-gems/', 'dragons-gems', true],
		['/de/dragons-gems/herunterladen/', 'dragons-gems', true],
		['/nino-rush/', 'nino-rush', true],
		['/nino-rush/telecharger/', 'nino-rush', true],
		['/petanque-game/', 'petanque-game', true],
		['/es/petanque-game/descargar/', 'petanque-game', false],
		['/en/petanque-scanner/', 'petanque-scan', true],
		['/petanque-meet/telecharger/', 'petanque-meet', false],
	];
	const OWN = { 'dragons-gems': 'Dragon Gems Swipe', 'nino-rush': 'Nino Rush', 'petanque-game': 'Pétanque Game', 'petanque-meet': 'Pétanque Meet', 'petanque-scan': 'Pétanque Scan' };
	for (const [path, id, stage] of APPS) {
		for (const view of ['desk', 'phone']) {
			const { ctx, page, errors } = await open(path, view, { scheme: view === 'phone' ? 'dark' : 'light' });
			const got = await page.evaluate(() => ({
				h1: document.querySelectorAll('h1').length,
				stage: !!document.querySelector('header.as'),
				ground: document.querySelector('.backgrounds').classList.contains('scene'),
				more: [...document.querySelectorAll('.ma a')].map((a) => a.querySelector('strong').textContent),
				hrefs: [...document.querySelectorAll('.ma a')].map((a) => a.getAttribute('href')),
			}));
			const ok = got.h1 === 1 && got.stage === stage && got.ground && got.more.length === 4 && !got.more.includes(OWN[id]) &&
				got.hrefs.every((h) => h && h.startsWith('/')) && !(await overflow(page)) && !errors.length;
			line(ok, `${path} ${view}: one title, ${stage ? 'the night stage' : 'its own hero'}, the other four apps, no overflow, no error`, JSON.stringify({ got, errors }));
			await ctx.close();
		}
	}
} finally {
	await browser.close();
	server.stop();
}

console.log(fail.length ? `\n${fail.length} failing check(s)` : '\nall checks OK');
process.exit(fail.length ? 1 : 0);
