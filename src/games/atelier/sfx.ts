// Atelier sounds, all synthesized: a wooden tick for the generators, a pluck that climbs
// with the merged level, a chime for a delivery, a small arpeggio for a restoration.
// Lazy context: browsers block audio before a gesture.

const KEY = 'atelier-sound';
const MASTER = 0.35;
// Pentatonic steps, so the merge pluck stays musical however high the chain goes.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = true;
let loaded = false;

function readPref(): void {
	if (loaded) return;
	loaded = true;
	try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* no storage */ }
}

function ensure(): AudioContext | null {
	readPref();
	if (!enabled) return null;
	if (ctx) return ctx;
	try {
		const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AC) return null;
		ctx = new AC();
		master = ctx.createGain();
		master.gain.value = MASTER;
		master.connect(ctx.destination);
		noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
		const d = noise.getChannelData(0);
		for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
	} catch {
		ctx = null;
	}
	if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => { /* stays silent */ });
	return ctx;
}

export function isEnabled(): boolean {
	readPref();
	return enabled;
}

export function setEnabled(on: boolean): void {
	readPref();
	enabled = on;
	try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* no storage */ }
	if (master) master.gain.value = on ? MASTER : 0;
}

function tone(c: AudioContext, type: OscillatorType, freq: number, peak: number, dur: number, delay = 0): void {
	const t = c.currentTime + delay;
	const o = c.createOscillator();
	o.type = type;
	o.frequency.setValueAtTime(freq, t);
	const g = c.createGain();
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	o.connect(g);
	g.connect(master!);
	o.start(t);
	o.stop(t + dur + 0.02);
	o.onended = () => { o.disconnect(); g.disconnect(); };
}

function tick(c: AudioContext, freq: number, peak: number, dur: number): void {
	const t = c.currentTime;
	const s = c.createBufferSource();
	s.buffer = noise;
	const f = c.createBiquadFilter();
	f.type = 'bandpass';
	f.frequency.value = freq;
	f.Q.value = 6;
	const g = c.createGain();
	g.gain.setValueAtTime(peak, t);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	s.connect(f); f.connect(g); g.connect(master!);
	s.start(t);
	s.stop(t + dur + 0.02);
	s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
}

const hz = (semi: number): number => 392 * 2 ** (semi / 12);

export function produce(): void {
	const c = ensure();
	if (!c) return;
	tick(c, 1900, 0.5, 0.06);
	tone(c, 'sine', 660, 0.08, 0.09);
}

export function merge(level: number): void {
	const c = ensure();
	if (!c) return;
	const f = hz(PENTA[Math.min(PENTA.length - 1, level - 1)]);
	tone(c, 'triangle', f, 0.32, 0.35);
	tone(c, 'sine', f * 2, 0.08, 0.25, 0.03);
}

export function deliver(): void {
	const c = ensure();
	if (!c) return;
	tone(c, 'sine', hz(7), 0.25, 0.4);
	tone(c, 'sine', hz(12), 0.25, 0.6, 0.12);
}

export function restore(): void {
	const c = ensure();
	if (!c) return;
	[0, 4, 7, 12, 16].forEach((s, i) => tone(c, 'triangle', hz(s), 0.2, 0.7, i * 0.11));
}

export function refuse(): void {
	const c = ensure();
	if (!c) return;
	tone(c, 'sine', 180, 0.18, 0.18);
}
