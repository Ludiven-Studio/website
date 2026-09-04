/* =====================================================
   BOLIDES — Paper.io-with-cars, arcade territory capture.
   Pure simulation: a logic grid of cell owners, arcade car physics
   (real turning radius + a little inertia + a drift flag), trail laying,
   flood-fill capture, deadly trails, simple bots. No three.js here.
   The renderer (render3d.ts) reads this state; React (BolidesGame.tsx)
   drives the fixed-step loop.
   ===================================================== */
import { mulberry32, type Rng } from '../prng';
import type { CarCfg } from './cars';

export const ARENA = 100; // world units, square centred on the origin (−50..+50)
export const GRID = 200; // logical cells per side
export const CELL = ARENA / GRID; // 0.5 world units per cell
export const HALF = ARENA / 2;
export const TOTAL = GRID * GRID;

// id 0 = neutral. Cars are ids 1..N. Colours are vivid so trails read at a glance.
export const PALETTE = [0x0B0F1E, 0x3D8BFF, 0xFF2E63, 0x1DE9A0, 0xFFD400]; // neutral, blue, pink, mint, yellow
export const NAMES = ['', 'TOI', 'Rouge', 'Vert', 'Jaune'];
export const CAR_COUNT = 4; // 1 player + 3 bots

export const CFG = {
	// The three speeds scale together on purpose. Whether a throttle drifts is v^2/R(v) against
	// share x maxSpeed^2/turnRadius, and both sides are homogeneous: the ratio collapses to
	// u^2/(s + (1-s)u) with u = v/maxSpeed. So raising the speeds in the SAME proportion leaves the
	// drift story bit-identical (measured, scripts/bolides-uturn.mjs) — raising maxSpeed alone does
	// not, and cost the paint its cruise drift outright.
	cruise: 20.6, // speed at neutral throttle (units/s) — cars always roll forward
	maxSpeed: 34, // full throttle
	minSpeed: 8.5, // hard brake (never a full stop, so a trail keeps forming)
	// Every RATE below (1/s) is scaled by k/m too, k being the speed factor and m the radius one.
	// Leave them behind and the car answers just as slowly while its corners got quicker, which is
	// not "sluggish" evenly: it hands the race to whichever car already had the fastest responses
	// (measured, the Frelon went 25.6 -> 34.4 % of wins with the rates left at their old values).
	accelResp: 3.95, // how fast speed eases toward the throttle target (weight/inertia)
	// These two are solved as a PAIR (scripts/bolides-uturn.mjs): what matters is the spread
	// between the slow corner and the fast one. 12/0.30 keeps a braked U-turn inside an 11.4-unit
	// corridor (2.4 s) against 17.6 flat out. Land per loop goes as cruise x radius, so the two
	// moves are deliberately opposite: 20.6 x 12 = 247 against the old 17 x 15 = 255, i.e. the race
	// pacing is untouched (135 s -> 130 s over 700 seeded bot races) while a flat-out corner loses
	// a quarter of its corridor (24.0 -> 17.6) and a third of its time (2.20 s -> 1.50 s).
	turnRadius: 12, // gripped turning circle AT TOP SPEED; a drift tightens it (see driftBoost)
	slowRadius: 0.30, // share of turnRadius left at a standstill — slow cars pivot, fast ones run wide
	steerResp: 13.7, // how fast the applied turn eases toward the input (steering inertia)
	grip: 39.5, // how fast the travel direction catches the heading — the gap is the slide
	maxSlip: 0.7, // radians (40°) of sideways the car can hold — the drift's visual ceiling
	// Sideways tyres are brakes. Without this a slide is a plough: the path radius is speed^2 over
	// the grip limit, so flat out on paint the car could only run a 63-unit arc. Scrubbing lets a
	// drift trade speed for a tighter line, which is the whole point of throwing the car sideways.
	scrub: 2.21, // speed bled per second at full slip, eased by sin(slip)
	driftBoost: 1.3, // the nose swings harder mid-drift; the PATH is still capped by grip below
	// What breaks traction is the cornering LOAD (speed x yaw rate), not how fast the wheel was
	// thrown: the old jab test could not be passed by holding a key at all, so a keyboard player
	// never drifted anywhere (measured, scripts/bolides-trac.mjs — every hold row read "non").
	// Both are a share of FLAT_OUT, the roster's reference corner — not the car's own. They used to
	// scale with each car's maxSpeed^2 / turnRadius, which let a top-end multiplier buy traction for
	// free (the Comete's +18 % top speed was +51 % of grip, and it drifted 0.0 % of the race).
	// The reason that per-car form existed still holds under the global one: a slow car does not
	// become undriftable, it just needs more lock, because the RADIUS law is roster-referenced too.
	// gripPaint tracks turnRadius: the share is of FLAT_OUT, so widening the base circle would have
	// quietly loosened the paint too and a drift would no longer loop shorter than a grip.
	gripPaint: 0.38, // wet paint gives up around cruise — hold a corner there and it goes
	gripBare: 0.76, // bare ground holds until the last quarter of the throttle
	driftHold: 0.46, // seconds a break lasts once the load drops back under the limit
	grace: 14, // tail cells that can't close a loop — the shortest ring you are allowed to fill
	wallDrag: 6.1, // scraping the rail bleeds speed to minSpeed — else a perimeter lap wins the map
	wallMargin: 3, // bots start turning back this far from the arena wall
	winPct: 50, // first car past this share of the arena wins the run
	timeLimit: 180, // hard race length: at the buzzer the biggest share wins
	respawn: 2.4, // seconds before a dead bot comes back
	respawnPlayer: 3, // dying costs the player tempo in the race, not the run
	homeHalf: 9, // half-size (in cells) of a starting/respawn territory square
	botOutMin: 9, // bot excursion distance budget (world units)
	botArc: 0.55, // how hard a bot arcs while outside (steer magnitude)
	botAggroRange: 14, // how close an enemy trail must be to tempt a bot
} as const;

/** The reference hardest corner, shared by every car so that a roster multiplier means one thing.
 *  Both the turning circle and the traction ceiling are measured against it (see stepCar). */
const FLAT_OUT = (CFG.maxSpeed * CFG.maxSpeed) / CFG.turnRadius;

/* Grip pickups. The one bonus axis the physics already has a hole for: the surface under the car
   picks gripPaint or gripBare, so "keep bare-ground grip on paint" is one term in stepCar and
   nothing else moves. Speed bonuses are NOT the same thing — the turning radius opens with speed,
   so a boost widens your corners and a slow spell tightens the victim's. Off by default: the flag
   is the empty item list, so the ranked daily and the lockstep online race are untouched. */
