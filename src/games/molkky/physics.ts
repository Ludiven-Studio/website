/**
 * MÖLKKY — the physics, on Rapier (deterministic build, WASM inlined). Metres, seconds, y up.
 * The thrower stands at z = 0 facing +z; the pins start in the official tight formation 3.5 m away.
 *
 * The deterministic build gives the same bits on every platform, which online play will need: the
 * throw is the only thing that has to travel. A snapshot of the world is also how the AI tries
 * throws: it replays them on a restored copy, so it plays with exactly the player's physics.
 */
import type * as RapierNS from '@dimforge/rapier3d-deterministic-compat';

type Rapier = typeof RapierNS;
/** Must match the installed package: scripts/vendor-rapier.mjs names the file after it (tested). */
export const RAPIER_VERSION = '0.21.0';
/* 4.3 MB with its WASM: loaded on demand from a stable, versioned URL, never from a hashed chunk
   (the precache would refuse it, and a chunk it did not precache 404s after the next deploy). */
export const RAPIER_URL = `/vendor/rapier3d-det-${RAPIER_VERSION}.mjs`;
const RAPIER_PKG = '@dimforge/rapier3d-deterministic-compat';
let RAPIER: Rapier;

export const PIN_R = 0.029; // 5.8 cm birch pins
export const PIN_H = 0.15;
export const STICK_R = 0.029;
export const STICK_L = 0.225; // the mölkky itself
export const PINS_Z = 3.5; // m from the throwing line to the front pins
export const RELEASE_Y = 0.45; // m: an underarm throw leaves the hand low
export const DT = 1 / 120;
export const REST_CAP_S = 6; // a throw is over after this, whatever still wobbles
const WOOD = 620; // kg/m³, birch
const UP_DOWN = 0.5; // a pin whose axis keeps less than this of vertical (tilt > 60°) is down
/* At rest = nothing moving more than this for REST_HOLD_S. A pin lying on its side keeps rocking
   for seconds at a few cm/s; waiting for Rapier to put it to sleep ran every throw to the cap. */
const REST_SPEED = 0.05; // m/s
const REST_SPIN = 1.0; // rad/s
const REST_HOLD_S = 0.25;

/** Official start, front row nearest the thrower: 1 2 / 3 10 4 / 5 11 12 6 / 7 9 8. */
const ROWS = [[1, 2], [3, 10, 4], [5, 11, 12, 6], [7, 9, 8]];

export interface Spot { n: number; x: number; z: number }
export interface Throw { yaw: number; speed: number; loft: number }
export interface PinView { n: number; x: number; y: number; z: number; q: { x: number; y: number; z: number; w: number }; down: boolean }

let ready: Promise<void> | null = null;
/** Load the engine once; every world waits on this. The browser takes the vendored file, the tests
   (Node) the package; the specifier is a variable so the bundler never pulls the engine in. */
export const loadPhysics = (): Promise<void> => (ready ??= (async () => {
	const spec = typeof window === 'undefined' ? RAPIER_PKG : RAPIER_URL;
	const mod = (await import(/* @vite-ignore */ spec)) as { default?: Rapier } & Rapier;
	RAPIER = mod.default ?? mod;
	await RAPIER.init();
})());

export function standardLayout(): Spot[] {
	const d = PIN_R * 2 + 0.002; // touching, plus a hair so the start is not a crush
	const step = d * Math.sqrt(3) / 2;
	const out: Spot[] = [];
	ROWS.forEach((row, r) => row.forEach((n, i) => out.push({ n, x: (i - (row.length - 1) / 2) * d, z: PINS_Z + r * step })));
	return out;
}

/** Where a throw leaves the hand and how it flies, before anything touches it. */
export function throwVelocity(t: Throw): { vx: number; vy: number; vz: number } {
	const c = Math.cos(t.loft);
	return { vx: Math.sin(t.yaw) * c * t.speed, vy: Math.sin(t.loft) * t.speed, vz: Math.cos(t.yaw) * c * t.speed };
}

function tilt(q: { x: number; y: number; z: number; w: number }): number {
	return 1 - 2 * (q.x * q.x + q.z * q.z); // the y of the pin's own up axis
}

export class MolkkyWorld {
	world: RapierNS.World;
	pins: { n: number; body: RapierNS.RigidBody }[];
	stick: RapierNS.RigidBody | null;
	/** Seconds since the last throw. */
	t = 0;
	/** Seconds everything has been calm, for atRest. */
	private calm = 0;

	private constructor(world: RapierNS.World, pins: { n: number; body: RapierNS.RigidBody }[], stick: RapierNS.RigidBody | null) {
		this.world = world;
		this.pins = pins;
		this.stick = stick;
	}

	/** A fresh game: flat ground, the twelve pins standing. Call loadPhysics() first. */
	static create(layout: Spot[] = standardLayout()): MolkkyWorld {
		const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
		world.timestep = DT;
		world.integrationParameters.numSolverIterations = 8;
		const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
		// Grass: grippy, dead. Nothing bounces off a lawn.
		world.createCollider(RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setFriction(0.8).setRestitution(0.05), ground);
		const pins = layout.map((s) => ({ n: s.n, body: MolkkyWorld.makePin(world, s.x, s.z) }));
		return new MolkkyWorld(world, pins, null);
	}

