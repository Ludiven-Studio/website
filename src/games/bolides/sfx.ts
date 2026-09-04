/**
 * BOLIDES — WebAudio. Three per-frame loops (engine, skid, scrape) plus one one-shot per
 * GameEvent. The motor is three recorded loops crossfaded by revs; everything else is
 * synthesized: filtered noise for the tyres, shaped tones + a shared short reverb for the cues.
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

interface EngineLoop {
	srcs: AudioBufferSourceNode[]; tg: GainNode[];
	hp: BiquadFilterNode; pk: BiquadFilterNode; hs: BiquadFilterNode; lp: BiquadFilterNode; g: GainNode;
}
interface NoiseLoop { src: AudioBufferSourceNode; f1: BiquadFilterNode; f2: BiquadFilterNode; g: GainNode; lfo: OscillatorNode | null; lfoG: GainNode | null }

let eng: EngineLoop | null = null;
let engBufs: AudioBuffer[] | null = null;
let engLoading = false;
let engF = -1, engCut = -1, engG = -1, engHi = -1;
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
	engSamples: engBufs ? engBufs.map((b) => Math.round(b.duration * 1000)) : null,
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

// Three loops off ONE car and ONE mic, so crossfading them never changes instrument: USC Optical
// Sound Effects Library, archive.org item SSE_Library_VEHICLES, CC0 1.0. Cut to a whole number of
// firing cycles with a wrap-around crossfade by scripts/bolides-eng.mjs; f0 below is what that
// script measured by autocorrelation. WAV on purpose — iOS Safari decodes no Vorbis, and MP3/AAC
// keep their encoder padding, which is a gap at every wrap.
const ENG_TIERS = [
	{ url: '/assets/jeux/bolides/engine-low.wav', f0: 68.8 },
	{ url: '/assets/jeux/bolides/engine-mid.wav', f0: 93.4 },
	{ url: '/assets/jeux/bolides/engine-high.wav', f0: 120.5 },
];
// Firing rate to pitch the loops to. `rpm` is speed/maxSpeed and speed never leaves
// [minSpeed, maxSpeed], so the reachable range is 0.25..1 and this is solved for that: rpm 0.25
// plays the low loop untouched, rpm 1 stretches the high one by 15%. No tier is ever pitched far
// enough to sound like a different car.
const ENG_F0 = 46, ENG_F1 = 92;
// How far a loop is stretched, in octaves, before it is silent. The tiers sit 0.44 and 0.37
// octaves apart, so 0.45 keeps two of them audible at a time and never all three.
const ENG_SPREAD = 0.45;

function loadEngine(c: AudioContext): void {
	if (engLoading) return;
	engLoading = true;
	Promise.all(ENG_TIERS.map((t) => fetch(t.url).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b))))
		.then((bufs) => { engBufs = bufs; })
		.catch(() => { engLoading = false; }); // let a later frame retry; the motor stays silent
}

function buildEngine(c: AudioContext, bufs: AudioBuffer[]): EngineLoop {
	const g = c.createGain();
	g.gain.value = 0.0001;
	// Raw, 83% of this recording's energy sits under 200 Hz — a phone speaker moves none of it,
	// which is how a real car ends up quieter than a synth. Cut what cannot be played and buy it
	// back at 1.1 kHz: 12% of the energy lands in the 300-3000 Hz band before, 61% after, while
	// the 3-15 Hz roughness the old motor was flagged for drops from 0.37 raw to 0.08.
	const hp = c.createBiquadFilter();
	hp.type = 'highpass';
	hp.frequency.value = 220;
	hp.Q.value = 0.7;
	const pk = c.createBiquadFilter();
	pk.type = 'peaking';
	pk.frequency.value = 1100;
	pk.Q.value = 0.9;
	pk.gain.value = 8;
	// Then a throttle-driven shelf and lowpass, kept deliberately closed: opening them added a
	// third more energy over 2 kHz and nothing in the 300-3000 Hz band a phone can play. What
	// separates this from the old "ovni" is spectral flatness, 25x the synth's, not brightness.
	const hs = c.createBiquadFilter();
	hs.type = 'highshelf';
	hs.frequency.value = 1800;
	hs.gain.value = 0;
	const lp = c.createBiquadFilter();
	lp.type = 'lowpass';
	lp.frequency.value = 1200;
	lp.Q.value = 0.7;
	hp.connect(pk); pk.connect(hs); hs.connect(lp); lp.connect(g); g.connect(master!);

	const srcs: AudioBufferSourceNode[] = [];
	const tg: GainNode[] = [];
	for (const buf of bufs) {
		const s = c.createBufferSource();
		s.buffer = buf;
		s.loop = true;
		const v = c.createGain();
		v.gain.value = 0.0001;
		s.connect(v); v.connect(hp);
		// Random phase: the tiers are the same car seconds apart, so starting them aligned would
		// comb-filter the overlap into a flanger.
		s.start(0, Math.random() * buf.duration);
		srcs.push(s); tg.push(v);
	}
	return { srcs, tg, hp, pk, hs, lp, g };
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
	if (!engBufs) { loadEngine(c); return; } // silent until the loops land, never a synth stand-in
	const e = eng ?? (eng = buildEngine(c, engBufs));
	const r = clamp01(rpm);
	const l = clamp01(load);
	const f = ENG_F0 + r * ENG_F1;
	const cut = 900 + r * 1500 + l * 1000;
	const gain = 0.17 + r * 0.19 + l * 0.085; // trimmed to the old motor's level, within 1 dB
	const hi = l * 2.5 - 1; // dB: closing the throttle dulls it, opening it bites
	const now = c.currentTime;
	if (Math.abs(f - engF) > 0.2) {
		engF = f;
		// Equal power, so the sum keeps its level as the mix walks from one loop to the next.
		let sum = 0;
		const w = ENG_TIERS.map((t) => {
			const v = Math.max(0, 1 - Math.abs(Math.log2(f / t.f0)) / ENG_SPREAD);
			sum += v;
			return v;
		});
		for (let i = 0; i < e.srcs.length; i++) {
			e.srcs[i].playbackRate.setTargetAtTime(f / ENG_TIERS[i].f0, now, 0.05);
			e.tg[i].gain.setTargetAtTime(Math.max(0.0001, Math.sqrt(w[i] / (sum || 1))), now, 0.05);
		}
	}
	if (Math.abs(cut - engCut) > 8) {
		engCut = cut;
		e.lp.frequency.setTargetAtTime(cut, now, 0.07);
	}
	if (Math.abs(gain - engG) > 0.002) {
		engG = gain;
		e.g.gain.setTargetAtTime(gain, now, 0.05);
	}
	if (Math.abs(hi - engHi) > 0.1) {
		engHi = hi;
		e.hs.gain.setTargetAtTime(hi, now, 0.08);
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
		fade(eng, eng.srcs, [eng.hp, eng.pk, eng.hs, eng.lp, ...eng.tg], c);
		eng = null;
		engF = engCut = engG = engHi = -1;
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

/** Pickup grabbed, `kind` as in engine KIND: two rising blips, the arcade "got it" and nothing
 *  heavier — it fires every few seconds and must not compete with a capture. Each kind gets its
 *  own interval and tail, so the ear tells the six apart without looking at the pastille. */
