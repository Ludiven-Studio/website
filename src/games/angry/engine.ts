/**
 * ANGRY COCOTTE — pure engine (no UI). Angry-Birds-like: launch the cocotte (hen)
 * with a slingshot to knock down foxes perched on collapsing structures. Side view
 * with gravity; lightweight impulse-based rigid bodies (circles tumble, AABB crates
 * stack without rotation). Foxes have HP and take damage on every hard impact; at 0
 * they explode. Score = cocottes used (time tiebreak). Seeded levels for the daily.
 */

import type { Rng } from '../prng';

export interface Vec { x: number; y: number; }
export type Kind = 'circle' | 'box';
export type Tag = 'cocotte' | 'fox' | 'barrel' | 'crate' | 'rock' | 'ground';

export interface Body {
	id: number;
	kind: Kind;
	tag: Tag;
	x: number; y: number;
	vx: number; vy: number;
	r: number; hw: number; hh: number; // circle uses r; box uses hw/hh
	invMass: number;
	rest: number; // restitution
	fric: number;
	hp: number; maxHp: number; // foxes only
	defeated: boolean;
	launched: boolean; // cocotte: has been fired
}

export interface World {
	w: number; h: number;
	groundY: number;
	gravity: number;
	bodies: Body[];
	slingshot: Vec;
	cocotte: Body | null;
	cocottes: number; // total shots available this level
}

/* ---------- Tuning ---------- */

export const GRAVITY = 380;
const SETTLE = 12; // speed below which a body counts as at rest
const MAX_V = 720;
const ITER = 8; // solver iterations
const HIT_MIN = 35; // impact speed below which no damage
const DMG_K = 0.6; // damage per (impact - HIT_MIN)
const MIN_PULL = 3;
const MAX_PULL = 42;
const MAX_SPEED = 215;

const REST: Record<Tag, number> = { cocotte: 0.34, fox: 0.2, barrel: 0.3, crate: 0.1, rock: 0.2, ground: 0.25 };
const FRIC: Record<Tag, number> = { cocotte: 0.5, fox: 0.5, barrel: 0.5, crate: 0.6, rock: 0.5, ground: 0.7 };
const MASS: Record<Tag, number> = { cocotte: 1, fox: 1.2, barrel: 1, rock: 1.6, crate: 1.3, ground: 0 };

const len = (x: number, y: number) => Math.hypot(x, y);
let UID = 1;

function circle(tag: Tag, x: number, y: number, r: number, hp = 0): Body {
	return { id: UID++, kind: 'circle', tag, x, y, vx: 0, vy: 0, r, hw: 0, hh: 0, invMass: MASS[tag] ? 1 / MASS[tag] : 0, rest: REST[tag], fric: FRIC[tag], hp, maxHp: hp, defeated: false, launched: false };
}
function box(tag: Tag, x: number, y: number, hw: number, hh: number, isStatic = false): Body {
	const m = isStatic ? 0 : MASS[tag];
	return { id: UID++, kind: 'box', tag, x, y, vx: 0, vy: 0, r: 0, hw, hh, invMass: m ? 1 / m : 0, rest: REST[tag], fric: FRIC[tag], hp: 0, maxHp: 0, defeated: false, launched: false };
}

/* ---------- Difficulty / level ---------- */

export interface DiffLevel {
	label: string;
	foxes: number;
	hp: number;
	margin: number; // extra cocottes beyond the fox count
	sturdiness: number; // crate stack height bonus
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', foxes: 3, hp: 40, margin: 2, sturdiness: 1 },
	moyen: { label: 'Moyen', foxes: 4, hp: 60, margin: 2, sturdiness: 2 },
	difficile: { label: 'Difficile', foxes: 5, hp: 85, margin: 1, sturdiness: 3 },
};

const ri = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

