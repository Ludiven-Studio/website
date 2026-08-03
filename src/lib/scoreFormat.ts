// Declarative score formats — one source of truth for how a leaderboard value is
// encoded (packed) and rendered, shared by each game's UI and the daily cards.
//
// A value is a single ascending/descending integer stored in Supabase. Some games
// pack several fields into it (strokes+time), others scale it (tenths, centiseconds)
// or reserve a high band for losses (démineur, codecolor). `formatScore` turns any
// such value into a human label; `encodePacked`/`decodePacked` do the lexicographic
// packing so engines never hand-roll it (and never drift from the card renderer).

export type ScoreFormat =
	| { kind: 'plain'; fmt: 'score' | 'time' | 'num' | 'name' } // raw value ("N pts", seconds, "N", hidden)
	| { kind: 'count'; one: string; many: string } // "N essai" / "N essais"
	| { kind: 'duration'; div: number } // seconds = v/div
	| { kind: 'packed'; radix: number; fields: PackedField[]; sep?: string } // several fields in one int
	| { kind: 'threshold'; at: number; below: ScoreFormat; aboveLabel: string; aboveShowsDelta?: boolean };

export interface PackedField {
	as: 'int' | 'time';
	div?: number; // divide the raw field before rendering (e.g. centiseconds → 100)
	unit?: string; // suffix for 'int' fields, e.g. "coups"
	base?: number; // render `base - raw` (a field stored inverted so "more = better" sorts ascending)
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * The one way a duration is shown: whole seconds. "43 s" under a minute, "1:23" above.
 * Values stay stored to the hundredth, so records and ties still sort exactly — the
 * precision is simply never displayed, because a flickering decimal reads as noise.
 * Truncate rather than round: a chrono must never show a second the player hasn't spent
 * (a "≤ 15 s" star would otherwise look missed at 15 s displayed / 14.6 s real).
 */
export const fmtSeconds = (totalSec: number): string => {
	const s = Math.max(0, Math.floor(totalSec));
	return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${pad2(s % 60)}`;
};

/** Live-timer / result label from centiseconds. */
export const fmtCentis = (cs: number): string => fmtSeconds(cs / 100);

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
					return fmtSeconds(v);
				case 'num':
					return String(v);
				default:
					return ''; // 'name' → pseudo only
			}
		case 'count':
			return `${v} ${v > 1 ? f.many : f.one}`;
		case 'duration':
			return fmtSeconds(v / f.div);
		case 'packed': {
			const parts = decodePacked(f.radix, f.fields.length, v);
			return f.fields
				.map((fl, i) => {
					const raw = fl.base != null ? fl.base - parts[i] : parts[i];
					const x = fl.div ? raw / fl.div : raw;
					const s = fl.as === 'time' ? fmtSeconds(x) : String(x);
					return fl.unit ? `${s} ${fl.unit}` : s;
				})
				.join(f.sep ?? ' · ');
		}
		case 'threshold':
			return v >= f.at ? (f.aboveShowsDelta ? `${f.aboveLabel}${v - f.at}` : f.aboveLabel) : formatScore(f.below, v);
	}
}
