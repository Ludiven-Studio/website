/**
 * CASSE-BRIQUES — pure engine (no UI, fixed-timestep, frame-rate independent).
 * The brick layout AND its bonuses are a pure function of the seed, so the daily
 * challenge is identical for everyone regardless of how the player plays.
 * All units are logical (a 100-wide world); the island scales it to the canvas.
 *
 * Balls keep a CONSTANT speed (classic breakout): only their direction changes on
 * a bounce. The "slow" bonus lowers that target speed for a while.
 */

import { mulberry32 } from '../prng';

export type BonusKind = 'wide' | 'multi' | 'power' | 'life' | 'slow';
export const BONUS_KINDS: BonusKind[] = ['wide', 'multi', 'power', 'life', 'slow'];

export interface BreakoutConfig {
	worldW: number;
	worldH: number;
	cols: number;
	sideMargin: number;
	brickTop: number; // y of the first brick row
	brickH: number;
	brickGap: number;
	paddleY: number; // top of the paddle
	paddleH: number;
	paddleBaseW: number;
	paddleWideW: number; // paddle width while "wide" is active
	ballR: number;
	steer: number; // how much the paddle hit position bends the bounce (0..1)
	bonusW: number;
	bonusH: number;
	bonusFallV: number; // units / s
	bonusChance: number; // fraction of bricks that carry a bonus
	maxBalls: number;
	wideMs: number;
	powerMs: number;
	slowMs: number;
	slowFactor: number; // speed multiplier while "slow" is active
	startLives: number;
}

const BASE = {
	worldW: 100,
	worldH: 132,
	cols: 10,
	sideMargin: 3,
	brickTop: 13,
	brickH: 5,
	brickGap: 1.2,
	paddleY: 124,
	paddleH: 3,
	paddleBaseW: 20,
	paddleWideW: 32,
	ballR: 1.7,
	steer: 0.75,
	bonusW: 8,
	bonusH: 5,
	bonusFallV: 33,
	bonusChance: 0.16,
	maxBalls: 8,
	wideMs: 12000,
	powerMs: 10000,
	slowMs: 9000,
	slowFactor: 0.68,
	startLives: 3,
};

export interface BreakoutDiff {
	label: string;
	rows: number;
	twoHpChance: number; // fraction of 2-hit bricks
	speed: number; // ball speed, units / s
}

export const BREAKOUT_DIFFS: Record<string, BreakoutDiff> = {
	facile: { label: 'Facile', rows: 4, twoHpChance: 0.12, speed: 66 },
	moyen: { label: 'Moyen', rows: 6, twoHpChance: 0.34, speed: 78 },
	difficile: { label: 'Difficile', rows: 8, twoHpChance: 0.55, speed: 92 },
};

export const breakoutConfig = (): BreakoutConfig => ({ ...BASE });
export const BREAKOUT_CFG: BreakoutConfig = breakoutConfig();

export const brickWidth = (cfg: BreakoutConfig): number =>
	(cfg.worldW - 2 * cfg.sideMargin - (cfg.cols - 1) * cfg.brickGap) / cfg.cols;

export type BreakoutStatus = 'ready' | 'playing' | 'won' | 'over';

export interface Brick {
	col: number;
	row: number;
	x: number; // left
	y: number; // top
	w: number;
	h: number;
	hp: number;
	maxHp: number;
	bonus: BonusKind | null;
	alive: boolean;
}

export interface Ball {
	x: number;
	y: number;
	vx: number;
	vy: number;
	stuck: boolean; // resting on the paddle, waiting to launch
}

export interface FallingBonus {
	x: number; // centre
	y: number; // centre
	kind: BonusKind;
}

export interface BreakoutState {
	balls: Ball[];
	bricks: Brick[];
	paddleX: number; // centre
	bonuses: FallingBonus[];
	lives: number;
	score: number;
	status: BreakoutStatus;
	speed: number; // current target ball speed (diff speed, lowered by "slow")
	baseSpeed: number; // diff speed without the slow bonus
	wideMs: number;
	powerMs: number;
	slowMs: number;
}

// Bonus weights — helpful ones are common, "life" is rarer.
const BONUS_WEIGHTS: [BonusKind, number][] = [
	['wide', 5],
	['multi', 4],
	['power', 4],
	['slow', 3],
	['life', 2],
];

function pickBonus(r: number): BonusKind {
	const total = BONUS_WEIGHTS.reduce((s, [, w]) => s + w, 0);
	let t = r * total;
	for (const [k, w] of BONUS_WEIGHTS) {
		if (t < w) return k;
		t -= w;
	}
	return 'wide';
}

