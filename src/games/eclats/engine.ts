// Éclats engine — « Glisse et explose ». Pure, no DOM.
// A swipe slides every block to the wall (2048, no merging). Three or more of a colour touching by
// their sides explode; four or more fuse instead into one gem of that colour, a rank up (gem →
// charged → jewel → crown). A charged gem that explodes releases its power: a 3×3 blast, a 5×5
// one, or for the crown every gem of its colour. A 2×2 square also sends a comet to the nearest
// chest. After each wave everything slides again the same way. Once nothing explodes, the entry
// edge (opposite the swipe) refills from the arrival stream and one gem drops at the centre; if
// they make a group, the cascade goes on. Chests slide like blocks and open when an explosion
// touches them. Every gem destroyed fills Bijou's gauge; once it is full he can breathe three
// fireballs on the board, a 3×3 blast each, chests first, and a full board is not lost while he can.
// A level may limit the swipes: run out before the last chest and it is lost (unless Bijou can
// still breathe); `revive` gives a lost level more swipes and a full gauge.
// A night level (cfg.night) has Perle's breath instead of Bijou's: half the gems of each colour fuse into the
// other half, a rank up. Frozen chests (cfg.frostChests) do not slide, and an explosion only thaws them: it
// takes another to open one, and a third if it is locked.
//
// play() returns a timeline of steps, each with a snapshot of the board after it, so the screen can
// animate a move one step at a time while the engine stays a plain function.

import { mulberry32 } from '../prng';

export const N = 7;
export type Dir = 'up' | 'right' | 'down' | 'left';
export const DIRS: Dir[] = ['up', 'right', 'down', 'left'];
export type Kind = 'gem' | 'chest' | 'rock';

/** Gem ranks: 1 gem, 2 charged, 3 jewel, 4 crown. */
export const MAX_RANK = 4;
/** A group this big fuses into one gem a rank up; LEAP_AT and more, two ranks up. */
export const FUSE_AT = 4;
export const LEAP_AT = 5;
/** Gems to destroy to fill Bijou's gauge: the bot fills it near the end of a level, in 83 % of them (a player taking more swipes, sooner). */
export const FIRE_FULL = 80;
/** Fireballs in one breath, each a 3×3 blast. */
export const FIREBALLS = 3;

export interface Block {
	id: number;
	kind: Kind;
	color: number; // gems only
	rank: number; // gems only, 1..MAX_RANK
	ice: boolean; // a frozen gem stays put until an explosion beside it thaws it
	lock: boolean; // a locked chest takes two explosions
}

export interface EclatsCfg {
	seed: number;
	fifth: number; // share of gems in the fifth colour (0 = four colours)
	goal: number; // chests to open (0 = endless, scored in points)
	chests: number; // chests on the board at the start
	locked: number; // how many of them are locked
	chestEvery: number; // every this many edge arrivals, a chest (0 = none): announced in the preview
	rocks: number; // fixed rocks at the start
	ice: number; // frozen gems at the start
	fill: number; // share of the board filled at the start
	limit?: number; // swipes allowed to open the chests (none when absent or 0)
	layout?: string; // a hand-made starting board instead of the random one (LAYOUT_CODES, 49 cells by rows)
	fire?: number; // Bijou's gauge at the start
	night?: boolean; // a night level: Perle's breath instead of Bijou's fireballs
	frostChests?: boolean; // every chest comes frozen: one explosion thaws it, the next opens it
}

export type Status = 'playing' | 'won' | 'lost';

export interface State {
	cfg: EclatsCfg;
	cells: (Block | null)[];
	nextId: number;
	moves: number;
	arrivals: number; // blocks dealt from the edge stream so far
	centred: number; // gems dropped at the centre so far
	opened: number;
	score: number;
	fire: number; // Bijou's gauge: gems destroyed since his last breath, up to FIRE_FULL
	limit: number; // swipes allowed, 0 = no limit; a revive raises it
	status: Status;
}

