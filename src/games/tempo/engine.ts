/* =====================================================
   TEMPO — pure engine for a "piano tiles" rhythm game.
   Public-domain melodies → a falling-tile chart (lane per note, hit time in
   seconds). Deterministic (no RNG): the daily just picks a song by seed and a
   difficulty speed. Timing judgment + scoring curve live here (testable).
   ===================================================== */

export const LANES = 4;

export interface SongNote {
	midi: number;
	dur: number; // beats
}
export interface Song {
	name: string;
	tempo: number; // beats per second at speed 1
	notes: SongNote[];
}

// All public-domain / trad. melodies (C4 = 60). Synthesised, no recordings.
export const SONGS: Song[] = [
	{
		name: 'Au clair de la lune',
		tempo: 2,
		notes: [
			{ midi: 60, dur: 1 }, { midi: 60, dur: 1 }, { midi: 60, dur: 1 }, { midi: 62, dur: 1 }, { midi: 64, dur: 2 }, { midi: 62, dur: 2 },
			{ midi: 60, dur: 1 }, { midi: 64, dur: 1 }, { midi: 62, dur: 1 }, { midi: 62, dur: 1 }, { midi: 60, dur: 2 },
		],
	},
	{
		name: 'Frère Jacques',
		tempo: 2,
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
}
export interface Chart {
	tiles: Tile[];
	totalTime: number; // seconds until the last note ends
	beatTimes: number[]; // metronome ticks (seconds)
}

/** Build the falling-tile chart: lane by pitch (low→left, high→right), never twice in a row. */
export function buildChart(song: Song, speed = 1): Chart {
	const eff = song.tempo * speed;
	let lo = Infinity;
	let hi = -Infinity;
	for (const n of song.notes) {
		lo = Math.min(lo, n.midi);
		hi = Math.max(hi, n.midi);
	}
	const span = hi - lo || 1;
	const tiles: Tile[] = [];
	let beat = 0;
	let prevLane = -1;
	for (const n of song.notes) {
		let lane = Math.max(0, Math.min(LANES - 1, Math.floor(((n.midi - lo) / span) * LANES)));
		if (lane === prevLane) lane = (lane + 1) % LANES;
		prevLane = lane;
		tiles.push({ time: beat / eff, lane, midi: n.midi, dur: n.dur / eff });
		beat += n.dur;
	}
	const beatTimes: number[] = [];
	for (let b = 0; b < beat; b++) beatTimes.push(b / eff);
	return { tiles, totalTime: beat / eff, beatTimes };
}

/** Song of the day for a seed. */
export const dailySong = (seed: number): number => (seed >>> 0) % SONGS.length;

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
