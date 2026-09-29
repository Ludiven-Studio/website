// L'Atelier des Souvenirs — pure merge-2 engine. Every action takes a state and returns a
// new one, so the island, the tests and the balance sim share one set of rules.
// Pieces are strings: 'g:boite' is a generator, 'outil:3' is a level-3 item of a chain.

import {
	CHAINS, GENERATORS, ORDERS, UPGRADES, START_BOARD, LOCALS, COLS, ROWS, REP_TIERS, PROJECTS,
	ENERGY_MAX, ENERGY_MS,
	type ChainId, type GenId, type Order, type Reward, type RepTier, type Gate, type ProjectId, type Project,
} from './data';

// v1: one watch, `step`. v2: one progress counter per project (chapter); v1 saves migrate in load().
export const SAVE_V = 2;
export const CELLS = COLS * ROWS;

export type Piece = string;

export interface GenState {
	charges: number;
	/** Start of the charge being refilled. */
	at: number;
}

export interface State {
	v: number;
	board: (Piece | null)[];
	energy: number;
	/** Start of the energy point being refilled. */
	energyAt: number;
	gens: Record<GenId, GenState>;
	coins: number;
	rep: number;
	/** rng state for generator outputs and neighbourhood orders. */
	seed: number;
	done: string[];
	/** Restoration steps delivered, per project. */
	progress: Record<ProjectId, number>;
	upgrades: string[];
	/** Neighbourhood orders drawn once the campaign's orders are all done. */
	endless: Order[];
	endlessN: number;
	/** Tutorial: 0 tap a generator, 1 merge, 2 deliver, 3 buy the bench, 4 done. */
	tut: number;
	/** Scenes already shown (intro, arrival, epilogue…). */
	seen: string[];
	stats: { produced: number; merges: number; sold: number; delivered: number };
}

export type Fail = 'energy' | 'charges' | 'full' | 'none';

export interface ItemInfo {
	chain: ChainId;
	level: number;
	name: string;
	max: number;
}

export function parse(p: Piece | null): ItemInfo | null {
	if (!p || p.startsWith('g:')) return null;
	const [c, l] = p.split(':');
	const chain = CHAINS[c as ChainId];
	const level = Number(l);
	if (!chain || !(level >= 1 && level <= chain.items.length)) return null;
	return { chain: chain.id, level, name: chain.items[level - 1], max: chain.items.length };
}

export const genOf = (p: Piece | null): GenId | null =>
	p && p.startsWith('g:') && p.slice(2) in GENERATORS ? (p.slice(2) as GenId) : null;

export const code = (chain: ChainId, level: number): Piece => `${chain}:${level}`;

export function pieceName(p: Piece): string {
	const g = genOf(p);
	if (g) return GENERATORS[g].name;
	return parse(p)?.name ?? p;
}

/** Level-1 draws a level-n item stands for: the deterministic floor of its cost. */
export const unitCost = (p: Piece): number => {
	const i = parse(p);
	return i ? 2 ** (i.level - 1) : 0;
};

const noProgress = (): Record<ProjectId, number> =>
	Object.fromEntries(PROJECTS.map((p) => [p.id, 0])) as Record<ProjectId, number>;

export const stepOf = (s: State, p: ProjectId): number => s.progress[p] ?? 0;

export const gateOk = (s: State, g: Gate | undefined): boolean => !g || stepOf(s, g.project) >= g.step;

export const projectOf = (id: ProjectId): Project => PROJECTS.find((p) => p.id === id)!;

export function newGame(now: number, seed = (now ^ 0x5bd1e995) >>> 0): State {
	const board: (Piece | null)[] = Array(CELLS).fill(null);
	for (const [i, p] of Object.entries(START_BOARD)) board[Number(i)] = p;
	const gens = {} as Record<GenId, GenState>;
	for (const g of Object.values(GENERATORS)) gens[g.id] = { charges: g.charges, at: now };
	return {
		v: SAVE_V,
		board,
		energy: ENERGY_MAX,
		energyAt: now,
		gens,
		coins: 0,
		rep: 0,
		seed: seed >>> 0,
		done: [],
		progress: noProgress(),
		upgrades: [],
		endless: [],
		endlessN: 0,
		tut: 0,
		seen: [],
		stats: { produced: 0, merges: 0, sold: 0, delivered: 0 },
	};
}

