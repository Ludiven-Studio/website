/**
 * ALCHIMIE — pure engine (no UI). A "Little Alchemy"-style discovery game: start from 5 base
 * elements and combine two at a time to unlock ~150. Every non-base element has exactly one
 * recipe (an unordered pair of already-reachable elements); the tree is a DAG rooted at the
 * bases — enforced by engine.test.ts (all refs exist, every element reachable, no ambiguous
 * pair, no cycle). Combining is commutative and allows an element with itself (a+a).
 */

import { mulberry32 } from '../prng';

export interface Element {
	id: string;
	name: string;
	emoji: string;
	recipe?: string[]; // undefined = base element; 2 ids (main) or 2-3 ids (secret/daily)
}

const b = (id: string, name: string, emoji: string): Element => ({ id, name, emoji });
const e = (id: string, name: string, emoji: string, a: string, c: string): Element => ({ id, name, emoji, recipe: [a, c] });

export const ELEMENTS: Element[] = [
	// ---- Bases ----
	b('feu', 'Feu', '🔥'),
	b('eau', 'Eau', '💧'),
	b('terre', 'Terre', '🌍'),
	b('air', 'Air', '💨'),
	b('bois', 'Bois', '🪵'),

	// ---- Base pairs + self ----
	e('vapeur', 'Vapeur', '♨️', 'feu', 'eau'),
	e('lave', 'Lave', '🌋', 'feu', 'terre'),
	e('energie', 'Énergie', '⚡', 'feu', 'air'),
	e('charbon', 'Charbon', '⚫', 'feu', 'bois'),
	e('boue', 'Boue', '🟤', 'eau', 'terre'),
	e('pluie', 'Pluie', '🌧️', 'eau', 'air'),
	e('radeau', 'Radeau', '🛶', 'eau', 'bois'),
	e('poussiere', 'Poussière', '🌫️', 'terre', 'air'),
	e('arbre', 'Arbre', '🌳', 'terre', 'bois'),
	e('feuille', 'Feuille', '🍃', 'air', 'bois'),
	e('mer', 'Mer', '🌊', 'eau', 'eau'),
	e('montagne', 'Montagne', '⛰️', 'terre', 'terre'),
	e('soleil', 'Soleil', '☀️', 'feu', 'feu'),
	e('tempete', 'Tempête', '🌪️', 'air', 'air'),
	e('foret', 'Forêt', '🌲', 'bois', 'bois'),

	// ---- Minerals & landscape ----
	e('pierre', 'Pierre', '🪨', 'eau', 'lave'),
	e('metal', 'Métal', '⚙️', 'feu', 'pierre'),
	e('sable', 'Sable', '🏜️', 'air', 'pierre'),
	e('verre', 'Verre', '🔎', 'feu', 'sable'),
	e('brique', 'Brique', '🧱', 'feu', 'boue'),
	e('argile', 'Argile', '🟫', 'air', 'boue'),
	e('poterie', 'Poterie', '🏺', 'feu', 'argile'),
	e('riviere', 'Rivière', '🏞️', 'eau', 'montagne'),
	e('lac', 'Lac', '🞀', 'terre', 'riviere'),
	e('cascade', 'Cascade', '💦', 'montagne', 'riviere'),
	e('volcan', 'Volcan', '🗻', 'lave', 'montagne'),
	e('ile', 'Île', '🏝️', 'mer', 'terre'),
	e('plage', 'Plage', '🏖️', 'mer', 'sable'),
	e('desert', 'Désert', '🐫', 'sable', 'soleil'),
	e('diamant', 'Diamant', '💎', 'charbon', 'pierre'),
	e('or', 'Or', '🥇', 'metal', 'soleil'),
	e('argent', 'Argent', '🥈', 'metal', 'lune'),
	e('fer', 'Fer', '🔩', 'metal', 'terre'),

	// ---- Weather & sky ----
	e('nuage', 'Nuage', '☁️', 'air', 'vapeur'),
	e('ciel', 'Ciel', '🌌', 'air', 'nuage'),
	e('orage', 'Orage', '⛈️', 'energie', 'nuage'),
	e('foudre', 'Foudre', '🌩️', 'energie', 'orage'),
	e('arcenciel', 'Arc-en-ciel', '🌈', 'pluie', 'soleil'),
	e('neige', 'Neige', '❄️', 'montagne', 'pluie'),
	e('glace', 'Glace', '🧊', 'neige', 'pierre'),
	e('brouillard', 'Brouillard', '🌁', 'nuage', 'montagne'),
	e('ouragan', 'Ouragan', '🌀', 'tempete', 'mer'),

	// ---- Plants ----
	e('plante', 'Plante', '🌱', 'pluie', 'terre'),
	e('herbe', 'Herbe', '🌿', 'plante', 'terre'),
	e('fleur', 'Fleur', '🌸', 'eau', 'plante'),
	e('fruit', 'Fruit', '🍎', 'arbre', 'soleil'),
	e('graine', 'Graine', '🌰', 'fruit', 'terre'),
	e('champignon', 'Champignon', '🍄', 'pluie', 'arbre'),
	e('cactus', 'Cactus', '🌵', 'plante', 'sable'),
	e('palmier', 'Palmier', '🌴', 'arbre', 'sable'),
	e('prairie', 'Prairie', '🌾', 'herbe', 'herbe'),
	e('legume', 'Légume', '🥕', 'graine', 'eau'),
	e('ble', 'Blé', '🌾', 'graine', 'soleil'),

	// ---- Life & animals ----
	e('vie', 'Vie', '✨', 'foudre', 'mer'),
	e('oeuf', 'Œuf', '🥚', 'pierre', 'vie'),
	e('bacterie', 'Bactérie', '🦠', 'boue', 'vie'),
	e('poisson', 'Poisson', '🐟', 'mer', 'vie'),
	e('corail', 'Corail', '🪸', 'mer', 'pierre'),
	e('insecte', 'Insecte', '🐛', 'feuille', 'vie'),
	e('oiseau', 'Oiseau', '🐦', 'ciel', 'vie'),
	e('ver', 'Ver', '🪱', 'terre', 'vie'),
	e('fourmi', 'Fourmi', '🐜', 'insecte', 'terre'),
	e('abeille', 'Abeille', '🐝', 'fleur', 'insecte'),
	e('papillon', 'Papillon', '🦋', 'air', 'insecte'),
	e('araignee', 'Araignée', '🕷️', 'insecte', 'insecte'),
	e('miel', 'Miel', '🍯', 'abeille', 'fleur'),
	e('grenouille', 'Grenouille', '🐸', 'mer', 'oeuf'),
	e('serpent', 'Serpent', '🐍', 'oeuf', 'terre'),
	e('lezard', 'Lézard', '🦎', 'oeuf', 'soleil'),
	e('tortue', 'Tortue', '🐢', 'oeuf', 'pierre'),
	e('dinosaure', 'Dinosaure', '🦖', 'lezard', 'lezard'),
	e('loup', 'Loup', '🐺', 'foret', 'vie'),
	e('souris', 'Souris', '🐁', 'herbe', 'vie'),
	e('cheval', 'Cheval', '🐎', 'prairie', 'vie'),
	e('vache', 'Vache', '🐄', 'cheval', 'herbe'),
	e('mouton', 'Mouton', '🐑', 'herbe', 'nuage'),
	e('cochon', 'Cochon', '🐷', 'boue', 'prairie'),
	e('lait', 'Lait', '🥛', 'eau', 'vache'),
	e('fromage', 'Fromage', '🧀', 'bacterie', 'lait'),
	e('beurre', 'Beurre', '🧈', 'lait', 'lait'),
	e('poule', 'Poule', '🐔', 'graine', 'oiseau'),
	e('coq', 'Coq', '🐓', 'poule', 'soleil'),
	e('canard', 'Canard', '🦆', 'mer', 'oiseau'),
	e('aigle', 'Aigle', '🦅', 'montagne', 'oiseau'),
	e('hibou', 'Hibou', '🦉', 'foret', 'oiseau'),
	e('salade', 'Salade', '🥗', 'herbe', 'legume'),

	// ---- Human, tools, buildings ----
	e('humain', 'Humain', '🧑', 'argile', 'vie'),
	e('outil', 'Outil', '🛠️', 'metal', 'pierre'),
	e('roue', 'Roue', '🛞', 'bois', 'pierre'),
	e('epee', 'Épée', '🗡️', 'metal', 'metal'),
	e('bouclier', 'Bouclier', '🛡️', 'bois', 'metal'),
	e('arc', 'Arc', '🏹', 'bois', 'outil'),
	e('chariot', 'Chariot', '🛒', 'bois', 'roue'),
	e('maison', 'Maison', '🏠', 'bois', 'brique'),
	e('village', 'Village', '🏘️', 'humain', 'maison'),
	e('ville', 'Ville', '🏙️', 'village', 'village'),
	e('route', 'Route', '🛣️', 'pierre', 'roue'),
	e('pont', 'Pont', '🌉', 'eau', 'route'),
	e('chateau', 'Château', '🏰', 'maison', 'pierre'),
	e('statue', 'Statue', '🗿', 'humain', 'pierre'),
	e('feu-de-camp', 'Feu de camp', '🏕️', 'feu', 'foret'),
	e('torche', 'Torche', '🔦', 'charbon', 'feu'),
	e('bateau', 'Bateau', '⛵', 'radeau', 'metal'),
	e('roi', 'Roi', '👑', 'humain', 'or'),
	e('reine', 'Reine', '👸', 'humain', 'chateau'),
	e('chevalier', 'Chevalier', '🐴', 'cheval', 'epee'),
	e('bijou', 'Bijou', '💍', 'or', 'diamant'),
	e('tresor', 'Trésor', '💰', 'or', 'bijou'),

	// ---- Technology & space ----
	e('electricite', 'Électricité', '🔌', 'energie', 'metal'),
	e('ampoule', 'Ampoule', '💡', 'energie', 'verre'),
	e('batterie', 'Batterie', '🔋', 'electricite', 'metal'),
	e('ordinateur', 'Ordinateur', '💻', 'electricite', 'verre'),
	e('telephone', 'Téléphone', '📱', 'electricite', 'ordinateur'),
	e('internet', 'Internet', '🌐', 'ordinateur', 'ordinateur'),
	e('robot', 'Robot', '🤖', 'metal', 'ordinateur'),
	e('intelligence', 'Intelligence', '🧠', 'internet', 'robot'),
	e('fusee', 'Fusée', '🚀', 'feu', 'metal'),
	e('astronaute', 'Astronaute', '👨‍🚀', 'fusee', 'humain'),
	e('satellite', 'Satellite', '🛰️', 'ciel', 'fusee'),
	e('lune', 'Lune', '🌙', 'ciel', 'pierre'),
	e('etoile', 'Étoile', '⭐', 'ciel', 'energie'),
	e('galaxie', 'Galaxie', '🌠', 'etoile', 'etoile'),
	e('planete', 'Planète', '🪐', 'etoile', 'pierre'),

	// ---- Food & drink ----
	e('farine', 'Farine', '🌾', 'ble', 'pierre'),
	e('pain', 'Pain', '🍞', 'farine', 'feu'),
	e('gateau', 'Gâteau', '🍰', 'farine', 'oeuf'),
	e('pizza', 'Pizza', '🍕', 'fromage', 'pain'),
	e('biere', 'Bière', '🍺', 'ble', 'eau'),
	e('cafe', 'Café', '☕', 'graine', 'vapeur'),
	e('sucre', 'Sucre', '🍬', 'fleur', 'soleil'),
	e('chocolat', 'Chocolat', '🍫', 'graine', 'lait'),
	e('creme-glacee', 'Crème glacée', '🍦', 'lait', 'neige'),
	e('vin', 'Vin', '🍷', 'bacterie', 'fruit'),
	e('soupe', 'Soupe', '🍲', 'eau', 'legume'),

	// ---- Myth & magic ----
	e('potion', 'Potion', '🧪', 'champignon', 'eau'),
	e('magie', 'Magie', '🪄', 'energie', 'potion'),
	e('sorciere', 'Sorcière', '🧙', 'humain', 'potion'),
	e('sirene', 'Sirène', '🧜', 'humain', 'poisson'),
	e('licorne', 'Licorne', '🦄', 'arcenciel', 'cheval'),
	e('phenix', 'Phénix', '🐦‍🔥', 'feu', 'oiseau'),
	e('dragon', 'Dragon', '🐉', 'dinosaure', 'feu'),
	e('loup-garou', 'Loup-garou', '🐺', 'humain', 'loup'),
	e('geant', 'Géant', '🗿', 'humain', 'montagne'),
	e('troll', 'Troll', '👹', 'foret', 'geant'),
	e('mort', 'Mort', '💀', 'epee', 'humain'),
	e('sang', 'Sang', '🩸', 'mort', 'vie'),
	e('vampire', 'Vampire', '🧛', 'humain', 'sang'),
	e('fantome', 'Fantôme', '👻', 'air', 'mort'),
	e('zombie', 'Zombie', '🧟', 'mort', 'terre'),
	e('ange', 'Ange', '👼', 'ciel', 'humain'),
	e('diable', 'Diable', '😈', 'feu', 'mort'),
];

