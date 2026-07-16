// Games whose daily scores go through the secure Edge Function path
// (games/game_scores + submit-score), instead of the legacy direct-insert RPC.
// The <Leaderboard> component reads this to route both submission and reads.
// Metric direction must match the `games` table row (time = lower is better).
//
// Excluded on purpose (need bespoke handling, still on the legacy path):
//   - packed score+time: angry, golf, billard, flechettes, reussite (logged under `<id>-t`)
//   - threshold win/loss bands: demineur, codecolor, mot-secret

import type { Metric } from '../lib/leaderboard';

export const SECURED_GAMES: Record<string, Metric> = {
	// Score — higher is better
	luge: 'score',
	'2048': 'score',
	snake: 'score',
	flappy: 'score',
	tempo: 'score',
	spectro: 'score',
	'cocottes-renards': 'score',
	'meli-melo': 'score',
	esquive: 'score',
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
};

export const isSecured = (gameId: string): boolean =>
	Object.prototype.hasOwnProperty.call(SECURED_GAMES, gameId);
