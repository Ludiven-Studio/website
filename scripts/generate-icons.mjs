// Rasterise the app icons from their SVG sources. Run with `npm run icons`.
//
// Two marks on purpose: the "LS" monogram stays readable at 16-32px (browser tab), the
// "Ludiven STUDIO" wordmark only works big (home screen, PWA, share cards).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const LS = readFileSync(`${root}public/favicon.svg`, 'utf8');
const WORDMARK = readFileSync(`${root}scripts/icons/wordmark.svg`, 'utf8');

const OUTPUTS = [
	{ file: 'public/favicon-32.png', svg: LS, size: 32 },
	{ file: 'public/apple-touch-icon.png', svg: WORDMARK, size: 180 },
	{ file: 'public/icon-192.png', svg: WORDMARK, size: 192 },
	{ file: 'public/icon-512.png', svg: WORDMARK, size: 512 },
	{ file: 'public/icon-512-maskable.png', svg: WORDMARK, size: 512, maskable: true },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });

for (const { file, svg, size, maskable } of OUTPUTS) {
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
	if (maskable) {
		// Android crops to a circle: fill the square and pull the mark inside the safe zone.
		await page.evaluate(() => {
			for (const id of ['plate', 'shine']) {
				const r = document.getElementById(id);
				r.setAttribute('x', '0');
				r.setAttribute('y', '0');
				r.setAttribute('width', '128');
				r.setAttribute('rx', '0');
				if (id === 'plate') r.setAttribute('height', '128');
			}
			// -68 because the mark's own vertical centre sits below the viewBox centre.
			document.getElementById('mark').setAttribute('transform', 'translate(64 64) scale(0.76) translate(-64 -68)');
		});
	}
	writeFileSync(`${root}${file}`, await page.screenshot({ omitBackground: true }));
	console.log(`${file}  ${size}×${size}`);
}

await browser.close();
