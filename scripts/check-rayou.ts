/* Headless checks for the Rayou prototype: every platforming step can be done (and the
   gated ones can only be done the intended way), and a random-walk fuzz finds no spot where
   Rayou stays stuck. Usage: npx tsx scripts/check-rayou.ts [--fuzz-minutes N] */
import * as THREE from 'three';
import { buildZones } from '../src/games/rayou/zones';
import { Player, RUN, physicsSteps, type Command } from '../src/games/rayou/player';
import { groundHeight, mountPoint, ringLevel, riverX, ISLETS, BANK, OAK, OAK_GATE, MILL, MOUNT, BOUNDS, waterAt, WATER_Y, START } from '../src/games/rayou/terrain';
import { query, inside, solids } from '../src/games/rayou/colliders';

const scene = new THREE.Scene();
const zones = buildZones(scene);
let clock = 0;

type P = { x: number; z: number; y?: number };
const events: string[] = [];

// How a jump is played: frame rate (with uneven frames), how long the press lasts, keyboard or touch.
type Play = { name: string; frame: number; jitter?: number; hold: number; touch: boolean };
const KEY: Play = { name: 'key held 60 fps', frame: 1 / 60, hold: Infinity, touch: false };
const PHONE: Play[] = [
	{ name: 'tap 100 ms 30 fps', frame: 1 / 30, hold: 0.1, touch: true },
	{ name: 'tap 60 ms 20 fps', frame: 1 / 20, hold: 0.06, touch: true },
	{ name: 'tap 60 ms 60 fps', frame: 1 / 60, hold: 0.06, touch: true },
	{ name: 'tap 100 ms uneven 45 fps', frame: 1 / 45, jitter: 0.4, hold: 0.1, touch: true },
];
// The most generous play, for the jumps that must stay impossible: a 240 Hz screen takes the finest steps.
const FINE: Play = { name: 'touch 240 fps', frame: 1 / 240, hold: Infinity, touch: true };
let play = KEY;
let frameSeed = 7;
const frameRnd = () => ((frameSeed = (frameSeed * 1664525 + 1013904223) >>> 0) / 4294967296);
function as<T>(p: Play, f: () => T): T {
	const was = play;
	play = p;
	try {
		return f();
	} finally {
		play = was;
	}
}

function mk(at: P, yaw: number): Player {
	const p = new Player();
	p.teleport(at.x, at.z, yaw, at.y);
	p.onEvent = (e) => events.push(e);
	return p;
}

// One frame the way main.ts runs it: split into physics steps, presses on the first step only.
function step(p: Player, cmd: Command): number {
	const dt = play.frame * (1 + (play.jitter ?? 0) * (frameRnd() * 2 - 1));
	const n = physicsSteps(dt);
	for (let k = 1; k <= n; k++) {
		clock += dt / n;
		zones.update(dt / n, clock, p.grounded ? p.support : null);
		p.update(dt / n, k > 1 ? { ...cmd, jump: false, roll: false } : cmd);
	}
	return dt;
}

const toward = (p: Player, t: P, mag = 1): Command => {
	const dx = t.x - p.pos.x, dz = t.z - p.pos.z;
	const d = Math.hypot(dx, dz) || 1;
	return { dirX: (dx / d) * mag, dirZ: (dz / d) * mag, jump: false, jumpHeld: false, roll: false };
};

