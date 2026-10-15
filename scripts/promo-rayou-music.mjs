/* Rayou teaser, step 2: a bright flute tune over plucked guitar, on the edit's bar grid, rendered to a WAV.
   Uses the Tempo game's vendored samples (FluidR3_GM, MIT): public/assets/jeux/tempo/samples/.
   Bar 0 intro, bars 1-6 the adventure (G major, flute melody, shaker), bars 7-8 the lantern
   (strings swell, high sparkles), bars 9-10 the end card (resolves to G and rings out).
   Usage: node scripts/promo-rayou-music.mjs [out.wav]   (default D:/tmp/promo-rayou/music.wav) */
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BAR, TOTAL } from './promo-rayou-plan.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/promo-rayou/music.wav');
const SR = 44100;
const BEAT = BAR / 4;
const SAMPLES = 'public/assets/jeux/tempo/samples';
const manifest = JSON.parse(await readFile(`${SAMPLES}/manifest.json`, 'utf8'));
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const noteName = (m) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

const cache = new Map();
function decode(voice, midi) {
	const key = `${voice}/${midi}`;
	if (!cache.has(key)) {
		const r = spawnSync('ffmpeg', ['-v', 'error', '-i', `${SAMPLES}/${voice}/${noteName(midi)}.mp3`, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
		if (r.status !== 0) throw new Error(`decode ${key}: ${r.stderr}`);
		cache.set(key, new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4));
	}
	return cache.get(key);
}

const len = Math.ceil((TOTAL + 0.6) * SR);
const L = new Float32Array(len), R = new Float32Array(len);

/** One note: nearest sample, resampled to pitch, with a release at its end. */
function note(voice, midi, t, dur, gain, pan = 0, release = 0.3) {
	const base = manifest[voice].reduce((a, b) => (Math.abs(b - midi) < Math.abs(a - midi) ? b : a));
	const src = decode(voice, base);
	const rate = 2 ** ((midi - base) / 12);
	const start = Math.round(t * SR);
	const n = Math.min(Math.round((dur + release) * SR), Math.floor(src.length / rate) - 1, len - start);
	const rel = Math.round(release * SR), hold = n - rel;
	const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
	for (let i = 0; i < n; i++) {
		const x = i * rate, k = Math.floor(x), f = x - k;
		let v = src[k] * (1 - f) + src[k + 1] * f;
		if (i < 64) v *= i / 64;
		if (i > hold) v *= 1 - (i - hold) / rel;
		L[start + i] += v * gl;
		R[start + i] += v * gr;
	}
}

/** A soft shaker: a short burst of high-passed noise. */
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
function shaker(t, gain) {
	const start = Math.round(t * SR), n = Math.round(0.07 * SR);
	let prev = 0;
	for (let i = 0; i < n && start + i < len; i++) {
		const w = rnd();
		const v = (w - prev) * Math.exp(-i / (0.018 * SR)) * gain;
		prev = w;
		L[start + i] += v * 0.8;
		R[start + i] += v;
	}
}

// G major. [bass, ...upper]
const G = [43, 59, 62, 67], Em = [40, 59, 64, 67], C = [48, 60, 64, 67], D = [50, 62, 66, 69];
const BARS = [G, G, Em, C, D, G, D, Em, [C, D], G, G];
// Flute melody: [bar, beat, midi, beats].
const MEL = [
	[0, 3, 62, 0.5], [0, 3.5, 64, 0.5],
	[1, 0, 67, 1], [1, 1, 71, 1], [1, 2, 74, 1.5], [1, 3.5, 72, 0.5],
	[2, 0, 71, 2], [2, 2, 67, 1], [2, 3, 64, 1],
	[3, 0, 72, 1], [3, 1, 76, 1], [3, 2, 74, 1], [3, 3, 72, 1],
	[4, 0, 74, 3], [4, 3, 69, 1],
	[5, 0, 79, 1], [5, 1, 76, 1], [5, 2, 74, 1], [5, 3, 71, 1],
	[6, 0, 69, 1], [6, 1, 71, 1], [6, 2, 74, 2],
	[7, 0, 76, 4],
	[8, 0, 74, 2], [8, 2, 78, 2],
	[9, 0, 79, 6],
];

BARS.forEach((ch, i) => {
	const t0 = i * BAR;
	const halves = Array.isArray(ch[0]) ? [[ch[0], 0, 2], [ch[1], 2, 2]] : [[ch, 0, 4]];
	const lantern = i === 7 || i === 8;
	const end = i >= 9;
	for (const [chord, beat, beats] of halves) {
		const [bass, ...up] = chord;
		const t = t0 + beat * BEAT;
		if (i > 0 && !end) {
			note('bassGtr', bass, t, beats * BEAT * 0.5, 0.7, 0, 0.15);
			if (beats === 4 && !lantern) note('bassGtr', bass + 7, t + 2 * BEAT, BEAT, 0.55, 0, 0.15);
		}
		if (lantern || end) {
			// Strings swell under the lantern and the end card.
			for (const m of up) note('strings', m + 12, t, beats * BEAT, lantern ? 0.2 : 0.16, m % 2 ? 0.5 : -0.5, 0.9);
		}
		if (!lantern && !end) {
			// Plucked eighths: the walk through the valley.
			const arp = [up[0], up[1], up[2], up[1] + 12, up[2], up[1], up[2] + 12, up[1]];
			for (let k = 0; k < beats * 2; k++) note('gtr', arp[k % arp.length], t + (k * BEAT) / 2, BEAT / 2, k % 2 ? 0.22 : 0.3, -0.25, 0.25);
		} else if (lantern) {
			// Fireflies: high notes climbing, two a beat.
			const sparks = [up[0] + 24, up[1] + 24, up[2] + 24, up[1] + 24];
			for (let k = 0; k < beats * 2; k++) note('gtr', sparks[k % 4] - (k % 3 === 0 ? 0 : 12), t + (k * BEAT) / 2, BEAT, 0.16, 0.35, 0.8);
		}
		if (i === 0 || end) up.forEach((m, k) => note('piano', m, t + k * 0.04, beats * BEAT, i === 0 ? 0.32 : 0.42, 0.1, 1.2));
		else note('piano', up[0], t, beats * BEAT, 0.18, 0.1, 0.5);
	}
	if (i >= 1 && i <= 6) for (let k = 0; k < 8; k++) shaker(t0 + (k + 0.5) * (BEAT / 2), k % 2 ? 0.035 : 0.02);
	if (end && i === 9) note('bassGtr', 43, t0, 2 * BAR, 0.6, 0, 1);
});
for (const [bar, beat, m, beats] of MEL) note('flute', m, bar * BAR + beat * BEAT, beats * BEAT, 0.5, 0.05, 0.35);

// Small room reverb.
function reverb(x, combs, wet) {
	const out = new Float32Array(x.length);
	for (const d of combs) {
		const buf = new Float32Array(d);
		let k = 0;
		for (let i = 0; i < x.length; i++) {
			const y = buf[k];
			buf[k] = x[i] + y * 0.76;
			out[i] += y / combs.length;
			k = (k + 1) % d;
		}
	}
	for (const d of [556, 441]) {
		const buf = new Float32Array(d);
		let k = 0;
		for (let i = 0; i < out.length; i++) {
			const b = buf[k], v = out[i];
			buf[k] = v + b * 0.5;
			out[i] = b - v * 0.5;
			k = (k + 1) % d;
		}
	}
	for (let i = 0; i < x.length; i++) out[i] = x[i] + out[i] * wet;
	return out;
}
const Lr = reverb(L, [1557, 1617, 1491, 1422], 0.28);
const Rr = reverb(R, [1580, 1640, 1514, 1445], 0.28);

let peak = 0;
for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(Lr[i]), Math.abs(Rr[i]));
const g = 0.89 / peak;
const fade = Math.round(1.4 * SR), fadeAt = Math.round(TOTAL * SR) - fade;
const pcm = Buffer.alloc(len * 4);
for (let i = 0; i < len; i++) {
	const f = i < fadeAt ? 1 : Math.max(0, 1 - (i - fadeAt) / fade);
	pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Lr[i] * g * f)) * 32767), i * 4);
	pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Rr[i] * g * f)) * 32767), i * 4 + 2);
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(SR, 24);
hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
await writeFile(OUT, Buffer.concat([hdr, pcm]));
console.log(`${OUT}: ${(len / SR).toFixed(2)} s, peak gain ${g.toFixed(2)}`);
