// Éclats sprites: Codex's drawings (tickets 0041-0042, drop zone .collab/out/, gitignored) resized and
// written as WebP to public/assets/jeux/eclats/. Same framing for a gem and its ranks, so no trim.
// Usage: node scripts/eclats-sprites.mjs
import { mkdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const OUT = 'public/assets/jeux/eclats';
const SOURCES = {
	'.collab/out/0041': ['gem-0', 'gem-1', 'gem-2', 'gem-3', 'gem-4', 'gem-0-r3', 'fx-burst', 'fx-sparkle', 'fx-ring', 'fx-comet'],
	'.collab/out/0042': [
		...[0, 1, 2, 3, 4].flatMap((c) => [2, 3, 4].map((r) => `gem-${c}-r${r}`)).filter((n) => n !== 'gem-0-r3'),
		'chest', 'chest-locked', 'rock', 'coin',
	],
};
const SIZE = (name) => (name.startsWith('fx-') ? 256 : 192);

mkdirSync(OUT, { recursive: true });
let n = 0;
for (const [dir, names] of Object.entries(SOURCES)) {
	for (const name of names) {
		const src = `${dir}/${name}.png`;
		if (!existsSync(src)) {
			console.warn(`missing ${src}`);
			continue;
		}
		const info = await sharp(src).resize(SIZE(name), SIZE(name)).webp({ quality: 86, alphaQuality: 90, effort: 6 }).toFile(`${OUT}/${name}.webp`);
		console.log(`${name}.webp ${(info.size / 1024).toFixed(1)} kB`);
		n++;
	}
}
console.log(`${n} sprites written to ${OUT}`);
