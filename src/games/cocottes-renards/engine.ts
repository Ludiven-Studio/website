import type { Rng } from '../prng';

/* =====================================================
   COCOTTES VS RENARDS — pure lane tower-defense engine.
   Grid: LANES rows × COLS cols. Foxes enter at x=COLS+APPROACH (right,
   from the forest edge), walk toward x=0 (henhouse). A fox at x<=0 ends
   the game. x is a continuous lane position; towers sit at integer cells.
   Grain is earned as collectable tokens (click, or auto after a delay).
   Spawns come in waves; a méga renard every 5 waves ramps the pressure.
   step() mutates state in place (many entities); seeded via Rng.
   ===================================================== */

export const LANES = 5;
export const COLS = 8;
export const APPROACH = 1.3; // right-margin cells where foxes appear before entering the grid

export type TowerType =
	| 'pondeuse'
	| 'lanceuse'
	| 'costaude'
	| 'mitrailleuse'
	| 'piment'
	| 'glaciere'
	| 'gemellaire'
	| 'mine';
export type FoxType = 'normal' | 'rapide' | 'blinde' | 'mega' | 'creuseur' | 'sauteur' | 'meute';

export interface Tower {
	id: number;
	type: TowerType;
	row: number;
	col: number;
	hp: number;
	maxHp: number;
	timer: number; // production / fire cadence
	fireFlash: number; // >0 briefly after firing (render recoil)
	armed: number; // mine: seconds left before it can detonate
	exploded: boolean; // mine: just blew up (render burst)
}
export interface Fox {
	id: number;
	type: FoxType;
	row: number;
	x: number;
	hp: number;
	maxHp: number;
	eating: boolean;
	slow: number; // seconds of frost slow remaining
	jumps: number; // remaining tower hops (sauteur)
}
export interface Egg {
	id: number;
	row: number;
	x: number;
	dmg: number;
	frost: boolean;
}
/** Collectable grain token (PvZ sun): falls to `rest`, waits, auto-collects at ttl<=0. */
export interface Grain {
	id: number;
	x: number;
	y: number;
	rest: number;
	value: number;
	ttl: number;
	sky: boolean;
}

export interface State {
	rows: number;
	cols: number;
	grain: number;
	towers: Tower[];
	foxes: Fox[];
	eggs: Egg[];
	grains: Grain[];
	time: number;
	wave: number;
	waveTimer: number;
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
	lanceuse: { cost: 75, cooldown: 6, hp: 60, fire: 1.5, dmg: 20, label: "Lanceuse d'œufs" },
	costaude: { cost: 50, cooldown: 12, hp: 300, label: 'Costaude' },
	mitrailleuse: { cost: 175, cooldown: 8, hp: 60, fire: 0.6, dmg: 20, label: 'Mitrailleuse' },
	piment: { cost: 125, cooldown: 25, hp: 0, label: 'Coq piment' },
	glaciere: { cost: 100, cooldown: 10, hp: 60, fire: 1.6, dmg: 12, label: 'Poule des neiges' },
	gemellaire: { cost: 150, cooldown: 12, hp: 60, fire: 1.5, dmg: 20, label: 'Poule gémeaux' },
	mine: { cost: 25, cooldown: 10, hp: 1, label: 'Œuf-mine' },
};
export const TOWER_ORDER: TowerType[] = [
	'pondeuse',
	'lanceuse',
	'gemellaire',
	'glaciere',
	'costaude',
	'mine',
	'mitrailleuse',
	'piment',
];

/** Towers that shoot eggs at the front fox in their lane. */
const SHOOTERS: TowerType[] = ['lanceuse', 'mitrailleuse', 'glaciere', 'gemellaire'];

export const FOX: Record<FoxType, { hp: number; speed: number; dmg: number; reward: number }> = {
	normal: { hp: 100, speed: 0.35, dmg: 20, reward: 1 },
	rapide: { hp: 45, speed: 0.75, dmg: 15, reward: 1 },
	blinde: { hp: 320, speed: 0.22, dmg: 30, reward: 3 },
	mega: { hp: 1200, speed: 0.18, dmg: 60, reward: 8 }, // boss: huge, slow, wrecks walls
	creuseur: { hp: 90, speed: 0.4, dmg: 20, reward: 2 }, // egg-immune until midfield
	sauteur: { hp: 70, speed: 0.5, dmg: 18, reward: 2 }, // leaps the first tower once
	meute: { hp: 30, speed: 0.7, dmg: 10, reward: 1 }, // spawns as a small pack
};

export const DIFFS = {
	facile: { label: 'Facile', grain: 175, hp: 0.85, speed: 0.9, spawn: 1.15 },
	moyen: { label: 'Moyen', grain: 150, hp: 1, speed: 1, spawn: 1 },
	difficile: { label: 'Difficile', grain: 125, hp: 1.25, speed: 1.12, spawn: 0.82 },
} as const;
export const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
export type DiffKey = keyof typeof DIFFS;

