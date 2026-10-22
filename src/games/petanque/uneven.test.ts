import { describe, it, expect } from 'vitest';
import { makeTerrain, SURFACES, ampFor, patchAt, surfaceAt, heightAt, looseAt, LOOSE_FULL, type Terrain, type GroundSample } from './terrain';
import {
	makeBoule, place, release, settle, stepSim, throwVelocity, blindSim, speed2, STANDARD_KIT, BOULE_R,
	type Sim, type Kit, type Impact,
} from './engine';
import { pointHolder, endScore } from './rules13';

const uneven = (d: number, seed = 4242, id: keyof typeof SURFACES = 'gravier-fin') =>
	makeTerrain(seed, SURFACES[id], ampFor(d), { difficulty: d });

function rest(t: Terrain, kit: Kit | undefined, v = throwVelocity(0.01, 1, 7, 0.55), blind = false): { x: number; y: number } {
	const s: Sim = { t, bs: [], rng: 3, ...(kit ? { kits: [kit, kit] as [Kit, Kit] } : {}) };
	const run = blind ? blindSim(s) : s;
	const b = release(t, makeBoule(2, 1, 0, kit), v);
	run.bs.push(b);
	settle(run, undefined, 30);
	return { x: b.x, y: b.y };
}

function coverage(t: Terrain): number {
	const w = { a: 0, b: 0 };
	let n = 0, on = 0;
	for (let y = 0.05; y < 15; y += 0.1)
		for (let x = 0.05; x < 4; x += 0.1) {
			patchAt(t, x, y, w);
			if (w.a + w.b > 0.5) on++;
			n++;
		}
	return on / n;
}

describe('an even pitch', () => {
	it('carries none of the uneven fields', () => {
		const t = makeTerrain(4242, SURFACES['gravier-fin'], 0.03);
		expect(t.rough).toBeUndefined();
		expect(t.pw).toBeUndefined();
		expect(t.ld).toBeUndefined();
		expect(looseAt(t, 1.3, 7.7)).toBe(0);
		const g: GroundSample = { rollFriction: 0, restitution: 0, impactFriction: 0, scatter: 0, grit: 0 };
		surfaceAt(t, 1.3, 7.7, g);
		expect(g.rollFriction).toBe(SURFACES['gravier-fin'].rollFriction);
	});

	it('the standard kit replays a default boule bit for bit, even pitch or not', () => {
		for (const t of [makeTerrain(4242, SURFACES['gravier-gros'], 0.05), uneven(80, 4242, 'gravier-gros')])
			expect(rest(t, STANDARD_KIT)).toEqual(rest(t, undefined));
	});
});

