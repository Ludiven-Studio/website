// Race engine: hover-kart physics, drift and mini-turbo, items, bots, laps and ranks.
// Pure: no DOM, no three.js, so a whole race runs in a test.
import { type Track, locate, pointAt, normalX, normalZ, indexAt, headingAt, wrapAngle } from './track';

export type ShipId = 'caravane' | 'croiseur' | 'taxi' | 'conserve';
export type ItemId = 'laser' | 'mine' | 'hyper' | 'tractor';

export interface Ship {
	id: ShipId;
	name: string;
	pitch: string;
	stats: { speed: number; accel: number; handling: number; weight: number };
}

export const SHIPS: Ship[] = [
	{ id: 'caravane', name: 'Caravane Stellaire', pitch: 'Le camping-car des étoiles, avec ses dés en peluche. Bon partout.', stats: { speed: 3, accel: 3, handling: 3, weight: 3 } },
	{ id: 'croiseur', name: 'Croiseur Démesuré', pitch: 'Un capot de 40 mètres et un tout petit cockpit. Très rapide, lent à tourner.', stats: { speed: 5, accel: 1, handling: 2, weight: 5 } },
	{ id: 'taxi', name: 'Taxi Cabossé', pitch: 'Il démarre au quart de tour et ne craint plus une bosse de plus.', stats: { speed: 2, accel: 5, handling: 3, weight: 3 } },
	{ id: 'conserve', name: 'Boîte de Conserve', pitch: 'Une conserve à réacteur, légère et vive dans les virages.', stats: { speed: 2, accel: 4, handling: 5, weight: 1 } },
];

export const ITEM_NAMES: Record<ItemId, string> = {
	laser: 'Laser',
	mine: 'Mine à paillettes',
	hyper: 'Saut hyperespace',
	tractor: 'Rayon tracteur',
};

export const LAPS = 3;
export const RADIUS = 1.3;
const GRAVITY = 22;
const BOX_RESPAWN = 3;
const ROULETTE = 1.1;
const SPIN_TIME = 1.1;
const TRACTOR_TIME = 2;
const HYPER_TIME = 1.8;
const MT_BOOST = [0, 0.6, 1.1, 1.7];
const MT_LEVEL = [0.8, 1.7, 2.7];

export interface Params {
	maxSpeed: number;
	accel: number;
	turn: number;
	mass: number;
}

export function shipParams(ship: Ship): Params {
	const s = ship.stats;
	return { maxSpeed: 27 + s.speed * 1.2, accel: 9 + s.accel * 2.4, turn: 1.55 + s.handling * 0.17, mass: 0.7 + s.weight * 0.22 };
}

export interface Controls {
	steer: number;
	throttle: number;
	brake: boolean;
	drift: boolean;
	item: boolean;
}

export interface Kart {
	idx: number;
	name: string;
	ship: Ship;
	p: Params;
	color: number;
	player: boolean;
	x: number;
	z: number;
	y: number;
	vy: number;
	grounded: boolean;
	heading: number;
	speed: number;
	bx: number;
	bz: number;
	steer: number;
	/** -1 / 1 while drifting, 0 otherwise. */
	drift: number;
	driftCharge: number;
	driftHeldPrev: boolean;
	boost: number;
	hyper: number;
	spin: number;
	slow: number;
	offroad: boolean;
	seg: number;
	s: number;
	lat: number;
	lap: number;
	half: boolean;
	finished: boolean;
	finishTime: number;
	lapTimes: number[];
	lapStart: number;
	item: ItemId | null;
	roulette: number;
	itemPrev: boolean;
	rank: number;
	/** Bot brain. */
	lane: number;
	skill: number;
	skill0: number;
	think: number;
	/** Events for the renderer and the sound, drained each frame. */
	events: string[];
}

export interface Box { x: number; y: number; z: number; s: number; respawn: number }
export interface Pad { x: number; y: number; z: number; s: number; lat: number; heading: number }
export interface Mine { x: number; y: number; z: number; owner: number; arm: number; life: number }
export interface Bolt { x: number; y: number; z: number; heading: number; owner: number; life: number; seg: number; target: number }
export interface Beam { from: number; to: number; life: number }