const FIRST_SPAWN = 12; // grace to set up before the first wave
const PROD_INTERVAL = 5;
const PROD_AMOUNT = 25;
const TRICKLE_INTERVAL = 8;
const TRICKLE_AMOUNT = 25;
const EGG_SPEED = 7;
const EGG_HIT = 0.35;
const EAT_CONTACT = 0.75; // how far into a cell a fox walks before biting
const FROST_TIME = 2.5; // seconds a frost egg slows a fox
const GRAIN_FALL = 3; // token fall speed (cells/s)
const TOKEN_TTL = 9; // token auto-collects after this many seconds
const MINE_ARM = 3; // seconds before a mine can detonate
const MINE_DMG = 900; // mine blast damage (per fox in blast)

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Seconds between waves — long at first, shrinks with the wave count, scaled by difficulty. */
export const waveInterval = (wave: number): number => clamp(8 - wave * 0.3, 3.5, 8);

/** Foxes per wave — grows steadily so late waves are heavier. */
export const waveSize = (wave: number): number => 1 + Math.floor(wave / 3);

/** How many lanes are active (foxes ramp from a narrow band to all 5). */
export const activeLanes = (wave: number): number => Math.min(LANES, 2 + Math.floor(wave / 2));

/** Fox HP multiplier that grows with the wave — a static defence must eventually break. */
export const waveHpScale = (wave: number): number => 1 + wave * 0.1;

/** Weighted fox type for the current wave number. */
export function waveType(wave: number, rng: Rng): FoxType {
	const r = rng();
	if (wave <= 2) return 'normal';
	if (wave <= 4) return r < 0.7 ? 'normal' : 'rapide';
	if (wave <= 7) {
		if (r < 0.45) return 'normal';
		if (r < 0.7) return 'rapide';
		if (r < 0.9) return 'meute';
		return 'blinde';
	}
	if (wave <= 11) {
		if (r < 0.3) return 'normal';
		if (r < 0.5) return 'rapide';
		if (r < 0.68) return 'meute';
		if (r < 0.85) return 'blinde';
		return 'sauteur';
	}
	if (r < 0.2) return 'normal';
	if (r < 0.38) return 'rapide';
	if (r < 0.54) return 'meute';
	if (r < 0.72) return 'blinde';
	if (r < 0.87) return 'sauteur';
	return 'creuseur';
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
		grains: [],
		time: 0,
		wave: 0,
		waveTimer: FIRST_SPAWN,
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

/** First blocking tower a fox bites in a cell (mines/piment are stepped over, not bitten). */
export const firstTowerInCell = (state: State, row: number, col: number): Tower | undefined =>
	state.towers.find((t) => t.row === row && t.col === col && t.type !== 'piment' && t.type !== 'mine' && t.hp > 0);

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
		for (const f of state.foxes)
			if (f.row === row) {
				state.killed++;
				state.score += FOX[f.type].reward;
			}
		state.foxes = state.foxes.filter((f) => f.row !== row);
	} else {
		if (state.towers.some((t) => t.row === row && t.col === col)) return false;
		state.towers.push({
			id: state.nextId++,
			type,
			row,
			col,
			hp: s.hp,
			maxHp: s.hp,
			timer: 0,
			fireFlash: 0,
			armed: type === 'mine' ? MINE_ARM : 0,
			exploded: false,
		});
	}
	state.grain -= s.cost;
	state.cooldowns[type] = s.cooldown;
	return true;
}

/** Collect a grain token by id — credits its value immediately. Returns the value (0 if gone). */
export function collectGrain(state: State, id: number): number {
	const i = state.grains.findIndex((g) => g.id === id);
	if (i < 0) return 0;
	const v = state.grains[i].value;
	state.grain += v;
	state.grains.splice(i, 1);
	return v;
}

function spawnGrain(state: State, x: number, rest: number, value: number, sky: boolean): void {
	state.grains.push({ id: state.nextId++, x, y: sky ? 0 : rest - 0.7, rest, value, ttl: TOKEN_TTL, sky });
}

function pushFox(state: State, type: FoxType, row: number, trail: number): void {
	const hp = FOX[type].hp * state.hpMul * waveHpScale(state.wave);
	state.foxes.push({
		id: state.nextId++,
		type,
		row,
		x: state.cols + APPROACH + trail,
		hp,
		maxHp: hp,
		eating: false,
		slow: 0,
		jumps: type === 'sauteur' ? 1 : 0,
	});
}