describe('difficulty', () => {
	it('0 is a raked, even ground: no patches', () => {
		for (const seed of [1, 77, 4242]) expect(coverage(uneven(0, seed))).toBeLessThan(0.005);
	});

	it('brings patches, stones and relief as it rises', () => {
		const at = (d: number) => {
			let cov = 0, stones = 0;
			for (const seed of [1, 77, 4242, 99991]) {
				const t = uneven(d, seed);
				cov += coverage(t);
				stones += t.pebbles.length;
			}
			return { cov, stones };
		};
		const lo = at(25), mid = at(60), hi = at(100);
		expect(mid.cov).toBeGreaterThan(lo.cov);
		expect(hi.cov).toBeGreaterThan(mid.cov);
		expect(hi.cov / 4).toBeGreaterThan(0.25);
		expect(mid.stones).toBeGreaterThan(lo.stones);
		expect(hi.stones).toBeGreaterThan(mid.stones);
		expect(ampFor(100)).toBeGreaterThan(ampFor(0));
	});

	it('a patch changes the ground under it', () => {
		const t = uneven(100, 77, 'terre-battue');
		const w = { a: 0, b: 0 };
		const g: GroundSample = { rollFriction: 0, restitution: 0, impactFriction: 0, scatter: 0, grit: 0 };
		let sandy = false;
		for (let y = 0.05; y < 15 && !sandy; y += 0.1)
			for (let x = 0.05; x < 4 && !sandy; x += 0.1) {
				patchAt(t, x, y, w);
				if (w.b > 0.95) {
					surfaceAt(t, x, y, g);
					// Sand, dragged harder by the loose bed lying there.
					const soft = Math.min(1, looseAt(t, x, y) / LOOSE_FULL);
					expect(g.rollFriction).toBeCloseTo(SURFACES.sable.rollFriction * (1 + 0.8 * soft), 2);
					sandy = true;
				}
			}
		expect(sandy).toBe(true);
	});

	it('lays the loose bed deeper against the planks than down the lane, deeper as it rises', () => {
		const depth = (d: number, inLane: boolean) => {
			let sum = 0, n = 0;
			for (let seed = 1; seed <= 6; seed++) {
				const t = uneven(d, seed * 131);
				for (let y = 2; y < 13; y += 0.25) {
					for (const x of inLane ? [1.8, 2, 2.2] : [0.05, 3.95]) { sum += looseAt(t, x, y); n++; }
				}
			}
			return sum / n;
		};
		expect(depth(80, false)).toBeGreaterThan(depth(80, true) * 2);
		expect(depth(80, true)).toBeGreaterThan(depth(20, true));
		expect(depth(100, false)).toBeLessThan(LOOSE_FULL * 1.1);
	});

	it('a deep bed keeps less of a bounce and of the run: the boule stops shorter', () => {
		const t = uneven(60, 4242, 'gravier-fin');
		const raked = { ...t, ld: new Float32Array(t.ld!.length).fill(0.002) };
		const deep = { ...t, ld: new Float32Array(t.ld!.length).fill(LOOSE_FULL) };
		const g: GroundSample = { rollFriction: 0, restitution: 0, impactFriction: 0, scatter: 0, grit: 0 };
		const h: GroundSample = { ...g };
		surfaceAt(raked, 2, 7, g);
		surfaceAt(deep, 2, 7, h);
		expect(h.restitution).toBeLessThan(g.restitution * 0.6);
		expect(h.rollFriction).toBeGreaterThan(g.rollFriction * 1.5);
		const v = throwVelocity(0, 1, 7, 0.55);
		expect(rest(deep, undefined, v).y).toBeLessThan(rest(raked, undefined, v).y - 0.5);
	});

	it('a deep bed evens out the boules\' hardness: a soft and a hard boule end nearer each other', () => {
		const t = uneven(60, 4242, 'gravier-fin');
		const raked = { ...t, ld: new Float32Array(t.ld!.length).fill(0.002) };
		const deep = { ...t, ld: new Float32Array(t.ld!.length).fill(LOOSE_FULL) };
		const soft: Kit = { ...STANDARD_KIT, e: 0.8, bite: 0.8 };
		const hard: Kit = { ...STANDARD_KIT, e: 0.95, bite: 1.2 };
		const v = throwVelocity(0, 1, 7, 0.55);
		const gap = (tt: Terrain) => Math.abs(rest(tt, hard, v, true).y - rest(tt, soft, v, true).y);
		expect(gap(deep)).toBeLessThan(gap(raked) * 0.8);
		// The standard boule is the standard boule on any bed.
		expect(rest(deep, STANDARD_KIT, v, true)).toEqual(rest(deep, undefined, v, true));
	});

	it('replays the same on the same seed', () => {
		const run = () => rest(uneven(90, 20260917, 'gravier-gros'), undefined, throwVelocity(-0.03, 1, 7.4, 0.4));
		expect(run()).toEqual(run());
	});
});

