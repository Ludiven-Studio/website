// Éclats engine — pure, no DOM. Falling pieces of 2-3 gems over a 7×12 board, three of a colour
// in a line burst, and every column a burst touches digs one cell of the ground below. Dug cells
// show how many treasures hide around them, Minesweeper style; unearth them all before the pile
// reaches the top.
//
// Every gem that bursts digs one cell in its own column: a flat line of three digs three columns
// one cell each, an upright one drills one column three cells deep.
//
// The board is row-major, row 0 at the top. The ground sits under the board, row 0 just below the
// floor. Gems never enter the ground, so its numbers stay readable.
//
// The UI drives one turn as: steer the piece → lockPiece() → resolveWave() until it returns null
// (it animates each wave) → endTurn(). settle() runs the same waves without pauses (tests, bot).

import { mulberry32, type Rng } from '../prng';

export const COLS = 7;
export const ROWS = 12;

export type GemKind = 'gem' | 'bomb' | 'rainbow' | 'stone';
export type Booster = 'pioche' | 'radar' | 'sablier';
export const BOOSTERS: Booster[] = ['pioche', 'radar', 'sablier'];
export type Shape = 'I2' | 'I3' | 'L3';

export interface Gem {
	id: number;
	color: number; // meaningless on a stone or a rainbow
	kind: GemKind;
	ice: boolean; // the first hit only breaks the ice
	lock: boolean; // pinned: does not fall and cannot line up until a neighbour bursts
}

export interface EclatsCfg {
	seed: number;
	colors: number; // 3..5
	depth: number; // ground layers
	treasures: number;
	traps: number; // a dug trap pushes a row of stones under the pile
	hard: number; // share of ground cells that take two digs
	pile: number; // rows of gems already on the board
	ice: number; // frozen gems in that starting pile
	locks: number; // locked gems in that starting pile
	fallMs: number; // one row per fallMs
	trios: number; // share of 3-gem pieces
	clues: number; // top-layer cells already open at the start
	bonusEvery: number; // a booster every this many treasures
	floorOnly?: boolean; // experiment: only gems resting on the ground dig
}

export interface Ground {
	cols: number;
	depth: number;
	treasure: Uint8Array;
	trap: Uint8Array;
	hard: Uint8Array; // digs still needed before the cell opens, minus one
	dug: Uint8Array;
	seen: Uint8Array; // shown by the radar without being dug
	flag: Uint8Array; // marked by the player as a likely treasure
}

export interface Piece {
	shape: Shape;
	rot: number;
	x: number; // pivot column
	y: number; // pivot row
	colors: number[];
}

export interface Pos {
	r: number;
	c: number;
}

export type Status = 'playing' | 'won' | 'lost';

export interface State {
	cfg: EclatsCfg;
	board: (Gem | null)[];
	ground: Ground;
	piece: Piece | null;
	pieceIndex: number; // pieces dealt so far, the current one included
	nextId: number;
	found: number;
	score: number;
	chain: number; // waves in the current turn
	boosters: Record<Booster, number>;
	boosterBag: number; // treasures paid out so far: walks the booster order
	pendingStones: number;
	moved: Set<number>; // gem ids that landed or fell this wave: a special forms on one of them
	status: Status;
	lockMs: number; // time the piece has rested on something
	lockResets: number;
	fallAcc: number;
	field: number; // endless mode: grounds cleared so far
	endless: boolean;
}

export interface Dig {
	c: number;
	r: number;
	opened: boolean; // false when it only cracked a hard cell
	treasure: boolean;
	trap: boolean;
	booster: Booster | null;
}

export interface Wave {
	popped: { id: number; r: number; c: number; color: number; kind: GemKind }[];
	cracked: Pos[]; // ice broken in place
	unlocked: Pos[];
	specials: { id: number; r: number; c: number; kind: 'bomb' | 'rainbow' }[];
	blasts: Pos[]; // bomb centres
	digs: Dig[];
	chain: number;
	points: number;
}

/* ---------- Helpers ---------- */

const idx = (r: number, c: number): number => r * COLS + c;
export const inBoard = (r: number, c: number): boolean => r >= 0 && r < ROWS && c >= 0 && c < COLS;