// Runs from `from` toward `to`, jumping (or roll-jumping) when `at` metres remain to the target.
// `pressedAt` is the distance left when the press went in (frames make it a little less than `at`), or
// null when Rayou never got that close: a step or a wall held him back, or he fell first.
function tryJump(from: P, to: P, opts: { roll?: boolean; at: number; settle?: number; runup?: number }): { p: Player; pressedAt: number | null; y0: number } {
	const yaw = Math.atan2(to.x - from.x, to.z - from.z);
	const p = mk(from, yaw);
	const y0 = p.pos.y;
	let pressedAt: number | null = null;
	const out = () => ({ p, pressedAt, y0 });
	let jumped = false, rolled = false, since = 0;
	for (let t = 0; t < 6; ) {
		const c = toward(p, to);
		const d = Math.hypot(to.x - p.pos.x, to.z - p.pos.z);
		if (opts.roll && !rolled && d < opts.at + (opts.runup ?? 2.2)) {
			c.roll = true;
			rolled = true;
		}
		if (!jumped && d < opts.at) {
			c.jump = true;
			jumped = true;
			pressedAt = d;
		}
		c.jumpHeld = jumped && since < play.hold;
		c.fullJump = play.touch;
		// Like a player: let go of the stick once over the target.
		if ((d < 0.25 && p.grounded) || (!p.grounded && jumped && d < 0.45)) {
			c.dirX = c.dirZ = 0;
		}
		const dt = step(p, c);
		t += dt;
		if (jumped) since += dt;
		if (p.respawnT > 0) return out();
		if (jumped && p.grounded && d < 0.6 && t > 1 / 3) {
			for (let s = 0; s < (opts.settle ?? 20) / 60; ) s += step(p, { dirX: 0, dirZ: 0, jump: false, jumpHeld: false, roll: false });
			return out();
		}
	}
	return out();
}

function landed(p: Player, to: P, tol = 0.75): boolean {
	return p.respawnT <= 0 && p.grounded && Math.hypot(p.pos.x - to.x, p.pos.z - to.z) < tol + 0.6 && (to.y === undefined || Math.abs(p.pos.y - to.y) < 0.15);
}

