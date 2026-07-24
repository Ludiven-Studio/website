import { describe, it, expect } from 'vitest';
import {
	BREAKOUT_CFG,
	BREAKOUT_DIFFS,
	brickWidth,
	generateBricks,
	createBreakout,
	launch,
	applyBonus,
	stepBreakout,
	paddleWidth,
	CLEAR_POINTS,
	type BreakoutState,
	type Ball,
} from './engine';

const cfg = BREAKOUT_CFG;
const diff = BREAKOUT_DIFFS.moyen;

const fresh = (seed = 1): BreakoutState => createBreakout(cfg, generateBricks(seed, cfg, diff), diff);

// Advance the sim a while, keeping the paddle under the (first) ball so it never drops.
const play = (s0: BreakoutState, steps: number, dt = 1 / 60): BreakoutState => {
	let s = s0;
	for (let i = 0; i < steps && s.status === 'playing'; i++) {
		const under = s.balls[0]?.x ?? s.paddleX;
		s = stepBreakout(s, dt, cfg, under);
	}
	return s;
};

describe('casse-briques engine', () => {
	it('brick layout is a pure function of the seed', () => {
		const a = generateBricks(42, cfg, diff);
		const b = generateBricks(42, cfg, diff);
		const c = generateBricks(43, cfg, diff);
		expect(a).toEqual(b);
		expect(JSON.stringify(a)).not.toEqual(JSON.stringify(c));
	});

	it('fills a full grid of cols × rows within the world bounds', () => {
		const bricks = generateBricks(7, cfg, diff);
		expect(bricks.length).toBe(cfg.cols * diff.rows);
		for (const br of bricks) {
			expect(br.x).toBeGreaterThanOrEqual(cfg.sideMargin - 0.001);
			expect(br.x + br.w).toBeLessThanOrEqual(cfg.worldW - cfg.sideMargin + 0.001);
			expect(br.hp).toBeGreaterThanOrEqual(1);
			expect(br.hp).toBeLessThanOrEqual(2);
		}
		expect(brickWidth(cfg)).toBeGreaterThan(0);
	});

	it('harder difficulty means more rows and more 2-hit bricks', () => {
		const easy = generateBricks(9, cfg, BREAKOUT_DIFFS.facile);
		const hard = generateBricks(9, cfg, BREAKOUT_DIFFS.difficile);
		expect(hard.length).toBeGreaterThan(easy.length);
		const two = (bs: ReturnType<typeof generateBricks>) => bs.filter((b) => b.maxHp === 2).length / bs.length;
		expect(two(hard)).toBeGreaterThan(two(easy));
	});

	it('starts ready with one ball resting on the paddle, launches on demand', () => {
		const s = fresh();
		expect(s.status).toBe('ready');
		expect(s.balls).toHaveLength(1);
		expect(s.balls[0].stuck).toBe(true);
		const l = launch(s);
		expect(l.status).toBe('playing');
		expect(l.balls[0].stuck).toBe(false);
		expect(l.balls[0].vy).toBeLessThan(0); // launched upward
	});

	it('bounces off the side walls (x stays inside)', () => {
		let s = launch(fresh());
		s = play(s, 240);
		for (const b of s.balls) {
			expect(b.x).toBeGreaterThanOrEqual(cfg.ballR - 0.001);
			expect(b.x).toBeLessThanOrEqual(cfg.worldW - cfg.ballR + 0.001);
		}
	});

	it('a ball reflects up off the paddle instead of falling through', () => {
		let s = launch(fresh());
		// Aim one ball straight down just above the paddle, centred.
		s = { ...s, balls: [{ x: s.paddleX, y: cfg.paddleY - cfg.ballR - 0.5, vx: 0, vy: s.speed, stuck: false }] };
		s = stepBreakout(s, 1 / 60, cfg, s.paddleX);
		expect(s.balls).toHaveLength(1);
		expect(s.balls[0].vy).toBeLessThan(0);
	});

	it('destroying a brick removes it and awards points; 2-hit bricks need two hits', () => {
		let s = launch(fresh(3));
		const target = s.bricks.find((b) => b.maxHp === 2)!;
		// Park a ball just under that brick moving up into it, no bonus interference.
		const ball: Ball = { x: target.x + target.w / 2, y: target.y + target.h + cfg.ballR + 0.2, vx: 0, vy: -s.speed, stuck: false };
		s = { ...s, balls: [ball], bonuses: [] };
		s = stepBreakout(s, 1 / 60, cfg, s.paddleX);
		const afterFirst = s.bricks.find((b) => b.col === target.col && b.row === target.row)!;
		expect(afterFirst.alive).toBe(true); // still one hit to go
		expect(afterFirst.hp).toBe(1);
	});

	it('power bonus breaks a 2-hit brick in one hit', () => {
		let s = launch(fresh(3));
		s = applyBonus(s, 'power', cfg);
		const target = s.bricks.find((b) => b.maxHp === 2)!;
		const ball: Ball = { x: target.x + target.w / 2, y: target.y + target.h + cfg.ballR + 0.2, vx: 0, vy: -s.speed, stuck: false };
		s = { ...s, balls: [ball], bonuses: [] };
		s = stepBreakout(s, 1 / 60, cfg, s.paddleX);
		const after = s.bricks.find((b) => b.col === target.col && b.row === target.row)!;
		expect(after.alive).toBe(false);
	});

	it('wide bonus widens the paddle; multi adds balls; life adds a life', () => {
		const s = launch(fresh());
		expect(paddleWidth(applyBonus(s, 'wide', cfg), cfg)).toBe(cfg.paddleWideW);
		expect(applyBonus(s, 'multi', cfg).balls.length).toBeGreaterThan(s.balls.length);
		expect(applyBonus(s, 'life', cfg).lives).toBe(s.lives + 1);
		expect(applyBonus(s, 'slow', cfg).speed).toBeLessThan(s.baseSpeed);
	});

	it('multi never exceeds the ball cap', () => {
		let s = launch(fresh());
		for (let i = 0; i < 10; i++) s = applyBonus(s, 'multi', cfg);
		expect(s.balls.length).toBeLessThanOrEqual(cfg.maxBalls);
	});

	it('losing the last ball with lives left re-serves; with none it ends', () => {
		let s = launch(fresh());
		s = { ...s, lives: 2, balls: [{ x: 50, y: cfg.worldH + cfg.ballR + 1, vx: 0, vy: s.speed, stuck: false }] };
		s = stepBreakout(s, 1 / 60, cfg, s.paddleX);
		expect(s.lives).toBe(1);
		expect(s.status).toBe('playing');
		expect(s.balls.length).toBeGreaterThan(0);

		let dead = launch(fresh());
		dead = { ...dead, lives: 1, balls: [{ x: 50, y: cfg.worldH + cfg.ballR + 1, vx: 0, vy: dead.speed, stuck: false }] };
		dead = stepBreakout(dead, 1 / 60, cfg, dead.paddleX);
		expect(dead.status).toBe('over');
	});

	it('clearing the field wins and banks the clear bonus', () => {
		let s = launch(fresh());
		// Leave a single brick, then knock it out.
		const only = s.bricks[0];
		const alive = s.bricks.map((b, i) => ({ ...b, alive: i === 0, hp: i === 0 ? 1 : 0 }));
		const ball: Ball = { x: only.x + only.w / 2, y: only.y + only.h + cfg.ballR + 0.2, vx: 0, vy: -s.speed, stuck: false };
		s = { ...s, bricks: alive, balls: [ball], bonuses: [], score: 0 };
		s = stepBreakout(s, 1 / 60, cfg, s.paddleX);
		expect(s.status).toBe('won');
		expect(s.score).toBeGreaterThanOrEqual(CLEAR_POINTS);
	});
});
