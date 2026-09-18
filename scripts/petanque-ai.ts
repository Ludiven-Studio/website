/* Measurement F — the AI ladder. Plays whole matches, AI against AI, on the real engine and the
   real rule book. Targets from the plan:
     0.30 vs 0.30 -> 50 +- 4 %   ·   0.60 vs 0.30 -> 72-80 %   ·   0.90 vs 0.60 -> 70-78 %
     0.92 vs 0.92 -> 1.6 to 2.1 points per end (a real tete-a-tete sits near 1.8)
     the ladder must be monotone, with no plateau longer than 10 levels.

   Usage: npx tsx scripts/petanque-ai.ts [matches] */
import type { Side } from '../src/games/petanque/rules13';
import { skillForLevel } from '../src/games/petanque/ai';
import { playMatch, mean, type MatchResult } from './petanque-match';

const N = Number(process.argv[2] ?? 60);

/** Side 0 always carries `skillA`, so the reported rate is that side's. */
function series(n: number, skillA: number, skillB: number, target: number, tag: number): MatchResult[] {
	const out: MatchResult[] = [];
	for (let k = 0; k < n; k++) {
		const seed = 1000003 * (k + 1) + tag;
		// Swap seats every other match so a first-thrower edge cannot pass for skill.
		const flip = k % 2 === 1;
		const r = playMatch({ seed, skills: flip ? [skillB, skillA] : [skillA, skillB], target, surface: 'terre-battue', amp: 0.03 });
		out.push(flip ? { ...r, winner: (r.winner === 0 ? 1 : 0) as Side } : r);
	}
	return out;
}

const pct = (a: MatchResult[]): number => (a.filter((r) => r.winner === 0).length / a.length) * 100;

const t0 = Date.now();
const probe = playMatch({ seed: 7, skills: [0.6, 0.6], target: 13, surface: 'terre-battue', amp: 0.03 });
console.log(`one 13-point match: ${Date.now() - t0} ms · ${probe.ends} ends · ${probe.throws} throws\n`);

console.log(`F1 · win rate of side A — ${N} matches each, game to 13\n`);
console.log('A vs B          win A     ends    pts/scoring end   null %   shoot %   hand-placed');
const PAIRS: [number, number, string][] = [
	[0.30, 0.30, '50 +- 4'],
	[0.60, 0.30, '72-80'],
	[0.90, 0.60, '70-78'],
	[0.92, 0.92, '50 +- 4'],
];
for (const [a, b, band] of PAIRS) {
	const r = series(N, a, b, 13, Math.round(a * 1000 + b));
	// Per SCORING end: a null end is a replay, not a 0-point end, so averaging it in understates
	// what a mene is worth. The plan's 1.6-2.1 band is about the ends that actually count.
	const perEnd = mean(r.map((m) => m.points)) / mean(r.map((m) => m.ends - m.nullEnds));
	const nulls = (mean(r.map((m) => m.nullEnds)) / mean(r.map((m) => m.ends))) * 100;
	const shoot = (mean(r.map((m) => m.shots)) / mean(r.map((m) => m.throws))) * 100;
	console.log(
		`${a.toFixed(2)} vs ${b.toFixed(2)}   ${pct(r).toFixed(0).padStart(4)} %` +
		`   ${mean(r.map((m) => m.ends)).toFixed(1).padStart(5)}   ${perEnd.toFixed(2).padStart(13)}` +
		`   ${nulls.toFixed(0).padStart(5)} %   ${shoot.toFixed(0).padStart(6)} %   ${mean(r.map((m) => m.handPlaced)).toFixed(1).padStart(6)}   (target ${band})`,
	);
}

/* A 13-point match is ~13 independent menes, so ANY per-mene edge compounds towards certainty —
   that is arithmetic, not a broken skill knob. This column separates the two: if the per-mene edge
   is modest and only the match is decisive, the scale is fine and the bands were the wrong unit. */
console.log('\nF1b · the same gaps over a SINGLE mene (game to 1)\n');
console.log('A vs B          win A per mene');
for (const [a, b] of PAIRS) {
	const r = series(N, a, b, 1, Math.round(a * 1000 + b) + 7);
	console.log(`${a.toFixed(2)} vs ${b.toFixed(2)}   ${pct(r).toFixed(0).padStart(4)} %`);
}

/* The reference is an AI at 0.62 standing in for "an average human". That proxy fixes the SHAPE of
   the ladder, not where a real player sits on it — only a human can say that. So the gate here is
   dynamic range and monotonicity over spans wide enough to beat the sampling noise. Adjacent
   10-level steps are NOT: at 60 matches a level, one standard deviation is already ~6 points, so a
   "plateau under 5 %" detector measures the sample size and nothing else.

   This sweeps ai.ts's OWN skill knob end to end, which is no longer what the ladder ships: measurement
   G found 0.95 unbeatable over a long match, so levels.ts tops out at 0.76 and leaves the rest to the
   Expert pack. For the shipped ladder read scripts/petanque-levels.ts, not this table. */
console.log('\nF2 · the AI skill knob, swept end to end, against a fixed 0.62 reference — game to 7\n');
console.log('level   skill   level wins');
const M = Math.max(20, Math.round(N / 2));
const LADDER = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const wins: number[] = [];
for (const lv of LADDER) {
	const sk = skillForLevel(lv);
	const w = pct(series(M, sk, 0.62, 7, lv * 31));
	wins.push(w);
	console.log(`${String(lv).padStart(5)}   ${sk.toFixed(2)}   ${w.toFixed(0).padStart(5)} %`);
}
console.log(`   range ${Math.min(...wins).toFixed(0)} -> ${Math.max(...wins).toFixed(0)} %  (gate: spans at least 15 -> 85)`);
for (let i = 0; i + 3 < LADDER.length; i++)
	console.log(`   level ${LADDER[i]} -> ${LADDER[i + 3]}: ${(wins[i + 3] - wins[i]).toFixed(0).padStart(4)} pts  (gate >= +8)`);