/** Release one wave of foxes; every 5th wave also sends méga renard(s). */
function startWave(state: State, rng: Rng): void {
	state.wave++;
	const w = state.wave;
	const k = activeLanes(w);
	const start = Math.floor((state.rows - k) / 2);
	const laneOf = (): number => start + (Math.floor(rng() * k) % k);
	const size = waveSize(w);
	for (let i = 0; i < size; i++) {
		const type = waveType(w, rng);
		const row = laneOf();
		if (type === 'meute') {
			const n = 2 + Math.floor(rng() * 2); // pack of 2-3
			for (let j = 0; j < n; j++) pushFox(state, 'meute', row, i * 0.7 + j * 0.5);
		} else {
			pushFox(state, type, row, i * 0.7);
		}
	}
	// Méga renard: escalation every 5 waves; two of them once waves get deep.
	if (w % 5 === 0) {
		const megas = w >= 15 ? 2 : 1;
		for (let m = 0; m < megas; m++) pushFox(state, 'mega', laneOf(), m * 1.4);
	}
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

	// Passive grain trickle from the sky (a collectable token).
	state.trickleTimer += dt;
	if (state.trickleTimer >= TRICKLE_INTERVAL) {
		state.trickleTimer -= TRICKLE_INTERVAL;
		const col = Math.floor(rng() * state.cols);
		const row = Math.floor(rng() * state.rows);
		spawnGrain(state, col + 0.5, row + 0.82, TRICKLE_AMOUNT, true);
	}

	// Grain tokens: fall to rest, auto-collect when their timer runs out (never lost).
	for (const g of state.grains) {
		if (g.y < g.rest) g.y = Math.min(g.rest, g.y + GRAIN_FALL * dt);
		g.ttl -= dt;
	}
	state.grains = state.grains.filter((g) => {
		if (g.ttl <= 0) {
			state.grain += g.value;
			return false;
		}
		return true;
	});

	// Towers: lay grain / fire eggs / mine logic.
	for (const t of state.towers) {
		if (t.fireFlash > 0) t.fireFlash = Math.max(0, t.fireFlash - dt);

		if (t.type === 'pondeuse') {
			t.timer += dt;
			if (t.timer >= PROD_INTERVAL) {
				t.timer -= PROD_INTERVAL;
				spawnGrain(state, t.col + 0.5, t.row + 0.82, PROD_AMOUNT, false);
			}
		} else if (t.type === 'mine') {
			if (t.armed > 0) {
				t.armed = Math.max(0, t.armed - dt);
			} else {
				const triggered = state.foxes.some((f) => f.row === t.row && f.x >= t.col && f.x <= t.col + 0.9);
				if (triggered) {
					for (const f of state.foxes)
						if (Math.abs(f.row - t.row) <= 1 && f.x >= t.col - 1 && f.x <= t.col + 1.2) f.hp -= MINE_DMG;
					t.hp = 0;
					t.exploded = true;
				}
			}
		} else if (SHOOTERS.includes(t.type)) {
			const fire = TOWER[t.type].fire!;
			t.timer = Math.min(t.timer + dt, fire);
			const hasTarget = state.foxes.some((f) => f.row === t.row && f.x > t.col + 0.5 && f.x <= state.cols + 0.6);
			if (t.timer >= fire && hasTarget) {
				t.timer = 0;
				t.fireFlash = 0.18;
				const dmg = TOWER[t.type].dmg!;
				if (t.type === 'gemellaire') {
					state.eggs.push({ id: state.nextId++, row: t.row, x: t.col + 0.7, dmg, frost: false });
					state.eggs.push({ id: state.nextId++, row: t.row, x: t.col + 0.5, dmg, frost: false });
				} else {
					state.eggs.push({ id: state.nextId++, row: t.row, x: t.col + 0.7, dmg, frost: t.type === 'glaciere' });
				}
			}
		}
	}

	// Eggs: fly right, hit the closest fox ahead in the lane (creuseur immune until midfield).
	for (const e of state.eggs) e.x += EGG_SPEED * dt;
	state.eggs = state.eggs.filter((e) => {
		if (e.x > state.cols + 1) return false;
		let target: Fox | undefined;
		for (const f of state.foxes) {
			if (f.row !== e.row) continue;
			if (f.type === 'creuseur' && f.x > state.cols / 2) continue; // burrowed, egg-immune
			if (f.x >= e.x - EGG_HIT && (!target || f.x < target.x)) target = f;
		}
		if (target && target.x - e.x <= EGG_HIT) {
			target.hp -= e.dmg;
			if (e.frost) target.slow = FROST_TIME;
			return false;
		}
		return true;
	});

	// Foxes: bite the tower in their cell, else advance (slow/jump aware).
	for (const f of state.foxes) {
		if (f.slow > 0) f.slow = Math.max(0, f.slow - dt);
		const tc = Math.floor(f.x - 1e-6);
		const tower = tc >= 0 && tc < state.cols ? firstTowerInCell(state, f.row, tc) : undefined;
		if (tower && f.x <= tc + EAT_CONTACT) {
			if (f.jumps > 0) {
				f.jumps--;
				f.x = tc - 0.05; // hop just past the tower
				f.eating = false;
				continue;
			}
			f.eating = true;
			tower.hp -= FOX[f.type].dmg * dt;
		} else {
			f.eating = false;
			const sp = FOX[f.type].speed * state.speedMul * (f.slow > 0 ? 0.5 : 1);
			f.x -= sp * dt;
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

	// Waves.
	if (!state.over) {
		state.waveTimer -= dt;
		if (state.waveTimer <= 0) {
			startWave(state, rng);
			state.waveTimer += waveInterval(state.wave) * state.spawnMul;
		}
	}
}
