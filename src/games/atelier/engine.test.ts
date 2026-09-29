import { describe, it, expect } from 'vitest';
import {
	newGame, produce, move, moveKind, deliver, tick, sell, buyUpgrade, load, save, activeOrders,
	storyOrder, shortOrders, parse, genOf, nearestEmpty, energyIn, CELLS, type State,
} from './engine';
import { CHAINS, GENERATORS, ORDERS, UPGRADES, ENERGY_MAX, ENERGY_MS, COLS, START_BOARD } from './data';

const T0 = 1_700_000_000_000;
const genCell = (s: State, g: string): number => s.board.indexOf(`g:${g}`);

function fill(s: State, piece = 'meca:6'): State {
	const n = { ...s, board: s.board.map((p) => p ?? piece) };
	return n;
}

describe('atelier data', () => {
	it('every order asks for pieces that exist and some generator can make', () => {
		for (const o of ORDERS) for (const p of o.needs) {
			const i = parse(p);
			expect(i, `${o.id} → ${p}`).not.toBeNull();
			expect(Object.values(GENERATORS).some((g) => g.out.some((x) => x.chain === i!.chain)), p).toBe(true);
		}
	});

	it('story orders cover steps 1..3 once each', () => {
		expect(ORDERS.filter((o) => o.kind === 'story').map((o) => o.step)).toEqual([1, 2, 3]);
	});

	it('every chain has a generator and upgrades have unique ids', () => {
		for (const c of Object.values(CHAINS)) expect(GENERATORS[c.gen]).toBeDefined();
		expect(new Set(UPGRADES.map((u) => u.id)).size).toBe(UPGRADES.length);
	});

	it('the start board holds both generators', () => {
		const s = newGame(T0);
		expect(s.board.length).toBe(CELLS);
		expect(genCell(s, 'boite')).toBeGreaterThanOrEqual(0);
		expect(genCell(s, 'tiroir')).toBeGreaterThanOrEqual(0);
		expect(Object.keys(START_BOARD).length).toBeGreaterThan(2);
	});
});

describe('merge invariant', () => {
	it('two identical items become exactly one of the next level', () => {
		const s = newGame(T0);
		const a = 6 * COLS + 3, b = 6 * COLS + 4;
		expect(moveKind(s, a, b)).toBe('merge');
		const r = move(s, a, b);
		expect(r.kind).toBe('merge');
		expect(r.s.board[b]).toBe('meca:2');
		expect(r.s.board[a]).toBeNull();
		const count = (st: State) => st.board.filter(Boolean).length;
		expect(count(r.s)).toBe(count(s) - 1);
	});

	it('different items swap, an empty target is a move, max level never merges', () => {
		let s = newGame(T0);
		const g = genCell(s, 'boite');
		expect(moveKind(s, g, 6 * COLS + 3)).toBe('swap');
		expect(moveKind(s, 6 * COLS + 3, 0)).toBe('move');
		s = { ...s, board: s.board.slice() };
		s.board[0] = 'meca:6'; s.board[1] = 'meca:6';
		expect(moveKind(s, 0, 1)).toBe('swap');
		expect(moveKind(s, 0, 0)).toBe('none');
	});

	it('does not mutate the input state', () => {
		const s = newGame(T0);
		const before = save(s);
		move(s, 6 * COLS + 3, 6 * COLS + 4);
		produce(s, genCell(s, 'tiroir'), T0);
		expect(save(s)).toBe(before);
	});
});

