/* Headless checks for the Rayou prototype: every platforming step can be done (and the
   gated ones can only be done the intended way), and a random-walk fuzz finds no spot where
   Rayou stays stuck. Usage: npx tsx scripts/check-rayou.ts [--fuzz-minutes N] */
import * as THREE from 'three';
import { buildZones } from '../src/prototypes/rayou/zones';
import { Player, RUN, type Command } from '../src/prototypes/rayou/player';
import { groundHeight, mountPoint, ringLevel, riverX, ISLETS, BANK, OAK, OAK_GATE, MILL, MOUNT, BOUNDS, waterAt, WATER_Y, START } from '../src/prototypes/rayou/terrain';
import { query, inside } from '../src/prototypes/rayou/colliders';

const scene = new THREE.Scene();
const zones = buildZones(scene);
const DT = 1 / 60;
let clock = 0;

type P = { x: number; z: number; y?: number };
const events: string[] = [];

function mk(at: P, yaw: number): Player {
	const p = new Player();
	p.teleport(at.x, at.z, yaw, at.y);
	p.onEvent = (e) => events.push(e);
	return p;
}

function step(p: Player, cmd: Command) {
	clock += DT;
	zones.update(DT, clock, p.grounded ? p.support : null);
	p.update(DT, cmd);
}

const toward = (p: Player, t: P, mag = 1): Command => {
	const dx = t.x - p.pos.x, dz = t.z - p.pos.z;
	const d = Math.hypot(dx, dz) || 1;
	return { dirX: (dx / d) * mag, dirZ: (dz / d) * mag, jump: false, jumpHeld: false, roll: false };
};

// Runs from `from` toward `to`, jumping (or roll-jumping) when `at` metres remain to the target.
function tryJump(from: P, to: P, opts: { roll?: boolean; at: number; settle?: number; runup?: number }): Player {
	const yaw = Math.atan2(to.x - from.x, to.z - from.z);
	const p = mk(from, yaw);
	let jumped = false, rolled = false;
	for (let i = 0; i < 60 * 6; i++) {
		const c = toward(p, to);
		const d = Math.hypot(to.x - p.pos.x, to.z - p.pos.z);
		if (opts.roll && !rolled && d < opts.at + (opts.runup ?? 2.2)) {
			c.roll = true;
			rolled = true;
		}
		if (!jumped && d < opts.at) {
			c.jump = true;
			jumped = true;
		}
		c.jumpHeld = jumped && i % 1 === 0;
		// Like a player: let go of the stick once over the target.
		if ((d < 0.25 && p.grounded) || (!p.grounded && jumped && d < 0.45)) {
			c.dirX = c.dirZ = 0;
		}
		step(p, c);
		if (p.respawnT > 0) return p;
		if (jumped && p.grounded && d < 0.6 && i > 20) {
			for (let k = 0; k < (opts.settle ?? 20); k++) step(p, { dirX: 0, dirZ: 0, jump: false, jumpHeld: false, roll: false });
			return p;
		}
	}
	return p;
}

function landed(p: Player, to: P, tol = 0.75): boolean {
	return p.respawnT <= 0 && p.grounded && Math.hypot(p.pos.x - to.x, p.pos.z - to.z) < tol + 0.6 && (to.y === undefined || Math.abs(p.pos.y - to.y) < 0.15);
}

// How many jump-timing choices work: 0 = impossible, a handful = tight, many = easy.
function jumpWindow(from: P, to: P, roll = false): number {
	let ok = 0;
	for (let at = 0.2; at <= 5; at += 0.1) if (landed(tryJump(from, to, { roll, at }), to)) ok++;
	return ok;
}

const top = (x: number, z: number) => {
	let h = groundHeight(x, z);
	for (const s of query(x, z)) if (s.y1 < h + 12 && s.y1 > h && inside(s, x, z, 0)) h = s.y1;
	return h;
};
const at = (x: number, z: number): P => ({ x, z, y: top(x, z) });
const fails: string[] = [];
function expect(name: string, cond: boolean, detail = '') {
	console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
	if (!cond) fails.push(name);
}
function chain(name: string, pts: P[], roll: boolean[] = []) {
	for (let i = 0; i < pts.length - 1; i++) {
		const w = jumpWindow(pts[i], pts[i + 1], roll[i]);
		expect(`${name} ${i}→${i + 1}`, w >= 3, `window ${w}`);
	}
}

