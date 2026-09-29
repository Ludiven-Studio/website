/* Balance sim for L'Atelier des Souvenirs. A greedy bot plays the chapter on N seeds and
   reports, per milestone, the energy spent, the taps and an estimate of the wall-clock time.
   The GDD's questions this answers: how soon the first restoration lands, whether the chapter
   fits the starting energy, and how often the board jams.

   The bot is a floor, not a player: it never plans a layout, so a human spends a little
   more energy on waste and a little less on jams. Read the medians, not single runs.

   Usage: npx tsx scripts/atelier-sim.ts [seeds] */
import {
	newGame, produce, move, deliver, buyUpgrade, sell, activeOrders, parse, genOf, unitCost,
	upgradeState, type State, type Piece,
} from '../src/games/atelier/engine';
import { GENERATORS, CHAINS, ENERGY_MAX, type GenId, type ChainId } from '../src/games/atelier/data';

const N = Number(process.argv[2] ?? 300);
const TAP_S = 0.9;
const DRAG_S = 1.6;
const T0 = 1_700_000_000_000;

interface Mark { energy: number; taps: number; sec: number }
interface Run {
	marks: Record<string, Mark>;
	fullHits: number;
	chargeWaits: number;
	sold: number;
	boughtEnergy: number;
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
	let energy = 0, taps = 0, sec = 0;
	const run: Run = { marks: {}, fullHits: 0, chargeWaits: 0, sold: 0, boughtEnergy: 0 };
	const act = (dt: number) => { taps++; sec += dt; now += dt * 1000; if (process.env.TRACE && seed === 1) console.log(`e${energy} step${s.step} orders=${activeOrders(s).map((o) => o.id + "[" + o.needs + "]").join(" ")} board=${s.board.filter(Boolean).join(",")}`); };
	for (let guard = 0; guard < 5000 && s.step < 3; guard++) {
		const d = activeOrders(s).find((o) => deliver(s, o.id).ok);
		if (d) {
			const r = deliver(s, d.id);
			if (r.ok) { s = r.s; act(TAP_S); run.marks[d.id] = { energy, taps, sec }; }
			continue;
		}
		if (upgradeState(s, 'etabli') === 'ok') { s = buyUpgrade(s, 'etabli'); act(TAP_S * 2); run.marks.etabli = { energy, taps, sec }; continue; }
		const m = bestMerge(s);
		if (m) { s = move(s, m[0], m[1]).s; act(DRAG_S); continue; }
		// Produce from the generator whose chains lack the most.
		const gens = (Object.keys(GENERATORS) as GenId[]).map((g) => ({
			g,
			want: GENERATORS[g].out.reduce((a, o) => a + Math.max(0, deficit(s, o.chain)), 0),
		})).sort((a, b) => b.want - a.want);
		const g = gens[0].want > 0 ? gens[0].g : 'boite';
		const cell = s.board.findIndex((p) => genOf(p) === g);
		if (s.energy < 1) { s = { ...s, energy: s.energy + 15 }; run.boughtEnergy += 15; }
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
			run.chargeWaits++;
			// Waiting: the other generator may still have charges, else the clock runs.
			const other = (Object.keys(GENERATORS) as GenId[]).find((x) => x !== g && s.gens[x].charges > 0);
			if (other && GENERATORS[other].out.some((o) => deficit(s, o.chain) > 0)) {
				const r2 = produce(s, s.board.findIndex((p) => genOf(p) === other), now);
				if (r2.ok) { s = r2.s; energy++; act(TAP_S); continue; }
			}
			now += 1000; sec += 1;
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
const keys = ['garnier-1', 'etabli', 'lucas-1', 'morel-1', 'garnier-2', 'chen-1', 'morel-2', 'lucas-2', 'morel-3'];
console.log(`${N} runs · start energy ${ENERGY_MAX} · story steps give +10 each`);
console.log('milestone     energy p10/med/p90     taps med   time med');
for (const k of keys) {
	const ms = runs.map((r) => r.marks[k]).filter(Boolean);
	if (!ms.length) { console.log(`${k.padEnd(12)}  never`); continue; }
	const e = ms.map((m) => m.energy), t = ms.map((m) => m.taps), s = ms.map((m) => m.sec);
	const fmt = (x: number) => { const r = Math.round(x); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`; };
	console.log(`${k.padEnd(12)}  ${String(pct(e, 0.1)).padStart(4)} ${String(pct(e, 0.5)).padStart(4)} ${String(pct(e, 0.9)).padStart(4)}          ${String(pct(t, 0.5)).padStart(4)}      ${fmt(pct(s, 0.5))}${ms.length < N ? `  (${ms.length}/${N})` : ''}`);
}
// Per-run spans between story steps: subtracting cumulative medians would hide the spread.
console.log('span                energy p10/med/p90     time med/p90');
for (const [a, b] of [['etabli', 'morel-1'], ['morel-1', 'morel-2'], ['morel-2', 'morel-3']]) {
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
