/**
 * BOLIDES — procedural sound (WebAudio, no assets). Three per-frame loops (engine,
 * skid, scrape) plus one one-shot per GameEvent, all synthesized: detuned saws for the
 * motor, filtered noise for the tyres, shaped tones + a shared short reverb for the cues.
 * Render-side only — nothing here feeds back into the sim, so Math.random is fine.
 */

const KEY = 'bolides-sound';

const MASTER = 0.5;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let fxIn: GainNode | null = null; // one-shot bus: dry + a send into the shared tail
let noiseBuf: AudioBuffer | null = null;
let enabled = true;
let loaded = false;
let rate = 1; // pitch factor for one-shots (slow-mo hook, 1 = real time)
let played = 0; // lifetime one-shots past the enabled gate — handy in a smoke test
const lastAt: Record<string, number> = {};

interface EngineLoop { o1: OscillatorNode; o2: OscillatorNode; o3: OscillatorNode; lp: BiquadFilterNode; g: GainNode }
interface NoiseLoop { src: AudioBufferSourceNode; f1: BiquadFilterNode; f2: BiquadFilterNode; g: GainNode; lfo: OscillatorNode | null; lfoG: GainNode | null }

let eng: EngineLoop | null = null;
let engF = -1, engCut = -1, engG = -1;
let skidL: NoiseLoop | null = null;
let skidF = -1, skidG = -1;
let scrapeL: NoiseLoop | null = null;
let scrapeF = -1, scrapeG = -1;

function readPref(): void {
	if (loaded) return;
	loaded = true;
	try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* no storage */ }
}

function makeTail(c: AudioContext): AudioBuffer {
	const len = Math.floor(c.sampleRate * 0.3);
	const b = c.createBuffer(2, len, c.sampleRate);
	for (let ch = 0; ch < 2; ch++) {
		const d = b.getChannelData(ch);
		for (let i = 0; i < len; i++) {
			const t = 1 - i / len;
			d[i] = (Math.random() * 2 - 1) * t * t * t;
		}
	}
	return b;
}

// Lazy: browsers block audio before a gesture, and a context at import time would cost
// startup on a page the player may never touch.
function ensureCtx(): AudioContext | null {
	if (ctx) return ctx;
	try {
		const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AC) return null;
		ctx = new AC();
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -16;
		comp.ratio.value = 6;
		comp.connect(ctx.destination);
		master = ctx.createGain();
		master.gain.value = enabled ? MASTER : 0;
		master.connect(comp);
		// One cheap convolver so the cues share a room instead of sounding pasted on.
		const verb = ctx.createConvolver();
		verb.buffer = makeTail(ctx);
		const send = ctx.createGain();
		send.gain.value = 0.22;
		send.connect(verb);
		verb.connect(master);
		fxIn = ctx.createGain();
		fxIn.gain.value = 1;
		fxIn.connect(master);
		fxIn.connect(send);
		noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
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
	if (!on) {
		stopLoops();
		if (master) master.gain.value = 0;
		return;
	}
	if (master) master.gain.value = MASTER;
	unlock();
}

/** Call from a user gesture: creates/resumes the AudioContext (iOS requires this). */
export function unlock(): void {
	if (!isEnabled()) return;
	const c = ensureCtx();
	if (c && c.state === 'suspended') c.resume().catch(() => { /* stays silent */ });
}

/** Slow-mo hook: < 1 pitches the one-shots down with the action. */
export function setRate(r: number): void { rate = r; }

export const stats = () => ({
	played,
	enabled: isEnabled(),
	ctx: ctx?.state ?? 'none',
	loops: { engine: !!eng, skid: !!skidL, scrape: !!scrapeL },
});

/* ---------- one-shot plumbing ---------- */

// Also throttles per kind: capture can fire many times a second and stacking them
// reads as a machine gun, not a land grab.
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

function cleanup(src: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
	src.onended = () => {
		try {
			src.disconnect();
			for (const n of nodes) n.disconnect();
		} catch { /* already gone */ }
	};
}

function env(g: GainNode, t: number, peak: number, dur: number): void {
	const atk = Math.min(0.014, dur * 0.3);
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(peak, t + atk);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone(c: AudioContext, type: OscillatorType, f0: number, f1: number, peak: number, dur: number, delay = 0, detune = 0): void {
	const t = c.currentTime + delay;
	const o = c.createOscillator();
	o.type = type;
	o.detune.value = detune;
	o.frequency.setValueAtTime(f0 * rate, t);
	o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * rate), t + dur);
	const g = c.createGain();
	env(g, t, peak, dur);
	o.connect(g); g.connect(fxIn!);
	cleanup(o, g);
	o.start(t);
	o.stop(t + dur + 0.02);
}

