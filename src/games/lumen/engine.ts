/**
 * LUMEN — pure engine (no UI). White light leaves the sources, mirrors bend it,
 * prisms split it into R/G/B, and every sensor must end up with EXACTLY its colour.
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
export type PieceType = 'source' | 'sensor' | 'wall' | 'mirror' | 'prism';

export interface Piece {
	type: PieceType;
	rot: number;
	expect?: Mask; // sensors only
	fixed: boolean;
}

export interface DiffLevel {
	label: string;
	size: number;
	sources: number;
	mirrors: number;
	prisms: number;
	sensors: number;
	walls: number;
	/** Fixed decoy mirrors the player cannot touch. */
	decoys: number;
}

// A sensor STOPS a ray, so sensors <= sources + 2*prisms; slack under that cap is
// what allows mixed-colour sensors (a mix eats two rays).
export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 5, sources: 2, mirrors: 2, prisms: 0, sensors: 2, walls: 1, decoys: 0 },
	moyen: { label: 'Moyen', size: 6, sources: 1, mirrors: 3, prisms: 1, sensors: 2, walls: 2, decoys: 0 },
	difficile: { label: 'Difficile', size: 7, sources: 2, mirrors: 4, prisms: 1, sensors: 3, walls: 3, decoys: 0 },
	expert: { label: 'Expert', size: 8, sources: 2, mirrors: 5, prisms: 2, sensors: 4, walls: 4, decoys: 2 },
};

export const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

export const STEP: readonly (readonly [number, number])[] = [[-1, 0], [0, 1], [1, 0], [0, -1]];

/** `/` then `\`: where an incoming direction bounces to. */
const MIRROR: readonly (readonly Dir[])[] = [[1, 0, 3, 2], [3, 2, 1, 0]];

export interface TrayPiece {
	id: number;
	type: 'mirror' | 'prism';
}

export interface Placement {
	idx: number; // flat cell
	rot: number;
}

export interface SolutionSlot {
	idx: number;
	type: 'mirror' | 'prism';
	rot: number;
}

export interface LumenPuzzle {
	size: number;
	fixed: { idx: number; piece: Piece }[];
	tray: TrayPiece[]; // shuffled; rotations are the player's problem
	solution: SolutionSlot[];
}

export const ROTS: Record<'mirror' | 'prism', number> = { mirror: 2, prism: 4 };

