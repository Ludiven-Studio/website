import type { Rng } from '../prng';

/* =====================================================
   COCOTTES VS RENARDS — pure lane tower-defense engine.
   Grid: LANES rows × COLS cols. Foxes enter at x=COLS (right),
   walk toward x=0 (henhouse). A fox at x<=0 ends the game.
   x is a continuous lane position; towers sit at integer cells.
   step() mutates state in place (many entities); seeded via Rng.
   ===================================================== */

export const LANES = 5;
export const COLS = 8;

export type TowerType = 'pondeuse' | 'lanceuse' | 'costaude' | 'mitrailleuse' | 'piment';
export type FoxType = 'normal' | 'rapide' | 'blinde';

export interface Tower {
	id: number;
	type: TowerType;
	row: number;
	col: number;
	hp: number;
	maxHp: number;
	timer: number; // production / fire cadence
}
export interface Fox {
	id: number;
	type: FoxType;
	row: number;
	x: number;
	hp: number;
	maxHp: number;
	eating: boolean;
}
export interface Egg {
	id: number;
	row: number;
	x: number;
	dmg: number;
}

export interface State {
	rows: number;
	cols: number;
	grain: number;
	towers: Tower[];
	foxes: Fox[];
	eggs: Egg[];
	time: number;
	spawnTimer: number;
	trickleTimer: number;
	killed: number;
	score: number;
	over: boolean;
	nextId: number;
	hpMul: number;
	speedMul: number;
	spawnMul: number;
	cooldowns: Partial<Record<TowerType, number>>;
}

export interface TowerStat {
	cost: number;
	cooldown: number;
	hp: number;
	fire?: number; // seconds between eggs
	dmg?: number;
	label: string;
}
export const TOWER: Record<TowerType, TowerStat> = {
	pondeuse: { cost: 50, cooldown: 6, hp: 60, label: 'Pondeuse' },
	lanceuse: { cost: 100, cooldown: 6, hp: 60, fire: 1.5, dmg: 20, label: "Lanceuse d'œufs" },
	costaude: { cost: 50, cooldown: 12, hp: 300, label: 'Costaude' },
	mitrailleuse: { cost: 200, cooldown: 8, hp: 60, fire: 0.6, dmg: 20, label: 'Mitrailleuse' },
	piment: { cost: 125, cooldown: 25, hp: 0, label: 'Coq piment' },
};
export const TOWER_ORDER: TowerType[] = ['pondeuse', 'lanceuse', 'costaude', 'mitrailleuse', 'piment'];

export const FOX: Record<FoxType, { hp: number; speed: number; dmg: number; reward: number }> = {
	normal: { hp: 100, speed: 0.35, dmg: 20, reward: 1 },
	rapide: { hp: 45, speed: 0.75, dmg: 15, reward: 1 },
	blinde: { hp: 320, speed: 0.22, dmg: 30, reward: 3 },
};

export const DIFFS = {
	facile: { label: 'Facile', grain: 175, hp: 0.85, speed: 0.9, spawn: 1.15 },
	moyen: { label: 'Moyen', grain: 150, hp: 1, speed: 1, spawn: 1 },
	difficile: { label: 'Difficile', grain: 125, hp: 1.25, speed: 1.12, spawn: 0.82 },
} as const;
export const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
export type DiffKey = keyof typeof DIFFS;

const FIRST_SPAWN = 10; // grace to set up before the first fox
const PROD_INTERVAL = 7;
const PROD_AMOUNT = 25;
const TRICKLE_INTERVAL = 10;
const TRICKLE_AMOUNT = 25;
const EGG_SPEED = 7;
const EGG_HIT = 0.35;
const EAT_CONTACT = 0.75; // how far into a cell a fox walks before biting

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Seconds until the next spawn — gentle at first, shrinks over time, scaled by difficulty. */
export const spawnInterval = (time: number, spawnMul: number): number => clamp(6 - time / 22, 0.9, 6) * spawnMul;

/** Weighted fox type for the current elapsed time. */
export function waveType(time: number, rng: Rng): FoxType {
	const r = rng();
	if (time < 20) return 'normal';
	if (time < 45) return r < 0.7 ? 'normal' : 'rapide';
	if (time < 80) return r < 0.5 ? 'normal' : r < 0.8 ? 'rapide' : 'blinde';
	return r < 0.35 ? 'normal' : r < 0.65 ? 'rapide' : 'blinde';
}

export function createGame(diffIndex: number, _rng: Rng): State {
	const key = DIFF_ORDER[diffIndex] ?? 'moyen';
	const d = DIFFS[key];
	return {
		rows: LANES,
		cols: COLS,
		grain: d.grain,
		towers: [],
		foxes: [],
		eggs: [],
		time: 0,
		spawnTimer: FIRST_SPAWN,
		trickleTimer: 0,
		killed: 0,
		score: 0,
		over: false,
		nextId: 1,
		hpMul: d.hp,
		speedMul: d.speed,
		spawnMul: d.spawn,
		cooldowns: {},
	};
}

export const firstTowerInCell = (state: State, row: number, col: number): Tower | undefined =>
	state.towers.find((t) => t.row === row && t.col === col && t.type !== 'piment' && t.hp > 0);

