/* Measure the opening throw of Mölkky: how many pins fall and how far they scatter, over a spread of
   realistic throws at the front of the pack. The user's complaint (2026-09-29): the stick "has not
   enough force to scatter the other pins". Sweeps FEEL presets so a change is judged on numbers.

   Usage: npx tsx scripts/molkky-break.ts [throws per preset] */
import { loadPhysics, MolkkyWorld, standardLayout, FEEL, PINS_Z, type Throw, type SurfaceId } from '../src/games/molkky/physics';
import { aimAt } from '../src/games/molkky/ai';

const N = Number(process.argv[2] ?? 60);
const BASE = { ...FEEL };
// Compared against the pre-2026-09-29 feel, which the user found too dead.
const OLD: Partial<typeof FEEL> = {
	groundFriction: 0.8, pinFriction: 0.55, pinBounce: 0.25, pinLinDamp: 0.35, pinAngDamp: 2.5,
	stickFriction: 0.6, stickBounce: 0.2, stickAngDamp: 2.0, stickSkids: false, woodBounce: false,
};
const PRESETS: Record<string, Partial<typeof FEEL>> = {
	old: OLD,
	current: {},
};
const SURF: SurfaceId[] = ['herbe', 'gravier'];

// A player's opening throws: a spread of lofts, each thrown from 20 % short to 35 % long of the exact
// aim, slightly off-centre. Deterministic, the same throws for every preset.
function throwsFor(n: number): Throw[] {
	let s = 7;
	const r = (): number => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
	return Array.from({ length: n }, () => {
		const loft = 0.15 + r() * 0.5;
		const base = aimAt((r() - 0.5) * 0.08, PINS_Z, loft);
		return { ...base, speed: base.speed * (0.8 + r() * 0.55) };
	});
}

await loadPhysics();
const start = new Map(standardLayout().map((p) => [p.n, p]));
const throws = throwsFor(N);
console.log(`${N} opening throws per preset (loft 0.15-0.65, speed 0.8x-1.35x the exact aim)`);
console.log('preset          touched  down avg  p50  ≥3 down  ≥5 down   down|hit  moved|hit  spread|moved (m)  max (m)  settle ms');
for (const surf of SURF) for (const [name0, patch] of Object.entries(PRESETS)) {
	const name = `${name0}/${surf}`;
	Object.assign(FEEL, BASE, patch);
	let down = 0, three = 0, five = 0, touched = 0, spread = 0, spreadN = 0, maxS = 0, ms = 0, movedPins = 0;
	const downs: number[] = [];
	for (const th of throws) {
		const w = MolkkyWorld.create(undefined, surf);
		const t0 = performance.now();
		w.throwStick(th);
		const fell = w.settle();
		ms += performance.now() - t0;
		downs.push(fell.length);
		down += fell.length;
		if (fell.length >= 3) three++;
		if (fell.length >= 5) five++;
		let moved = false;
		for (const p of w.pinViews()) {
			const d = Math.hypot(p.x - start.get(p.n)!.x, p.z - start.get(p.n)!.z);
			if (d > 0.01) { moved = true; movedPins++; spread += d; spreadN++; }
			maxS = Math.max(maxS, d);
		}
		if (moved) touched++;
		w.free();
	}
	downs.sort((a, b) => a - b);
	const pc = (k: number): string => `${String(Math.round((k / N) * 100)).padStart(3)} %`;
	console.log(`${name.padEnd(15)} ${pc(touched)}   ${(down / N).toFixed(1).padStart(6)}  ${String(downs[N >> 1]).padStart(4)}   ${pc(three)}   ${pc(five)}   ${(down / Math.max(1, touched)).toFixed(1).padStart(7)}   ${(movedPins / Math.max(1, touched)).toFixed(1).padStart(7)}   ${(spread / Math.max(1, spreadN)).toFixed(2).padStart(12)}   ${maxS.toFixed(2).padStart(6)}   ${(ms / N).toFixed(0).padStart(6)}`);
}
Object.assign(FEEL, BASE);
