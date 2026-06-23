/**
 * ESQUIVE — 3D asteroid dodger (pure engine, no rendering).
 * The ship flies forward; asteroids stream toward it from depth. The player dodges in the X/Y plane.
 * The asteroid field is deterministic from a seed (daily fairness) and independent of the ship.
 * three.js only renders the state produced here.
 */

import { mulberry32 } from '../prng';

export interface EsquiveDiff {
	label: string;
	spawnEveryMs: number; // initial gap between asteroid spawns
	baseSpeed: number; // initial forward speed (world units / s)
	rampEveryMs: number; // difficulty step interval
	speedRamp: number; // +fraction of baseSpeed per step
	spawnRamp: number; // -ms off the spawn gap per step
	minSpawnMs: number; // floor for the spawn gap
}

export const ESQUIVE_DIFFS: Record<string, EsquiveDiff> = {
	facile: { label: 'Facile', spawnEveryMs: 900, baseSpeed: 26, rampEveryMs: 12000, speedRamp: 0.12, spawnRamp: 35, minSpawnMs: 360 },
	moyen: { label: 'Moyen', spawnEveryMs: 720, baseSpeed: 32, rampEveryMs: 11000, speedRamp: 0.14, spawnRamp: 45, minSpawnMs: 300 },
	difficile: { label: 'Difficile', spawnEveryMs: 560, baseSpeed: 38, rampEveryMs: 10000, speedRamp: 0.16, spawnRamp: 55, minSpawnMs: 250 },
};

export interface EsquiveConfig {
	halfW: number; // play half-extent in x
	halfH: number; // play half-extent in y
	shipR: number; // ship collision radius
	shipSpeed: number; // x/y units per second at full input
	astMinR: number;
	astMaxR: number;
	farZ: number; // spawn depth (negative, far from camera)
	shipZ: number; // ship plane
	despawnZ: number; // past the ship/camera (positive) → remove
	diff: EsquiveDiff;
}

export interface Asteroid {
	x: number;
	y: number;
	z: number;
	r: number;
	rx: number; // initial rotation (render only)
	ry: number;
	rz: number;
	spin: number; // rad/s (render only)
}

export interface EsquiveState {
	shipX: number;
	shipY: number;
	asteroids: Asteroid[];
	elapsedMs: number;
	score: number; // tenths of a second survived
	status: 'playing' | 'over';
	nextSpawnMs: number;
	spawnCount: number;
}

export function esquiveConfig(diff: EsquiveDiff): EsquiveConfig {
	return {
		halfW: 9,
		halfH: 9,
		shipR: 0.9,
		shipSpeed: 24,
		astMinR: 0.8,
		astMaxR: 2.2,
		farZ: -120,
		shipZ: 0,
		despawnZ: 12,
		diff,
	};
}

export function createEsquive(cfg: EsquiveConfig): EsquiveState {
	return {
		shipX: 0,
		shipY: 0,
		asteroids: [],
		elapsedMs: 0,
		score: 0,
		status: 'playing',
		nextSpawnMs: cfg.diff.spawnEveryMs,
		spawnCount: 0,
	};
}

/** Difficulty step count reached at a given elapsed time. */
const stepsAt = (elapsedMs: number, cfg: EsquiveConfig): number => Math.floor(elapsedMs / cfg.diff.rampEveryMs);

const speedAt = (elapsedMs: number, cfg: EsquiveConfig): number =>
	cfg.diff.baseSpeed * (1 + cfg.diff.speedRamp * stepsAt(elapsedMs, cfg));

const spawnGapAt = (elapsedMs: number, cfg: EsquiveConfig): number =>
	Math.max(cfg.diff.minSpawnMs, cfg.diff.spawnEveryMs - cfg.diff.spawnRamp * stepsAt(elapsedMs, cfg));

/** Asteroid `i` is fully determined by (seed, i) → reproducible, stateless. */
export function spawnAsteroid(seed: number, i: number, cfg: EsquiveConfig): Asteroid {
	const rng = mulberry32((seed ^ Math.imul(i + 1, 2654435761)) >>> 0);
	const r = cfg.astMinR + rng() * (cfg.astMaxR - cfg.astMinR);
	return {
		x: (rng() * 2 - 1) * cfg.halfW,
		y: (rng() * 2 - 1) * cfg.halfH,
		z: cfg.farZ,
		r,
		rx: rng() * Math.PI * 2,
		ry: rng() * Math.PI * 2,
		rz: rng() * Math.PI * 2,
		spin: (rng() * 2 - 1) * 1.4,
	};
}

/** Advance the simulation by `dtSec`. `input` axes are in [-1,1] (x: right, y: up). */
export function step(s: EsquiveState, dtSec: number, cfg: EsquiveConfig, seed: number, input: { x: number; y: number }): EsquiveState {
	if (s.status === 'over') return s;
	const elapsedMs = s.elapsedMs + dtSec * 1000;
	const speed = speedAt(elapsedMs, cfg);

	// Spawn due asteroids (catch up if several are due).
	let { nextSpawnMs, spawnCount } = s;
	const asteroids = s.asteroids.map((a) => ({ ...a, z: a.z + speed * dtSec, rx: a.rx + a.spin * dtSec }));
	while (elapsedMs >= nextSpawnMs) {
		asteroids.push(spawnAsteroid(seed, spawnCount, cfg));
		spawnCount += 1;
		nextSpawnMs += spawnGapAt(nextSpawnMs, cfg);
	}

	// Move ship (clamped to bounds).
	const shipX = Math.max(-cfg.halfW, Math.min(cfg.halfW, s.shipX + input.x * cfg.shipSpeed * dtSec));
	const shipY = Math.max(-cfg.halfH, Math.min(cfg.halfH, s.shipY + input.y * cfg.shipSpeed * dtSec));

	// Collisions + despawn.
	let status: EsquiveState['status'] = 'playing';
	const kept: Asteroid[] = [];
	for (const a of asteroids) {
		if (a.z > cfg.despawnZ) continue; // passed the camera
		const reach = a.r + cfg.shipR;
		if (Math.abs(a.z - cfg.shipZ) < reach) {
			const dx = a.x - shipX;
			const dy = a.y - shipY;
			if (dx * dx + dy * dy < reach * reach) status = 'over';
		}
		kept.push(a);
	}

	return {
		shipX,
		shipY,
		asteroids: kept,
		elapsedMs,
		score: Math.floor(elapsedMs / 100),
		status,
		nextSpawnMs,
		spawnCount,
	};
}
