/* Rayou teaser, step 1: record scripted shots of the real game, one fixed 1/30 s step per frame, on the
   real GPU (headless Chromium + ANGLE D3D11), so the motion is smooth whatever the render speed.
   Writes D:/tmp/promo-rayou/shots/<name>.mp4 (1920x1200, 30 fps) for scripts/promo-rayou-edit.mjs.
   Usage: node scripts/promo-rayou.mjs [out dir] [--only name,name] */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'D:/tmp/promo-rayou');
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
const PORT = 4384;
const W = 1920, H = 1200, FPS = 30;
const WARMUP = 15;

// Each shot runs in the page: `setup(t)` once, then `ctl(t, i)` before every recorded frame.
// `t` is the game's test hook (window.__rayou); per-shot memory lives on `window.__m`.
const SHOTS = {
	feuille: {
		frames: 80,
		// The bubble is sized for play, not for a 1920 px frame shrunk into a phone feed.
		bigDialog: true,
		setup: (t) => {
			t.set({ nut: 0, tuto: 6 });
			t.setDay(0.05);
			const f = t.spots.npcs.feuille;
			t.teleport(f.x + 0.5, f.z + 1.9, Math.atan2(-0.5, -1.9));
			t.camAt(null);
		},
		ctl: (t, i) => {
			if (i === 6) t.press('action');
			if (i === 50) t.advance();
		},
	},
	roll: {
		frames: 92,
		setup: (t) => {
			// 'trunk' seen: no tip bubble stopping him in front of the log.
			window.__m = undefined;
			t.set({ nut: 3, owl: 0, tuto: 6, seen: ['trunk', 'move', 'roll', 'crawl', 'tumble'] });
			t.setDay(0.2);
			t.teleport(0.6, -29.6, Math.PI);
		},
		ctl: (t, i) => {
			const [x, y, z] = t.state.pos;
			if (i === 0) t.drive(Math.PI, 4.8);
			if (i === 26) t.press('roll');
			if (i === 84) t.drive(null);
			// Crane: follow close behind and to the side, stop short of the log, then rise to see him
			// pop out on the far side.
			const m = (window.__m ??= { cz: z + 3.4, cy: 1.9, lz: z });
			const stop = -32.6;
			m.cz += (Math.max(z + 3.4, stop) - m.cz) * 0.25;
			m.cy += ((z + 3.4 < stop ? 1.9 + (stop - z - 3.4) * 0.75 : 1.9) - m.cy) * 0.12;
			m.lz += (z - m.lz) * 0.3;
			t.camAt([2.5, Math.min(m.cy, 6.2), m.cz], [x * 0.6, y + 0.5, m.lz - 1]);
		},
	},
	bounce: {
		frames: 84,
		setup: (t) => {
			t.set({ nut: 3, owl: 1, beaver: 2, tuto: 6 });
			t.setDay(0.25);
			t.teleport(-4.3, -55.3, -Math.PI / 2);
			window.__m = { jumped: false, up: false };
			t.holdJump(true);
		},
		ctl: (t, i) => {
			const m = window.__m;
			const [x, y, z] = t.state.pos;
			const to = (tx, tz, s) => t.drive(Math.atan2(tx - x, tz - z), s);
			const dm = Math.hypot(x + 8, z + 56);
			if (!m.jumped) {
				to(-8, -56, 4);
				if (dm < 2.1 && t.state.grounded) {
					t.press('jump');
					m.jumped = true;
				}
			} else if (y > 2.2 || m.up) {
				m.up = true;
				if (Math.hypot(x + 9.6, z + 58.2) < 0.5 && t.state.grounded) t.drive(null);
				else to(-9.6, -58.2, 3.2);
			}
			// From the west of the valley, clear of the oak roots: mushroom and pillar side by side.
			t.camAt([-3.6, 2.5, -61.4], [(x - 8.8) / 2, Math.max(1.3, y * 0.6 + 0.8), (z - 57) / 2]);
			window.__maxY = Math.max(window.__maxY ?? 0, y);
		},
	},
	pads: {
		frames: 84,
		setup: (t) => {
			t.set({ nut: 3, owl: 1, beaver: 2, hedge: 2, tuto: 6 });
			t.setDay(0.4);
			t.teleport(5, 36.4, 0);
			window.__m = { k: 0, cool: 0 };
			t.holdJump(true);
		},
		ctl: (t, i) => {
			const m = window.__m;
			const pads = [[5, 37.6], [5.2, 40.2], [6.6, 42.3], [5.0, 44.6], [6.0, 47.6]];
			const [x, y, z] = t.state.pos;
			const s = t.state;
			if (m.k < pads.length && Math.hypot(x - pads[m.k][0], z - pads[m.k][1]) < 0.45 && s.grounded) m.k++;
			const p = pads[Math.min(m.k, pads.length - 1)];
			const d = Math.hypot(x - p[0], z - p[1]);
			t.drive(Math.atan2(p[0] - x, p[1] - z), d < 0.4 ? 0 : 4.4);
			m.cool--;
			// Take off from the rim of the pad Rayou stands on, not from the water.
			const from = pads[Math.max(0, m.k - 1)];
			if (s.grounded && m.k > 0 && Math.hypot(x - from[0], z - from[1]) > 0.42 && d > 0.6 && m.cool < 0) {
				t.press('jump');
				m.cool = 12;
			}
			t.camAt([x - 2.4, y + 2.3, z - 4.2], [x + 0.4, y + 0.1, z + 1.8]);
		},
	},
	lantern: {
		frames: 170,
		hideDialog: true,
		setup: (t) => {
			t.set({ nut: 3, owl: 2, beaver: 2, hedge: 2, rabbit: 2, frog: 2, tuto: 6 });
			t.setDay(0.79);
			const L = t.spots.lantern;
			t.teleport(L.x + 1.8, L.z + 1.8, -2.4, 23);
			t.camAt(null);
		},
		ctl: (t, i) => {
			if (i === 2) t.press('action');
		},
	},
};

