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
	flapV: number; // upward impulse velocity (negative = up)
	maxFallV: number; // terminal downward velocity
	birdX: number;
	birdR: number;
	pipeW: number;
	gapH: number;
	pipeSpacing: number; // distance between consecutive pipes
	speed: number; // horizontal scroll speed, units / s
}

export const FLAPPY_CFG: FlappyConfig = {
	worldW: 100,
	worldH: 100,
	gravity: 240,
	flapV: -90,
	maxFallV: 160,
	birdX: 28,
	birdR: 3.2,
	pipeW: 14,
	gapH: 30,
	pipeSpacing: 46,
	speed: 46,
};

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
}

// First pipe enters once the bird has scrolled a full screen — breathing room at the start.
const firstSpawn = (cfg: FlappyConfig): number => cfg.worldW;

/** Gap centre of pipe `i` — pure function of (seed, i), so the layout is shared. */
export function pipeGap(seed: number, i: number, cfg: FlappyConfig): number {
	const margin = cfg.gapH / 2 + 6;
	const r = mulberry32((seed + i * 0x9e3779b1) >>> 0)();
	return margin + r * (cfg.worldH - 2 * margin);
}

export function createFlappy(cfg: FlappyConfig = FLAPPY_CFG): FlappyState {
	return { birdY: cfg.worldH / 2, vy: 0, distance: 0, score: 0, pipes: [], spawnIndex: 0, status: 'ready' };
}

/** Flap: upward impulse. The first flap also starts the run. */
export function flap(state: FlappyState): FlappyState {
	if (state.status === 'over') return state;
	return { ...state, vy: FLAPPY_CFG.flapV, status: 'playing' };
}

/** One fixed-timestep world update. Only advances while playing. */
export function stepWorld(state: FlappyState, dt: number, cfg: FlappyConfig, seed: number): FlappyState {
	if (state.status !== 'playing') return state;

	const vy = Math.min(state.vy + cfg.gravity * dt, cfg.maxFallV);
	const birdY = state.birdY + vy * dt;
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

	// Collisions: floor/ceiling, or a pipe (outside its gap).
	let dead = birdY - cfg.birdR < 0 || birdY + cfg.birdR > cfg.worldH;
	if (!dead)
		for (const p of pipes) {
			const overlapX = cfg.birdX + cfg.birdR > p.x && cfg.birdX - cfg.birdR < p.x + cfg.pipeW;
			if (!overlapX) continue;
			const gapTop = p.gapCenter - cfg.gapH / 2;
			const gapBottom = p.gapCenter + cfg.gapH / 2;
			if (birdY - cfg.birdR < gapTop || birdY + cfg.birdR > gapBottom) dead = true;
		}

	return { birdY, vy, distance, score, pipes, spawnIndex, status: dead ? 'over' : 'playing' };
}
