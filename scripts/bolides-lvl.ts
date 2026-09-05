/* Calibrates the levels ladder. A level is "reach T % of the arena before the buzzer at L s".
   The player seat is driven by the bot AI (s.hero = 0 means no seat is the hero), which is the
   only "skilled player" we can simulate — and it wins 1 race in 4, i.e. exactly chance, so treat
   it as an AVERAGE driver, not a good one.

   Each run records the clock at which the player seat first reaches every 1 % mark. From that one
   table the clear rate of ANY (target, limit) pair falls out, because shortening the limit cannot
   change the race: the limit only decides when it stops.

   Usage: npx tsx scripts/bolides-lvl.ts */
import { createGame, stepGame, pct, DIFFS, CFG } from '../src/games/bolides/engine';
import { bolidesLevels } from '../src/games/bolides/levels';

const DT = 1 / 60;
const CAP = 60 * 10;
const RUNS = 300;
const MAXPCT = 60;
const NEVER = Infinity;

/** Clock at which the player seat first held each 1 % mark, indexed by share. */
function firstTimes(seed: number, diff: number): number[] {
	const t = new Array<number>(MAXPCT + 1).fill(NEVER);
	const s = createGame(seed, diff, undefined, true);
	s.hero = 0;
	let top = 0;
	while (!s.over && s.clock < CAP) {
		stepGame(s, 0, 0, DT);
		const share = pct(s, 1);
		if (share > top) {
			for (let k = Math.floor(top) + 1; k <= Math.min(MAXPCT, Math.floor(share)); k++) t[k] = s.clock;
			top = share;
		}
	}
	return t;
}

const q = (a: number[], p: number): number => a[Math.min(a.length - 1, Math.floor(a.length * p))];

// One table per difficulty. Difficulty barely moves the reachable share (see below), so the
// ladder reads the Moyen table and uses difficulty only for the flavour of the opposition.
const tables: number[][][] = [];
for (let diff = 0; diff < DIFFS.length; diff++) {
	const rows: number[][] = [];
	for (let seed = 1; seed <= RUNS; seed++) rows.push(firstTimes(seed, diff));
	tables.push(rows);
}

/** Share of runs that reach `target` % within `limit` seconds. */
const clearRate = (rows: number[][], target: number, limit: number): number =>
	rows.filter((t) => t[target] <= limit).length / rows.length;

console.log(`${RUNS} runs per difficulty · knockout ${CFG.winPct}% · default limit ${CFG.timeLimit}s\n`);

console.log('peak share reached, full-length race');
for (let diff = 0; diff < DIFFS.length; diff++) {
	const peaks = tables[diff].map((t) => {
		let p = 0;
		for (let k = 1; k <= MAXPCT; k++) if (t[k] < NEVER) p = k;
		return p;
	}).sort((a, b) => a - b);
	console.log(`  ${DIFFS[diff].label.padEnd(10)} p10 ${q(peaks, 0.1)}  p25 ${q(peaks, 0.25)}  median ${q(peaks, 0.5)}  p75 ${q(peaks, 0.75)}  p90 ${q(peaks, 0.9)}  max ${peaks[peaks.length - 1]}`);
}

// Does cutting the clock actually bite? If the same target clears just as often at 90 s as at
// 180 s, time is a dead knob and the ladder has only one axis to work with.
console.log('\nclear rate — Moyen, target x limit');
const LIMITS = [45, 60, 75, 90, 120, 150, 180];
console.log(`  target ${LIMITS.map((l) => `${l}s`.padStart(6)).join('')}`);
for (const target of [15, 20, 25, 30, 35, 40, 45]) {
	const row = LIMITS.map((l) => `${(clearRate(tables[1], target, l) * 100).toFixed(0)}%`.padStart(6)).join('');
	console.log(`  ${String(target).padStart(6)}%${row}`);
}

console.log('\nladder as shipped — clear rate per level');
for (let l = 1; l <= 200; l++) {
	if (l % 20 !== 0 && l !== 1) continue;
	const cfg = bolidesLevels.config(l);
	const rate = clearRate(tables[cfg.diff], cfg.target, cfg.limit);
	const two = clearRate(tables[cfg.diff], cfg.twoStar, cfg.limit);
	console.log(
		`  lvl ${String(l).padStart(3)}  ${DIFFS[cfg.diff].label.padEnd(9)} ${String(cfg.target).padStart(2)}% in ${String(cfg.limit).padStart(3)}s` +
		`  clears ${`${(rate * 100).toFixed(0)}%`.padStart(4)}  2★ ${`${(two * 100).toFixed(0)}%`.padStart(4)}`,
	);
}
