// One-shot: build the /assets/petanque-ar/ images from the app's marketing folder.
// Run: node scripts/petanque-assets.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'D:/Projects/Perso/Petanque/Petanque AR/Marketings';
const OUT = 'public/assets/petanque-ar';

// The 6.5" store slides, in the order they are published on the App Store and Play.
// The generator numbers them by theme, the stores by narrative, hence the shuffle.
// These are composed slides (headline + card), not raw captures: the ad banner is
// already painted out upstream, so nothing to crop here.
const SLIDES = ['01', '02', '04', '05', '03', '06'];

await mkdir(OUT, { recursive: true });

await sharp(`${SRC}/feature_graphic_1024x500.png`)
	.resize(1024)
	.avif({ quality: 62 })
	.toFile(`${OUT}/hero.avif`);

for (const [i, n] of SLIDES.entries()) {
	await sharp(`${SRC}/store_v1.2.9/store_65_${n}.png`)
		.resize(560)
		.webp({ quality: 80 })
		.toFile(`${OUT}/screen-${String(i + 1).padStart(2, '0')}.webp`);
}

await sharp(`${SRC}/IAP_Promo.png`).resize(640).webp({ quality: 80 }).toFile(`${OUT}/premium.webp`);

console.log('done');