/** Closest fox to the henhouse in a lane (smallest x), or undefined. */
export function frontFoxInLane(state: State, row: number): Fox | undefined {
	let best: Fox | undefined;
	for (const f of state.foxes) if (f.row === row && (!best || f.x < best.x)) best = f;
	return best;
}

export const canPlace = (state: State, row: number, col: number): boolean =>
	row >= 0 && row < state.rows && col >= 0 && col < state.cols && !state.towers.some((t) => t.row === row && t.col === col);

/** Try to place/trigger a tower. Returns false if invalid (cost, cooldown, occupied). */
export function placeTower(state: State, type: TowerType, row: number, col: number): boolean {
	const s = TOWER[type];
	if (state.grain < s.cost) return false;
	if ((state.cooldowns[type] ?? 0) > 0) return false;
	if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return false;

	if (type === 'piment') {
		// One-shot: clear every fox in the lane.
		for (const f of state.foxes) if (f.row === row) {
			state.killed++;
			state.score += FOX[f.type].reward;
		}
		state.foxes = state.foxes.filter((f) => f.row !== row);
	} else {
		if (state.towers.some((t) => t.row === row && t.col === col)) return false;
		state.towers.push({ id: state.nextId++, type, row, col, hp: s.hp, maxHp: s.hp, timer: 0 });
	}
	state.grain -= s.cost;
	state.cooldowns[type] = s.cooldown;
	return true;
}

function spawnFox(state: State, rng: Rng): void {
	const type = waveType(state.time, rng);
	const row = Math.floor(rng() * state.rows) % state.rows;
	const base = FOX[type];
	state.foxes.push({
		id: state.nextId++,
		type,
		row,
		x: state.cols + 0.5,
		hp: base.hp * state.hpMul,
		maxHp: base.hp * state.hpMul,
		eating: false,
	});
}

/** Advance the simulation by dt seconds (mutates state). */
export function step(state: State, dt: number, rng: Rng): void {
	if (state.over) return;
	state.time += dt;

	// Card cooldowns.
	for (const k of Object.keys(state.cooldowns) as TowerType[]) {
		const v = (state.cooldowns[k] ?? 0) - dt;
		state.cooldowns[k] = v > 0 ? v : 0;
	}

	// Passive grain trickle.
	state.trickleTimer += dt;
	if (state.trickleTimer >= TRICKLE_INTERVAL) {
		state.trickleTimer -= TRICKLE_INTERVAL;
		state.grain += TRICKLE_AMOUNT;
	}

	// Towers: produce grain / fire eggs.
	for (const t of state.towers) {
		if (t.type === 'pondeuse') {
			t.timer += dt;
			if (t.timer >= PROD_INTERVAL) {
				t.timer -= PROD_INTERVAL;
				state.grain += PROD_AMOUNT;
			}
		} else if (t.type === 'lanceuse' || t.type === 'mitrailleuse') {
			const fire = TOWER[t.type].fire!;
			t.timer = Math.min(t.timer + dt, fire);
			const hasTarget = state.foxes.some((f) => f.row === t.row && f.x > t.col + 0.5 && f.x <= state.cols + 0.5);
			if (t.timer >= fire && hasTarget) {
				t.timer = 0;
				state.eggs.push({ id: state.nextId++, row: t.row, x: t.col + 0.7, dmg: TOWER[t.type].dmg! });
			}
		}
	}

	// Eggs: fly right, hit the closest fox ahead in the lane.
	for (const e of state.eggs) e.x += EGG_SPEED * dt;
	state.eggs = state.eggs.filter((e) => {
		if (e.x > state.cols + 1) return false;
		let target: Fox | undefined;
		for (const f of state.foxes) if (f.row === e.row && f.x >= e.x - EGG_HIT && (!target || f.x < target.x)) target = f;
		if (target && target.x - e.x <= EGG_HIT) {
			target.hp -= e.dmg;
			return false;
		}
		return true;
	});

	// Foxes: bite the tower in their cell, else advance.
	for (const f of state.foxes) {
		const tc = Math.floor(f.x - 1e-6);
		const tower = tc >= 0 && tc < state.cols ? firstTowerInCell(state, f.row, tc) : undefined;
		if (tower && f.x <= tc + EAT_CONTACT) {
			f.eating = true;
			tower.hp -= FOX[f.type].dmg * dt;
		} else {
			f.eating = false;
			f.x -= FOX[f.type].speed * state.speedMul * dt;
			if (f.x <= 0) {
				state.over = true;
				f.x = 0;
			}
		}
	}

	// Remove dead towers and foxes; tally score.
	state.towers = state.towers.filter((t) => t.hp > 0);
	state.foxes = state.foxes.filter((f) => {
		if (f.hp <= 0) {
			state.killed++;
			state.score += FOX[f.type].reward;
			return false;
		}
		return true;
	});

	// Spawn waves.
	if (!state.over) {
		state.spawnTimer -= dt;
		if (state.spawnTimer <= 0) {
			spawnFox(state, rng);
			state.spawnTimer += spawnInterval(state.time, state.spawnMul);
		}
	}
}
