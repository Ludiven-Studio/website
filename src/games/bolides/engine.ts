/* =====================================================
   BOLIDES — Paper.io-with-cars, arcade territory capture.
   Pure simulation: a logic grid of cell owners, arcade car physics
   (real turning radius + a little inertia + a drift flag), trail laying,
   flood-fill capture, deadly trails, simple bots. No three.js here.
   The renderer (render3d.ts) reads this state; React (BolidesGame.tsx)
   drives the fixed-step loop.
   ===================================================== */
import { mulberry32, type Rng } from '../prng';

export const ARENA = 100; // world units, square centred on the origin (−50..+50)
export const GRID = 200; // logical cells per side
export const CELL = ARENA / GRID; // 0.5 world units per cell
export const HALF = ARENA / 2;
export const TOTAL = GRID * GRID;

// id 0 = neutral. Cars are ids 1..N. Colours are vivid so trails read at a glance.
export const PALETTE = [0x1b2028, 0x2f6bff, 0xff3b30, 0x30d158, 0xffd60a]; // neutral, blue, red, green, yellow
export const NAMES = ['', 'TOI', 'Rouge', 'Vert', 'Jaune'];
export const CAR_COUNT = 4; // 1 player + 3 bots

export const CFG = {
	speed: 19, // constant forward speed (units/s)
	turnRadius: 5.4, // tighter = more agile; sets the max turn rate with speed
	steerResp: 9, // how fast the applied turn eases toward the input (inertia)
	driftFrac: 0.6, // |turnRate| above this fraction of the max = drifting (cosmetic)
	grace: 14, // trail cells near the tail that can't kill you (avoid instant self-death)
	wallMargin: 3, // bots start turning back this far from the arena wall
	respawn: 2.4, // seconds before a dead bot comes back
	homeHalf: 9, // half-size (in cells) of a starting/respawn territory square
	botOutMin: 9, // bot excursion distance budget (world units)
	botArc: 0.55, // how hard a bot arcs while outside (steer magnitude)
	botAggroRange: 14, // how close an enemy trail must be to tempt a bot
} as const;

// Daily difficulty (diffIndex 0..2): harder = bolder, more aggressive bots = more danger.
export const DIFFS = [
	{ label: 'Facile', aggro: 0.18, outMax: 20 },
	{ label: 'Moyen', aggro: 0.35, outMax: 28 },
	{ label: 'Difficile', aggro: 0.55, outMax: 38 },
] as const;

const MAX_TURN = CFG.speed / CFG.turnRadius;
const randSeed = () => (Math.random() * 2 ** 31) >>> 0;

export interface BotState {
	phase: 'in' | 'out' | 'return';
	turnDir: number; // +1 / −1 arc direction while outside
	budget: number; // remaining excursion distance
	aggroTimer: number; // countdown gate for the next aggression check
}

export interface Car {
	id: number;
	color: number;
	isBot: boolean;
	alive: boolean;
	x: number;
	z: number;
	heading: number; // radians, 0 = +x
	px: number; // pose before the last step (render interpolation)
	pz: number;
	ph: number;
	turnRate: number; // current (eased) angular velocity
	drifting: boolean;
	outside: boolean; // currently laying a trail (out of own territory)
	trail: number[]; // ordered cell indices of the active trail
	respawnAt: number; // clock time (s) to respawn (bots)
	bot: BotState;
}

export type GameEvent =
	| { type: 'capture'; id: number; cx: number; cz: number; gain: number }
	| { type: 'kill'; killer: number; victim: number; x: number; z: number }
	| { type: 'death'; id: number; x: number; z: number; isPlayer: boolean };