export interface Popped {
	id: number;
	cell: number;
	kind: Kind;
	color: number;
	rank: number;
	into: number; // the cell it fused into, or -1 when it exploded
	late: boolean; // caught by a comet: the screen pops it once the comet lands
}

export interface Burst {
	t: 'burst';
	wave: number;
	groups: number[][]; // each in flood order from its leading cell
	popped: Popped[]; // everything gone in this wave
	fused: { id: number; cell: number; rank: number; color: number }[];
	releases: { cell: number; rank: number; color: number; late: boolean }[]; // charged gems that went off
	comets: { from: number; to: number }[];
	opened: number[]; // chest cells opened
	thawed: number[];
	unlocked: number[];
	points: number;
	cells: (Block | null)[];
}

export type Step =
	| { t: 'slide'; cells: (Block | null)[] }
	| Burst
	| { t: 'arrive'; ids: number[]; centre: number; cells: (Block | null)[] } // centre: the id dropped there, or -1
	| { t: 'breath'; balls: number[]; cells: (Block | null)[] } // where Bijou's fireballs land, before they do
	| { t: 'pearl'; pairs: [number, number][]; cells: (Block | null)[] }; // Perle's breath: each pair [kept, gone] fused

/* ---------- Helpers ---------- */

export const rc = (i: number): [number, number] => [Math.floor(i / N), i % N];
const at = (r: number, c: number): number => r * N + c;
const inside = (r: number, c: number): boolean => r >= 0 && r < N && c >= 0 && c < N;
const STEP: Record<Dir, [number, number]> = { up: [-1, 0], right: [0, 1], down: [1, 0], left: [0, -1] };
const NEIGH: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** Stable 32-bit mix of a seed and a counter. */
export function hash2(a: number, b: number): number {
	let x = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
	x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
	x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
	return (x ^ (x >>> 16)) >>> 0;
}

const movable = (b: Block | null): boolean => !!b && b.kind !== 'rock' && !b.ice;
const colourOf = (b: Block | null): number => (b && b.kind === 'gem' ? b.color : -1);
const snap = (s: State): (Block | null)[] => s.cells.map((b) => (b ? { ...b } : null));

/** A gem colour: one of four, or the fifth with probability `fifth`. */
const gemColour = (rng: () => number, fifth: number): number => (rng() < fifth ? 4 : Math.floor(rng() * 4));

/* ---------- The arrival streams ---------- */

export interface Arrival {
	kind: 'gem' | 'chest';
	color: number;
}

/** Endless mode climbs in announced steps: every STEP_MOVES moves, a little more of the fifth colour. */
export const STEP_MOVES = 25;
const STEP_FIFTH = 0.04;
const MAX_FIFTH = 0.3;
export const endlessStep = (s: State): number => (s.cfg.goal > 0 ? 0 : Math.floor(s.moves / STEP_MOVES));
export const fifthNow = (s: State): number => (s.cfg.goal > 0 ? s.cfg.fifth : Math.min(MAX_FIFTH, s.cfg.fifth + endlessStep(s) * STEP_FIFTH));

/** Edge arrival n of a game: the same for everyone on the same seed, whatever was played before. */
export function arrivalAt(cfg: EclatsCfg, n: number, fifth = cfg.fifth): Arrival {
	if (cfg.chestEvery && (n + 1) % cfg.chestEvery === 0) return { kind: 'chest', color: 0 };
	return { kind: 'gem', color: gemColour(mulberry32(hash2(cfg.seed, n)), fifth) };
}

/** Centre gem n: its own stream, so the preview can show it whatever the edge takes. */
export const centreAt = (cfg: EclatsCfg, n: number, fifth = cfg.fifth): number => gemColour(mulberry32(hash2(cfg.seed ^ 0x5c3e7a11, n)), fifth);

