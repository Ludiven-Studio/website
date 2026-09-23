/**
 * PETANQUE — the rule book. Pure functions, no physics and no UI: the game settles the boules with
 * the engine, then hands the resting positions here. Every entry point returns a NEW state, so it
 * unit-tests trivially and doubles as the reducer for the online match.
 *
 * The rule that shapes the whole game: after every boule, the side that does NOT hold the point
 * plays again. That is what lets a player throw three in a row, and it is why the AI has to
 * choose between pointing and shooting rather than just alternating.
 */

import { PITCH_L, PITCH_W, inPitch } from './terrain';

export type Side = 0 | 1;
export type Phase = 'throw-jack' | 'place-jack' | 'play' | 'end-done' | 'match-done';

export const MIN_JACK = 6; // m from the circle
export const MAX_JACK = 10;
export const EDGE = 0.5; // m the jack must keep from the pitch limits
export const BOULES_PER_SIDE = 3;
const TIE_EPS = 0.001; // 1 mm — below this the umpire calls it equal

/** Anything with a position and an owner. `Boule` from the engine fits as-is. */
export interface Played {
	x: number;
	y: number;
	side: number; // 0 | 1, -1 for the jack
	live: boolean;
}

export interface Match13 {
	scores: [number, number];
	target: number; // 13, or 7 for a short game
	phase: Phase;
	turn: Side;
	jackThrower: Side; // throws the jack and plays the first boule of the end
	circle: { x: number; y: number };
	dir: 1 | -1; // ends alternate direction, otherwise the circle walks off the pitch
	left: [number, number]; // boules still in hand
	endNo: number;
	winner: Side | null;
	lastEvent: string | null;
}

