import { useState, useEffect, useRef, useCallback } from 'react';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, dailyDifficultyIndex, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import { LANES, SPEEDS, ENDLESS_OPTS, buildEndlessChart, judgeTiming, comboMult, rankOf, type Chart, type ChordBar, type Grade } from './engine';

/* =====================================================
   TEMPO — piano-tiles rhythm game (prototype).
   Public-domain tunes (or an endless generated melody) fall as tiles; tap the
   lane (pointer or D/F/J/K) as a tile hits the line — each hit plays its note.
   Long notes are HOLD tiles: keep pressing for a growing bonus. Endless mode
   ends on a miss (score chase). Audio-clock synced.
   ===================================================== */

type Status = 'ready' | 'running' | 'done';
type TileState = 'pending' | 'holding' | 'done' | 'broken' | Grade;
const KEYS = ['s', 'd', 'f', 'j', 'k', 'l']; // 6 columns, low pitch (left) → high (right)
const LANE_HUE = [205, 245, 285, 325, 20, 50];
const LEAD = 1.9;
const HIT_FRAC = 0.8;
const HOLD_RATE = 45; // bonus points per second held (× combo)
const ENERGY_MAX = 100;
const MISS_COST = 20; // energy lost on a miss (endless)
const HOLD_BREAK_COST = 10;
const bestKey = (s: number): string => `ludiven-tempo-best-${s}`;
const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
// Bass-guitar riffs on an 8th-note grid (e = eighth 0..7 in the bar), seed-picked
// per run: r root, 5 fifth, o octave, w whole-tone walk into the next bar's root.
const BASS_RIFFS: { e: number; t: 'r' | '5' | 'o' | 'w'; a?: boolean }[][] = [
	[{ e: 0, t: 'r', a: true }, { e: 3, t: 'r' }, { e: 4, t: '5' }, { e: 6, t: 'r' }, { e: 7, t: 'w' }], // pop rock
	[{ e: 0, t: 'r', a: true }, { e: 2, t: 'r' }, { e: 4, t: '5', a: true }, { e: 6, t: 'r' }, { e: 7, t: 'o' }], // driving
	[{ e: 0, t: 'r', a: true }, { e: 3, t: '5' }, { e: 5, t: 'r' }, { e: 7, t: 'w' }], // syncopated
];
// Guitar arpeggio pingpong over [root, 3rd, 5th, 7th, 9th] — up the bar, then down.
const GTR_PING = [0, 1, 2, 3, 4, 3, 2, 1];

interface DailyState {
	best: number;
}
interface Particle {
	x: number;
	y: number;
	vy: number;
	life: number;
	maxLife: number;
	color: string;
	text?: string;
	size: number;
}