export const ITEM = {
	// One slot per role, in order. 0..3 = the doorway of that seat's home, -1 = the arena hub,
	// -2 = anywhere. A doorway is the one post you can COUNT on, because a loop always comes home
	// to close; the loose ones are what make the arena worth looking at on the way there.
	plan: [0, 1, 2, 3, -1, -1, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2],
	radius: 1.6, // world units: how close the car has to pass to grab one
	// Same, for a doorway slot — but wider, because a home edge is ~44 units round and a dot on it
	// is a lottery: at 1.6 the doorways FED LESS than uniform spawns (8.5 grabs a race against
	// 14.2). Widening feeds twice a lap (13.6 -> 27.7 -> 54.3 grabs at 1.6 / 3.5 / 6) but eats the
	// slide it is meant to reward (drift 53.9 -> 49.8 -> 41.4 %). 3.5 is the last width that keeps
	// the paint slippery, so a doorway is a band across the camp mouth, not a dot.
	doorR: 3.5,
	respawn: 3, // seconds before a taken slot lights back up
	grip: 5, // seconds the grip bonus runs
	// The second kind. Measured 2026-09-04 (bolides-item.mjs): loops die to a rival's blade 23.7x
	// per race and to a self-cut 1.3x, so "nobody can cut you" is the half worth having — but both
	// halves ride the same flag, because to the player it is one idea: your line is untouchable.
	// The share is not a difficulty knob, it is how loud the arena is: at 0 / 0.5 / 1 a race has
	// 23.9 / 21.4 / 18.8 kills and 0 / 11.4 / 24.1 blades broken on a shield. Half keeps the blade
	// the main way a loop dies, and adds a second one that costs the ATTACKER instead.
	shield: 5, // seconds the shield holds
	// The third kind: your paint turns to tar for everyone but you. It is the one item that pays
	// for OWNING ground rather than for driving, so it is the defender's answer to the blade.
	// Watch the sign: braking tightens the circle in this engine, so slowing a rival also lets it
	// corner shorter. `tar` is a target-speed multiplier, `zone` how long the paint stays sticky.
	tar: 0.55,
	zone: 6,
	weights: [1, 1, 1], // grip / shield / tar, drawn fresh on every respawn
	door: 5.5, // distance from a home centre to its doorway ring — just outside the painted square
	hub: 16, // hub slots stay inside this radius of the arena middle
	margin: 8, // keep loose spawns this far from the rail — a pickup on the wall is a trap
};

/** The three pickups, in `ITEM.weights` order. */
export const KIND = { grip: 0, shield: 1, tar: 2 } as const;

/** A pickup slot. `at` is the clock time it goes live; before that the slot is dark. `role` is its
 *  entry in ITEM.plan and never changes, so a slot always comes back to its post. `kind` is
 *  redrawn on every respawn, so the same post is not always the same bonus. */
export interface Item { x: number; z: number; at: number; role: number; kind: number }

// Daily difficulty (diffIndex 0..2): harder = bolder, more aggressive bots = more danger.
export const DIFFS = [
	{ label: 'Facile', aggro: 0.18, outMax: 20 },
	{ label: 'Moyen', aggro: 0.35, outMax: 28 },
	{ label: 'Difficile', aggro: 0.55, outMax: 38 },
] as const;

/* ---------- per-car config ----------
   Every car drives on its own copy of CFG, so a roster of five bolides is just five tables.
   The roster itself lives in cars.ts, which builds its tables FROM CFG — so the engine must
   never import it back at runtime (the cycle would read CFG before it is initialised). The
   roster registers itself through setCarLookup(); until it does, every seat is the base car,
   which is byte-identical to the shipped CFG. */

export const BASE_CAR_ID = 'roadster';
export const BASE_CAR: CarCfg = { ...CFG, shield: 0 };

/** A seat's car: an id resolved through the installed roster, or a ready-made table. */
export type CarPick = string | CarCfg;

let lookupCar: (id: string) => CarCfg = () => BASE_CAR;
export const setCarLookup = (fn: (id: string) => CarCfg): void => { lookupCar = fn; };

const pickCfg = (p: CarPick | undefined): CarCfg => (p === undefined ? BASE_CAR : typeof p === 'string' ? lookupCar(p) : p);
const pickId = (p: CarPick | undefined): string => (typeof p === 'string' ? p : BASE_CAR_ID);

const randSeed = () => (Math.random() * 2 ** 31) >>> 0;

const WALL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

const NET_EASE = 10; // how fast a ghost is pulled onto the pose its owner last reported

export interface BotState {
	phase: 'in' | 'out' | 'return';
	turnDir: number; // +1 / −1 arc direction while outside
	budget: number; // remaining excursion distance
	aggroTimer: number; // countdown gate for the next aggression check
}

export interface Car {
	id: number;
	carId: string; // roster id of the bolide in this seat
	cfg: CarCfg; // that bolide's handling table — the engine reads this, never CFG, per car
	color: number;
	isBot: boolean;
	alive: boolean;
	x: number;
	z: number;
	heading: number; // radians, 0 = +x
	speed: number; // current forward speed (eased toward the throttle target)
	px: number; // pose before the last step (render interpolation)
	pz: number;
	ph: number;
	turnRate: number; // current (eased) angular velocity
	vh: number; // heading the car actually travels along; lags `heading` when grip is low
	driftT: number; // seconds of traction loss left
	gripT: number; // seconds of pickup grip left: paint holds like bare ground while it runs
	shieldT: number; // seconds of pickup shield left: the whole trail is uncuttable, by anyone
	zoneT: number; // seconds this car's PAINT stays tar: rivals crossing it are slowed, not us
	drifting: boolean;
	scraping: boolean; // rubbing the arena rail (slowed down; renderer throws sparks)
	outside: boolean; // currently laying a trail (out of own territory)
	trail: number[]; // ordered cell indices of the active trail
	respawnAt: number; // clock time (s) to respawn (bots)
	bot: BotState;
	// --- online only: this car is driven by someone else, so we dead-reckon it between packets ---
	remote: boolean;
	netX: number; // last pose reported by its driver; the ghost is eased toward it
	netZ: number;
	netH: number;
}