function clone(s: State): State {
	const gens = {} as Record<GenId, GenState>;
	for (const k of Object.keys(s.gens) as GenId[]) gens[k] = { ...s.gens[k] };
	return {
		...s,
		board: s.board.slice(),
		gens,
		done: s.done.slice(),
		progress: { ...s.progress },
		upgrades: s.upgrades.slice(),
		endless: s.endless.slice(),
		seen: s.seen.slice(),
		stats: { ...s.stats },
	};
}

// mulberry32 on a state field, so a reload resumes the same sequence.
function rand(s: State): number {
	s.seed = (s.seed + 0x6d2b79f5) | 0;
	let t = Math.imul(s.seed ^ (s.seed >>> 15), 1 | s.seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- time ----------

/** Refill energy and generator charges up to `now`. Returns `s` itself when nothing moved. */
export function tick(s: State, now: number): State {
	let out: State | null = null;
	const edit = (): State => (out ??= clone(s));
	// A clock set back must not cost anything: restart the refill from now.
	if (now < s.energyAt) edit().energyAt = now;
	const e = out ?? s;
	if (e.energy >= ENERGY_MAX) {
		if (e.energyAt !== now && now - e.energyAt >= ENERGY_MS) edit().energyAt = now;
	} else if (now - e.energyAt >= ENERGY_MS) {
		const n = edit();
		const gained = Math.floor((now - n.energyAt) / ENERGY_MS);
		n.energy = Math.min(ENERGY_MAX, n.energy + gained);
		n.energyAt = n.energy >= ENERGY_MAX ? now : n.energyAt + gained * ENERGY_MS;
	}
	for (const g of Object.values(GENERATORS)) {
		const cur = (out ?? s).gens[g.id];
		if (now < cur.at) { edit().gens[g.id].at = now; continue; }
		if (cur.charges >= g.charges) continue;
		const gained = Math.floor((now - cur.at) / g.chargeMs);
		if (gained <= 0) continue;
		const n = edit().gens[g.id];
		n.charges = Math.min(g.charges, n.charges + gained);
		n.at = n.charges >= g.charges ? now : n.at + gained * g.chargeMs;
	}
	return out ?? s;
}

/** Milliseconds until the next energy point (0 when full). */
export const energyIn = (s: State, now: number): number =>
	s.energy >= ENERGY_MAX ? 0 : Math.max(0, ENERGY_MS - (now - s.energyAt));

export const chargeIn = (s: State, g: GenId, now: number): number =>
	s.gens[g].charges >= GENERATORS[g].charges ? 0 : Math.max(0, GENERATORS[g].chargeMs - (now - s.gens[g].at));

export function addEnergy(s: State, n: number): State {
	const out = clone(s);
	out.energy += n;
	return out;
}

// ---------- board ----------

/** Nearest empty cell to `from` (ties: reading order). -1 when the board is full. */
export function nearestEmpty(board: (Piece | null)[], from: number): number {
	const fr = Math.floor(from / COLS), fc = from % COLS;
	let best = -1, bestD = Infinity;
	for (let i = 0; i < board.length; i++) {
		if (board[i] !== null) continue;
		const r = Math.floor(i / COLS), c = i % COLS;
		const d = (r - fr) ** 2 + (c - fc) ** 2;
		if (d < bestD) { bestD = d; best = i; }
	}
	return best;
}

function draw(s: State, g: GenId): Piece {
	// The tutorial asks for two screwdrivers; the first draw must not be a rag.
	if (g === 'boite' && s.stats.produced === 0) return code('outil', 1);
	const table = GENERATORS[g].out;
	const total = table.reduce((a, o) => a + o.w, 0);
	let r = rand(s) * total;
	for (const o of table) {
		r -= o.w;
		if (r < 0) return code(o.chain, o.level ?? 1);
	}
	const last = table[table.length - 1];
	return code(last.chain, last.level ?? 1);
}

export type ProduceResult = { ok: true; s: State; at: number; piece: Piece } | { ok: false; why: Fail };

/** Tap a generator. Costs nothing when it fails. */
export function produce(s: State, cell: number, now: number): ProduceResult {
	const g = genOf(s.board[cell]);
	if (!g) return { ok: false, why: 'none' };
	const t = tick(s, now);
	if (t.energy < 1) return { ok: false, why: 'energy' };
	if (t.gens[g].charges < 1) return { ok: false, why: 'charges' };
	const at = nearestEmpty(t.board, cell);
	if (at < 0) return { ok: false, why: 'full' };
	const n = clone(t);
	const piece = draw(n, g);
	n.board[at] = piece;
	if (n.energy >= ENERGY_MAX) n.energyAt = now; // the refill starts with the first point spent
	n.energy -= 1;
	if (n.gens[g].charges >= GENERATORS[g].charges) n.gens[g].at = now;
	n.gens[g].charges -= 1;
	n.stats.produced++;
	if (n.tut === 0) n.tut = 1;
	return { ok: true, s: n, at, piece };
}

export type MoveKind = 'move' | 'merge' | 'swap' | 'none';

/** What dropping `from` onto `to` would do. */
export function moveKind(s: State, from: number, to: number): MoveKind {
	if (from === to || from < 0 || to < 0 || from >= CELLS || to >= CELLS) return 'none';
	const a = s.board[from], b = s.board[to];
	if (a === null) return 'none';
	if (b === null) return 'move';
	const ia = parse(a);
	if (ia && a === b && ia.level < ia.max) return 'merge';
	return 'swap';
}

export function move(s: State, from: number, to: number): { s: State; kind: MoveKind; piece?: Piece } {
	const kind = moveKind(s, from, to);
	if (kind === 'none') return { s, kind };
	const n = clone(s);
	const a = n.board[from]!;
	if (kind === 'merge') {
		const i = parse(a)!;
		n.board[to] = code(i.chain, i.level + 1);
		n.board[from] = null;
		n.stats.merges++;
		placeGens(n);
		if (n.tut === 1) n.tut = 2;
		return { s: n, kind, piece: n.board[to]! };
	}
	n.board[from] = n.board[to];
	n.board[to] = a;
	return { s: n, kind };
}

/** Pairs of identical items on the board that can still merge. */
export function mergeablePairs(s: State): number {
	const count = new Map<Piece, number>();
	for (const p of s.board) {
		const i = parse(p);
		if (i && i.level < i.max) count.set(p!, (count.get(p!) ?? 0) + 1);
	}
	let n = 0;
	for (const c of count.values()) n += Math.floor(c / 2);
	return n;
}

export const sellValue = (p: Piece): number => {
	const i = parse(p);
	return i ? CHAINS[i.chain].sell * i.level : 0;
};

export function sell(s: State, cell: number): State {
	const p = s.board[cell];
	if (!parse(p)) return s;
	const n = clone(s);
	n.coins += sellValue(p!);
	n.board[cell] = null;
	n.stats.sold++;
	placeGens(n);
	return n;
}

export const isFull = (s: State): boolean => s.board.every((p) => p !== null);

/** Generators whose upgrade is owned but that sit nowhere on the board (bought on a full board). */
export const missingGens = (s: State): GenId[] =>
	(Object.keys(GENERATORS) as GenId[]).filter((g) => {
		const u = GENERATORS[g].unlock;
		return (!u || s.upgrades.includes(u)) && !s.board.includes(`g:${g}`);
	});

// Mutates a fresh clone: puts each missing generator on the free cell nearest the centre.
function placeGens(s: State): void {
	for (const g of missingGens(s)) {
		const at = nearestEmpty(s.board, Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2));
		if (at < 0) return;
		s.board[at] = `g:${g}`;
	}
}

// ---------- orders ----------

const has = (s: State, u: string): boolean => s.upgrades.includes(u);

const open = (s: State, o: Order): boolean => (!o.after || has(s, o.after)) && gateOk(s, o.when);

/** The story order currently open, or null. Steps of a project are taken in sequence. */
export function storyOrder(s: State): Order | null {
	return ORDERS.find((o) => o.kind === 'story' && !s.done.includes(o.id)
		&& stepOf(s, o.project!) === o.step! - 1 && open(s, o)) ?? null;
}

/** The project on the bench: the open story's, else the last one started. */
export function currentProject(s: State): Project {
	const st = storyOrder(s);
	if (st) return projectOf(st.project!);
	return [...PROJECTS].reverse().find((p) => stepOf(s, p.id) > 0) ?? PROJECTS[0];
}

const campaignShortsLeft = (s: State): Order[] =>
	ORDERS.filter((o) => o.kind === 'short' && !s.done.includes(o.id));

const campaignDone = (s: State): boolean =>
	ORDERS.every((o) => o.kind !== 'story' || s.done.includes(o.id));

/** Short orders on the counter: the campaign's first, then the neighbourhood's once every
 *  story is told. Earlier, endless orders pull the energy away from the story. */
export function shortOrders(s: State): Order[] {
	const left = campaignShortsLeft(s);
	if (left.length) return left.filter((o) => open(s, o)).slice(0, 2);
	// A migrated v1 save may still hold neighbourhood orders: they wait for the campaign's end too.
	return campaignDone(s) ? s.endless : [];
}

export const activeOrders = (s: State): Order[] => {
	const st = storyOrder(s);
	return st ? [st, ...shortOrders(s)] : shortOrders(s);
};

/** Cells to take for an order, or null if the board lacks something. */
export function pickCells(s: State, o: Order): number[] | null {
	const used = new Set<number>();
	for (const need of o.needs) {
		const i = s.board.findIndex((p, k) => p === need && !used.has(k));
		if (i < 0) return null;
		used.add(i);
	}
	return [...used];
}

export const canDeliver = (s: State, o: Order): boolean => pickCells(s, o) !== null;

/** Piece codes wanted by open orders, for the "demandé" marks. */
export function wanted(s: State): Set<Piece> {
	return new Set(activeOrders(s).flatMap((o) => o.needs));
}

function drawLocal(s: State): Order {
	s.endlessN++;
	// Only chains the player can make: a locked generator's chain would be an impossible order.
	const chains = (Object.keys(CHAINS) as ChainId[]).filter((c) => s.board.includes(`g:${CHAINS[c].gen}`));
	const pick = <T,>(xs: T[]): T => xs[Math.floor(rand(s) * xs.length)];
	const two = rand(s) < 0.35;
	const needs: Piece[] = [];
	for (let k = 0; k < (two ? 2 : 1); k++) {
		const c = pick(chains);
		// Mostly levels 2-3, a level 4 now and then: an order is a short goal, not a grind.
		const r = rand(s);
		const lvl = two ? (r < 0.7 ? 2 : 3) : r < 0.45 ? 2 : r < 0.85 ? 3 : 4;
		needs.push(code(c, Math.min(lvl, CHAINS[c].items.length)));
	}
	const units = needs.reduce((a, p) => a + unitCost(p), 0);
	return {
		id: `q${s.endlessN}`,
		kind: 'short',
		client: pick(LOCALS),
		ask: two ? 'Deux petites choses, si vous avez.' : 'Vous auriez ça pour moi ?',
		needs,
		reward: { coins: Math.round(units * 1.5) + 2, rep: 1 },
	};
}

function refill(s: State): void {
	if (campaignShortsLeft(s).length || !campaignDone(s)) return;
	while (s.endless.length < 2) s.endless.push(drawLocal(s));
}

export type DeliverResult = { ok: true; s: State; order: Order; reward: Reward } | { ok: false };

export function deliver(s: State, orderId: string): DeliverResult {
	const o = activeOrders(s).find((x) => x.id === orderId);
	if (!o) return { ok: false };
	const cells = pickCells(s, o);
	if (!cells) return { ok: false };
	const n = clone(s);
	for (const c of cells) n.board[c] = null;
	n.coins += o.reward.coins;
	n.rep += o.reward.rep;
	if (o.reward.energy) n.energy += o.reward.energy;
	if (o.kind === 'story' && o.project && o.step) n.progress[o.project] = o.step;
	if (o.id.startsWith('q')) n.endless = n.endless.filter((x) => x.id !== o.id);
	else n.done.push(o.id);
	n.stats.delivered++;
	if (n.tut === 2) n.tut = has(n, 'etabli') ? 4 : 3;
	placeGens(n);
	refill(n);
	return { ok: true, s: n, order: o, reward: o.reward };
}

// ---------- workshop ----------

export function upgradeState(s: State, id: string): 'owned' | 'locked' | 'poor' | 'ok' {
	const u = UPGRADES.find((x) => x.id === id);
	if (!u) return 'locked';
	if (has(s, id)) return 'owned';
	if (!gateOk(s, u.when)) return 'locked';
	return s.coins < u.cost ? 'poor' : 'ok';
}

export function buyUpgrade(s: State, id: string): State {
	if (upgradeState(s, id) !== 'ok') return s;
	const u = UPGRADES.find((x) => x.id === id)!;
	const n = clone(s);
	n.coins -= u.cost;
	n.rep += u.rep;
	n.upgrades.push(id);
	// Bought early (coins from selling), the bench still ends the tutorial.
	if (id === 'etabli') n.tut = 4;
	placeGens(n);
	refill(n);
	return n;
}

/** A reputation threshold reached and not yet celebrated, or null. */
export const dueTier = (s: State): RepTier | null =>
	REP_TIERS.find((t) => s.rep >= t.at && !s.seen.includes(t.id)) ?? null;

/** The next threshold still ahead, for the progress line. */
export const nextTier = (s: State): RepTier | null => REP_TIERS.find((t) => s.rep < t.at) ?? null;

/** Pay a reached threshold once; marks it seen so a reload cannot pay it twice. */
export function claimTier(s: State, id: string): State {
	const t = REP_TIERS.find((x) => x.id === id);
	if (!t || s.rep < t.at || s.seen.includes(id)) return s;
	const n = clone(s);
	n.energy += t.reward.energy;
	n.seen.push(id);
	return n;
}

export function markSeen(s: State, id: string): State {
	if (s.seen.includes(id)) return s;
	const n = clone(s);
	n.seen.push(id);
	return n;
}

// ---------- save ----------

/** Parse a save. Anything malformed or from an unknown version starts a fresh game. */
export function load(raw: string | null, now: number): State {
	if (!raw) return newGame(now);
	try {
		const d = JSON.parse(raw) as Partial<State> & { step?: number };
		if ((d.v !== 1 && d.v !== SAVE_V) || !Array.isArray(d.board) || d.board.length !== CELLS) return newGame(now);
		const base = newGame(now);
		const board = d.board.map((p) => (typeof p === 'string' && (parse(p) || genOf(p)) ? p : null));
		const gens = { ...base.gens };
		for (const g of Object.keys(gens) as GenId[]) {
			const v = d.gens?.[g];
			if (v && Number.isFinite(v.charges) && Number.isFinite(v.at)) gens[g] = { charges: v.charges, at: v.at };
		}
		// A save written by a device whose clock ran ahead must not stall refills for days.
		const clamp = (t: unknown): number => (Number.isFinite(t) ? Math.min(Number(t), now) : now);
		for (const g of Object.keys(gens) as GenId[]) gens[g].at = clamp(gens[g].at);
		const s: State = {
			...base,
			board,
			energy: Number.isFinite(d.energy) ? Math.max(0, Number(d.energy)) : base.energy,
			energyAt: clamp(d.energyAt),
			gens,
			coins: Math.max(0, Number(d.coins) || 0),
			rep: Math.max(0, Number(d.rep) || 0),
			seed: Number.isFinite(d.seed) ? Number(d.seed) | 0 : base.seed,
			done: Array.isArray(d.done) ? d.done.filter((x) => typeof x === 'string') : [],
			progress: readProgress(d),
			upgrades: Array.isArray(d.upgrades) ? d.upgrades.filter((x) => typeof x === 'string') : [],
			endless: Array.isArray(d.endless) ? d.endless.filter((o) => o && Array.isArray(o.needs) && o.needs.every((p) => parse(p))) : [],
			endlessN: Number(d.endlessN) || 0,
			tut: Math.max(0, Math.min(4, Number(d.tut) || 0)),
			seen: Array.isArray(d.seen) ? d.seen.filter((x) => typeof x === 'string') : [],
			stats: { ...base.stats, ...(d.stats ?? {}) },
		};
		// v1 named the watch's arrival scene 'arrival'; v2 keys arrivals by project.
		if (s.seen.includes('arrival') && !s.seen.includes('arrival:montre')) s.seen.push('arrival:montre');
		// Generators are never lost: a save missing one puts it back on a free cell.
		placeGens(s);
		refill(s);
		return tick(s, now);
	} catch {
		return newGame(now);
	}
}

function readProgress(d: Partial<State> & { step?: number }): Record<ProjectId, number> {
	const out = noProgress();
	if (d.v === 1) {
		out.montre = Math.max(0, Math.min(projectOf('montre').steps, Number(d.step) || 0));
		return out;
	}
	for (const p of PROJECTS) {
		const v = Number(d.progress?.[p.id]);
		out[p.id] = Number.isFinite(v) ? Math.max(0, Math.min(p.steps, Math.floor(v))) : 0;
	}
	return out;
}

export const save = (s: State): string => JSON.stringify(s);
