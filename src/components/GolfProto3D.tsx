import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
	DIFFS,
	PARAMS,
	generateHole,
	stepBall,
	aimToVelocity,
	isSettled,
	type Hole,
	type Ball,
	type Vec,
} from '../games/golf/engine';
import { mulberry32 } from '../games/prng';

/* =====================================================
   MINI-GOLF 3D — proto only, not the shipped game.
   Same engine as /jeux/golf (generateHole + stepBall, untouched): the ball still
   moves in XZ. What changes is the rendering — `hole.alt`, which the game draws
   as a colour ramp, is used here as a real height, and the walls get sides.
   Purpose: judge the tilted camera, and above all measure how often the course
   hides the ball on a phone.
   ===================================================== */

type DiffKey = keyof typeof DIFFS;
const DIFF_ORDER: DiffKey[] = ['facile', 'moyen', 'difficile'];
const MODES: [CamMode, string][] = [
	['fit', 'Trou entier, incliné'],
	['shoulder', "Caméra d'épaule"],
	['top', 'Vue du dessus (jeu actuel)'],
];
const STEP = 1000 / 60;
// A sharp corner reaches bank 1.39 rad/sample, which as a cross slope would be a wall.
// Cap it: past this the turn is banked as hard as it can be drawn.
const BANK_CAP = 0.35;
const WALL_H = 1.4; // wall height above the floor (the game's flat ribbon y)
const GRAB_R = 4.5;
const BALL_VIS = 0.8; // the drawn ball is smaller than the physics one — it read as a boulder
const CUP_D = 1.8; // cup depth — deep enough that the ball visibly disappears into it
const SINK_MS = 420;
const ROCK_H = 1.6;
const LIP = 0.6; // how far the kerb's outer face hangs below the floor
const DECK = 1.3; // bridge deck thickness — below it the arch is open water
const PAVE = 4.5; // paved band around the lane, like the real courses
const APRON = 10; // where the grass bank beyond the paving lands
const DROP = 3.4; // how far that bank falls — also the headroom under the bridge

type CamMode = 'fit' | 'shoulder' | 'top';
interface Cam { pitch: number; dist: number; relief: number; bank: number; zoom: number; mode: CamMode }

/* ---------- authored shapes ----------
   A real hole is short, wide and reads as one clear figure; the engine's random walk
   draws long meandering ribbons instead. These are hand-drawn polylines — the engine
   still does everything else (widths, walls, green, obstacles, relief). */
interface Shape { key: string; label: string; width: number; length: number; ctrl?: Vec[] }

/** Resample a polyline at even arc length, so Catmull sampling and `ds` stay uniform. */
function mkShape(key: string, label: string, width: number, poly: Vec[]): Shape {
	const cum = [0];
	for (let i = 1; i < poly.length; i++)
		cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].z - poly[i - 1].z));
	const length = cum[cum.length - 1];
	const N = 16;
	const ctrl: Vec[] = [];
	for (let k = 0; k <= N; k++) {
		const t = (length * k) / N;
		let i = 1;
		while (i < cum.length - 1 && cum[i] < t) i++;
		const u = (t - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
		ctrl.push({
			x: poly[i - 1].x + (poly[i].x - poly[i - 1].x) * u,
			z: poly[i - 1].z + (poly[i].z - poly[i - 1].z) * u,
		});
	}
	return { key, label, width, length, ctrl };
}

/** Coils in to the middle, where the green sits. Kept narrow so two coils never touch. */
function spiralPoly(): Vec[] {
	const pts: Vec[] = [];
	for (let i = 0; i <= 120; i++) {
		const t = i / 120;
		const a = t * 1.6 * Math.PI * 2;
		const r = 36 + (2 - 36) * t;
		pts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
	}
	return pts;
}

const SHAPES: Shape[] = [
	{ key: 'winding', label: 'Aléatoire (moteur)', width: 0, length: 0 },
	mkShape('straight', 'Ligne droite', 15, [{ x: 0, z: 0 }, { x: 0, z: -64 }]),
	mkShape('elbow', 'Coude', 14, [{ x: 0, z: 0 }, { x: 0, z: -44 }, { x: 44, z: -44 }]),
	mkShape('ess', 'Double virage', 13, [
		{ x: 0, z: 0 }, { x: 0, z: -20 }, { x: 28, z: -36 }, { x: 28, z: -60 }, { x: 0, z: -76 },
	]),
	mkShape('horseshoe', 'Fer à cheval', 13, [
		{ x: 0, z: 0 }, { x: 0, z: -40 }, { x: 17, z: -54 }, { x: 34, z: -40 }, { x: 34, z: -4 },
	]),
	mkShape('spiral', 'Spirale', 8, spiralPoly()),
];

const bankCache = new WeakMap<Hole, number[]>();

/**
 * Smoothed cross slope. Raw `hole.bank` swings sample to sample — on the horseshoe it goes
 * 0.33, 0.13, -0.10, 0.50 — which as a surface came out as a zigzag fan, not a banked turn.
 */
function bankAt(hole: Hole, i: number): number {
	let s = bankCache.get(hole);
	if (!s) {
		const R = 4, n = hole.bank.length;
		s = hole.bank.map((_, k) => {
			let sum = 0, c = 0;
			for (let j = Math.max(0, k - R); j <= Math.min(n - 1, k + R); j++) { sum += hole.bank[j]; c++; }
			return Math.max(-BANK_CAP, Math.min(BANK_CAP, sum / c));
		});
		bankCache.set(hole, s);
	}
	return s[i];
}

/**
 * Lane surface at sample `i`, `u` = lateral position (-1 right … +1 left).
 * The two axes are scaled apart on purpose: `rel` flattens the hole along its length,
 * `bk` keeps the turns banked. The engine already pushes the ball sideways in a turn
 * (its own BANK term) — this is what makes that push visible.
 */
const laneY = (hole: Hole, i: number, u: number, rel: number, bk: number): number =>
	hole.alt[i] * rel - u * bk * bankAt(hole, i);

/** Nearest centerline sample — same lookup stepBall uses for the relief. */
function nearestSample(hole: Hole, x: number, z: number): number {
	let bi = 0, bd = Infinity;
	for (let i = 0; i < hole.path.length; i++) {
		const dx = hole.path[i].x - x, dz = hole.path[i].z - z;
		const dd = dx * dx + dz * dz;
		if (dd < bd) { bd = dd; bi = i; }
	}
	return bi;
}

/** Surface height under any point: lane (banked) outside the green, dish inside it. */
function surfaceY(hole: Hole, x: number, z: number, rel: number, bk: number): number {
	const dCup = Math.hypot(x - hole.cup.x, z - hole.cup.z);
	if (dCup < hole.greenR) {
		const centre = hole.alt[hole.alt.length - 1];
		const rim = hole.alt[hole.cutIdx];
		return (centre + (rim - centre) * (dCup / hole.greenR)) * rel;
	}
	const i = nearestSample(hole, x, z);
	const p = hole.path[i];
	const u = ((x - p.x) * p.nx + (z - p.z) * p.nz) / (hole.widths[i] || 1);
	return laneY(hole, i, Math.max(-1.4, Math.min(1.4, u)), rel, bk);
}

