/* Measurement J — the power bar. The HUD maps the drag onto a SPEED, but what the player reads is
   a DISTANCE, and distance grows with the square of speed. So a linear bar spends its bottom half
   on throws that fall at the player's feet and its top third on throws that leave the pitch.

   J2 is the number that decides it: how much of the thumb's travel actually lands the boule in the
   6-10 m window the whole game is played in.

   Usage: npx tsx scripts/petanque-power.ts */
import { makeTerrain, SURFACES, type SurfaceId } from '../src/games/petanque/terrain';
import { place, settle, makeBoule, throwVelocity, type Sim } from '../src/games/petanque/engine';
import { elevationForBoard } from '../src/games/petanque/render3d';

const FROM = { x: 2, y: 1 };
const SEEDS = 10;
const ROOM = 15 - FROM.y;

interface Curve {
	tag: string;
	speed: (p: number) => number;
}

/* `sq` interpolates the SQUARE of the speed, which is what distance is proportional to — so the
   distance ends up roughly linear in the bar. `lin` is what the island ships today. */
const lin = (lo: number, hi: number): Curve =>
	({ tag: `lin ${lo}-${hi}`, speed: (p) => lo + (hi - lo) * p });
const sq = (lo: number, hi: number): Curve =>
	({ tag: `sq  ${lo}-${hi}`, speed: (p) => Math.sqrt(lo * lo + (hi * hi - lo * lo) * p) });

/* Read off the launch board now, not off the camera pitch: the top of the board is a plomb, which
   is steeper than anything the old grazing camera could ask for. */
const LOFTS: [string, number][] = [
	['plomb', elevationForBoard(1)],
	['portee', elevationForBoard(0.62)],
	['demi', elevationForBoard(0.32)],
	['roulette', elevationForBoard(0)],
];

/** Where a throw at this speed and loft comes to rest. 99 means it left the pitch. */
function reach(id: SurfaceId, speed: number, elev: number): number {
	let sum = 0, n = 0;
	for (let k = 0; k < SEEDS; k++) {
		const s: Sim = { t: makeTerrain(k * 7919 + 13, SURFACES[id], 0.03), bs: [], rng: k };
		const b = place(s.t, makeBoule(FROM.x, FROM.y, 0));
		const v = throwVelocity(0, 1, speed, elev);
		b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.rolling = false;
		s.bs.push(b);
		settle(s, undefined, 30);
		if (!b.live) continue;
		sum += Math.sqrt((b.x - FROM.x) ** 2 + (b.y - FROM.y) ** 2);
		n++;
	}
	return n >= SEEDS / 2 ? sum / n : 99;
}

const CURVES = [lin(3.2, 13.5), sq(3.2, 13.5), sq(2.8, 12.0), sq(2.8, 11.0), sq(3.0, 10.5)];

console.log('J1 · resting distance (m) by bar position — clay, relief 3 cm\n');
console.log('curve            loft        ' + [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1].map((p) => p.toFixed(1).padStart(6)).join(''));
for (const c of CURVES) {
	for (const [ln, e] of LOFTS) {
		const row = [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1]
			.map((p) => { const d = reach('terre-battue', c.speed(p), e); return (d > 90 ? 'out' : d.toFixed(1)).padStart(6); })
			.join('');
		console.log(`${c.tag.padEnd(16)} ${ln.padEnd(10)}  ${row}`);
	}
	console.log('');
}

/* The gate. A window narrower than ~30 % of the bar is not thumb-playable, and a bar whose top
   third is unreachable ground reads as a broken control. */
console.log('J2 · share of the bar landing in the 6-10 m window, and share thrown off the pitch\n');
console.log('curve            ' + LOFTS.map(([n]) => `${n} win/out`.padStart(20)).join(''));
for (const c of CURVES) {
	const cells = LOFTS.map(([, e]) => {
		let win = 0, out = 0;
		for (let i = 0; i <= 40; i++) {
			const d = reach('terre-battue', c.speed(i / 40), e);
			if (d > 90 || d > ROOM) out++;
			else if (d >= 6 && d <= 10) win++;
		}
		return `${Math.round((win / 41) * 100)}% / ${Math.round((out / 41) * 100)}%`.padStart(20);
	});
	console.log(`${c.tag.padEnd(16)} ${cells.join('')}`);
}

/* A tir has to ARRIVE fast, on the fly, ON the target. The flattest loft cannot do it — at 10 deg
   a 10 m/s throw only carries 3.5 m before it lands, so it arrives as a spent roll. The tir lives
   at MID loft: the arc that puts the donnee ON the boule. So the question is not "how fast at full
   power flat", it is "over the whole loft range, what is the best arrival speed on a target 8 m
   out". E1 measured the carreau transfer from that impact speed. */
console.log('\nJ3 · arrival on a target 8 m out, full bar — speed, and whether it is still in the air\n');
console.log('curve            ' + [0, 0.25, 0.5, 0.75, 1].map((k) => `board ${k}`.padStart(15)).join(''));
for (const c of CURVES) {
	const cells = [0, 0.25, 0.5, 0.75, 1].map((k) => {
		const s: Sim = { t: makeTerrain(13, SURFACES['terre-battue'], 0.03), bs: [], rng: 0 };
		const b = place(s.t, makeBoule(FROM.x, FROM.y, 0));
		const v = throwVelocity(0, 1, c.speed(1), elevationForBoard(k));
		b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.rolling = false;
		const sim: Sim = { t: s.t, bs: [b], rng: 0 };
		let air = false, sp = 0;
		for (let i = 0; i < 600 && b.live; i++) {
			if (b.y - FROM.y >= 8) { air = !b.rolling; sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz); break; }
			settle(sim, undefined, 1);
		}
		return (sp ? `${sp.toFixed(1)} ${air ? 'air' : 'sol'}` : 'short').padStart(15);
	});
	console.log(`${c.tag.padEnd(16)} ${cells.join('')}`);
}
