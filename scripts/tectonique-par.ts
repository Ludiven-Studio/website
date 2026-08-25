// Prints the SALT and PAR tables for src/games/tectonique/levels.ts. A coup is a belt, not a cell:
// once a line is in hand it runs any distance, either way, for free. So the solver works in whole
// belts — for every level it deals a few candidate grids, measures each with a greedy search that
// BFSes to the cheapest next crystal and repeats, and keeps the one landing closest to the ramp we
// want. SALT is which grid, PAR is what it costs. Rerun after any change to the generator, the
// scoring or the ramp below, and paste both tables over.
//   npx tsx scripts/tectonique-par.ts

import { mulberry32 } from '../src/games/prng';
import { countCrystals, encodeBoard, generateDetailed, heroIndex, heroLines, isWon, slack, slide, type Axis, type Board } from '../src/games/tectonique/engine';
import { levelSeed, tectoniqueLevels, TECTONIQUE_BANDS } from '../src/games/tectonique/levels';

/** How far the hero still is from the closest crystal, to rank states when the search is beamed. */
function heroDist(b: Board): number {
	const h = heroIndex(b);
	const hr = Math.floor(h / b.n);
	const hc = h % b.n;
	let best = Infinity;
	for (let i = 0; i < b.crystals.length; i++) {
		if (!b.crystals[i]) continue;
		best = Math.min(best, Math.abs(Math.floor(i / b.n) - hr) + Math.abs((i % b.n) - hc));
	}
	return best;
}

const other = (a: Axis): Axis => (a === 'row' ? 'col' : 'row');

/**
 * Every board one belt of driving can reach. The hero slides ALONG the line she pushes, so she
 * never leaves it: the line index stays the same all the way, and this closure is the whole of
 * what a single coup buys — including driving back the other way.
 */
function afterBelt(start: Board, axis: Axis): Board[] {
	const out = new Map<string, Board>();
	const home = encodeBoard(start);
	let front = [start];
	while (front.length) {
		const next: Board[] = [];
		for (const b of front) {
			const line = heroLines(b).find(([a]) => a === axis);
			if (!line) continue;
			const sl = slack(b, axis, line[1]);
			for (const d of [-1, 1] as const) {
				if (d < 0 ? !(sl.min < 0) : !(sl.max > 0)) continue;
				const nb = slide(b, axis, line[1], d).board;
				const key = encodeBoard(nb);
				if (key === home || out.has(key)) continue;
				out.set(key, nb);
				next.push(nb);
			}
		}
		front = next;
	}
	return [...out.values()];
}

/** A board plus the belt that was last driven: driving that one again is free, so it is state. */
interface Step {
	board: Board;
	axis: Axis | null;
}

/**
 * Fewest coups that eat one more crystal. `held` is the belt already in hand, whose closure comes
 * for free. Each depth keeps at most `width` states, ranked on `heroDist` — so the search is a beam,
 * and `pruned` says whether it ever had to drop anything. It never did means the answer is exact.
 */
function toNextCrystal(start: Board, held: Axis | null, width: number, maxDepth: number): { step: Step; coups: number; pruned: boolean } | null {
	const left = countCrystals(start);
	const seen = new Set<string>([encodeBoard(start)]);
	let front: Step[] = [{ board: start, axis: held }];
	let pruned = false;
	// The belt still in hand costs nothing, so its whole closure sits at depth 0 with the start.
	if (held) {
		for (const b of afterBelt(start, held)) {
			if (countCrystals(b) < left) return { step: { board: b, axis: held }, coups: 0, pruned };
			seen.add(encodeBoard(b));
			front.push({ board: b, axis: held });
		}
	}
	for (let depth = 1; front.length && depth <= maxDepth; depth++) {
		const next = new Map<string, Step>();
		for (const s of front) {
			// Same axis again would land inside the closure we already have: only a switch is new.
			for (const axis of s.axis ? [other(s.axis)] : (['row', 'col'] as Axis[])) {
				for (const b of afterBelt(s.board, axis)) {
					if (countCrystals(b) < left) return { step: { board: b, axis }, coups: depth, pruned };
					const key = encodeBoard(b);
					if (!seen.has(key)) next.set(key, { board: b, axis });
				}
			}
		}
		let kept = [...next];
		if (kept.length > width) {
			kept.sort((a, b) => heroDist(a[1].board) - heroDist(b[1].board));
			kept = kept.slice(0, width);
			pruned = true;
		}
		// Only what the beam keeps is closed: marking a pruned state would wall the search in.
		for (const [key] of kept) seen.add(key);
		front = kept.map(([, s]) => s);
	}
	return null;
}

