/* Measures the boule physics. Never tune these constants by eye — read this table.
   A  roll after landing, per surface, on a dead-level pitch
   B  lateral drift at rest, per relief amplitude  (the most important number here)
   C  how much of B the pebbles are responsible for
   D  repeatability of one identical throw
   E  carreau rate against the miss offset

   Usage: npx tsx scripts/petanque-tune.ts */
import { makeTerrain, hashN, SURFACES, SURFACE_IDS, type SurfaceId, type Terrain } from '../src/games/petanque/terrain';
import { makeBoule, place, throwVelocity, settle, stepSim, isSettled, speed2, BOULE_R, type Sim } from '../src/games/petanque/engine';

const START_X = 2, START_Y = 0.6;
const ELEV = (30 * Math.PI) / 180;

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) * (v - m)))); };

/** One throw straight down the lane. Returns carry, roll after the first bounce, drift. */
function shot(t: Terrain, speed: number, rng: number): { carry: number; roll: number; drift: number; total: number } {
	const b = makeBoule(START_X, START_Y, 0);
	const v = throwVelocity(0, 1, speed, ELEV);
	b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
	b.rolling = false;
	const s: Sim = { t, bs: [b], rng };
	const dt = 1 / 120;
	let landX = b.x, landY = b.y, carry = -1;
	for (let k = 0; k < 4000; k++) {
		const r = stepSim(s, dt);
		if (carry < 0 && r.landed) { landX = b.x; landY = b.y; carry = b.y - START_Y; }
		if (isSettled(s.bs)) break;
	}
	if (carry < 0) carry = b.y - START_Y;
	const roll = Math.sqrt((b.y - landY) * (b.y - landY) + (b.x - landX) * (b.x - landX));
	return { carry, roll, drift: b.x - START_X, total: b.y - START_Y };
}

console.log('A · roll after landing — level pitch, elev 30 deg, 6.5 m/s\n');
console.log('surface         carry   roll    total');
for (const id of SURFACE_IDS) {
	const rolls: number[] = [], carries: number[] = [], totals: number[] = [];
	for (let s = 0; s < 120; s++) {
		const t = makeTerrain(s * 40503, SURFACES[id], 0.004, { slope: 0 });
		const r = shot(t, 6.5, s);
		carries.push(r.carry); rolls.push(r.roll); totals.push(r.total);
	}
	console.log(`${id.padEnd(14)} ${mean(carries).toFixed(2)} m  ${mean(rolls).toFixed(2)}±${sd(rolls).toFixed(2)}  ${mean(totals).toFixed(2)} m`);
}

// Gate: reaching a 7.5 m jack must cost clearly different power on sand and on clay.
console.log('\n   power needed for a 7.5 m carry+roll:');
const need: Record<string, number> = {};
for (const id of SURFACE_IDS) {
	let lo = 4, hi = 14;
	for (let it = 0; it < 22; it++) {
		const mid = (lo + hi) / 2;
		let d = 0;
		for (let s = 0; s < 24; s++) d += shot(makeTerrain(s * 40503, SURFACES[id], 0.004, { slope: 0 }), mid, s).total;
		if (d / 24 < 7.5) lo = mid; else hi = mid;
	}
	need[id] = (lo + hi) / 2;
	console.log(`   ${id.padEnd(14)} ${need[id].toFixed(2)} m/s`);
}
const spread = (need.sable - need['terre-battue']) / need['terre-battue'];
console.log(`   sable vs terre battue: ${(spread * 100).toFixed(1)} %  (gate >= 25 %, fail < 15 %)`);

