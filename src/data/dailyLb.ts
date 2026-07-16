// Per-game config for the daily "record du jour" shown on game cards.
// `lbId` overrides the Supabase game id when it differs (a few games log under `<id>-t`).
// `fmt` is a declarative ScoreFormat (see lib/scoreFormat) — the single source of truth
// for rendering, shared with each game's own leaderboard UI.

import type { ScoreFormat } from '../lib/scoreFormat';

export interface DailyLbCfg {
	lbId?: string;
	fmt: ScoreFormat;
}

// Packed "count + time" score, shared by golf/angry/flechettes/billard:
//   v = count*10_000_000 + min(9_999_999, round(timeSec*100))  (centiseconds).
const packed = (unit: string): ScoreFormat => ({
	kind: 'packed',
	radix: 10_000_000,
	fields: [
		{ as: 'int', unit },
		{ as: 'mmss.cc', div: 100 },
	],
});

const score: ScoreFormat = { kind: 'plain', fmt: 'score' };
// Time races → centiseconds: "43.12 s" under a minute, else "1:23.45" (fine tie-breaking).
const centis: ScoreFormat = { kind: 'duration', div: 100, decimals: 2, mmssAbove: 6000 };

export const DAILY_LB: Record<string, DailyLbCfg> = {
	// Score (higher is better) → "N pts"
	'2048': { fmt: score },
	snake: { fmt: score },
	tempo: { fmt: score },
	spectro: { fmt: score },
	'cocottes-renards': { fmt: score },
	flappy: { fmt: score },
	// Time (seconds) → mm:ss
	tubes: { fmt: centis },
	tente: { fmt: centis },
	chemin: { fmt: centis },
	matrices: { fmt: centis },
	reines: { fmt: centis },
	symboles: { fmt: centis },
	calcudoku: { fmt: centis },
	'somme-toute': { fmt: centis },
	aquarium: { fmt: centis },
	pavage: { fmt: centis },
	fruits: { fmt: centis },
	suite: { fmt: centis },
	'mots-meles': { fmt: centis },
	'mots-tournes': { fmt: centis },
	'lettres-croisees': { fmt: centis },
	'rond-carre': { fmt: centis },
	colorgramme: { fmt: centis },
	sudoku: { fmt: centis },
	suguru: { fmt: centis },
	motifs: { fmt: centis },
	bataille: { fmt: { kind: 'count', one: 'coup', many: 'coups' } }, // value = shots+sonars (not time)
	// Scaled durations
	drift: { fmt: { kind: 'duration', div: 1000, decimals: 2, mmssAbove: 60000 } }, // lap ms
	solitaire: { fmt: { kind: 'duration', div: 100, decimals: 2, mmssAbove: 6000 } }, // centiseconds
	esquive: { fmt: { kind: 'duration', div: 10, decimals: 1 } }, // tenths survived
	// Meters × speed multiplier (higher is better) → "1234 pts"
	luge: { fmt: { kind: 'count', one: 'pt', many: 'pts' } },
	// Win value below a loss band (cf. LOSS_OFFSET = 100000 in each game)
	demineur: { fmt: { kind: 'threshold', at: 100000, below: centis, aboveLabel: '💣 ', aboveShowsDelta: true } },
	codecolor: { fmt: { kind: 'threshold', at: 100000, below: { kind: 'count', one: 'essai', many: 'essais' }, aboveLabel: '❌' } },
	'mot-secret': { fmt: { kind: 'threshold', at: 100000, below: { kind: 'count', one: 'essai', many: 'essais' }, aboveLabel: '❌' } },
	// Boggle points (higher is better)
	'meli-melo': { fmt: score },
	// Packed strokes/darts/cocottes + time, logged under `<id>-t`
	angry: { lbId: 'angry-t', fmt: packed('cocottes') },
	golf: { lbId: 'golf-t', fmt: packed('coups') },
	flechettes: { lbId: 'flechettes-t', fmt: packed('fléch.') },
	billard: { lbId: 'billard-t', fmt: packed('coups') },
	// Réussite (card solitaire): cards to foundations (max 52) + time tiebreak, logged under `<id>-t`.
	// Stored as (52 - cards) so "more cards" sorts ascending (metric time); `base` renders the count back.
	reussite: {
		lbId: 'reussite-t',
		fmt: { kind: 'packed', radix: 10_000_000, fields: [{ as: 'int', unit: 'cartes', base: 52 }, { as: 'mmss.cc', div: 100 }] },
	},
};
