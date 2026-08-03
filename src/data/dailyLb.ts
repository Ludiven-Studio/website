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
		{ as: 'time', div: 100 },
	],
});

const score: ScoreFormat = { kind: 'plain', fmt: 'score' };
// Time races → stored in centiseconds, shown in whole seconds ("43 s" / "1:23").
const centis: ScoreFormat = { kind: 'duration', div: 100 };

export const DAILY_LB: Record<string, DailyLbCfg> = {
	// Score (higher is better) → "N pts"
	mine: { fmt: score },
	'2048': { fmt: score },
	snake: { fmt: score },
	'casse-briques': { fmt: score },
	tempo: { fmt: score },
	spectro: { fmt: score },
	'cocottes-renards': { fmt: score },
	flappy: { fmt: score },
	'cocotte-mineuse': { fmt: score },
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
	// Real-time vs-AI races → time to reach the target (Pong: 3 pts, Foot: 3 goals)
	pong: { fmt: centis },
	foot: { fmt: centis },
	bataille: { fmt: { kind: 'count', one: 'coup', many: 'coups' } }, // value = shots+sonars (not time)
	// Scaled durations
	drift: { fmt: { kind: 'duration', div: 1000 } }, // lap ms
	solitaire: { fmt: centis },
	esquive: { fmt: { kind: 'duration', div: 10 } }, // tenths survived
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
	// Alchimie daily: fewest fusions to craft the day's secret element, time tiebreak.
	alchimie: { lbId: 'alchimie-t', fmt: packed('fusions') },
	// Réussite (card solitaire): cards to foundations (max 52) + time tiebreak, logged under `<id>-t`.
	// Stored as (52 - cards) so "more cards" sorts ascending (metric time); `base` renders the count back.
	reussite: {
		lbId: 'reussite-t',
		fmt: { kind: 'packed', radix: 10_000_000, fields: [{ as: 'int', unit: 'cartes', base: 52 }, { as: 'time', div: 100 }] },
	},
	// Tectonique: crystals collected first, chrono as tiebreak. The grid size varies, so the
	// packed count is the crystals MISSED — which keeps ascending-is-better and needs no `base`.
	// Old plain-centis rows decode as "0 raté", i.e. a full clear, which is what they were.
	tectonique: { lbId: 'tectonique-t', fmt: packed('ratés') },
};
