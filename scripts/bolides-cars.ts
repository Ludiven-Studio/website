/*
 * Throwaway: is the five-bolide roster balanced? Never judged by eye.
 *   npx tsx scripts/bolides-cars.ts [--quick] [--seeds N] [--mirror] [--tune|--muls f.json]
 *
 * Grid: 5 cars x 4 seats x 3 difficulties x 2 driver policies x N seeds.
 * One race seats 4 of the 5 cars, so a rotation of 5 offsets gives every car every seat
 * exactly once and makes it meet every rival. Seat rotation is not cosmetic: START_POS is
 * symmetric but s.rng is consumed in car order, so seat 1 and seat 4 face different bots.
 * Primary metric is bestPct — the peak territory share IS the daily leaderboard score.
 */
import { readFileSync } from 'node:fs';
import {
	createGame, stepGame, botSteer, setCarLookup, CFG, DIFFS, TOTAL,
	type Car, type CarPick, type GameState,
} from '../src/games/bolides/engine';
import { BOLIDES, carBars, carCfg, type CarCfg } from '../src/games/bolides/cars';

setCarLookup(carCfg);

const DT = 1 / 60;
const IDS = BOLIDES.map((b) => b.id);
const POLICIES = ['sweep', 'flick'] as const;
type Policy = (typeof POLICIES)[number];

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const num = (name: string, dflt: number) => {
	const i = argv.indexOf(`--${name}`);
	return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
};
const str = (name: string, dflt: string) => {
	const i = argv.indexOf(`--${name}`);
	return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const SEEDS = num('seeds', flag('quick') ? 10 : 40);
const WITH_MIRROR = flag('mirror');
const MULS_FILE = str('muls', '');
const TUNED = flag('tune') || !!MULS_FILE;

/* ---------- candidate multipliers (--tune / --muls f.json) ----------
   createGame takes ready-made tables, so a proposal can be measured here without editing
   cars.ts. Each row is the FULL multiplier set against CFG, exactly like MULS over there.
   `--muls` reads the same shape from a file, so several candidates can run in parallel. */
type Mul = Partial<Record<keyof typeof CFG, number>> & { shield?: number };
const TUNE: Record<string, Mul> = MULS_FILE ? JSON.parse(readFileSync(MULS_FILE, 'utf8')) : {
	roadster: {},
	comet: { cruise: 1.14, maxSpeed: 1.14, accelResp: 0.65, turnRadius: 0.87, steerResp: 0.85, driftBoost: 0.87, grace: 1.35 },
	hornet: { cruise: 1.10, maxSpeed: 0.92, accelResp: 1.40, turnRadius: 0.92, steerResp: 1.15, grip: 1.20, grace: 1.30 },
	drifter: { maxSpeed: 1.05, turnRadius: 0.89, grip: 0.85, driftGrip: 0.55, driftBoost: 0.80, driftJab: 0.80, driftMinSpeed: 0.85, driftHold: 1.45, grace: 1.35 },
	bunker: { cruise: 0.91, maxSpeed: 0.88, minSpeed: 1.30, accelResp: 0.85, turnRadius: 0.93, steerResp: 0.90, grip: 1.10, driftGrip: 1.30, driftBoost: 0.80, driftJab: 1.35, wallDrag: 0.70, shield: 20 },
};

const SHIELD = num('shield', -1); // sweep the Blinde window: 20 / 34 / 50

function tuned(id: string): CarCfg {
	const shipped = carCfg(id);
	const forced = SHIELD >= 0 && shipped.shield > 0;
	const base = CFG as Record<string, number>;
	const out: Record<string, number> = TUNED ? { ...base, shield: shipped.shield } : { ...shipped };
	if (TUNED) {
		for (const [k, v] of Object.entries(TUNE[id] ?? {})) out[k] = k === 'shield' ? v : base[k] * v;
		out.grace = Math.round(out.grace); // grace indexes the trail array
	}
	if (forced) out.shield = SHIELD;
	return out as CarCfg;
}
const CFGS: Record<string, CarCfg> = Object.fromEntries(IDS.map((id) => [id, tuned(id)]));
const PICKS: Record<string, CarPick> = CFGS;

/* ---------- driver policies ---------- */

const QSTEP = 0.34; // one quantised notch, applied in a single frame
const QGATE = 0.30;

/** Two drivers chasing the same botSteer target.
 *  `sweep` rate-limits it under the car's own driftJab, so traction never breaks — note that
 *  raw botSteer does NOT do this: its phase switches jump the wheel and the shipped bots drift
 *  most of a lap. `flick` quantises instead, landing each change in one frame, which trips the
 *  jab test on purpose. A policy that never flicks measures Toupie as strictly worst.
 *  Both floor the throttle on the straights and lift in the corners: at neutral throttle
 *  maxSpeed — a roster field on four of five cars — would never be exercised. */
function makeDriver(policy: Policy) {
	const held = new Map<number, number>();
	const drive = (s: GameState, car: Car, dt: number): number => {
		const target = botSteer(s, car, dt);
		const prev = held.get(car.id) ?? 0;
		let out: number;
		if (policy === 'sweep') {
			const step = 2.2 * dt; // mirrors KEY_RAMP: a swept wheel, ~0.45 s to full lock
			out = prev + Math.max(-step, Math.min(step, target - prev));
		} else {
			const q = Math.round(target / QSTEP) * QSTEP;
			out = Math.abs(q - prev) > QGATE ? q : prev;
		}
		held.set(car.id, out);
		return out;
	};
	const gas = (_s: GameState, car: Car): number => (Math.abs(held.get(car.id) ?? 0) < 0.4 ? 1 : 0);
	return { drive, gas };
}

/* ---------- one race ---------- */

interface Run {
	car: string; seat: number; diff: number; policy: Policy;
	bestPct: number; finalPct: number; won: number; wonByTime: number;
	deaths: number; kills: number; snaps: number; captures: number; gain: number;
	steps: number; speedSum: number; outside: number; scrape: number; scrapeSpeed: number; drift: number;
}

const blank = (car: string, seat: number, diff: number, policy: Policy): Run => ({
	car, seat, diff, policy, bestPct: 0, finalPct: 0, won: 0, wonByTime: 0,
	deaths: 0, kills: 0, snaps: 0, captures: 0, gain: 0,
	steps: 0, speedSum: 0, outside: 0, scrape: 0, scrapeSpeed: 0, drift: 0,
});

let trailCollisions = 0; // how often the shield test is even reachable

function race(seed: number, diff: number, roster: string[], policy: Policy): Run[] {
	const s = createGame(seed, diff, roster.map((id) => PICKS[id]));
	s.hero = 0; // nobody is "the player": every seat is driven by the same policy
	for (const c of s.cars) c.isBot = true; // uniform respawn delay, or seat 1 is a different game
	const { drive, gas } = makeDriver(policy);
	const runs = roster.map((id, i) => blank(id, i + 1, diff, policy));

	while (!s.over && s.clock < CFG.timeLimit + 1) {
		stepGame(s, 0, 0, DT, drive, gas);
		for (const ev of s.events) {
			if (ev.type === 'death') { runs[ev.id - 1].deaths++; trailCollisions++; }
			else if (ev.type === 'kill') runs[ev.killer - 1].kills++;
			else if (ev.type === 'snap') { runs[ev.id - 1].snaps++; trailCollisions++; }
			else if (ev.type === 'capture') { runs[ev.id - 1].captures++; runs[ev.id - 1].gain += ev.gain; }
		}
		s.events.length = 0;
		for (const c of s.cars) {
			const r = runs[c.id - 1];
			r.bestPct = Math.max(r.bestPct, (s.counts[c.id] / TOTAL) * 100);
			if (!c.alive) continue;
			r.steps++;
			r.speedSum += c.speed;
			if (c.drifting) r.drift++;
			if (c.outside) r.outside++;
			if (c.scraping) { r.scrape++; r.scrapeSpeed += c.speed; }
		}
	}
	for (let i = 0; i < runs.length; i++) {
		runs[i].finalPct = (s.counts[i + 1] / TOTAL) * 100;
		runs[i].won = s.winner === i + 1 ? 1 : 0;
		runs[i].wonByTime = runs[i].won && s.overByTime ? 1 : 0;
	}
	return runs;
}

/* ---------- the grid ---------- */

const all: Run[] = [];
const t0 = Date.now();
let races = 0;

for (let seed = 1; seed <= SEEDS; seed++) {
	for (let diff = 0; diff < DIFFS.length; diff++) {
		for (const policy of POLICIES) {
			for (let off = 0; off < IDS.length; off++) {
				const roster = [0, 1, 2, 3].map((j) => IDS[(off + j) % IDS.length]);
				all.push(...race(seed * 1000 + diff * 7 + off, diff, roster, policy));
				races++;
			}
		}
	}
}

// Mirror block: the tested car against three base cars, which isolates raw land rate
// from head-to-head interaction. Medium difficulty only — it is an extra, not the grid.
const mirror: Run[] = [];
if (WITH_MIRROR) {
	for (let seed = 1; seed <= SEEDS; seed++) {
		for (const policy of POLICIES) {
			for (const id of IDS) {
				for (let seat = 0; seat < 4; seat++) {
					const roster = ['roadster', 'roadster', 'roadster', 'roadster'];
					roster[seat] = id;
					mirror.push(...race(seed * 1000 + 91, 1, roster, policy).filter((r) => r.seat === seat + 1));
					races++;
				}
			}
		}
	}
}

/* ---------- stats ---------- */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : NaN);
function quantile(xs: number[], q: number): number {
	if (!xs.length) return NaN;
	const v = [...xs].sort((a, b) => a - b);
	return v[Math.min(v.length - 1, Math.floor(q * v.length))];
}
const ci95 = (p: number, n: number) => 1.96 * Math.sqrt((p * (1 - p)) / Math.max(1, n)) * 100;
const pad = (v: string | number, w: number) => String(v).padStart(w);

