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
export type Material = 'cardboard' | 'wood' | 'brick' | 'tnt';

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
	spin: number; // visual roll angle (radians) for circular bodies
	mat: Material | null; // material for boxes (drives mass/bounce/colour; 'tnt' explodes)
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
const MAX_V = 900;
const ITER = 8; // solver iterations
const HIT_MIN = 35; // impact speed below which no damage
const DMG_K = 0.6; // damage per (impact - HIT_MIN)
const MIN_PULL = 3;
const MAX_PULL = 46;
const MAX_SPEED = 320; // stronger launch → reaches the far side of the scene

// Light, bouncy, low-friction blocks → they fly, bump and scatter. The cocotte is heavier so
// it ploughs through them; its own friction stays low so it keeps rolling far.
const REST: Record<Tag, number> = { cocotte: 0.4, fox: 0.25, barrel: 0.42, crate: 0.28, rock: 0.35, ground: 0.25 };
const FRIC: Record<Tag, number> = { cocotte: 0.16, fox: 0.4, barrel: 0.3, crate: 0.42, rock: 0.4, ground: 0.55 };
const MASS: Record<Tag, number> = { cocotte: 1.5, fox: 1, barrel: 0.7, rock: 1, crate: 0.7, ground: 0 };
const JUICE = 90; // closing speed above which a collision sparks impact particles

// Block materials: cardboard (light/floppy) · wood (default) · brick (heavy/sturdy) · tnt (explosive).
const MATS: Record<Material, { mass: number; rest: number; fric: number }> = {
	cardboard: { mass: 0.35, rest: 0.12, fric: 0.5 },
	wood: { mass: 0.7, rest: 0.28, fric: 0.42 },
	brick: { mass: 1.9, rest: 0.1, fric: 0.62 },
	tnt: { mass: 0.8, rest: 0.25, fric: 0.45 },
};
const TNT_TRIGGER = 110; // impact speed that detonates a tnt block
const BLAST_R = 40; // explosion radius
const BLAST_IMPULSE = 260; // blast launch strength
const BLAST_DMG = 130; // blast damage to foxes (×falloff)

// Block durability (internal HP) — a block breaks after enough hard impacts. tnt = 0 (explodes instead).
const TOUGH: Record<Material, number> = { cardboard: 18, wood: 50, brick: 180, tnt: 0 };
const BLOCK_HIT_MIN = 50; // impact speed below which a block takes no damage
const BLOCK_DMG_K = 1; // block damage per (impact − BLOCK_HIT_MIN)

const len = (x: number, y: number) => Math.hypot(x, y);
let UID = 1;

function circle(tag: Tag, x: number, y: number, r: number, hp = 0): Body {
	return { id: UID++, kind: 'circle', tag, x, y, vx: 0, vy: 0, r, hw: 0, hh: 0, invMass: MASS[tag] ? 1 / MASS[tag] : 0, rest: REST[tag], fric: FRIC[tag], hp, maxHp: hp, spin: 0, mat: null, defeated: false, launched: false };
}
function box(tag: Tag, x: number, y: number, hw: number, hh: number, isStatic = false): Body {
	const m = isStatic ? 0 : MASS[tag];
	return { id: UID++, kind: 'box', tag, x, y, vx: 0, vy: 0, r: 0, hw, hh, invMass: m ? 1 / m : 0, rest: REST[tag], fric: FRIC[tag], hp: 0, maxHp: 0, spin: 0, mat: null, defeated: false, launched: false };
}
/** A dynamic material block (tag 'crate'); physics + durability come from the material. */
function block(mat: Material, x: number, y: number, hw: number, hh: number): Body {
	const d = MATS[mat];
	const t = TOUGH[mat];
	return { id: UID++, kind: 'box', tag: 'crate', x, y, vx: 0, vy: 0, r: 0, hw, hh, invMass: 1 / d.mass, rest: d.rest, fric: d.fric, hp: t, maxHp: t, spin: 0, mat, defeated: false, launched: false };
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
	facile: { label: 'Facile', foxes: 3, hp: 30, margin: 2, sturdiness: 1 },
	moyen: { label: 'Moyen', foxes: 4, hp: 45, margin: 2, sturdiness: 2 },
	difficile: { label: 'Difficile', foxes: 5, hp: 60, margin: 1, sturdiness: 3 },
};

const ri = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

const FOX_R = 6;

const pickMat = (rng: Rng): Material => { const r = rng(); return r < 0.5 ? 'wood' : r < 0.75 ? 'cardboard' : 'brick'; };

/**
 * Build one construction with its fox **perched on top / in balance** (exposed), so a
 * direct hit or knocking the support topples it. Blocks use a mix of materials; when
 * `allowTnt` is set the structure may include an explosive block. Returns true if it did.
 */
