/**
 * CORDES (untangle-free routing) — pure engine (no UI).
 * Join every pair of pegs with a hand-drawn rope. Ropes stay inside the frame and never
 * cross — neither each other nor themselves.
 *
 * What makes it a puzzle is the pegs nailed to the frame. An arc with both ends loose in
 * the middle never cuts the board in two, so it can always be dodged and there is nothing
 * to decide — the frame alone changes nothing, an empty square being the same space as an
 * open plane. A rope between two pegs on the edge does cut the board, and then every other
 * pair has to be on the right side of it. Those are the "walls".
 *
 * Nailed by one end only, a rope is a "spike": it cuts nothing, so it is always dodgeable,
 * but dodging costs the whole trip out to its free tip and back. Two spikes reaching in from
 * opposite edges is what makes a rope coil, and the coil is what the board is played for.
 *
 * A board is solvable by construction. Generation slices the hidden grid with the walls
 * first, drives the spikes into the slices, fills what is left with its own pairs, smooths
 * the routes into curves and keeps only their ends — the player never sees the lattice and
 * draws freehand. No solver.
 */

import type { Rng } from '../prng';

export interface Pt {
	x: number;
	y: number;
}

export interface DiffLevel {
	label: string;
	/** How many pairs of pegs. */
	ropes: number;
	/** The hidden generation grid — bigger means longer, more tangled routes. */
	cols: number;
	rows: number;
	/** How many ropes must refuse to be drawn as a straight line between their two pegs. */
	tangle: number;
	/** How many ropes are nailed to the frame at both ends — see `carve`. */
	walls: number;
	/** How many ropes are nailed to the frame by one end, tip loose inside — see `spikeSlice`. */
	spikes: number;
	/** How many ropes must be caught between two others — see `tangleDepth`. */
	nested: number;
	/** How many ropes must go the long way round a spike — see `detours`. */
	coils: number;
}

/** Frame side for a rope count. The spikes eat the middle, so the crowd needs the two spare rings. */
export const frameFor = (ropes: number): number => ropes + 2;

/**
 * How many walls a rope count can carry. A wall splits the board, and a half holding a single
 * rope is a pocket where that rope crosses nobody — measured, a wall costs more crossing than
 * it buys at every size. It survives only on the smallest board, where there is no room to
 * drive a spike in and the two halves are the whole question.
 */
export const wallsFor = (ropes: number): number => (ropes <= 3 ? 1 : 0);

/**
 * How many spikes a rope count can carry. One makes a rope go the long way round; two reaching
 * in from opposite edges is what makes it coil. Roughly half the ropes, which measures as the
 * point where the free space stops being a corridor and starts being a maze.
 */
export const spikesFor = (ropes: number): number => (ropes <= 3 ? 0 : Math.min(4, Math.round(ropes / 2)));

/**
 * How many ropes should refuse the straight line. This is a floor the deal has to clear, not
 * a maximum to chase: set past what a board of this size actually reaches, it stops being a
 * target and just spends the whole budget every time.
 */
export const tangleFor = (ropes: number): number => Math.max(2, Math.round(ropes * 0.55));

/**
 * How many ropes should be caught between two others. This is the second level of thought —
 * without it a board is a set of independent "go round that one" calls, each obvious.
 */
export const nestedFor = (ropes: number): number => Math.max(0, Math.floor((ropes - 2) / 2));

/**
 * How many ropes should be dragged off their straight line for good. This is the one the
 * player feels directly: a rope walked out and back round a spike is the only kind that
 * cannot be drawn at a glance.
 */
export const coilsFor = (ropes: number): number => spikesFor(ropes);

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', ropes: 3, cols: 5, rows: 5, tangle: 2, walls: 1, spikes: 0, nested: 0, coils: 0 },
	moyen: { label: 'Moyen', ropes: 4, cols: 6, rows: 6, tangle: 3, walls: 0, spikes: 2, nested: 1, coils: 2 },
	difficile: { label: 'Difficile', ropes: 6, cols: 8, rows: 8, tangle: 5, walls: 0, spikes: 3, nested: 2, coils: 3 },
	expert: { label: 'Expert', ropes: 8, cols: 10, rows: 10, tangle: 7, walls: 0, spikes: 4, nested: 3, coils: 4 },
};