// — Oak gate: walking is blocked, rolling passes. —
{
	const from = { x: OAK_GATE.x + 0.3, z: OAK_GATE.z + 4 };
	const walk = mk(from, Math.PI);
	for (let i = 0; i < 180; i++) step(walk, toward(walk, { x: from.x, z: OAK_GATE.z - 4 }));
	expect('trunk blocks walking', walk.pos.z > OAK_GATE.z + 0.3, `z ${walk.pos.z.toFixed(2)}`);
	const roll = mk(from, Math.PI);
	for (let i = 0; i < 240; i++) {
		const c = toward(roll, { x: from.x, z: OAK_GATE.z - 4 });
		if (i % 40 === 20) c.roll = true;
		step(roll, c);
	}
	expect('trunk lets rolling through', roll.pos.z < OAK_GATE.z - 1, `z ${roll.pos.z.toFixed(2)}`);
	const jump = mk(from, Math.PI);
	for (let i = 0; i < 180; i++) {
		const c = toward(jump, { x: from.x, z: OAK_GATE.z - 4 });
		if (i % 30 === 10) c.jump = true;
		c.jumpHeld = true;
		step(jump, c);
	}
	expect('trunk cannot be jumped', jump.pos.z > OAK_GATE.z + 0.3, `z ${jump.pos.z.toFixed(2)}`);
}

// — Steep slopes cannot be climbed by spamming jumps (oak ridge, world rim). —
{
	const tries: [string, P, P][] = [
		['oak ridge', { x: OAK_GATE.x + 12, z: OAK_GATE.z - 6 + 10 }, { x: OAK_GATE.x, z: OAK_GATE.z - 16 }],
		['world rim', { x: BOUNDS.x0 + 6, z: 0 }, { x: BOUNDS.x0 - 10, z: 0 }],
	];
	for (const [name, from, to] of tries) {
		const p = mk(from, 0);
		let maxClimb = 0;
		for (let i = 0; i < 60 * 12; i++) {
			const c = toward(p, to);
			if (i % 12 === 0) c.jump = true;
			c.jumpHeld = true;
			step(p, c);
			maxClimb = Math.max(maxClimb, p.pos.y);
		}
		// Never over the top: the oak ridge is 5 m, the rim 9 m.
		const inside = name === 'oak ridge' ? Math.hypot(p.pos.x - OAK.x, p.pos.z - OAK.z) < OAK.valley - 1 : p.pos.x < BOUNDS.x0 - 2;
		expect(`${name}: jump spam does not climb over`, maxClimb < 4 && !inside, `max y ${maxClimb.toFixed(2)}, inside ${inside}`);
	}
}

// — River islets. —
{
	const a = ISLETS[0];
	const bankA = riverX(a.z) - BANK;
	chain('islet A', [at(bankA - 1.2, a.z - 1.1), at(bankA + 1.1, a.z - 1.1), at(bankA + 2.4, a.z + 0.6), at(a.x, a.z)]);
	const c = ISLETS[2];
	const bankC = riverX(c.z) - BANK;
	const jettyEnd = at(bankC + 0.6, c.z);
	const startC = at(bankC - 3.5, c.z);
	expect('islet C needs the roll jump', jumpWindow(startC, at(c.x, c.z)) === 0, `plain ${jumpWindow(startC, at(c.x, c.z))}`);
	expect('islet C roll jump works', jumpWindow(startC, at(c.x, c.z), true) >= 3, `roll ${jumpWindow(startC, at(c.x, c.z), true)}`);
	expect('islet C back with a roll jump', jumpWindow(at(c.x + 0.8, c.z), at(bankC - 1.5, c.z), true) >= 2, `back ${jumpWindow(at(c.x + 0.8, c.z), at(bankC - 1.5, c.z), true)}`);
	void jettyEnd;
	const b = ISLETS[1];
	expect('islet B reachable by roll jump', jumpWindow(at(riverX(b.z) - BANK - 2.5, b.z), at(b.x, b.z), true) >= 2);
	for (const i of ISLETS) {
		const east = at(riverX(i.z) + BANK + 1.5, i.z);
		expect(`east bank out of reach from islet ${i.z}`, jumpWindow(at(i.x - 0.6, i.z), east, true) === 0);
	}
}