export function makeLevel(seed: number, diff: DiffLevel): World {
	UID = 1;
	const w = 300, h = 190, groundY = 168;
	const world: World = {
		w, h, groundY, gravity: GRAVITY, bodies: [], slingshot: { x: 30, y: groundY - 30 }, cocotte: null, cocottes: diff.foxes + diff.margin,
	};
	// ground (static)
	world.bodies.push(box('ground', w / 2, groundY + 30, w / 2 + 40, 30, true));

	// one small structure per fox, spread across the right side
	const F = diff.foxes;
	const startX = 132, endX = w - 22;
	const CH = 5.5; // crate half-size
	for (let i = 0; i < F; i++) {
		const bx = F === 1 ? (startX + endX) / 2 : startX + (i * (endX - startX)) / (F - 1);
		const n = 1 + diff.sturdiness + ri(rng2(seed, i), 0, 1);
		for (let k = 0; k < n; k++) {
			world.bodies.push(box('crate', bx, groundY - CH - k * 2 * CH, CH, CH));
		}
		const topY = groundY - CH - (n - 1) * 2 * CH; // top crate centre
		const foxR = 6;
		world.bodies.push(circle('fox', bx, topY - CH - foxR, foxR, diff.hp));
		// optional guard barrel in front of some structures
		if (rng2(seed, i + 100)() < 0.5) world.bodies.push(circle('barrel', bx - 16, groundY - 5.5, 5.5));
	}
	spawnCocotte(world);
	return world;
}

