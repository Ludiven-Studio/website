/* Rayou teaser, step 3: captions, footer and end card (rendered in the site's own fonts), then the
   ffmpeg edit, in two formats: 4:5 for the Facebook and LinkedIn feeds, 16:9 for players and pages.
   Needs D:/tmp/promo-rayou/{shots/*.mp4, music.wav} (promo-rayou.mjs, promo-rayou-music.mjs)
   and the user's own capture (USER below).
   Writes D:/tmp/promo-rayou/rayou-teaser-4x5.mp4 (1080x1350) and rayou-teaser-16x9.mp4 (1920x1080).
   Usage: node scripts/promo-rayou-edit.mjs [dir] [user capture] */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { startServer } from './preview-server.mjs';
import { CUTS, CUTS_END, END_CARD, CAPTIONS, TOTAL } from './promo-rayou-plan.mjs';

const DIR = resolve(process.argv[2] ?? 'D:/tmp/promo-rayou');
const USER = resolve(process.argv[3] ?? 'C:/Users/raph_/Downloads/Rayou.mp4');
const PORT = 4385;
const XFADE = 0.45;
// Every source is brought to this 16:10 frame first.
const SW = 1920, SH = 1200;
const FORMATS = {
	'4x5': { W: 1080, H: 1350, cap: 62, gameY: (1350 - 675) / 2 },
	'16x9': { W: 1920, H: 1080, cap: 66 },
};
await mkdir(join(DIR, 'cards'), { recursive: true });
const b64 = async (p, type) => `data:${type};base64,${(await readFile(p)).toString('base64')}`;
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');

