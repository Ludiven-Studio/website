/* Atelier promo, step 3: captions and end card (rendered in the site's own fonts), then the ffmpeg edit.
   Needs D:/tmp/promo-atelier/{raw.mp4, shots.json} (promo-atelier.mjs) and music.wav (promo-atelier-music.mjs).
   Writes D:/tmp/promo-atelier/atelier-promo.mp4 (1080x1920, 30 fps, H.264 + AAC).
   Usage: node scripts/promo-atelier-edit.mjs [dir] */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { startServer } from './preview-server.mjs';
import { CUTS, CUTS_END, END_CARD, CAPTIONS, TOTAL } from './promo-atelier-plan.mjs';

const DIR = resolve(process.argv[2] ?? 'D:/tmp/promo-atelier');
const PORT = 4383;
const W = 1080, H = 1920;
const CAP_Y = 64;
const XFADE = 0.5;
await mkdir(join(DIR, 'cards'), { recursive: true });
const shots = Object.fromEntries(JSON.parse(await readFile(join(DIR, 'shots.json'), 'utf8')).map((s) => [s.name, s]));
const b64 = async (p, type) => `data:${type};base64,${(await readFile(p)).toString('base64')}`;

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
const server = await startServer(PORT, { mode: 'dev' });
try {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: W, height: H } });
	// The game page, for its loaded web fonts (Rubik, Public Sans).
	await page.goto(`http://localhost:${PORT}/jeux/atelier/`, { waitUntil: 'networkidle' });
	const show = async (html) => {
		await page.evaluate((h) => {
			document.querySelector('#promo')?.remove();
			const d = document.createElement('div');
			d.id = 'promo';
			d.innerHTML = h;
			document.body.append(d);
			// Only the fonts are wanted from the page: hide it, or transparent shots pick it up.
			for (const c of document.body.children) if (c !== d) c.style.visibility = 'hidden';
			document.documentElement.style.background = document.body.style.background = 'transparent';
		}, html);
		await page.evaluate(() => document.fonts.ready);
		await page.waitForTimeout(150);
	};
	const base = `<style>#promo { all: initial; position: fixed; inset: 0; z-index: 99999; font-family: Rubik, sans-serif; }
		#promo * { box-sizing: border-box; }
		.cap { position: absolute; left: 0; top: 0; width: ${W}px; display: flex; justify-content: center; padding: 26px 60px; }
		.cap span { display: inline-block; text-align: center; font-weight: 800; font-size: 68px; line-height: 1.12; letter-spacing: -0.5px;
			color: #fff; padding: 22px 40px 26px; border-radius: 36px; background: rgba(74, 31, 69, 0.9);
			border: 4px solid #ff3d9a; box-shadow: 0 8px 0 #d3177a, 0 18px 40px rgba(74, 31, 69, 0.45); }
	</style>`;

	for (const [i, c] of CAPTIONS.entries()) {
		await show(`${base}<div class="cap"><span>${esc(c.text)}</span></div>`);
		await page.locator('#promo .cap').screenshot({ path: join(DIR, 'cards', `cap${i}.png`), omitBackground: true });
	}

	const bg = await b64('public/assets/jeux/atelier/atelier-restaure.jpg', 'image/jpeg');
	const photo = await b64('public/assets/jeux/atelier/photo.jpg', 'image/jpeg');
	const logo = await b64('src/assets/LudivenStudioLogo.png', 'image/png');
	await show(`${base}<style>
		.end { position: absolute; inset: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #1b1009; }
		.end .bg { position: absolute; inset: -40px; background: url(${bg}) center / cover; filter: saturate(1.05) brightness(0.85); }
		.end .warm { position: absolute; inset: 0; background: radial-gradient(circle at 55% 62%, rgba(255, 196, 110, 0.45), transparent 55%),
			linear-gradient(180deg, rgba(20, 10, 4, 0.75) 0%, rgba(20, 10, 4, 0.15) 38%, rgba(20, 10, 4, 0.2) 60%, rgba(20, 10, 4, 0.92) 100%); }
		.end .photo { position: absolute; left: 50%; top: 600px; width: 430px; transform: translateX(-50%) rotate(-4deg); background: #f6ecd4;
			padding: 16px 16px 60px; box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
		.end .photo img { width: 100%; display: block; filter: sepia(0.25); }
		.end .photo i { position: absolute; left: 0; right: 0; bottom: 14px; text-align: center; font: italic 30px Georgia, serif; color: #6b4a22; }
		.end h1 { position: absolute; top: 210px; left: 0; right: 0; margin: 0; text-align: center; font-weight: 800; font-size: 112px; line-height: 1;
			color: #fff3d6; text-shadow: 0 6px 30px rgba(0,0,0,0.7); letter-spacing: -2px; }
		.end h1 small { display: block; font-size: 58px; font-weight: 600; letter-spacing: 0; margin-bottom: 18px; color: #ffc7e3; }
		.end .tag { position: absolute; top: 1240px; left: 80px; right: 80px; text-align: center; font-size: 46px; font-weight: 600; line-height: 1.25;
			color: #fff3d6; text-shadow: 0 3px 16px rgba(0,0,0,0.8); }
		.end .cta { position: absolute; top: 1440px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 56px; font-weight: 800;
			color: #fff; background: linear-gradient(180deg, #ff6fb5, #ff3d9a); padding: 26px 64px; border-radius: 999px;
			box-shadow: 0 10px 0 #d3177a, 0 18px 40px rgba(255, 61, 154, 0.45); text-shadow: 0 2px 0 rgba(0,0,0,0.15); }
		.end .url { position: absolute; top: 1600px; left: 0; right: 0; text-align: center; font-size: 44px; font-weight: 700; color: #fff3d6; }
		.end .logo { position: absolute; bottom: 70px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 18px;
			font-size: 36px; font-weight: 700; color: #f6e7c8; }
		.end .logo img { height: 74px; }
	</style>
	<div class="end">
		<div class="bg"></div><div class="warm"></div>
		<h1><small>L’Atelier</small>des Souvenirs</h1>
		<div class="photo"><img src="${photo}"><i>14 juin 1961</i></div>
		<div class="tag">Fusionne, répare,<br>et perce le secret de Jeanne.</div>
		<div class="cta">Joue gratuitement</div>
		<div class="url">ludiven-studio.fr/jeux/atelier</div>
		<div class="logo"><img src="${logo}">Ludiven Studio</div>
	</div>`);
	await page.locator('#promo .end').screenshot({ path: join(DIR, 'cards', 'end.png') });
	await browser.close();
} finally {
	server.stop();
}