/** The next k edge arrivals, for the preview. */
export const upcoming = (s: State, k: number): Arrival[] => Array.from({ length: k }, (_, i) => arrivalAt(s.cfg, s.arrivals + i, fifthNow(s)));
export const nextCentre = (s: State): number => centreAt(s.cfg, s.centred, fifthNow(s));

/** Cells from the centre outward, ties in reading order: where the centre gem lands. */
export const CENTRE_ORDER: number[] = Array.from({ length: N * N }, (_, i) => i).sort((a, b) => {
	const m = (N - 1) / 2;
	const d = (i: number): number => (rc(i)[0] - m) ** 2 + (rc(i)[1] - m) ** 2;
	return d(a) - d(b) || a - b;
});

/* ---------- Setup ---------- */

/**
 * A hand-made board, one character a cell, by rows from the top: `.` empty, `0`-`4` a gem of that colour,
 * `a`-`e` charged (rank 2), `A`-`E` a jewel (rank 3), `v`-`z` a crown (rank 4), `C` a chest, `L` a locked
 * chest, `R` a rock.
 */
export const LAYOUT_CODES = '.01234abcdeABCDEvwxyzCLR';

function block(s: State, kind: Kind, color = 0, extra: Partial<Block> = {}): Block {
	return { id: s.nextId++, kind, color, rank: 1, ice: kind === 'chest' && !!s.cfg.frostChests, lock: false, ...extra };
}

function groupSize(s: State, i: number): number {
	const k = colourOf(s.cells[i]);
	if (k < 0) return 0;
	const seen = new Set([i]);
	const stack = [i];
	while (stack.length) {
		const [r, c] = rc(stack.pop()!);
		for (const [dr, dc] of NEIGH) {
			if (!inside(r + dr, c + dc)) continue;
			const j = at(r + dr, c + dc);
			if (!seen.has(j) && colourOf(s.cells[j]) === k) {
				seen.add(j);
				stack.push(j);
			}
		}
	}
	return seen.size;
}

export function createGame(cfg: EclatsCfg): State {
	const s: State = {
		cfg, cells: new Array(N * N).fill(null), nextId: 1, moves: 0, arrivals: 0, centred: 0, opened: 0, score: 0,
		fire: Math.min(FIRE_FULL, cfg.fire ?? 0), limit: cfg.limit ?? 0, status: 'playing',
	};
	if (cfg.layout) {
		lay(s, cfg.layout);
		return s;
	}
	const rng = mulberry32(hash2(cfg.seed, 0x51a7));
	const free = (inner: boolean): number[] =>
		s.cells.map((b, i) => (b || (inner && (rc(i)[0] % (N - 1) === 0 || rc(i)[1] % (N - 1) === 0)) ? -1 : i)).filter((i) => i >= 0);
	const place = (count: number, make: (k: number) => Block, inner: boolean): void => {
		for (let k = 0; k < count; k++) {
			const spots = free(inner);
			if (!spots.length) return;
			s.cells[spots[Math.floor(rng() * spots.length)]] = make(k);
		}
	};
	// Rocks and chests away from the walls, so a slide can bring gems on every side of them.
	place(cfg.rocks, () => block(s, 'rock'), true);
	place(cfg.chests, (k) => block(s, 'chest', 0, { lock: k < cfg.locked }), true);
	for (let i = 0; i < N * N; i++) {
		if (s.cells[i] || rng() > cfg.fill) continue;
		s.cells[i] = block(s, 'gem', gemColour(rng, cfg.fifth));
		// Nothing explodes before the first swipe.
		for (let t = 0; t < 5 && groupSize(s, i) >= 3; t++) s.cells[i]!.color = (s.cells[i]!.color + 1) % (cfg.fifth > 0 ? 5 : 4);
		if (groupSize(s, i) >= 3) s.cells[i] = null;
	}
	const gems = s.cells.map((b, i) => (b?.kind === 'gem' ? i : -1)).filter((i) => i >= 0);
	for (let k = 0; k < cfg.ice && gems.length; k++) s.cells[gems.splice(Math.floor(rng() * gems.length), 1)[0]]!.ice = true;
	return s;
}

