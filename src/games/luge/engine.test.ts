import { describe, it, expect } from 'vitest';
import {
	LUGE,
	SAMPLE_STEP,
	AHEAD,
	INITIAL_ENTRY,
	difficultyAt,
	generateSegment,
	ensureSegments,
	segmentAt,
	poseAt,
	latSafeAt,
	sepHalfAt,
	createLuge,
	stepLuge,
	type TrackSegment,
	type LugeState,
} from './engine';

const DT = 1 / 60;

/** Contiguous unpruned chain of n segments. */
const buildChain = (seed: number, n: number): TrackSegment[] => {
	const segs: TrackSegment[] = [generateSegment(seed, 0, INITIAL_ENTRY)];
	for (let i = 1; i < n; i++) segs.push(generateSegment(seed, i, segs[i - 1].exit));
	return segs;
};

/** First fork segment across a few seeds (deterministic search). */
const findFork = (): { seed: number; segs: TrackSegment[]; fork: TrackSegment } => {
	for (let seed = 1; seed < 20; seed++) {
		const segs = buildChain(seed, 80);
		const fork = segs.find((sg) => sg.kind === 'fork');
		if (fork) return { seed, segs, fork };
	}
	throw new Error('no fork found in 20 seeds x 80 segments');
};

/** First bob segment across a few seeds (deterministic search). */
const findBob = (): { seed: number; segs: TrackSegment[]; bob: TrackSegment } => {
	for (let seed = 1; seed < 30; seed++) {
		const segs = buildChain(seed, 80);
		const bob = segs.find((sg) => sg.kind === 'bob');
		if (bob) return { seed, segs, bob };
	}
	throw new Error('no bob found in 30 seeds x 80 segments');
};

const runUntil = (
	st: LugeState,
	segs: TrackSegment[],
	seed: number,
	steer: number,
	stopS: number,
): { state: LugeState; events: string[] } => {
	const all: string[] = [];
	let cur = st;
	for (let i = 0; i < 20000 && cur.s < stopS && cur.status === 'running'; i++) {
		const r = stepLuge(cur, { steer }, DT, segs);
		cur = r.state;
		all.push(...r.events);
	}
	return { state: cur, events: all };
};

describe('luge generation', () => {
	it('generateSegment is deterministic and seeds differ', () => {
		expect(generateSegment(42, 3, INITIAL_ENTRY)).toEqual(generateSegment(42, 3, INITIAL_ENTRY));
		expect(buildChain(1, 10)).toEqual(buildChain(1, 10));
		expect(buildChain(1, 10).map((s) => s.kind + s.length)).not.toEqual(buildChain(2, 10).map((s) => s.kind + s.length));
	});

	it('chain is continuous: exit == next entry, y strictly decreasing, 2 m sample spacing', () => {
		const segs = buildChain(7, 30);
		for (let i = 0; i < segs.length; i++) {
			const seg = segs[i];
			expect(seg.samples.length).toBe(seg.length / SAMPLE_STEP + 1);
			for (let k = 1; k < seg.samples.length; k++) {
				const a = seg.samples[k - 1];
				const b = seg.samples[k];
				expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(SAMPLE_STEP, 9);
				expect(b.y).toBeLessThan(a.y);
			}
			if (i > 0) {
				const prev = segs[i - 1];
				const first = seg.samples[0];
				expect(first.x).toBeCloseTo(prev.exit.x, 9);
				expect(first.y).toBeCloseTo(prev.exit.y, 9);
				expect(first.z).toBeCloseTo(prev.exit.z, 9);
				expect(seg.startS).toBe(prev.startS + prev.length);
			}
		}
	});

	it('ensureSegments covers [s, s+AHEAD], prunes behind, and pruning never changes the world', () => {
		let progressive: TrackSegment[] = [];
		for (let s = 0; s <= 3000; s += 200) progressive = ensureSegments(progressive, 11, s);
		const oneShot = ensureSegments([], 11, 3000);
		expect(progressive[progressive.length - 1].exit.startS).toBeGreaterThanOrEqual(3000 + AHEAD);
		expect(progressive[0].startS + progressive[0].length).toBeGreaterThanOrEqual(3000 - 60);
		const byIndex = new Map(oneShot.map((sg) => [sg.index, sg]));
		for (const sg of progressive) if (byIndex.has(sg.index)) expect(sg).toEqual(byIndex.get(sg.index));
	});

	it('a safe corridor always exists (50 seeds)', () => {
		for (let seed = 1; seed <= 50; seed++) {
			for (const seg of buildChain(seed, 20)) {
				if (seg.kind === 'fork') continue; // fork lanes tested separately
				for (const obs of seg.obstacles) {
					const f = obs.s / SAMPLE_STEP;
					const i = Math.min(Math.floor(f), seg.samples.length - 2);
					const w = seg.samples[i].width + (seg.samples[i + 1].width - seg.samples[i].width) * (f - i);
					const safe = latSafeAt(seed, seg.startS + obs.s, w);
					expect(Math.abs(obs.lat - safe)).toBeGreaterThanOrEqual(LUGE.corridorHalf + obs.r - 0.05);
				}
			}
		}
	});

	it('fork danger lane obstacles leave a passable gap', () => {
		const { fork } = findFork();
		const f = fork.fork!;
		const sign = f.danger === 'left' ? 1 : -1;
		for (const obs of fork.obstacles) {
			const l = sign * obs.lat;
			if (l < f.sepHalfMax || l > f.outerDanger) continue; // safe-side obstacle
			const gapInner = l - obs.r - f.sepHalfMax;
			const gapOuter = f.outerDanger - (l + obs.r);
			expect(Math.max(gapInner, gapOuter)).toBeGreaterThanOrEqual(2 * LUGE.sledHalf);
		}
	});

	it('difficulty ramps monotonically and stays bounded', () => {
		let prev = difficultyAt(0);
		for (let s = 250; s <= 12000; s += 250) {
			const d = difficultyAt(s);
			expect(d.vMax).toBeGreaterThanOrEqual(prev.vMax);
			expect(d.obstacleEvery).toBeLessThanOrEqual(prev.obstacleEvery);
			expect(d.width).toBeLessThanOrEqual(prev.width);
			prev = d;
		}
		expect(prev.vMax).toBeLessThanOrEqual(60);
		expect(prev.width).toBeGreaterThanOrEqual(8.9);
	});

	it('no fork/tunnel in the warm-up, never two forks back-to-back', () => {
		for (let seed = 1; seed <= 20; seed++) {
			const segs = buildChain(seed, 60);
			for (const sg of segs.slice(0, 4)) expect(['straight', 'curveL', 'curveR']).toContain(sg.kind);
			for (let i = 1; i < segs.length; i++) {
				if (segs[i].kind === 'fork') expect(segs[i - 1].kind).not.toBe('fork');
			}
		}
	});
});

