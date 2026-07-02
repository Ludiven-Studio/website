/**
 * MOTS MÊLÉS — pure engine (no UI). A themed word-search: hidden French words to find in a
 * letter grid by dragging a straight line (H / V / diagonal, and reversed on hard). The word
 * list is GIVEN, so no dictionary is needed. Seeded (mulberry32) for the daily challenge.
 * Words are stored/compared normalised to A–Z uppercase (accents stripped) to match the grid.
 */

import { mulberry32, type Rng } from '../prng';

export type Cell = [number, number];
export interface Placement { word: string; cells: Cell[]; }
export interface Grid { size: number; letters: string[][]; theme: string; words: Placement[]; }

interface Dir { dr: number; dc: number; }
export interface DiffLevel { label: string; size: number; count: number; dirs: Dir[]; }

const FWD: Dir[] = [{ dr: 0, dc: 1 }, { dr: 1, dc: 0 }]; // →  ↓
const DIAG: Dir[] = [{ dr: 1, dc: 1 }, { dr: 1, dc: -1 }]; // ↘  ↙
const REV: Dir[] = [{ dr: 0, dc: -1 }, { dr: -1, dc: 0 }, { dr: -1, dc: -1 }, { dr: -1, dc: 1 }]; // ←  ↑  ↖  ↗

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 9, count: 7, dirs: FWD },
	moyen: { label: 'Moyen', size: 11, count: 9, dirs: [...FWD, ...DIAG] },
	difficile: { label: 'Difficile', size: 13, count: 11, dirs: [...FWD, ...DIAG, ...REV] },
};

/** Uppercase, strip diacritics, keep A–Z only (idempotent). */
export const normalize = (w: string): string => w.toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Z]/g, '');