/** Puts a hand-made board down (LAYOUT_CODES); the ids go in reading order. */
function lay(s: State, layout: string): void {
	if (layout.length !== N * N) throw new Error(`a layout has ${N * N} cells, not ${layout.length}`);
	for (let i = 0; i < N * N; i++) {
		const ch = layout[i];
		if (ch === '.') continue;
		const k = LAYOUT_CODES.indexOf(ch);
		if (k < 0) throw new Error(`unknown layout code ${ch}`);
		if (ch === 'C' || ch === 'L') s.cells[i] = block(s, 'chest', 0, { lock: ch === 'L' });
		else if (ch === 'R') s.cells[i] = block(s, 'rock');
		else s.cells[i] = block(s, 'gem', (k - 1) % 5, { rank: 1 + Math.floor((k - 1) / 5) });
	}
}

export function cloneState(s: State): State {
	return { ...s, cells: snap(s) };
}

/* ---------- Sliding ---------- */

/** The cells of each line along dir, ordered from the wall the blocks slide to. */
function lines(dir: Dir): number[][] {
	const out: number[][] = [];
	for (let k = 0; k < N; k++) {
		const line: number[] = [];
		for (let t = 0; t < N; t++) {
			if (dir === 'up') line.push(at(t, k));
			else if (dir === 'down') line.push(at(N - 1 - t, k));
			else if (dir === 'left') line.push(at(k, t));
			else line.push(at(k, N - 1 - t));
		}
		out.push(line);
	}
	return out;
}

/** Slide every movable block toward dir; rocks and frozen gems split a line. True if anything moved. */
export function slide(s: State, dir: Dir): boolean {
	let moved = false;
	for (const line of lines(dir)) {
		let write = 0;
		for (let k = 0; k < line.length; k++) {
			const b = s.cells[line[k]];
			if (!b) continue;
			if (!movable(b)) {
				write = k + 1;
				continue;
			}
			if (write !== k) {
				s.cells[line[write]] = b;
				s.cells[line[k]] = null;
				moved = true;
			}
			write++;
		}
	}
	return moved;
}

export const canSlide = (s: State, dir: Dir): boolean => slide(cloneState(s), dir);

/** The edge new blocks enter by: the one opposite the swipe, in a fixed order. */
export function entryEdge(dir: Dir): number[] {
	const k = Array.from({ length: N }, (_, i) => i);
	if (dir === 'up') return k.map((c) => at(N - 1, c));
	if (dir === 'down') return k.map((c) => at(0, c));
	if (dir === 'left') return k.map((r) => at(r, N - 1));
	return k.map((r) => at(r, 0));
}

/** Fill every empty cell of the entry edge from the stream, then drop the centre gem if asked. */
function refill(s: State, dir: Dir, centre: boolean): { ids: number[]; centre: number } {
	const ids: number[] = [];
	for (const i of entryEdge(dir)) {
		if (s.cells[i]) continue;
		const a = arrivalAt(s.cfg, s.arrivals++, fifthNow(s));
		const b = block(s, a.kind, a.color);
		s.cells[i] = b;
		ids.push(b.id);
	}
	let mid = -1;
	const spot = centre ? CENTRE_ORDER.find((i) => !s.cells[i]) : undefined;
	if (spot !== undefined) {
		const b = block(s, 'gem', centreAt(s.cfg, s.centred++, fifthNow(s)));
		s.cells[spot] = b;
		ids.push(b.id);
		mid = b.id;
	}
	return { ids, centre: mid };
}

/* ---------- Explosions ---------- */