export interface Race {
	track: Track;
	karts: Kart[];
	boxes: Box[];
	pads: Pad[];
	mines: Mine[];
	bolts: Bolt[];
	beams: Beam[];
	/** Seconds since the green light; negative during the countdown. */
	time: number;
	rng: () => number;
	order: number[];
	done: boolean;
}

export const BOT_NAMES = ['Amiral Pataquès', 'Bip-Bop', 'Comète Lulu', 'Z-42', 'Mamie Nébuleuse', 'Capitaine Grumeau', 'Gloubi', 'Sergent Pixel'];
export const COLORS = [0xff4d6d, 0x3da5ff, 0xffd23f, 0x4ade80, 0xc084fc, 0xff8a3d, 0x2dd4bf, 0xf472b6];

export interface Entrant { ship: Ship; name: string; color: number; player: boolean; skill?: number }

export function createRace(track: Track, entrants: Entrant[], rng: () => number, countdown = 3): Race {
	const karts: Kart[] = entrants.map((e, k) => {
		// Grid behind the line, two by two, the player last.
		const row = Math.floor(k / 2), col = k % 2;
		const s = track.length - 10 - row * 9 - col * 2.5;
		const lat = col ? -3.2 : 3.2;
		const pt = pointAt(track, s, lat);
		const q = locate(track, pt.x, pt.z);
		return {
			idx: k,
			name: e.name,
			ship: e.ship,
			p: shipParams(e.ship),
			color: e.color,
			player: e.player,
			x: pt.x,
			z: pt.z,
			y: pt.y,
			vy: 0,
			grounded: true,
			heading: headingAt(track, pt.i),
			speed: 0,
			bx: 0,
			bz: 0,
			steer: 0,
			drift: 0,
			driftCharge: 0,
			driftHeldPrev: false,
			boost: 0,
			hyper: 0,
			spin: 0,
			slow: 0,
			offroad: false,
			seg: q.i,
			s: q.s,
			lat: q.lat,
			lap: 0,
			half: true,
			finished: false,
			finishTime: 0,
			lapTimes: [],
			lapStart: 0,
			item: null,
			roulette: 0,
			itemPrev: false,
			rank: k + 1,
			lane: (rng() - 0.5) * 6,
			skill: e.skill ?? 1,
			skill0: e.skill ?? 1,
			think: rng(),
			events: [],
		};
	});
	const boxes: Box[] = [];
	for (const row of track.def.itemRows) {
		for (const lat of row.lanes) {
			const s = row.at * track.length;
			const pt = pointAt(track, s, lat);
			boxes.push({ x: pt.x, y: pt.y, z: pt.z, s, respawn: 0 });
		}
	}
	const pads: Pad[] = track.def.pads.map((d) => {
		const s = d.at * track.length;
		const pt = pointAt(track, s, d.lat);
		return { x: pt.x, y: pt.y, z: pt.z, s, lat: d.lat, heading: headingAt(track, pt.i) };
	});
	return { track, karts, boxes, pads, mines: [], bolts: [], beams: [], time: -countdown, rng, order: karts.map((k) => k.idx), done: false };
}

/** Race distance covered: laps done plus distance into the current lap. */
export const progress = (r: Race, k: Kart) => (k.lap - 1) * r.track.length + k.s;

export function driftLevel(charge: number): number {
	return charge >= MT_LEVEL[2] ? 3 : charge >= MT_LEVEL[1] ? 2 : charge >= MT_LEVEL[0] ? 1 : 0;
}

function rollItem(r: Race, k: Kart): ItemId {
	const n = r.karts.length;
	const place = (k.rank - 1) / Math.max(1, n - 1); // 0 = leader, 1 = last
	const w: [ItemId, number][] = [
		['laser', 35 - 5 * place],
		['mine', 45 - 35 * place],
		['hyper', 12 + 38 * place],
		['tractor', place < 0.2 ? 0 : 6 + 22 * place],
	];
	let sum = 0;
	for (const [, v] of w) sum += v;
	let u = r.rng() * sum;
	for (const [id, v] of w) {
		u -= v;
		if (u <= 0) return id;
	}
	return 'laser';
}

