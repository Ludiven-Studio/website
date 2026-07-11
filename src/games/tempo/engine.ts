/* =====================================================
   TEMPO — pure engine for a "piano tiles" rhythm game.
   Public-domain melodies → a falling-tile chart (lane per note, hit time in
   seconds). An endless mode streams a seeded generated melody. Long notes are
   HOLD tiles (press-and-hold for bonus). Timing judgment + scoring live here.
   ===================================================== */

import { mulberry32 } from '../prng';

export const LANES = 6; // columns, ordered low pitch (left) → high pitch (right)
export const HOLD_BEATS = 3; // a note this long (or longer) becomes a hold tile

export interface ChordBar {
	root: number; // semitones from key
	third: number; // 3 (minor) or 4 (major)
}
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
	chords?: ChordBar[]; // one per bar, aligned with the beat grid
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
	chords: ChordBar[]; // one per bar (bar i = beats 4i..4i+3) — backing follows these
	introTime: number; // seconds of chord-only intro before the first tile
}

/* --- Music theory scaffolding for the generator -------------------------- */
const MAJOR = [0, 2, 4, 5, 7, 9, 11]; // major scale, semitones per scale-STEP
// 4-bar progressions (scale-STEP roots). ONE is seed-picked per song and LOOPS
// for the whole tune: the melody develops over a stable, repeating harmonic
// base. Melody snapping and the backing both derive from it, bar for bar.
const PROGRESSIONS: number[][] = [
	[0, 4, 5, 3], // I  V  vi IV
	[5, 3, 0, 4], // vi IV I  V
	[0, 5, 3, 4], // I  vi IV V
];
/** Chord of a scale-step root as semitones from key (third: 4 major, 3 minor). */
const chordBarOf = (rootStep: number): ChordBar => {
	const root = MAJOR[((rootStep % 7) + 7) % 7];
	const third = (MAJOR[(((rootStep + 2) % 7) + 7) % 7] - root + 12) % 12;
	return { root, third };
};
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

// Rhythm cells by density (0 sparse, 1 medium, 2 flowing). Minimum duration is
// ONE BEAT everywhere (never shorter than a quarter note, always on the grid).
// Every cell sums to EXACTLY 4 beats so bars stay aligned with the backing.
type Cell = { d: number; rest?: boolean }[];
const CELLS: Cell[][] = [
	[
		// 0 — sparse
		[{ d: 4 }],
		[{ d: 2 }, { d: 2 }],
		[{ d: 3 }, { d: 1 }],
		[{ d: 2 }, { d: 1, rest: true }, { d: 1 }],
	],
	[
		// 1 — medium
		[{ d: 2 }, { d: 1 }, { d: 1 }],
		[{ d: 1 }, { d: 1 }, { d: 2 }],
		[{ d: 1 }, { d: 2 }, { d: 1 }],
		[{ d: 1 }, { d: 1, rest: true }, { d: 1 }, { d: 1 }],
	],
	[
		// 2 — flowing
		[{ d: 1 }, { d: 1 }, { d: 1 }, { d: 1 }],
		[{ d: 1 }, { d: 1 }, { d: 2 }],
		[{ d: 2 }, { d: 1 }, { d: 1 }],
	],
];
// Cadence cells (a phrase's last bar) — always close on a long note.
const CADENCES: Cell[] = [
	[{ d: 1 }, { d: 3 }],
	[{ d: 2 }, { d: 2 }],
	[{ d: 1 }, { d: 1 }, { d: 2 }],
	[{ d: 4 }],
];
// Phrase archetypes: densities for bars [A, B, A′] — bar 3 is always a cadence.
const ARCHETYPES: [number, number, number][] = [
	[1, 0, 1], // statement – breath – restatement
	[2, 1, 2], // flowing question / answer
	[0, 1, 2], // building
	[2, 2, 1], // running, then settling
	[1, 2, 1], // arch
	[0, 2, 0], // calm – burst – calm
];
// Archetype pools per song section: the couplet stays calm, the refrain flows,
// the bridge contrasts by breathing.
const VERSE_ARCHS: [number, number, number][] = [ARCHETYPES[0], ARCHETYPES[2], ARCHETYPES[4]];
const CHORUS_ARCHS: [number, number, number][] = [ARCHETYPES[1], ARCHETYPES[3], ARCHETYPES[4]];
const BRIDGE_ARCHS: [number, number, number][] = [ARCHETYPES[5], ARCHETYPES[0]];

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
 * Endless generated tune, structured like a SONG rather than a random stream.
 * Deterministic from the seed. The melody is still PLAYED by the player's taps;
 * this only shapes which notes fall when. Long enough to outlast any run.
 *
 * Three 4-bar THEMES are composed once — couplet (A, mid register, calm),
 * refrain (B, higher, flowing) and pont (C, sparse contrast) — then replayed
 * VERBATIM following a pop form (A A B B A B C B, cycled), so returning
 * sections are recognizable. Inside a theme, an ARCHETYPE picks rhythm
 * densities, the pitch line follows an arch contour, leaps recover by step,
 * and bar 3 replays bar 1's deltas (varied repeat). ONE seed-picked
 * progression loops for the whole song and is returned alongside the notes so
 * the backing follows the same harmony.
 */
