/**
 * Human-style sudoku solver: candidates + named techniques, no guessing.
 * Every step records which candidate absences it relied on (`reads`), so a hint can
 * keep only the steps that actually lead to the placed digit.
 */

export interface Shape {
	n: number;
	boxH: number;
	boxW: number;
}

export type Tech =
	| 'pointing'
	| 'claiming'
	| 'nakedSubset'
	| 'hiddenSubset'
	| 'fish'
	| 'xyWing';

export interface Step {
	tech: Tech;
	text: string;
	/** Candidates (cell * 16 + digit) whose absence the step relied on. */
	reads: number[];
	/** Candidates (cell * 16 + digit) the step removed. */
	elims: number[];
	/** Cells the player should look at. */
	focus: number[];
}

export interface Placement {
	cell: number;
	value: number;
	/** The steps that lead to the placement, in order, then the final single. */
	steps: Step[];
	final: string;
	focus: number[];
}

interface Single {
	cell: number;
	value: number;
	text: string;
	/** Same, once eliminations led to it. */
	after: string;
	reads: number[];
	focus: number[];
}

type UnitKind = 'row' | 'col' | 'box';

interface Unit {
	kind: UnitKind;
	index: number;
	cells: number[];
}

/** Technique order = how hard it is for a human. */
export const TECH_ORDER: Tech[] = ['pointing', 'claiming', 'nakedSubset', 'hiddenSubset', 'fish', 'xyWing'];

