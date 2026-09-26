/* Measurement H — the shooting course.

   Two different questions, and the plan only named the first:
     H1 · spread WITHIN a day. 0-60 in steps of 1 sounds like plenty, but grades are 5/3/1/0, so a
          strong field lands on few distinct totals. If the top of the board ties heavily the daily
          needs the `packed` format (points + time) golf and billard already use.
     H2 · fairness ACROSS days. Every day is a different course, and a streak or a record compares
          Monday to Tuesday. If the same player swings wildly by date, the leaderboard is measuring
          the draw, not the player.

   The shooter aims with the REAL solver (ai.ts solveSpeed, which replays the engine), then a
   gaussian aim error in the same units measurement E2 used: a lateral sigma at the target.

   Usage: npx tsx scripts/petanque-daily.ts [players] */
import { makeTerrain, SURFACES, SURFACE_IDS, hashN, type SurfaceId } from '../src/games/petanque/terrain';
import { settle, stepSim, throwVelocity, type Sim, type Boule, type Impact } from '../src/games/petanque/engine';
import { shootSpeed, SHOOT_ELEV, launch } from '../src/games/petanque/ai';
import { carrySpeed, makeCourse, stationBodies, gradeShot, COURSE_CIRCLE, STATIONS, MAX_DAILY_SCORE, type DailyCourse, type Grade } from '../src/games/petanque/daily';

/* `fer` = aim to LAND on the target (tir au fer) instead of reusing the AI's match tir, which is
   really a rafle: it carries ~6 m whatever the range, so at 8 m it lands short and has to roll in —
   and whether it survives that roll is decided by the SURFACE, not by the player. */
const FER = process.argv.includes('fer');

/* `solve` = the shooter adjusts power to the GROUND, the way the player does. carrySpeed assumes a
   flat pitch; the pitch has a 0.5-1.5 % false flat, which over 8 m is ~8 cm of height and, on a
   0.36 rad descent, ~21 cm of long/short — more than a boule diameter, and biased the same way all
   day. So a day-to-day swing could equally mean an unfair course or a shooter that cannot aim.
   The player has an engine-accurate arc preview, so this control tells the two apart. */
const SOLVE = process.argv.includes('solve');
let lastCarry = 0;
let SURF_OVERRIDE: SurfaceId | null = null;

/** Binary search on speed so the boule first TOUCHES DOWN at `want`. Replays the real engine. */
function solveCarry(s: Sim, ux: number, uy: number, want: number): number {
	const carryOf = (sp: number): number => {
		const c: Sim = { t: s.t, bs: [], rng: 0 };
		const b = launch(c, COURSE_CIRCLE, 0, throwVelocity(ux, uy, sp, SHOOT_ELEV));
		c.bs.push(b);
		const imp: Impact[] = [];
		for (let k = 0; k < 900 && imp.length === 0; k++) stepSim(c, 1 / 120, imp);
		const g = imp.find((i) => i.kind === 'ground');
		return g ? Math.sqrt((g.x - COURSE_CIRCLE.x) ** 2 + (g.y - COURSE_CIRCLE.y) ** 2) : 0;
	};
	let lo = 4, hi = 14;
	for (let i = 0; i < 22; i++) {
		const mid = (lo + hi) / 2;
		if (carryOf(mid) < want) lo = mid; else hi = mid;
	}
	return (lo + hi) / 2;
}

// Last numeric arg, so it survives the mode words. `why 40` used to parse N as NaN.
const N = Number(process.argv.slice(2).filter((a) => /^\d+$/.test(a)).pop() ?? 200);
const HIT = 0.01; // m — the target counts as touched once it has actually shifted

/** The day's course. Only the arrangement and the offsets move with the date. */
function courseForDay(day: number): DailyCourse {
	return makeCourse((Math.imul(day + 1, 2654435761) ^ 0xc2b2ae35) >>> 0);
}

/** One station, one boule. `sigma` is the lateral aim error at the target, in metres. */
function shoot(course: DailyCourse, idx: number, sigma: number, rng: number): Grade {
	const st = course.stations[idx];
	const t = makeTerrain(course.seed, SURFACES[SURF_OVERRIDE ?? course.surface], course.amp);
	const bodies = stationBodies(st, t);
	const target = bodies[0];
	const sx = target.x, sy = target.y; // where the target stood before the shot

	const dx = sx - COURSE_CIRCLE.x, dy = sy - COURSE_CIRCLE.y;
	const want = Math.sqrt(dx * dx + dy * dy);
	const s: Sim = { t, bs: bodies, rng };

	// Aim error as an angle, so a far station is genuinely harder for the same hand.
	const g = (hashN(rng * 3, 77) + hashN(rng * 3 + 1, 77) + hashN(rng * 3 + 2, 77) - 1.5) / 0.5;
	const a = Math.atan2(dy, dx) + (g * sigma) / want;
	const ux = Math.cos(a), uy = Math.sin(a);

	const speed = SOLVE ? solveCarry(s, ux, uy, want) : FER ? carrySpeed(want, SHOOT_ELEV) : shootSpeed(want);
	const shooter: Boule = launch(s, COURSE_CIRCLE, 0, throwVelocity(ux, uy, speed, SHOOT_ELEV));
	s.bs.push(shooter);
	const imp: Impact[] = [];
	settle(s, imp, 30);
	// Where the boule first touched down, so "landed short and died" is distinguishable from "missed".
	const first = imp.find((i) => i.kind === 'ground');
	lastCarry = first ? Math.sqrt((first.x - COURSE_CIRCLE.x) ** 2 + (first.y - COURSE_CIRCLE.y) ** 2) : want;

	const moved = Math.sqrt((target.x - sx) ** 2 + (target.y - sy) ** 2);
	const rollOn = Math.sqrt((shooter.x - sx) ** 2 + (shooter.y - sy) ** 2);
	return gradeShot({
		hit: moved > HIT || !target.live, moved, rollOn,
		targetLive: target.live, shooterLive: shooter.live,
	});
}

