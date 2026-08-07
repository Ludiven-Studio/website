// Source-level guards around the Expert tier. These read the files rather than importing
// them, because the difficulty records are named differently in almost every game
// (DIFFS, SNAKE_DIFFS, SIZES, LEVELS...) and a rename must not silently skip a check.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NO_EXPERT } from '../lib/difficulty';

const GAMES_DIR = join(process.cwd(), 'src', 'games');

function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
		else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
	}
	return out;
}

const ALL_SOURCES = [...sourceFiles(GAMES_DIR), join(process.cwd(), 'src', 'components', 'GolfProto3D.tsx')];

// A game is a folder that ships a level plan — that excludes `words/`, the shared lexicon.
const gameDirs = readdirSync(GAMES_DIR).filter((n) => {
	if (!statSync(join(GAMES_DIR, n)).isDirectory()) return false;
	try {
		return statSync(join(GAMES_DIR, n, 'levels.ts')).isFile();
	} catch {
		return false;
	}
});

describe('DIFF_ORDER stays at three entries', () => {
	// The daily challenge indexes its seed on this array. A fourth entry would shift every
	// player's puzzle of the day, so Expert is appended at render time by withExpert() instead.
	const decls: [string, string][] = [];
	for (const file of ALL_SOURCES) {
		const src = readFileSync(file, 'utf8');
		const m = src.match(/DIFF_ORDER[^=]*=\s*\[[^\]]*\]/g);
		if (m) for (const d of m) decls.push([file, d]);
	}

	it('finds every declaration', () => {
		expect(decls.length).toBeGreaterThanOrEqual(40);
	});

	for (const [file, decl] of decls) {
		it(`${file.slice(file.indexOf('src'))} has 3 keys`, () => {
			expect(decl.split(',').filter((s) => s.includes("'")).length).toBe(3);
			expect(decl).not.toContain('expert');
		});
	}
});

describe('Expert tier wiring', () => {
	// A game either gates Expert in its UI *and* declares the key, or has neither.
	const gated = gameDirs.filter((g) =>
		sourceFiles(join(GAMES_DIR, g)).some((f) => /\b(diffKeys|withExpert)\s*\(/.test(readFileSync(f, 'utf8'))),
	);

	it('gates Expert in enough games', () => {
		expect(gated.length).toBeGreaterThanOrEqual(37);
	});

	for (const g of gated) {
		it(`${g} declares an expert entry with a label`, () => {
			const src = sourceFiles(join(GAMES_DIR, g)).map((f) => readFileSync(f, 'utf8')).join('\n');
			const entry = src.match(/\n\t*expert:\s*\{[^}]*\}/);
			expect(entry, `${g}: no expert difficulty entry`).toBeTruthy();
			expect(entry![0]).toMatch(/label:\s*'[^']+'/);
		});
	}

	// The boutique reads NO_EXPERT to label a pack "niveaux seuls". Deriving the truth from
	// the sources keeps that label honest: adding an Expert tier to a game, or giving a new
	// game none, fails here until the set is updated.
	it('NO_EXPERT is exactly the set of games with no Expert tier', () => {
		const ungated = gameDirs.filter((g) => !gated.includes(g)).sort();
		expect(ungated).toEqual([...NO_EXPERT].sort());
	});

	it('demineur declares expert in both records it indexes', () => {
		const src = readFileSync(join(GAMES_DIR, 'demineur', 'engine.ts'), 'utf8');
		expect(src.match(/\n\texpert:\s*\{/g)?.length).toBe(2);
	});
});

describe('plans grade through `this`', () => {
	// extendPlan swaps `this` so stars/starHint see the *hardened* config on levels 101-200.
	// A plan that reaches for its own exported name instead reads the base config and
	// silently grades the extended half against the easy thresholds.
	for (const g of gameDirs) {
		const file = join(GAMES_DIR, g, 'levels.ts');
		let src: string;
		try {
			src = readFileSync(file, 'utf8');
		} catch {
			continue;
		}
		const from = src.search(/\n\tstars\(/);
		if (from < 0) continue;
		const end = src.indexOf('\n};', from);
		const body = src.slice(from, end < 0 ? undefined : end);

		it(`${g} uses this.config() in stars/starHint`, () => {
			expect(body, `${g}: stars/starHint reads the plan by name, not this`).not.toMatch(/Levels\.(config|stars|starHint)\(/);
		});
	}
});
