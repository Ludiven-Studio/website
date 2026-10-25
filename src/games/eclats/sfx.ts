/**
 * ÉCLATS — procedural sound effects (WebAudio, no assets), on the model of billard/sfx.ts.
 * A swipe whooshes, every wave of a chain plucks one note higher up a pentatonic scale, a fusion
 * rings, a charged gem thumps, a comet hisses, a chest chimes, Bijou roars his fireballs out. Muting is a
 * per-device preference.
 */

const KEY = 'eclats-sound';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;
let loaded = false;
const lastAt: Record<string, number> = {};

function readPref(): void {
	if (loaded) return;
	loaded = true;
	try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* no storage */ }
}

function ensureCtx(): AudioContext | null {
	if (ctx) return ctx;
	try {
		const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AC) return null;
		ctx = new AC();
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -16;
		comp.ratio.value = 5;
		comp.connect(ctx.destination);
		master = ctx.createGain();
		master.gain.value = 0.45;
		master.connect(comp);
		noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
		const d = noiseBuf.getChannelData(0);
		for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
	} catch {
		ctx = null;
	}
	return ctx;
}

/** True unless the player muted the game. */
export function isEnabled(): boolean {
	readPref();
	return enabled;
}

export function setEnabled(on: boolean): void {
	readPref();
	enabled = on;
	try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* no storage */ }
	if (on) unlock();
}

/** Call from a user gesture: creates/resumes the AudioContext (iOS requires this). */
export function unlock(): void {
	if (!isEnabled()) return;
	const c = ensureCtx();
	if (c && c.state === 'suspended') c.resume().catch(() => { /* stays silent */ });
}

function gate(kind: string, minGapMs: number): AudioContext | null {
	if (!isEnabled()) return null;
	const c = ensureCtx();
	if (!c || c.state !== 'running') return null;
	const now = c.currentTime * 1000;
	if (now - (lastAt[kind] ?? -1e9) < minGapMs) return null;
	lastAt[kind] = now;
	return c;
}

function noise(c: AudioContext, type: BiquadFilterType, freq: number, q: number, peak: number, dur: number, delay = 0, sweep = 1): void {
	const src = c.createBufferSource();
	src.buffer = noiseBuf;
	const f = c.createBiquadFilter();
	f.type = type;
	f.frequency.setValueAtTime(freq, c.currentTime + delay);
	f.frequency.exponentialRampToValueAtTime(freq * sweep, c.currentTime + delay + dur);
	f.Q.value = q;
	const g = c.createGain();
	g.gain.setValueAtTime(0.0001, c.currentTime + delay);
	g.gain.exponentialRampToValueAtTime(peak, c.currentTime + delay + Math.min(0.02, dur / 3));
	g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
	src.connect(f); f.connect(g); g.connect(master!);
	src.start(c.currentTime + delay, Math.random() * 0.2, dur + 0.05);
	src.stop(c.currentTime + delay + dur + 0.05);
}

function tone(c: AudioContext, type: OscillatorType, f0: number, f1: number, peak: number, dur: number, delay = 0): void {
	const o = c.createOscillator();
	o.type = type;
	o.frequency.setValueAtTime(f0, c.currentTime + delay);
	o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), c.currentTime + delay + dur);
	const g = c.createGain();
	g.gain.setValueAtTime(peak, c.currentTime + delay);
	g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
	o.connect(g); g.connect(master!);
	o.start(c.currentTime + delay);
	o.stop(c.currentTime + delay + dur + 0.02);
}

// C major pentatonic, climbing: wave 1 is the low C, a long chain walks up two octaves and stays there.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

/** The board slides. */
export function swipe(): void {
	const c = gate('swipe', 60);
	if (!c) return;
	noise(c, 'bandpass', 700, 0.9, 0.12, 0.14, 0, 2.2);
}

/** A swipe that moves nothing. */
export function refused(): void {
	const c = gate('refused', 150);
	if (!c) return;
	tone(c, 'triangle', 160, 120, 0.12, 0.12);
}

/** One wave bursts: a pluck one step higher per wave, brighter when many gems go. */
export function pop(wave: number, gems: number): void {
	const c = gate('pop', 40);
	if (!c) return;
	const f = SCALE[Math.min(SCALE.length - 1, wave - 1)];
	const loud = Math.min(0.32, 0.16 + gems * 0.015);
	tone(c, 'triangle', f, f * 0.98, loud, 0.22);
	tone(c, 'sine', f * 2, f * 2, loud * 0.35, 0.12);
	noise(c, 'highpass', 3000, 0.7, 0.05 + Math.min(0.08, gems * 0.006), 0.07);
}

