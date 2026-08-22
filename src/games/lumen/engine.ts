/**
 * LUMEN — pure engine (no UI). Light leaves the sources (white or a single colour),
 * mirrors bend it, prisms split it into R/G/B from any face, and every sensor must
 * end up with EXACTLY its colour.
 *
 * Colour is a 3-bit mask (1=R, 2=G, 4=B); mixing is a bitwise OR. The engine never
 * names colours — only the UI does. Boards are solvable by construction: the
 * generator places the player pieces first, reads where the light lands, drops the
 * sensors there, then strips the pieces into the tray. That construction ships as
 * `solution` and drives the hints.
 */

import type { Rng } from '../prng';

export type Dir = 0 | 1 | 2 | 3; // N E S W, clockwise from the top
export type Mask = number; // bits 1=R 2=G 4=B; 0 = no light
export type PieceType = 'source' | 'sensor' | 'wall' | 'mirror' | 'prism' | 'combiner' | 'repeater';
/** Pieces the player can hold and rotate. */
export type MobileType = 'mirror' | 'prism' | 'combiner' | 'repeater';

export interface Piece {
	type: PieceType;
	rot: number;
	expect?: Mask; // sensors only
	mask?: Mask; // sources only: emitted colour (default white)
	fixed: boolean;
}

export interface DiffLevel {
	label: string;
	size: number;
	sources: number;
	mirrors: number;
	prisms: number;
	sensors: number;
	/** Combiners merge every ray they receive into ONE beam out of their arrow. */
	combiners: number;
	/** Repeaters copy one incoming beam out of TWO adjacent faces — one source, many sensors. */
	repeaters: number;
	walls: number;
	/** Fixed decoy mirrors the player cannot touch. */
	decoys: number;
	/** Chance a deal colours its sources (needs >= 2 sources to matter). */
	colored: number;
}

// A sensor STOPS a ray, so sensors <= sources + 2*prisms; slack under that cap is
// what allows mixed-colour sensors (a mix eats two rays).
export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 5, sources: 2, mirrors: 2, prisms: 0, sensors: 2, combiners: 0, repeaters: 0, walls: 1, decoys: 0, colored: 0.7 },
	moyen: { label: 'Moyen', size: 6, sources: 2, mirrors: 3, prisms: 1, sensors: 2, combiners: 1, repeaters: 0, walls: 2, decoys: 0, colored: 0.5 },
	difficile: { label: 'Difficile', size: 7, sources: 2, mirrors: 4, prisms: 1, sensors: 3, combiners: 1, repeaters: 1, walls: 3, decoys: 0, colored: 0.55 },
	expert: { label: 'Expert', size: 8, sources: 2, mirrors: 5, prisms: 2, sensors: 4, combiners: 1, repeaters: 1, walls: 4, decoys: 2, colored: 0.5 },
};

export const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

export const STEP: readonly (readonly [number, number])[] = [[-1, 0], [0, 1], [1, 0], [0, -1]];

/** `/` then `\`: where an incoming direction bounces to. */
const MIRROR: readonly (readonly Dir[])[] = [[1, 0, 3, 2], [3, 2, 1, 0]];

export interface TrayPiece {
	id: number;
	type: MobileType;
}

export interface Placement {
	idx: number; // flat cell
	rot: number;
}

export interface SolutionSlot {
	idx: number;
	type: MobileType;
	rot: number;
}

export interface LumenPuzzle {
	size: number;
	fixed: { idx: number; piece: Piece }[];
	tray: TrayPiece[]; // shuffled; rotations are the player's problem
	solution: SolutionSlot[];
	start: Placement[]; // scattered opening spots (tray order); empty = start from the tray
}

// Prism: 3 rots = the 3 cyclic colour orders (a 4th would repeat one — forbidden).
// Combiner: rot = output direction. Repeater: rot = first of its two adjacent output faces.
export const ROTS: Record<MobileType, number> = { mirror: 2, prism: 3, combiner: 4, repeater: 4 };

