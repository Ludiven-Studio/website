export type Who = 'Sally' | 'Tygo' | 'Hector' | 'Barnabé' | 'Pipa' | 'Lila' | 'Lou' | 'Gaston' | 'Petit';
export interface Line { who: Who; text: string }

export const COLORS: Record<Who, string> = {
	Sally: '#c0682f',
	Tygo: '#ee8a2c',
	Hector: '#8a6142',
	Barnabé: '#7a4f2e',
	Pipa: '#a07a58',
	Lila: '#d47a9a',
	Lou: '#4f7fc0',
	Gaston: '#4f9e45',
	Petit: '#a07a58',
};

export interface State {
	v: 1;
	nut: number; // 0 not asked, 1 asked, 2 carrying, 3 given
	owl: number; // 0 not met, 1 quests open, 2 lantern task, 3 lit
	beaver: number; // 0 / 1 active / 2 done
	branches: number;
	hedge: number;
	babiesHome: number;
	rabbit: number;
	frog: number;
	carry: string;
	taken: string[];
	broken: string[];
	souvenirs: string[];
	scarf: boolean;
	allGold: boolean;
	seen: string[];
	pos: { x: number; y: number; z: number; yaw: number } | null;
	played: number;
}

export const newState = (): State => ({
	v: 1,
	nut: 0,
	owl: 0,
	beaver: 0,
	branches: 0,
	hedge: 0,
	babiesHome: 0,
	rabbit: 0,
	frog: 0,
	carry: '',
	taken: [],
	broken: [],
	souvenirs: [],
	scarf: false,
	allGold: false,
	seen: [],
	pos: null,
	played: 0,
});

const KEY = 'tygo-save-v1';

export function loadState(): State | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const s = JSON.parse(raw) as State;
		return s.v === 1 ? { ...newState(), ...s } : null;
	} catch {
		return null;
	}
}

export function saveState(s: State): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(s));
	} catch {
		/* private mode: progress lives for this visit only */
	}
}

export function clearState(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {
		/* nothing to clear */
	}
}

export const jars = (s: State) => [s.beaver, s.hedge, s.rabbit, s.frog].filter((v) => v === 2).length;
export const goldCount = (s: State) => s.taken.filter((t) => t.startsWith('gold')).length;
export const GOLD_TOTAL = 24;

export const SOUVENIRS: Record<string, { title: string; text: string }> = {
	boat: { title: 'La barque de feuilles', text: 'Barnabé a vu une petite barque de feuilles descendre la rivière. Dedans dormait un bébé tigre.' },
	bell: { title: 'La clochette à l’étoile', text: 'Pipa a gardé la clochette de Tygo. Elle porte un dessin : une étoile au-dessus d’une montagne.' },
	tracks: { title: 'Les grandes traces', text: 'Lila et Lou ont vu de grandes traces de pattes dans la neige du Pic, qui repartaient de l’autre côté.' },
	signal: { title: 'Le signal', text: 'Gaston a vu la lumière du Pic clignoter trois fois cette nuit-là. Comme un signal.' },
};

