// /admin/: one tile per admin page. Once signed in, the tiles show each page's key figure: the visitors from
// stats-admin with the in-app sales of the last 7 days, the month's revenue in euros (ads and in-app purchases, the
// same count as /admin/revenus/), what waits on the studio board, and the house ads from the catalogue online.
import { useEffect, useState, type ReactNode } from 'react';
import { accountLabel, signOut } from '../../lib/meetupAuth';
import GoogleSignIn from './GoogleSignIn';
import { STATS_LOCAL, StatsError, appStore, board, overview, playOrders, purchases, rates, revenue, statsMessage, totals } from '../../lib/statsAdmin';
import { homeIncome, revenueTile, weekLine, type HomeMoney } from '../../lib/homeRevenue';
import type { Catalog } from '../../../supabase/functions/_shared/promoRules.mjs';
import { useAdminSession } from './useAdminSession';
import { AppName } from './AdminParts';

const int = new Intl.NumberFormat('fr-FR');
// The studio's apps in the order of their colours.
const APPS = ['Pétanque Game', "Dragon's Gems", 'Pétanque Meet', 'Nino Rush', 'Pétanque Scan'];

interface Tile { href: string; title: string; text: string; figure?: ReactNode; sub?: string; extra?: string }
/** Why the purchases did not come: the stats not set up, the function not redeployed, or no answer. */
export function whyMissing(e: unknown): string {
	if (e instanceof StatsError && e.status === 503) return 'statistiques non branchées';
	if (e instanceof StatsError && e.status === 400) return 'attend le redéploiement';
	return "n'ont pas répondu";
}

export default function AdminHome() {
	const { session, ready, error } = useAdminSession(STATS_LOCAL);
	const [stats, setStats] = useState<ReturnType<typeof totals> | null>(null);
	const [statsError, setStatsError] = useState<string | null>(null);
	const [ads, setAds] = useState<number | null>(null);
	const [waits, setWaits] = useState<number | null>(null);
	const [signInError, setSignInError] = useState<string | null>(null);
	// Every money source at once, so a figure never switches source as the answers come in.
	const [money, setMoney] = useState<(HomeMoney & { why: string }) | null>(null);
	const signedIn = STATS_LOCAL || !!session;

	useEffect(() => {
		if (!signedIn) return;
		overview().then((o) => setStats(totals(o))).catch((e) => setStatsError(statsMessage(e)));
		void Promise.allSettled([revenue(), playOrders(), appStore(), purchases(), rates()]).then(([ad, o, a, p, r]) => {
			const ok = <T,>(x: PromiseSettledResult<T>): T | null => (x.status === 'fulfilled' ? x.value : null);
			setMoney({ money: ok(ad), orders: ok(o), apple: ok(a), seen: ok(p), rates: ok(r), now: new Date(), why: p.status === 'rejected' ? whyMissing(p.reason) : '' });
		});
		board().then((b) => setWaits(b.apps.reduce((n, a) => n + a.waits.length, 0))).catch(() => setWaits(null));
		fetch('/promo/v1/catalog.json', { cache: 'no-cache' })
			.then((r) => (r.ok ? r.json() : null))
			.then((c: Catalog | null) => setAds(c ? c.entries.filter((e) => (e.weight ?? 1) > 0).length : null))
			.catch(() => setAds(null));
	}, [signedIn]);

	const counted = money ? homeIncome(money) : null;
	const month = counted ? revenueTile(counted) : {};
	const tiles: Tile[] = [
		{
			href: '/admin/stats/', title: 'Statistiques', text: 'Visiteurs, achats, connexions et pubs maison, appli par appli.',
			figure: stats ? int.format(stats.visitors7) : undefined, sub: stats ? `visiteurs sur 7 jours · ${stats.apps} applis` : statsError ?? undefined,
			extra: counted && money ? weekLine(counted, money.why) : undefined,
		},
		{
			href: '/admin/revenus/', title: 'Revenus', text: 'La publicité et les achats intégrés, en euros.',
			figure: month.figure, sub: month.sub,
		},
		{
			href: '/admin/versions/', title: 'Versions', text: 'Chaque appli sur les stores, chez les testeurs et sur main.',
			figure: waits === null ? undefined : <span className={waits ? 'ak-warn-text' : undefined}>{waits}</span>,
			sub: waits === null ? undefined : waits ? `chose${waits > 1 ? 's' : ''} t'attend${waits > 1 ? 'ent' : ''}` : "rien ne t'attend",
		},
		{
			href: '/admin/pubs/', title: 'Pubs maison', text: 'Le catalogue des applis et leurs poids.',
			figure: ads === null ? undefined : ads, sub: ads === null ? undefined : `pub${ads > 1 ? 's' : ''} active${ads > 1 ? 's' : ''}`,
		},
	];

	return (
		<div className="as-root">
			<div className="pa-bar">
				{!ready ? <span className="pa-note">Chargement…</span> : signedIn ? (
					<>
						<span className="pa-note">{STATS_LOCAL ? 'Essai local' : session ? `Connecté : ${accountLabel(session)}` : ''}</span>
						{!STATS_LOCAL && <button type="button" className="pa-btn" onClick={() => void signOut()}>Se déconnecter</button>}
					</>
				) : (
					<>
						<span className="pa-note">Connecte-toi pour voir les chiffres.</span>
						<GoogleSignIn onError={setSignInError} />
					</>
				)}
			</div>
			{(error || signInError) && <p className="pa-card as-error">{error ?? signInError}</p>}
			<ul className="ah-tiles">
				{tiles.map((t) => (
					<li key={t.title}>
						<a className="ak-tile ah-tile" href={t.href}>
							<span>{t.title}</span>
							{t.figure !== undefined ? <strong>{t.figure}</strong> : <em>{t.text}</em>}
							{t.sub && <small>{t.sub}</small>}
							{t.extra && <small>{t.extra}</small>}
						</a>
					</li>
				))}
			</ul>
			<p className="ak-legend ah-apps" aria-label="La couleur de chaque appli, la même sur toutes les pages">
				{APPS.map((a) => <AppName key={a} name={a} />)}
			</p>
		</div>
	);
}