// — Hazel rock: hop up the stair of rocks; the third rock is out of reach from the grass. —
{
	const steps = zones.hazelSteps;
	const p0 = steps[0];
	const away = { x: p0.x - 12, z: p0.z + 10 };
	const len = Math.hypot(away.x, away.z);
	const start = at(p0.x + (away.x / len) * 2.4, p0.z + (away.z / len) * 2.4);
	chain('hazel rocks', [start, ...steps.map((s) => ({ x: s.x, z: s.z, y: s.y }))]);
	const s2 = steps[2];
	expect('hazel rock 3 is not reachable from the grass', jumpWindow(at(s2.x + 2.2, s2.z + 0.5), { x: s2.x, z: s2.z, y: s2.y }) === 0);
}

// — Forest. —
{
	const cx = -40, cz = 14;
	const pts: P[] = [at(cx - 4.5, cz - 1.5)];
	[0, 1, 2, 3].forEach((i) => {
		const a = ((200 + i * 50) * Math.PI) / 180;
		pts.push(at(cx + Math.cos(a) * 2.2, cz + Math.sin(a) * 2.2));
	});
	pts.push(at(cx, cz));
	chain('stump spiral', pts);
	const px = -62, pz = -22;
	const mush = at(px + 2.6, pz + 1.0);
	// Hop onto the mushroom, bounce, steer onto the pillar.
	let best = 0;
	for (let lead = 0.6; lead <= 2.6; lead += 0.2) {
		const p = mk(at(px + 5.5, pz + 1.0), -Math.PI / 2);
		let phase = 0;
		for (let i = 0; i < 400; i++) {
			const target = phase === 0 ? mush : { x: px, z: pz };
			const c = toward(p, target);
			const d = Math.hypot(mush.x - p.pos.x, mush.z - p.pos.z);
			if (phase === 0 && d < lead) {
				c.jump = true;
				phase = 1;
			}
			c.jumpHeld = true;
			step(p, c);
		}
		if (Math.abs(p.pos.y - (groundHeight(px, pz) + 4.0)) < 0.2 && p.grounded) best++;
	}
	expect('forest bounce to pillar', best >= 2, `${best} leads work`);

	// Hollow log and corral: crawl under by rolling.
	const log = mk(at(-42.8, -15.5), 0);
	let closest = Infinity;
	for (let i = 0; i < 160; i++) {
		const c = toward(log, { x: -42.8, z: -13 });
		if (i === 10) c.roll = true;
		step(log, c);
		closest = Math.min(closest, Math.hypot(log.pos.x + 42.8, log.pos.z + 13));
	}
	expect('hollow log: baby reachable by rolling', closest < 0.8, `closest ${closest.toFixed(2)}`);
	const cor = mk(at(-66 + 5, -6), -Math.PI / 2);
	for (let i = 0; i < 200; i++) {
		const c = toward(cor, { x: -66, z: -6 });
		if (i === 10) c.roll = true;
		step(cor, c);
	}
	expect('corral: baby reachable by rolling', Math.hypot(cor.pos.x + 66, cor.pos.z + 6) < 1.2, `at ${cor.pos.x.toFixed(1)},${cor.pos.z.toFixed(1)}`);
	const bramble = zones.breakables.find((b) => b.id === 'bramble')!;
	const dir = { x: bramble.x - -58, z: bramble.z - 6 };
	const len = Math.hypot(dir.x, dir.z);
	const outside = at(-58 + (dir.x / len) * 6.5, 6 + (dir.z / len) * 6.5);
	const br = mk(outside, 0);
	for (let i = 0; i < 160; i++) {
		const c = toward(br, { x: -58, z: 6 });
		if (i === 20) c.roll = true;
		step(br, c);
	}
	expect('bramble breaks with a roll', !bramble.alive && Math.hypot(br.pos.x + 58, br.pos.z - 6) < 1.5, `alive ${bramble.alive}`);
}

