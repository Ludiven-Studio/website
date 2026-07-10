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
export const POCKET_R = 6.4; // base size; mouth radii are derived from it
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
	const isCorner = (ax === 0 || ax === w) && (ay === 0 || ay === h);
	const r = (isCorner ? VR * 0.8 : VR * 0.7) * 0.9; // corners −20%, sides −30%, all −10%
	const ox = ax === 0 ? r * 0.34 : ax === w ? -r * 0.34 : 0;
	const oy = ay === 0 ? r * 0.34 : ay === h ? -r * 0.34 : 0;
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

/* ---------- Physics ---------- */

const inMouthY = (y: number, h: number) => y < MOUTH || y > h - MOUTH; // corner pockets on side rails
const inMouthX = (x: number, w: number) => x < MOUTH || x > w - MOUTH || Math.abs(x - w / 2) < MOUTH;

function reflectWalls(b: Ball, t: Table) {
	const r = b.r;
	if (b.x < r && b.vx < 0 && !inMouthY(b.y, t.h)) { b.x = r; b.vx = -b.vx * CUSHION_REST; }
	else if (b.x > t.w - r && b.vx > 0 && !inMouthY(b.y, t.h)) { b.x = t.w - r; b.vx = -b.vx * CUSHION_REST; }
	if (b.y < r && b.vy < 0 && !inMouthX(b.x, t.w)) { b.y = r; b.vy = -b.vy * CUSHION_REST; }
	else if (b.y > t.h - r && b.vy > 0 && !inMouthX(b.x, t.w)) { b.y = t.h - r; b.vy = -b.vy * CUSHION_REST; }
	// safety: a ball that missed the throat shouldn't escape forever
	const M = POCKET_R + r;
	if (b.x < -M) { b.x = -M; b.vx = Math.abs(b.vx) * CUSHION_REST; }
	else if (b.x > t.w + M) { b.x = t.w + M; b.vx = -Math.abs(b.vx) * CUSHION_REST; }
	if (b.y < -M) { b.y = -M; b.vy = Math.abs(b.vy) * CUSHION_REST; }
	else if (b.y > t.h + M) { b.y = t.h + M; b.vy = -Math.abs(b.vy) * CUSHION_REST; }
}

function collide(a: Ball, b: Ball) {
	const dx = b.x - a.x, dy = b.y - a.y;
	const d = len(dx, dy);
	const min = a.r + b.r;
	if (d <= 0 || d >= min) return;
	const nx = dx / d, ny = dy / d;
	const overlap = (min - d) / 2;
	a.x -= nx * overlap; a.y -= ny * overlap;
	b.x += nx * overlap; b.y += ny * overlap;
	const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
	if (vn >= 0) return; // separating
	const imp = (-(1 + BALL_REST) * vn) / 2; // equal masses
	a.vx -= imp * nx; a.vy -= imp * ny;
	b.vx += imp * nx; b.vy += imp * ny;
}

export interface StepResult { balls: Ball[]; pottedColors: number[]; scratched: boolean; }

/** Advance the simulation by `dt` seconds (sub-stepped to avoid tunnelling). */
export function stepBalls(balls: Ball[], table: Table, dt: number): StepResult {
	const pottedColors: number[] = [];
	let scratched = false;
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
			reflectWalls(b, table);
		}
		for (let i = 0; i < active.length; i++)
			for (let j = i + 1; j < active.length; j++)
				if (!active[i].potted && !active[j].potted) collide(active[i], active[j]);
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
					b.potted = true; b.vx = 0; b.vy = 0;
					if (b.kind === 'cue') scratched = true;
					else pottedColors.push(b.color);
					break;
				}
			}
		}
	}
	return { balls, pottedColors, scratched };
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
	return encodePacked(100000, [strokes, Math.min(99999, Math.round(timeSec * 10))]);
}
export function decodeScore(v: number): { strokes: number; timeSec: number } {
	const [strokes, t] = decodePacked(100000, 2, v);
	return { strokes, timeSec: t / 10 };
}
