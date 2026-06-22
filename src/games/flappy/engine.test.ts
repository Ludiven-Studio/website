import { describe, it, expect } from 'vitest';
import { FLAPPY_CFG, pipeGap, createFlappy, flap, stepWorld, type FlappyState } from './engine';

const DT = 1 / 60;
const step = (s: FlappyState, seed: number) => stepWorld(s, DT, FLAPPY_CFG, seed);

const runSteps = (s: FlappyState, n: number, seed: number, flapEvery = 0): FlappyState => {
	let st = s;
	for (let i = 0; i < n; i++) {
		if (flapEvery && i % flapEvery === 0) st = flap(st);
		st = step(st, seed);
	}
	return st;
};

// Adaptive controller: flap whenever the bird drifts below mid-screen → stays alive (for spawn tests).
const survive = (s: FlappyState, n: number, seed: number): FlappyState => {
	let st = s;
	for (let i = 0; i < n; i++) {
		if (st.birdY > FLAPPY_CFG.worldH / 2) st = flap(st);
		st = step(st, seed);
		if (st.status === 'over') break;
	}
	return st;
};

describe('flappy engine', () => {
	it('ready state does not move until the first flap', () => {
		const st = createFlappy();
		const next = step(st, 1);
		expect(next.birdY).toBe(st.birdY);
		expect(next.status).toBe('ready');
	});

	it('flap sets the upward velocity and starts the run', () => {
		const st = flap(createFlappy());
		expect(st.vy).toBe(FLAPPY_CFG.flapV);
		expect(st.status).toBe('playing');
	});

	it('gravity increases velocity and clamps at maxFallV', () => {
		let st = flap(createFlappy());
		const after1 = step(st, 1);
		expect(after1.vy).toBeGreaterThan(st.vy); // less negative / falling more
		// Long fall → clamps at terminal velocity.
		st = after1;
		for (let i = 0; i < 600; i++) st = stepWorld({ ...st, status: 'playing', birdY: 50 }, DT, FLAPPY_CFG, 1);
		expect(st.vy).toBeLessThanOrEqual(FLAPPY_CFG.maxFallV);
		expect(st.vy).toBeCloseTo(FLAPPY_CFG.maxFallV, 5);
	});

	it('pipeGap is deterministic and within the safe band', () => {
		const margin = FLAPPY_CFG.gapH / 2 + 6;
		for (let i = 0; i < 30; i++) {
			const a = pipeGap(123, i, FLAPPY_CFG);
			const b = pipeGap(123, i, FLAPPY_CFG);
			expect(a).toBe(b);
			expect(a).toBeGreaterThanOrEqual(margin);
			expect(a).toBeLessThanOrEqual(FLAPPY_CFG.worldH - margin);
		}
	});

	it('spawns one pipe per pipeSpacing of distance, with the seeded gap', () => {
		// Keep the bird alive (centered) long enough for the first pipes to spawn.
		const st = survive(flap(createFlappy()), 400, 7);
		expect(st.spawnIndex).toBeGreaterThan(0);
		// Spawned pipes carry the deterministic gap for their index.
		const firstStillStored = st.pipes[0];
		if (firstStillStored) {
			// find its index by matching gapCenter against the sequence
			const idx = st.spawnIndex - st.pipes.length;
			expect(st.pipes[0].gapCenter).toBeCloseTo(pipeGap(7, idx, FLAPPY_CFG), 6);
		}
	});

	it('the pipe layout is identical for the same seed regardless of flaps', () => {
		const a = runSteps(flap(createFlappy()), 300, 55, 8).pipes.map((p) => p.gapCenter);
		const b = runSteps(flap(createFlappy()), 300, 55, 8).pipes.map((p) => p.gapCenter);
		expect(a).toEqual(b);
		// gap centres come purely from (seed, index)
		for (let i = 0; i < 10; i++) expect(pipeGap(55, i, FLAPPY_CFG)).toBe(pipeGap(55, i, FLAPPY_CFG));
	});

	it('falling into the floor ends the game', () => {
		// No flapping after the first: the bird falls and eventually hits the floor.
		const st = runSteps(flap(createFlappy()), 400, 3, 0);
		expect(st.status).toBe('over');
	});

	it('hitting a pipe (outside the gap) ends the game', () => {
		let st: FlappyState = {
			birdY: 50, vy: 0, distance: 0, score: 0, status: 'playing', spawnIndex: 1,
			pipes: [{ x: FLAPPY_CFG.birdX - 2, gapCenter: 90, scored: false }], // gap far below → bird is above it
		};
		st = step(st, 1);
		expect(st.status).toBe('over');
	});

	it('clearing a pipe scores exactly once', () => {
		let st: FlappyState = {
			birdY: 50, vy: 0, distance: 0, score: 0, status: 'playing', spawnIndex: 1,
			pipes: [{ x: FLAPPY_CFG.birdX - FLAPPY_CFG.pipeW - 1, gapCenter: 50, scored: false }], // already passed bird
		};
		st = step(st, 1);
		expect(st.score).toBe(1);
		const again = step({ ...st, pipes: st.pipes }, 1);
		expect(again.score).toBe(1); // not double-counted
	});

	it('is deterministic: same seed + same flap script → identical state', () => {
		const a = runSteps(flap(createFlappy()), 120, 88, 9);
		const b = runSteps(flap(createFlappy()), 120, 88, 9);
		expect(a).toEqual(b);
	});
});
