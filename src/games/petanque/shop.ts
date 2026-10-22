/**
 * PETANQUE — the shop, ported from the Unity game's catalog (Core/Economy.cs, Core/Boules.cs) and
 * paid in cocoins. A boule is a make that plays (weight, diameter, hardness, turned into the engine's
 * Kit by the same formula as the app, so its balance measurements hold here) and a look that does not.
 * Jacks and decors are looks only.
 */
import { BOULE_M, BOULE_R, BOULE_REST, STANDARD_KIT, type Kit } from './engine';
import { buyOwned, owns } from '../../lib/wallet';
import { isDecorId, type DecorId } from './decors';

export type Hardness = 'tendre' | 'demi' | 'dure';
export type Pattern = 'lisse' | 'une' | 'trois' | 'cinq' | 'double' | 'croix' | 'meridiens' | 'spirale' | 'vagues' | 'etoile' | 'points' | 'soleil';
export type FinishId = 'steel' | 'bronze' | 'cuivre' | 'bleue' | 'rouge' | 'verte' | 'carbone' | 'satin' | 'brunie' | 'nacre' | 'fonte' | 'doree' | 'damas';

/** A finish: the app's material colours, roughness = 1 - its smoothness. */
export interface Finish { color: number; metalness: number; roughness: number }

export const FINISHES: Record<FinishId, Finish> = {
	steel: { color: 0xd9dee6, metalness: 1, roughness: 0.2 },
	bronze: { color: 0x8a5a3c, metalness: 1, roughness: 0.22 },
	cuivre: { color: 0xb8734a, metalness: 1, roughness: 0.2 },
	bleue: { color: 0x3a558c, metalness: 1, roughness: 0.24 },
	rouge: { color: 0xa83a3a, metalness: 1, roughness: 0.26 },
	verte: { color: 0x3f7a5a, metalness: 1, roughness: 0.26 },
	carbone: { color: 0x333336, metalness: 0.85, roughness: 0.38 },
	satin: { color: 0xc8ccd2, metalness: 1, roughness: 0.55 },
	brunie: { color: 0x4a5566, metalness: 1, roughness: 0.3 },
	nacre: { color: 0xeeeae2, metalness: 0.3, roughness: 0.15 },
	fonte: { color: 0x2a2a2c, metalness: 0.6, roughness: 0.75 },
	doree: { color: 0xd9ae44, metalness: 1, roughness: 0.18 },
	damas: { color: 0x9aa0a8, metalness: 1, roughness: 0.28 },
};

/** How a boule looks: its finish, its engraving and the colour filling the grooves (none: a darker finish). */
export interface BouleLook { finish: FinishId; pattern: Pattern; inlay?: number }

export interface BouleModel extends BouleLook { grams: number; mm: number; hardness: Hardness }

export const HEAVY_FROM = 715, LIGHT_TO = 685; // grams
export const BIG_FROM = 77, SMALL_TO = 73; // millimetres

export type Trait = 'heavy' | 'light' | 'big' | 'small' | 'soft' | 'hard';

/** What sets a make apart, in the order the shop says it. Empty for the all-rounder. */
export function traits(m: BouleModel): Trait[] {
	const out: Trait[] = [];
	if (m.grams >= HEAVY_FROM) out.push('heavy'); else if (m.grams <= LIGHT_TO) out.push('light');
	if (m.mm >= BIG_FROM) out.push('big'); else if (m.mm <= SMALL_TO) out.push('small');
	if (m.hardness === 'tendre') out.push('soft'); else if (m.hardness === 'dure') out.push('hard');
	return out;
}

const isStandard = (m: BouleModel): boolean => m.grams === 700 && m.mm === 75 && m.hardness === 'demi';

/* The app's MakeKit, value for value. Tendre keeps less of a knock and sticks where it lands; dure
   gives more back and runs on. Weight and size widen the hand's spread: the price of a steadier boule
   on the ground. Measured in the app (KitBalance): every model wins 47-54 % against the standard. */
export function kitOf(m: BouleModel): Kit {
	if (isStandard(m)) return STANDARD_KIT;
	const mass = m.grams / 1000, r = m.mm / 2000;
	const e = m.hardness === 'tendre' ? 0.86 : m.hardness === 'dure' ? 0.93 : BOULE_REST;
	const bite = m.hardness === 'tendre' ? 0.99 : m.hardness === 'dure' ? 1.01 : 1;
	const aim = 1 + (mass - BOULE_M) + 4 * (r - BOULE_R);
	return { m: mass, r, e, bite, aim };
}

export type ItemKind = 'boule' | 'jack' | 'decor';

export interface ShopItem {
	id: string;
	kind: ItemKind;
	price: number; // cocoins; 0 = owned from the start
	model?: BouleModel; // boules
	color?: number; // jacks
	decor?: DecorId; // decors
}

const boule = (id: string, price: number, grams: number, mm: number, hardness: Hardness, finish: FinishId, pattern: Pattern, inlay?: number): ShopItem =>
	({ id, kind: 'boule', price, model: { grams, mm, hardness, finish, pattern, ...(inlay === undefined ? {} : { inlay }) } });

/* The app's prices divided by five: a cocoin is earned more slowly than a coin (stars and dailies,
   not every match). The village square is the app's free decor; here the garden is, so it costs. */
