/**
 * COCOTTE FOOT — pure engine (no UI). Side-view 2v2 arena football: four round players
 * (cocottes, two per team) run/jump and share ONE easily-bouncing ball that shoots off — and
 * LOFTS when struck along the ground. Fully deterministic (no RNG) so the network host can be
 * authoritative over the ball. Slots 0,1 = left team (0); slots 2,3 = right team (1).
 *
 * The island composes the exported pieces: for the BOT/local game use step() (moves all four
 * players + ball); over the network the host moves the slots it owns (its player + the bots),
 * places the guest from the received position, then runs stepBall()/resolveKicks(); the guest
 * only runs stepPlayer() on its own cocotte and renders everything else from the host.
 */

export type Side = 0 | 1; // team: 0 = left, 1 = right
export interface PlayerInput { move: -1 | 0 | 1; jump: boolean; dash?: boolean; }

export interface Player {
	x: number; y: number; vx: number; vy: number;
	onGround: boolean; face: 1 | -1; jumpHeld: boolean; team: Side; dashT: number; active: boolean;
}
export interface Ball { x: number; y: number; vx: number; vy: number; spin: number; }

export interface World {
	players: Player[]; // always length 4 (slots 0,1 = team 0 · slots 2,3 = team 1); in 1v1 the
	ball: Ball;        // backup slots (1 & 3) are inactive — kept for stable slot numbering.
	score: { l: number; r: number };
	kickoff: number; // seconds of kickoff freeze remaining (0 = live)
	teamSize: 1 | 2;
}

/* ---------- Arena / tuning (world units, y points down) ---------- */

export const FIELD = { W: 460, H: 190 };
const GROUND_H = 16;
export const FLOOR = FIELD.H - GROUND_H; // top surface of the ground
export const PLAYER_R = 11;
export const BALL_R = 7;
const GOAL_OPEN_H = 38; // goal-mouth height (kept small so goals stay hard-earned)
export const GOAL_TOP = FLOOR - GOAL_OPEN_H; // crossbar y; goal mouth is [GOAL_TOP, FLOOR]
export const WIN_GOALS = 5;

const GRAVITY = 640;
const RUN_MAX = 114, RUN_ACC = 1000, GROUND_DAMP = 0.8, AIR_ACC = 440;
const JUMP_V = 258, FLAP_V = 200; // FLAP_V = upward pop of an in-air wing flap (hens fly a bit)
// Double-tap flash dash: a big horizontal blink (~5× a hen's width) that shoves other hens.
const DASH_V = 380, DASH_MAX = 380, DASH_TIME = 0.3, KNOCKBACK = 300;
export const DASH_DETECT = 240; // speed above which a hen counts as "dashing" (knockback + flash trail)
const BALL_REST = 0.84, BALL_AIRDRAG = 0.999, BALL_ROLL = 0.985, WALL_REST = 0.82;
const BALL_MAXV = 500;
const KICK = 165, KICK_TRANSFER = 0.62, KICK_UP = 60, LIFT_MIN = 140; // LIFT_MIN = min upward pop for a grounded shot
const KICKOFF_TIME = 1.1;

/* ---------- Construction ---------- */

const mkPlayer = (x: number, face: 1 | -1, team: Side, active: boolean): Player => ({ x, y: FLOOR - PLAYER_R, vx: 0, vy: 0, onGround: true, face, jumpHeld: false, team, dashT: 0, active });
const centerBall = (): Ball => ({ x: FIELD.W / 2, y: FIELD.H * 0.3, vx: 0, vy: 0, spin: 0 });

export function createWorld(teamSize: 1 | 2 = 2): World {
	const t2 = teamSize === 2;
	return {
		players: [
			mkPlayer(FIELD.W * 0.34, 1, 0, true), // slot 0 — left team, striker (host / you)
			mkPlayer(FIELD.W * 0.16, 1, 0, t2),  // slot 1 — left team, backup (2v2 only)
			mkPlayer(FIELD.W * 0.66, -1, 1, true), // slot 2 — right team, striker (guest)
			mkPlayer(FIELD.W * 0.84, -1, 1, t2), // slot 3 — right team, backup (2v2 only)
		],
		ball: centerBall(),
		score: { l: 0, r: 0 },
		kickoff: KICKOFF_TIME,
		teamSize,
	};
}

