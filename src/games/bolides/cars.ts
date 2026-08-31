/* =====================================================
   BOLIDES — the car roster: the single source of truth for the five bolides.
   Each car is the shipped engine CFG scaled by a small table of multipliers,
   plus one new field (`shield`) that only the Blindé uses. Ownership lives in
   the wallet ('car:<id>'), the current pick in a game-local storage key.
   ===================================================== */
import { CFG, setCarLookup } from './engine';
import { hasCar } from '../../lib/wallet';

/** Engine CFG widened to plain numbers, plus the roster-only `shield` field. */
export type CarCfg = { [K in keyof typeof CFG]: number } & { readonly shield: number };

export interface Bolide {
	id: string;
	label: string;
	emoji: string;
	price: number; // in cocoins
	pitch: string;
	tint: string; // display only: the car's neon swatch in the garage
	// 0-5 each, derived from the resolved cfg by carBars(). They are a reading aid, not the
	// fairness proof: what guarantees no car is best is the measured win rate (see
	// scripts/bolides-cars.ts). Every paid car must show one bar under the free roadster's 3 —
	// a free car that looks like a trap is a worse failure than an imbalanced paid one.
	bars: { speed: number; accel: number; turn: number; grip: number; trail: number };
	cfg: CarCfg;
}

type Mul = Partial<Record<keyof typeof CFG, number>>;

// Multipliers against the shipped CFG, set by the measured sweep in scripts/bolides-cars.ts.
// Each car owns exactly one axis and pays for it in pace. The price list comes from a SOLO probe
// (one variant against four identical stock cars, so 25 % is the fair line) and is deeply
// unintuitive — do not re-tune from the names of the fields:
//   cruise +10 % is worth +13 points of win rate, and is the ONLY affordable currency for a bonus
//   maxSpeed +20 % +13 | grip +30 % +3 | accelResp +50 % 0 | steerResp +30 % -4 | minSpeed +30 % -4.5
//   turnRadius -15 % -6  <-- a TIGHTER circle is a cost, because land per loop goes as cruise x radius
// So "reprise" is free to give and "virage" has to be compensated, not paid for.
// No car carries a `grace` multiplier: the sweep measured grace 2 against grace 18 as literally
// the same race (indexOf finds the FIRST hit, which is never in the fresh tail), so a grace
// multiplier would only buy a Trace bar the car does not pay for.
const MULS: Record<string, Mul> = {
	roadster: {},
	// Vitesse: the top end no one else has, bought with a soft engine and a high brake floor.
	comet: { cruise: 1.07, maxSpeed: 1.18, minSpeed: 1.10, accelResp: 0.62, turnRadius: 0.96 },
	// Reprise: answers at once and never bogs down, but it plateaus early.
	hornet: { cruise: 0.97, maxSpeed: 0.87, minSpeed: 1.20, accelResp: 1.70, steerResp: 1.25, grip: 1.06 },
	// Virage: turns inside everybody, and gives up traction to do it.
	drifter: {
		cruise: 1.06, maxSpeed: 1.02, turnRadius: 0.80, steerResp: 1.20,
		grip: 0.72, gripPaint: 0.78, gripBare: 0.82, maxSlip: 1.30, driftHold: 1.45, driftBoost: 0.85,
	},
	// Accroche: sticks to the road (it never drifts at all) and to its own trail, and pays in pace.
	bunker: {
		cruise: 0.88, maxSpeed: 0.92, minSpeed: 1.15, accelResp: 0.85, steerResp: 0.88,
		turnRadius: 1.06, grip: 1.15, gripPaint: 1.22, gripBare: 1.14,
	},
};

function resolve(id: string, shield: number): CarCfg {
	const base = CFG as Record<string, number>;
	const out: Record<string, number> = { ...base, shield };
	const mul = MULS[id] as Record<string, number>;
	for (const k of Object.keys(mul)) out[k] = base[k] * mul[k];
	out.grace = Math.round(out.grace); // grace indexes the trail array, so it must stay an integer
	return Object.freeze(out) as CarCfg;
}

/* ---------- the five garage bars ----------
   Each axis is the geometric mean of the cfg ratios that feed it, against the roadster:
     Vitesse  cruise, maxSpeed
     Reprise  accelResp
     Virage   tightness (turnRadius inverted — a smaller circle is better), steerResp
     Accroche grip, gripPaint, gripBare
     Trace    grace + shield, over grace
   Virage used to be folded into Accroche, which made the two cars that corner for opposite reasons
   — the Toupie turns tight BECAUSE it has no grip — read as the same axis and cancel out.
   The written `bars` are checked against this in cars.test.ts, so they cannot quietly lie. */

