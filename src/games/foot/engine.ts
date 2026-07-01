/**
 * COCOTTE FOOT — pure engine (no UI). Side-view 1v1 arena football: two round players
 * (cocottes) run/jump and share ONE easily-bouncing ball that shoots off on any touch.
 * Fully deterministic (no RNG) so the network host can be authoritative over the ball.
 *
 * The island composes the exported pieces: for the BOT/local game use step() (moves both
 * players + ball); over the network the host moves its own player, places the opponent from
 * the received position, then runs stepBall()/resolveKicks(); the guest only runs stepPlayer()
 * on its own cocotte and renders the ball/opponent/score from the host.
 */

export type Side = 0 | 1; // 0 = left player, 1 = right player
export interface PlayerInput { move: -1 | 0 | 1; jump: boolean; }

export interface Player {
	x: number; y: number; vx: number; vy: number;
	onGround: boolean; face: 1 | -1; jumpHeld: boolean;
}
export interface Ball { x: number; y: number; vx: number; vy: number; spin: number; }

export interface World {
	players: [Player, Player];
	ball: Ball;
	score: { l: number; r: number };
	kickoff: number; // seconds of kickoff freeze remaining (0 = live)
}

/* ---------- Arena / tuning (world units, y points down) ---------- */

export const FIELD = { W: 320, H: 180 };
const GROUND_H = 16;
export const FLOOR = FIELD.H - GROUND_H; // top surface of the ground
export const PLAYER_R = 11;
export const BALL_R = 7;
const GOAL_OPEN_H = 58;
export const GOAL_TOP = FLOOR - GOAL_OPEN_H; // crossbar y; goal mouth is [GOAL_TOP, FLOOR]
export const WIN_GOALS = 5;

const GRAVITY = 640;
const RUN_MAX = 106, RUN_ACC = 950, GROUND_DAMP = 0.8, AIR_ACC = 420;
const JUMP_V = 252;
const BALL_REST = 0.84, BALL_AIRDRAG = 0.999, BALL_ROLL = 0.985, WALL_REST = 0.82;
const BALL_MAXV = 470;
const KICK = 155, KICK_TRANSFER = 0.6, KICK_UP = 58;
const KICKOFF_TIME = 1.1;

/* ---------- Construction ---------- */

const mkPlayer = (x: number, face: 1 | -1): Player => ({ x, y: FLOOR - PLAYER_R, vx: 0, vy: 0, onGround: true, face, jumpHeld: false });
const centerBall = (): Ball => ({ x: FIELD.W / 2, y: FIELD.H * 0.32, vx: 0, vy: 0, spin: 0 });

export function createWorld(): World {
	return {
		players: [mkPlayer(FIELD.W * 0.28, 1), mkPlayer(FIELD.W * 0.72, -1)],
		ball: centerBall(),
		score: { l: 0, r: 0 },
		kickoff: KICKOFF_TIME,
	};
}

/* ---------- Player ---------- */

export function stepPlayer(p: Player, inp: PlayerInput, dt: number): void {
	if (inp.move !== 0) {
		p.vx += inp.move * (p.onGround ? RUN_ACC : AIR_ACC) * dt;
		if (p.vx > RUN_MAX) p.vx = RUN_MAX;
		if (p.vx < -RUN_MAX) p.vx = -RUN_MAX;
		p.face = inp.move;
	} else if (p.onGround) {
		p.vx *= GROUND_DAMP;
		if (Math.abs(p.vx) < 3) p.vx = 0;
	}
	if (inp.jump && !p.jumpHeld && p.onGround) { p.vy = -JUMP_V; p.onGround = false; } // jump on rising edge only
	p.jumpHeld = inp.jump;

	p.vy += GRAVITY * dt;
	p.x += p.vx * dt;
	p.y += p.vy * dt;
	reclampPlayer(p);
}

export function reclampPlayer(p: Player): void {
	if (p.x < PLAYER_R) { p.x = PLAYER_R; if (p.vx < 0) p.vx = 0; }
	if (p.x > FIELD.W - PLAYER_R) { p.x = FIELD.W - PLAYER_R; if (p.vx > 0) p.vx = 0; }
	if (p.y >= FLOOR - PLAYER_R) { p.y = FLOOR - PLAYER_R; if (p.vy > 0) p.vy = 0; p.onGround = true; }
	else p.onGround = false;
}

/** Soft positional separation so the two cocottes don't overlap (host-side only). */
export function separatePlayers(a: Player, b: Player): void {
	const dx = b.x - a.x, dy = b.y - a.y;
	const d = Math.hypot(dx, dy);
	const min = PLAYER_R * 2;
	if (d >= min || d === 0) return;
	const nx = dx / d, ny = dy / d, push = (min - d) / 2;
	a.x -= nx * push; a.y -= ny * push;
	b.x += nx * push; b.y += ny * push;
	reclampPlayer(a); reclampPlayer(b);
}