describe('generators', () => {
	it('produce costs one energy and one charge, next to the generator', () => {
		const s = newGame(T0);
		const g = genCell(s, 'tiroir');
		const r = produce(s, g, T0);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.s.energy).toBe(ENERGY_MAX - 1);
		expect(r.s.gens.tiroir.charges).toBe(GENERATORS.tiroir.charges - 1);
		expect(parse(r.piece)!.chain).toBe('meca');
		const d = Math.abs(Math.floor(r.at / COLS) - Math.floor(g / COLS)) + Math.abs((r.at % COLS) - (g % COLS));
		expect(d).toBe(1);
	});

	it('the first toolbox draw is a screwdriver (tutorial)', () => {
		for (let seed = 1; seed < 30; seed++) {
			const s = newGame(T0, seed);
			const r = produce(s, genCell(s, 'boite'), T0);
			expect(r.ok && r.piece).toBe('outil:1');
		}
	});

	it('a full board or no energy costs nothing', () => {
		const s = fill(newGame(T0));
		const r = produce(s, genCell(s, 'boite'), T0);
		expect(r).toEqual({ ok: false, why: 'full' });
		const e = { ...newGame(T0), energy: 0 };
		expect(produce(e, genCell(e, 'boite'), T0)).toEqual({ ok: false, why: 'energy' });
	});

	it('charges run out, then refill with time', () => {
		let s = newGame(T0);
		const g = genCell(s, 'tiroir');
		for (let k = 0; k < GENERATORS.tiroir.charges; k++) {
			const r = produce(s, g, T0);
			expect(r.ok).toBe(true);
			if (r.ok) s = r.s;
		}
		expect(produce(s, g, T0)).toEqual({ ok: false, why: 'charges' });
		const later = produce(s, g, T0 + GENERATORS.tiroir.chargeMs);
		expect(later.ok).toBe(true);
	});

	it('generator outputs are deterministic for a seed', () => {
		const run = (seed: number) => {
			let s = newGame(T0, seed);
			const out: string[] = [];
			for (let k = 0; k < 10; k++) {
				const r = produce(s, genCell(s, 'boite'), T0 + k * 20_000);
				if (r.ok) { s = r.s; out.push(r.piece); }
			}
			return out.join();
		};
		expect(run(7)).toBe(run(7));
	});

	it('nearestEmpty returns -1 on a full board', () => {
		expect(nearestEmpty(Array(CELLS).fill('meca:1'), 0)).toBe(-1);
	});
});

describe('energy over time', () => {
	it('refills one point per interval up to the cap, and keeps running while closed', () => {
		let s = { ...newGame(T0), energy: 10, energyAt: T0 };
		s = tick(s, T0 + ENERGY_MS * 5 + 1000);
		expect(s.energy).toBe(15);
		expect(energyIn(s, T0 + ENERGY_MS * 5 + 1000)).toBe(ENERGY_MS - 1000);
		s = tick(s, T0 + ENERGY_MS * 1000);
		expect(s.energy).toBe(ENERGY_MAX);
	});

	it('a clock set back loses nothing', () => {
		const s = { ...newGame(T0), energy: 10, energyAt: T0 };
		const back = tick(s, T0 - 3_600_000);
		expect(back.energy).toBe(10);
		expect(tick(back, T0 - 3_600_000 + ENERGY_MS).energy).toBe(11);
	});

	it('tick returns the same object when nothing changes', () => {
		const s = newGame(T0);
		expect(tick(s, T0 + 1000)).toBe(s);
	});
});

