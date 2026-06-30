/**
 * FLÉCHETTES — pure engine (no UI). Real dartboard scoring (singles, doubles ×2,
 * triples ×3, bull 25, bullseye 50) and 501 rules (checkout on a double). The aim
 * reticle oscillates deterministically (seeded) so the daily is fair; the player's
 * tap timing alone decides where the dart lands. Score = darts used (time tiebreak).
 */

import { mulberry32 } from '../prng';

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

/* ---------- Difficulty / oscillating reticle ---------- */

// amp is the fraction of the AIM FRAME the reticle roams (≤1) — the UI scales it by the frame size.
export interface DiffLevel { label: string; omega: number; amp: number; }
export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', omega: 1.1, amp: 0.5 },
	moyen: { label: 'Moyen', omega: 1.6, amp: 0.72 },
	difficile: { label: 'Difficile', omega: 2.3, amp: 0.95 },
};

/** Deterministic reticle OFFSET (Lissajous) within the aim frame, in [-amp, amp]². */
export function reticleAt(seed: number, dartIndex: number, diff: DiffLevel, tMs: number): { x: number; y: number } {
	const rng = mulberry32((seed + dartIndex * 0x9e3779b1) >>> 0);
	const wx = diff.omega * (0.8 + rng() * 0.5);
	const wy = diff.omega * (0.8 + rng() * 0.5);
	const px = rng() * Math.PI * 2, py = rng() * Math.PI * 2;
	const ax = diff.amp * (0.7 + rng() * 0.3);
	const ay = diff.amp * (0.7 + rng() * 0.3);
	const t = tMs / 1000;
	return { x: ax * Math.sin(wx * t + px), y: ay * Math.sin(wy * t + py) };
}

/* ---------- Score (darts + time tiebreak) ---------- */

export function encodeScore(darts: number, timeSec: number): number {
	return darts * 100000 + Math.min(99999, Math.round(timeSec * 10));
}
export function decodeScore(v: number): { darts: number; timeSec: number } {
	return { darts: Math.floor(v / 100000), timeSec: (v % 100000) / 10 };
}

export { ORDER as SECTOR_ORDER };
