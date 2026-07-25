import { describe, it, expect } from 'vitest';
import {
	BREAKOUT_CFG,
	BREAKOUT_DIFFS,
	BONUS_KINDS,
	brickWidth,
	generateBricks,
	createBreakout,
	launch,
	applyBonus,
	stepBreakout,
	paddleWidth,
	paddleArc,
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

	it('places a non-empty motif within the grid + world bounds (never a full solid grid)', () => {
		const bricks = generateBricks(7, cfg, diff);
		expect(bricks.length).toBeGreaterThan(0);
		expect(bricks.length).toBeLessThanOrEqual(cfg.cols * diff.rows);
		for (const br of bricks) {
			expect(br.x).toBeGreaterThanOrEqual(cfg.sideMargin - 0.001);
			expect(br.x + br.w).toBeLessThanOrEqual(cfg.worldW - cfg.sideMargin + 0.001);
			expect(br.row).toBeGreaterThanOrEqual(0);
			expect(br.row).toBeLessThan(diff.rows);
			expect(br.hp).toBeGreaterThanOrEqual(1);
			expect(br.hp).toBeLessThanOrEqual(3);
		}
		expect(brickWidth(cfg)).toBeGreaterThan(0);
	});

	it('motifs are horizontally symmetric (left half mirrors the right)', () => {
		const present = new Set(generateBricks(11, cfg, diff).map((b) => `${b.row},${b.col}`));
		for (const key of present) {
			const [r, c] = key.split(',').map(Number);
			expect(present.has(`${r},${cfg.cols - 1 - c}`)).toBe(true);
		}
	});

	it('carves ricochet pockets: an empty cell sealed by 2-hit bricks', () => {
		for (const d of [BREAKOUT_DIFFS.facile, BREAKOUT_DIFFS.moyen, BREAKOUT_DIFFS.difficile]) {
			for (let seed = 1; seed <= 12; seed++) {
				const at = new Map(generateBricks(seed, cfg, d).map((b) => [`${b.row},${b.col}`, b]));
				const pockets: string[] = [];
				for (let r = 1; r < d.rows - 1; r++) {
					for (let c = 1; c < cfg.cols - 1; c++) {
						if (at.has(`${r},${c}`)) continue;
						const ring = [
							[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1],
							[r - 1, c - 1], [r - 1, c + 1], [r + 1, c - 1], [r + 1, c + 1],
						].map(([rr, cc]) => at.get(`${rr},${cc}`));
						// A pocket cell: walled on every side except towards its twin cell.
						if (ring.filter(Boolean).length >= 7 && ring.every((b) => !b || b.maxHp >= 2)) pockets.push(`${r},${c}`);
					}
				}
				expect(pockets.length).toBeGreaterThanOrEqual(2); // mirrored, so pockets come in pairs
			}
		}
	});

	it('harder difficulty means fuller walls and tougher bricks (averaged over seeds)', () => {
		const avg = (d: typeof diff, pick: (bs: ReturnType<typeof generateBricks>) => number) => {
			let s = 0;
			for (let seed = 1; seed <= 24; seed++) s += pick(generateBricks(seed, cfg, d));
			return s / 24;
		};
		const count = (bs: ReturnType<typeof generateBricks>) => bs.length;
		const frac = (min: number) => (bs: ReturnType<typeof generateBricks>) => (bs.length ? bs.filter((b) => b.maxHp >= min).length / bs.length : 0);
		expect(avg(BREAKOUT_DIFFS.difficile, count)).toBeGreaterThan(avg(BREAKOUT_DIFFS.facile, count));
		expect(avg(BREAKOUT_DIFFS.difficile, frac(2))).toBeGreaterThan(avg(BREAKOUT_DIFFS.facile, frac(2)));
		expect(avg(BREAKOUT_DIFFS.difficile, frac(3))).toBeGreaterThan(avg(BREAKOUT_DIFFS.facile, frac(3)));
	});

	it('mixes 1-, 2- and 3-hit bricks; a 3-hit one takes three hits', () => {
		const kinds = new Set<number>();
		for (let seed = 1; seed <= 24; seed++) for (const b of generateBricks(seed, cfg, BREAKOUT_DIFFS.difficile)) kinds.add(b.maxHp);
		expect([...kinds].sort()).toEqual([1, 2, 3]);

		let s = launch(fresh(3));
		const target = s.bricks.find((b) => b.maxHp === 3) ?? s.bricks.find((b) => b.maxHp === 2)!;
		const hit = (st: BreakoutState): BreakoutState => {
			const br = st.bricks.find((b) => b.col === target.col && b.row === target.row)!;
			const ball: Ball = { x: br.x + br.w / 2, y: br.y + br.h + cfg.ballR + 0.2, vx: 0, vy: -st.speed, stuck: false };
			return stepBreakout({ ...st, balls: [ball], bonuses: [] }, 1 / 60, cfg, st.paddleX);
		};
		for (let i = 1; i < target.maxHp; i++) {
			s = hit(s);
			expect(s.bricks.find((b) => b.col === target.col && b.row === target.row)!.alive).toBe(true);
		}
		s = hit(s);
		expect(s.bricks.find((b) => b.col === target.col && b.row === target.row)!.alive).toBe(false);
	});

	it('drops a free bonus each time the score crosses a milestone', () => {
		const s = launch(fresh());
		const just = cfg.autoBonusEvery - 10;
		const before = { ...s, score: just, bonuses: [], bricks: s.bricks.map((b) => ({ ...b })) };
		// Knock out a brick worth more than the 10 points left to the milestone.
		const br = before.bricks.find((b) => b.alive)!;
		br.bonus = null;
		br.hp = 1; // one hit is enough
		const ball: Ball = { x: br.x + br.w / 2, y: br.y + br.h + cfg.ballR + 0.2, vx: 0, vy: -s.speed, stuck: false };
		const after = stepBreakout({ ...before, balls: [ball] }, 1 / 60, cfg, before.paddleX);
		expect(after.score).toBeGreaterThanOrEqual(cfg.autoBonusEvery);
		expect(after.bonuses).toHaveLength(1);
		expect(BONUS_KINDS).toContain(after.bonuses[0].kind);
		// Deterministic: same milestone → same bonus.
		const twin = stepBreakout({ ...before, balls: [{ ...ball }] }, 1 / 60, cfg, before.paddleX);
		expect(twin.bonuses).toEqual(after.bonuses);
	});

	it('the ball speeds up as the wall empties', () => {
		const s = launch(fresh());
		const full = stepBreakout(s, 1 / 60, cfg, s.paddleX).speed;
		const nearlyDone = { ...s, bricks: s.bricks.map((b, i) => ({ ...b, alive: i === 0 })) };
		expect(stepBreakout(nearlyDone, 1 / 60, cfg, s.paddleX).speed).toBeGreaterThan(full);
	});

	it('the paddle arc reflects about its surface normal (incoming angle still matters)', () => {
		const s = launch(fresh());
		const arc = paddleArc(cfg.paddleBaseW / 2, cfg);
		// Drop a ball just above the arc at horizontal offset `dx` from the paddle centre.
		const drop = (dx: number, vx: number): Ball => ({
			x: s.paddleX + dx,
			y: arc.cy - Math.sqrt(arc.r * arc.r - dx * dx) - cfg.ballR - 0.5,
			vx,
			vy: s.speed,
			stuck: false,
		});
		// Dead centre: the normal points straight up, so the ball goes back up nearly vertically
		// (nearly: a dead-vertical bounce gets a tiny nudge so it can't loop forever).
		const mid = stepBreakout({ ...s, balls: [drop(0, 0)], bonuses: [] }, 1 / 60, cfg, s.paddleX);
		expect(mid.balls[0].vy).toBeLessThan(0);
		expect(Math.abs(mid.balls[0].vx)).toBeGreaterThan(0);
		expect(Math.abs(mid.balls[0].vx)).toBeLessThan(mid.speed * 0.1);
		// Off-centre: the tilted normal throws the ball out to that side.
		const off = stepBreakout({ ...s, balls: [drop(cfg.paddleBaseW * 0.4, 0)], bonuses: [] }, 1 / 60, cfg, s.paddleX);
		expect(off.balls[0].vx).toBeGreaterThan(0);
		// Same spot, but arriving from the right: a different outgoing angle than arriving straight down.
		const angled = stepBreakout({ ...s, balls: [drop(cfg.paddleBaseW * 0.4, -s.speed * 0.6)], bonuses: [] }, 1 / 60, cfg, s.paddleX);
		expect(angled.balls[0].vx).toBeLessThan(off.balls[0].vx);
		// Never near-horizontal, whatever the graze.
		for (const st of [mid, off, angled]) expect(Math.abs(st.balls[0].vy)).toBeGreaterThan(st.speed * 0.25);
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

	it('pierce bonus wipes every brick it touches and never deflects the ball', () => {
		let s = launch(fresh(3));
		s = applyBonus(s, 'pierce', cfg);
		const target = s.bricks.find((b) => b.maxHp === 2)!;
		const ball: Ball = { x: target.x + target.w / 2, y: target.y + target.h + cfg.ballR + 0.2, vx: 0, vy: -s.speed, stuck: false };
		s = { ...s, balls: [ball], bonuses: [] };
		s = stepBreakout(s, 1 / 60, cfg, s.paddleX);
		const hit = s.bricks.find((b) => b.col === target.col && b.row === target.row)!;
		expect(hit.alive).toBe(false); // 2-hit brick gone in a single pass
		expect(s.balls[0].vy).toBeLessThan(0); // still flying straight up, no deflection
	});

	it('split bonus twins a ball on every bounce, capped at maxBalls', () => {
		// A ball dropped straight onto the paddle: one bounce → one twin.
		const onPaddle = (s: BreakoutState): Ball => ({ x: s.paddleX, y: cfg.paddleY - cfg.ballR - 0.5, vx: 0, vy: s.speed, stuck: false });
		let s = applyBonus(launch(fresh()), 'split', cfg);
		s = { ...s, balls: [onPaddle(s)], bonuses: [] };
		s = stepBreakout(s, 1 / 60, cfg, s.paddleX);
		expect(s.balls).toHaveLength(2);

		// Bouncing on and on, the swarm never exceeds the cap.
		expect(play(s, 1200).balls.length).toBeLessThanOrEqual(cfg.maxBalls);

		// Once the timer runs out, a bounce no longer twins.
		let done = applyBonus(launch(fresh()), 'split', cfg);
		done = { ...done, splitMs: 1, balls: [onPaddle(done)], bonuses: [] };
		done = stepBreakout(done, 1 / 60, cfg, done.paddleX); // dt eats the last ms
		expect(done.splitMs).toBe(0);
		expect(done.balls).toHaveLength(1);
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