function buildStructure(world: World, bx: number, rng: Rng, diff: DiffLevel, allowTnt: boolean): boolean {
	const g = world.groundY;
	const m = pickMat(rng); // structure theme material
	const wantTnt = allowTnt && rng() < 0.6;
	const CH = 5.5; // standard cube half-size — TNT is ALWAYS this size (stacked for tall columns)
	const blk = (x: number, y: number, hw: number, hh: number, tnt = false) => {
		if (!tnt) { world.bodies.push(block(m, x, y, hw, hh)); return; }
		const n = Math.max(1, Math.round(hh / CH)); // fill a tall span with fixed-size TNT cubes
		for (let k = 0; k < n; k++) world.bodies.push(block('tnt', x, (y + hh) - CH - k * 2 * CH, CH, CH));
	};
	const fox = (x: number, y: number) => world.bodies.push(circle('fox', x, y, FOX_R, diff.hp));
	const arche = ri(rng, 0, 3);
	const tall = rng() < 0.45; // some foxes get a much taller construction (bigger fall)

	if (arche === 0) {
		// Pole: a narrow pillar with the fox balanced on top — easy to topple.
		const ph = Math.round((11 + diff.sturdiness * 2) * (tall ? 2 : 1));
		blk(bx, g - ph, 4, ph, wantTnt);
		fox(bx, g - 2 * ph - FOX_R);
		if (rng() < 0.5) world.bodies.push(circle('barrel', bx - 20, g - 5.5, 5.5)); // rolling obstacle in front
	} else if (arche === 1) {
		// Bridge: a long plank on two pillars, fox standing on top of the plank (exposed).
		const ph = Math.round((9 + diff.sturdiness) * (tall ? 1.9 : 1)), bh = 2.5;
		blk(bx - 12, g - ph, 3, ph, wantTnt);
		blk(bx + 12, g - ph, 3, ph);
		blk(bx, g - 2 * ph - bh, 14, bh); // plank
		fox(bx, g - 2 * ph - 2 * bh - FOX_R);
	} else if (arche === 2) {
		// Stack: blocks piled with the fox on top; the base block may be the explosive one.
		const n = 2 + diff.sturdiness + (tall ? 2 : 0);
		for (let k = 0; k < n; k++) blk(bx, g - 5.5 - k * 11, 5.5, 5.5, wantTnt && k === 0);
		fox(bx, g - 5.5 - (n - 1) * 11 - 5.5 - FOX_R);
		if (rng() < 0.5) blk(bx + 13, g - 5.5, 5.5, 5.5);
	} else {
		// Cage/tower: the fox is ENCLOSED by two stacked walls + a roof — break in to reach it.
		const cageMat: Material = m === 'brick' ? 'wood' : m; // keep the cage breakable
		const ch = 5.5, levels = 2 + diff.sturdiness + (tall ? 2 : 0);
		const cageBlk = (x: number, y: number, hw: number, hh: number, tnt = false) => world.bodies.push(block(tnt ? 'tnt' : cageMat, x, y, hw, hh));
		for (let k = 0; k < levels; k++) {
			cageBlk(bx - 11, g - ch - k * 2 * ch, 3, ch, wantTnt && k === 0); // left wall column
			cageBlk(bx + 11, g - ch - k * 2 * ch, 3, ch);                     // right wall column
		}
		const topY = g - ch - (levels - 1) * 2 * ch; // top wall block centre
		cageBlk(bx, topY - ch - 2.5, 14, 2.5);        // roof beam on the two columns
		fox(bx, g - FOX_R);                            // fox enclosed on the ground inside
	}
	return wantTnt;
}

