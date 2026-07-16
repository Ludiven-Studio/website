import { describe, it, expect } from 'vitest';
import {
	generateBand, veinStartX, createMine, stepMine, stepLamp,
	craft, useTool, scoreOf, cellKey, Cell, MINE_DIFFS, ORES, RECIPES,
	COLS, WOBBLE_TICKS, type MineState,
} from './engine';

const DIFF = MINE_DIFFS.moyen;

const snap = (s: MineState) => ({
	rows: s.rows.map((r) => Array.from(r)),
	player: s.player, dir: s.dir, lamp: s.lamp, inv: s.inventory,
	maxDepth: s.maxDepth, collected: s.collected, craftBonus: s.craftBonus,
	tick: s.tick, status: s.status,
	wobbles: [...s.wobbles.entries()].sort((a, b) => a[0] - b[0]),
	falling: [...s.falling].sort((a, b) => a - b),
});

/** Controlled 60-row arena: empty interior, bedrock walls + floor, player idle far from action. */
function arena(): MineState {
	const s = createMine(1, DIFF);
	s.rows = [];
	for (let y = 0; y < 60; y++) {
		const row = new Uint8Array(COLS).fill(Cell.Empty);
		row[0] = Cell.Bedrock;
		row[COLS - 1] = Cell.Bedrock;
		s.rows.push(row);
	}
	for (let x = 0; x < COLS; x++) s.rows[59][x] = Cell.Bedrock;
	s.player = { x: 1, y: 20 }; // idle: gravity tests call stepMine(s) with no dir
	return s;
}

const diggable = (c: number): boolean => c !== Cell.Stone && c !== Cell.Bedrock;

describe('cocotte-mineuse generation', () => {
	it('generateBand is a pure function of (seed, band, diff)', () => {
		for (let band = 0; band < 20; band++) {
			const a = generateBand(7, band, DIFF);
			const b = generateBand(7, band, DIFF);
			expect(a.map((r) => Array.from(r))).toEqual(b.map((r) => Array.from(r)));
		}
		expect(generateBand(7, 3, DIFF).map((r) => Array.from(r)))
			.not.toEqual(generateBand(8, 3, DIFF).map((r) => Array.from(r)));
	});

	it('veinStartX stays inside the interior', () => {
		for (let seed = 1; seed <= 50; seed++)
			for (let band = 0; band < 20; band++) {
				const x = veinStartX(seed, band);
				expect(x).toBeGreaterThanOrEqual(1);
				expect(x).toBeLessThanOrEqual(COLS - 2);
			}
	});

	it('worlds are walled, depth-banded and dig-able top-to-bottom (200 seeds × 3 diffs)', () => {
		const BANDS = 13;
		const errors: string[] = [];
		const oreByCell = new Map(ORES.map((o) => [o.cell as number, o]));
		for (const diff of Object.values(MINE_DIFFS)) {
			for (let seed = 1; seed <= 200; seed++) {
				const rows: Uint8Array[] = [];
				for (let b = 0; b < BANDS; b++) rows.push(...generateBand(seed, b, diff));
				const tag = `seed ${seed} ${diff.label}`;

				for (let y = 0; y < rows.length; y++) {
					if (rows[y][0] !== Cell.Bedrock || rows[y][COLS - 1] !== Cell.Bedrock)
						errors.push(`${tag}: missing wall at row ${y}`);
					for (let x = 1; x < COLS - 1; x++) {
						const spec = oreByCell.get(rows[y][x]);
						if (spec && (y < spec.minDepth || y > spec.maxDepth))
							errors.push(`${tag}: ${spec.id} at depth ${y}`);
					}
				}

				// BFS through dig-able cells from the surface must reach the deepest row
				const seen = new Set<number>([cellKey(Math.floor(COLS / 2), 0)]);
				const queue = [[Math.floor(COLS / 2), 0]];
				let deepest = 0;
				while (queue.length) {
					const [x, y] = queue.pop()!;
					if (y > deepest) deepest = y;
					for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
						const nx = x + dx, ny = y + dy;
						if (nx < 1 || nx > COLS - 2 || ny < 0 || ny >= rows.length) continue;
						const k = cellKey(nx, ny);
						if (seen.has(k) || !diggable(rows[ny][nx])) continue;
						seen.add(k);
						queue.push([nx, ny]);
					}
				}
				if (deepest !== rows.length - 1) errors.push(`${tag}: dig-able only to ${deepest}/${rows.length - 1}`);
			}
		}
		expect(errors).toEqual([]);
	}, 30_000);

	it('createMine opens the surface and pre-generates rows', () => {
		const s = createMine(5, DIFF);
		expect(s.player).toEqual({ x: 6, y: 0 });
		expect(s.rows.length).toBeGreaterThanOrEqual(42);
		for (let x = 1; x < COLS - 1; x++) expect(s.rows[0][x]).toBe(Cell.Empty);
	});
});

