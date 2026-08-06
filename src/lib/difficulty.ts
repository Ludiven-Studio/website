// The "Expert" difficulty tier is content, not decoration: it only shows up once the
// game's Expert pack is bought. Difficulty records still declare the key unconditionally
// — these helpers are what hide it from the pills. See [[currency-cocottes]].

import { hasUnlock } from './wallet';

export const EXPERT_KEY = 'expert';

/**
 * Games with no Expert tier — their pack only unlocks levels 101-200, and the shop labels
 * them "niveaux seuls". All of these have no difficulty selector at all, except `2048`:
 * its selector is board size and it bottoms out at 3×3, since a 2×2 board jams after ~7
 * moves and never passes tile 16. Kept in sync by difficulty.spec.test.ts.
 */
export const NO_EXPERT = new Set([
	'2048', 'accords', 'alchimie', 'foot', 'luge', 'mine', 'pong', 'reussite', 'solitaire',
]);

/** Difficulty keys to show, in declaration order, minus `expert` until the pack is bought. */
export function diffKeys<T extends object>(diffs: T, gameId: string): (keyof T & string)[] {
	const keys = Object.keys(diffs) as (keyof T & string)[];
	return hasUnlock(gameId) ? keys : keys.filter((k) => k !== EXPERT_KEY);
}

/** Same, for games that iterate a hand-written order instead of the record. */
export function withExpert<K extends string>(order: readonly K[], gameId: string): (K | 'expert')[] {
	return hasUnlock(gameId) ? [...order, EXPERT_KEY] : [...order];
}