export function makeLevel(seed: number, diff: DiffLevel): World {
	UID = 1;
	const w = 300, h = 190, groundY = 168;
	const world: World = {
		w, h, groundY, gravity: GRAVITY, bodies: [], slingshot: { x: 30, y: groundY - 30 }, cocotte: null, cocottes: Infinity, // unlimited shots
	};
	world.bodies.push(box('ground', w / 2, groundY + 30, w / 2 + 40, 30, true)); // static ground

	const F = diff.foxes;
	const startX = 122, endX = w - 20;
	let tntCount = 0;
	for (let i = 0; i < F; i++) {
		const bx = F === 1 ? (startX + endX) / 2 : startX + (i * (endX - startX)) / (F - 1);
		if (buildStructure(world, bx, rng2(seed, i), diff, tntCount < 2)) tntCount++; // cap explosives per level
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

export interface StepEvent { foxesDown: number; settled: boolean; hits: Vec[]; blasts: Vec[]; breaks: { x: number; y: number; mat: Material }[]; }

export function step(world: World, dt: number): StepEvent {
	const live = world.bodies.filter((b) => !b.defeated);
	const hits: Vec[] = [];
	const tntFlag = new Set<number>();
	// gravity + integrate
	for (const b of live) {
		if (b.invMass === 0) continue;
		b.vy += world.gravity * dt;
		b.vx *= 0.999; b.vy *= 0.999;
		const sp = len(b.vx, b.vy);
		if (sp > MAX_V) { const k = MAX_V / sp; b.vx *= k; b.vy *= k; }
		b.x += b.vx * dt; b.y += b.vy * dt;
		if (b.r > 0) b.spin += (b.vx / b.r) * dt; // visual roll (rolling without slipping)
	}
	// damage pass (closing speed before the velocity solve) + impact sparks
	for (let i = 0; i < live.length; i++)
		for (let j = i + 1; j < live.length; j++) {
			const a = live[i], b = live[j];
			const c = collide(a, b);
			if (!c) continue;
			const closing = -((b.vx - a.vx) * c.nx + (b.vy - a.vy) * c.ny);
			const fox = a.tag === 'fox' ? a : b.tag === 'fox' ? b : null;
			if (fox && fox.hp > 0 && closing > HIT_MIN) fox.hp -= (closing - HIT_MIN) * DMG_K;
			if (closing > JUICE && (a.invMass > 0 || b.invMass > 0)) hits.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
			if (closing > TNT_TRIGGER) { if (a.mat === 'tnt') tntFlag.add(a.id); if (b.mat === 'tnt') tntFlag.add(b.id); }
			if (closing > BLOCK_HIT_MIN) { // breakable blocks take internal damage
				const dmg = (closing - BLOCK_HIT_MIN) * BLOCK_DMG_K;
				if (a.tag === 'crate' && a.mat !== 'tnt' && a.maxHp > 0) a.hp -= dmg;
				if (b.tag === 'crate' && b.mat !== 'tnt' && b.maxHp > 0) b.hp -= dmg;
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
	// Settling aid: bleed off residual jitter on near-resting bodies so stacks come to rest
	// quickly (the cocotte is exempt so it keeps rolling far).
	for (const b of live) {
		if (b.invMass === 0 || b.tag === 'cocotte' || b.defeated) continue;
		if (len(b.vx, b.vy) < 18) { b.vx *= 0.8; b.vy *= 0.8; }
	}

	// TNT: detonate flagged blocks → radial blast (launch + fox damage), with chain reactions.
	const blasts: Vec[] = [];
	if (tntFlag.size) {
		const queue = world.bodies.filter((b) => tntFlag.has(b.id) && !b.defeated);
		while (queue.length) {
			const t = queue.shift()!;
			if (t.defeated) continue;
			t.defeated = true;
			blasts.push({ x: t.x, y: t.y });
			for (const b of world.bodies) {
				if (b === t || b.defeated || b.invMass === 0) continue;
				const dx = b.x - t.x, dy = b.y - t.y;
				const d = len(dx, dy);
				if (d > BLAST_R) continue;
				const f = 1 - d / BLAST_R;
				const nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : -1;
				b.vx += nx * BLAST_IMPULSE * f * b.invMass;
				b.vy += (ny * BLAST_IMPULSE - 60) * f * b.invMass; // slight upward bias
				if (b.tag === 'fox') b.hp -= BLAST_DMG * f;
				if (b.mat === 'tnt' && !queue.includes(b)) queue.push(b); // chain
			}
		}
	}

	// breakable blocks whose HP ran out → shatter (and free the path)
	const breaks: { x: number; y: number; mat: Material }[] = [];
	for (const b of world.bodies) {
		if (b.tag === 'crate' && !b.defeated && b.maxHp > 0 && b.hp <= 0) {
			b.defeated = true;
			breaks.push({ x: b.x, y: b.y, mat: b.mat ?? 'wood' });
		}
	}

	// defeats: foxes whose HP ran out, and any dynamic body knocked far off the field
	// (removing fly-aways so the world can actually settle).
	let foxesDown = 0;
	const off = (b: Body) => b.y > world.h + 30 || b.x < -30 || b.x > world.w + 30;
	for (const b of world.bodies) {
		if (b.defeated || b.invMass === 0) continue;
		if (b.tag === 'fox' && (b.hp <= 0 || off(b))) { b.defeated = true; foxesDown++; }
		else if (b.tag !== 'fox' && off(b)) { b.defeated = true; }
	}
	return { foxesDown, settled: isSettled(world), hits: hits.slice(0, 5), blasts, breaks };
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
