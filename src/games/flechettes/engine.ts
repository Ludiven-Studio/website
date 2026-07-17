/**
 * FLÉCHETTES — pure engine (no UI). Real dartboard scoring (singles, doubles ×2,
 * triples ×3, bull 25, bullseye 50) and 501 rules (checkout on a double). Aiming is two
 * timed sweeps — first horizontal, then vertical — each oscillating deterministically
 * (seeded) so the daily is fair; tap timing alone picks X then Y. Score = darts (time tiebreak).
 */

import { mulberry32 } from '../prng';
import { encodePacked, decodePacked } from '../../lib/scoreFormat';

export const START_SCORE = 501;

// Sector values clockwise from the top (12 o'clock = 20).
const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
// Ring radii, normalised to board radius = 1.
const R_BULLSEYE = 0.037, R_BULL = 0.094, R_TRIPLE_IN = 0.582, R_TRIPLE_OUT = 0.629, R_DOUBLE_IN = 0.953;
export const RINGS = { R_BULLSEYE, R_BULL, R_TRIPLE_IN, R_TRIPLE_OUT, R_DOUBLE_IN };

export type Ring = 'bullseye' | 'bull' | 'triple' | 'double' | 'single' | 'miss';
export interface Hit { value: number; ring: Ring; sector: number; }

/** Score a dart at normalised board coords (centre 0,0, board radius 1). */
export function dartScore(x: number, y: number): Hit {
	const r = Math.hypot(x, y);
	if (r > 1) return { value: 0, ring: 'miss', sector: 0 };
	if (r < R_BULLSEYE) return { value: 50, ring: 'bullseye', sector: 0 };
	if (r < R_BULL) return { value: 25, ring: 'bull', sector: 0 };
	const th = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2); // 0 = top, clockwise
	const sector = ORDER[Math.floor((th + Math.PI / 20) / (Math.PI / 10)) % 20];
	if (r >= R_TRIPLE_IN && r <= R_TRIPLE_OUT) return { value: sector * 3, ring: 'triple', sector };
	if (r >= R_DOUBLE_IN) return { value: sector * 2, ring: 'double', sector };
	return { value: sector, ring: 'single', sector };
}

export interface ThrowResult { remaining: number; finished: boolean; bust: boolean; }

/** Apply a dart to a 501 count. Finish requires landing exactly 0 on a double/bullseye. */
export function applyThrow(remaining: number, hit: Hit): ThrowResult {
	const after = remaining - hit.value;
	const isDouble = hit.ring === 'double' || hit.ring === 'bullseye';
	if (after === 0 && isDouble) return { remaining: 0, finished: true, bust: false };
	if (after < 2) return { remaining, finished: false, bust: true }; // 0 without double, 1, or negative
	return { remaining: after, finished: false, bust: false };
}

/* ---------- Difficulty / two-step oscillating aim ---------- */

// omega drives the sweep speed (higher = faster back-and-forth = harder to time).
export interface DiffLevel { label: string; omega: number; }
export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', omega: 2.2 },
	moyen: { label: 'Moyen', omega: 3.1 },
	difficile: { label: 'Difficile', omega: 4.3 },
};

export const SWEEP_AMP = 1.02; // travels just PAST the board edge so the outer doubles are reachable

/**
 * Deterministic 1-D aim sweep for one dart along one axis (0 = horizontal, 1 = vertical): a sine
 * in [-SWEEP_AMP, SWEEP_AMP]. Sine (not triangle) slows near the extremes, so the outer double
 * ring gets a generous timing window while the centre bull stays hard. It overshoots the rim
 * slightly (miss if you stop there). Seeded by (seed, dartIndex, axis) so the daily is fair.
 */
export function sweep(seed: number, dartIndex: number, axis: number, diff: DiffLevel, tMs: number): number {
	const rng = mulberry32((seed + dartIndex * 0x9e3779b1 + axis * 0x85ebca6b) >>> 0);
	const w = diff.omega * (0.9 + rng() * 0.25);
	const phase = rng() * Math.PI * 2;
	return SWEEP_AMP * Math.sin(w * (tMs / 1000) + phase);
}

/* ---------- Score (darts + time tiebreak) ---------- */

export function encodeScore(darts: number, timeSec: number): number {
	return encodePacked(10_000_000, [darts, Math.min(9_999_999, Math.round(timeSec * 100))]);
}
export function decodeScore(v: number): { darts: number; timeSec: number } {
	const [darts, t] = decodePacked(10_000_000, 2, v);
	return { darts, timeSec: t / 100 };
}

export { ORDER as SECTOR_ORDER };
