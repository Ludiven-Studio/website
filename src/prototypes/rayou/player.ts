import { groundHeight, waterAt, WATER_Y, BOUNDS } from './terrain';
import { query, inside, pushOut, type Solid } from './colliders';

export const RUN = 4.8;
export const ROLL_SPEED = 7.6;
export const RADIUS = 0.38;
export const STAND_H = 0.95;
export const LOW_H = 0.48;
export const GRAVITY = 25;
export const JUMP_V = 7.6;
export const STEP_UP = 0.45;
const MAX_SLOPE = 1.3;
const COYOTE = 0.12;
const BUFFER = 0.14;
const ROLL_TIME = 0.55;
const CRAWL_SPEED = 1.8;
const TUMBLE_FALL = 3.2;

export interface Command {
	dirX: number;
	dirZ: number;
	jump: boolean;
	jumpHeld: boolean;
	roll: boolean;
}

export type PlayerEvent = 'jump' | 'land' | 'tumble' | 'roll' | 'splash' | 'bounce' | 'break' | 'respawn';

export interface Vec { x: number; y: number; z: number }

// Downhill direction where the ground is a real slope too steep to stand on, else null.
// A crisp step (a terrace cliff) is not a slope: only one side of it is steep.
function steepness(x: number, z: number): { x: number; z: number } | null {
	const e = 0.25, h = groundHeight(x, z);
	const axis = (a: number, b: number) => {
		const d1 = (a - h) / e, d0 = (h - b) / e;
		return Math.sign(d1) === Math.sign(d0) ? Math.sign(d1) * Math.min(Math.abs(d1), Math.abs(d0)) : 0;
	};
	const gx = axis(groundHeight(x + e, z), groundHeight(x - e, z));
	const gz = axis(groundHeight(x, z + e), groundHeight(x, z - e));
	const s = Math.hypot(gx, gz);
	return s > MAX_SLOPE + 0.2 ? { x: -gx / s, z: -gz / s } : null;
}

export class Player {
	pos: Vec = { x: 0, y: 0, z: 0 };
	yaw = 0;
	speed = 0;
	vy = 0;
	grounded = true;
	support: Solid | null = null;
	turnRate = 0;
	rollT = -1;
	rollSpin = 0;
	crawl = false;
	frozen = false;
	// On a slope too steep to stand on: no jumping, slide down.
	steep: { x: number; z: number } | null = null;
	respawnT = -1;
	lastSafe: Vec & { yaw: number } = { x: 0, y: 0, z: 0, yaw: 0 };
	onEvent: (e: PlayerEvent, data?: unknown) => void = () => {};

	private coyote = 0;
	private jumpBuf = 0;
	private rollCool = 0;
	private airRolled = false;
	private keepSpeed = false;
	private apexY = 0;
	private stuckT = 0;
	private respawnTo: (Vec & { yaw: number }) | null = null;

	get low(): boolean {
		return this.rollT > 0 || this.crawl;
	}

	get height(): number {
		return this.low ? LOW_H : STAND_H;
	}

	teleport(x: number, z: number, yaw = this.yaw, y?: number): void {
		this.pos.x = x;
		this.pos.z = z;
		this.pos.y = y ?? this.floorAt(x, z, Infinity).h;
		this.yaw = yaw;
		this.speed = 0;
		this.vy = 0;
		this.grounded = true;
		this.rollT = -1;
		this.crawl = this.headroom() < STAND_H;
		this.support = null;
		this.lastSafe = { ...this.pos, yaw };
	}

	// Fades out and puts Rayou back on the last safe ground.
	respawn(splash = false): void {
		if (this.respawnT > 0) return;
		this.respawnT = 0.7;
		this.respawnTo = { ...this.lastSafe };
		this.onEvent(splash ? 'splash' : 'respawn', { ...this.pos });
	}