// Pebbles are switched OFF here on purpose: mixed in, their scatter swamps the relief and the
// amplitude reads as a dead knob. This column must answer "does the ground shape deviate a boule".
console.log('\nB · lateral drift at rest, RELIEF ONLY — 300 seeds, straight down the lane\n');
console.log('relief          median   p90');
const AMPS: [string, number][] = [['facile', 0.015], ['difficile', 0.050], ['expert', 0.075]];
const driftOf = (amp: number, id: SurfaceId, noPebbles: boolean, slope?: number): number[] => {
	const d: number[] = [];
	for (let s = 0; s < 300; s++) {
		const t = makeTerrain(s * 2246822519, SURFACES[id], amp, { noPebbles, slope });
		d.push(Math.abs(shot(t, 7.6, s).drift));
	}
	return d;
};
for (const [label, amp] of AMPS) {
	const d = driftOf(amp, 'gravier-fin', true);
	const flat = driftOf(amp, 'gravier-fin', true, 0); // control: relief with no faux plat at all
	console.log(
		`${label.padEnd(14)} ${(q(d, 0.5) * 100).toFixed(1)} cm  ${(q(d, 0.9) * 100).toFixed(1)} cm` +
		`   | no slope: ${(q(flat, 0.5) * 100).toFixed(1)} / ${(q(flat, 0.9) * 100).toFixed(1)} cm`,
	);
}

console.log('\nC · pebble contribution (median drift, with vs without)\n');
for (const id of ['terre-battue', 'gravier-gros'] as SurfaceId[]) {
	const on = q(driftOf(0.040, id, false), 0.5);
	const off = q(driftOf(0.040, id, true), 0.5);
	console.log(`${id.padEnd(14)} ${(off * 100).toFixed(1)} -> ${(on * 100).toFixed(1)} cm  (${(((on - off) / off) * 100).toFixed(0)} %)`);
}

// Clay is the readable surface and coarse gravel the treacherous one, so this is the pair that
// has to separate. (Sand looks unpredictable but is not: the boule dies where it lands.)
console.log('\nD · repeatability — the same throw, 100 grain counters\n');
for (const id of ['terre-battue', 'gravier-gros', 'sable'] as SurfaceId[]) {
	const t = makeTerrain(99, SURFACES[id], 0.025);
	const xs: number[] = [], ys: number[] = [];
	for (let k = 0; k < 100; k++) {
		const b = makeBoule(START_X, START_Y, 0);
		const v = throwVelocity(0, 1, 7.6, ELEV);
		b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.rolling = false;
		const s: Sim = { t, bs: [b], rng: k * 977 };
		settle(s, undefined, 30);
		xs.push(b.x); ys.push(b.y);
	}
	const spreadM = Math.sqrt(sd(xs) * sd(xs) + sd(ys) * sd(ys));
	console.log(`${id.padEnd(14)} sigma ${(spreadM * 100).toFixed(1)} cm`);
}

/* E · the carreau. Nothing in the engine special-cases it: two equal masses meeting head-on at a
   high restitution is a Newton's cradle, the shooter stops and the target leaves.

   E1 is a CURVE, not a rate. Offset -> residual speed is deterministic (grain noise on clay is
   1.6 cm, far too small to blur it), so quoting it as a "% of carreaux" would dress a clean
   function up as a probability. The check is against the textbook: residual = v*sin(theta) with
   sin(theta) = offset / 2r. If those two columns drift apart, the impulse is wrong.

   E2 is the rate, and it comes from AIM ERROR — the only real source of spread in a match. This
   is also the number the AI skill ladder and the daily barème are built on. */
const TARGET_Y = 8;
const CLEARED = 1.0; // m the target must travel to count as knocked out
const TOOK_PLACE = 0.5; // m the shooter may end from where the target stood