function hit(k: Kart, what: string) {
	if (k.hyper > 0 || k.spin > 0) return;
	k.spin = SPIN_TIME;
	k.drift = 0;
	k.driftCharge = 0;
	k.boost = 0;
	k.events.push(`hit:${what}`);
}

function fireItem(r: Race, k: Kart) {
	const it = k.item;
	if (!it) return;
	k.item = null;
	k.events.push(`use:${it}`);
	const fx = Math.cos(k.heading), fz = Math.sin(k.heading);
	if (it === 'laser') {
		// Aim at the nearest kart ahead in the race, if there is one.
		let target = -1, best = Infinity;
		const me = progress(r, k);
		for (const o of r.karts) {
			if (o === k || o.finished) continue;
			const d = progress(r, o) - me;
			if (d > 0 && d < best) { best = d; target = o.idx; }
		}
		r.bolts.push({ x: k.x + fx * 2.4, y: k.y + 0.8, z: k.z + fz * 2.4, heading: k.heading, owner: k.idx, life: 3, seg: k.seg, target });
	} else if (it === 'mine') {
		r.mines.push({ x: k.x - fx * 2.6, y: k.y, z: k.z - fz * 2.6, owner: k.idx, arm: 0.4, life: 40 });
		if (r.mines.length > 12) r.mines.shift();
	} else if (it === 'hyper') {
		k.hyper = HYPER_TIME;
		k.boost = Math.max(k.boost, HYPER_TIME);
	} else if (it === 'tractor') {
		// The leader, or the next one up when the user is the leader.
		const leader = r.karts.find((o) => o.rank === 1 && o !== k) ?? r.karts.find((o) => o.rank === 2 && o !== k);
		if (leader && !leader.finished) {
			r.beams.push({ from: k.idx, to: leader.idx, life: TRACTOR_TIME });
			if (leader.hyper <= 0) {
				leader.slow = TRACTOR_TIME;
				leader.events.push('hit:tractor');
			}
		}
	}
}

export function botControls(r: Race, k: Kart, dt: number): Controls {
	const t = r.track;
	const look = 10 + Math.max(0, k.speed) * 0.55;
	const lane = Math.max(-5, Math.min(5, k.lane));
	const aim = pointAt(t, k.s + look, lane);
	const want = Math.atan2(aim.z - k.z, aim.x - k.x);
	const diff = wrapAngle(want - k.heading);
	const steer = Math.max(-1, Math.min(1, diff * 2.6));
	// Ease off before the turns: the heading change over the next stretch.
	const i0 = indexAt(t, k.s), i1 = indexAt(t, k.s + 14 + k.speed * 1.1);
	const bend = Math.abs(wrapAngle(headingAt(t, i1) - headingAt(t, i0)));
	const cap = k.p.maxSpeed * Math.max(0.5, 1 - bend * 0.32);
	const brake = k.speed > cap + 4;
	const throttle = k.speed < cap ? 1 : 0;
	let item = false;
	if (k.item) {
		k.think -= dt;
		if (k.think <= 0) {
			if (k.item === 'laser') {
				const me = progress(r, k);
				item = r.karts.some((o) => o !== k && progress(r, o) - me > 4 && progress(r, o) - me < 70);
				if (!item) k.think = 0.5;
			} else item = true;
		}
	} else k.think = 1 + r.rng() * 4;
	return { steer, throttle, brake, drift: false, item };
}