/** Greedy: hop to the cheapest next crystal and repeat, carrying the belt in hand across the hops. */
function solve(start: Board, width: number, maxDepth: number): { par: number; beamed: boolean } | null {
	let s: Step = { board: start, axis: null };
	let total = 0;
	let beamed = false;
	while (!isWon(s.board)) {
		const hop = toNextCrystal(s.board, s.axis, width, maxDepth);
		if (!hop) return null;
		total += hop.coups;
		beamed = beamed || hop.pruned;
		s = hop.step;
	}
	return { par: total, beamed };
}

// One belt of driving reaches a dozen boards, so the branching is wide and the depth short: past a
// few coups a full sweep explodes. The beam is generous enough that the early grids never touch it.
// A hop takes two or three coups in practice, so a hop still hunting after 25 is on a grid the
// greedy cannot crack — cut it there rather than let the beam grind through 60 useless depths.
const BEAM = 4000;
const bestEffort = (b: Board): { par: number | null; beamed: boolean } => solve(b, BEAM, 25) ?? { par: null, beamed: true };

/** The ramp we want to feel: the ladder is judged on this, not on the raw luck of one seed.
    Gentler than the old five-piece ramp — crates and pillars only cap what a grid can cost. */
const wanted = (l: number): number => Math.round(5 + (l - 1) * 0.25);
const VARIANTS = 10;

const pars: number[] = [];
const salts: number[] = [];
let worst = 0;
let beams = 0;
let clock = Date.now();
for (let l = 1; l <= tectoniqueLevels.count; l++) {
	const cfg = tectoniqueLevels.config(l);
	// The same ramp deals wildly uneven grids from one seed to the next, and an easy level in the
	// middle of hard ones is what breaks the ladder. So measure a handful and keep the fitting one.
	let pick: { salt: number; par: number; err: number; beamed: boolean } | null = null;
	let fallback = 0;
	for (let salt = 0; salt < VARIANTS; salt++) {
		const { board, walk } = generateDetailed(mulberry32(levelSeed(l, salt)), cfg);
		fallback = fallback || walk.length;
		// The generator drops crystals on the walk it recorded; when the walk is too short it
		// silently ships fewer than asked, which quietly makes the level easier.
		if (countCrystals(board) < cfg.crystals) continue;
		const { par, beamed } = bestEffort(board);
		if (par == null) continue;
		const err = Math.abs(par - wanted(l));
		if (!pick || err < pick.err) pick = { salt, par, err, beamed };
	}
	if (!pick) console.error(`level ${l}: no variant solved, using the walk (${fallback})`);
	else if (pick.beamed) beams++;
	pars.push(pick?.par ?? fallback);
	salts.push(pick?.salt ?? 0);
	worst = Math.max(worst, pars[l - 1]);
	console.error(`…level ${l} (par ${pars[l - 1]}, wanted ${wanted(l)}, ${Math.round((Date.now() - clock) / 1000)}s)`);
	clock = Date.now();
}

const table = (name: string, xs: number[]): void => {
	console.log(`const ${name}: number[] = [`);
	for (let i = 0; i < xs.length; i += 20) console.log('\t' + xs.slice(i, i + 20).join(', ') + ',');
	console.log('];');
};
table('SALT', salts);
table('PAR', pars);
const off = pars.reduce((s, p, i) => s + Math.abs(p - wanted(i + 1)), 0) / pars.length;
console.error(`\nmax par ${worst} · off the wanted ramp by ${off.toFixed(1)} on average · ${beams} level(s) beamed`);

// The free/daily bands, for a sanity read on the ramp.
for (const [i, p] of TECTONIQUE_BANDS.entries()) {
	const xs: number[] = [];
	for (let s = 0; s < 12; s++) {
		const k = bestEffort(generateDetailed(mulberry32(1000 + s), p).board).par;
		if (k != null) xs.push(k);
	}
	xs.sort((a, b) => a - b);
	console.error(`band ${i}: par min ${xs[0]} · med ${xs[xs.length >> 1]} · max ${xs[xs.length - 1]} (${xs.length}/12 solved)`);
}
