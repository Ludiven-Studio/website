// Éclats engine — « Glisse et explose ». Pure, no DOM.
// A swipe slides every block to the wall (2048, no merging). Three or more of a colour touching by
// their sides explode; in a fixed order the specials appear and everything slides again the same
// way, wave after wave. Once nothing explodes, the entry edge (opposite the swipe) refills from the
// arrival stream, and if the arrivals make a group, the cascade goes on. Chests slide like blocks
// and open when an explosion touches them.
//
// play() returns a timeline of steps, each with a snapshot of the board after it, so the screen can
// animate a move one step at a time while the engine stays a plain function.

import { mulberry32 } from '../prng';

export const N = 6;
export type Dir = 'up' | 'right' | 'down' | 'left';
export const DIRS: Dir[] = ['up', 'right', 'down', 'left'];
export type Kind = 'gem' | 'bomb' | 'star' | 'chest' | 'rock';

export interface Block {
	id: number;
	kind: Kind;
	color: number; // gems and stars only
	ice: boolean; // a frozen gem stays put until an explosion beside it thaws it
	lock: boolean; // a locked chest takes two explosions
}

export interface EclatsCfg {
	seed: number;
	fifth: number; // share of gems in the fifth colour (0 = four colours)
	goal: number; // chests to open (0 = endless, scored in points)
	chests: number; // chests on the board at the start
	locked: number; // how many of them are locked
	chestEvery: number; // every this many arrivals, a chest (0 = none): announced in the preview
	rocks: number; // fixed rocks at the start
	ice: number; // frozen gems at the start
	fill: number; // share of the board filled at the start
	bombAt: number; // group size that leaves a bomb
	starAt: number; // group size that leaves a star (0 = never)
}

export type Status = 'playing' | 'won' | 'lost';

export interface State {
	cfg: EclatsCfg;
	cells: (Block | null)[];
	nextId: number;
	moves: number;
	arrivals: number; // blocks dealt from the stream so far
	opened: number;
	score: number;
	status: Status;
}

export interface Popped {
	id: number;
	cell: number;
	kind: Kind;
	color: number;
}

export interface Burst {
	t: 'burst';
	wave: number;
	groups: number[][]; // each in flood order from its leading cell
	popped: Popped[]; // everything gone in this wave
	opened: number[]; // chest cells opened
	blasts: number[]; // bomb cells that went off
	stars: number[]; // star cells that went off
	thawed: number[];
	unlocked: number[];
	specials: { id: number; cell: number; kind: 'bomb' | 'star' }[];
	points: number;
	cells: (Block | null)[];
}

export type Step = { t: 'slide'; cells: (Block | null)[] } | Burst | { t: 'arrive'; ids: number[]; cells: (Block | null)[] };

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
const colourOf = (b: Block | null): number => (b && (b.kind === 'gem' || b.kind === 'star') ? b.color : -1);
const snap = (s: State): (Block | null)[] => s.cells.map((b) => (b ? { ...b } : null));

/** A gem colour: one of four, or the fifth with probability `fifth`. */
const gemColour = (rng: () => number, fifth: number): number => (rng() < fifth ? 4 : Math.floor(rng() * 4));

/* ---------- The arrival stream ---------- */

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

/** Arrival n of a game: the same for everyone on the same seed, whatever was played before. */
export function arrivalAt(cfg: EclatsCfg, n: number, fifth = cfg.fifth): Arrival {
	if (cfg.chestEvery && (n + 1) % cfg.chestEvery === 0) return { kind: 'chest', color: 0 };
	return { kind: 'gem', color: gemColour(mulberry32(hash2(cfg.seed, n)), fifth) };
}

/** The next k arrivals, for the preview. */
export const upcoming = (s: State, k: number): Arrival[] => Array.from({ length: k }, (_, i) => arrivalAt(s.cfg, s.arrivals + i, fifthNow(s)));

/* ---------- Setup ---------- */

