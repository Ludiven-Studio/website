/**
 * FLAPPY BIRD — pure engine (no UI, fixed-timestep, frame-rate independent).
 * Pipe layout is a pure function of (seed, pipeIndex), so the daily challenge is identical
 * for everyone regardless of how the player flaps. All units are logical (a 100×100 world).
 */

import { mulberry32 } from '../prng';

export interface FlappyConfig {
	worldW: number;
	worldH: number;
	gravity: number; // units / s²
	flapV: number; // initial upward impulse on a tap (negative = up)
	liftV: number; // steady upward speed while held (smooth controlled rise, not acceleration)
	boostMaxMs: number; // max duration the held lift lasts per flap
	boostDelayMs: number; // held time before the lift engages (quick taps stay small)
	maxFallV: number; // terminal downward velocity
	birdX: number;
	birdR: number;
	pipeW: number;
	groundH: number; // ground band at the bottom (lethal floor sits at worldH - groundH)
	gapH: number; // gap opening height
	pipeSpacing: number; // distance between consecutive pipes
	speed: number; // horizontal scroll speed, units / s
}

// Flap feel is constant across levels (variable impulse by hold duration). Difficulty only
// tightens the course: smaller openings, closer pipes, faster scroll.
// flapV gives a tap a ~worldH/16 hop (sqrt(2*gravity*6.25) ≈ 55). Holding lifts at a steady speed
// (liftV) — a smooth controlled rise, not an acceleration — capped at worldH/4 per flap.
const BASE = {
	worldW: 100,
	worldH: 100,
	gravity: 240,
	flapV: -55,
	liftV: 48,
	boostMaxMs: 520, // long enough for a held lift to reach the worldH/4 cap, then it stops
	boostDelayMs: 130, // a quick tap (held < this) is just the impulse; longer holds lift
	maxFallV: 150,
	birdX: 28,
	birdR: 3,
	pipeW: 13,
	groundH: 8,
};

export interface FlappyDiff {
	label: string;
	gapH: number;
	pipeSpacing: number;
	speed: number;
}

export const FLAPPY_DIFFS: Record<string, FlappyDiff> = {
	facile: { label: 'Facile', gapH: 34, pipeSpacing: 82, speed: 38 },
	moyen: { label: 'Moyen', gapH: 28, pipeSpacing: 68, speed: 44 },
	difficile: { label: 'Difficile', gapH: 23, pipeSpacing: 56, speed: 50 },
};

export const flappyConfig = (d: FlappyDiff): FlappyConfig => ({
	...BASE,
	gapH: d.gapH,
	pipeSpacing: d.pipeSpacing,
	speed: d.speed,
});

export const FLAPPY_CFG: FlappyConfig = flappyConfig(FLAPPY_DIFFS.moyen);

export type FlappyStatus = 'ready' | 'playing' | 'over';

export interface Pipe {
	x: number; // left edge
	gapCenter: number;
	scored: boolean;
}

export interface FlappyState {
	birdY: number;
	vy: number;
	distance: number; // total scrolled distance
	score: number;
	pipes: Pipe[];
	spawnIndex: number; // pipes spawned so far
	status: FlappyStatus;
	boostMs: number; // remaining held-boost budget for the current flap
	heldMs: number; // how long the key has been held since the last press (boost delay gate)
	flapStartY: number; // bird Y when the current flap began (to cap its climb)
}

/** Max climb of a single flap (hold included): a quarter of the screen. */
export const maxFlapRise = (cfg: FlappyConfig): number => cfg.worldH / 4;

// First pipe enters once the bird has scrolled a full screen — breathing room at the start.
const firstSpawn = (cfg: FlappyConfig): number => cfg.worldW;

/** Gap centre of pipe `i` — pure function of (seed, i), so the layout is shared. */
export function pipeGap(seed: number, i: number, cfg: FlappyConfig): number {
	const top = cfg.gapH / 2 + 4; // keep the gap below the ceiling
	const bottom = cfg.worldH - cfg.groundH - cfg.gapH / 2 - 4; // and above the ground
	const r = mulberry32((seed + i * 0x9e3779b1) >>> 0)();
	return top + r * (bottom - top);
}

