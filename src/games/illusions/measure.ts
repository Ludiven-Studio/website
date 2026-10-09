/**
 * L'Œil mesureur — pure geometry for five classic size illusions.
 * The player sets `ratio` = target size / reference size; 1 is the truth.
 * Every figure lives in a 320×200 viewBox.
 */

export type FigureKind = 'muller-lyer' | 'ebbinghaus' | 'ponzo' | 'vertical-horizontal' | 'delboeuf';
export type Role = 'reference' | 'target' | 'inducer' | 'guide';

export type Shape =
	| { type: 'line'; role: Role; x1: number; y1: number; x2: number; y2: number }
	| { type: 'circle'; role: Role; cx: number; cy: number; r: number; fill?: boolean };

export interface RoundInfo {
	name: string;
	ask: string;
	/** The adjusted element, as it reads in a sentence ("le trait du bas"). */
	target: string;
	dimension: 'length' | 'size';
	fact: string;
}

export const VIEW_W = 320;
export const VIEW_H = 200;
export const MIN_RATIO = 0.6;
export const MAX_RATIO = 1.4;

export const ORDER: FigureKind[] = ['muller-lyer', 'ebbinghaus', 'ponzo', 'vertical-horizontal', 'delboeuf'];

export const ROUNDS: Record<FigureKind, RoundInfo> = {
	'muller-lyer': {
		name: 'Les flèches de Müller-Lyer',
		ask: 'Règle le trait du bas pour qu\'il paraisse aussi long que celui du haut.',
		target: 'le trait du bas',
		dimension: 'length',
		fact: 'Des branches tournées vers l\'extérieur allongent un trait, des pointes de flèche le raccourcissent : on se trompe souvent de 15 à 25 %. Franz Müller-Lyer l\'a décrite en 1889.',
	},
	ebbinghaus: {
		name: 'Les cercles d\'Ebbinghaus',
		ask: 'Règle le disque du milieu, à droite, pour qu\'il paraisse aussi grand que celui de gauche.',
		target: 'le disque de droite',
		dimension: 'size',
		fact: 'Entouré de grands cercles, un disque paraît plus petit ; entouré de petits, il paraît plus grand. Hermann Ebbinghaus l\'a fait connaître à la fin du XIXᵉ siècle.',
	},
	ponzo: {
		name: 'Les rails de Ponzo',
		ask: 'Règle le trait du haut pour qu\'il paraisse aussi long que celui du bas.',
		target: 'le trait du haut',
		dimension: 'length',
		fact: 'Les rails qui se rapprochent font croire à de la profondeur : ton cerveau grandit le trait « au loin » pour compenser. Mario Ponzo, 1911.',
	},
	'vertical-horizontal': {
		name: 'Le T renversé',
		ask: 'Règle le trait vertical pour qu\'il paraisse aussi long que le trait horizontal.',
		target: 'le trait vertical',
		dimension: 'length',
		fact: 'Un trait vertical paraît plus long qu\'un trait horizontal de même taille, surtout quand il le coupe en deux. L\'écart dépasse souvent 10 %.',
	},
	delboeuf: {
		name: 'Les disques de Delbœuf',
		ask: 'Règle le disque de droite pour qu\'il paraisse aussi grand que celui de gauche, sans compter l\'anneau.',
		target: 'le disque de droite',
		dimension: 'size',
		fact: 'Un anneau serré autour d\'un disque le fait paraître plus grand. Joseph Delbœuf, 1865 : c\'est aussi pourquoi une portion semble plus grosse dans une petite assiette.',
	},
};

const line = (role: Role, x1: number, y1: number, x2: number, y2: number): Shape => ({ type: 'line', role, x1, y1, x2, y2 });
const circle = (role: Role, cx: number, cy: number, r: number, fill = true): Shape => ({ type: 'circle', role, cx, cy, r, fill });

/** Spokes of `count` circles of radius `r` around (cx, cy), centres `d` away. */
const ring = (cx: number, cy: number, d: number, r: number, count: number, offset = 0): Shape[] =>
	Array.from({ length: count }, (_, i) => {
		const a = offset + (i * 2 * Math.PI) / count;
		return circle('inducer', cx + d * Math.cos(a), cy + d * Math.sin(a), r);
	});

