import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../prng';
import { PONG, createState, serve, movePaddle, stepBall, type PongState } from './engine';

const base = (over: Partial<PongState> = {}): PongState => ({
	bx: PONG.W / 2,
	by: PONG.H / 2,
	bvx: 0,
	bvy: 0,
	leftY: PONG.H / 2,
	rightY: PONG.H / 2,
	scoreL: 0,
	scoreR: 0,
	...over,
});

describe('pong engine', () => {
	it('createState is deterministic from a seed', () => {
		expect(createState(mulberry32(42))).toEqual(createState(mulberry32(42)));
	});

	it('serve toward left sends the ball left', () => {
		expect(serve(base(), mulberry32(1), true).bvx).toBeLessThan(0);
		expect(serve(base(), mulberry32(1), false).bvx).toBeGreaterThan(0);
	});

	it('ball bounces off the top wall (vy flips downward)', () => {
		const s = base({ by: PONG.ballR + 0.1, bvy: -50, bvx: 10 });
		const { state } = stepBall(s, 0.1);
		expect(state.bvy).toBeGreaterThan(0);
		expect(state.by).toBeGreaterThanOrEqual(PONG.ballR);
	});

	it('ball bounces off the bottom wall (vy flips upward)', () => {
		const s = base({ by: PONG.H - PONG.ballR - 0.1, bvy: 50, bvx: 10 });
		const { state } = stepBall(s, 0.1);
		expect(state.bvy).toBeLessThan(0);
	});

	it('reflects off a paddle and speeds up', () => {
		const s = base({ bx: PONG.paddleW + PONG.ballR + 1, bvx: -60, bvy: 0, leftY: PONG.H / 2, by: PONG.H / 2 });
		const speedBefore = Math.hypot(s.bvx, s.bvy);
		const { state, scored } = stepBall(s, 0.1);
		expect(scored).toBeNull();
		expect(state.bvx).toBeGreaterThan(0); // bounced back to the right
		expect(Math.hypot(state.bvx, state.bvy)).toBeGreaterThan(speedBefore);
	});

	it('scores for the opponent when the ball passes a paddle', () => {
		const s = base({ bx: PONG.paddleW + PONG.ballR, bvx: -200, by: 20, leftY: 100 }); // miss
		const { state, scored } = stepBall(s, 0.1);
		expect(scored).toBe('right');
		expect(state.scoreR).toBe(1);
	});

	it('movePaddle clamps within the field', () => {
		expect(movePaddle(PONG.H / 2, -1, 100)).toBe(PONG.paddleH / 2);
		expect(movePaddle(PONG.H / 2, 1, 100)).toBe(PONG.H - PONG.paddleH / 2);
	});
});