export interface GameState {
	owner: Uint8Array; // cell -> owner id
	trail: Uint8Array; // cell -> car id whose active trail sits here (0 = none)
	cars: Car[];
	counts: number[]; // owned cell count per id (index 0 = neutral)
	sumC: number[]; // running sum of col per id (for centroid)
	sumR: number[];
	clock: number; // seconds since start
	seed: number; // arena/bot seed (a daily shares it so everyone faces the same setup)
	diff: number; // difficulty index into DIFFS
	rng: Rng; // seeded PRNG — never Math.random in the sim, or the daily wouldn't be shared
	events: GameEvent[]; // FX/UI to consume this frame, then clear
	trailDirty: number[]; // cells whose trail pixel changed (render repaints these)
	captureFlag: boolean; // a capture/respawn happened -> render repaints the whole territory
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
	const h = CFG.homeHalf;
	for (let r = cr - h; r <= cr + h; r++) {
		if (r < 0 || r >= GRID) continue;
		for (let c = cc - h; c <= cc + h; c++) {
			if (c < 0 || c >= GRID) continue;
			setOwner(s, r * GRID + c, car.id);
		}
	}
	car.x = cellCenterX(cr * GRID + cc);
	car.z = cellCenterZ(cr * GRID + cc);
	car.heading = Math.atan2(-car.z, -car.x); // face the arena centre
	car.px = car.x; car.pz = car.z; car.ph = car.heading;
	car.turnRate = 0;
	car.alive = true;
	car.outside = false;
	car.drifting = false;
	car.trail.length = 0;
	car.bot.phase = 'in';
	car.bot.budget = 0;
	car.bot.aggroTimer = 0;
}

const START_POS = [
	[-HALF * 0.5, -HALF * 0.5],
	[HALF * 0.5, -HALF * 0.5],
	[-HALF * 0.5, HALF * 0.5],
	[HALF * 0.5, HALF * 0.5],
];

export function createGame(seed = randSeed(), diff = 1): GameState {
	const s: GameState = {
		owner: new Uint8Array(TOTAL),
		trail: new Uint8Array(TOTAL),
		cars: [],
		counts: new Array(CAR_COUNT + 1).fill(0),
		sumC: new Array(CAR_COUNT + 1).fill(0),
		sumR: new Array(CAR_COUNT + 1).fill(0),
		clock: 0,
		seed,
		diff,
		rng: mulberry32(seed),
		events: [],
		trailDirty: [],
		captureFlag: true, // force an initial full territory paint
		scratch: new Uint8Array(TOTAL),
		stack: new Int32Array(TOTAL),
	};
	s.counts[0] = TOTAL; // every cell starts neutral; setOwner debits this as homes are claimed
	for (let i = 0; i < CAR_COUNT; i++) {
		const id = i + 1;
		const car: Car = {
			id,
			color: PALETTE[id],
			isBot: i !== 0,
			alive: true,
			x: 0, z: 0, heading: 0, px: 0, pz: 0, ph: 0, turnRate: 0,
			drifting: false, outside: false, trail: [], respawnAt: 0,
			bot: { phase: 'in', turnDir: 1, budget: 0, aggroTimer: 0 },
		};
		s.cars.push(car);
		makeHome(s, car, START_POS[i][0], START_POS[i][1]);
	}
	return s;
}

/** Full reset in place for an instant "Rejouer" (keeps the typed arrays). Re-seeds so a
 *  daily replay faces the exact same arena; pass no seed for a fresh random libre run. */
export function resetGame(s: GameState, seed = randSeed(), diff = s.diff): void {
	s.owner.fill(0);
	s.trail.fill(0);
	s.counts.fill(0);
	s.counts[0] = TOTAL;
	s.sumC.fill(0);
	s.sumR.fill(0);
	s.clock = 0;
	s.seed = seed;
	s.diff = diff;
	s.rng = mulberry32(seed);
	s.events.length = 0;
	s.trailDirty.length = 0;
	s.captureFlag = true;
	for (let i = 0; i < s.cars.length; i++) makeHome(s, s.cars[i], START_POS[i][0], START_POS[i][1]);
}

/* ---------- physics ---------- */

function stepCar(car: Car, steer: number, dt: number): void {
	car.px = car.x; car.pz = car.z; car.ph = car.heading;
	const target = steer * MAX_TURN;
	car.turnRate += (target - car.turnRate) * Math.min(1, dt * CFG.steerResp);
	car.heading += car.turnRate * dt;
	car.x += Math.cos(car.heading) * CFG.speed * dt;
	car.z += Math.sin(car.heading) * CFG.speed * dt;
	car.drifting = Math.abs(car.turnRate) > MAX_TURN * CFG.driftFrac;
}

