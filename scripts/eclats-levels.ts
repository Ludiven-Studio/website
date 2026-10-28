// Pick each Éclats level's board: of CANDIDATES seeds per level, the one the bot clears in the
// number of swipes nearest the level's target, so the climb is smooth rather than a run of lucky
// and unlucky draws. Then the level's swipe limit: a typical player (the bot, a share of its swipes
// random, breathing when it can) plays the board PLAYERS times, and the limit is the count it wins
// within WIN of the time (WIN_HARD on a hard level); levels 1-FREE_LEVELS have none (0). Writes the
// plans of src/games/eclats/picks.ts, the website's (SITE), the app's (APP) and the app's night run
// (NIGHT: the same boards with frozen chests and Perle's breath, measured the same way); rerun it after
// any change to the engine, the bot or a level's board (the engine test fails until you do).
// Usage: node node_modules/esbuild/bin/esbuild scripts/eclats-levels.ts --bundle --platform=node --format=esm --outfile=$TEMP/eclats-levels.mjs && node $TEMP/eclats-levels.mjs [site] [app] [night]
// A plan left out of the arguments keeps its table; none named redoes both.
import { writeFileSync } from 'node:fs';
import { bestMove, playBot } from '../src/games/eclats/bot';
import { DIRS, breathe, canBreathe, cloneState, createGame, hash2, play, type EclatsCfg } from '../src/games/eclats/engine';
import { APP, FREE_LEVELS, SITE, appNightBoard, isHard, pickSeed, type LevelSet } from '../src/games/eclats/levels';
import { PICKS_APP, PICKS_APP_NIGHT, PICKS_SITE, type Pick } from '../src/games/eclats/picks';
import { mulberry32 } from '../src/games/prng';

const CANDIDATES = 16;
const PLAYERS = 60;
const CASUAL = 0.6; // share of the typical player's swipes played at random: between the bot (≈ the best) and a random swiper
const WIN = 0.8;
const WIN_HARD = 0.65; // a hard level, one in ten from 30: a bit harder, not a wall

/** The typical player's swipes to win, or Infinity when the board fills up first. */
function typical(cfg: EclatsCfg, seed: number): number {
	const s = createGame(cfg);
	const rng = mulberry32(seed);
	while (s.status === 'playing' && s.moves < 80) {
		if (canBreathe(s)) {
			breathe(s);
			continue;
		}
		let d = bestMove(s);
		if (!d) break;
		if (rng() < CASUAL) {
			const ok = DIRS.filter((x) => play(cloneState(s), x));
			d = ok[Math.floor(rng() * ok.length)];
		}
		play(s, d);
	}
	return s.status === 'won' ? s.moves : Infinity;
}

/** The swipes the typical player wins within `share` of the time; never under the bot's count + 2. */
function limitFor(level: number, cfg: EclatsCfg, par: number): number {
	const runs = Array.from({ length: PLAYERS }, (_, i) => typical(cfg, hash2(level, i))).sort((a, b) => a - b);
	const at = runs[Math.ceil((isHard(level) ? WIN_HARD : WIN) * PLAYERS) - 1];
	// A board that beats the player that often already: the limit must not bite on top.
	const wins = runs.filter((x) => isFinite(x));
	return Math.max(par + 2, isFinite(at) ? at : Math.max(...wins));
}

/** Every level of a plan, the Expert pack included. */
function pickAll(name: string, set: LevelSet): Pick[] {
	const levels = 2 * set.count;
	const picks: Pick[] = [];
	let off = 0;
	for (let l = 1; l <= levels; l++) {
		const b = set.boardFor(l);
		const want = set.targetPar(l);
		let best: [number, number] | null = null;
		for (let k = 0; k < CANDIDATES; k++) {
			const run = playBot({ ...b, seed: pickSeed(b.seed, k) });
			if (!run.won) continue;
			if (!best || Math.abs(run.moves - want) < Math.abs(best[1] - want)) best = [k, run.moves];
			if (best[1] === want) break;
		}
		if (!best) throw new Error(`${name} level ${l}: the bot clears none of its ${CANDIDATES} boards`);
		off += Math.abs(best[1] - want);
		picks.push([...best, l <= FREE_LEVELS ? 0 : limitFor(l, { ...b, seed: pickSeed(b.seed, best[0]) }, best[1])]);
		if (l % 50 === 0) console.log(`${name} level ${l}…`);
	}
	console.log(`${name}: ${levels} levels picked, mean distance to target ${(off / levels).toFixed(2)} swipes`);
	return picks;
}

