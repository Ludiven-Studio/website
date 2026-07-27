// Prints the PAR table for src/games/tectonique/levels.ts: a near-optimal move count per
// level, from a greedy solver that BFSes to the cheapest next crystal and repeats. Rerun
// after any change to the generator or the level ramp, and paste the output over PAR.
//   npx tsx scripts/tectonique-par.ts

import { mulberry32 } from '../src/games/prng';
import { encodeBoard, generateDetailed, heroLines, isWon, slack, slide, type Board } from '../src/games/tectonique/engine';
import { tectoniqueLevels, TECTONIQUE_BANDS } from '../src/games/tectonique/levels';

/** Shortest run of moves that eats one more crystal. */
function toNextCrystal(start: Board, cap: number): { board: Board; moves: number } | null {
	const seen = new Set<string>([encodeBoard(start)]);
	let front = [start];
	for (let depth = 1; front.length; depth++) {
		const next: Board[] = [];
		for (const b of front) {
			for (const [axis, index] of heroLines(b)) {
				const sl = slack(b, axis, index);
				for (const d of [-1, 1] as const) {
					if (d < 0 ? !(sl.min < 0) : !(sl.max > 0)) continue;
					const r = slide(b, axis, index, d);
					if (r.eaten.length) return { board: r.board, moves: depth };
					const key = encodeBoard(r.board);
					if (seen.has(key)) continue;
					seen.add(key);
					next.push(r.board);
				}
			}
		}
		if (seen.size > cap) return null;
		front = next;
	}
	return null;
}

function solve(start: Board, cap: number): number | null {
	let b = start;
	let total = 0;
	while (!isWon(b)) {
		const step = toNextCrystal(b, cap);
		if (!step) return null;
		total += step.moves;
		b = step.board;
	}
	return total;
}

const pars: number[] = [];
let worst = 0;
for (let l = 1; l <= tectoniqueLevels.count; l++) {
	const cfg = tectoniqueLevels.config(l);
	const { board, walk } = generateDetailed(mulberry32(cfg.seed), cfg);
	const par = solve(board, 400_000);
	// The recorded walk always clears the level, so it bounds the rare solver give-up.
	pars.push(par ?? walk.length);
	if (par == null) console.error(`level ${l}: solver gave up, using the walk (${walk.length})`);
	worst = Math.max(worst, par ?? walk.length);
	if (l % 10 === 0) console.error(`…level ${l} (par ${pars[l - 1]})`);
}

console.log('const PAR: number[] = [');
for (let i = 0; i < pars.length; i += 20) console.log('\t' + pars.slice(i, i + 20).join(', ') + ',');
console.log('];');
console.error(`\nmax par ${worst}`);

// The free/daily bands, for a sanity read on the ramp.
for (const [i, p] of TECTONIQUE_BANDS.entries()) {
	const xs: number[] = [];
	for (let s = 0; s < 12; s++) {
		const k = solve(generateDetailed(mulberry32(1000 + s), p).board, 400_000);
		if (k != null) xs.push(k);
	}
	xs.sort((a, b) => a - b);
	console.error(`band ${i}: par min ${xs[0]} · med ${xs[xs.length >> 1]} · max ${xs[xs.length - 1]} (${xs.length}/12 solved)`);
}