await mkdir(join(OUT, 'shots'), { recursive: true });
const server = await startServer(PORT, { mode: 'dev' });
try {
	const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
	for (const [name, shot] of Object.entries(SHOTS)) {
		if (ONLY && !ONLY.includes(name)) continue;
		const page = await browser.newPage({ viewport: { width: W, height: H } });
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await page.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["rayou"]'));
		await page.goto(`http://localhost:${PORT}/jeux/rayou/`, { waitUntil: 'networkidle' });
		await page.waitForFunction(() => window.__rayou);
		await page.addStyleTag({
			content: `astro-dev-toolbar, .gf-exit { display: none !important; }
				.ry-hud > :not(#ry-dialog) { display: none !important; }
				${shot.hideDialog ? '#ry-dialog { display: none !important; }' : ''}
				${shot.bigDialog ? '#ry-dialog { zoom: 1.9; bottom: 18px !important; }' : ''}`,
		});
		await page.evaluate(() => document.getElementById('ry-play').click());
		// The site's fullscreen layout: the game box fills the window.
		await page.evaluate(() => document.querySelector('.gf-btn')?.click());
		await page.waitForTimeout(600);
		const T = (fn, ...a) => page.evaluate(([src, args]) => new Function('t', 'a', `return (${src})(t, ...a)`)(window.__rayou, args), [fn.toString(), a]);
		await T((t) => {
			t.fixed(1 / 30);
			t.steps(0);
		});
		await T(shot.setup);
		const step = async () => {
			await page.evaluate(() => window.__rayou.steps(1));
			await page.waitForFunction(() => window.__rayou.held, null, { polling: 'raf' });
			// One more frame: the held redraw is what reaches the screen.
			await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
		};
		for (let i = 0; i < WARMUP; i++) {
			if (name !== 'feuille' && name !== 'lantern') await T(shot.ctl, -1);
			await step();
		}
		const dir = join(OUT, 'frames', name);
		await rm(dir, { recursive: true, force: true });
		await mkdir(dir, { recursive: true });
		for (let i = 0; i < shot.frames; i++) {
			await T(shot.ctl, i);
			await step();
			await page.screenshot({ path: join(dir, `${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 });
		}
		const out = join(OUT, 'shots', `${name}.mp4`);
		const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, '%04d.jpg'), '-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p', out]);
		if (r.status !== 0) throw new Error(`ffmpeg ${name}: ${r.stderr}`);
		console.log(`${name}: ${shot.frames} frames → ${out}${errors.length ? ` — errors: ${errors.join(' | ')}` : ''}`);
		await page.close();
	}
	await browser.close();
} finally {
	server.stop();
}