	private static makePin(world: RapierNS.World, x: number, z: number): RapierNS.RigidBody {
		const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
			.setTranslation(x, PIN_H / 2 + 0.001, z)
			// Grass eats a rolling pin fast; without it a pin on its side rolls for metres.
			.setLinearDamping(0.35).setAngularDamping(2.5)
			.setCcdEnabled(true));
		world.createCollider(RAPIER.ColliderDesc.cylinder(PIN_H / 2, PIN_R).setDensity(WOOD).setFriction(0.55).setRestitution(0.25), body);
		return body;
	}

	/** An exact copy, for the AI to try throws on. Free it after. */
	clone(): MolkkyWorld {
		const world = RAPIER.World.restoreSnapshot(this.world.takeSnapshot());
		const pins = this.pins.map((p) => ({ n: p.n, body: world.getRigidBody(p.body.handle) }));
		const copy = new MolkkyWorld(world, pins, this.stick ? world.getRigidBody(this.stick.handle) : null);
		copy.t = this.t;
		copy.calm = this.calm;
		return copy;
	}

	free(): void {
		this.world.free();
	}

	/** Let the mölkky go: held flat across the throw line, spinning end over end a little. */
	throwStick(th: Throw): void {
		this.removeStick();
		const v = throwVelocity(th);
		// The stick lies across the heading: its axis (the cylinder's y) turned onto the horizontal
		// lateral L = (cos yaw, 0, -sin yaw). A quarter turn about Y x L does it.
		const lx = Math.cos(th.yaw), lz = -Math.sin(th.yaw);
		const s = Math.SQRT1_2;
		const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
			.setTranslation(0, RELEASE_Y, 0)
			.setRotation({ x: lz * s, y: 0, z: -lx * s, w: s })
			.setLinvel(v.vx, v.vy, v.vz)
			// Backspin about the stick's own axis, as an underarm release gives it.
			.setAngvel({ x: lx * -6, y: 0, z: lz * -6 })
			.setLinearDamping(0.3).setAngularDamping(2.0)
			.setCcdEnabled(true));
		this.world.createCollider(RAPIER.ColliderDesc.cylinder(STICK_L / 2, STICK_R).setDensity(WOOD).setFriction(0.6).setRestitution(0.2), body);
		this.stick = body;
		this.t = 0;
		this.calm = 0;
		for (const p of this.pins) p.body.wakeUp();
	}

	step(): void {
		this.world.step();
		this.t += DT;
		this.calm = this.moving() ? 0 : this.calm + DT;
	}

	/** Everything has been calm for a moment, or the cap is reached. */
	atRest(): boolean {
		return this.t >= REST_CAP_S || (this.t >= 0.4 && this.calm >= REST_HOLD_S);
	}

	private moving(): boolean {
		const bodies = this.stick ? [this.stick, ...this.pins.map((p) => p.body)] : this.pins.map((p) => p.body);
		for (const b of bodies) {
			if (b.isSleeping()) continue;
			const v = b.linvel(), w = b.angvel();
			if (Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) > REST_SPEED || Math.sqrt(w.x * w.x + w.y * w.y + w.z * w.z) > REST_SPIN) return true;
		}
		return false;
	}

	/** Run to rest. Returns the pins that are down. */
	settle(): number[] {
		while (!this.atRest()) this.step();
		return this.fallen();
	}

	fallen(): number[] {
		return this.pins.filter((p) => tilt(p.body.rotation()) < UP_DOWN).map((p) => p.n).sort((a, b) => a - b);
	}

	/** Stand the fallen pins up where they lie and take the stick away: the next throw's board. */
	raise(): void {
		this.removeStick();
		const down = new Set(this.fallen());
		for (const p of this.pins) {
			if (!down.has(p.n)) continue;
			const t = p.body.translation();
			p.body.setTranslation({ x: t.x, y: PIN_H / 2 + 0.001, z: t.z }, true);
			p.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
			p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
			p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
		}
		// Two pins that fell on top of each other cannot both stand there: part them, raised ones move.
		const gap = PIN_R * 2 + 0.002;
		for (let pass = 0; pass < 6; pass++) {
			let moved = false;
			for (const a of this.pins) {
				if (!down.has(a.n)) continue;
				for (const b of this.pins) {
					if (a === b) continue;
					const ta = a.body.translation(), tb = b.body.translation();
					const dx = ta.x - tb.x, dz = ta.z - tb.z;
					const d = Math.sqrt(dx * dx + dz * dz);
					if (d >= gap) continue;
					const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
					a.body.setTranslation({ x: tb.x + ux * gap, y: ta.y, z: tb.z + uz * gap }, true);
					moved = true;
				}
			}
			if (!moved) break;
		}
		this.t = 0;
		this.calm = 0;
	}

	private removeStick(): void {
		if (this.stick) { this.world.removeRigidBody(this.stick); this.stick = null; }
	}

	pinViews(): PinView[] {
		const down = new Set(this.fallen());
		return this.pins.map((p) => {
			const t = p.body.translation(), q = p.body.rotation();
			return { n: p.n, x: t.x, y: t.y, z: t.z, q: { x: q.x, y: q.y, z: q.z, w: q.w }, down: down.has(p.n) };
		});
	}
}

/** Try a throw on a copy and report what falls. The copy is freed. */
export function simulateThrow(w: MolkkyWorld, th: Throw): number[] {
	const c = w.clone();
	try {
		c.throwStick(th);
		return c.settle();
	} finally {
		c.free();
	}
}
