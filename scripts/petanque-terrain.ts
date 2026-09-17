/* M1 gate for the pitch generator. A boules ground undulates; it never has a cliff.
   Sweeps 200 seeds per relief amplitude and reports the height range and the slope
   distribution. The gate: no sample anywhere may exceed |grad h| = 0.12 (a 12 % step),
   because past that a rolling boule would be thrown sideways in a way no player can read.

   Usage: npx tsx scripts/petanque-terrain.ts */
import { makeTerrain, heightAt, gradAt, SURFACES, SURFACE_IDS, PITCH_W, PITCH_L, CELL } from '../src/games/petanque/terrain';

const SEEDS = 200;
const AMPS: [string, number][] = [['facile', 0.015], ['difficile', 0.050], ['expert', 0.075]];
const GATE = 0.12;

const q = (a: number[], p: number): number => a[Math.min(a.length - 1, Math.floor(a.length * p))];

console.log(`pitch ${PITCH_W} x ${PITCH_L} m, cell ${CELL * 100} cm\n`);

let worst = 0;
let worstAt = '';

for (const [label, amp] of AMPS) {
	const slopes: number[] = [];
	let lo = Infinity, hi = -Infinity;
	for (let s = 0; s < SEEDS; s++) {
		const t = makeTerrain(s * 2654435761, SURFACES['gravier-fin'], amp);
		const g = { gx: 0, gy: 0 };
		for (let j = 0; j < t.ny; j += 2)
			for (let i = 0; i < t.nx; i += 2) {
				const x = i * CELL, y = j * CELL;
				const h = heightAt(t, x, y);
				if (h < lo) lo = h;
				if (h > hi) hi = h;
				gradAt(t, x, y, g);
				const m = Math.sqrt(g.gx * g.gx + g.gy * g.gy);
				slopes.push(m);
				if (m > worst) { worst = m; worstAt = `${label} seed ${s} at ${x.toFixed(2)},${y.toFixed(2)}`; }
			}
	}
	slopes.sort((a, b) => a - b);
	const mean = slopes.reduce((a, b) => a + b, 0) / slopes.length;
	console.log(
		`${label.padEnd(10)} amp ${(amp * 100).toFixed(1)} cm | height ${(lo * 100).toFixed(1)} .. ${(hi * 100).toFixed(1)} cm` +
		` | slope mean ${(mean * 100).toFixed(2)} % p99 ${(q(slopes, 0.99) * 100).toFixed(2)} % max ${(slopes[slopes.length - 1] * 100).toFixed(2)} %`,
	);
}

console.log('');
for (const id of SURFACE_IDS) {
	const t = makeTerrain(1234, SURFACES[id], 0.04);
	const rs = t.pebbles.map((p) => p.r);
	const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
	const perM2 = t.pebbles.length / (PITCH_W * PITCH_L);
	console.log(`${id.padEnd(14)} ${String(t.pebbles.length).padStart(4)} pebbles (${perM2.toFixed(1)}/m²), mean r ${(mean * 1000).toFixed(1)} mm`);
}

console.log('');
if (worst > GATE) {
	console.log(`FAIL: max slope ${(worst * 100).toFixed(2)} % > gate ${(GATE * 100).toFixed(0)} % (${worstAt})`);
	process.exit(1);
}
console.log(`PASS: max slope ${(worst * 100).toFixed(2)} % <= gate ${(GATE * 100).toFixed(0)} %`);
