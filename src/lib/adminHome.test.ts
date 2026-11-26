import { describe, expect, it } from 'vitest';
import { houseAdLines, statsLines, testLines, waitLines } from './adminHome';
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
	it('names the app most visited and compares the week with the 28 days’ average', () => {
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
