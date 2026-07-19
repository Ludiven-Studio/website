// Alchimie levels plan (1-100). A level = discover ONE target element, starting from
// the 5 bases, by combining. Targets are the main (non-secret) elements sorted by their
// minimal build cost (fewest fusions to reach from the bases), then id — so the ramp goes
// from shallow targets (steam, lava) to deep ones (jeu vidéo, intelligence, dauphin).
//
// A level is CLEARED (1★) once the target is crafted. Stars grade efficiency: the fewer
// fusions used beyond the theoretical minimum, the more stars. metric 'time' (lower is
// better) with score = fusions used.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import { ELEMENTS, getElement } from './engine';

export interface AlchimieLevelCfg {
	target: string; // element id to discover
	minCombos: number; // theoretical minimum fusions from the bases
	twoStar: number; // ≤ this many fusions → 2★
	threeStar: number; // ≤ this many fusions → 3★
}

// Slack over the minimum for each star tier. Deeper targets get a bit more room to explore.
const K3 = 1; // 3★: near-optimal (at most 1 extra fusion)
const slack2 = (min: number): number => Math.max(3, Math.round(min * 0.6)); // 2★: proportional slack

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
		threeStar: minCombos + K3,
		twoStar: minCombos + slack2(minCombos),
	};
};

export const alchimieLevels: LevelPlan<AlchimieLevelCfg> = {
	count: Math.min(LEVEL_COUNT, TARGETS.length),
	metric: 'time', // lower is better — score = fusions used
	config: cfgFor,
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = cfgFor(level);
		if (r.score <= cfg.threeStar) return 3;
		if (r.score <= cfg.twoStar) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = cfgFor(level);
		return { two: `≤ ${cfg.twoStar} combinaisons`, three: `≤ ${cfg.threeStar} combinaisons` };
	},
};