/**
 * Daily-only "secret" elements — kept OUT of free play so the main game is never spoiled. Each
 * recipe combines 2 or 3 EXISTING main elements (so it's always reachable from the bases). The
 * daily challenge starts from the 5 bases, rebuilds the needed mains, then fuses to the target.
 */
const s = (id: string, name: string, emoji: string, ...recipe: string[]): Element => ({ id, name, emoji, recipe });

export const SECRET_ELEMENTS: Element[] = [
	// --- 2 ingredients ---
	s('cafe-au-lait', 'Café au lait', '☕', 'cafe', 'lait'),
	s('cyborg', 'Cyborg', '🦾', 'humain', 'robot'),
	s('limonade', 'Limonade', '🍋', 'eau', 'sucre'),
	s('caramel', 'Caramel', '🍮', 'sucre', 'lait'),
	s('confiture', 'Confiture', '🍓', 'fruit', 'sucre'),
	s('jus', 'Jus de fruit', '🧃', 'fruit', 'eau'),
	s('smoothie', 'Smoothie', '🥤', 'fruit', 'lait'),
	s('barbecue', 'Barbecue', '🍖', 'feu', 'vache'),
	s('hotdog', 'Hot-dog', '🌭', 'cochon', 'feu'),
	s('bacon', 'Bacon', '🥓', 'cochon', 'soleil'),
	s('requin', 'Requin', '🦈', 'poisson', 'epee'),
	s('baleine', 'Baleine', '🐋', 'poisson', 'montagne'),
	s('pingouin', 'Pingouin', '🐧', 'oiseau', 'glace'),
	s('paon', 'Paon', '🦚', 'oiseau', 'fleur'),
	s('ecureuil', 'Écureuil', '🐿️', 'souris', 'arbre'),
	s('lapin', 'Lapin', '🐰', 'souris', 'prairie'),
	s('renard', 'Renard', '🦊', 'loup', 'prairie'),
	s('ours', 'Ours', '🐻', 'loup', 'montagne'),
	s('lion', 'Lion', '🦁', 'loup', 'soleil'),
	s('tigre', 'Tigre', '🐅', 'loup', 'feu'),
	s('girafe', 'Girafe', '🦒', 'cheval', 'arbre'),
	s('singe', 'Singe', '🐒', 'humain', 'arbre'),
	s('gorille', 'Gorille', '🦍', 'montagne', 'foret'),
	s('kraken', 'Kraken', '🐙', 'mer', 'dragon'),
	s('yeti', 'Yéti', '⛄', 'neige', 'geant'),
	s('golem', 'Golem', '🗿', 'pierre', 'magie'),
	s('pirate', 'Pirate', '🏴‍☠️', 'humain', 'bateau'),
	s('ninja', 'Ninja', '🥷', 'robot', 'epee'),
	s('pharaon', 'Pharaon', '🤴', 'roi', 'desert'),
	s('champagne', 'Champagne', '🍾', 'vin', 'energie'),
	s('whisky', 'Whisky', '🥃', 'biere', 'feu'),
	s('chips', 'Chips', '🥔', 'legume', 'soleil'),
	s('frite', 'Frites', '🍟', 'legume', 'feu'),
	s('drone', 'Drone', '🛸', 'robot', 'air'),
	s('marais', 'Marais', '🐊', 'boue', 'arbre'),
	s('centaure', 'Centaure', '🏇', 'cheval', 'humain'),
	s('minotaure', 'Minotaure', '🐂', 'vache', 'humain'),
	s('griffon', 'Griffon', '🦅', 'aigle', 'loup'),
	s('fossile', 'Fossile', '🦴', 'dinosaure', 'pierre'),
	// --- 3 ingredients ---
	s('sandwich', 'Sandwich', '🥪', 'pain', 'fromage', 'salade'),
	s('hamburger', 'Hamburger', '🍔', 'pain', 'vache', 'salade'),
	s('crepe', 'Crêpe', '🥞', 'farine', 'oeuf', 'lait'),
	s('omelette', 'Omelette', '🍳', 'oeuf', 'feu', 'fromage'),
	s('sushi', 'Sushi', '🍣', 'poisson', 'ble', 'mer'),
	s('cocktail', 'Cocktail', '🍸', 'eau', 'fruit', 'glace'),
	s('the', 'Thé', '🍵', 'eau', 'feu', 'herbe'),
	s('popcorn', 'Pop-corn', '🍿', 'ble', 'feu', 'air'),
	s('voiture', 'Voiture', '🚗', 'metal', 'roue', 'energie'),
	s('train', 'Train', '🚂', 'metal', 'roue', 'charbon'),
	s('avion', 'Avion', '✈️', 'metal', 'oiseau', 'energie'),
	s('velo', 'Vélo', '🚲', 'metal', 'roue', 'humain'),
	s('moto', 'Moto', '🏍️', 'metal', 'roue', 'feu'),
	s('camera', 'Caméra', '📷', 'verre', 'metal', 'electricite'),
	s('horloge', 'Horloge', '🕰️', 'metal', 'verre', 'energie'),
	s('jungle', 'Jungle', '🌴', 'foret', 'pluie', 'soleil'),
	s('savane', 'Savane', '🦓', 'prairie', 'soleil', 'sable'),
	s('elephant', 'Éléphant', '🐘', 'terre', 'montagne', 'vie'),
	s('avalanche', 'Avalanche', '🏔️', 'neige', 'montagne', 'energie'),
	s('tsunami', 'Tsunami', '🌊', 'mer', 'tempete', 'montagne'),
];