/** Stable 32-bit mix of a seed and a counter, so piece n is the same whatever came before it. */
export function hash2(a: number, b: number): number {
	let x = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
	x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
	x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
	return (x ^ (x >>> 16)) >>> 0;
}

/* ---------- Pieces ---------- */

/** Cell offsets of each shape at rotation 0; index 0 is the pivot. y grows downward. */
const SHAPES: Record<Shape, [number, number][]> = {
	I2: [[0, 0], [0, -1]],
	I3: [[0, 0], [0, -1], [0, 1]],
	L3: [[0, 0], [0, -1], [1, 0]],
};

/** Offsets after `rot` clockwise quarter turns. */
export function offsets(shape: Shape, rot: number): [number, number][] {
	return SHAPES[shape].map(([dx, dy]) => {
		let x = dx;
		let y = dy;
		for (let k = 0; k < ((rot % 4) + 4) % 4; k++) [x, y] = [-y, x];
		return [x || 0, y || 0]; // no -0
	});
}

export function pieceCells(p: Piece): (Pos & { color: number })[] {
	return offsets(p.shape, p.rot).map(([dx, dy], i) => ({ r: p.y + dy, c: p.x + dx, color: p.colors[i] }));
}

/** Piece n of a game: shape and colours come from (seed, n) alone. */
export function pieceAt(cfg: EclatsCfg, n: number): Piece {
	const rng = mulberry32(hash2(cfg.seed, n));
	const shape: Shape = rng() < cfg.trios ? (rng() < 0.5 ? 'I3' : 'L3') : 'I2';
	const len = SHAPES[shape].length;
	const colors: number[] = [];
	for (let i = 0; i < len; i++) colors.push(Math.floor(rng() * cfg.colors));
	// Three alike would burst on landing for free.
	if (len === 3 && colors[0] === colors[1] && colors[1] === colors[2]) colors[2] = (colors[2] + 1 + Math.floor(rng() * (cfg.colors - 1))) % cfg.colors;
	return { shape, rot: 0, x: Math.floor(COLS / 2), y: 1, colors };
}

export function fits(s: State, p: Piece): boolean {
	for (const { r, c } of pieceCells(p)) {
		if (c < 0 || c >= COLS || r >= ROWS) return false;
		if (r >= 0 && s.board[idx(r, c)]) return false;
	}
	return true;
}

/* ---------- Ground ---------- */

export function makeGround(cfg: EclatsCfg, rng: Rng): Ground {
	const n = COLS * cfg.depth;
	const g: Ground = {
		cols: COLS,
		depth: cfg.depth,
		treasure: new Uint8Array(n),
		trap: new Uint8Array(n),
		hard: new Uint8Array(n),
		dug: new Uint8Array(n),
		seen: new Uint8Array(n),
		flag: new Uint8Array(n),
	};
	// Treasures lean deep: the top layer is what blind digging finds anyway.
	const cells = Array.from({ length: n }, (_, i) => i);
	const weight = (i: number): number => (Math.floor(i / COLS) === 0 ? 0.35 : 1);
	const pick = (count: number, mark: Uint8Array, avoid: Uint8Array[]): void => {
		for (let k = 0; k < count; k++) {
			const free = cells.filter((i) => !mark[i] && avoid.every((a) => !a[i]));
			if (!free.length) return;
			const total = free.reduce((t, i) => t + weight(i), 0);
			let x = rng() * total;
			let chosen = free[free.length - 1];
			for (const i of free) {
				x -= weight(i);
				if (x <= 0) { chosen = i; break; }
			}
			mark[chosen] = 1;
		}
	};
	pick(Math.min(cfg.treasures, n - 1), g.treasure, []);
	pick(Math.min(cfg.traps, Math.floor(n / 4)), g.trap, [g.treasure]);
	for (let i = 0; i < n; i++) if (!g.treasure[i] && !g.trap[i] && rng() < cfg.hard) g.hard[i] = 1;
	// A few surface cells start open, so the first bursts are not blind: ones that point at
	// something first.
	const top = Array.from({ length: COLS }, (_, c) => c).filter((c) => !g.treasure[c] && !g.trap[c]);
	top.sort((a, b) => around(g, 0, b).treasures - around(g, 0, a).treasures || rng() - 0.5);
	for (const c of top.slice(0, cfg.clues)) {
		g.dug[c] = 1;
		g.hard[c] = 0;
	}
	return g;
}