/** Dir offsets for the prism channels: left of travel, straight, right of travel. */
const PRISM_BEND = [3, 0, 1] as const;

export const rotCW = (type: MobileType, rot: number): number => (rot + 1) % ROTS[type];

/** Live board: fixed pieces + player placements (placements[i] pairs with tray[i]). */
export function boardFrom(p: LumenPuzzle, placements: (Placement | null)[]): (Piece | null)[] {
	const board = new Array<Piece | null>(p.size * p.size).fill(null);
	for (const f of p.fixed) board[f.idx] = f.piece;
	for (let i = 0; i < p.tray.length; i++) {
		const pl = placements[i];
		if (pl && board[pl.idx] === null)
			board[pl.idx] = { type: p.tray[i].type, rot: pl.rot, fixed: false };
	}
	return board;
}

export interface BeamSeg {
	r0: number;
	c0: number;
	r1: number;
	c1: number;
	mask: Mask;
}

export interface TraceResult {
	segments: BeamSeg[];
	sensorMask: Map<number, Mask>;
}

interface Ray {
	r: number;
	c: number;
	d: Dir;
	mask: Mask;
}

/**
 * Cast every beam. Terminates because `seen` accumulates masks per (cell, dir) and a
 * ray whose mask adds nothing dies — masks only grow and cap at 7, so even a closed
 * square of four mirrors runs out of new light.
 */
export function trace(size: number, board: (Piece | null)[]): TraceResult {
	const segments: BeamSeg[] = [];
	const sensorMask = new Map<number, Mask>();
	const combined = new Map<number, Mask>(); // per-combiner accumulated input
	const seen = new Uint8Array(size * size * 4);
	const rays: Ray[] = [];

	for (let i = 0; i < board.length; i++) {
		const p = board[i];
		if (p?.type === 'source')
			rays.push({ r: Math.floor(i / size), c: i % size, d: p.rot as Dir, mask: p.mask ?? 7 });
	}

	while (rays.length > 0) {
		const ray = rays.pop() as Ray;
		let { r, c } = ray;
		const { d, mask } = ray;
		const startR = r, startC = c;
		let endR = r, endC = c;

		for (;;) {
			r += STEP[d][0];
			c += STEP[d][1];
			if (r < 0 || r >= size || c < 0 || c >= size) break;
			const idx = r * size + c;
			const key = idx * 4 + d;
			if ((seen[key] | mask) === seen[key]) { endR = r; endC = c; break; }
			seen[key] |= mask;
			endR = r;
			endC = c;
			const p = board[idx];
			if (!p) continue;
			if (p.type === 'sensor') {
				sensorMask.set(idx, (sensorMask.get(idx) ?? 0) | mask);
			} else if (p.type === 'mirror') {
				rays.push({ r, c, d: MIRROR[p.rot % 2][d], mask });
			} else if (p.type === 'prism') {
				// Every face refracts; rot cycles which channel bends left / straight / right
				// (rot 0: R left, G straight, B right).
				for (let ch = 0; ch < 3; ch++)
					if (mask & (1 << ch))
						rays.push({ r, c, d: ((d + PRISM_BEND[(ch + p.rot) % 3]) % 4) as Dir, mask: 1 << ch });
			} else if (p.type === 'combiner') {
				// Re-emit the OR of every ray received so far out of the rot face; the
				// accumulator only grows, so each re-emission carries new light and dies out.
				const acc = (combined.get(idx) ?? 0) | mask;
				if (acc !== combined.get(idx)) {
					combined.set(idx, acc);
					rays.push({ r, c, d: p.rot as Dir, mask: acc });
				}
			} else if (p.type === 'repeater') {
				// Copy the whole incoming beam out of the two adjacent faces (rot, rot+1).
				// `seen` on the outgoing cells bounds it, so duplication can't run away.
				rays.push({ r, c, d: p.rot as Dir, mask });
				rays.push({ r, c, d: ((p.rot + 1) % 4) as Dir, mask });
			}
			break; // wall / source absorb; the rest re-emitted above
		}
		if (endR !== startR || endC !== startC)
			segments.push({ r0: startR, c0: startC, r1: endR, c1: endC, mask });
	}
	// A combiner re-emits growing masks along one path: merge the duplicate segments.
	const byPath = new Map<string, BeamSeg>();
	for (const seg of segments) {
		const key = `${seg.r0},${seg.c0},${seg.r1},${seg.c1}`;
		const prev = byPath.get(key);
		if (prev) prev.mask |= seg.mask;
		else byPath.set(key, seg);
	}
	return { segments: [...byPath.values()], sensorMask };
}