interface Agg {
	id: string; n: number; win: number; ci: number;
	medBest: number; p90Best: number; meanBest: number; medFinal: number;
	deaths: number; kills: number; snaps: number; captures: number; perCapture: number;
	speed: number; outside: number; scrape: number; scrapeSpeed: number; drift: number;
}

function agg(id: string, runs: Run[]): Agg {
	const best = runs.map((r) => r.bestPct);
	const steps = sum(runs.map((r) => r.steps));
	const scrape = sum(runs.map((r) => r.scrape));
	const caps = sum(runs.map((r) => r.captures));
	const p = mean(runs.map((r) => r.won));
	return {
		id, n: runs.length, win: p * 100, ci: ci95(p, runs.length),
		medBest: quantile(best, 0.5), p90Best: quantile(best, 0.9), meanBest: mean(best),
		medFinal: quantile(runs.map((r) => r.finalPct), 0.5),
		deaths: mean(runs.map((r) => r.deaths)), kills: mean(runs.map((r) => r.kills)),
		snaps: mean(runs.map((r) => r.snaps)), captures: mean(runs.map((r) => r.captures)),
		perCapture: caps ? sum(runs.map((r) => r.gain)) / caps : 0,
		speed: steps ? sum(runs.map((r) => r.speedSum)) / steps : 0,
		outside: steps ? (sum(runs.map((r) => r.outside)) / steps) * 100 : 0,
		scrape: steps ? (scrape / steps) * 100 : 0,
		scrapeSpeed: scrape ? sum(runs.map((r) => r.scrapeSpeed)) / scrape : 0,
		drift: steps ? (sum(runs.map((r) => r.drift)) / steps) * 100 : 0,
	};
}

