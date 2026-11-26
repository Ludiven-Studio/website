import { describe, expect, it } from 'vitest';
import { NO_TRACK, deltaLabel, dueReload, houseAdLines, statsLines, testLines, track, waitLines } from './adminHome';
import type { Board, BoardApp, Overview } from './statsAdmin';

const nbsp = (s: string) => s.replace(/\s/g, ' ');
const app = (name: string, d7: [number, number], d28: [number, number], ads: { ad: string; show: number; tap: number }[] = []) =>
	({ name, periods: { d1: null, d7: { visitors: d7[0], visits: d7[1], pageviews: 0 }, d28: { visitors: d28[0], visits: d28[1], pageviews: 0 } }, ads });
const OVERVIEW = {
	generatedAt: '',
	apps: [
		app('Dragon\'s Gems', [251, 527], [530, 1378], [{ ad: 'petanque-game', show: 1830, tap: 37 }]),
		app('Pétanque Game', [640, 1344], [1204, 3130], [{ ad: 'dragon-gems', show: 4120, tap: 61 }, { ad: 'nino-rush', show: 3890, tap: 44 }]),
		app('Nino Rush', [170, 357], [388, 1009], [{ ad: 'dragon-gems', show: 990, tap: 9 }]),
	],
} as unknown as Overview;

describe('admin home lines', () => {
	it('compares the visitors of the last 7 days with the 7 days before', () => {
		const prev = (o: Overview, visitors: number[]) =>
			({ ...o, apps: o.apps.map((a, i) => ({ ...a, periods: { ...a.periods, prev7: { visitors: visitors[i], visits: 0, pageviews: 0 } } })) }) as Overview;
		// 1061 visitors now against 1100 before: −4 %.
		expect(statsLines(prev(OVERVIEW, [200, 700, 200])).map(nbsp)).toEqual([
			'Pétanque Game en tête : 640 visiteurs',
			"Visiteurs : −4 % par rapport aux 7 jours d'avant (1 100)",
		]);
	});

	it('falls back on the 28 days’ average for an answer cached without the week before', () => {
		// 2228 visits in 7 days against 5517 / 4 = 1379.25 a week: +62 %.
		expect(statsLines(OVERVIEW).map(nbsp)).toEqual([
			'Pétanque Game en tête : 640 visiteurs',
			'Visites : +62 % par rapport à la moyenne des 28 derniers jours',
		]);
	});

	it('lists the first three waits with their app, then how many more', () => {
		const row = (name: string, waits: string[]) => ({ name, waits }) as BoardApp;
		const board: Board = { generatedAt: '', apps: [row('Pétanque Game', ['Soumettre la 1.0.19 à Apple']), row('Nino Rush', []), row("Dragon's Gems", ['Data safety', 'Fiche App Store', 'Prix'])] };
		expect(waitLines(board)).toEqual(["Pétanque Game : Soumettre la 1.0.19 à Apple", "Dragon's Gems : Data safety", "Dragon's Gems : Fiche App Store", 'et 1 autre']);
		expect(waitLines({ generatedAt: '', apps: [] })).toEqual([]);
	});

	it('lists the two newest test builds', () => {
		const b = (name: string, version: string, at: string | null) => ({ name, version, date: at ? new Date(at) : null });
		expect(testLines([b('Dominoland', '0.4.0', '2026-11-20T10:00:00Z'), b('Pétanque Game', '1.0.19', '2026-11-25T18:00:00Z'), b('Drone Battle', '0.2', null), b("Dragon's Gems", '1.1.9', '2026-11-24T09:00:00Z')]))
			.toEqual(['Pétanque Game 1.0.19, le 25 nov.', "Dragon's Gems 1.1.9, le 24 nov."]);
	});

	it('sums the house ads over every app and names the one tapped most', () => {
		expect(houseAdLines(OVERVIEW).map(nbsp)).toEqual([
			'10 830 affichages, 1,4 % de clics sur les 28 derniers jours',
			"La plus cliquée : Dragon's Gems (70 clics)",
		]);
		expect(houseAdLines({ generatedAt: '', apps: [] } as unknown as Overview)).toEqual([]);
	});
});

describe('admin home reloads', () => {
	const min = 60_000;
	it('reloads only in a visible tab, once the last reading is 10 minutes old', () => {
		expect(dueReload('visible', 0, Date.UTC(2026, 10, 26))).toBe(true); // never read yet
		expect(dueReload('visible', 10 * min, 19 * min)).toBe(false);
		expect(dueReload('visible', 10 * min, 20 * min)).toBe(true);
		expect(dueReload('hidden', 10 * min, 60 * min)).toBe(false);
		expect(dueReload('visible', 10 * min, 60 * min)).toBe(true); // back on the tab after a long while
	});

	it('badges a figure that moved, and clears it at the next reading that brings no change', () => {
		let t = track(NO_TRACK, 'visitors', 1061);
		expect(t.delta).toEqual({}); // the first reading has nothing to compare with
		t = track(t, 'visitors', 1076);
		t = track(t, 'waits', 4);
		expect(t.delta).toEqual({ visitors: 15 });
		t = track(t, 'waits', 3);
		expect(t.delta).toEqual({ visitors: 15, waits: -1 }); // a figure not read again keeps its badge
		t = track(t, 'visitors', 1076);
		expect(t.delta).toEqual({ waits: -1 });
		expect(track(track(NO_TRACK, 'revenue', 12.37), 'revenue', 12.79).delta).toEqual({ revenue: 0.42 });
	});

	it('writes the change with its sign', () => {
		expect(deltaLabel(15)).toBe('+15');
		expect(deltaLabel(-1)).toBe('−1');
		expect(nbsp(deltaLabel(0.42, '€'))).toBe('+0,42 €');
		expect(nbsp(deltaLabel(-1200))).toBe('−1 200');
	});
});
