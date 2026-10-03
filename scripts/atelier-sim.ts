/* Balance sim for L'Atelier des Souvenirs. A greedy bot plays the chapter on N seeds and
   reports, per milestone, the energy spent, the taps and an estimate of the wall-clock time.
   The GDD's questions this answers: how soon the first restoration lands, whether the chapter
   fits the starting energy, and how often the board jams.

   The bot is a floor, not a player: it never plans a layout, so a human spends a little
   more energy on waste and a little less on jams. Read the medians, not single runs.

   Usage: npx tsx scripts/atelier-sim.ts [seeds] */
import {
	newGame, produce, move, deliver, buyUpgrade, sell, activeOrders, parse, genOf, unitCost,
	upgradeState, stepOf, mapReady, solveMap, tick, energyIn, chargeIn, genUpgradeState, upgradeGen, type State, type Piece,
} from '../src/games/atelier/engine';
import { GENERATORS, CHAINS, ENERGY_MAX, UPGRADES, GEN_LEVELS, type GenId, type ChainId } from '../src/games/atelier/data';

const N = Number(process.argv[2] ?? 300);
const TAP_S = 0.9;
const DRAG_S = 1.6;
const T0 = 1_700_000_000_000;

/** `sec`: wall clock, waits included (the bot never pays to skip one). `play`: active seconds only. */
interface Mark { energy: number; taps: number; sec: number; play: number }
interface Run {
	marks: Record<string, Mark>;
	fullHits: number;
	chargeWaits: number;
	energyWait: number;
	sold: number;
	boughtEnergy: number;
	/** Active play before the first wait longer than 20 s. */
	firstWait: number | null;
	genLevels: Record<string, number>;
	coinsSpentOnGens: number;
}

function needMap(s: State): Map<Piece, number> {
	const m = new Map<Piece, number>();
	for (const o of activeOrders(s)) for (const p of o.needs) m.set(p, (m.get(p) ?? 0) + 1);
	return m;
}

const countOf = (s: State, p: Piece): number => s.board.filter((x) => x === p).length;

/** Level-1 units of a chain still missing for the open orders. */
function deficit(s: State, chain: ChainId): number {
	let need = 0, top = 0;
	for (const [p, k] of needMap(s)) {
		const i = parse(p)!;
		if (i.chain !== chain) continue;
		need += unitCost(p) * k;
		top = Math.max(top, i.level);
	}
	// An item above every asked level can never become one: it does not count.
	let have = 0;
	for (const p of s.board) {
		const i = parse(p);
		if (i && i.chain === chain && i.level <= top) have += unitCost(p!);
	}
	return need - have;
}

function bestMerge(s: State): [number, number] | null {
	const need = needMap(s);
	let best: [number, number] | null = null, bestL = Infinity;
	const seen = new Map<Piece, number>();
	for (let i = 0; i < s.board.length; i++) {
		const p = s.board[i];
		const inf = parse(p);
		if (!inf || inf.level >= inf.max) continue;
		// Keep what an order already asks for.
		if (countOf(s, p!) - 2 < (need.get(p!) ?? 0)) continue;
		// Merging past the highest level any order wants is waste, unless space is short.
		const top = Math.max(0, ...[...need.keys()].map(parse).filter((x) => x!.chain === inf.chain).map((x) => x!.level));
		const free = s.board.filter((x) => x === null).length;
		if (inf.level >= top && free > 6) continue;
		const j = seen.get(p!);
		if (j === undefined) { seen.set(p!, i); continue; }
		if (inf.level < bestL) { bestL = inf.level; best = [j, i]; }
	}
	return best;
}

function sellOne(s: State): State | null {
	const need = needMap(s);
	let pick = -1, score = Infinity;
	for (let i = 0; i < s.board.length; i++) {
		const p = s.board[i];
		const inf = parse(p);
		if (!inf) continue;
		if (countOf(s, p!) <= (need.get(p!) ?? 0)) continue;
		const useful = deficit(s, inf.chain) > 0 ? 100 : 0;
		const v = useful + inf.level;
		if (v < score) { score = v; pick = i; }
	}
	return pick < 0 ? null : sell(s, pick);
}