const pool = (runs: Run[]) => IDS.map((id) => agg(id, runs.filter((r) => r.car === id)));

function table(title: string, rows: Agg[]): void {
	console.log(`\n${title}`);
	console.log('car       n     win%       med%   p90%   mean%  death  kill  snap  caps  cells/cap  speed  out%  scr%  scrSpd  drft%');
	for (const a of rows) {
		console.log(
			`${a.id.padEnd(9)} ${pad(a.n, 4)}  ${pad(a.win.toFixed(1), 4)}±${a.ci.toFixed(1)}` +
			`  ${pad(a.medBest.toFixed(2), 6)} ${pad(a.p90Best.toFixed(2), 6)} ${pad(a.meanBest.toFixed(2), 6)}` +
			`  ${pad(a.deaths.toFixed(2), 5)} ${pad(a.kills.toFixed(2), 5)} ${pad(a.snaps.toFixed(2), 5)} ${pad(a.captures.toFixed(2), 5)}` +
			`  ${pad(a.perCapture.toFixed(0), 9)}  ${pad(a.speed.toFixed(2), 5)} ${pad(a.outside.toFixed(1), 5)} ${pad(a.scrape.toFixed(1), 5)} ${pad(a.scrapeSpeed.toFixed(2), 6)} ${pad(a.drift.toFixed(1), 6)}`,
		);
	}
}