/** Win: every sensor holds EXACTLY its expected mask — a superset fails too. */
export function isSolved(p: LumenPuzzle, placements: (Placement | null)[]): boolean {
	return sensorsMatch(p, trace(p.size, boardFrom(p, placements)).sensorMask);
}

function sensorsMatch(p: LumenPuzzle, got: Map<number, Mask>): boolean {
	for (const f of p.fixed)
		if (f.piece.type === 'sensor' && (got.get(f.idx) ?? 0) !== f.piece.expect) return false;
	return true;
}

const popcount = (m: Mask): number => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);

/** Masks of every segment passing through each EMPTY cell. */
function crossMasks(size: number, board: (Piece | null)[], segments: BeamSeg[]): Map<number, Mask[]> {
	const cross = new Map<number, Mask[]>();
	for (const seg of segments) {
		const dr = Math.sign(seg.r1 - seg.r0), dc = Math.sign(seg.c1 - seg.c0);
		let r = seg.r0 + dr, c = seg.c0 + dc;
		for (;;) {
			const idx = r * size + c;
			if (board[idx] === null) {
				const arr = cross.get(idx) ?? [];
				arr.push(seg.mask);
				cross.set(idx, arr);
			}
			if (r === seg.r1 && c === seg.c1) break;
			r += dr;
			c += dc;
		}
	}
	return cross;
}

interface Deal {
	fixed: { idx: number; piece: Piece }[];
	pieces: SolutionSlot[];
	beamLen: number;
	expects: Mask[];
	preSatisfied: number; // sensors already on their colour with the tray empty
}

export function generateLumen(diff: DiffLevel, rng: Rng = Math.random): LumenPuzzle {
	const size = Math.max(4, Math.floor(diff.size));
	let hardPass: Deal | null = null;

	for (let attempt = 0; attempt < 240; attempt++) {
		const deal = dealOnce(size, diff, rng);
		if (!deal) continue;
		hardPass = deal;
		if (softGates(deal, diff)) break;
	}
	// Never spin forever in the browser: the last hard-pass deal is always playable.
	if (!hardPass) hardPass = desperateDeal(size, diff, rng);

	const order = hardPass.pieces.slice();
	for (let i = order.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[order[i], order[j]] = [order[j], order[i]];
	}
	const puzzle: LumenPuzzle = {
		size,
		fixed: hardPass.fixed,
		tray: order.map((s, id) => ({ id, type: s.type })),
		solution: hardPass.pieces,
		start: [],
	};

	// Pieces open scattered IN the scene, badly placed: never on a solution cell (a
	// lucky drop would leak the answer) and never an already-won board.
	const blocked = new Set<number>();
	for (const f of hardPass.fixed) blocked.add(f.idx);
	for (const s of hardPass.pieces) blocked.add(s.idx);
	for (let tries = 0; tries < 20; tries++) {
		const taken = new Set(blocked);
		const start = order.map((s) => {
			const cells: number[] = [];
			for (let i = 0; i < size * size; i++) if (!taken.has(i)) cells.push(i);
			const idx = cells[Math.floor(rng() * cells.length)];
			taken.add(idx);
			return { idx, rot: Math.floor(rng() * ROTS[s.type]) };
		});
		if (!isSolved({ ...puzzle, start }, start)) {
			puzzle.start = start;
			break;
		}
	}
	return puzzle;
}

