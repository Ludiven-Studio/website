import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../prng';
import { PONG, createState, serve, movePaddle, stepBall, activatePower, addPickup, type PongState } from './engine';

const base = (over: Partial<PongState> = {}): PongState => ({
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

	it('a paddle return charges the meter', () => {
		const s = base({ bx: PONG.paddleW + PONG.ballR + 1, bvx: -60, by: PONG.H / 2, leftY: PONG.H / 2 });
		const { state } = stepBall(s, 0.1);
		expect(state.chargeL).toBe(1);
	});

	it('activatePower needs a full meter, then spends it', () => {
		const notReady = base({ chargeL: 4, bvx: 40, bvy: 0 });
		expect(activatePower(notReady, 'left', 'speed')).toBe(notReady); // unchanged

		const ready = base({ chargeL: PONG.chargeNeed, bvx: 40, bvy: 0 });
		const after = activatePower(ready, 'left', 'speed');
		expect(after.chargeL).toBe(0);
		expect(Math.hypot(after.bvx, after.bvy)).toBeCloseTo(PONG.maxBallSpeed, 5);
	});

	it('curve power bends the ball trajectory', () => {
		let s = activatePower(base({ chargeR: PONG.chargeNeed, bvx: 60, bvy: 0 }), 'right', 'curve');
		const before = Math.atan2(s.bvy, s.bvx);
		for (let i = 0; i < 10; i++) s = stepBall(s, 1 / 60).state;
		expect(Math.atan2(s.bvy, s.bvx)).not.toBeCloseTo(before, 3); // direction changed
	});

	it('addPickup caps at maxPickups', () => {
		let s = base();
		for (let i = 0; i < PONG.maxPickups + 3; i++) s = addPickup(s, 100, 60, 'speed');
		expect(s.pickups.length).toBe(PONG.maxPickups);
	});

	it('ball rolling over a pickup triggers it for the last hitter and removes it', () => {
		const s = base({ bx: PONG.W / 2, by: PONG.H / 2, bvx: 40, bvy: 0, lastHit: 'left', pickups: [{ x: PONG.W / 2, y: PONG.H / 2, power: 'speed' }] });
		const { state } = stepBall(s, 1 / 60);
		expect(state.pickups.length).toBe(0); // collected
		expect(Math.hypot(state.bvx, state.bvy)).toBeCloseTo(PONG.maxBallSpeed, 5); // speed effect applied
	});

	it('a pickup is not collected before any paddle has touched the ball', () => {
		const s = base({ bx: PONG.W / 2, by: PONG.H / 2, bvx: 40, bvy: 0, lastHit: '', pickups: [{ x: PONG.W / 2, y: PONG.H / 2, power: 'big' }] });
		expect(stepBall(s, 1 / 60).state.pickups.length).toBe(1); // stays
	});

	it('big paddle extends reach (a ball that would miss now bounces)', () => {
		const miss = PONG.paddleH / 2 + PONG.ballR + 4; // just outside a normal paddle's reach
		const at = { bx: PONG.paddleW + PONG.ballR + 1, bvx: -60, by: PONG.H / 2 + miss, leftY: PONG.H / 2 };
		// normal paddle: the ball slips past (still heading left after reaching the plane)
		expect(stepBall(base(at), 0.1).state.bvx).toBeLessThan(0);
		// big paddle active: it bounces back to the right
		const big = activatePower(base({ chargeL: PONG.chargeNeed }), 'left', 'big');
		expect(stepBall({ ...big, ...at }, 0.1).state.bvx).toBeGreaterThan(0);
	});
});