/**
 * Distance that fits the course rectangle in frame. A bounding sphere would waste most
 * of the screen: these holes are long and narrow, and the tilt shortens them further —
 * the along-view extent only costs `sin(pitch)` of screen height.
 */
const CORNERS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function fitDist(cam: THREE.PerspectiveCamera, hx: number, hz: number, pitch: number, az: number): number {
	const ca = Math.cos(az), sa = Math.sin(az);
	let fwd = 0, side = 0;
	for (const [sx, sz] of CORNERS) {
		const dx = sx * hx, dz = sz * hz;
		fwd = Math.max(fwd, Math.abs(dx * ca + dz * sa));
		side = Math.max(side, Math.abs(-dx * sa + dz * ca));
	}
	const vFov = (cam.fov * Math.PI) / 180;
	const hFov = 2 * Math.atan(Math.tan(vFov / 2) * cam.aspect);
	return Math.max(
		(fwd * Math.sin(pitch) * 1.04) / Math.tan(vFov / 2),
		(side * 1.04) / Math.tan(hFov / 2),
		18,
	);
}

const stripGeom = (pos: number[]): THREE.BufferGeometry => {
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.computeVertexNormals();
	return g;
};

/** Lawn height around the course — where the grassy bank lands. */
const groundYOf = (hole: Hole, relief: number): number => Math.min(...hole.alt) * relief - DROP;