function play(seed: number): Run {
	let s = newGame(T0, seed);
	let now = T0;
	let energy = 0, taps = 0, sec = 0, played = 0;
	const run: Run = { marks: {}, fullHits: 0, chargeWaits: 0, energyWait: 0, sold: 0, boughtEnergy: 0, firstWait: null, genLevels: {}, coinsSpentOnGens: 0 };
	const act = (dt: number) => { taps++; sec += dt; played += dt; now += dt * 1000; if (process.env.TRACE && seed === 1) console.log(`e${energy} ${JSON.stringify(s.progress)} orders=${activeOrders(s).map((o) => o.id + "[" + o.needs + "]").join(" ")} board=${s.board.filter(Boolean).join(",")}`); };
	const wait = (ms: number, kind: 'energy' | 'charge') => {
		const dt = Math.max(1, Math.ceil(ms / 1000));
		if (dt > 20 && run.firstWait === null) run.firstWait = played;
		sec += dt; now += dt * 1000;
		if (kind === 'energy') run.energyWait += dt; else run.chargeWaits += dt;
		s = tick(s, now);
	};
	const mark = (k: string) => { run.marks[k] = { energy, taps, sec, play: played }; };
	for (let guard = 0; guard < 40000 && stepOf(s, 'toupie') < 3; guard++) {
		const d = activeOrders(s).find((o) => deliver(s, o.id).ok);
		if (d) {
			const r = deliver(s, d.id);
			if (r.ok) { s = r.s; act(TAP_S); mark(d.id); }
			continue;
		}
		if (mapReady(s)) { s = solveMap(s); act(8); mark('carte'); continue; }
		// A player buys each workshop upgrade as soon as it is affordable; the gates matter, the rest is décor.
		const up = UPGRADES.find((u) => upgradeState(s, u.id) === 'ok');
		if (up) { s = buyUpgrade(s, up.id); act(TAP_S * 2); mark(up.id); continue; }
		// Then a generator level, for the busiest generator on the bench, keeping a small cushion of coins.
		const busy = (Object.keys(GENERATORS) as GenId[])
			.filter((g) => s.board.some((p) => genOf(p) === g) && genUpgradeState(s, g) === 'ok' && s.coins >= GEN_LEVELS[s.gens[g].level].cost + 20)
			.sort((a, b) => GENERATORS[b].out.reduce((x, o) => x + Math.max(0, deficit(s, o.chain)), 0) - GENERATORS[a].out.reduce((x, o) => x + Math.max(0, deficit(s, o.chain)), 0))[0];
		if (busy) {
			run.coinsSpentOnGens += GEN_LEVELS[s.gens[busy].level].cost;
			s = upgradeGen(s, busy, now); act(TAP_S * 2);
			run.genLevels[`${busy}${s.gens[busy].level}`] = played;
			continue;
		}
		const m = bestMerge(s);
		if (m) { s = move(s, m[0], m[1]).s; act(DRAG_S); continue; }
		// Produce from the generator whose chains lack the most.
		const gens = (Object.keys(GENERATORS) as GenId[]).map((g) => ({
			g,
			want: GENERATORS[g].out.reduce((a, o) => a + Math.max(0, deficit(s, o.chain)), 0),
		})).sort((a, b) => b.want - a.want);
		const g = gens[0].want > 0 ? gens[0].g : 'boite';
		const cell = s.board.findIndex((p) => genOf(p) === g);
		s = tick(s, now);
		if (s.energy < 1) { wait(energyIn(s, now), 'energy'); continue; }
		const r = produce(s, cell, now);
		if (r.ok) { s = r.s; energy++; act(TAP_S); continue; }
		if (r.why === 'full') {
			run.fullHits++;
			const sold = sellOne(s);
			if (!sold) break;
			s = sold; run.sold++; act(TAP_S * 2);
			continue;
		}
		if (r.why === 'charges') {
			// Waiting: another useful generator may still have charges, else the clock runs to the next charge.
			const other = (Object.keys(GENERATORS) as GenId[]).find((x) => x !== g && s.board.some((p) => genOf(p) === x) && s.gens[x].charges > 0 && GENERATORS[x].out.some((o) => deficit(s, o.chain) > 0));
			if (other) {
				const r2 = produce(s, s.board.findIndex((p) => genOf(p) === other), now);
				if (r2.ok) { s = r2.s; energy++; act(TAP_S); continue; }
			}
			wait(chargeIn(s, g, now), 'charge');
			continue;
		}
		break;
	}
	return run;
}

const pct = (xs: number[], q: number): number => {
	const a = xs.slice().sort((x, y) => x - y);
	return a[Math.min(a.length - 1, Math.floor(q * a.length))];
};

const runs = Array.from({ length: N }, (_, k) => play(k + 1));
const keys = ['garnier-1', 'etabli', 'lucas-1', 'morel-1', 'garnier-2', 'chen-1', 'morel-2', 'lucas-2', 'morel-3', 'photo', 'radio-1', 'facteur-1', 'etageres', 'chen-2', 'radio-2', 'lucas-3', 'radio-3', 'voilier-1', 'boulangere-1', 'menuiserie', 'chen-3', 'voilier-2', 'morel-4', 'voilier-3', 'boite-1', 'lucas-4', 'boite-2', 'chen-4', 'bureau', 'boite-3', 'fauteuil-1', 'couture', 'garnier-3', 'fauteuil-2', 'lucas-5', 'fauteuil-3', 'carte', 'malle-1', 'boulangere-2', 'malle-2', 'morel-5', 'malle-3', 'musique-1', 'lucas-6', 'musique-2', 'garnier-4', 'musique-3',
	'boussole-3', 'fanal-3', 'longuevue-3', 'coffre-3', 'hangar', 'mouette-3', 'cloche-3',
	'cadre-3', 'travailleuse-3', 'tabouret-3', 'bobines-3', 'carnet-3', 'valise-3',
	'etal-3', 'presentoir-3', 'balance-3', 'caissette-3', 'casier-3', 'toupie-3'];
