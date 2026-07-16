/**
 * COCOTTE MINEUSE — pure engine (no UI). Side-view digger: step-based 4-dir movement on a
 * hidden grid — one cell per input, the hen stays put when idle (the component repeats the
 * input while a key is held). Gravity pulls stones/ores (never sand, never the player) and
 * runs every tick regardless of whether the hen moved. A RESTING stone/ore directly above
 * the hen is held up by her (won't start falling until she leaves the cell below); a stone
 * already in free-fall ignores her and crushes on contact, while a falling ore is collected.
 * Unsupported cells wobble 2 ticks (warning) then fall 1 cell/tick. Oil lamp drains in real
 * time and bounds the run. 2-ingredient crafting turns ores into tools or jewels.
 * NOTE: step functions mutate state internals (rows / Map / Set) — the component keeps the
 * state in a ref (snake pattern); never rely on structural sharing.
 */

import { mulberry32 } from '../prng';

export const COLS = 13;
export const BAND_H = 16; // rows generated per band
export const WOBBLE_TICKS = 2;

const MIN_X = 1, MAX_X = COLS - 2; // interior (cols 0 and 12 are bedrock walls)
const GRAVITY_WINDOW = 30; // rows simulated around the player
const LOOKAHEAD = 40; // rows kept generated below the player
const SURFACE_ROWS = 3; // open-air rows at the top of band 0
const TORCH_REFILL = 0.25;
const ETAI_RANGE = 3;
const DETECTOR_MS = 10_000;

export const Cell = {
	Empty: 0, Sand: 1, Stone: 2, Bedrock: 3,
	Charbon: 4, Silex: 5, Cuivre: 6, Fer: 7, Or: 8, Cristal: 9, Diamant: 10,
} as const;
export type CellV = (typeof Cell)[keyof typeof Cell];

export type Dir = 'up' | 'down' | 'left' | 'right';
export type OreId = 'charbon' | 'silex' | 'cuivre' | 'fer' | 'or' | 'cristal' | 'diamant';
export type ToolId = 'torche' | 'bombe' | 'etai' | 'detecteur';
export type JewelId = 'bague' | 'collier' | 'couronne';
export type ItemId = OreId | ToolId | JewelId;

export interface MineDiff {
	label: string;
	tickMs: number; // movement + gravity cadence
	lampDrainPerSec: number; // lamp is 0..1
	workbenchDrainFactor: number; // lamp drain multiplier while crafting
	stoneDensity: number; // per-cell stone probability
	oreRichness: number; // multiplier on ore spawn table
}

export const MINE_DIFFS: Record<string, MineDiff> = {
	facile: { label: 'Facile', tickMs: 220, lampDrainPerSec: 1 / 100, workbenchDrainFactor: 0.25, stoneDensity: 0.06, oreRichness: 1.2 },
	moyen: { label: 'Moyen', tickMs: 190, lampDrainPerSec: 1 / 80, workbenchDrainFactor: 0.25, stoneDensity: 0.09, oreRichness: 1.0 },
	difficile: { label: 'Difficile', tickMs: 165, lampDrainPerSec: 1 / 65, workbenchDrainFactor: 0.25, stoneDensity: 0.13, oreRichness: 0.9 },
};

export interface OreSpec {
	cell: CellV;
	id: OreId;
	value: number;
	minDepth: number;
	maxDepth: number;
	p: number; // base per-cell spawn probability
}

export const ORES: OreSpec[] = [
	{ cell: Cell.Charbon, id: 'charbon', value: 5, minDepth: 0, maxDepth: Infinity, p: 0.06 },
	{ cell: Cell.Silex, id: 'silex', value: 5, minDepth: 0, maxDepth: Infinity, p: 0.025 },
	{ cell: Cell.Cuivre, id: 'cuivre', value: 10, minDepth: 0, maxDepth: 30, p: 0.03 },
	{ cell: Cell.Fer, id: 'fer', value: 20, minDepth: 10, maxDepth: 60, p: 0.03 },
	{ cell: Cell.Or, id: 'or', value: 50, minDepth: 40, maxDepth: Infinity, p: 0.02 },
	{ cell: Cell.Cristal, id: 'cristal', value: 80, minDepth: 70, maxDepth: Infinity, p: 0.015 },
	{ cell: Cell.Diamant, id: 'diamant', value: 150, minDepth: 100, maxDepth: Infinity, p: 0.006 },
];