const gi = (g: Ground, r: number, c: number): number => r * g.cols + c;

/** Treasures and traps among the 8 neighbours — found ones count, as in Minesweeper. */
export function around(g: Ground, r: number, c: number): { treasures: number; traps: number } {
	let treasures = 0;
	let traps = 0;
	for (let dr = -1; dr <= 1; dr++) {
		for (let dc = -1; dc <= 1; dc++) {
			if (!dr && !dc) continue;
			const rr = r + dr;
			const cc = c + dc;
			if (rr < 0 || rr >= g.depth || cc < 0 || cc >= g.cols) continue;
			treasures += g.treasure[gi(g, rr, cc)];
			traps += g.trap[gi(g, rr, cc)];
		}
	}
	return { treasures, traps };
}

/** Topmost cell of a column still to dig, or -1. */
export function digRow(g: Ground, c: number): number {
	for (let r = 0; r < g.depth; r++) if (!g.dug[gi(g, r, c)]) return r;
	return -1;
}

export const isHidden = (g: Ground, r: number, c: number): boolean => !g.dug[gi(g, r, c)];
export const groundAt = (g: Ground, r: number, c: number): number => gi(g, r, c);

/* ---------- Setup ---------- */

function newGem(s: State, color: number, kind: GemKind = 'gem'): Gem {
	return { id: s.nextId++, color, kind, ice: false, lock: false };
}

/** Starting pile: `rows` bottom rows, gaps near the top, no line of three already formed. */
function dealPile(s: State, rng: Rng): void {
	const { cfg } = s;
	if (cfg.pile <= 0) return;
	for (let k = 0; k < cfg.pile; k++) {
		const r = ROWS - 1 - k;
		for (let c = 0; c < COLS; c++) {
			// The top pile row is ragged, and nothing floats: a cell needs one below it.
			if (k === cfg.pile - 1 && rng() < 0.4) continue;
			if (k > 0 && !s.board[idx(r + 1, c)]) continue;
			let color = Math.floor(rng() * cfg.colors);
			for (let t = 0; t < cfg.colors && makesLine(s, r, c, color); t++) color = (color + 1) % cfg.colors;
			s.board[idx(r, c)] = newGem(s, color);
		}
	}
	const filled = s.board.map((g, i) => (g ? i : -1)).filter((i) => i >= 0);
	const shuffle = filled.slice().sort(() => rng() - 0.5);
	let ice = cfg.ice;
	let locks = cfg.locks;
	for (const i of shuffle) {
		const g = s.board[i]!;
		if (ice > 0) { g.ice = true; ice--; } else if (locks > 0) { g.lock = true; locks--; } else break;
	}
}

function makesLine(s: State, r: number, c: number, color: number): boolean {
	const same = (rr: number, cc: number): boolean => {
		if (!inBoard(rr, cc)) return false;
		const g = s.board[idx(rr, cc)];
		return !!g && g.kind === 'gem' && g.color === color;
	};
	return (same(r, c - 1) && same(r, c - 2)) || (same(r + 1, c) && same(r + 2, c));
}

export function createGame(cfg: EclatsCfg, opts: { endless?: boolean } = {}): State {
	const rng = mulberry32(hash2(cfg.seed, 0x51a7));
	const s: State = {
		cfg,
		board: new Array(COLS * ROWS).fill(null),
		ground: makeGround(cfg, rng),
		piece: null,
		pieceIndex: 0,
		nextId: 1,
		found: 0,
		score: 0,
		chain: 0,
		boosters: { pioche: 1, radar: 0, sablier: 0 }, // one pickaxe from the start: a way out of a bad guess
		boosterBag: 0,
		pendingStones: 0,
		moved: new Set(),
		status: 'playing',
		lockMs: 0,
		lockResets: 0,
		fallAcc: 0,
		field: 0,
		endless: !!opts.endless,
	};
	dealPile(s, rng);
	spawn(s);
	return s;
}

