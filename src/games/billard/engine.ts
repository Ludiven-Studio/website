/**
 * BILLARD — pure engine (no UI). Top-down pool: pot the 3 colour balls with the
 * cue ball. Slingshot aim, cushion rebounds, elastic ball-ball collisions, pockets.
 * If the cue ball is potted ("scratch") it returns to its start (+1 stroke penalty,
 * handled by the UI). Seeded rack for the daily challenge. Distances in table units.
 */

import type { Rng } from '../prng';
import { encodePacked, decodePacked } from '../../lib/scoreFormat';

export interface Vec { x: number; y: number; }

export interface Ball {
	x: number;
	y: number;
	vx: number;
	vy: number;
	r: number;
	kind: 'cue' | 'color';
	color: number; // colour index for 'color' balls, -1 for the cue
	potted: boolean;
}

export interface Pocket {
	x: number; // mouth centre (nudged inward from the rail)
	y: number;
	r: number; // mouth radius (drawn + used for capture)
	anchor: Vec; // the true corner / edge point on the rail
}

export interface Table {
	w: number;
	h: number;
	pockets: Pocket[];
	cueStart: Vec;
}

export const BALL_R = 3.2;
export const POCKET_R = 5.12; // base size; mouth radii are derived from it (−20% for smaller holes)
const VR = POCKET_R * 1.6; // base mouth radius before per-pocket scaling
const MOUTH = VR * 0.8 * 0.9 + 1; // cushion gap half-width (≈ corner mouth)
const DECEL = 38; // rolling friction (units/s²) — lower = more inertia / longer roll
const CUSHION_REST = 0.85; // cushion energy kept
const BALL_REST = 0.97; // ball-ball restitution
const SETTLE = 2.4; // speed below which a ball is "at rest"
const MIN_PULL = 3;
const MAX_PULL = 36; // shorter drag reaches full power
const MAX_SPEED = 195;

const len = (x: number, y: number) => Math.hypot(x, y);

function makePocket(ax: number, ay: number, w: number, h: number): Pocket {
	const r = VR * 0.7 * 0.9; // uniform hole size: corners = sides
	const k = 0.5; // inset from the rails → corners pulled toward the centre, same inset as the side pockets (aligned)
	const ox = ax === 0 ? r * k : ax === w ? -r * k : 0;
	const oy = ay === 0 ? r * k : ay === h ? -r * k : 0;
	return { x: ax + ox, y: ay + oy, r, anchor: { x: ax, y: ay } };
}

export function makeTable(): Table {
	const w = 200, h = 100;
	return {
		w, h, cueStart: { x: 50, y: 50 },
		pockets: [
			makePocket(0, 0, w, h), makePocket(w, 0, w, h), makePocket(0, h, w, h), makePocket(w, h, w, h),
			makePocket(w / 2, 0, w, h), makePocket(w / 2, h, w, h),
		],
	};
}

/* ---------- Difficulty / rack generation ---------- */

export interface DiffLevel {
	label: string;
	balls: number; // number of colour balls to pot
	spread: number; // min separation between balls
	nearCushion: boolean; // allow balls close to the rails
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', balls: 3, spread: 26, nearCushion: false },
	moyen: { label: 'Moyen', balls: 4, spread: 20, nearCushion: false },
	difficile: { label: 'Difficile', balls: 5, spread: 14, nearCushion: true },
	expert: { label: 'Expert', balls: 6, spread: 10, nearCushion: true },
};

const nearPocket = (x: number, y: number, t: Table) =>
	t.pockets.some((p) => len(x - p.anchor.x, y - p.anchor.y) < p.r + BALL_R + 6);

