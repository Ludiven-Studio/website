/*
 * Tectonique assets via ComfyUI (SDXL Turbo) → public/assets/jeux/tectonique/
 * Factory theme: the floor is a lattice of conveyor belts.
 *   - belt.jpg  : smooth dark rubber belt with a fine grain, airport style. Tiled per lane.
 *   - bin.jpg   : a sliding translucent plastic bin, loose parts inside (the plate slabs)
 *   - metal.jpg : a heavy riveted iron box full of metal parts — bolted, it caps its line
 *   - hen.png   : the hero, a half-hen half-robot mascot right on the belt
 * The bin and the metal box are square and fill their cell, so they need no alpha. The hen
 * keeps an alpha and the belt shows around her. The posts stay pure CSS (slot + hex nut).
 * Fixed seeds so the shipped assets are reproducible.
 *
 * Usage: node scripts/comfy-tectonique.mjs [--preview] [belt|bin|metal|hen]
 */
import { resolve } from 'node:path';
import { readFile, mkdir, access } from 'node:fs/promises';
import sharp from 'sharp';
import { submit, waitForImages, download } from './comfy-gen.mjs';

const preview = process.argv.includes('--preview');
const OUT = preview ? resolve('D:/tmp/comfy/tectonique') : resolve('public/assets/jeux/tectonique');
await mkdir(OUT, { recursive: true });
const ONLY = process.argv.filter((a) => ['belt', 'bin', 'metal', 'hen'].includes(a));
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

// Round objects sit on the belt, so they need an alpha. The model paints them isolated on a
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
		.png({ palette: true, quality: 84 })
		.toFile(resolve(OUT, file));
	console.log('✓', file);
}

if (want('belt')) {
	const img = await gen({
		id: 'belt3',
		prompt: 'seamless tileable texture of plain dark grey rubber sheet, uniform matte surface with a fine speckled noise grain, flat even color everywhere, no pattern, flat even lighting, stylized game texture',
		negative: `${NEG}, lines, stripes, ridges, grooves, slats, bands, seams, grid, mesh, weave, crosshatch, leather, quilted, padded, buttons, stitching, studs, object, box, rollers, machine, floor tiles, wood, bright, colorful`,
		w: 512,
		h: 512,
		steps: 7,
		seed: 815533,
	});
	// Kept dark: the bins, the hen and the crystals all have to pop against it.
	// The rows and the columns are separate strips now, so the columns get a rotated copy.
	await sharp(img).modulate({ saturation: 0.5, brightness: 0.62 }).jpeg({ quality: 86 }).toFile(resolve(OUT, 'belt.jpg'));
	await sharp(img).modulate({ saturation: 0.5, brightness: 0.62 }).rotate(90).jpeg({ quality: 86 }).toFile(resolve(OUT, 'belt-v.jpg'));
	console.log('✓ belt.jpg + belt-v.jpg');
}

if (want('bin')) {
	const img = await gen({
		id: 'bin',
		prompt: 'top-down view of one open square translucent plastic storage crate seen from directly above, frosted semi-transparent blue plastic bin, loose small colorful parts jumbled inside seen through the plastic, the crate fills the whole frame edge to edge, flat vector game art, bold clean shapes, flat even lighting',
		negative: `${NEG}, floor, ground, background, several crates, lid, cardboard, wood, metal, shadow on floor`,
		w: 512,
		h: 512,
		steps: 8,
		seed: 90312,
	});
	// Trim the backdrop margin around the crate; the cell's border-radius hides the corners.
	await sharp(img)
		.extract({ left: 16, top: 16, width: 480, height: 480 })
		.resize(512, 512)
		.modulate({ saturation: 1.05, brightness: 1.02 })
		.jpeg({ quality: 88 })
		.toFile(resolve(OUT, 'bin.jpg'));
	console.log('✓ bin.jpg');
}

if (want('metal')) {
	const img = await gen({
		id: 'metal',
		prompt: 'top-down view of one open square heavy iron crate seen from directly above, dark riveted steel box with thick metal edges, heavy metal parts gears and bolts piled inside, the crate fills the whole frame edge to edge, flat vector game art, bold clean shapes, flat even lighting',
		negative: `${NEG}, floor, ground, background, several crates, lid, cardboard, wood, plastic, shadow on floor, bright, colorful`,
		w: 512,
		h: 512,
		steps: 8,
		seed: 55871,
	});
	await sharp(img)
		.modulate({ saturation: 0.85, brightness: 0.95 })
		.jpeg({ quality: 88 })
		.toFile(resolve(OUT, 'metal.jpg'));
	console.log('✓ metal.jpg');
}

if (want('hen')) {
	const img = await gen({
		id: 'hen',
		prompt: 'cute robot chicken mascot, half hen half robot cyborg, white feathered round body with a steel chest plate, glowing blue eye visor, small antenna, tiny metal legs, orange beak, cartoon game asset sticker on a completely white empty background, bold outline, flat shading, centered, single character',
		negative: `${NEG}, several characters, background scene, ground, floor, realistic photo, egg, nest`,
		w: 512,
		h: 512,
		steps: 8,
		seed: 51234,
	});
	await cutout(img, { lo: 206, hi: 234, dark: false }, 'hen.png');
}
console.log('done →', OUT);
