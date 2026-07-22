/**
 * ANGRY COCOTTE — pure engine (no UI). Angry-Birds-like: launch the cocotte (hen)
 * with a slingshot to knock down foxes perched on collapsing structures. Side view
 * with gravity; lightweight impulse-based rigid bodies (circles tumble, AABB crates
 * stack without rotation). Foxes have HP and take damage on every hard impact; at 0
 * they explode. Score = cocottes used (time tiebreak). Seeded levels for the daily.
 */

import type { Rng } from '../prng';
import { encodePacked, decodePacked } from '../../lib/scoreFormat';

export interface Vec { x: number; y: number; }
export type Kind = 'circle' | 'box';
export type Tag = 'cocotte' | 'fox' | 'barrel' | 'crate' | 'rock' | 'ground';
export type Material = 'cardboard' | 'wood' | 'brick' | 'tnt';
// Hen powers. explosive/poussins are ACTIVE (tap in flight, else auto on impact);
// perce/rebond/lourde are PASSIVE (baked into the body at spawn / into resolve).
export type HenType = 'normale' | 'explosive' | 'perce' | 'rebond' | 'lourde' | 'poussins';
export const HEN_TYPES: HenType[] = ['normale', 'explosive', 'perce', 'rebond', 'lourde', 'poussins'];
const ACTIVE_HENS = new Set<HenType>(['explosive', 'poussins']);

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
	still: number; // consecutive near-rest frames → sleep only when confirmed resting (never mid-air)
	grounded: boolean; // has a support beneath it this frame → only then may it sleep (else gravity accelerates it)
	hen?: HenType; // cocotte power
	powerUsed?: boolean; // active power already spent
	chick?: boolean; // spawned by the poussins power (small, doesn't re-split)
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
// Explosive-hen blast: a bit wider/stronger than a tnt crate.
const HEN_BLAST_R = 46;
const HEN_BLAST_IMPULSE = 300;
const HEN_BLAST_DMG = 150;
const CHICK_R = 2.8; // poussins spawned by the split power
const CHICK_ANGLES = [-0.32, 0, 0.32]; // fan spread (rad) — FIXED so the sim stays deterministic
const CHICK_SPEED_K = 0.85; // fraction of the parent's speed carried by each chick

// Block durability (internal HP) — a block breaks after enough hard impacts. tnt = 0 (explodes instead).
const TOUGH: Record<Material, number> = { cardboard: 18, wood: 50, brick: 180, tnt: 0 };
const BLOCK_HIT_MIN = 50; // impact speed below which a block takes no damage
const BLOCK_DMG_K = 1; // block damage per (impact − BLOCK_HIT_MIN)

const len = (x: number, y: number) => Math.hypot(x, y);
let UID = 1;