// independent sub-stream so each structure is reproducible from the level seed
function rng2(seed: number, salt: number): Rng {
	let a = (seed ^ (salt * 0x9e3779b1)) >>> 0;
	return () => {
		a |= 0; a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function spawnCocotte(world: World): Body {
	const c = circle('cocotte', world.slingshot.x, world.slingshot.y, 5.5);
	world.cocotte = c;
	world.bodies.push(c);
	return c;
}

/* ---------- Collision ---------- */

interface Contact { nx: number; ny: number; depth: number; }

function circleCircle(a: Body, b: Body): Contact | null {
	const dx = b.x - a.x, dy = b.y - a.y;
	const d = len(dx, dy);
	const min = a.r + b.r;
	if (d >= min) return null;
	if (d === 0) return { nx: 0, ny: -1, depth: min };
	return { nx: dx / d, ny: dy / d, depth: min - d };
}

// normal from the circle toward the box
function circleBox(c: Body, bx: Body): Contact | null {
	const cx = Math.max(bx.x - bx.hw, Math.min(c.x, bx.x + bx.hw));
	const cy = Math.max(bx.y - bx.hh, Math.min(c.y, bx.y + bx.hh));
	const dx = cx - c.x, dy = cy - c.y;
	const d = len(dx, dy);
	if (d > c.r) return null;
	if (d > 0.0001) return { nx: dx / d, ny: dy / d, depth: c.r - d };
	// centre inside the box → push out along least-penetration axis
	const ox = bx.hw - Math.abs(c.x - bx.x), oy = bx.hh - Math.abs(c.y - bx.y);
	if (ox < oy) return { nx: c.x < bx.x ? -1 : 1, ny: 0, depth: ox + c.r };
	return { nx: 0, ny: c.y < bx.y ? -1 : 1, depth: oy + c.r };
}

function boxBox(a: Body, b: Body): Contact | null {
	const ox = a.hw + b.hw - Math.abs(a.x - b.x);
	if (ox <= 0) return null;
	const oy = a.hh + b.hh - Math.abs(a.y - b.y);
	if (oy <= 0) return null;
	if (ox < oy) return { nx: b.x < a.x ? -1 : 1, ny: 0, depth: ox };
	return { nx: 0, ny: b.y < a.y ? -1 : 1, depth: oy };
}

/** Contact normal points from a to b. */
function collide(a: Body, b: Body): Contact | null {
	if (a.kind === 'circle' && b.kind === 'circle') return circleCircle(a, b);
	if (a.kind === 'circle' && b.kind === 'box') return circleBox(a, b);
	if (a.kind === 'box' && b.kind === 'circle') {
		const c = circleBox(b, a);
		return c ? { nx: -c.nx, ny: -c.ny, depth: c.depth } : null;
	}
	return boxBox(a, b);
}

function resolve(a: Body, b: Body, c: Contact) {
	const im = a.invMass + b.invMass;
	if (im === 0) return;
	const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
	const vn = rvx * c.nx + rvy * c.ny;
	if (vn < 0) {
		const e = Math.min(a.rest, b.rest);
		const j = (-(1 + e) * vn) / im;
		const jx = j * c.nx, jy = j * c.ny;
		a.vx -= a.invMass * jx; a.vy -= a.invMass * jy;
		b.vx += b.invMass * jx; b.vy += b.invMass * jy;
		// friction along the tangent
		const tx = -c.ny, ty = c.nx;
		const vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
		const f = Math.min(a.fric, b.fric);
		let jt = -vt / im;
		const max = Math.abs(j) * f;
		jt = Math.max(-max, Math.min(max, jt));
		const fx = jt * tx, fy = jt * ty;
		a.vx -= a.invMass * fx; a.vy -= a.invMass * fy;
		b.vx += b.invMass * fx; b.vy += b.invMass * fy;
	}
	// positional correction (Baumgarte slop)
	const corr = (Math.max(c.depth - 0.05, 0) / im) * 0.2;
	a.x -= a.invMass * corr * c.nx; a.y -= a.invMass * corr * c.ny;
	b.x += b.invMass * corr * c.nx; b.y += b.invMass * corr * c.ny;
}

export interface StepEvent { foxesDown: number; settled: boolean; }

export function step(world: World, dt: number): StepEvent {
	const live = world.bodies.filter((b) => !b.defeated);
	// gravity + integrate
	for (const b of live) {
		if (b.invMass === 0) continue;
		b.vy += world.gravity * dt;
		b.vx *= 0.999; b.vy *= 0.999;
		const sp = len(b.vx, b.vy);
		if (sp > MAX_V) { const k = MAX_V / sp; b.vx *= k; b.vy *= k; }
		b.x += b.vx * dt; b.y += b.vy * dt;
	}
	// damage pass (closing speed before the velocity solve)
	for (let i = 0; i < live.length; i++)
		for (let j = i + 1; j < live.length; j++) {
			const a = live[i], b = live[j];
			const c = collide(a, b);
			if (!c) continue;
			const fox = a.tag === 'fox' ? a : b.tag === 'fox' ? b : null;
			if (fox && fox.hp > 0) {
				const closing = -((b.vx - a.vx) * c.nx + (b.vy - a.vy) * c.ny);
				if (closing > HIT_MIN) fox.hp -= (closing - HIT_MIN) * DMG_K;
			}
		}
	// solver
	for (let it = 0; it < ITER; it++)
		for (let i = 0; i < live.length; i++)
			for (let j = i + 1; j < live.length; j++) {
				const a = live[i], b = live[j];
				if (a.invMass === 0 && b.invMass === 0) continue;
				const c = collide(a, b);
				if (c) resolve(a, b, c);
			}
	// defeats: HP depleted, or knocked off the field
	let foxesDown = 0;
	for (const b of world.bodies) {
		if (b.tag !== 'fox' || b.defeated) continue;
		if (b.hp <= 0 || b.y > world.h + 20 || b.x < -20 || b.x > world.w + 20) {
			b.defeated = true;
			foxesDown++;
		}
	}
	return { foxesDown, settled: isSettled(world) };
}

export const isSettled = (world: World): boolean =>
	world.bodies.every((b) => b.invMass === 0 || b.defeated || len(b.vx, b.vy) < SETTLE);

export const foxesLeft = (world: World): number =>
	world.bodies.filter((b) => b.tag === 'fox' && !b.defeated).length;

/* ---------- Aim / prediction ---------- */

/** Slingshot: launch opposite the pull; power ∝ pull length, capped. */
export function aimToVelocity(pull: Vec): { vx: number; vy: number } | null {
	const m = len(pull.x, pull.y);
	if (m < MIN_PULL) return null;
	const sp = (Math.min(m, MAX_PULL) / MAX_PULL) * MAX_SPEED;
	return { vx: (-pull.x / m) * sp, vy: (-pull.y / m) * sp };
}

export const pullPower = (pull: Vec): number => Math.min(len(pull.x, pull.y), MAX_PULL) / MAX_PULL;

/** Sampled parabola for the aim guide (no collisions). */
export function predictTrajectory(world: World, start: Vec, vel: { vx: number; vy: number }, n = 30, dt = 1 / 40): Vec[] {
	const pts: Vec[] = [];
	let x = start.x, y = start.y, vx = vel.vx, vy = vel.vy;
	for (let i = 0; i < n; i++) {
		vy += world.gravity * dt;
		x += vx * dt; y += vy * dt;
		if (y >= world.groundY) { pts.push({ x, y: world.groundY }); break; }
		if (x < 0 || x > world.w) break;
		pts.push({ x, y });
	}
	return pts;
}

/* ---------- Score (cocottes + time tiebreak) ---------- */

export function encodeScore(cocottes: number, timeSec: number): number {
	return cocottes * 100000 + Math.min(99999, Math.round(timeSec * 10));
}
export function decodeScore(v: number): { cocottes: number; timeSec: number } {
	return { cocottes: Math.floor(v / 100000), timeSec: (v % 100000) / 10 };
}
