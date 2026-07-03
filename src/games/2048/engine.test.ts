import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../prng';
import {
	makeStream,
	createBoard,
	move,
	planMove,
	slideLine,
	spawnTile,
	isGameOver,
	hasWon,
	emptyCells,
	type Dir,
	type State,
} from './engine';

describe('2048 engine', () => {
	it('slideLine compresses and merges one pair', () => {
		expect(slideLine([2, 2, 4, 0])).toEqual({ line: [4, 4, 0, 0], gained: 4 });
		expect(slideLine([0, 0, 0, 2])).toEqual({ line: [2, 0, 0, 0], gained: 0 });
		expect(slideLine([2, 0, 2, 0])).toEqual({ line: [4, 0, 0, 0], gained: 4 });
	});

	it('slideLine never merges the same tile twice in one move', () => {
		expect(slideLine([2, 2, 2, 2])).toEqual({ line: [4, 4, 0, 0], gained: 8 });
		expect(slideLine([4, 4, 4, 0])).toEqual({ line: [8, 4, 0, 0], gained: 8 });
	});

	it('createBoard places exactly two tiles', () => {
		const stream = makeStream(mulberry32(123));
		const s = createBoard(4, stream);
		const filled = s.board.flat().filter((v) => v !== 0);
		expect(filled.length).toBe(2);
		expect(filled.every((v) => v === 2 || v === 4)).toBe(true);
		expect(s.score).toBe(0);
	});

	it('a move that changes nothing returns moved:false and spawns no tile', () => {
		// Left column filled, rest empty: sliding left is a no-op.
		const base: State = { board: [[2, 0, 0], [4, 0, 0], [8, 0, 0]], score: 0, size: 3, cursor: 0 };
		const stream = makeStream(mulberry32(1));
		const res = move(base, 'left', stream);
		expect(res.moved).toBe(false);
		expect(emptyCells(res.state.board).length).toBe(emptyCells(base.board).length);
	});

	it('a valid move adds exactly one new tile and scores the merge', () => {
		const base: State = { board: [[2, 2, 0], [0, 0, 0], [0, 0, 0]], score: 0, size: 3, cursor: 0 };
		const stream = makeStream(mulberry32(7));
		const before = base.board.flat().filter((v) => v !== 0).length; // 2
		const res = move(base, 'left', stream);
		expect(res.moved).toBe(true);
		expect(res.gained).toBe(4);
		expect(res.state.score).toBe(4);
		const after = res.state.board.flat().filter((v) => v !== 0).length; // merged (1) + spawn (1)
		expect(after).toBe(before - 1 + 1);
	});

	it('is deterministic: same seed + same moves → identical board/score/cursor', () => {
		const play = (): State => {
			const stream = makeStream(mulberry32(2048));
			let s = createBoard(4, stream);
			const script: Dir[] = ['left', 'up', 'right', 'down', 'left', 'up', 'right', 'down'];
			for (const d of script) s = move(s, d, stream).state;
			return s;
		};
		const a = play();
		const b = play();
		expect(b.board).toEqual(a.board);
		expect(b.score).toBe(a.score);
		expect(b.cursor).toBe(a.cursor);
	});

	it('planMove reports slides and merges without spawning', () => {
		const plan = planMove([[2, 2, 0], [0, 4, 4], [0, 0, 0]], 'left');
		expect(plan.moved).toBe(true);
		expect(plan.gained).toBe(4 + 8);
		expect(plan.board).toEqual([[4, 0, 0], [8, 0, 0], [0, 0, 0]]);
		// Row 0: two tiles merge into (0,0).
		const toRow0 = plan.slides.filter((s) => s.toR === 0 && s.toC === 0);
		expect(toRow0.length).toBe(2);
		expect(toRow0.every((s) => s.merged)).toBe(true);
	});

	it('planMove leaves a settled board unmoved', () => {
		expect(planMove([[2, 4], [8, 16]], 'left').moved).toBe(false);
	});

	it('isGameOver true on a full board with no possible merge', () => {
		const full: State = { board: [[2, 4, 2], [4, 2, 4], [2, 4, 2]], score: 0, size: 3, cursor: 0 };
		expect(isGameOver(full)).toBe(true);
	});

	it('hasWon detects a 2048 tile', () => {
		const s: State = { board: [[2048, 0], [0, 0]], score: 0, size: 2, cursor: 0 };
		expect(hasWon(s)).toBe(true);
	});

	it('spawnTile is a no-op on a full board', () => {
		const full: State = { board: [[2, 4], [4, 2]], score: 0, size: 2, cursor: 0 };
		expect(spawnTile(full, makeStream(mulberry32(3)))).toBe(full);
	});
});
