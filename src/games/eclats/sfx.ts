/**
 * ÉCLATS — procedural sound effects (WebAudio, no assets), on the model of billard/sfx.ts.
 * A swipe whooshes, every wave of a chain plucks one note higher up a pentatonic scale, a bomb
 * thumps, a chest chimes. Muting is a per-device preference.
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

/** A bomb goes off. */
export function bomb(): void {
	const c = gate('bomb', 90);
	if (!c) return;
	tone(c, 'sine', 140, 42, 0.55, 0.32);
	noise(c, 'lowpass', 900, 0.6, 0.35, 0.3, 0, 0.3);
}

/** A star clears a colour. */
export function star(): void {
	const c = gate('star', 200);
	if (!c) return;
	[1046.5, 1318.51, 1567.98, 2093].forEach((f, i) => tone(c, 'sine', f, f, 0.14, 0.18, i * 0.04));
	noise(c, 'highpass', 5000, 0.5, 0.08, 0.35);
}

/** A chest opens: a chime and a little rain of coins. */
export function chest(): void {
	const c = gate('chest', 120);
	if (!c) return;
	[784, 988, 1175].forEach((f, i) => tone(c, 'triangle', f, f, 0.2, 0.25, i * 0.07));
	for (let k = 0; k < 4; k++) tone(c, 'square', 2600 + k * 230, 2600 + k * 230, 0.025, 0.05, 0.18 + k * 0.05);
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