function buildHole3D(hole: Hole, relief: number, bankv: number): THREE.Group {
	const grp = new THREE.Group();
	const { path, cutIdx: cut } = hole;
	const W = hole.widths;
	const Y = (a: number) => a * relief; // relief = 0 reproduces today's flat course

	const altMin = Math.min(...hole.alt), altMax = Math.max(...hole.alt);
	const range = altMax - altMin || 1;
	const col = (a: number): [number, number, number] => {
		const t = Math.max(0, Math.min(1, (a - altMin) / range));
		return [0.16 + t * 0.44, 0.42 + t * 0.48, 0.26 + t * 0.4];
	};

	// DoubleSide like the shipped game: the corridor strips wind downward, and three.js
	// flips the normal per-face for lighting only when the material is double-sided.
	const floorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
	const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.8, metalness: 0.02, side: THREE.DoubleSide });
	const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8478, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });

	const centreA = hole.alt[hole.alt.length - 1], rimA = hole.alt[cut];

	// ---- Lane floor: the two edges now sit at different HEIGHTS, so banked turns bank.
	const fpos: number[] = [], fcol: number[] = [];
	const edge = (i: number, side: 1 | -1) => {
		const p = path[i], w = W[i];
		return {
			x: p.x + p.nx * w * side,
			y: laneY(hole, i, side, relief, bankv),
			z: p.z + p.nz * w * side,
			c: col(hole.alt[i]),
		};
	};
	for (let i = 0; i < cut; i++) {
		const lp = edge(i, 1), rp = edge(i, -1), lq = edge(i + 1, 1), rq = edge(i + 1, -1);
		fpos.push(lp.x, lp.y, lp.z, rp.x, rp.y, rp.z, lq.x, lq.y, lq.z);
		fcol.push(...lp.c, ...rp.c, ...lq.c);
		fpos.push(rp.x, rp.y, rp.z, rq.x, rq.y, rq.z, lq.x, lq.y, lq.z);
		fcol.push(...rp.c, ...rq.c, ...lq.c);
	}
	// ---- Throat. The engine seals the corridor mouth to the green opening with two collision
	// walls but no surface, so the lane and the green read as two loose slabs. Fill the gap.
	const gw0 = hole.greenWall[0], gw1 = hole.greenWall[hole.greenWall.length - 1];
	const mouthL = edge(cut, 1), mouthR = edge(cut, -1);
	const openL = Math.hypot(mouthL.x - gw0.x, mouthL.z - gw0.z) <= Math.hypot(mouthL.x - gw1.x, mouthL.z - gw1.z) ? gw0 : gw1;
	const openR = openL === gw0 ? gw1 : gw0;
	const THROAT = 6;
	const thr = (side: 1 | -1, u: number) => {
		const m = side === 1 ? mouthL : mouthR, o = side === 1 ? openL : openR;
		return {
			x: m.x + (o.x - m.x) * u,
			y: m.y + (Y(rimA) - m.y) * u + 0.01,
			z: m.z + (o.z - m.z) * u,
			c: col(rimA),
		};
	};
	for (let k = 0; k < THROAT; k++) {
		const lp = thr(1, k / THROAT), rp = thr(-1, k / THROAT);
		const lq = thr(1, (k + 1) / THROAT), rq = thr(-1, (k + 1) / THROAT);
		fpos.push(lp.x, lp.y, lp.z, rp.x, rp.y, rp.z, lq.x, lq.y, lq.z);
		fcol.push(...lp.c, ...rp.c, ...lq.c);
		fpos.push(rp.x, rp.y, rp.z, rq.x, rq.y, rq.z, lq.x, lq.y, lq.z);
		fcol.push(...rp.c, ...rq.c, ...lq.c);
	}

	const fgeom = new THREE.BufferGeometry();
	fgeom.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
	fgeom.setAttribute('color', new THREE.Float32BufferAttribute(fcol, 3));
	fgeom.computeVertexNormals();
	const floor = new THREE.Mesh(fgeom, floorMat);
	floor.receiveShadow = true;
	grp.add(floor);

	// ---- Green: a real dish, low at the cup and rising to the rim. It starts at the cup
	// radius, not at 0 — a full disc paved over the cup and there was no hole to sink into.
	const RINGS = 12, SEG = 48;
	const gpos: number[] = [], gcol: number[] = [];
	const gp = (ri: number, si: number) => {
		const d = hole.cupR + (ri / RINGS) * (hole.greenR - hole.cupR);
		const ang = (si / SEG) * Math.PI * 2;
		const a = centreA + (rimA - centreA) * (d / hole.greenR);
		return { x: hole.cup.x + Math.cos(ang) * d, y: Y(a) + 0.02, z: hole.cup.z + Math.sin(ang) * d, c: col(a) };
	};
	for (let ri = 0; ri < RINGS; ri++) {
		for (let si = 0; si < SEG; si++) {
			const a = gp(ri, si), b = gp(ri + 1, si), c = gp(ri + 1, si + 1), d = gp(ri, si + 1);
			gpos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
			gcol.push(...a.c, ...b.c, ...c.c);
			gpos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
			gcol.push(...a.c, ...c.c, ...d.c);
		}
	}
	const ggeom = new THREE.BufferGeometry();
	ggeom.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
	ggeom.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
	ggeom.computeVertexNormals();
	const greenMesh = new THREE.Mesh(ggeom, floorMat);
	greenMesh.receiveShadow = true;
	grp.add(greenMesh);

	// ---- Walls: extruded (inner face + top + outer face) instead of a flat ribbon.
	const t = 1.0;
	const wpos: number[] = [];
	const quad = (
		a: [number, number, number], b: [number, number, number],
		c: [number, number, number], d: [number, number, number],
	) => { wpos.push(...a, ...b, ...c, ...a, ...c, ...d); };
	// The kerb hangs a short lip below the floor, then a flat paved band and a grass bank
	// carry the course down to the lawn — the layout of the real courses in the photos.
	// A single skirt to the lowest point turned the hole into a stone block.
	const ppos: number[] = [], apos: number[] = [];
	const push = (
		out: number[], a: [number, number, number], b: [number, number, number],
		c: [number, number, number], d: [number, number, number],
	) => { out.push(...a, ...b, ...c, ...a, ...c, ...d); };
	const aquad = (
		a: [number, number, number], b: [number, number, number],
		c: [number, number, number], d: [number, number, number],
	) => push(apos, a, b, c, d);
	const gy = groundYOf(hole, relief);
	const wallRun = (pts: { ix: number; iz: number; ox: number; oz: number; y: number; over?: boolean }[]) => {
		for (let k = 0; k < pts.length - 1; k++) {
			const p = pts[k], q = pts[k + 1];
			const pt = p.y + WALL_H, qt = q.y + WALL_H;
			// Over the water the flank stops at the deck underside, leaving the arch open.
			const pb = p.over ? p.y - DECK : p.y - LIP, qb = q.over ? q.y - DECK : q.y - LIP;
			quad([p.ix, p.y, p.iz], [p.ix, pt, p.iz], [q.ix, qt, q.iz], [q.ix, q.y, q.iz]); // inner
			quad([p.ix, pt, p.iz], [p.ox, pt, p.oz], [q.ox, qt, q.oz], [q.ix, qt, q.iz]); // top
			quad([p.ox, pb, p.oz], [q.ox, qb, q.oz], [q.ox, qt, q.oz], [p.ox, pt, p.oz]); // outer
			if (p.over || q.over) continue; // no paving or grass over the water
			// Paving then grass bank, both sliding outward along the kerb normal.
			const pd = Math.hypot(p.ox - p.ix, p.oz - p.iz) || 1, qd = Math.hypot(q.ox - q.ix, q.oz - q.iz) || 1;
			const pnx = (p.ox - p.ix) / pd, pnz = (p.oz - p.iz) / pd;
			const qnx = (q.ox - q.ix) / qd, qnz = (q.oz - q.iz) / qd;
			const ppx = p.ox + pnx * PAVE, ppz = p.oz + pnz * PAVE;
			const qpx = q.ox + qnx * PAVE, qpz = q.oz + qnz * PAVE;
			push(ppos, [p.ox, p.y - LIP, p.oz], [ppx, p.y - LIP, ppz], [qpx, q.y - LIP, qpz], [q.ox, q.y - LIP, q.oz]);
			aquad(
				[ppx, p.y - LIP, ppz], [p.ox + pnx * APRON, p.y - DROP, p.oz + pnz * APRON],
				[q.ox + qnx * APRON, q.y - DROP, q.oz + qnz * APRON], [qpx, q.y - LIP, qpz],
			);
		}
	};
	for (const side of [1, -1] as const) {
		const run = [];
		for (let i = 0; i <= cut; i++) {
			const p = path[i], w = W[i];
			run.push({
				ix: p.x + p.nx * w * side, iz: p.z + p.nz * w * side,
				ox: p.x + p.nx * (w + t) * side, oz: p.z + p.nz * (w + t) * side,
				y: laneY(hole, i, side, relief, bankv),
				over: !!hole.bridge && i >= hole.bridge.lo && i <= hole.bridge.hi,
			});
		}
		wallRun(run);
	}
	// Kerb across the throat, so the lane wall runs unbroken into the green ring.
	const kOut = 1 + t / hole.greenR;
	for (const side of [1, -1] as const) {
		const p = path[cut], w = W[cut];
		const o = side === 1 ? openL : openR;
		wallRun([
			{
				ix: p.x + p.nx * w * side, iz: p.z + p.nz * w * side,
				ox: p.x + p.nx * (w + t) * side, oz: p.z + p.nz * (w + t) * side,
				y: laneY(hole, cut, side, relief, bankv),
			},
			{
				ix: o.x, iz: o.z,
				ox: hole.cup.x + (o.x - hole.cup.x) * kOut, oz: hole.cup.z + (o.z - hole.cup.z) * kOut,
				y: Y(rimA),
			},
		]);
	}
	// Tee cap: closes the corridor behind the ball.
	const p0 = path[0], y0 = Y(hole.alt[0]);
	const bx = -p0.dirX * t, bz = -p0.dirZ * t;
	const teeL = { x: p0.x + p0.nx * (W[0] + t), z: p0.z + p0.nz * (W[0] + t) };
	const teeR = { x: p0.x - p0.nx * (W[0] + t), z: p0.z - p0.nz * (W[0] + t) };
	quad([teeL.x, y0 - LIP, teeL.z], [teeL.x, y0 + WALL_H, teeL.z], [teeR.x, y0 + WALL_H, teeR.z], [teeR.x, y0 - LIP, teeR.z]);
	quad([teeL.x, y0 + WALL_H, teeL.z], [teeL.x + bx, y0 + WALL_H, teeL.z + bz], [teeR.x + bx, y0 + WALL_H, teeR.z + bz], [teeR.x, y0 + WALL_H, teeR.z]);
	push(ppos,
		[teeL.x, y0 - LIP, teeL.z], [teeR.x, y0 - LIP, teeR.z],
		[teeR.x + bx * PAVE, y0 - LIP, teeR.z + bz * PAVE], [teeL.x + bx * PAVE, y0 - LIP, teeL.z + bz * PAVE],
	);
	aquad(
		[teeL.x + bx * PAVE, y0 - LIP, teeL.z + bz * PAVE], [teeR.x + bx * PAVE, y0 - LIP, teeR.z + bz * PAVE],
		[teeR.x + bx * APRON, y0 - DROP, teeR.z + bz * APRON], [teeL.x + bx * APRON, y0 - DROP, teeL.z + bz * APRON],
	);

	// Green bumper ring, following the dish rim.
	const gw = hole.greenWall;
	const ringRun = gw.map((p) => {
		const k = 1 + t / hole.greenR;
		return {
			ix: p.x, iz: p.z,
			ox: hole.cup.x + (p.x - hole.cup.x) * k, oz: hole.cup.z + (p.z - hole.cup.z) * k,
			y: Y(rimA),
		};
	});
	wallRun(ringRun);
	const walls = new THREE.Mesh(stripGeom(wpos), wallMat);
	walls.castShadow = true;
	walls.receiveShadow = true;
	grp.add(walls);
	const paving = new THREE.Mesh(stripGeom(ppos), new THREE.MeshStandardMaterial({
		color: 0xa79c8d, roughness: 1, side: THREE.DoubleSide,
	}));
	paving.receiveShadow = true;
	grp.add(paving);
	const apron = new THREE.Mesh(stripGeom(apos), new THREE.MeshStandardMaterial({
		color: 0x3c7040, roughness: 1, side: THREE.DoubleSide,
	}));
	apron.receiveShadow = true;
	grp.add(apron);

	// ---- Cup: a real sunk cylinder, not a dark disc.
	const cupY = Y(centreA) + 0.02;
	grp.userData.cupY = cupY;
	const cupWall = new THREE.Mesh(
		new THREE.CylinderGeometry(hole.cupR, hole.cupR, CUP_D, 28, 1, true),
		new THREE.MeshStandardMaterial({ color: 0x120f0c, roughness: 1, side: THREE.BackSide }),
	);
	cupWall.position.set(hole.cup.x, cupY - CUP_D / 2, hole.cup.z);
	grp.add(cupWall);
	const cupFloor = new THREE.Mesh(
		new THREE.CircleGeometry(hole.cupR, 28),
		new THREE.MeshBasicMaterial({ color: 0x0a0806 }),
	);
	cupFloor.rotation.x = -Math.PI / 2;
	cupFloor.position.set(hole.cup.x, cupY - CUP_D, hole.cup.z);
	grp.add(cupFloor);
	// The rim sits on top of the dish, which now starts at the cup radius — a thin ring at
	// the same height just z-fought with it and the hole lost its edge.
	const cupRing = new THREE.Mesh(
		new THREE.RingGeometry(hole.cupR, hole.cupR + 0.34, 28),
		new THREE.MeshBasicMaterial({ color: 0xf4f0e6, side: THREE.DoubleSide }),
	);
	cupRing.rotation.x = -Math.PI / 2;
	cupRing.position.set(hole.cup.x, cupY + 0.06, hole.cup.z);
	cupRing.renderOrder = 1;
	grp.add(cupRing);

	// ---- Flag: an actual vertical pole, the main landmark once the camera tilts.
	const pole = new THREE.Mesh(
		new THREE.CylinderGeometry(0.09, 0.09, 7, 8),
		new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }),
	);
	pole.position.set(hole.cup.x, cupY + 3.5, hole.cup.z);
	pole.castShadow = true;
	grp.add(pole);
	const cloth = new THREE.Mesh(
		new THREE.PlaneGeometry(2.2, 1.3),
		new THREE.MeshStandardMaterial({ color: 0xff3b30, side: THREE.DoubleSide, roughness: 0.8 }),
	);
	cloth.position.set(hole.cup.x + 1.1, cupY + 6.3, hole.cup.z);
	grp.add(cloth);

	// ---- Obstacles: boxed rocks with sides, so they read as volumes from an angle.
	for (const ob of hole.obstacles) {
		const q = ob.pts;
		const base = q.map((p) => surfaceY(hole, p.x, p.z, relief, bankv));
		const top = q.map((_, i) => base[i] + ROCK_H);
		const opos: number[] = [];
		for (let k = 0; k < 4; k++) {
			const a = q[k], b = q[(k + 1) % 4];
			opos.push(a.x, base[k], a.z, a.x, top[k], a.z, b.x, top[(k + 1) % 4], b.z);
			opos.push(a.x, base[k], a.z, b.x, top[(k + 1) % 4], b.z, b.x, base[(k + 1) % 4], b.z);
		}
		opos.push(q[0].x, top[0], q[0].z, q[1].x, top[1], q[1].z, q[2].x, top[2], q[2].z);
		opos.push(q[0].x, top[0], q[0].z, q[2].x, top[2], q[2].z, q[3].x, top[3], q[3].z);
		const rock = new THREE.Mesh(stripGeom(opos), rockMat);
		rock.castShadow = true;
		rock.receiveShadow = true;
		grp.add(rock);
	}

	// ---- Water + bridge, from the engine's own data (the flat game already draws them).
	// A pond dug under the arch, not a river across the scene: it only has to explain the
	// hump, and a short hole with a river through it looked absurd.
	let stream: { x: number; z: number; r: number } | null = null;
	if (hole.water && hole.bridge) {
		const { lo, hi } = hole.bridge;
		const mid = Math.round((lo + hi) / 2);
		const pm = path[mid];
		// Deck underside, so the arch is a real opening rather than a hole in the wall.
		const spos: number[] = [];
		for (let i = lo; i < hi; i++) {
			const a = edge(i, 1), b = edge(i, -1), c = edge(i + 1, 1), d = edge(i + 1, -1);
			push(spos, [a.x, a.y - DECK, a.z], [b.x, b.y - DECK, b.z], [d.x, d.y - DECK, d.z], [c.x, c.y - DECK, c.z]);
		}
		grp.add(new THREE.Mesh(stripGeom(spos), wallMat));

		const along = Math.hypot(path[hi].x - path[lo].x, path[hi].z - path[lo].z) * 0.5 + 4;
		const across = W[mid] + PAVE + 10;
		grp.userData.pond = { x: pm.x, z: pm.z, r: Math.max(along, across) * 1.12 };
		// The lawn is one big plane we cannot cut, so the basin is built up rather than dug:
		// water just above the grass, held by a low stone kerb.
		const surf = gy + 0.04;
		const kerbTop = gy + 0.55;
		const rim = (ang: number, k: number, y: number): [number, number, number] => [
			pm.x + pm.dirX * along * k * Math.cos(ang) + pm.nx * across * k * Math.sin(ang),
			y,
			pm.z + pm.dirZ * along * k * Math.cos(ang) + pm.nz * across * k * Math.sin(ang),
		];
		stream = { x: pm.x, z: pm.z, r: Math.max(along, across) };
		const SEGP = 32;
		const wp: number[] = [], bp: number[] = [];
		for (let k = 0; k < SEGP; k++) {
			const a0 = (k / SEGP) * Math.PI * 2, a1 = ((k + 1) / SEGP) * Math.PI * 2;
			wp.push(pm.x, surf, pm.z, ...rim(a0, 1, surf), ...rim(a1, 1, surf));
			push(bp, rim(a0, 1, surf), rim(a1, 1, surf), rim(a1, 1, kerbTop), rim(a0, 1, kerbTop));
			push(bp, rim(a0, 1, kerbTop), rim(a1, 1, kerbTop), rim(a1, 1.1, kerbTop), rim(a0, 1.1, kerbTop));
			push(bp, rim(a0, 1.1, kerbTop), rim(a1, 1.1, kerbTop), rim(a1, 1.1, gy - 0.2), rim(a0, 1.1, gy - 0.2));
		}
		grp.add(new THREE.Mesh(stripGeom(bp), new THREE.MeshStandardMaterial({
			color: 0x9d9284, roughness: 1, side: THREE.DoubleSide,
		})));
		grp.add(new THREE.Mesh(stripGeom(wp), new THREE.MeshStandardMaterial({
			color: 0x2f7fd6, roughness: 0.15, metalness: 0.35, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
		})));
	}

	// ---- Planting. At a low camera the course floats on an empty plain. Flowers hug the
	// paving, shrubs sit behind them, trees stay well back — close conifers looked like toys.
	const rnd = mulberry32(hole.par * 7919 + hole.path.length);
	const decor = new THREE.Group();
	decor.name = 'decor'; // kept apart so the occlusion probe can tell course from scenery
	grp.add(decor);
	const icoGeo = new THREE.IcosahedronGeometry(1, 0);
	const shrubMat = new THREE.MeshStandardMaterial({ color: 0x3a6b33, roughness: 1, flatShading: true });
	const darkMat = new THREE.MeshStandardMaterial({ color: 0x27502c, roughness: 1, flatShading: true });
	const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 1 });
	const petalMats = [0xe8556d, 0xf2b134, 0xe8e0f0, 0xc86bd8, 0xf07f3c].map(
		(c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true }),
	);
	const coneGeo = new THREE.ConeGeometry(1, 3, 7);
	const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2, 6);
	const bo = hole.bounds;
	const spanX = bo.maxX - bo.minX, spanZ = bo.maxZ - bo.minZ;
	for (let n = 0; n < 1400; n++) {
		const x = bo.minX - 200 + rnd() * (spanX + 400);
		const z = bo.minZ - 200 + rnd() * (spanZ + 400);
		const i = nearestSample(hole, x, z);
		const clear = Math.min(
			Math.hypot(hole.path[i].x - x, hole.path[i].z - z) - W[i],
			Math.hypot(x - hole.cup.x, z - hole.cup.z) - hole.greenR,
		);
		if (clear < PAVE + 2) continue;
		if (stream && Math.hypot(x - stream.x, z - stream.z) < stream.r * 0.75) continue;
		if (clear < APRON + 7) {
			// Flower bed: a green tuft with a few petals on top.
			const s = 0.7 + rnd() * 0.5;
			const tuft = new THREE.Mesh(icoGeo, shrubMat);
			tuft.scale.set(s, s * 0.6, s);
			tuft.position.set(x, gy + s * 0.3, z);
			decor.add(tuft);
			const mat = petalMats[Math.floor(rnd() * petalMats.length)];
			for (let k = 0; k < 3; k++) {
				const petal = new THREE.Mesh(icoGeo, mat);
				petal.scale.setScalar(0.26 + rnd() * 0.16);
				petal.position.set(x + (rnd() - 0.5) * s * 1.8, gy + s * 0.7 + rnd() * 0.4, z + (rnd() - 0.5) * s * 1.8);
				decor.add(petal);
			}
		} else if (clear < 70) {
			const s = 1.6 + rnd() * 2.6;
			const shrub = new THREE.Mesh(icoGeo, rnd() < 0.5 ? shrubMat : darkMat);
			shrub.scale.set(s, s * 0.8, s);
			shrub.position.set(x, gy + s * 0.55, z);
			shrub.castShadow = true;
			decor.add(shrub);
		} else if (rnd() < 0.45) {
			// A real tree is many times the lane width — at the old scale they read as bushes.
			const s = 7 + rnd() * 7;
			const trunk = new THREE.Mesh(trunkGeo, trunkMat);
			trunk.scale.setScalar(s);
			trunk.position.set(x, gy + s, z);
			decor.add(trunk);
			const crown = new THREE.Mesh(rnd() < 0.45 ? coneGeo : icoGeo, darkMat);
			const round = crown.geometry === icoGeo;
			crown.scale.set(s * 1.5, s * (round ? 1.5 : 1.9), s * 1.5);
			crown.position.set(x, gy + s * 2 + s * (round ? 1.2 : 2.8), z);
			crown.castShadow = true;
			decor.add(crown);
		}
	}

	return grp;
}