/** Cue ball + `diff.balls` colour balls, seeded, no overlap, inside the cloth, off the pockets. */
export function generateRack(table: Table, rng: Rng, diff: DiffLevel): Ball[] {
	const cue: Ball = { x: table.cueStart.x, y: table.cueStart.y, vx: 0, vy: 0, r: BALL_R, kind: 'cue', color: -1, potted: false };
	const balls: Ball[] = [cue];
	const mX = diff.nearCushion ? BALL_R + 3 : 18;
	const mY = diff.nearCushion ? BALL_R + 3 : 14;
	const xMin = Math.max(mX, table.w * 0.42), xMax = table.w - mX;
	const yMin = mY, yMax = table.h - mY;
	const hardSep = 2 * BALL_R + 1.5; // bare minimum so balls never overlap

	for (let color = 0; color < diff.balls; color++) {
		let spot: Vec | null = null;
		for (let tries = 0; tries < 500; tries++) {
			const x = xMin + rng() * (xMax - xMin);
			const y = yMin + rng() * (yMax - yMin);
			if (nearPocket(x, y, table)) continue;
			const minSep = tries < 260 ? diff.spread : hardSep; // relax to "just no overlap"
			if (balls.some((b) => len(b.x - x, b.y - y) < minSep)) continue;
			spot = { x, y };
			break;
		}
		if (!spot) {
			// deterministic last resort: scan a grid for any free, non-overlapping cell
			scan: for (let gy = yMin; gy <= yMax; gy += hardSep)
				for (let gx = xMin; gx <= xMax; gx += hardSep) {
					if (nearPocket(gx, gy, table)) continue;
					if (balls.some((b) => len(b.x - gx, b.y - gy) < hardSep)) continue;
					spot = { x: gx, y: gy };
					break scan;
				}
		}
		if (!spot) spot = { x: xMin, y: yMin };
		balls.push({ x: spot.x, y: spot.y, vx: 0, vy: 0, r: BALL_R, kind: 'color', color, potted: false });
	}
	return balls;
}

/**
 * Standard 8-ball rack: cue on the head spot + 15 numbered balls in a triangle at the foot spot.
 * The ball NUMBER (1-15) is stored in `color` (1-7 solids, 8 black, 9-15 stripes). Official
 * constraints: the 8 in the centre of the 3rd row, the two back corners one solid + one stripe,
 * the rest seeded-shuffled. Deterministic given `rng`, on a fixed grid (no anti-overlap loop).
 */
export function generateRack8(table: Table, rng: Rng): Ball[] {
	const EPS = 0.1; // touching-but-not-overlapping spacing
	const rowDX = Math.sqrt(3) * (BALL_R + EPS / 2);
	const dy = 2 * BALL_R + EPS;
	const apexX = table.w * 0.72, cy = table.h / 2; // apex on the foot spot, opening toward the foot rail
	const slots: { x: number; y: number; row: number; k: number }[] = [];
	for (let row = 0; row < 5; row++)
		for (let k = 0; k <= row; k++)
			slots.push({ x: apexX + row * rowDX, y: cy + (k - row / 2) * dy, row, k });

	const shuffle = (arr: number[]): number[] => { // seeded Fisher-Yates
		for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
		return arr;
	};
	const solids = [1, 2, 3, 4, 5, 6, 7];
	const stripes = [9, 10, 11, 12, 13, 14, 15];
	const backSolid = solids.splice(Math.floor(rng() * solids.length), 1)[0];
	const backStripe = stripes.splice(Math.floor(rng() * stripes.length), 1)[0];
	const cornerSolidLeft = rng() < 0.5;
	const rest = shuffle([...solids, ...stripes]); // the remaining 12 numbers

	const idx = (row: number, k: number) => slots.findIndex((s) => s.row === row && s.k === k);
	const num = new Array<number>(slots.length).fill(-1);
	num[idx(2, 1)] = 8; // 8 in the centre of the third row
	num[idx(4, 0)] = cornerSolidLeft ? backSolid : backStripe;
	num[idx(4, 4)] = cornerSolidLeft ? backStripe : backSolid;
	let ri = 0;
	for (let i = 0; i < slots.length; i++) if (num[i] === -1) num[i] = rest[ri++];

	const cue: Ball = { x: table.cueStart.x, y: table.cueStart.y, vx: 0, vy: 0, r: BALL_R, kind: 'cue', color: -1, potted: false };
	const balls: Ball[] = [cue];
	for (let i = 0; i < slots.length; i++)
		balls.push({ x: slots[i].x, y: slots[i].y, vx: 0, vy: 0, r: BALL_R, kind: 'color', color: num[i], potted: false });
	return balls;
}

/* ---------- Physics ---------- */

