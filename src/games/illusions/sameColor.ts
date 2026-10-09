/**
 * "Même couleur ?" — pure data for the lightness / colour illusions.
 * Every figure is drawn from these constants, so the test can prove the "same"
 * patches really are the same colour.
 */

export type Vec = [number, number];

export const VIEW = { w: 480, h: 300 };

/* ---------- Adelson's checker-shadow ---------- */

export const ADELSON = {
	n: 5,
	// Oblique projection of the board: a tile corner (u, v) lands at project(u, v).
	w: 37,
	h: 20.5,
	cx: 240,
	cy: 70,
	thick: 12,
	bg: '#e4e4e4',
	neutral: '#b8b8b8',
	// Lit tiles, then the same tiles in the shadow (x 0.58). Lit dark = shaded light: that IS the illusion.
	light: '#cfcfcf',
	dark: '#787878',
	lightShade: '#787878',
	darkShade: '#464646',
	// The shadow band is wider than the cylinder so B's four neighbours all fall inside it,
	// while A keeps lit light tiles around it: the contrast with neighbours drives the illusion.
	cyl: { u: 1.5, v: 0.9, r: 0.95, shadowR: 1.3, height: 84, length: 3 },
	a: [4, 3] as const,
	b: [1, 3] as const,
};

export const project = (u: number, v: number): Vec => [
	ADELSON.cx + (u - v) * ADELSON.w,
	ADELSON.cy + (u + v) * ADELSON.h,
];

export const isLight = (i: number, j: number) => (i + j) % 2 === 0;

export const tileColor = (i: number, j: number, shaded: boolean) =>
	isLight(i, j) ? (shaded ? ADELSON.lightShade : ADELSON.light) : shaded ? ADELSON.darkShade : ADELSON.dark;

export const tileCorners = (i: number, j: number): Vec[] => [
	project(i, j),
	project(i + 1, j),
	project(i + 1, j + 1),
	project(i, j + 1),
];

export const tileCenter = (i: number, j: number): Vec => project(i + 0.5, j + 0.5);