describe('luge simulation', () => {
	it('createLuge starts running with 3 lives', () => {
		const st = createLuge();
		expect(st.lives).toBe(LUGE.lives);
		expect(st.status).toBe('running');
		expect(st.score).toBe(0);
	});

	it('score = floor(s) + bonusScore and speed stays bounded', () => {
		const seed = 5;
		let segs = ensureSegments([], seed, 0);
		let st = createLuge();
		for (let i = 0; i < 1200; i++) {
			segs = ensureSegments(segs, seed, st.s);
			st = stepLuge(st, { steer: 0 }, DT, segs).state;
			if (st.status === 'over') break;
		}
		expect(st.score).toBe(Math.floor(st.s) + st.bonusScore);
		expect(st.speed).toBeLessThanOrEqual(60 * LUGE.boostMul + 1e-6);
	});

	it('berms are never lethal and keep the sled on the track', () => {
		const seed = 5;
		const segs = ensureSegments([], seed, 0);
		let st: LugeState = { ...createLuge(), s: 20, lat: 50, latVel: 30 };
		st = stepLuge(st, { steer: 1 }, DT, segs).state;
		const hw = poseAt(segs, st.s, 0).width / 2;
		expect(Math.abs(st.lat)).toBeLessThanOrEqual(hw - LUGE.sledHalf + 1e-9);
		expect(st.lives).toBe(LUGE.lives);
	});

	it('hitting an obstacle costs a life, cuts speed, grants invulnerability - third crash ends the run', () => {
		const seed = 5;
		const segs = ensureSegments([], seed, 800);
		const seg = segs.find((sg) => sg.obstacles.length > 0 && sg.kind !== 'fork')!;
		const obs = seg.obstacles[0];
		const start: LugeState = { ...createLuge(), s: seg.startS + obs.s - 1, lat: obs.lat, speed: 20 };

		const r1 = stepLuge(start, { steer: 0 }, DT, segs);
		expect(r1.events).toContain('crash');
		expect(r1.state.lives).toBe(2);
		expect(r1.state.speed).toBe(LUGE.crashMinSpeed);
		expect(r1.state.invulnMs).toBeGreaterThan(0);

		// Still overlapping while invulnerable -> no second loss.
		const r2 = stepLuge(r1.state, { steer: 0 }, DT, segs);
		expect(r2.state.lives).toBe(2);
		expect(r2.events).not.toContain('crash');

		// Last life -> game over, then the state freezes.
		const lastLife: LugeState = { ...start, lives: 1 };
		const r3 = stepLuge(lastLife, { steer: 0 }, DT, segs);
		expect(r3.events).toContain('gameOver');
		expect(r3.state.status).toBe('over');
		const r4 = stepLuge(r3.state, { steer: 0 }, DT, segs);
		expect(r4.state).toBe(r3.state);
		expect(r4.events).toEqual([]);
	});

	it('fork: safe lane crossing emits forkSafe, danger lane pays a bonus + boost', () => {
		const { seed, segs, fork } = findFork();
		const f = fork.fork!;
		const noseAbs = fork.startS + f.noseS;
		const mergeAbs = fork.startS + f.mergeS;
		const dangerSign = f.danger === 'left' ? 1 : -1;

		const mk = (lat: number): LugeState => ({
			...createLuge(),
			s: noseAbs - 5,
			lat,
			speed: 20,
			invulnMs: 1e7, // survive lane obstacles - we test the fork mechanics here
		});

		const safeRun = runUntil(mk(-dangerSign * 4), segs, seed, 0, mergeAbs + 5);
		expect(safeRun.events).toContain('forkSafe');
		expect(safeRun.events).not.toContain('forkBonus');
		expect(safeRun.state.bonusScore).toBe(0);

		const dangerRun = runUntil(mk(dangerSign * 4), segs, seed, 0, mergeAbs + 5);
		expect(dangerRun.events).toContain('forkDanger');
		expect(dangerRun.events).toContain('forkBonus');
		// bonus + possible near-miss rewards while threading the danger lane
		expect(dangerRun.state.bonusScore).toBeGreaterThanOrEqual(f.bonus);
		expect(dangerRun.state.boostMs).toBeGreaterThan(0);
	});

	it('fork: hitting the separator nose head-on crashes and snaps to the safe lane', () => {
		const { seed, segs, fork } = findFork();
		const f = fork.fork!;
		const noseAbs = fork.startS + f.noseS;
		const st: LugeState = { ...createLuge(), s: noseAbs - 0.2, lat: 0, speed: 20 };
		const r = stepLuge(st, { steer: 0 }, DT, segs);
		expect(r.events).toContain('forkNoseHit');
		expect(r.events).toContain('crash');
		expect(r.state.lives).toBe(LUGE.lives - 1);
		expect(Math.abs(r.state.lat)).toBeGreaterThan(f.sepHalfMax);
		expect(r.state.lane).not.toBe(f.danger);
	});

	it('sepHalfAt is 0 at the nose and the merge, positive in between', () => {
		const { fork } = findFork();
		const f = fork.fork!;
		expect(sepHalfAt(f, f.noseS)).toBe(0);
		expect(sepHalfAt(f, (f.noseS + f.mergeS) / 2)).toBeCloseTo(f.sepHalfMax, 6);
		expect(sepHalfAt(f, f.mergeS)).toBe(0);
	});

	it('bob: icy pipe has no obstacles, walls climb and pull back without costing lives', () => {
		const { segs, bob } = findBob();
		expect(bob.bob).toBe(true);
		expect(bob.obstacles).toEqual([]);
		const s0 = bob.startS + bob.length / 2;
		const w = poseAt(segs, s0, 0).width;
		// Dropped high on the wall: no crash, gravity pulls back toward the pipe floor.
		const st: LugeState = { ...createLuge(), s: s0, lat: w / 2 + 1.5, speed: 25 };
		const r = stepLuge(st, { steer: 0 }, DT, segs);
		expect(r.events).toEqual([]);
		expect(r.state.lives).toBe(LUGE.lives);
		expect(r.state.latVel).toBeLessThan(0);
		// The wall rise shows up in the pose: the symmetric mean cancels banking,
		// leaving only the (symmetric) wall lift above the pipe floor.
		const mean = (poseAt(segs, s0, w / 2 + 1.5).y + poseAt(segs, s0, -(w / 2 + 1.5)).y) / 2;
		expect(mean).toBeGreaterThan(poseAt(segs, s0, 0).y);
	});

	it('bob: icy sections push the speed target above the regular ramp', () => {
		const { segs, bob } = findBob();
		const s0 = bob.startS + bob.length / 2;
		const v = difficultyAt(s0).vMax;
		const st: LugeState = { ...createLuge(), s: s0, lat: 0, speed: v };
		expect(stepLuge(st, { steer: 0 }, DT, segs).state.speed).toBeGreaterThan(v);
	});

	it('poseAt offsets along the left normal and follows the descent', () => {
		const segs = ensureSegments([], 3, 0);
		const center = poseAt(segs, 40, 0);
		const left = poseAt(segs, 40, 2);
		expect(Math.hypot(left.x - center.x, left.z - center.z)).toBeCloseTo(2, 6);
		expect(poseAt(segs, 200, 0).y).toBeLessThan(center.y);
		expect(segmentAt(segs, 40).startS).toBeLessThanOrEqual(40);
	});
});
