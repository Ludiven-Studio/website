/**
 * MÖLKKY — the rules, pure. One pin down scores its number; two or more score how many fell.
 * First to exactly 50 wins; going over drops the player back to 25. Three misses in a row put a
 * player out, and the last one standing wins.
 */

export const TARGET = 50;
export const BUST_TO = 25;
export const MISSES_OUT = 3;

export interface Player {
	name: string;
	score: number;
	misses: number; // misses in a row
	out: boolean;
}

export interface MolkkyState {
	players: Player[];
	turn: number;
	winner: number | null;
	/** What the last throw did, for the HUD. */
	last: { player: number; points: number; fallen: number[]; bust: boolean; out: boolean } | null;
}

export function initMolkky(names: string[], first = 0): MolkkyState {
	return { players: names.map((name) => ({ name, score: 0, misses: 0, out: false })), turn: first, winner: null, last: null };
}

/** Points for a throw that knocked down these pins (numbers 1..12). */
export const pointsFor = (fallen: number[]): number => (fallen.length === 1 ? fallen[0] : fallen.length);

/** Next player still in, after `from`. */
function nextIn(players: Player[], from: number): number {
	for (let k = 1; k <= players.length; k++) {
		const i = (from + k) % players.length;
		if (!players[i].out) return i;
	}
	return from;
}

export function applyThrow(state: MolkkyState, fallen: number[]): MolkkyState {
	if (state.winner !== null) return state;
	const players = state.players.map((p) => ({ ...p }));
	const me = players[state.turn];
	const points = pointsFor(fallen);
	let bust = false;
	if (points === 0) {
		me.misses++;
		if (me.misses >= MISSES_OUT) me.out = true;
	} else {
		me.misses = 0;
		me.score += points;
		if (me.score > TARGET) { me.score = BUST_TO; bust = true; }
	}
	let winner: number | null = me.score === TARGET ? state.turn : null;
	const still = players.filter((p) => !p.out);
	if (winner === null && still.length === 1) winner = players.indexOf(still[0]);
	return {
		players,
		turn: winner === null ? nextIn(players, state.turn) : state.turn,
		winner,
		last: { player: state.turn, points, fallen: [...fallen].sort((a, b) => a - b), bust, out: me.out },
	};
}

/** What a throw worth `points` would do to the thrower's score: -1 for a bust. */
export const scoreAfter = (score: number, points: number): number => (score + points > TARGET ? -1 : score + points);