function noiseHit(c: AudioContext, type: BiquadFilterType, freq: number, q: number, peak: number, dur: number, delay = 0): void {
	const t = c.currentTime + delay;
	const src = c.createBufferSource();
	src.buffer = noiseBuf;
	const f = c.createBiquadFilter();
	f.type = type;
	f.frequency.value = freq * rate;
	f.Q.value = q;
	const g = c.createGain();
	env(g, t, peak, dur);
	src.connect(f); f.connect(g); g.connect(fxIn!);
	cleanup(src, f, g);
	src.start(t, Math.random(), dur + 0.05);
	src.stop(t + dur + 0.05);
}

function whoosh(c: AudioContext, f0: number, f1: number, q: number, peak: number, dur: number, delay = 0): void {
	const t = c.currentTime + delay;
	const src = c.createBufferSource();
	src.buffer = noiseBuf;
	const f = c.createBiquadFilter();
	f.type = 'bandpass';
	f.Q.value = q;
	f.frequency.setValueAtTime(f0, t);
	f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
	const g = c.createGain();
	env(g, t, peak, dur);
	src.connect(f); f.connect(g); g.connect(fxIn!);
	cleanup(src, f, g);
	src.start(t, Math.random(), dur + 0.05);
	src.stop(t + dur + 0.05);
}

/* ---------- continuous loops ---------- */

function buildEngine(c: AudioContext): EngineLoop {
	const lp = c.createBiquadFilter();
	lp.type = 'lowpass';
	lp.frequency.value = 700;
	lp.Q.value = 3;
	const g = c.createGain();
	g.gain.value = 0.0001;
	lp.connect(g); g.connect(master!);
	// Two saws a few cents apart beat against each other: that wobble is the motor.
	const mk = (type: OscillatorType, f: number, detune: number, level: number) => {
		const o = c.createOscillator();
		o.type = type;
		o.frequency.value = f;
		o.detune.value = detune;
		const vg = c.createGain();
		vg.gain.value = level;
		o.connect(vg); vg.connect(lp);
		o.start();
		return o;
	};
	const o1 = mk('sawtooth', 180, -9, 0.5);
	const o2 = mk('sawtooth', 180, 11, 0.5);
	const o3 = mk('square', 360, 4, 0.3); // upper partial: what a phone speaker actually reproduces
	return { o1, o2, o3, lp, g };
}

function buildNoiseLoop(c: AudioContext, t1: BiquadFilterType, f1v: number, q1: number, t2: BiquadFilterType, f2v: number, q2: number, wobbleHz: number): NoiseLoop {
	const src = c.createBufferSource();
	src.buffer = noiseBuf;
	src.loop = true;
	const f1 = c.createBiquadFilter();
	f1.type = t1; f1.frequency.value = f1v; f1.Q.value = q1;
	const f2 = c.createBiquadFilter();
	f2.type = t2; f2.frequency.value = f2v; f2.Q.value = q2;
	const g = c.createGain();
	g.gain.value = 0.0001;
	src.connect(f1); f1.connect(f2); f2.connect(g); g.connect(master!);
	let lfo: OscillatorNode | null = null;
	let lfoG: GainNode | null = null;
	if (wobbleHz > 0) {
		lfo = c.createOscillator();
		lfo.type = 'sine';
		lfo.frequency.value = wobbleHz;
		lfoG = c.createGain();
		lfoG.gain.value = 260;
		lfo.connect(lfoG); lfoG.connect(f2.frequency);
		lfo.start();
	}
	src.start(0, Math.random());
	return { src, f1, f2, g, lfo, lfoG };
}

/**
 * Motor tone, once per frame. `rpm` 0..1 tracks speed, `load` 0..1 tracks throttle.
 * Params glide instead of being set hard, or the pitch zippers.
 */