const server = await startServer(PORT, { mode: 'dev' });
try {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1920, height: 1350 } });
	// The game page, for its loaded web fonts (Rubik, Public Sans).
	await page.goto(`http://localhost:${PORT}/jeux/rayou/`, { waitUntil: 'networkidle' });
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
	// The game's own palette: cream card, brown ink, tiger orange.
	const css = (fs) => `<style>#promo { all: initial; position: fixed; inset: 0; z-index: 99999; font-family: Rubik, sans-serif; }
		#promo * { box-sizing: border-box; }
		.cap { position: absolute; left: 0; top: 0; display: inline-flex; padding: 14px 24px 26px; }
		.cap span { display: inline-block; text-align: center; font-weight: 800; font-size: ${fs}px; line-height: 1.12; letter-spacing: -0.5px;
			color: #3a2a1c; padding: 20px 42px 24px; border-radius: 34px; background: #fffaf0;
			border: 5px solid #ee8a2c; box-shadow: 0 9px 0 #b85f14, 0 18px 40px rgba(58, 42, 28, 0.35); }
	</style>`;

	const logo = await b64('src/assets/LudivenStudioLogo.png', 'image/png');
	for (const [fmt, F] of Object.entries(FORMATS)) {
		for (const [i, c] of CAPTIONS.entries()) {
			await show(`${css(F.cap)}<div class="cap"><span>${esc(c.text)}</span></div>`);
			await page.locator('#promo .cap').screenshot({ path: join(DIR, 'cards', `${fmt}-cap${i}.png`), omitBackground: true });
		}
	}

	// 4:5 footer, under the game picture: who and where, for a feed watched without sound.
	await show(`${css(60)}<style>
		.foot { position: absolute; left: 0; top: 0; width: 1080px; height: 337px; display: flex; flex-direction: column; align-items: center;
			justify-content: center; gap: 14px; color: #fff8ec; text-shadow: 0 3px 14px rgba(0,0,0,0.55); }
		.foot b { font-size: 56px; font-weight: 800; letter-spacing: -0.5px; }
		.foot b em { font-style: normal; color: #ffb35c; }
		.foot div { display: flex; align-items: center; gap: 16px; font-size: 32px; font-weight: 600; }
		.foot img { height: 54px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.4)); }
	</style>
	<div class="foot"><b><em>Rayou</em> et la Fête des Lumières</b><div><img src="${logo}">Nouveau jeu gratuit · ludiven-studio.fr</div></div>`);
	await page.locator('#promo .foot').screenshot({ path: join(DIR, 'cards', '4x5-foot.png'), omitBackground: true });

	// 16:9 corner tag.
	await show(`<style>#promo { all: initial; position: fixed; inset: 0; font-family: Rubik, sans-serif; }
		.tag { position: absolute; left: 0; top: 0; display: inline-flex; align-items: center; gap: 14px; padding: 12px 24px 12px 14px;
			border-radius: 999px; background: rgba(255, 250, 240, 0.92); color: #3a2a1c; font-size: 30px; font-weight: 700;
			box-shadow: 0 6px 18px rgba(58, 42, 28, 0.3); }
		.tag img { height: 46px; }
	</style><div class="tag"><img src="${logo}">ludiven-studio.fr</div>`);
	await page.locator('#promo .tag').screenshot({ path: join(DIR, 'cards', '16x9-tag.png'), omitBackground: true });

	// End card over the lit lantern, friends gathered round it.
	const night = await b64(join(DIR, 'frames', 'lantern', '0160.jpg'), 'image/jpeg');
	for (const [fmt, F] of Object.entries(FORMATS)) {
		const tall = F.H > F.W;
		await show(`<style>#promo { all: initial; position: fixed; inset: 0; font-family: Rubik, sans-serif; }
			#promo * { box-sizing: border-box; }
			.end { position: absolute; left: 0; top: 0; width: ${F.W}px; height: ${F.H}px; overflow: hidden; background: #0d1433; }
			.end .bg { position: absolute; inset: -30px; background: url(${night}) center / cover; filter: blur(3px) saturate(1.1) brightness(0.8); }
			.end .veil { position: absolute; inset: 0; background: radial-gradient(circle at 50% ${tall ? 46 : 52}%, rgba(255, 207, 106, 0.28), transparent 48%),
				linear-gradient(180deg, rgba(13, 20, 51, 0.82) 0%, rgba(13, 20, 51, 0.2) 34%, rgba(13, 20, 51, 0.25) 62%, rgba(13, 20, 51, 0.92) 100%); }
			.end .box { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; text-align: center; color: #fff8ec;
				padding: ${tall ? '150px 60px 80px' : '90px 120px 70px'}; }
			.end h1 { margin: 0; font-weight: 800; font-size: ${tall ? 170 : 150}px; line-height: 0.95; color: #ffb35c; letter-spacing: -3px;
				text-shadow: 0 6px 0 #b85f14, 0 14px 40px rgba(0,0,0,0.6); }
			.end h2 { margin: 18px 0 0; font-weight: 700; font-size: ${tall ? 62 : 58}px; color: #fff3d6; text-shadow: 0 4px 20px rgba(0,0,0,0.7); }
			.end .tag { margin-top: ${tall ? 30 : 18}px; font-size: ${tall ? 40 : 38}px; font-weight: 600; color: #fff3d6; text-shadow: 0 3px 14px rgba(0,0,0,0.8); }
			.end .grow { flex: 1; }
			.end .chips { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-bottom: 30px; }
			.end .chips span { padding: 10px 24px; border-radius: 999px; background: rgba(255, 250, 240, 0.16); border: 2px solid rgba(255, 243, 214, 0.5);
				font-size: 32px; font-weight: 700; }
			.end .cta { font-size: 56px; font-weight: 800; color: #fff; background: linear-gradient(180deg, #ffa24a, #ee8a2c); padding: 24px 64px;
				border-radius: 999px; box-shadow: 0 10px 0 #b85f14, 0 18px 40px rgba(238, 138, 44, 0.45); }
			.end .url { margin-top: 26px; font-size: 42px; font-weight: 700; color: #fff3d6; text-shadow: 0 2px 10px rgba(0,0,0,0.7); }
			.end .logo { margin-top: ${tall ? 50 : 30}px; display: flex; align-items: center; gap: 16px; font-size: 34px; font-weight: 700; color: #f6e7c8; }
			.end .logo img { height: 66px; }
		</style>
		<div class="end"><div class="bg"></div><div class="veil"></div><div class="box">
			<h1>Rayou</h1><h2>et la Fête des Lumières</h2>
			<div class="tag">Une aventure en 3D pour toute la famille</div>
			<div class="grow"></div>
			<div class="chips"><span>Gratuit</span><span>Sans pub</span><span>Sans inscription</span></div>
			<div class="cta">Joue gratuitement</div>
			<div class="url">ludiven-studio.fr/jeux/rayou</div>
			<div class="logo"><img src="${logo}">Ludiven Studio</div>
		</div></div>`);
		await page.locator('#promo .end').screenshot({ path: join(DIR, 'cards', `${fmt}-end.png`) });
	}
	await browser.close();
} finally {
	server.stop();
}

