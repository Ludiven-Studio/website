// A greedy player for Éclats: it tries every column and turn of the piece, settles the board
// and keeps the best. It never peeks at the treasures — it reads the numbers like a player
// does (or ignores them, `informed: false`, to measure what the numbers are worth). Used by
// the tests to prove each level winnable and to calibrate the star thresholds.

import {
	COLS,
	ROWS,
	around,
	cloneState,
	createGame,
	fits,
	groundAt,
	hardDrop,
	lockPiece,
	pileHeight,
	settle,
	digPioche,
	scanRadar,
	type EclatsCfg,
	type Ground,
	type State,
} from './engine';

/** Odds that each ground cell holds an unfound treasure, from what is on show. */
export type Sight = 'informed' | 'blind' | 'oracle';

export function treasureOdds(g: Ground, total: number, found: number, sight: Sight = 'informed'): Float32Array {
	const n = g.cols * g.depth;
	const odds = new Float32Array(n);
	if (sight === 'oracle') {
		for (let i = 0; i < n; i++) odds[i] = !g.dug[i] && g.treasure[i] ? 1 : 0;
		return odds;
	}
	const informed = sight === 'informed';
	const unknown = (i: number): boolean => !g.dug[i] && !g.seen[i];
	const knownTreasure = (i: number): boolean => !!g.treasure[i] && (!!g.dug[i] || !!g.seen[i]);
	let seenLeft = 0;
	let hidden = 0;
	for (let i = 0; i < n; i++) {
		if (unknown(i)) hidden++;
		else if (g.seen[i] && g.treasure[i] && !g.dug[i]) seenLeft++;
	}
	const prior = hidden ? Math.max(0, total - found - seenLeft) / hidden : 0;
	const lo = new Float32Array(n).fill(1);
	const hi = new Float32Array(n);
	const sum = new Float32Array(n);
	const cnt = new Uint8Array(n);
	if (informed) {
		for (let r = 0; r < g.depth; r++) {
			for (let c = 0; c < g.cols; c++) {
				const v = groundAt(g, r, c);
				if (unknown(v) || g.treasure[v]) continue;
				const near: number[] = [];
				let known = 0;
				for (let dr = -1; dr <= 1; dr++) {
					for (let dc = -1; dc <= 1; dc++) {
						if (!dr && !dc) continue;
						const rr = r + dr;
						const cc = c + dc;
						if (rr < 0 || rr >= g.depth || cc < 0 || cc >= g.cols) continue;
						const j = groundAt(g, rr, cc);
						if (knownTreasure(j)) known++;
						else if (unknown(j)) near.push(j);
					}
				}
				if (!near.length) continue;
				const p = Math.max(0, around(g, r, c).treasures - known) / near.length;
				for (const j of near) {
					lo[j] = Math.min(lo[j], p);
					hi[j] = Math.max(hi[j], p);
					sum[j] += p;
					cnt[j]++;
				}
			}
		}
	}
	for (let i = 0; i < n; i++) {
		if (g.seen[i] && g.treasure[i] && !g.dug[i]) odds[i] = 1;
		else if (!unknown(i)) odds[i] = 0;
		else if (!cnt[i]) odds[i] = prior;
		else if (lo[i] === 0) odds[i] = 0;
		else if (hi[i] >= 1) odds[i] = 1;
		else odds[i] = sum[i] / cnt[i];
	}
	return odds;
}

export interface Placement {
	x: number;
	rot: number;
}

/** Every column and turn the current piece can reach from where it appears. */
export function placements(s: State): Placement[] {
	const p = s.piece;
	if (!p) return [];
	const out: Placement[] = [];
	for (let rot = 0; rot < 4; rot++) {
		const turned = { ...p, rot };
		if (!fits(s, turned)) continue;
		for (const dir of [-1, 1]) {
			for (let x = dir < 0 ? p.x : p.x + 1; x >= -2 && x <= COLS + 1; x += dir) {
				if (!fits(s, { ...turned, x })) break;
				out.push({ x, rot });
			}
		}
	}
	return out;
}