describe('cocotte-mineuse determinism', () => {
	it('two identically-scripted runs stay identical', () => {
		const script = (i: number) => (['down', 'down', 'left', 'down', 'right', 'down'] as const)[i % 6];
		const run = () => {
			const s = createMine(42, DIFF);
			for (let i = 0; i < 300; i++) {
				stepMine(s, script(i));
				stepLamp(s, 16.67);
			}
			return s;
		};
		expect(snap(run())).toEqual(snap(run()));
	});
});

describe('cocotte-mineuse movement', () => {
	it('digs sand, collects ore, blocked by stone/bedrock/surface, maxDepth monotonic', () => {
		const s = arena();
		s.player = { x: 5, y: 10 };
		s.maxDepth = 10;
		s.rows[11][5] = Cell.Sand;
		stepMine(s, 'down');
		expect(s.player).toEqual({ x: 5, y: 11 });
		expect(s.rows[11][5]).toBe(Cell.Empty);
		expect(s.maxDepth).toBe(11);

		s.rows[11][6] = Cell.Or;
		stepMine(s, 'right');
		expect(s.player).toEqual({ x: 6, y: 11 });
		expect(s.inventory.or).toBe(1);
		expect(s.collected).toBe(50);

		s.rows[11][7] = Cell.Stone;
		stepMine(s, 'right'); // blocked by the stone
		expect(s.player).toEqual({ x: 6, y: 11 });
		expect(s.status).toBe('playing');

		s.player = { x: 6, y: 0 };
		stepMine(s, 'up'); // y<0 → blocked
		expect(s.player).toEqual({ x: 6, y: 0 });
		expect(s.maxDepth).toBe(11); // unchanged by going up

		stepMine(s); // idle input → the hen stays put
		expect(s.player).toEqual({ x: 6, y: 0 });
	});
});