export function engine(rpm: number, load: number): void {
	if (!isEnabled()) return;
	const c = ensureCtx();
	if (!c) return;
	const e = eng ?? (eng = buildEngine(c));
	const r = clamp01(rpm);
	const l = clamp01(load);
	const f = 165 + r * 300;
	const cut = 620 + r * 3000 + l * 900;
	const gain = 0.03 + r * 0.045 + l * 0.028;
	const now = c.currentTime;
	if (Math.abs(f - engF) > 0.4) {
		engF = f;
		e.o1.frequency.setTargetAtTime(f, now, 0.05);
		e.o2.frequency.setTargetAtTime(f, now, 0.05);
		e.o3.frequency.setTargetAtTime(f * 2, now, 0.05);
	}
	if (Math.abs(cut - engCut) > 8) {
		engCut = cut;
		e.lp.frequency.setTargetAtTime(cut, now, 0.07);
	}
	if (Math.abs(gain - engG) > 0.002) {
		engG = gain;
		e.g.gain.setTargetAtTime(gain, now, 0.05);
	}
}

/** Tyre squeal while drifting, once per frame. `intensity` 0..1; 0 fades out, never cuts. */
export function skid(intensity: number): void {
	if (!isEnabled()) return;
	const v = clamp01(intensity);
	if (!skidL && v < 0.01) return;
	const c = ensureCtx();
	if (!c) return;
	const s = skidL ?? (skidL = buildNoiseLoop(c, 'highpass', 1200, 0.7, 'bandpass', 2600, 7, 0));
	const f = 2200 + v * 1900;
	const gain = v * v * 0.2;
	const now = c.currentTime;
	if (Math.abs(f - skidF) > 6) { skidF = f; s.f2.frequency.setTargetAtTime(f, now, 0.06); }
	if (Math.abs(gain - skidG) > 0.001) { skidG = gain; s.g.gain.setTargetAtTime(Math.max(0.0001, gain), now, 0.07); }
}

/** Rail grind, once per frame. Kept low and wobbly so it never reads as a drift. */
export function scrape(intensity: number): void {
	if (!isEnabled()) return;
	const v = clamp01(intensity);
	if (!scrapeL && v < 0.01) return;
	const c = ensureCtx();
	if (!c) return;
	const s = scrapeL ?? (scrapeL = buildNoiseLoop(c, 'lowpass', 1100, 0.6, 'bandpass', 460, 1.6, 27));
	const f = 380 + v * 280;
	const gain = v * 0.16;
	const now = c.currentTime;
	if (Math.abs(f - scrapeF) > 4) { scrapeF = f; s.f2.frequency.setTargetAtTime(f, now, 0.05); }
	if (Math.abs(gain - scrapeG) > 0.001) { scrapeG = gain; s.g.gain.setTargetAtTime(Math.max(0.0001, gain), now, 0.06); }
}

function fade(l: NoiseLoop | EngineLoop, srcs: AudioScheduledSourceNode[], nodes: AudioNode[], c: AudioContext): void {
	const t = c.currentTime;
	l.g.gain.cancelScheduledValues(t);
	l.g.gain.setTargetAtTime(0.0001, t, 0.04);
	cleanup(srcs[0], ...srcs.slice(1), ...nodes, l.g);
	for (const s of srcs) s.stop(t + 0.3);
}

/** Stop every loop: race over, tab hidden, or the player muted. Safe to call twice. */
export function stopLoops(): void {
	const c = ctx;
	if (!c) return;
	if (eng) {
		fade(eng, [eng.o1, eng.o2, eng.o3], [eng.lp], c);
		eng = null;
		engF = engCut = engG = -1;
	}
	for (const l of [skidL, scrapeL]) {
		if (!l) continue;
		const srcs: AudioScheduledSourceNode[] = l.lfo ? [l.src, l.lfo] : [l.src];
		const nodes: AudioNode[] = l.lfoG ? [l.f1, l.f2, l.lfoG] : [l.f1, l.f2];
		fade(l, srcs, nodes, c);
	}
	skidL = scrapeL = null;
	skidF = skidG = scrapeF = scrapeG = -1;
}

/* ---------- one-shots ---------- */

/** Land taken: a rising chime. `gain` is the cell count, so a land grab outsings a nibble. */
export function capture(gain: number): void {
	const c = gate('capture', 45);
	if (!c) return;
	const v = clamp01(Math.log2(1 + Math.max(0, gain)) / 10.5);
	const j = 1 + (Math.random() - 0.5) * 0.07; // jitter repeats so a burst doesn't machine-gun
	const base = (392 + v * 130) * j;
	noiseHit(c, 'bandpass', 2600 + v * 1500, 1.4, 0.05 + v * 0.07, 0.05);
	tone(c, 'triangle', base, base * 1.5, 0.10 + v * 0.12, 0.10 + v * 0.10);
	tone(c, 'sine', base * 2, base * 3, 0.05 + v * 0.09, 0.12 + v * 0.14, 0.035);
	if (v > 0.45) tone(c, 'triangle', base * 3, base * 4, 0.05 + v * 0.06, 0.22, 0.09);
	if (v > 0.75) tone(c, 'square', base * 0.75, base * 1.5, 0.05, 0.3, 0.16, -6);
}