export const L = {
	sallyAsk: [
		{ who: 'Sally', text: 'Oh, Tygo ! Tu tombes bien…' },
		{ who: 'Sally', text: 'L’orage de cette nuit a fait tomber ma plus belle noisette tout là-haut, sur le grand rocher, près du noisetier.' },
		{ who: 'Sally', text: 'Mes petites pattes ne grimpent pas si haut… Tu veux bien me la rapporter ?' },
		{ who: 'Tygo', text: 'Compte sur moi !' },
	],
	sallyRemind: [{ who: 'Sally', text: 'Le passage pour grimper est marqué de traces de pattes, au pied du rocher !' }],
	sallyThanks: [
		{ who: 'Sally', text: 'Ma noisette ! Merci Tygo, tu es le meilleur des voisins !' },
		{ who: 'Sally', text: 'Et tu sais quel jour on est ? Ce soir, c’est la Fête des Lumières !' },
		{ who: 'Sally', text: 'Mais l’orage a tout chamboulé… Hector le hibou te cherchait ce matin. Il t’attend au Grand Chêne, au nord.' },
		{ who: 'Sally', text: 'Attention, un gros tronc est tombé devant l’entrée du vallon. Toi qui es souple : roule dessous !' },
		{ who: 'Sally', text: 'Ah, et il paraît que 24 noisettes dorées sont cachées dans la vallée. Trouves-en 10 et je te tricote une surprise !' },
		{ who: 'Tygo', text: 'J’y cours !' },
	],
	sallyIdle: [{ who: 'Sally', text: 'Les noisettes dorées aiment les endroits perchés. Regarde en hauteur !' }],
	sallyScarf: [
		{ who: 'Sally', text: 'Dix noisettes dorées ! Tu es incroyable.' },
		{ who: 'Sally', text: 'Tiens, je t’ai tricoté une écharpe. Rouge, comme le ruban que tu portais quand tu étais petit.' },
		{ who: 'Tygo', text: 'Elle est toute douce… Merci Sally !' },
	],
	sallyAllGold: [
		{ who: 'Sally', text: 'Les 24 ! Toutes les noisettes dorées de la vallée !' },
		{ who: 'Sally', text: 'Je vais en faire un collier pour la fête. Tu es le roi des noisettes, Tygo.' },
	],
	sallyLate: [{ who: 'Sally', text: 'Je monterai au Pic ce soir pour voir la lanterne. Je suis fière de toi !' }],

	trunk: [{ who: 'Tygo', text: 'Ce tronc est trop haut pour sauter… mais je peux rouler en boule et passer dessous !' }],

	owlMeet: [
		{ who: 'Hector', text: 'Ah, Tygo. Je t’attendais, mon garçon.' },
		{ who: 'Hector', text: 'Ce soir, comme chaque année, nous devons allumer la grande lanterne, tout en haut du Pic aux Étoiles.' },
		{ who: 'Hector', text: 'Mais l’orage a dispersé les lucioles. Elles se sont réfugiées chez nos amis, aux quatre coins de la vallée.' },
		{ who: 'Hector', text: 'Rapporte-moi quatre bocaux de lucioles, et la lanterne brillera.' },
		{ who: 'Tygo', text: 'Pourquoi cette lanterne est-elle si importante ?' },
		{ who: 'Hector', text: '… C’est par une nuit comme celle-ci que tu es arrivé chez nous. Ce soir-là, une lumière brillait sur le Pic.' },
		{ who: 'Hector', text: 'Personne n’a jamais su qui l’avait allumée. Chacun de nos amis en a vu un petit morceau… Demande-leur.' },
		{ who: 'Hector', text: 'Barnabé à la rivière, Pipa dans le bois, Lila et Lou au moulin, Gaston au lac. Va, le soleil n’attend pas.' },
	],
	owlRemind: [{ who: 'Hector', text: 'Barnabé à la rivière, Pipa dans le bois, Lila et Lou au moulin, Gaston au lac. Le soleil descend, Tygo.' }],
	owlLantern: [
		{ who: 'Hector', text: 'Quatre bocaux… Les lucioles n’ont jamais été aussi nombreuses.' },
		{ who: 'Hector', text: 'Je suis trop vieux pour monter là-haut. C’est à toi d’allumer la lanterne, Tygo.' },
		{ who: 'Hector', text: 'Le chemin du Pic commence de l’autre côté du barrage de Barnabé. Monte, terrasse après terrasse.' },
		{ who: 'Tygo', text: 'Et si je tombe ?' },
		{ who: 'Hector', text: 'Alors tu rouleras, et tu remonteras. C’est comme ça qu’on grandit.' },
	],
	owlGo: [{ who: 'Hector', text: 'Le Pic t’attend, de l’autre côté de la rivière. Terrasse après terrasse.' }],

	beaverAsk: [
		{ who: 'Barnabé', text: 'Tygo ! Regarde-moi ce désastre : l’orage a emporté mon barrage.' },
		{ who: 'Barnabé', text: 'Sans lui, plus moyen de traverser la rivière pour aller au Pic.' },
		{ who: 'Barnabé', text: 'Le courant a déposé trois belles branches sur les îlots. Tu me les rapportes, une à une ?' },
		{ who: 'Barnabé', text: 'Pour l’îlot du nord, il te faudra de l’élan : roule, puis saute pendant que tu roules. Tu iras bien plus loin !' },
		{ who: 'Tygo', text: 'Un saut roulé ? Je vais essayer !' },
	],
	beaverRemind: [{ who: 'Barnabé', text: 'Les branches sont sur les îlots. Pour celui du nord : roule, puis saute en roulant !' }],
	beaverOne: [{ who: 'Barnabé', text: 'Une belle branche ! Encore un effort.' }],
	beaverDone: [
		{ who: 'Barnabé', text: 'Et voilà le travail ! Le barrage est solide, tu peux traverser.' },
		{ who: 'Barnabé', text: 'Tiens, les lucioles qui s’étaient abritées dans ma hutte. Prends-en soin.' },
		{ who: 'Barnabé', text: 'Tu sais… la nuit où tu es arrivé, j’ai vu une petite barque de feuilles descendre la rivière.' },
		{ who: 'Barnabé', text: 'Dedans, il y avait un bébé tigre endormi. Toi.' },
		{ who: 'Tygo', text: 'Une barque ? Mais d’où venait-elle ?' },
		{ who: 'Barnabé', text: 'De là-haut, de très loin, derrière les montagnes…' },
	],
	beaverIdle: [{ who: 'Barnabé', text: 'Ce barrage tiendra cent ans ! Enfin… jusqu’au prochain orage.' }],

	pipaAsk: [
		{ who: 'Pipa', text: 'Tygo ! Mes cinq petits ont eu si peur de l’orage qu’ils se sont cachés dans le bois…' },
		{ who: 'Pipa', text: 'Quand ils ont peur, ils se roulent en boule et ne bougent plus. Tu veux bien les retrouver ?' },
		{ who: 'Pipa', text: 'Ils te suivront dès que tu les touches. Cherche partout : sous les troncs, derrière les ronces, tout en haut…' },
		{ who: 'Pipa', text: 'Les ronces, ça se casse si on fonce dedans en boule !' },
	],
	pipaRemind: [{ who: 'Pipa', text: 'Sous les troncs, derrière les ronces, tout en haut… Ils sont bien cachés, mes petits.' }],
	pipaSome: [{ who: 'Pipa', text: 'Oh, mes trésors ! Allez, à la maison. Il en manque encore…' }],
	pipaDone: [
		{ who: 'Pipa', text: 'Tous les cinq ! Merci, merci, merci !' },
		{ who: 'Pipa', text: 'Ils s’étaient blottis contre des lucioles pour se rassurer. Tiens, elles sont à toi.' },
		{ who: 'Pipa', text: 'Tu sais, quand tu étais tout petit, tu portais un ruban rouge avec une clochette.' },
		{ who: 'Pipa', text: 'Je l’ai gardée. Elle porte un dessin : une étoile au-dessus d’une montagne.' },
		{ who: 'Tygo', text: 'Une étoile au-dessus d’une montagne… Comme le Pic ?' },
	],
	pipaIdle: [{ who: 'Pipa', text: 'Les petits ne parlent plus que de toi. Ils veulent tous apprendre à rouler !' }],
	baby: [{ who: 'Petit', text: 'Tygo ! J’ai eu si peur… Je te suis !' }],

	rabbitAsk: [
		{ who: 'Lou', text: 'Tygo, Tygo ! Notre cerf-volant !' },
		{ who: 'Lila', text: 'Le vent de l’orage l’a emporté tout en haut du moulin. Il est coincé sur le toit.' },
		{ who: 'Lou', text: 'Et des lucioles se sont prises dedans, elles n’arrivent plus à sortir !' },
		{ who: 'Lila', text: 'Par la cabane, puis le balcon… Tu crois que tu peux grimper ?' },
		{ who: 'Tygo', text: 'Je m’en occupe !' },
	],
	rabbitRemind: [{ who: 'Lila', text: 'Monte par la cabane, puis le balcon, puis les planches autour de la tour !' }],
	rabbitDone: [
		{ who: 'Lila', text: 'Notre cerf-volant ! Et les lucioles sont sauvées !' },
		{ who: 'Lou', text: 'On te donne un bocal plein. Pour la lanterne !' },
		{ who: 'Lila', text: 'Dis, Tygo… le matin où tu es arrivé, on a vu des traces dans la neige du Pic.' },
		{ who: 'Lou', text: 'Des pattes comme les tiennes, mais beaucoup plus grandes. Elles repartaient de l’autre côté de la montagne.' },
		{ who: 'Tygo', text: 'Plus grandes que les miennes…' },
	],
	rabbitIdle: [{ who: 'Lou', text: 'Regarde comme il vole haut ! Merci Tygo !' }],

	frogAsk: [
		{ who: 'Gaston', text: 'Croâ ! Tygo ! Les lucioles du lac se sont posées sur les nénuphars pendant l’orage.' },
		{ who: 'Gaston', text: 'Il y en a six. Saute de feuille en feuille pour les rassembler.' },
		{ who: 'Gaston', text: 'Méfie-toi : une feuille dérive, une autre s’enfonce si on traîne dessus. Et si tu tombes à l’eau… tu seras mouillé, voilà tout !' },
	],
	frogRemind: [{ who: 'Gaston', text: 'Six lucioles sur les nénuphars. Saute, croâ !' }],
	frogDone: [
		{ who: 'Gaston', text: 'Six sur six ! Tu sautes presque aussi bien que moi.' },
		{ who: 'Gaston', text: 'Voilà ton bocal. Elles brillent fort, ce soir.' },
		{ who: 'Gaston', text: 'Je vais te dire un secret : cette nuit-là, la lumière du Pic a clignoté trois fois. Comme un signal.' },
		{ who: 'Gaston', text: 'Puis elle s’est éteinte. Je me suis toujours demandé à qui elle parlait.' },
	],
	frogIdle: [{ who: 'Gaston', text: 'Croâ. Le lac est calme, ce soir.' }],
	frogComeBack: [{ who: 'Gaston', text: 'Toutes les lucioles ! Reviens me voir sur le ponton, croâ !' }],

	owlEarly: [{ who: 'Hector', text: 'Tiens, Tygo ! Passe d’abord voir Sally : elle avait l’air bien embêtée ce matin.' }],
	notYet: [{ who: 'Tygo', text: 'Je devrais d’abord aller voir Hector, au Grand Chêne.' }],
	carrying: [{ who: 'Tygo', text: 'J’ai déjà quelque chose dans la gueule…' }],

	lantern: [
		{ who: 'Sally', text: 'Tygo ! On est tous montés te voir !' },
		{ who: 'Hector', text: 'Regarde, mon garçon. La vallée entière te voit briller.' },
		{ who: 'Gaston', text: 'Là-bas ! Derrière les montagnes ! La lumière clignote… trois fois !' },
		{ who: 'Tygo', text: 'Quelqu’un… quelqu’un me répond ?' },
		{ who: 'Hector', text: 'Quelqu’un, de l’autre côté des montagnes, ne t’a jamais oublié.' },
		{ who: 'Pipa', text: 'Une étoile au-dessus d’une montagne… C’était ta clochette, Tygo.' },
		{ who: 'Sally', text: 'Et ici aussi, tu as une famille. Pour toujours.' },
		{ who: 'Tygo', text: 'Un jour, j’irai voir qui allume cette lumière. Mais ce soir… je reste avec vous.' },
	],
	lanternNotYet: [{ who: 'Tygo', text: 'La lanterne est éteinte. Il me faut les quatre bocaux de lucioles.' }],
} satisfies Record<string, Line[]>;
