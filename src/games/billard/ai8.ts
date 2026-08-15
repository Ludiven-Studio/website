/**
 * 8-BALL AI — picks a shot by geometry (ghost ball) + SIMULATION scoring on the real engine.
 * `skill` 0..1 degrades aim/power. Reuses the same clone-and-step pattern as predictCue.
 */
import { BALL_R, stepBalls, isSettled, type Ball, type Table, type Vec } from './engine';
import { groupOf, type Group } from './rules8';

export interface AiShot { place?: Vec; vx: number; vy: number; }

const AI_MAX_SPEED = 195; // mirrors the engine cap
const SIM_MAX = 600;

interface SimResult { firstHit: number | null; potted: number[]; scratched: boolean; railAfterContact: boolean; }

/** Fire a candidate shot on a clone and read the accumulated outcome (as the game does). */
function simulate(balls: Ball[], table: Table, vel: Vec, place?: Vec): SimResult {
	const sim = balls.map((b) => ({ ...b }));
	const cue = sim.find((b) => b.kind === 'cue');
	if (!cue) return { firstHit: null, potted: [], scratched: false, railAfterContact: false };
	if (place) { cue.x = place.x; cue.y = place.y; cue.potted = false; }
	cue.vx = vel.x; cue.vy = vel.y;
	const acc: SimResult = { firstHit: null, potted: [], scratched: false, railAfterContact: false };
	let contact = false;
	for (let s = 0; s < SIM_MAX; s++) {
		const r = stepBalls(sim, table, 1 / 60);
		if (r.firstHit !== null && !contact) { contact = true; acc.firstHit = r.firstHit; }
		if (r.railHit && contact) acc.railAfterContact = true;
		if (r.pottedColors.length) acc.potted.push(...r.pottedColors);
		if (r.scratched) acc.scratched = true;
		if (isSettled(sim)) break;
	}
	return acc;
}

/** Is the segment from→to blocked by another ball (centre within ~2R of the line)? */
function blocked(from: Vec, to: Vec, balls: Ball[], ig1: Ball, ig2: Ball | null): boolean {
	const dx = to.x - from.x, dy = to.y - from.y, L = Math.hypot(dx, dy) || 1;
	const ux = dx / L, uy = dy / L;
	for (const b of balls) {
		if (b.potted || b === ig1 || b === ig2 || b.kind === 'cue') continue;
		const t = (b.x - from.x) * ux + (b.y - from.y) * uy;
		if (t <= 0 || t >= L) continue;
		const px = from.x + ux * t, py = from.y + uy * t;
		if (Math.hypot(b.x - px, b.y - py) < 2 * BALL_R - 0.5) return true;
	}
	return false;
}

function scoreSim(sim: SimResult, group: Group | null, groupCleared: boolean): number {
	let s = 0;
	if (sim.scratched) s -= 400;
	if (sim.firstHit === null) s -= 300;
	else {
		const fg = groupOf(sim.firstHit);
		if (group !== null) { const want = groupCleared ? 'eight' : group; if (fg !== want) s -= 300; }
		else if (fg === 'eight') s -= 200;
	}
	for (const n of sim.potted) {
		if (n === 8) s += groupCleared && !sim.scratched ? 1000 : -500;
		else if (group === null) s += 80;
		else if (groupOf(n) === group) s += 100;
		else s -= 30;
	}
	if (sim.potted.length === 0 && !sim.railAfterContact) s -= 40; // no-rail foul
	return s;
}

const gaussian = (rng: () => number): number => {
	const u1 = Math.min(0.999999, Math.max(1e-6, rng())); // clamp away from 0/1 → finite, bounded ±~5
	return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
};