describe('orders', () => {
	it('opens with Mme Garnier only, then the watch after the bench', () => {
		let s = newGame(T0);
		expect(activeOrders(s).map((o) => o.id)).toEqual(['garnier-1']);
		expect(storyOrder(s)).toBeNull();
		s = { ...s, coins: 100 };
		s = buyUpgrade(s, 'etabli');
		expect(activeOrders(s).map((o) => o.id)).toEqual(['morel-1', 'garnier-1', 'lucas-1']);
	});

	it('delivery consumes exactly the asked pieces and pays once', () => {
		let s = newGame(T0);
		s = { ...s, board: s.board.slice() };
		s.board[0] = 'outil:2';
		s.board[1] = 'outil:2';
		const r = deliver(s, 'garnier-1');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.s.board.filter((p) => p === 'outil:2').length).toBe(1);
		expect(r.s.coins).toBe(10);
		expect(deliver(r.s, 'garnier-1').ok).toBe(false); // no double reward
	});

	it('missing pieces refuse the delivery', () => {
		expect(deliver(newGame(T0), 'garnier-1').ok).toBe(false);
	});

	it('story steps advance the watch and neighbourhood orders take over', () => {
		let s: State = { ...newGame(T0), coins: 100 };
		s = buyUpgrade(s, 'etabli');
		const give = (st: State, id: string): State => {
			const o = activeOrders(st).find((x) => x.id === id)!;
			const n = { ...st, board: st.board.slice() };
			for (const p of o.needs) n.board[n.board.indexOf(null)] = p;
			const r = deliver(n, id);
			expect(r.ok, id).toBe(true);
			return r.ok ? r.s : st;
		};
		for (const id of ['garnier-1', 'lucas-1', 'morel-1', 'garnier-2', 'chen-1', 'morel-2', 'lucas-2', 'morel-3']) s = give(s, id);
		expect(s.step).toBe(3);
		expect(storyOrder(s)).toBeNull();
		const locals = shortOrders(s);
		expect(locals.length).toBe(2);
		for (const o of locals) for (const p of o.needs) expect(parse(p)).not.toBeNull();
		s = give(s, locals[0].id);
		expect(shortOrders(s).length).toBe(2);
		expect(shortOrders(s)[0].id).toBe(locals[1].id);
	});
});

describe('selling and upgrades', () => {
	it('sells items, never generators', () => {
		const s = newGame(T0);
		const g = genCell(s, 'boite');
		expect(sell(s, g)).toBe(s);
		const r = sell(s, 6 * COLS + 3);
		expect(r.board[6 * COLS + 3]).toBeNull();
		expect(r.coins).toBe(1);
	});

	it('the bench ends the tutorial even when bought before the first delivery', () => {
		const s = { ...newGame(T0), coins: 50, tut: 1 };
		expect(buyUpgrade(s, 'etabli').tut).toBe(4);
		const d = { ...newGame(T0), coins: 50, tut: 2, board: newGame(T0).board.slice() };
		d.board[0] = 'outil:2';
		const e = buyUpgrade(d, 'etabli');
		const r = deliver({ ...e, tut: 2 }, 'garnier-1');
		expect(r.ok && r.s.tut).toBe(4);
	});

	it('upgrades cost coins and respect the story', () => {
		const s = { ...newGame(T0), coins: 100 };
		expect(buyUpgrade(s, 'lampe')).toBe(s); // step 1 needed
		const e = buyUpgrade(s, 'etabli');
		expect(e.upgrades).toContain('etabli');
		expect(e.coins).toBe(92);
		expect(buyUpgrade(e, 'etabli')).toBe(e);
	});
});

describe('save', () => {
	it('round-trips', () => {
		let s = newGame(T0, 3);
		const r = produce(s, genCell(s, 'boite'), T0);
		if (r.ok) s = r.s;
		const back = load(save(s), T0);
		expect(save(back)).toBe(save(s));
	});

	it('garbage or an unknown version starts fresh', () => {
		expect(load('{nope', T0).board.length).toBe(CELLS);
		expect(load(JSON.stringify({ v: 99 }), T0).coins).toBe(0);
	});

	it('drops unknown pieces and puts a missing generator back', () => {
		const s = newGame(T0);
		const raw = JSON.parse(save(s));
		raw.board[genCell(s, 'boite')] = 'bogus:1';
		const back = load(JSON.stringify(raw), T0);
		expect(back.board.includes('bogus:1')).toBe(false);
		expect(back.board.some((p) => genOf(p) === 'boite')).toBe(true);
	});

	it('a save from a clock in the future does not freeze the refill', () => {
		const s = { ...newGame(T0), energy: 5, energyAt: T0 + 86_400_000 };
		const back = load(save(s), T0);
		expect(back.energyAt).toBeLessThanOrEqual(T0);
		expect(tick(back, T0 + ENERGY_MS).energy).toBe(6);
	});
});
