/* The match driver shared by measurements F (scripts/petanque-ai.ts) and G
   (scripts/petanque-levels.ts). Everything runs on the shipped engine and the shipped rule book —
   no parallel model. No top-level output, so importing this costs nothing. */
import { makeTerrain, SURFACES, type SurfaceId } from '../src/games/petanque/terrain';
import { place, settle, type Sim, type Boule } from '../src/games/petanque/engine';
import {
	initMatch13, applyJack, applyPlacedJack, applySettled, finishEnd, jackCheck,
	type Match13, type Side,
} from '../src/games/petanque/rules13';
import { planThrow, planJack, launch } from '../src/games/petanque/ai';

export interface MatchResult {
	winner: Side;
	scores: [number, number];
	ends: number;
	points: number; // awarded over the match, both sides
	handPlaced: number; // jacks the thrower botched
	nullEnds: number; // scored nothing: tie for closest, or the jack knocked out
	shots: number; // throws the AI chose to shoot rather than point
	throws: number;
}

export interface MatchOpts {
	seed: number; // the pitch: relief and pebbles
	skills: [number, number];
	target: number;
	surface: SurfaceId;
	amp: number;
	/** Grain counter start. Split from `seed` so repeated tries can share one pitch. */
	grain?: number;
}

/** One match, start to `target`. */
export function playMatch(o: MatchOpts): MatchResult {
	const t = makeTerrain(o.seed, SURFACES[o.surface], o.amp);
	let state: Match13 = initMatch13(o.target, 0);
	const res: MatchResult = { winner: 0, scores: [0, 0], ends: 0, points: 0, handPlaced: 0, nullEnds: 0, shots: 0, throws: 0 };
	let rng = 1;
	let grain = o.grain ?? o.seed;

	for (let end = 0; end < 60 && state.phase !== 'match-done'; end++) {
		const s: Sim = { t, bs: [], rng: grain };

		const jp = planJack(s, state, o.skills[state.jackThrower], rng++);
		const jack: Boule = launch(s, state.circle, 0, jp, true);
		s.bs.push(jack);
		settle(s, undefined, 30);
		state = applyJack(state, jack);

		if (state.phase === 'place-jack') {
			res.handPlaced++;
			jack.x = state.circle.x;
			jack.y = state.circle.y + state.dir * 7;
			jack.live = true;
			place(t, jack);
			if (jackCheck(state.circle, jack) !== 'ok')
				throw new Error(`hand-placed jack is illegal: circle ${state.circle.y.toFixed(2)} jack ${jack.y.toFixed(2)}`);
			state = applyPlacedJack(state);
		}

		while (state.phase === 'play') {
			const side = state.turn;
			const th = planThrow(s, jack, state, side, o.skills[side], rng++);
			if (th.intent === 'shoot') res.shots++;
			res.throws++;
			s.bs.push(launch(s, state.circle, side, th));
			settle(s, undefined, 30);
			state = applySettled(state, s.bs, jack);
		}

		const before = state.scores[0] + state.scores[1];
		state = finishEnd(state, s.bs, jack);
		const got = state.scores[0] + state.scores[1] - before;
		res.points += got;
		if (got === 0) res.nullEnds++;
		res.ends++;
		grain = s.rng;
	}
	res.scores = [state.scores[0], state.scores[1]];
	res.winner = state.scores[0] > state.scores[1] ? 0 : 1;
	return res;
}

export const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
