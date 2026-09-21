// Hand-rolled .ics — one calendar, one event, no dependency. The file is the
// only thing a signed-up player keeps once the tab is closed.

export interface IcsEvent {
	uid: string;
	startsAt: string;
	endsAt: string;
	summary: string;
	location: string;
	description: string;
	url: string;
	stamp?: Date;
}

/** RFC 5545 escaping: backslash first, or it would escape its own output. */
const esc = (s: string): string =>
	s.replace(/\\/g, '\\\\').replace(/[;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

/** 20260921T173000Z */
export const icsDate = (iso: string | Date): string =>
	new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Fold to 75 octets, continuations prefixed with one space. Counted in UTF-8
 *  bytes, not characters: "Vénissieux" is longer on the wire than on screen, and
 *  a split inside a multi-byte sequence corrupts the line. */
function fold(line: string): string {
	const bytes = new TextEncoder().encode(line);
	if (bytes.length <= 75) return line;
	const out: string[] = [];
	let start = 0;
	while (start < bytes.length) {
		const limit = out.length === 0 ? 75 : 74; // continuations spend one octet on the leading space
		let end = Math.min(start + limit, bytes.length);
		while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // never cut mid-codepoint
		const chunk = new TextDecoder().decode(bytes.slice(start, end));
		out.push(out.length === 0 ? chunk : ` ${chunk}`);
		start = end;
	}
	return out.join('\r\n');
}

export function buildIcs(e: IcsEvent): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Ludiven Studio//Rencontres//FR',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${e.uid}`,
		`DTSTAMP:${icsDate(e.stamp ?? new Date())}`,
		`DTSTART:${icsDate(e.startsAt)}`,
		`DTEND:${icsDate(e.endsAt)}`,
		`SUMMARY:${esc(e.summary)}`,
		`LOCATION:${esc(e.location)}`,
		`DESCRIPTION:${esc(e.description)}`,
		`URL:${esc(e.url)}`,
		'END:VEVENT',
		'END:VCALENDAR',
	];
	return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Hand the .ics to the OS. Object URL, revoked right after — a data: URL of
 *  this size is refused by some mobile browsers. */
export function downloadIcs(filename: string, ics: string): void {
	const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
