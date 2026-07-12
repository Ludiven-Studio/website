/* =====================================================
   TEMPO — pure engine for a "piano tiles" rhythm game.
   Public-domain melodies → a falling-tile chart (lane per note, hit time in
   seconds). An endless mode streams a seeded generated melody. Long notes are
   HOLD tiles (press-and-hold for bonus). Timing judgment + scoring live here.
   ===================================================== */

import { mulberry32 } from '../prng';

export const LANES = 6; // columns, ordered low pitch (left) → high pitch (right)
export const HOLD_BEATS = 3; // a note this long (or longer) becomes a hold tile

// A diatonic NINTH chord (5 notes: root, 3rd, 5th, 7th, 9th stacked in the
// scale). Degrees are filtered so the fifth is always perfect and the ninth
// always major — every combination is consonant.
export interface ChordBar {
	root: number; // semitones from key
	third: number; // 3 (minor) or 4 (major)
	seventh: number; // 10 (minor) or 11 (major)
	ninth: number; // 14
}
export interface SongNote {
	midi: number;
	dur: number; // beats
	rest?: boolean; // a silence: advances time, produces no tile
	lane?: number; // column, assigned by the generator (see laneOfStep)
}
export type Section = 'I' | 'A' | 'B' | 'C'; // intro, couplet, refrain, pont
export interface Song {
	name: string;
	tempo: number; // beats per second at speed 1
	key: number; // tonic midi (used for the bass accompaniment)
	notes: SongNote[];
	lead?: SongNote[]; // ornate melody line (sub-beat runs, turns) — same total beats as notes
	chords?: ChordBar[]; // one per bar, aligned with the beat grid
	sections?: Section[]; // one per bar — drives arrangement (fills, drops)
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
	sections: Section[]; // one per bar — the backing reads fills & drum drops off it
	lead: { time: number; midi: number; dur: number }[]; // ornate melody for the auto-lead voice — richer than the playable tiles
	introTime: number; // seconds of chord-only intro before the first tile
}

/* --- Music theory scaffolding for the generator -------------------------- */
const MAJOR = [0, 2, 4, 5, 7, 9, 11]; // major scale, semitones per scale-STEP
// Progression degree pools. iii is excluded (its diatonic 9th is a flat 9 —
// dissonant) and vii° too (diminished fifth). Majors and minors ALTERNATE in
// the generated loop, and roots move by strong intervals (falling fifth,
// falling third, rising second), which is what makes a chord loop "turn" well.
const MAJOR_DEGREES = [0, 3, 4]; // I  IV V
const MINOR_DEGREES = [1, 5]; // ii vi
// Scale-step deltas mod 7, strongest first: down 5th, down 3rd, down 4th,
// up 2nd, down 2nd. Only the ascending 3rd (+2) is excluded as weak.
const STRONG_MOTIONS = [3, 5, 4, 1, 6];
/** Diatonic ninth chord of a scale-step root, as semitones from the key. */
const chordBarOf = (rootStep: number): ChordBar => {
	const r = ((rootStep % 7) + 7) % 7;
	const iv = (n: number): number => (MAJOR[(r + n) % 7] - MAJOR[r] + 12) % 12;
	return { root: MAJOR[r], third: iv(2), seventh: iv(6), ninth: iv(1) + 12 };
};
/**
 * Seeded 4-chord loop: alternating major/minor degrees linked by strong root
 * motion, ending on a degree that pulls back to the loop's start. Rejection
 * sampling with a safe fallback (I–vi–IV–ii).
 */