/** One construction attempt; null when a hard gate fails. */
function dealOnce(size: number, diff: DiffLevel, rng: Rng): Deal | null {
	const board = new Array<Piece | null>(size * size).fill(null);
	const free = (): number[] => {
		const out: number[] = [];
		for (let i = 0; i < board.length; i++) if (board[i] === null) out.push(i);
		return out;
	};
	const pick = (cells: number[]): number => cells[Math.floor(rng() * cells.length)];

	// Sources: at least 2 cells of runway so the first beam exists on the board.
	// A coloured deal gives each source a distinct primary: beams become tellable
	// apart, and two of them can mix on a sensor without any prism.
	const primaries = [1, 2, 4];
	const colourDeal = diff.sources >= 2 && rng() < diff.colored;
	// Primary beams never multiply (a prism keeps their single channel) and a combiner
	// eats one ray (two in, one out): coloured deals fund it with an extra source and
	// cap the sensors at the rays that survive — else they starve and skew out.
	const nSources = colourDeal ? Math.min(3, diff.sources + diff.combiners) : diff.sources;
	const nSensors = colourDeal ? Math.min(diff.sensors, Math.max(2, nSources - diff.combiners)) : diff.sensors;
	for (let s = 0; s < nSources; s++) {
		let ok = false;
		for (let t = 0; t < 40 && !ok; t++) {
			const idx = pick(free());
			const r = Math.floor(idx / size), c = idx % size;
			const dirs: Dir[] = [];
			for (let d = 0 as Dir; d < 4; d++) {
				const rr = r + STEP[d][0] * 2, cc = c + STEP[d][1] * 2;
				if (rr >= 0 && rr < size && cc >= 0 && cc < size) dirs.push(d as Dir);
			}
			if (dirs.length === 0) continue;
			const mask = colourDeal && primaries.length > 0
				? primaries.splice(Math.floor(rng() * primaries.length), 1)[0]
				: 7;
			board[idx] = { type: 'source', rot: dirs[Math.floor(rng() * dirs.length)], mask, fixed: true };
			ok = true;
		}
		if (!ok) return null;
	}

	const inFront = new Set<number>();
	for (let i = 0; i < board.length; i++) {
		const p = board[i];
		if (p?.type !== 'source') continue;
		const r = Math.floor(i / size) + STEP[p.rot][0], c = (i % size) + STEP[p.rot][1];
		if (r >= 0 && r < size && c >= 0 && c < size) inFront.add(r * size + c);
	}
	for (let w = 0; w < diff.walls; w++) {
		const cells = free().filter((i) => !inFront.has(i));
		if (cells.length === 0) break;
		board[pick(cells)] = { type: 'wall', rot: 0, fixed: true };
	}

	// Player pieces go ON a live beam (re-traced after each): a random cell would almost
	// never be load-bearing, and the gate below would reject nearly every attempt.
	const beamCells = (): Map<number, Dir[]> => {
		const t = trace(size, board);
		const map = new Map<number, Dir[]>();
		for (const seg of t.segments) {
			const dr = Math.sign(seg.r1 - seg.r0), dc = Math.sign(seg.c1 - seg.c0);
			const d = (dr < 0 ? 0 : dr > 0 ? 2 : dc > 0 ? 1 : 3) as Dir;
			let r = seg.r0 + dr, c = seg.c0 + dc;
			for (;;) {
				const idx = r * size + c;
				if (board[idx] === null) {
					const arr = map.get(idx) ?? [];
					if (!arr.includes(d)) { arr.push(d); map.set(idx, arr); }
				}
				if (r === seg.r1 && c === seg.c1) break;
				r += dr;
				c += dc;
			}
		}
		return map;
	};
	const pieces: SolutionSlot[] = [];
	const prismsAlive = (): boolean => {
		const t = trace(size, board);
		for (const p of pieces) {
			if (p.type !== 'prism') continue;
			const r = Math.floor(p.idx / size), c = p.idx % size;
			if (!t.segments.some((seg) => seg.r0 === r && seg.c0 === c)) return false;
		}
		return true;
	};
	const putOnBeam = (type: MobileType): boolean => {
		for (let tries = 0; tries < 12; tries++) {
			const cells = beamCells();
			const keys = [...cells.keys()];
			if (keys.length === 0) return false;
			const idx = keys[Math.floor(rng() * keys.length)];
			const rot = Math.floor(rng() * ROTS[type]);
			board[idx] = { type, rot, fixed: false };
			// A piece dropped upstream of a placed prism starves it: undo and retry.
			if (prismsAlive()) { pieces.push({ idx, type, rot }); return true; }
			board[idx] = null;
		}
		return false;
	};
	// A combiner wants a cell where two beams already cross, so it truly merges;
	// fallback: any beam cell (it then just redirects). Output needs 2 cells of runway.
	const putCombiner = (): boolean => {
		for (let tries = 0; tries < 12; tries++) {
			const t = trace(size, board);
			const cross = crossMasks(size, board, t.segments);
			if (cross.size === 0) return false;
			const merging: number[] = [];
			for (const [idx, masks] of cross) if (new Set(masks).size >= 2) merging.push(idx);
			const pool = merging.length > 0 ? merging : [...cross.keys()];
			const idx = pool[Math.floor(rng() * pool.length)];
			const r = Math.floor(idx / size), c = idx % size;
			const dirs: Dir[] = [];
			for (let d = 0; d < 4; d++) {
				const rr = r + STEP[d][0] * 2, cc = c + STEP[d][1] * 2;
				if (rr >= 0 && rr < size && cc >= 0 && cc < size) dirs.push(d as Dir);
			}
			if (dirs.length === 0) continue;
			const rot = dirs[Math.floor(rng() * dirs.length)];
			board[idx] = { type: 'combiner', rot, fixed: false };
			if (prismsAlive()) { pieces.push({ idx, type: 'combiner', rot }); return true; }
			board[idx] = null;
		}
		return false;
	};
	// Prisms first: mirrors then land on coloured beams and route the mixes.
	for (let m = 0; m < diff.prisms; m++) if (!putOnBeam('prism')) return null;
	// Repeaters duplicate a beam, so more sensors can hang off one source. A miss is
	// survivable (like combiners) — skip rather than kill the deal.
	for (let m = 0; m < diff.repeaters; m++) putOnBeam('repeater');
	for (let m = 0; m < diff.mirrors; m++) if (!putOnBeam('mirror')) return null;
	// Combiners merge rays 2-into-1, shrinking the ray budget — a miss is survivable,
	// so a failed drop skips the piece instead of killing the deal.
	for (let m = 0; m < diff.combiners; m++) putCombiner();
	// Decoys lie off-beam: fixed scenery the light never touches at deal time.
	for (let m = 0; m < diff.decoys; m++) {
		const on = beamCells();
		const cells = free().filter((i) => !on.has(i));
		if (cells.length === 0) return null;
		board[pick(cells)] = { type: 'mirror', rot: Math.floor(rng() * 2), fixed: true };
	}

	// Sensors one at a time, re-tracing between each: a sensor sits on the LAST in-grid
	// cell of a ray that escaped, so placing it never disturbs that ray upstream — but it
	// can now absorb other beams crossing the cell, hence the fresh trace every time.
	for (let s = 0; s < nSensors; s++) {
		const t = trace(size, board);
		const spots = new Map<number, Mask>();
		for (const seg of t.segments) {
			const idx = seg.r1 * size + seg.c1;
			if (board[idx] !== null) continue; // ray ended ON a piece, not past it
			const nr = seg.r1 + Math.sign(seg.r1 - seg.r0);
			const nc = seg.c1 + Math.sign(seg.c1 - seg.c0);
			if (nr >= 0 && nr < size && nc >= 0 && nc < size) continue; // died in-grid, not an escape
			spots.set(idx, (spots.get(idx) ?? 0) | seg.mask);
		}
		// A sensor eats one whole ray, so a mix needs a spare one: when more rays escape
		// than sensors remain — or none escape at all (a combiner swallowed them) — drop
		// the sensor where two colours cross and ask for the mix.
		if (spots.size > nSensors - s || spots.size === 0) {
			const cross = crossMasks(size, board, t.segments);
			const merges: number[] = [];
			for (const [idx, masks] of cross) {
				const union = masks.reduce((a, b) => a | b, 0);
				if (new Set(masks).size >= 2 && popcount(union) === 2) merges.push(idx);
			}
			if (merges.length > 0 && (spots.size === 0 || rng() < 0.85)) {
				board[merges[Math.floor(rng() * merges.length)]] = { type: 'sensor', rot: 0, expect: 0, fixed: true };
				continue;
			}
		}
		const all = [...spots.entries()];
		if (all.length === 0) return null;
		// Mixed colours first once a prism is in play — that is the puzzle's whole point.
		all.sort((a, b) => {
			const pa = popcount(a[1]), pb = popcount(b[1]);
			const sa = pa === 2 ? 0 : pa === 1 ? 1 : 2;
			const sb = pb === 2 ? 0 : pb === 1 ? 1 : 2;
			return sa - sb || rng() - 0.5;
		});
		const bucket = all.slice(0, Math.max(1, Math.min(3, all.length)));
		const [idx] = bucket[Math.floor(rng() * bucket.length)];
		board[idx] = { type: 'sensor', rot: 0, expect: 0, fixed: true };
	}

	// Final trace fills each sensor's contract.
	const final = trace(size, board);
	const expects: Mask[] = [];
	for (let i = 0; i < board.length; i++) {
		const p = board[i];
		if (p?.type !== 'sensor') continue;
		const got = final.sensorMask.get(i) ?? 0;
		if (got === 0) return null;
		p.expect = got;
		expects.push(got);
	}

	const fixed: { idx: number; piece: Piece }[] = [];
	for (let i = 0; i < board.length; i++) {
		const p = board[i];
		if (p && p.fixed) fixed.push({ idx: i, piece: p });
	}

	// Hard gate: doing nothing must never win.
	const puzzleLike: LumenPuzzle = { size, fixed, tray: [], solution: [], start: [] };
	const bare = new Array<Piece | null>(size * size).fill(null);
	for (const f of fixed) bare[f.idx] = f.piece;
	const bareTrace = trace(size, bare);
	if (sensorsMatch(puzzleLike, bareTrace.sensorMask)) return null;
	let preSatisfied = 0;
	for (const f of fixed)
		if (f.piece.type === 'sensor' && (bareTrace.sensorMask.get(f.idx) ?? 0) === f.piece.expect) preSatisfied++;

	// Every shipped piece must be load-bearing — but a piece the light no longer needs
	// is stripped rather than failing the deal: with spare rays around, mirrors often
	// land on a ray no sensor drinks. Loop until stable (removals can interact).
	for (;;) {
		let stripped = false;
		for (let i = pieces.length - 1; i >= 0; i--) {
			const without = board.slice();
			without[pieces[i].idx] = null;
			const t = trace(size, without);
			let changed = false;
			for (const f of fixed)
				if (f.piece.type === 'sensor' && (t.sensorMask.get(f.idx) ?? 0) !== f.piece.expect) changed = true;
			if (!changed) {
				board[pieces[i].idx] = null;
				pieces.splice(i, 1);
				stripped = true;
			}
		}
		if (!stripped) break;
	}
	if (pieces.length === 0) return null;

	// Hard gate: enough beam work, and no sensor glued right onto a source.
	// Scale with the piece count: 2.5*size is unreachable on a small board whose few
	// segments cap at size-1 each. Fresh trace: stripping may have rerouted spare rays.
	let beamLen = 0;
	for (const seg of trace(size, board).segments) beamLen += Math.abs(seg.r1 - seg.r0) + Math.abs(seg.c1 - seg.c0);
	if (beamLen < 1.2 * size + pieces.length) return null;
	for (const f of fixed) {
		if (f.piece.type !== 'sensor') continue;
		for (let d = 0; d < 4; d++) {
			const r = Math.floor(f.idx / size) + STEP[d][0], c = (f.idx % size) + STEP[d][1];
			if (r < 0 || r >= size || c < 0 || c >= size) continue;
			const nb = bare[r * size + c] ?? board[r * size + c];
			if (nb?.type === 'source' && (nb.rot + 2) % 4 === d) return null;
		}
	}

	return { fixed, pieces, beamLen, expects, preSatisfied };
}