export const CELL_ORE: Partial<Record<number, OreSpec>> = Object.fromEntries(ORES.map((o) => [o.cell, o]));
export const ORE_VALUES: Record<OreId, number> = Object.fromEntries(ORES.map((o) => [o.id, o.value])) as Record<OreId, number>;

export interface Recipe {
	id: ItemId;
	ingredients: [ItemId, ItemId];
	kind: 'tool' | 'jewel';
	bonus: number; // jewel score bonus, banked at craft time
}

export const RECIPES: Recipe[] = [
	{ id: 'torche', ingredients: ['charbon', 'silex'], kind: 'tool', bonus: 0 },
	{ id: 'bombe', ingredients: ['charbon', 'fer'], kind: 'tool', bonus: 0 },
	{ id: 'etai', ingredients: ['fer', 'cuivre'], kind: 'tool', bonus: 0 },
	{ id: 'detecteur', ingredients: ['cuivre', 'cristal'], kind: 'tool', bonus: 0 },
	{ id: 'bague', ingredients: ['or', 'cristal'], kind: 'jewel', bonus: 200 },
	{ id: 'collier', ingredients: ['or', 'diamant'], kind: 'jewel', bonus: 350 },
	{ id: 'couronne', ingredients: ['bague', 'diamant'], kind: 'jewel', bonus: 600 },
];

const ALL_ITEMS: ItemId[] = [
	'charbon', 'silex', 'cuivre', 'fer', 'or', 'cristal', 'diamant',
	'torche', 'bombe', 'etai', 'detecteur', 'bague', 'collier', 'couronne',
];

export type MineStatus = 'playing' | 'over';
export type DeathCause = 'crush' | 'lamp' | 'win'; // 'win' = the couronne was forged

export interface MineState {
	seed: number;
	diff: MineDiff;
	rows: Uint8Array[]; // index = depth row; lazily extended, never pruned (13 B/row)
	bandsGenerated: number;
	player: { x: number; y: number };
	dir: Dir; // last facing (for rendering the beak); movement is per-input, not continuous
	wobbles: Map<number, number>; // cell key -> wobble ticks remaining
	falling: Set<number>; // cell keys in free-fall
	justFell: Set<number>; // keys that moved down this tick (render interpolation only)
	loose: Set<number>; // ore keys that fell into open space (render bare, no sand behind)
	propped: Set<number>; // étai-propped cells (never fall)
	lamp: number; // 0..1
	detectorMs: number; // gem-reveal time remaining
	inventory: Record<ItemId, number>;
	maxDepth: number;
	collected: number; // Σ ore values picked up
	craftBonus: number; // Σ jewel bonuses
	status: MineStatus;
	deathCause?: DeathCause;
	tick: number;
}

const DELTA: Record<Dir, { x: number; y: number }> = {
	up: { x: 0, y: -1 },
	down: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
};

export const cellKey = (x: number, y: number): number => y * COLS + x;

/* ---------- Generation ---------- */

/** Pure hash of (seed, band) — where the guaranteed dig-able vein enters the band. */
export function veinStartX(seed: number, band: number): number {
	const rng = mulberry32((seed ^ Math.imul(band, 0x85ebca6b)) >>> 0);
	return MIN_X + Math.floor(rng() * (MAX_X - MIN_X + 1));
}

/**
 * One band = pure function of (seed, band, diff) — immune to generation order.
 * A random-walk vein (never stone/bedrock, ores allowed) guarantees a 4-connected
 * dig-able path top-to-bottom; the last row carves a corridor to the next band's
 * vein entry (pure hash), so bands chain without coupling.
 */