export default function GolfProto3D() {
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	const [diff, setDiff] = useState<DiffKey>('moyen');
	const [shape, setShape] = useState('winding');
	const [seed, setSeed] = useState(1337);
	const [cam, setCam] = useState<Cam>({ pitch: 45, dist: 26, relief: 0.1, bank: 5, zoom: 1, mode: 'fit' });
	const [portrait, setPortrait] = useState(false);
	const [strokes, setStrokes] = useState(0);
	const [par, setPar] = useState(0);
	const [sunk, setSunk] = useState(false);
	const [hidden, setHidden] = useState(0); // % of frames where the course masks the ball
	const [deco, setDeco] = useState(0); // … and where only the scenery is in the way
	const [probed, setProbed] = useState(0);

	const camRef = useRef(cam);
	camRef.current = cam;

	const sceneRef = useRef<{
		renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; sun: THREE.DirectionalLight;
		ball: THREE.Mesh; shade: THREE.Mesh; ring: THREE.Mesh; arrow: THREE.Mesh; ground: THREE.Mesh;
		group: THREE.Group | null;
	} | null>(null);
	const holeRef = useRef<Hole | null>(null);
	const ballRef = useRef<Ball>({ x: 0, z: 0, vx: 0, vz: 0 });
	const aimRef = useRef<{ active: boolean; px: number; pz: number }>({ active: false, px: 0, pz: 0 });
	const azRef = useRef(0);
	const fitRef = useRef({ x: 0, y: 0, z: 0, hx: 40, hz: 40, az: 0 }); // bounding box of the hole
	const orbitRef = useRef<{ x: number; az: number } | null>(null);
	const rayRef = useRef(new THREE.Raycaster());
	const occRef = useRef({ hit: 0, deco: 0, total: 0 });
	const sinkRef = useRef<number | null>(null); // RAF timestamp of the drop, null while playing

	/* ---------- scene bootstrap (once) ---------- */
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x87b7e8);
		scene.fog = new THREE.Fog(0x87b7e8, 260, 900);

		const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 1200);
		const amb = new THREE.HemisphereLight(0xffffff, 0x4a6b3a, 1.05);
		scene.add(amb);
		const sun = new THREE.DirectionalLight(0xfff3d6, 1.5);
		sun.position.set(40, 70, 20);
		sun.castShadow = true;
		// The shadow frustum is refitted to each hole; a fixed 200-unit box spread these
		// texels so thin that the ball's own shadow fell between two of them and vanished.
		sun.shadow.mapSize.set(2048, 2048);
		sun.shadow.camera.near = 1;
		sun.shadow.camera.far = 400;
		sun.shadow.normalBias = 0.03;
		scene.add(sun);
		scene.add(sun.target);

		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(900, 900),
			new THREE.MeshStandardMaterial({ color: 0x2f5d33, roughness: 1 }),
		);
		ground.rotation.x = -Math.PI / 2;
		ground.receiveShadow = true;
		scene.add(ground);

		const ball = new THREE.Mesh(
			new THREE.SphereGeometry(PARAMS.ballR * BALL_VIS, 20, 16),
			new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 }),
		);
		ball.castShadow = true;
		scene.add(ball);

		// Painted contact shadow. The cast one comes and goes with the sun angle and the
		// slope; this one is always there, and it is what tells you where the ball sits.
		const shade = new THREE.Mesh(
			new THREE.CircleGeometry(PARAMS.ballR * BALL_VIS * 1.25, 20),
			new THREE.MeshBasicMaterial({ color: 0x0b1a0d, transparent: true, opacity: 0.34, depthWrite: false }),
		);
		shade.rotation.x = -Math.PI / 2;
		shade.renderOrder = 2;
		scene.add(shade);

		const ring = new THREE.Mesh(
			new THREE.RingGeometry(PARAMS.ballR * 1.8, PARAMS.ballR * 2.2, 24),
			new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
		);
		ring.rotation.x = -Math.PI / 2;
		scene.add(ring);

		const ag = new THREE.BufferGeometry();
		ag.setAttribute('position', new THREE.Float32BufferAttribute([
			0, 0, -0.18, 0.8, 0, -0.18, 0.8, 0, 0.18,
			0, 0, -0.18, 0.8, 0, 0.18, 0, 0, 0.18,
			0.74, 0, -0.5, 1.05, 0, 0, 0.74, 0, 0.5,
		], 3));
		const arrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0x30d158, side: THREE.DoubleSide }));
		arrow.visible = false;
		scene.add(arrow);

		sceneRef.current = { renderer, scene, camera, sun, ball, shade, ring, arrow, ground, group: null };

		const resize = () => {
			const w = wrapRef.current;
			if (!w) return;
			const cw = w.clientWidth, ch = w.clientHeight;
			renderer.setSize(cw, ch, false);
			camera.aspect = cw / Math.max(1, ch);
			camera.updateProjectionMatrix();
		};
		resize();
		const ro = new ResizeObserver(resize);
		if (wrapRef.current) ro.observe(wrapRef.current);

		return () => {
			ro.disconnect();
			renderer.dispose();
			sceneRef.current = null;
		};
	}, []);

	/* ---------- (re)build the hole ---------- */
	useEffect(() => {
		const g = sceneRef.current;
		if (!g) return;
		// An authored shape brings its own length and width; the difficulty still sets the
		// cup size, the obstacles and the slopes.
		const sh = SHAPES.find((s) => s.key === shape) ?? SHAPES[0];
		const level = sh.ctrl ? { ...DIFFS[diff], length: sh.length, width: sh.width } : DIFFS[diff];
		const hole = generateHole(mulberry32(seed), level, sh.ctrl);
		holeRef.current = hole;
		ballRef.current = { x: hole.start.x, z: hole.start.z, vx: 0, vz: 0 };
		setStrokes(0);
		setPar(hole.par);
		setSunk(false);
		sinkRef.current = null;
		occRef.current = { hit: 0, deco: 0, total: 0 };
		if (g.group) {
			g.scene.remove(g.group);
			g.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
		}
		const grp = buildHole3D(hole, cam.relief, cam.bank);
		g.scene.add(grp);
		g.group = grp;
		// Sit the surrounding lawn just under the course, else it reads as a floating table.
		g.ground.position.y = groundYOf(hole, cam.relief);

		// The engine's bounds ignore the pond, which the proto adds — widen or it gets cropped.
		const bo = hole.bounds;
		const pond = grp.userData.pond as { x: number; z: number; r: number } | undefined;
		const minX = Math.min(bo.minX, pond ? pond.x - pond.r : Infinity);
		const maxX = Math.max(bo.maxX, pond ? pond.x + pond.r : -Infinity);
		const minZ = Math.min(bo.minZ, pond ? pond.z - pond.r : Infinity);
		const maxZ = Math.max(bo.maxZ, pond ? pond.z + pond.r : -Infinity);
		const fx = (minX + maxX) / 2, fz = (minZ + maxZ) / 2;
		fitRef.current = {
			x: fx, y: surfaceY(hole, fx, fz, cam.relief, cam.bank), z: fz,
			hx: (maxX - minX) / 2 + 3, hz: (maxZ - minZ) / 2 + 3,
			az: Math.atan2(hole.cup.z - hole.start.z, hole.cup.x - hole.start.x),
		};
		g.ground.position.x = fx; g.ground.position.z = fz;

		// Wrap the shadow frustum around this hole only, so its texels stay small.
		const R = Math.max(maxX - minX, maxZ - minZ) / 2 + 14;
		const sc = g.sun.shadow.camera;
		sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R;
		sc.updateProjectionMatrix();
		g.sun.position.set(fx + 40, 70, fz + 20);
		g.sun.target.position.set(fx, 0, fz);
		g.sun.target.updateMatrixWorld();

		azRef.current = fitRef.current.az;
		orbitRef.current = null;
	}, [seed, diff, shape, cam.relief, cam.bank]);

	/* ---------- input ---------- */
	const worldFromPointer = useCallback((cx: number, cy: number, y: number) => {
		const g = sceneRef.current, canvas = canvasRef.current;
		if (!g || !canvas) return null;
		const r = canvas.getBoundingClientRect();
		rayRef.current.setFromCamera(
			new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1)),
			g.camera,
		);
		const hit = new THREE.Vector3();
		// The aim plane rides at the ball's height — on a bumpy course y = 0 would drift.
		if (!rayRef.current.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), hit)) return null;
		return { x: hit.x, z: hit.z };
	}, []);

	/** Pointer-to-ball distance in CSS pixels. */
	const screenDist = useCallback((cx: number, cy: number, x: number, y: number, z: number) => {
		const g = sceneRef.current, canvas = canvasRef.current;
		if (!g || !canvas) return Infinity;
		const r = canvas.getBoundingClientRect();
		const v = new THREE.Vector3(x, y + PARAMS.ballR, z).project(g.camera);
		return Math.hypot(r.left + ((v.x + 1) / 2) * r.width - cx, r.top + ((1 - v.y) / 2) * r.height - cy);
	}, []);

	const onPointerDown = (e: React.PointerEvent) => {
		const hole = holeRef.current, b = ballRef.current;
		if (!hole || sunk || !isSettled(b)) return;
		const c = camRef.current;
		const by = surfaceY(hole, b.x, b.z, c.relief, c.bank) + PARAMS.ballR;
		const w = worldFromPointer(e.clientX, e.clientY, by);
		if (!w) return;
		// Grab in pixels, not world units: framed whole, the hole is far away and a fixed
		// world radius shrinks to a couple of pixels — the ball becomes impossible to grab.
		if (screenDist(e.clientX, e.clientY, b.x, by, b.z) <= 60 || Math.hypot(w.x - b.x, w.z - b.z) <= GRAB_R) {
			aimRef.current = { active: true, px: w.x, pz: w.z };
		} else {
			orbitRef.current = { x: e.clientX, az: azRef.current }; // drag away from the ball = turn around it
		}
		(e.target as Element).setPointerCapture?.(e.pointerId);
	};

	const onPointerMove = (e: React.PointerEvent) => {
		if (orbitRef.current) {
			azRef.current = orbitRef.current.az + (e.clientX - orbitRef.current.x) * 0.008;
			return;
		}
		if (!aimRef.current.active) return;
		const hole = holeRef.current, b = ballRef.current;
		if (!hole) return;
		const c = camRef.current;
		const by = surfaceY(hole, b.x, b.z, c.relief, c.bank) + PARAMS.ballR;
		const w = worldFromPointer(e.clientX, e.clientY, by);
		if (w) aimRef.current = { active: true, px: w.x, pz: w.z };
	};

	const onPointerUp = () => {
		orbitRef.current = null;
		if (!aimRef.current.active) return;
		const b = ballRef.current;
		const v = aimToVelocity({ x: aimRef.current.px - b.x, z: aimRef.current.pz - b.z });
		aimRef.current = { active: false, px: 0, pz: 0 };
		if (!v) return;
		b.vx = v.vx; b.vz = v.vz;
		setStrokes((s) => s + 1);
	};

	/* ---------- loop ---------- */
	useEffect(() => {
		let raf = 0, last = 0, acc = 0;
		const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

		const frame = (now: number) => {
			raf = requestAnimationFrame(frame);
			const g = sceneRef.current, hole = holeRef.current;
			if (!g || !hole) return;
			if (!last) last = now;
			acc += Math.min(now - last, 250);
			last = now;

			// Physics: the untouched 2D engine — only the drawing knows about height.
			while (acc >= STEP) {
				acc -= STEP;
				const r = stepBall(ballRef.current, hole, STEP / 1000);
				ballRef.current = r.ball;
				if (r.sunk) {
					if (sinkRef.current === null) sinkRef.current = now;
					setSunk(true);
				}
			}

			const b = ballRef.current;
			const c = camRef.current;
			const rel = c.relief;
			const by = surfaceY(hole, b.x, b.z, rel, c.bank);
			const vr = PARAMS.ballR * BALL_VIS;
			// Drop into the cup: the engine snaps the ball to the centre and stops it, so all
			// that is left is to let it fall out of sight.
			let ballY = by + vr;
			if (sinkRef.current !== null) {
				const k = Math.min(1, (now - sinkRef.current) / SINK_MS);
				const cupY = (g.group?.userData.cupY as number | undefined) ?? by;
				ballY = by + vr + (cupY - CUP_D + vr - (by + vr)) * (k * k);
			}
			g.ball.position.set(b.x, ballY, b.z);
			g.shade.position.set(b.x, by + 0.05, b.z);
			g.shade.visible = sinkRef.current === null;
			g.ring.position.set(b.x, by + 0.09, b.z);
			g.ring.visible = isSettled(b) && !sunk && !aimRef.current.active;

			// Aim arrow: launch side, length ∝ pull.
			const aim = aimRef.current;
			g.arrow.visible = aim.active;
			if (aim.active) {
				const dx = aim.px - b.x, dz = aim.pz - b.z;
				const mag = Math.hypot(dx, dz) || 1;
				const pw = Math.min(mag, PARAMS.maxPull) / PARAMS.maxPull;
				g.arrow.position.set(b.x, by + 0.35, b.z);
				g.arrow.rotation.y = -Math.atan2(-dz, -dx);
				g.arrow.scale.set(3 + pw * 10, 1, 1 + pw * 1.6);
				(g.arrow.material as THREE.MeshBasicMaterial).color.setHex(
					pw > 0.8 ? 0xff453a : pw > 0.5 ? 0xffd60a : 0x30d158,
				);
			}

			// Camera. `top` and `fit` both frame the whole hole like the shipped game —
			// only the pitch differs, which is exactly the comparison this proto is for.
			// `shoulder` is the other end of the spectrum: close behind the ball.
			const f = fitRef.current;
			if (c.mode === 'shoulder') {
				const i = nearestSample(hole, b.x, b.z);
				const p = hole.path[i];
				const want = Math.atan2(p.dirZ, p.dirX);
				if (!orbitRef.current) {
					let d = ((want - azRef.current + Math.PI) % (Math.PI * 2)) - Math.PI;
					if (d < -Math.PI) d += Math.PI * 2;
					azRef.current += d * 0.03; // ease toward "down the fairway"
				}
				const pitch = (c.pitch * Math.PI) / 180;
				const flat = Math.cos(pitch) * c.dist;
				g.camera.position.set(
					b.x - Math.cos(azRef.current) * flat,
					by + Math.sin(pitch) * c.dist,
					b.z - Math.sin(azRef.current) * flat,
				);
				// Aim ahead of the ball, not at it, so the fairway fills the frame.
				g.camera.lookAt(b.x + Math.cos(azRef.current) * 10, by + 1.2, b.z + Math.sin(azRef.current) * 10);
			} else {
				const pitch = ((c.mode === 'top' ? 89.5 : c.pitch) * Math.PI) / 180;
				const az = c.mode === 'top' ? f.az : azRef.current;
				const place = (d: number, tx: number, ty: number, tz: number) => {
					g.camera.position.set(
						tx - Math.cos(az) * Math.cos(pitch) * d,
						ty + Math.sin(pitch) * d,
						tz - Math.sin(az) * Math.cos(pitch) * d,
					);
					g.camera.lookAt(tx, ty, tz);
					g.camera.updateMatrixWorld();
				};
				// The closed-form fit is only an ortho approximation — under a tilt the near
				// end of the course grows and spills out. Seed with it, then pull back until
				// the four corners actually project inside the frame.
				let d = fitDist(g.camera, f.hx, f.hz, pitch, az);
				for (let it = 0; it < 4; it++) {
					place(d, f.x, f.y, f.z);
					let m = 0;
					for (const [sx, sz] of CORNERS) {
						tmpC.set(f.x + sx * f.hx, f.y, f.z + sz * f.hz).project(g.camera);
						m = Math.max(m, Math.abs(tmpC.x), Math.abs(tmpC.y));
					}
					d *= Math.max(0.6, Math.min(1.8, m / 0.94));
				}
				// Zoom follows the ball, but the target is held near the course so the frame
				// never wanders off into the lawn. At zoom 1 the range collapses onto the fit
				// centre, which is exactly the framing above. The 1.5 lets the view hang a
				// little past the edge — otherwise a ball on the tee sits pinned to the bottom.
				const zf = Math.max(1, c.zoom);
				const cl = (v: number, mid: number, half: number) => {
					const r = Math.min(half, half * (1 - 1 / zf) * 1.5);
					return Math.max(mid - r, Math.min(mid + r, v));
				};
				place(
					d / zf,
					cl(b.x, f.x, f.hx), f.y + (by - f.y) * (1 - 1 / zf), cl(b.z, f.z, f.hz),
				);
			}

			// Occlusion probe. Course and scenery are counted apart: a course that hides the
			// ball is a dead end, scenery in the way is just a placement rule.
			// Only a blocker well clear of the ball counts — the lawn the ball rests on is
			// always grazed by a low camera and would score every frame as a false positive.
			if (g.group && c.mode !== 'top') {
				tmpA.copy(g.camera.position);
				tmpB.set(b.x, by + PARAMS.ballR * 2, b.z).sub(tmpA);
				const dist = tmpB.length();
				rayRef.current.set(tmpA, tmpB.normalize());
				const blocked = (objs: THREE.Object3D[]) => {
					const h = rayRef.current.intersectObjects(objs, true);
					return h.length > 0 && h[0].distance < dist - 2.5;
				};
				const kids = g.group.children;
				const o = occRef.current;
				o.total++;
				if (blocked(kids.filter((k) => k.name !== 'decor'))) o.hit++;
				else if (blocked(kids.filter((k) => k.name === 'decor'))) o.deco++;
			}

			// Where the ball landed on screen, in canvas pixels. The snapshot harness aims its
			// drags with it — a fixed screen point misses as soon as the framing zooms.
			tmpC.set(b.x, ballY, b.z).project(g.camera);
			(window as unknown as Record<string, unknown>).__gpBall = {
				x: ((tmpC.x + 1) / 2) * g.renderer.domElement.clientWidth,
				y: ((1 - tmpC.y) / 2) * g.renderer.domElement.clientHeight,
			};

			g.renderer.render(g.scene, g.camera);
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	}, [sunk]);

	// Occlusion readout, refreshed once a second (a per-frame setState would thrash).
	useEffect(() => {
		const id = setInterval(() => {
			const o = occRef.current;
			setHidden(o.total ? Math.round((o.hit / o.total) * 100) : 0);
			setDeco(o.total ? Math.round((o.deco / o.total) * 100) : 0);
			setProbed(o.total);
		}, 1000);
		return () => clearInterval(id);
	}, []);

	// A reading only means something for one camera — start over when it changes.
	useEffect(() => {
		occRef.current = { hit: 0, deco: 0, total: 0 };
	}, [cam.mode, cam.pitch, cam.dist, cam.zoom, portrait]);

	const set = (patch: Partial<Cam>) => setCam((c) => ({ ...c, ...patch }));

	return (
		<div className="gp-root">
			<style>{CSS}</style>

			<div className={`gp-stage ${portrait ? 'portrait' : ''}`} ref={wrapRef}>
				<canvas
					ref={canvasRef}
					className="gp-canvas"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
				/>
				<div className="gp-hud">
					<span className="gp-chip">Coups {strokes} · Par {par || '—'}</span>
					<span className={`gp-chip ${hidden > 12 ? 'warn' : ''}`}>Parcours masque {hidden}%</span>
					<span className={`gp-chip ${deco > 12 ? 'warn' : ''}`}>Décor masque {deco}% ({probed} img)</span>
					{sunk && <span className="gp-chip win">Dans le trou !</span>}
				</div>
			</div>

			<div className="gp-panel">
				<div className="gp-row">
					{MODES.map(([k, label]) => (
						<button key={k} className={`gp-btn ${cam.mode === k ? 'on' : ''}`} onClick={() => set({ mode: k })}>
							{label}
						</button>
					))}
					<button className="gp-btn" onClick={() => setPortrait((p) => !p)}>
						{portrait ? 'Format large' : 'Format téléphone'}
					</button>
					<button className="gp-btn" onClick={() => setSeed(Math.floor(Math.random() * 2 ** 31))}>
						Nouveau trou
					</button>
					{DIFF_ORDER.map((k) => (
						<button key={k} className={`gp-btn ${diff === k ? 'on' : ''}`} onClick={() => setDiff(k)}>
							{DIFFS[k].label}
						</button>
					))}
				</div>
				<div className="gp-row">
					<span className="gp-lab">Forme</span>
					{SHAPES.map((s) => (
						<button key={s.key} className={`gp-btn ${shape === s.key ? 'on' : ''}`} onClick={() => setShape(s.key)}>
							{s.label}
						</button>
					))}
				</div>
				<div className="gp-row">
					<label className="gp-slider">
						Inclinaison <b>{cam.pitch}°</b>
						<input type="range" min="12" max="85" value={cam.pitch} disabled={cam.mode === 'top'}
							onChange={(e) => set({ pitch: +e.target.value })} />
					</label>
					<label className="gp-slider">
						Recul <b>{cam.dist}</b>
						<input type="range" min="12" max="60" value={cam.dist} disabled={cam.mode !== 'shoulder'}
							onChange={(e) => set({ dist: +e.target.value })} />
					</label>
					<label className="gp-slider">
						Zoom <b>{cam.zoom.toFixed(1)}×</b>
						<input type="range" min="1" max="6" step="0.1" value={cam.zoom} disabled={cam.mode === 'shoulder'}
							onChange={(e) => set({ zoom: +e.target.value })} />
					</label>
				</div>
				<div className="gp-row">
					<label className="gp-slider">
						Relief <b>{cam.relief.toFixed(1)}×</b>
						<input type="range" min="0" max="2" step="0.1" value={cam.relief}
							onChange={(e) => set({ relief: +e.target.value })} />
					</label>
					<label className="gp-slider">
						Dévers <b>{cam.bank}</b>
						<input type="range" min="0" max="10" step="1" value={cam.bank}
							onChange={(e) => set({ bank: +e.target.value })} />
					</label>
				</div>
				<p className="gp-note">
					Tire depuis la balle pour viser (comme dans le jeu), glisse ailleurs pour tourner le trou.
					Le moteur est celui de <a href="/jeux/golf/">/jeux/golf</a>, inchangé : la balle reste en 2D,
					seul l'affichage lit l'altitude. <b>Relief 0×</b> = la géométrie plate d'aujourd'hui, juste
					vue de biais. <b>Dévers</b> incline la piste dans les virages : la poussée latérale existe
					déjà dans le moteur, ce réglage la rend visible. <b>Balle masquée</b> compte les images où
					le décor cache la balle — c'est le vrai risque du passage en 3D sur téléphone.
				</p>
			</div>
		</div>
	);
}

