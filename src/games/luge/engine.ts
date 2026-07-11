/**
 * LUGE — endless 3D downhill sled run (pure engine, no rendering).
 * Track-space model: the sled lives in (s, lat) — distance along an infinite
 * procedurally generated centerline + signed lateral offset (positive = left).
 * Segments (80–200 m: straights, curves, ice tunnels, risk/reward forks, icy
 * bobsleigh pipes) are generated deterministically from (seed, index) and
 * chained by an entry pose, so streaming/pruning never changes the world.
 */

import { mulberry32 } from '../prng';

export type SegmentKind = 'straight' | 'curveL' | 'curveR' | 'scurve' | 'tunnel' | 'fork' | 'bob' | 'jump';

/** One centerline sample every SAMPLE_STEP meters (both segment boundaries included). */
export interface TrackSample {
	x: number;
	y: number; // altitude — strictly decreasing forever
	z: number;
	dirX: number; // horizontal unit tangent
	dirZ: number;
	nx: number; // unit left normal
	nz: number;
	width: number; // full rideable width at this sample
	bank: number; // cross-section roll (rad), outside edge raised in curves
}

export interface Obstacle {
	s: number; // local s of the obstacle center in [0, length)
	lat: number;
	r: number; // lateral half-width
	len?: number; // longitudinal extent (elongated ice pillars splitting a tunnel)
	type: 'tree' | 'rock' | 'ice';
}

/** Fork = segment-local split: a separator wedge between a safe and a danger lane. */
export interface ForkInfo {
	danger: 'left' | 'right';
	noseS: number; // local s of the separator nose
	mergeS: number; // local s where lanes merge back
	sepHalfMax: number; // separator half-width once fully grown
	outerSafe: number; // |lat| of the outer wall on the safe side
	outerDanger: number; // |lat| of the outer wall on the danger side (narrow)
	bonus: number; // flat score bonus for surviving the danger lane
}

export interface EntryPose {
	x: number;
	y: number;
	z: number;
	heading: number; // rad, 0 = +x
	startS: number;
	prevKind: SegmentKind; // kind of the previous segment (fork spacing rule)
	bobLeft?: number; // remaining segments in the current bob run (runs are 2-3 long)
	sinceBob?: number; // segments since the last bob run — guarantees one regularly
}

export interface TrackSegment {
	index: number;
	kind: SegmentKind;
	startS: number;
	length: number;
	samples: TrackSample[]; // length/SAMPLE_STEP + 1 rows
	obstacles: Obstacle[];
	tunnel: boolean;
	bob: boolean; // bobsleigh section: icy half-pipe, tight curves, climbable walls
	bobRampIn?: boolean; // first segment of a bob run: walls grow in over bobRampLen
	bobRampOut?: boolean; // last segment of a bob run: walls fade out
	fork?: ForkInfo;
	jump?: { lipS: number; gap: number }; // kicker lip (local s) + pit length to clear
	exit: EntryPose; // entry pose of segment index+1
}

export interface Difficulty {
	vMax: number; // m/s target speed
	curveMax: number; // rad/m max curvature
	obstacleEvery: number; // mean meters between obstacles
	forkChance: number;
	tunnelChance: number;
	bobChance: number;
	jumpChance: number;
	width: number; // full track width
}

export interface StepInput {
	steer: number; // -1..1
}

export type LugeEvent =
	| 'crash'
	| 'gameOver'
	| 'forkNoseHit'
	| 'forkDanger'
	| 'forkSafe'
	| 'forkBonus'
	| 'nearMiss'
	| 'stuck'
	| 'jumpClean'
	| 'jumpShort';

export interface LugeState {
	s: number;
	lat: number;
	latVel: number;
	speed: number; // m/s along track
	lives: number;
	invulnMs: number;
	boostMs: number;
	bonusScore: number;
	score: number; // floor(s) + bonusScore — integer meters
	lane: 'left' | 'right' | null; // side taken inside a fork
	jumpFromS: number | null; // kicker lip (absolute s) while airborne
	jumpToS: number; // where the flight lands (absolute s)
	jumpGapEndS: number; // end of the pit — landing before this is a short jump
	status: 'running' | 'over';
}