const inMouthY = (y: number, h: number) => y < MOUTH || y > h - MOUTH; // corner pockets on side rails
const inMouthX = (x: number, w: number) => x < MOUTH || x > w - MOUTH || Math.abs(x - w / 2) < MOUTH;

/** Reflect off the cushions; returns true if a cushion actually bounced the ball (for the
 *  8-ball "a ball must reach a rail" rule — the caller gates it on contact). */
function reflectWalls(b: Ball, t: Table, impacts?: Impact[]): boolean {
	const r = b.r;
	let bounced = false;
	if (b.x < r && b.vx < 0 && !inMouthY(b.y, t.h)) { impacts?.push({ kind: 'rail', x: r, y: b.y, speed: -b.vx }); b.x = r; b.vx = -b.vx * CUSHION_REST; bounced = true; }
	else if (b.x > t.w - r && b.vx > 0 && !inMouthY(b.y, t.h)) { impacts?.push({ kind: 'rail', x: t.w - r, y: b.y, speed: b.vx }); b.x = t.w - r; b.vx = -b.vx * CUSHION_REST; bounced = true; }
	if (b.y < r && b.vy < 0 && !inMouthX(b.x, t.w)) { impacts?.push({ kind: 'rail', x: b.x, y: r, speed: -b.vy }); b.y = r; b.vy = -b.vy * CUSHION_REST; bounced = true; }
	else if (b.y > t.h - r && b.vy > 0 && !inMouthX(b.x, t.w)) { impacts?.push({ kind: 'rail', x: b.x, y: t.h - r, speed: b.vy }); b.y = t.h - r; b.vy = -b.vy * CUSHION_REST; bounced = true; }
	// safety: a ball that missed the throat shouldn't escape forever
	const M = POCKET_R + r;
	if (b.x < -M) { b.x = -M; b.vx = Math.abs(b.vx) * CUSHION_REST; }
	else if (b.x > t.w + M) { b.x = t.w + M; b.vx = -Math.abs(b.vx) * CUSHION_REST; }
	if (b.y < -M) { b.y = -M; b.vy = Math.abs(b.vy) * CUSHION_REST; }
	else if (b.y > t.h + M) { b.y = t.h + M; b.vy = -Math.abs(b.vy) * CUSHION_REST; }
	return bounced;
}

/** Push a ball back inside the cushions (position only, no bounce). The safety net for embedding
 *  that reflectWalls misses: a ball shoved into a rail by a collision (which resolves overlaps
 *  without any wall clamp) and then at rest — reflectWalls only clamps a ball moving INTO the wall.
 *  Skips the pocket mouths so balls can still drop. */
function clampInside(b: Ball, t: Table): void {
	const r = b.r;
	if (!inMouthY(b.y, t.h)) { if (b.x < r) b.x = r; else if (b.x > t.w - r) b.x = t.w - r; }
	if (!inMouthX(b.x, t.w)) { if (b.y < r) b.y = r; else if (b.y > t.h - r) b.y = t.h - r; }
}

/** Resolve a ball-ball collision; returns the closing speed (0 = no impulse applied). */
function collide(a: Ball, b: Ball): number {
	const dx = b.x - a.x, dy = b.y - a.y;
	const d = len(dx, dy);
	const min = a.r + b.r;
	if (d <= 0 || d >= min) return 0;
	const nx = dx / d, ny = dy / d;
	const overlap = (min - d) / 2;
	a.x -= nx * overlap; a.y -= ny * overlap;
	b.x += nx * overlap; b.y += ny * overlap;
	const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
	if (vn >= 0) return 0; // separating
	const imp = (-(1 + BALL_REST) * vn) / 2; // equal masses
	a.vx -= imp * nx; a.vy -= imp * ny;
	b.vx += imp * nx; b.vy += imp * ny;
	return -vn;
}

/** A contact the render layer may want to dramatise. Purely observational: reporting them
 *  changes nothing in the simulation, so lockstep peers stay bit-identical. */
export interface Impact {
	kind: 'ball' | 'rail' | 'pocket';
	x: number;
	y: number;
	speed: number; // closing / entry speed (units/s)
}