function block(s: State, kind: Kind, color = 0, extra: Partial<Block> = {}): Block {
	return { id: s.nextId++, kind, color, ice: false, lock: false, ...extra };
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
	const s: State = { cfg, cells: new Array(N * N).fill(null), nextId: 1, moves: 0, arrivals: 0, opened: 0, score: 0, status: 'playing' };
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

/** Fill every empty cell of the entry edge from the stream. */
function refill(s: State, dir: Dir): number[] {
	const ids: number[] = [];
	for (const i of entryEdge(dir)) {
		if (s.cells[i]) continue;
		const a = arrivalAt(s.cfg, s.arrivals++, fifthNow(s));
		const b = block(s, a.kind, a.color);
		s.cells[i] = b;
		ids.push(b.id);
	}
	return ids;
}

/* ---------- Explosions ---------- */

/** Same-colour groups of 3+, each in flood order from its most advanced cell along dir. */
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
		// can pop it outward and the special lands on a cell the player can predict.
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

const POINTS = { gem: 10, bomb: 50, star: 120, chest: 100, rock: 20 };

/** One wave: explode every group and what it sets off, then the specials appear. Null when nothing bursts. */
function burst(s: State, dir: Dir, wave: number): Burst | null {
	const groups = findGroups(s, dir);
	if (!groups.length) return null;
	const step: Burst = { t: 'burst', wave, groups, popped: [], opened: [], blasts: [], stars: [], thawed: [], unlocked: [], specials: [], points: 0, cells: [] };

	// A big group leaves a special on its leading cell: that gem does not pop.
	const born: { cell: number; kind: 'bomb' | 'star'; color: number }[] = [];
	for (const g of groups) {
		const kind = s.cfg.starAt && g.length >= s.cfg.starAt ? 'star' : g.length >= s.cfg.bombAt ? 'bomb' : null;
		if (kind) born.push({ cell: g[0], kind, color: colourOf(s.cells[g[0]]) });
	}
	const keep = new Set(born.map((b) => b.cell));

	// The groups, then every bomb or star they touch and everything those reach. Whatever sits
	// beside an explosion is "touched": chests open, rocks break, ice thaws.
	const hit = new Set<number>();
	const touch = new Set<number>();
	const queue: number[] = [];
	const add = (i: number): void => {
		if (keep.has(i) || hit.has(i) || !s.cells[i]) return;
		hit.add(i);
		queue.push(i);
	};
	for (const g of groups) for (const i of g) add(i);
	while (queue.length) {
		const i = queue.shift()!;
		const b = s.cells[i]!;
		const [r, c] = rc(i);
		if (b.kind === 'bomb') {
			step.blasts.push(i);
			for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (inside(r + dr, c + dc)) add(at(r + dr, c + dc));
		} else if (b.kind === 'star') {
			step.stars.push(i);
			s.cells.forEach((o, j) => { if (o && o.kind === 'gem' && o.color === b.color) add(j); });
		}
		if (b.kind === 'chest' || b.kind === 'rock') continue; // a hit chest or rock is not an explosion itself
		for (const [dr, dc] of NEIGH) {
			if (!inside(r + dr, c + dc)) continue;
			const j = at(r + dr, c + dc);
			const o = s.cells[j];
			if (!o || hit.has(j) || keep.has(j)) continue;
			if (o.kind === 'bomb' || o.kind === 'star') add(j);
			else touch.add(j);
		}
	}

	// A chest or rock caught in a blast counts as touched; gems, bombs and stars hit are gone.
	for (const i of hit) {
		const b = s.cells[i]!;
		if (b.kind === 'chest' || b.kind === 'rock') {
			touch.add(i);
			continue;
		}
		step.popped.push({ id: b.id, cell: i, kind: b.kind, color: b.color });
		s.cells[i] = null;
	}
	for (const i of touch) {
		const b = s.cells[i];
		if (!b) continue;
		if (b.kind === 'chest') {
			if (b.lock) {
				b.lock = false;
				step.unlocked.push(i);
			} else {
				step.opened.push(i);
				step.popped.push({ id: b.id, cell: i, kind: 'chest', color: 0 });
				s.cells[i] = null;
			}
		} else if (b.kind === 'rock') {
			step.popped.push({ id: b.id, cell: i, kind: 'rock', color: 0 });
			s.cells[i] = null;
		} else if (b.ice) {
			b.ice = false;
			step.thawed.push(i);
		}
	}
	for (const b of born) {
		const old = s.cells[b.cell]!;
		s.cells[b.cell] = { ...old, kind: b.kind, color: b.color, ice: false };
		step.specials.push({ id: old.id, cell: b.cell, kind: b.kind });
	}

	s.opened += step.opened.length;
	step.points = step.popped.reduce((t, p) => t + (p.kind === 'gem' ? POINTS.gem * wave : POINTS[p.kind]), 0);
	s.score += step.points;
	step.cells = snap(s);
	return step;
}

/* ---------- A move ---------- */

/** Most refills a move can run: a safety net, the stream runs out of matches long before. */
const MAX_ROUNDS = 16;

/**
 * Swipe the board. Null when nothing moves (the swipe is refused). Otherwise the timeline: the slide,
 * every wave (burst, slide) until nothing explodes, the arrivals at the entry edge, and more waves
 * if the arrivals made a group.
 */
export function play(s: State, dir: Dir): Step[] | null {
	if (s.status !== 'playing' || !slide(s, dir)) return null;
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
			if (won()) break; // the last chest ends the level at once
			if (slide(s, dir)) steps.push({ t: 'slide', cells: snap(s) });
		}
		if (won() || (round > 0 && !burstNow)) break;
		const ids = refill(s, dir);
		if (!ids.length) break;
		steps.push({ t: 'arrive', ids, cells: snap(s) });
	}
	if (won()) s.status = 'won';
	else if (!s.cells.some((b) => !b)) s.status = 'lost';
	return steps;
}

/* ---------- Reading the board ---------- */

export const countWaves = (steps: Step[]): number => steps.filter((x) => x.t === 'burst').length;
export const emptyCells = (s: State): number => s.cells.filter((b) => !b).length;
export const chestsLeft = (s: State): number => s.cells.filter((b) => b?.kind === 'chest').length;