/** Multiply a #rrggbb colour by k (side faces of the board). */
export function scaleHex(hex: string, k: number): string {
	const n = parseInt(hex.slice(1), 16);
	const ch = (s: number) => Math.round(Math.min(255, ((n >> s) & 255) * k)).toString(16).padStart(2, '0');
	return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** Shadow axis on the board: from the cylinder base along +v. */
const axis = (): [Vec, Vec] => {
	const { u, v, length } = ADELSON.cyl;
	return [[u, v], [u, v + length]];
};

/** Board-space distance from a point to the shadow's axis segment. */
export function shadowAxisDistance(p: Vec): number {
	const [a, b] = axis();
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
	return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function convexHull(pts: Vec[]): Vec[] {
	const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const cross = (o: Vec, a: Vec, b: Vec) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lower: Vec[] = [];
	for (const q of p) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
		lower.push(q);
	}
	const upper: Vec[] = [];
	for (let i = p.length - 1; i >= 0; i--) {
		const q = p[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
		upper.push(q);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Cast shadow, projected: the hull of the base disc and the same disc slid along the axis. */
export function shadowPolygon(): Vec[] {
	const [a, b] = axis();
	const r = ADELSON.cyl.shadowR;
	const pts: Vec[] = [];
	for (let k = 0; k < 48; k++) {
		const ang = (k / 48) * Math.PI * 2;
		pts.push([a[0] + r * Math.cos(ang), a[1] + r * Math.sin(ang)]);
		pts.push([b[0] + r * Math.cos(ang), b[1] + r * Math.sin(ang)]);
	}
	return convexHull(pts).map(([u, v]) => project(u, v));
}

/** The cylinder's base: a board circle seen as an axis-aligned ellipse. */
export function cylinderBase() {
	const { u, v, r } = ADELSON.cyl;
	const [x, y] = project(u, v);
	return { x, y, rx: Math.SQRT2 * ADELSON.w * r, ry: Math.SQRT2 * ADELSON.h * r };
}

/* ---------- The other figures ---------- */

export const CONTRAST = { from: '#0d0d0d', to: '#f2f2f2', bar: '#808080', neutral: '#c4c4c4' };

export const WHITE = {
	stripe: 15,
	rows: 20,
	black: '#000000',
	white: '#ffffff',
	grey: '#808080',
	neutral: '#c6c6c6',
	// Left column replaces black stripes, right column replaces white ones.
	leftBars: { x: 80, w: 70, rows: [4, 6, 8, 10, 12, 14] },
	rightBars: { x: 330, w: 70, rows: [5, 7, 9, 11, 13, 15] },
};

export const MUNKER = {
	disc: '#d9534f',
	r: 80,
	left: [125, 150] as Vec,
	right: [355, 150] as Vec,
	period: 10,
	band: 4,
	yellow: '#ffd400',
	blue: '#1f4fff',
	bg: '#ffffff',
};

// The trap round: two greys that really differ, which the backgrounds make look alike.
export const TWIST = { darkBg: '#121212', lightBg: '#f2f2f2', left: '#727272', right: '#8e8e8e', neutral: '#c0c0c0', size: 104 };

/* ---------- Rounds ---------- */

export type RoundId = 'adelson' | 'contrast' | 'white' | 'munker' | 'twist';

export interface Round {
	id: RoundId;
	name: string;
	question: string;
	options: string[];
	correct: number;
	/** Whether the two patches really are the same colour. */
	same: boolean;
	/** The two patches the question compares, as drawn. */
	patches: [string, string];
	truth: string;
	why: string;
}

export const ROUNDS: Round[] = [
	{
		id: 'adelson',
		name: "L'échiquier d'Adelson",
		question: 'Les cases A et B sont-elles de la même couleur ?',
		options: ['A plus foncée', 'Pareil', 'B plus foncée'],
		correct: 1,
		same: true,
		patches: [tileColor(...ADELSON.a, false), tileColor(...ADELSON.b, true)],
		truth: 'A et B sont exactement du même gris.',
		why: "Ton cerveau sait qu'une case à l'ombre reçoit moins de lumière : il « éclaircit » B pour retrouver une case claire. A, en pleine lumière, reste une case foncée.",
	},
	{
		id: 'contrast',
		name: 'Le dégradé',
		question: "La barre grise a-t-elle la même teinte d'un bout à l'autre ?",
		options: ['Plus claire à gauche', 'Uniforme', 'Plus claire à droite'],
		correct: 1,
		same: true,
		patches: [CONTRAST.bar, CONTRAST.bar],
		truth: "La barre est du même gris d'un bout à l'autre.",
		why: "Sur un fond sombre, un gris paraît plus clair ; sur un fond clair, plus foncé. Ton œil juge une teinte par rapport à ce qui l'entoure.",
	},
	{
		id: 'white',
		name: "L'illusion de White",
		question: 'Les barres grises de gauche et de droite ont-elles la même teinte ?',
		options: ['Gauche plus claire', 'Pareil', 'Droite plus claire'],
		correct: 1,
		same: true,
		patches: [WHITE.grey, WHITE.grey],
		truth: 'Toutes les barres grises sont du même gris.',
		why: 'Chaque barre grise semble faire partie de la bande noire ou blanche où elle est posée, et ton cerveau la juge avec elle. Même gris, impression opposée.',
	},
	{
		id: 'munker',
		name: 'Les disques rayés',
		question: 'Les deux disques sont-ils de la même couleur ?',
		options: ['Non, différents', 'Oui, la même'],
		correct: 1,
		same: true,
		patches: [MUNKER.disc, MUNKER.disc],
		truth: 'Les deux disques sont du même rouge.',
		why: "Les rayures se mélangent à la couleur qu'elles traversent : sous le jaune, le rouge tire vers l'orange ; sous le bleu, vers le rose violacé.",
	},
	{
		id: 'twist',
		name: 'Le piège inversé',
		question: 'Les deux carrés sont-ils de la même couleur ?',
		options: ['Gauche plus foncé', 'Pareil', 'Droite plus foncé'],
		correct: 0,
		same: false,
		patches: [TWIST.left, TWIST.right],
		truth: 'Cette fois, le carré de gauche était vraiment plus foncé !',
		why: 'Piège inversé : le fond noir éclaircit le carré de gauche, le fond blanc assombrit celui de droite, et une vraie différence disparaît.',
	},
];