export function generateEndlessSong(seed: number, count = 600): Song {
	const rng = mulberry32(seed >>> 0);
	const KEY = 43; // tonic midi for the bass accompaniment (G2)
	const TONIC = 55; // tonic midi the melody sings around (G3)
	const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
	const prog = pick(PROGRESSIONS); // the song's repeating harmonic base
	const notes: SongNote[] = [];
	const chords: ChordBar[] = [];

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
	// Chord tones of `rootStep` across the register, sorted — for arpeggio bars.
	const chordLadder = (rootStep: number): number[] => {
		const tones: number[] = [];
		for (let oct = -7; oct <= 14; oct += 7)
			for (const t of [rootStep, rootStep + 2, rootStep + 4]) {
				const c = t + oct;
				if (c >= MIN_STEP && c <= MAX_STEP) tones.push(c);
			}
		return tones.sort((a, b) => a - b);
	};

	// A theme is a fully-resolved 4-bar phrase (rhythm + final scale-steps),
	// composed ONCE and replayed verbatim wherever the FORM calls for it.
	type ThemeEv = { d: number; rest?: boolean; step?: number };
	const makeTheme = (startStep: number, archs: readonly [number, number, number][]): ThemeEv[][] => {
		const arch = pick(archs);
		const cellA = pick(CELLS[arch[0]]);
		const cellB = pick(CELLS[arch[1]]);
		// A′ restates A's rhythm when densities match — the answer echoes the question.
		const cellA2 = arch[0] === arch[2] ? cellA : pick(CELLS[arch[2]]);
		const bars: Cell[] = [cellA, cellB, cellA2, pick(CADENCES)];

		// Arch contour: first half favors ascent, second half descent.
		const contour: number[] = [];
		for (let k = 0; k < 8; k++) {
			const r = rng();
			const mag = r < 0.7 ? (rng() < 0.72 ? 1 : 2) : r < 0.9 ? (rng() < 0.72 ? -1 : -2) : 0;
			contour.push(k < 4 ? mag : -mag);
		}

		const theme: ThemeEv[][] = [];
		const barADeltas: number[] = []; // bar 0's melodic deltas, replayed in bar 2
		let step = clampStep(startStep); // the section's register anchor
		let lastDelta = 0;
		let ci = 0;

		for (let bar = 0; bar < 4; bar++) {
			const chordRootStep = prog[bar];
			const rhythm = bars[bar];
			// Occasionally a bar walks the chord itself instead of the contour.
			const arp = bar < 3 && rng() < 0.18;
			const arpDir = arp && rng() < 0.5 ? -1 : 1;
			const ladder = arp ? chordLadder(chordRootStep) : [];
			let arpIdx = arp ? Math.max(0, ladder.indexOf(nearestChordTone(step, chordRootStep))) : 0;
			let beatInBar = 0;
			let noteInBar = 0;
			const out: ThemeEv[] = [];
			for (const ev of rhythm) {
				if (ev.rest) {
					out.push({ d: ev.d, rest: true });
					beatInBar += ev.d;
					continue;
				}
				if (arp) {
					if (noteInBar > 0) arpIdx = Math.max(0, Math.min(ladder.length - 1, arpIdx + arpDir));
					step = ladder[arpIdx];
				} else {
					const strong = beatInBar % 2 === 0; // beats 1 & 3 = harmonic anchors
					let delta: number;
					if (bar === 2 && noteInBar < barADeltas.length) {
						delta = barADeltas[noteInBar]; // varied repeat over bar 2's chord
					} else {
						delta = contour[ci % 8];
						if (Math.abs(lastDelta) >= 2) delta = -Math.sign(lastDelta); // leap → step back
						ci++;
					}
					if (bar === 0) barADeltas.push(delta);
					lastDelta = delta;
					step = clampStep(step + delta);
					// Chord tone on strong beats AND on long notes (they ring against the
					// chord); pentatonic passing note on short weak beats.
					step = strong || ev.d >= 2 ? nearestChordTone(step, chordRootStep) : toPenta(step);
				}
				out.push({ d: ev.d, step });
				beatInBar += ev.d;
				noteInBar++;
			}
			// Cadences (recorded into the theme so every replay closes the same way):
			// bar 1 closes on its own chord, bar 3 on the tonic — or a V tone when the
			// loop ends open on V (pulls into the next section's restart on I).
			if (bar === 1 || bar === 3) {
				const target = bar === 1 ? nearestChordTone(step, prog[1]) : prog[3] === 4 ? nearestChordTone(step, 4) : nearestTonic(step);
				for (let i = out.length - 1; i >= 0; i--) {
					if (!out[i].rest) {
						out[i].step = target;
						step = target;
						break;
					}
				}
			}
			theme.push(out);
		}
		return theme;
	};
	const playTheme = (theme: ThemeEv[][]): void => {
		for (let bar = 0; bar < 4; bar++) {
			chords.push(chordBarOf(prog[bar]));
			for (const ev of theme[bar]) {
				if (ev.rest) notes.push({ midi: 0, dur: ev.d, rest: true });
				else emit(ev.step!, ev.d);
			}
		}
	};

	// Compose the song's three themes, then cycle a pop form. The refrain sits
	// higher than the couplet so its return is unmistakable; the pont breathes.
	const themeA = makeTheme(0, VERSE_ARCHS); // couplet
	const themeB = makeTheme(4, CHORUS_ARCHS); // refrain
	const themeC = makeTheme(2, BRIDGE_ARCHS); // pont
	const FORM = [themeA, themeA, themeB, themeB, themeA, themeB, themeC, themeB];
	let fi = 0;
	while (notes.length < count) playTheme(FORM[fi++ % FORM.length]);
	return { name: 'Infini', tempo: 2, key: KEY, notes, chords };
}