export function cloneState(s: State): State {
	return {
		...s,
		board: s.board.map((g) => (g ? { ...g } : null)),
		ground: {
			...s.ground,
			treasure: s.ground.treasure.slice(),
			trap: s.ground.trap.slice(),
			hard: s.ground.hard.slice(),
			dug: s.ground.dug.slice(),
			seen: s.ground.seen.slice(),
			flag: s.ground.flag.slice(),
		},
		piece: s.piece ? { ...s.piece, colors: s.piece.colors.slice() } : null,
		boosters: { ...s.boosters },
		moved: new Set(s.moved),
	};
}

/** Deal the next piece. A piece that cannot appear ends the game. */
export function spawn(s: State): boolean {
	const p = pieceAt(s.cfg, s.pieceIndex);
	s.pieceIndex++;
	s.lockMs = 0;
	s.lockResets = 0;
	s.fallAcc = 0;
	if (!fits(s, p)) {
		s.piece = null;
		s.status = 'lost';
		return false;
	}
	s.piece = p;
	return true;
}

export const nextPiece = (s: State): Piece => pieceAt(s.cfg, s.pieceIndex);

/* ---------- Steering ---------- */

/** Lock-delay resets a resting piece allows, so it cannot be slid forever. */
const MAX_LOCK_RESETS = 12;
export const LOCK_MS = 480;
export const SOFT_MS = 38;

function rested(s: State): boolean {
	return !!s.piece && !fits(s, { ...s.piece, y: s.piece.y + 1 });
}

function touched(s: State): void {
	if (s.lockMs > 0 && s.lockResets < MAX_LOCK_RESETS) {
		s.lockMs = 0;
		s.lockResets++;
	}
}

export function move(s: State, dx: number): boolean {
	if (!s.piece || s.status !== 'playing') return false;
	const p = { ...s.piece, x: s.piece.x + dx };
	if (!fits(s, p)) return false;
	s.piece = p;
	touched(s);
	return true;
}

/** Quarter turn clockwise, with kicks: sideways, then up. */
export function rotate(s: State): boolean {
	if (!s.piece || s.status !== 'playing') return false;
	const base = { ...s.piece, rot: (s.piece.rot + 1) % 4 };
	for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]]) {
		const p = { ...base, x: base.x + dx, y: base.y + dy };
		if (fits(s, p)) {
			s.piece = p;
			touched(s);
			return true;
		}
	}
	return false;
}

/** Rows the piece would fall if dropped now. */
export function dropDistance(s: State): number {
	if (!s.piece) return 0;
	let d = 0;
	while (fits(s, { ...s.piece, y: s.piece.y + d + 1 })) d++;
	return d;
}

export function hardDrop(s: State): number {
	if (!s.piece) return 0;
	const d = dropDistance(s);
	s.piece = { ...s.piece, y: s.piece.y + d };
	return d;
}

/**
 * Advance the falling piece by `ms` of play. Returns true once it has locked in place (the
 * caller then resolves the turn). `soft` is the held ↓.
 */
export function fall(s: State, ms: number, soft = false, slow = 1): boolean {
	if (!s.piece || s.status !== 'playing') return false;
	const rowMs = soft ? SOFT_MS : s.cfg.fallMs * slow;
	if (rested(s)) {
		s.lockMs += ms;
		return s.lockMs >= (soft ? LOCK_MS / 3 : LOCK_MS);
	}
	s.fallAcc += ms;
	while (s.fallAcc >= rowMs) {
		s.fallAcc -= rowMs;
		if (rested(s)) break;
		s.piece = { ...s.piece, y: s.piece.y + 1 };
	}
	return false;
}

/* ---------- Turn resolution ---------- */

/** Write the piece into the board. Its gems then fall on their own in the first wave. */
export function lockPiece(s: State): void {
	if (!s.piece) return;
	s.moved.clear();
	s.chain = 0;
	for (const { r, c, color } of pieceCells(s.piece)) {
		if (r < 0) {
			// Part of the piece sticks out over the top: the pile has reached it.
			s.status = 'lost';
			continue;
		}
		const g = newGem(s, color);
		s.board[idx(r, c)] = g;
		s.moved.add(g.id);
	}
	s.piece = null;
	gravity(s);
}

