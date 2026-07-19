/**
 * PONG — pure, deterministic physics (no rendering, no network). Logical field 200×120 units.
 * The host runs stepBall every frame and broadcasts the state; the guest only renders it.
 */

import { mulberry32, type Rng } from '../prng';

export const PONG = {
	W: 200,
	H: 120,
	paddleH: 24, // paddle length (along Y)
	paddleW: 3, // paddle thickness (along X)
	ballR: 2.5,
	serveSpeed: 78,
	speedup: 1.05, // ball speeds up on each paddle hit
	maxBallSpeed: 210,
	maxBounceAngle: Math.PI / 3.2, // deflection at the paddle edge (~56°)
	paddleSpeed: 135, // units/s when moving a paddle
	maxScore: 7,
	serveDelay: 1, // s the ball stays frozen at centre before each serve (kickoff + after a point)
	// power-ups
	chargeNeed: 5, // paddle returns to fill the meter
	curveRate: 1.9, // rad/s the velocity rotates while "curve" is active
	curveDur: 2.5,
	bigMult: 1.8, // paddle half-height multiplier while "big" is active
	bigDur: 6,
	jamDur: 3,
	pickupR: 6, // ground power-up radius
	pickupEvery: 6, // seconds between spawns
	maxPickups: 2,
};

export type PowerId = 'speed' | 'curve' | 'jam' | 'big';

export interface Pickup {
	x: number;
	y: number;
	power: PowerId;
}

export interface PongState {
	bx: number;
	by: number;
	bvx: number;
	bvy: number;
	leftY: number; // paddle centers
	rightY: number;
	scoreL: number;
	scoreR: number;
	serveT: number; // >0 → ball frozen at centre (serve countdown / goal pause)
	// power-ups (all broadcast as-is; timers in seconds remaining)
	chargeL: number;
	chargeR: number;
	curveT: number;
	curveDir: number; // +1 / -1
	bigLT: number;
	bigRT: number;
	jamLT: number; // view-jam on the left player's screen
	jamRT: number;
	pickups: Pickup[]; // power-ups on the field
	lastHit: '' | 'left' | 'right'; // last paddle that touched the ball (collects pickups)
	powersOn: boolean; // false = classic Pong (no meter, no pickups, no effects)
}

/** Who just scored on this step (the side that gains the point), or null. */
export type Scored = 'left' | 'right' | null;

const clampPaddle = (y: number): number => Math.max(PONG.paddleH / 2, Math.min(PONG.H - PONG.paddleH / 2, y));

/** Reset the ball to centre and serve toward one side at a bounded random angle, keeping scores/paddles. */
export function serve(s: PongState, rng: Rng, towardLeft: boolean, serveSpeed = PONG.serveSpeed): PongState {
	const angle = (rng() * 2 - 1) * PONG.maxBounceAngle;
	const vSign = rng() < 0.5 ? -1 : 1;
	return {
		...s,
		bx: PONG.W / 2,
		by: PONG.H / 2,
		bvx: Math.cos(angle) * serveSpeed * (towardLeft ? -1 : 1),
		bvy: Math.sin(angle) * serveSpeed * vSign,
		serveT: PONG.serveDelay, // freeze briefly before the ball flies off
	};
}

/** Fresh game: scores 0, paddles centred, first serve in a random direction. */
export function createState(rng: Rng = mulberry32(1), powersOn = true, serveSpeed = PONG.serveSpeed): PongState {
	const base: PongState = {
		bx: PONG.W / 2,
		by: PONG.H / 2,
		bvx: 0,
		bvy: 0,
		leftY: PONG.H / 2,
		rightY: PONG.H / 2,
		scoreL: 0,
		scoreR: 0,
		serveT: 0,
		chargeL: 0,
		chargeR: 0,
		curveT: 0,
		curveDir: 1,
		bigLT: 0,
		bigRT: 0,
		jamLT: 0,
		jamRT: 0,
		pickups: [],
		lastHit: '',
		powersOn,
	};
	return serve(base, rng, rng() < 0.5, serveSpeed);
}

export const movePaddle = (y: number, dir: number, dt: number): number => clampPaddle(y + dir * PONG.paddleSpeed * dt);

/** Paddle half-height including the "big" power. */
const halfH = (active: boolean): number => (PONG.paddleH / 2) * (active ? PONG.bigMult : 1);

/** Reflect the ball off a paddle: deflection depends on where it hit, then speed up (capped). */
function bounceOffPaddle(s: PongState, paddleY: number, fromLeft: boolean): void {
	const rel = Math.max(-1, Math.min(1, (s.by - paddleY) / (PONG.paddleH / 2)));
	const angle = rel * PONG.maxBounceAngle;
	const speed = Math.min(PONG.maxBallSpeed, Math.hypot(s.bvx, s.bvy) * PONG.speedup);
	s.bvx = Math.cos(angle) * speed * (fromLeft ? 1 : -1);
	s.bvy = Math.sin(angle) * speed;
}