export interface StepResult {
	balls: Ball[];
	pottedColors: number[];
	scratched: boolean;
	// 8-ball foul reporting (Défi / tests ignore these). Per-call; the game accumulates over a shot.
	firstHit: number | null; // color/number of the FIRST object ball the cue touched this call
	railHit: boolean; // did any ball bounce off a cushion this call (unconditional)
}

/** Advance the simulation by `dt` seconds (sub-stepped to avoid tunnelling).
 *  `impacts` (optional out-array) collects every contact for FX — free when omitted. */
export function stepBalls(balls: Ball[], table: Table, dt: number, impacts?: Impact[]): StepResult {
	const pottedColors: number[] = [];
	let scratched = false;
	let firstHit: number | null = null;
	let railHit = false;
	const active = balls.filter((b) => !b.potted);
	let maxV = 0;
	for (const b of active) maxV = Math.max(maxV, len(b.vx, b.vy));
	const steps = Math.max(1, Math.ceil((maxV * dt) / (BALL_R * 0.5)));
	const h = dt / steps;

	for (let s = 0; s < steps; s++) {
		for (const b of active) {
			if (b.potted) continue;
			b.x += b.vx * h;
			b.y += b.vy * h;
			if (reflectWalls(b, table, impacts)) railHit = true;
		}
		for (let i = 0; i < active.length; i++)
			for (let j = i + 1; j < active.length; j++) {
				const a = active[i], b = active[j];
				if (a.potted || b.potted) continue;
				const sp = collide(a, b);
				if (sp <= 0) continue;
				impacts?.push({ kind: 'ball', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, speed: sp });
				if (firstHit === null) {
					// Record the first object ball the CUE touches (for the "hit own group first" rule).
					if (a.kind === 'cue' && b.kind === 'color') firstHit = b.color;
					else if (b.kind === 'cue' && a.kind === 'color') firstHit = a.color;
				}
			}
		// Undo any rail penetration a collision just caused, so no ball ends the step embedded.
		for (const b of active) if (!b.potted) clampInside(b, table);
		for (const b of active) {
			if (b.potted) continue;
			const sp = len(b.vx, b.vy);
			if (sp > 0) {
				const ns = Math.max(0, sp - DECEL * h);
				const k = ns / sp;
				b.vx *= k; b.vy *= k;
			}
		}
		for (const b of active) {
			if (b.potted) continue;
			for (const p of table.pockets) {
				// drop once the ball is ~half into the mouth (centre within r + half a ball)
				if (len(b.x - p.x, b.y - p.y) < p.r + b.r * 0.5) {
					impacts?.push({ kind: 'pocket', x: p.anchor.x, y: p.anchor.y, speed: len(b.vx, b.vy) });
					b.potted = true; b.vx = 0; b.vy = 0;
					if (b.kind === 'cue') scratched = true;
					else pottedColors.push(b.color);
					break;
				}
			}
		}
	}
	return { balls, pottedColors, scratched, firstHit, railHit };
}

/** Slingshot: shoot opposite the pull; power ∝ pull length, capped. */
export function aimToVelocity(pull: Vec): { vx: number; vy: number } | null {
	const m = len(pull.x, pull.y);
	if (m < MIN_PULL) return null;
	const sp = (Math.min(m, MAX_PULL) / MAX_PULL) * MAX_SPEED;
	return { vx: (-pull.x / m) * sp, vy: (-pull.y / m) * sp };
}

/** Normalised pull power 0..1 (for the UI gauge). */
export const pullPower = (pull: Vec): number => Math.min(len(pull.x, pull.y), MAX_PULL) / MAX_PULL;

export const isSettled = (balls: Ball[]): boolean =>
	balls.every((b) => b.potted || len(b.vx, b.vy) < SETTLE);

/* ---------- Score (strokes + time tiebreak, one ascending number) ---------- */

export function encodeScore(strokes: number, timeSec: number): number {
	return encodePacked(10_000_000, [strokes, Math.min(9_999_999, Math.round(timeSec * 100))]);
}
export function decodeScore(v: number): { strokes: number; timeSec: number } {
	const [strokes, t] = decodePacked(10_000_000, 2, v);
	return { strokes, timeSec: t / 100 };
}
