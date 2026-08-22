// One-shot: build the /assets/petanque-ar/ images from the app's marketing folder.
// Crops the debug test-ad banner off the bottom of the store screenshots.
// Run: node scripts/petanque-assets.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'D:/Projects/Perso/Petanque/Petanque AR/Marketings';
const OUT = 'public/assets/petanque-ar';

const AD_BAND = 190; // test ad banner height at the bottom of the 1242x2688 shots

await mkdir(OUT, { recursive: true });

await sharp(`${SRC}/feature_graphic_1024x500.png`)
	.resize(1024)
	.avif({ quality: 62 })
	.toFile(`${OUT}/hero.avif`);

for (const n of ['01', '02', '03']) {
	await sharp(`${SRC}/appstore_65_${n}.png`)
		.extract({ left: 0, top: 0, width: 1242, height: 2688 - AD_BAND })
		.resize(560)
		.webp({ quality: 78 })
		.toFile(`${OUT}/screen-${n}.webp`);
}

await sharp(`${SRC}/IAP_Promo.png`).resize(640).webp({ quality: 80 }).toFile(`${OUT}/premium.webp`);

console.log('done');
