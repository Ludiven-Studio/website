import { describe, it, expect } from 'vitest';
import {
	ESQUIVE_DIFFS,
	esquiveConfig,
	createEsquive,
	spawnAsteroid,
	burstAt,
	step,
	type Asteroid,
	type EsquiveState,
} from './engine';

const cfg = esquiveConfig(ESQUIVE_DIFFS.moyen);

const stateWith = (asteroids: Asteroid[], over = false, elapsedMs = 0): EsquiveState => ({
	shipX: 0,
	shipY: 0,
	asteroids,
	elapsedMs,
	score: Math.floor(elapsedMs / 100),
	status: over ? 'over' : 'playing',
	nextSpawnMs: 1e9, // disable spawns for isolated tests
	spawnCount: 0,
});

const ast = (over: Partial<Asteroid>): Asteroid => ({ x: 0, y: 0, z: 0, r: 1, rx: 0, ry: 0, rz: 0, spin: 0, sx: 1, sy: 1, sz: 1, shape: 0, ...over });

describe('esquive engine', () => {
	it('spawnAsteroid is deterministic and within bounds', () => {
		const a = spawnAsteroid(12345, 3, cfg);
		const b = spawnAsteroid(12345, 3, cfg);
		expect(a).toEqual(b);
		expect(Math.abs(a.x)).toBeLessThanOrEqual(cfg.halfW);
		expect(Math.abs(a.y)).toBeLessThanOrEqual(cfg.halfH);
		expect(a.r).toBeGreaterThanOrEqual(cfg.astMinR);
		expect(a.r).toBeLessThanOrEqual(cfg.astMaxR * 1.8); // occasional boulders exceed astMaxR
		expect(a.z).toBe(cfg.farZ);
		// Lumpy non-uniform scale factors (render only), reproducible per (seed, i).
		for (const s of [a.sx, a.sy, a.sz]) {
			expect(s).toBeGreaterThanOrEqual(0.8);
			expect(s).toBeLessThanOrEqual(1.2);
		}
		expect([0, 1, 2]).toContain(a.shape); // base geometry index
	});

	it('spawns occasional boulders larger than astMaxR', () => {
		let maxR = 0;
		for (let i = 0; i < 200; i++) maxR = Math.max(maxR, spawnAsteroid(42, i, cfg).r);
		expect(maxR).toBeGreaterThan(cfg.astMaxR);
	});

	it('different seeds give different asteroid fields', () => {
		const a = spawnAsteroid(1, 0, cfg);
		const b = spawnAsteroid(2, 0, cfg);
		expect(a).not.toEqual(b);
	});

	it('daily spawn stream is reproducible from a seed', () => {
		const seed = 999;
		const seqA = Array.from({ length: 6 }, (_, i) => spawnAsteroid(seed, i, cfg));
		const seqB = Array.from({ length: 6 }, (_, i) => spawnAsteroid(seed, i, cfg));
		expect(seqA).toEqual(seqB);
	});

	it('collision: head-on overlap at the ship plane ends the run', () => {
		const s = stateWith([ast({ x: 0, y: 0, z: -0.1, r: 1 })]);
		const next = step(s, 0.02, cfg, 1, { x: 0, y: 0 });
		expect(next.status).toBe('over');
	});

	it('no collision: asteroid far to the side', () => {
		const s = stateWith([ast({ x: 8, y: 0, z: 0, r: 1 })]);
		expect(step(s, 0.02, cfg, 1, { x: 0, y: 0 }).status).toBe('playing');
	});

	it('no collision: asteroid still far away in depth', () => {
		const s = stateWith([ast({ x: 0, y: 0, z: -50, r: 1 })]);
		expect(step(s, 0.02, cfg, 1, { x: 0, y: 0 }).status).toBe('playing');
	});

	it('asteroids past the camera are despawned', () => {
		const s = stateWith([ast({ x: 6, y: 0, z: cfg.despawnZ + 5 })]);
		expect(step(s, 0.02, cfg, 1, { x: 0, y: 0 }).asteroids).toHaveLength(0);
	});

	it('ship position is clamped to the bounds', () => {
		const s = stateWith([]);
		const next = step(s, 10, cfg, 1, { x: 1, y: -1 });
		expect(next.shipX).toBeCloseTo(cfg.halfW);
		expect(next.shipY).toBeCloseTo(-cfg.halfH);
	});

	it('score grows with elapsed time', () => {
		const fresh = createEsquive(cfg);
		const next = step(fresh, 1, cfg, 1, { x: 0, y: 0 });
		expect(next.score).toBe(10); // 1000ms → tenths of a second
	});

	it('difficulty ramps: asteroids move faster later', () => {
		const early = stateWith([ast({ z: -100 })], false, 0);
		const late = stateWith([ast({ z: -100 })], false, 2 * cfg.diff.rampEveryMs);
		const dEarly = step(early, 0.1, cfg, 1, { x: 0, y: 0 }).asteroids[0].z;
		const dLate = step(late, 0.1, cfg, 1, { x: 0, y: 0 }).asteroids[0].z;
		expect(dLate).toBeGreaterThan(dEarly);
	});

	it('burstAt grows over time and is capped', () => {
		expect(burstAt(0, cfg)).toBe(1);
		expect(burstAt(cfg.diff.burstEveryMs, cfg)).toBe(2);
		expect(burstAt(cfg.diff.burstEveryMs * 2, cfg)).toBe(3);
		expect(burstAt(cfg.diff.burstEveryMs * 1000, cfg)).toBe(4); // capped
	});

	it('density grows: a spawn interval spawns more asteroids later', () => {
		// nextSpawnMs sits just before `now`; one interval is crossed → burstAt(nextSpawnMs) asteroids.
		const mk = (elapsedMs: number): EsquiveState => ({
			...stateWith([], false, elapsedMs),
			nextSpawnMs: elapsedMs + 1,
		});
		const early = step(mk(0), 0.05, cfg, 7, { x: 0, y: 0 }).asteroids.length;
		const late = step(mk(cfg.diff.burstEveryMs * 2 + 1), 0.05, cfg, 7, { x: 0, y: 0 }).asteroids.length;
		expect(late).toBeGreaterThan(early);
	});
});
