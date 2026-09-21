// Display helpers for the Rencontres island. Everything is shown in
// Europe/Paris, the same zone the date filters count in (src/lib/day.ts) — a
// device-local render would put an event in a different bucket than the filter
// that let it through.

const TZ = 'Europe/Paris';

const dayFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const shortDayFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const formatDay = (iso: string): string => cap(dayFmt.format(new Date(iso)));
export const formatShortDay = (iso: string): string => cap(shortDayFmt.format(new Date(iso)));
export const formatTime = (iso: string): string => timeFmt.format(new Date(iso));

export const formatSlot = (startsAt: string, endsAt: string): string =>
	`${formatTime(startsAt)} – ${formatTime(endsAt)}`;

/** Value for an <input type="datetime-local">, which wants local wall-clock
 *  time with no zone marker. */
export function toLocalInput(d: Date): string {
	const p = (n: number): string => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Next round hour at least `hoursAhead` away — a sane default for the form. */
export function defaultStart(hoursAhead = 24): Date {
	const d = new Date(Date.now() + hoursAhead * 3600_000);
	d.setMinutes(0, 0, 0);
	d.setHours(d.getHours() + 1);
	return d;
}
