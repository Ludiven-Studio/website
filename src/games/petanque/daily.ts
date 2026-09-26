// The daily is the FFPJP "tir de precision" course, not a match: 12 stations, one boule each,
// graded 5/3/1/0 for a maximum of 60. Every player gets the same course for the day.
//
// The grading thresholds are the ones measurement E settled (scripts/petanque-tune.ts): a target
// that travels more than CLEARED counts as knocked out, and the shooter taking its place within
// TOOK_PLACE is the carreau. E3 also checked the 1 is reachable at all — a full-power tir always
// clears the target, so without a weak shot landing short the grade would be dead copy.

import { BOULE_R, G, makeBoule, place, type Boule } from './engine';
import { hashN, type SurfaceId, type Terrain } from './terrain';
import { EDGE } from './rules13';
import { encodePacked } from '../../lib/scoreFormat';

export const STATIONS = 12;
export const MAX_DAILY_SCORE = STATIONS * 5;

export const CLEARED = 1.0; // m the target must travel to count as knocked out
export const TOOK_PLACE = 0.5; // m the shooter may end from where the target stood

/** Where the thrower stands. Matches the opening circle of a match, so the lane reads the same. */
export const COURSE_CIRCLE = { x: 2, y: EDGE + 0.5 };

/* The speed that LANDS the boule on the target — a tir au fer, which is the shot this course asks
   for. The boule leaves the hand at ground level, so the carry is the plain ballistic range and
   inverts in closed form. Landing on the target instead of short of it is what keeps the course
   about aim: a shot that lands short has to roll in, and then the SURFACE scores it, not the
   player — measured, that alone split the daily 27 pts on clay against 6 on coarse gravel. */
export const carrySpeed = (range: number, elev: number): number => Math.sqrt((range * G) / Math.sin(2 * elev));

export type StationKind = 'nue' | 'masque' | 'serree';

export interface Station {
	dist: number; // m from the circle to the target
	kind: StationKind;
	offset: number; // lateral shift of the target off the lane centre, m
}

export interface DailyCourse {
	seed: number;
	surface: SurfaceId;
	amp: number;
	stations: Station[];
}

export type Grade = 0 | 1 | 3 | 5;

/* The distance ladder is FIXED across days: it is the difficulty spine, and a leaderboard that
   compares Monday to Tuesday needs it to mean the same thing. Only the arrangement and the lateral
   offsets move with the date. */
const LADDER = [6, 6.5, 7, 7, 7.5, 8, 8, 8.5, 9, 9, 9.5, 10];

/* The ground DOES rotate, because measured it is fair: the same field scored 46.0 / 46.2 / 47.4 on
   the three hard surfaces, a 1.4 pt spread against a 9 pt spread between players. Sand is the one
   exception and it is excluded — there a knocked target dies where it lands, never travels CLEARED,
   and the whole field collapses to 11/60. */
const COURSE_SURFACES: SurfaceId[] = ['terre-battue', 'gravier-fin', 'gravier-gros'];

/* Every kind must be able to score a 5, or the announced max of 60 is a lie. Two candidates were
   measured and cut: an `appui` boule behind the target caps its travel, so it could never beat 1;
   and a lone jack is 58x lighter than the boule, so the shooter ploughs through and rolls on —
   0 carreaux in 9. Both were honest physics, which is exactly why neither could be tuned out. */
const KINDS: StationKind[] = ['nue', 'masque', 'serree'];

/** Seeded shuffle, pure and counter-free so two machines build the same course. */
function shuffled<T>(items: T[], seed: number): T[] {
	const out = items.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(hashN(i, seed) * (i + 1)) % (i + 1);
		const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
	}
	return out;
}

/** The course for a seed. Same seed, same course, on any machine. */
export function makeCourse(seed: number): DailyCourse {
	// One of each kind per group, shuffled inside the group: every day serves the same MIX of
	// stations, so no date can deal twelve bare targets and inflate the whole board.
	const stations: Station[] = [];
	for (let g = 0; g < STATIONS / KINDS.length; g++) {
		const kinds = shuffled(KINDS, seed + g * 7919);
		for (let k = 0; k < kinds.length; k++) {
			const i = g * KINDS.length + k;
			stations.push({
				dist: LADDER[i],
				kind: kinds[k],
				offset: (hashN(i * 13 + 1, seed) - 0.5) * 0.9, // +- 45 cm off the lane
			});
		}
	}
	const surface = COURSE_SURFACES[Math.floor(hashN(3, seed) * COURSE_SURFACES.length) % COURSE_SURFACES.length];
	return { seed, surface, amp: 0.015 + hashN(4, seed) * 0.02, stations };
}

