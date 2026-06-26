// Deterministic terrain noise shared by the forest scene and the (scaffolded) tree scatter,
// so every object can be snapped onto the same heightfield.

export const HILL = 16; // peak-to-valley height
export const NF = 0.02; // horizontal noise frequency

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0; a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
export const hashStr = (s: string): number => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; };

function hash2(ix: number, iz: number, seed: number): number {
	let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, seed: number): number {
	const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0;
	const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
	const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed), c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed);
	return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x: number, z: number, seed: number): number {
	let amp = 1, freq = 1, sum = 0, norm = 0;
	for (let o = 0; o < 4; o++) { sum += amp * vnoise(x * freq, z * freq, seed + o * 101); norm += amp; amp *= 0.5; freq *= 2; }
	return sum / norm;
}
export const heightAt = (x: number, z: number, seed: number): number => (fbm(x * NF, z * NF, seed) - 0.5) * HILL;
export function slopeAt(x: number, z: number, seed: number): number {
	const e = 1.5;
	const hx = heightAt(x + e, z, seed) - heightAt(x - e, z, seed);
	const hz = heightAt(x, z + e, seed) - heightAt(x, z - e, seed);
	return Math.hypot(hx, hz) / (2 * e);
}