const key = (cell: number, d: number) => cell * 16 + d;
const popcount = (m: number) => {
	let c = 0;
	for (let b = m; b; b &= b - 1) c++;
	return c;
};
const digitsOf = (m: number): number[] => {
	const out: number[] = [];
	for (let d = 1; d < 16; d++) if (m & (1 << d)) out.push(d);
	return out;
};
const listFr = (xs: (number | string)[]) =>
	xs.length <= 1 ? String(xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}`;

function combos<T>(arr: T[], k: number): T[][] {
	const out: T[][] = [];
	const rec = (start: number, acc: T[]) => {
		if (acc.length === k) { out.push([...acc]); return; }
		for (let i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); }
	};
	rec(0, []);
	return out;
}

export class Board {
	readonly shape: Shape;
	readonly units: Unit[];
	/** Units of each cell: [row, col, box]. */
	readonly cellUnits: Unit[][];
	readonly peers: number[][];
	values: number[];
	cand: number[];

	constructor(shape: Shape, values: number[]) {
		this.shape = shape;
		const { n, boxH, boxW } = shape;
		this.units = [];
		for (let r = 0; r < n; r++) this.units.push({ kind: 'row', index: r, cells: Array.from({ length: n }, (_, c) => r * n + c) });
		for (let c = 0; c < n; c++) this.units.push({ kind: 'col', index: c, cells: Array.from({ length: n }, (_, r) => r * n + c) });
		for (let b = 0; b < n; b++) {
			const br = Math.floor(b / (n / boxW)) * boxH;
			const bc = (b % (n / boxW)) * boxW;
			const cells: number[] = [];
			for (let r = 0; r < boxH; r++) for (let c = 0; c < boxW; c++) cells.push((br + r) * n + bc + c);
			this.units.push({ kind: 'box', index: b, cells });
		}
		this.cellUnits = Array.from({ length: n * n }, () => []);
		for (const u of this.units) for (const c of u.cells) this.cellUnits[c].push(u);
		this.peers = Array.from({ length: n * n }, (_, i) => {
			const s = new Set<number>();
			for (const u of this.cellUnits[i]) for (const c of u.cells) if (c !== i) s.add(c);
			return [...s];
		});
		this.values = [...values];
		const full = ((1 << (n + 1)) - 1) & ~1;
		this.cand = values.map((v, i) => {
			if (v) return 0;
			let used = 0;
			for (const p of this.peers[i]) if (values[p]) used |= 1 << values[p];
			return full & ~used;
		});
	}

	place(cell: number, v: number) {
		this.values[cell] = v;
		this.cand[cell] = 0;
		for (const p of this.peers[cell]) this.cand[p] &= ~(1 << v);
	}

	cellName(cell: number) {
		const { n } = this.shape;
		return `ligne ${Math.floor(cell / n) + 1}, colonne ${(cell % n) + 1}`;
	}

	unitName(u: Unit) {
		if (u.kind === 'row') return `la ligne ${u.index + 1}`;
		if (u.kind === 'col') return `la colonne ${u.index + 1}`;
		return this.boxName(u.index);
	}

	boxName(b: number) {
		const { n, boxH, boxW } = this.shape;
		const rows = n / boxH;
		const cols = n / boxW;
		const r = Math.floor(b / cols);
		const c = b % cols;
		const vert = rows === 2 ? ['du haut', 'du bas'][r] : ['du haut', 'du milieu', 'du bas'][r];
		const horiz = cols === 2 ? ['gauche', 'droite'][c] : ['gauche', 'du centre', 'droite'][c];
		if (vert === 'du milieu' && horiz === 'du centre') return 'le bloc central';
		return `le bloc ${vert} ${horiz === 'du centre' ? 'au centre' : `à ${horiz}`}`;
	}

	/** Every naked or hidden single, explained, simplest kind first. */
	findSingles(): Single[] {
		const { n } = this.shape;
		const out: Single[] = [];
		for (const u of this.units) {
			const empties = u.cells.filter((c) => !this.values[c]);
			if (empties.length !== 1) continue;
			const c = empties[0];
			if (popcount(this.cand[c]) !== 1) continue;
			const v = digitsOf(this.cand[c])[0];
			const text = `${cap(this.unitName(u))} n'a plus qu'une case libre : il y manque le ${v}.`;
			out.push({ cell: c, value: v, focus: [c], reads: [], text, after: text });
		}
		for (let c = 0; c < n * n; c++) {
			if (this.values[c] || popcount(this.cand[c]) !== 1) continue;
			const v = digitsOf(this.cand[c])[0];
			const reads: number[] = [];
			for (let d = 1; d <= n; d++) if (d !== v) reads.push(key(c, d));
			out.push({
				cell: c, value: v, focus: [c], reads,
				text: `Sur sa ligne, sa colonne et son bloc réunis, cette case n'accepte que le ${v}.`,
				after: `Cette case n'accepte alors plus que le ${v}.`,
			});
		}
		for (const u of this.units)
			for (let d = 1; d <= n; d++) {
				const fit = u.cells.filter((c) => this.cand[c] & (1 << d));
				if (fit.length !== 1) continue;
				out.push({
					cell: fit[0], value: d, focus: [fit[0]],
					reads: u.cells.filter((c) => c !== fit[0] && !this.values[c]).map((c) => key(c, d)),
					text: `Dans ${this.unitName(u)}, le ${d} ne peut aller que dans cette case.`,
					after: `Dans ${this.unitName(u)}, le ${d} ne peut alors plus aller que dans cette case.`,
				});
			}
		return out;
	}

	/** Find one elimination step of the given technique, or null. Does not apply it. */
	findStep(tech: Tech): Step | null {
		switch (tech) {
			case 'pointing': return this.pointing();
			case 'claiming': return this.claiming();
			case 'nakedSubset': return this.nakedSubset();
			case 'hiddenSubset': return this.hiddenSubset();
			case 'fish': return this.fish();
			case 'xyWing': return this.xyWing();
		}
	}

	apply(step: Step) {
		for (const k of step.elims) this.cand[k >> 4] &= ~(1 << (k & 15));
	}

	private lineOf(kind: 'row' | 'col', cell: number) {
		const { n } = this.shape;
		return kind === 'row' ? Math.floor(cell / n) : cell % n;
	}

	private unit(kind: UnitKind, index: number) {
		const { n } = this.shape;
		return this.units[(kind === 'row' ? 0 : kind === 'col' ? n : 2 * n) + index];
	}

	/** Digit confined to one line inside a box → off the rest of that line. */
	private pointing(): Step | null {
		const { n } = this.shape;
		for (let b = 0; b < n; b++) {
			const box = this.unit('box', b);
			for (let d = 1; d <= n; d++) {
				const fit = box.cells.filter((c) => this.cand[c] & (1 << d));
				if (fit.length < 2) continue;
				for (const kind of ['row', 'col'] as const) {
					const li = this.lineOf(kind, fit[0]);
					if (!fit.every((c) => this.lineOf(kind, c) === li)) continue;
					const line = this.unit(kind, li);
					const hit = line.cells.filter((c) => !box.cells.includes(c) && this.cand[c] & (1 << d));
					if (!hit.length) continue;
					return {
						tech: 'pointing',
						elims: hit.map((c) => key(c, d)),
						reads: box.cells.filter((c) => !fit.includes(c) && !this.values[c]).map((c) => key(c, d)),
						focus: fit,
						text: `Dans ${this.boxName(b)}, le ${d} ne peut aller que sur ${this.unitName(line)} : on l'enlève du reste de ${this.unitName(line)}.`,
					};
				}
			}
		}
		return null;
	}

	/** Digit confined to one box inside a line → off the rest of that box. */
	private claiming(): Step | null {
		const { n } = this.shape;
		for (const kind of ['row', 'col'] as const)
			for (let li = 0; li < n; li++) {
				const line = this.unit(kind, li);
				for (let d = 1; d <= n; d++) {
					const fit = line.cells.filter((c) => this.cand[c] & (1 << d));
					if (fit.length < 2) continue;
					const box = this.cellUnits[fit[0]][2];
					if (!fit.every((c) => box.cells.includes(c))) continue;
					const hit = box.cells.filter((c) => !line.cells.includes(c) && this.cand[c] & (1 << d));
					if (!hit.length) continue;
					return {
						tech: 'claiming',
						elims: hit.map((c) => key(c, d)),
						reads: line.cells.filter((c) => !fit.includes(c) && !this.values[c]).map((c) => key(c, d)),
						focus: fit,
						text: `Sur ${this.unitName(line)}, le ${d} ne peut aller que dans ${this.boxName(box.index)} : on l'enlève du reste de ce bloc.`,
					};
				}
			}
		return null;
	}

	/** k cells of a unit sharing exactly k candidates → those digits leave the unit's other cells. */
	private nakedSubset(): Step | null {
		for (let k = 2; k <= 4; k++)
			for (const u of this.units) {
				const open = u.cells.filter((c) => !this.values[c] && popcount(this.cand[c]) <= k);
				if (open.length < k) continue;
				for (const set of combos(open, k)) {
					const m = set.reduce((a, c) => a | this.cand[c], 0);
					if (popcount(m) !== k) continue;
					const others = u.cells.filter((c) => !set.includes(c) && this.cand[c] & m);
					if (!others.length) continue;
					const ds = digitsOf(m);
					const elims: number[] = [];
					for (const c of others) for (const d of ds) if (this.cand[c] & (1 << d)) elims.push(key(c, d));
					const reads: number[] = [];
					for (const c of set) for (let d = 1; d <= this.shape.n; d++) if (!(m & (1 << d))) reads.push(key(c, d));
					const what = k === 2 ? 'Ces deux cases' : k === 3 ? 'Ces trois cases' : 'Ces quatre cases';
					return {
						tech: 'nakedSubset', elims, reads, focus: set,
						text: `${what} de ${this.unitName(u)} ne peuvent contenir que ${listFr(ds)} : ces chiffres sont pris, on les enlève des autres cases de ${this.unitName(u)}.`,
					};
				}
			}
		return null;
	}

	/** k digits confined to the same k cells of a unit → those cells drop every other digit. */
	private hiddenSubset(): Step | null {
		const { n } = this.shape;
		for (let k = 2; k <= 4; k++)
			for (const u of this.units) {
				const open = u.cells.filter((c) => !this.values[c]);
				if (open.length <= k) continue;
				const digits: number[] = [];
				for (let d = 1; d <= n; d++) {
					const cnt = open.filter((c) => this.cand[c] & (1 << d)).length;
					if (cnt >= 1 && cnt <= k) digits.push(d);
				}
				for (const ds of combos(digits, k)) {
					const m = ds.reduce((a, d) => a | (1 << d), 0);
					const set = open.filter((c) => this.cand[c] & m);
					if (set.length !== k) continue;
					const elims: number[] = [];
					for (const c of set) for (const d of digitsOf(this.cand[c] & ~m)) elims.push(key(c, d));
					if (!elims.length) continue;
					const reads: number[] = [];
					for (const c of open) if (!set.includes(c)) for (const d of ds) reads.push(key(c, d));
					const what = k === 2 ? 'deux cases' : k === 3 ? 'trois cases' : 'quatre cases';
					return {
						tech: 'hiddenSubset', elims, reads, focus: set,
						text: `Dans ${this.unitName(u)}, ${listFr(ds)} ne peuvent aller que dans les mêmes ${what} : elles leur sont réservées, on en retire tout autre chiffre.`,
					};
				}
			}
		return null;
	}

	/** X-Wing (2) and Swordfish (3): a digit's spots in k lines fall in k cross lines. */
	private fish(): Step | null {
		const { n } = this.shape;
		for (let k = 2; k <= 3; k++)
			for (const kind of ['row', 'col'] as const) {
				const cross: 'row' | 'col' = kind === 'row' ? 'col' : 'row';
				for (let d = 1; d <= n; d++) {
					const lines: { li: number; pos: number }[] = [];
					for (let li = 0; li < n; li++) {
						const fit = this.unit(kind, li).cells.filter((c) => this.cand[c] & (1 << d));
						if (fit.length >= 2 && fit.length <= k)
							lines.push({ li, pos: fit.reduce((a, c) => a | (1 << this.lineOf(cross, c)), 0) });
					}
					for (const base of combos(lines, k)) {
						const cover = base.reduce((a, l) => a | l.pos, 0);
						if (popcount(cover) !== k) continue;
						const baseIdx = base.map((l) => l.li);
						const crossIdx: number[] = [];
						for (let i = 0; i < n; i++) if (cover & (1 << i)) crossIdx.push(i);
						const elims: number[] = [];
						for (const ci of crossIdx)
							for (const c of this.unit(cross, ci).cells)
								if (!baseIdx.includes(this.lineOf(kind, c)) && this.cand[c] & (1 << d)) elims.push(key(c, d));
						if (!elims.length) continue;
						const reads: number[] = [];
						const focus: number[] = [];
						for (const li of baseIdx)
							for (const c of this.unit(kind, li).cells) {
								if (this.values[c]) continue;
								if (crossIdx.includes(this.lineOf(cross, c))) { if (this.cand[c] & (1 << d)) focus.push(c); }
								else reads.push(key(c, d));
							}
						const kindPl = kind === 'row' ? 'lignes' : 'colonnes';
						const crossPl = cross === 'row' ? 'lignes' : 'colonnes';
						const name = k === 2 ? 'X-Wing' : 'Swordfish';
						return {
							tech: 'fish', elims, reads, focus,
							text: `${name} sur le ${d} : sur les ${kindPl} ${listFr(baseIdx.map((i) => i + 1))}, le ${d} ne peut aller que dans les ${crossPl} ${listFr(crossIdx.map((i) => i + 1))}. Ces ${kindPl} prennent donc chacune un ${d} dans ces ${crossPl} : on l'enlève du reste de ces ${crossPl}.`,
						};
					}
				}
			}
		return null;
	}

	/** Pivot {a,b} sees pincers {a,c} and {b,c}: whichever way, one pincer is c. */
	private xyWing(): Step | null {
		const { n } = this.shape;
		const bi = (c: number) => (popcount(this.cand[c]) === 2 && !this.values[c]);
		for (let p = 0; p < n * n; p++) {
			if (!bi(p)) continue;
			const [a, b] = digitsOf(this.cand[p]);
			const wings = this.peers[p].filter(bi);
			for (const x of wings) {
				if (!(this.cand[x] & (1 << a)) || this.cand[x] & (1 << b)) continue;
				const cBit = this.cand[x] & ~(1 << a);
				for (const y of wings) {
					if (y === x || this.cand[y] !== ((1 << b) | cBit)) continue;
					const c = digitsOf(cBit)[0];
					const hit = this.peers[x].filter((q) => q !== p && q !== y && this.peers[y].includes(q) && this.cand[q] & cBit);
					if (!hit.length) continue;
					const reads: number[] = [];
					for (const cell of [p, x, y])
						for (let d = 1; d <= n; d++) if (!(this.cand[cell] & (1 << d))) reads.push(key(cell, d));
					return {
						tech: 'xyWing', elims: hit.map((q) => key(q, c)), reads, focus: [p, x, y],
						text: `XY-Wing : la case ${this.cellName(p)} vaut ${a} ou ${b}. Si c'est ${a}, la case ${this.cellName(x)} vaut ${c} ; si c'est ${b}, la case ${this.cellName(y)} vaut ${c}. L'une des deux vaut donc ${c} : on l'enlève des cases qui partagent une ligne, une colonne ou un bloc avec chacune des deux.`,
					};
				}
			}
		}
		return null;
	}
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Next placement a human can deduce, with only the steps it depends on.
 * Null when the techniques run dry (the grid needs guessing).
 */