function softGates(deal: Deal, diff: DiffLevel): boolean {
	if (deal.preSatisfied > 0) return false; // no sensor should come for free
	// Repeaters are an optional simplifier, not a promised piece — kept out of this survival
	// gate so a stripped one never forces a reroll (and never inflates the fallback rate).
	if (deal.pieces.length < diff.mirrors + diff.prisms + diff.combiners - 1) return false; // at most one stripped
	// The tier promises its signature pieces: a stripped prism / skipped combiner rerolls.
	if (diff.prisms > 0 && !deal.pieces.some((p) => p.type === 'prism')) return false;
	if (diff.combiners > 0 && !deal.pieces.some((p) => p.type === 'combiner')) return false;
	if (diff.prisms > 0 && !deal.expects.some((m) => m !== 7 && popcount(m) <= 2)) return false;
	if (diff.size >= 6 && new Set(deal.expects).size < 2) return false;
	if (diff.size >= 7 && !deal.expects.some((m) => popcount(m) === 2)) return false;
	return true;
}

/** Absolute fallback: shrink the ask, then a handmade one-mirror deal. Never spins. */
function desperateDeal(size: number, diff: DiffLevel, rng: Rng): Deal {
	// Stripping the prisms shrinks the ray budget to `sources` — cap sensors with it.
	const easier: DiffLevel = { ...diff, walls: 0, decoys: 0, prisms: 0, combiners: 0, repeaters: 0, sensors: Math.max(1, Math.min(diff.sources, diff.sensors - 1)) };
	for (let t = 0; t < 400; t++) {
		const d = dealOnce(size, easier, rng);
		if (d) return d;
	}
	// One `/` mirror bends the source beam up onto the sensor.
	return {
		fixed: [
			{ idx: size, piece: { type: 'source', rot: 1, fixed: true } }, // (1,0) firing E
			{ idx: size - 2, piece: { type: 'sensor', rot: 0, expect: 7, fixed: true } }, // (0,size-2)
		],
		pieces: [{ idx: 2 * size - 2, type: 'mirror', rot: 0 }], // (1,size-2)
		beamLen: size,
		expects: [7],
		preSatisfied: 0,
	};
}

