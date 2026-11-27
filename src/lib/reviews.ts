// The stores' ratings as the admin pages write them: « ★ 4,6 (23) », the studio's average over every app and store,
// the home tile's lines, and why Google Play's part is missing.
import { appKey } from './appColors';
import type { Review, ReviewApp, Reviews, ReviewStore, StoreRating } from './statsAdmin';

export const STORE_NAMES: Record<ReviewStore, string> = { appstore: 'App Store', play: 'Google Play' };
const one = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const int = new Intl.NumberFormat('fr-FR');
const DAY = 86_400_000;

/** « ★ 4,6 (23) », « aucune note », or « – » for an app not in that store. */
export function starLabel(r: Pick<StoreRating, 'average' | 'count'> & { live?: boolean } | undefined): string {
	if (!r || r.live === false) return '–';
	if (!r.count || r.average === null) return 'aucune note';
	return `★ ${one.format(r.average)} (${int.format(r.count)})`;
}

/** Google Play's state in French, or null when it was read. */
export function playProblem(play: Reviews['play']): string | null {
	if (play === 'closed') return "accès pas encore ouvert : le compte de service des relevés n'a pas encore le droit « Voir les informations sur l'application et télécharger les rapports groupés »";
	if (play === 'unset') return 'clé Google Play non posée';
	if (play === 'error') return "Google Play n'a pas répondu";
	return null;
}

/** The average of every app's every store, weighted by its count; null without any rating. */
export function studioAverage(r: Reviews): { average: number | null; count: number } {
	const all = r.apps.flatMap((a) => a.stores).filter((s) => s.live && s.count && s.average !== null);
	const count = all.reduce((n, s) => n + s.count, 0);
	return { average: count ? Math.round((all.reduce((n, s) => n + (s.average ?? 0) * s.count, 0) / count) * 100) / 100 : null, count };
}

/** The ratings of one board app in one store, matched by its key or name. */
export function ratingOf(r: Reviews | null, store: ReviewStore, ...names: (string | undefined)[]): StoreRating | undefined {
	const key = appKey(...names);
	return r?.apps.find((a) => a.app === key)?.stores.find((s) => s.store === store);
}

/** The reviews of the last `days` days. */
export const recentReviews = (r: Reviews, now: Date, days = 7): Review[] => r.reviews.filter((x) => Date.parse(x.at) >= now.getTime() - days * DAY);

/** The home tile: the studio's figure, then the week's reviews and Google's state. */
export function reviewTile(r: Reviews, now: Date): { figure?: string; lines: string[] } {
	const all = studioAverage(r);
	const week = recentReviews(r, now);
	const low = week.filter((x) => x.stars <= 2 && !x.reply).length;
	const problem = playProblem(r.play);
	return {
		figure: all.average === null ? undefined : `★ ${one.format(all.average)}`,
		lines: [
			all.count ? `${int.format(all.count)} note${all.count > 1 ? 's' : ''}, tous stores et applis` : 'aucune note encore',
			r.play === 'ok' ? `${week.length} avis Google sur 7 jours${low ? `, dont ${low} à 1 ou 2 étoiles sans réponse` : ''}` : `Google Play : ${problem?.split(' : ')[0]}`,
		],
	};
}

/** Apps in the order of the most rated first. */
export const byRatings = (apps: ReviewApp[]): ReviewApp[] =>
	[...apps].sort((a, b) => b.stores.reduce((n, s) => n + s.count, 0) - a.stores.reduce((n, s) => n + s.count, 0) || a.name.localeCompare(b.name));