export function nextPlacement(board: Board, techs: Tech[] = TECH_ORDER): Placement | null {
	const b = new Board(board.shape, board.values);
	b.cand = [...board.cand];
	const done: Step[] = [];
	for (;;) {
		let best: Placement | null = null;
		for (const single of b.findSingles()) {
			// Walk back: keep a step only if a later kept step (or the single) read one of its eliminations.
			const need = new Set(single.reads);
			const kept: Step[] = [];
			for (let i = done.length - 1; i >= 0; i--) {
				const s = done[i];
				if (!s.elims.some((k) => need.has(k))) continue;
				kept.unshift(s);
				for (const k of s.reads) need.add(k);
			}
			if (best && kept.length >= best.steps.length) continue;
			const focus = new Set<number>(single.focus);
			for (const s of kept) for (const c of s.focus) focus.add(c);
			const final = kept.length ? single.after : single.text;
			best = { cell: single.cell, value: single.value, steps: kept, final, focus: [...focus] };
		}
		if (best) return best;
		let step: Step | null = null;
		for (const t of techs) if ((step = b.findStep(t))) break;
		if (!step) return null;
		b.apply(step);
		done.push(step);
	}
}

/** Solve by logic alone. Returns the hardest technique used, or null if stuck. */
export function solveByLogic(shape: Shape, values: number[], techs: Tech[] = TECH_ORDER): { hardest: number } | null {
	const b = new Board(shape, values);
	let hardest = -1;
	for (;;) {
		if (b.values.every((v) => v)) return { hardest };
		const singles = b.findSingles();
		if (singles.length) { b.place(singles[0].cell, singles[0].value); continue; }
		let step: Step | null = null;
		for (let i = 0; i < techs.length; i++)
			if ((step = b.findStep(techs[i]))) { hardest = Math.max(hardest, TECH_ORDER.indexOf(techs[i])); break; }
		if (!step) return null;
		b.apply(step);
	}
}