export const BASE_IDS: string[] = ELEMENTS.filter((x) => !x.recipe).map((x) => x.id);
export const TOTAL = ELEMENTS.length;
export const SECRET_TOTAL = SECRET_ELEMENTS.length;

const BY_ID = new Map<string, Element>([...ELEMENTS, ...SECRET_ELEMENTS].map((x) => [x.id, x]));
export const getElement = (id: string): Element | undefined => BY_ID.get(id);

/** Order-independent key for a 2- or 3-element combination (a+b === b+a, a+a allowed). */
const comboKey = (ids: string[]): string => [...ids].sort().join('|');

const MAIN_RECIPES = new Map<string, string>();
for (const el of ELEMENTS) if (el.recipe) MAIN_RECIPES.set(comboKey(el.recipe), el.id);
const SECRET_RECIPES = new Map<string, string>();
for (const el of SECRET_ELEMENTS) if (el.recipe) SECRET_RECIPES.set(comboKey(el.recipe), el.id);

/**
 * Combine 2 or 3 element ids → the product id, or null. Free play passes only main recipes;
 * the daily challenge passes includeSecret=true so the secret/daily elements become craftable.
 */
export function combine(ids: string[], includeSecret = false): string | null {
	const k = comboKey(ids);
	const main = MAIN_RECIPES.get(k);
	if (main) return main;
	return includeSecret ? (SECRET_RECIPES.get(k) ?? null) : null;
}

