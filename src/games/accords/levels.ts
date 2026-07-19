// Accords levels plan (1-100). A level = a fixed SET of N seeded chords to
// reconstitute by ear at a difficulty tier. Cleared when all N chords are
// crossed; stars from how many were rebuilt right, the 3-star tier also gated on
// crossing each chord on the first try (no falls). Difficulty ramps the chord
// pool (simple triads -> tense extended chords) and the note count per chord.
//
// Metric = 'score' (number of chords correctly reconstituted, higher is better).
// Accords is untimed on purpose (you tune by ear, no rush), so the secondary
// star metric is `falls` = wrong crossings, not time.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';

export const CHORDS_PER_LEVEL = 5;

export interface AccChordType {
	name: string;
	offs: number[];
}

export interface AccChordSpec {
	root: number;
	chord: AccChordType;
	instrument: string;
	prefill: number[]; // indices (in sorted-target order) pre-locked as hints
}

export interface AccordsLevelCfg {
	seed: number;
	tier: number; // 0..3 difficulty tier
	label: string;
	count: number; // chords in this level (== CHORDS_PER_LEVEL)
	chords: AccChordSpec[];
}

// Chord pool, ordered by difficulty. Early tiers = plain triads; later tiers add
// sevenths, then dense/altered extensions (harder to hear + more peaks to place).
const POOL: AccChordType[][] = [
	// tier 0 — triads
	[
		{ name: 'Majeur', offs: [0, 4, 7] },
		{ name: 'Mineur', offs: [0, 3, 7] },
	],
	// tier 1 — triads + colour triads
	[
		{ name: 'Majeur', offs: [0, 4, 7] },
		{ name: 'Mineur', offs: [0, 3, 7] },
		{ name: 'sus4', offs: [0, 5, 7] },
		{ name: 'sus2', offs: [0, 2, 7] },
	],
	// tier 2 — sevenths
	[
		{ name: 'Majeur 7', offs: [0, 4, 7, 11] },
		{ name: 'Mineur 7', offs: [0, 3, 7, 10] },
		{ name: '7', offs: [0, 4, 7, 10] },
		{ name: 'm7♭5', offs: [0, 3, 6, 10] },
		{ name: 'dim7', offs: [0, 3, 6, 9] },
	],
	// tier 3 — extended / altered
	[
		{ name: 'Majeur 9', offs: [0, 4, 7, 11, 14] },
		{ name: 'Mineur 9', offs: [0, 3, 7, 10, 14] },
		{ name: '7♭9', offs: [0, 4, 10, 13] },
		{ name: '7♯9', offs: [0, 4, 10, 15] },
		{ name: 'Majeur 7♯11', offs: [0, 4, 7, 11, 18] },
		{ name: '13', offs: [0, 4, 10, 14, 21] },
	],
];

const INSTR_IDS = ['piano', 'orgue', 'cordes', 'trompette', 'violon', 'timbale', 'synthe'];

// Roots span a comfortable mid range (C3..B3 → 48..59) so peaks stay on screen.
const ROOT_LO = 48;
const ROOT_HI = 59;

const TIER_LABELS = ['Facile', 'Moyen', 'Difficile', 'Expert'];

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

// Difficulty tier ramps 0 → 3 across the 100 levels.
const tierFor = (l: number): number => Math.min(3, Math.floor((l - 1) / 25));

// mulberry32 inline (levels build is deterministic, independent of runtime prng import).
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const pick = <T>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length) % arr.length];

export const accordsLevels: LevelPlan<AccordsLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score', // best-retained = most chords rebuilt right (higher is better)
	config(level: number): AccordsLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const tier = tierFor(l);
		const pool = POOL[tier];
		const r = rng(levelSeed(l));
		// Higher tiers give fewer prefilled hints; the last tier gives none.
		const hintChance = tier === 0 ? 0.9 : tier === 1 ? 0.6 : tier === 2 ? 0.35 : 0;
		const chords: AccChordSpec[] = Array.from({ length: CHORDS_PER_LEVEL }, () => {
			const chord = pick(r, pool);
			const root = ROOT_LO + Math.floor(r() * (ROOT_HI - ROOT_LO + 1));
			const instrument = pick(r, INSTR_IDS);
			// Sorted-target count = number of peaks; maybe pre-lock one as a hint.
			const noteCount = chord.offs.length;
			const prefill: number[] = [];
			if (r() < hintChance) prefill.push(Math.floor(r() * noteCount));
			return { root, chord, instrument, prefill };
		});
		return { seed: levelSeed(l), tier, label: TIER_LABELS[tier], count: CHORDS_PER_LEVEL, chords };
	},
	// score = chords rebuilt right (0..N); stat = falls (wrong crossings).
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		const cfg = this.config(level);
		const n = cfg.count;
		if (!r.won || r.score < Math.ceil(n * 0.6)) return 0; // need ≥60% right to clear
		if (r.score < n) return 1; // cleared but not all right
		// All chords right: 3★ if flawless (no falls), else 2★.
		return (r.stat ?? Infinity) <= 0 ? 3 : 2;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return { two: `${cfg.count}/${cfg.count} justes`, three: `${cfg.count}/${cfg.count} sans chute` };
	},
};