/** Same-colour groups of 3+ (any rank), each in flood order from its most advanced cell along dir. */
export function findGroups(s: State, dir: Dir = 'down'): number[][] {
	const seen = new Uint8Array(N * N);
	const out: number[][] = [];
	const [sr, sc] = STEP[dir];
	const lead = (i: number): number => rc(i)[0] * sr + rc(i)[1] * sc;
	for (let i = 0; i < N * N; i++) {
		const k = colourOf(s.cells[i]);
		if (k < 0 || seen[i]) continue;
		const comp: number[] = [];
		const stack = [i];
		seen[i] = 1;
		while (stack.length) {
			const j = stack.pop()!;
			comp.push(j);
			const [r, c] = rc(j);
			for (const [dr, dc] of NEIGH) {
				if (!inside(r + dr, c + dc)) continue;
				const n = at(r + dr, c + dc);
				if (!seen[n] && colourOf(s.cells[n]) === k) {
					seen[n] = 1;
					stack.push(n);
				}
			}
		}
		if (comp.length < 3) continue;
		// Breadth-first from the leading cell (first in reading order on a tie), so the screen
		// can pop it outward and a fusion lands on a cell the player can predict.
		const start = comp.reduce((a, b) => (lead(b) > lead(a) || (lead(b) === lead(a) && b < a) ? b : a));
		const set = new Set(comp);
		const order = [start];
		const done = new Set([start]);
		for (let q = 0; q < order.length; q++) {
			const [r, c] = rc(order[q]);
			for (const [dr, dc] of NEIGH) {
				const n = at(r + dr, c + dc);
				if (inside(r + dr, c + dc) && set.has(n) && !done.has(n)) {
					done.add(n);
					order.push(n);
				}
			}
		}
		out.push(order);
	}
	return out;
}

/** The groups a swipe would set off by itself, before any arrival: what the screen previews. */
export function previewGroups(s: State, dir: Dir): number[][] {
	const t = cloneState(s);
	if (!slide(t, dir)) return [];
	return findGroups(t, dir);
}

/** True if the group holds a 2×2 square. */
export function hasSquare(group: number[]): boolean {
	const set = new Set(group);
	return group.some((i) => i % N < N - 1 && set.has(i + 1) && set.has(i + N) && set.has(i + N + 1));
}

/** The rank a group fuses into, or 0 when it explodes. */
export function fusedRank(group: number[], cells: (Block | null)[]): number {
	const top = Math.max(...group.map((i) => cells[i]!.rank));
	if (group.length < FUSE_AT || top >= MAX_RANK) return 0;
	return Math.min(MAX_RANK, top + (group.length >= LEAP_AT ? 2 : 1));
}

const POINTS = { chest: 100, rock: 20 };
/** A gem is worth three of the rank below it. */
export const gemPoints = (rank: number): number => 10 * 3 ** (rank - 1);

/**
 * One wave: explode or fuse every group, with everything it sets off. Null when nothing bursts.
 * `strike`: the cells Bijou's fireballs hit instead, without any group.
 */
