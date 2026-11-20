// The testers' manifest (builds/<app>/latest.json in Supabase storage), read by the apps' beta pages.

export interface BetaBuild {
	url: string;
	version: string;
	date: Date | null;
	size: number | null; // bytes
	commit: string;
	notes: string[];
}

/** The manifest's fields, or null when it cannot offer a download: no https link to an APK, no version. */
export function readBetaBuild(b: unknown): BetaBuild | null {
	if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
	const m = b as Record<string, unknown>;
	if (typeof m.url !== 'string' || typeof m.version !== 'string' || !m.version.trim()) return null;
	let link: URL;
	try {
		link = new URL(m.url);
	} catch {
		return null;
	}
	// Anything else in the button (javascript:, http:, a web page) is not what testers should get.
	if (link.protocol !== 'https:' || !/\.apk$/i.test(link.pathname)) return null;
	const date = typeof m.date === 'string' || typeof m.date === 'number' ? new Date(m.date) : null;
	return {
		url: link.href,
		version: m.version.trim(),
		date: date && !Number.isNaN(date.getTime()) ? date : null,
		size: typeof m.size === 'number' && Number.isFinite(m.size) && m.size > 0 ? m.size : null,
		commit: typeof m.commit === 'string' ? m.commit : '',
		notes: Array.isArray(m.notes) ? m.notes.filter((n): n is string => typeof n === 'string' && n.trim() !== '') : [],
	};
}
