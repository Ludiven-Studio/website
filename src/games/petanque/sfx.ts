/**
 * PÉTANQUE — procedural sound effects (WebAudio, no assets). The signature is the metallic "toc" of
 * two steel boules; the ground is a soft earth thud whose colour follows the surface, and a stone is
 * a tiny tick. Render-side only, driven by the same impact events as the FX, so lockstep multiplayer
 * is untouched.
 */

const KEY = 'petanque-sound';

// Engine speeds are m/s: a graze lands near 1, a pointed boule around 3-5, a hard carreau 7-9.
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;
let loaded = false;
let rate = 1; // slow-mo pitch factor (impacts only, jingles stay on real time)
let played = 0; // lifetime attempts past the enabled gate — the smoke test asserts on this
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
		// A touch of compression tames a cluster of clacks landing in one frame.
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -18;
		comp.ratio.value = 6;
		comp.connect(ctx.destination);
		master = ctx.createGain();
		master.gain.value = 0.5;
		master.connect(comp);
		noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
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

/** Slow-mo hook: < 1 pitches the impact sounds down with the action. */
export function setRate(r: number): void { rate = r; }

export const stats = () => ({ played, enabled: isEnabled(), ctx: ctx?.state ?? 'none' });

// gate() also throttles per kind: a cluster fires several impacts in one render frame and stacking
// them all reads as white noise, not a strike.
function gate(kind: string, minGapMs: number): AudioContext | null {
	if (!isEnabled()) return null;
	const c = ensureCtx();
	if (!c) return null;
	const now = c.currentTime * 1000;
	if (now - (lastAt[kind] ?? -1e9) < minGapMs) return null;
	lastAt[kind] = now;
	played++;
	return c;
}

function noiseHit(c: AudioContext, type: BiquadFilterType, freq: number, q: number, peak: number, dur: number, delay = 0): void {
	const src = c.createBufferSource();
	src.buffer = noiseBuf;
	src.playbackRate.value = rate;
	const f = c.createBiquadFilter();
	f.type = type;
	f.frequency.value = freq * rate;
	f.Q.value = q;
	const g = c.createGain();
	g.gain.setValueAtTime(peak, c.currentTime + delay);
	g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
	src.connect(f); f.connect(g); g.connect(master!);
	src.start(c.currentTime + delay, Math.random() * 0.2, dur + 0.05);
	src.stop(c.currentTime + delay + dur + 0.05);
}

function tone(c: AudioContext, type: OscillatorType, f0: number, f1: number, peak: number, dur: number, delay = 0, pitchRate = 1): void {
	const o = c.createOscillator();
	o.type = type;
	o.frequency.setValueAtTime(f0 * pitchRate, c.currentTime + delay);
	o.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * pitchRate), c.currentTime + delay + dur);
	const g = c.createGain();
	g.gain.setValueAtTime(peak, c.currentTime + delay);
	g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
	o.connect(g); g.connect(master!);
	o.start(c.currentTime + delay);
	o.stop(c.currentTime + delay + dur + 0.02);
}

/**
 * A boule lands on the ground: a soft earthy thud. Sand swallows it; coarse gravel puts a bright
 * grit on top. Threshold matches the dust FX, so a touch too soft to raise dust is silent too.
 */
export function groundHit(speed: number, surface: string): void {
	if (speed < 1.2) return;
	const c = gate('ground', 40);
	if (!c) return;
	const v = clamp01(speed / 7);
	const soft = surface === 'sable';
	const coarse = surface === 'gravier-gros' || surface === 'gravier-fin';
	noiseHit(c, 'lowpass', (soft ? 220 : 340) + v * 180, 0.8, (soft ? 0.05 : 0.10) + v * (soft ? 0.10 : 0.22), soft ? 0.05 : 0.09);
	tone(c, 'sine', soft ? 90 : 130, 55, 0.04 + v * 0.10, soft ? 0.06 : 0.10, 0, rate);
	if (coarse) noiseHit(c, 'highpass', 3200, 0.9, (0.03 + v * 0.10) * (surface === 'gravier-gros' ? 1.4 : 1), 0.03);
}

/* A hollow steel boule's ring: inharmonic partials at FIXED pitches. The old clack slid each tone
   down by ~1 kHz, which is a "pew", not metal. Higher partials die first, as they do in the shell. */
// About an octave under the first version, which read as small and tinny for 700 g of steel.
const STEEL = [{ f: 1180, a: 1, d: 0.18 }, { f: 1930, a: 0.6, d: 0.12 }, { f: 2840, a: 0.35, d: 0.07 }];

/**
 * Two boules collide: a hard click, then the shell rings. Against the jack it is a dull wooden "toc"
 * instead. The gate is wide on purpose: a boule nudging another reports a contact nearly every
 * frame, and the old 25 ms gate turned that into a buzz.
 */
export function clack(speed: number, jack = false): void {
	if (speed < (jack ? 0.4 : 0.8)) return;
	const c = gate(jack ? 'toc' : 'clack', 90);
	if (!c) return;
	const v = clamp01(speed / 9);
	const loud = 0.25 + 0.75 * v * v; // soft touches stay soft; a carreau is loud
	if (jack) {
		// Dry: one short knock and almost no ring.
		noiseHit(c, 'bandpass', 1900 + v * 600, 3, 0.16 * loud + 0.04, 0.012);
		tone(c, 'sine', 1300 + v * 200, 1300 + v * 200, 0.04 * loud + 0.01, 0.018, 0, rate);
		return;
	}
	const detune = 0.97 + Math.random() * 0.06; // no two boules ring at quite the same pitch
	noiseHit(c, 'bandpass', 1800, 0.8, 0.35 * loud, 0.01);
	for (const p of STEEL) {
		const f = p.f * detune;
		tone(c, 'sine', f, f, 0.14 * p.a * loud, p.d * (0.6 + 0.4 * v), 0, rate);
	}
}

/** A boule clips a stone: a tiny high tick. */
export function pebble(speed: number): void {
	if (speed < 1) return;
	const c = gate('pebble', 45);
	if (!c) return;
	const v = clamp01(speed / 6);
	noiseHit(c, 'bandpass', 3800 + v * 2000, 2, 0.03 + v * 0.10, 0.015 + v * 0.01);
}

/** Match won: a small rising arpeggio. */
export function win(): void {
	const c = gate('end', 800);
	if (!c) return;
	[523, 659, 784, 1047].forEach((f, i) => tone(c, 'triangle', f, f, 0.24, 0.24, i * 0.11));
}

/** Match lost: two gentle falling notes. */
export function lose(): void {
	const c = gate('end', 800);
	if (!c) return;
	tone(c, 'triangle', 392, 392, 0.18, 0.24);
	tone(c, 'triangle', 294, 294, 0.16, 0.32, 0.16);
}
