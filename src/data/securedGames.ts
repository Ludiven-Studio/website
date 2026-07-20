// Games whose daily scores go through the secure Edge Function path
// (games/game_scores + submit-score), instead of the legacy direct-insert RPC.
// The <Leaderboard> component reads this to route both submission and reads.
// Metric direction must match the `games` table row (time = lower is better).
//
// Packed (golf/angry/billard/flechettes/reussite) and threshold (demineur/codecolor/
// mot-secret) games ride the 'time' metric too: their encoded value is already
// lexicographically ascending-is-better (packed = count in high digits + time; threshold
// = wins below the loss band), so ordering + best-retained work on the raw int with no
// decode. Their run-length can't be derived from the value → no min-time rule (a per-game
// seed-replay check in validateGameSpecific is the future hardening step).

import type { Metric } from '../lib/leaderboard';

export const SECURED_GAMES: Record<string, Metric> = {
	// Score — higher is better
	mine: 'score',
	luge: 'score',
	'2048': 'score',
	snake: 'score',
	flappy: 'score',
	tempo: 'score',
	spectro: 'score',
	'cocottes-renards': 'score',
	'meli-melo': 'score',
	esquive: 'score',
	'cocotte-mineuse': 'score',
	// Time — lower is better
	sudoku: 'time',
	'mots-tournes': 'time',
	'mots-meles': 'time',
	'lettres-croisees': 'time',
	suite: 'time',
	calcudoku: 'time',
	tubes: 'time',
	suguru: 'time',
	'somme-toute': 'time',
	colorgramme: 'time',
	solitaire: 'time',
	'rond-carre': 'time',
	motifs: 'time',
	aquarium: 'time',
	pavage: 'time',
	chemin: 'time',
	fruits: 'time',
	tente: 'time',
	bataille: 'time',
	matrices: 'time',
	symboles: 'time',
	reines: 'time',
	drift: 'time',
	// Packed count+time (logged under `<id>-t`) — value is ascending-is-better already.
	'golf-t': 'time',
	'angry-t': 'time',
	'billard-t': 'time',
	'flechettes-t': 'time',
	'reussite-t': 'time',
	// Threshold win/loss bands — wins sort below the loss offset, so ascending works.
	demineur: 'time',
	codecolor: 'time',
	'mot-secret': 'time',
};

export const isSecured = (gameId: string): boolean =>
	Object.prototype.hasOwnProperty.call(SECURED_GAMES, gameId);