export function generateBand(seed: number, band: number, diff: MineDiff): Uint8Array[] {
	const rng = mulberry32((seed ^ Math.imul(band, 0x9e3779b1)) >>> 0);
	const rows: Uint8Array[] = [];
	for (let r = 0; r < BAND_H; r++) {
		const row = new Uint8Array(COLS).fill(Cell.Sand);
		row[0] = Cell.Bedrock;
		row[COLS - 1] = Cell.Bedrock;
		rows.push(row);
	}

	// vein walk — protected cells stay dig-able (sand or ore)
	const prot = new Set<number>(); // local r*COLS+x keys
	let vx = veinStartX(seed, band);
	for (let r = 0; r < BAND_H; r++) {
		prot.add(r * COLS + vx);
		if (r === BAND_H - 1) break;
		const nx = Math.min(MAX_X, Math.max(MIN_X, vx + (Math.floor(rng() * 3) - 1)));
		prot.add(r * COLS + nx); // sideways step on the same row keeps the path 4-connected
		vx = nx;
	}
	const nextX = veinStartX(seed, band + 1);
	for (let x = Math.min(vx, nextX); x <= Math.max(vx, nextX); x++) prot.add((BAND_H - 1) * COLS + x);

	// bedrock blobs — off the vein, away from band boundaries
	const nBlobs = 2 + Math.floor(rng() * 3);
	for (let b = 0; b < nBlobs; b++) {
		const w = 2 + Math.floor(rng() * 2); // 2-3
		const h = 1 + Math.floor(rng() * 2); // 1-2
		const bx = MIN_X + Math.floor(rng() * (MAX_X - MIN_X - w + 2));
		const by = 2 + Math.floor(rng() * (BAND_H - 3 - h));
		let ok = true;
		for (let r = by; r < by + h && ok; r++)
			for (let x = bx; x < bx + w && ok; x++) if (prot.has(r * COLS + x)) ok = false;
		if (!ok) continue; // skip (rng draws already consumed → deterministic)
		for (let r = by; r < by + h; r++) for (let x = bx; x < bx + w; x++) rows[r][x] = Cell.Bedrock;
	}

	// stones (the danger) — anywhere off the vein, incl. directly above it
	for (let r = 0; r < BAND_H; r++)
		for (let x = MIN_X; x <= MAX_X; x++) {
			if (rows[r][x] !== Cell.Sand || prot.has(r * COLS + x)) continue;
			if (rng() < diff.stoneDensity) rows[r][x] = Cell.Stone;
		}

	// ores — depth-banded spawn table on remaining sand (vein included)
	for (let r = 0; r < BAND_H; r++) {
		const depth = band * BAND_H + r;
		for (let x = MIN_X; x <= MAX_X; x++) {
			if (rows[r][x] !== Cell.Sand) continue;
			const roll = rng();
			let acc = 0;
			for (const o of ORES) {
				if (depth < o.minDepth || depth > o.maxDepth) continue;
				acc += o.p * diff.oreRichness;
				if (roll < acc) { rows[r][x] = o.cell; break; }
			}
		}
	}

	// occasional gem pocket — a cluster of the richest ore in range, so digging into it
	// dislodges a shower that piles into pyramids (deterministic per band, off the vein)
	if (band > 0 && rng() < 0.2) {
		const cx = MIN_X + 1 + Math.floor(rng() * (MAX_X - MIN_X - 1));
		const cy = 3 + Math.floor(rng() * (BAND_H - 6));
		const cDepth = band * BAND_H + cy;
		let pick: OreSpec | null = null;
		for (const o of ORES) if (cDepth >= o.minDepth && cDepth <= o.maxDepth && o.value >= 20) pick = o;
		if (pick) {
			const rad = 1 + Math.floor(rng() * 2); // 1..2 → 3×3 or 5×5 blob
			for (let dy = -rad; dy <= rad; dy++)
				for (let dx = -rad; dx <= rad; dx++) {
					const x = cx + dx, y = cy + dy;
					if (x < MIN_X || x > MAX_X || y < 0 || y >= BAND_H) continue;
					if (prot.has(y * COLS + x)) continue; // never seal the vein
					const cur = rows[y][x];
					if (cur !== Cell.Sand && !CELL_ORE[cur]) continue; // not into stone/bedrock
					const d = band * BAND_H + y;
					if (d < pick.minDepth || d > pick.maxDepth) continue; // keep depth bounds
					if (rng() < 0.7) rows[y][x] = pick.cell;
				}
		}
	}

	// band 0: open surface where the hen starts
	if (band === 0)
		for (let r = 0; r < SURFACE_ROWS; r++)
			for (let x = MIN_X; x <= MAX_X; x++) rows[r][x] = Cell.Empty;

	return rows;
}

/** Generate bands lazily so rows exist through `throughRow` (+ margin for gravity checks). */
export function ensureRows(state: MineState, throughRow: number): void {
	while (state.rows.length <= throughRow + 2) {
		state.rows.push(...generateBand(state.seed, state.bandsGenerated, state.diff));
		state.bandsGenerated++;
	}
}

const emptyInventory = (): Record<ItemId, number> =>
	Object.fromEntries(ALL_ITEMS.map((i) => [i, 0])) as Record<ItemId, number>;