const makeProgression = (rng: () => number): number[] => {
	const pickFrom = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
	for (let attempt = 0; attempt < 20; attempt++) {
		const startMajor = rng() < 0.6;
		const prog = [startMajor ? pickFrom(MAJOR_DEGREES) : pickFrom(MINOR_DEGREES)];
		let ok = true;
		for (let k = 1; k < 4; k++) {
			const pool = (k % 2 === 0) === startMajor ? MAJOR_DEGREES : MINOR_DEGREES;
			// Prefer the strongest root motion available from the previous chord.
			const cands = STRONG_MOTIONS.map((m) => (prog[k - 1] + m) % 7).filter((d) => pool.includes(d) && d !== prog[k - 1]);
			if (!cands.length) {
				ok = false;
				break;
			}
			prog.push(cands[Math.floor(rng() * cands.length)]);
		}
		if (!ok) continue;
		if (new Set(prog).size !== 4) continue; // 4 DIFFERENT chords, no shortcuts
		// The loop must turn: last → first is also a strong motion.
		if (!STRONG_MOTIONS.includes((prog[0] - prog[3] + 7) % 7)) continue;
		return prog;
	}
	return [0, 5, 3, 1]; // I vi IV ii — always safe
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
// Arrival-note CONTOURS: per-bar register offsets for each bar's target note.
// Seed-picked per theme, so phrases land on different notes with different
// shapes — arch, descent, early peak, dip-then-climb, gentle rise.
const CONTOURS: number[][] = [
	[0, 2, 4, 0], // arch to a late peak
	[4, 2, 1, 0], // long descent home
	[0, 4, 2, 0], // early peak, settle
	[2, 0, 4, 0], // dip, then climb
	[0, 1, 3, 0], // gentle rise
];

const degToMidi = (tonic: number, step: number): number => tonic + Math.floor(step / 7) * 12 + MAJOR[((step % 7) + 7) % 7];
const clampStep = (s: number): number => Math.max(MIN_STEP, Math.min(MAX_STEP, s));
// Chord-tone scale-step offsets of a ninth chord: root, 3rd, 5th, 7th, 9th.
const CHORD_TONE_OFFSETS = [0, 2, 4, 6, 8];
/**
 * Nearest chord tone (of the full ninth chord) to `step`, kept in register.
 * `exclude` skips one step — used to break note repetitions by picking the
 * SECOND nearest chord tone instead.
 */
const nearestChordTone = (step: number, chordRootStep: number, exclude?: number): number => {
	let best = step;
	let bestDist = Infinity;
	for (let oct = -7; oct <= 14; oct += 7) {
		for (const o of CHORD_TONE_OFFSETS) {
			const cand = chordRootStep + o + oct;
			if (cand < MIN_STEP || cand > MAX_STEP || cand === exclude) continue;
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
/**
 * Classic "avoid note": a pitch one semitone ABOVE a chord tone clashes with it
 * (e.g. the 4th over a major chord, or the tonic over V). Chord tones themselves
 * are never avoid notes (the root sits a semitone above a major 7th and must
 * stay legal). Passing notes that land there resolve down onto the tone below.
 */
const isAvoidNote = (step: number, chordRootStep: number): boolean => {
	const pcOf = (s: number): number => MAJOR[((s % 7) + 7) % 7];
	const pc = pcOf(step);
	const tones = CHORD_TONE_OFFSETS.map((o) => pcOf(chordRootStep + o));
	if (tones.includes(pc)) return false; // chord membership wins
	return tones.some((t) => (pc - t + 12) % 12 === 1);
};
/** Closest tonic degree (unison or octave, in register) for the final cadence. */
const nearestTonic = (step: number): number => (Math.abs(step - 0) <= Math.abs(step - 7) ? 0 : 7);

/**
 * Ornate LEAD line derived from the playable notes: the tiles stay the SIMPLE
 * melody the player taps, while this version adds sub-beat expression — runs
 * of passing 8ths toward wide leaps, and turns (upper-neighbor re-lights) on
 * long notes. Every ornament preserves the note's total duration, so the lead
 * stays beat-for-beat aligned with the tiles.
 */
const buildLead = (notes: SongNote[], rng: () => number, tonic: number): SongNote[] => {
	const stepOf = new Map<number, number>();
	for (let s = MIN_STEP; s <= MAX_STEP; s++) stepOf.set(degToMidi(tonic, s), s);
	const lead: SongNote[] = [];
	for (let i = 0; i < notes.length; i++) {
		const n = notes[i];
		if (n.rest) {
			lead.push({ ...n });
			continue;
		}
		const next = notes.slice(i + 1).find((x) => !x.rest);
		const s = stepOf.get(n.midi);
		const ns = next ? stepOf.get(next.midi) : undefined;
		// Run: fill a wide leap with two passing 8ths walking toward the next note.
		if (n.dur >= 2 && s != null && ns != null && Math.abs(ns - s) >= 3 && rng() < 0.6) {
			lead.push({ midi: n.midi, dur: n.dur - 1 });
			const dir = ns > s ? 1 : -1;
			lead.push({ midi: degToMidi(tonic, clampStep(s + dir)), dur: 0.5 });
			lead.push({ midi: degToMidi(tonic, clampStep(s + 2 * dir)), dur: 0.5 });
			continue;
		}
		// Turn: a long note re-lit by its upper neighbor right after it lands.
		if (n.dur >= 2 && s != null && rng() < 0.35) {
			lead.push({ midi: n.midi, dur: 0.5 });
			lead.push({ midi: degToMidi(tonic, clampStep(s + 1)), dur: 0.5 });
			lead.push({ midi: n.midi, dur: n.dur - 1 });
			continue;
		}
		lead.push({ midi: n.midi, dur: n.dur });
	}
	return lead;
};

/**
 * Endless generated tune, structured like a SONG rather than a random stream.
 * Deterministic from the seed. The melody is still PLAYED by the player's taps;
 * this only shapes which notes fall when. Long enough to outlast any run.
 *
 * A recurring MOTIF (tonic → arch up → back to tonic) plus three 4-bar THEMES
 * are composed once — couplet (A, mid register, opens with the motif), refrain
 * (B, higher, quotes the motif's rise) and pont (C, sparse contrast) — then
 * replayed VERBATIM following a pop form (A A B B A B C B, cycled), so
 * returning sections are recognizable. Inside a theme, an ARCHETYPE picks rhythm
 * densities and the pitch line follows a FIBONACCI walk (mod 8 → scale degrees
 * around the section's register), snapped to the harmony with a no-repeat
 * rule. Each theme is built on ARRIVAL NOTES: a seed-picked contour lays one
 * target chord tone per bar, and the line WALKS toward each arrival — phrases
 * land somewhere deliberate, and different themes land differently. ONE
 * seed-picked progression loops for the whole song and is returned alongside
 * the notes so the backing follows the same harmony.
 */
export function generateEndlessSong(seed: number, count = 600): Song {
	const rng = mulberry32(seed >>> 0);
	const KEY = 38 + Math.floor(rng() * 12); // seed-picked tonic (D2..C#3) — every song has its own color
	const TONIC = KEY + 12; // tonic midi the melody sings around
	const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
	const prog = makeProgression(rng); // the song's repeating harmonic base
	const notes: SongNote[] = [];
	const chords: ChordBar[] = [];
	const sections: Section[] = [];

	let lastStep: number | null = null; // last EMITTED (non-rest) step, for column checks

	// Emit a note at `s`, but if it would land in the same column as the previous
	// note while being a different pitch, nudge it diatonically until the column
	// differs — trying the melodic direction first, then the opposite one, so a
	// register edge doesn't collapse into a repeated note.
	const emit = (s: number, dur: number): void => {
		if (lastStep != null && s !== lastStep && laneOfStep(s) === laneOfStep(lastStep)) {
			const pref = s > lastStep ? 1 : -1;
			let resolved = lastStep;
			for (const dir of [pref, -pref]) {
				let n = s;
				while (n + dir >= MIN_STEP && n + dir <= MAX_STEP && laneOfStep(n) === laneOfStep(lastStep)) n += dir;
				if (laneOfStep(n) !== laneOfStep(lastStep)) {
					resolved = n;
					break;
				}
			}
			s = resolved;
		}
		lastStep = s;
		notes.push({ midi: degToMidi(TONIC, s), dur, lane: laneOfStep(s) });
	};
	// Chord tones of `rootStep` across the register (incl. the 7th), sorted —
	// for arpeggio bars.
	const chordLadder = (rootStep: number): number[] => {
		const tones: number[] = [];
		for (let oct = -7; oct <= 14; oct += 7)
			for (const t of [rootStep, rootStep + 2, rootStep + 4, rootStep + 6]) {
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

		// Fibonacci walk (mod 8): a structured, non-repeating degree sequence — the
		// melodic skeleton. Seeds vary per theme, so couplet and refrain differ.
		let fa = 1 + Math.floor(rng() * 6);
		let fb = 1 + Math.floor(rng() * 6);
		const nextFib = (): number => {
			const v = (fa + fb) % 8;
			fa = fb;
			fb = v;
			if (fa === 0 && fb === 0) fb = 1; // never collapse to all-zeros
			return v;
		};

		// ARRIVAL-NOTE architecture: pick one target note per bar (a chord tone
		// laid on a seed-picked CONTOUR), then walk each bar's interior TOWARD its
		// arrival. Phrases differ by contour instead of all sharing one fixed arc,
		// and every bar lands somewhere deliberate.
		const contour = pick(CONTOURS);
		const targets: number[] = [];
		for (let bar = 0; bar < 4; bar++) {
			const jitter = Math.floor(rng() * 3) - 1; // -1..+1: same contour, different notes
			targets.push(nearestChordTone(clampStep(startStep + contour[bar] + jitter), prog[bar]));
		}
		// The final arrival keeps its cadential function: tonic — or a V tone when
		// the loop ends open on V (pulls into the next section's restart on I).
		targets[3] = prog[3] === 4 ? nearestChordTone(clampStep(startStep + 2), 4) : nearestTonic(clampStep(startStep));

		const theme: ThemeEv[][] = [];
		let step = clampStep(startStep); // the section's register anchor
		let prev: number | null = null; // last melody step, for the no-repeat rule

		for (let bar = 0; bar < 4; bar++) {
			const chordRootStep = prog[bar];
			const rhythm = bars[bar];
			// The QUESTION bar may walk the chord instead of the line (it still
			// lands on its arrival note).
			const arp = bar === 1 && rng() < 0.15;
			let arpDir = arp && rng() < 0.5 ? -1 : 1;
			const ladder = arp ? chordLadder(chordRootStep) : [];
			let arpIdx = arp ? Math.max(0, ladder.indexOf(nearestChordTone(step, chordRootStep))) : 0;
			const noteCount = rhythm.filter((e) => !e.rest).length;
			let beatInBar = 0;
			let noteInBar = 0;
			const out: ThemeEv[] = [];
			for (const ev of rhythm) {
				if (ev.rest) {
					out.push({ d: ev.d, rest: true });
					beatInBar += ev.d;
					continue;
				}
				if (noteInBar === noteCount - 1) {
					// The bar's ARRIVAL: land exactly on the target (already a chord tone).
					step = targets[bar];
				} else if (arp) {
					if (noteInBar > 0) {
						let ni = arpIdx + arpDir;
						if (ni < 0 || ni >= ladder.length) {
							arpDir = -arpDir; // ping-pong at the register edge (no sticking)
							ni = arpIdx + arpDir;
						}
						arpIdx = ni;
					}
					step = ladder[arpIdx];
				} else {
					const strong = beatInBar % 2 === 0; // beats 1 & 3 = harmonic anchors
					// Directed walk: cover the remaining gap to the arrival in roughly
					// equal steps, with a Fibonacci wobble for character.
					const remaining = noteCount - noteInBar;
					const gap = targets[bar] - step;
					let delta = Math.round(gap / remaining);
					const v = nextFib();
					if (delta === 0) delta = v >= 4 ? 1 : -1; // keep moving, direction by fib
					else if (v % 3 === 0) delta += v >= 4 ? 1 : -1; // detour, recovered next step
					step = clampStep(step + delta);
					// Chord tone on strong beats AND on long notes (they ring against the
					// chord); pentatonic passing note on short weak beats — resolved down
					// when it lands on the chord's avoid note (semitone above a chord tone).
					if (strong || ev.d >= 2) step = nearestChordTone(step, chordRootStep);
					else {
						step = toPenta(step);
						if (isAvoidNote(step, chordRootStep)) step = clampStep(step - 1);
					}
					// No immediate repeats: snapping can converge on the previous note —
					// push to the next chord tone (or diatonic neighbor) instead.
					if (step === prev) {
						const dir = gap > 0 ? 1 : -1;
						if (strong || ev.d >= 2) step = nearestChordTone(clampStep(prev + dir), chordRootStep, prev);
						else {
							step = toPenta(clampStep(prev + dir));
							if (isAvoidNote(step, chordRootStep)) step = clampStep(step - 1);
							if (step === prev) step = clampStep(prev + 2 * dir);
						}
					}
				}
				prev = step;
				out.push({ d: ev.d, step });
				beatInBar += ev.d;
				noteInBar++;
			}
			theme.push(out);
		}
		return theme;
	};
	// Replay a theme with a per-occurrence VARIATION, so repeats stay familiar
	// but not identical: 'echo' re-strikes long notes on their last beat (drive),
	// 'calm' merges 1-beat pairs into a held note (breathes). Bar sums stay 4.
	type Variant = 'plain' | 'echo' | 'calm';
	const playTheme = (theme: ThemeEv[][], variant: Variant, label: Section): void => {
		for (let bar = 0; bar < 4; bar++) {
			chords.push(chordBarOf(prog[bar]));
			sections.push(label);
			const evs = theme[bar];
			for (let i = 0; i < evs.length; i++) {
				const ev = evs[i];
				if (ev.rest) {
					notes.push({ midi: 0, dur: ev.d, rest: true });
					continue;
				}
				if (variant === 'echo' && ev.d >= 3) {
					emit(ev.step!, ev.d - 1);
					emit(ev.step!, 1);
					continue;
				}
				if (variant === 'calm' && bar < 3 && ev.d === 1 && i + 1 < evs.length && !evs[i + 1].rest && evs[i + 1].d === 1) {
					emit(ev.step!, 2);
					i++;
					continue;
				}
				emit(ev.step!, ev.d);
			}
		}
	};

	// The song's HOOK: a 2-bar arch phrase — starts ON THE TONIC, climbs toward
	// a high fundamental (octave), and settles back down on the tonic. Quoted at
	// several points of the form so the ear keeps finding it again.
	const makeMotif = (): ThemeEv[][] => {
		const mid = 1 + Math.floor(rng() * 2); // 2nd or 3rd degree
		const high = 3 + Math.floor(rng() * 2); // 4th or 5th
		const peak = rng() < 0.7 ? 7 : 8; // the arch's top: octave (or the 9th)
		const fall = rng() < 0.5 ? 4 : 2; // stepping stone on the way back down
		// Opening GESTURE, seed-picked — the hook doesn't always start the same
		// way: stepwise climb, LONG held tonic, high start on the octave (still
		// the tonic, an octave up), leap-and-sigh, or a running four.
		const rises: ThemeEv[][] = [
			[{ d: 1, step: 0 }, { d: 1, step: mid }, { d: 2, step: high }], // stepwise climb
			[{ d: 2, step: 0 }, { d: 2, step: high }], // long tonic, then the leap
			[{ d: 2, step: 7 }, { d: 1, step: high }, { d: 1, step: peak }], // high start, dip, push to the peak
			[{ d: 1, step: 0 }, { d: 1, step: high }, { d: 2, step: mid }], // leap up, sigh back
			[{ d: 1, step: 0 }, { d: 1, step: mid }, { d: 1, step: high }, { d: 1, step: high + 2 }], // running four
		];
		const rise = rises[Math.floor(rng() * rises.length)];
		const back: ThemeEv[] = [{ d: 1, step: peak }, { d: 1, step: fall }, { d: 2, step: 0 }];
		return [rise, back];
	};

	// Compose the motif and the three themes, then cycle a pop form. The refrain
	// sits higher than the couplet so its return is unmistakable; the pont
	// breathes. Each theme states itself plainly first, then varies on returns.
	const motif = makeMotif();
	const themeA = makeTheme(0, VERSE_ARCHS); // couplet
	const themeB = makeTheme(4, CHORUS_ARCHS); // refrain
	const themeC = makeTheme(2, BRIDGE_ARCHS); // pont
	// Shape the stories around the hook.
	// Couplet: motif stated (rise + fall, bars 0-1), then a FREE contour-driven
	// answer (bars 2-3) — the hook recurs without freezing the whole phrase.
	// Refrain: opens on an upward 5th LEAP (the epic call), walks its arrivals,
	// quotes the motif's rise in bar 2, cadences from up high. The motif's tonal
	// notes sit inside every diatonic ninth chord, so the verbatim quotes stay
	// consonant over the rotating bars.
	themeA[0] = motif[0];
	themeA[1] = motif[1];
	{
		const opening = themeB[0].filter((e) => !e.rest);
		if (opening.length >= 2) {
			// Upward leap of a 4th-6th, seed-varied so refrains don't all call the same.
			opening[0].step = 3 + Math.floor(rng() * 2);
			opening[1].step = nearestChordTone(clampStep(opening[0].step! + 3 + Math.floor(rng() * 3)), prog[0]);
		}
	}
	themeB[2] = motif[0];
	const FORM: [ThemeEv[][], Section][] = [
		[themeA, 'A'],
		[themeA, 'A'],
		[themeB, 'B'],
		[themeB, 'B'],
		[themeA, 'A'],
		[themeB, 'B'],
		[themeC, 'C'],
		[themeB, 'B'],
	];
	const VAR_CYCLE = new Map<ThemeEv[][], Variant[]>([
		[themeA, ['plain', 'plain', 'calm', 'echo']],
		[themeB, ['plain', 'plain', 'echo', 'plain', 'echo', 'calm']],
		[themeC, ['plain', 'calm']],
	]);
	const occ = new Map<ThemeEv[][], number>();
	let fi = 0;
	while (notes.length < count) {
		const [theme, label] = FORM[fi++ % FORM.length];
		const n = occ.get(theme) ?? 0;
		occ.set(theme, n + 1);
		const vars = VAR_CYCLE.get(theme)!;
		playTheme(theme, vars[n % vars.length], label);
	}
	return { name: 'Infini', tempo: 2, key: KEY, notes, lead: buildLead(notes, rng, TONIC), chords, sections };
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
	// Ornate lead line on the same grid — what the auto-lead voice sings.
	const lead: Chart['lead'] = [];
	let lb = INTRO_BEATS;
	for (const n of song.lead ?? song.notes) {
		if (!n.rest) {
			const time = at(lb);
			lead.push({ time, midi: n.midi, dur: at(lb + n.dur) - time });
		}
		lb += n.dur;
	}
	// Whole-beat grid for the groove (kick/bass/pad step on these).
	const beatTimes: number[] = [];
	for (let b = 0; b <= Math.ceil(totalBeats); b++) beatTimes.push(beatTime[b]);
	// One chord per bar, padded to cover the whole grid. The intro states the
	// song's full 4-chord loop once, so the melody enters on the loop's restart.
	const songChords = song.chords ?? [];
	const FALLBACK_CHORD: ChordBar = { root: 0, third: 4, seventh: 11, ninth: 14 };
	const introChords = songChords.length >= 4 ? songChords.slice(0, 4) : Array.from({ length: 4 }, () => ({ ...FALLBACK_CHORD }));
	const barCount = Math.ceil(totalBeats / 4);
	const chords = [...introChords, ...songChords].slice(0, barCount);
	while (chords.length < barCount) chords.push(chords[chords.length - 1] ?? FALLBACK_CHORD);
	// Per-bar section labels, intro included — the backing derives fills & drops.
	const introSections: Section[] = ['I', 'I', 'I', 'I'];
	const sections: Section[] = [...introSections, ...(song.sections ?? [])].slice(0, barCount);
	while (sections.length < barCount) sections.push(sections[sections.length - 1] ?? 'A');
	return { tiles, totalTime: at(totalBeats), beatTimes, key: song.key, chords, sections, lead, introTime: at(INTRO_BEATS) };
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
