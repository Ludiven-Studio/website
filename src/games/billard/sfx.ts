/**
 * BILLARD — procedural sound effects (WebAudio, no assets). Everything is synthesized:
 * filtered noise bursts for the clacks, sine drops for the pocket. Render-side only
 * (driven by the same impact events as the FX), so lockstep MP is untouched.
 */

const KEY = 'billard-sound';

// Impact speeds run ~18-104 engine units (see the measured range in the FX layer).
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const level = (speed: number) => clamp01((speed - 10) / 90);

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
		// A touch of compression tames the break (a dozen clacks in one frame).
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

// gate() also throttles per kind: a break fires many impacts in one render frame and
// stacking them all reads as white noise, not a break.
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

/** Two balls collide: a bright phenolic clack, louder and sharper with speed. */
export function ballHit(speed: number): void {
	if (speed < 8) return;
	const c = gate('ball', 30);
	if (!c) return;
	const v = level(speed);
	noiseHit(c, 'bandpass', 1900 + v * 2600, 1.2, 0.12 + v * 0.55, 0.03 + v * 0.03);
}

/** Ball into a cushion: a dull rubber thud. */
export function railHit(speed: number): void {
	if (speed < 20) return;
	const c = gate('rail', 60);
	if (!c) return;
	const v = level(speed);
	noiseHit(c, 'lowpass', 420 + v * 260, 0.7, 0.06 + v * 0.22, 0.08);
	tone(c, 'sine', 130, 60, 0.05 + v * 0.12, 0.09, 0, rate);
}

/** A ball drops: a falling plop, then a short rattle inside the pocket. */
export function pocket(): void {
	const c = gate('pocket', 80);
	if (!c) return;
	tone(c, 'sine', 270, 80, 0.5, 0.13, 0, rate);
	noiseHit(c, 'bandpass', 1400, 1.5, 0.12, 0.025, 0.07);
	noiseHit(c, 'bandpass', 1100, 1.5, 0.09, 0.03, 0.15);
}

/** Cue tip strikes the ball. */
export function cueStrike(speed: number): void {
	const c = gate('cue', 100);
	if (!c) return;
	const v = clamp01(speed / 195); // shot speed, capped at the engine's MAX_SPEED
	noiseHit(c, 'highpass', 2400, 0.8, 0.1 + v * 0.3, 0.03);
	tone(c, 'sine', 900, 320, 0.08 + v * 0.15, 0.05);
}

/** Foul / scratch: a soft downward womp. */
export function foul(): void {
	const c = gate('foul', 400);
	if (!c) return;
	tone(c, 'triangle', 220, 110, 0.22, 0.28);
}

/** Match won: a small rising arpeggio. */
export function win(): void {
	const c = gate('end', 800);
	if (!c) return;
	[523, 659, 784].forEach((f, i) => tone(c, 'triangle', f, f, 0.25, 0.22, i * 0.1));
}

/** Match lost: two falling notes, kept gentle. */
export function lose(): void {
	const c = gate('end', 800);
	if (!c) return;
	tone(c, 'triangle', 330, 330, 0.18, 0.22);
	tone(c, 'triangle', 262, 262, 0.16, 0.3, 0.14);
}