	redirectRespawn(p: Vec & { yaw: number }): void {
		this.respawnTo = { ...p };
		this.lastSafe = { ...p };
	}

	update(dt: number, cmd: Command): void {
		if (this.respawnT > 0) {
			const before = this.respawnT;
			this.respawnT -= dt;
			this.speed = 0;
			if (before > 0.35 && this.respawnT <= 0.35 && this.respawnTo) {
				const t = this.respawnTo;
				this.teleport(t.x, t.z, t.yaw, t.y);
			}
			return;
		}
		if (this.frozen) {
			this.speed = 0;
			return;
		}

		// Ride moving platforms.
		if (this.grounded && this.support?.moving) {
			this.pos.x += this.support.dx;
			this.pos.z += this.support.dz;
			this.pos.y += this.support.dy;
		}

		this.steer(dt, cmd);
		this.moveHorizontal(dt);
		this.moveVertical(dt, cmd);
		this.checkSafety(dt);
	}

	private steer(dt: number, cmd: Command): void {
		const mag = Math.min(1, Math.hypot(cmd.dirX, cmd.dirZ));
		this.rollCool -= dt;

		if (cmd.roll && this.rollCool <= 0 && this.rollT <= 0 && !this.crawl && (this.grounded || !this.airRolled)) {
			if (mag > 0.2) this.yaw = Math.atan2(cmd.dirX, cmd.dirZ);
			this.rollT = ROLL_TIME;
			this.rollCool = ROLL_TIME + 0.15;
			this.speed = Math.max(this.speed, this.grounded ? ROLL_SPEED : Math.min(ROLL_SPEED, this.speed + 2));
			if (!this.grounded) this.airRolled = true;
			this.onEvent('roll');
		}

		let target = mag * RUN;
		// Air control: easy to brake over a small ledge, slower to speed up.
		let accel = this.grounded ? (target > this.speed ? 6 : 9) : target > this.speed ? 3 : 6;
		let turnMax = this.grounded ? 10 : 5;
		if (this.rollT > 0) {
			this.rollT -= dt;
			this.rollSpin += dt * 15;
			target = this.grounded ? ROLL_SPEED : this.speed;
			accel = 20;
			turnMax = 2.5;
			if (this.rollT <= 0) this.crawl = this.headroom() < STAND_H;
		} else if (this.crawl) {
			target = mag * CRAWL_SPEED;
			accel = 10;
			if (this.headroom() >= STAND_H) this.crawl = false;
		}
		if (!this.grounded && this.keepSpeed) target = Math.max(target, this.speed);
		this.speed += (target - this.speed) * (1 - Math.exp(-accel * dt));

		let turn = 0;
		if (mag > 0.05) {
			const want = Math.atan2(cmd.dirX, cmd.dirZ);
			const d = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
			const rate = this.rollT > 0 ? turnMax : Math.min(turnMax, 10 - 4.5 * Math.min(1, this.speed / RUN));
			turn = Math.max(-rate, Math.min(rate, d * rate)) * dt;
			this.yaw += turn;
			// Turning on the spot should not shoot forward.
			if (this.grounded && this.rollT <= 0) this.speed *= 1 - Math.min(1, Math.abs(d) / Math.PI) * dt * 6;
		}
		this.turnRate += (turn / Math.max(dt, 1e-4) - this.turnRate) * (1 - Math.exp(-10 * dt));

		this.jumpBuf = cmd.jump ? BUFFER : this.jumpBuf - dt;
		if (this.jumpBuf > 0 && ((this.grounded && !this.steep) || this.coyote > 0)) {
			this.jumpBuf = 0;
			this.coyote = 0;
			this.grounded = false;
			this.support = null;
			this.vy = JUMP_V;
			this.apexY = this.pos.y;
			// A jump out of a roll keeps the roll's speed: the long jump.
			this.keepSpeed = this.rollT > 0;
			if (this.rollT > 0) this.rollT = Math.max(this.rollT, 0.35);
			this.onEvent('jump', this.keepSpeed);
		}
		// Letting go early cuts the jump.
		if (!this.grounded && this.vy > 2 && !cmd.jumpHeld) this.vy -= GRAVITY * 1.4 * dt;
	}