/** Loose gems fall straight down; a locked gem stays put and holds what sits on it. */
export function gravity(s: State): boolean {
	let any = false;
	for (let c = 0; c < COLS; c++) {
		let write = ROWS - 1;
		for (let r = ROWS - 1; r >= 0; r--) {
			const g = s.board[idx(r, c)];
			if (!g) continue;
			if (g.lock) {
				write = r - 1;
				continue;
			}
			if (write !== r) {
				s.board[idx(write, c)] = g;
				s.board[idx(r, c)] = null;
				s.moved.add(g.id);
				any = true;
			}
			write--;
		}
	}
	return any;
}

interface Run {
	color: number;
	cells: number[];
}

const canLine = (g: Gem | null): g is Gem => !!g && g.kind !== 'stone' && !g.lock;
const isColour = (g: Gem, k: number): boolean => g.kind === 'rainbow' || g.color === k;

/** Straight lines of 3+ of one colour; a rainbow stands in for any colour. */
export function findRuns(s: State): Run[] {
	const runs: Run[] = [];
	const scan = (cells: number[]): void => {
		for (let k = 0; k < s.cfg.colors; k++) {
			let run: number[] = [];
			const flush = (): void => {
				if (run.length >= 3 && run.some((i) => s.board[i]!.kind !== 'rainbow')) runs.push({ color: k, cells: run });
				run = [];
			};
			for (const i of cells) {
				const g = s.board[i];
				if (canLine(g) && isColour(g, k)) run.push(i);
				else flush();
			}
			flush();
		}
	};
	for (let r = 0; r < ROWS; r++) scan(Array.from({ length: COLS }, (_, c) => idx(r, c)));
	for (let c = 0; c < COLS; c++) scan(Array.from({ length: ROWS }, (_, r) => idx(r, c)));
	return runs;
}

/** Most common colour on the board: what a rainbow caught in a blast clears. */
function commonColour(s: State): number {
	const n = new Array(s.cfg.colors).fill(0);
	for (const g of s.board) if (g && g.kind === 'gem') n[g.color]++;
	return n.indexOf(Math.max(...n));
}

const POINTS_PER_GEM = 10;
const POINTS_PER_TREASURE = 150;