function stepKart(r: Race, k: Kart, c: Controls, dt: number) {
	const t = r.track;
	const p = k.p;
	const racing = r.time >= 0 && !k.finished;
	if (k.spin > 0) k.spin -= dt;
	if (k.slow > 0) k.slow -= dt;
	if (k.boost > 0) k.boost -= dt;
	if (k.hyper > 0) k.hyper -= dt;

	// Speed.
	let max = p.maxSpeed;
	if (!k.player) max *= k.skill;
	if (k.boost > 0) max *= k.hyper > 0 ? 1.5 : 1.32;
	if (k.offroad && k.boost <= 0) max *= 0.55;
	if (k.slow > 0) max *= 0.45;
	const controls = racing && k.spin <= 0;
	if (k.spin > 0) {
		k.speed *= Math.exp(-2.6 * dt);
	} else if (controls && c.brake) {
		k.speed = k.speed > 0 ? Math.max(0, k.speed - 34 * dt) : Math.max(-9, k.speed - p.accel * 0.5 * dt);
	} else if (controls && c.throttle > 0) {
		if (k.speed < max) {
			const a = p.accel * (k.boost > 0 ? 2.5 : 1) * c.throttle * Math.max(0.22, 1 - k.speed / max);
			k.speed = Math.min(max, k.speed + a * dt);
		}
	} else {
		k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), 7 * dt);
	}
	if (k.speed > max) k.speed -= (k.speed - max) * Math.min(1, 2.5 * dt);

	// Steering and drift.
	const steer = controls ? c.steer : 0;
	k.steer += (steer - k.steer) * Math.min(1, dt * 10);
	const pressed = controls && c.drift && !k.driftHeldPrev;
	k.driftHeldPrev = c.drift;
	if (pressed && k.grounded && k.speed > 10) {
		k.vy = 5;
		k.grounded = false;
		k.events.push('hop');
		if (Math.abs(steer) > 0.25) k.drift = Math.sign(steer);
	}
	if (k.drift === 0 && controls && c.drift && Math.abs(steer) > 0.25 && k.speed > 10 && k.grounded && k.driftCharge === 0 && !pressed) {
		// Hop done, steering came a little later: start the drift on landing.
		k.drift = Math.sign(steer);
	}
	const sgn = k.speed >= 0 ? 1 : -1;
	const grip = Math.min(1, Math.abs(k.speed) / 7) * (1 - 0.22 * Math.min(1, Math.abs(k.speed) / p.maxSpeed));
	if (k.drift !== 0) {
		if (!c.drift || !controls || k.speed < 8) {
			const lvl = driftLevel(k.driftCharge);
			if (lvl > 0 && controls) {
				k.boost = Math.max(k.boost, MT_BOOST[lvl]);
				k.events.push(`turbo:${lvl}`);
			}
			k.drift = 0;
			k.driftCharge = 0;
		} else {
			const into = steer * k.drift;
			k.heading += k.drift * p.turn * (0.78 + 0.5 * into) * grip * dt;
			if (k.grounded) {
				const before = driftLevel(k.driftCharge);
				k.driftCharge += dt * (1 + 0.7 * Math.max(0, into));
				if (driftLevel(k.driftCharge) > before) k.events.push(`charge:${driftLevel(k.driftCharge)}`);
			}
		}
	} else {
		k.heading += k.steer * p.turn * grip * sgn * dt * (k.player ? 1 : 1.1);
	}
	// Move.
	const fx = Math.cos(k.heading), fz = Math.sin(k.heading);
	k.x += (fx * k.speed + k.bx) * dt;
	k.z += (fz * k.speed + k.bz) * dt;
	const decay = Math.exp(-4 * dt);
	k.bx *= decay;
	k.bz *= decay;

	// Track: walls, shoulders, height.
	let q = locate(t, k.x, k.z, k.seg);
	const nx = normalX(t, q.i), nz = normalZ(t, q.i);
	const wall = t.wall - RADIUS;
	if (Math.abs(q.lat) > wall) {
		const side = Math.sign(q.lat);
		const over = Math.abs(q.lat) - wall;
		k.x -= nx * side * over;
		k.z -= nz * side * over;
		const into = (fx * nx + fz * nz) * side;
		if (into > 0) {
			// Slide along the wall: turn the nose toward the tangent and lose the part that hit.
			const tx = t.tx[q.i], tz = t.tz[q.i];
			const along = fx * tx + fz * tz >= 0 ? 1 : -1;
			const target = Math.atan2(tz * along, tx * along);
			k.heading += wrapAngle(target - k.heading) * Math.min(1, 0.6 + into);
			k.speed *= 1 - 0.55 * into;
			const bounce = Math.max(2, Math.abs(k.speed) * into * 0.35);
			k.bx = -nx * side * bounce;
			k.bz = -nz * side * bounce;
			if (into > 0.25 && Math.abs(k.speed) > 6) k.events.push('wall');
		}
		q = locate(t, k.x, k.z, q.i);
	}
	k.offroad = Math.abs(q.lat) > t.halfWidth;
	k.seg = q.i;
	k.lat = q.lat;

	// Height: a hop or a crest leaves the ground; the ground pulls back.
	const ground = q.y;
	if (k.grounded) {
		if (ground < k.y - 0.25 && k.speed > 18) {
			k.grounded = false;
			k.vy = Math.max(0, k.vy);
		} else k.y = ground;
	}
	if (!k.grounded) {
		k.vy -= GRAVITY * dt;
		k.y += k.vy * dt;
		if (k.y <= ground) {
			k.y = ground;
			k.vy = 0;
			k.grounded = true;
			k.events.push('land');
		}
	}

	// Lap line.
	const L = t.length;
	const prevS = k.s;
	k.s = q.s;
	if (k.s > L * 0.4 && k.s < L * 0.6) k.half = true;
	if (prevS > L * 0.75 && k.s < L * 0.25) {
		if (k.half) {
			k.lap++;
			k.half = false;
			if (k.lap > 1) {
				k.lapTimes.push(r.time - k.lapStart);
				k.events.push(k.lap === LAPS ? 'lap:final' : 'lap');
			}
			k.lapStart = r.time;
			if (k.lap > LAPS && !k.finished) {
				k.finished = true;
				k.finishTime = r.time;
				k.item = null;
				k.events.push('finish');
			}
		}
	} else if (prevS < L * 0.25 && k.s > L * 0.75) {
		// Backward over the line: undo, so driving in circles at the start counts for nothing.
		k.lap--;
		k.half = true;
	}

	// Pads and boxes.
	for (const pad of r.pads) {
		const d = Math.hypot(k.x - pad.x, k.z - pad.z);
		if (d < 2.8 && Math.abs(k.y - pad.y) < 2) {
			if (k.boost < 0.9) k.events.push('pad');
			k.boost = Math.max(k.boost, 1);
		}
	}
	for (const b of r.boxes) {
		if (b.respawn > 0) continue;
		if (Math.hypot(k.x - b.x, k.z - b.z) < 2.1 && Math.abs(k.y - b.y) < 2.5) {
			b.respawn = BOX_RESPAWN;
			if (!k.item && k.roulette <= 0 && !k.finished) {
				k.roulette = ROULETTE;
				k.events.push('box');
			}
		}
	}
	if (k.roulette > 0) {
		k.roulette -= dt;
		if (k.roulette <= 0) {
			k.item = rollItem(r, k);
			k.events.push(`got:${k.item}`);
		}
	}
	if (controls && c.item && !k.itemPrev && k.item) fireItem(r, k);
	k.itemPrev = c.item;
}