const hm = (x: number) => { const m = Math.round(x / 60); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
console.log(`${N} runs · start energy ${ENERGY_MAX} · story steps give +10 each · seasons 1-4 (25 chapters) · waits are waited, never bought`);
console.log('milestone     energy p10/med/p90     taps med   play med   wall clock med');
for (const k of keys) {
	const ms = runs.map((r) => r.marks[k]).filter(Boolean);
	if (!ms.length) { console.log(`${k.padEnd(12)}  never`); continue; }
	const e = ms.map((m) => m.energy), t = ms.map((m) => m.taps), s = ms.map((m) => m.sec), p = ms.map((m) => m.play);
	console.log(`${k.padEnd(12)}  ${String(pct(e, 0.1)).padStart(4)} ${String(pct(e, 0.5)).padStart(4)} ${String(pct(e, 0.9)).padStart(4)}          ${String(pct(t, 0.5)).padStart(4)}      ${hm(pct(p, 0.5)).padStart(5)}      ${hm(pct(s, 0.5))}${ms.length < N ? `  (${ms.length}/${N})` : ''}`);
}
const fw = runs.map((r) => r.firstWait ?? Infinity);
console.log(`first wait > 20 s after active play: p10 ${hm(pct(fw, 0.1))}, med ${hm(pct(fw, 0.5))}, p90 ${hm(pct(fw, 0.9))}`);
console.log(`waits in total: energy med ${hm(pct(runs.map((r) => r.energyWait), 0.5))}, charges med ${hm(pct(runs.map((r) => r.chargeWaits), 0.5))}`);
console.log(`coins spent on generator levels: med ${pct(runs.map((r) => r.coinsSpentOnGens), 0.5)}`);
for (const lv of ['boite2', 'boite3', 'boite4', 'tiroir2', 'tiroir3', 'tiroir4']) {
	const at = runs.map((r) => r.genLevels[lv]).filter((x) => x !== undefined);
	console.log(`  ${lv} bought by ${at.length}/${N} runs, at play med ${at.length ? hm(pct(at, 0.5)) : '-'}`);
}
// Per-run spans between story steps: subtracting cumulative medians would hide the spread.
console.log('span                energy p10/med/p90     time med/p90');
for (const [a, b] of [['etabli', 'morel-1'], ['morel-1', 'morel-2'], ['morel-2', 'morel-3'], ['morel-3', 'radio-1'], ['radio-1', 'radio-2'], ['radio-2', 'radio-3'], ['radio-3', 'voilier-1'], ['voilier-1', 'voilier-2'], ['voilier-2', 'voilier-3'], ['voilier-3', 'boite-1'], ['boite-1', 'boite-2'], ['boite-2', 'boite-3'], ['boite-3', 'fauteuil-1'], ['fauteuil-1', 'fauteuil-2'], ['fauteuil-2', 'fauteuil-3'], ['fauteuil-3', 'malle-1'], ['malle-1', 'malle-2'], ['malle-2', 'malle-3'], ['malle-3', 'musique-1'], ['musique-1', 'musique-2'], ['musique-2', 'musique-3'],
	['musique-3', 'boussole-3'], ['boussole-3', 'fanal-3'], ['fanal-3', 'longuevue-3'], ['longuevue-3', 'coffre-3'], ['coffre-3', 'mouette-3'], ['mouette-3', 'cloche-3'],
	['cloche-3', 'cadre-3'], ['cadre-3', 'travailleuse-3'], ['travailleuse-3', 'tabouret-3'], ['tabouret-3', 'bobines-3'], ['bobines-3', 'carnet-3'], ['carnet-3', 'valise-3'],
	['valise-3', 'etal-3'], ['etal-3', 'presentoir-3'], ['presentoir-3', 'balance-3'], ['balance-3', 'caissette-3'], ['caissette-3', 'casier-3'], ['casier-3', 'toupie-3']]) {
	const ok = runs.filter((r) => r.marks[a] && r.marks[b]);
	const e = ok.map((r) => r.marks[b].energy - r.marks[a].energy);
	const t = ok.map((r) => r.marks[b].sec - r.marks[a].sec);
	const fmt = (x: number) => { const r = Math.round(x); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`; };
	console.log(`${`${a} → ${b}`.padEnd(19)} ${String(pct(e, 0.1)).padStart(4)} ${String(pct(e, 0.5)).padStart(4)} ${String(pct(e, 0.9)).padStart(4)}          ${fmt(pct(t, 0.5))} / ${fmt(pct(t, 0.9))}`);
}
const bought = runs.map((r) => r.boughtEnergy);
console.log(`energy bought to finish: med ${pct(bought, 0.5)}, p90 ${pct(bought, 0.9)}, runs needing any: ${bought.filter((b) => b > 0).length}/${N}`);
console.log(`board full hits: med ${pct(runs.map((r) => r.fullHits), 0.5)}, p90 ${pct(runs.map((r) => r.fullHits), 0.9)} · sold med ${pct(runs.map((r) => r.sold), 0.5)}`);
console.log(`charge waits: med ${pct(runs.map((r) => r.chargeWaits), 0.5)}s, p90 ${pct(runs.map((r) => r.chargeWaits), 0.9)}s`);
void CHAINS;
