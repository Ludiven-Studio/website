import { describe, it, expect } from 'vitest';
import {
	newGame, produce, move, moveKind, deliver, tick, sell, buyUpgrade, load, save, activeOrders,
	storyOrder, shortOrders, parse, genOf, nearestEmpty, energyIn, dueTier, nextTier, claimTier, stepOf, missingGens, mapReady, solveMap, storyBlocker, factKnown, SAVE_V, CELLS, type State,
	genMax, genChargeMs, genUpgradeState, upgradeGen, rechargeGen, fullIn,
} from './engine';
import { CHAINS, GENERATORS, ORDERS, UPGRADES, ENERGY_MAX, ENERGY_MS, COLS, START_BOARD, PROJECTS, FACES, GEN_LEVELS, WELCOME_MS, WELCOME_CHARGE_MS } from './data';
import { CHARACTERS } from './characters';

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

	it('each project has its steps 1..n once, in order', () => {
		for (const p of PROJECTS) {
			expect(ORDERS.filter((o) => o.project === p.id).map((o) => o.step), p.id).toEqual(Array.from({ length: p.steps }, (_, k) => k + 1));
		}
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
		expect(r.s.gens.tiroir.charges).toBe(genMax(s, 'tiroir') - 1);
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
		for (let k = 0; k < genMax(s, 'tiroir'); k++) {
			const r = produce(s, g, T0);
			expect(r.ok).toBe(true);
			if (r.ok) s = r.s;
		}
		expect(produce(s, g, T0)).toEqual({ ok: false, why: 'charges' });
		const later = produce(s, g, T0 + genChargeMs(s, 'tiroir', T0));
		expect(later.ok).toBe(true);
	});

	it('the welcome quarter-hour refills fast, then the level sets the pace', () => {
		const s = newGame(T0);
		expect(genChargeMs(s, 'boite', T0)).toBe(WELCOME_CHARGE_MS);
		expect(genChargeMs(s, 'boite', T0 + WELCOME_MS)).toBe(GEN_LEVELS[0].chargeMs);
	});

	it('a generator level costs coins, comes back full and refills faster', () => {
		let s = { ...newGame(T0), coins: 1000, welcomeUntil: 0 };
		expect(genUpgradeState({ ...s, coins: 0 }, 'boite')).toBe('poor');
		s = upgradeGen(s, 'boite', T0);
		expect(s.gens.boite.level).toBe(2);
		expect(s.coins).toBe(1000 - GEN_LEVELS[1].cost);
		expect(s.gens.boite.charges).toBe(GEN_LEVELS[1].charges);
		expect(genChargeMs(s, 'boite', T0)).toBeLessThan(GEN_LEVELS[0].chargeMs);
		for (let k = 2; k < GEN_LEVELS.length; k++) s = upgradeGen(s, 'boite', T0);
		expect(genUpgradeState(s, 'boite')).toBe('max');
		expect(upgradeGen(s, 'boite', T0)).toBe(s);
	});

	it('a recharge fills an empty generator at once', () => {
		let s = { ...newGame(T0), welcomeUntil: 0 };
		const g = genCell(s, 'tiroir');
		for (let k = 0; k < genMax(s, 'tiroir'); k++) { const r = produce(s, g, T0); if (r.ok) s = r.s; }
		expect(produce(s, g, T0)).toEqual({ ok: false, why: 'charges' });
		s = rechargeGen(s, 'tiroir', T0);
		expect(produce(s, g, T0).ok).toBe(true);
	});

	it('fullIn counts every missing charge at the current pace', () => {
		const s = { ...newGame(T0), welcomeUntil: 0 };
		const e = { ...s, gens: { ...s.gens, tiroir: { ...s.gens.tiroir, charges: 0, at: T0 } } };
		expect(fullIn(e, 'tiroir', T0 + 10_000)).toBe(GEN_LEVELS[0].charges * GEN_LEVELS[0].chargeMs - 10_000);
		expect(fullIn(s, 'tiroir', T0)).toBe(0);
	});

	it('old saves keep their generators at level 1 and get the welcome quarter-hour', () => {
		const old = JSON.parse(save(newGame(T0)));
		for (const g of Object.keys(old.gens)) delete old.gens[g].level;
		delete old.welcomeUntil;
		const s = load(JSON.stringify(old), T0 + 86_400_000);
		expect(s.gens.boite.level).toBe(1);
		expect(s.welcomeUntil).toBe(T0 + 86_400_000 + WELCOME_MS);
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

	it('plays the whole campaign, then neighbourhood orders take over', () => {
		let s: State = { ...newGame(T0), coins: 500 };
		const give = (st: State, id: string): State => {
			const o = activeOrders(st).find((x) => x.id === id);
			expect(o, `${id} open among ${activeOrders(st).map((x) => x.id)}`).toBeDefined();
			// Reachable for real: whatever it asks for, its generator is already on the board.
			for (const p of o!.needs) expect(st.board, `${id} needs ${p}`).toContain(`g:${CHAINS[parse(p)!.chain].gen}`);
			const n = { ...st, board: st.board.slice() };
			for (const p of o!.needs) n.board[n.board.indexOf(null)] = p;
			const r = deliver(n, id);
			expect(r.ok, id).toBe(true);
			return r.ok ? r.s : st;
		};
		s = buyUpgrade(s, 'etabli');
		for (const id of ['garnier-1', 'lucas-1', 'morel-1', 'garnier-2', 'chen-1', 'morel-2', 'lucas-2', 'morel-3']) s = give(s, id);
		expect(stepOf(s, 'montre')).toBe(3);
		expect(storyOrder(s)).toBeNull(); // the radio waits for the photo
		s = buyUpgrade(s, 'photo');
		expect(storyOrder(s)?.id).toBe('radio-1');
		s = give(s, 'radio-1');
		expect(storyOrder(s)).toBeNull(); // step 2 needs the electrician's crate
		s = buyUpgrade(s, 'etageres');
		expect(s.board).toContain('g:caisse');
		for (const id of ['facteur-1', 'chen-2', 'radio-2', 'lucas-3', 'radio-3', 'voilier-1', 'boulangere-1']) s = give(s, id);
		expect(stepOf(s, 'radio')).toBe(3);
		expect(storyOrder(s)).toBeNull(); // the mast waits for the woodwork corner
		s = buyUpgrade(s, 'menuiserie');
		for (const id of ['chen-3', 'voilier-2', 'morel-4', 'voilier-3']) s = give(s, id);
		expect(stepOf(s, 'voilier')).toBe(3);
		for (const id of ['boite-1', 'lucas-4', 'boite-2', 'chen-4']) s = give(s, id);
		expect(storyOrder(s)).toBeNull(); // the box's last step waits for the office to be opened
		s = buyUpgrade(s, 'bureau');
		s = give(s, 'boite-3');
		expect(stepOf(s, 'boite')).toBe(3);
		s = give(s, 'fauteuil-1');
		expect(storyOrder(s)).toBeNull(); // the seat waits for the sewing corner
		s = buyUpgrade(s, 'couture');
		for (const id of ['garnier-3', 'fauteuil-2', 'lucas-5', 'fauteuil-3']) s = give(s, id);
		expect(stepOf(s, 'fauteuil')).toBe(3);
		expect(storyOrder(s)).toBeNull(); // the chest waits for the map puzzle
		expect(mapReady(s)).toBe(true);
		s = solveMap(s);
		expect(mapReady(s)).toBe(false);
		for (const id of ['malle-1', 'boulangere-2', 'malle-2', 'morel-5', 'malle-3']) s = give(s, id);
		expect(stepOf(s, 'malle')).toBe(3);
		for (const id of ['musique-1', 'lucas-6', 'musique-2', 'garnier-4', 'musique-3']) s = give(s, id);
		expect(stepOf(s, 'musique')).toBe(3);
		// Season 2 follows straight on, before any neighbourhood order.
		for (const id of ['boussole-1', 'chen-5', 'boussole-2', 'boussole-3', 'fanal-1', 'boulangere-3', 'fanal-2', 'fanal-3',
			'longuevue-1', 'garnier-5', 'longuevue-2', 'longuevue-3', 'coffre-1', 'lucas-7', 'coffre-2', 'coffre-3']) s = give(s, id);
		expect(storyOrder(s)).toBeNull(); // the dinghy waits for the boat shed
		expect(storyBlocker(s)).toEqual({ kind: 'upgrade', id: 'hangar' });
		s = buyUpgrade(s, 'hangar');
		expect(s.board).toContain('g:greeur');
		for (const id of ['mouette-1', 'facteur-2', 'mouette-2', 'morel-6', 'mouette-3', 'cloche-1', 'chen-6', 'cloche-2', 'cloche-3']) s = give(s, id);
		expect(stepOf(s, 'cloche')).toBe(3);
		for (const p of ['cadre', 'travailleuse', 'tabouret', 'bobines', 'carnet', 'valise', 'etal', 'presentoir', 'balance', 'caissette', 'casier', 'toupie'] as const) {
			for (const id of ORDERS.filter((o) => o.project === p || (o.kind === 'short' && o.when?.project === p)).map((o) => o.id)) s = give(s, id);
			expect(stepOf(s, p), p).toBe(3);
		}
		expect(storyOrder(s)).toBeNull();
		const locals = shortOrders(s);
		expect(locals.length).toBe(2);
		for (const o of locals) for (const p of o.needs) expect(parse(p)).not.toBeNull();
		s = give(s, locals[0].id);
		expect(shortOrders(s).length).toBe(2);
		expect(shortOrders(s)[0].id).toBe(locals[1].id);
	});

});