function collideKarts(r: Race) {
	const ks = r.karts;
	for (let a = 0; a < ks.length; a++) {
		for (let b = a + 1; b < ks.length; b++) {
			const A = ks[a], B = ks[b];
			const dx = B.x - A.x, dz = B.z - A.z;
			const d = Math.hypot(dx, dz);
			if (d >= RADIUS * 2 || d < 1e-6 || Math.abs(A.y - B.y) > 2) continue;
			const nx = dx / d, nz = dz / d;
			const over = RADIUS * 2 - d;
			// Hyperspace rams everyone; otherwise the heavier ship moves less.
			let ma = A.p.mass * (A.hyper > 0 ? 6 : 1), mb = B.p.mass * (B.hyper > 0 ? 6 : 1);
			const tot = ma + mb;
			ma /= tot;
			mb /= tot;
			A.x -= nx * over * mb;
			A.z -= nz * over * mb;
			B.x += nx * over * ma;
			B.z += nz * over * ma;
			const va = Math.cos(A.heading) * A.speed * nx + Math.sin(A.heading) * A.speed * nz;
			const vb = Math.cos(B.heading) * B.speed * nx + Math.sin(B.heading) * B.speed * nz;
			const rel = Math.max(3, va - vb);
			A.bx -= nx * rel * mb * 0.9;
			A.bz -= nz * rel * mb * 0.9;
			B.bx += nx * rel * ma * 0.9;
			B.bz += nz * rel * ma * 0.9;
			if (A.hyper > 0 && B.hyper <= 0) hit(B, 'ram');
			if (B.hyper > 0 && A.hyper <= 0) hit(A, 'ram');
			if (rel > 6) {
				A.events.push('bump');
				B.events.push('bump');
			}
		}
	}
}

