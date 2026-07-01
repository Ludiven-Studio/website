import { describe, it, expect } from 'vitest';
import {
	createWorld, step, stepPlayer, stepBall, resolveKicks,
	FIELD, FLOOR, PLAYER_R, BALL_R, GOAL_TOP,
	type PlayerInput, type World,
} from './engine';

const NONE: PlayerInput = { move: 0, jump: false };
const DT = 1 / 60;
const live = (w: World): World => { w.kickoff = 0; return w; }; // skip the kickoff freeze

describe('foot engine', () => {
	it('step is deterministic for identical inputs', () => {
		const a = createWorld(), b = createWorld();
		const seq: [PlayerInput, PlayerInput][] = [
			[{ move: 1, jump: true }, { move: -1, jump: false }],
			[{ move: 1, jump: false }, { move: -1, jump: true }],
			[{ move: 0, jump: false }, { move: 0, jump: false }],
		];
		for (let i = 0; i < 200; i++) { const inp = seq[i % seq.length]; step(a, DT, inp); step(b, DT, inp); }
		expect(a).toEqual(b);
	});

	it('a cocotte jumps once, falls back, and cannot double-jump while held', () => {
		const w = live(createWorld());
		const p = w.players[0];
		expect(p.onGround).toBe(true);
		step(w, DT, [{ move: 0, jump: true }, NONE]); // rising edge → jump
		expect(p.vy).toBeLessThan(0);
		expect(p.onGround).toBe(false);
		const apexY = (() => { let min = p.y; for (let i = 0; i < 20; i++) { step(w, DT, [{ move: 0, jump: true }, NONE]); min = Math.min(min, p.y); } return min; })();
		expect(apexY).toBeLessThan(FLOOR - PLAYER_R - 20); // actually left the ground
		for (let i = 0; i < 120; i++) step(w, DT, [{ move: 0, jump: true }, NONE]); // still holding → no re-jump mid-air spam
		expect(p.onGround).toBe(true); // landed again
		expect(p.y).toBeCloseTo(FLOOR - PLAYER_R, 3);
	});

	it('touching the ball launches it (a shot on contact)', () => {
		const w = live(createWorld());
		w.ball.x = 100; w.ball.y = FLOOR - BALL_R; w.ball.vx = 0; w.ball.vy = 0;
		const p = w.players[0];
		p.x = w.ball.x - (PLAYER_R + BALL_R) + 1; p.y = w.ball.y; p.vx = 80; p.vy = 0; // moving right into the ball
		resolveKicks(w);
		expect(w.ball.vx).toBeGreaterThan(50); // shot to the right
		expect(Math.hypot(w.ball.vx, w.ball.vy)).toBeGreaterThan(120);
	});

	it('detects a goal, bumps the score, recentres the ball and starts a kickoff', () => {
		const w = live(createWorld());
		w.ball.x = BALL_R + 2; w.ball.y = (GOAL_TOP + FLOOR) / 2; w.ball.vx = -200; w.ball.vy = 0;
		const r = step(w, DT, [NONE, NONE]);
		expect(r.scorer).toBe(1); // ball crossed the LEFT goal line → right player scores
		expect(w.score.r).toBe(1);
		expect(w.kickoff).toBeGreaterThan(0);
		expect(w.ball.x).toBeCloseTo(FIELD.W / 2, 3); // recentred
	});

	it('the ball bounces off the floor and stays inside the walls above the goal', () => {
		const w = live(createWorld());
		// drop onto the floor → should rebound upward
		w.ball.x = FIELD.W / 2; w.ball.y = FLOOR - BALL_R - 1; w.ball.vx = 0; w.ball.vy = 300;
		for (let i = 0; i < 5; i++) stepBall(w, DT);
		expect(w.ball.vy).toBeLessThan(0); // bounced back up

		// fire into the left wall ABOVE the goal mouth → reflect, no goal
		w.ball.x = 40; w.ball.y = GOAL_TOP - 20; w.ball.vx = -300; w.ball.vy = 0;
		let scored: number | null = null;
		for (let i = 0; i < 30; i++) { const s = stepBall(w, DT); if (s !== null) { scored = s; break; } }
		expect(scored).toBeNull();
		expect(w.ball.x).toBeGreaterThanOrEqual(BALL_R - 0.01);
		expect(w.ball.vx).toBeGreaterThan(0); // reflected off the wall
	});

	it('players stay on the pitch (clamped to the sides and floor)', () => {
		const w = live(createWorld());
		const p = w.players[0];
		for (let i = 0; i < 120; i++) stepPlayer(p, { move: -1, jump: false }, DT);
		expect(p.x).toBeGreaterThanOrEqual(PLAYER_R - 0.01);
		expect(p.y).toBeLessThanOrEqual(FLOOR - PLAYER_R + 0.01);
	});
});
