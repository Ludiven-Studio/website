// The workshop's "trombinoscope": who is who, filled in as the story reveals it. Each fact unlocks at a
// story gate (a project step), an owned upgrade, or a `seen` flag, so the page never spoils a chapter.
// The player is deliberately absent: no face, no name, no gender.

import type { Gate } from './data';

export interface Fact {
	text: string;
	when?: Gate;
	after?: string;
	flag?: string;
}

export interface Character {
	id: string;
	name: string;
	/** Key into FACES (portrait file). */
	face: string;
	facts: Fact[];
}

export const CHARACTERS: Character[] = [
	{
		id: 'jeanne', name: 'Jeanne', face: 'Jeanne',
		facts: [
			{ text: 'Votre grand-mère. Réparatrice, elle a tenu l’atelier du quartier pendant des décennies.' },
			{ text: 'En mars 1962, elle a fermé son bureau à clé, sans dire pourquoi.', flag: 'rep-5' },
			{ text: 'Le « J. » de la montre d’Henri Morel. Sur la photo de 1961, elle est à côté de lui.', when: { project: 'montre', step: 3 } },
			{ text: 'Avec sa sœur Lucile et Henri, elle formait les « Pirates du retour ».', when: { project: 'radio', step: 3 } },
			{ text: 'Elle dessinait des pies dans les marges de ses factures.', when: { project: 'boite', step: 1 } },
			{ text: 'Elle avait caché la clé du bureau et une lettre pour Lucile dans la boîte destinée à sa sœur.', when: { project: 'boite', step: 2 } },
			{ text: 'Avec Lucile et Henri, elle cherchait le trésor de la Pie, avec une carte et le carnet de Rose.', after: 'bureau' },
			{ text: 'Après la tempête de 1962, elle a refusé de continuer les recherches : elle avait eu trop peur.', when: { project: 'fauteuil', step: 3 } },
			{ text: 'À la fermeture de l’atelier, le notaire a vendu son stock.', when: { project: 'caissette', step: 2 } },
			{ text: 'Elle avait réparé la toupie de votre enfance, et l’avait gardée.', when: { project: 'toupie', step: 1 } },
		],
	},
	{
		id: 'garnier', name: 'Mme Garnier', face: 'Mme Garnier',
		facts: [
			{ text: 'Voisine et amie de Jeanne. Elle a toujours une petite commande en attente.' },
			{ text: 'Jeanne lui avait envoyé une carte postale en mars 1962 : « Le bureau, je le ferme. »', flag: 'rep-5' },
			{ text: 'Elle gardait une boîte que Jeanne destinait à Lucile, sans jamais oser l’envoyer.', when: { project: 'radio', step: 3 } },
			{ text: 'Dans sa famille, on répétait : « Ce qui est pris ne revient pas. »', when: { project: 'travailleuse', step: 1 } },
			{ text: 'Elle descend d’Étienne Roussel, charpentier de L’Espérance, le navire pillé par l’équipage de Rose.', when: { project: 'travailleuse', step: 2 } },
			{ text: 'Elle faisait les ourlets du quartier.', when: { project: 'tabouret', step: 1 } },
			{ text: 'En 1962, elle avait acheté un billet pour aller voir Lucile. Elle n’est jamais partie.', when: { project: 'bobines', step: 1 } },
			{ text: 'Elle avait peur que Jeanne croie qu’elle prenait le parti de Lucile.', when: { project: 'bobines', step: 2 } },
			{ text: 'Elle a enfin fait le voyage. Lucile et elle ont un ouvrage à finir.', when: { project: 'valise', step: 3 } },
		],
	},
	{
		id: 'morel', name: 'M. Morel', face: 'M. Morel',
		facts: [
			{ text: 'Il a apporté la montre de son père, arrêtée le jour où il est parti. Il n’avait jamais osé la faire réparer.', after: 'etabli' },
			{ text: 'Son père s’appelait Henri.', when: { project: 'montre', step: 1 } },
			{ text: 'Il a reconnu son père et Jeanne sur la photo de 1961.', when: { project: 'montre', step: 3 } },
			{ text: 'Il a découvert que son père était à bord de La Mouette, en mars 1962.', when: { project: 'fanal', step: 2 } },
			{ text: 'Il a aidé Lucas à remettre La Mouette à l’eau. « Un bateau poncé, c’est un bateau qui respire », disait son père.', when: { project: 'mouette', step: 1 } },
		],
	},
	{
		id: 'henri', name: 'Henri Morel', face: 'Henri Morel',
		facts: [
			{ text: 'Le père de M. Morel. Sa montre porte une gravure signée « J. ».', when: { project: 'montre', step: 1 } },
			{ text: 'Sur la photo de 1961, à côté de Jeanne.', when: { project: 'montre', step: 3 } },
			{ text: 'L’un des trois « Pirates du retour », avec Jeanne et Lucile.', when: { project: 'radio', step: 3 } },
			{ text: 'Pendant la tempête de mars 1962, il a sauvé Jeanne de la noyade.', when: { project: 'fauteuil', step: 3 } },
			{ text: 'L’étiquette « Mouette » du fanal est de sa main. Il avait gardé le fanal et le bulletin météo de la tempête.', when: { project: 'fanal', step: 2 } },
		],
	},
	{
		id: 'lucas', name: 'Lucas', face: 'Lucas',
		facts: [
			{ text: 'Un garçon du quartier, toujours à vélo.', after: 'etabli' },
			{ text: 'Son grand-père lui avait construit un voilier, dédicacé « Au capitaine du retour ».', when: { project: 'voilier', step: 1 } },
			{ text: 'À seize ans, il range le grenier de son grand-père Yves.', when: { project: 'boussole', step: 1 } },
			{ text: 'Sa famille, les Kerbrat, gardait un morceau de la carte depuis 1813.', when: { project: 'longuevue', step: 3 } },
			{ text: 'Il descend de Samuel Kerbrat, le mousse de Rose.', when: { project: 'coffre', step: 1 } },
			{ text: 'Il a barré La Mouette jusqu’à l’îlot et rapporté la cloche de L’Espérance.', when: { project: 'mouette', step: 3 } },
			{ text: 'Le « capitaine du retour », c’était lui : enfant, il ramenait au bassin les bateaux des autres.', when: { project: 'cloche', step: 3 } },
		],
	},
	{
		id: 'chen', name: 'Mlle Chen', face: 'Mlle Chen',
		facts: [
			{ text: 'Passionnée de maquettes, elle chine dans les brocantes.', when: { project: 'montre', step: 1 } },
			{ text: 'Sa grand-mère fredonnait un air dont personne ne connaissait l’origine. Son aïeule Mei Chen avait perdu une boîte à musique en 1812.', when: { project: 'musique', step: 1 } },
			{ text: 'La boîte à musique de Mei Chen est revenue dans sa famille.', when: { project: 'musique', step: 3 } },
			{ text: 'Elle gardait une pièce de son tout premier lot de brocante.', when: { project: 'valise', step: 3 } },
			{ text: 'Son premier lot, c’était cette valise, achetée à Mme Lemoine.', when: { project: 'etal', step: 2 } },
			{ text: 'Elle prépare une tournée des marchés, avec une valise-étal.', when: { project: 'caissette', step: 1 } },
			{ text: 'Sa tournée rendra aussi les réparations « J. » à leurs propriétaires.', when: { project: 'caissette', step: 3 } },
			{ text: 'Elle repasse le jeudi, avec des trouvailles à réparer.', when: { project: 'toupie', step: 3 } },
		],
	},
	{
		id: 'boulangere', name: 'La boulangère', face: 'La boulangère',
		facts: [
			{ text: 'Elle tient la boulangerie du quartier.', when: { project: 'voilier', step: 1 } },
			{ text: 'La pie du fauteuil de sa mère était, disait sa grand-mère, la marque de la maison.', when: { project: 'fauteuil', step: 1 } },
			{ text: 'Sa famille gardait, sans le savoir, le quatrième morceau de la carte.', when: { project: 'fauteuil', step: 2 } },
			{ text: 'Deux places pour quelqu’un dans sa boutique : le fauteuil de sa mère et le tabouret des ourlets.', when: { project: 'tabouret', step: 3 } },
			{ text: 'La balance de sa grand-mère : « Une balance juste, c’est un commerce honnête. »', when: { project: 'balance', step: 1 } },
		],
	},
	{
		id: 'facteur', name: 'Le facteur', face: 'Le facteur',
		facts: [
			{ text: 'Il passe tous les jours, souvent avec une lettre qui compte.', when: { project: 'radio', step: 1 } },
			{ text: 'C’est lui qui a apporté la lettre de Lucile.', when: { project: 'fauteuil', step: 3 } },
		],
	},
	{
		id: 'lucile', name: 'Lucile', face: 'Lucile',
		facts: [
			{ text: 'La sœur de Jeanne, l’une des trois « Pirates du retour ».', when: { project: 'radio', step: 3 } },
			{ text: 'En 1962, elle voulait continuer les recherches à terre. Brouillée avec Jeanne, elle est partie.', when: { project: 'fauteuil', step: 3 } },
			{ text: 'Sa lettre disait : « Rien n’est jamais là où on le croit. »', when: { project: 'fauteuil', step: 3 } },
			{ text: 'Elle est venue à l’atelier et a lu la lettre de Jeanne. Soixante ans pour se dire pardon.', when: { project: 'musique', step: 3 } },
			{ text: 'Après une lettre de Lucas, elle est revenue avec sa longue-vue de 1961.', when: { project: 'longuevue', step: 1 } },
			{ text: 'C’est elle qui avait poussé Yves à prendre la mer malgré le ciel, en mars 1962.', when: { project: 'longuevue', step: 2 } },
			{ text: 'Mme Garnier est venue la voir. Elles ont un ouvrage à finir.', when: { project: 'valise', step: 3 } },
		],
	},
	{
		id: 'rose', name: 'Rose Kerdoual', face: 'Rose Kerdoual',
		facts: [
			{ text: '« La Pie », ancêtre de Jeanne, pirate. Son carnet de bord date de 1813.', after: 'bureau' },
			{ text: 'Elle avait caché sa malle sous l’atelier en 1813, et fait de l’îlot un leurre.', flag: 'map-solved' },
			{ text: 'Elle a volé, puis rendu presque tout : les compartiments vides de sa malle en gardent la trace.', when: { project: 'malle', step: 2 } },
			{ text: 'Dans sa malle dormait une boîte à musique marquée « Famille Chen, 1812 ».', when: { project: 'malle', step: 3 } },
			{ text: 'Deux compagnons l’accompagnaient : Élie, et Samuel Kerbrat, un mousse de quatorze ans.', when: { project: 'coffre', step: 2 } },
			{ text: 'Son équipage avait pillé L’Espérance en 1811.', when: { project: 'cloche', step: 1 } },
			{ text: 'En 1813, elle a remis trois cents francs à Étienne Roussel, charpentier ruiné de L’Espérance.', when: { project: 'carnet', step: 2 } },
		],
	},
	{
		id: 'yves', name: 'Yves Kerbrat', face: 'Yves Kerbrat',
		facts: [
			{ text: 'Le grand-père de Lucas, « Y. K. », un homme de la mer.', when: { project: 'boussole', step: 1 } },
			{ text: 'Il était à bord de La Mouette pendant la tempête de 1962.', when: { project: 'fanal', step: 3 } },
			{ text: 'À dix-sept ans, il a donné au trio le morceau de carte de sa famille. Ils l’appelaient « notre capitaine ».', when: { project: 'longuevue', step: 1 } },
			{ text: 'Il a ramené tout le monde de la tempête, et ne se l’est jamais pardonné.', when: { project: 'longuevue', step: 2 } },
			{ text: 'Il a gardé La Mouette soixante ans dans un hangar, sans la regarder.', when: { project: 'mouette', step: 1 } },
			{ text: 'Il vit en maison de retraite. « Tout l’équipage est rentré. »', when: { project: 'cloche', step: 3 } },
		],
	},
	{
		id: 'lemoine', name: 'Mme Lemoine', face: 'Mme Lemoine',
		facts: [
			{ text: 'Brocanteuse, quarante ans de marchés. La valise de Mlle Chen était son étal.', when: { project: 'presentoir', step: 1 } },
			{ text: 'C’est elle qui avait percé les trous de la valise : « Un étal, ça sert, ou ça moisit. »', when: { project: 'caissette', step: 1 } },
			{ text: 'Elle avait acheté le stock de l’atelier de Jeanne à sa fermeture.', when: { project: 'caissette', step: 2 } },
		],
	},
];