/** Apply a power's effect for one side (no charge check) — shared by the meter and ground pickups. */
function applyEffect(s: PongState, side: 'left' | 'right', power: PowerId): void {
	switch (power) {
		case 'speed': {
			const sp = Math.hypot(s.bvx, s.bvy) || 1;
			s.bvx = (s.bvx / sp) * PONG.maxBallSpeed;
			s.bvy = (s.bvy / sp) * PONG.maxBallSpeed;
			break;
		}
		case 'curve':
			s.curveT = PONG.curveDur;
			s.curveDir = side === 'left' ? 1 : -1;
			break;
		case 'big':
			if (side === 'left') s.bigLT = PONG.bigDur;
			else s.bigRT = PONG.bigDur;
			break;
		case 'jam':
			// jam the OPPONENT's view
			if (side === 'left') s.jamRT = PONG.jamDur;
			else s.jamLT = PONG.jamDur;
			break;
	}
}

/** Spend a full charge to trigger a power for one side. No-op if the meter isn't full. */
export function activatePower(prev: PongState, side: 'left' | 'right', power: PowerId): PongState {
	if (!prev.powersOn) return prev;
	const charge = side === 'left' ? prev.chargeL : prev.chargeR;
	if (charge < PONG.chargeNeed) return prev;
	const s: PongState = { ...prev };
	if (side === 'left') s.chargeL = 0;
	else s.chargeR = 0;
	applyEffect(s, side, power);
	return s;
}

/** Add a ground power-up (capped at maxPickups). */
export function addPickup(prev: PongState, x: number, y: number, power: PowerId): PongState {
	if (prev.pickups.length >= PONG.maxPickups) return prev;
	return { ...prev, pickups: [...prev.pickups, { x, y, power }] };
}

/** Advance the ball by dt; bounce off walls/paddles; score when it passes an end. Returns the new state + who scored. */
export function stepBall(prev: PongState, dt: number): { state: PongState; scored: Scored } {
	const s: PongState = { ...prev };

	// Serve pause: ball frozen at centre (kickoff / after a point). Everything else waits too.
	if (s.serveT > 0) {
		s.serveT = Math.max(0, s.serveT - dt);
		return { state: s, scored: null };
	}

	// Power timers tick down.
	s.curveT = Math.max(0, s.curveT - dt);
	s.bigLT = Math.max(0, s.bigLT - dt);
	s.bigRT = Math.max(0, s.bigRT - dt);
	s.jamLT = Math.max(0, s.jamLT - dt);
	s.jamRT = Math.max(0, s.jamRT - dt);

	// Curved trajectory: rotate the velocity vector while active.
	if (s.curveT > 0) {
		const a = s.curveDir * PONG.curveRate * dt;
		const c = Math.cos(a);
		const sn = Math.sin(a);
		const vx = s.bvx * c - s.bvy * sn;
		const vy = s.bvx * sn + s.bvy * c;
		s.bvx = vx;
		s.bvy = vy;
	}

	s.bx += s.bvx * dt;
	s.by += s.bvy * dt;

	// Top / bottom walls.
	if (s.by - PONG.ballR <= 0) {
		s.by = PONG.ballR;
		s.bvy = Math.abs(s.bvy);
	} else if (s.by + PONG.ballR >= PONG.H) {
		s.by = PONG.H - PONG.ballR;
		s.bvy = -Math.abs(s.bvy);
	}

	// Left paddle.
	if (s.bvx < 0 && s.bx - PONG.ballR <= PONG.paddleW) {
		if (Math.abs(s.by - s.leftY) <= halfH(s.bigLT > 0) + PONG.ballR) {
			s.bx = PONG.paddleW + PONG.ballR;
			bounceOffPaddle(s, s.leftY, true);
			if (s.powersOn) s.chargeL = Math.min(PONG.chargeNeed, s.chargeL + 1);
			s.lastHit = 'left';
		} else if (s.bx + PONG.ballR < 0) {
			s.scoreR += 1;
			return { state: s, scored: 'right' };
		}
	}
	// Right paddle.
	if (s.bvx > 0 && s.bx + PONG.ballR >= PONG.W - PONG.paddleW) {
		if (Math.abs(s.by - s.rightY) <= halfH(s.bigRT > 0) + PONG.ballR) {
			s.bx = PONG.W - PONG.paddleW - PONG.ballR;
			bounceOffPaddle(s, s.rightY, false);
			if (s.powersOn) s.chargeR = Math.min(PONG.chargeNeed, s.chargeR + 1);
			s.lastHit = 'right';
		} else if (s.bx - PONG.ballR > PONG.W) {
			s.scoreL += 1;
			return { state: s, scored: 'left' };
		}
	}

	// Ground power-ups: the last hitter collects any the ball rolls over.
	if (s.powersOn && s.lastHit && s.pickups.length) {
		const kept: Pickup[] = [];
		for (const p of s.pickups) {
			if (Math.hypot(s.bx - p.x, s.by - p.y) <= PONG.ballR + PONG.pickupR) {
				applyEffect(s, s.lastHit, p.power);
			} else {
				kept.push(p);
			}
		}
		if (kept.length !== s.pickups.length) s.pickups = kept;
	}

	return { state: s, scored: null };
}