/** Switch a world between 1v1 and 2v2 (activates/deactivates the backup slots). */
export function setTeamSize(w: World, ts: 1 | 2): void {
	w.teamSize = ts;
	w.players[1].active = ts === 2;
	w.players[3].active = ts === 2;
}

/* ---------- Player ---------- */

export function stepPlayer(p: Player, inp: PlayerInput, dt: number): void {
	if (p.dashT > 0) p.dashT -= dt;
	if (inp.dash && p.dashT <= 0) { // double-tap sprint
		const dir = inp.move !== 0 ? inp.move : p.face;
		p.dashT = DASH_TIME; p.vx = dir * DASH_V; p.face = dir;
	}
	const maxv = p.dashT > 0 ? DASH_MAX : RUN_MAX;
	if (inp.move !== 0) {
		p.vx += inp.move * (p.onGround ? RUN_ACC : AIR_ACC) * dt;
		if (p.vx > maxv) p.vx = maxv;
		if (p.vx < -maxv) p.vx = -maxv;
		p.face = inp.move;
	} else if (p.onGround && p.dashT <= 0) {
		p.vx *= GROUND_DAMP;
		if (Math.abs(p.vx) < 3) p.vx = 0;
	}
	if (inp.jump && !p.jumpHeld) { // rising edge only
		if (p.onGround) { p.vy = -JUMP_V; p.onGround = false; } // full jump from the ground
		else if (p.vy > -FLAP_V) p.vy = -FLAP_V; // wing flap in the air → glide/fly a bit
	}
	p.jumpHeld = inp.jump;

	p.vy += GRAVITY * dt;
	p.x += p.vx * dt;
	p.y += p.vy * dt;
	reclampPlayer(p);
}

export function reclampPlayer(p: Player): void {
	if (p.x < PLAYER_R) { p.x = PLAYER_R; if (p.vx < 0) p.vx = 0; }
	if (p.x > FIELD.W - PLAYER_R) { p.x = FIELD.W - PLAYER_R; if (p.vx > 0) p.vx = 0; }
	if (p.y < PLAYER_R) { p.y = PLAYER_R; if (p.vy < 0) p.vy = 0; } // ceiling: don't fly off the top
	if (p.y >= FLOOR - PLAYER_R) { p.y = FLOOR - PLAYER_R; if (p.vy > 0) p.vy = 0; p.onGround = true; }
	else p.onGround = false;
}

const isDashing = (p: Player): boolean => p.dashT > 0 || Math.abs(p.vx) > DASH_DETECT;

/** Soft positional separation so two cocottes don't overlap — and a flash-dashing hen
 *  SHOVES the other one (strong knockback + little pop). */
export function separatePlayers(a: Player, b: Player): void {
	const dx = b.x - a.x, dy = b.y - a.y;
	const d = Math.hypot(dx, dy);
	const min = PLAYER_R * 2;
	if (d >= min || d === 0) return;
	const nx = dx / d, ny = dy / d, push = (min - d) / 2;
	a.x -= nx * push; a.y -= ny * push;
	b.x += nx * push; b.y += ny * push;
	const ad = isDashing(a), bd = isDashing(b);
	if (ad !== bd) { // exactly one is flashing → it bulldozes the other
		const dasher = ad ? a : b, other = ad ? b : a;
		const dir = Math.sign(dasher.vx) || dasher.face;
		other.vx = dir * KNOCKBACK;
		other.vy = Math.min(other.vy, -KNOCKBACK * 0.45); // knock it off its feet
		other.onGround = false;
	}
	reclampPlayer(a); reclampPlayer(b);
}

