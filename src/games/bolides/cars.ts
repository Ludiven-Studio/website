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
	bars: { speed: number; accel: number; grip: number; trail: number };
	cfg: CarCfg;
}

type Mul = Partial<Record<keyof typeof CFG, number>>;

// Multipliers against the shipped CFG, set by the measured sweep in scripts/bolides-cars.ts.
// Land rate is ~cruise x turnRadius: those two multiply instead of trading off, so a "fast and
// wide" car is a pure buff, not a tradeoff. Move them first and re-measure — never tune by eye.
// No car carries a `grace` multiplier: the sweep measured grace 2 against grace 18 as literally
// the same race (indexOf finds the FIRST hit, which is never in the fresh tail), so a grace
// multiplier would only buy a Trace bar the car does not pay for.
const MULS: Record<string, Mul> = {
	roadster: {},
	comet: { cruise: 1.14, maxSpeed: 1.14, accelResp: 0.65, turnRadius: 0.87, steerResp: 0.85, driftBoost: 0.87 },
	hornet: { maxSpeed: 0.85, accelResp: 1.45, turnRadius: 1.02, steerResp: 1.28, grip: 1.35, gripPaint: 1.18, gripBare: 1.18, minSpeed: 1.35, wallDrag: 0.55, driftBoost: 1.10 },
	drifter: { maxSpeed: 1.05, turnRadius: 0.89, grip: 0.65, driftBoost: 0.80, gripPaint: 0.72, gripBare: 0.72, maxSlip: 1.30, driftHold: 1.45 },
	bunker: { cruise: 0.91, maxSpeed: 0.88, minSpeed: 1.30, accelResp: 0.85, turnRadius: 0.93, steerResp: 0.90, grip: 1.10, driftBoost: 0.80, gripPaint: 1.15, gripBare: 1.15, wallDrag: 0.70 },
};

function resolve(id: string, shield: number): CarCfg {
	const base = CFG as Record<string, number>;
	const out: Record<string, number> = { ...base, shield };
	const mul = MULS[id] as Record<string, number>;
	for (const k of Object.keys(mul)) out[k] = base[k] * mul[k];
	out.grace = Math.round(out.grace); // grace indexes the trail array, so it must stay an integer
	return Object.freeze(out) as CarCfg;
}

/* ---------- the four garage bars ----------
   Each axis is the geometric mean of the cfg ratios that feed it, against the roadster:
     Vitesse  cruise, maxSpeed
     Reprise  accelResp
     Accroche grip, tightness (turnRadius inverted — a smaller circle is better), gripPaint
     Trace    grace + shield, over grace
   The written `bars` are checked against this in cars.test.ts, so they cannot quietly lie. */

const gmean = (...xs: number[]): number => Math.pow(xs.reduce((a, b) => a * b, 1), 1 / xs.length);

// Symmetric in ratio space: one notch is x1.08, two is x1.22, so a nerf and the same-sized
// buff move the bar by the same amount.
const bar = (r: number): number => (r < 1 / 1.22 ? 1 : r < 1 / 1.08 ? 2 : r <= 1.08 ? 3 : r <= 1.22 ? 4 : 5);

export const carBars = (c: CarCfg): Bolide['bars'] => ({
	speed: bar(gmean(c.cruise / CFG.cruise, c.maxSpeed / CFG.maxSpeed)),
	accel: bar(c.accelResp / CFG.accelResp),
	grip: bar(gmean(c.grip / CFG.grip, CFG.turnRadius / c.turnRadius, c.gripPaint / CFG.gripPaint)),
	trail: bar((c.grace + c.shield) / CFG.grace),
});

export const BOLIDES: Bolide[] = [
	{
		id: 'roadster', label: 'Cocotte GT', emoji: '🐔', price: 0,
		pitch: "La série : équilibrée partout, aucun piège — c'est elle qui donne l'étalon des trajectoires.",
		tint: '#3D8BFF',
		bars: { speed: 3, accel: 3, grip: 3, trail: 3 },
		cfg: resolve('roadster', 0),
	},
	{
		id: 'comet', label: 'Comète', emoji: '☄️', price: 60,
		pitch: 'Elle avale le terrain à pleine vitesse, mais met une éternité à relancer une fois retombée au ralenti.',
		tint: '#FF7A2E',
		bars: { speed: 4, accel: 1, grip: 3, trail: 3 },
		cfg: resolve('comet', 0),
	},
	{
		id: 'hornet', label: 'Frelon', emoji: '🐝', price: 90,
		pitch: 'Réponse immédiate, gomme tendre, elle tient contre le rail — mais elle plafonne bas.',
		tint: '#FFD400',
		bars: { speed: 2, accel: 5, grip: 4, trail: 3 },
		cfg: resolve('hornet', 0),
	},
	{
		id: 'drifter', label: 'Toupie', emoji: '🌀', price: 120,
		pitch: 'Catastrophique en appui, redoutable en travers : tout se joue sur ton coup de volant.',
		tint: '#B36BFF',
		bars: { speed: 3, accel: 3, grip: 1, trail: 3 },
		cfg: resolve('drifter', 0),
	},
	{
		id: 'bunker', label: 'Blindé', emoji: '🛡️', price: 150,
		pitch: 'Ta trace fraîche est blindée : le rival qui la touche y perd sa propre boucle — mais tu roules lourd et lent.',
		tint: '#1DE9A0',
		bars: { speed: 2, accel: 2, grip: 4, trail: 5 },
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
