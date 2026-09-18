/* Measurement G — the levels ladder. The simulated player is an AI at skill 0.62 ("an average
   human"), seated where the real player sits: side 0, first to throw the jack, on the level's own
   pitch and against the level's own config. Targets from the plan:
     1-10 -> 88-97 %  ·  40-50 -> 60-72 %  ·  90-100 -> 30-45 %  ·  190-200 -> 15-28 %
     monotone decreasing over the bands, and no level under 8 %.

   The 0.62 reference fixes the SHAPE of the ladder, not where a real player lands on it — only a
   human can say that. So read the bands as a dynamic-range gate, not as a promise.

   Usage: npx tsx scripts/petanque-levels.ts [tries] */
import { petanqueLevels } from '../src/games/petanque/levels';
import { playMatch, mean } from './petanque-match';

const T = Number(process.argv.slice(2).filter((a) => /^\d+$/.test(a)).pop() ?? 20);
const PLAYER = 0.62;

interface LevelStat {
	level: number;
	skill: number;
	target: number;
	surface: string;
	win: number; // %
	stars: number; // mean, wins and losses together
	conceded: number; // mean points given up, wins only
}

function probe(level: number): LevelStat {
	const cfg = petanqueLevels.config(level);
	let wins = 0, stars = 0, conceded: number[] = [];
	for (let k = 0; k < T; k++) {
		// One pitch per level — a level IS a fixed terrain. Only the grain counter moves, which is
		// what separates two attempts at the same level in the shipped game.
		const r = playMatch({
			seed: cfg.seed, grain: (cfg.seed ^ (0x9e3779b9 * (k + 1))) >>> 0,
			skills: [PLAYER, cfg.skill], target: cfg.target, surface: cfg.surface, amp: cfg.amp,
		});
		const won = r.winner === 0;
		if (won) { wins++; conceded.push(r.scores[1]); }
		stars += petanqueLevels.stars(level, { score: cfg.target - r.scores[1], won, stat: r.scores[1] });
	}
	return {
		level, skill: cfg.skill, target: cfg.target, surface: cfg.surface,
		win: (wins / T) * 100, stars: stars / T,
		conceded: conceded.length ? mean(conceded) : NaN,
	};
}

/* G0 · why the top of the ladder died. Measurement F already said it: a match to 13 is ~13
   independent menes, so a per-mene edge compounds towards certainty. Skill and match LENGTH are
   therefore not two independent knobs — length multiplies whatever skill already gives. This sweep
   separates them, over several pitches so one unlucky terrain cannot carry the reading. */
function why(): void {
	// 24 pitches could not separate 0.90 from 0.95 — a 10-point gap needs a few hundred matches,
	// not a couple of dozen. Default N is sized so a cell is worth reading.
	const SEEDS = Array.from({ length: T }, (_, i) => (Math.imul(i + 1, 2654435761) ^ 0x5bf03635) >>> 0);
	console.log(`G0 · player ${PLAYER} win rate vs match length — ${SEEDS.length} pitches a cell\n`);
	console.log('opponent    to 5   to 7   to 9   to 11');
	for (const sk of [0.62, 0.80, 0.95]) {
		const cells = [5, 7, 9, 11].map((target) => {
			const w = SEEDS.filter((seed, i) => playMatch({
				seed, grain: (seed ^ (0x9e3779b9 * (i + 1))) >>> 0,
				skills: [PLAYER, sk], target, surface: 'gravier-gros', amp: 0.05,
			}).winner === 0).length;
			return `${((w / SEEDS.length) * 100).toFixed(0).padStart(4)} %`;
		});
		console.log(`${sk.toFixed(2)}     ${cells.join('  ')}`);
	}
}

if (process.argv.includes('why')) { why(); process.exit(0); }

/* A level ships ONE pitch, so "is this level unwinnable?" and "was that 1-in-20 noise?" are
   different questions and 20 tries cannot tell them apart. Re-probing the same fixed pitch at high
   T answers the first one. Usage: npx tsx scripts/petanque-levels.ts only 190,196,200 [tries] */
const onlyAt = process.argv.indexOf('only');
if (onlyAt >= 0) {
	console.log(`G1 · suspicious levels, same fixed pitch, ${T} tries\n`);
	console.log('level   skill   to   win     mean ★');
	for (const l of process.argv[onlyAt + 1].split(',').map(Number)) {
		const r = probe(l);
		console.log(`${String(r.level).padStart(5)}   ${r.skill.toFixed(2)}   ${String(r.target).padStart(2)}  ${r.win.toFixed(0).padStart(4)} %   ${r.stars.toFixed(2).padStart(6)}`);
	}
	process.exit(0);
}

const BANDS: [string, number[], string][] = [
	['1-10', [1, 3, 5, 8, 10], '88-97'],
	['40-50', [40, 43, 46, 50], '60-72'],
	['90-100', [90, 93, 96, 100], '30-45'],
	['190-200', [190, 193, 196, 200], '15-28'],
];

const t0 = Date.now();
console.log(`G · levels against a fixed ${PLAYER} player — ${T} tries a level\n`);
console.log('level   skill   to   surface        win     mean ★   conceded on a win');

const bandWin: number[] = [];
const all: LevelStat[] = [];
for (const [tag, levels, band] of BANDS) {
	const rows = levels.map(probe);
	all.push(...rows);
	for (const r of rows)
		console.log(
			`${String(r.level).padStart(5)}   ${r.skill.toFixed(2)}   ${String(r.target).padStart(2)}   ${r.surface.padEnd(13)}` +
			` ${r.win.toFixed(0).padStart(4)} %   ${r.stars.toFixed(2).padStart(6)}   ${Number.isNaN(r.conceded) ? '   —' : r.conceded.toFixed(1).padStart(4)}`,
		);
	const w = mean(rows.map((r) => r.win));
	bandWin.push(w);
	console.log(`  band ${tag.padEnd(8)} ${w.toFixed(0).padStart(4)} %   (target ${band})\n`);
}

const worst = all.reduce((a, b) => (b.win < a.win ? b : a));
console.log(`monotone across bands: ${bandWin.every((w, i) => i === 0 || w <= bandWin[i - 1]) ? 'yes' : 'NO'}` +
	`   (${bandWin.map((w) => `${w.toFixed(0)} %`).join(' -> ')})`);
console.log(`floor: level ${worst.level} at ${worst.win.toFixed(0)} %  (gate >= 8 %)`);
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