const spread = (xs: number[]) => (Math.max(...xs) - Math.min(...xs)) / (sum(xs) / xs.length) * 100;
const rankBy = (rows: Agg[], key: (a: Agg) => number) => [...rows].sort((a, b) => key(b) - key(a)).map((a) => a.id);
const rankOf = (order: string[], id: string) => order.indexOf(id) + 1;
const ok = (b: boolean) => (b ? 'PASS' : 'FAIL');

const overall = pool(all);
table(`ALL — ${SEEDS} seeds, ${races} races, ${all.length + mirror.length} car-runs, ${((Date.now() - t0) / 1000).toFixed(0)}s${TUNED ? ' [TUNE]' : ''}`, overall);
const bySweep = pool(all.filter((r) => r.policy === 'sweep'));
const byFlick = pool(all.filter((r) => r.policy === 'flick'));
table('policy: sweep', bySweep);
table('policy: flick', byFlick);
for (let d = 0; d < DIFFS.length; d++) table(`difficulty: ${DIFFS[d].label}`, pool(all.filter((r) => r.diff === d)));
if (WITH_MIRROR) table('mirror (3 roadsters)', pool(mirror));

console.log('\nseat check (median bestPct per seat, must be measured over equal counts)');
for (const id of IDS) {
	const per = [1, 2, 3, 4].map((seat) => quantile(all.filter((r) => r.car === id && r.seat === seat).map((r) => r.bestPct), 0.5));
	const n = [1, 2, 3, 4].map((seat) => all.filter((r) => r.car === id && r.seat === seat).length);
	console.log(`${id.padEnd(9)} ${per.map((v) => pad(v.toFixed(2), 6)).join(' ')}   n=${n.join('/')}`);
}

/* ---------- acceptance band ---------- */

console.log('\n--- acceptance band ---');
const bandOk = overall.every((a) => a.win >= 19 && a.win <= 31);
const straddles = overall.filter((a) => a.win - a.ci < 19 || a.win + a.ci > 31).map((a) => a.id);
console.log(`1. win rate 25% +/- 6 pts: ${ok(bandOk)}  ${overall.map((a) => `${a.id} ${a.win.toFixed(1)}±${a.ci.toFixed(1)}`).join(' | ')}`);
if (straddles.length) console.log(`   CI straddles a band edge (needs more seeds to conclude): ${straddles.join(', ')}`);

const medSpread = spread(overall.map((a) => a.medBest));
const p90Spread = spread(overall.map((a) => a.p90Best));
console.log(`2. daily-score parity: median spread ${medSpread.toFixed(1)}% (<=8) ${ok(medSpread <= 8)} · p90 spread ${p90Spread.toFixed(1)}% (<=12) ${ok(p90Spread <= 12)}`);