export type GameEvent =
	// `from` is where the closing ring started in the trail: 0 coming home, the crossing point on a
	// self-cut. The guests need it to fill the same cells (see collectEvents).
	| { type: 'capture'; id: number; from: number; cx: number; cz: number; gain: number }
	| { type: 'kill'; killer: number; victim: number; x: number; z: number }
	| { type: 'death'; id: number; x: number; z: number; isPlayer: boolean }
	// Lost the loop but not the car. Since a self-cut fills, the only way left is breaking your own
	// blade on a shielded rival. `lost` is the trail it cost.
	| { type: 'snap'; id: number; x: number; z: number; isPlayer: boolean; lost: number }
	| { type: 'respawn'; id: number; x: number; z: number }
	| { type: 'item'; id: number; x: number; z: number; kind: number } // grabbed a pickup, see KIND
	| { type: 'win'; id: number; byTime: boolean };

export interface GameState {
	owner: Uint8Array; // cell -> owner id
	home: Uint8Array; // cell -> car id whose start square this is (0 = none); never changes hands
	trail: Uint8Array; // cell -> car id whose active trail sits here (0 = none)
	cars: Car[];
	items: Item[]; // grip pickups; EMPTY is how the mode is switched off (daily + online)
	counts: number[]; // owned cell count per id (index 0 = neutral)
	sumC: number[]; // running sum of col per id (for centroid)
	sumR: number[];
	clock: number; // seconds since start
	over: boolean; // someone passed CFG.winPct (or the clock ran out) — the run is decided
	winner: number; // car id that won (0 while the run is live)
	overByTime: boolean; // won on the clock with the biggest share, not by passing winPct
	seed: number; // arena/bot seed (a daily shares it so everyone faces the same setup)
	diff: number; // difficulty index into DIFFS
	rng: Rng; // seeded PRNG — never Math.random in the sim, or the daily wouldn't be shared
	events: GameEvent[]; // FX/UI to consume this frame, then clear
	trailDirty: number[]; // cells whose trail pixel changed (render repaints these)
	captureFlag: boolean; // a capture/respawn happened -> render repaints the whole territory
	hero: number; // car id the camera follows and the HUD calls "you" (1 offline)
	record: boolean; // online host: log trail additions into netAdd so they can be broadcast
	netAdd: number[]; // (carId << 16) | cell for every trail cell claimed since the last drain
	// scratch buffers reused by the flood fill (avoid per-capture allocation)
	scratch: Uint8Array;
	stack: Int32Array;
}

/* ---------- coordinate helpers ---------- */

export const clampCell = (v: number) => (v < 0 ? 0 : v >= GRID ? GRID - 1 : v);
export const colOf = (x: number) => clampCell(Math.floor((x + HALF) / CELL));
export const rowOf = (z: number) => clampCell(Math.floor((z + HALF) / CELL));
export const cellAt = (x: number, z: number) => rowOf(z) * GRID + colOf(x);
export const cellCenterX = (cell: number) => ((cell % GRID) + 0.5) * CELL - HALF;
export const cellCenterZ = (cell: number) => (Math.floor(cell / GRID) + 0.5) * CELL - HALF;

/** Owner change with running count + centroid bookkeeping (keeps % and bot homes cheap). */
function setOwner(s: GameState, cell: number, id: number): void {
	const old = s.owner[cell];
	if (old === id) return;
	// A start square never changes colour. Swallowed by a rival capture, its owner had nowhere left
	// to come home to, so no loop could ever be closed again.
	const h = s.home[cell];
	if (h !== 0 && h !== id) return;
	s.owner[cell] = id;
	const col = cell % GRID;
	const row = (cell / GRID) | 0;
	s.counts[old]--;
	s.counts[id]++;
	if (old) { s.sumC[old] -= col; s.sumR[old] -= row; }
	s.sumC[id] += col; s.sumR[id] += row;
}

/** Centroid of a car's territory in world space (falls back to origin if wiped out). */
function centroid(s: GameState, id: number): { x: number; z: number } {
	const n = s.counts[id];
	if (n <= 0) return { x: 0, z: 0 };
	const col = s.sumC[id] / n;
	const row = s.sumR[id] / n;
	return { x: (col + 0.5) * CELL - HALF, z: (row + 0.5) * CELL - HALF };
}

export const angleDiff = (a: number, b: number) => {
	let d = (a - b) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d < -Math.PI) d += Math.PI * 2;
	return d;
};

/* ---------- setup ---------- */

/** Paint a square home territory around a world point and drop the car in its centre. */
function makeHome(s: GameState, car: Car, x: number, z: number): void {
	const cc = colOf(x), cr = rowOf(z);
	const h = CFG.homeHalf; // arena tiling, same square for everyone
	for (let r = cr - h; r <= cr + h; r++) {
		if (r < 0 || r >= GRID) continue;
		for (let c = cc - h; c <= cc + h; c++) {
			if (c < 0 || c >= GRID) continue;
			const cell = r * GRID + c;
			s.home[cell] = car.id;
			setOwner(s, cell, car.id);
		}
	}
	car.x = cellCenterX(cr * GRID + cc);
	car.z = cellCenterZ(cr * GRID + cc);
	car.heading = Math.atan2(-car.z, -car.x); // face the arena centre
	car.px = car.x; car.pz = car.z; car.ph = car.heading;
	car.netX = car.x; car.netZ = car.z; car.netH = car.heading; // else a ghost is dragged back to where it died
	// Everyone leaves from a standstill and accelerates rather than being dropped in at cruise.
	// No extra bot code needed: throttle 0 targets cruise, so they ease back up on their own.
	car.speed = 0;
	car.turnRate = 0;
	car.vh = car.heading;
	car.driftT = 0;
	car.gripT = 0; // a bonus does not survive the wreck that ended the run it was helping
	car.shieldT = 0;
	car.zoneT = 0;
	car.alive = true;
	car.outside = false;
	car.drifting = false;
	car.scraping = false;
	car.trail.length = 0;
	car.bot.phase = 'in';
	car.bot.budget = 0;
	car.bot.aggroTimer = 0;
}

// ±40, not ±25: nearer the corners so bots close their loop before the clock.
// Measured 2026-09-01 (bolides-corner.mjs): races decided-by-time 51 % → 24 %,
// end 156 s → 133 s. ±45 breaks it — cars jam the ±50 wall and loops distort.
export const START_POS = [
	[-HALF * 0.8, -HALF * 0.8],
	[HALF * 0.8, -HALF * 0.8],
	[-HALF * 0.8, HALF * 0.8],
	[HALF * 0.8, HALF * 0.8],
];