describe('cocotte-mineuse gravity', () => {
	it('unsupported stone wobbles then falls 1 cell/tick until support', () => {
		const s = arena();
		s.rows[10][5] = Cell.Stone;
		s.rows[11][5] = Cell.Sand; // support
		stepMine(s);
		expect(s.wobbles.size).toBe(0); // supported → untracked

		s.rows[11][5] = Cell.Empty; // support dug away
		stepMine(s);
		expect(s.wobbles.get(cellKey(5, 10))).toBe(WOBBLE_TICKS);
		stepMine(s); // 2 → 1
		expect(s.wobbles.get(cellKey(5, 10))).toBe(1);
		stepMine(s); // 1 → 0 → falling
		expect(s.falling.has(cellKey(5, 10))).toBe(true);
		expect(s.rows[10][5]).toBe(Cell.Stone); // hasn't moved yet
		stepMine(s); // first fall
		expect(s.rows[10][5]).toBe(Cell.Empty);
		expect(s.rows[11][5]).toBe(Cell.Stone);
		// floor inside the gravity window (±30 rows around the player at y=20)
		for (let x = 0; x < COLS; x++) s.rows[40][x] = Cell.Bedrock;
		for (let i = 0; i < 60; i++) stepMine(s);
		expect(s.rows[39][5]).toBe(Cell.Stone); // rests on the floor
		expect(s.falling.size).toBe(0);
	});

	it('stacked stones chain: upper starts wobbling the tick the lower vacates', () => {
		const s = arena();
		s.rows[9][5] = Cell.Stone;
		s.rows[10][5] = Cell.Stone;
		s.rows[11][5] = Cell.Sand;
		s.rows[11][5] = Cell.Empty; // destabilize
		for (const r of [9, 10]) { s.rows[r][4] = Cell.Sand; s.rows[r][6] = Cell.Sand; } // wall the sides → only vertical motion
		stepMine(s); // lower wobbles
		expect(s.wobbles.get(cellKey(5, 10))).toBe(WOBBLE_TICKS);
		expect(s.wobbles.has(cellKey(5, 9))).toBe(false); // upper still supported
		stepMine(s);
		stepMine(s); // lower → falling
		stepMine(s); // lower vacates (5,10) → upper wobbles same tick
		expect(s.rows[11][5]).toBe(Cell.Stone);
		expect(s.wobbles.get(cellKey(5, 9))).toBe(WOBBLE_TICKS);
	});

	it('the hen holds up a resting stone directly above her, which falls once she leaves', () => {
		const s = arena();
		s.player = { x: 5, y: 11 };
		s.rows[10][5] = Cell.Stone; // (5,11) is the hen → nothing beneath the stone but her
		for (let i = 0; i < 6; i++) stepMine(s); // idle under the stone
		expect(s.wobbles.size).toBe(0); // held up → never wobbles
		expect(s.rows[10][5]).toBe(Cell.Stone);
		expect(s.status).toBe('playing');

		s.rows[13][5] = Cell.Bedrock; // give the stone somewhere to land
		stepMine(s, 'down'); // step to (5,12): the hen leaves the cell below the stone
		expect(s.player).toEqual({ x: 5, y: 12 });
		expect(s.wobbles.get(cellKey(5, 10))).toBe(WOBBLE_TICKS); // now unsupported → wobbles
	});

	it('a falling stone crushes the hen', () => {
		const s = arena();
		s.player = { x: 5, y: 11 };
		s.rows[12][5] = Cell.Bedrock;
		s.rows[9][5] = Cell.Stone; // (5,10) empty → unsupported, hen too far below to hold it
		for (let i = 0; i < 5; i++) stepMine(s, 'down'); // blocked below → stays; wobble + fall + crush
		expect(s.status).toBe('over');
		expect(s.deathCause).toBe('crush');
	});

	it('a falling gem is caught (collected), not lethal', () => {
		const s = arena();
		s.player = { x: 5, y: 11 };
		s.rows[12][5] = Cell.Bedrock;
		s.rows[9][5] = Cell.Diamant;
		for (let i = 0; i < 5; i++) stepMine(s, 'down');
		expect(s.status).toBe('playing');
		expect(s.inventory.diamant).toBe(1);
		expect(s.collected).toBe(150);
		expect(s.rows[11][5]).toBe(Cell.Empty); // caught, not landed
	});

	it('rounded blocks roll off hard blocks into pyramids (stones and gems alike)', () => {
		const s = arena();
		for (let x = 3; x <= 7; x++) s.rows[31][x] = Cell.Bedrock; // floor
		s.rows[30][5] = Cell.Diamant; // support
		s.rows[29][5] = Cell.Or; // rolls off it, left side clear
		for (let i = 0; i < 6; i++) stepMine(s); // wobble + roll steps
		expect(s.rows[29][5]).toBe(Cell.Empty); // left the top of the pile
		expect(s.rows[30][4]).toBe(Cell.Or); // rolled down-left onto the floor
		expect(s.loose.has(cellKey(4, 30))).toBe(true); // sits in the open → rendered bare

		// a stone now ALSO rolls off a stone (Boulder-Dash rounding)
		const t = arena();
		for (let x = 3; x <= 7; x++) t.rows[31][x] = Cell.Bedrock;
		t.rows[30][5] = Cell.Stone;
		t.rows[29][5] = Cell.Stone;
		for (let i = 0; i < 6; i++) stepMine(t);
		expect(t.rows[29][5]).toBe(Cell.Empty); // rolled off
		expect(t.rows[30][4]).toBe(Cell.Stone); // into the hole beside it
	});

	it('a gem rolls off a stone (hard block) into an adjacent hole', () => {
		const s = arena();
		for (let x = 3; x <= 7; x++) s.rows[31][x] = Cell.Bedrock; // floor
		s.rows[30][5] = Cell.Stone; // hard support, left side clear
		s.rows[29][5] = Cell.Diamant;
		for (let i = 0; i < 6; i++) stepMine(s);
		expect(s.rows[29][5]).toBe(Cell.Empty); // rolled off the stone
		expect(s.rows[30][4]).toBe(Cell.Diamant); // into the hole beside it
	});

	it('a gem rests on sand (flat bed → no roll) even with a hole beside it', () => {
		const s = arena();
		for (let x = 3; x <= 7; x++) s.rows[31][x] = Cell.Bedrock;
		s.rows[30][5] = Cell.Sand; // soft flat support
		s.rows[29][5] = Cell.Diamant; // left side open, but sand holds it
		for (let i = 0; i < 6; i++) stepMine(s);
		expect(s.rows[29][5]).toBe(Cell.Diamant); // stayed on the sand
	});

	it('a gem wedged between two blocked sides stays put', () => {
		const s = arena();
		for (let x = 3; x <= 7; x++) s.rows[31][x] = Cell.Bedrock; // floor
		s.rows[30][5] = Cell.Diamant; // support below
		s.rows[30][4] = Cell.Diamant; // both diagonals blocked
		s.rows[30][6] = Cell.Diamant;
		s.rows[29][4] = Cell.Sand; // both sides blocked
		s.rows[29][6] = Cell.Sand;
		s.rows[29][5] = Cell.Or; // nowhere to roll
		for (let i = 0; i < 6; i++) stepMine(s);
		expect(s.rows[29][5]).toBe(Cell.Or); // held by its neighbours
	});

	it('a propped stone never falls', () => {
		const s = arena();
		s.player = { x: 5, y: 11 };
		s.rows[12][5] = Cell.Bedrock;
		s.rows[9][5] = Cell.Stone;
		s.inventory.etai = 1;
		expect(useTool(s, 'etai')).toBe(true);
		expect(s.propped.has(cellKey(5, 9))).toBe(true);
		for (let i = 0; i < 10; i++) stepMine(s, 'down');
		expect(s.rows[9][5]).toBe(Cell.Stone);
		expect(s.status).toBe('playing');
	});
});