const sweepRank = rankBy(bySweep, (a) => a.medBest);
const flickRank = rankBy(byFlick, (a) => a.medBest);
const doubleTop = sweepRank[0] === flickRank[0] ? sweepRank[0] : null;
const roadLast = rankOf(sweepRank, 'roadster') === 5 || rankOf(flickRank, 'roadster') === 5;
console.log(`3. no dominance: sweep ${sweepRank.join(' > ')} | flick ${flickRank.join(' > ')}`);
console.log(`   rank 1 under both: ${doubleTop ?? 'none'} ${ok(!doubleTop)} · roadster never rank 5 ${ok(!roadLast)}`);

const SIGNS: [string, (rows: Agg[]) => string[]][] = [
	['kills/run', (r) => rankBy(r, (a) => a.kills)],
	['cells per capture', (r) => rankBy(r, (a) => a.perCapture)],
	['median bestPct', (r) => rankBy(r, (a) => a.medBest)],
	['fewest deaths/run', (r) => rankBy(r, (a) => -a.deaths)],
	['speed while scraping', (r) => rankBy(r, (a) => a.scrapeSpeed)],
	['mean speed', (r) => rankBy(r, (a) => a.speed)],
	['captures/run', (r) => rankBy(r, (a) => a.captures)],
	['fewest snaps/run', (r) => rankBy(r, (a) => -a.snaps)],
	['time drifting', (r) => rankBy(r, (a) => a.drift)],
];
console.log('4. signature check — rank per secondary metric (overall pool)');
const tops = new Set<string>();
const bottoms = new Set<string>();
for (const [label, fn] of SIGNS) {
	const order = fn(overall);
	tops.add(order[0]);
	bottoms.add(order[4]);
	console.log(`   ${label.padEnd(22)} ${order.join(' > ')}`);
}
console.log(`   drifter medBest rank: sweep ${rankOf(sweepRank, 'drifter')} (want >=4) / flick ${rankOf(flickRank, 'drifter')} (want 1)`);
for (const id of IDS) console.log(`   ${id.padEnd(9)} rank1 somewhere: ${tops.has(id) ? 'yes' : 'NO'}   rank5 somewhere: ${bottoms.has(id) ? 'yes' : 'no'}`);
console.log(`   roadster must be neither: ${ok(!tops.has('roadster') && !bottoms.has('roadster'))}`);

// 5. The shop is read before the win rates are: a free car that looks like a trap is the
// worse failure. Every paid car must show one bar under the roadster's.
const AXIS = ['speed', 'accel', 'grip', 'trail'] as const;
const free = carBars(CFGS.roadster);
let barsOk = true;
console.log('5. shop bars (vitesse/reprise/accroche/trace) — every paid car needs one axis under the free car');
for (const id of IDS) {
	const b = carBars(CFGS[id]);
	const weak = AXIS.some((k) => b[k] < free[k]);
	if (id !== 'roadster' && !weak) barsOk = false;
	console.log(`   ${id.padEnd(9)} ${AXIS.map((k) => b[k]).join('/')}   ${id === 'roadster' ? '(reference)' : ok(weak)}`);
}
console.log(`   no paid car reads as a pure upgrade: ${ok(barsOk)}`);

/* ---------- shield cost ---------- */

console.log('\n--- shield lookup cost ---');
console.log(`trail collisions (kill or snap) over the whole grid: ${trailCollisions} = ${(trailCollisions / races).toFixed(1)} per race`);
const long = Array.from({ length: 3000 }, (_, i) => i);
const miss = -1;
let acc = 0;
let t = Date.now();
for (let i = 0; i < 2e5; i++) acc += long.indexOf(miss);
const tIdx = Date.now() - t;
t = Date.now();
for (let i = 0; i < 2e5; i++) {
	for (let k = long.length - 1; k >= long.length - 34; k--) if (long[k] === miss) { acc++; break; }
}
const tWin = Date.now() - t;
console.log(`200k lookups on a 3000-cell trail: indexOf ${tIdx} ms · 34-cell window ${tWin} ms (acc ${acc})`);
console.log(`CFG.timeLimit ${CFG.timeLimit}s · winPct ${CFG.winPct}% · shields: ${BOLIDES.map((b) => `${b.id} ${b.cfg.shield}`).join(', ')}`);