/** Put a slot back on its post, live in `delay` seconds. A doorway slot only ever uses the two
 *  home sides that face the arena: the two behind it look at the wall and nobody drives there. */
function placeItem(s: GameState, it: Item, delay: number): void {
	it.at = s.clock + delay;
	let roll = s.rng() * ITEM.weights.reduce((a, b) => a + b, 0);
	it.kind = ITEM.weights.findIndex((w) => (roll -= w) < 0);
	if (it.role >= 0) {
		const [cx, cz] = START_POS[it.role % START_POS.length];
		const along = (s.rng() * 2 - 1) * ITEM.door;
		const sx = Math.sign(cx) || 1, sz = Math.sign(cz) || 1;
		if (s.rng() < 0.5) { it.x = cx - sx * ITEM.door; it.z = cz + along; }
		else { it.x = cx + along; it.z = cz - sz * ITEM.door; }
		return;
	}
	if (it.role === -1) {
		const a = s.rng() * Math.PI * 2, r = Math.sqrt(s.rng()) * ITEM.hub;
		it.x = Math.cos(a) * r; it.z = Math.sin(a) * r;
		return;
	}
	const span = ARENA - ITEM.margin * 2;
	it.x = -HALF + ITEM.margin + s.rng() * span;
	it.z = -HALF + ITEM.margin + s.rng() * span;
}

function seedItems(s: GameState, on: boolean): void {
	s.items.length = 0;
	if (!on) return;
	for (const role of ITEM.plan) {
		const it: Item = { x: 0, z: 0, at: 0, role, kind: KIND.grip };
		placeItem(s, it, 0);
		s.items.push(it);
	}
}

/** Grabbed by driving over it — no aim, no button, so nothing has to change on the touch layout.
 *  Bots collect too (they just don't go looking), or the item would be a pure player handicap
 *  on the bots' side of the balance. */
function stepItems(s: GameState): void {
	for (const it of s.items) {
		if (s.clock < it.at) continue;
		const r = it.role >= 0 ? ITEM.doorR : ITEM.radius;
		for (const car of s.cars) {
			if (!car.alive) continue;
			const dx = car.x - it.x, dz = car.z - it.z;
			if (dx * dx + dz * dz > r * r) continue;
			// Refreshes, never stacks. The kinds do stack with each other: they answer different
			// deaths, so holding two is the reward for a good lap, not a compounding buff.
			if (it.kind === KIND.shield) car.shieldT = ITEM.shield;
			else if (it.kind === KIND.tar) car.zoneT = ITEM.zone;
			else car.gripT = ITEM.grip;
			s.events.push({ type: 'item', id: car.id, x: it.x, z: it.z, kind: it.kind });
			placeItem(s, it, ITEM.respawn);
			break;
		}
	}
}

/** `cars` holds one roster id (or ready-made table) per seat; omit it for an all-base grid.
 *  `items` turns the grip pickups on — free play only, see ITEM. */
export function createGame(seed = randSeed(), diff = 1, cars?: readonly CarPick[], items = false): GameState {
	const s: GameState = {
		owner: new Uint8Array(TOTAL),
		home: new Uint8Array(TOTAL),
		trail: new Uint8Array(TOTAL),
		cars: [],
		items: [],
		counts: new Array(CAR_COUNT + 1).fill(0),
		sumC: new Array(CAR_COUNT + 1).fill(0),
		sumR: new Array(CAR_COUNT + 1).fill(0),
		clock: 0,
		over: false,
		winner: 0,
		overByTime: false,
		seed,
		diff,
		rng: mulberry32(seed),
		events: [],
		trailDirty: [],
		captureFlag: true, // force an initial full territory paint
		hero: 1,
		record: false,
		netAdd: [],
		scratch: new Uint8Array(TOTAL),
		stack: new Int32Array(TOTAL),
	};
	s.counts[0] = TOTAL; // every cell starts neutral; setOwner debits this as homes are claimed
	for (let i = 0; i < CAR_COUNT; i++) {
		const id = i + 1;
		const pick = cars?.[i];
		const cfg = pickCfg(pick);
		const car: Car = {
			id,
			carId: pickId(pick),
			cfg,
			color: PALETTE[id],
			isBot: i !== 0,
			alive: true,
			x: 0, z: 0, heading: 0, speed: cfg.cruise, px: 0, pz: 0, ph: 0, turnRate: 0,
			vh: 0, driftT: 0, gripT: 0, shieldT: 0, zoneT: 0,
			drifting: false, scraping: false, outside: false, trail: [], respawnAt: 0,
			bot: { phase: 'in', turnDir: 1, budget: 0, aggroTimer: 0 },
			remote: false, netX: 0, netZ: 0, netH: 0,
		};
		s.cars.push(car);
		makeHome(s, car, START_POS[i][0], START_POS[i][1]);
	}
	seedItems(s, items); // after the homes: makeHome does not touch the rng, but the order is the seed
	return s;
}

/** Full reset in place for an instant "Rejouer" (keeps the typed arrays). Re-seeds so a
 *  daily replay faces the exact same arena; pass no seed for a fresh random libre run.
 *  `cars` re-seats the roster; omit it to keep the bolides already in place. */
export function resetGame(s: GameState, seed = randSeed(), diff = s.diff, cars?: readonly CarPick[], items = false): void {
	s.owner.fill(0);
	s.home.fill(0);
	s.trail.fill(0);
	s.counts.fill(0);
	s.counts[0] = TOTAL;
	s.sumC.fill(0);
	s.sumR.fill(0);
	s.clock = 0;
	s.over = false;
	s.winner = 0;
	s.overByTime = false;
	s.seed = seed;
	s.diff = diff;
	s.rng = mulberry32(seed);
	s.events.length = 0;
	s.trailDirty.length = 0;
	s.netAdd.length = 0;
	s.captureFlag = true;
	for (let i = 0; i < s.cars.length; i++) {
		if (cars) { s.cars[i].carId = pickId(cars[i]); s.cars[i].cfg = pickCfg(cars[i]); }
		makeHome(s, s.cars[i], START_POS[i][0], START_POS[i][1]);
	}
	seedItems(s, items);
}

/* ---------- physics ---------- */

/** `steer` and `throttle` are both in [-1, 1]. throttle > 0 accelerates, < 0 brakes.
 *  `painted` is the surface under the car: wet paint gives up long before bare ground.
 *  `drag` caps the target speed — 1 is normal, ITEM.tar is a rival's tarred paint. */
