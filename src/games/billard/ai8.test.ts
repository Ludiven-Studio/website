import { describe, it, expect } from 'vitest';
import { makeTable, stepBalls, isSettled, BALL_R, type Ball } from './engine';
import { chooseShot } from './ai8';
import { mulberry32 } from '../prng';

const b = (o: Partial<Ball>): Ball => ({ x: 0, y: 0, vx: 0, vy: 0, r: BALL_R, kind: 'color', color: 0, potted: false, ...o });

/** Run a chosen shot on a clone and report what happened. */
function play(balls: Ball[], vx: number, vy: number) {
	const t = makeTable();
	const sim = balls.map((x) => ({ ...x }));
	const cue = sim.find((x) => x.kind === 'cue')!;
	cue.vx = vx; cue.vy = vy;
	const potted: number[] = [];
	let scratched = false;
	for (let i = 0; i < 600; i++) { const r = stepBalls(sim, t, 1 / 60); potted.push(...r.pottedColors); if (r.scratched) scratched = true; if (isSettled(sim)) break; }
	return { potted, scratched };
}

describe('ai8 chooseShot', () => {
	it('pots a clear own ball at full skill without scratching', () => {
		const t = makeTable();
		// Cue, and a solid (3) placed dead-straight on the cue→corner(200,0) line.
		const balls = [b({ x: 50, y: 50, kind: 'cue', color: -1 }), b({ x: 100, y: 80, color: 3 })];
		const shot = chooseShot(balls, t, 'solid', 1, mulberry32(42));
		const res = play(balls, shot.vx, shot.vy);
		expect(res.potted).toContain(3);
		expect(res.scratched).toBe(false);
	});

	it('skill 0 scatters the aim more than skill 1', () => {
		const t = makeTable();
		const balls = [b({ x: 50, y: 50, kind: 'cue', color: -1 }), b({ x: 100, y: 80, color: 3 })];
		const angles = (skill: number): number[] =>
			Array.from({ length: 30 }, (_, s) => { const sh = chooseShot(balls, t, 'solid', skill, mulberry32(s + 1)); return Math.atan2(sh.vy, sh.vx); });
		const variance = (a: number[]): number => { const m = a.reduce((x, y) => x + y, 0) / a.length; return a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length; };
		expect(variance(angles(0))).toBeGreaterThan(variance(angles(1)) + 1e-6);
	});
});