	private terrainBlocked(fromX: number, fromZ: number, x: number, z: number): boolean {
		const g = groundHeight(x, z);
		if (g > this.pos.y + STEP_UP) return true;
		const g0 = groundHeight(fromX, fromZ);
		const len = Math.hypot(x - fromX, z - fromZ);
		const onTerrain = this.pos.y - g0 < 0.3;
		return onTerrain && g > this.pos.y + 0.05 && (g - g0) / Math.max(len, 1e-4) > MAX_SLOPE;
	}

	private moveHorizontal(dt: number): void {
		const dist = this.speed * dt;
		const steps = Math.max(1, Math.ceil(dist / 0.12));
		const sx = (Math.sin(this.yaw) * dist) / steps;
		const sz = (Math.cos(this.yaw) * dist) / steps;
		for (let i = 0; i < steps; i++) {
			const ox = this.pos.x, oz = this.pos.z;
			if (!this.terrainBlocked(ox, oz, ox + sx, oz + sz)) {
				this.pos.x += sx;
				this.pos.z += sz;
			} else if (!this.terrainBlocked(ox, oz, ox + sx, oz)) this.pos.x += sx;
			else if (!this.terrainBlocked(ox, oz, ox, oz + sz)) this.pos.z += sz;
			else this.speed *= 0.6;
			this.resolveWalls();
			if (groundHeight(this.pos.x, this.pos.z) > this.pos.y + STEP_UP) {
				this.pos.x = ox;
				this.pos.z = oz;
			}
		}
		if (this.steep) {
			const ox = this.pos.x, oz = this.pos.z;
			this.pos.x += this.steep.x * 4 * dt;
			this.pos.z += this.steep.z * 4 * dt;
			this.resolveWalls();
			if (groundHeight(this.pos.x, this.pos.z) > this.pos.y + STEP_UP) {
				this.pos.x = ox;
				this.pos.z = oz;
			}
		}
		const m = 0.5;
		this.pos.x = Math.min(BOUNDS.x1 + m, Math.max(BOUNDS.x0 - m, this.pos.x));
		this.pos.z = Math.min(BOUNDS.z1 + m, Math.max(BOUNDS.z0 - m, this.pos.z));
	}

	private isWall(s: Solid): boolean {
		return s.y1 > this.pos.y + STEP_UP && s.y0 < this.pos.y + this.height;
	}

	private resolveWalls(): void {
		for (let iter = 0; iter < 2; iter++) {
			let moved = false;
			for (const s of query(this.pos.x, this.pos.z)) {
				if (!this.isWall(s)) continue;
				if (s.breakable && this.rollT > 0 && inside(s, this.pos.x, this.pos.z, RADIUS + 0.05)) {
					s.alive = false;
					this.speed *= 0.7;
					this.onEvent('break', s);
					continue;
				}
				if (pushOut(s, this.pos, RADIUS)) moved = true;
			}
			if (!moved) break;
		}
	}

	floorAt(x: number, z: number, limit: number): { h: number; s: Solid | null } {
		let h = groundHeight(x, z);
		let sup: Solid | null = null;
		for (const s of query(x, z)) {
			if (s.y1 <= limit && s.y1 > h && inside(s, x, z, 0.15)) {
				h = s.y1;
				sup = s;
			}
		}
		return { h, s: sup };
	}

	headroom(): number {
		let room = Infinity;
		for (const s of query(this.pos.x, this.pos.z)) {
			if (s.y0 > this.pos.y + 0.1 && inside(s, this.pos.x, this.pos.z, RADIUS * 0.8)) room = Math.min(room, s.y0 - this.pos.y);
		}
		return room;
	}

