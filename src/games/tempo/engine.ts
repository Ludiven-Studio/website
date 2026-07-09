/* =====================================================
   TEMPO — pure engine for a "piano tiles" rhythm game.
   Public-domain melodies → a falling-tile chart (lane per note, hit time in
   seconds). An endless mode streams a seeded generated melody. Long notes are
   HOLD tiles (press-and-hold for bonus). Timing judgment + scoring live here.
   ===================================================== */

import { mulberry32 } from '../prng';

export const LANES = 6; // columns, ordered low pitch (left) → high pitch (right)
export const HOLD_BEATS = 2; // a note this long (or longer) becomes a hold tile

export interface SongNote {
	midi: number;
	dur: number; // beats
}
export interface Song {
	name: string;
	tempo: number; // beats per second at speed 1
	key: number; // tonic midi (used for the bass accompaniment)
	notes: SongNote[];
}

// All public-domain / trad. melodies (C4 = 60). Synthesised, no recordings.
export const SONGS: Song[] = [
	{
		name: 'Au clair de la lune',
		tempo: 2,
		key: 48,
		notes: [
			{ midi: 60, dur: 1 }, { midi: 60, dur: 1 }, { midi: 60, dur: 1 }, { midi: 62, dur: 1 }, { midi: 64, dur: 2 }, { midi: 62, dur: 2 },
			{ midi: 60, dur: 1 }, { midi: 64, dur: 1 }, { midi: 62, dur: 1 }, { midi: 62, dur: 1 }, { midi: 60, dur: 2 },
		],
	},
	{
		name: 'Frère Jacques',
		tempo: 2,
		key: 48,
		notes: [
			{ midi: 60, dur: 1 }, { midi: 62, dur: 1 }, { midi: 64, dur: 1 }, { midi: 60, dur: 1 },
			{ midi: 60, dur: 1 }, { midi: 62, dur: 1 }, { midi: 64, dur: 1 }, { midi: 60, dur: 1 },
			{ midi: 64, dur: 1 }, { midi: 65, dur: 1 }, { midi: 67, dur: 2 },
			{ midi: 64, dur: 1 }, { midi: 65, dur: 1 }, { midi: 67, dur: 2 },
			{ midi: 67, dur: 1 }, { midi: 69, dur: 1 }, { midi: 67, dur: 1 }, { midi: 65, dur: 1 }, { midi: 64, dur: 1 }, { midi: 60, dur: 1 },
			{ midi: 60, dur: 1 }, { midi: 55, dur: 1 }, { midi: 60, dur: 2 },
		],
	},
	{
		name: 'Ode à la joie',
		tempo: 2,
		key: 48,
		notes: [
			{ midi: 64, dur: 1 }, { midi: 64, dur: 1 }, { midi: 65, dur: 1 }, { midi: 67, dur: 1 },
			{ midi: 67, dur: 1 }, { midi: 65, dur: 1 }, { midi: 64, dur: 1 }, { midi: 62, dur: 1 },
			{ midi: 60, dur: 1 }, { midi: 60, dur: 1 }, { midi: 62, dur: 1 }, { midi: 64, dur: 1 },
			{ midi: 64, dur: 1.5 }, { midi: 62, dur: 0.5 }, { midi: 62, dur: 2 },
		],
	},
	{
		name: 'Ah vous dirai-je maman',
		tempo: 2,
		key: 48,
		notes: [
			{ midi: 60, dur: 1 }, { midi: 60, dur: 1 }, { midi: 67, dur: 1 }, { midi: 67, dur: 1 },
			{ midi: 69, dur: 1 }, { midi: 69, dur: 1 }, { midi: 67, dur: 2 },
			{ midi: 65, dur: 1 }, { midi: 65, dur: 1 }, { midi: 64, dur: 1 }, { midi: 64, dur: 1 },
			{ midi: 62, dur: 1 }, { midi: 62, dur: 1 }, { midi: 60, dur: 2 },
		],
	},
];

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

/**
 * Pitch → lane: buckets the song's pitch range across the columns, so LOW notes
 * fall on the LEFT and HIGH notes on the RIGHT (monotonic). The same pitch always
 * uses the same column, and a change of column always means a change of note.
 */
const laneFor = (midi: number, lo: number, hi: number): number =>
	Math.max(0, Math.min(LANES - 1, Math.floor(((midi - lo) / (hi - lo || 1)) * LANES)));

const range = (notes: { midi: number }[]): [number, number] => {
	let lo = Infinity;
	let hi = -Infinity;
	for (const n of notes) {
		lo = Math.min(lo, n.midi);
		hi = Math.max(hi, n.midi);
	}
	return [lo, hi];
};

/** Build the falling-tile chart. Column follows pitch (low→left, high→right). */
export function buildChart(song: Song, speed = 1): Chart {
	const eff = song.tempo * speed;
	const [lo, hi] = range(song.notes);
	const tiles: Tile[] = [];
	let beat = 0;
	for (const n of song.notes) {
		tiles.push({ time: beat / eff, lane: laneFor(n.midi, lo, hi), midi: n.midi, dur: n.dur / eff, hold: n.dur >= HOLD_BEATS });
		beat += n.dur;
	}
	const beatTimes: number[] = [];
	for (let b = 0; b < beat; b++) beatTimes.push(b / eff);
	return { tiles, totalTime: beat / eff, beatTimes, key: song.key };
}

/** Song of the day for a seed. */
export const dailySong = (seed: number): number => (seed >>> 0) % SONGS.length;

/**
 * Endless generated tune: a gentle major-pentatonic walk with occasional long
 * (hold) notes. Deterministic from the seed. Long enough to outlast any run —
 * the endless mode ends when the player misses, not when the melody stops.
 */
const PENTA = [0, 2, 4, 7, 9];
const scaleMidi = (root: number, deg: number): number => root + Math.floor(deg / 5) * 12 + PENTA[((deg % 5) + 5) % 5];
export function generateEndlessSong(seed: number, count = 600): Song {
	const rng = mulberry32(seed >>> 0);
	const notes: SongNote[] = [];
	let deg = 4;
	for (let i = 0; i < count; i++) {
		const r = rng();
		let step: number;
		if (r < 0.55) step = rng() < 0.5 ? 1 : -1;
		else if (r < 0.78) step = 0;
		else step = (rng() < 0.5 ? 1 : -1) * (1 + Math.floor(rng() * 2));
		deg = Math.max(0, Math.min(10, deg + step));
		// Varied lengths, with occasional much longer holds (3–4 beats).
		const d = rng();
		const dur = d < 0.06 ? 4 : d < 0.16 ? 3 : d < 0.3 ? 2 : 1;
		notes.push({ midi: scaleMidi(55, deg), dur });
	}
	return { name: 'Infini', tempo: 2, key: 43, notes };
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
	const ramp = opts.rampSec ?? 45;
	const maxMult = opts.maxMult ?? 2.6;
	const song = generateEndlessSong(seed, opts.count ?? 1500);
	const [lo, hi] = range(song.notes);
	const tiles: Tile[] = [];
	const beatTimes: number[] = [];
	let elapsed = 0;
	for (const n of song.notes) {
		const eff = base * Math.min(maxMult, 1 + elapsed / ramp); // tempo accelerates
		tiles.push({ time: elapsed, lane: laneFor(n.midi, lo, hi), midi: n.midi, dur: n.dur / eff, hold: n.dur >= HOLD_BEATS });
		beatTimes.push(elapsed);
		elapsed += n.dur / eff;
	}
	return { tiles, totalTime: elapsed, beatTimes, key: song.key };
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