// — Mill. —
{
	const G = groundHeight(MILL.x, MILL.z);
	const shedX = MILL.x + 5.6, shedZ = MILL.z - 0.3;
	const route: P[] = [
		at(shedX + 4.6, shedZ + 2.0),
		at(shedX + 2.7, shedZ + 2.0),
		at(shedX + 2.0, shedZ + 0.2),
		at(shedX + 0.5, shedZ + 0.3),
		at(shedX - 0.9, shedZ - 0.6),
		at(shedX - 1.5, shedZ + 0.9),
		{ x: MILL.x + 2.95, z: MILL.z + 0.4, y: G + 5.0 },
		...([[-0.55, 5.8], [-1.3, 6.6], [-2.05, 7.4]] as const).map(([a, t]) => ({ x: MILL.x + Math.cos(a) * 2.85, z: MILL.z + Math.sin(a) * 2.85, y: G + t })),
		{ x: MILL.x - 1.45, z: MILL.z + 0.4, y: G + 8 },
	];
	// The balcony walk between the barrel landing and the first ledge.
	route.splice(7, 0, { x: MILL.x + Math.cos(-0.1) * 2.95, z: MILL.z + Math.sin(-0.1) * 2.95, y: G + 5.0 });
	chain('mill route', route);
}

// — Lake pads (still ones). —
chain('lake pads', [at(5, 37.5), at(5.2, 40.2), at(6.6, 42.3), at(5.0, 44.6), at(6, 47.2)]);
chain('lake west', [at(4.6, 49.6), at(3.0, 50.9), at(0.6, 52.6), at(-2.3, 52.0), at(-4.4, 49.3), at(-5.2, 46.0), at(-4.0, 42.6)]);

