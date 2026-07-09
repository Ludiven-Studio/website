/* =====================================================
   TEMPO — pure engine for a "piano tiles" rhythm game.
   Public-domain melodies → a falling-tile chart (lane per note, hit time in
   seconds). An endless mode streams a seeded generated melody. Long notes are
   HOLD tiles (press-and-hold for bonus). Timing judgment + scoring live here.
   ===================================================== */

import { mulberry32 } from '../prng';

export const LANES = 6; // columns, ordered low pitch (left) → high pitch (right)
export const HOLD_BEATS = 2; // a note this long (or longer) becomes a hold tile
export const PROG = [0, 7, 9, 5]; // I–V–vi–IV progression (semitones from key) — melody AND backing share it

export interface SongNote {
	midi: number;
	dur: number; // beats
	rest?: boolean; // a silence: advances time, produces no tile
	lane?: number; // column, assigned by the generator (see laneOfStep)
}
export interface Song {
	name: string;
	tempo: number; // beats per second at speed 1
	key: number; // tonic midi (used for the bass accompaniment)
	notes: SongNote[];
}

export interface SpeedTier {
	label: string;
	speed: number;
}
export const SPEEDS: SpeedTier[] = [
	{ label: 'Facile', speed: 0.8 },
	{ label: 'Moyen', speed: 1 },
	{ label: 'Difficile', speed: 1.3 },
];

export interface Tile {
	time: number; // seconds from song start
	lane: number;
	midi: number;
	dur: number; // seconds
	hold: boolean; // long note: press and hold to the end for bonus
}
export interface Chart {
	tiles: Tile[];
	totalTime: number; // seconds until the last note ends
	beatTimes: number[]; // beat grid (seconds) — drives the backing groove
	key: number; // tonic midi (bass accompaniment)
}

/* --- Music theory scaffolding for the generator -------------------------- */
const MAJOR = [0, 2, 4, 5, 7, 9, 11]; // major scale, semitones per scale-STEP
// The 4 chords of PROG expressed as scale-STEP roots: I, V, vi, IV.
// Step 0→I, 4→V, 5→vi, 3→IV — these match PROG's semitones [0,7,9,5] exactly,
// so the melody's harmony and the backing groove agree bar for bar.
const CHORD_ROOTS = [0, 4, 5, 3];
const MIN_STEP = -1; // register floor  (~ a 7th below the tonic)
const MAX_STEP = 11; // register ceiling (~ a 4th above the octave) → ~1.5 octaves
const BAD_PENTA = new Set([3, 6]); // 4th & 7th scale degrees: not in the pentatonic

/**
 * Scale-step → lane (column), a FIXED monotonic map over the register. Low steps
 * fall LEFT, high steps RIGHT. Because it's a pure function of the step, the same
 * pitch always uses the same column. The generator uses it to guarantee that two
 * consecutive DIFFERENT pitches never share a column (which felt odd).
 */
const laneOfStep = (step: number): number =>
	Math.max(0, Math.min(LANES - 1, Math.floor(((step - MIN_STEP) / (MAX_STEP - MIN_STEP + 1)) * LANES)));

// Note-value progression: the tune STARTS on long notes and shortens only
// gradually — rondes (whole) → blanches (half) → noires (quarter) → at most
// croches (eighth) — so early play is calm and it never gets denser than eighths.
// Every bar (each inner array) sums to EXACTLY 4 beats to stay aligned with the backing.
const RHYTHM_TIERS: { d: number; rest?: boolean }[][][] = [
	[[{ d: 4 }]], // tier 0 — rondes
	[[{ d: 2 }, { d: 2 }], [{ d: 4 }]], // tier 1 — blanches
	[
		// tier 2 — noires (with some blanches)
		[{ d: 2 }, { d: 2 }],
		[{ d: 2 }, { d: 1 }, { d: 1 }],
		[{ d: 1 }, { d: 1 }, { d: 2 }],
		[{ d: 1 }, { d: 1 }, { d: 1 }, { d: 1 }],
	],
	[
		// tier 3 — noires + occasional croches & a breath (rest)
		[{ d: 1 }, { d: 1 }, { d: 1 }, { d: 1 }],
		[{ d: 2 }, { d: 1 }, { d: 1 }],
		[{ d: 1 }, { d: 1 }, { d: 2 }],
		[{ d: 1 }, { d: 0.5 }, { d: 0.5 }, { d: 1 }, { d: 1 }],
		[{ d: 1 }, { d: 1, rest: true }, { d: 1 }, { d: 1 }],
		[{ d: 0.5 }, { d: 0.5 }, { d: 1 }, { d: 1 }, { d: 1 }],
	],
];
// Cadence cell per tier (the phrase's last bar) — always ends on a long note.
const CADENCE_TIERS: { d: number; rest?: boolean }[][] = [
	[{ d: 4 }],
	[{ d: 2 }, { d: 2 }],
	[{ d: 1 }, { d: 1 }, { d: 2 }],
	[{ d: 1 }, { d: 1 }, { d: 2 }],
];
// Phrase index → tier: a slow climb, capped at 3 (eighths).
const tierForPhrase = (p: number): number => (p < 2 ? 0 : p < 4 ? 1 : p < 7 ? 2 : 3);