export function createMine(seed: number, diff: MineDiff): MineState {
	const state: MineState = {
		seed, diff, rows: [], bandsGenerated: 0,
		player: { x: Math.floor(COLS / 2), y: 0 },
		dir: 'down',
		wobbles: new Map(), falling: new Set(), justFell: new Set(), loose: new Set(), propped: new Set(),
		lamp: 1, detectorMs: 0, inventory: emptyInventory(),
		maxDepth: 0, collected: 0, craftBonus: 0, status: 'playing', tick: 0,
	};
	ensureRows(state, LOOKAHEAD);
	return state;
}

/* ---------- Simulation ---------- */

const clearCell = (state: MineState, x: number, y: number): void => {
	state.rows[y][x] = Cell.Empty;
	const k = cellKey(x, y);
	state.wobbles.delete(k);
	state.falling.delete(k);
	state.loose.delete(k);
	state.propped.delete(k);
};

const isGem = (c: number): boolean => CELL_ORE[c] != null;

/**
 * Where a stone/gem at (x,y) would move this tick, or null if it rests.
 * Stones (square) only drop straight down. Gems (round) also roll off another gem when a
 * side + its diagonal-down are both clear → they pile into pyramids. Bedrock walls block
 * sideways rolls. `ignoreHen` distinguishes the two cases: a RESTING cell directly above the
 * hen is held up (she blocks the drop from starting); a cell already in free-fall ignores her
 * and crushes on contact.
 */
function fallTarget(state: MineState, x: number, y: number, c: number, ignoreHen = false): { tx: number; ty: number } | null {
	if (y + 1 >= state.rows.length) return null;
	const below = state.rows[y + 1][x];
	if (below === Cell.Empty) {
		const heldByHen = !ignoreHen && state.player.x === x && state.player.y === y + 1;
		return heldByHen ? null : { tx: x, ty: y + 1 };
	}
	if (isGem(c) && isGem(below)) {
		if (state.rows[y][x - 1] === Cell.Empty && state.rows[y + 1][x - 1] === Cell.Empty) return { tx: x - 1, ty: y + 1 };
		if (state.rows[y][x + 1] === Cell.Empty && state.rows[y + 1][x + 1] === Cell.Empty) return { tx: x + 1, ty: y + 1 };
	}
	return null;
}

const collectOre = (state: MineState, cell: number): void => {
	const o = CELL_ORE[cell]!;
	state.inventory[o.id]++;
	state.collected += o.value;
};

/**
 * One grid tick. `dir` = the input this tick (null/undefined = no move — the hen stays put,
 * gravity still runs). When given: face that way, then move/dig/collect one cell. Movement is
 * per-input, not continuous; the component decides when to feed a direction (hold = each tick).
 * Gravity scans deepest→shallowest so same-tick chains work (a vacated support is seen by the
 * cell above later in the same pass) and a cell moves at most once/tick.
 */
export function stepMine(state: MineState, dir?: Dir | null): MineState {
	if (state.status !== 'playing') return state;
	ensureRows(state, state.player.y + LOOKAHEAD);
	if (dir) {
		state.dir = dir;
		const d = DELTA[dir];
		const nx = state.player.x + d.x, ny = state.player.y + d.y;
		if (ny >= 0 && nx >= 0 && nx < COLS) {
			const c = state.rows[ny][nx];
			if (c === Cell.Sand) {
				clearCell(state, nx, ny); // dig — sand never falls
				state.player = { x: nx, y: ny };
			} else if (c === Cell.Empty) {
				state.player = { x: nx, y: ny };
			} else if (CELL_ORE[c]) {
				collectOre(state, c);
				clearCell(state, nx, ny);
				state.player = { x: nx, y: ny };
			}
			// Stone / Bedrock: blocked, the hen stays put (no death)
		}
		if (state.player.y > state.maxDepth) state.maxDepth = state.player.y;
	}
	gravityPass(state);
	state.tick++;
	return state;
}