/* ---------- death & capture ---------- */

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
	if (killer) s.events.push({ type: 'kill', killer, victim: car.id, x: car.x, z: car.z });
	s.events.push({ type: 'death', id: car.id, x: car.x, z: car.z, isPlayer: !car.isBot });
	if (car.isBot) car.respawnAt = s.clock + CFG.respawn;
	void byPlayer;
}

/** Close the loop: trail cells + everything they enclose become the car's territory. */
function capture(s: GameState, car: Car): void {
	const id = car.id;
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
	const g = centroid(s, id);
	s.events.push({ type: 'capture', id, cx: g.x, cz: g.z, gain: s.counts[id] - before });
}

function respawn(s: GameState, car: Car): void {
	// Drop the bot back near its original corner (or a random one if crowded out).
	const p = START_POS[car.id - 1];
	makeHome(s, car, p[0], p[1]);
	s.captureFlag = true;
}

/* ---------- per-step grid logic (trail, kill, capture) ---------- */

function updateGrid(s: GameState, car: Car): void {
	// Out of bounds = death (adds risk at the edges; bots avoid it, see botSteer).
	if (car.x < -HALF || car.x > HALF || car.z < -HALF || car.z > HALF) {
		killCar(s, car, false, 0);
		return;
	}
	const cell = cellAt(car.x, car.z);
	const inside = s.owner[cell] === car.id;

	if (inside) {
		if (car.outside) capture(s, car); // returned home with a live trail -> capture
		car.outside = false;
		return;
	}

	// Outside own territory: collisions first, then lay trail.
	const t = s.trail[cell];
	if (t !== 0 && t !== car.id) {
		const victim = s.cars[t - 1];
		killCar(s, victim, !car.isBot, car.id); // cut an enemy trail
	} else if (t === car.id) {
		// self-crossing dies, except on the fresh tail (grace) right after leaving.
		const idx = car.trail.indexOf(cell);
		if (idx >= 0 && idx < car.trail.length - CFG.grace) {
			killCar(s, car, false, 0);
			return;
		}
	}
	if (s.trail[cell] === 0) {
		s.trail[cell] = car.id;
		car.trail.push(cell);
		s.trailDirty.push(cell);
	}
	car.outside = true;
}

/* ---------- bots ---------- */

/** Nearest enemy trail cell within range, or null. Trails are short so this stays cheap. */
function nearestEnemyTrail(s: GameState, car: Car): { x: number; z: number } | null {
	let best: { x: number; z: number } | null = null;
	let bestD = CFG.botAggroRange * CFG.botAggroRange;
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

function botSteer(s: GameState, car: Car, dt: number): number {
	const b = car.bot;
	const home = centroid(s, car.id);
	const diff = DIFFS[s.diff] ?? DIFFS[1];

	// Turn away from a wall we're about to hit, whatever the current plan.
	const ahead = 6;
	const nx = car.x + Math.cos(car.heading) * ahead;
	const nz = car.z + Math.sin(car.heading) * ahead;
	const m = CFG.wallMargin;
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
			b.budget = CFG.botOutMin + s.rng() * (diff.outMax - CFG.botOutMin);
		}
		b.budget -= CFG.speed * dt;
		if (b.budget <= 0) b.phase = 'return';
		return b.turnDir * CFG.botArc; // gentle constant arc traces a loop
	}
	return steerTo(car, home.x, home.z); // curve back to close the loop
}

/* ---------- main step ---------- */

/** Advance the whole simulation by one fixed step. `playerSteer` in [-1, 1]. */
export function stepGame(s: GameState, playerSteer: number, dt: number): void {
	s.clock += dt;
	for (const car of s.cars) {
		if (!car.alive) {
			if (car.isBot && s.clock >= car.respawnAt) respawn(s, car);
			continue;
		}
		const steer = car.isBot ? botSteer(s, car, dt) : playerSteer;
		stepCar(car, steer, dt);
		updateGrid(s, car);
	}
}

/** Percentage of the arena a car controls (0..100). */
export const pct = (s: GameState, id: number) => (s.counts[id] / TOTAL) * 100;
