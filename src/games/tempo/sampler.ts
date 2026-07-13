/* =====================================================
   TEMPO — real-instrument sampler.
   Lazy-loads vendored FluidR3_GM per-note mp3s (public/assets/jeux/tempo/samples/,
   see scripts/fetch-tempo-samples.mjs) and plays them with nearest-sample repitch.
   Each voice flips ready independently; until then callers keep their oscillator
   fallback, so SSR / tests / offline never break.
   ===================================================== */

export type SamplerVoice = 'piano' | 'flute' | 'reed' | 'gtr' | 'bassGtr' | 'brass' | 'strings';

const BASE = '/assets/jeux/tempo/samples';
const DECODE_RATE = 44100; // mono 44.1 kHz: keep the highs (24 kHz gutted the piano's air → synthetic)
const MAX_SECONDS = 4; // truncate long piano tails
// Tiered load: the exposed voices first, colors later.
const TIERS: SamplerVoice[][] = [['piano'], ['gtr', 'bassGtr', 'brass', 'strings'], ['flute', 'reed']];

// Per-voice level trim (× the caller's peak — the synth mix balance is the baseline)
// and release fade after the note's duration. Tuned by ear in listen mode.
// The mp3s are normalized quietly (~-24 dBFS peak) — the trims are big on purpose
// so sampled voices match the loud oscillator fallbacks they replace. Each value
// is MEASURED: offline-render old synth vs new sample, match RMS (not guessed —
// a ×4 guess left the flute melody ~10 dB too quiet to hear under the piano).
const TRIM: Record<SamplerVoice, number> = { piano: 16, flute: 12, reed: 3.7, gtr: 8, bassGtr: 2.4, brass: 6, strings: 9 };
// Long piano release lets the sample's natural decay ring out (not an abrupt, plucky cut).
const RELEASE: Record<SamplerVoice, number> = { piano: 0.7, flute: 0.15, reed: 0.15, gtr: 0.12, bassGtr: 0.12, brass: 0.15, strings: 0.3 };
const ATTACK: Record<SamplerVoice, number> = { piano: 0.005, flute: 0.01, reed: 0.01, gtr: 0.005, bassGtr: 0.005, brass: 0.01, strings: 0.25 };

// MIDI.js flat spelling used by the vendored filenames (C4 = 60 → "C4.mp3").
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const noteName = (m: number): string => FLAT[m % 12] + (Math.floor(m / 12) - 1);

interface VoiceBank {
	midis: number[]; // sorted
	bufs: AudioBuffer[]; // aligned with midis
}

let loadStarted = false;
const banks = new Map<SamplerVoice, VoiceBank>();
const failed = new Set<SamplerVoice>();
const listeners = new Set<() => void>();
let decodeCtx: OfflineAudioContext | null = null;

const notify = (): void => listeners.forEach((cb) => cb());

const decodeMono = async (data: ArrayBuffer): Promise<AudioBuffer> => {
	decodeCtx ??= new OfflineAudioContext(1, 1, DECODE_RATE);
	const raw = await decodeCtx.decodeAudioData(data);
	const len = Math.min(raw.length, MAX_SECONDS * raw.sampleRate);
	const mono = decodeCtx.createBuffer(1, len, raw.sampleRate);
	const out = mono.getChannelData(0);
	for (let ch = 0; ch < raw.numberOfChannels; ch++) {
		const src = raw.getChannelData(ch);
		for (let i = 0; i < len; i++) out[i] += src[i] / raw.numberOfChannels;
	}
	return mono;
};

const loadVoice = async (voice: SamplerVoice, midis: number[]): Promise<void> => {
	try {
		const bufs: AudioBuffer[] = new Array(midis.length);
		// Concurrency 4 within the voice
		const idx = midis.map((_, i) => i);
		await Promise.all(Array.from({ length: 4 }, async () => {
			for (let i = idx.shift(); i != null; i = idx.shift()) {
				const res = await fetch(`${BASE}/${voice}/${noteName(midis[i])}.mp3`);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				bufs[i] = await decodeMono(await res.arrayBuffer());
			}
		}));
		banks.set(voice, { midis, bufs }); // atomic: the voice flips ready with ALL notes
	} catch {
		failed.add(voice); // stays on the synth fallback for this session
	}
	notify();
};

/** Kick the lazy load (idempotent). Call after the first user gesture. */
export function startSamplerLoad(): void {
	if (loadStarted || typeof window === 'undefined') return;
	loadStarted = true;
	notify(); // loading just became true — let the UI hint show
	void (async () => {
		let manifest: Record<string, number[]>;
		try {
			const res = await fetch(`${BASE}/manifest.json`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			manifest = await res.json();
		} catch {
			TIERS.flat().forEach((v) => failed.add(v));
			notify();
			return;
		}
		for (const tier of TIERS) {
			await Promise.all(tier.filter((v) => manifest[v]).map((v) => loadVoice(v, manifest[v])));
		}
	})();
}

export const samplerReady = (voice: SamplerVoice): boolean => banks.has(voice);

/** Load kicked but some voices still pending (neither ready nor failed). */
export const samplerLoading = (): boolean => loadStarted && TIERS.flat().some((v) => !banks.has(v) && !failed.has(v));

export function onSamplerChange(cb: () => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

/**
 * Schedule a sampled note. Returns false when the voice isn't ready yet —
 * the caller then falls through to its oscillator version.
 * One BufferSource + one Gain per note (cheaper than the synth stacks).
 */
export function playSample(ctx: AudioContext, voice: SamplerVoice, midi: number, when: number, dur: number, peak: number, out: AudioNode): boolean {
	const bank = banks.get(voice);
	if (!bank) return false;
	// Nearest sample (lists are ≤14 entries: linear scan)
	let best = 0;
	for (let i = 1; i < bank.midis.length; i++) if (Math.abs(bank.midis[i] - midi) < Math.abs(bank.midis[best] - midi)) best = i;
	const src = ctx.createBufferSource();
	src.buffer = bank.bufs[best];
	src.playbackRate.value = Math.pow(2, (midi - bank.midis[best]) / 12);
	const level = Math.max(0.0002, peak * TRIM[voice]);
	const atk = ATTACK[voice];
	const rel = RELEASE[voice];
	const g = ctx.createGain();
	g.gain.setValueAtTime(atk > 0.02 ? 0.0001 : level, when);
	if (atk > 0.02) g.gain.exponentialRampToValueAtTime(level, when + atk); // slow swells (strings)
	g.gain.setValueAtTime(level, when + Math.max(atk, dur));
	g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(atk, dur) + rel);
	src.connect(g);
	g.connect(out);
	src.start(when);
	src.stop(when + Math.max(atk, dur) + rel + 0.05);
	return true;
}
