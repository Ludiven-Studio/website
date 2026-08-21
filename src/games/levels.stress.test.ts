// Walks every level of every game's plan with the Expert pack forced on. This is what
// makes the 101-200 pass safe: a config that throws, a NaN target or a repeated seed
// shows up here instead of in the browser.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { LevelPlan } from '../lib/progression';
import { earn, buyUnlock, resetWalletCache } from '../lib/wallet';

import { twentyFortyEightLevels } from './2048/levels';
import { accordsLevels } from './accords/levels';
import { alchimieLevels } from './alchimie/levels';
import { angryLevels } from './angry/levels';
import { aquariumLevels } from './aquarium/levels';
import { batailleLevels } from './bataille/levels';
import { billardLevels } from './billard/levels';
import { bullesLevels } from './bulles/levels';
import { calcudokuLevels } from './calcudoku/levels';
import { casseBriquesLevels } from './casse-briques/levels';
import { cheminLevels } from './chemin/levels';
import { circuitLevels } from './circuit/levels';
import { cocotteMineuseLevels } from './cocotte-mineuse/levels';
import { cocottesRenardsLevels } from './cocottes-renards/levels';
import { codecolorLevels } from './codecolor/levels';
import { colorgrammeLevels } from './colorgramme/levels';
import { cordesLevels } from './cordes/levels';
import { demineurLevels } from './demineur/levels';
import { driftLevels } from './drift/levels';
import { esquiveLevels } from './esquive/levels';
import { flappyLevels } from './flappy/levels';
import { flechettesLevels } from './flechettes/levels';
import { footLevels } from './foot/levels';
import { fruitsLevels } from './fruits/levels';
import { golfLevels } from './golf/levels';
import { lettresCroiseesLevels } from './lettres-croisees/levels';
import { lugeLevels } from './luge/levels';
import { lumenLevels } from './lumen/levels';
import { matricesLevels } from './matrices/levels';
import { meliMeloLevels } from './meli-melo/levels';
import { mineLevels } from './mine/levels';
import { motSecretLevels } from './mot-secret/levels';
import { motifsLevels } from './motifs/levels';
import { motsMelesLevels } from './mots-meles/levels';
import { motsTournesLevels } from './mots-tournes/levels';
import { pavageLevels } from './pavage/levels';
import { pongLevels } from './pong/levels';
import { reinesLevels } from './reines/levels';
import { reussiteLevels } from './reussite/levels';
import { rondCarreLevels } from './rond-carre/levels';
import { snakeLevels } from './snake/levels';
import { solitaireLevels } from './solitaire/levels';
import { sommeTouteLevels } from './somme-toute/levels';
import { spectroLevels } from './spectro/levels';
import { sudokuLevels } from './sudoku/levels';
import { suguruLevels } from './suguru/levels';
import { suiteLevels } from './suite/levels';
import { symbolesLevels } from './symboles/levels';
import { tectoniqueLevels } from './tectonique/levels';
import { tempoLevels } from './tempo/levels';
import { tenteLevels } from './tente/levels';
import { tubesLevels } from './tubes/levels';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PLANS: [string, LevelPlan<any>][] = [
	['2048', twentyFortyEightLevels],
	['accords', accordsLevels],
	['alchimie', alchimieLevels],
	['angry', angryLevels],
	['aquarium', aquariumLevels],
	['bataille', batailleLevels],
	['billard', billardLevels],
	['bulles', bullesLevels],
	['calcudoku', calcudokuLevels],
	['casse-briques', casseBriquesLevels],
	['chemin', cheminLevels],
	['circuit', circuitLevels],
	['cocotte-mineuse', cocotteMineuseLevels],
	['cocottes-renards', cocottesRenardsLevels],
	['codecolor', codecolorLevels],
	['colorgramme', colorgrammeLevels],
	['cordes', cordesLevels],
	['demineur', demineurLevels],
	['drift', driftLevels],
	['esquive', esquiveLevels],
	['flappy', flappyLevels],
	['flechettes', flechettesLevels],
	['foot', footLevels],
	['fruits', fruitsLevels],
	['golf', golfLevels],
	['lettres-croisees', lettresCroiseesLevels],
	['luge', lugeLevels],
	['lumen', lumenLevels],
	['matrices', matricesLevels],
	['meli-melo', meliMeloLevels],
	['mine', mineLevels],
	['mot-secret', motSecretLevels],
	['motifs', motifsLevels],
	['mots-meles', motsMelesLevels],
	['mots-tournes', motsTournesLevels],
	['pavage', pavageLevels],
	['pong', pongLevels],
	['reines', reinesLevels],
	['reussite', reussiteLevels],
	['rond-carre', rondCarreLevels],
	['snake', snakeLevels],
	['solitaire', solitaireLevels],
	['somme-toute', sommeTouteLevels],
	['spectro', spectroLevels],
	['sudoku', sudokuLevels],
	['suguru', suguruLevels],
	['suite', suiteLevels],
	['symboles', symbolesLevels],
	['tectonique', tectoniqueLevels],
	['tempo', tempoLevels],
	['tente', tenteLevels],
	['tubes', tubesLevels],
];