export const rotCW = (type: 'mirror' | 'prism', rot: number): number => (rot + 1) % ROTS[type];

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
	const seen = new Uint8Array(size * size * 4);
	const rays: Ray[] = [];

	for (let i = 0; i < board.length; i++) {
		const p = board[i];
		if (p?.type === 'source')
			rays.push({ r: Math.floor(i / size), c: i % size, d: p.rot as Dir, mask: 7 });
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
			} else if (p.type === 'prism' && d === (p.rot + 2) % 4) {
				// Accepted through the input face: G straight, R left, B right.
				if (mask & 2) rays.push({ r, c, d, mask: 2 });
				if (mask & 1) rays.push({ r, c, d: ((d + 3) % 4) as Dir, mask: 1 });
				if (mask & 4) rays.push({ r, c, d: ((d + 1) % 4) as Dir, mask: 4 });
			}
			break; // wall / source / wrong prism face absorb; the rest re-emitted above
		}
		if (endR !== startR || endC !== startC)
			segments.push({ r0: startR, c0: startC, r1: endR, c1: endC, mask });
	}
	return { segments, sensorMask };
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

	for (let attempt = 0; attempt < 160; attempt++) {
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
	return {
		size,
		fixed: hardPass.fixed,
		tray: order.map((s, id) => ({ id, type: s.type })),
		solution: hardPass.pieces,
	};
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
	for (let s = 0; s < diff.sources; s++) {
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
			board[idx] = { type: 'source', rot: dirs[Math.floor(rng() * dirs.length)], fixed: true };
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
	const putOnBeam = (type: 'mirror' | 'prism'): boolean => {
		for (let tries = 0; tries < 12; tries++) {
			const cells = beamCells();
			const keys = [...cells.keys()];
			if (keys.length === 0) return false;
			const idx = keys[Math.floor(rng() * keys.length)];
			const dirs = cells.get(idx) as Dir[];
			const d = dirs[Math.floor(rng() * dirs.length)];
			// Prism: input face toward the incoming beam, or it would just absorb it.
			const rot = type === 'mirror' ? Math.floor(rng() * 2) : (d + 2) % 4;
			board[idx] = { type, rot, fixed: false };
			// A piece dropped upstream of a placed prism starves it: undo and retry.
			if (prismsAlive()) { pieces.push({ idx, type, rot }); return true; }
			board[idx] = null;
		}
		return false;
	};
	// Prisms first: mirrors then land on coloured beams and route the mixes.
	for (let m = 0; m < diff.prisms; m++) if (!putOnBeam('prism')) return null;
	for (let m = 0; m < diff.mirrors; m++) if (!putOnBeam('mirror')) return null;
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
	for (let s = 0; s < diff.sensors; s++) {
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
		// than sensors remain, drop the sensor where two colours cross and ask for the mix.
		if (spots.size > diff.sensors - s) {
			const cross = new Map<number, Mask[]>();
			for (const seg of t.segments) {
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
			const merges: number[] = [];
			for (const [idx, masks] of cross) {
				const union = masks.reduce((a, b) => a | b, 0);
				if (new Set(masks).size >= 2 && popcount(union) === 2) merges.push(idx);
			}
			if (merges.length > 0 && rng() < 0.85) {
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
	const puzzleLike: LumenPuzzle = { size, fixed, tray: [], solution: [] };
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
	if (deal.pieces.length < diff.mirrors + diff.prisms - 1) return false; // at most one stripped
	if (diff.prisms > 0 && !deal.expects.some((m) => m !== 7 && popcount(m) <= 2)) return false;
	if (diff.size >= 6 && new Set(deal.expects).size < 2) return false;
	if (diff.size >= 7 && !deal.expects.some((m) => popcount(m) === 2)) return false;
	return true;
}

/** Absolute fallback: shrink the ask, then a handmade one-mirror deal. Never spins. */
function desperateDeal(size: number, diff: DiffLevel, rng: Rng): Deal {
	// Stripping the prisms shrinks the ray budget to `sources` — cap sensors with it.
	const easier: DiffLevel = { ...diff, walls: 0, decoys: 0, prisms: 0, sensors: Math.max(1, Math.min(diff.sources, diff.sensors - 1)) };
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
	| { kind: 'remove'; trayIndex: number; reason: string }
	| { kind: 'rotate'; trayIndex: number; rot: number; reason: string }
	| { kind: 'place'; trayIndex: number; idx: number; rot: number; reason: string };

/**
 * The hint repairs the grid before advancing it: first pull back a piece sitting on a
 * wrong cell, then fix a wrong rotation, only then place the next solution piece.
 * Same-type pieces are interchangeable, so two equivalent mirrors never get swapped.
 */
export function findHint(p: LumenPuzzle, placements: (Placement | null)[]): LumenHint | null {
	if (isSolved(p, placements)) return null;

	const slotByIdx = new Map<number, SolutionSlot>();
	for (const s of p.solution) slotByIdx.set(s.idx, s);

	const matched = new Set<number>(); // solution idx already claimed by a placed piece
	let wrongCell = -1, wrongRot = -1;
	for (let i = 0; i < p.tray.length; i++) {
		const pl = placements[i];
		if (!pl) continue;
		const slot = slotByIdx.get(pl.idx);
		if (!slot || slot.type !== p.tray[i].type || matched.has(pl.idx)) {
			if (wrongCell < 0) wrongCell = i;
			continue;
		}
		matched.add(pl.idx);
		if (pl.rot !== slot.rot && wrongRot < 0) wrongRot = i;
	}
	if (wrongCell >= 0)
		return { kind: 'remove', trayIndex: wrongCell, reason: 'Cette pièce n\'est pas à sa place : retour au plateau.' };
	if (wrongRot >= 0) {
		const slot = slotByIdx.get((placements[wrongRot] as Placement).idx) as SolutionSlot;
		return { kind: 'rotate', trayIndex: wrongRot, rot: slot.rot, reason: 'Bonne case, mauvaise orientation : on la tourne.' };
	}

	for (const slot of p.solution) {
		if (matched.has(slot.idx)) continue;
		for (let i = 0; i < p.tray.length; i++) {
			if (placements[i] || p.tray[i].type !== slot.type) continue;
			return { kind: 'place', trayIndex: i, idx: slot.idx, rot: slot.rot, reason: 'Une pièce posée là fait avancer la lumière.' };
		}
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
	if (h.kind === 'remove') next[h.trayIndex] = null;
	else if (h.kind === 'rotate') next[h.trayIndex] = { ...(next[h.trayIndex] as Placement), rot: h.rot };
	else next[h.trayIndex] = { idx: h.idx, rot: h.rot };
	return next;
}
