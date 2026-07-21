/*
 * Card thumbnails for /jeux — one flat-vector illustration per game, generated
 * with the local ComfyUI (SDXL Turbo) via scripts/comfy-gen.mjs.
 *
 * Card media is 16:10 (see GameCard.astro) → generate 768×480.
 *
 * Usage:
 *   node scripts/comfy-cards.mjs                # validation batch → D:/tmp/comfy/cards
 *   node scripts/comfy-cards.mjs 2048,snake     # specific ids → D:/tmp/comfy/cards
 *   node scripts/comfy-cards.mjs --all          # all games → D:/tmp/comfy/cards
 *   node scripts/comfy-cards.mjs --all --write  # all games → public/assets/jeux/<id>.jpg (needs sharp)
 */
import { resolve } from 'node:path';
import { submit, waitForImages, download } from './comfy-gen.mjs';

// Chosen style (flat vector coloured). Suffix appended to every card prompt.
const STYLE =
	'flat vector game illustration, bold clean shapes, vibrant playful colors, soft gradients, subtle depth, modern casual mobile game key art, centered composition, no text, no words, no letters';
const NEG = 'text, words, letters, numbers, watermark, signature, ui, blurry, ugly, deformed, photo, realistic, 3d render, noisy, cluttered';

// The hen mascot ("cocotte") recurs across the studio's games.
const CARDS = {
	mine: 'a colorful gem match-3 puzzle, a grid of sparkling faceted ruby emerald sapphire amber crystals, a cute cartoon hen locked in a crystal cage being freed, jewel mine treasure, vivid jewel tones',
	'2048': 'sliding number puzzle, glossy rounded tiles stacked in a grid, warm oranges and yellows',
	'mots-meles': 'word-search letter grid puzzle, glowing highlighted diagonal line of tiles',
	'somme-toute': 'a balanced scale with small number blocks, equilibrium, teal and gold',
	solitaire: 'peg solitaire board with glossy marbles on a cross-shaped board, wood and jewel tones',
	tempo: 'music rhythm game, falling glowing piano tiles on lanes, musical notes, neon night',
	sudoku: 'nine by nine sudoku number grid puzzle, clean blue and white',
	reines: 'chess queen crowns on a colorful checkered grid, purple and gold',
	calcudoku: 'number grid puzzle with outlined cages and math operator symbols, cool blues',
	chemin: 'a winding glowing path connecting dots across a grid, single line maze, teal',
	suite: 'mystery number sequence floating with a glowing question mark, purple magic',
	fruits: 'cute cartoon fruits apples oranges with equation symbols, fresh and colorful',
	matrices: 'three by three grid of abstract geometric shapes, IQ pattern test, minimal',
	symboles: 'a row of glowing abstract mystical symbols, deduction puzzle, indigo',
	'rond-carre': 'grid of circles and squares in balance, red and blue tokens, tidy',
	suguru: 'number grid divided into colorful zones, soft pastel regions',
	motifs: 'a grid neatly divided into colorful rectangles and squares, geometric',
	pavage: 'colorful tetris-like puzzle pieces tiling a grid, glossy blocks',
	tubes: 'glass test tubes filled with layered colorful liquids, sorting puzzle, glossy',
	colorgramme: 'colorful pixel-art nonogram picture emerging from a grid, cheerful',
	bataille: 'naval battleship grid with ships and radar sonar rings, deep blue ocean',
	demineur: 'minesweeper grid with a cartoon bomb and little red flags, tidy tiles',
	codecolor: 'rows of glossy colored code pegs, mastermind guessing game, playful',
	'cocottes-renards': 'cute cartoon hen defending a henhouse against sneaky foxes, tower defense, sunny farm',
	snake: 'classic snake game, a friendly green snake curling toward a shiny red apple, retro arcade',
	golf: 'mini golf course, a white ball rolling toward a flag in the hole, green fairway, playful 3d',
	angry: 'a slingshot launching a determined cartoon hen at wooden blocks and foxes, dynamic',
	flechettes: 'a dartboard bullseye with darts, red and green segments, sporty',
	billard: 'billiards pool table with glossy colored balls and a cue, green felt, top view',
	drift: 'a cartoon race car drifting on a winding track, tire smoke, dynamic top-down circuit',
	esquive: 'a small spaceship dodging asteroids in deep space, stars, neon trails',
	flappy: 'a chubby cartoon hen flapping between green pipes, bright blue sky, playful',
	pong: 'retro pong game, two paddles and a glowing ball, neon on dark, minimal',
	foot: 'cartoon soccer ball on a field with goal nets, one versus one, energetic',
};

const VALIDATION = ['2048', 'demineur', 'snake', 'cocottes-renards']; // diverse genres to lock the style

const args = process.argv.slice(2);
const write = args.includes('--write');
const all = args.includes('--all');
const idsArg = args.find((a) => !a.startsWith('--'));
const ids = all ? Object.keys(CARDS) : idsArg ? idsArg.split(',') : VALIDATION;

let toJpg = null;
if (write) {
	const sharp = (await import('sharp')).default; // Astro dep; only needed for --write
	toJpg = async (pngBuf, outPath) => sharp(pngBuf).jpeg({ quality: 82 }).toFile(outPath);
}

console.log(`Cards: ${ids.length} game(s), ${write ? 'WRITE → public/assets/jeux' : 'preview → D:/tmp/comfy/cards'}`);
for (const id of ids) {
	const core = CARDS[id];
	if (!core) {
		console.log(`  ? ${id} — unknown id, skipped`);
		continue;
	}
	const t0 = Date.now();
	const promptId = await submit({ id, prompt: `${core}, ${STYLE}`, negative: NEG, w: 768, h: 480, steps: 6 });
	const imgs = await waitForImages(promptId);
	if (write) {
		// download to a temp png, then transcode to the repo's .jpg convention path.
		const tmp = resolve(`D:/tmp/comfy/cards/${id}.png`);
		await download(imgs[0], tmp);
		const { readFile } = await import('node:fs/promises');
		await toJpg(await readFile(tmp), resolve(`public/assets/jeux/${id}.jpg`));
		console.log(`  ✓ ${id} → public/assets/jeux/${id}.jpg (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
	} else {
		await download(imgs[0], resolve(`D:/tmp/comfy/cards/${id}.png`));
		console.log(`  ✓ ${id} → D:/tmp/comfy/cards/${id}.png (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
	}
}
console.log('done.');