const CSS = `
.gp-root { width: 100%; max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
.gp-stage { position: relative; width: 100%; aspect-ratio: 16 / 10; border-radius: 14px; overflow: hidden; background: #87b7e8; box-shadow: var(--shadow-md); }
.gp-stage.portrait { max-width: 390px; margin: 0 auto; aspect-ratio: 390 / 620; }
.gp-canvas { width: 100%; height: 100%; display: block; touch-action: none; }
.gp-hud { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; gap: 6px; flex-wrap: wrap; pointer-events: none; }
.gp-chip { background: rgba(10,14,20,0.6); color: #eef4fb; font-size: 12.5px; font-weight: 600; padding: 5px 12px; border-radius: 999px; backdrop-filter: blur(4px); font-variant-numeric: tabular-nums; }
.gp-chip.warn { background: rgba(200,60,40,0.78); }
.gp-chip.win { background: rgba(48,209,88,0.85); color: #06210f; }
.gp-panel { display: flex; flex-direction: column; gap: 10px; }
.gp-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.gp-btn { border: 1.5px solid var(--gray-700); background: var(--gray-999_40); color: var(--gray-100); font: inherit; font-size: 13px; font-weight: 600; border-radius: 999px; padding: 7px 14px; cursor: pointer; }
.gp-btn:hover { border-color: var(--accent-regular); color: var(--gray-0); }
.gp-btn.on { background: var(--accent-regular); border-color: var(--accent-regular); color: var(--accent-text-over); }
.gp-lab { font-size: 13px; color: var(--gray-300); }
.gp-slider { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--gray-300); }
.gp-slider b { color: var(--gray-100); font-variant-numeric: tabular-nums; min-width: 3.2em; }
.gp-slider input { width: 130px; }
.gp-note { font-size: 13px; line-height: 1.6; color: var(--gray-300); margin: 0; max-width: 70ch; }
.gp-note b { color: var(--gray-100); }
`;