/* An event's course: ONE course for the whole run-up to the tournament, so every attempt on the
   board is the same test. Ten boules, from a bare target at 6 m to a guarded one at 10 m: the
   order is the difficulty, not a shuffle. Same three kinds as the daily, which all can score 5. */
const EVENT_LADDER: { dist: number; kind: StationKind }[] = [
	{ dist: 6, kind: 'nue' },
	{ dist: 6.5, kind: 'nue' },
	{ dist: 7, kind: 'masque' },
	{ dist: 7.5, kind: 'nue' },
	{ dist: 7.5, kind: 'serree' },
	{ dist: 8, kind: 'masque' },
	{ dist: 8.5, kind: 'serree' },
	{ dist: 9, kind: 'masque' },
	{ dist: 9.5, kind: 'serree' },
	{ dist: 10, kind: 'masque' },
];

/** The course of an event, from its id. Fixed ground: a leaderboard over weeks needs one test. */
export function makeEventCourse(seed: number): DailyCourse {
	const stations = EVENT_LADDER.map((s, i) => ({ ...s, offset: (hashN(i * 13 + 1, seed) - 0.5) * 0.6 }));
	return { seed, surface: 'gravier-fin', amp: 0.02, stations };
}

/** Best possible points on a course: a carreau at every station. */
export const courseMax = (c: DailyCourse): number => c.stations.length * 5;

/** The boules a station puts on the pitch: the target first, then whatever guards it. */
export function stationBodies(st: Station, t: Terrain): Boule[] {
	const tx = COURSE_CIRCLE.x + st.offset;
	const ty = COURSE_CIRCLE.y + st.dist;
	const out = [place(t, makeBoule(tx, ty, 1))];

	// Both guards punish a wide shot without ever standing behind the target — nothing may block
	// the way OUT, or the station cannot score above 1. A masque sits in front, off to one side, so
	// the line has to be threaded; serrée flanks the target, so lateral error hits the wrong boule.
	if (st.kind === 'masque') out.push(place(t, makeBoule(tx - 0.16, ty - 0.55, 1)));
	if (st.kind === 'serree') {
		out.push(place(t, makeBoule(tx - BOULE_R * 3.4, ty, 1)));
		out.push(place(t, makeBoule(tx + BOULE_R * 3.4, ty, 1)));
	}
	return out;
}

export interface ShotOutcome {
	hit: boolean; // the shooter touched the target
	moved: number; // m the target travelled
	rollOn: number; // m from the target's original spot to where the shooter stopped
	targetLive: boolean;
	shooterLive: boolean;
}

/** 0 missed · 1 touched but in place · 3 cleared · 5 carreau. The FFPJP bareme. */
export function gradeShot(o: ShotOutcome): Grade {
	if (!o.hit) return 0;
	if (!o.targetLive || o.moved > CLEARED) return o.shooterLive && o.rollOn < TOOK_PLACE ? 5 : 3;
	return 1;
}

/* The leaderboard value: points in the high digits, chrono as the tiebreak. Stored as
   (MAX - points) so that "more points" still sorts ascending, like reussite — the board reads the
   raw int with no decode. The ceiling is hard and good players reach it, which is the whole reason
   there is a tiebreak at all: measured, 5 to 8 players in 200 finish on a perfect 60. */
export const encodeDaily = (points: number, ms: number, max = MAX_DAILY_SCORE): number =>
	encodePacked(10_000_000, [max - points, Math.min(9_999_999, Math.round(ms / 10))]);

export const GRADE_LABEL: Record<Grade, string> = {
	5: 'Carreau !',
	3: 'Cible sortie',
	1: 'Touchée, en place',
	0: 'Manqué',
};

export const KIND_LABEL: Record<StationKind, string> = {
	nue: 'Boule nue',
	masque: 'Boule masquée',
	serree: 'Boule serrée',
};
