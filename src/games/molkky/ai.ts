/**
 * MÖLKKY — the opponent. It tries throws on a copy of the world (the player's own physics), keeps the
 * one whose points serve its score best, then throws it with an error that shrinks with skill.
 * What serves the score: exactly 50 wins; a throw that would pass 50 is a disaster (back to 25);
 * with two misses in hand, anything that scores beats a clean miss.
 */
import { MolkkyWorld, simulateThrow, RELEASE_Y, PIN_H, type Throw } from './physics';
import { pointsFor, scoreAfter, TARGET, type Player } from './rules';

const G = 9.81;
const HIT_Y = PIN_H * 0.55; // aim the stick at the pin's body, not its feet

/** The throw from the hand that passes through (x, HIT_Y, z) at this loft. */
export function aimAt(x: number, z: number, loft: number): Throw {
	const d = Math.sqrt(x * x + z * z);
	const c = Math.cos(loft), tn = Math.tan(loft);
	const rise = RELEASE_Y + d * tn - HIT_Y;
	const v2 = rise > 0.01 ? (G * d * d) / (2 * c * c * rise) : 400;
	return { yaw: Math.atan2(x, z), speed: Math.min(20, Math.sqrt(v2)), loft };
}

/** Deterministic noise in [-1, 1]-ish, bell shaped, from a counter. */
function noise(n: number, seed: number): number {
	let s = 0;
	for (let k = 0; k < 3; k++) {
		let h = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(n * 3 + k, 0xc2b2ae35)) | 0;
		h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
		s += (h >>> 0) / 4294967296;
	}
	return (s - 1.5) / 0.5;
}

export const SKILLS = { facile: 0.35, moyen: 0.62, difficile: 0.88 } as const;
export type MkLevel = keyof typeof SKILLS;

/** Value of scoring `points` from `me`: the AI's whole strategy. */
export function worth(me: Player, points: number): number {
	if (points === 0) return me.misses >= 2 ? -60 : -5;
	const after = scoreAfter(me.score, points);
	if (after === TARGET) return 1000;
	if (after < 0) return -40; // back to 25
	// Closer to 50 is better, and landing 38-49 leaves one pin to finish with.
	const left = TARGET - after;
	return points + (left <= 12 ? 6 : 0);
}

const LOFTS = [0.28, 0.5];

export function planAi(w: MolkkyWorld, me: Player, skill: number, seed: number): Throw {
	const standing = w.pinViews().filter((p) => !p.down);
	const need = TARGET - me.score;
	// Candidates: every standing pin, head on; the one pin that finishes first in line.
	const targets = standing
		.slice()
		.sort((a, b) => (a.n === need ? -1 : b.n === need ? 1 : b.n - a.n));
	let best: Throw = aimAt(0, standing[0]?.z ?? 3.5, LOFTS[0]);
	let bestV = -Infinity;
	for (const p of targets) {
		for (const loft of LOFTS) {
			const th = aimAt(p.x, p.z, loft);
			const v = worth(me, pointsFor(simulateThrow(w, th)));
			if (v > bestV) { bestV = v; best = th; }
			if (bestV >= 1000) break;
		}
		if (bestV >= 1000) break;
	}
	const k = Math.max(0, Math.min(1, (skill - 0.3) / 0.65));
	const ang = 0.05 + (0.006 - 0.05) * k; // rad
	const spd = 0.10 + (0.015 - 0.10) * k; // relative
	return { yaw: best.yaw + noise(1, seed) * ang, speed: best.speed * (1 + noise(2, seed) * spd), loft: best.loft };
}