// ~24 thèmes × ~10 mots (déjà en majuscules ASCII sans accents ; longueurs 4–10).
export const THEMES: { name: string; words: string[] }[] = [
	{ name: 'Fruits', words: ['POMME', 'BANANE', 'CERISE', 'FRAISE', 'ORANGE', 'CITRON', 'RAISIN', 'ABRICOT', 'PECHE', 'POIRE', 'MANGUE', 'PRUNE'] },
	{ name: 'Légumes', words: ['CAROTTE', 'POIREAU', 'OIGNON', 'TOMATE', 'RADIS', 'HARICOT', 'EPINARD', 'NAVET', 'CELERI', 'POIVRON', 'COURGE', 'SALADE'] },
	{ name: 'Animaux', words: ['CHAT', 'CHIEN', 'CHEVAL', 'LAPIN', 'RENARD', 'SOURIS', 'TIGRE', 'LION', 'GIRAFE', 'ZEBRE', 'PANDA', 'LOUP'] },
	{ name: 'Couleurs', words: ['ROUGE', 'VERT', 'BLEU', 'JAUNE', 'ORANGE', 'VIOLET', 'ROSE', 'MARRON', 'NOIR', 'BLANC', 'GRIS', 'BEIGE'] },
	{ name: 'Sports', words: ['FOOT', 'TENNIS', 'RUGBY', 'JUDO', 'NATATION', 'BOXE', 'GOLF', 'VELO', 'VOILE', 'ESCRIME', 'KARATE', 'DANSE'] },
	{ name: 'Métiers', words: ['MEDECIN', 'FACTEUR', 'PILOTE', 'PLOMBIER', 'COIFFEUR', 'FERMIER', 'PEINTRE', 'BOULANGER', 'LIBRAIRE', 'MARIN'] },
	{ name: 'Pays', words: ['FRANCE', 'ESPAGNE', 'ITALIE', 'BRESIL', 'CANADA', 'JAPON', 'MAROC', 'SUEDE', 'GRECE', 'MEXIQUE', 'EGYPTE', 'INDE'] },
	{ name: 'Cuisine', words: ['ASSIETTE', 'COUTEAU', 'POELE', 'VERRE', 'SALADIER', 'TASSE', 'NAPPE', 'CASSEROLE', 'FOUR', 'BOL', 'PLAT'] },
	{ name: 'Nature', words: ['ARBRE', 'FLEUR', 'RIVIERE', 'MONTAGNE', 'FORET', 'PLAGE', 'NUAGE', 'SOLEIL', 'ETOILE', 'OCEAN', 'DESERT', 'VALLEE'] },
	{ name: 'Corps', words: ['TETE', 'BRAS', 'JAMBE', 'MAIN', 'PIED', 'GENOU', 'EPAULE', 'COUDE', 'DOIGT', 'BOUCHE', 'CHEVILLE', 'OREILLE'] },
	{ name: 'Vêtements', words: ['PANTALON', 'CHEMISE', 'ROBE', 'JUPE', 'MANTEAU', 'ECHARPE', 'CHAPEAU', 'PULL', 'VESTE', 'SHORT', 'BOTTE', 'GANT'] },
	{ name: 'Transports', words: ['VOITURE', 'TRAIN', 'AVION', 'BATEAU', 'VELO', 'METRO', 'CAMION', 'MOTO', 'TRAMWAY', 'FUSEE', 'SCOOTER', 'BUS'] },
	{ name: 'Maison', words: ['CUISINE', 'CHAMBRE', 'SALON', 'GARAGE', 'JARDIN', 'GRENIER', 'CAVE', 'ESCALIER', 'FENETRE', 'PORTE', 'TOIT', 'MUR'] },
	{ name: 'Mer', words: ['POISSON', 'REQUIN', 'CRABE', 'MEDUSE', 'CORAIL', 'ALGUE', 'VAGUE', 'DAUPHIN', 'BALEINE', 'HUITRE', 'MOULE', 'SARDINE'] },
	{ name: 'Musique', words: ['PIANO', 'GUITARE', 'VIOLON', 'FLUTE', 'BATTERIE', 'HARPE', 'CHANT', 'TAMBOUR', 'TROMPETTE', 'ACCORDEON'] },
	{ name: 'École', words: ['CAHIER', 'STYLO', 'CRAYON', 'GOMME', 'REGLE', 'TROUSSE', 'CARTABLE', 'TABLEAU', 'LIVRE', 'CLASSE', 'LECON', 'FEUTRE'] },
	{ name: 'Météo', words: ['SOLEIL', 'PLUIE', 'NEIGE', 'VENT', 'ORAGE', 'NUAGE', 'TEMPETE', 'ECLAIR', 'GRELE', 'GIVRE', 'ARC', 'FROID'] },
	{ name: 'Fleurs', words: ['ROSE', 'TULIPE', 'LILAS', 'MUGUET', 'PIVOINE', 'IRIS', 'ORCHIDEE', 'JASMIN', 'VIOLETTE', 'OEILLET'] },
	{ name: 'Boissons', words: ['CAFE', 'LAIT', 'SODA', 'SIROP', 'LIMONADE', 'CHOCOLAT', 'TISANE', 'CIDRE', 'BIERE', 'NECTAR', 'JUS'] },
	{ name: 'Outils', words: ['MARTEAU', 'TOURNEVIS', 'SCIE', 'PINCE', 'PERCEUSE', 'RABOT', 'CLOU', 'NIVEAU', 'LIME', 'TENAILLE', 'CLE'] },
	{ name: 'Insectes', words: ['FOURMI', 'ABEILLE', 'GUEPE', 'MOUCHE', 'ARAIGNEE', 'PAPILLON', 'CRIQUET', 'LIBELLULE', 'SCARABEE', 'CHENILLE'] },
	{ name: 'Oiseaux', words: ['MOINEAU', 'PIGEON', 'AIGLE', 'HIBOU', 'CANARD', 'POULE', 'CORBEAU', 'MESANGE', 'CIGOGNE', 'MOUETTE', 'FAUCON'] },
	{ name: 'Espace', words: ['SOLEIL', 'LUNE', 'ETOILE', 'PLANETE', 'COMETE', 'FUSEE', 'GALAXIE', 'MARS', 'VENUS', 'SATURNE', 'ORBITE', 'ASTRE'] },
	{ name: 'Desserts', words: ['GATEAU', 'TARTE', 'GLACE', 'CREPE', 'FLAN', 'MOUSSE', 'SORBET', 'ECLAIR', 'MACARON', 'BEIGNET', 'CROISSANT', 'PUDDING'] },
];

