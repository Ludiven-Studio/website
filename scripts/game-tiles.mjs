/*
 * Small crisp copies of the game key art, for the compact tiles on /jeux/defi.
 * The full cards are ~180 kB each — 48 of them on one page is far too much — and
 * art/<id>.jpg is blurred at export time, so it cannot be reused sharp.
 *
 *   node scripts/game-tiles.mjs            # all cards → public/assets/jeux/tile/
 *   node scripts/game-tiles.mjs 2048 snake # only these ids
 */
import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve('public/assets/jeux');
const TILE_W = 400;

export const tile = (cardPath, outPath) =>
	sharp(cardPath).resize(TILE_W).jpeg({ quality: 76, mozjpeg: true }).toFile(outPath);

async function main() {
	const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
	const targets = ids.length
		? ids
		: (await readdir(OUT)).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4));

	await mkdir(resolve(OUT, 'tile'), { recursive: true });
	let bytes = 0;
	for (const id of targets) {
		const info = await tile(resolve(OUT, `${id}.jpg`), resolve(OUT, 'tile', `${id}.jpg`));
		bytes += info.size;
	}
	console.log(`${targets.length} tiles → ${(bytes / 1024).toFixed(0)} kB total`);
}

if (process.argv[1].endsWith('game-tiles.mjs')) await main();