/** One burst of every line on the board, then the fall. Null when nothing lines up. */
export function resolveWave(s: State): Wave | null {
	const runs = findRuns(s);
	if (!runs.length) {
		s.moved.clear();
		return null;
	}
	s.chain++;
	const wave: Wave = { popped: [], cracked: [], unlocked: [], specials: [], blasts: [], digs: [], chain: s.chain, points: 0 };

	// Runs of one colour that share a cell are one group; a long line or a cross earns a special.
	const groups: { color: number; cells: Set<number>; longest: number[] }[] = [];
	for (const run of runs) {
		const g = groups.find((x) => x.color === run.color && run.cells.some((i) => x.cells.has(i)));
		if (g) {
			run.cells.forEach((i) => g.cells.add(i));
			if (run.cells.length > g.longest.length) g.longest = run.cells;
		} else groups.push({ color: run.color, cells: new Set(run.cells), longest: run.cells });
	}
	const keep = new Set<number>();
	for (const g of groups) {
		const kind = g.longest.length >= 5 ? 'rainbow' : g.longest.length === 4 || g.cells.size >= 5 ? 'bomb' : null;
		if (!kind) continue;
		const plain = [...g.cells].filter((i) => s.board[i]!.kind === 'gem' && !keep.has(i));
		if (!plain.length) continue;
		// On the gem that just landed if there is one, else mid-line.
		const fresh = plain.filter((i) => s.moved.has(s.board[i]!.id)).sort((a, b) => b - a);
		const mid = g.longest[Math.floor(g.longest.length / 2)];
		const at = fresh[0] ?? (plain.includes(mid) ? mid : plain[0]);
		keep.add(at);
		const gem = s.board[at]!;
		gem.kind = kind;
		gem.ice = false;
		wave.specials.push({ id: gem.id, r: Math.floor(at / COLS), c: at % COLS, kind });
	}

	// Everything the lines hit, plus what bombs and rainbows they set off reach.
	const hit = new Set<number>();
	const queue: number[] = [];
	const add = (i: number): void => {
		if (keep.has(i) || hit.has(i) || !s.board[i]) return;
		hit.add(i);
		queue.push(i);
	};
	const runColour = new Map<number, number>();
	for (const run of runs) for (const i of run.cells) { if (!runColour.has(i)) runColour.set(i, run.color); add(i); }
	while (queue.length) {
		const i = queue.shift()!;
		const g = s.board[i]!;
		const r = Math.floor(i / COLS);
		const c = i % COLS;
		if (g.kind === 'bomb') {
			wave.blasts.push({ r, c });
			for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (inBoard(r + dr, c + dc)) add(idx(r + dr, c + dc));
		} else if (g.kind === 'rainbow') {
			const k = runColour.get(i) ?? commonColour(s);
			s.board.forEach((o, j) => { if (o && o.kind === 'gem' && o.color === k) add(j); });
		}
	}

	// A hit takes one protection off — the ice — or the gem itself.
	const gone: number[] = [];
	for (const i of hit) {
		const g = s.board[i]!;
		const r = Math.floor(i / COLS);
		const c = i % COLS;
		if (g.ice) {
			g.ice = false;
			wave.cracked.push({ r, c });
		} else if (g.lock) {
			g.lock = false;
			wave.unlocked.push({ r, c });
		} else gone.push(i);
	}
	const cols: number[] = [];
	for (const i of gone) {
		const g = s.board[i]!;
		const r = Math.floor(i / COLS);
		const c = i % COLS;
		wave.popped.push({ id: g.id, r, c, color: g.color, kind: g.kind });
		if (g.kind !== 'stone' && (!s.cfg.floorOnly || r === ROWS - 1)) cols.push(c);
		s.board[i] = null;
	}
	// A burst breaks the stones and opens the locks right next to it.
	for (const p of wave.popped) {
		if (p.kind === 'stone') continue;
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const r = p.r + dr;
			const c = p.c + dc;
			if (!inBoard(r, c)) continue;
			const o = s.board[idx(r, c)];
			if (!o) continue;
			if (o.kind === 'stone') {
				wave.popped.push({ id: o.id, r, c, color: o.color, kind: 'stone' });
				s.board[idx(r, c)] = null;
			} else if (o.lock) {
				o.lock = false;
				wave.unlocked.push({ r, c });
			}
		}
	}

	for (const c of cols.sort((a, b) => a - b)) {
		const d = digColumn(s, c);
		if (d) wave.digs.push(d);
	}
	const gems = wave.popped.filter((p) => p.kind !== 'stone').length;
	wave.points = gems * POINTS_PER_GEM * s.chain + wave.digs.filter((d) => d.treasure).length * POINTS_PER_TREASURE;
	s.score += wave.points;

	s.moved.clear();
	gravity(s);
	return wave;
}

function award(s: State): Booster {
	// A shuffled bag of the three, refilled every three treasures: never three of a kind in a row.
	const round = Math.floor(s.boosterBag / 3);
	const order = BOOSTERS.slice().sort((a, b) => hash2(s.cfg.seed + round, BOOSTERS.indexOf(a)) - hash2(s.cfg.seed + round, BOOSTERS.indexOf(b)));
	const b = order[s.boosterBag % 3];
	s.boosterBag++;
	s.boosters[b]++;
	return b;
}

function open(s: State, r: number, c: number): Dig {
	const g = s.ground;
	const i = gi(g, r, c);
	g.dug[i] = 1;
	g.hard[i] = 0;
	g.flag[i] = 0;
	const treasure = !!g.treasure[i];
	const trap = !!g.trap[i];
	let booster: Booster | null = null;
	if (treasure) {
		s.found++;
		// The last treasure ends the level: a booster then would be a prize nobody can use.
		if ((s.found < s.cfg.treasures || s.endless) && s.found % s.cfg.bonusEvery === 0) booster = award(s);
	}
	if (trap) s.pendingStones++;
	return { c, r, opened: true, treasure, trap, booster };
}

/** One dig at the top of a column: cracks a hard cell, else opens it. */
export function digColumn(s: State, c: number): Dig | null {
	const g = s.ground;
	const r = digRow(g, c);
	if (r < 0) return null;
	const i = gi(g, r, c);
	if (g.hard[i] > 0) {
		g.hard[i]--;
		return { c, r, opened: false, treasure: false, trap: false, booster: null };
	}
	return open(s, r, c);
}