export function separateAll(ps: Player[]): void {
	for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { if (ps[i].active && ps[j].active) separatePlayers(ps[i], ps[j]); }
}

/* ---------- Ball ---------- */

/** Advance the ball (walls/ceiling/floor with restitution, sub-stepped to avoid tunnelling).
 *  Returns the scoring TEAM if the ball entered a goal this step, else null. */
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
			if (b.y >= GOAL_TOP && b.y <= FLOOR) return 1; // in LEFT goal → right team scores
			b.x = BALL_R; b.vx = Math.abs(b.vx) * WALL_REST;
		}
		if (b.x > FIELD.W - BALL_R) {
			if (b.y >= GOAL_TOP && b.y <= FLOOR) return 0; // in RIGHT goal → left team scores
			b.x = FIELD.W - BALL_R; b.vx = -Math.abs(b.vx) * WALL_REST;
		}
	}
	b.spin += (b.vx / BALL_R) * dt;
	return null;
}

/** Any cocotte overlapping the ball launches it (a shot on every touch). */
export function resolveKicks(w: World): void {
	for (const p of w.players) if (p.active) kick(p, w.ball);
}

function kick(p: Player, b: Ball): void {
	const dx = b.x - p.x, dy = b.y - p.y;
	const d = Math.hypot(dx, dy);
	const min = PLAYER_R + BALL_R;
	if (d >= min) return;
	const nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : -1;
	b.x = p.x + nx * min; b.y = p.y + ny * min; // separate
	b.vx = nx * KICK + p.vx * KICK_TRANSFER;
	let vy = ny * KICK + p.vy * KICK_TRANSFER - KICK_UP;
	// A grounded ball struck roughly horizontally must LOFT into a shot, not be driven into the turf.
	if (b.y > FLOOR - BALL_R * 2.2 && vy > -LIFT_MIN) vy = -LIFT_MIN - Math.abs(p.vx) * 0.3;
	b.vy = vy;
	const sp = Math.hypot(b.vx, b.vy);
	if (sp > BALL_MAXV) { const k = BALL_MAXV / sp; b.vx *= k; b.vy *= k; }
}

/** Register a goal: bump the team score, recentre the ball, start a short kickoff freeze. */
export function applyScore(w: World, scorer: Side): void {
	if (scorer === 0) w.score.l++; else w.score.r++;
	w.ball = centerBall();
	w.kickoff = KICKOFF_TIME;
}

/* ---------- Full step (bot / local / tests) ---------- */

export function step(w: World, dt: number, inputs: PlayerInput[]): { scorer: Side | null } {
	if (w.kickoff > 0) {
		w.kickoff -= dt;
		for (let i = 0; i < w.players.length; i++) if (w.players[i].active) stepPlayer(w.players[i], inputs[i], dt);
		separateAll(w.players);
		Object.assign(w.ball, centerBall()); // ball held at centre during kickoff
		return { scorer: null };
	}
	for (let i = 0; i < w.players.length; i++) if (w.players[i].active) stepPlayer(w.players[i], inputs[i], dt);
	separateAll(w.players);
	const scorer = stepBall(w, dt);
	resolveKicks(w);
	if (scorer !== null) applyScore(w, scorer);
	return { scorer };
}

/* ---------- Serialisation (network) ---------- */

export interface BallMsg { x: number; y: number; vx: number; vy: number; }
export interface SlotPos { x: number; y: number; vx: number; vy: number; face: 1 | -1 }

export const ballState = (w: World): BallMsg => ({ x: w.ball.x, y: w.ball.y, vx: w.ball.vx, vy: w.ball.vy });
export const applyBall = (w: World, s: BallMsg): void => { w.ball.x = s.x; w.ball.y = s.y; w.ball.vx = s.vx; w.ball.vy = s.vy; };
export const playerPos = (p: Player): SlotPos => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, face: p.face });
export const applyPlayerPos = (p: Player, s: SlotPos): void => { p.x = s.x; p.y = s.y; p.vx = s.vx; p.vy = s.vy; p.face = s.face; };