export const CATALOG: ShopItem[] = [
	boule('boule_inox', 0, 700, 75, 'demi', 'steel', 'trois'),
	boule('boule_bronze', 30, 720, 76, 'tendre', 'bronze', 'meridiens'),
	boule('boule_cuivre', 40, 690, 74, 'dure', 'cuivre', 'une'),
	boule('boule_bleue', 50, 680, 73, 'demi', 'bleue', 'spirale'),
	boule('boule_rouge', 60, 700, 77, 'demi', 'rouge', 'croix'),
	boule('boule_verte', 60, 730, 76, 'demi', 'verte', 'vagues'),
	boule('boule_carbone', 70, 670, 72, 'tendre', 'carbone', 'lisse'),
	boule('boule_tireuse', 90, 660, 71, 'tendre', 'satin', 'une', 0xc8322d),
	boule('boule_pointeuse', 90, 760, 77, 'tendre', 'brunie', 'cinq'),
	boule('boule_plume', 100, 650, 72, 'demi', 'nacre', 'points'),
	boule('boule_massive', 100, 790, 79, 'dure', 'fonte', 'double'),
	boule('boule_doree', 120, 740, 77, 'dure', 'doree', 'etoile'),
	boule('boule_provencale', 140, 705, 74, 'tendre', 'steel', 'soleil', 0xd9ae44),
	boule('boule_damas', 160, 715, 75, 'dure', 'damas', 'vagues', 0xe3bc57),
	{ id: 'jack_orange', kind: 'jack', price: 0, color: 0xe8732a },
	{ id: 'jack_jaune', kind: 'jack', price: 15, color: 0xf2c230 },
	{ id: 'jack_vert', kind: 'jack', price: 15, color: 0x3fae4a },
	{ id: 'jack_rose', kind: 'jack', price: 25, color: 0xe86aa6 },
	{ id: 'jack_buis', kind: 'jack', price: 40, color: 0xc9a36a },
	{ id: 'decor_jardin', kind: 'decor', price: 0, decor: 'jardin' },
	{ id: 'decor_place', kind: 'decor', price: 100, decor: 'place' },
	{ id: 'decor_soir', kind: 'decor', price: 120, decor: 'soir' },
	{ id: 'decor_port', kind: 'decor', price: 180, decor: 'port' },
];

export const DEFAULT_BOULE = 'boule_inox';
export const DEFAULT_JACK = 'jack_orange';
export const DEFAULT_DECOR = 'decor_jardin';

export const itemById = (id: string): ShopItem | undefined => CATALOG.find((i) => i.id === id);

/** The make behind an id, the standard boule for anything unknown (an old or edited save). */
export const modelOf = (id: string): BouleModel => (itemById(id)?.model ?? itemById(DEFAULT_BOULE)!.model)!;

/** Owned items live in the cocoin wallet, namespaced, beside the blasons and the bolides. */
const walletKey = (id: string): string => `petanque:${id}`;

export const ownsItem = (it: ShopItem): boolean => it.price === 0 || owns(walletKey(it.id));

/** Spend the cocoins. True on success, or when it was already owned. */
export const buyItem = (it: ShopItem): boolean => it.price === 0 || buyOwned(walletKey(it.id), it.price);

/* ---------- what the player wears ---------- */

const KEY = 'petanque-shop';

export interface Equipped { boule: string; jack: string; decor: string }

const DEFAULTS: Equipped = { boule: DEFAULT_BOULE, jack: DEFAULT_JACK, decor: DEFAULT_DECOR };

/** What is worn, each slot checked against the catalog and the wallet: an unowned or unknown id falls
 *  back to the free item rather than handing out what was never paid for. */
export function loadEquipped(): Equipped {
	let raw: Partial<Equipped> = {};
	try { raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Equipped>; } catch { /* private mode */ }
	const pick = (id: unknown, kind: ItemKind, fallback: string): string => {
		const it = typeof id === 'string' ? itemById(id) : undefined;
		return it && it.kind === kind && ownsItem(it) ? it.id : fallback;
	};
	return {
		boule: pick(raw.boule, 'boule', DEFAULTS.boule),
		jack: pick(raw.jack, 'jack', DEFAULTS.jack),
		decor: pick(raw.decor, 'decor', DEFAULTS.decor),
	};
}

export function saveEquipped(e: Equipped): void {
	try { localStorage.setItem(KEY, JSON.stringify(e)); } catch { /* private mode */ }
}

/** Wear an owned item in its slot. Returns the new set, or null when it is not owned. */
export function equip(e: Equipped, it: ShopItem): Equipped | null {
	if (!ownsItem(it)) return null;
	const next = { ...e, [it.kind]: it.id };
	saveEquipped(next);
	return next;
}

export const decorOf = (e: Equipped): DecorId => {
	const d = itemById(e.decor)?.decor;
	return isDecorId(d) ? d : 'jardin';
};

export const jackColorOf = (e: Equipped): number => itemById(e.jack)?.color ?? 0xe8732a;

/** A plain look that never passes for the player's model: the opponent's, when it has none of its
 *  own to show (the AI, a second player). Bronze with meridians, or steel with three grooves when
 *  the player's boule is a warm metal itself. The app's World.OtherLook. */
export function otherLook(mine: BouleLook): BouleLook {
	const warm = mine.finish === 'bronze' || mine.finish === 'cuivre' || mine.finish === 'doree';
	return warm ? { finish: 'steel', pattern: 'trois' } : { finish: 'bronze', pattern: 'meridiens' };
}