/**
 * The app's night run: each day board again, harder. Perle's gauge fills at NIGHT_FIRE_FULL; the bot and the typical
 * player breathe as soon as it is full (frozen chests do not slide, a board left without its breath fills up). The
 * limit is the count the typical player wins within NIGHT_WIN of the time (NIGHT_WIN_HARD on a hard level), over more
 * runs than by day. The day's deal when that works, else the deal of the same level nearest the day's count plus
 * NIGHT_EXTRA: a deal the bot cannot clear, or that beats the typical player more often than the share, is skipped.
 */
const NIGHT_PLAYERS = 200; // 60 swung from 43 % to 87 % between neighbouring levels
const NIGHT_WIN = 0.6;
const NIGHT_WIN_HARD = 0.5;
const NIGHT_EXTRA = 6; // the bot's mean extra swipes at night, to pick a replacement deal near the day's climb

/** The night limit of a deal, or null when the board beats the typical player more often than the share allows. */
function nightLimitFor(level: number, cfg: EclatsCfg, par: number): number | null {
	if (level <= FREE_LEVELS) return 0;
	const runs = Array.from({ length: NIGHT_PLAYERS }, (_, i) => typical(cfg, hash2(level, i))).sort((a, b) => a - b);
	const at = runs[Math.ceil((isHard(level) ? NIGHT_WIN_HARD : NIGHT_WIN) * NIGHT_PLAYERS) - 1];
	return isFinite(at) ? Math.max(par + 2, at) : null;
}

function pickNight(): Pick[] {
	const picks: Pick[] = [];
	for (let l = 1; l <= APP.count; l++) {
		const [dayK, dayPar] = APP.picks[l - 1];
		const deal = (k: number): Pick | null => {
			const board = appNightBoard(l, k);
			const run = playBot(board, { breathe: true });
			if (!run.won) return null;
			const limit = nightLimitFor(l, board, run.moves);
			return limit === null ? null : [k, run.moves, limit];
		};
		let pick = deal(dayK);
		if (!pick) {
			for (let k = 0; k < CANDIDATES; k++) {
				const p = k === dayK ? null : deal(k);
				if (p && (!pick || Math.abs(p[1] - dayPar - NIGHT_EXTRA) < Math.abs(pick[1] - dayPar - NIGHT_EXTRA))) pick = p;
			}
		}
		if (!pick) throw new Error(`night level ${l}: none of its ${CANDIDATES} deals works at night`);
		if (pick[0] !== dayK) console.log(`night level ${l}: deal ${pick[0]} instead of the day's ${dayK}`);
		picks.push(pick);
		if (l % 25 === 0) console.log(`night level ${l}…`);
	}
	return picks;
}

const only = process.argv.slice(2);
const redo = (name: string): boolean => only.length === 0 || only.includes(name);
const site = redo('site') ? pickAll('site', SITE) : PICKS_SITE;
const app = redo('app') ? pickAll('app', APP) : PICKS_APP;
const night = redo('night') ? pickNight() : PICKS_APP_NIGHT;
const table = (picks: Pick[]): string => {
	const rows: string[] = [];
	for (let i = 0; i < picks.length; i += 10) rows.push('\t' + picks.slice(i, i + 10).map(([k, p, m]) => `[${k}, ${p}, ${m}]`).join(', ') + ',');
	return rows.join('\n');
};
writeFileSync(
	'src/games/eclats/picks.ts',
	`// Written by scripts/eclats-levels.ts — do not edit. Per level: [candidate seed, bot swipes, swipe limit].
export type Pick = [number, number, number];

/** The website's levels 1-${2 * SITE.count} (levels.ts SITE). */
export const PICKS_SITE: Pick[] = [
${table(site)}
];

/** The Unity app's levels 1-${2 * APP.count} (levels.ts APP). */
export const PICKS_APP: Pick[] = [
${table(app)}
];

/** The app's night run, levels 1-${APP.count}: the day's seed, the bot's swipes and the limit with frozen chests. */
export const PICKS_APP_NIGHT: Pick[] = [
${table(night)}
];
`,
);