/* ---------- Ball ---------- */

/** Advance the ball (walls/ceiling/floor with restitution, sub-stepped to avoid tunnelling).
 *  Returns the scoring side if the ball entered a goal this step, else null. */
export function stepBall(w: World, dt: number): Side | null {
	const b = w.ball;
	b.vy += GRAVITY * dt;
	b.vx *= BALL_AIRDRAG;
	const sp = Math.hypot(b.vx, b.vy);
	if (sp > BALL_MAXV) { const k = BALL_MAXV / sp; b.vx *= k; b.vy *= k; }
	const steps = Math.max(1, Math.ceil((sp * dt) / (BALL_R * 0.5)));
	const h = dt / steps;
	for (let s = 0; s < steps; s++) {
		b.x += b.vx * h; b.y += b.vy * h;
		if (b.y > FLOOR - BALL_R) { b.y = FLOOR - BALL_R; if (b.vy > 0) b.vy = b.vy < 45 ? 0 : -b.vy * BALL_REST; b.vx *= BALL_ROLL; }
		if (b.y < BALL_R) { b.y = BALL_R; if (b.vy < 0) b.vy = -b.vy * BALL_REST; }
		if (b.x < BALL_R) {
			if (b.y >= GOAL_TOP && b.y <= FLOOR) return 1; // in LEFT goal → right player scores
			b.x = BALL_R; b.vx = Math.abs(b.vx) * WALL_REST;
		}
		if (b.x > FIELD.W - BALL_R) {
			if (b.y >= GOAL_TOP && b.y <= FLOOR) return 0; // in RIGHT goal → left player scores
			b.x = FIELD.W - BALL_R; b.vx = -Math.abs(b.vx) * WALL_REST;
		}
	}
	b.spin += (b.vx / BALL_R) * dt;
	return null;
}

/** Any cocotte overlapping the ball launches it (a shot on every touch). */
export function resolveKicks(w: World): void {
	for (const p of w.players) kick(p, w.ball);
}

function kick(p: Player, b: Ball): void {
	const dx = b.x - p.x, dy = b.y - p.y;
	const d = Math.hypot(dx, dy);
	const min = PLAYER_R + BALL_R;
	if (d >= min) return;
	const nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : -1;
	b.x = p.x + nx * min; b.y = p.y + ny * min; // separate
	b.vx = nx * KICK + p.vx * KICK_TRANSFER;
	b.vy = ny * KICK + p.vy * KICK_TRANSFER - KICK_UP; // upward pop so a touch becomes a shot
	const sp = Math.hypot(b.vx, b.vy);
	if (sp > BALL_MAXV) { const k = BALL_MAXV / sp; b.vx *= k; b.vy *= k; }
}

/** Register a goal: bump the score, recentre the ball, start a short kickoff freeze. */
export function applyScore(w: World, scorer: Side): void {
	if (scorer === 0) w.score.l++; else w.score.r++;
	w.ball = centerBall();
	w.kickoff = KICKOFF_TIME;
}

/* ---------- Full step (bot / local / tests) ---------- */

export function step(w: World, dt: number, inputs: [PlayerInput, PlayerInput]): { scorer: Side | null } {
	if (w.kickoff > 0) {
		w.kickoff -= dt;
		stepPlayer(w.players[0], inputs[0], dt);
		stepPlayer(w.players[1], inputs[1], dt);
		separatePlayers(w.players[0], w.players[1]);
		Object.assign(w.ball, centerBall()); // ball held at centre during kickoff
		return { scorer: null };
	}
	stepPlayer(w.players[0], inputs[0], dt);
	stepPlayer(w.players[1], inputs[1], dt);
	separatePlayers(w.players[0], w.players[1]);
	const scorer = stepBall(w, dt);
	resolveKicks(w);
	if (scorer !== null) applyScore(w, scorer);
	return { scorer };
}

/* ---------- Serialisation (network) ---------- */

export interface BallMsg { x: number; y: number; vx: number; vy: number; }
export interface PlayerPos { x: number; y: number; vx: number; vy: number; face: 1 | -1 }

export const ballState = (w: World): BallMsg => ({ x: w.ball.x, y: w.ball.y, vx: w.ball.vx, vy: w.ball.vy });
export const applyBall = (w: World, s: BallMsg): void => { w.ball.x = s.x; w.ball.y = s.y; w.ball.vx = s.vx; w.ball.vy = s.vy; };
export const playerPos = (p: Player): PlayerPos => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, face: p.face });
export const applyPlayerPos = (p: Player, s: PlayerPos): void => { p.x = s.x; p.y = s.y; p.vx = s.vx; p.vy = s.vy; p.face = s.face; };