/** Brick field for a seed — pure, so the daily layout is shared by everyone. */
export function generateBricks(seed: number, cfg: BreakoutConfig, diff: BreakoutDiff): Brick[] {
	const rng = mulberry32(seed >>> 0);
	const bw = brickWidth(cfg);
	const bricks: Brick[] = [];
	for (let row = 0; row < diff.rows; row++) {
		for (let col = 0; col < cfg.cols; col++) {
			const hp = rng() < diff.twoHpChance ? 2 : 1;
			const bonus = rng() < cfg.bonusChance ? pickBonus(rng()) : null;
			bricks.push({
				col,
				row,
				x: cfg.sideMargin + col * (bw + cfg.brickGap),
				y: cfg.brickTop + row * (cfg.brickH + cfg.brickGap),
				w: bw,
				h: cfg.brickH,
				hp,
				maxHp: hp,
				bonus,
				alive: true,
			});
		}
	}
	return bricks;
}

/** A ball resting on the paddle centre, ready to launch. */
function ballOnPaddle(cfg: BreakoutConfig, paddleX: number): Ball {
	return { x: paddleX, y: cfg.paddleY - cfg.ballR - 0.1, vx: 0, vy: 0, stuck: true };
}

export function createBreakout(cfg: BreakoutConfig, bricks: Brick[], diff: BreakoutDiff): BreakoutState {
	const paddleX = cfg.worldW / 2;
	return {
		balls: [ballOnPaddle(cfg, paddleX)],
		bricks,
		paddleX,
		bonuses: [],
		lives: cfg.startLives,
		score: 0,
		status: 'ready',
		speed: diff.speed,
		baseSpeed: diff.speed,
		wideMs: 0,
		powerMs: 0,
		slowMs: 0,
	};
}

/** Launch every resting ball upward (slight seed-independent spread so multi-balls fan out). */
export function launch(state: BreakoutState): BreakoutState {
	if (state.status === 'over' || state.status === 'won') return state;
	const balls = state.balls.map((b, i) => {
		if (!b.stuck) return b;
		const ang = -Math.PI / 2 + (i - (state.balls.length - 1) / 2) * 0.35;
		return { ...b, vx: Math.cos(ang) * state.speed, vy: Math.sin(ang) * state.speed, stuck: false };
	});
	return { ...state, balls, status: 'playing' };
}

export const paddleWidth = (state: BreakoutState, cfg: BreakoutConfig): number =>
	state.wideMs > 0 ? cfg.paddleWideW : cfg.paddleBaseW;

/** Re-normalise a velocity to a target speed (keeps ball speed constant). */
function setSpeed(vx: number, vy: number, speed: number): { vx: number; vy: number } {
	const m = Math.hypot(vx, vy) || 1;
	return { vx: (vx / m) * speed, vy: (vy / m) * speed };
}

/** Apply a caught bonus. Instant ones (multi/life) act now; timed ones set a countdown. */
export function applyBonus(state: BreakoutState, kind: BonusKind, cfg: BreakoutConfig): BreakoutState {
	switch (kind) {
		case 'wide':
			return { ...state, wideMs: cfg.wideMs };
		case 'power':
			return { ...state, powerMs: cfg.powerMs };
		case 'life':
			return { ...state, lives: state.lives + 1 };
		case 'slow': {
			const speed = state.baseSpeed * cfg.slowFactor;
			const balls = state.balls.map((b) => (b.stuck ? b : { ...b, ...setSpeed(b.vx, b.vy, speed) }));
			return { ...state, slowMs: cfg.slowMs, speed, balls };
		}
		case 'multi': {
			if (state.balls.length >= cfg.maxBalls) return state;
			const extra: Ball[] = [];
			for (const b of state.balls) {
				if (b.stuck) continue;
				for (const da of [0.4, -0.4]) {
					if (state.balls.length + extra.length >= cfg.maxBalls) break;
					const ang = Math.atan2(b.vy, b.vx) + da;
					extra.push({ x: b.x, y: b.y, vx: Math.cos(ang) * state.speed, vy: Math.sin(ang) * state.speed, stuck: false });
				}
			}
			return { ...state, balls: [...state.balls, ...extra] };
		}
	}
}

// Score rewards: clearing a brick, catching a bonus, and finishing the field.
export const BRICK_POINTS = 50; // × maxHp
export const BONUS_POINTS = 25;
export const CLEAR_POINTS = 500;
export const LIFE_POINTS = 100; // per life left when the field is cleared

/**
 * One fixed-timestep update. Deterministic given (state, dt, paddleX): no randomness
 * (bonuses are baked into the bricks at generation). Returns a new state.
 */