/** Deterministic secret element for a daily seed. */
export function dailyTarget(seed: number): string {
	return SECRET_ELEMENTS[Math.floor(mulberry32(seed)() * SECRET_ELEMENTS.length)].id;
}

/**
 * Starting palette handed to the player in the daily challenge (instead of the bare 5 bases).
 * The target's recipe tree is expanded `diffIndex` extra levels toward the bases — so facile (0)
 * hands the target's direct ingredients (mixed with decoys → "find the right 2-3"), moyen (1) and
 * difficile (2) hand elements further back that need 1-2 intermediates rebuilt. Seeded → shared.
 * The returned set always suffices to craft the target.
 */
export function dailyPalette(seed: number, targetId: string, diffIndex: number): string[] {
	const target = getElement(targetId);
	if (!target?.recipe) return [...BASE_IDS];
	let frontier = [...target.recipe];
	for (let lvl = 0; lvl < diffIndex; lvl++)
		frontier = frontier.flatMap((id) => { const el = getElement(id); return el?.recipe ? el.recipe : [id]; });
	const need = [...new Set(frontier)]; // the given elements the whole path can be rebuilt from
	const rng = mulberry32((seed ^ 0x5f356495) >>> 0);
	const shuffle = (a: string[]): string[] => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
	const exclude = new Set([...need, targetId]);
	const decoys = shuffle(ELEMENTS.filter((e) => !exclude.has(e.id)).map((e) => e.id)).slice(0, Math.max(0, 11 - need.length));
	return shuffle([...need, ...decoys]);
}