class MemStorage {
	private m = new Map<string, string>();
	getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
	setItem(k: string, v: string): void { this.m.set(k, v); }
	removeItem(k: string): void { this.m.delete(k); }
	clear(): void { this.m.clear(); }
}

/** Every finite number reachable from a config, so a NaN can't hide in a nested field. */
function numbers(v: unknown, out: number[] = [], depth = 0): number[] {
	if (depth > 4 || v == null) return out;
	if (typeof v === 'number') out.push(v);
	else if (Array.isArray(v)) for (const x of v.slice(0, 64)) numbers(x, out, depth + 1);
	else if (typeof v === 'object') for (const x of Object.values(v)) numbers(x, out, depth + 1);
	return out;
}

const baseCounts = new Map<string, number>();

beforeAll(() => {
	vi.stubGlobal('localStorage', new MemStorage());
	resetWalletCache();
	for (const [id, plan] of PLANS) baseCounts.set(id, plan.count);
	earn(PLANS.length * 200);
	for (const [id] of PLANS) buyUnlock(id);
});
beforeEach(() => resetWalletCache());
afterAll(() => vi.unstubAllGlobals());

describe('level plans, Expert pack on', () => {
	it('covers every game that ships a plan', () => {
		expect(new Set(PLANS.map(([id]) => id)).size).toBe(PLANS.length);
		expect(PLANS.length).toBe(52);
	});

	for (const [id, plan] of PLANS) {
		describe(id, () => {
			it('doubles its level count', () => {
				expect(plan.count).toBe(baseCounts.get(id)! * 2);
			});

			it('builds a sane config and hint for every level', () => {
				const seeds = new Set<number>();
				for (let l = 1; l <= plan.count; l++) {
					const cfg = plan.config(l) as { seed?: number };
					expect(cfg, `${id} level ${l}`).toBeTruthy();
					for (const n of numbers(cfg)) expect(Number.isFinite(n), `${id} level ${l}`).toBe(true);
					if (typeof cfg.seed === 'number') seeds.add(cfg.seed);
					const hint = plan.starHint(l);
					expect(hint.two.length, `${id} level ${l} two`).toBeGreaterThan(0);
					expect(hint.three.length, `${id} level ${l} three`).toBeGreaterThan(0);
				}
				// A seed per level, or none at all — a partial set means levels repeat boards.
				if (seeds.size > 0) expect(seeds.size, `${id} seeds`).toBe(plan.count);
			});

			it('grades a loss at 0 and stays in range', () => {
				for (const l of [1, Math.floor(plan.count / 2), plan.count]) {
					const best = plan.metric === 'time' ? 1 : 1e9;
					expect(plan.stars(l, { score: best, won: false }), `${id} level ${l}`).toBe(0);
					const s = plan.stars(l, { score: best, won: true, stat: 0 });
					expect(s, `${id} level ${l}`).toBeGreaterThanOrEqual(0);
					expect(s, `${id} level ${l}`).toBeLessThanOrEqual(3);
				}
			});
		});
	}
});