const FILL_POOL = 'EEEEEEEEEAAAAAAIIIIISSSSNNNNTTTTRRRRLLLUUUOOODDCCMMPPGGBBFVHQJXYZKW';

function shuffle<T>(arr: T[], rng: Rng): void {
	for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
}

/** Try to fit a word into the grid: random position + allowed direction, overlapping only on
 *  matching letters. Returns its cells, or null if no spot found. */
function tryPlace(word: string, grid: (string | null)[][], size: number, dirs: Dir[], rng: Rng): Cell[] | null {
	for (let t = 0; t < 150; t++) {
		const dir = dirs[Math.floor(rng() * dirs.length)];
		const r0 = Math.floor(rng() * size), c0 = Math.floor(rng() * size);
		const cells: Cell[] = [];
		let ok = true;
		for (let i = 0; i < word.length; i++) {
			const r = r0 + dir.dr * i, c = c0 + dir.dc * i;
			if (r < 0 || r >= size || c < 0 || c >= size) { ok = false; break; }
			const cur = grid[r][c];
			if (cur !== null && cur !== word[i]) { ok = false; break; }
			cells.push([r, c]);
		}
		if (ok) return cells;
	}
	return null;
}

/** Build a deterministic themed grid for a seed + difficulty. */
export function makeGrid(seed: number, diff: DiffLevel): Grid {
	const rng = mulberry32(seed);
	const size = diff.size;
	const theme = THEMES[Math.floor(rng() * THEMES.length)];
	const pool = [...new Set(theme.words.map(normalize))].filter((w) => w.length >= 4 && w.length <= size);
	shuffle(pool, rng);
	pool.sort((a, b) => b.length - a.length); // place the longest first (easier to fit)

	const grid: (string | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
	const words: Placement[] = [];
	for (const word of pool) {
		if (words.length >= diff.count) break;
		const cells = tryPlace(word, grid, size, diff.dirs, rng);
		if (!cells) continue;
		words.push({ word, cells });
		for (let i = 0; i < word.length; i++) { const [r, c] = cells[i]; grid[r][c] = word[i]; }
	}

	const letters = grid.map((row) => row.map((ch) => ch ?? FILL_POOL[Math.floor(rng() * FILL_POOL.length)]));
	return { size, letters, theme: theme.name, words };
}

/** Ordered cells from a→b if they lie on a straight line (H / V / 8-way diagonal), else null. */
export function lineCells(a: Cell, b: Cell, size: number): Cell[] | null {
	const adr = Math.abs(b[0] - a[0]), adc = Math.abs(b[1] - a[1]);
	const straight = adr === 0 || adc === 0 || adr === adc;
	if (!straight) return null;
	const dr = Math.sign(b[0] - a[0]), dc = Math.sign(b[1] - a[1]);
	const len = Math.max(adr, adc);
	const cells: Cell[] = [];
	for (let i = 0; i <= len; i++) {
		const r = a[0] + dr * i, c = a[1] + dc * i;
		if (r < 0 || r >= size || c < 0 || c >= size) return null;
		cells.push([r, c]);
	}
	return cells;
}

const cellKey = (cs: Cell[]): string => cs.map((c) => c[0] * 1000 + c[1]).sort((x, y) => x - y).join(',');

/** Index of the placed word whose cell-set equals the selection (so reversed drags match too), else -1. */
export function matchIndex(sel: Cell[], words: Placement[]): number {
	const k = cellKey(sel);
	for (let i = 0; i < words.length; i++) if (cellKey(words[i].cells) === k) return i;
	return -1;
}