export default function TempoGame({ gameId }: { gameId: string }) {
	const [status, setStatus] = useState<Status>('ready');
	const [auto, setAuto] = useState(false); // listen mode: the chart plays itself (music QA)
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [speedIdx, setSpeedIdx] = useState(1);
	const [metro, setMetro] = useState(true); // backing music (drums + bass) on by default
	const [hud, setHud] = useState({ score: 0, combo: 0, mult: 1 });
	const [result, setResult] = useState<{ score: number; rank: string; tiles: number } | null>(null);
	const [best, setBest] = useState<number | null>(null);
	const [submitScore, setSubmitScore] = useState<number | undefined>(undefined);

	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const dimRef = useRef({ w: 460, h: 640 });
	const chartRef = useRef<Chart | null>(null);
	const stateArrRef = useRef<TileState[]>([]);
	const scoreRef = useRef(0);
	const comboRef = useRef(0);
	const maxComboRef = useRef(0);
	const accSumRef = useRef(0);
	const accCountRef = useRef(0);
	const laneFlashRef = useRef<number[]>(Array.from({ length: LANES }, () => -9));
	const laneKeyRef = useRef<boolean[]>(Array.from({ length: LANES }, () => false));
	const pointerLaneRef = useRef<Map<number, number>>(new Map());
	const partsRef = useRef<Particle[]>([]);
	const energyRef = useRef(ENERGY_MAX);
	const animRef = useRef(0);
	const rafRef = useRef(0);
	const runningRef = useRef(false);
	const statusRef = useRef<Status>('ready');
	const autoRef = useRef(false);

	const ctxRef = useRef<AudioContext | null>(null);
	const masterRef = useRef<GainNode | null>(null);
	const runGainRef = useRef<GainNode | null>(null); // per-run bus so restarts don't stack scheduled ticks
	const busesRef = useRef<Record<string, BiquadFilterNode> | null>(null); // persistent per-instrument filters — one biquad per instrument, NOT per note (per-note filters caused audio-thread churn = crackle)
	const audioStartRef = useRef(0);
	const metroRef = useRef(true);
	const backingIdxRef = useRef(0); // next beat to schedule (lookahead groove)
	const melodyIdxRef = useRef(0); // next tile to voice with the auto lead (flute)
	const noiseRef = useRef<AudioBuffer | null>(null); // shared white-noise buffer (hi-hat)

	const dailyRef = useRef(false);
	const seedRef = useRef(0);
	const speedRef = useRef(1);
	const diffRef = useRef(1); // difficulty tier index (SPEEDS)
	const dailyBestRef = useRef<number | null>(null);

	const setStat = (s: Status): void => {
		statusRef.current = s;
		setStatus(s);
	};

	/* ---------- Audio ---------- */
	const ensureAudio = (): AudioContext | null => {
		if (!ctxRef.current) {
			const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!Ctor) return null;
			const ctx = new Ctor();
			const master = ctx.createGain();
			master.gain.value = 0.55; // headroom: the 9th-chord ensemble is dense — avoid clipping (crackle)
			// Bus compressor: keeps the full ensemble (piano voicings + strings + groove) clean.
			const comp = ctx.createDynamicsCompressor();
			comp.threshold.value = -16;
			comp.knee.value = 30;
			comp.ratio.value = 4.5;
			comp.attack.value = 0.004;
			comp.release.value = 0.2;
			master.connect(comp);
			comp.connect(ctx.destination);
			// White-noise buffer reused by the hi-hat.
			const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
			const nd = nb.getChannelData(0);
			for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
			noiseRef.current = nb;
			// Per-instrument filter buses, created ONCE. Notes plug their envelope
			// gain into these instead of allocating a BiquadFilter each — cuts
			// ~15 node allocations/sec (the source of the crackle). Rewired onto
			// the fresh run bus at each start.
			const mkBus = (type: BiquadFilterType, freq: number, q: number): BiquadFilterNode => {
				const f = ctx.createBiquadFilter();
				f.type = type;
				f.frequency.value = freq;
				f.Q.value = q;
				return f;
			};
			busesRef.current = {
				piano: mkBus('lowpass', 2600, 0.5),
				gtr: mkBus('lowpass', 1800, 0.7),
				bassGtr: mkBus('lowpass', 1300, 0.8),
				snare: mkBus('bandpass', 1900, 0.6),
				strings: mkBus('lowpass', 1500, 0.5),
				reed: mkBus('lowpass', 2000, 0.8),
				hat: mkBus('highpass', 7000, 1),
			};
			ctxRef.current = ctx;
			masterRef.current = master;
		}
		if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
		return ctxRef.current;
	};
	// Notes route through their instrument's shared filter bus (see busesRef).
	const busOut = (name: string): AudioNode => busesRef.current?.[name] ?? runGainRef.current ?? masterRef.current!;
	// Soft felt-piano tone: fewer/quieter harmonics + a lowpass, gentle attack.
	// `at` schedules ahead (listen mode) and routes through the run bus so Stop
	// silences it. `vol` scales the peak (support voicing notes play quieter).
	const playPiano = (midi: number, sustain = 0.5, at?: number, vol = 1): void => {
		const ctx = ensureAudio();
		if (!ctx) return;
		const when = at ?? ctx.currentTime;
		const freq = midiToFreq(midi);
		const g = ctx.createGain();
		g.connect(busOut('piano'));
		const peak = 0.17 * vol;
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(peak, when + 0.009);
		g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.35), when + Math.min(0.25, sustain));
		g.gain.exponentialRampToValueAtTime(0.0001, when + sustain);
		for (const [mult, amp] of [[1, 1], [2, 0.22], [3, 0.07]]) {
			const o = ctx.createOscillator();
			o.type = 'triangle';
			o.frequency.setValueAtTime(freq * mult, when);
			const hg = ctx.createGain();
			hg.gain.value = amp;
			o.connect(hg);
			hg.connect(g);
			o.start(when);
			o.stop(when + sustain + 0.05);
		}
	};
	// Piano VOICING: the melody note lands with 1-2 soft chord tones below it —
	// plaqué (dyad) on short tiles, rolled upward on holds — for a fuller sound
	// and a smoother melodic line.
	const chordBelow = (midi: number, time: number, n: number): number[] => {
		const chart = chartRef.current;
		if (!chart) return [];
		const bt = chart.beatTimes;
		let lo = 0;
		let hi = bt.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (bt[mid] <= time) lo = mid;
			else hi = mid - 1;
		}
		const c = chart.chords[Math.min(Math.floor(lo / 4), chart.chords.length - 1)];
		const out = new Set<number>();
		for (const semi of [c.root, c.root + c.third, c.root + 7, c.root + c.seventh]) {
			let m = chart.key + 12 + semi;
			while (m < midi - 12) m += 12;
			while (m >= midi - 2) m -= 12; // strictly below the melody, ≥ a tone apart
			if (m > midi - 15 && m >= 40) out.add(m);
		}
		return [...out].sort((a, b) => b - a).slice(0, n);
	};
	const playPianoVoiced = (midi: number, sustain: number, tileTime: number, at?: number, hold = false): void => {
		const ctx = ensureAudio();
		if (!ctx) return;
		const base = at ?? ctx.currentTime;
		playPiano(midi, sustain, at);
		const supports = chordBelow(midi, tileTime, hold ? 2 : 1);
		// Holds roll low→high into the melody note feel; short tiles play a dyad.
		supports.forEach((m, k) => playPiano(m, Math.min(sustain, 0.6), base + (hold ? 0.055 * (k + 1) : 0), 0.4));
	};
	// A fumbled note: tapped too early / too late. A dull, sour clash (target pitch +
	// a clashing semitone, sagging downward, low-passed) — clearly "wrong" but not harsh.
	const playWrong = (midi: number): void => {
		const ctx = ensureAudio();
		if (!ctx) return;
		const when = ctx.currentTime;
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 1600;
		lp.Q.value = 0.7;
		const g = ctx.createGain();
		g.connect(lp);
		lp.connect(masterRef.current!);
		const peak = 0.15;
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(peak, when + 0.004);
		g.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
		for (const [semi, amp] of [[0, 1], [1, 0.8]]) {
			const o = ctx.createOscillator();
			o.type = 'sawtooth';
			const f = midiToFreq(midi + semi);
			o.frequency.setValueAtTime(f, when);
			o.frequency.exponentialRampToValueAtTime(f * 0.985, when + 0.28); // sour sag
			const og = ctx.createGain();
			og.gain.value = amp;
			o.connect(og);
			og.connect(g);
			o.start(when);
			o.stop(when + 0.32);
		}
	};
	// Backing accompaniment: a kick drum + a bass note per beat gives the tempo.
	const kick = (when: number, accent: boolean): void => {
		const ctx = ctxRef.current;
		if (!ctx) return;
		const g = ctx.createGain();
		g.connect(runGainRef.current ?? masterRef.current!);
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(accent ? 0.24 : 0.15, when + 0.004); // micro-attack: no click
		g.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
		const o = ctx.createOscillator();
		o.type = 'sine';
		o.frequency.setValueAtTime(130, when);
		o.frequency.exponentialRampToValueAtTime(46, when + 0.12);
		o.connect(g);
		o.start(when);
		o.stop(when + 0.16);
	};
	const bass = (when: number, midi: number, accent: boolean): void => {
		const ctx = ctxRef.current;
		if (!ctx) return;
		const g = ctx.createGain();
		g.connect(runGainRef.current ?? masterRef.current!);
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(accent ? 0.13 : 0.08, when + 0.02);
		g.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
		const o = ctx.createOscillator();
		o.type = 'triangle';
		o.frequency.value = midiToFreq(midi);
		o.connect(g);
		o.start(when);
		o.stop(when + 0.34);
	};
	// Bass guitar: punchy plucked low note (triangle + saw bite, low-passed,
	// quick decay). Rides its own riff on the 8th-note grid for character.
	const bassGtr = (when: number, midi: number, accent: boolean): void => {
		const ctx = ctxRef.current;
		if (!ctx) return;
		const g = ctx.createGain();
		g.connect(busOut('bassGtr'));
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(accent ? 0.2 : 0.15, when + 0.008);
		g.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
		for (const [mult, amp, type] of [[1, 1, 'triangle'], [1, 0.35, 'sawtooth'], [2, 0.28, 'triangle']] as [number, number, OscillatorType][]) {
			const o = ctx.createOscillator();
			o.type = type;
			o.frequency.value = midiToFreq(midi) * mult;
			const og = ctx.createGain();
			og.gain.value = amp;
			o.connect(og);
			og.connect(g);
			o.start(when);
			o.stop(when + 0.3);
		}
	};
	// Synth bed laying the chords down low (root + fifth + octave + third above,
	// low-pass filtered). FAST attack + legato overlap: it fills the bar from
	// beat 1, with a slow filter sweep so the held chord breathes instead of
	// feeling like one repetitive swell.
	const pad = (when: number, dur: number, root: number, third: number): void => {
		const ctx = ctxRef.current;
		if (!ctx) return;
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.setValueAtTime(650, when);
		lp.frequency.linearRampToValueAtTime(1050, when + dur * 0.5);
		lp.frequency.linearRampToValueAtTime(700, when + dur);
		lp.Q.value = 0.6;
		const g = ctx.createGain();
		g.connect(lp);
		lp.connect(runGainRef.current ?? masterRef.current!);
		const attack = 0.06;
		const rel = 0.3;
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(0.1, when + attack);
		g.gain.setValueAtTime(0.1, when + Math.max(attack, dur - rel));
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
		for (const [semi, amp] of [[0, 1], [7, 0.5], [12, 0.3], [12 + third, 0.28]]) {
			const o = ctx.createOscillator();
			o.type = 'sawtooth';
			o.frequency.value = midiToFreq(root + semi);
			o.detune.value = semi === 0 ? -4 : 3; // slight chorus
			const og = ctx.createGain();
			og.gain.value = amp;
			o.connect(og);
			og.connect(g);
			o.start(when);
			o.stop(when + dur + 0.06);
		}
	};
	// Soft LEAD (flute-like): sine + faint octave, gentle vibrato. Auto-plays the
	// main melody so the tune sings on its own; the player's piano taps harmonise it.
	const flute = (when: number, midi: number, dur: number): void => {
		const ctx = ctxRef.current;
		if (!ctx) return;
		const freq = midiToFreq(midi);
		const g = ctx.createGain();
		g.connect(runGainRef.current ?? masterRef.current!);
		const atk = 0.045;
		const rel = Math.min(0.22, dur * 0.5);
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(0.1, when + atk);
		g.gain.setValueAtTime(0.1, when + Math.max(atk, dur - rel));
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
		const vib = ctx.createOscillator(); // vibrato → all partials' frequency
		vib.frequency.value = 5;
		const vibG = ctx.createGain();
		vibG.gain.value = freq * 0.006;
		vib.connect(vibG);
		for (const [mult, amp] of [[1, 1], [2, 0.14]]) {
			const o = ctx.createOscillator();
			o.type = 'sine';
			o.frequency.setValueAtTime(freq * mult, when);
			vibG.connect(o.frequency);
			const og = ctx.createGain();
			og.gain.value = amp;
			o.connect(og);
			og.connect(g);
			o.start(when);
			o.stop(when + dur + 0.05);
		}
		vib.start(when);
		vib.stop(when + dur + 0.05);
	};
	// Secondary voice (reedy, oboe/clarinet-like): filtered saw. Used for the
	// call-and-response fills and echoes woven around the main melody.
	const reed = (when: number, midi: number, dur: number, vol = 0.06): void => {
		const ctx = ctxRef.current;
		if (!ctx) return;
		const g = ctx.createGain();
		g.connect(busOut('reed'));
		const atk = 0.04;
		const rel = Math.min(0.25, dur * 0.5);
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(vol, when + atk);
		g.gain.setValueAtTime(vol, when + Math.max(atk, dur - rel));
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
		for (const [mult, amp] of [[1, 1], [2, 0.35], [3, 0.12]]) {
			const o = ctx.createOscillator();
			o.type = 'sawtooth';
			o.frequency.value = midiToFreq(midi) * mult;
			const og = ctx.createGain();
			og.gain.value = amp * 0.5;
			o.connect(og);
			og.connect(g);
			o.start(when);
			o.stop(when + dur + 0.05);
		}
	};
	// Hi-hat: a short high-passed noise tick for groove.
	const hat = (when: number, accent: boolean, gain?: number): void => {
		const ctx = ctxRef.current;
		if (!ctx || !noiseRef.current) return;
		const src = ctx.createBufferSource();
		src.buffer = noiseRef.current;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(gain ?? (accent ? 0.05 : 0.028), when + 0.002); // micro-attack: no click
		g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
		src.connect(g);
		g.connect(busOut('hat'));
		src.start(when);
		src.stop(when + 0.06);
	};
	// Snare: band-passed noise + a low tone body. The rock backbeat (beats 2 & 4).
	const snare = (when: number, accent: boolean): void => {
		const ctx = ctxRef.current;
		if (!ctx || !noiseRef.current) return;
		const src = ctx.createBufferSource();
		src.buffer = noiseRef.current;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(accent ? 0.15 : 0.11, when + 0.003); // micro-attack: no click
		g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
		src.connect(g);
		g.connect(busOut('snare'));
		src.start(when);
		src.stop(when + 0.18);
		const o = ctx.createOscillator();
		o.type = 'triangle';
		o.frequency.setValueAtTime(195, when);
		const og = ctx.createGain();
		og.gain.setValueAtTime(0.0001, when);
		og.gain.exponentialRampToValueAtTime(0.08, when + 0.003);
		og.gain.exponentialRampToValueAtTime(0.0001, when + 0.11);
		o.connect(og);
		og.connect(runGainRef.current ?? masterRef.current!);
		o.start(when);
		o.stop(when + 0.13);
	};
	// String ensemble (violins): detuned saws, slow swell, mid-high register —
	// carries the ninth chord's color (3rd + 7th + 9th) above the synth pad.
	const strings = (when: number, dur: number, root: number, third: number, seventh: number, ninth: number): void => {
		const ctx = ctxRef.current;
		if (!ctx) return;
		const g = ctx.createGain();
		g.connect(busOut('strings'));
		const atk = Math.min(0.5, dur * 0.35);
		const rel = Math.min(0.6, dur * 0.4);
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(0.04, when + atk);
		g.gain.setValueAtTime(0.04, when + Math.max(atk, dur - rel));
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
		for (const [semi, det] of [[third + 12, -6], [seventh + 12, 5], [ninth + 12, -3]]) {
			const o = ctx.createOscillator();
			o.type = 'sawtooth';
			o.frequency.value = midiToFreq(root + semi);
			o.detune.value = det;
			const og = ctx.createGain();
			og.gain.value = 0.5;
			o.connect(og);
			og.connect(g);
			o.start(when);
			o.stop(when + dur + 0.08);
		}
	};
	// Guitar comp (nylon-ish pluck): triangle + saw bite, band-limited, quick
	// decay — arpeggiates the chord up then down across each bar.
	const gtr = (when: number, midi: number): void => {
		const ctx = ctxRef.current;
		if (!ctx) return;
		const g = ctx.createGain();
		g.connect(busOut('gtr'));
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(0.05, when + 0.006);
		g.gain.exponentialRampToValueAtTime(0.0001, when + 0.42);
		for (const [mult, amp, type] of [[1, 1, 'triangle'], [1, 0.4, 'sawtooth']] as [number, number, OscillatorType][]) {
			const o = ctx.createOscillator();
			o.type = type;
			o.frequency.value = midiToFreq(midi) * mult;
			const og = ctx.createGain();
			og.gain.value = amp;
			o.connect(og);
			og.connect(g);
			o.start(when);
			o.stop(when + 0.45);
		}
	};

	/* ---------- Geometry ---------- */
	const laneW = (): number => dimRef.current.w / LANES;
	const hitY = (): number => dimRef.current.h * HIT_FRAC;
	const pxPerSec = (): number => hitY() / LEAD;
	const songTime = (): number => {
		const ctx = ctxRef.current;
		return ctx ? ctx.currentTime - audioStartRef.current : 0;
	};
	const heldLane = (lane: number): boolean => laneKeyRef.current[lane] || Array.from(pointerLaneRef.current.values()).includes(lane);

	/* ---------- Run ---------- */
	const prepare = useCallback((speed: number): void => {
		chartRef.current = buildEndlessChart(seedRef.current, speed, ENDLESS_OPTS[diffRef.current]);
		stateArrRef.current = chartRef.current.tiles.map(() => 'pending');
		scoreRef.current = 0;
		comboRef.current = 0;
		maxComboRef.current = 0;
		accSumRef.current = 0;
		accCountRef.current = 0;
		energyRef.current = ENERGY_MAX;
		partsRef.current = [];
		laneFlashRef.current = Array.from({ length: LANES }, () => -9);
		laneKeyRef.current = Array.from({ length: LANES }, () => false);
		pointerLaneRef.current.clear();
		setHud({ score: 0, combo: 0, mult: 1 });
		setResult(null);
	}, []);

	const startRun = (listen = false): void => {
		const ctx = ensureAudio();
		if (!ctx) return;
		autoRef.current = listen;
		setAuto(listen);
		if (listen) {
			// Listen mode is pure playback — the backing + auto-lead must sound regardless
			// of the Musique toggle, otherwise there'd be nothing to hear.
			metroRef.current = true;
			setMetro(true);
		}
		if (!dailyRef.current) seedRef.current = (Math.random() * 2 ** 32) >>> 0; // fresh tune each free run
		prepare(speedRef.current);
		// Fresh per-run audio bus: silences any groove still scheduled from a previous run.
		try {
			runGainRef.current?.disconnect();
		} catch {
			/* ignore */
		}
		const rg = ctx.createGain();
		rg.connect(masterRef.current!);
		runGainRef.current = rg;
		// Rewire the persistent instrument buses onto the fresh run bus.
		if (busesRef.current) {
			for (const b of Object.values(busesRef.current)) {
				try {
					b.disconnect();
				} catch {
					/* ignore */
				}
				b.connect(rg);
			}
		}
		// The chord-only intro covers the tiles' fall time, so the backing can start
		// almost immediately; keep at least LEAD when there'd be no intro to hide it.
		const introTime = chartRef.current?.introTime ?? 0;
		audioStartRef.current = ctx.currentTime + Math.max(0.15, LEAD - introTime);
		backingIdxRef.current = 0; // groove is scheduled with lookahead in step()
		melodyIdxRef.current = 0; // auto-lead is scheduled with lookahead in step()
		runningRef.current = true;
		setStat('running');
		setSubmitScore(undefined);
		trackGame(gameId, 'game_started', { mode: listen ? 'listen' : dailyRef.current ? 'daily' : 'free' });
	};

	const finishRun = useCallback((): void => {
		runningRef.current = false;
		try {
			runGainRef.current?.disconnect(); // stop any remaining scheduled groove
		} catch {
			/* ignore */
		}
		if (autoRef.current) {
			// Listen mode: no score, no record — just return to the ready screen.
			autoRef.current = false;
			setAuto(false);
			setStat('ready');
			return;
		}
		const total = Math.max(1, accCountRef.current);
		const rank = rankOf(accSumRef.current / total);
		const score = Math.round(scoreRef.current);
		setResult({ score, rank, tiles: accCountRef.current });
		setStat('done');
		if (dailyRef.current) {
			dailyBestRef.current = dailyBestRef.current == null ? score : Math.max(dailyBestRef.current, score);
			setBest(dailyBestRef.current);
			setSubmitScore(dailyBestRef.current);
			saveDailyRun(gameId, { startedAt: Date.now(), done: true, seed: seedRef.current, diffIndex: diffRef.current, state: { best: dailyBestRef.current } satisfies DailyState });
		} else {
			setBest((prev) => {
				const nb = prev == null ? score : Math.max(prev, score);
				try {
					localStorage.setItem(bestKey(diffRef.current), String(nb));
				} catch {
					/* ignore */
				}
				return nb;
			});
		}
		trackGame(gameId, 'game_over', { score });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gameId]);

	/* ---------- Input ---------- */
	const emitText = (text: string, lane: number, color: string, spark = false): void => {
		const x = (lane + 0.5) * laneW();
		partsRef.current.push({ x, y: hitY() - 18, vy: -50, life: 0.7, maxLife: 0.7, color, text, size: 15 });
		if (spark) for (let i = 0; i < 8; i++) partsRef.current.push({ x, y: hitY(), vy: -60 - Math.random() * 60, life: 0.45, maxLife: 0.45, color, size: 3 });
	};
	const gradeColor = (g: Grade): string => (g === 'Parfait' ? '#3ddc84' : g === 'Bien' ? '#7fd0ff' : g === 'Ok' ? '#ffd166' : '#ff6a6a');

	const pressLane = (lane: number): void => {
		if (!runningRef.current || autoRef.current) return;
		const chart = chartRef.current;
		if (!chart) return;
		laneFlashRef.current[lane] = animRef.current;
		const now = songTime();
		const arr = stateArrRef.current;
		let bi = -1;
		let bo = Infinity;
		chart.tiles.forEach((t, i) => {
			if (t.lane !== lane || arr[i] !== 'pending') return;
			const off = Math.abs(now - t.time);
			if (off < bo) {
				bo = off;
				bi = i;
			}
		});
		const jd = bi >= 0 ? judgeTiming(bo) : null; // bi<0 → empty lane; jd null → off-window
		if (!jd) {
			// Too early / too late (or nothing to hit): a fausse note. Sour the note that
			// belongs here (nearest pending tile), else a lane-derived pitch.
			const midi = bi >= 0 ? chart.tiles[bi].midi : chart.key + 12 + [0, 2, 4, 7, 9, 11][lane % LANES];
			playWrong(midi);
			return;
		}
		const t = chart.tiles[bi];
		playPianoVoiced(t.midi, t.hold ? t.dur : 0.5, t.time, undefined, t.hold);
		comboRef.current += 1;
		maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
		scoreRef.current += jd.points * comboMult(comboRef.current);
		accSumRef.current += jd.points;
		accCountRef.current += 1;
		energyRef.current = Math.min(ENERGY_MAX, energyRef.current + (jd.grade === 'Parfait' ? 7 : jd.grade === 'Bien' ? 4 : 2));
		emitText(jd.grade, lane, gradeColor(jd.grade), jd.points >= 60);
		arr[bi] = t.hold ? 'holding' : jd.grade;
		setHud({ score: Math.round(scoreRef.current), combo: comboRef.current, mult: comboMult(comboRef.current) });
	};
	const pressLaneRef = useRef(pressLane);
	pressLaneRef.current = pressLane;

	const onDown = (e: React.PointerEvent): void => {
		if (!runningRef.current || autoRef.current) return; // listen mode: taps don't light lanes
		const cv = canvasRef.current;
		if (!cv) return;
		const rect = cv.getBoundingClientRect();
		const x = (e.clientX - rect.left) * (dimRef.current.w / rect.width);
		const lane = clamp(Math.floor(x / laneW()), 0, LANES - 1);
		const wasHeld = heldLane(lane);
		pointerLaneRef.current.set(e.pointerId, lane);
		cv.setPointerCapture(e.pointerId);
		if (!wasHeld) pressLane(lane);
	};
	const onPointerEnd = (e: React.PointerEvent): void => {
		pointerLaneRef.current.delete(e.pointerId);
	};

	/* ---------- Modes ---------- */
	const armFree = useCallback(
		(di: number): void => {
			dailyRef.current = false;
			setDaily(false);
			setDailyLoading(false);
			diffRef.current = di;
			speedRef.current = SPEEDS[di].speed;
			setSpeedIdx(di);
			seedRef.current = (Math.random() * 2 ** 32) >>> 0;
			prepare(speedRef.current);
			setStat('ready');
			dailyBestRef.current = null;
			let b: number | null = null;
			try {
				const v = localStorage.getItem(bestKey(di));
				if (v != null) b = Number(v);
			} catch {
				/* ignore */
			}
			setBest(b);
		},
		[prepare],
	);

	const startDaily = useCallback(async (): Promise<void> => {
		dailyRef.current = true;
		setDaily(true);
		runningRef.current = false;
		const apply = (seed: number, di: number, st: DailyState | null): void => {
			seedRef.current = seed >>> 0;
			diffRef.current = clamp(di, 0, 2);
			speedRef.current = SPEEDS[diffRef.current].speed;
			setSpeedIdx(diffRef.current);
			prepare(speedRef.current);
			dailyBestRef.current = st?.best ?? null;
			setBest(dailyBestRef.current);
			setStat('ready');
			setDailyLoading(false);
		};
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			apply(run.seed, run.diffIndex ?? dailyDifficultyIndex(), (run.state as DailyState) ?? null);
			return;
		}
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		apply(seed, diffIndex, null);
	}, [gameId, prepare]);

	/* ---------- Loop + keyboard ---------- */
	useEffect(() => {
		armFree(1);
		const resize = (): void => {
			const wrap = wrapRef.current;
			const cv = canvasRef.current;
			if (!wrap || !cv) return;
			const fs = document.fullscreenElement != null;
			const w = fs ? Math.min(wrap.clientWidth, Math.round((wrap.clientHeight || 600) / 1.4)) : clamp(wrap.clientWidth, 260, 460);
			const h = Math.round(w * 1.4);
			const dpr = window.devicePixelRatio || 1;
			dimRef.current = { w, h };
			cv.style.height = `${h}px`;
			cv.style.width = `${w}px`;
			cv.width = Math.round(w * dpr);
			cv.height = Math.round(h * dpr);
			const ctx = cv.getContext('2d');
			if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		resize();
		const ro = new ResizeObserver(resize);
		if (wrapRef.current) ro.observe(wrapRef.current);
		const onFs = () => requestAnimationFrame(resize);
		document.addEventListener('fullscreenchange', onFs);
		document.addEventListener('webkitfullscreenchange', onFs);
		const onKeyDown = (e: KeyboardEvent): void => {
			const lane = KEYS.indexOf(e.key.toLowerCase());
			if (lane < 0 || !runningRef.current || autoRef.current) return;
			e.preventDefault();
			if (!laneKeyRef.current[lane]) {
				laneKeyRef.current[lane] = true;
				pressLaneRef.current(lane);
			}
		};
		const onKeyUp = (e: KeyboardEvent): void => {
			const lane = KEYS.indexOf(e.key.toLowerCase());
			if (lane >= 0) laneKeyRef.current[lane] = false;
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		let last = performance.now();
		const frame = (now: number): void => {
			const dt = Math.min(now - last, 100) / 1000;
			last = now;
			animRef.current += dt;
			step(dt);
			draw();
			rafRef.current = requestAnimationFrame(frame);
		};
		rafRef.current = requestAnimationFrame(frame);
		return () => {
			ro.disconnect();
			document.removeEventListener('fullscreenchange', onFs);
			document.removeEventListener('webkitfullscreenchange', onFs);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			cancelAnimationFrame(rafRef.current);
			void ctxRef.current?.close();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	useEffect(() => {
		metroRef.current = metro;
	}, [metro]);

	const step = (dt: number): void => {
		for (const p of partsRef.current) {
			p.y += p.vy * dt;
			p.vy += 60 * dt;
			p.life -= dt;
		}
		partsRef.current = partsRef.current.filter((p) => p.life > 0);
		if (!runningRef.current) return;
		const chart = chartRef.current;
		if (!chart) return;
		const now = songTime();
		// Backing groove: schedule ~1s ahead. Full ensemble per beat — kick + bass +
		// hi-hat + a plucked chord tone, a sustained pad per bar. Chords come from
		// the chart (rotating progressions, with each chord's real third).
		if (metroRef.current) {
			const bt = chart.beatTimes;
			const chordAt = (beatIdx: number) => chart.chords[Math.min(Math.floor(beatIdx / 4), chart.chords.length - 1)];
			while (backingIdxRef.current < bt.length && bt[backingIdxRef.current] < now + 1) {
				const i = backingIdxRef.current;
				const when = audioStartRef.current + bt[i];
				const accent = i % 4 === 0;
				const { root, third, seventh, ninth } = chordAt(i);
				const chordRoot = chart.key + root;
				// Chord-only intro: pad + strings + guitar + bass set the harmony first,
				// the drums only enter with the melody.
				const inIntro = bt[i] < (chart.introTime ?? 0) - 0.01;
				const secOf = (b: number): string => chart.sections[Math.min(Math.floor(b / 4), chart.sections.length - 1)];
				const inBridge = secOf(i) === 'C'; // pont: the drums DROP out
				const beatDur = i + 1 < bt.length ? bt[i + 1] - bt[i] : 0.5;
				// Snare fill (16ths) on the last beat before a section change — doubles as
				// the count-in out of the intro and the re-entry pickup out of the pont.
				const sectionEnd = i % 4 === 3 && secOf(i) !== secOf(i + 1);
				if (sectionEnd) {
					for (let k = 0; k < 4; k++) snare(when + (k * beatDur) / 4, k === 3);
				} else if (!inIntro && !inBridge) {
					// Rock pattern: kick on beats 1 & 3, snare backbeat on 2 & 4, 8th hats.
					if (i % 2 === 0) kick(when, accent);
					else snare(when, i % 4 === 3);
					hat(when, accent);
					if (i + 1 < bt.length) hat(when + beatDur / 2, false, 0.015);
				}
				if (inIntro) {
					// Intro keeps the round root/fifth pulse — the riff enters with the drums.
					bass(when, chordRoot + (i % 2 === 0 ? 0 : 7), accent);
				} else {
					// Round sub anchors each bar; the bass GUITAR rides its own riff.
					if (accent) bass(when, chordRoot, true);
					const riff = BASS_RIFFS[seedRef.current % BASS_RIFFS.length];
					for (const ev of riff) {
						if (ev.e >> 1 !== i % 4) continue; // only this beat's eighths
						let m = chordRoot;
						if (ev.t === '5') m = chordRoot + 7;
						else if (ev.t === 'o') m = chordRoot + 12;
						else if (ev.t === 'w') {
							const next = chart.key + chordAt(i + 1).root; // next bar's root
							m = next === chordRoot ? chordRoot : next + (next > chordRoot ? -2 : 2);
						}
						bassGtr(when + (ev.e % 2) * (beatDur / 2), m, !!ev.a);
					}
				}
				// Guitar comp: the full ninth chord arpeggiated UP then DOWN across the
				// bar (two 8ths per beat — root→3rd→5th→7th→9th→7th→5th→3rd).
				const ladder = [0, third, 7, seventh, ninth];
				for (const half of [0, 1]) {
					const e = (i % 4) * 2 + half;
					gtr(when + (half * beatDur) / 2, chordRoot + 12 + ladder[GTR_PING[e]]);
				}
				if (accent) {
					// Synth bed under each bar (deep, an octave below the groove bass) —
					// slight overlap into the next bar keeps it seamless (no hole while the
					// violins swell in above it).
					const barDur = bt[Math.min(i + 4, bt.length - 1)] - bt[i] || 2;
					pad(when, Math.max(0.6, barDur) + 0.25, chordRoot - 12, third);
					strings(when, Math.max(0.6, barDur), chordRoot, third, seventh, ninth);
				}
				backingIdxRef.current++;
			}
			// Auto-lead + secondary voice: the flute sings every melody note; the reed
			// answers in the gaps (fills a held note with a chord arpeggio) and now
			// and then echoes a phrase an octave lower ("reprise").
			const tiles = chart.tiles;
			const chordBarAt = (time: number): ChordBar => {
				let b = 0;
				while (b + 1 < bt.length && bt[b + 1] <= time) b++;
				return chordAt(b);
			};
			while (melodyIdxRef.current < tiles.length && tiles[melodyIdxRef.current].time < now + 1) {
				const mi = melodyIdxRef.current;
				const t = tiles[mi];
				const when = audioStartRef.current + t.time;
				flute(when, t.midi, clamp(t.dur, 0.18, 2.2));
				// Listen mode: the "player" piano plays itself, sample-accurate on the audio clock.
				if (autoRef.current) playPianoVoiced(t.midi, t.hold ? t.dur : 0.5, t.time, when, t.hold);
				if (t.hold) {
					// Répartie: arpeggiate the chord (root/3rd/5th/7th) through the held note.
					const c = chordBarAt(t.time);
					let base = chart.key + c.root;
					while (base < t.midi - 8) base += 12; // lift near the melody's register
					const tones = [base, base + c.third, base + 7, base + c.seventh];
					const steps = Math.min(4, Math.max(1, Math.floor(t.dur / 0.3)));
					for (let k = 1; k <= steps; k++) reed(when + (t.dur * k) / (steps + 1), tones[(k - 1) % 4], 0.32, 0.05);
				} else if (mi % 8 === 5 && tiles[mi + 1]) {
					// Reprise: restate this note an octave lower, on the next beat, softly.
					reed(audioStartRef.current + tiles[mi + 1].time, t.midi - 12, 0.34, 0.045);
				}
				melodyIdxRef.current++;
			}
		}
		const arr = stateArrRef.current;
		let dirty = false;
		let failed = false;
		for (let i = 0; i < chart.tiles.length; i++) {
			const t = chart.tiles[i];
			const s = arr[i];
			if (autoRef.current) {
				// Listen mode: resolve tiles on time + flash the lane so the board animates.
				// Piano is scheduled in the lookahead above. No energy, no miss, no fail.
				if (s === 'pending' && now >= t.time) {
					laneFlashRef.current[t.lane] = animRef.current;
					arr[i] = t.hold ? 'holding' : 'Parfait';
				} else if (s === 'holding' && now >= t.time + t.dur - 0.06) {
					arr[i] = 'done';
				}
				continue;
			}
			if (s === 'pending') {
				if (now - t.time > 0.28) {
					arr[i] = 'Raté';
					comboRef.current = 0;
					accCountRef.current += 1;
					emitText('Raté', t.lane, '#ff6a6a');
					dirty = true;
					energyRef.current -= MISS_COST;
					if (energyRef.current <= 0) failed = true;
				}
			} else if (s === 'holding') {
				const end = t.time + t.dur;
				if (heldLane(t.lane) && now < end) {
					scoreRef.current += HOLD_RATE * dt * comboMult(comboRef.current);
					dirty = true;
				} else if (!heldLane(t.lane) && now < end - 0.12) {
					arr[i] = 'broken';
					comboRef.current = 0;
					emitText('Lâché', t.lane, '#ff9a5a');
					energyRef.current -= HOLD_BREAK_COST;
					if (energyRef.current <= 0) failed = true;
					dirty = true;
				} else if (now >= end - 0.06) {
					arr[i] = 'done';
					comboRef.current += 1;
					scoreRef.current += 40 * comboMult(comboRef.current);
					energyRef.current = Math.min(ENERGY_MAX, energyRef.current + 6);
					emitText('Tenu !', t.lane, '#3ddc84', true);
					dirty = true;
				}
			}
		}
		if (dirty) setHud({ score: Math.round(scoreRef.current), combo: comboRef.current, mult: comboMult(comboRef.current) });
		if (autoRef.current) {
			// Loop the same tune end-to-end so the user can keep verifying it until they stop.
			if (now > chart.totalTime + 0.6) {
				stateArrRef.current = chart.tiles.map(() => 'pending');
				backingIdxRef.current = 0;
				melodyIdxRef.current = 0;
				const ctx = ctxRef.current;
				if (ctx) audioStartRef.current = ctx.currentTime + Math.max(0.15, LEAD - (chart.introTime ?? 0));
			}
		} else if (failed || now > chart.totalTime + 0.6) {
			finishRun();
		}
	};

	/* ---------- Draw ---------- */
	const draw = (): void => {
		const cv = canvasRef.current;
		if (!cv) return;
		const ctx = cv.getContext('2d');
		if (!ctx) return;
		const { w, h } = dimRef.current;
		const lw = laneW();
		const hy = hitY();
		const pps = pxPerSec();
		const chart = chartRef.current;
		const now = runningRef.current ? songTime() : -LEAD;
		const anim = animRef.current;

		ctx.fillStyle = '#0c1018';
		ctx.fillRect(0, 0, w, h);
		for (let l = 0; l < LANES; l++) {
			ctx.fillStyle = l % 2 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
			ctx.fillRect(l * lw, 0, lw, h);
			ctx.strokeStyle = 'rgba(255,255,255,0.06)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(l * lw, 0);
			ctx.lineTo(l * lw, h);
			ctx.stroke();
		}
		ctx.strokeStyle = 'rgba(150,190,255,0.55)';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(0, hy);
		ctx.lineTo(w, hy);
		ctx.stroke();

		// Energy bar: drops on a miss, refills on hits, game over at 0.
		{
			const e = clamp(energyRef.current / ENERGY_MAX, 0, 1);
			const bx = 10;
			const by = 8;
			const bw = w - 20;
			const bh = 8;
			ctx.fillStyle = 'rgba(255,255,255,0.12)';
			ctx.beginPath();
			ctx.roundRect(bx, by, bw, bh, 4);
			ctx.fill();
			ctx.fillStyle = e > 0.5 ? '#3ddc84' : e > 0.25 ? '#ffd166' : '#ff6a6a';
			ctx.beginPath();
			ctx.roundRect(bx, by, Math.max(2, bw * e), bh, 4);
			ctx.fill();
		}

		if (chart) {
			const arr = stateArrRef.current;
			for (let i = 0; i < chart.tiles.length; i++) {
				const t = chart.tiles[i];
				const s = arr[i];
				const yBottom = hy + (now - t.time) * pps;
				const hh = Math.max(lw * 0.55, t.dur * pps);
				const yTop = yBottom - hh;
				const x = t.lane * lw + 4;
				const wdt = lw - 8;
				const hue = LANE_HUE[t.lane];
				if (s === 'pending') {
					if (yBottom < -4 || yTop > h) continue;
					const g = ctx.createLinearGradient(0, yTop, 0, yBottom);
					g.addColorStop(0, `hsl(${hue}, 80%, 62%)`);
					g.addColorStop(1, `hsl(${hue}, 75%, 48%)`);
					ctx.fillStyle = g;
					ctx.shadowColor = `hsl(${hue}, 85%, 60%)`;
					ctx.shadowBlur = 10;
					ctx.beginPath();
					ctx.roundRect(x, yTop, wdt, hh, 8);
					ctx.fill();
					ctx.shadowBlur = 0;
					if (t.hold) {
						ctx.strokeStyle = 'rgba(255,255,255,0.7)';
						ctx.lineWidth = 2;
						ctx.beginPath();
						ctx.roundRect(x + 3, yTop + 3, wdt - 6, hh - 6, 6);
						ctx.stroke();
					}
				} else if (s === 'holding') {
					// remaining portion above the line, shrinking as it's held
					const top = Math.min(hy, yTop);
					if (hy - top > 1) {
						ctx.fillStyle = `hsla(140, 80%, 60%, 0.9)`;
						ctx.shadowColor = 'hsl(140,85%,60%)';
						ctx.shadowBlur = 14;
						ctx.beginPath();
						ctx.roundRect(x, top, wdt, hy - top, 8);
						ctx.fill();
						ctx.shadowBlur = 0;
					}
				}
			}
		}

		for (let l = 0; l < LANES; l++) {
			const flash = clamp(1 - (anim - laneFlashRef.current[l]) / 0.18, 0, 1);
			const held = heldLane(l) ? 0.35 : 0;
			ctx.fillStyle = `rgba(${120 + 120 * flash}, ${150 + 90 * flash}, 255, ${0.12 + 0.5 * flash + held})`;
			ctx.fillRect(l * lw + 3, hy + 3, lw - 6, h - hy - 6);
			ctx.fillStyle = 'rgba(255,255,255,0.5)';
			ctx.font = 'bold 14px system-ui, sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(KEYS[l].toUpperCase(), (l + 0.5) * lw, (hy + h) / 2);
		}

		for (const p of partsRef.current) {
			const a = clamp(p.life / p.maxLife, 0, 1);
			ctx.globalAlpha = a;
			ctx.fillStyle = p.color;
			if (p.text) {
				ctx.font = `bold ${p.size}px system-ui, sans-serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(p.text, p.x, p.y);
			} else {
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
				ctx.fill();
			}
		}
		ctx.globalAlpha = 1;
	};

	return (
		<div className="tp-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => armFree(diffRef.current)} onDaily={startDaily} />

			{daily ? (
				<div className="tp-dailytag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${SPEEDS[speedIdx].label}`}
				</div>
			) : (
				<div className="tp-pills">
					{SPEEDS.map((s, i) => (
						<button key={s.label} className={`tp-pill ${speedIdx === i ? 'active' : ''}`} onClick={() => armFree(i)} disabled={status === 'running'}>
							{s.label}
						</button>
					))}
					<label className="tp-toggle">
						<input type="checkbox" checked={metro} onChange={(e) => setMetro(e.target.checked)} /> Musique
					</label>
				</div>
			)}

			{auto && status === 'running' ? (
				<div className="tp-hud">
					<span className="tp-stat">🎧 Mode écoute — la mélodie se joue toute seule</span>
				</div>
			) : (
				<div className="tp-hud">
					<span className="tp-stat">
						Score <strong>{hud.score}</strong>
					</span>
					<span className={`tp-stat ${hud.combo >= 5 ? 'hot' : ''}`}>
						Combo <strong>{hud.combo}</strong>
						{hud.mult > 1 && <em> ×{hud.mult}</em>}
					</span>
					<span className="tp-stat">
						Record <strong>{best ?? '—'}</strong>
					</span>
				</div>
			)}

			<div className="tp-playwrap" ref={wrapRef}>
				<canvas ref={canvasRef} className="tp-canvas" onPointerDown={onDown} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} />

				{status === 'running' && auto && (
					<button className="tp-stop" onClick={() => finishRun()}>
						⏹ Arrêter l'écoute
					</button>
				)}

				{status === 'ready' && !dailyLoading && (
					<div className="tp-overlay">
						<div className="tp-card">
							<h3>🎹 Tempo</h3>
							<p>
								Tape la colonne (clic/doigt ou <b>S D F&nbsp;J K L</b>) quand la tuile touche la ligne — une <b>musique donne le tempo</b>, cale-toi dessus. Les tuiles <b>allongées</b> se <b>maintiennent</b> pour un bonus. Ça <b>accélère</b> peu à peu&nbsp;: ton énergie baisse quand tu rates et remonte quand tu enchaînes.
							</p>
							<div className="tp-cta">
								<button className="tp-btn primary big" onClick={() => startRun(false)}>
									▶ Go&nbsp;!
								</button>
								<button className="tp-btn big" onClick={() => startRun(true)}>
									🎧 Écouter
								</button>
							</div>
						</div>
					</div>
				)}
				{dailyLoading && (
					<div className="tp-overlay">
						<div className="tp-card">Préparation du défi…</div>
					</div>
				)}
				{status === 'done' && result && (
					<div className="tp-overlay">
						<div className="tp-card">
							<div className={`tp-rank tp-rank-${result.rank}`}>{result.rank}</div>
							<h3>{result.score} pts</h3>
							<p>
								Tuiles jouées <strong>{result.tiles}</strong> · plus long combo <strong>{maxComboRef.current}</strong>
							</p>
							<button className="tp-btn primary big" onClick={() => startRun()}>
								↻ Rejouer{daily ? ' (améliorer)' : ''}
							</button>
						</div>
					</div>
				)}
			</div>

			<p className="tp-help">
				Un « piano tiles » sans fin&nbsp;: la mélodie générée <b>accélère</b> peu à peu. Tape pile sur la ligne, <b>maintiens les tuiles longues</b> pour du bonus. {daily ? 'Défi du jour : même mélodie pour tous, meilleur score classé.' : 'Ton énergie (barre du haut) baisse sur un raté et remonte quand tu enchaînes — game over à zéro. Bats ton record !'}
			</p>

			{daily ? (
				<Leaderboard key={`lb-${gameId}`} game={gameId} metric="score" submitValue={status === 'done' ? submitScore : undefined} />
			) : (
				<LeaderboardCorner game={gameId} metric="score" />
			)}
		</div>
	);
}

const CSS = `
.tp-root { --tp: var(--accent-regular); width: 100%; max-width: 480px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
/* Site global fullscreen → the lanes fill the screen height (portrait, centred). */
.game-page:fullscreen .tp-root { max-width: none; width: 100%; height: 100%; }
.game-page:-webkit-full-screen .tp-root { max-width: none; width: 100%; height: 100%; }
.game-page:fullscreen .tp-playwrap { flex: 1; min-height: 0; align-items: center; }
.game-page:-webkit-full-screen .tp-playwrap { flex: 1; min-height: 0; align-items: center; }
.game-page:fullscreen .tp-help { display: none; }
.game-page:-webkit-full-screen .tp-help { display: none; }
.tp-dailytag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.55rem; }
.tp-songs { display: flex; gap: 5px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.4rem; }
.tp-song { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 12px; border-radius: 999px; padding: 5px 11px; cursor: pointer; }
.tp-song.active { background: var(--tp); color: var(--accent-text-over); border-color: var(--tp); }
.tp-song:disabled { opacity: 0.4; cursor: not-allowed; }
.tp-pills { display: flex; gap: 6px; align-items: center; margin-bottom: 0.6rem; }
.tp-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 12.5px; border-radius: 999px; padding: 5px 12px; cursor: pointer; }
.tp-pill.active { background: var(--tp); color: var(--accent-text-over); border-color: var(--tp); }
.tp-pill:disabled { opacity: 0.4; cursor: not-allowed; }
.tp-toggle { display: flex; align-items: center; gap: 4px; font-size: 12.5px; color: var(--gray-200); cursor: pointer; }
.tp-toggle input { width: 14px; height: 14px; accent-color: var(--tp); }
.tp-cta { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.tp-stop { position: absolute; top: 10px; right: 10px; z-index: 3; border: 1.5px solid var(--gray-700); background: rgba(12,16,24,0.82); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 12.5px; border-radius: 999px; padding: 7px 14px; cursor: pointer; backdrop-filter: blur(2px); }
.tp-hud { display: flex; gap: 0.5rem; font-size: 14px; font-weight: 600; margin-bottom: 0.6rem; }
.tp-stat { background: var(--gray-900); border-radius: 999px; padding: 6px 14px; font-variant-numeric: tabular-nums; }
.tp-stat strong { margin-left: 4px; color: var(--tp); }
.tp-stat.hot { background: #3a2f14; color: #ffe08a; }
.tp-stat.hot strong { color: #ffe08a; }
.tp-stat em { font-style: normal; color: #ffd166; margin-left: 3px; }
.tp-playwrap { position: relative; display: flex; justify-content: center; }
.tp-canvas { display: block; touch-action: none; user-select: none; -webkit-user-select: none; border-radius: 14px; box-shadow: var(--shadow-md); cursor: pointer; }
.tp-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); backdrop-filter: blur(3px); padding: 1rem; border-radius: 14px; }
.tp-card { background: var(--gray-999); border: 2px solid var(--tp); border-radius: 16px; padding: 20px 24px; max-width: 20rem; text-align: center; box-shadow: var(--shadow-lg); }
.tp-card h3 { margin: 0 0 0.5rem; font-family: var(--font-brand); font-size: var(--text-xl); }
.tp-card p { color: var(--gray-200); font-size: 13.5px; line-height: 1.55; margin: 0 0 0.9rem; }
.tp-rank { font-family: var(--font-brand); font-weight: 800; font-size: 54px; line-height: 1; margin-bottom: 4px; }
.tp-rank-S { color: #ffd166; } .tp-rank-A { color: #3ddc84; } .tp-rank-B { color: #7fd0ff; } .tp-rank-C { color: #c9b6ff; } .tp-rank-D { color: #ff9a8a; }
.tp-btn { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13.5px; border-radius: 999px; padding: 9px 18px; cursor: pointer; }
.tp-btn.primary { background: var(--tp); color: var(--accent-text-over); border-color: var(--tp); }
.tp-btn.big { font-size: 16px; padding: 11px 28px; }
.tp-help { max-width: 440px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 0.9rem; }
`;
