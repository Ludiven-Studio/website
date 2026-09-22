/* Mean colour of the sky in a shot of the throwing view, and how far from grey it is.

   There is no clean rectangle of pure sky to sample — a tree stands wherever the deal put it — so
   the sky is separated by COLOUR instead, the same way the boule probe separates ground from halo.
   The caller hides the HUD before the shot, which leaves only foliage (strongly green) and trunks
   (brown and dark) to drop. `rej` is printed because a filter that keeps nothing and a filter that
   keeps everything both produce a plausible-looking mean.

   The luminance cut that used to do the chrome's job had to go: it also dropped the darker end of
   the sky, so lowering the exposure raised `rej` and the surviving pixels were the bright ones —
   the mean then read FLAT across an exposure sweep that was visibly changing the picture. A filter
   whose threshold is the quantity under test cannot measure it.

   `sat` is the number that matters. Sky.js is written for a tone-mapped renderer, and without one
   every daylight sun clips the dome to flat white — which is exactly sat ~ 0 at high luminance, and
   is indistinguishable from "a pale sky" in a thumbnail.

   Its own file so a saved capture from BEFORE a change can be read by the same instrument as the one
   after: re-running the shot would compare two builds, not two skies.

   Usage: node scripts/sky-stats.mjs <png> [<png> …]
*/
import sharp from 'sharp';

export async function skyStats(file) {
	const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
	let n = 0, tot = 0, r = 0, g = 0, b = 0;
	for (let y = 0; y < Math.floor(info.height * 0.55); y++) {
		for (let x = 0; x < info.width; x++) {
			const i = (y * info.width + x) * 3;
			const c = [data[i], data[i + 1], data[i + 2]];
			tot++;
			const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
			if (c[1] > c[0] + 8 && c[1] > c[2] + 8) continue; // foliage
			if (L < 70 && c[0] > c[2] + 8) continue; // trunks and shaded bark: brown and dark
			if (L < 40) continue; // foliage deep in its own shade reads neither green nor brown
			n++; r += c[0]; g += c[1]; b += c[2];
		}
	}
	if (!n) return 'aucun pixel de ciel';
	const m = [r / n, g / n, b / n];
	const sat = (Math.max(...m) - Math.min(...m)) / (Math.max(...m) || 1);
	return `rgb ${m.map((v) => v.toFixed(0)).join(',')} · lum ${(0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]).toFixed(0)} · sat ${(sat * 100).toFixed(0)} % · rej ${(100 * (1 - n / tot)).toFixed(0)} %`;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
	for (const f of process.argv.slice(2)) console.log(`${f.padEnd(42)} ${await skyStats(f)}`);
}