	private moveVertical(dt: number, cmd: Command): void {
		const p = this.pos;
		if (this.grounded) {
			const f = this.floorAt(p.x, p.z, p.y + STEP_UP);
			if (p.y - f.h > 0.35) {
				this.grounded = false;
				this.support = null;
				this.coyote = COYOTE;
				this.vy = 0;
				this.apexY = p.y;
				this.keepSpeed = this.rollT > 0;
			} else {
				p.y = f.h;
				this.support = f.s;
				this.airRolled = false;
				this.steep = f.s ? null : steepness(p.x, p.z);
				return;
			}
		}

		this.steep = null;
		this.coyote -= dt;
		const prevTop = p.y + this.height;
		this.vy -= GRAVITY * dt;
		p.y += this.vy * dt;
		this.apexY = Math.max(this.apexY, p.y);
		if (this.vy > 0) {
			for (const s of query(p.x, p.z)) {
				if (s.y0 >= prevTop - 0.02 && s.y0 < p.y + this.height && inside(s, p.x, p.z, RADIUS * 0.7)) {
					p.y = s.y0 - this.height;
					this.vy = 0;
				}
			}
		}
		// Falling lets Rayou catch a ledge up to a step above his feet.
		const f = this.floorAt(p.x, p.z, this.vy <= 0 ? p.y + 0.3 : p.y);
		if (p.y <= f.h) {
			const impact = -this.vy;
			const fall = this.apexY - f.h;
			p.y = f.h;
			this.vy = 0;
			this.grounded = true;
			this.support = f.s;
			this.steep = f.s ? null : steepness(p.x, p.z);
			this.keepSpeed = false;
			this.airRolled = false;
			if (f.s?.bouncy && impact > 1) {
				this.grounded = false;
				this.support = null;
				this.vy = f.s.bouncy;
				this.apexY = p.y;
				this.onEvent('bounce', f.s);
				return;
			}
			if (fall > TUMBLE_FALL && this.rollT <= 0) {
				// Big drops end in a roll, never in a hurt.
				this.rollT = ROLL_TIME;
				this.speed = Math.max(this.speed, 3.5);
				this.onEvent('tumble', fall);
			} else this.onEvent('land', impact);
			void cmd;
		}
	}

	private checkSafety(dt: number): void {
		const p = this.pos;
		if ((p.y < WATER_Y - 0.15 && waterAt(p.x, p.z)) || p.y < -8) {
			this.respawn(true);
			return;
		}
		let stuck = false;
		for (const s of query(p.x, p.z)) if (this.isWall(s) && inside(s, p.x, p.z, RADIUS - 0.08)) stuck = true;
		if (groundHeight(p.x, p.z) > p.y + STEP_UP + 0.2) stuck = true;
		this.stuckT = stuck ? this.stuckT + dt : 0;
		if (this.stuckT > 0.6) {
			this.stuckT = 0;
			this.respawn();
			return;
		}
		if (this.grounded && !this.low && !this.support?.unsafe && p.y > WATER_Y + 0.3 && this.safeAround()) {
			this.lastSafe = { x: p.x, y: p.y, z: p.z, yaw: this.yaw };
		}
	}

	private safeAround(): boolean {
		const p = this.pos;
		for (let i = 0; i < 6; i++) {
			const a = (i / 6) * Math.PI * 2;
			const x = p.x + Math.cos(a) * 1.1, z = p.z + Math.sin(a) * 1.1;
			if (waterAt(x, z) && groundHeight(x, z) < WATER_Y + 0.2) return false;
		}
		if (this.support) return true;
		const e = 0.08;
		const gx = groundHeight(p.x + e, p.z) - groundHeight(p.x - e, p.z);
		const gz = groundHeight(p.x, p.z + e) - groundHeight(p.x, p.z - e);
		return Math.hypot(gx, gz) / (2 * e) < 0.9;
	}
}