const degToMidi = (tonic: number, step: number): number => tonic + Math.floor(step / 7) * 12 + MAJOR[((step % 7) + 7) % 7];
const clampStep = (s: number): number => Math.max(MIN_STEP, Math.min(MAX_STEP, s));
/** Nearest chord tone (root / 3rd / 5th of the given chord) to `step`, kept in register. */
const nearestChordTone = (step: number, chordRootStep: number): number => {
	let best = step;
	let bestDist = Infinity;
	for (let oct = -7; oct <= 14; oct += 7) {
		for (const t of [chordRootStep, chordRootStep + 2, chordRootStep + 4]) {
			const cand = t + oct;
			if (cand < MIN_STEP || cand > MAX_STEP) continue;
			const dist = Math.abs(cand - step);
			if (dist < bestDist) {
				bestDist = dist;
				best = cand;
			}
		}
	}
	return best;
};
/** Snap a passing note onto the pentatonic (avoid the unstable 4th & 7th). */
const toPenta = (step: number): number => (BAD_PENTA.has(((step % 7) + 7) % 7) ? clampStep(step + 1) : step);
/** Closest tonic degree (unison or octave, in register) for the final cadence. */
const nearestTonic = (step: number): number => (Math.abs(step - 0) <= Math.abs(step - 7) ? 0 : 7);

/**
 * Endless generated tune, phrase-based and harmony-aware (not a random walk).
 * Deterministic from the seed. The melody is still PLAYED by the player's taps;
 * this only shapes which notes fall when. Long enough to outlast any run.
 *
 * Structure per 4-bar phrase (Principle 3 — question/answer):
 *   bars 0–1 = antecedent (rises, ends on a V suspension),
 *   bars 2–3 = consequent (inverts the contour, cadences on the tonic).
 * Each phrase draws ONE rhythmic motif (Principle 2) reused across its bars,
 * with the consequent's last bar swapped for a cadential cell.
 */
export function generateEndlessSong(seed: number, count = 600): Song {
	const rng = mulberry32(seed >>> 0);
	const KEY = 43; // tonic midi for the bass accompaniment (G2)
	const TONIC = 55; // tonic midi the melody sings around (G3)
	const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
	const notes: SongNote[] = [];

	let step = 0; // current scale-step, carried across bars for a continuous line
	let lastStep: number | null = null; // last EMITTED (non-rest) step, for column checks

	// Emit a note at `s`, but if it would land in the same column as the previous
	// note while being a different pitch, nudge it diatonically until the column
	// differs (or, at the register edge, repeat the previous pitch instead).
	const emit = (s: number, dur: number): void => {
		if (lastStep != null && s !== lastStep && laneOfStep(s) === laneOfStep(lastStep)) {
			const dir = s > lastStep ? 1 : -1;
			let n = s;
			while (n + dir >= MIN_STEP && n + dir <= MAX_STEP && laneOfStep(n) === laneOfStep(lastStep)) n += dir;
			s = laneOfStep(n) !== laneOfStep(lastStep) ? n : lastStep;
		}
		lastStep = s;
		notes.push({ midi: degToMidi(TONIC, s), dur, lane: laneOfStep(s) });
	};
	// Overwrite the last real note (used to force phrase-ending cadences). Keeps the
	// intended scale degree but octave-shifts it if needed so it doesn't share a
	// column with the preceding note.
	const forceLast = (s: number, dur?: number): void => {
		let i = notes.length - 1;
		while (i >= 0 && notes[i].rest) i--;
		if (i < 0) return;
		let j = i - 1;
		while (j >= 0 && notes[j].rest) j--;
		const prevLane = j >= 0 ? notes[j].lane : null;
		if (prevLane != null && laneOfStep(s) === prevLane) {
			for (const alt of [s + 7, s - 7]) {
				if (alt >= MIN_STEP && alt <= MAX_STEP && laneOfStep(alt) !== prevLane) {
					s = alt;
					break;
				}
			}
		}
		notes[i].midi = degToMidi(TONIC, s);
		notes[i].lane = laneOfStep(s);
		if (dur != null) notes[i].dur = dur;
		lastStep = s;
	};

	let phrase = 0;
	while (notes.length < count) {
		const tier = tierForPhrase(phrase); // note-value tier grows slowly with the phrase
		// Principle 2 — one motif (rhythm) per phrase; Principle 4 — a contour of
		// small steps with a rare leap, reused so the ear recognises the shape.
		const motif = pick(RHYTHM_TIERS[tier]);
		const contour: number[] = [];
		for (let k = 0; k < 8; k++) {
			const r = rng();
			contour.push(r < 0.62 ? (rng() < 0.5 ? 1 : -1) : r < 0.86 ? (rng() < 0.5 ? 2 : -2) : 0);
		}
		const peakBar = rng() < 0.5 ? 1 : 2; // one leap-to-peak per phrase

		for (let bar = 0; bar < 4; bar++) {
			const chordRootStep = CHORD_ROOTS[bar];
			const rhythm = bar === 3 ? CADENCE_TIERS[tier] : motif;
			const invert = bar >= 2 ? -1 : 1; // Principle 3 — consequent mirrors the contour
			const bias = bar <= 1 ? 1 : -1; // antecedent drifts up, consequent down
			let beatInBar = 0;
			let ci = 0;
			for (const ev of rhythm) {
				if (ev.rest) {
					notes.push({ midi: 0, dur: ev.d, rest: true });
					beatInBar += ev.d;
					continue;
				}
				const strong = beatInBar % 2 === 0; // beats 1 & 3 = harmonic anchors
				let delta = contour[ci % 8] * invert;
				if (bar === peakBar && ci === 1) delta += 2; // the phrase's leap
				if (rng() < 0.25) delta += bias; // gentle directional pull
				step = clampStep(step + delta);
				// Principle 1 — harmonic awareness: chord tone on strong beats,
				// pentatonic passing note on weak beats.
				step = strong ? nearestChordTone(step, chordRootStep) : toPenta(step);
				emit(step, ev.d);
				beatInBar += ev.d;
				ci++;
			}
			// Principle 3 — cadences: half-cadence (V) closes the question,
			// authentic cadence (held tonic) closes the answer.
			if (bar === 1) {
				step = nearestChordTone(step, 4);
				forceLast(step);
			}
			if (bar === 3) {
				step = nearestTonic(step);
				forceLast(step, 2);
			}
		}
		phrase++;
	}
	return { name: 'Infini', tempo: 2, key: KEY, notes };
}

