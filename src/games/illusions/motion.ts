/**
 * Pure helpers for the illusory-motion page (no DOM).
 */

/** Kitaoka's peripheral-drift unit, in the order the motion is seen: black → dark → white → light. */
export const SNAKE_UNIT: { color: string; share: number }[] = [
	{ color: '#000000', share: 0.12 },
	{ color: '#1d3fc4', share: 0.38 },
	{ color: '#ffffff', share: 0.12 },
	{ color: '#e8d300', share: 0.38 },
];

/**
 * Ring radii of one disc, outer first. Log-polar spacing keeps every tile the same shape:
 * a ring is `aspect` times as thick as one unit is long.
 */
export function ringRadii(R: number, units: number, aspect = 0.55, minFrac = 0.2): number[] {
	const k = 1 - (aspect * 2 * Math.PI) / units;
	const out: number[] = [];
	for (let r = R; r > R * minFrac; r *= k) out.push(r);
	return out;
}

/**
 * Luminance (0 = black, 1 = white) of an Archimedean spiral with `arms` black arms,
 * at offset (dx, dy) from its centre, antialiased over one pixel.
 */
export function spiralShade(dx: number, dy: number, arms: number, lambda: number): number {
	const r = Math.hypot(dx, dy);
	const p = (Math.atan2(dy, dx) * arms) / (2 * Math.PI) + r / lambda;
	const f = p - Math.floor(p);
	const perPx = Math.hypot(arms / (2 * Math.PI * Math.max(r, 0.5)), 1 / lambda);
	const h = f % 0.5;
	const own = Math.min(1, 0.5 + Math.min(h, 0.5 - h) / perPx);
	return f < 0.5 ? 1 - own : own;
}

/** Index of the missing dot of the lilac chaser at time `t` (ms). */
export const chaserGap = (t: number, stepMs = 100, dots = 12): number => Math.floor(t / stepMs) % dots;