function circle(tag: Tag, x: number, y: number, r: number, hp = 0): Body {
	return { id: UID++, kind: 'circle', tag, x, y, vx: 0, vy: 0, r, hw: 0, hh: 0, invMass: MASS[tag] ? 1 / MASS[tag] : 0, rest: REST[tag], fric: FRIC[tag], hp, maxHp: hp, spin: 0, mat: null, defeated: false, launched: false, still: 0, grounded: false };
}
function box(tag: Tag, x: number, y: number, hw: number, hh: number, isStatic = false): Body {
	const m = isStatic ? 0 : MASS[tag];
	return { id: UID++, kind: 'box', tag, x, y, vx: 0, vy: 0, r: 0, hw, hh, invMass: m ? 1 / m : 0, rest: REST[tag], fric: FRIC[tag], hp: 0, maxHp: 0, spin: 0, mat: null, defeated: false, launched: false, still: 0, grounded: false };
}
/** A dynamic material block (tag 'crate'); physics + durability come from the material. */
function block(mat: Material, x: number, y: number, hw: number, hh: number): Body {
	const d = MATS[mat];
	const t = TOUGH[mat];
	return { id: UID++, kind: 'box', tag: 'crate', x, y, vx: 0, vy: 0, r: 0, hw, hh, invMass: 1 / d.mass, rest: d.rest, fric: d.fric, hp: t, maxHp: t, spin: 0, mat, defeated: false, launched: false, still: 0, grounded: false };
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

const FOX_R = 6;

/**
 * Build one Angry-Birds-style **frame building**: vertical columns tied by full-width floor
 * beams (a stable frame), each bay of each storey randomly a room-with-a-fox, a filled wall,
 * or an open window. Mixed materials (wood beams, brick pillars, flimsy "glass"), the odd TNT.
 * Foxes sit at various levels and a building can hold several. Returns true if it embedded a tnt.
 */
function buildBuilding(world: World, bx: number, rng: Rng, diff: DiffLevel, nFox: number, allowTnt: boolean): boolean {
	const g = world.groundY;
	const wantTnt = allowTnt && rng() < 0.45;
	const POST_HW = 2.5, POST_HH = 7.5;      // chunky column between two floors (interior height 15 clears the fox)
	const BEAM_HH = 2.2, BAY = 18;           // floor-plank thickness; column spacing (a bay clears the fox)
	const WALL_HW = BAY / 2 - POST_HW - 0.4; // a wall that fills a bay between its two posts
	const put = (mat: Material, x: number, y: number, hw: number, hh: number) => world.bodies.push(block(mat, x, y, hw, hh));
	const fox = (x: number, y: number) => world.bodies.push(circle('fox', x, y, FOX_R, diff.hp));
	const woodGlass = (): Material => (rng() < 0.22 ? 'cardboard' : 'wood'); // cardboard stands in for flimsy glass

	// Tall, dense fortresses: 3 columns wide (2 bays), several storeys high, most bays walled in.
	const nCol = nFox >= 2 ? 3 : 2;
	const nBay = nCol - 1;
	const nStory = Math.max(Math.ceil(nFox / nBay), 5) + (rng() < 0.4 ? 1 : 0);
	const cx = (i: number) => bx + (i - (nCol - 1) / 2) * BAY;
	const halfW = ((nCol - 1) / 2) * BAY + POST_HW;

	// Pick exactly nFox (storey,bay) cells for the foxes, spread out via a shuffled key.
	const cells: { s: number; b: number; k: number }[] = [];
	for (let s = 0; s < nStory; s++) for (let b = 0; b < nBay; b++) cells.push({ s, b, k: rng() });
	cells.sort((a, z) => a.k - z.k);
	const foxCells = new Set(cells.slice(0, nFox).map((c) => c.s * 10 + c.b));

	let floorY = g; // top face the current storey stands on
	let tnt = false;
	for (let s = 0; s < nStory; s++) {
		const mat = woodGlass();
		for (let i = 0; i < nCol; i++) { // columns
			const asTnt = wantTnt && !tnt && s === 0 && i === 0;
			put(asTnt ? 'tnt' : rng() < 0.28 ? 'brick' : mat, cx(i), floorY - POST_HH, POST_HW, POST_HH);
			if (asTnt) tnt = true;
		}
		for (let b = 0; b < nBay; b++) { // bay contents: fox room / wall / open window
			const mid = (cx(b) + cx(b + 1)) / 2;
			if (foxCells.has(s * 10 + b)) { fox(mid, floorY - FOX_R); continue; }
			const r = rng();
			if (r < 0.72) put(r < 0.2 ? 'brick' : woodGlass(), mid, floorY - POST_HH, WALL_HW, POST_HH); // mostly walled → solid fortress

		}
		const postsTop = floorY - 2 * POST_HH;
		put('wood', bx, postsTop - BEAM_HH, halfW, BEAM_HH); // full-width floor / ceiling ties the columns
		floorY = postsTop - 2 * BEAM_HH;
	}
	if (rng() < 0.5) { // roof crenellation
		put('wood', bx - halfW + 3, floorY - 2, 2.2, 2);
		put('wood', bx + halfW - 3, floorY - 2, 2.2, 2);
	}
	return tnt;
}

/**
 * Build a small **fox-less obstacle** (variety + something extra to knock through): a short
 * crate tower, a stable pyramid, a little gate/wall, or a couple of barrels. Returns true if
 * it embedded a tnt.
 */
function buildProp(world: World, bx: number, rng: Rng, allowTnt: boolean): boolean {
	const g = world.groundY;
	const wantTnt = allowTnt && rng() < 0.25;
	const put = (mat: Material, x: number, y: number, hw: number, hh: number) => world.bodies.push(block(mat, x, y, hw, hh));
	const mat: Material = rng() < 0.5 ? 'wood' : rng() < 0.65 ? 'cardboard' : 'brick';
	const kind = Math.floor(rng() * 4);
	let tnt = false;

	if (kind === 0) { // short crate tower
		const n = 2 + Math.floor(rng() * 2); // 2-3 crates
		for (let k = 0; k < n; k++) { const asTnt = wantTnt && k === 0; if (asTnt) tnt = true; put(asTnt ? 'tnt' : mat, bx, g - 5 - k * 10, 5, 5); }
	} else if (kind === 1) { // pyramid (very stable)
		const s = 4.5;
		for (let k = 0; k < 3; k++) put(mat, bx - 2 * s + k * 2 * s, g - s, s, s); // base of 3
		for (let k = 0; k < 2; k++) put(mat, bx - s + k * 2 * s, g - 3 * s, s, s);   // middle of 2
		put(wantTnt ? 'tnt' : mat, bx, g - 5 * s, s, s);                             // capstone
		tnt = wantTnt;
	} else if (kind === 2) { // little gate / wall
		const ph = 9;
		put(mat, bx - 6, g - ph, 2.5, ph); put(mat, bx + 6, g - ph, 2.5, ph); // posts
		put(wantTnt ? 'tnt' : mat, bx, g - 2 * ph - 2, 8, 2);                  // lintel
		tnt = wantTnt;
	} else { // barrels on the ground (rolling obstacles) behind a low crate
		put(mat, bx - 7, g - 4, 4, 4);
		world.bodies.push(circle('barrel', bx, g - 5.5, 5.5));
		if (rng() < 0.6) world.bodies.push(circle('barrel', bx + 9, g - 5.5, 5.5));
	}
	return tnt;
}

export function makeLevel(seed: number, diff: DiffLevel): World {
	UID = 1;
	const w = 300, h = 190, groundY = 168;
	const world: World = {
		w, h, groundY, gravity: GRAVITY, bodies: [], slingshot: { x: 30, y: groundY - 30 }, cocotte: null, cocottes: Infinity, // unlimited shots
	};
	world.bodies.push(box('ground', w / 2, groundY + 30, w / 2 + 40, 30, true)); // static ground

	const F = diff.foxes;
	const startX = 110, endX = w - 36;
	// Pack the foxes into 1-2 massive fortresses (rather than several small structures).
	const T = F <= 3 ? 1 : 2;
	const groups: number[] = [];
	for (let i = 0; i < T; i++) groups.push(Math.floor(F / T) + (i < F % T ? 1 : 0));
	let tntCount = 0;
	const occupied: number[] = [];
	for (let i = 0; i < T; i++) {
		const bx = T === 1 ? (startX + endX) / 2 : startX + (i * (endX - startX)) / (T - 1);
		occupied.push(bx);
		if (buildBuilding(world, bx, rng2(seed, i), diff, groups[i], tntCount < 2)) tntCount++; // cap explosives per level
	}
	// Fill the empty gaps with small fox-less obstacles for variety.
	const pr = rng2(seed, 555);
	for (const cx of [95, 130, 165, 200, 235, 268]) {
		if (occupied.some((o) => Math.abs(o - cx) < 34)) continue; // clear of the fortresses & other props
		if (pr() < 0.6) { if (buildProp(world, cx, rng2(seed, 400 + cx), tntCount < 2)) tntCount++; occupied.push(cx); }
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

/** Apply a hen's PASSIVE stats to a not-yet-launched cocotte (idempotent). */
export function applyHen(c: Body, hen: HenType): void {
	c.hen = hen;
	c.powerUsed = false;
	// reset to the base cocotte body, then override per power
	c.r = 5.5;
	c.invMass = 1 / MASS.cocotte;
	c.rest = REST.cocotte;
	if (hen === 'rebond') { c.rest = 0.9; c.fric = 0.05; } // ricochets like a ball off everything
	else if (hen === 'lourde') { c.r = 8; c.invMass = 1 / 3; } // bigger & heavier → ploughs through
}

export function spawnCocotte(world: World, hen: HenType = 'normale'): Body {
	const c = circle('cocotte', world.slingshot.x, world.slingshot.y, 5.5);
	applyHen(c, hen);
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

// A live piercing cocotte passes THROUGH everything but the ground: no momentum
// exchange (damage is still applied in the damage pass), so it keeps flying straight.
function piercesThrough(a: Body, b: Body): boolean {
	const pierce = (h: Body, o: Body) => h.tag === 'cocotte' && h.hen === 'perce' && !h.defeated && o.tag !== 'ground';
	return pierce(a, b) || pierce(b, a);
}

function resolve(a: Body, b: Body, c: Contact) {
	if (piercesThrough(a, b)) return;
	const im = a.invMass + b.invMass;
	if (im === 0) return;
	const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
	const vn = rvx * c.nx + rvy * c.ny;
	if (vn < 0) {
		// Normally restitution is the softer of the pair; a bouncy hen imposes ITS
		// high restitution on every surface so it ricochets off ground/blocks/foxes.
		const bouncy = a.hen === 'rebond' || b.hen === 'rebond';
		const e = bouncy ? Math.max(a.rest, b.rest) : Math.min(a.rest, b.rest);
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

export interface StepEvent { foxesDown: number; settled: boolean; hits: Vec[]; blasts: Vec[]; breaks: { x: number; y: number; mat: Material }[]; pops: Vec[]; }

/* ---------- Hen active powers (shared by tap-in-flight and auto-on-impact) ---------- */

// Radial blast centred on a hen (wider than a tnt crate). Chains into tnt blocks.
function henBlast(world: World, c: Body): void {
	c.defeated = true;
	c.powerUsed = true;
	for (const b of world.bodies) {
		if (b === c || b.defeated || b.invMass === 0) continue;
		const dx = b.x - c.x, dy = b.y - c.y;
		const d = len(dx, dy);
		if (d > HEN_BLAST_R) continue;
		const f = 1 - d / HEN_BLAST_R;
		const nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : -1;
		b.vx += nx * HEN_BLAST_IMPULSE * f * b.invMass;
		b.vy += (ny * HEN_BLAST_IMPULSE - 60) * f * b.invMass; // slight upward bias
		if (b.tag === 'fox') b.hp -= HEN_BLAST_DMG * f;
	}
}

// Split a hen into 3 chicks in a fixed fan around its current heading.
function splitChicks(world: World, c: Body): void {
	c.defeated = true;
	c.powerUsed = true;
	const sp = len(c.vx, c.vy);
	const base = sp > 1 ? Math.atan2(c.vy, c.vx) : 0; // fall straight-ish if barely moving
	for (const da of CHICK_ANGLES) {
		const a = base + da;
		const chick = circle('cocotte', c.x, c.y, CHICK_R);
		chick.chick = true;
		chick.launched = true;
		chick.powerUsed = true; // a chick can't split again
		chick.hen = 'normale';
		chick.vx = Math.cos(a) * sp * CHICK_SPEED_K;
		chick.vy = Math.sin(a) * sp * CHICK_SPEED_K;
		world.bodies.push(chick);
	}
}

/**
 * Fire a hen's ACTIVE power now (player tapped in flight). No-op for passive/normal
 * hens or an already-spent power. Returns FX hints for the renderer, or null.
 */
export function activatePower(world: World, c: Body | null): { blast?: Vec; chicks?: Vec } | null {
	if (!c || c.defeated || c.powerUsed || !c.hen || !ACTIVE_HENS.has(c.hen)) return null;
	const at = { x: c.x, y: c.y };
	if (c.hen === 'explosive') { henBlast(world, c); return { blast: at }; }
	splitChicks(world, c); return { chicks: at };
}

export function step(world: World, dt: number): StepEvent {
	const live = world.bodies.filter((b) => !b.defeated);
	const hits: Vec[] = [];
	const tntFlag = new Set<number>();
	const powerFlag = new Set<number>(); // active hens that hit something → auto-fire
	// gravity + integrate
	for (const b of live) {
		b.grounded = false; // recomputed each frame from actual contacts below
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
			// Active hen that lands a real hit (fox or block) auto-fires if not tapped first.
			const hitHard = (closing > HIT_MIN && (a.tag === 'fox' || b.tag === 'fox')) || closing > BLOCK_HIT_MIN;
			if (hitHard) for (const h of [a, b]) if (h.tag === 'cocotte' && h.hen && ACTIVE_HENS.has(h.hen) && !h.powerUsed) powerFlag.add(h.id);
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
				if (c) {
					resolve(a, b, c);
					// Mark support: on a mostly-vertical contact (normal a→b) the upper body rests on the lower.
					if (c.ny > 0.5) a.grounded = true;      // b is below a → a is supported
					else if (c.ny < -0.5) b.grounded = true; // a is below b → b is supported
				}
			}
	// Settling: let a stack come to rest without ever slowing a falling block. A body may sleep ONLY
	// while it has a support beneath it (grounded); the moment its support is knocked away it is no
	// longer grounded, so it wakes and gravity accelerates it at full rate (no floaty creep).
	for (const b of live) {
		if (b.invMass === 0 || b.tag === 'cocotte' || b.defeated) continue;
		if (!b.grounded) { b.still = 0; continue; } // unsupported → keep full gravity, never sleep
		const s = len(b.vx, b.vy);
		if (s < SETTLE) { if (++b.still > 8) { b.vx = 0; b.vy = 0; } }        // at rest on a support
		else if (s < 30) { if (++b.still > 20) { b.vx = 0; b.vy = 0; } }      // persistent jitter on a support
		else b.still = 0;
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

	// Active hens that hit something (and weren't tapped) auto-fire their power.
	const pops: Vec[] = [];
	if (powerFlag.size) {
		for (const c of world.bodies) {
			if (!powerFlag.has(c.id) || c.defeated || c.powerUsed) continue;
			const at = { x: c.x, y: c.y };
			if (c.hen === 'explosive') { henBlast(world, c); blasts.push(at); }
			else if (c.hen === 'poussins') { splitChicks(world, c); pops.push(at); }
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
	return { foxesDown, settled: isSettled(world), hits: hits.slice(0, 5), blasts, breaks, pops };
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
	const vx = vel.vx;
	let x = start.x, y = start.y, vy = vel.vy;
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
	return encodePacked(10_000_000, [cocottes, Math.min(9_999_999, Math.round(timeSec * 100))]);
}
export function decodeScore(v: number): { cocottes: number; timeSec: number } {
	const [cocottes, t] = decodePacked(10_000_000, 2, v);
	return { cocottes, timeSec: t / 100 };
}