export function item(kind = 0): void {
	const c = gate('item', 90);
	if (!c) return;
	if (kind === 3) {
		// The launch, not the landing — four shells leaving at once is what earns the body hit here.
		// The splats answer for themselves a beat later, through `splat`.
		tone(c, 'square', 330, 110, 0.10, 0.20);
		noiseHit(c, 'lowpass', 700, 1.2, 0.20, 0.30, 0.02);
		noiseHit(c, 'bandpass', 1800, 3, 0.07, 0.16, 0.10);
		return;
	}
	if (kind === 4) {
		// The same rush as a drift boost, quieter: it is the pickup blip, not the payoff.
		whoosh(c, 600, 3000, 1.4, 0.11, 0.24);
		tone(c, 'sawtooth', 330, 990, 0.10, 0.22);
		return;
	}
	if (kind === 5) {
		// Two voices spreading apart, because that is what the trail does.
		tone(c, 'triangle', 660, 494, 0.13, 0.22);
		tone(c, 'triangle', 660, 880, 0.13, 0.22);
		noiseHit(c, 'bandpass', 1400, 4, 0.05, 0.14, 0.08);
		return;
	}
	if (kind === 2) {
		// Falling, not rising: this one arms the ground behind you, it does not lift the car.
		tone(c, 'triangle', 587, 587, 0.16, 0.12);
		tone(c, 'triangle', 392, 392, 0.16, 0.24, 0.07);
		noiseHit(c, 'lowpass', 380, 3, 0.10, 0.26, 0.07);
		return;
	}
	if (kind === 1) {
		tone(c, 'triangle', 523, 523, 0.16, 0.12);
		tone(c, 'triangle', 784, 784, 0.14, 0.20, 0.07);
		noiseHit(c, 'bandpass', 2600, 6, 0.05, 0.10, 0.07);
		return;
	}
	tone(c, 'triangle', 784, 784, 0.16, 0.10);
	tone(c, 'triangle', 1175, 1175, 0.14, 0.16, 0.07);
	tone(c, 'sine', 2349, 2349, 0.05, 0.12, 0.07);
}

/** A rocket shell hitting the ground. Short and wet — four land 0.11 s apart, so anything with a
 *  tail would smear into one long noise instead of four beats. */
export function splat(): void {
	const c = gate('splat', 60);
	if (!c) return;
	noiseHit(c, 'lowpass', 900, 1, 0.16, 0.13);
	tone(c, 'sine', 240, 90, 0.12, 0.14);
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
