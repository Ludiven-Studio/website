// Alchimie levels plan (1-100). A level = discover ONE target element, starting from
// the 5 bases, by combining. Targets are the main (non-secret) elements sorted by their
// minimal build cost (fewest fusions to reach from the bases), then id — so the ramp goes
// from shallow targets (steam, lava) to deep ones (jeu vidéo, intelligence, dauphin).
//
// A level is CLEARED (1★) once the target is crafted. Stars grade speed: score = time in
// centiseconds, and the budget scales with the target's depth (minCombos). The fusion
// count is still reported as `stat` for the outcome card.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import { ELEMENTS, getElement } from './engine';
import { fmtSeconds } from '../../lib/scoreFormat';

export interface AlchimieLevelCfg {
	target: string; // element id to discover
	minCombos: number; // theoretical minimum fusions from the bases
	twoStar: number; // ≤ this many centiseconds → 2★
	threeStar: number; // ≤ this many centiseconds → 3★
}

// Time budget per star tier, in seconds: a flat allowance plus a per-required-fusion rate
// (find two cards in a growing inventory, drag, read the result).
const threeStarSec = (min: number): number => 15 + 12 * min;
const twoStarSec = (min: number): number => 30 + 30 * min;

/** Minimal fusions to build every main element = size of its distinct non-base ancestor set
    (each ancestor must be crafted exactly once; the target itself counts). Memoized. */
const buildCost = (() => {
	const memo = new Map<string, number>();
	const anc = (id: string, acc: Set<string>): void => {
		const el = getElement(id);
		if (!el?.recipe) return; // base — no fusion needed
		for (const r of el.recipe) {
			if (!acc.has(r)) { acc.add(r); anc(r, acc); }
		}
	};
	return (id: string): number => {
		const cached = memo.get(id);
		if (cached != null) return cached;
		const el = getElement(id);
		if (!el?.recipe) { memo.set(id, 0); return 0; }
		const acc = new Set<string>([id]);
		anc(id, acc);
		// Count only non-base elements in the closure (each is one fusion).
		let n = 0;
		for (const x of acc) if (getElement(x)?.recipe) n++;
		memo.set(id, n);
		return n;
	};
})();

/** 100 targets ordered by increasing build cost, then id — deterministic. Only main
    elements with a recipe qualify (bases excluded, secrets excluded). If there are more
    than 100 candidates we space them evenly across the range so the ramp spans the whole
    tree from shallow to deep; if fewer, we cap the plan at what exists. */
const TARGETS: string[] = (() => {
	const candidates = ELEMENTS.filter((el) => el.recipe).map((el) => el.id);
	candidates.sort((a, b) => {
		const d = buildCost(a) - buildCost(b);
		return d !== 0 ? d : a.localeCompare(b);
	});
	if (candidates.length <= LEVEL_COUNT) return candidates;
	// Even spacing keeps both the shallowest and the deepest targets in the plan.
	const out: string[] = [];
	for (let i = 0; i < LEVEL_COUNT; i++) {
		const idx = Math.round((i * (candidates.length - 1)) / (LEVEL_COUNT - 1));
		out.push(candidates[idx]);
	}
	return out;
})();

const cfgFor = (level: number): AlchimieLevelCfg => {
	const l = Math.max(1, Math.min(TARGETS.length, level));
	const target = TARGETS[l - 1];
	const minCombos = buildCost(target);
	return {
		target,
		minCombos,
		threeStar: threeStarSec(minCombos) * 100,
		twoStar: twoStarSec(minCombos) * 100,
	};
};

export const alchimieLevels: LevelPlan<AlchimieLevelCfg> = {
	count: Math.min(LEVEL_COUNT, TARGETS.length),
	metric: 'time', // lower is better — score = centiseconds
	config: cfgFor,
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = cfgFor(level);
		if (r.score <= cfg.threeStar) return 3;
		if (r.score <= cfg.twoStar) return 2;
		return 1;
	},
	starHint(level: number) {
		const min = cfgFor(level).minCombos;
		return { two: `≤ ${fmtSeconds(twoStarSec(min))}`, three: `≤ ${fmtSeconds(threeStarSec(min))}` };
	},
};