const pairs = (s: State): number => {
	let n = 0;
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			const g = s.board[r * COLS + c];
			if (!g || g.kind === 'stone' || g.lock) continue;
			const right = c + 1 < COLS ? s.board[r * COLS + c + 1] : null;
			const down = r + 1 < ROWS ? s.board[(r + 1) * COLS + c] : null;
			if (right && right.kind === 'gem' && right.color === g.color) n++;
			if (down && down.kind === 'gem' && down.color === g.color) n++;
		}
	}
	return n;
};

/** What digging down from row r of a column is worth: the odds there, and less and less below. */
function depthValue(g: Ground, odds: Float32Array, r: number, c: number): number {
	let v = 0;
	let k = 1;
	for (let rr = r; rr < g.depth; rr++, k *= 0.55) if (!g.dug[groundAt(g, rr, c)]) v += odds[groundAt(g, rr, c)] * k;
	return v;
}

/** Settle a copy with the piece dropped there and score the result. */
function score(s: State, pl: Placement, odds: Float32Array): { value: number; next: State } {
	const t = cloneState(s);
	t.piece = { ...t.piece!, x: pl.x, rot: pl.rot };
	hardDrop(t);
	const foundBefore = t.found;
	lockPiece(t);
	const waves = settle(t);
	let value = (t.found - foundBefore) * 1000;
	for (const w of waves) {
		for (const d of w.digs) {
			if (!d.opened) continue;
			value += depthValue(s.ground, odds, d.r, d.c) * 400 + 6;
			if (d.trap) value -= 250;
		}
	}
	if (t.status === 'lost') value -= 1e6;
	if (t.status === 'won') value += 1e5;
	const h = pileHeight(t);
	value -= h * h * 2.2 + (h >= ROWS - 3 ? 3000 : 0);
	value += pairs(t) * 7;
	return { value, next: t };
}

export function bestPlacement(s: State, sight: Sight = 'informed'): Placement | null {
	const odds = treasureOdds(s.ground, s.cfg.treasures, s.found, sight);
	let best: Placement | null = null;
	let bestV = -Infinity;
	for (const pl of placements(s)) {
		const { value } = score(s, pl, odds);
		if (value > bestV) {
			bestV = value;
			best = pl;
		}
	}
	return best;
}

/** Spend the boosters a careful player would: the pickaxe on a sure or best cell, the radar to check one. */
function spendBoosters(s: State, sight: Sight): void {
	for (let guard = 0; guard < 6 && s.status === 'playing'; guard++) {
		const odds = treasureOdds(s.ground, s.cfg.treasures, s.found, sight);
		let bi = -1;
		for (let i = 0; i < odds.length; i++) if (!s.ground.dug[i] && (bi < 0 || odds[i] > odds[bi])) bi = i;
		if (bi < 0) return;
		const r = Math.floor(bi / s.ground.cols);
		const c = bi % s.ground.cols;
		if (s.boosters.pioche > 0 && (odds[bi] >= 0.99 || (odds[bi] >= 0.45 && s.boosters.pioche > 1))) {
			digPioche(s, r, c);
		} else if (s.boosters.radar > 0 && !s.ground.seen[bi] && odds[bi] < 0.99) {
			scanRadar(s, r, c);
		} else return;
	}
}

export interface BotRun {
	won: boolean;
	pieces: number;
	score: number;
	found: number;
}

export function playBot(cfg: EclatsCfg, opts: { sight?: Sight; maxPieces?: number } = {}): BotRun {
	const sight = opts.sight ?? 'informed';
	const max = opts.maxPieces ?? 300;
	const s = createGame(cfg);
	while (s.status === 'playing' && s.pieceIndex <= max) {
		spendBoosters(s, sight);
		if (s.status !== 'playing') break;
		const pl = bestPlacement(s, sight);
		if (!pl) break;
		s.piece = { ...s.piece!, x: pl.x, rot: pl.rot };
		hardDrop(s);
		lockPiece(s);
		settle(s);
	}
	return { won: s.status === 'won', pieces: s.pieceIndex, score: s.score, found: s.found };
}