function stepCar(car: Car, steer: number, throttle: number, dt: number, painted: boolean, drag = 1): void {
	const cfg = car.cfg;
	car.px = car.x; car.pz = car.z; car.ph = car.heading;
	// The car always rolls: 0 is cfg.cruise, the bots' pace, and the brake floor is minSpeed.
	// Braking is the grip/steering tool — the radius law below tightens as speed drops.
	const targetSpeed = (throttle >= 0
		? cfg.cruise + (cfg.maxSpeed - cfg.cruise) * throttle
		: cfg.cruise + (cfg.cruise - cfg.minSpeed) * throttle) * drag;
	car.speed += (targetSpeed - car.speed) * Math.min(1, dt * cfg.accelResp);

	// Slow cars pivot, fast cars run wide: the gripped circle opens up with speed. The reference is
	// the ROSTER's top speed, not the car's own: normalising by cfg.maxSpeed made every car reach
	// exactly turnRadius at its own limit, which erases top speed from the geometry and turns
	// maxSpeed into an anti-knob — raising it only lowers speed/maxSpeed, so the CRUISE corner
	// tightens, the loops shrink and the car lands less. Measured (scripts/bolides-bal.mjs, SOLO=1):
	// +20 % top speed alone cost 27 points of win rate, -15 % gained 31. Nothing moves for the free
	// car, whose maxSpeed IS the reference.
	// |speed| is defensive: the throttle floor is minSpeed, but a hard scrub step could still
	// overshoot through zero, and a signed bracket flips the radius into an instant spin.
	const spd = Math.abs(car.speed);
	const radius = cfg.turnRadius * (cfg.slowRadius + (1 - cfg.slowRadius) * Math.min(1.5, spd / CFG.maxSpeed));
	const maxTurn = (car.speed / radius) * (car.drifting ? cfg.driftBoost : 1);
	car.turnRate += (steer * maxTurn - car.turnRate) * Math.min(1, dt * cfg.steerResp);
	car.heading += car.turnRate * dt;

	// The car travels along vh, not where its nose points — that gap IS the slide. What the tyres
	// cap is how hard the PATH can bend (lateral accel), never how far the nose swings: capping the
	// nose instead turned a slide into a donut, tighter than gripping, so sliding always won.
	const want = angleDiff(car.heading, car.vh) * Math.min(1, dt * cfg.grip);
	// Roster-wide reference corner, for the same reason as the radius above: scaled by the car's own
	// maxSpeed, a +18 % top end quietly bought +51 % of traction (the Comete drifted 0.0 % of the
	// race) and no garage bar could show it, because the multiplier it came from was gripPaint x1.
	// Referenced globally, gripPaint/gripBare mean one absolute load ceiling for every car.
	// The pickup lifts the paint's ceiling to bare ground: while it runs the surface stops mattering.
	const hold = painted && car.gripT <= 0 ? cfg.gripPaint : cfg.gripBare;
	const maxBend = (hold * FLAT_OUT / Math.max(spd, 1)) * dt;
	const slid = Math.abs(want) > maxBend;
	car.vh += slid ? Math.sign(want) * maxBend : want;
	car.driftT = slid ? cfg.driftHold : Math.max(0, car.driftT - dt);
	car.drifting = car.driftT > 0;
	// A slide has a ceiling: sideways the tyres scrub, so the nose stops running away from the path.
	const slip = angleDiff(car.heading, car.vh);
	if (Math.abs(slip) > cfg.maxSlip) {
		car.heading = car.vh + Math.sign(slip) * cfg.maxSlip;
		car.turnRate *= 0.5;
	}
	car.speed -= car.speed * cfg.scrub * Math.abs(Math.sin(slip)) * dt;

	car.x += Math.cos(car.vh) * car.speed * dt;
	car.z += Math.sin(car.vh) * car.speed * dt;
}

/** A car somebody else drives: coast along its last known heading, then ease onto the pose its
 *  owner reported. Easing instead of snapping keeps every step sub-cell, so the trail the grid
 *  lays under a ghost stays unbroken even though poses only arrive 20x/s. */
function stepGhost(car: Car, dt: number): void {
	car.px = car.x; car.pz = car.z; car.ph = car.heading;
	car.x += Math.cos(car.vh) * car.speed * dt;
	car.z += Math.sin(car.vh) * car.speed * dt;
	const k = Math.min(1, dt * NET_EASE);
	car.x += (car.netX - car.x) * k;
	car.z += (car.netZ - car.z) * k;
	car.heading += angleDiff(car.netH, car.heading) * k;
}

/** Arena edges are guard rails, not a death trap: clamp back inside and ease the heading along
 *  the wall so the car scrapes past instead of stopping dead. The rail bleeds speed, which is
 *  what keeps a full perimeter lap (it encloses the whole map) a long, exposed gamble. */
function slideWalls(car: Car, dt: number): void {
	const lim = HALF - CELL;
	const outX = car.x < -lim ? -1 : car.x > lim ? 1 : 0;
	const outZ = car.z < -lim ? -1 : car.z > lim ? 1 : 0;
	car.scraping = outX !== 0 || outZ !== 0;
	if (!car.scraping) return;
	if (outX) car.x = outX * lim;
	if (outZ) car.z = outZ * lim;

	// Steer to the cardinal direction closest to the current heading that doesn't push further
	// into a wall we're already touching. On a straight wall that keeps the car running along
	// it; wedged in a corner only the two ways out qualify, so the heading can't flip-flop —
	// which would drive the car back over its own trail and kill it.
	let tangent = car.heading;
	let best = Infinity;
	for (const [dx, dz] of WALL_DIRS) {
		if ((outX !== 0 && dx === outX) || (outZ !== 0 && dz === outZ)) continue;
		const a = Math.atan2(dz, dx);
		const d = Math.abs(angleDiff(a, car.heading));
		if (d < best) { best = d; tangent = a; }
	}

	car.heading += angleDiff(tangent, car.heading) * Math.min(1, dt * 5);
	car.turnRate = 0;
	car.vh = car.heading; // the rail kills a slide: no sliding along the wall
	car.driftT = 0;
	car.speed += (car.cfg.minSpeed - car.speed) * Math.min(1, dt * car.cfg.wallDrag);
}

/* ---------- death & capture ---------- */

/** Online host only. A 0 can never be a packed cell (car ids start at 1), so it marks "the next
 *  event happens here" inside the add stream. A capture that lands between two trail cells has
 *  to be replayed between them too, or the guest floods a loop the host never had. */
const mark = (s: GameState) => { if (s.record) s.netAdd.push(0); };

