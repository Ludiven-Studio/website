/*
 * Tectonique assets via ComfyUI (SDXL Turbo) → public/assets/jeux/tectonique/
 *   - ground.jpg : the barn floor, tiled under everything. Only the ground is textured.
 *   - crate.jpg  : a sliding crate (the plate slabs)
 *   - rock.png   : a blocker — one boulder per cell, it stops a line
 *   - nest.png   : the hen's nest, a boulder-like object that rides the floor
 * The crate is square and fills its cell, so it needs no alpha. The rock and the nest are
 * round: they keep an alpha and the floor shows around them.
 * Fixed seeds so the shipped assets are reproducible.
 *
 * Usage: node scripts/comfy-tectonique.mjs [--preview] [ground|crate|rock|nest]
 */
import { resolve } from 'node:path';
import { readFile, mkdir, access } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/tectonique') : resolve('public/assets/jeux/tectonique');
await mkdir(OUT, { recursive: true });
const ONLY = process.argv.filter((a) => ['ground', 'crate', 'rock', 'nest'].includes(a));
const want = (n) => ONLY.length === 0 || ONLY.includes(n);
const NEG = 'text, watermark, perspective, side view, horizon, vignette, frame, border, strong shadows, blurry, photo';

// The raw render is kept aside: ComfyUI serves nothing back for a prompt it already ran,
// so re-tuning the post-processing must not need the GPU. Delete the _*.png to force a redraw.
async function gen(job) {
	const tmp = resolve(`D:/tmp/comfy/tectonique/_${job.id}.png`);
	try {
		await access(tmp);
	} catch {
		const id = await submit(job);
		await download((await waitForImages(id))[0], tmp);
	}
	return readFile(tmp);
}

// Round objects sit on the floor, so they need an alpha. The model paints them isolated on a
// flat backdrop, which keys out by luminance with a soft ramp — cleaner than a green screen.
// `dark` cuts a near-black backdrop away, otherwise a near-white one.
async function cutout(img, { lo, hi, dark }, file) {
	const { data, info } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	for (let i = 0; i < data.length; i += 4) {
		const m = dark
			? Math.max(data[i], data[i + 1], data[i + 2])
			: Math.min(data[i], data[i + 1], data[i + 2]);
		const t = Math.max(0, Math.min(1, (m - lo) / (hi - lo)));
		data[i + 3] = Math.round((dark ? t : 1 - t) * 255);
	}
	await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
		.png({ palette: true, quality: 84 }) // 800 kB of flat cartoon shading down to ~90 kB
		.toFile(resolve(OUT, file));
	console.log('✓', file);
}

if (want('ground')) {
	const img = await gen({
		id: 'ground',
		prompt: 'seamless tileable top-down barn floor texture, packed dry earth, scattered straw and hay wisps, warm brown soil, a few small pebbles, flat even lighting, stylized game texture, no seams',
		negative: `${NEG}, object, crate, box, animal, grass, plant, path`,
		w: 512,
		h: 512,
		steps: 7,
		seed: 118203,
	});
	// Kept dark: the crates, the nest and the crystals all have to pop against it.
	await sharp(img).modulate({ saturation: 0.7, brightness: 0.55 }).jpeg({ quality: 86 }).toFile(resolve(OUT, 'ground.jpg'));
	console.log('✓ ground.jpg');
}

if (want('crate')) {
	const img = await gen({
		id: 'crate',
		prompt: 'top-down view of a single wooden crate seen from directly above, square wooden box, planks with visible grain, metal corner brackets, warm honey brown wood, the crate fills the whole frame edge to edge, flat vector game art, bold clean shapes, flat even lighting',
		negative: `${NEG}, floor, ground, background, several boxes, open lid, content, shadow on floor`,
		w: 512,
		h: 512,
		steps: 8,
		seed: 660419,
	});
	await sharp(img).modulate({ saturation: 1.05, brightness: 1.02 }).jpeg({ quality: 88 }).toFile(resolve(OUT, 'crate.jpg'));
	console.log('✓ crate.jpg');
}

if (want('rock')) {
	const img = await gen({
		id: 'rock',
		prompt: 'one large round grey stone seen from straight above, cartoon game asset sticker on a completely black empty background, night, dark surroundings, smooth pebble shape, subtle cracks, flat shading, bold outline, centered, single object',
		negative: `${NEG}, rock field, rubble, gravel, ground, floor, grass, plants, trees, moss, pattern, several rocks`,
		w: 512,
		h: 512,
		steps: 8,
		seed: 51002,
	});
	// The model ignored the black backdrop and drew the stone on white, so the key runs the
	// other way. The bold outline gives the ramp all the room it needs.
	await cutout(img, { lo: 206, hi: 234, dark: false }, 'rock.png');
}

if (want('nest')) {
	const img = await gen({
		id: 'nest',
		prompt: 'top-down view of an empty round bird nest seen from directly above, woven golden straw and dry twigs, soft hollow centre, the nest fills the whole frame, flat vector game art, bold clean shapes, flat even lighting',
		negative: `${NEG}, egg, bird, hen, chicken, tree, branch, ground, background, shadow on floor`,
		w: 512,
		h: 512,
		steps: 8,
		seed: 447290,
	});
	await cutout(img, { lo: 60, hi: 120, dark: true }, 'nest.png');
}
console.log('done →', OUT);