/** Push a row of stones in under the pile, one gap to let a gem through. */
function pushStones(s: State): boolean {
	for (let c = 0; c < COLS; c++) {
		if (s.board[idx(0, c)]) {
			s.status = 'lost';
			return false;
		}
	}
	for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS; c++) s.board[idx(r, c)] = s.board[idx(r + 1, c)];
	const gap = hash2(s.cfg.seed + 77, s.pieceIndex + s.pendingStones) % COLS;
	for (let c = 0; c < COLS; c++) s.board[idx(ROWS - 1, c)] = c === gap ? null : newGem(s, 0, 'stone');
	gravity(s);
	return true;
}

/**
 * Close the turn once the waves are spent: stones from dug traps, a new ground in endless
 * mode, the win, then the next piece. Returns true when stones went in (the caller resolves
 * again, they can line things up through the gap).
 */
export function endTurn(s: State): boolean {
	if (s.status !== 'playing') return false;
	if (s.pendingStones > 0) {
		while (s.pendingStones > 0 && s.status === 'playing') {
			s.pendingStones--;
			pushStones(s);
		}
		return s.status === 'playing';
	}
	if (s.found >= s.cfg.treasures) {
		if (!s.endless) {
			s.status = 'won';
			return false;
		}
		nextField(s);
	}
	spawn(s);
	return false;
}

/** Endless mode: a fresh ground, one more treasure, a quicker fall. */
export function nextField(s: State): void {
	s.field++;
	s.score += 500 * s.field;
	const cfg: EclatsCfg = {
		...s.cfg,
		seed: hash2(s.cfg.seed, 1000 + s.field),
		treasures: Math.min(10, s.cfg.treasures + 1),
		fallMs: Math.max(220, Math.round(s.cfg.fallMs * 0.9)),
	};
	s.cfg = cfg;
	s.ground = makeGround(cfg, mulberry32(hash2(cfg.seed, 0x51a7)));
	s.found = 0;
	s.boosterBag = 0;
}

/** Run every wave and the turn's end without pauses. */
export function settle(s: State): Wave[] {
	const waves: Wave[] = [];
	for (;;) {
		let w: Wave | null;
		while ((w = resolveWave(s))) waves.push(w);
		if (!endTurn(s)) break;
	}
	return waves;
}

/* ---------- Boosters ---------- */

/** Pioche: dig exactly this cell, however deep, hard or not. */
export function digPioche(s: State, r: number, c: number): Dig | null {
	const g = s.ground;
	if (s.boosters.pioche <= 0 || r < 0 || r >= g.depth || c < 0 || c >= g.cols || g.dug[gi(g, r, c)]) return null;
	s.boosters.pioche--;
	const d = open(s, r, c);
	if (d.treasure) s.score += POINTS_PER_TREASURE;
	if (s.found >= s.cfg.treasures) {
		if (s.endless) nextField(s);
		else s.status = 'won';
	}
	return d;
}

/** Radar: show what one hidden cell holds without digging it. */
export function scanRadar(s: State, r: number, c: number): boolean {
	const g = s.ground;
	if (s.boosters.radar <= 0 || r < 0 || r >= g.depth || c < 0 || c >= g.cols) return false;
	const i = gi(g, r, c);
	if (g.dug[i] || g.seen[i]) return false;
	s.boosters.radar--;
	g.seen[i] = 1;
	return true;
}

/** Mark or unmark a hidden cell as a likely treasure. */
export function toggleFlag(s: State, r: number, c: number): boolean {
	const g = s.ground;
	if (r < 0 || r >= g.depth || c < 0 || c >= g.cols) return false;
	const i = gi(g, r, c);
	if (g.dug[i]) return false;
	g.flag[i] = g.flag[i] ? 0 : 1;
	return true;
}

export function spendSablier(s: State): boolean {
	if (s.boosters.sablier <= 0) return false;
	s.boosters.sablier--;
	return true;
}

/* ---------- Reading the board ---------- */

/** Height of the pile: rows from the top row down to the highest gem. 0 = empty board. */
export function pileHeight(s: State): number {
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (s.board[idx(r, c)]) return ROWS - r;
	return 0;
}

export const gemAt = (s: State, r: number, c: number): Gem | null => s.board[idx(r, c)];