describe('cocotte-mineuse crafting & tools', () => {
	it('recipes consume exactly their ingredients; insufficient → false untouched', () => {
		const s = arena();
		s.inventory.or = 1;
		s.inventory.cristal = 1;
		expect(craft(s, 'collier')).toBe(false); // needs diamant
		expect(s.inventory.or).toBe(1);
		expect(craft(s, 'bague')).toBe(true);
		expect(s.inventory.or).toBe(0);
		expect(s.inventory.cristal).toBe(0);
		expect(s.inventory.bague).toBe(1);
		expect(s.craftBonus).toBe(200);
	});

	it('couronne is a 2-step chain worth 800 bonus', () => {
		const s = arena();
		s.inventory.or = 1;
		s.inventory.cristal = 1;
		s.inventory.diamant = 1;
		expect(craft(s, 'couronne')).toBe(false); // no bague yet
		expect(craft(s, 'bague')).toBe(true);
		expect(craft(s, 'couronne')).toBe(true);
		expect(s.inventory.bague).toBe(0);
		expect(s.inventory.couronne).toBe(1);
		expect(s.craftBonus).toBe(800);
		expect(s.status).toBe('over'); // the couronne wins the run
		expect(s.deathCause).toBe('win');
	});

	it('every recipe id is craftable and consistent', () => {
		for (const r of RECIPES) {
			const s = arena();
			// grant a full chain for multi-step recipes
			s.inventory.or = 2; s.inventory.cristal = 2; s.inventory.diamant = 2;
			s.inventory.charbon = 2; s.inventory.silex = 2; s.inventory.fer = 2; s.inventory.cuivre = 2;
			if (r.id === 'couronne') craft(s, 'bague');
			expect(craft(s, r.id), r.id).toBe(true);
			expect(s.inventory[r.id]).toBe(1);
		}
	});

	it('torche refills the lamp, clamped, refused at full', () => {
		const s = arena();
		s.inventory.torche = 2;
		s.lamp = 0.9;
		expect(useTool(s, 'torche')).toBe(true);
		expect(s.lamp).toBe(1);
		expect(useTool(s, 'torche')).toBe(false); // full → not consumed
		expect(s.inventory.torche).toBe(1);
	});

	it('bombe is placed, then detonates after its fuse (clears sand/stone, spares bedrock/ores)', () => {
		const s = arena();
		s.player = { x: 5, y: 20 };
		s.rows[19][5] = Cell.Stone;
		s.rows[21][5] = Cell.Sand;
		s.rows[20][4] = Cell.Bedrock;
		s.rows[20][6] = Cell.Or;
		s.inventory.bombe = 1;
		expect(useTool(s, 'bombe')).toBe(true);
		expect(s.inventory.bombe).toBe(0);
		expect(s.bombs.length).toBe(1);
		expect(s.rows[19][5]).toBe(Cell.Stone); // nothing cleared yet — the fuse is burning

		s.player = { x: 5, y: 26 }; // flee out of the blast
		for (let t = 0; t < 3; t++) stepLamp(s, 1000); // 3 × 1 s → fuse reaches 0, detonates
		expect(s.bombs.length).toBe(0); // detonated
		expect(s.rows[19][5]).toBe(Cell.Empty); // stone cleared
		expect(s.rows[21][5]).toBe(Cell.Empty); // sand cleared
		expect(s.rows[20][4]).toBe(Cell.Bedrock); // spared
		expect(s.rows[20][6]).toBe(Cell.Or); // spared
		expect(s.status).toBe('playing'); // fled in time
		expect(s.blasts.length).toBeGreaterThan(0); // explosion flash spawned
	});

	it('the bomb kills the hen if she stays in the blast', () => {
		const s = arena();
		s.player = { x: 5, y: 20 };
		s.inventory.bombe = 1;
		useTool(s, 'bombe');
		for (let t = 0; t < 4; t++) stepLamp(s, 1000); // never moved
		expect(s.status).toBe('over');
		expect(s.deathCause).toBe('bomb');
	});

	it('bomb fuses freeze while the workbench is open', () => {
		const s = arena();
		s.player = { x: 5, y: 20 };
		s.inventory.bombe = 1;
		useTool(s, 'bombe');
		for (let t = 0; t < 5; t++) stepLamp(s, 1000, true); // bench open → fuse paused
		expect(s.bombs.length).toBe(1);
		expect(s.status).toBe('playing');
	});

	it('etai with no stone above → false, nothing consumed', () => {
		const s = arena();
		s.inventory.etai = 1;
		expect(useTool(s, 'etai')).toBe(false);
		expect(s.inventory.etai).toBe(1);
	});
});

describe('cocotte-mineuse lamp & scoring', () => {
	it('drains in real time, slower at the workbench, 0 → run over', () => {
		const s = arena();
		stepLamp(s, 1000);
		expect(s.lamp).toBeCloseTo(1 - DIFF.lampDrainPerSec, 6);
		stepLamp(s, 1000, true);
		expect(s.lamp).toBeCloseTo(1 - DIFF.lampDrainPerSec * (1 + DIFF.workbenchDrainFactor), 6);
		s.lamp = 0.001;
		stepLamp(s, 1000);
		expect(s.status).toBe('over');
		expect(s.deathCause).toBe('lamp');
	});

	it('detector ticks down with the frame clock', () => {
		const s = arena();
		s.inventory.detecteur = 1;
		expect(useTool(s, 'detecteur')).toBe(true);
		expect(s.detectorMs).toBe(10000);
		stepLamp(s, 4000);
		expect(s.detectorMs).toBe(6000);
	});

	it('scoreOf = maxDepth + collected + craftBonus', () => {
		const s = arena();
		s.maxDepth = 42;
		s.collected = 120;
		s.craftBonus = 200;
		expect(scoreOf(s)).toBe(362);
	});
});