describe('stones and micro-gravel', () => {
	it('a blind plan feels neither, the real throw does', () => {
		let differ = 0;
		for (let seed = 1; seed <= 12; seed++) {
			const t = uneven(100, seed * 7919, 'gravier-gros');
			const real = rest(t, undefined), blind = rest(t, undefined, undefined, true);
			if (Math.abs(real.x - blind.x) + Math.abs(real.y - blind.y) > 0.005) differ++;
		}
		expect(differ).toBeGreaterThan(5);
		const even = makeTerrain(7919, SURFACES['gravier-gros'], 0.05);
		expect(rest(even, undefined)).toEqual(rest(even, undefined, undefined, true));
	});

	it('a stone under the landing sends the boule away from it', () => {
		const t = makeTerrain(5, SURFACES['terre-battue'], 0, { slope: 0, noPebbles: true, difficulty: 0 });
		const v = throwVelocity(0, 1, 7, 0.6);
		// Where it comes down, with no stone.
		const s: Sim = { t, bs: [], rng: 0 };
		const b = release(t, makeBoule(2, 1, 0), v);
		s.bs.push(b);
		const imp: Impact[] = [];
		while (!imp.some((i) => i.kind === 'ground')) stepSim(s, 1 / 120, imp);
		const land = imp.find((i) => i.kind === 'ground')!;
		const free = rest(t, undefined, v);
		// The same throw with a 2 cm stone just left of the landing spot (facing +y, left is -x).
		t.pebbles = [{ x: land.x - 0.012, y: land.y, r: 0.02 }];
		t.pg = Array.from({ length: t.pgNx * t.pgNy }, () => [] as number[]);
		t.pg[Math.floor(land.y / t.pgCell) * t.pgNx + Math.floor((land.x - 0.012) / t.pgCell)].push(0);
		const kicked = rest(t, undefined, v);
		expect(kicked.x - free.x).toBeGreaterThan(0.05);
	});

	it('micro-gravel turns a rolling boule, more on a rougher pitch', () => {
		const drift = (d: number) => {
			let sum = 0;
			for (let seed = 1; seed <= 8; seed++) {
				const t = makeTerrain(seed * 104729, SURFACES['gravier-fin'], 0, { slope: 0, noPebbles: true, difficulty: d });
				const go = (blind: boolean) => {
					const s: Sim = { t, bs: [], rng: 0, blind };
					const b = place(t, makeBoule(2, 3, 0));
					b.vy = 3;
					s.bs.push(b);
					settle(s, undefined, 30);
					return b.x;
				};
				sum += Math.abs(go(false) - go(true));
			}
			return sum / 8;
		};
		expect(drift(0)).toBe(0);
		expect(drift(100)).toBeGreaterThan(drift(30));
		expect(drift(100)).toBeGreaterThan(0.01);
	});
});

describe('kits', () => {
	const heavy: Kit = { m: 0.78, r: BOULE_R, e: 0.9, bite: 1, aim: 1 };
	const light: Kit = { m: 0.65, r: BOULE_R, e: 0.9, bite: 1, aim: 1 };

	it('a heavy boule stays nearer where it lands', () => {
		const t = makeTerrain(5, SURFACES['gravier-fin'], 0, { slope: 0, noPebbles: true });
		const v = throwVelocity(0, 1, 7, 0.6);
		expect(rest(t, heavy, v).y).toBeLessThan(rest(t, light, v).y - 0.1);
	});

	it('two makes meet halfway: a soft pair leaves the shooter more of its run', () => {
		const t = makeTerrain(1, SURFACES['terre-battue'], 0, { slope: 0, noPebbles: true });
		const after = (e: number) => {
			const kit: Kit = { ...STANDARD_KIT, e };
			const target = place(t, makeBoule(2, 8, 1, kit));
			const shooter = place(t, makeBoule(2, 7.8, 0, kit));
			shooter.vy = 9;
			const s: Sim = { t, bs: [shooter, target], rng: 0 };
			for (let k = 0; k < 400 && !stepSim(s, 1 / 240).hitBoule; k++);
			return speed2(shooter);
		};
		expect(after(0.84)).toBeGreaterThan(after(0.95));
	});

	it('the umpire measures to the edge: the bigger boule holds the point at the same centre distance', () => {
		const jack = { x: 2, y: 8, side: -1, live: true };
		const small = { x: 2.1, y: 8, side: 0, live: true, r: 0.036 };
		const big = { x: 1.9, y: 8, side: 1, live: true, r: 0.039 };
		expect(pointHolder([small, big], jack)).toBe(1);
		expect(endScore([small, big], jack)).toEqual({ side: 1, points: 1 });
		const std = { x: 2.1, y: 8, side: 0, live: true, r: BOULE_R };
		expect(pointHolder([std, { ...std, x: 1.9, side: 1 }], jack)).toBe('tie');
	});

	it('a kit is placed at its own height', () => {
		const t = makeTerrain(5, SURFACES['gravier-fin'], 0.02);
		const b = place(t, makeBoule(2, 5, 0, heavy));
		expect(b.z).toBeCloseTo(heightAt(t, 2, 5) + heavy.r, 9);
	});
});