export interface LugeParams {
	lives: number;
	startSpeed: number;
	speedRelax: number; // 1/s relaxation toward vMax
	steerAccel: number; // m/s² at full steer
	latFriction: number; // per-frame (60 Hz) lateral velocity retention
	centrifugal: number; // fraction of curvature·v² not absorbed by banking
	bermBounce: number; // lateral velocity restitution on walls
	bermScrub: number; // per-frame speed retention while scraping a wall
	sledHalf: number; // half-width of the sled
	sledReach: number; // longitudinal collision reach
	noseHalf: number; // half-width of the fork separator nose
	crashSpeedMul: number;
	crashMinSpeed: number;
	stuckSpeedMul: number; // wedging into an ice pillar: no life lost, momentum crushed
	stuckMinSpeed: number;
	stuckCooldownMs: number;
	invulnMs: number;
	boostMul: number;
	forkBoostMs: number;
	nearMissGap: number; // extra lateral gap under which a pass counts as near-miss
	nearMissBonus: number;
	forkLaneVMaxMul: number; // the icy danger corridor is itself a speed boost
	jumpKickLen: number; // kicker ramp length (m)
	jumpKickH: number; // lip height — takeoff slope = 2·H/len (quadratic ramp)
	jumpGravity: number; // flight gravity (m/s²) — a bit strong for game scale
	jumpMaxVy: number; // vertical takeoff speed cap (keeps top-speed flights sane)
	jumpBonus: number; // score for clearing the pit
	corridorHalf: number; // guaranteed obstacle-free half-width around latSafe
	bobVMaxFloor: number; // speed multiplier at the flat pipe floor (barely faster)
	bobVMaxMul: number; // speed multiplier at the wall crest — carving high pays
	bobLatFriction: number; // icy pipe slides a lot more
	bobWallExtra: number; // how far the curved wall extends beyond the flat width
	bobWallHeight: number; // wall crest height
	bobFlatFrac: number; // fraction of the half-width that stays flat
	bobWallGravity: number; // restoring pull back to the pipe floor (m/s² per unit slope)
	bobRampLen: number; // meters over which walls grow/fade at a bob run's ends
	tunnelFlatFrac: number; // ice caves: flat icy floor fraction before the climbable wall
	tunnelWallExtra: number; // cave wall lateral extent beyond the floor
	tunnelWallHeight: number; // cave wall crest (stays under the arch shell)
	tunnelVMaxMul: number; // icy cave floor is slightly faster
}

export const LUGE: LugeParams = {
	lives: 3,
	startSpeed: 14,
	speedRelax: 0.4,
	steerAccel: 34,
	latFriction: 0.93,
	centrifugal: 0.5,
	bermBounce: 0.4,
	bermScrub: 0.985,
	sledHalf: 0.5,
	sledReach: 1.2,
	noseHalf: 1.3,
	crashSpeedMul: 0.35,
	crashMinSpeed: 10,
	stuckSpeedMul: 0.25,
	stuckMinSpeed: 6,
	stuckCooldownMs: 1300,
	invulnMs: 2200,
	boostMul: 1.25,
	forkBoostMs: 4000,
	nearMissGap: 0.6,
	nearMissBonus: 2,
	forkLaneVMaxMul: 1.12,
	jumpKickLen: 12,
	jumpKickH: 1.6,
	jumpGravity: 20,
	jumpMaxVy: 8,
	jumpBonus: 10,
	corridorHalf: 1.6,
	bobVMaxFloor: 1.03,
	bobVMaxMul: 1.3,
	bobLatFriction: 0.98,
	bobWallExtra: 3.5,
	bobWallHeight: 3.4,
	bobFlatFrac: 0.45,
	bobWallGravity: 30,
	bobRampLen: 18,
	tunnelFlatFrac: 0.6,
	tunnelWallExtra: 2,
	tunnelWallHeight: 2,
	tunnelVMaxMul: 1.05,
};

export const SAMPLE_STEP = 2; // meters between centerline samples
export const AHEAD = 450; // keep track generated this far ahead
export const BEHIND = 60; // keep this much behind before pruning

const TWO_PI = Math.PI * 2;
const BANK_SCALE = 18; // bank (rad) per unit curvature
const BANK_MAX = 0.45;
const WARMUP_OBSTACLES = 2; // no obstacles before this segment index
const WARMUP_FEATURES = 4; // no fork/tunnel before this segment index
const TUNNEL_MIN_WIDTH = 12.5; // caves widen to this even late in the run (dodging room)

/* ----------------------------- Difficulty ----------------------------- */

/** Smooth monotonic ramp with asymptotic caps — same for everyone at a given s. */
export function difficultyAt(s: number): Difficulty {
	const t = Math.max(0, s);
	const e = (k: number) => 1 - Math.exp(-t / k);
	return {
		vMax: 18 + 42 * e(1600),
		curveMax: 0.008 + 0.014 * e(2000),
		obstacleEvery: 18 + 37 * Math.exp(-t / 1800),
		forkChance: 0.12 + 0.1 * e(2500),
		tunnelChance: 0.1 + 0.08 * e(2500),
		bobChance: 0.13 + 0.05 * e(2500),
		jumpChance: 0.07 + 0.04 * e(2500),
		width: 9 + 5 * Math.exp(-t / 2500),
	};
}

/* ----------------------------- Generation ----------------------------- */