/** A charged gem goes off: deeper and longer the higher its rank; a crown also rings out. */
export function blast(rank: number): void {
	const c = gate('blast', 90);
	if (!c) return;
	const k = Math.min(3, Math.max(1, rank - 1));
	tone(c, 'sine', 150 - k * 20, 42 - k * 6, 0.45 + k * 0.08, 0.26 + k * 0.1);
	noise(c, 'lowpass', 1000 - k * 150, 0.6, 0.28 + k * 0.06, 0.24 + k * 0.1, 0, 0.3);
	if (rank >= 4) [1046.5, 1318.51, 1567.98, 2093].forEach((f, i) => tone(c, 'sine', f, f, 0.14, 0.2, 0.05 + i * 0.05));
}

/** Gems fuse into one a rank up: a bright chord that climbs with the rank. */
export function fuse(rank: number): void {
	const c = gate('fuse', 80);
	if (!c) return;
	const base = [0, 0, 659.25, 783.99, 987.77][Math.min(4, rank)];
	[1, 1.25, 1.5].forEach((m, i) => tone(c, 'triangle', base * m, base * m, 0.13, 0.22, i * 0.035));
	noise(c, 'highpass', 4500, 0.6, 0.06, 0.18);
}

/** A comet takes off toward its target. */
export function comet(): void {
	const c = gate('comet', 120);
	if (!c) return;
	noise(c, 'bandpass', 500, 1.4, 0.16, 0.32, 0, 6);
	tone(c, 'sine', 600, 1800, 0.08, 0.3);
}

/** A chest flies open: the lid swooshes up, then a chime and a little rain of coins. */
export function chest(): void {
	const c = gate('chest', 120);
	if (!c) return;
	tone(c, 'sine', 220, 660, 0.14, 0.16);
	noise(c, 'bandpass', 900, 1, 0.08, 0.16, 0, 3);
	[784, 988, 1175, 1568].forEach((f, i) => tone(c, 'triangle', f, f, 0.2, 0.28, 0.1 + i * 0.07));
	for (let k = 0; k < 4; k++) tone(c, 'square', 2600 + k * 230, 2600 + k * 230, 0.025, 0.05, 0.3 + k * 0.05);
}

/** A coin lands in the loot: a short ting, a little higher for each coin of the same chest. */
export function coin(k: number): void {
	const c = gate('coin', 25);
	if (!c) return;
	const f = 1760 * Math.pow(2, Math.min(12, k) / 24);
	tone(c, 'sine', f, f, 0.07, 0.09);
	tone(c, 'triangle', f * 2, f * 2, 0.025, 0.05);
}

/** An open chest drops into the counter. */
export function stash(): void {
	const c = gate('stash', 60);
	if (!c) return;
	tone(c, 'triangle', 392, 294, 0.14, 0.12);
	noise(c, 'lowpass', 900, 0.7, 0.06, 0.08);
}

/** Bijou's gauge is full: a warm rising call. */
export function ready(): void {
	const c = gate('ready', 400);
	if (!c) return;
	[392, 523.25, 659.25, 783.99].forEach((f, i) => tone(c, 'triangle', f, f, 0.14, 0.2, i * 0.06));
	noise(c, 'bandpass', 1200, 1.2, 0.05, 0.3, 0.1, 2);
}

/** Bijou breathes: a low growl swelling into a roaring whoosh of flame. */
export function breath(): void {
	const c = gate('breath', 300);
	if (!c) return;
	tone(c, 'sawtooth', 110, 70, 0.08, 0.5);
	noise(c, 'bandpass', 300, 0.8, 0.3, 0.7, 0.05, 5);
	noise(c, 'lowpass', 1400, 0.5, 0.18, 0.6, 0.12, 0.4);
}

/** Level won: a rising arpeggio. */
export function win(): void {
	const c = gate('end', 800);
	if (!c) return;
	[523, 659, 784, 1047].forEach((f, i) => tone(c, 'triangle', f, f, 0.24, 0.24, i * 0.1));
}

/** The board is full. */
export function lose(): void {
	const c = gate('end', 800);
	if (!c) return;
	tone(c, 'triangle', 330, 330, 0.18, 0.22);
	tone(c, 'triangle', 247, 247, 0.16, 0.34, 0.15);
}