function gravityPass(state: MineState): void {
	state.justFell.clear();
	const top = Math.max(0, state.player.y - GRAVITY_WINDOW);
	const bottom = Math.min(state.rows.length - 2, state.player.y + GRAVITY_WINDOW);
	for (let y = bottom; y >= top; y--) {
		for (let x = MIN_X; x <= MAX_X; x++) {
			const c = state.rows[y][x];
			if (c !== Cell.Stone && !isGem(c)) continue;
			const k = cellKey(x, y);
			if (state.propped.has(k)) continue;
			if (state.falling.has(k)) {
				state.falling.delete(k);
				const target = fallTarget(state, x, y, c, true); // mid-fall: ignore the hen (she gets crushed)
				if (!target) continue; // landed or wedged
				const { tx, ty } = target;
				if (state.player.x === tx && state.player.y === ty) {
					// a falling stone OR gem crushes the hen (gems are mined, never caught)
					state.rows[y][x] = Cell.Empty;
					state.loose.delete(k);
					state.rows[ty][tx] = c; // buries her
					state.status = 'over';
					state.deathCause = 'crush';
					return;
				}
				state.rows[y][x] = Cell.Empty;
				state.loose.delete(k);
				state.rows[ty][tx] = c;
				const nk = cellKey(tx, ty);
				if (isGem(c)) state.loose.add(nk); // now sitting in open space
				state.justFell.add(nk);
				if (fallTarget(state, tx, ty, c, true)) state.falling.add(nk); // keep going next tick
			} else {
				const target = fallTarget(state, x, y, c); // resting: the hen holds a cell above her
				if (state.wobbles.has(k)) {
					if (!target) { state.wobbles.delete(k); continue; } // support restored
					const w = state.wobbles.get(k)! - 1;
					if (w <= 0) { state.wobbles.delete(k); state.falling.add(k); }
					else state.wobbles.set(k, w);
				} else if (target) {
					state.wobbles.set(k, WOBBLE_TICKS);
				}
			}
		}
	}
}

/** Real-time lamp drain (per frame, not per tick). Also ticks down the detector. */
export function stepLamp(state: MineState, dtMs: number, workbenchOpen = false): MineState {
	if (state.status !== 'playing') return state;
	const factor = workbenchOpen ? state.diff.workbenchDrainFactor : 1;
	state.lamp = Math.max(0, state.lamp - state.diff.lampDrainPerSec * (dtMs / 1000) * factor);
	if (state.detectorMs > 0) state.detectorMs = Math.max(0, state.detectorMs - dtMs);
	if (state.lamp <= 0) {
		state.status = 'over';
		state.deathCause = 'lamp';
	}
	return state;
}

/* ---------- Crafting & tools ---------- */

/** Consume the recipe's ingredients, add the item; jewel bonuses are banked immediately. */
export function craft(state: MineState, id: ItemId): boolean {
	if (state.status !== 'playing') return false;
	const r = RECIPES.find((x) => x.id === id);
	if (!r) return false;
	const [a, b] = r.ingredients;
	if (state.inventory[a] < 1 || state.inventory[b] < 1) return false;
	state.inventory[a]--;
	state.inventory[b]--;
	state.inventory[id]++;
	state.craftBonus += r.bonus;
	if (id === 'couronne') { state.status = 'over'; state.deathCause = 'win'; } // the run's goal
	return true;
}

/** Use a consumable tool. Returns false (nothing consumed) when it would be a no-op. */
export function useTool(state: MineState, id: ToolId): boolean {
	if (state.status !== 'playing' || state.inventory[id] < 1) return false;
	if (id === 'torche') {
		if (state.lamp >= 1) return false;
		state.lamp = Math.min(1, state.lamp + TORCH_REFILL);
	} else if (id === 'bombe') {
		for (let dy = -1; dy <= 1; dy++)
			for (let dx = -1; dx <= 1; dx++) {
				if (!dx && !dy) continue;
				const x = state.player.x + dx, y = state.player.y + dy;
				if (x < MIN_X || x > MAX_X || y < 0 || y >= state.rows.length) continue;
				const c = state.rows[y][x];
				if (c === Cell.Sand || c === Cell.Stone) clearCell(state, x, y); // ores + bedrock survive
			}
	} else if (id === 'etai') {
		let target = -1;
		for (let dy = 1; dy <= ETAI_RANGE; dy++) {
			const y = state.player.y - dy;
			if (y < 0) break;
			const c = state.rows[y][state.player.x];
			if (c === Cell.Stone) { target = y; break; }
			if (c === Cell.Bedrock) break;
		}
		if (target < 0) return false;
		const k = cellKey(state.player.x, target);
		state.propped.add(k);
		state.wobbles.delete(k);
		state.falling.delete(k);
	} else if (id === 'detecteur') {
		state.detectorMs = DETECTOR_MS;
	}
	state.inventory[id]--;
	return true;
}

/** Final score: 1 pt per meter of max depth + ore values + jewel bonuses. */
export const scoreOf = (state: MineState): number =>
	state.maxDepth + state.collected + state.craftBonus;