function clearTrail(s: GameState, car: Car): void {
	for (const cell of car.trail) {
		if (s.trail[cell] === car.id) { s.trail[cell] = 0; s.trailDirty.push(cell); }
	}
	car.trail.length = 0;
	car.outside = false;
}

function killCar(s: GameState, car: Car, byPlayer: boolean, killer: number): void {
	if (!car.alive) return;
	clearTrail(s, car);
	car.alive = false;
	car.drifting = false;
	car.scraping = false;
	mark(s);
	if (killer) s.events.push({ type: 'kill', killer, victim: car.id, x: car.x, z: car.z });
	s.events.push({ type: 'death', id: car.id, x: car.x, z: car.z, isPlayer: car.id === s.hero });
	car.respawnAt = s.clock + (car.isBot ? CFG.respawn : CFG.respawnPlayer);
	void byPlayer;
}

/** Close the loop: trail cells + everything they enclose become the car's territory. `from` is where
 *  the ring starts. A self-cut passes the crossing point, so the run out from home is dropped and
 *  the fill is an island where the loop was drawn, not a thread back to camp. */
function capture(s: GameState, car: Car, from = 0): void {
	const id = car.id;
	// Cheap guard: a border flood over 40k cells to enclose nothing is not free.
	if (car.trail.length === 0) { car.outside = false; return; }
	for (let i = 0; i < from; i++) {
		const cell = car.trail[i];
		if (s.trail[cell] === id) { s.trail[cell] = 0; s.trailDirty.push(cell); }
	}
	if (from > 0) car.trail.splice(0, from);
	const before = s.counts[id];
	// 1. the trail itself becomes owned.
	for (const cell of car.trail) {
		setOwner(s, cell, id);
		if (s.trail[cell] === id) { s.trail[cell] = 0; s.trailDirty.push(cell); }
	}
	car.trail.length = 0;
	car.outside = false;

	// 2. flood the "outside" from the borders over every cell NOT owned by id.
	const visited = s.scratch;
	visited.fill(0);
	const stack = s.stack;
	let sp = 0;
	const pushIf = (cell: number) => {
		if (!visited[cell] && s.owner[cell] !== id) { visited[cell] = 1; stack[sp++] = cell; }
	};
	for (let c = 0; c < GRID; c++) { pushIf(c); pushIf((GRID - 1) * GRID + c); }
	for (let r = 0; r < GRID; r++) { pushIf(r * GRID); pushIf(r * GRID + GRID - 1); }
	while (sp > 0) {
		const cell = stack[--sp];
		const col = cell % GRID;
		if (col > 0) pushIf(cell - 1);
		if (col < GRID - 1) pushIf(cell + 1);
		if (cell >= GRID) pushIf(cell - GRID);
		if (cell < TOTAL - GRID) pushIf(cell + GRID);
	}
	// 3. anything not owned and not reached from the border is enclosed -> capture it.
	for (let cell = 0; cell < TOTAL; cell++) {
		if (s.owner[cell] !== id && visited[cell] === 0) setOwner(s, cell, id);
	}
	s.captureFlag = true;
	mark(s);
	const g = centroid(s, id);
	s.events.push({ type: 'capture', id, from, cx: g.x, cz: g.z, gain: s.counts[id] - before });
}

function respawn(s: GameState, car: Car): void {
	// Drop the bot back near its original corner (or a random one if crowded out).
	const p = START_POS[car.id - 1];
	makeHome(s, car, p[0], p[1]);
	s.captureFlag = true;
	mark(s);
	s.events.push({ type: 'respawn', id: car.id, x: car.x, z: car.z });
}

/* ---------- per-step grid logic (trail, kill, capture) ---------- */

/** Blindé rule: the last `shield` cells a car laid can't be cut. Scanning that fixed window
 *  beats trail.indexOf(), which is O(trail) on a line that runs into the thousands. */
function shielded(victim: Car, cell: number): boolean {
	const n = victim.cfg.shield;
	if (n <= 0) return false;
	const from = Math.max(0, victim.trail.length - n);
	for (let i = victim.trail.length - 1; i >= from; i--) if (victim.trail[i] === cell) return true;
	return false;
}

/** One cell of the path the car swept this step. Returns true when the rest of the sweep must be
 *  dropped: the trail is already gone, so there is nothing left to lay behind us. */
function visitCell(s: GameState, car: Car, cell: number): boolean {
	const inside = s.owner[cell] === car.id;
	const t = s.trail[cell];

	// A rival's line is cut wherever it runs, your own ground included. This check used to sit
	// below the `inside` return, which made a car standing at home both harmless and unable to be
	// harmed there — the one place a trail should be most exposed.
	if (t !== 0 && t !== car.id) {
		const victim = s.cars[t - 1];
		if (victim.shieldT <= 0 && !shielded(victim, cell)) {
			killCar(s, victim, !car.isBot, car.id);
		} else if (!inside) {
			// Snapping the attacker is not spite: it can't claim this cell, so its own ring would
			// keep a one-cell hole, the fill would leak and the loop would die anyway — invisibly.
			// At home there is no ring at stake, so the shield simply holds.
			const lost = car.trail.length;
			clearTrail(s, car);
			mark(s);
			s.events.push({ type: 'snap', id: car.id, x: car.x, z: car.z, isPlayer: car.id === s.hero, lost });
			return true;
		}
	}

	if (inside) {
		if (car.outside) capture(s, car); // returned home with a live trail -> capture
		car.outside = false;
		return false;
	}

	if (t === car.id) {
		// Crossing your OWN line CLOSES the loop instead of losing it, so a zone can be won far from
		// home. The fresh tail is spared, or leaving home would close on the first pixel. No shield
		// check: the shield guards the line against rivals, it must not block your own landing.
		const idx = car.trail.indexOf(cell);
		if (idx >= 0 && idx < car.trail.length - car.cfg.grace) {
			capture(s, car, idx);
			return true;
		}
	}
	if (s.trail[cell] === 0) {
		s.trail[cell] = car.id;
		car.trail.push(cell);
		s.trailDirty.push(cell);
		if (s.record) s.netAdd.push((car.id << 16) | cell);
	}
	car.outside = true;
	return false;
}

/** The grid only sees whole cells, but one step at full throttle covers more than one. Walking the
 *  segment sub-cell keeps consecutive trail cells touching, which the border flood in capture()
 *  needs: it is 4-connected, so a single skipped cell is a hole it leaks through and the loop dies
 *  with no feedback at all. Measured (scripts/bolides-gap.mjs): on a due-east straight at full
 *  throttle 24 % of the links skipped a cell, against 0 % at cruise — which is why only the player
 *  ever saw it. A diagonal link is fine: an 8-connected wall still blocks a 4-connected fill. */