function burst(s: State, dir: Dir, wave: number, strike?: number[]): Burst | null {
	const groups = strike ? [] : findGroups(s, dir);
	if (!groups.length && !strike) return null;
	const step: Burst = { t: 'burst', wave, groups, popped: [], fused: [], releases: [], comets: [], opened: [], thawed: [], unlocked: [], points: 0, cells: [] };

	// A big group fuses into its leading cell: that gem stays, the others fly into it.
	const born: { cell: number; rank: number }[] = [];
	const into = new Map<number, number>();
	const squares: number[] = [];
	for (const g of groups) {
		const rank = fusedRank(g, s.cells);
		if (rank) {
			born.push({ cell: g[0], rank });
			for (const i of g.slice(1)) into.set(i, g[0]);
		}
		if (hasSquare(g)) squares.push(g[0]);
	}
	const keep = new Set(born.map((b) => b.cell));

	// The groups, then every blast they set off. Whatever sits beside an explosion is "touched":
	// chests open, rocks break, ice thaws. A comet strikes once the rest has settled, so it never
	// aims at a chest this wave opens anyway.
	const hit = new Map<number, boolean>(); // cell → caught by a comet
	const touch = new Map<number, boolean>();
	const queue: number[] = [];
	let late = false;
	const add = (i: number): void => {
		if (keep.has(i) || hit.has(i) || !s.cells[i]) return;
		hit.set(i, late);
		queue.push(i);
	};
	const blast = (i: number, rad: number): void => {
		const [r, c] = rc(i);
		for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) if (inside(r + dr, c + dc)) add(at(r + dr, c + dc));
	};
	const drain = (): void => {
		while (queue.length) {
			const i = queue.shift()!;
			const b = s.cells[i]!;
			if (b.kind === 'chest' || b.kind === 'rock') continue; // a hit chest or rock is not an explosion itself
			if (b.rank >= 2 && !into.has(i)) {
				step.releases.push({ cell: i, rank: b.rank, color: b.color, late });
				if (b.rank >= MAX_RANK) {
					s.cells.forEach((o, j) => { if (o && o.kind === 'gem' && o.color === b.color) add(j); });
					blast(i, 1);
				} else blast(i, b.rank - 1);
			}
			const [r, c] = rc(i);
			for (const [dr, dc] of NEIGH) {
				if (!inside(r + dr, c + dc)) continue;
				const j = at(r + dr, c + dc);
				if (s.cells[j] && !hit.has(j) && !keep.has(j) && !touch.has(j)) touch.set(j, late);
			}
		}
	};
	for (const g of groups) for (const i of g) add(i);
	for (const i of strike ?? []) add(i);
	drain();
	// A fusion explodes too: what sits beside the gem it leaves is touched as well.
	for (const i of keep) {
		const [r, c] = rc(i);
		for (const [dr, dc] of NEIGH) {
			const j = at(r + dr, c + dc);
			if (inside(r + dr, c + dc) && s.cells[j] && !hit.has(j) && !keep.has(j) && !touch.has(j)) touch.set(j, false);
		}
	}
	late = true;
	for (const from of squares) {
		const [fr, fc] = rc(from);
		const dist = (j: number): number => Math.abs(rc(j)[0] - fr) + Math.abs(rc(j)[1] - fc);
		let to = -1;
		s.cells.forEach((o, j) => {
			if (o?.kind === 'chest' && !hit.has(j) && !touch.has(j) && (to < 0 || dist(j) < dist(to))) to = j;
		});
		if (to < 0) {
			// No chest left to aim at: the 3×3 with the most gems still standing, a flight away.
			let most = -1;
			for (let j = 0; j < N * N; j++) {
				if (dist(j) < 3) continue;
				const [r, c] = rc(j);
				let n = 0;
				for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (inside(r + dr, c + dc) && s.cells[at(r + dr, c + dc)]?.kind === 'gem' && !hit.has(at(r + dr, c + dc))) n++;
				if (n > most) { most = n; to = j; }
			}
		}
		step.comets.push({ from, to });
		blast(to, 1);
		drain();
	}

	// A chest or rock caught in a blast counts as touched; gems hit are gone.
	for (const [i, byComet] of hit) {
		const b = s.cells[i]!;
		if (b.kind === 'chest' || b.kind === 'rock') {
			if (!touch.has(i)) touch.set(i, byComet);
			continue;
		}
		step.popped.push({ id: b.id, cell: i, kind: b.kind, color: b.color, rank: b.rank, into: into.get(i) ?? -1, late: byComet });
		s.cells[i] = null;
	}
	for (const [i, byComet] of touch) {
		const b = s.cells[i];
		if (!b) continue;
		if (b.kind === 'chest') {
			// A frozen chest only thaws: the padlock and the lid wait for the next explosions.
			if (b.ice) {
				b.ice = false;
				step.thawed.push(i);
			} else if (b.lock) {
				b.lock = false;
				step.unlocked.push(i);
			} else {
				step.opened.push(i);
				step.popped.push({ id: b.id, cell: i, kind: 'chest', color: 0, rank: 1, into: -1, late: byComet });
				s.cells[i] = null;
			}
		} else if (b.kind === 'rock') {
			step.popped.push({ id: b.id, cell: i, kind: 'rock', color: 0, rank: 1, into: -1, late: byComet });
			s.cells[i] = null;
		} else if (b.ice) {
			b.ice = false;
			step.thawed.push(i);
		}
	}
	for (const b of born) {
		const g = s.cells[b.cell]!;
		s.cells[b.cell] = { ...g, rank: b.rank, ice: false };
		step.fused.push({ id: g.id, cell: b.cell, rank: b.rank, color: g.color });
	}

	s.opened += step.opened.length;
	step.points = step.popped.reduce((t, p) => t + (p.kind === 'gem' ? gemPoints(p.rank) * wave : POINTS[p.kind]), 0);
	s.score += step.points;
	step.cells = snap(s);
	return step;
}