/** You cut someone down: a punchy crunch then a bright confirm. */
export function kill(): void {
	const c = gate('kill', 90);
	if (!c) return;
	noiseHit(c, 'bandpass', 1700, 0.9, 0.3, 0.07);
	tone(c, 'square', 300, 210, 0.16, 0.1, 0, -8);
	tone(c, 'triangle', 660, 990, 0.18, 0.16, 0.07);
	tone(c, 'sine', 1320, 1320, 0.08, 0.14, 0.1);
}

/** You went down: a dull crash falling away. */
export function death(): void {
	const c = gate('death', 200);
	if (!c) return;
	noiseHit(c, 'lowpass', 900, 0.7, 0.34, 0.28);
	tone(c, 'sawtooth', 420, 205, 0.2, 0.45);
	tone(c, 'square', 315, 210, 0.1, 0.5, 0.04, 9);
	whoosh(c, 1500, 320, 1.2, 0.12, 0.5, 0.03);
}

/** Your own loop got cut: a sour pair sliding down. */
export function snap(): void {
	const c = gate('snap', 200);
	if (!c) return;
	tone(c, 'triangle', 520, 262, 0.2, 0.34);
	tone(c, 'triangle', 494, 249, 0.17, 0.34, 0.02); // minor second against the first: the "wrong" bite
	tone(c, 'square', 260, 210, 0.07, 0.28, 0.05, -12);
	noiseHit(c, 'bandpass', 1400, 1.1, 0.09, 0.06);
}

/** Back on the track: a short swell up. */
export function respawn(): void {
	const c = gate('respawn', 200);
	if (!c) return;
	whoosh(c, 400, 2400, 1.1, 0.14, 0.26);
	tone(c, 'triangle', 330, 660, 0.16, 0.3, 0.04);
	tone(c, 'sine', 660, 990, 0.09, 0.22, 0.14);
}

/** Lobby auto-start: low blips at 3/2/1, a higher longer one at 0. */
export function countdown(n: number): void {
	const c = gate('count', 120);
	if (!c) return;
	if (n > 0) {
		noiseHit(c, 'bandpass', 1300, 2, 0.06, 0.03);
		tone(c, 'triangle', 440, 440, 0.22, 0.17);
		tone(c, 'sine', 880, 880, 0.07, 0.12);
		return;
	}
	noiseHit(c, 'highpass', 3000, 0.8, 0.09, 0.05);
	tone(c, 'triangle', 880, 880, 0.26, 0.5);
	tone(c, 'sine', 1320, 1320, 0.11, 0.42, 0.01);
}

/** Drift boost released: a filtered rush plus a pitch sweep up. */
export function boost(): void {
	const c = gate('boost', 220);
	if (!c) return;
	whoosh(c, 500, 3200, 1.4, 0.18, 0.3);
	tone(c, 'sawtooth', 220, 880, 0.14, 0.28);
	tone(c, 'square', 440, 1320, 0.07, 0.24, 0.03, 7);
}

/** Race won: a major arpeggio. */
export function win(): void {
	const c = gate('end', 800);
	if (!c) return;
	[523, 659, 784, 1047].forEach((f, i) => {
		tone(c, 'triangle', f, f, 0.24, i === 3 ? 0.5 : 0.24, i * 0.1);
		tone(c, 'sine', f * 2, f * 2, 0.06, 0.2, i * 0.1);
	});
	noiseHit(c, 'highpass', 4000, 0.7, 0.07, 0.12, 0.3);
}

/** Race lost: a minor fall, kept gentle. */
export function lose(): void {
	const c = gate('end', 800);
	if (!c) return;
	[523, 440, 349].forEach((f, i) => tone(c, 'triangle', f, f, 0.19, i === 2 ? 0.45 : 0.22, i * 0.13));
	tone(c, 'sine', 262, 233, 0.09, 0.5, 0.26);
}

/** Menu click. */
export function ui(): void {
	const c = gate('ui', 40);
	if (!c) return;
	noiseHit(c, 'highpass', 3200, 0.8, 0.07, 0.02);
	tone(c, 'triangle', 900, 700, 0.1, 0.05);
}