export interface EndlessOpts {
	baseTempo?: number; // beats/sec at the start
	rampSec?: number; // seconds of play to add +100% tempo
	maxMult?: number; // tempo ceiling (× baseTempo)
	count?: number;
}
// Tempo curve per difficulty tier (same order as SPEEDS; speed multiplies on top).
// Note values are floored at 1 beat, so the ramp is the ONLY acceleration.
export const ENDLESS_OPTS: EndlessOpts[] = [
	{ baseTempo: 1.8, rampSec: 130, maxMult: 1.35 }, // Facile
	{ baseTempo: 1.8, rampSec: 110, maxMult: 1.45 }, // Moyen
	{ baseTempo: 1.8, rampSec: 95, maxMult: 1.5 }, // Difficile
];
export const INTRO_BEATS = 16; // 4 bars: the full chord loop plays once before the first tile
/**
 * Endless chart whose tempo RAMPS UP gently over the run: successive beats get
 * shorter, so it grows faster the longer you survive. The daily/free `speed`
 * still scales the starting tempo. Opens with a 4-bar intro (backing only) that
 * states the whole progression once before the melody enters.
 */
export function buildEndlessChart(seed: number, speed = 1, opts: EndlessOpts = {}): Chart {
	const base = (opts.baseTempo ?? 1.8) * speed;
	const ramp = opts.rampSec ?? 110; // gentle: reach the ceiling only after a long run
	const maxMult = opts.maxMult ?? 1.45; // modest tempo ceiling (× baseTempo)
	const song = generateEndlessSong(seed, opts.count ?? 1500);

	// Build an INTEGER-beat time grid: each beat is shorter than the last as the
	// tempo ramps. Note times are interpolated on this grid, which keeps the
	// backing (locked to whole beats) in sync. Beats 0..INTRO_BEATS-1 are the intro.
	const totalBeats = song.notes.reduce((s, n) => s + n.dur, 0) + INTRO_BEATS;
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
	let beat = INTRO_BEATS; // melody enters after the intro
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
	// One chord per bar, padded to cover the whole grid. The intro states the
	// song's full 4-chord loop once, so the melody enters on the loop's restart.
	const songChords = song.chords ?? [];
	const introChords = songChords.length >= 4 ? songChords.slice(0, 4) : Array.from({ length: 4 }, () => ({ root: 0, third: 4 }));
	const barCount = Math.ceil(totalBeats / 4);
	const chords = [...introChords, ...songChords].slice(0, barCount);
	while (chords.length < barCount) chords.push(chords[chords.length - 1] ?? { root: 0, third: 4 });
	return { tiles, totalTime: at(totalBeats), beatTimes, key: song.key, chords, introTime: at(INTRO_BEATS) };
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