/** Legal-but-safe shot when nothing pots: nudge the nearest own ball toward a rail. */
function safety(balls: Ball[], table: Table, pool: Ball[], cue: Vec): AiShot {
	let best = pool[0], bd = Infinity;
	for (const b of pool) { const d = Math.hypot(b.x - cue.x, b.y - cue.y); if (d < bd) { bd = d; best = b; } }
	if (!best) return { vx: 0, vy: 60 };
	const dx = best.x - cue.x, dy = best.y - cue.y, L = Math.hypot(dx, dy) || 1;
	// Enough power that the object reaches a cushion (avoids the no-rail foul), verified by sim.
	for (const spd of [Math.min(AI_MAX_SPEED, 90 + L * 1.4), 150, AI_MAX_SPEED]) {
		const vel = { x: (dx / L) * spd, y: (dy / L) * spd };
		const sim = simulate(balls, table, vel);
		if (!sim.scratched && sim.firstHit !== null && (sim.railAfterContact || sim.potted.length)) return { vx: vel.x, vy: vel.y };
	}
	return { vx: (dx / L) * AI_MAX_SPEED, vy: (dy / L) * AI_MAX_SPEED };
}

/**
 * Choose the AI's shot. `group` is the AI's assigned group (null while the table is open).
 * Returns a cue velocity (and optional `place` for ball-in-hand, unused in V1).
 */
export function chooseShot(balls: Ball[], table: Table, group: Group | null, skill: number, rng: () => number): AiShot {
	const cue = balls.find((b) => b.kind === 'cue');
	if (!cue) return { vx: 0, vy: 0 };
	const cuePos: Vec = { x: cue.x, y: cue.y };
	const objs = balls.filter((b) => b.kind === 'color' && !b.potted);
	const myBalls = group === null ? objs.filter((b) => b.color !== 8) : objs.filter((b) => groupOf(b.color) === group);
	const groupCleared = group !== null && myBalls.length === 0;
	const targets = group !== null && groupCleared ? objs.filter((b) => b.color === 8) : myBalls;
	const pool = targets.length ? targets : objs;
	if (!pool.length) return { vx: 0, vy: 60 };

	const cands: { vx: number; vy: number; score: number }[] = [];
	for (const O of pool) {
		for (const P of table.pockets) {
			const opx = P.x - O.x, opy = P.y - O.y, opl = Math.hypot(opx, opy) || 1;
			const ux = opx / opl, uy = opy / opl; // O → P unit
			const gx = O.x - 2 * BALL_R * ux, gy = O.y - 2 * BALL_R * uy; // ghost-ball centre
			const dgx = gx - cuePos.x, dgy = gy - cuePos.y, dgl = Math.hypot(dgx, dgy) || 1;
			const sx = dgx / dgl, sy = dgy / dgl; // cue shot direction
			if (sx * ux + sy * uy < 0.35) continue; // cut too thin (>~70°)
			if ((O.x - cuePos.x) * ux + (O.y - cuePos.y) * uy <= 0) continue; // pocket on the wrong side
			if (blocked(cuePos, { x: gx, y: gy }, balls, cue, O)) continue; // cue path blocked
			if (blocked({ x: O.x, y: O.y }, { x: P.x, y: P.y }, balls, O, null)) continue; // object path blocked
			const need = Math.min(AI_MAX_SPEED, 60 + (dgl + opl) * 1.1);
			const vel = { x: sx * need, y: sy * need };
			cands.push({ vx: vel.x, vy: vel.y, score: scoreSim(simulate(balls, table, vel), group, groupCleared) });
		}
	}
	cands.sort((a, b) => b.score - a.score);
	let chosen = cands[0];
	if (cands.length > 1 && rng() < (1 - skill) * 0.4) chosen = cands[Math.min(cands.length - 1, 1 + Math.floor(rng() * 2))];
	if (!chosen || chosen.score <= 0) return safety(balls, table, pool, cuePos);

	// Degrade the FIRED shot by skill (aim noise + power error) so the human sees real misses.
	const ang = Math.atan2(chosen.vy, chosen.vx) + gaussian(rng) * (1 - skill) * 0.12;
	const spd = Math.min(AI_MAX_SPEED, Math.max(25, Math.hypot(chosen.vx, chosen.vy) * (1 + (rng() * 2 - 1) * (1 - skill) * 0.25)));
	return { vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd };
}
