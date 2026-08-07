/**
 * CORDES (untangle-free routing) — pure engine (no UI).
 * Join every pair of pegs with a hand-drawn rope. Ropes stay inside the frame and never
 * cross — neither each other nor themselves.
 *
 * The frame is what makes it a puzzle: on an open plane any pairing can be solved by
 * looping around everything, so there would be nothing to think about.
 *
 * A board is solvable by construction. Generation carves disjoint paths on a hidden grid,
 * smooths them into curves and keeps only their ends — the player never sees the lattice
 * and draws freehand. No solver, no retry on the puzzle itself.
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
}

/**
 * Frame side for a rope count. Every extra rope makes it harder to keep them all tangled,
 * so the crowd needs more room — past six they need a whole extra ring.
 */
export const frameFor = (ropes: number): number => ropes + (ropes < 7 ? 2 : 3);

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', ropes: 3, cols: 5, rows: 5, tangle: 3 },
	moyen: { label: 'Moyen', ropes: 4, cols: 6, rows: 6, tangle: 4 },
	difficile: { label: 'Difficile', ropes: 5, cols: 7, rows: 7, tangle: 5 },
	expert: { label: 'Expert', ropes: 7, cols: 10, rows: 10, tangle: 7 },
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

/**
 * Grow every rope one cell at a time, in turn. Round-robin matters: a rope grown to full
 * length before the others would fence them in against a wall.
 */
function carve(diff: DiffLevel, rng: Rng): number[][] {
	const { cols, rows, ropes } = diff;
	const owner = new Int16Array(cols * rows).fill(-1);
	const cells: number[] = [];
	for (let i = 0; i < cols * rows; i++) cells.push(i);
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
		const seed = cells.find((c) => owner[c] < 0 && apart(c)) ?? cells.find((c) => owner[c] < 0)!;
		owner[seed] = r;
		paths.push([seed]);
	}

	const free = (idx: number, dc: number, dr: number): number => {
		const nc = (idx % cols) + dc;
		const nr = Math.floor(idx / cols) + dr;
		if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) return -1;
		const n = nr * cols + nc;
		return owner[n] < 0 ? n : -1;
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

/**
 * How many ropes have their straight peg-to-peg line cut by another rope's. This is the
 * whole difficulty of the game: a rope nobody crosses is one the player joins with a ruler
 * and never thinks about. Grazing a peg would count as a fault too, but it reads as a near
 * miss on screen, so it does not count here.
 */
export function tangleCount(p: CordesPuzzle): number {
	const chord = p.ends.map(([a, b]) => [a, b]);
	let n = 0;
	for (let r = 0; r < p.ropes; r++) if (chord.some((o, i) => i !== r && pathsCross(chord[r], o))) n++;
	return n;
}

function deal(diff: DiffLevel, rng: Rng): CordesPuzzle {
	const { cols, rows } = diff;
	const jitter = 0.15;
	const centre = (idx: number, wobble: boolean): Pt => ({
		x: ((idx % cols) + 0.5 + (wobble ? (rng() - 0.5) * 2 * jitter : 0)) / cols,
		y: (Math.floor(idx / cols) + 0.5 + (wobble ? (rng() - 0.5) * 2 * jitter : 0)) / rows,
	});

	const carved = carve(diff, rng).filter((p) => p.length > 1);
	const solution: Pt[][] = [];
	const ends: [Pt, Pt][] = [];
	for (const cellPath of carved) {
		const pts = cellPath.map((c, i) => centre(c, i === 0 || i === cellPath.length - 1));
		const smooth = chaikin(pts, 2);
		solution.push(smooth);
		ends.push([smooth[0], smooth[smooth.length - 1]]);
	}

	// Pegs sit at most `jitter` off their cell centre, so a foreign route stays at least
	// (0.5 - jitter) of a cell away. The radius has to fit under that or the answer is illegal.
	return { ropes: ends.length, ends, solution, pegR: 0.3 / Math.max(cols, rows) };
}

/**
 * Deal until every rope is worth drawing. One deal costs tens of microseconds, so hundreds
 * of rejections stay under a frame; the best one seen is kept so a cramped frame that can
 * never reach its target still returns its hardest board rather than looping.
 */
export function generateCordes(diff: DiffLevel, rng: Rng = Math.random): CordesPuzzle {
	// Two rejects, both ranked below every real board so they simply disappear: a rope
	// fenced in at two cells, which draws as a bare segment, and a pair of pegs closer
	// than three peg-widths, which the eye pairs up without any thinking.
	const rate = (p: CordesPuzzle): number => {
		if (p.solution.some((r) => r.length < 3)) return -1;
		if (p.ends.some(([a, b]) => Math.hypot(a.x - b.x, a.y - b.y) < 6 * p.pegR)) return -1;
		return tangleCount(p);
	};
	let best = deal(diff, rng);
	let bestScore = rate(best);
	for (let i = 0; i < 400 && bestScore < diff.tangle; i++) {
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