// — The Peak, device by device. —
{
	const P = (r: number, a: number) => ({ ...mountPoint(r, a), y: undefined as number | undefined });
	const onRing = (r: number, a: number, k: number) => ({ ...mountPoint(r, a), y: ringLevel(k) });
	// Ramp from the ground.
	const ramp = mk(P(28, 2.55), 0);
	for (let i = 0; i < 400; i++) step(ramp, toward(ramp, i < 120 ? P(24.5, 2.55) : P(24.5, 3.05)));
	expect('peak entrance ramp', Math.abs(ramp.pos.y - ringLevel(0)) < 0.05, `y ${ramp.pos.y.toFixed(2)}`);
	chain('peak crates', [onRing(24.6, -1.75, 0), { ...mountPoint(24.6, -1.56), y: 2.8 }, { ...mountPoint(24.0, -1.475), y: 3.6 }, { ...mountPoint(23.5, -1.395), y: 4.4 }, onRing(22.2, -1.395, 1)]);
	// Chasms: plain jumps on rings 2 and 4, roll jump on ring 6.
	expect('ring 2 chasm', jumpWindow(onRing(18.5, 1.3, 2), onRing(18.5, 1.72, 2)) >= 3);
	expect('ring 4 chasm', jumpWindow(onRing(12.5, -0.85, 4), onRing(12.5, -0.35, 4)) >= 3);
	expect('ring 6 chasm needs a roll jump', jumpWindow(onRing(6.5, 2.4, 6), onRing(6.5, -2.75, 6)) === 0);
	expect('ring 6 chasm roll jump', jumpWindow(onRing(6.5, 2.2, 6), onRing(6.5, -2.75, 6), true) >= 2, `${jumpWindow(onRing(6.5, 2.2, 6), onRing(6.5, -2.75, 6), true)}`);
	// Mushroom bounce from ring 2 to ring 3.
	let ok = 0;
	for (let lead = 0.6; lead <= 2.6; lead += 0.2) {
		const m = mountPoint(18.6, 2.4);
		const p = mk(onRing(19.6, 2.25, 2), 0);
		let phase = 0;
		for (let i = 0; i < 400; i++) {
			const c = toward(p, phase === 0 ? m : mountPoint(15.5, 2.4));
			if (phase === 0 && Math.hypot(m.x - p.pos.x, m.z - p.pos.z) < lead) {
				c.jump = true;
				phase = 1;
			}
			c.jumpHeld = true;
			step(p, c);
		}
		if (Math.abs(p.pos.y - ringLevel(3)) < 0.1) ok++;
	}
	expect('peak mushroom to ring 3', ok >= 3, `${ok} leads`);
	// Slab: walking blocked, rolling passes onto the ramp, ramp reaches ring 4.
	const s0 = onRing(15.5, -2.35, 3);
	const walk = mk(s0, 0);
	for (let i = 0; i < 200; i++) step(walk, toward(walk, mountPoint(15.5, -1.9)));
	expect('slab blocks walking', mountPolarA(walk) < -2.13, `a ${mountPolarA(walk).toFixed(3)}`);
	const roll = mk(s0, 0);
	for (let i = 0; i < 600; i++) {
		const tgt = i < 150 ? mountPoint(15.5, -1.9) : i < 400 ? mountPoint(15.5, -1.58) : mountPoint(12.5, -1.58);
		const c = toward(roll, tgt);
		if (i === 5) c.roll = true;
		step(roll, c);
	}
	expect('slab roll then ramp to ring 4', Math.abs(roll.pos.y - ringLevel(4)) < 0.1, `y ${roll.pos.y.toFixed(2)}`);
	// Piston ride.
	const pist = mountPoint(11.85, 0.2);
	const rider = mk(onRing(12.6, 0.05, 4), 0);
	let rode = false;
	for (let i = 0; i < 60 * 30 && !rode; i++) {
		const onTop = Math.hypot(rider.pos.x - pist.x, rider.pos.z - pist.z) < 0.5;
		const c = rider.pos.y > ringLevel(5) - 0.2 ? toward(rider, mountPoint(9.5, 0.2)) : onTop ? toward(rider, pist, 0) : toward(rider, pist, 0.6);
		step(rider, c);
		if (Math.abs(rider.pos.y - ringLevel(5)) < 0.05 && Math.hypot(rider.pos.x - MOUNT.x, rider.pos.z - MOUNT.z) < 11) rode = true;
	}
	expect('piston carries Rayou to ring 5', rode);
	// Boulder.
	const boulder = zones.breakables.find((b) => b.id === 'boulder')!;
	const bp = mk(onRing(9.5, 1.2, 5), 0);
	for (let i = 0; i < 200; i++) step(bp, toward(bp, mountPoint(9.5, 1.74)));
	expect('boulder blocks walking', boulder.alive);
	for (let i = 0; i < 700; i++) {
		const c = toward(bp, i < 200 ? mountPoint(9.5, 1.9) : i < 450 ? mountPoint(9.5, 2.36) : mountPoint(6.5, 2.36));
		if (i === 2) c.roll = true;
		step(bp, c);
	}
	expect('boulder breaks, ramp to ring 6', !boulder.alive && Math.abs(bp.pos.y - ringLevel(6)) < 0.1, `y ${bp.pos.y.toFixed(2)}`);
	chain('summit pillars', [onRing(6.5, -2.55, 6), { ...mountPoint(6.5, -2.2), y: 20.8 }, { ...mountPoint(6.5, -1.75), y: 21.6 }, { ...mountPoint(6.5, -1.3), y: 22.4 }, { ...mountPoint(3.5, -1.3), y: ringLevel(7) }]);
}

function mountPolarA(p: Player) {
	return Math.atan2(p.pos.z - MOUNT.z, p.pos.x - MOUNT.x);
}

