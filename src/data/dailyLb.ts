// Per-game display config for the daily leaderboard "record du jour" shown on game cards.
// `lbId` overrides the Supabase game id when it differs (a few games log under `<id>-t`).
// `fmt` decides how the leader's value is rendered; 'name' = show only the pseudo (for
// games whose value is packed/ambiguous, so we never display a misleading number).

export type LbFmt = 'score' | 'time' | 'ms' | 'centis' | 'num' | 'name';

export interface DailyLbCfg {
	lbId?: string;
	fmt: LbFmt;
}

export const DAILY_LB: Record<string, DailyLbCfg> = {
	// Score (higher is better) → "N pts"
	'2048': { fmt: 'score' },
	snake: { fmt: 'score' },
	tempo: { fmt: 'score' },
	spectro: { fmt: 'score' },
	'cocottes-renards': { fmt: 'score' },
	flappy: { fmt: 'score' },
	// Time (seconds) → mm:ss
	tubes: { fmt: 'time' },
	tente: { fmt: 'time' },
	chemin: { fmt: 'time' },
	matrices: { fmt: 'time' },
	reines: { fmt: 'time' },
	symboles: { fmt: 'time' },
	calcudoku: { fmt: 'time' },
	'somme-toute': { fmt: 'time' },
	aquarium: { fmt: 'time' },
	pavage: { fmt: 'time' },
	fruits: { fmt: 'time' },
	suite: { fmt: 'time' },
	'mots-meles': { fmt: 'time' },
	'rond-carre': { fmt: 'time' },
	colorgramme: { fmt: 'time' },
	sudoku: { fmt: 'time' },
	suguru: { fmt: 'time' },
	motifs: { fmt: 'time' },
	bataille: { fmt: 'time' },
	billard: { fmt: 'time' },
	// Custom units
	drift: { fmt: 'ms' },
	solitaire: { fmt: 'centis' },
	codecolor: { fmt: 'num' }, // "coût" (lower is better)
	// Packed / ambiguous value → show the record holder only
	esquive: { fmt: 'name' },
	demineur: { fmt: 'name' },
	angry: { lbId: 'angry-t', fmt: 'name' },
	golf: { lbId: 'golf-t', fmt: 'name' },
	flechettes: { lbId: 'flechettes-t', fmt: 'name' },
};

const mmss = (totalSec: number): string => {
	const s = Math.max(0, Math.round(totalSec));
	return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Render the leader's value for a card. Returns '' when the value should be hidden. */
export function fmtDaily(fmt: LbFmt, v: number): string {
	switch (fmt) {
		case 'score':
			return `${v} pts`;
		case 'time':
			return mmss(v);
		case 'ms':
			return v < 60000 ? `${(v / 1000).toFixed(2)} s` : mmss(v / 1000);
		case 'centis':
			return v < 6000 ? `${(v / 100).toFixed(2)} s` : mmss(v / 100);
		case 'num':
			return String(v);
		case 'name':
		default:
			return '';
	}
}
