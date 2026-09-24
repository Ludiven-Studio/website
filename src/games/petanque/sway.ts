/**
 * PÉTANQUE — the aim sway. While the pad is held the throw drifts, and the player times the release.
 *
 * The landing point runs a figure 8 that slowly turns: x = sin t, y = sin 2t / 2 (a lemniscate of
 * Gerono), rotated by an angle that creeps round. It replaced two beating sines per axis plus a 2.2x
 * fatigue, which read as jerky: the sines lined up now and then and the landing leapt.
 *
 * The two axes are heading (across) and SPEED (along). Loft was the old second axis, but its effect
 * on range swings with the loft itself (a roulette is 3-4x more sensitive than a demi-portée), so the
 * same sway was mild on one throw and wild on the next. Range goes as v², so a relative speed change
 * of δ moves the landing by about 2δR, against R·θ across for a heading change θ: half the heading
 * amplitude on speed makes the 8 as long as it is wide, whatever the throw.
 *
 * Applied to the throw before the velocity is computed: only velocities travel online, so the local
 * phase never has to match on the other screen. The AI does not sway; its skill noise is its own.
 */

export const SWAY_MIN_DEG = 0.3; // Facile: ~4 cm across at 7 m
export const SWAY_MAX_DEG = 1.2; // Expert: ~15 cm
export const SWAY_PERIOD_S = 2.4; // one full 8
export const SWAY_TURN = 0.3; // rad/s the 8 rotates
export const SWAY_SPEED_SHARE = 0.5; // see above: makes the 8 as long as it is wide
export const SWAY_EASE_S = 0.35; // grows from nothing as the finger lands, no jump on press
export const SWAY_REST_S = 3; // then a light fatigue
export const SWAY_TIRE_PER_S = 0.15;
export const SWAY_TIRE_MAX = 0.4;

/** Sway amplitude in radians of heading for an AI skill (0.34 Facile .. 0.95 Expert). */
export const swayAmp = (skill: number): number => {
	const k = Math.max(0, Math.min(1, (skill - 0.34) / (0.95 - 0.34)));
	return ((SWAY_MIN_DEG + (SWAY_MAX_DEG - SWAY_MIN_DEG) * k) * Math.PI) / 180;
};

/**
 * Heading offset (rad) and relative speed offset `sec` seconds into a press. `phase` starts the 8
 * somewhere random and `turn0` gives its starting orientation, both drawn per press.
 */
export function swayAt(sec: number, amp: number, phase: number, turn0: number): { yaw: number; speed: number } {
	const t = (2 * Math.PI * sec) / SWAY_PERIOD_S + phase;
	const x = Math.sin(t), y = Math.sin(2 * t) / 2;
	const r = turn0 + SWAY_TURN * sec;
	const c = Math.cos(r), s = Math.sin(r);
	const ease = Math.min(1, sec / SWAY_EASE_S);
	const tire = 1 + Math.min(SWAY_TIRE_MAX, Math.max(0, sec - SWAY_REST_S) * SWAY_TIRE_PER_S);
	const a = amp * ease * tire;
	return { yaw: a * (x * c - y * s), speed: a * SWAY_SPEED_SHARE * (x * s + y * c) };
}