function stepWeapons(r: Race, dt: number) {
	const t = r.track;
	for (const b of r.boxes) if (b.respawn > 0) b.respawn -= dt;
	for (const m of r.mines) {
		m.life -= dt;
		if (m.arm > 0) { m.arm -= dt; continue; }
		for (const k of r.karts) {
			if (Math.hypot(k.x - m.x, k.z - m.z) < 1.9 && Math.abs(k.y - m.y) < 2) {
				hit(k, 'mine');
				m.life = 0;
				break;
			}
		}
	}
	r.mines = r.mines.filter((m) => m.life > 0);
	const SPEED = 62;
	for (const b of r.bolts) {
		b.life -= dt;
		// Home on the target once it is near; otherwise follow the track ahead.
		const tg = b.target >= 0 ? r.karts[b.target] : null;
		let want: number;
		if (tg && Math.hypot(tg.x - b.x, tg.z - b.z) < 40) want = Math.atan2(tg.z - b.z, tg.x - b.x);
		else {
			const q = locate(t, b.x, b.z, b.seg);
			b.seg = q.i;
			const aim = pointAt(t, q.s + 14, q.lat * 0.6);
			want = Math.atan2(aim.z - b.z, aim.x - b.x);
		}
		b.heading += wrapAngle(want - b.heading) * Math.min(1, dt * 7);
		b.x += Math.cos(b.heading) * SPEED * dt;
		b.z += Math.sin(b.heading) * SPEED * dt;
		const q = locate(t, b.x, b.z, b.seg);
		b.seg = q.i;
		b.y += (q.y + 0.8 - b.y) * Math.min(1, dt * 8);
		if (Math.abs(q.lat) > t.wall) b.life = 0;
		for (const k of r.karts) {
			if (k.idx === b.owner && b.life > 2.7) continue;
			if (Math.hypot(k.x - b.x, k.z - b.z) < 1.9) {
				hit(k, 'laser');
				b.life = 0;
				break;
			}
		}
	}
	r.bolts = r.bolts.filter((b) => b.life > 0);
	for (const bm of r.beams) bm.life -= dt;
	r.beams = r.beams.filter((b) => b.life > 0);
}

function rank(r: Race) {
	const order = [...r.karts].sort((a, b) => {
		if (a.finished && b.finished) return a.finishTime - b.finishTime;
		if (a.finished !== b.finished) return a.finished ? -1 : 1;
		return progress(r, b) - progress(r, a);
	});
	order.forEach((k, i) => (k.rank = i + 1));
	r.order = order.map((k) => k.idx);
}

/** One fixed step. `player` holds the user's controls; bots drive themselves. */
export function stepRace(r: Race, player: Controls | null, dt: number) {
	r.time += dt;
	const playerProg = r.karts.filter((k) => k.player).map((k) => progress(r, k));
	const leadProg = Math.max(...r.karts.map((k) => progress(r, k)));
	for (const k of r.karts) {
		let c: Controls;
		if (k.player && player && !k.finished) c = player;
		else {
			c = botControls(r, k, dt);
			// Rubber band: bots far behind the user catch up a little, bots far ahead ease off.
			const ref = playerProg.length ? playerProg[0] : leadProg;
			const gap = ref - progress(r, k);
			if (!k.player) k.skill += (k.skill0 * (1 + Math.max(-0.08, Math.min(0.05, gap / 400))) - k.skill) * 0.02;
		}
		stepKart(r, k, c, dt);
	}
	collideKarts(r);
	stepWeapons(r, dt);
	rank(r);
	if (!r.done) {
		const humans = r.karts.filter((k) => k.player);
		r.done = humans.length ? humans.every((k) => k.finished) : r.karts.every((k) => k.finished);
	}
}

/** After the user finishes, bots still on track get a projected time from their pace. */
export function projectedTime(r: Race, k: Kart): number {
	if (k.finished) return k.finishTime;
	const prog = Math.max(1, progress(r, k));
	return (r.time * (LAPS * r.track.length)) / prog;
}
