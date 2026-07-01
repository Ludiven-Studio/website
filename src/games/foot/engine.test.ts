import { describe, it, expect } from 'vitest';
import {
	createWorld, step, stepPlayer, stepBall, resolveKicks,
	FIELD, FLOOR, PLAYER_R, BALL_R, GOAL_TOP,
	type PlayerInput, type World,
} from './engine';

const NONE: PlayerInput = { move: 0, jump: false };
const NONE4: PlayerInput[] = [NONE, NONE, NONE, NONE];
const DT = 1 / 60;
const live = (w: World): World => { w.kickoff = 0; return w; }; // skip the kickoff freeze

describe('foot engine', () => {
	it('has 2v2 teams and is deterministic for identical inputs', () => {
		const a = createWorld(), b = createWorld();
		expect(a.players.length).toBe(4);
		expect(a.players.map((p) => p.team)).toEqual([0, 0, 1, 1]);
		const seq: PlayerInput[][] = [
			[{ move: 1, jump: true }, { move: -1, jump: false }, { move: 1, jump: false }, { move: -1, jump: true }],
			[{ move: 1, jump: false }, NONE, { move: -1, jump: true }, NONE],
			NONE4,
		];
		for (let i = 0; i < 200; i++) { const inp = seq[i % seq.length]; step(a, DT, inp); step(b, DT, inp); }
		expect(a).toEqual(b);
	});

	it('a cocotte jumps once, falls back, and cannot double-jump while held', () => {
		const w = live(createWorld());
		const p = w.players[0];
		step(w, DT, [{ move: 0, jump: true }, NONE, NONE, NONE]);
		expect(p.vy).toBeLessThan(0);
		expect(p.onGround).toBe(false);
		let apex = p.y;
		for (let i = 0; i < 20; i++) { step(w, DT, [{ move: 0, jump: true }, NONE, NONE, NONE]); apex = Math.min(apex, p.y); }
		expect(apex).toBeLessThan(FLOOR - PLAYER_R - 20); // actually left the ground
		for (let i = 0; i < 120; i++) step(w, DT, [{ move: 0, jump: true }, NONE, NONE, NONE]);
		expect(p.onGround).toBe(true);
		expect(p.y).toBeCloseTo(FLOOR - PLAYER_R, 3);
	});

	it('can flap to fly a bit while airborne (a re-press after release)', () => {
		const w = live(createWorld());
		const p = w.players[0];
		step(w, DT, [{ move: 0, jump: true }, NONE, NONE, NONE]); // ground jump
		for (let i = 0; i < 8; i++) step(w, DT, [{ move: 0, jump: false }, NONE, NONE, NONE]); // rise, jump released
		const vyBefore = p.vy;
		expect(p.onGround).toBe(false);
		step(w, DT, [{ move: 0, jump: true }, NONE, NONE, NONE]); // flap: rising edge in the air
		expect(p.vy).toBeLessThan(vyBefore); // pushed further upward
	});

	it('a grounded ball struck horizontally lofts into a shot (rises)', () => {
		const w = live(createWorld());
		w.ball.x = 160; w.ball.y = FLOOR - BALL_R; w.ball.vx = 0; w.ball.vy = 0; // resting on the floor
		const p = w.players[0];
		p.x = w.ball.x - (PLAYER_R + BALL_R) + 1; p.y = w.ball.y; p.vx = 90; p.vy = 0; // running right into it
		resolveKicks(w);
		expect(w.ball.vx).toBeGreaterThan(50); // shot forward
		expect(w.ball.vy).toBeLessThan(-80);    // and upward (a lofted shot, not a grounder)
	});

	it('detects a goal, bumps the team score, recentres the ball and starts a kickoff', () => {
		const w = live(createWorld());
		w.ball.x = BALL_R + 2; w.ball.y = (GOAL_TOP + FLOOR) / 2; w.ball.vx = -200; w.ball.vy = 0;
		const r = step(w, DT, NONE4);
		expect(r.scorer).toBe(1); // ball crossed the LEFT goal line → right team scores
		expect(w.score.r).toBe(1);
		expect(w.kickoff).toBeGreaterThan(0);
		expect(w.ball.x).toBeCloseTo(FIELD.W / 2, 3);
	});

	it('the ball bounces off the floor and reflects off walls above the goal (no goal)', () => {
		const w = live(createWorld());
		w.ball.x = FIELD.W / 2; w.ball.y = FLOOR - BALL_R - 1; w.ball.vx = 0; w.ball.vy = 300;
		for (let i = 0; i < 5; i++) stepBall(w, DT);
		expect(w.ball.vy).toBeLessThan(0); // bounced up

		w.ball.x = 40; w.ball.y = GOAL_TOP - 22; w.ball.vx = -300; w.ball.vy = 0;
		let scored: number | null = null;
		for (let i = 0; i < 30; i++) { const s = stepBall(w, DT); if (s !== null) { scored = s; break; } }
		expect(scored).toBeNull();
		expect(w.ball.x).toBeGreaterThanOrEqual(BALL_R - 0.01);
		expect(w.ball.vx).toBeGreaterThan(0); // reflected off the wall
	});

	it('players stay on the pitch (clamped to the sides and floor)', () => {
		const w = live(createWorld());
		const p = w.players[0];
		for (let i = 0; i < 160; i++) stepPlayer(p, { move: -1, jump: false }, DT);
		expect(p.x).toBeGreaterThanOrEqual(PLAYER_R - 0.01);
		expect(p.y).toBeLessThanOrEqual(FLOOR - PLAYER_R + 0.01);
	});
});