// ---- ffmpeg ----
const inputs = ['-i', join(DIR, 'raw.mp4')];
const f = [];
CUTS.forEach((c, k) => {
	const s = shots[c.shot].start + c.from;
	f.push(`[0:v]trim=start=${s.toFixed(3)}:duration=${c.dur},setpts=PTS-STARTPTS,fps=30[v${k}]`);
});
f.push(`${CUTS.map((_, k) => `[v${k}]`).join('')}concat=n=${CUTS.length}:v=1:a=0[cut]`);
let last = 'cut';
CAPTIONS.forEach((c, k) => {
	const d = c.to - c.at;
	inputs.push('-loop', '1', '-t', d.toFixed(3), '-i', join(DIR, 'cards', `cap${k}.png`));
	f.push(`[${1 + k}:v]format=rgba,fade=in:st=0:d=0.22:alpha=1,fade=out:st=${(d - 0.22).toFixed(3)}:d=0.22:alpha=1,setpts=PTS-STARTPTS+${c.at.toFixed(3)}/TB[c${k}]`);
	f.push(`[${last}][c${k}]overlay=x=(W-w)/2:y=${CAP_Y}:eof_action=pass[o${k}]`);
	last = `o${k}`;
});
const endIdx = 1 + CAPTIONS.length;
const endDur = END_CARD + XFADE;
inputs.push('-loop', '1', '-t', endDur.toFixed(3), '-i', join(DIR, 'cards', 'end.png'));
// A slow push-in on the end card.
f.push(`[${endIdx}:v]scale=${W * 2}:${H * 2},zoompan=z='1+0.035*on/(${Math.round(endDur * 30)})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30,format=yuv420p,settb=1/30[end]`);
f.push(`[${last}]fps=30,format=yuv420p,settb=1/30[main]`);
f.push(`[main][end]xfade=transition=fade:duration=${XFADE}:offset=${(CUTS_END - XFADE).toFixed(3)}[vout]`);
const audioIdx = endIdx + 1;
inputs.push('-i', join(DIR, 'music.wav'));
f.push(`[${audioIdx}:a]atrim=0:${TOTAL.toFixed(3)},afade=out:st=${(TOTAL - 1.4).toFixed(3)}:d=1.4[aout]`);

const out = join(DIR, 'atelier-promo.mp4');
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', f.join(';'), '-map', '[vout]', '-map', '[aout]',
	'-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k',
	'-movflags', '+faststart', '-t', TOTAL.toFixed(3), out], { stdio: 'inherit' });
if (r.status !== 0) { console.log('ffmpeg failed'); process.exit(1); }
console.log(`${out}: ${TOTAL.toFixed(2)} s`);
