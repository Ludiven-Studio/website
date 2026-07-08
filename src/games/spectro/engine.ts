import { mulberry32 } from '../prng';

/* =====================================================
   SPECTRO — pure engine for a melodic "pitch-tracing runner".
   A deterministic melody (major-pentatonic random walk) scrolls past a
   playhead; the player traces its contour. Seeded → same daily for everyone.
   Also holds the scoring curve. No audio/DOM here (kept testable).
   ===================================================== */

export interface Note {
	midi: number;
	start: number; // beats
	dur: number; // beats
}
export interface Melody {
	notes: Note[];
	tempo: number; // beats per second
	root: number;
	lo: number; // lowest pitch (for Y scaling)
	hi: number; // highest pitch
	beats: number; // total length in beats
}

export interface Diff {
	label: string;
	count: number;
	tempo: number;
	maxStep: number;
	root: number;
}
export const DIFFS: Diff[] = [
	{ label: 'Facile', count: 18, tempo: 1.1, maxStep: 2, root: 55 },
	{ label: 'Moyen', count: 24, tempo: 1.5, maxStep: 3, root: 55 },
	{ label: 'Difficile', count: 30, tempo: 1.9, maxStep: 4, root: 55 },
];

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic — always pleasant
const DEG_LO = 0;
const DEG_HI = 10; // ~2 octaves of pentatonic
const clampDeg = (d: number): number => Math.max(DEG_LO, Math.min(DEG_HI, d));
const scaleMidi = (root: number, deg: number): number => root + Math.floor(deg / 5) * 12 + PENTA[((deg % 5) + 5) % 5];

/** Deterministic melody: gentle stepwise walk with occasional leaps and repeats. */
export function generateMelody(seed: number, diffIndex: number): Melody {
	const d = DIFFS[Math.max(0, Math.min(2, diffIndex))];
	const rng = mulberry32(seed >>> 0);
	const notes: Note[] = [];
	let deg = 4;
	let start = 0;
	for (let i = 0; i < d.count; i++) {
		const r = rng();
		let step: number;
		if (r < 0.55) step = rng() < 0.5 ? 1 : -1; // stepwise
		else if (r < 0.78) step = 0; // repeat
		else step = (rng() < 0.5 ? 1 : -1) * (1 + Math.floor(rng() * d.maxStep)); // leap
		deg = clampDeg(deg + step);
		const dur = rng() < 0.75 ? 1 : 2;
		notes.push({ midi: scaleMidi(d.root, deg), start, dur });
		start += dur;
	}
	let lo = Infinity;
	let hi = -Infinity;
	for (const n of notes) {
		lo = Math.min(lo, n.midi);
		hi = Math.max(hi, n.midi);
	}
	return { notes, tempo: d.tempo, root: d.root, lo: lo - 2, hi: hi + 2, beats: start };
}

export type Grade = 'Parfait' | 'Bien' | 'Ok' | 'Raté';
/** Score curve from absolute cents error at the judgment instant. */
export function judge(absCents: number): { grade: Grade; points: number } {
	if (absCents <= 25) return { grade: 'Parfait', points: 100 };
	if (absCents <= 70) return { grade: 'Bien', points: 60 };
	if (absCents <= 140) return { grade: 'Ok', points: 30 };
	return { grade: 'Raté', points: 0 };
}

/** Combo multiplier: +0.5× every 5 hits in a row (capped). */
export const comboMult = (combo: number): number => Math.min(4, 1 + Math.floor(combo / 5) * 0.5);

/** Final rank from mean points per note (0..100). */
export function rankOf(meanPoints: number): 'S' | 'A' | 'B' | 'C' | 'D' {
	if (meanPoints >= 92) return 'S';
	if (meanPoints >= 78) return 'A';
	if (meanPoints >= 60) return 'B';
	if (meanPoints >= 40) return 'C';
	return 'D';
}