const round = (course: DailyCourse, sigma: number, rng: number): number => {
	let total = 0;
	for (let i = 0; i < STATIONS; i++) total += shoot(course, i, sigma, rng + i * 101);
	return total;
};

/* H0 · the control. A PERFECT aim, so anything short of 5 is the shot model failing to arrive, not
   the hand shaking. Without this the field mean is unreadable: a low score could equally mean the
   course is hard or the shooter never reaches the target. Broken out by kind, because a masque and
   a bouchon fail for opposite reasons. */
if (process.argv.includes('why')) {
	console.log(`H0 · zero aim error (${FER ? 'tir au fer' : "the AI's match tir"}) — every miss here is the instrument\n`);
	console.log('kind      dist    carry    grades over 3 days (5/4/3/1/0)     mean pts');
	const tally: Record<string, number[]> = {};
	const dist: Record<string, number[]> = {};
	const carry: Record<string, number[]> = {};
	for (const day of [0, 1, 2]) {
		const c = courseForDay(day);
		for (let i = 0; i < STATIONS; i++) {
			const st = c.stations[i];
			const g = shoot(c, i, 0, day * 7919 + i * 101);
			(tally[st.kind] ??= [0, 0, 0, 0, 0, 0])[g]++;
			(dist[st.kind] ??= []).push(st.dist);
			(carry[st.kind] ??= []).push(lastCarry);
		}
	}
	const avg = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
	for (const k of ['nue', 'masque', 'serree']) {
		const g = tally[k] ?? [0, 0, 0, 0, 0, 0];
		const n = g[5] + g[4] + g[3] + g[1] + g[0];
		const pts = (g[5] * 5 + g[4] * 4 + g[3] * 3 + g[1]) / Math.max(1, n);
		console.log(
			`${k.padEnd(9)} ${avg(dist[k] ?? [0]).toFixed(1)} m  ${avg(carry[k] ?? [0]).toFixed(1)} m   ` +
			`${String(g[5]).padStart(3)} / ${String(g[4]).padStart(3)} / ${String(g[3]).padStart(3)} / ${String(g[1]).padStart(3)} / ${String(g[0]).padStart(3)}   (n=${n})` +
			`      ${pts.toFixed(2)}`,
		);
	}
	console.log('\ngate: carry must match dist. Carry well short = the boule rolls in and the SURFACE scores it.\n');
}

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]): number => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));

/* A real field is not one skill. These are the E2 sigmas: 10 mm is a very good shooter, 70 mm a
   beginner. The mix is a guess at a leaderboard's shape — the tie structure is what matters. */
const FIELD: [number, number][] = [[0.010, 0.10], [0.020, 0.20], [0.040, 0.40], [0.070, 0.30]];
const sigmaFor = (k: number): number => {
	let acc = 0;
	const u = (k % 100) / 100;
	for (const [s, w] of FIELD) { acc += w; if (u < acc) return s; }
	return FIELD[FIELD.length - 1][0];
};

/* H3 · does the surface still decide the score, once the shooter can aim? Pinning the surface was
   decided off the BROKEN shooter's 34-on-clay / 5-on-gravel, so that call has to be re-earned:
   a tir au fer never touches the ground before the target, but the target still has to TRAVEL
   CLEARED to score 3, and friction is what carries it. */
if (process.argv.includes('surf')) {
	console.log('H3 · same field, same courses, one surface at a time\n');
	console.log('surface         mean    sd     max');
	for (const id of SURFACE_IDS) {
		SURF_OVERRIDE = id;
		const all = [0, 1, 2].flatMap((day) => {
			const c = courseForDay(day);
			return Array.from({ length: N }, (_, k) => round(c, sigmaFor(k), k * 7919 + 13));
		});
		console.log(`${id.padEnd(14)} ${mean(all).toFixed(1).padStart(5)}  ${sd(all).toFixed(1).padStart(4)}  ${String(Math.max(...all)).padStart(6)}`);
	}
	SURF_OVERRIDE = null;
	console.log('\ngate: a surface spread comparable to the within-day sd means the date would score the player.\n');
}

const t0 = Date.now();
console.log(`H1 · spread within one day — ${N} players on the same course\n`);
console.log('day   surface        mean    sd    max   distinct   top score   players on it');
for (const day of [0, 1, 2]) {
	const c = courseForDay(day);
	const totals = Array.from({ length: N }, (_, k) => round(c, sigmaFor(k), k * 7919 + 13));
	const top = Math.max(...totals);
	const onTop = totals.filter((x) => x === top).length;
	console.log(
		`${String(day).padStart(3)}   ${c.surface.padEnd(13)} ${mean(totals).toFixed(1).padStart(5)}  ${sd(totals).toFixed(1).padStart(4)}` +
		`   ${String(top).padStart(3)}   ${String(new Set(totals).size).padStart(8)}   ${String(top).padStart(9)}   ${String(onTop).padStart(13)}`,
	);
}

console.log(`\nH2 · fairness across days — one 20 mm shooter, 365 courses\n`);
const perDay = Array.from({ length: 365 }, (_, d) => round(courseForDay(d), 0.020, d * 31 + 5));
console.log(`mean ${mean(perDay).toFixed(1)} / ${MAX_DAILY_SCORE}   sd ${sd(perDay).toFixed(1)}   min ${Math.min(...perDay)}   max ${Math.max(...perDay)}`);
console.log(`gate: a day-to-day sd near or above the within-day sd means the date decides the score`);

console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