export function createFlappy(cfg: FlappyConfig = FLAPPY_CFG): FlappyState {
	return {
		birdY: cfg.worldH / 2,
		vy: 0,
		distance: 0,
		score: 0,
		pipes: [],
		spawnIndex: 0,
		status: 'ready',
		boostMs: 0,
		heldMs: 0,
		flapStartY: cfg.worldH / 2,
	};
}

/** Flap: initial impulse + arm the held-boost budget, anchored at the current height. */
export function flap(state: FlappyState, cfg: FlappyConfig = FLAPPY_CFG): FlappyState {
	if (state.status === 'over') return state;
	return { ...state, vy: cfg.flapV, boostMs: cfg.boostMaxMs, heldMs: 0, flapStartY: state.birdY, status: 'playing' };
}

/**
 * One fixed-timestep world update. Only advances while playing. `holding` extends the current
 * flap's upward boost (variable jump) until its budget runs out — then gravity resumes.
 */
export function stepWorld(
	state: FlappyState,
	dt: number,
	cfg: FlappyConfig,
	seed: number,
	holding = false,
): FlappyState {
	if (state.status !== 'playing') return state;

	// A quick tap is just the impulse; holding past boostDelayMs lifts at a steady speed (smooth
	// rise, not acceleration) until the budget runs out or the flap reaches its climb cap.
	const maxRise = maxFlapRise(cfg);
	const heldMs = holding ? state.heldMs + dt * 1000 : 0;
	let boostMs = state.boostMs;
	const lifting = holding && heldMs >= cfg.boostDelayMs && boostMs > 0 && state.flapStartY - state.birdY < maxRise;
	let vy: number;
	if (lifting) {
		vy = -cfg.liftV; // hold a constant upward velocity
		boostMs = Math.max(0, boostMs - dt * 1000);
	} else {
		vy = Math.min(state.vy + cfg.gravity * dt, cfg.maxFallV);
	}
	let birdY = state.birdY + vy * dt;
	// Hard cap: a single flap never climbs more than maxRise above where it started.
	const ceilingY = state.flapStartY - maxRise;
	if (birdY < ceilingY) {
		birdY = ceilingY;
		if (vy < 0) vy = 0;
	}
	const distance = state.distance + cfg.speed * dt;

	let spawnIndex = state.spawnIndex;
	let score = state.score;
	let pipes = state.pipes.map((p) => ({ ...p, x: p.x - cfg.speed * dt }));

	// Spawn pipes whose threshold distance has been crossed (x derived to absorb overshoot).
	while (distance >= firstSpawn(cfg) + spawnIndex * cfg.pipeSpacing) {
		const threshold = firstSpawn(cfg) + spawnIndex * cfg.pipeSpacing;
		pipes.push({ x: cfg.worldW - (distance - threshold), gapCenter: pipeGap(seed, spawnIndex, cfg), scored: false });
		spawnIndex++;
	}

	// Score: a pipe is cleared once its right edge passes the bird.
	for (const p of pipes)
		if (!p.scored && p.x + cfg.pipeW < cfg.birdX) {
			p.scored = true;
			score++;
		}

	pipes = pipes.filter((p) => p.x + cfg.pipeW > -1); // cull off-screen left

	// Collisions: ceiling/ground, or a pipe (outside its gap).
	let dead = birdY - cfg.birdR < 0 || birdY + cfg.birdR > cfg.worldH - cfg.groundH;
	if (!dead)
		for (const p of pipes) {
			const overlapX = cfg.birdX + cfg.birdR > p.x && cfg.birdX - cfg.birdR < p.x + cfg.pipeW;
			if (!overlapX) continue;
			const gapTop = p.gapCenter - cfg.gapH / 2;
			const gapBottom = p.gapCenter + cfg.gapH / 2;
			if (birdY - cfg.birdR < gapTop || birdY + cfg.birdR > gapBottom) dead = true;
		}

	return { birdY, vy, distance, score, pipes, spawnIndex, status: dead ? 'over' : 'playing', boostMs, heldMs, flapStartY: state.flapStartY };
}
