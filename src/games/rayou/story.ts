export type Who = 'Feuille' | 'Rayou' | 'Caillou' | 'Nestor' | 'Simone' | 'Câline' | 'Pépin' | 'Gribouille' | 'Petit';
export interface Line { who: Who; text: string }

// Shown on the dialog tag, the map and the bag: first name plus species.
export const LABELS: Record<Who, string> = {
	Feuille: 'Feuille l’écureuil',
	Rayou: 'Rayou',
	Caillou: 'Caillou le hibou',
	Nestor: 'Nestor le castor',
	Simone: 'Simone la hérissonne',
	Câline: 'Câline la lapine',
	Pépin: 'Pépin le lapin',
	Gribouille: 'Gribouille la grenouille',
	Petit: 'Petit hérisson',
};

export const COLORS: Record<Who, string> = {
	Feuille: '#c0682f',
	Rayou: '#ee8a2c',
	Caillou: '#8a6142',
	Nestor: '#7a4f2e',
	Simone: '#a07a58',
	Câline: '#d47a9a',
	Pépin: '#4f7fc0',
	Gribouille: '#4f9e45',
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
	// Controls tutorial step; past the last one means done.
	tuto: number;
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
	tuto: 0,
	pos: null,
	played: 0,
});

const KEY = 'rayou-save-v1';

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
	boat: { title: 'La barque de feuilles', text: 'Nestor le castor a vu une petite barque de feuilles descendre la rivière. Dedans dormait un bébé tigre.' },
	bell: { title: 'La clochette à l’étoile', text: 'Simone la hérissonne a gardé la clochette de Rayou. Elle porte un dessin : une étoile au-dessus d’une montagne.' },
	tracks: { title: 'Les grandes traces', text: 'Câline et Pépin les lapins ont vu de grandes traces de pattes dans la neige du Pic, qui repartaient de l’autre côté.' },
	signal: { title: 'Le signal', text: 'Gribouille la grenouille a vu la lumière du Pic clignoter trois fois cette nuit-là. Comme un signal.' },
};

