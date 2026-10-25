// Pick each Éclats level's board: of CANDIDATES seeds per level, the one the bot clears in the
// number of swipes nearest the level's target, so the climb is smooth rather than a run of lucky
// and unlucky draws. Writes src/games/eclats/picks.ts; rerun it after any change to the engine,
// the bot or a level's board (the engine test fails until you do).
// Usage: npx tsx scripts/eclats-levels.ts
import { writeFileSync } from 'node:fs';
import { playBot } from '../src/games/eclats/bot';
import { boardFor, pickSeed, targetPar } from '../src/games/eclats/levels';

const CANDIDATES = 16;
const LEVELS = 200;
const picks: [number, number][] = [];
let off = 0;
for (let l = 1; l <= LEVELS; l++) {
	const b = boardFor(l);
	const want = targetPar(l);
	let best: [number, number] | null = null;
	for (let k = 0; k < CANDIDATES; k++) {
		const run = playBot({ ...b, seed: pickSeed(b.seed, k) });
		if (!run.won) continue;
		if (!best || Math.abs(run.moves - want) < Math.abs(best[1] - want)) best = [k, run.moves];
		if (best[1] === want) break;
	}
	if (!best) throw new Error(`level ${l}: the bot clears none of its ${CANDIDATES} boards`);
	off += Math.abs(best[1] - want);
	picks.push(best);
}
const rows: string[] = [];
for (let i = 0; i < picks.length; i += 10) rows.push('\t' + picks.slice(i, i + 10).map(([k, p]) => `[${k}, ${p}]`).join(', ') + ',');
writeFileSync(
	'src/games/eclats/picks.ts',
	`// Written by scripts/eclats-levels.ts — do not edit. Per level 1-${LEVELS}: [candidate seed, bot swipes].\nexport const PICKS: [number, number][] = [\n${rows.join('\n')}\n];\n`,
);
console.log(`${LEVELS} levels picked, mean distance to target ${(off / LEVELS).toFixed(2)} swipes`);