export const INITIAL_ENTRY: EntryPose = { x: 0, y: 0, z: 0, heading: 0, startS: 0, prevKind: 'straight' };

const smoothstep = (a: number, b: number, x: number): number => {
	const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

/**
 * Obstacle-free corridor center at absolute s. Obstacles are always placed
 * at least corridorHalf + r away from it → a passable path always exists.
 */
export function latSafeAt(seed: number, s: number, width: number): number {
	const r = mulberry32(seed >>> 0);
	const p1 = r() * TWO_PI;
	const p2 = r() * TWO_PI;
	const amp = Math.max(0, width / 2 - LUGE.corridorHalf - 0.6);
	return amp * (0.62 * Math.sin(s * 0.011 + p1) + 0.38 * Math.sin(s * 0.023 + p2));
}

/** Quadratic pipe wall: flat floor up to flatFrac of the half-width, then a rising wall. */
function wallShape(width: number, lat: number, flatFrac: number, extra: number, height: number): { rise: number; slope: number } {
	const flatHalf = (width / 2) * flatFrac;
	const a = Math.abs(lat) - flatHalf;
	if (a <= 0) return { rise: 0, slope: 0 };
	const span = width / 2 + extra - flatHalf;
	const c = height / (span * span);
	return { rise: c * a * a, slope: Math.sign(lat) * 2 * c * a };
}

/** Bobsleigh wall profile: flat pipe floor, then a quadratic icy wall. */
export function bobWall(width: number, lat: number, P: LugeParams = LUGE): { rise: number; slope: number } {
	return wallShape(width, lat, P.bobFlatFrac, P.bobWallExtra, P.bobWallHeight);
}

/** Climbable-wall profile of any icy pipe (bob run or cave tunnel); zero elsewhere. */
export function pipeWall(seg: TrackSegment, width: number, lat: number, P: LugeParams = LUGE): { rise: number; slope: number } {
	if (seg.bob) return bobWall(width, lat, P);
	if (seg.tunnel) return wallShape(width, lat, P.tunnelFlatFrac, P.tunnelWallExtra, P.tunnelWallHeight);
	return { rise: 0, slope: 0 };
}

/** Lateral extent of a pipe's climbable wall beyond the floor half-width. */
export const pipeExtra = (seg: TrackSegment, P: LugeParams = LUGE): number =>
	seg.bob ? P.bobWallExtra : seg.tunnel ? P.tunnelWallExtra : 0;

/** Wall scale (0..1) at local s inside a pipe segment — grows/fades at the pipe's ends. */
export function pipeRampAt(seg: TrackSegment, sLocal: number, P: LugeParams = LUGE): number {
	if (seg.bob) {
		let r = 1;
		if (seg.bobRampIn) r = Math.min(r, smoothstep(0, P.bobRampLen, sLocal));
		if (seg.bobRampOut) r = Math.min(r, 1 - smoothstep(seg.length - P.bobRampLen, seg.length, sLocal));
		return r;
	}
	if (seg.tunnel) return Math.min(smoothstep(0, 20, sLocal), 1 - smoothstep(seg.length - 20, seg.length, sLocal));
	return 0;
}

/**
 * Jump segment surface profile: a kicker ramp rising to the lip, a sharp drop
 * into a pit, and a landing ramp climbing back out after the gap.
 * The ramp is a quadratic ease-in: it keeps STEEPENING up to the lip so the sled
 * leaves the ground with real upward velocity (a rounded crest would kill the launch).
 */
export function jumpRiseAt(seg: TrackSegment, sLocal: number): number {
	const j = seg.jump;
	if (!j) return 0;
	if (sLocal <= j.lipS - LUGE.jumpKickLen) return 0;
	if (sLocal <= j.lipS) {
		const u = (sLocal - (j.lipS - LUGE.jumpKickLen)) / LUGE.jumpKickLen;
		return LUGE.jumpKickH * u * u;
	}
	if (sLocal < j.lipS + j.gap) return -0.7;
	return -0.7 * (1 - smoothstep(j.lipS + j.gap, j.lipS + j.gap + 8, sLocal));
}

/** Vertical takeoff speed off the kicker: forward speed × ramp exit slope, capped. */
export function jumpTakeoffVy(speed: number): number {
	return Math.min(LUGE.jumpMaxVy, speed * ((2 * LUGE.jumpKickH) / LUGE.jumpKickLen));
}

/** Ballistic flight length: launch at the lip, land on the pit-floor plane. */
export function jumpFlightDist(speed: number): number {
	const vy = jumpTakeoffVy(speed);
	const drop = LUGE.jumpKickH + 0.7; // lip height down to the pit floor
	const t = (vy + Math.sqrt(vy * vy + 2 * LUGE.jumpGravity * drop)) / LUGE.jumpGravity;
	return speed * t;
}

/** Separator half-width at local s inside a fork segment (0 outside [noseS, mergeS]). */
export function sepHalfAt(fork: ForkInfo, sLocal: number): number {
	if (sLocal < fork.noseS || sLocal >= fork.mergeS) return 0;
	const grow = smoothstep(fork.noseS, fork.noseS + 10, sLocal);
	const shrink = 1 - smoothstep(fork.mergeS - 8, fork.mergeS, sLocal);
	return fork.sepHalfMax * Math.min(grow, shrink);
}

/** Deterministic per-segment rng — independent of how the chain was pruned. */
const segmentRng = (seed: number, index: number) => mulberry32((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);

function pickKind(
	rng: () => number,
	index: number,
	prevKind: SegmentKind,
	bobLeft: number,
	sinceBob: number,
	diff: Difficulty,
): SegmentKind {
	if (bobLeft > 0) return 'bob'; // continue the current bob run
	if (index < WARMUP_FEATURES) return index % 2 === 0 ? 'straight' : rng() < 0.5 ? 'curveL' : 'curveR';
	// Pity timer: never go more than ~8 segments (~900 m) without a bob run.
	if (sinceBob >= 8 && prevKind !== 'fork') return 'bob';
	const p = rng();
	if (p < diff.forkChance && prevKind !== 'fork') return 'fork';
	if (p < diff.forkChance + diff.tunnelChance && prevKind !== 'fork') return 'tunnel';
	if (p < diff.forkChance + diff.tunnelChance + diff.bobChance && prevKind !== 'fork' && prevKind !== 'bob') return 'bob';
	if (p < diff.forkChance + diff.tunnelChance + diff.bobChance + diff.jumpChance && prevKind !== 'fork' && prevKind !== 'jump')
		return 'jump';
	const q = rng();
	if (q < 0.3) return 'straight';
	if (q < 0.55) return 'curveL';
	if (q < 0.8) return 'curveR';
	return 'scurve';
}

export function generateSegment(seed: number, index: number, entry: EntryPose): TrackSegment {
	const rng = segmentRng(seed, index);
	const diff = difficultyAt(entry.startS);
	const kind = pickKind(rng, index, entry.prevKind, entry.bobLeft ?? 0, entry.sinceBob ?? 0, diff);
	// Bob runs span 2-3 segments: a fresh run decides its remaining length here.
	const bobLeft = kind === 'bob' ? ((entry.bobLeft ?? 0) > 0 ? (entry.bobLeft ?? 0) - 1 : rng() < 0.5 ? 1 : 2) : 0;

	// Length per kind, rounded to the sample step.
	const pick = (a: number, b: number) => Math.round((a + rng() * (b - a)) / SAMPLE_STEP) * SAMPLE_STEP;
	const length =
		kind === 'fork'
			? pick(130, 160)
			: kind === 'bob'
				? pick(140, 200)
				: kind === 'tunnel'
					? pick(160, 240)
					: kind === 'jump'
						? pick(100, 140)
						: kind === 'scurve'
							? pick(120, 160)
							: kind === 'straight'
								? pick(80, 140)
								: pick(90, 150);

	// Curvature profile κ(t), t in [0,1].
	const kMax = diff.curveMax * (0.6 + 0.4 * rng());
	const wobblePh = rng() * TWO_PI;
	const tunnelDir = rng() < 0.5 ? 1 : -1;
	const kappa = (t: number): number => {
		switch (kind) {
			case 'curveL':
				return kMax * Math.sin(Math.PI * t);
			case 'curveR':
				return -kMax * Math.sin(Math.PI * t);
			case 'scurve':
				return kMax * 0.9 * Math.sin(TWO_PI * t);
			case 'tunnel':
				return kMax * 0.3 * tunnelDir * Math.sin(Math.PI * t);
			case 'bob':
				// Alternating tight arcs — the icy walls (not steering) absorb the g-forces.
				return kMax * 2.6 * tunnelDir * Math.sin(3 * Math.PI * t) * Math.sin(Math.PI * t);
			case 'fork':
			case 'jump':
				return 0;
			default:
				// sin(πt) envelope → κ (hence bank) is 0 at both ends: seamless segment joints.
				return diff.curveMax * 0.2 * Math.sin(TWO_PI * t + wobblePh) * Math.sin(Math.PI * t);
		}
	};

	// Grade (descent per meter) — always positive → y strictly decreasing.
	const g0 = 0.1 + 0.05 * rng();
	const gradePh = rng() * TWO_PI;
	const grade = (t: number) => g0 + 0.02 * Math.sin(TWO_PI * t + gradePh);

	// Fork geometry (before sampling — samples need the widened width).
	let fork: ForkInfo | undefined;
	const w0 = diff.width;
	const wEnd = difficultyAt(entry.startS + length).width;
	if (kind === 'fork') {
		const sepHalfMax = 1.6;
		fork = {
			danger: rng() < 0.5 ? 'left' : 'right',
			noseS: 30,
			mergeS: length - 30,
			sepHalfMax,
			outerSafe: w0 / 2 + 3.5,
			outerDanger: sepHalfMax + 5.2,
			bonus: 50,
		};
	}
	// Jump: kicker lip at ~45% of the segment; the pit is clearable while cruising
	// (ballistic flight off the ramp) but not after a crash killed the momentum.
	let jump: TrackSegment['jump'];
	if (kind === 'jump') {
		const lipS = Math.round((length * 0.45) / SAMPLE_STEP) * SAMPLE_STEP;
		const gap = Math.min(30, Math.max(8, 0.55 * jumpFlightDist(diff.vMax)));
		jump = { lipS, gap };
	}

	const widthAt = (sLocal: number): number => {
		const base = w0 + (wEnd - w0) * (sLocal / length);
		if (fork) {
			const widen = 2 * fork.outerSafe - base;
			const ramp = Math.min(smoothstep(0, fork.noseS, sLocal), 1 - smoothstep(fork.mergeS, length, sLocal));
			return base + widen * ramp;
		}
		if (kind === 'tunnel') {
			const widen = Math.max(0, TUNNEL_MIN_WIDTH - base);
			const ramp = Math.min(smoothstep(0, 20, sLocal), 1 - smoothstep(length - 20, length, sLocal));
			return base + widen * ramp;
		}
		return base;
	};

	// Integrate the centerline (midpoint heading for clean arcs).
	const n = Math.round(length / SAMPLE_STEP);
	const samples: TrackSample[] = [];
	let x = entry.x;
	let y = entry.y;
	let z = entry.z;
	let heading = entry.heading;
	for (let k = 0; k <= n; k++) {
		const t = k / n;
		const kap = kappa(t);
		const dirX = Math.cos(heading);
		const dirZ = Math.sin(heading);
		samples.push({
			x,
			y,
			z,
			dirX,
			dirZ,
			nx: -dirZ,
			nz: dirX,
			width: widthAt(k * SAMPLE_STEP),
			bank: Math.max(-BANK_MAX, Math.min(BANK_MAX, kap * BANK_SCALE)),
		});
		if (k < n) {
			const headingMid = heading + kap * SAMPLE_STEP * 0.5;
			x += Math.cos(headingMid) * SAMPLE_STEP;
			z += Math.sin(headingMid) * SAMPLE_STEP;
			y -= grade(t) * SAMPLE_STEP;
			heading += kap * SAMPLE_STEP;
		}
	}

	// Obstacles — never inside the safe corridor. None in bob pipes (speed is the challenge).
	const obstacles: Obstacle[] = [];
	if (index >= WARMUP_OBSTACLES && kind !== 'fork' && kind !== 'bob' && kind !== 'jump') {
		const spacingMul = kind === 'tunnel' ? 1.9 : 1;
		// Caves: no pillar right at the mouth — leave time to adapt after entering.
		let sLocal = kind === 'tunnel' ? 30 + rng() * 12 : 8 + rng() * 10;
		while (sLocal < length - 8) {
			const absS = entry.startS + sLocal;
			const hw = widthAt(sLocal) / 2;
			// Tunnels: elongated ice pillars split the passage into rejoining branches.
			const type: Obstacle['type'] = kind === 'tunnel' ? 'ice' : rng() < 0.65 ? 'tree' : 'rock';
			const r = type === 'ice' ? 0.9 + 0.2 * rng() : type === 'tree' ? 0.8 + 0.3 * rng() : 0.9 + 0.5 * rng();
			const len = type === 'ice' ? 4 + rng() * 3 : undefined;
			let lat = -hw + 1 + rng() * (2 * hw - 2);
			const safe = latSafeAt(seed, absS, hw * 2);
			const gap = LUGE.corridorHalf + r;
			if (Math.abs(lat - safe) < gap) {
				const side = lat >= safe ? 1 : -1;
				lat = safe + side * (gap + 0.3);
			}
			if (Math.abs(lat) < hw - 0.6) obstacles.push({ s: sLocal, lat, r, len, type });
			sLocal += difficultyAt(absS).obstacleEvery * spacingMul * (0.7 + 0.6 * rng());
		}
	}
	if (fork) {
		// Danger lane: no obstacles — the washboard bumps (forkBumps) are the price.
		const sign = fork.danger === 'left' ? 1 : -1;
		const span = fork.mergeS - fork.noseS - 30;
		// One optional obstacle on the safe side.
		if (rng() < 0.6) {
			const sLocal = fork.noseS + 20 + rng() * (span - 10);
			const safeSign = -sign;
			obstacles.push({
				s: sLocal,
				lat: safeSign * (fork.sepHalfMax + 1.2 + rng() * (fork.outerSafe - fork.sepHalfMax - 3)),
				r: 0.8,
				type: 'tree',
			});
		}
	}

	const last = samples[n];
	return {
		index,
		kind,
		startS: entry.startS,
		length,
		samples,
		obstacles,
		tunnel: kind === 'tunnel',
		bob: kind === 'bob',
		bobRampIn: kind === 'bob' && entry.prevKind !== 'bob',
		bobRampOut: kind === 'bob' && bobLeft === 0,
		fork,
		jump,
		exit: {
			x: last.x,
			y: last.y,
			z: last.z,
			heading,
			startS: entry.startS + length,
			prevKind: kind,
			bobLeft,
			sinceBob: kind === 'bob' ? 0 : (entry.sinceBob ?? 0) + 1,
		},
	};
}

/** Keep [s − BEHIND, s + AHEAD] covered: append ahead, prune behind. Returns a new array when it changes. */
export function ensureSegments(segs: TrackSegment[], seed: number, s: number): TrackSegment[] {
	let out = segs;
	if (out.length === 0) out = [generateSegment(seed, 0, INITIAL_ENTRY)];
	while (out[out.length - 1].exit.startS < s + AHEAD) {
		const lastSeg = out[out.length - 1];
		out = out === segs ? [...out] : out;
		out.push(generateSegment(seed, lastSeg.index + 1, lastSeg.exit));
	}
	let drop = 0;
	while (drop < out.length - 1 && out[drop].startS + out[drop].length < s - BEHIND) drop++;
	if (drop > 0) out = out.slice(drop);
	return out;
}

/* ----------------------------- Track queries ----------------------------- */

export function segmentAt(segs: TrackSegment[], s: number): TrackSegment {
	for (let i = 0; i < segs.length; i++) {
		const seg = segs[i];
		if (s < seg.startS + seg.length) return seg;
	}
	return segs[segs.length - 1];
}

interface SampleLerp {
	seg: TrackSegment;
	x: number;
	y: number;
	z: number;
	nx: number;
	nz: number;
	dirX: number;
	dirZ: number;
	width: number;
	bank: number;
	curvature: number;
}

function lerpAt(segs: TrackSegment[], s: number): SampleLerp {
	const seg = segmentAt(segs, s);
	const f = Math.max(0, Math.min(seg.samples.length - 1.0001, (s - seg.startS) / SAMPLE_STEP));
	const i = Math.floor(f);
	const u = f - i;
	const a = seg.samples[i];
	const b = seg.samples[Math.min(i + 1, seg.samples.length - 1)];
	const cross = a.dirX * b.dirZ - a.dirZ * b.dirX;
	const dot = a.dirX * b.dirX + a.dirZ * b.dirZ;
	const dirX = a.dirX + (b.dirX - a.dirX) * u;
	const dirZ = a.dirZ + (b.dirZ - a.dirZ) * u;
	const dl = Math.hypot(dirX, dirZ) || 1;
	return {
		seg,
		x: a.x + (b.x - a.x) * u,
		y: a.y + (b.y - a.y) * u,
		z: a.z + (b.z - a.z) * u,
		nx: a.nx + (b.nx - a.nx) * u,
		nz: a.nz + (b.nz - a.nz) * u,
		dirX: dirX / dl,
		dirZ: dirZ / dl,
		width: a.width + (b.width - a.width) * u,
		bank: a.bank + (b.bank - a.bank) * u,
		curvature: Math.atan2(cross, dot) / SAMPLE_STEP,
	};
}

/**
 * World pose for the renderer: centerline lerp + lateral offset along the left normal.
 * `bank` is the surface roll at that lateral position (banked ribbon + bob walls).
 */
export function poseAt(
	segs: TrackSegment[],
	s: number,
	lat: number,
): { x: number; y: number; z: number; heading: number; bank: number; width: number } {
	const p = lerpAt(segs, s);
	let y = p.y - Math.sin(p.bank) * lat;
	let dydlat = -Math.sin(p.bank);
	if (p.seg.bob || p.seg.tunnel) {
		const ramp = pipeRampAt(p.seg, s - p.seg.startS);
		const w = pipeWall(p.seg, p.width, lat);
		y += w.rise * ramp;
		dydlat += w.slope * ramp;
	} else if (p.seg.jump) {
		y += jumpRiseAt(p.seg, s - p.seg.startS);
	}
	return {
		x: p.x + p.nx * lat,
		y,
		z: p.z + p.nz * lat,
		heading: Math.atan2(p.dirZ, p.dirX),
		bank: -Math.atan(dydlat),
		width: p.width,
	};
}

/* ----------------------------- Simulation ----------------------------- */

export function createLuge(): LugeState {
	return {
		s: 0,
		lat: 0,
		latVel: 0,
		speed: LUGE.startSpeed,
		lives: LUGE.lives,
		invulnMs: 0,
		boostMs: 0,
		bonusScore: 0,
		score: 0,
		lane: null,
		jumpFromS: null,
		jumpToS: 0,
		jumpGapEndS: 0,
		status: 'running',
	};
}

/** Advance the sled by dtSec (call at a fixed 60 Hz step). Returns the new state + gameplay events. */
export function stepLuge(
	st: LugeState,
	input: StepInput,
	dtSec: number,
	segs: TrackSegment[],
	P: LugeParams = LUGE,
): { state: LugeState; events: LugeEvent[] } {
	if (st.status === 'over') return { state: st, events: [] };
	const events: LugeEvent[] = [];
	let { lat, latVel, speed, lives, invulnMs, boostMs, bonusScore, lane, jumpFromS, jumpToS, jumpGapEndS } = st;
	let status: LugeState['status'] = 'running';
	const wasAirborne = jumpFromS != null && st.s < jumpToS;

	invulnMs = Math.max(0, invulnMs - dtSec * 1000);
	boostMs = Math.max(0, boostMs - dtSec * 1000);

	const collide = (): boolean => {
		if (invulnMs > 0) return false;
		lives -= 1;
		speed = Math.max(P.crashMinSpeed, speed * P.crashSpeedMul);
		invulnMs = P.invulnMs;
		events.push('crash');
		if (lives <= 0) {
			status = 'over';
			events.push('gameOver');
		}
		return true;
	};

	// Forward speed relaxes toward the difficulty ramp (boost multiplies the target).
	// In a bob pipe the multiplier scales with how high you carve on the wall; the icy
	// cave floor is slightly faster too.
	const here = lerpAt(segs, st.s);
	const diff = difficultyAt(st.s);
	let vMax = diff.vMax * (boostMs > 0 ? P.boostMul : 1);
	if (here.seg.bob) {
		const ramp = pipeRampAt(here.seg, st.s - here.seg.startS);
		const climb = Math.min(1, (bobWall(here.width, st.lat).rise * ramp) / P.bobWallHeight);
		vMax *= P.bobVMaxFloor + (P.bobVMaxMul - P.bobVMaxFloor) * climb;
	} else if (here.seg.tunnel) {
		vMax *= P.tunnelVMaxMul;
	} else if (here.seg.fork && st.lane === here.seg.fork.danger) {
		vMax *= P.forkLaneVMaxMul; // the icy corridor is itself a boost
	}
	speed += (vMax - speed) * Math.min(1, P.speedRelax * dtSec);

	// Lateral: steering vs centrifugal pull (κ·v², partly absorbed by banking), then
	// friction — icy pipes (bob + caves) slide a lot more than snow.
	const steer = Math.max(-1, Math.min(1, input.steer));
	latVel += steer * P.steerAccel * (wasAirborne ? 0.25 : 1) * dtSec;
	latVel -= here.curvature * speed * speed * P.centrifugal * dtSec;
	const onIce = here.seg.bob || here.seg.tunnel || (here.seg.fork != null && st.lane === here.seg.fork.danger);
	latVel *= Math.pow(onIce ? P.bobLatFriction : P.latFriction, dtSec * 60);
	lat += latVel * dtSec;

	const prevS = st.s;
	const s = st.s + speed * dtSec;

	// Fork logic on the segment we are in now.
	const seg = segmentAt(segs, s);
	const fork = seg.fork;
	let inForkBand = false;
	let bermHit = false;
	if (fork) {
		const sLocal = s - seg.startS;
		const noseAbs = seg.startS + fork.noseS;
		const mergeAbs = seg.startS + fork.mergeS;
		if (prevS < noseAbs && s >= noseAbs) {
			if (Math.abs(lat) < P.noseHalf && invulnMs <= 0) {
				collide();
				events.push('forkNoseHit');
				const safeSign = fork.danger === 'left' ? -1 : 1;
				lat = safeSign * (fork.sepHalfMax + P.sledHalf + 0.3);
				latVel = 0;
				lane = safeSign > 0 ? 'left' : 'right';
			} else {
				lane = lat >= 0 ? 'left' : 'right';
				events.push(lane === fork.danger ? 'forkDanger' : 'forkSafe');
			}
		}
		if (s >= noseAbs && s < mergeAbs) {
			inForkBand = true;
			if (!lane) lane = lat >= 0 ? 'left' : 'right';
			const sign = lane === 'left' ? 1 : -1;
			const danger = lane === fork.danger;
			const lo = sepHalfAt(fork, sLocal) + P.sledHalf;
			const hi = (danger ? fork.outerDanger : fork.outerSafe) - P.sledHalf;
			let l = sign * lat;
			if (l < lo) {
				l = lo;
				if (sign * latVel < 0) latVel = danger ? 0 : -latVel * P.bermBounce;
				bermHit = !danger;
			} else if (l > hi) {
				l = hi;
				if (sign * latVel > 0) latVel = danger ? 0 : -latVel * P.bermBounce;
				bermHit = !danger;
			}
			lat = sign * l;
		}
		if (prevS < mergeAbs && s >= mergeAbs) {
			if (lane === fork.danger) {
				bonusScore += fork.bonus;
				boostMs = P.forkBoostMs;
				events.push('forkBonus');
			}
			lane = null;
		}
	} else {
		lane = null;
	}

	// Jump: crossing the kicker lip launches the sled on a ballistic flight (vy from
	// the ramp slope). Landing before the pit's end crushes the momentum (like stuck).
	if (seg.jump && jumpFromS == null) {
		const lipAbs = seg.startS + seg.jump.lipS;
		if (prevS < lipAbs && s >= lipAbs) {
			jumpFromS = lipAbs;
			jumpToS = lipAbs + Math.max(4, jumpFlightDist(speed));
			jumpGapEndS = lipAbs + seg.jump.gap;
		}
	}
	if (jumpFromS != null && s >= jumpToS) {
		if (jumpToS < jumpGapEndS) {
			speed = Math.max(P.stuckMinSpeed, speed * P.stuckSpeedMul);
			invulnMs = Math.max(invulnMs, P.stuckCooldownMs);
			events.push('jumpShort');
		} else {
			bonusScore += P.jumpBonus;
			events.push('jumpClean');
		}
		jumpFromS = null;
	}
	const airborne = jumpFromS != null && s < jumpToS;

	// Edges. Bob pipe: the icy wall climbs freely and gravity pulls back — no bounce,
	// no scrub, just a hard crest. Elsewhere: snow berms (never lethal — bounce + scrub).
	if (!inForkBand && !airborne) {
		const info2 = lerpAt(segs, s);
		if (info2.seg.bob || info2.seg.tunnel) {
			const ramp = pipeRampAt(info2.seg, s - info2.seg.startS);
			const w = pipeWall(info2.seg, info2.width, lat);
			latVel -= w.slope * ramp * P.bobWallGravity * dtSec;
			const crest = info2.width / 2 + pipeExtra(info2.seg) - P.sledHalf;
			if (lat > crest) {
				lat = crest;
				if (latVel > 0) latVel = 0;
			} else if (lat < -crest) {
				lat = -crest;
				if (latVel < 0) latVel = 0;
			}
		} else {
			const hw = info2.width / 2 - P.sledHalf;
			if (lat > hw) {
				lat = hw;
				if (latVel > 0) latVel = -latVel * P.bermBounce;
				bermHit = true;
			} else if (lat < -hw) {
				lat = -hw;
				if (latVel < 0) latVel = -latVel * P.bermBounce;
				bermHit = true;
			}
		}
	}
	if (bermHit) speed *= Math.pow(P.bermScrub, dtSec * 60);

	// Obstacles in the current + next segment (a step never spans more; none mid-air).
	const segIdx = segs.indexOf(seg);
	for (let si = segIdx; si < Math.min(segIdx + 2, segs.length) && status === 'running' && !airborne; si++) {
		const sg = segs[si];
		for (const obs of sg.obstacles) {
			const absS = sg.startS + obs.s;
			const halfLen = (obs.len ?? 0) / 2;
			if (absS < prevS - halfLen - 3 || absS > s + halfLen + 3) continue;
			const latGap = Math.abs(obs.lat - lat) - (obs.r + P.sledHalf);
			if (Math.abs(absS - s) < halfLen + obs.r + P.sledReach && latGap < 0) {
				if (obs.type === 'ice') {
					// Wedged against an ice pillar: no life lost, momentum crushed.
					if (invulnMs <= 0) {
						speed = Math.max(P.stuckMinSpeed, speed * P.stuckSpeedMul);
						invulnMs = P.stuckCooldownMs;
						events.push('stuck');
					}
				} else if (collide()) {
					break;
				}
			} else if (prevS < absS && s >= absS && latGap >= 0 && latGap < P.nearMissGap) {
				events.push('nearMiss');
				bonusScore += P.nearMissBonus;
			}
		}
	}

	return {
		state: {
			s,
			lat,
			latVel,
			speed,
			lives,
			invulnMs,
			boostMs,
			bonusScore,
			score: Math.floor(s) + bonusScore,
			lane,
			jumpFromS,
			jumpToS,
			jumpGapEndS,
			status,
		},
		events,
	};
}