function updateGrid(s: GameState, car: Car): void {
	const dx = car.x - car.px, dz = car.z - car.pz;
	const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (CELL * 0.5)));
	let last = -1;
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		const cell = cellAt(car.px + dx * t, car.pz + dz * t);
		if (cell === last) continue;
		last = cell;
		if (visitCell(s, car, cell)) return;
	}
}

/* ---------- bots ---------- */

/** Nearest enemy trail cell within range, or null. Trails are short so this stays cheap. */
function nearestEnemyTrail(s: GameState, car: Car): { x: number; z: number } | null {
	let best: { x: number; z: number } | null = null;
	let bestD = car.cfg.botAggroRange * car.cfg.botAggroRange;
	for (const other of s.cars) {
		if (other.id === car.id || !other.alive || other.trail.length === 0) continue;
		for (const cell of other.trail) {
			const x = cellCenterX(cell), z = cellCenterZ(cell);
			const d = (x - car.x) ** 2 + (z - car.z) ** 2;
			if (d < bestD) { bestD = d; best = { x, z }; }
		}
	}
	return best;
}

function steerTo(car: Car, tx: number, tz: number): number {
	const desired = Math.atan2(tz - car.z, tx - car.x);
	return Math.max(-1, Math.min(1, angleDiff(desired, car.heading) / 0.5));
}

/** Exported so a balance sweep can drive the car under test with the exact rival policy. */
export function botSteer(s: GameState, car: Car, dt: number): number {
	const b = car.bot;
	const home = centroid(s, car.id);
	const diff = DIFFS[s.diff] ?? DIFFS[1];

	// Peel away from a wall we're about to hit: scraping it is survivable but wastes the run.
	const ahead = 6;
	const nx = car.x + Math.cos(car.heading) * ahead;
	const nz = car.z + Math.sin(car.heading) * ahead;
	const m = car.cfg.wallMargin;
	if (nx < -HALF + m || nx > HALF - m || nz < -HALF + m || nz > HALF - m) {
		return steerTo(car, home.x, home.z);
	}

	if (!car.outside) {
		// Inside our territory: head outward to start a fresh excursion.
		b.phase = 'in';
		const outward = Math.atan2(car.z - home.z, car.x - home.x);
		if (s.counts[car.id] < 4) return steerTo(car, 0, 0); // just respawned & tiny -> aim to centre
		return Math.max(-1, Math.min(1, angleDiff(outward, car.heading) / 0.5));
	}

	// Outside: opportunistic cut, otherwise arc out then curve home.
	b.aggroTimer -= dt;
	if (b.aggroTimer <= 0) {
		b.aggroTimer = 0.25;
		if (s.rng() < diff.aggro * 0.25) {
			const prey = nearestEnemyTrail(s, car);
			if (prey) return steerTo(car, prey.x, prey.z);
		}
	}
	if (b.phase !== 'return') {
		if (b.phase === 'in') {
			b.phase = 'out';
			b.turnDir = s.rng() < 0.5 ? -1 : 1;
			b.budget = car.cfg.botOutMin + s.rng() * (diff.outMax - car.cfg.botOutMin);
		}
		b.budget -= car.speed * dt;
		if (b.budget <= 0) b.phase = 'return';
		return b.turnDir * car.cfg.botArc; // gentle constant arc traces a loop
	}
	return steerTo(car, home.x, home.z); // curve back to close the loop
}

/* ---------- main step ---------- */

/** Advance the whole simulation by one fixed step. `playerSteer`/`playerThrottle` in [-1, 1].
 *  Bots cruise (throttle 0) and only steer. Dying never ends a run — it costs a respawn delay;
 *  the run ends when someone owns more than `CFG.winPct` of the arena.
 *  `drive`/`gas` swap the bot policy — a balance sweep uses them, the game never passes them. */
export function stepGame(
	s: GameState, playerSteer: number, playerThrottle: number, dt: number,
	drive: (s: GameState, car: Car, dt: number) => number = botSteer,
	gas: (s: GameState, car: Car, dt: number) => number = () => 0,
): void {
	if (s.over) return;
	s.clock += dt;
	for (const car of s.cars) {
		if (!car.alive) {
			if (s.clock >= car.respawnAt) respawn(s, car);
			continue;
		}
		if (car.gripT > 0) car.gripT = Math.max(0, car.gripT - dt);
		if (car.shieldT > 0) car.shieldT = Math.max(0, car.shieldT - dt);
		if (car.zoneT > 0) car.zoneT = Math.max(0, car.zoneT - dt);
		// The surface under the car sets how hard it is to break traction (see stepCar).
		const owner = s.owner[cellAt(car.x, car.z)];
		const painted = owner !== 0;
		// Tarred rival paint. Read off the OWNER of the ground, so the effect follows the territory
		// as it is won and lost — nothing has to be stamped on the cells.
		const host = owner !== 0 && owner !== car.id ? s.cars[owner - 1] : undefined;
		const drag = host && host.zoneT > 0 ? ITEM.tar : 1;
		if (car.remote) {
			stepGhost(car, dt); // someone else's car: dead-reckon between packets
		} else if (car.id === s.hero) {
			stepCar(car, playerSteer, playerThrottle, dt, painted, drag);
		} else {
			stepCar(car, drive(s, car, dt), gas(s, car, dt), dt, painted, drag);
		}
		slideWalls(car, dt);
		updateGrid(s, car);
	}
	if (s.items.length) stepItems(s);
	const target = (TOTAL * CFG.winPct) / 100;
	for (let id = 1; id <= CAR_COUNT; id++) {
		if (s.counts[id] > target) finish(s, id, false);
	}
	if (!s.over && s.clock >= CFG.timeLimit) {
		let lead = 1;
		for (let id = 2; id <= CAR_COUNT; id++) if (s.counts[id] > s.counts[lead]) lead = id;
		finish(s, lead, true);
	}
}

function finish(s: GameState, id: number, byTime: boolean): void {
	if (s.over) return;
	s.over = true;
	s.winner = id;
	s.overByTime = byTime;
	s.events.push({ type: 'win', id, byTime });
}

/** Percentage of the arena a car controls (0..100). */
export const pct = (s: GameState, id: number) => (s.counts[id] / TOTAL) * 100;