/* ---------- A move ---------- */

/** Most refills a move can run: a safety net, the stream runs out of matches long before. */
const MAX_ROUNDS = 16;

/**
 * Swipe the board. Null when nothing moves (the swipe is refused). Otherwise the timeline: the slide,
 * every wave (burst, slide) until nothing explodes, the arrivals at the entry edge and the centre,
 * and more waves if the arrivals made a group. One centre gem per swipe, however long the cascade.
 */
export function play(s: State, dir: Dir): Step[] | null {
	if (s.status !== 'playing' || outOfMoves(s) || !slide(s, dir)) return null;
	s.moves++;
	const steps: Step[] = [{ t: 'slide', cells: snap(s) }];
	const won = (): boolean => s.cfg.goal > 0 && s.opened >= s.cfg.goal;
	let wave = 0;
	for (let round = 0; round < MAX_ROUNDS && !won(); round++) {
		let burstNow = false;
		for (let b = burst(s, dir, wave + 1); b; b = won() ? null : burst(s, dir, wave + 1)) {
			wave++;
			burstNow = true;
			steps.push(b);
			s.fire = Math.min(FIRE_FULL, s.fire + b.popped.filter((p) => p.kind === 'gem').length);
			if (won()) break; // the last chest ends the level at once
			if (slide(s, dir)) steps.push({ t: 'slide', cells: snap(s) });
		}
		if (won() || (round > 0 && !burstNow)) break;
		const a = refill(s, dir, round === 0);
		if (!a.ids.length) break;
		steps.push({ t: 'arrive', ids: a.ids, centre: a.centre, cells: snap(s) });
	}
	if (won()) s.status = 'won';
	else if ((!s.cells.some((b) => !b) || outOfMoves(s)) && !canBreathe(s)) s.status = 'lost';
	return steps;
}


/** No swipe left: the level's limit is reached. */
export const outOfMoves = (s: State): boolean => s.limit > 0 && s.moves >= s.limit;

/** Swipes left before the limit, or Infinity without one. */
export const movesLeft = (s: State): number => (s.limit > 0 ? Math.max(0, s.limit - s.moves) : Infinity);

/**
 * A lost level plays on: `more` swipes past the ones played (when it has a limit) and Bijou's gauge full,
 * so a full board can be breathed clear. False unless the level was lost.
 */
export function revive(s: State, more: number): boolean {
	if (s.status !== 'lost') return false;
	if (s.limit > 0) s.limit = Math.max(s.limit, s.moves) + more;
	s.fire = FIRE_FULL;
	s.status = 'playing';
	return true;
}

/* ---------- Bijou's breath ---------- */

/** A cell and its neighbours, the 3×3 a fireball blows up. */
function around(i: number): number[] {
	const [r, c] = rc(i);
	const out: number[] = [];
	for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (inside(r + dr, c + dc)) out.push(at(r + dr, c + dc));
	return out;
}