export interface EndlessOpts {
	baseTempo?: number; // beats/sec at the start
	rampSec?: number; // seconds of play to add +100% tempo
	maxMult?: number; // tempo ceiling (× baseTempo)
	count?: number;
}
/**
 * Endless chart whose tempo RAMPS UP over the run: successive notes get closer
 * together, so it grows faster and denser the longer you survive. The daily/free
 * `speed` still scales the starting tempo.
 */
export function buildEndlessChart(seed: number, speed = 1, opts: EndlessOpts = {}): Chart {
	const base = (opts.baseTempo ?? 2) * speed;
	const ramp = opts.rampSec ?? 85; // gentle: reach the ceiling only after a long run
	const maxMult = opts.maxMult ?? 1.7; // modest tempo ceiling (× baseTempo)
	const song = generateEndlessSong(seed, opts.count ?? 1500);

	// Notes now carry fractional durations (eighths, dotted…), so we can no longer
	// assume one note == one beat. Build an INTEGER-beat time grid first: each beat
	// is shorter than the last as the tempo ramps. Note times are then interpolated
	// on this grid, which keeps the backing (locked to whole beats) in sync.
	const totalBeats = song.notes.reduce((s, n) => s + n.dur, 0);
	const beatTime = [0];
	let t = 0;
	for (let b = 0; b < Math.ceil(totalBeats) + 4; b++) {
		t += 1 / (base * Math.min(maxMult, 1 + t / ramp)); // this beat's length (accelerating)
		beatTime.push(t);
	}
	// Seconds at a fractional beat position, linearly interpolated between grid points.
	const at = (beatPos: number): number => {
		const i = Math.min(Math.floor(beatPos), beatTime.length - 2);
		return beatTime[i] + (beatPos - i) * (beatTime[i + 1] - beatTime[i]);
	};

	const tiles: Tile[] = [];
	let beat = 0;
	for (const n of song.notes) {
		if (!n.rest) {
			const time = at(beat);
			tiles.push({ time, lane: n.lane ?? 0, midi: n.midi, dur: at(beat + n.dur) - time, hold: n.dur >= HOLD_BEATS });
		}
		beat += n.dur;
	}
	// Whole-beat grid for the groove (kick/bass/pad step on these).
	const beatTimes: number[] = [];
	for (let b = 0; b <= Math.ceil(totalBeats); b++) beatTimes.push(beatTime[b]);
	return { tiles, totalTime: at(totalBeats), beatTimes, key: song.key };
}

export type Grade = 'Parfait' | 'Bien' | 'Ok' | 'Raté';
/** Timing judgment from the absolute offset (seconds) between tap and the tile's hit time. */
export function judgeTiming(absSec: number): { grade: Grade; points: number } | null {
	if (absSec <= 0.09) return { grade: 'Parfait', points: 100 };
	if (absSec <= 0.18) return { grade: 'Bien', points: 60 };
	if (absSec <= 0.28) return { grade: 'Ok', points: 30 };
	return null; // out of the hittable window
}

export const comboMult = (combo: number): number => Math.min(4, 1 + Math.floor(combo / 5) * 0.5);

export function rankOf(meanPoints: number): 'S' | 'A' | 'B' | 'C' | 'D' {
	if (meanPoints >= 92) return 'S';
	if (meanPoints >= 78) return 'A';
	if (meanPoints >= 60) return 'B';
	if (meanPoints >= 40) return 'C';
	return 'D';
}
