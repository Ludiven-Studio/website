// Declarative score formats — one source of truth for how a leaderboard value is
// encoded (packed) and rendered, shared by each game's UI and the daily cards.
//
// A value is a single ascending/descending integer stored in Supabase. Some games
// pack several fields into it (strokes+time), others scale it (tenths, centiseconds)
// or reserve a high band for losses (démineur, codecolor). `formatScore` turns any
// such value into a human label; `encodePacked`/`decodePacked` do the lexicographic
// packing so engines never hand-roll it (and never drift from the card renderer).

export type ScoreFormat =
	| { kind: 'plain'; fmt: 'score' | 'time' | 'num' | 'name' } // raw value ("N pts", mm:ss, "N", hidden)
	| { kind: 'count'; one: string; many: string } // "N essai" / "N essais"
	| { kind: 'duration'; div: number; decimals: number; mmssAbove?: number } // seconds = v/div; mm:ss past a raw threshold
	| { kind: 'packed'; radix: number; fields: PackedField[]; sep?: string } // several fields in one int
	| { kind: 'threshold'; at: number; below: ScoreFormat; aboveLabel: string; aboveShowsDelta?: boolean };

export interface PackedField {
	as: 'int' | 'mmss' | 'mmss.cc'; // 'mmss.cc' keeps hundredths (mm:ss.cc)
	div?: number; // divide the raw field before rendering (e.g. centiseconds → 100)
	unit?: string; // suffix for 'int' fields, e.g. "coups"
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

const mmss = (totalSec: number): string => {
	const s = Math.max(0, Math.round(totalSec));
	return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
};
/** mm:ss.cc — keeps hundredths of a second (for close-record tie-breaking). */
const mmssCc = (totalSec: number): string => {
	const cs = Math.max(0, Math.round(totalSec * 100));
	return `${pad2(Math.floor(cs / 6000))}:${pad2(Math.floor((cs % 6000) / 100))}.${pad2(cs % 100)}`;
};

/** Live-timer / result label from centiseconds: "43.12 s" under a minute, else "1:23.45". */
export const fmtCentis = (cs: number): string => {
	const c = Math.max(0, Math.round(cs));
	if (c < 6000) return `${(c / 100).toFixed(2)} s`;
	return `${Math.floor(c / 6000)}:${pad2(Math.floor((c % 6000) / 100))}.${pad2(c % 100)}`;
};

/** Pack fields (highest significance first) into one integer. Each field must be < radix. */
export const encodePacked = (radix: number, fields: number[]): number =>
	fields.reduce((acc, f) => acc * radix + f, 0);

/** Inverse of encodePacked — returns `count` fields, highest significance first. */
export const decodePacked = (radix: number, count: number, v: number): number[] => {
	const out: number[] = [];
	for (let i = 0; i < count; i++) {
		out.unshift(v % radix);
		v = Math.floor(v / radix);
	}
	return out;
};

/** Render a leaderboard value per its format. Returns '' when it should stay hidden ('name'). */
export function formatScore(f: ScoreFormat, v: number): string {
	switch (f.kind) {
		case 'plain':
			switch (f.fmt) {
				case 'score':
					return `${v} pts`;
				case 'time':
					return mmss(v);
				case 'num':
					return String(v);
				default:
					return ''; // 'name' → pseudo only
			}
		case 'count':
			return `${v} ${v > 1 ? f.many : f.one}`;
		case 'duration':
			// Under the threshold: "43.12 s". Above: mm:ss.cc when we keep hundredths, else mm:ss.
			return f.mmssAbove != null && v >= f.mmssAbove
				? (f.decimals >= 2 ? mmssCc(v / f.div) : mmss(v / f.div))
				: `${(v / f.div).toFixed(f.decimals)} s`;
		case 'packed': {
			const parts = decodePacked(f.radix, f.fields.length, v);
			return f.fields
				.map((fl, i) => {
					const x = fl.div ? parts[i] / fl.div : parts[i];
					const s = fl.as === 'mmss.cc' ? mmssCc(x) : fl.as === 'mmss' ? mmss(x) : String(x);
					return fl.unit ? `${s} ${fl.unit}` : s;
				})
				.join(f.sep ?? ' · ');
		}
		case 'threshold':
			return v >= f.at ? (f.aboveShowsDelta ? `${f.aboveLabel}${v - f.at}` : f.aboveLabel) : formatScore(f.below, v);
	}
}