// — Flood fill on a 0.5 m grid: before the dam, the east bank (and the Peak) is out of reach. —
{
	const S = 0.5;
	const nx = Math.round((BOUNDS.x1 - BOUNDS.x0) / S), nz = Math.round((BOUNDS.z1 - BOUNDS.z0) / S);
	const h = (x: number, z: number) => {
		let y = groundHeight(x, z);
		for (const s of query(x, z)) if (s.y1 > y && s.y1 < y + 3 && inside(s, x, z, 0)) y = s.y1;
		return y;
	};
	const flood = () => {
		const hs = new Float32Array((nx + 1) * (nz + 1));
		for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) hs[j * (nx + 1) + i] = h(BOUNDS.x0 + i * S, BOUNDS.z0 + j * S);
		const seen = new Uint8Array(hs.length);
		const q = [Math.round((START.z - BOUNDS.z0) / S) * (nx + 1) + Math.round((START.x - BOUNDS.x0) / S)];
		seen[q[0]] = 1;
		while (q.length) {
			const c = q.pop()!;
			const i = c % (nx + 1), j = Math.floor(c / (nx + 1));
			for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const a = i + di, b = j + dj;
				if (a < 0 || b < 0 || a > nx || b > nz) continue;
				const n = b * (nx + 1) + a;
				if (seen[n]) continue;
				const x = BOUNDS.x0 + a * S, z = BOUNDS.z0 + b * S;
				if (hs[n] < WATER_Y - 0.1 && waterAt(x, z)) continue;
				// Uphill steeper than the walk limit is a wall (steep slopes cannot be jumped up).
				if (hs[n] - hs[c] > 0.65) continue;
				seen[n] = 1;
				q.push(n);
			}
		}
		const reach = (x: number, z: number) => seen[Math.round((z - BOUNDS.z0) / S) * (nx + 1) + Math.round((x - BOUNDS.x0) / S)] === 1;
		let east = 0;
		for (let z = BOUNDS.z0 + 4; z < BOUNDS.z1 - 4; z += 2) if (reach(riverX(z) + BANK + 2, z)) east++;
		return { east, reach };
	};
	const dam = zones.dam;
	const before = flood();
	expect('east bank unreachable before the dam (grid)', before.east === 0, `${before.east} east cells`);
	dam.build();
	const after = flood();
	expect('east bank reachable after the dam (grid)', after.east > 20, `${after.east} east cells`);
}

// — Fuzz: random input bursts from random places; nobody may get stuck. —
{
	const minutes = Number(process.argv[process.argv.indexOf('--fuzz-minutes') + 1]) || 6;
	let seed = 99;
	const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
	const stuckSpots: string[] = [];
	let respawns = 0, splashes = 0, sims = 0;
	const total = minutes * 60 * 60;
	let frames = 0;
	while (frames < total) {
		const x = BOUNDS.x0 + rnd() * (BOUNDS.x1 - BOUNDS.x0), z = BOUNDS.z0 + rnd() * (BOUNDS.z1 - BOUNDS.z0);
		if (waterAt(x, z) && groundHeight(x, z) < WATER_Y) continue;
		const p = mk({ x, z }, rnd() * 6.28);
		const placed = { ...p.pos };
		sims++;
		let cmd: Command = { dirX: 0, dirZ: 0, jump: false, jumpHeld: false, roll: false };
		let hist: { x: number; z: number }[] = [];
		for (let i = 0; i < 60 * 20; i++, frames++) {
			if (i % 30 === 0) {
				const a = rnd() * 6.28;
				cmd = { dirX: Math.sin(a), dirZ: Math.cos(a), jump: rnd() < 0.3, jumpHeld: rnd() < 0.7, roll: rnd() < 0.2 };
			} else cmd = { ...cmd, jump: false, roll: false };
			events.length = 0;
			step(p, cmd);
			if (events.includes('respawn')) respawns++;
			if (events.includes('splash')) splashes++;
			if (!Number.isFinite(p.pos.x + p.pos.y + p.pos.z)) {
				stuckSpots.push(`NaN from ${placed.x.toFixed(1)},${placed.z.toFixed(1)}`);
				break;
			}
			if (i % 60 === 0) hist.push({ x: p.pos.x, z: p.pos.z });
		}
		// Over the last 8 seconds of trying every direction Rayou must have moved somewhere.
		hist = hist.slice(-8);
		const spread = Math.max(...hist.map((h) => Math.hypot(h.x - hist[0].x, h.z - hist[0].z)));
		if (spread < 0.6) stuckSpots.push(`${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)},${p.pos.z.toFixed(1)} (from ${placed.x.toFixed(1)},${placed.z.toFixed(1)})`);
	}
	console.log(`fuzz: ${sims} runs, ${(frames / 3600).toFixed(1)} sim-minutes, ${respawns} unstuck respawns, ${splashes} splashes`);
	expect('fuzz: never stuck', stuckSpots.length === 0, stuckSpots.slice(0, 8).join(' | '));
}

void START;
void RUN;
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
