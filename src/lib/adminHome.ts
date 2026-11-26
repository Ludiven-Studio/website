// The admin home's short lines under each figure, read off answers the page already has (overview, board):
// what matters first on each card, two or three lines at most.
import { APP_NAMES, appKey } from './appColors';
import type { Board, Overview } from './statsAdmin';

const int = new Intl.NumberFormat('fr-FR');
const pct = (n: number, digits = 0) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits })}${String.fromCharCode(0xa0)}%`;
const nameOf = (id: string) => {
	const key = appKey(id);
	return key ? APP_NAMES[key] : id;
};

const signed = (change: number) => `${change > 0 ? '+' : change < 0 ? '−' : ''}${pct(Math.abs(change))}`;

/** The Statistiques card: the app most visited, then the visitors of the last 7 days against the 7 days before.
 *  An answer cached before stats-admin read those (no `prev7`) compares the visits with the 28 days' weekly
 *  average instead: Umami counts visitors once per period, so only visits add up across weeks. */
export function statsLines(o: Overview): string[] {
	const lines: string[] = [];
	const top = [...o.apps].sort((a, b) => (b.periods.d7?.visitors ?? 0) - (a.periods.d7?.visitors ?? 0))[0];
	const topVisitors = top?.periods.d7?.visitors ?? 0;
	if (top && topVisitors) lines.push(`${top.name} en tête : ${int.format(topVisitors)} visiteurs`);
	const withPrev = o.apps.filter((a) => a.periods.prev7 && a.periods.d7);
	const before = withPrev.reduce((n, a) => n + (a.periods.prev7?.visitors ?? 0), 0);
	if (before > 0) {
		const now = withPrev.reduce((n, a) => n + (a.periods.d7?.visitors ?? 0), 0);
		lines.push(`Visiteurs : ${signed(Math.round((now / before - 1) * 100))} par rapport aux 7 jours d'avant (${int.format(before)})`);
		return lines;
	}
	const v7 = o.apps.reduce((n, a) => n + (a.periods.d7?.visits ?? 0), 0);
	const v28 = o.apps.reduce((n, a) => n + (a.periods.d28?.visits ?? 0), 0);
	if (v28 > 0) lines.push(`Visites : ${signed(Math.round((v7 / (v28 / 4) - 1) * 100))} par rapport à la moyenne des 28 derniers jours`);
	return lines;
}

/** The Versions card: the first waits of the board, in its order, each with its app; then how many more. */
export function waitLines(b: Board, max = 3): string[] {
	const all = b.apps.flatMap((a) => a.waits.map((w) => `${a.name} : ${w}`));
	const more = all.length - max;
	return [...all.slice(0, max), ...(more > 0 ? [`et ${more} autre${more > 1 ? 's' : ''}`] : [])];
}

/** The Versions de test card: the newest test builds, « Pétanque Game 1.0.19, le 25 nov. ». */
export function testLines(builds: { name: string; version: string; date: Date | null }[], max = 2): string[] {
	return builds
		.filter((b): b is { name: string; version: string; date: Date } => !!b.date)
		.sort((a, b) => b.date.getTime() - a.date.getTime())
		.slice(0, max)
		.map((b) => `${b.name} ${b.version}, le ${b.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })}`);
}

/** The Pubs maison card: shows and tap rate over 28 days, and the ad tapped most. */
export function houseAdLines(o: Overview): string[] {
	const byAd = new Map<string, { show: number; tap: number }>();
	for (const a of o.apps) for (const r of a.ads ?? []) {
		const t = byAd.get(r.ad) ?? { show: 0, tap: 0 };
		t.show += r.show;
		t.tap += r.tap;
		byAd.set(r.ad, t);
	}
	const show = [...byAd.values()].reduce((n, t) => n + t.show, 0);
	if (!show) return [];
	const tap = [...byAd.values()].reduce((n, t) => n + t.tap, 0);
	const lines = [`${int.format(show)} affichages, ${pct((tap / show) * 100, 1)} de clics sur les 28 derniers jours`];
	const [best, t] = [...byAd.entries()].sort((x, y) => y[1].tap - x[1].tap)[0];
	if (t.tap) lines.push(`La plus cliquée : ${nameOf(best)} (${int.format(t.tap)} clics)`);
	return lines;
}

/** The home reloads its cards this often, and only in a visible tab. */
export const RELOAD_MS = 10 * 60_000;

/** Whether the cards are due a reload: the tab is visible and the last reading is `every` old. */
export function dueReload(visibility: DocumentVisibilityState, lastAt: number, now: number, every = RELOAD_MS): boolean {
	return visibility === 'visible' && now - lastAt >= every;
}

/** Each figure's last value, and its change against the reading before when it moved. */
export interface Track { last: Record<string, number>; delta: Record<string, number> }
export const NO_TRACK: Track = { last: {}, delta: {} };

/** A figure read again: its badge is the change from the last reading, gone when that reading brings no change.
 *  A figure that failed to load is not read again, so it keeps its value and its badge. */
export function track(t: Track, key: string, value: number): Track {
	const before = t.last[key];
	const { [key]: _, ...delta } = t.delta;
	const change = before === undefined ? 0 : Math.round((value - before) * 100) / 100;
	return { last: { ...t.last, [key]: value }, delta: change ? { ...delta, [key]: change } : delta };
}

/** « +15 », « −1 », « +0,42 € ». */
export function deltaLabel(change: number, unit = ''): string {
	const n = Math.abs(change).toLocaleString('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(change) ? 0 : 2 });
	return `${change > 0 ? '+' : '−'}${n}${unit ? `${String.fromCharCode(0xa0)}${unit}` : ''}`;
}
