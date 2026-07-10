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
//   v = count*100000 + min(99999, round(timeSec*10)).
const packed = (unit: string): ScoreFormat => ({
	kind: 'packed',
	radix: 100000,
	fields: [
		{ as: 'int', unit },
		{ as: 'mmss', div: 10 },
	],
});

const score: ScoreFormat = { kind: 'plain', fmt: 'score' };
const time: ScoreFormat = { kind: 'plain', fmt: 'time' };

export const DAILY_LB: Record<string, DailyLbCfg> = {
	// Score (higher is better) → "N pts"
	'2048': { fmt: score },
	snake: { fmt: score },
	tempo: { fmt: score },
	spectro: { fmt: score },
	'cocottes-renards': { fmt: score },
	flappy: { fmt: score },
	// Time (seconds) → mm:ss
	tubes: { fmt: time },
	tente: { fmt: time },
	chemin: { fmt: time },
	matrices: { fmt: time },
	reines: { fmt: time },
	symboles: { fmt: time },
	calcudoku: { fmt: time },
	'somme-toute': { fmt: time },
	aquarium: { fmt: time },
	pavage: { fmt: time },
	fruits: { fmt: time },
	suite: { fmt: time },
	'mots-meles': { fmt: time },
	'rond-carre': { fmt: time },
	colorgramme: { fmt: time },
	sudoku: { fmt: time },
	suguru: { fmt: time },
	motifs: { fmt: time },
	bataille: { fmt: time },
	// Scaled durations
	drift: { fmt: { kind: 'duration', div: 1000, decimals: 2, mmssAbove: 60000 } }, // lap ms
	solitaire: { fmt: { kind: 'duration', div: 100, decimals: 2, mmssAbove: 6000 } }, // centiseconds
	esquive: { fmt: { kind: 'duration', div: 10, decimals: 1 } }, // tenths survived
	// Distance in meters (higher is better) → "1234 m"
	luge: { fmt: { kind: 'count', one: 'm', many: 'm' } },
	// Win value below a loss band (cf. LOSS_OFFSET = 100000 in each game)
	demineur: { fmt: { kind: 'threshold', at: 100000, below: time, aboveLabel: '💣 ', aboveShowsDelta: true } },
	codecolor: { fmt: { kind: 'threshold', at: 100000, below: { kind: 'count', one: 'essai', many: 'essais' }, aboveLabel: '❌' } },
	// Packed strokes/darts/cocottes + time, logged under `<id>-t`
	angry: { lbId: 'angry-t', fmt: packed('cocottes') },
	golf: { lbId: 'golf-t', fmt: packed('coups') },
	flechettes: { lbId: 'flechettes-t', fmt: packed('fléch.') },
	billard: { lbId: 'billard-t', fmt: packed('coups') },
};