// ---- ffmpeg ----
const sources = [...new Set(CUTS.map((c) => c.src))];
const srcPath = (s) => (s === 'user' ? USER : join(DIR, 'shots', `${s}.mp4`));
// The user's capture is 1654x1022 with the HUD chips along the top: trim them, back to 16:10.
const fit = (s) => (s === 'user' ? `crop=1552:970:51:52,scale=${SW}:${SH}:flags=lanczos` : `scale=${SW}:${SH}`);

for (const [fmt, F] of Object.entries(FORMATS)) {
	const inputs = [];
	for (const s of sources) inputs.push('-i', srcPath(s));
	const f = [];
	CUTS.forEach((c, k) => {
		const i = sources.indexOf(c.src);
		f.push(`[${i}:v]trim=start=${c.from.toFixed(3)}:duration=${c.dur.toFixed(3)},setpts=PTS-STARTPTS,fps=30,${fit(c.src)},setsar=1[v${k}]`);
	});
	f.push(`${CUTS.map((_, k) => `[v${k}]`).join('')}concat=n=${CUTS.length}:v=1:a=0[cut]`);
	let n = sources.length;
	let last;
	if (fmt === '4x5') {
		// Sharp game picture in the middle, a blurred copy of itself behind.
		f.push(`[cut]split[a][b]`);
		f.push(`[a]scale=-2:${F.H},crop=${F.W}:${F.H},boxblur=28:2,eq=brightness=-0.12:saturation=1.15[bg]`);
		f.push(`[b]scale=${F.W}:675:flags=lanczos[fg]`);
		f.push(`[bg][fg]overlay=0:${F.gameY}[m0]`);
		inputs.push('-loop', '1', '-t', CUTS_END.toFixed(3), '-i', join(DIR, 'cards', '4x5-foot.png'));
		f.push(`[m0][${n++}:v]overlay=0:${F.gameY + 675}[m1]`);
		last = 'm1';
	} else {
		f.push(`[cut]crop=${F.W}:${F.H}:0:${(SH - F.H) / 2}[m0]`);
		inputs.push('-loop', '1', '-t', CUTS_END.toFixed(3), '-i', join(DIR, 'cards', '16x9-tag.png'));
		f.push(`[m0][${n++}:v]overlay=W-w-34:H-h-30[m1]`);
		last = 'm1';
	}
	CAPTIONS.forEach((c, k) => {
		const d = c.to - c.at;
		inputs.push('-loop', '1', '-t', d.toFixed(3), '-i', join(DIR, 'cards', `${fmt}-cap${k}.png`));
		f.push(`[${n++}:v]format=rgba,fade=in:st=0:d=0.2:alpha=1,fade=out:st=${(d - 0.2).toFixed(3)}:d=0.2:alpha=1,setpts=PTS-STARTPTS+${c.at.toFixed(3)}/TB[c${k}]`);
		// 4:5: centred in the band above the picture. 16:9: over the top of the picture.
		const y = fmt === '4x5' ? `(${F.gameY}-h)/2+6` : '30';
		f.push(`[${last}][c${k}]overlay=x=(W-w)/2:y=${y}:eof_action=pass[o${k}]`);
		last = `o${k}`;
	});
	const endDur = END_CARD + XFADE;
	inputs.push('-loop', '1', '-t', endDur.toFixed(3), '-i', join(DIR, 'cards', `${fmt}-end.png`));
	// A slow push-in on the end card.
	f.push(`[${n++}:v]scale=${F.W * 2}:${F.H * 2},zoompan=z='1+0.04*on/(${Math.round(endDur * 30)})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${F.W}x${F.H}:fps=30,format=yuv420p,settb=1/30[end]`);
	f.push(`[${last}]fps=30,format=yuv420p,settb=1/30[main]`);
	f.push(`[main][end]xfade=transition=fade:duration=${XFADE}:offset=${(CUTS_END - XFADE).toFixed(3)}[vout]`);
	inputs.push('-i', join(DIR, 'music.wav'));
	f.push(`[${n++}:a]atrim=0:${TOTAL.toFixed(3)},afade=out:st=${(TOTAL - 1.4).toFixed(3)}:d=1.4[aout]`);

	const out = join(DIR, `rayou-teaser-${fmt}.mp4`);
	const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', f.join(';'), '-map', '[vout]', '-map', '[aout]',
		'-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k',
		'-movflags', '+faststart', '-t', TOTAL.toFixed(3), out], { stdio: 'inherit' });
	if (r.status !== 0) {
		console.log(`ffmpeg failed for ${fmt}`);
		process.exit(1);
	}
	console.log(`${out}: ${TOTAL.toFixed(2)} s`);
}