/** 0 missed · 1 touched but in place · 3 cleared, shooter rolled on · 5 carreau. FFPJP barème. */
function tir(offset: number, speed: number, rng: number, seed: number): { grade: 0 | 1 | 3 | 5; residual: number; rollOn: number } {
	const t = makeTerrain(seed, SURFACES['terre-battue'], 0.004, { slope: 0 });
	const target = place(t, makeBoule(START_X, TARGET_Y, 1));
	const shooter = place(t, makeBoule(START_X + offset, TARGET_Y - 0.5, 0));
	shooter.vy = speed;
	const s: Sim = { t, bs: [shooter, target], rng };
	let residual = -1;
	for (let k = 0; k < 4000; k++) {
		const r = stepSim(s, 1 / 120);
		if (residual < 0 && r.hitBoule) residual = speed2(shooter);
		if (isSettled(s.bs)) break;
	}
	const moved = Math.sqrt((target.x - START_X) ** 2 + (target.y - TARGET_Y) ** 2);
	const rollOn = Math.sqrt((shooter.x - START_X) ** 2 + (shooter.y - TARGET_Y) ** 2);
	const grade = residual < 0 ? 0 : !target.live || moved > CLEARED ? (shooter.live && rollOn < TOOK_PLACE ? 5 : 3) : 1;
	return { grade, residual: residual < 0 ? 0 : residual, rollOn };
}

console.log('\nE1 · impulse transfer vs the textbook — 9 m/s head-on\n');
console.log('offset   residual   v*sin(theta)   shooter rolls on');
for (const off of [0, 0.005, 0.010, 0.020, 0.035, 0.060]) {
	const r = tir(off, 9, 0, 4242);
	const theory = 9 * Math.sin(Math.asin(Math.min(1, off / (2 * BOULE_R))));
	console.log(`${(off * 1000).toFixed(0).padStart(3)} mm   ${r.residual.toFixed(2)} m/s    ${theory.toFixed(2)} m/s        ${r.rollOn.toFixed(2)} m`);
}
console.log(`   (no contact at all past ${(2 * BOULE_R * 1000).toFixed(0)} mm)`);

// Deterministic normal, so the table is reproducible. Fine in a script — the engine ban is on engine.ts.
function gauss(n: number, seed: number): number {
	const u1 = Math.max(1e-9, hashN(n * 2, seed)), u2 = hashN(n * 2 + 1, seed);
	return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

console.log('\nE2 · outcome mix under aim error — 400 shots each, 9 m/s\n');
console.log('aim sigma   carreau(5)   cleared(3)   in place(1)   missed(0)   mean pts');
for (const sigma of [0.005, 0.010, 0.020, 0.040, 0.070]) {
	const g = [0, 0, 0, 0, 0, 0];
	let pts = 0;
	for (let k = 0; k < 400; k++) {
		const r = tir(gauss(k, 7717) * sigma, 9 + gauss(k, 31337) * 0.3, k * 977, 4242 + k);
		g[r.grade]++;
		pts += r.grade;
	}
	const pc = (n: number) => `${((n / 400) * 100).toFixed(0).padStart(3)} %`;
	console.log(`${(sigma * 1000).toFixed(0).padStart(4)} mm     ${pc(g[5])}        ${pc(g[3])}       ${pc(g[1])}        ${pc(g[0])}      ${(pts / 400).toFixed(2)}`);
}

// The daily scores 5/3/1/0. A full-power tir always clears the target, so the 1 ("touched, stayed
// put") only exists if a weak shot can reach it — otherwise a third of the barème is dead copy.
console.log('\nE3 · is the 1-point grade reachable? centred hit, speed sweep\n');
console.log('speed     target moves   grade');
for (const sp of [1.5, 2.5, 3.5, 5, 7, 9]) {
	const t = makeTerrain(4242, SURFACES['terre-battue'], 0.004, { slope: 0 });
	const target = place(t, makeBoule(START_X, TARGET_Y, 1));
	const shooter = place(t, makeBoule(START_X, TARGET_Y - 0.5, 0));
	shooter.vy = sp;
	const s: Sim = { t, bs: [shooter, target], rng: 0 };
	settle(s, undefined, 30);
	const moved = Math.sqrt((target.x - START_X) ** 2 + (target.y - TARGET_Y) ** 2);
	console.log(`${sp.toFixed(1)} m/s   ${moved.toFixed(2)} m        ${tir(0, sp, 0, 4242).grade}`);
}