export type LumenHint =
	| { kind: 'rotate'; trayIndex: number; rot: number; reason: string }
	| { kind: 'move'; trayIndex: number; idx: number; rot: number; reason: string };

/** A harmless empty cell to slide a blocker onto: its start spot if free, else any free
 *  non-slot, non-fixed cell. Pieces live in the scene, so a hint parks — never a tray. */
function freeParkCell(p: LumenPuzzle, occupied: Set<number>, prefer?: number): number {
	const isFixed = new Set(p.fixed.map((f) => f.idx));
	const isSlot = new Set(p.solution.map((s) => s.idx));
	const ok = (c: number): boolean => c >= 0 && !occupied.has(c) && !isFixed.has(c) && !isSlot.has(c);
	if (prefer !== undefined && ok(prefer)) return prefer;
	for (let c = 0; c < p.size * p.size; c++) if (ok(c)) return c;
	return -1;
}

/**
 * The hint is always constructive and never uses a tray — pieces stay in the scene.
 * 1) a piece on the right cell but turned wrong → rotate it;
 * 2) otherwise move a piece straight onto a free solution slot (a misplaced piece first,
 *    so the move also clears the cell it was squatting);
 * 3) deadlock only (every free-able slot is blocked): slide one squatter off its slot onto
 *    a harmless free cell so the next hint can fill it.
 * Same-type pieces are interchangeable, so two equivalent mirrors never get swapped.
 */