export function stepBreakout(state: BreakoutState, dt: number, cfg: BreakoutConfig, paddleX: number): BreakoutState {
	if (state.status !== 'playing') return { ...state, paddleX };

	let { score, speed } = state;
	const { lives } = state;
	const wideMs = Math.max(0, state.wideMs - dt * 1000);
	const powerMs = Math.max(0, state.powerMs - dt * 1000);
	const slowMs = Math.max(0, state.slowMs - dt * 1000);
	const power = powerMs > 0;
	// Slow just ended → restore full speed.
	if (slowMs === 0 && speed !== state.baseSpeed) speed = state.baseSpeed;

	const bricks = state.bricks.map((b) => ({ ...b }));
	const pw = wideMs > 0 ? cfg.paddleWideW : cfg.paddleBaseW;
	const half = pw / 2;
	const px = Math.max(half, Math.min(cfg.worldW - half, paddleX));

	const balls: Ball[] = [];
	for (const src of state.balls) {
		const b = { ...src };
		if (b.stuck) {
			b.x = px;
			b.y = cfg.paddleY - cfg.ballR - 0.1;
			balls.push(b);
			continue;
		}
		// Keep constant speed, then advance.
		({ vx: b.vx, vy: b.vy } = setSpeed(b.vx, b.vy, speed));
		b.x += b.vx * dt;
		b.y += b.vy * dt;

		// Side + ceiling walls.
		if (b.x < cfg.ballR) { b.x = cfg.ballR; b.vx = Math.abs(b.vx); }
		else if (b.x > cfg.worldW - cfg.ballR) { b.x = cfg.worldW - cfg.ballR; b.vx = -Math.abs(b.vx); }
		if (b.y < cfg.ballR) { b.y = cfg.ballR; b.vy = Math.abs(b.vy); }

		// Paddle: reflect up, steering by where it hit.
		if (b.vy > 0 && b.y + cfg.ballR >= cfg.paddleY && b.y - cfg.ballR <= cfg.paddleY + cfg.paddleH) {
			if (b.x >= px - half - cfg.ballR && b.x <= px + half + cfg.ballR) {
				const rel = Math.max(-1, Math.min(1, (b.x - px) / half));
				const ang = -Math.PI / 2 + rel * cfg.steer * (Math.PI / 2.4);
				b.vx = Math.cos(ang) * speed;
				b.vy = Math.sin(ang) * speed;
				b.y = cfg.paddleY - cfg.ballR - 0.1;
			}
		}

		// One brick collision per step (nearest-axis reflection).
		for (const br of bricks) {
			if (!br.alive) continue;
			if (b.x + cfg.ballR < br.x || b.x - cfg.ballR > br.x + br.w) continue;
			if (b.y + cfg.ballR < br.y || b.y - cfg.ballR > br.y + br.h) continue;
			// Decide bounce axis from the smaller overlap.
			const overlapX = Math.min(b.x + cfg.ballR - br.x, br.x + br.w - (b.x - cfg.ballR));
			const overlapY = Math.min(b.y + cfg.ballR - br.y, br.y + br.h - (b.y - cfg.ballR));
			if (overlapX < overlapY) b.vx = b.x < br.x + br.w / 2 ? -Math.abs(b.vx) : Math.abs(b.vx);
			else b.vy = b.y < br.y + br.h / 2 ? -Math.abs(b.vy) : Math.abs(b.vy);
			br.hp -= power ? 2 : 1;
			if (br.hp <= 0) {
				br.alive = false;
				score += BRICK_POINTS * br.maxHp;
				if (br.bonus) state = { ...state, bonuses: [...state.bonuses, { x: br.x + br.w / 2, y: br.y + br.h / 2, kind: br.bonus }] };
			}
			break;
		}

		// Below the floor → the ball is lost (dropped from the list).
		if (b.y - cfg.ballR > cfg.worldH) continue;
		balls.push(b);
	}

	// Falling bonuses: descend, catch on the paddle, cull off-screen.
	let bonuses = state.bonuses.map((bo) => ({ ...bo, y: bo.y + cfg.bonusFallV * dt }));
	const caught: BonusKind[] = [];
	bonuses = bonuses.filter((bo) => {
		const onPaddle =
			bo.y + cfg.bonusH / 2 >= cfg.paddleY &&
			bo.y - cfg.bonusH / 2 <= cfg.paddleY + cfg.paddleH &&
			bo.x >= px - half - cfg.bonusW / 2 &&
			bo.x <= px + half + cfg.bonusW / 2;
		if (onPaddle) { caught.push(bo.kind); return false; }
		return bo.y - cfg.bonusH / 2 <= cfg.worldH;
	});

	let next: BreakoutState = { ...state, balls, bricks, paddleX: px, bonuses, score, lives, speed, wideMs, powerMs, slowMs };
	for (const k of caught) {
		if (k === 'life') { next = { ...next, lives: next.lives + 1 }; score = next.score; }
		else next = applyBonus(next, k, cfg);
		if (k !== 'life') score = next.score;
	}
	// applyBonus may add balls/timers; re-read them but keep our stepped score.
	next = { ...next, score };

	// Lost the last ball → consume a life and re-serve, or game over.
	if (next.balls.length === 0) {
		if (next.lives > 1) {
			next = { ...next, lives: next.lives - 1, balls: [ballOnPaddle(cfg, px)], speed: next.baseSpeed, slowMs: 0, powerMs: 0, wideMs: 0 };
			return launch(next);
		}
		return { ...next, lives: 0, status: 'over' };
	}

	// Field cleared → win, banking a clear bonus + a reward per remaining life.
	if (!next.bricks.some((br) => br.alive)) {
		return { ...next, status: 'won', score: next.score + CLEAR_POINTS + Math.max(0, next.lives - 1) * LIFE_POINTS };
	}

	return next;
}