// The longest stretch of take-off ground that lands, in 10 cm spots: 0 = impossible, a handful = tight,
// many = easy. A stretch, not a count: a child aims at one stretch of ground, not at scattered lucky spots.
// Spots go from the target back to the start, not beyond (a roll jump takes off up to 7 m away). A spot
// Rayou cannot reach, held back by the step he jumps up, is no spot; spots whose press lands on the same
// frame are one take-off. `reach` counts the distinct take-offs.
type Window = { run: number; reach: number };
function jumpWindow(from: P, to: P, roll = false): Window {
	const offs: { d: number; ok: boolean }[] = [];
	const far = Math.min(8, Math.hypot(to.x - from.x, to.z - from.z));
	for (let at = 0.2; at <= far + 0.05; at += 0.1) {
		const { p, pressedAt, y0 } = tryJump(from, to, { roll, at });
		if (pressedAt === null && p.respawnT <= 0 && Math.abs(p.pos.y - y0) < 0.3) continue;
		const d = pressedAt ?? at;
		if (offs.length && Math.abs(offs[offs.length - 1].d - d) < 1e-3) continue;
		offs.push({ d, ok: landed(p, to) });
	}
	let best = 0, first = -1;
	offs.forEach((o, i) => {
		if (!o.ok) return void (first = -1);
		if (first < 0) first = i;
		best = Math.max(best, Math.round((o.d - offs[first].d) / 0.1) + 1);
	});
	return { run: best, reach: offs.length };
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
// A jump to do: wide enough on the keyboard and on every phone play, or every reachable spot lands
// (a hop up a step can only start right against it).
function doable(name: string, from: P, to: P, roll = false, min = 3) {
	const wide = (v: Window) => v.run >= Math.max(1, Math.min(min, v.reach));
	const key = jumpWindow(from, to, roll);
	const phones = PHONE.map((p) => ({ name: p.name, w: as(p, () => jumpWindow(from, to, roll)) }));
	const bad = phones.filter((ph) => !wide(ph.w));
	const shown = bad[0] ?? phones.reduce((a, b) => (b.w.run < a.w.run ? b : a));
	expect(name, wide(key) && !bad.length, `window ${key.run}/${key.reach}, phone ${shown.w.run}/${shown.w.reach} (${shown.name})`);
}
// A jump that must stay impossible, even with the finest physics steps.
function impossible(name: string, from: P, to: P, roll = false) {
	const key = jumpWindow(from, to, roll).run, fine = as(FINE, () => jumpWindow(from, to, roll).run);
	expect(name, key === 0 && fine === 0, `window ${key}, at 240 fps ${fine}`);
}
function chain(name: string, pts: P[], roll: boolean[] = []) {
	for (let i = 0; i < pts.length - 1; i++) doable(`${name} ${i}→${i + 1}`, pts[i], pts[i + 1], roll[i]);
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
	const jumpZ = () => {
		const jump = mk(from, Math.PI);
		let next = 1 / 6;
		for (let t = 0; t < 3; ) {
			const c = toward(jump, { x: from.x, z: OAK_GATE.z - 4 });
			if (t >= next) {
				c.jump = true;
				next += 0.5;
			}
			c.jumpHeld = true;
			c.fullJump = play.touch;
			t += step(jump, c);
		}
		return jump.pos.z;
	};
	const [zKey, zFine] = [jumpZ(), as(FINE, jumpZ)];
	expect('trunk cannot be jumped', Math.min(zKey, zFine) > OAK_GATE.z + 0.3, `z ${zKey.toFixed(2)}, at 240 fps ${zFine.toFixed(2)}`);
}

// — No tree grows in the water (trees are the only tall thin colliders). —
{
	const wet = solids.filter((s) => s.kind === 'cyl' && s.r < 1 && s.y1 - s.y0 > 25 && waterAt(s.x, s.z) && groundHeight(s.x, s.z) < WATER_Y + 0.3);
	expect('no tree stands in the water', wet.length === 0, wet.slice(0, 5).map((s) => `${s.x.toFixed(1)},${s.z.toFixed(1)}`).join(' | '));
}

// — Steep slopes cannot be climbed by spamming jumps (oak ridge, world rim). —
{
	const tries: [string, P, P][] = [
		['oak ridge', { x: OAK_GATE.x + 12, z: OAK_GATE.z - 6 + 10 }, { x: OAK_GATE.x, z: OAK_GATE.z - 16 }],
		['world rim', { x: BOUNDS.x0 + 6, z: 0 }, { x: BOUNDS.x0 - 10, z: 0 }],
	];
	for (const [name, from, to] of tries) {
		for (const pl of [KEY, FINE]) {
			as(pl, () => {
				const p = mk(from, 0);
				let maxClimb = 0, next = 0;
				for (let t = 0; t < 12; ) {
					const c = toward(p, to);
					if (t >= next) {
						c.jump = true;
						next += 0.2;
					}
					c.jumpHeld = true;
					c.fullJump = pl.touch;
					t += step(p, c);
					maxClimb = Math.max(maxClimb, p.pos.y);
				}
				// Never over the top: the oak ridge is 5 m, the rim 9 m.
				const inside = name === 'oak ridge' ? Math.hypot(p.pos.x - OAK.x, p.pos.z - OAK.z) < OAK.valley - 1 : p.pos.x < BOUNDS.x0 - 2;
				expect(`${name}: jump spam does not climb over (${pl.name})`, maxClimb < 4 && !inside, `max y ${maxClimb.toFixed(2)}, inside ${inside}`);
			});
		}
	}
}

// — Running or rolling into walls: the snout never sinks into a bank, a cliff or a building. —
{
	const P = (r: number, a: number) => mountPoint(r, a);
	const walls: [string, P, P][] = [
		['oak ridge', { x: OAK_GATE.x + 10, z: OAK_GATE.z + 3 }, { x: OAK_GATE.x + 10, z: OAK_GATE.z - 10 }],
		['world rim', { x: BOUNDS.x0 + 6, z: 0 }, { x: BOUNDS.x0 - 10, z: 0 }],
		['peak cliff', { ...P(24.5, 0.1), y: ringLevel(0) }, P(18, 0.1)],
		['house', { x: -6, z: 2 }, { x: -6, z: -5 }],
		['mill tower', { x: MILL.x + 5, z: MILL.z - 6 }, MILL],
	];
	for (const [name, from, to] of walls) {
		let worst = 0;
		for (const roll of [false, true]) {
			const p = mk(from, 0);
			for (let i = 0; i < 240; i++) {
				const c = toward(p, to);
				if (roll && i % 45 === 5) c.roll = true;
				step(p, c);
				if (!p.grounded || p.respawnT > 0) continue;
				// Snout ahead when standing; curled up, the ball is round and smaller.
				const reach = p.low ? 0.3 : 0.55;
				const sx = p.pos.x + Math.sin(p.yaw) * reach, sz = p.pos.z + Math.cos(p.yaw) * reach;
				worst = Math.max(worst, groundHeight(sx, sz) - p.pos.y);
				for (const s of query(sx, sz))
					if (s.y1 > p.pos.y + 0.5 && s.y0 < p.pos.y + 0.6 && inside(s, sx, sz, -0.08) && s.r !== 0.15) worst = Math.max(worst, 9);
			}
		}
		expect(`${name}: snout stays out of the wall`, worst < 0.8, `worst ${worst.toFixed(2)}`);
	}
}

// — River islets. —
{
	const a = ISLETS[0];
	const bankA = riverX(a.z) - BANK;
	chain('islet A', [at(bankA - 1.2, a.z - 1.1), at(bankA + 1.1, a.z - 1.1), at(bankA + 2.4, a.z + 0.6), at(a.x, a.z)]);
	const c = ISLETS[2];
	const bankC = riverX(c.z) - BANK;
	const startC = at(bankC - 3.5, c.z);
	impossible('islet C needs the roll jump', startC, at(c.x, c.z));
	doable('islet C roll jump works', startC, at(c.x, c.z), true);
	doable('islet C back with a roll jump', at(c.x + 0.8, c.z), at(bankC - 1.5, c.z), true, 2);
	const b = ISLETS[1];
	doable('islet B reachable by roll jump', at(riverX(b.z) - BANK - 2.5, b.z), at(b.x, b.z), true, 2);
	for (const i of ISLETS) impossible(`east bank out of reach from islet ${i.z}`, at(i.x - 0.6, i.z), at(riverX(i.z) + BANK + 1.5, i.z), true);
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
	impossible('hazel rock 3 is not reachable from the grass', at(s2.x + 2.2, s2.z + 0.5), { x: s2.x, z: s2.z, y: s2.y });
}

// Hop onto a mushroom, bounce, steer to the goal: how many run-up lengths land there. A bounce is never
// cut, so a tap that let go long before works as well as a held key.
type Bounce = { start: P; yaw: number; mush: P; goal: P; goalY: number; tol: number };
function bounceTo({ start, yaw, mush, goal, goalY, tol }: Bounce): number {
	let ok = 0;
	for (let lead = 0.6; lead <= 2.6; lead += 0.2) {
		const p = mk(start, yaw);
		let phase = 0, since = 0;
		for (let t = 0; t < 400 / 60; ) {
			const c = toward(p, phase === 0 ? mush : goal);
			if (phase === 0 && Math.hypot(mush.x - p.pos.x, mush.z - p.pos.z) < lead) {
				c.jump = true;
				phase = 1;
			}
			c.jumpHeld = phase === 1 && since < play.hold;
			c.fullJump = play.touch;
			const dt = step(p, c);
			t += dt;
			if (phase === 1) since += dt;
		}
		if (Math.abs(p.pos.y - goalY) < tol && p.grounded) ok++;
	}
	return ok;
}
function bounces(name: string, b: Bounce, min: number) {
	// The key is let go once Rayou is up on the cap, before the bounce.
	const tap: Play = { ...KEY, name: 'key let go before the bounce', hold: 0.25 };
	const [key, keyTap, phone] = [bounceTo(b), as(tap, () => bounceTo(b)), as(PHONE[0], () => bounceTo(b))];
	expect(name, Math.min(key, keyTap, phone) >= min, `${key} leads work, ${tap.name} ${keyTap}, ${PHONE[0].name} ${phone}`);
}

// — Jump height: a touch jump stays whole even when the tap ends during the landing buffer, a key let go
// early still cuts it, and the frame rate changes nothing. —
{
	const ground = at(START.x, START.z);
	const apex = (pl: Play, tapBeforeLanding: boolean) =>
		as(pl, () => {
			const p = mk(tapBeforeLanding ? { ...ground, y: ground.y! + 2 } : ground, 0);
			p.grounded = !tapBeforeLanding;
			events.length = 0;
			let pressed = false, since = 0, top = -Infinity;
			for (let t = 0; t < 2.5; ) {
				const c: Command = { dirX: 0, dirZ: 0, jump: false, jumpHeld: false, fullJump: pl.touch, roll: false };
				// From 2 m up, 0.8 m above the ground is about 0.1 s before landing: inside the 0.14 s buffer.
				if (!pressed && (tapBeforeLanding ? !p.grounded && p.pos.y - ground.y! < 0.8 : t > 0.2)) c.jump = pressed = true;
				c.jumpHeld = pressed && since < pl.hold;
				const dt = step(p, c);
				t += dt;
				if (pressed) since += dt;
				if (events.includes('jump')) top = Math.max(top, p.pos.y);
			}
			return top - ground.y!;
		});
	const held = apex(KEY, false);
	const tapTouch = apex({ ...PHONE[0], frame: 1 / 60 }, true);
	const tapKey = apex({ ...KEY, hold: 0.1 }, false);
	const at20 = apex({ ...KEY, frame: 1 / 20 }, false);
	expect('a touch tap in the landing buffer jumps as high as a held key', Math.abs(tapTouch - held) < 0.02, `${tapTouch.toFixed(2)} m vs ${held.toFixed(2)} m`);
	expect('a key let go early still cuts the jump', tapKey < held - 0.1, `${tapKey.toFixed(2)} m vs ${held.toFixed(2)} m`);
	expect('20 fps jumps as high as 60 fps', Math.abs(at20 - held) < 0.005, `${at20.toFixed(3)} m vs ${held.toFixed(3)} m`);
}

// — Mushrooms: walking or jumping onto one never puts Rayou inside the cap, and a jump bounces. —
for (const b of zones.bouncers) {
	const s = b.solid;
	let insideCap = false, bounced = false;
	for (const a of [0, 1.6, 3.2, 4.8]) {
		const from = { x: s.x + Math.cos(a) * 3, z: s.z + Math.sin(a) * 3 };
		for (const jump of [false, true]) {
			const p = mk(from, 0);
			events.length = 0;
			for (let i = 0; i < 150; i++) {
				const c = toward(p, s);
				if (jump && Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r + 0.9 && p.grounded && i < 100) c.jump = true;
				c.jumpHeld = true;
				step(p, c);
				const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
				if (d < s.r - 0.15 && p.pos.y < s.y1 - 0.05 && p.pos.y + 0.5 > s.y0) insideCap = true;
			}
			if (jump && events.includes('bounce')) bounced = true;
		}
	}
	expect(`mushroom at ${s.x.toFixed(0)},${s.z.toFixed(0)}: never inside, bounces`, !insideCap && bounced, `inside ${insideCap}, bounced ${bounced}`);
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
	bounces('forest bounce to pillar', { start: at(px + 5.5, pz + 1.0), yaw: -Math.PI / 2, mush: at(px + 2.6, pz + 1.0), goal: { x: px, z: pz }, goalY: groundHeight(px, pz) + 4.0, tol: 0.2 }, 2);

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
		// Onto the tower top, beside the last ledge: the kite is a walk from there.
		{ x: MILL.x + Math.cos(-2.05) * 1.7, z: MILL.z + Math.sin(-2.05) * 1.7, y: G + 8 },
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
	doable('ring 2 chasm', onRing(18.5, 1.3, 2), onRing(18.5, 1.72, 2));
	doable('ring 4 chasm', onRing(12.5, -0.85, 4), onRing(12.5, -0.35, 4));
	impossible('ring 6 chasm needs a roll jump', onRing(6.5, 2.4, 6), onRing(6.5, -2.75, 6));
	doable('ring 6 chasm roll jump', onRing(6.5, 2.2, 6), onRing(6.5, -2.75, 6), true, 2);
	bounces('peak mushroom to ring 3', { start: onRing(19.6, 2.25, 2), yaw: 0, mush: mountPoint(18.6, 2.4), goal: mountPoint(15.5, 2.4), goalY: ringLevel(3), tol: 0.1 }, 3);
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