export const canBreathe = (s: State): boolean => s.status === 'playing' && s.fire >= FIRE_FULL;

/** Where the fireballs land: on the chests first, nearest Bijou's corner (top right), then on the 3×3 with the most gems left. */
export function fireTargets(s: State): number[] {
	const dist = (i: number): number => rc(i)[0] + (N - 1 - rc(i)[1]);
	const hit = new Set<number>();
	const balls: number[] = [];
	const take = (i: number): void => {
		balls.push(i);
		for (const j of around(i)) hit.add(j);
	};
	const chests = s.cells.map((b, i) => (b?.kind === 'chest' ? i : -1)).filter((i) => i >= 0).sort((a, b) => dist(a) - dist(b) || a - b);
	for (const i of chests) if (balls.length < FIREBALLS && !hit.has(i)) take(i);
	while (balls.length < FIREBALLS) {
		let best = 0;
		let most = -1;
		for (let i = 0; i < N * N; i++) {
			if (balls.includes(i)) continue;
			const n = around(i).filter((j) => !hit.has(j) && s.cells[j]?.kind === 'gem').length;
			if (n > most) {
				most = n;
				best = i;
			}
		}
		take(best);
	}
	return balls;
}

/**
 * The dragon breathes: the gauge empties and, by day, Bijou's three fireballs blow up a 3×3 each, opening what
 * they touch like any explosion; at night Perle fuses half the gems instead (pearlBreath). Not a swipe: nothing
 * slides, nothing arrives, the move count stays. Null unless the gauge is full.
 */
export function breathe(s: State): Step[] | null {
	if (!canBreathe(s)) return null;
	s.fire = 0;
	const steps = s.cfg.night ? pearlBreath(s) : fireballs(s);
	if (s.cfg.goal > 0 && s.opened >= s.cfg.goal) s.status = 'won';
	else if (outOfMoves(s)) s.status = 'lost';
	return steps;
}

/** Bijou's fireballs: where they land, then their one wave. */
function fireballs(s: State): Step[] {
	const balls = fireTargets(s);
	const steps: Step[] = [{ t: 'breath', balls, cells: snap(s) }];
	steps.push(burst(s, 'down', 1, balls.flatMap(around))!);
	return steps;
}

/**
 * Perle's breath, at night: the gems of each colour, frozen ones aside, pair up in reading order and fuse, the second
 * into the first, a rank up (an odd one out stays as it is). Then whatever groups that made go off, wave after wave,
 * nothing sliding. Like Bijou's fireballs, the gems it destroys feed no gauge.
 */
function pearlBreath(s: State): Step[] {
	const pairs: [number, number][] = [];
	for (let colour = 0; colour < 5; colour++) {
		const gems = s.cells.map((b, i) => (b?.kind === 'gem' && !b.ice && b.color === colour ? i : -1)).filter((i) => i >= 0);
		for (let k = 0; k + 1 < gems.length; k += 2) {
			const [keep, gone] = [gems[k], gems[k + 1]];
			const a = s.cells[keep]!;
			s.cells[keep] = { ...a, rank: Math.min(MAX_RANK, Math.max(a.rank, s.cells[gone]!.rank) + 1) };
			s.cells[gone] = null;
			pairs.push([keep, gone]);
		}
	}
	const steps: Step[] = [{ t: 'pearl', pairs, cells: snap(s) }];
	for (let wave = 1; ; wave++) {
		const b = burst(s, 'down', wave);
		if (!b) break;
		steps.push(b);
		if (s.cfg.goal > 0 && s.opened >= s.cfg.goal) break; // the last chest ends the level at once
	}
	return steps;
}

/* ---------- Reading the board ---------- */

export const countWaves = (steps: Step[]): number => steps.filter((x) => x.t === 'burst').length;
export const emptyCells = (s: State): number => s.cells.filter((b) => !b).length;
export const chestsLeft = (s: State): number => s.cells.filter((b) => b?.kind === 'chest').length;