export const L = {
	feuilleAsk: [
		{ who: 'Feuille', text: 'Oh, Rayou ! Tu tombes bien…' },
		{ who: 'Feuille', text: 'L’orage de cette nuit a fait tomber ma plus belle noisette tout là-haut, sur le grand rocher, près du noisetier.' },
		{ who: 'Feuille', text: 'De l’autre côté du rocher, des pierres montent comme un escalier. Mais elles sont bien trop loin les unes des autres pour mes petites pattes…' },
		{ who: 'Feuille', text: 'Toi, tu pourrais sauter de pierre en pierre jusqu’en haut ? Tu veux bien me la rapporter ?' },
		{ who: 'Rayou', text: 'Compte sur moi !' },
	],
	feuilleRemind: [{ who: 'Feuille', text: 'Les pierres montent comme un escalier autour du grand rocher. Saute de l’une à l’autre, en prenant de l’élan !' }],
	feuilleThanks: [
		{ who: 'Feuille', text: 'Ma noisette ! Merci Rayou, tu es le meilleur des voisins !' },
		{ who: 'Feuille', text: 'Et tu sais quel jour on est ? Ce soir, c’est la Fête des Lumières !' },
		{ who: 'Feuille', text: 'Mais l’orage a tout chamboulé… Caillou le hibou te cherchait ce matin. Il t’attend au Grand Chêne, au nord.' },
		{ who: 'Feuille', text: 'Attention, un gros tronc est tombé devant l’entrée du vallon. Toi qui es souple : roule dessous !' },
		{ who: 'Feuille', text: 'Ah, et il paraît que 24 noisettes dorées sont cachées dans la vallée. Trouves-en 10 et je te tricote une surprise !' },
		{ who: 'Rayou', text: 'J’y cours !' },
	],
	feuilleIdle: [{ who: 'Feuille', text: 'Les noisettes dorées aiment les endroits perchés. Regarde en hauteur !' }],
	feuilleScarf: [
		{ who: 'Feuille', text: 'Dix noisettes dorées ! Tu es incroyable.' },
		{ who: 'Feuille', text: 'Tiens, je t’ai tricoté une écharpe. Rouge, comme le ruban que tu portais quand tu étais petit.' },
		{ who: 'Rayou', text: 'Elle est toute douce… Merci Feuille !' },
	],
	feuilleAllGold: [
		{ who: 'Feuille', text: 'Les 24 ! Toutes les noisettes dorées de la vallée !' },
		{ who: 'Feuille', text: 'Je vais en faire un collier pour la fête. Tu es le roi des noisettes, Rayou.' },
	],
	feuilleLate: [{ who: 'Feuille', text: 'Je monterai au Pic ce soir pour voir la lanterne. Je suis fière de toi !' }],

	trunk: [{ who: 'Rayou', text: 'Ce tronc est trop haut pour sauter… mais je peux rouler en boule et passer dessous !' }],

	owlMeet: [
		{ who: 'Caillou', text: 'Ah, Rayou. Je t’attendais, mon garçon.' },
		{ who: 'Caillou', text: 'Ce soir, comme chaque année, nous devons allumer la grande lanterne, tout en haut du Pic aux Étoiles.' },
		{ who: 'Caillou', text: 'Mais l’orage a dispersé les lucioles. Elles se sont réfugiées chez nos amis, aux quatre coins de la vallée.' },
		{ who: 'Caillou', text: 'Rapporte-moi quatre bocaux de lucioles, et la lanterne brillera.' },
		{ who: 'Rayou', text: 'Pourquoi cette lanterne est-elle si importante ?' },
		{ who: 'Caillou', text: '… C’est par une nuit comme celle-ci que tu es arrivé chez nous. Ce soir-là, une lumière brillait sur le Pic.' },
		{ who: 'Caillou', text: 'Personne n’a jamais su qui l’avait allumée. Chacun de nos amis en a vu un petit morceau… Demande-leur.' },
		{ who: 'Caillou', text: 'Nestor le castor à la rivière, Simone la hérissonne dans le bois, Câline et Pépin les lapins au moulin, Gribouille la grenouille au lac. Va, le soleil n’attend pas.' },
	],
	owlRemind: [{ who: 'Caillou', text: 'Nestor le castor à la rivière, Simone la hérissonne dans le bois, Câline et Pépin les lapins au moulin, Gribouille la grenouille au lac. Le soleil descend, Rayou.' }],
	owlLantern: [
		{ who: 'Caillou', text: 'Quatre bocaux… Les lucioles n’ont jamais été aussi nombreuses.' },
		{ who: 'Caillou', text: 'Je suis trop vieux pour monter là-haut. C’est à toi d’allumer la lanterne, Rayou.' },
		{ who: 'Caillou', text: 'Le chemin du Pic commence de l’autre côté du barrage de Nestor le castor. Monte, terrasse après terrasse.' },
		{ who: 'Rayou', text: 'Et si je tombe ?' },
		{ who: 'Caillou', text: 'Alors tu rouleras, et tu remonteras. C’est comme ça qu’on grandit.' },
	],
	owlGo: [{ who: 'Caillou', text: 'Le Pic t’attend, de l’autre côté de la rivière. Terrasse après terrasse.' }],

	beaverAsk: [
		{ who: 'Nestor', text: 'Rayou ! Regarde-moi ce désastre : l’orage a emporté mon barrage.' },
		{ who: 'Nestor', text: 'Sans lui, plus moyen de traverser la rivière pour aller au Pic.' },
		{ who: 'Nestor', text: 'Le courant a déposé trois belles branches sur les îlots. Tu me les rapportes, une à une ?' },
		{ who: 'Nestor', text: 'Pour l’îlot du nord, il te faudra de l’élan : roule, puis saute pendant que tu roules. Tu iras bien plus loin !' },
		{ who: 'Rayou', text: 'Un saut roulé ? Je vais essayer !' },
	],
	beaverRemind: [{ who: 'Nestor', text: 'Les branches sont sur les îlots. Pour celui du nord : roule, puis saute en roulant !' }],
	beaverOne: [{ who: 'Nestor', text: 'Une belle branche ! Encore un effort.' }],
	beaverDone: [
		{ who: 'Nestor', text: 'Et voilà le travail ! Le barrage est solide, tu peux traverser.' },
		{ who: 'Nestor', text: 'Tiens, les lucioles qui s’étaient abritées dans ma hutte. Prends-en soin.' },
		{ who: 'Nestor', text: 'Tu sais… la nuit où tu es arrivé, j’ai vu une petite barque de feuilles descendre la rivière.' },
		{ who: 'Nestor', text: 'Dedans, il y avait un bébé tigre endormi. Toi.' },
		{ who: 'Rayou', text: 'Une barque ? Mais d’où venait-elle ?' },
		{ who: 'Nestor', text: 'De là-haut, de très loin, derrière les montagnes…' },
	],
	beaverIdle: [{ who: 'Nestor', text: 'Ce barrage tiendra cent ans ! Enfin… jusqu’au prochain orage.' }],

	simoneAsk: [
		{ who: 'Simone', text: 'Rayou ! Mes cinq petits ont eu si peur de l’orage qu’ils se sont cachés dans le bois…' },
		{ who: 'Simone', text: 'Quand ils ont peur, ils se roulent en boule et ne bougent plus. Tu veux bien les retrouver ?' },
		{ who: 'Simone', text: 'Ils te suivront dès que tu les touches. Cherche partout : sous les troncs, derrière les ronces, tout en haut…' },
		{ who: 'Simone', text: 'Les ronces, ça se casse si on fonce dedans en boule !' },
	],
	simoneRemind: [{ who: 'Simone', text: 'Sous les troncs, derrière les ronces, tout en haut… Ils sont bien cachés, mes petits.' }],
	simoneSome: [{ who: 'Simone', text: 'Oh, mes trésors ! Allez, à la maison. Il en manque encore…' }],
	simoneDone: [
		{ who: 'Simone', text: 'Tous les cinq ! Merci, merci, merci !' },
		{ who: 'Simone', text: 'Ils s’étaient blottis contre des lucioles pour se rassurer. Tiens, elles sont à toi.' },
		{ who: 'Simone', text: 'Tu sais, quand tu étais tout petit, tu portais un ruban rouge avec une clochette.' },
		{ who: 'Simone', text: 'Je l’ai gardée. Elle porte un dessin : une étoile au-dessus d’une montagne.' },
		{ who: 'Rayou', text: 'Une étoile au-dessus d’une montagne… Comme le Pic ?' },
	],
	simoneIdle: [{ who: 'Simone', text: 'Les petits ne parlent plus que de toi. Ils veulent tous apprendre à rouler !' }],
	baby: [{ who: 'Petit', text: 'Rayou ! J’ai eu si peur… Je te suis !' }],

	rabbitAsk: [
		{ who: 'Pépin', text: 'Rayou, Rayou ! Notre cerf-volant !' },
		{ who: 'Câline', text: 'Le vent de l’orage l’a emporté tout en haut du moulin. Il est coincé sur le toit.' },
		{ who: 'Pépin', text: 'Et des lucioles se sont prises dedans, elles n’arrivent plus à sortir !' },
		{ who: 'Câline', text: 'Par la cabane, puis le balcon… Tu crois que tu peux grimper ?' },
		{ who: 'Rayou', text: 'Je m’en occupe !' },
	],
	rabbitRemind: [{ who: 'Câline', text: 'Monte par la cabane, puis le balcon, puis les planches autour de la tour !' }],
	rabbitDone: [
		{ who: 'Câline', text: 'Notre cerf-volant ! Et les lucioles sont sauvées !' },
		{ who: 'Pépin', text: 'On te donne un bocal plein. Pour la lanterne !' },
		{ who: 'Câline', text: 'Dis, Rayou… le matin où tu es arrivé, on a vu des traces dans la neige du Pic.' },
		{ who: 'Pépin', text: 'Des pattes comme les tiennes, mais beaucoup plus grandes. Elles repartaient de l’autre côté de la montagne.' },
		{ who: 'Rayou', text: 'Plus grandes que les miennes…' },
	],
	rabbitIdle: [{ who: 'Pépin', text: 'Regarde comme il vole haut ! Merci Rayou !' }],

	frogAsk: [
		{ who: 'Gribouille', text: 'Croâ ! Rayou ! Les lucioles du lac se sont posées sur les nénuphars pendant l’orage.' },
		{ who: 'Gribouille', text: 'Il y en a six. Saute de feuille en feuille pour les rassembler.' },
		{ who: 'Gribouille', text: 'Méfie-toi : une feuille dérive, une autre s’enfonce si on traîne dessus. Et si tu tombes à l’eau… tu seras mouillé, voilà tout !' },
	],
	frogRemind: [{ who: 'Gribouille', text: 'Six lucioles sur les nénuphars. Saute, croâ !' }],
	frogDone: [
		{ who: 'Gribouille', text: 'Six sur six ! Tu sautes presque aussi bien que moi.' },
		{ who: 'Gribouille', text: 'Voilà ton bocal. Elles brillent fort, ce soir.' },
		{ who: 'Gribouille', text: 'Je vais te dire un secret : cette nuit-là, la lumière du Pic a clignoté trois fois. Comme un signal.' },
		{ who: 'Gribouille', text: 'Puis elle s’est éteinte. Je me suis toujours demandé à qui elle parlait.' },
	],
	frogIdle: [{ who: 'Gribouille', text: 'Croâ. Le lac est calme, ce soir.' }],
	frogComeBack: [{ who: 'Gribouille', text: 'Toutes les lucioles ! Reviens me voir sur le ponton, croâ !' }],

	owlEarly: [{ who: 'Caillou', text: 'Tiens, Rayou ! Passe d’abord voir Feuille l’écureuil : elle avait l’air bien embêtée ce matin.' }],
	notYet: [{ who: 'Rayou', text: 'Je devrais d’abord aller voir Caillou le hibou, au Grand Chêne.' }],
	carrying: [{ who: 'Rayou', text: 'J’ai déjà quelque chose dans la gueule…' }],

	lantern: [
		{ who: 'Feuille', text: 'Rayou ! On est tous montés te voir !' },
		{ who: 'Caillou', text: 'Regarde, mon garçon. La vallée entière te voit briller.' },
		{ who: 'Gribouille', text: 'Là-bas ! Derrière les montagnes ! La lumière clignote… trois fois !' },
		{ who: 'Rayou', text: 'Quelqu’un… quelqu’un me répond ?' },
		{ who: 'Caillou', text: 'Quelqu’un, de l’autre côté des montagnes, ne t’a jamais oublié.' },
		{ who: 'Simone', text: 'Une étoile au-dessus d’une montagne… C’était ta clochette, Rayou.' },
		{ who: 'Feuille', text: 'Et ici aussi, tu as une famille. Pour toujours.' },
		{ who: 'Rayou', text: 'Un jour, j’irai voir qui allume cette lumière. Mais ce soir… je reste avec vous.' },
	],
	lanternNotYet: [{ who: 'Rayou', text: 'La lanterne est éteinte. Il me faut les quatre bocaux de lucioles.' }],
} satisfies Record<string, Line[]>;