const gmean = (...xs: number[]): number => Math.pow(xs.reduce((a, b) => a * b, 1), 1 / xs.length);

// Symmetric in ratio space: one notch is x1.08, two is x1.22, so a nerf and the same-sized
// buff move the bar by the same amount.
const bar = (r: number): number => (r < 1 / 1.22 ? 1 : r < 1 / 1.08 ? 2 : r <= 1.08 ? 3 : r <= 1.22 ? 4 : 5);

export const carBars = (c: CarCfg): Bolide['bars'] => ({
	speed: bar(gmean(c.cruise / CFG.cruise, c.maxSpeed / CFG.maxSpeed)),
	accel: bar(c.accelResp / CFG.accelResp),
	turn: bar(gmean(CFG.turnRadius / c.turnRadius, c.steerResp / CFG.steerResp)),
	grip: bar(gmean(c.grip / CFG.grip, c.gripPaint / CFG.gripPaint, c.gripBare / CFG.gripBare)),
	trail: bar((c.grace + c.shield) / CFG.grace),
});

export const BOLIDES: Bolide[] = [
	{
		id: 'roadster', label: 'Cocotte GT', emoji: '🐔', price: 0,
		pitch: "La série : équilibrée partout, aucun piège — c'est elle qui donne l'étalon des trajectoires.",
		tint: '#3D8BFF',
		bars: { speed: 3, accel: 3, turn: 3, grip: 3, trail: 3 },
		cfg: resolve('roadster', 0),
	},
	{
		id: 'comet', label: 'Comète', emoji: '☄️', price: 60,
		pitch: "La pointe de vitesse que personne d'autre n'a — mais un moteur mou : retombée au ralenti, elle met une éternité à relancer.",
		tint: '#FF7A2E',
		bars: { speed: 4, accel: 1, turn: 3, grip: 3, trail: 3 },
		cfg: resolve('comet', 0),
	},
	{
		id: 'hornet', label: 'Frelon', emoji: '🐝', price: 90,
		pitch: "La reprise : elle repart au quart de tour et ne s'endort jamais dans le serré. En revanche, elle plafonne bas.",
		tint: '#FFD400',
		bars: { speed: 2, accel: 5, turn: 4, grip: 3, trail: 3 },
		cfg: resolve('hornet', 0),
	},
	{
		id: 'drifter', label: 'Toupie', emoji: '🌀', price: 120,
		pitch: "Le virage : elle passe à l'intérieur de tout le monde. Catastrophique en appui, redoutable en travers.",
		tint: '#B36BFF',
		bars: { speed: 3, accel: 3, turn: 5, grip: 1, trail: 3 },
		cfg: resolve('drifter', 0),
	},
	{
		id: 'bunker', label: 'Blindé', emoji: '🛡️', price: 150,
		pitch: "L'appui : collée au sol, elle ne part jamais en travers. Sa trace fraîche est blindée : qui la touche y perd sa boucle. Mais elle roule lourd.",
		tint: '#1DE9A0',
		bars: { speed: 2, accel: 2, turn: 2, grip: 4, trail: 5 },
		cfg: resolve('bunker', 20),
	},
];

export const DEFAULT_CAR = 'roadster';

const PICK_KEY = 'bolides-car';

/** Never throws: a stale storage value or a hostile netcode payload must not kill a race. */
export const carById = (id: string): Bolide => BOLIDES.find((b) => b.id === id) ?? BOLIDES[0];

export const carCfg = (id: string): CarCfg => carById(id).cfg;

const ownsCar = (b: Bolide): boolean => b.price === 0 || hasCar(b.id);

export const ownedCars = (): Bolide[] => BOLIDES.filter(ownsCar);

export function selectedCar(): string {
	try {
		const saved = localStorage.getItem(PICK_KEY);
		const b = BOLIDES.find((x) => x.id === saved);
		if (b && ownsCar(b)) return b.id;
	} catch { /* storage unavailable */ }
	return DEFAULT_CAR;
}

export function selectCar(id: string): void {
	const b = BOLIDES.find((x) => x.id === id);
	if (!b || !ownsCar(b)) return;
	try { localStorage.setItem(PICK_KEY, b.id); } catch { /* storage unavailable */ }
}

// The engine cannot import the roster (cycle), so the roster installs itself here. Until this
// runs, every seat silently drives the base car.
setCarLookup(carCfg);