export const other = (s: Side): Side => (s === 0 ? 1 : 0);

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => {
	const dx = a.x - b.x, dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Keep the circle where a legal throw still fits on the pitch. Real play moves it back too.
 * The margin matters: clamping to exactly MIN_JACK leaves a single legal distance, so a hand
 * placed jack would have nowhere to go.
 */
const ROOM = 1.5;
export function nextCircle(jackY: number, dir: 1 | -1): number {
	const lo = dir === 1 ? EDGE : EDGE + MIN_JACK + ROOM;
	const hi = dir === 1 ? PITCH_L - EDGE - MIN_JACK - ROOM : PITCH_L - EDGE;
	return jackY < lo ? lo : jackY > hi ? hi : jackY;
}

export function initMatch13(target = 13, firstThrower: Side = 0): Match13 {
	return {
		scores: [0, 0],
		target,
		phase: 'throw-jack',
		turn: firstThrower,
		jackThrower: firstThrower,
		circle: { x: 2, y: EDGE + 0.5 },
		dir: 1,
		left: [BOULES_PER_SIDE, BOULES_PER_SIDE],
		endNo: 1,
		winner: null,
		lastEvent: null,
	};
}

export type JackVerdict = 'ok' | 'short' | 'long' | 'out';

export function jackCheck(circle: { x: number; y: number }, jack: { x: number; y: number }): JackVerdict {
	if (!inPitch(jack.x, jack.y)) return 'out';
	if (jack.y < EDGE || jack.y > PITCH_L - EDGE) return 'out';
	const d = dist(circle, jack);
	if (d < MIN_JACK) return 'short';
	if (d > MAX_JACK) return 'long';
	return 'ok';
}

/** Who holds the point. `null` = nothing on the ground, `'tie'` = equal to the millimetre. */
export function pointHolder(bs: Played[], jack: Played): Side | null | 'tie' {
	const best: [number, number] = [Infinity, Infinity];
	for (const b of bs) {
		if (!b.live || (b.side !== 0 && b.side !== 1)) continue;
		const d = dist(b, jack);
		if (d < best[b.side]) best[b.side] = d;
	}
	if (best[0] === Infinity && best[1] === Infinity) return null;
	if (Math.abs(best[0] - best[1]) < TIE_EPS) return 'tie';
	return best[0] < best[1] ? 0 : 1;
}

/** Points for the end: 1 per boule closer than the opponent's best. `side: null` = null end. */
export function endScore(bs: Played[], jack: Played): { side: Side | null; points: number } {
	const ds: [number[], number[]] = [[], []];
	for (const b of bs) {
		if (!b.live || (b.side !== 0 && b.side !== 1)) continue;
		ds[b.side].push(dist(b, jack));
	}
	ds[0].sort((a, b) => a - b);
	ds[1].sort((a, b) => a - b);
	const b0 = ds[0][0] ?? Infinity, b1 = ds[1][0] ?? Infinity;
	if (b0 === Infinity && b1 === Infinity) return { side: null, points: 0 };
	if (Math.abs(b0 - b1) < TIE_EPS) return { side: null, points: 0 };
	const side: Side = b0 < b1 ? 0 : 1;
	const rival = side === 0 ? b1 : b0;
	return { side, points: ds[side].filter((d) => d < rival).length };
}

/**
 * Who plays next, `state.turn` being the side that just played. The side without the point, if it
 * still has boules; otherwise the other side plays out its hand; `null` once both are empty. On a
 * tie the side that just played replays. With no live boule on the ground (the one just thrown
 * went out), nobody holds the point, so the turn passes to the other side.
 */
export function whoPlays(state: Match13, bs: Played[], jack: Played): Side | null {
	const h = pointHolder(bs, jack);
	const want: Side = h === null ? other(state.turn) : h === 'tie' ? state.turn : other(h);
	if (state.left[want] > 0) return want;
	const o = other(want);
	return state.left[o] > 0 ? o : null;
}

/** The jack has landed. Valid → play; invalid → the opponent places it by hand. */
export function applyJack(state: Match13, jack: { x: number; y: number }): Match13 {
	const v = jackCheck(state.circle, jack);
	if (v === 'ok') return { ...state, phase: 'play', turn: state.jackThrower, lastEvent: null };
	return {
		...state,
		phase: 'place-jack',
		turn: other(state.jackThrower),
		lastEvent: v === 'short' ? 'Bouchon trop court — à l’adversaire de le placer'
			: v === 'long' ? 'Bouchon trop long — à l’adversaire de le placer'
			: 'Bouchon hors du terrain — à l’adversaire de le placer',
	};
}

/** The opponent has placed the jack by hand. The thrower still plays the first boule. */
export const applyPlacedJack = (state: Match13): Match13 =>
	({ ...state, phase: 'play', turn: state.jackThrower, lastEvent: null });

/**
 * A dead jack. Null if both sides still hold boules, or neither does; otherwise the only side still
 * holding boules scores one point per boule left in hand.
 */
export function deadJackScore(left: readonly [number, number]): { side: Side | null; points: number } {
	if (left[0] > 0 && left[1] === 0) return { side: 0, points: left[0] };
	if (left[1] > 0 && left[0] === 0) return { side: 1, points: left[1] };
	return { side: null, points: 0 };
}

/** One boule has come to rest. Decides who plays next, or closes the end. */
export function applySettled(state: Match13, bs: Played[], jack: Played): Match13 {
	const left: [number, number] = [state.left[0], state.left[1]];
	left[state.turn] = Math.max(0, left[state.turn] - 1);
	const next: Match13 = { ...state, left, lastEvent: null };

	if (!jack.live) {
		const d = deadJackScore(left);
		return {
			...next, phase: 'end-done',
			lastEvent: d.side === null ? 'Bouchon sorti — mène nulle'
				: `Bouchon sorti — ${d.points} point${d.points > 1 ? 's' : ''} pour ${d.side === 0 ? 'toi' : 'l’adversaire'}`,
		};
	}

	const t = whoPlays(next, bs, jack);
	if (t === null) return { ...next, phase: 'end-done' };
	return { ...next, turn: t };
}

/** Close the end: award the points, set up the next one, or end the match. */
export function finishEnd(state: Match13, bs: Played[], jack: Played): Match13 {
	const res = jack.live ? endScore(bs, jack) : deadJackScore(state.left);
	const scores: [number, number] = [state.scores[0], state.scores[1]];
	if (res.side !== null) scores[res.side] += res.points;

	if (res.side !== null && scores[res.side] >= state.target) {
		return {
			...state, scores, phase: 'match-done', winner: res.side,
			lastEvent: `${res.points} point${res.points > 1 ? 's' : ''} — partie gagnée`,
		};
	}

	// A null end is replayed by the same thrower, from the same circle, in the same direction.
	const won = res.side;
	const thrower: Side = won === null ? state.jackThrower : won;
	const dir: 1 | -1 = won === null ? state.dir : state.dir === 1 ? -1 : 1;
	// A dead jack lies past a line, so the circle is pulled back inside the pitch.
	const circle = won === null ? state.circle
		: { x: Math.max(EDGE, Math.min(PITCH_W - EDGE, jack.x)), y: nextCircle(jack.y, dir) };

	return {
		...state,
		scores,
		phase: 'throw-jack',
		turn: thrower,
		jackThrower: thrower,
		circle,
		dir,
		left: [BOULES_PER_SIDE, BOULES_PER_SIDE],
		endNo: state.endNo + 1,
		lastEvent: won === null ? 'Mène nulle — on rejoue' : `${res.points} point${res.points > 1 ? 's' : ''} pour ${won === 0 ? 'toi' : 'l’adversaire'}`,
	};
}
