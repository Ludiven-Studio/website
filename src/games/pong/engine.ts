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
};

export interface PongState {
	bx: number;
	by: number;
	bvx: number;
	bvy: number;
	leftY: number; // paddle centers
	rightY: number;
	scoreL: number;
	scoreR: number;
}

/** Who just scored on this step (the side that gains the point), or null. */
export type Scored = 'left' | 'right' | null;

const clampPaddle = (y: number): number => Math.max(PONG.paddleH / 2, Math.min(PONG.H - PONG.paddleH / 2, y));

/** Reset the ball to centre and serve toward one side at a bounded random angle, keeping scores/paddles. */
export function serve(s: PongState, rng: Rng, towardLeft: boolean): PongState {
	const angle = (rng() * 2 - 1) * PONG.maxBounceAngle;
	const vSign = rng() < 0.5 ? -1 : 1;
	return {
		...s,
		bx: PONG.W / 2,
		by: PONG.H / 2,
		bvx: Math.cos(angle) * PONG.serveSpeed * (towardLeft ? -1 : 1),
		bvy: Math.sin(angle) * PONG.serveSpeed * vSign,
	};
}

/** Fresh game: scores 0, paddles centred, first serve in a random direction. */
export function createState(rng: Rng = mulberry32(1)): PongState {
	const base: PongState = { bx: PONG.W / 2, by: PONG.H / 2, bvx: 0, bvy: 0, leftY: PONG.H / 2, rightY: PONG.H / 2, scoreL: 0, scoreR: 0 };
	return serve(base, rng, rng() < 0.5);
}

export const movePaddle = (y: number, dir: number, dt: number): number => clampPaddle(y + dir * PONG.paddleSpeed * dt);

/** Reflect the ball off a paddle: deflection depends on where it hit, then speed up (capped). */
function bounceOffPaddle(s: PongState, paddleY: number, fromLeft: boolean): void {
	const rel = Math.max(-1, Math.min(1, (s.by - paddleY) / (PONG.paddleH / 2)));
	const angle = rel * PONG.maxBounceAngle;
	const speed = Math.min(PONG.maxBallSpeed, Math.hypot(s.bvx, s.bvy) * PONG.speedup);
	s.bvx = Math.cos(angle) * speed * (fromLeft ? 1 : -1);
	s.bvy = Math.sin(angle) * speed;
}

/** Advance the ball by dt; bounce off walls/paddles; score when it passes an end. Returns the new state + who scored. */
export function stepBall(prev: PongState, dt: number): { state: PongState; scored: Scored } {
	const s: PongState = { ...prev };
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
		if (Math.abs(s.by - s.leftY) <= PONG.paddleH / 2 + PONG.ballR) {
			s.bx = PONG.paddleW + PONG.ballR;
			bounceOffPaddle(s, s.leftY, true);
		} else if (s.bx + PONG.ballR < 0) {
			s.scoreR += 1;
			return { state: s, scored: 'right' };
		}
	}
	// Right paddle.
	if (s.bvx > 0 && s.bx + PONG.ballR >= PONG.W - PONG.paddleW) {
		if (Math.abs(s.by - s.rightY) <= PONG.paddleH / 2 + PONG.ballR) {
			s.bx = PONG.W - PONG.paddleW - PONG.ballR;
			bounceOffPaddle(s, s.rightY, false);
		} else if (s.bx - PONG.ballR > PONG.W) {
			s.scoreL += 1;
			return { state: s, scored: 'left' };
		}
	}

	return { state: s, scored: null };
}