export const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

export interface CordesPuzzle {
	ropes: number;
	/** The two pegs of each rope, in the unit square. */
	ends: [Pt, Pt][];
	/** One non-crossing route per rope — the board's own answer, kept for hints. */
	solution: Pt[][];
	/** Peg radius, in unit-square units. Ropes may not run over a peg that isn't theirs. */
	pegR: number;
	/** Ropes with both pegs on the frame: those are the ones that cut the board in two. */
	anchored: boolean[];
}

const NB: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** Shortest rope worth drawing: two cells is a straight line between neighbours. */
const MIN_CELLS = 3;

/** How far apart the two pegs of one rope must sit, in cells. */
const SPAN = 2;

/** Twice the signed area of (o, a, b) — positive when the turn is counter-clockwise. */
const turn = (o: Pt, a: Pt, b: Pt): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/**
 * True only when the two segments properly cross. Touching ends and overlaps count as
 * clear, which is the forgiving reading a finger-drawn rope needs.
 */
export function segCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
	const d1 = turn(c, d, a);
	const d2 = turn(c, d, b);
	const d3 = turn(a, b, c);
	const d4 = turn(a, b, d);
	return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Distance from `p` to segment `ab`. */
export function distToSeg(p: Pt, a: Pt, b: Pt): number {
	const vx = b.x - a.x;
	const vy = b.y - a.y;
	const len2 = vx * vx + vy * vy;
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
	return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/** Does segment `ab` cross any segment of `path`? `skipTail` ignores the path's last joints. */
export function segHitsPath(a: Pt, b: Pt, path: Pt[], skipTail = 0): boolean {
	for (let i = 0; i < path.length - 1 - skipTail; i++) {
		if (segCross(a, b, path[i], path[i + 1])) return true;
	}
	return false;
}

export function pathsCross(p: Pt[], q: Pt[]): boolean {
	for (let i = 0; i < p.length - 1; i++) {
		if (segHitsPath(p[i], p[i + 1], q)) return true;
	}
	return false;
}

/** A rope that loops over itself. Neighbouring joints share a point, so they never count. */
export function selfCrosses(path: Pt[]): boolean {
	for (let i = 0; i < path.length - 1; i++) {
		for (let j = i + 2; j < path.length - 1; j++) {
			if (segCross(path[i], path[i + 1], path[j], path[j + 1])) return true;
		}
	}
	return false;
}

export const inBox = (p: Pt): boolean => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

/** A peg driven into the frame. Only a rope holding one of these is an obstacle worth the name. */
export const isNailed = (p: Pt): boolean => p.x <= 0 || p.x >= 1 || p.y <= 0 || p.y >= 1;

/** Pegs the rope `rope` must keep clear of — every peg except its own two. */
export function hitsForeignPeg(path: Pt[], rope: number, p: CordesPuzzle): boolean {
	for (let r = 0; r < p.ends.length; r++) {
		if (r === rope) continue;
		for (const peg of p.ends[r]) {
			for (let i = 0; i < path.length - 1; i++) {
				if (distToSeg(peg, path[i], path[i + 1]) < p.pegR) return true;
			}
		}
	}
	return false;
}

const near = (a: Pt, b: Pt, r: number): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= r;

/**
 * Why `rope` cannot be accepted as drawn, or null when it is fine. `others` are the ropes
 * already on the board.
 */
export function ropeFault(path: Pt[], rope: number, others: (Pt[] | null)[], p: CordesPuzzle): string | null {
	if (path.length < 2) return 'trop court';
	const [a, b] = p.ends[rope];
	const okEnds = (near(path[0], a, p.pegR) && near(path[path.length - 1], b, p.pegR))
		|| (near(path[0], b, p.pegR) && near(path[path.length - 1], a, p.pegR));
	if (!okEnds) return 'ne relie pas ses deux piquets';
	if (!path.every(inBox)) return 'sort du cadre';
	if (selfCrosses(path)) return 'se croise elle-même';
	if (hitsForeignPeg(path, rope, p)) return 'passe sur un piquet';
	for (let r = 0; r < others.length; r++) {
		const o = others[r];
		if (r === rope || !o) continue;
		if (pathsCross(path, o)) return 'croise une autre corde';
	}
	return null;
}

export function isSolved(ropes: (Pt[] | null)[], p: CordesPuzzle): boolean {
	if (ropes.length < p.ropes) return false;
	for (let r = 0; r < p.ropes; r++) {
		const path = ropes[r];
		if (!path || ropeFault(path, r, ropes, p) !== null) return false;
	}
	return true;
}

/** Corner-cutting. New points sit on the old segments, so a smoothed route never leaves its corridor. */
function chaikin(pts: Pt[], rounds: number): Pt[] {
	let out = pts;
	for (let n = 0; n < rounds && out.length >= 3; n++) {
		const next: Pt[] = [out[0]];
		for (let i = 0; i < out.length - 1; i++) {
			const a = out[i];
			const b = out[i + 1];
			next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
			next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
		}
		next.push(out[out.length - 1]);
		out = next;
	}
	return out;
}

/** A slice of the hidden grid: 1 where a rope may be carved. */
type Mask = Uint8Array;

const maskSize = (m: Mask): number => m.reduce((n, v) => n + v, 0);

const onFrame = (cell: number, cols: number, rows: number): boolean => {
	const c = cell % cols;
	const r = Math.floor(cell / cols);
	return c === 0 || c === cols - 1 || r === 0 || r === rows - 1;
};

/** Where a border cell sits along the frame, in [0,4). Used to keep a cut's two ends apart. */
function framePos(cell: number, cols: number, rows: number): number {
	const c = cell % cols;
	const r = Math.floor(cell / cols);
	if (r === 0) return c / cols;
	if (c === cols - 1) return 1 + r / rows;
	if (r === rows - 1) return 2 + (cols - 1 - c) / cols;
	return 3 + (rows - 1 - r) / rows;
}

/**
 * Cheapest route from `s` to `e` through the slice, with random edge costs so the wall
 * wanders instead of ruling a straight line across the board.
 */
function wander(mask: Mask, cols: number, rows: number, s: number, e: number, rng: Rng): number[] | null {
	const n = cols * rows;
	const dist = new Float64Array(n).fill(Infinity);
	const prev = new Int32Array(n).fill(-1);
	const done = new Uint8Array(n);
	dist[s] = 0;
	for (;;) {
		let cur = -1;
		for (let i = 0; i < n; i++) if (!done[i] && dist[i] < (cur < 0 ? Infinity : dist[cur])) cur = i;
		if (cur < 0 || cur === e) break;
		done[cur] = 1;
		const c = cur % cols;
		const r = Math.floor(cur / cols);
		for (const [dc, dr] of NB) {
			const nc = c + dc;
			const nr = r + dr;
			if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
			const k = nr * cols + nc;
			if (!mask[k]) continue;
			const step = dist[cur] + 1 + rng() * 3;
			if (step < dist[k]) {
				dist[k] = step;
				prev[k] = cur;
			}
		}
	}
	if (!Number.isFinite(dist[e])) return null;
	const out: number[] = [];
	for (let i = e; i >= 0; i = prev[i]) out.push(i);
	return out.reverse();
}

/**
 * The slice minus the cut, in 8-connected pieces. Eight and not four on purpose: pieces that
 * only touch corner to corner would let two ropes squeeze past each other through the cut.
 */
function pieces(mask: Mask, cols: number, rows: number, cut: number[]): number[][] {
	const left = Uint8Array.from(mask);
	for (const c of cut) left[c] = 0;
	const seen = new Uint8Array(cols * rows);
	const out: number[][] = [];
	for (let i = 0; i < left.length; i++) {
		if (!left[i] || seen[i]) continue;
		const comp = [i];
		seen[i] = 1;
		for (let h = 0; h < comp.length; h++) {
			const c = comp[h] % cols;
			const r = Math.floor(comp[h] / cols);
			for (let dr = -1; dr <= 1; dr++) {
				for (let dc = -1; dc <= 1; dc++) {
					const nc = c + dc;
					const nr = r + dr;
					if ((!dc && !dr) || nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
					const k = nr * cols + nc;
					if (!left[k] || seen[k]) continue;
					seen[k] = 1;
					comp.push(k);
				}
			}
		}
		out.push(comp);
	}
	return out;
}

/**
 * Cut a slice in two with a rope running from one edge of the frame to another. Both ends
 * must sit on the frame — that is the whole point, an arc that stops short of the edge can
 * be walked around. The two ends also have to be a quarter of the perimeter apart, or the
 * cut just nibbles a corner off and separates nobody.
 */
function cutSlice(mask: Mask, cols: number, rows: number, rng: Rng): { path: number[]; parts: Mask[] } | null {
	const doors: number[] = [];
	for (let i = 0; i < mask.length; i++) if (mask[i] && onFrame(i, cols, rows)) doors.push(i);
	if (doors.length < 2) return null;

	for (let attempt = 0; attempt < 80; attempt++) {
		const s = doors[Math.floor(rng() * doors.length)];
		const e = doors[Math.floor(rng() * doors.length)];
		if (s === e) continue;
		const gapAlong = Math.abs(framePos(s, cols, rows) - framePos(e, cols, rows));
		if (Math.min(gapAlong, 4 - gapAlong) < 1) continue;
		const path = wander(mask, cols, rows, s, e, rng);
		if (!path || path.length < MIN_CELLS) continue;
		const parts = pieces(mask, cols, rows, path).sort((a, b) => b.length - a.length);
		if (parts.length < 2 || parts[1].length < MIN_CELLS) continue;
		// Anything past the two big pieces is a pocket too small for a pair — leave it empty.
		return {
			path,
			parts: parts.slice(0, 2).map((cells) => {
				const m = new Uint8Array(mask.length);
				for (const c of cells) m[c] = 1;
				return m;
			}),
		};
	}
	return null;
}

/** How many cells a cell sits from the nearest edge of the frame. */
function frameGap(cell: number, cols: number, rows: number): number {
	const c = cell % cols;
	const r = Math.floor(cell / cols);
	return Math.min(c, cols - 1 - c, r, rows - 1 - r);
}

/**
 * Drive a rope in from the frame and stop it dead in the middle of the slice. It separates
 * nobody — the free tip can always be walked round — so it is rejected the moment it pens
 * anything off, and what it costs is the trip out to that tip and back.
 */
function spikeSlice(mask: Mask, cols: number, rows: number, rng: Rng): { path: number[]; rest: Mask } | null {
	const doors: number[] = [];
	let far = 0;
	for (let i = 0; i < mask.length; i++) {
		if (!mask[i]) continue;
		if (onFrame(i, cols, rows)) doors.push(i);
		else far = Math.max(far, frameGap(i, cols, rows));
	}
	// Only the deepest cells of the slice will do. A tip a step from the edge is rounded for
	// nothing; the whole cost of a spike is how far in the player has to reach to get past it.
	const deep: number[] = [];
	for (let i = 0; i < mask.length; i++) if (mask[i] && frameGap(i, cols, rows) >= far) deep.push(i);
	if (!doors.length || far < 2) return null;

	// And it has to span half the board, or the coil it asks for is a bulge.
	const reach = Math.max(MIN_CELLS, Math.round((Math.min(cols, rows) + 1) / 2));
	for (let attempt = 0; attempt < 80; attempt++) {
		const s = doors[Math.floor(rng() * doors.length)];
		const e = deep[Math.floor(rng() * deep.length)];
		const path = wander(mask, cols, rows, s, e, rng);
		if (!path || path.length < reach) continue;
		// The tip is the way round, so it must not touch the frame again: a spike that comes
		// back out to an edge is a wall, and a wall is a different question entirely.
		if (path.slice(1).some((c) => onFrame(c, cols, rows))) continue;
		const parts = pieces(mask, cols, rows, path);
		if (parts.length !== 1) continue;
		const rest = new Uint8Array(mask.length);
		for (const c of parts[0]) rest[c] = 1;
		return { path, rest };
	}
	return null;
}

/**
 * Grow `count` ropes one cell at a time inside one slice, in turn. Round-robin matters: a
 * rope grown to full length before the others would fence them in against an edge.
 */
function fill(mask: Mask, count: number, cols: number, rows: number, rng: Rng): number[][] {
	// -2 is outside the slice, -1 is free, anything else is the rope that owns the cell.
	const owner = new Int16Array(cols * rows).fill(-2);
	const cells: number[] = [];
	for (let i = 0; i < mask.length; i++) {
		if (!mask[i]) continue;
		owner[i] = -1;
		cells.push(i);
	}
	const ropes = Math.min(count, cells.length);
	if (ropes <= 0) return [];
	for (let i = cells.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[cells[i], cells[j]] = [cells[j], cells[i]];
	}

	const paths: number[][] = [];
	const apart = (idx: number): boolean =>
		paths.every((p) => {
			const s = p[0];
			return Math.max(Math.abs((s % cols) - (idx % cols)), Math.abs(Math.floor(s / cols) - Math.floor(idx / cols))) >= 2;
		});
	for (let r = 0; r < ropes; r++) {
		const seed = cells.find((c) => owner[c] === -1 && apart(c)) ?? cells.find((c) => owner[c] === -1)!;
		owner[seed] = r;
		paths.push([seed]);
	}

	const free = (idx: number, dc: number, dr: number): number => {
		const nc = (idx % cols) + dc;
		const nr = Math.floor(idx / cols) + dr;
		if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) return -1;
		const n = nr * cols + nc;
		return owner[n] === -1 ? n : -1; // -2 is another slice: growing into it would cross a wall
	};

	const gap = (a: number, b: number): number =>
		((a % cols) - (b % cols)) ** 2 + (Math.floor(a / cols) - Math.floor(b / cols)) ** 2;

	// A rope that coils back ends with its two pegs side by side, and the straight line
	// between them is then the answer. Pulling each tip away from the other stretches the
	// rope across the board, so its chord has to cut through someone else's.
	const pickAway = (open: number[], other: number): number => {
		if (rng() < 0.25) return open[Math.floor(rng() * open.length)];
		let best = open[0];
		for (const n of open) if (gap(n, other) > gap(best, other)) best = n;
		return best;
	};

	/** Add one free cell to either tip of `r`. */
	const grow = (r: number): boolean => {
		for (const tip of [paths[r].length - 1, 0]) {
			const open: number[] = [];
			for (const [dc, dr] of NB) {
				const n = free(paths[r][tip], dc, dr);
				if (n >= 0) open.push(n);
			}
			if (!open.length) continue;
			const n = pickAway(open, paths[r][tip === 0 ? paths[r].length - 1 : 0]);
			owner[n] = r;
			if (tip === 0) paths[r].unshift(n);
			else paths[r].push(n);
			return true;
		}
		return false;
	};

	const live = paths.map(() => true);
	const budget = cols * rows;
	for (let step = 0; step < budget && live.some(Boolean); step++) {
		for (let r = 0; r < ropes; r++) {
			if (!live[r]) continue;
			const head = paths[r][paths[r].length - 1];
			const open: number[] = [];
			for (const [dc, dr] of NB) {
				const n = free(head, dc, dr);
				if (n >= 0) open.push(n);
			}
			if (open.length === 0) {
				live[r] = false;
				continue;
			}
			const n = pickAway(open, paths[r][0]);
			owner[n] = r;
			paths[r].push(n);
		}
	}

	/** Take a cell off the tip of a neighbouring rope that can still spare one. */
	const steal = (r: number): boolean => {
		for (const tip of [paths[r].length - 1, 0]) {
			const cell = paths[r][tip];
			for (const [dc, dr] of NB) {
				const nc = (cell % cols) + dc;
				const nr = Math.floor(cell / cols) + dr;
				if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
				const n = nr * cols + nc;
				if (owner[n] < 0 || owner[n] === r) continue;
				const donor = paths[owner[n]];
				if (donor.length <= MIN_CELLS) continue;
				if (donor[donor.length - 1] === n) donor.pop();
				else if (donor[0] === n) donor.shift();
				else continue;
				owner[n] = r;
				if (tip === 0) paths[r].unshift(n);
				else paths[r].push(n);
				return true;
			}
		}
		return false;
	};

	// Soak up the leftover cells from both tips. Long snakes are what push a rope's two pegs
	// apart, and pegs far apart are what make the straight line between them run into someone.
	for (let spread = true; spread; ) {
		spread = false;
		for (let r = 0; r < ropes; r++) if (grow(r)) spread = true;
	}

	// A straight two-cell rope is not worth drawing, and a one-cell one has no second peg.
	// Nothing is free by now, so the runts take from whichever long rope they touch.
	for (let r = 0; r < ropes; r++) {
		while (paths[r].length < MIN_CELLS && steal(r));
	}

	// Two pegs of the same colour a cell apart read as a pair nobody has to think about.
	// A rope that coils back has both tips in the same corner, so walking a tip back along
	// its own body pulls it away — a shorter rope, but two ends the player can tell apart.
	for (const path of paths) {
		while (path.length > MIN_CELLS) {
			const head = gap(path[0], path[path.length - 1]);
			const dropFront = gap(path[1], path[path.length - 1]);
			const dropBack = gap(path[0], path[path.length - 2]);
			if (head >= SPAN * SPAN || Math.max(dropFront, dropBack) <= head) break;
			owner[dropFront > dropBack ? path.shift()! : path.pop()!] = -1;
		}
	}
	return paths;
}

/** Which tips of a carved rope get nailed to the frame: the head, the tail, or both. */
const HEAD = 1;
const TAIL = 2;

interface Carved {
	paths: number[][];
	/** `HEAD | TAIL` per rope: 3 is a wall, 1 a spike, 0 an arc loose at both ends. */
	nails: number[];
}

/**
 * Slice the board with the walls, drive the spikes into the slices, then fill what is left
 * with the remaining pairs. Carving the walls first is what guarantees a wall has somebody on
 * either side: a slice always gets a pair.
 */
function carve(diff: DiffLevel, rng: Rng): Carved {
	const { cols, rows, ropes } = diff;
	const slices: Mask[] = [new Uint8Array(cols * rows).fill(1)];
	const paths: number[][] = [];
	const nails: number[] = [];
	const widest = (): number => {
		let w = 0;
		for (let i = 1; i < slices.length; i++) if (maskSize(slices[i]) > maskSize(slices[w])) w = i;
		return w;
	};

	for (let w = 0; w < diff.walls; w++) {
		const i = widest();
		const cut = cutSlice(slices[i], cols, rows, rng);
		if (!cut) break;
		paths.push(cut.path);
		nails.push(HEAD | TAIL);
		slices.splice(i, 1, ...cut.parts);
	}

	for (let s = 0; s < diff.spikes; s++) {
		const i = widest();
		const spike = spikeSlice(slices[i], cols, rows, rng);
		if (!spike) break;
		paths.push(spike.path);
		nails.push(HEAD); // `wander` starts at the door, so the head is the nailed end
		slices[i] = spike.rest;
	}

	// One pair per slice, then the spares to the roomiest — a cramped slice with three ropes
	// in it draws as a knot nobody can read.
	const rest = ropes - paths.length;
	const room = slices.map((_, i) => i).sort((a, b) => maskSize(slices[b]) - maskSize(slices[a]));
	const share = slices.map(() => 0);
	for (let i = 0; i < rest; i++) share[room[i % room.length]]++;

	for (let i = 0; i < slices.length; i++) {
		for (const p of fill(slices[i], share[i], cols, rows, rng)) {
			paths.push(p);
			nails.push(0);
		}
	}
	return { paths, nails };
}

/** How many other ropes cut each rope's straight peg-to-peg line. */
function chordDepths(p: CordesPuzzle): number[] {
	const chord = p.ends.map(([a, b]) => [a, b]);
	return chord.map((c, r) => chord.reduce((n, o, i) => n + (i !== r && pathsCross(c, o) ? 1 : 0), 0));
}

/**
 * How many ropes have their straight peg-to-peg line cut by another rope's. This is how wide
 * the difficulty is spread: a rope nobody crosses is one the player joins with a ruler and
 * never thinks about. Grazing a peg would count as a fault too, but it reads as a near miss
 * on screen, so it does not count here.
 */
export function tangleCount(p: CordesPuzzle): number {
	return chordDepths(p).filter((d) => d >= 1).length;
}

/**
 * How many ropes are caught between two others — how *deep* the difficulty goes. "Go round
 * that one" is a call the player makes without looking up; being hemmed in on both sides is
 * what forces them to read the whole board first, so this is a generation target of its own.
 */
export function tangleDepth(p: CordesPuzzle): number {
	return chordDepths(p).filter((d) => d >= 2).length;
}

/** Ropes nailed to the frame at both ends — the ones that cut the board in two. */
export function wallCount(p: CordesPuzzle): number {
	return p.anchored.filter(Boolean).length;
}

/** The free tip of each spike, or null for a wall and for an arc loose at both ends. */
function spikeTips(p: CordesPuzzle): (Pt | null)[] {
	return p.ends.map(([a, b]) => {
		if (isNailed(a) === isNailed(b)) return null;
		return isNailed(a) ? b : a;
	});
}

/** Ropes nailed to the frame by one end only — dodgeable, but never for free. */
export function spikeCount(p: CordesPuzzle): number {
	return spikeTips(p).filter(Boolean).length;
}

/**
 * How far past the ruler each rope is dragged, as a multiple of its own straight line. Only a
 * spike counts: a wall cannot be rounded at all — the board puts nobody on its far side — and
 * an arc loose at both ends is dodged for almost nothing. Rounding a spike costs the trip out
 * to its free tip and back, and a rope that has to round two of them is the coil.
 */
export function detours(p: CordesPuzzle): number[] {
	const tips = spikeTips(p);
	return p.ends.map(([a, b], r) => {
		const span = Math.hypot(b.x - a.x, b.y - a.y);
		const along = (t: Pt): number => (t.x - a.x) * (b.x - a.x) + (t.y - a.y) * (b.y - a.y);
		const via = tips
			.filter((t, o): t is Pt => t !== null && o !== r && pathsCross([a, b], p.solution[o]))
			.sort((u, v) => along(u) - along(v));
		if (!via.length || span === 0) return 1;
		let len = 0;
		for (const [i, t] of [...via, b].entries()) {
			const from = i === 0 ? a : via[i - 1];
			len += Math.hypot(t.x - from.x, t.y - from.y);
		}
		return len / span;
	});
}

/** A rope only counts as coiled once going round costs it a fifth of its own length. */
const COILED = 1.2;

/** How many ropes cannot be drawn without a real detour round a spike. */
export function coilCount(p: CordesPuzzle): number {
	return detours(p).filter((d) => d >= COILED).length;
}

function deal(diff: DiffLevel, rng: Rng): CordesPuzzle {
	const { cols, rows } = diff;
	const jitter = 0.15;
	const centre = (idx: number, wobble: boolean): Pt => ({
		x: ((idx % cols) + 0.5 + (wobble ? (rng() - 0.5) * 2 * jitter : 0)) / cols,
		y: (Math.floor(idx / cols) + 0.5 + (wobble ? (rng() - 0.5) * 2 * jitter : 0)) / rows,
	});

	// Nail a wall's tip to the frame it already touches. The peg keeps the wobble it has
	// along the edge and loses the one across it — half a cell of daylight behind the peg
	// would be a corridor, and the cut would stop cutting.
	const nail = (cell: number, p: Pt): Pt => {
		const c = cell % cols;
		const r = Math.floor(cell / cols);
		if (c === 0) return { x: 0, y: p.y };
		if (c === cols - 1) return { x: 1, y: p.y };
		if (r === 0) return { x: p.x, y: 0 };
		if (r === rows - 1) return { x: p.x, y: 1 };
		return p;
	};

	const carved = carve(diff, rng);
	const solution: Pt[][] = [];
	const ends: [Pt, Pt][] = [];
	const anchored: boolean[] = [];
	for (let i = 0; i < carved.paths.length; i++) {
		const cellPath = carved.paths[i];
		if (cellPath.length < 2) continue;
		const last = cellPath.length - 1;
		const pts = cellPath.map((c, k) => centre(c, k === 0 || k === last));
		if (carved.nails[i] & HEAD) pts[0] = nail(cellPath[0], pts[0]);
		if (carved.nails[i] & TAIL) pts[last] = nail(cellPath[last], pts[last]);
		// Chaikin keeps the two ends where they are, so a nailed peg stays on the frame.
		const smooth = chaikin(pts, 2);
		solution.push(smooth);
		ends.push([smooth[0], smooth[smooth.length - 1]]);
		anchored.push(carved.nails[i] === (HEAD | TAIL));
	}

	// Pegs sit at most `jitter` off their cell centre, so a foreign route stays at least
	// (0.5 - jitter) of a cell away. The radius has to fit under that or the answer is illegal.
	return { ropes: ends.length, ends, solution, anchored, pegR: 0.3 / Math.max(cols, rows) };
}

/** Ranks a board above any other carrying less crossing, however it is spread. */
const RANK = 16;
/** A rope that has to go the long way round outranks any amount of plain crossing. */
const COIL_RANK = 512;
/** And the frame-nailed ropes outrank both: they are what makes a coil possible at all. */
const NAIL_RANK = 8192;
/**
 * How many boards a deal may go through. A coil is rare per deal, so this is what buys them —
 * and it is the whole cost of generation. Measured on the widest board, doubling it again
 * bought a tenth of a coil for a third more time.
 */
const DEALS = 120;

/**
 * Deal until every rope is worth drawing: all the walls and spikes, `coils` ropes dragged off
 * their straight line for good, `tangle` off the ruler and `nested` of them caught between two
 * others. Coils are the rare one, so the budget is what buys them — the best board seen is
 * kept, and a cramped frame that can never reach its target returns its hardest board rather
 * than looping.
 */
export function generateCordes(diff: DiffLevel, rng: Rng = Math.random): CordesPuzzle {
	// Three rejects, all ranked below every real board so they simply disappear: a slice too
	// cramped to hold its pairs, a rope fenced in at two cells, which draws as a bare segment,
	// and a pair of pegs closer than three peg-widths, which the eye pairs up for free.
	const rate = (p: CordesPuzzle): number => {
		if (p.ropes !== diff.ropes) return -1;
		if (p.solution.some((r) => r.length < 3)) return -1;
		if (p.ends.some(([a, b]) => Math.hypot(a.x - b.x, a.y - b.y) < 6 * p.pegR)) return -1;
		return NAIL_RANK * (wallCount(p) + spikeCount(p))
			+ COIL_RANK * coilCount(p)
			+ RANK * (tangleCount(p) + tangleDepth(p)) + tangleDepth(p);
	};
	const want = NAIL_RANK * (diff.walls + diff.spikes)
		+ COIL_RANK * diff.coils
		+ RANK * (diff.tangle + diff.nested) + diff.nested;
	let best = deal(diff, rng);
	let bestScore = rate(best);
	for (let i = 0; i < DEALS && bestScore < want; i++) {
		const p = deal(diff, rng);
		const s = rate(p);
		if (s > bestScore) {
			best = p;
			bestScore = s;
		}
	}
	return best;
}

export interface CordesHint {
	rope: number;
	path: Pt[];
}

/** Draw in the first rope still missing, using the board's own route. */
export function findHint(ropes: (Pt[] | null)[], p: CordesPuzzle): CordesHint | null {
	for (let r = 0; r < p.ropes; r++) {
		const path = ropes[r];
		if (!path || ropeFault(path, r, ropes, p) !== null) return { rope: r, path: p.solution[r] };
	}
	return null;
}

/**
 * Lay the hinted route down and rub out whatever was in its way. Board routes never cross
 * each other, so only the player's own ropes can be cleared — each hint therefore fixes one
 * more rope for good and repeated hints finish the board.
 */
export function applyHint(ropes: (Pt[] | null)[], hint: CordesHint, p: CordesPuzzle): (Pt[] | null)[] {
	const next: (Pt[] | null)[] = [];
	for (let r = 0; r < p.ropes; r++) next.push(ropes[r] ?? null);
	next[hint.rope] = hint.path;
	for (let r = 0; r < p.ropes; r++) {
		const o = next[r];
		if (r === hint.rope || !o) continue;
		if (pathsCross(o, hint.path)) next[r] = null;
	}
	return next;
}
