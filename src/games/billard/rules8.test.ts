import { describe, it, expect } from 'vitest';
import { initMatch8, applyShot, groupOf, type Match8, type Shot8, type Board8 } from './rules8';

const shot = (p: Partial<Shot8> = {}): Shot8 => ({ firstHitNumber: 1, potted: [], scratched: false, railAfterContact: true, ...p });
const board = (remaining: number[]): Board8 => ({ remaining });
const ALL = Array.from({ length: 15 }, (_, i) => i + 1);
// A post-break, still-open table with player 0 to shoot.
const open0 = (): Match8 => ({ ...initMatch8(0), broken: true });
// An assigned table: 0 = solids, 1 = stripes, 0 to shoot.
const assigned0 = (): Match8 => ({ ...initMatch8(0), broken: true, open: false, groups: { 0: 'solid', 1: 'stripe' } });

describe('groupOf', () => {
	it('maps numbers to groups', () => {
		expect([1, 4, 7].map(groupOf)).toEqual(['solid', 'solid', 'solid']);
		expect(groupOf(8)).toBe('eight');
		expect([9, 12, 15].map(groupOf)).toEqual(['stripe', 'stripe', 'stripe']);
		expect(groupOf(0)).toBeNull();
		expect(groupOf(16)).toBeNull();
	});
});

describe('break', () => {
	it('dry legal break passes the turn, table stays open', () => {
		const s = applyShot(initMatch8(0), shot({ firstHitNumber: 1, potted: [] }), board(ALL));
		expect(s.broken).toBe(true);
		expect(s.open).toBe(true);
		expect(s.turn).toBe(1);
		expect(s.winner).toBeNull();
		expect(s.ballInHand).toBeNull();
	});
	it('potting on the break stays open and the breaker continues (no group assigned)', () => {
		const s = applyShot(initMatch8(0), shot({ firstHitNumber: 1, potted: [3] }), board(ALL));
		expect(s.open).toBe(true);
		expect(s.groups[0]).toBeNull();
		expect(s.turn).toBe(0);
	});
	it('scratch on the break is a foul → opponent ball-in-hand, table still open', () => {
		const s = applyShot(initMatch8(0), shot({ potted: [3], scratched: true }), board(ALL));
		expect(s.turn).toBe(1);
		expect(s.ballInHand).toBe(1);
		expect(s.open).toBe(true);
		expect(s.winner).toBeNull();
	});
	it('missing the rack on the break is a foul', () => {
		const s = applyShot(initMatch8(0), shot({ firstHitNumber: null }), board(ALL));
		expect(s.ballInHand).toBe(1);
		expect(s.turn).toBe(1);
	});
	it('8 on the break → re-break, no winner', () => {
		const s = applyShot(initMatch8(0), shot({ firstHitNumber: 1, potted: [8] }), board(ALL));
		expect(s.winner).toBeNull();
		expect(s.broken).toBe(false);
		expect(s.turn).toBe(0);
	});
});

describe('open table', () => {
	it('legally potting one solid assigns groups and continues', () => {
		const s = applyShot(open0(), shot({ firstHitNumber: 3, potted: [3] }), board(ALL));
		expect(s.groups[0]).toBe('solid');
		expect(s.groups[1]).toBe('stripe');
		expect(s.open).toBe(false);
		expect(s.turn).toBe(0);
	});
	it('potting both groups at once keeps the table open and continues', () => {
		const s = applyShot(open0(), shot({ firstHitNumber: 3, potted: [3, 10] }), board(ALL));
		expect(s.open).toBe(true);
		expect(s.groups[0]).toBeNull();
		expect(s.turn).toBe(0);
	});
	it('hitting the 8 first while open is a foul', () => {
		const s = applyShot(open0(), shot({ firstHitNumber: 8, potted: [] }), board(ALL));
		expect(s.ballInHand).toBe(1);
		expect(s.turn).toBe(1);
		expect(s.open).toBe(true);
	});
});

describe('assigned table', () => {
	it('hitting the opponent group first is a foul', () => {
		const s = applyShot(assigned0(), shot({ firstHitNumber: 10, potted: [] }), board(ALL));
		expect(s.ballInHand).toBe(1);
		expect(s.turn).toBe(1);
	});
	it('legally potting own group continues, no ball-in-hand', () => {
		const s = applyShot(assigned0(), shot({ firstHitNumber: 3, potted: [3] }), board(ALL));
		expect(s.turn).toBe(0);
		expect(s.ballInHand).toBeNull();
	});
	it('no pot and no rail after contact is a foul (no-rail)', () => {
		const s = applyShot(assigned0(), shot({ firstHitNumber: 3, potted: [], railAfterContact: false }), board(ALL));
		expect(s.ballInHand).toBe(1);
		expect(s.turn).toBe(1);
	});
	it('clean miss with a rail passes the turn without ball-in-hand', () => {
		const s = applyShot(assigned0(), shot({ firstHitNumber: 3, potted: [], railAfterContact: true }), board(ALL));
		expect(s.turn).toBe(1);
		expect(s.ballInHand).toBeNull();
	});
	it('scratch while potting own ball is still a foul', () => {
		const s = applyShot(assigned0(), shot({ firstHitNumber: 3, potted: [3], scratched: true }), board(ALL));
		expect(s.ballInHand).toBe(1);
		expect(s.turn).toBe(1);
	});
	it('potting only the opponent ball is legal but passes the turn', () => {
		const s = applyShot(assigned0(), shot({ firstHitNumber: 3, potted: [10] }), board(ALL));
		expect(s.turn).toBe(1);
		expect(s.ballInHand).toBeNull();
	});
});

describe('the 8-ball', () => {
	it('legal 8 after clearing the group wins', () => {
		const s = applyShot(assigned0(), shot({ firstHitNumber: 8, potted: [8] }), board([8]));
		expect(s.winner).toBe(0);
	});
	it('potting the 8 early loses', () => {
		const s = applyShot(assigned0(), shot({ firstHitNumber: 3, potted: [8] }), board([3, 8]));
		expect(s.winner).toBe(1);
	});
	it('legal 8 but scratched loses', () => {
		const s = applyShot(assigned0(), shot({ firstHitNumber: 8, potted: [8], scratched: true }), board([8]));
		expect(s.winner).toBe(1);
	});
	it('last group ball + 8 on the same shot loses', () => {
		const s = applyShot(assigned0(), shot({ firstHitNumber: 3, potted: [3, 8] }), board([3, 8]));
		expect(s.winner).toBe(1);
	});
});

describe('purity', () => {
	it('applyShot never mutates the input state', () => {
		const st = assigned0();
		const snap = JSON.parse(JSON.stringify(st));
		applyShot(st, shot({ firstHitNumber: 3, potted: [3], scratched: true }), board(ALL));
		expect(st).toEqual(snap);
	});
});