describe('generators behind upgrades', () => {
	it('the crate lands on the board when the shelves are bought, and waits on a full board', () => {
		const base = { ...newGame(T0), coins: 100, progress: { ...newGame(T0).progress, montre: 3, radio: 1, voilier: 0 } };
		expect(base.board).not.toContain('g:caisse');
		const full = { ...base, board: base.board.map((p) => p ?? 'meca:6') };
		const bought = buyUpgrade(full, 'etageres');
		expect(bought.upgrades).toContain('etageres');
		expect(bought.board).not.toContain('g:caisse');
		expect(missingGens(bought)).toEqual(['caisse']);
		const freed = sell(bought, bought.board.indexOf('meca:6'));
		expect(freed.board).toContain('g:caisse');
		expect(missingGens(freed)).toEqual([]);
	});

	it('a merge frees a cell for a generator waiting on a full board (ticket 0007)', () => {
		const base = { ...newGame(T0), coins: 100, progress: { ...newGame(T0).progress, montre: 3, radio: 1, voilier: 0 } };
		const full = { ...base, board: base.board.map((p) => p ?? 'meca:6') };
		full.board[0] = 'outil:1'; full.board[1] = 'outil:1';
		const bought = buyUpgrade(full, 'etageres');
		expect(missingGens(bought)).toEqual(['caisse']);
		const merged = move(bought, 0, 1).s;
		expect(merged.board).toContain('g:caisse');
	});

	it('neighbourhood orders kept by a migrated save wait for the end of the campaign (ticket 0007)', () => {
		const q = { id: 'q1', kind: 'short' as const, client: 'Lucas', ask: '?', needs: ['meca:2'], reward: { coins: 5, rep: 1 } };
		const s = { ...newGame(T0), progress: { ...newGame(T0).progress, montre: 3, radio: 2, voilier: 0 }, done: ORDERS.filter((o) => o.kind === 'short').map((o) => o.id), endless: [q], upgrades: ['etabli', 'photo', 'etageres'] };
		expect(activeOrders(s).map((o) => o.id)).not.toContain('q1');
		expect(deliver({ ...s, board: s.board.map((p, i) => (i === 0 ? 'meca:2' : p)) }, 'q1').ok).toBe(false);
	});

	it('neighbourhood orders only ask for chains whose generator is on the board', () => {
		let s: State = { ...newGame(T0, 11), progress: { ...newGame(T0).progress, montre: 3, radio: 3, voilier: 3 }, done: ORDERS.map((o) => o.id) };
		const n = buyUpgrade({ ...s, coins: 100 }, 'photo'); // refill runs on purchase
		s = n;
		for (const o of shortOrders(s)) for (const p of o.needs) expect(parse(p)!.chain).not.toBe('elec');
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

	it('migrates a v1 save: the watch step becomes the watch progress', () => {
		const v1 = { ...JSON.parse(save(newGame(T0))), v: 1, step: 2, seen: ['intro', 'arrival'] };
		delete v1.progress;
		const back = load(JSON.stringify(v1), T0);
		expect(back.v).toBe(SAVE_V);
		expect(stepOf(back, 'montre')).toBe(2);
		expect(stepOf(back, 'radio')).toBe(0);
		expect(back.seen).toContain('arrival:montre');
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

describe('reputation tiers', () => {
	it('pays a reached threshold exactly once', () => {
		const s = { ...newGame(T0), rep: 4 };
		expect(dueTier(s)).toBeNull();
		expect(nextTier(s)?.at).toBe(5);
		const r = { ...s, rep: 5 };
		const t = dueTier(r)!;
		expect(t.id).toBe('rep-5');
		const paid = claimTier(r, t.id);
		expect(paid.energy).toBe(r.energy + t.reward.energy);
		expect(dueTier(paid)).toBeNull();
		expect(claimTier(paid, t.id)).toBe(paid);
		expect(claimTier(s, t.id)).toBe(s); // not reached yet
	});

	it('the first tier lands with the first restoration step', () => {
		let s: State = { ...newGame(T0), coins: 100 };
		s = { ...s, board: s.board.slice() };
		s.board[0] = 'outil:2';
		const a = deliver(s, 'garnier-1');
		if (!a.ok) throw new Error('garnier-1');
		const b = buyUpgrade(a.s, 'etabli');
		const c = { ...b, board: b.board.slice() };
		c.board[0] = 'soin:3';
		const d = deliver(c, 'morel-1');
		if (!d.ok) throw new Error('morel-1');
		expect(dueTier(b)).toBeNull();
		expect(dueTier(d.s)?.id).toBe('rep-5');
	});
});

describe('what the story waits for', () => {
	it('names the upgrade, then the map, and nothing while an order is open', () => {
		const base = newGame(T0);
		expect(storyBlocker(base)).toEqual({ kind: 'upgrade', id: 'etabli' });
		const open = { ...base, upgrades: ['etabli'] };
		expect(storyOrder(open)?.id).toBe('morel-1');
		expect(storyBlocker(open)).toBeNull();
		const photo = { ...base, upgrades: ['etabli'], progress: { ...base.progress, montre: 3 }, done: ['morel-1', 'morel-2', 'morel-3'] };
		expect(storyBlocker(photo)).toEqual({ kind: 'upgrade', id: 'photo' });
		const map = { ...base, progress: { ...base.progress, montre: 3, radio: 3, voilier: 3, boite: 3, fauteuil: 3 }, done: ORDERS.filter((o) => o.project && o.project !== 'malle' && o.project !== 'musique').map((o) => o.id) };
		expect(storyBlocker(map)).toEqual({ kind: 'map' });
		expect(storyBlocker(solveMap(map))).toBeNull();
	});
});

describe('trombinoscope', () => {
	it('every character has a portrait and gates that exist', () => {
		const projects = new Set(PROJECTS.map((p) => p.id));
		const ups = new Set(UPGRADES.map((u) => u.id));
		for (const c of CHARACTERS) {
			expect(FACES[c.face], c.id).toBeDefined();
			for (const f of c.facts) {
				if (f.when) expect(projects.has(f.when.project), `${c.id}: ${f.when.project}`).toBe(true);
				if (f.after) expect(ups.has(f.after), `${c.id}: ${f.after}`).toBe(true);
			}
		}
	});

	it('a fresh game knows only the opening facts, and nothing about Rose', () => {
		const s = newGame(T0);
		const known = CHARACTERS.map((c) => [c.id, c.facts.filter((f) => factKnown(s, f)).length] as const);
		expect(Object.fromEntries(known)).toMatchObject({ jeanne: 1, garnier: 1, rose: 0, lucile: 0, yves: 0 });
	});

	it('the whole campaign unlocks every fact', () => {
		const s = { ...newGame(T0), upgrades: UPGRADES.map((u) => u.id), seen: ['rep-5', 'map-solved'], progress: Object.fromEntries(PROJECTS.map((p) => [p.id, p.steps])) as State['progress'] };
		for (const c of CHARACTERS) for (const f of c.facts) expect(factKnown(s, f), `${c.id}: ${f.text}`).toBe(true);
	});
});