export function findHint(p: LumenPuzzle, placements: (Placement | null)[]): LumenHint | null {
	if (isSolved(p, placements)) return null;

	const slotByIdx = new Map<number, SolutionSlot>();
	for (const s of p.solution) slotByIdx.set(s.idx, s);

	const matched = new Set<number>(); // solution cell already claimed by a correct piece
	const occupied = new Set<number>(); // every cell a player piece currently sits on
	const correct = new Array<boolean>(p.tray.length).fill(false);
	let wrongRot = -1;
	for (let i = 0; i < p.tray.length; i++) {
		const pl = placements[i];
		if (!pl) continue;
		occupied.add(pl.idx);
		const slot = slotByIdx.get(pl.idx);
		if (slot && slot.type === p.tray[i].type && !matched.has(pl.idx)) {
			matched.add(pl.idx);
			correct[i] = true;
			if (pl.rot !== slot.rot && wrongRot < 0) wrongRot = i;
		}
	}

	if (wrongRot >= 0) {
		const slot = slotByIdx.get((placements[wrongRot] as Placement).idx) as SolutionSlot;
		return { kind: 'rotate', trayIndex: wrongRot, rot: slot.rot, reason: 'Bonne case, mauvaise orientation : on la tourne.' };
	}

	for (const slot of p.solution) {
		if (matched.has(slot.idx) || occupied.has(slot.idx)) continue; // the slot's cell must be free
		let floating = -1, misplaced = -1;
		for (let i = 0; i < p.tray.length; i++) {
			if (p.tray[i].type !== slot.type || correct[i]) continue;
			if (placements[i]) { misplaced = i; break; } // moving it also frees its old cell
			if (floating < 0) floating = i;
		}
		const src = misplaced >= 0 ? misplaced : floating;
		if (src >= 0)
			return {
				kind: 'move', trayIndex: src, idx: slot.idx, rot: slot.rot,
				reason: placements[src]
					? 'Cette pièce va directement à sa place.'
					: 'Une pièce posée là fait avancer la lumière.',
			};
	}

	// Every free-able slot is blocked by a squatter — slide one off onto a harmless cell.
	for (let i = 0; i < p.tray.length; i++) {
		const pl = placements[i];
		if (!pl || correct[i] || !slotByIdx.has(pl.idx)) continue; // only pieces squatting a real slot block progress
		const home = freeParkCell(p, occupied, p.start[i]?.idx);
		if (home >= 0)
			return { kind: 'move', trayIndex: i, idx: home, rot: pl.rot, reason: 'Cette pièce en bloque une autre : on la dégage.' };
	}
	return null; // solved some other valid way, or nothing left to say
}

/** The shipped construction as placements (tray order): reveal / give-up use this. */
export function solutionPlacements(p: LumenPuzzle): Placement[] {
	const used = new Set<number>();
	return p.tray.map((tp) => {
		const j = p.solution.findIndex((s, k) => !used.has(k) && s.type === tp.type);
		used.add(j);
		return { idx: p.solution[j].idx, rot: p.solution[j].rot };
	});
}

/** Pure: placements with the hint applied. */
export function applyHint(placements: (Placement | null)[], h: LumenHint): (Placement | null)[] {
	const next = placements.slice();
	if (h.kind === 'rotate') next[h.trayIndex] = { ...(next[h.trayIndex] as Placement), rot: h.rot };
	else next[h.trayIndex] = { idx: h.idx, rot: h.rot };
	return next;
}
