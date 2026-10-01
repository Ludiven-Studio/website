/* Atelier promo, step 2: a short piano + strings piece on the edit's bar grid, rendered offline to a WAV.
   Uses the Tempo game's vendored samples (FluidR3_GM, MIT): public/assets/jeux/tempo/samples/.
   Bar 0 intro (Dm, alone), bars 1-6 gameplay (F major waltz-like theme), bars 7-10 story (minor, sparse),
   bars 11-12 end card (cadence to F, rings out).
   Usage: node scripts/promo-atelier-music.mjs [out.wav]   (default D:/tmp/promo-atelier/music.wav) */
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BAR, TOTAL } from './promo-atelier-plan.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/promo-atelier/music.wav');
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

const len = Math.ceil((TOTAL + 0.5) * SR);
const L = new Float32Array(len), R = new Float32Array(len);

/** One note: nearest sample, resampled to pitch, with a release at its end. */
function note(voice, midi, t, dur, gain, pan = 0, release = 0.35) {
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

// F major. Chords as [bass, ...upper voices], one per half bar where two are listed.
const F = 53, C = 48, D = 50, Bb = 46, G = 43, A = 45, E = 52;
const BARS = [
	{ ch: [[D, 62, 65, 69, 72]] },                        // 0 Dm9 — the dusty room
	{ ch: [[F, 65, 69, 72]] },                            // 1 F
	{ ch: [[E, 64, 67, 72]] },                            // 2 C/E
	{ ch: [[D, 62, 65, 69]] },                            // 3 Dm
	{ ch: [[Bb, 62, 65, 70]] },                           // 4 Bb
	{ ch: [[F, 65, 69, 72]] },                            // 5 F
	{ ch: [[C, 64, 67, 72], [C, 64, 67, 70]] },           // 6 C C7
	{ ch: [[D, 62, 65, 69]] },                            // 7 Dm — the story
	{ ch: [[Bb, 62, 65, 70]] },                           // 8 Bb
	{ ch: [[G, 62, 67, 70]] },                            // 9 Gm
	{ ch: [[A, 61, 64, 67, 69]] },                        // 10 A7 — the question hangs
	{ ch: [[Bb, 62, 65, 70], [C, 64, 67, 70]] },          // 11 Bb C
	{ ch: [[F, 65, 69, 72, 77]] },                        // 12 F — rings out
];
// Melody: [bar, beat, midi, beats].
const MEL = [
	[1, 0, 72, 1], [1, 1, 69, 1], [1, 2, 77, 2],
	[2, 0, 76, 3], [2, 3, 74, 1],
	[3, 0, 77, 1], [3, 1, 76, 1], [3, 2, 74, 1], [3, 3, 69, 1],
	[4, 0, 74, 2], [4, 2, 72, 2],
	[5, 0, 72, 1], [5, 1, 69, 1], [5, 2, 77, 1], [5, 3, 81, 1],
	[6, 0, 79, 3],
	[7, 0, 81, 4],
	[8, 0, 77, 2], [8, 2, 74, 2],
	[9, 0, 79, 2], [9, 2, 82, 2],
	[10, 0, 73, 4],
	[11, 0, 74, 2], [11, 2, 76, 2],
	[12, 0, 77, 4],
];

BARS.forEach((b, i) => {
	const t0 = i * BAR;
	const halves = b.ch.length === 2 ? [[b.ch[0], 0, 2], [b.ch[1], 2, 2]] : [[b.ch[0], 0, 4]];
	const story = i >= 7 && i <= 10;
	for (const [ch, beat, beats] of halves) {
		const [bass, ...up] = ch;
		const t = t0 + beat * BEAT;
		// Bass: low octave on the downbeat, the fifth on beat 3 in the gameplay bars.
		// The lowest piano sample is E2: further down, resampling makes it mud.
		note('piano', bass - 12 >= 38 ? bass - 12 : bass, t, beats * BEAT, i === 0 ? 0.5 : 0.75, -0.1, 0.5);
		if (!story && i > 0 && i < 11 && beats === 4) note('piano', bass - 5, t + 2 * BEAT, 2 * BEAT, 0.45, -0.1);
		// Strings pad from bar 3, and through the story and the end.
		if (i >= 3) for (const m of up) note('strings', m, t, beats * BEAT, story ? 0.2 : 0.16, (m % 2 ? 0.45 : -0.45), 0.6);
		if (i === 0 || story) {
			// Sparse: a slow rising arpeggio, two notes a beat at most.
			up.forEach((m, k) => note('piano', m, t + k * BEAT * (story ? 1 : 0.5), BEAT * 2, 0.32, 0.15, 0.8));
		} else if (i < 12) {
			// Eighths over the chord: the bench at work.
			const arp = [up[0], up[1], up[2], up[1], up[2] + 12, up[2], up[1], up[2]];
			for (let k = 0; k < beats * 2; k++) note('piano', arp[k % arp.length], t + k * BEAT / 2, BEAT / 2, k % 2 ? 0.2 : 0.27, 0.2, 0.25);
		} else {
			up.forEach((m, k) => note('piano', m, t + k * 0.05, 3 * BEAT, 0.4, 0.1, 1.2));
		}
	}
});
for (const [bar, beat, m, beats] of MEL) note('piano', m, bar * BAR + beat * BEAT, beats * BEAT, 0.55, 0.05, 0.4);

// A small Schroeder reverb: the room of an old workshop.
function reverb(x, combs, wet) {
	const out = new Float32Array(x.length);
	for (const d of combs) {
		const buf = new Float32Array(d);
		let k = 0;
		for (let i = 0; i < x.length; i++) {
			const y = buf[k];
			buf[k] = x[i] + y * 0.78;
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
const Lr = reverb(L, [1557, 1617, 1491, 1422], 0.32);
const Rr = reverb(R, [1580, 1640, 1514, 1445], 0.32);

let peak = 0;
for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(Lr[i]), Math.abs(Rr[i]));
const g = 0.89 / peak;
const fade = Math.round(1.2 * SR), fadeAt = Math.round(TOTAL * SR) - fade;
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