/** The figure's shapes in drawing order, plus the guides shown once the answer is in. */
export function figure(kind: FigureKind, ratio: number): { shapes: Shape[]; guides: Shape[] } {
	switch (kind) {
		case 'muller-lyer': {
			// Fins at 30° to the shaft, about a quarter of its length: the strong classic setting.
			const L = 160;
			const fin = 36;
			const fx = fin * Math.cos(Math.PI / 6);
			const fy = fin * Math.sin(Math.PI / 6);
			const [a0, a1] = [160 - L / 2, 160 + L / 2];
			const T = L * ratio;
			const [b0, b1] = [160 - T / 2, 160 + T / 2];
			const top = 62;
			const bot = 138;
			return {
				shapes: [
					line('reference', a0, top, a1, top),
					line('inducer', a0, top, a0 + fx, top - fy),
					line('inducer', a0, top, a0 + fx, top + fy),
					line('inducer', a1, top, a1 - fx, top - fy),
					line('inducer', a1, top, a1 - fx, top + fy),
					line('target', b0, bot, b1, bot),
					line('inducer', b0, bot, b0 - fx, bot - fy),
					line('inducer', b0, bot, b0 - fx, bot + fy),
					line('inducer', b1, bot, b1 + fx, bot - fy),
					line('inducer', b1, bot, b1 + fx, bot + fy),
				],
				guides: [line('guide', a0, 40, a0, 160), line('guide', a1, 40, a1, 160)],
			};
		}
		case 'ebbinghaus': {
			const R = 18;
			const r = R * ratio;
			const left = { x: 86, y: 100 };
			const right = { x: 236, y: 100 };
			return {
				shapes: [
					...ring(left.x, left.y, R + 27 + 6, 27, 6, Math.PI / 6),
					circle('reference', left.x, left.y, R),
					// Small circles keep the same gap to the disc whatever its size.
					...ring(right.x, right.y, r + 7 + 5, 7, 8),
					circle('target', right.x, right.y, r),
				],
				guides: [circle('guide', right.x, right.y, R, false)],
			};
		}
		case 'ponzo': {
			const L = 66;
			const T = L * ratio;
			return {
				shapes: [
					line('inducer', 36, 196, 132, 8),
					line('inducer', 284, 196, 188, 8),
					line('target', 160 - T / 2, 50, 160 + T / 2, 50),
					line('reference', 160 - L / 2, 160, 160 + L / 2, 160),
				],
				guides: [line('guide', 160 - L / 2, 34, 160 - L / 2, 176), line('guide', 160 + L / 2, 34, 160 + L / 2, 176)],
			};
		}
		case 'vertical-horizontal': {
			const L = 120;
			const base = 184;
			const top = base - L;
			return {
				shapes: [line('reference', 160 - L / 2, base, 160 + L / 2, base), line('target', 160, base, 160, base - L * ratio)],
				guides: [line('guide', 246, base, 246, top), line('guide', 150, top, 256, top)],
			};
		}
		case 'delboeuf': {
			// Ring at 3:2 of the disc, where Delbœuf found the effect strongest.
			const R = 26;
			return {
				shapes: [
					circle('inducer', 92, 100, R * 1.5, false),
					circle('reference', 92, 100, R),
					circle('target', 228, 100, R * ratio),
				],
				guides: [circle('guide', 228, 100, R, false)],
			};
		}
	}
}

/** Signed error in percent: negative = set too short / too small. */
export const errorPct = (ratio: number): number => (ratio - 1) * 100;

const fmt = (n: number) => n.toFixed(1).replace('.', ',');

export function errorText(kind: FigureKind, ratio: number): string {
	const { target, dimension } = ROUNDS[kind];
	const e = errorPct(ratio);
	if (Math.abs(e) < 1) return `Pile poil ! Tu as réglé ${target} à moins de 1 % près.`;
	const word = dimension === 'length' ? (e < 0 ? 'court' : 'long') : e < 0 ? 'petit' : 'grand';
	return `Tu as réglé ${target} ${fmt(Math.abs(e))} % trop ${word}.`;
}

/** A start 20 to 30 % off the truth, either way, so the slider always needs work. */
export function randomStart(rng: () => number): number {
	const sign = rng() < 0.5 ? -1 : 1;
	return 1 + sign * (0.2 + rng() * 0.1);
}

export const meanAbsError = (ratios: number[]): number =>
	ratios.length ? ratios.reduce((a, r) => a + Math.abs(errorPct(r)), 0) / ratios.length : 0;

export function verdict(meanAbs: number): { emoji: string; title: string; text: string } {
	if (meanAbs <= 3) return { emoji: '🐆', title: 'Œil de lynx', text: 'Rien ne t\'échappe : les illusions glissent sur toi.' };
	if (meanAbs <= 6) return { emoji: '🦅', title: 'Œil d\'aigle', text: 'Très précis, à peine piégé.' };
	if (meanAbs <= 10) return { emoji: '🦉', title: 'Œil de chouette', text: 'Les illusions t\'ont un peu eu, comme presque tout le monde.' };
	if (meanAbs <= 15) return { emoji: '🐔', title: 'Œil de cocotte', text: 'Ton œil est bon public : il croit ce qu\'on lui montre.' };
	return { emoji: '🕶️', title: 'Œil de taupe', text: 'Les illusions ont gagné cette fois… mais c\'est justement leur métier !' };
}

export function shuffled<T>(arr: T[], rng: () => number): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

export const formatPct = fmt;