/* ---------- online (transport lives in net.ts) ----------
   The grid is 40 000 cells, far too big to broadcast, so the host never sends it. Instead
   every client keeps its own copy and the host sends only what it cannot derive: the poses
   of the cars it drives, the trail cells that were claimed, and the handful of discrete
   events (capture / snap / kill / respawn). Those replay identically on every client because
   they all built the same arena from the same seed, so the grids stay in step. Territory
   counts ride along anyway — they are the score, and must never be a guess. */

const r2 = (v: number) => Math.round(v * 100) / 100;

/** One car's pose as its own driver sees it. Short on purpose: this flies 20x/s. */
export interface NetPose { id: number; x: number; z: number; h: number; vh: number; sp: number; f: number }

/** What the host tells everyone happened to the grid. Anything else is derived locally. */
export type NetEvent =
	| { k: 'cap'; id: number; i: number } // i = where the ring starts, see the capture event
	| { k: 'snap'; id: number; x: number; z: number }
	| { k: 'kill'; id: number; x: number; z: number; by: number }
	| { k: 'rsp'; id: number };

/** One host tick. `a` packs trail cells as (carId << 16) | cell — a cell index fits in 16 bits. */
export interface SimMsg { t: number; p: NetPose[]; a: number[]; e: NetEvent[]; n: number[]; w: number; wt: number }

export const readPose = (car: Car): NetPose => ({
	id: car.id, x: r2(car.x), z: r2(car.z), h: r2(car.heading), vh: r2(car.vh), sp: r2(car.speed),
	f: (car.drifting ? 1 : 0) | (car.scraping ? 2 : 0),
});

/** Adopt a pose reported by a remote driver. Only the target moves — `stepGhost` eases onto it. */
export function setRemotePose(s: GameState, p: NetPose): void {
	const car = s.cars[p.id - 1];
	if (!car || !car.remote || !car.alive) return;
	car.netX = p.x; car.netZ = p.z; car.netH = p.h;
	car.vh = p.vh; car.speed = p.sp;
	car.drifting = (p.f & 1) !== 0; car.scraping = (p.f & 2) !== 0;
}

/** Host side, every frame: keep the grid events that the guests can't derive. `events` is
 *  cleared each frame but we only broadcast 20x/s, so they have to pile up in `out`. */
export function collectEvents(s: GameState, out: NetEvent[]): void {
	let by = 0; // a 'kill' event always immediately precedes its victim's 'death'
	for (const ev of s.events) {
		if (ev.type === 'kill') by = ev.killer;
		else if (ev.type === 'death') { out.push({ k: 'kill', id: ev.id, x: r2(ev.x), z: r2(ev.z), by }); by = 0; }
		else if (ev.type === 'capture') out.push({ k: 'cap', id: ev.id, i: ev.from });
		else if (ev.type === 'snap') out.push({ k: 'snap', id: ev.id, x: r2(ev.x), z: r2(ev.z) });
		else if (ev.type === 'respawn') out.push({ k: 'rsp', id: ev.id });
	}
}

/** Host side, at send rate: package the tick and empty both pending buffers. */
export function buildSim(s: GameState, pending: NetEvent[]): SimMsg {
	const msg: SimMsg = {
		t: r2(s.clock),
		p: s.cars.filter((c) => !c.remote && c.alive).map(readPose),
		a: s.netAdd.slice(),
		e: pending.slice(),
		n: s.counts.slice(),
		w: s.winner,
		wt: s.overByTime ? 1 : 0,
	};
	s.netAdd.length = 0;
	pending.length = 0;
	return msg;
}

function applyEvent(s: GameState, ev: NetEvent): void {
	const car = s.cars[ev.id - 1];
	if (!car) return;
	const isPlayer = ev.id === s.hero;
	if (ev.k === 'cap') {
		capture(s, car, ev.i);
	} else if (ev.k === 'snap') {
		const lost = car.trail.length;
		clearTrail(s, car);
		s.events.push({ type: 'snap', id: ev.id, x: ev.x, z: ev.z, isPlayer, lost });
	} else if (ev.k === 'kill') {
		clearTrail(s, car);
		car.alive = false; car.drifting = false; car.scraping = false;
		car.respawnAt = s.clock + (car.isBot ? CFG.respawn : CFG.respawnPlayer); // for the countdown only
		if (ev.by) s.events.push({ type: 'kill', killer: ev.by, victim: ev.id, x: ev.x, z: ev.z });
		s.events.push({ type: 'death', id: ev.id, x: ev.x, z: ev.z, isPlayer });
	} else {
		makeHome(s, car, START_POS[ev.id - 1][0], START_POS[ev.id - 1][1]);
		s.captureFlag = true;
		s.events.push({ type: 'respawn', id: ev.id, x: car.x, z: car.z });
	}
}

/** Guest side: fold one host tick into the local state. Our own car is skipped — we drive it.
 *  The add stream carries a 0 wherever an event fired, so both replay in the host's order. */
export function applySim(s: GameState, m: SimMsg): void {
	s.clock = m.t;
	for (const p of m.p) if (p.id !== s.hero) setRemotePose(s, p);
	let next = 0;
	for (const packed of m.a) {
		if (packed === 0) {
			if (next < m.e.length) applyEvent(s, m.e[next++]);
			continue;
		}
		const cell = packed & 0xffff;
		const id = packed >>> 16;
		if (s.trail[cell] !== 0) continue;
		s.trail[cell] = id;
		s.cars[id - 1]?.trail.push(cell);
		s.trailDirty.push(cell);
	}
	for (; next < m.e.length; next++) applyEvent(s, m.e[next]);
	// The host's tally wins outright: a stray cell would show up as a wrong score otherwise.
	for (let i = 0; i < m.n.length; i++) s.counts[i] = m.n[i];
	if (m.w && !s.over) {
		s.over = true; s.winner = m.w; s.overByTime = m.wt === 1;
		s.events.push({ type: 'win', id: m.w, byTime: m.wt === 1 });
	}
}

/** Guest side step: we own our car and nothing else. No grid work — the host rules on trails,
 *  captures and kills, and `applySim` brings its verdict back. */
export function stepGuest(s: GameState, steer: number, throttle: number, dt: number): void {
	if (s.over) return;
	for (const car of s.cars) {
		if (!car.alive) continue;
		if (car.id === s.hero) {
			stepCar(car, steer, throttle, dt, s.owner[cellAt(car.x, car.z)] !== 0);
			slideWalls(car, dt);
		}
		else stepGhost(car, dt);
	}
}
