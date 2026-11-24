// /admin/: one tile per admin page. Once signed in, the tiles show each page's key figure: the visitors from
// stats-admin with the in-app sales of the last 7 days, this month's ad revenue, what waits on the studio board, and
// the house ads from the catalogue online.
import { useEffect, useState, type ReactNode } from 'react';
import { accountLabel, signIn, signOut } from '../../lib/meetupAuth';
import { STATS_LOCAL, StatsError, appStore, board, overview, playOrders, rates, revenue, statsMessage, totals, type AppStoreSales, type PlayOrders, type Rates, type Revenue } from '../../lib/statsAdmin';
import { income } from '../../lib/income';
import type { Catalog } from '../../../supabase/functions/_shared/promoRules.mjs';
import { useAdminSession } from './useAdminSession';
import { AppName } from './AdminParts';
import { unityShare } from '../../lib/adNetworks';

const int = new Intl.NumberFormat('fr-FR');
const usd = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
// The studio's apps in the order of their colours.
const APPS = ['Pétanque Game', "Dragon's Gems", 'Pétanque Meet', 'Nino Rush', 'Pétanque Scan'];

interface Tile { href: string; title: string; text: string; figure?: ReactNode; sub?: string; extra?: string }
/** Each store's report, or why it is missing. */
interface InApp { orders: PlayOrders | null; apple: AppStoreSales | null; rates: Rates | null; playWhy: string; appleWhy: string }

/** Why a store's report did not come: its key not set yet, the function not redeployed, or no answer. */
export function whyMissing(e: unknown): string {
	if (e instanceof StatsError && e.status === 503) return 'clé non posée';
	if (e instanceof StatsError && e.status === 400) return 'attend le redéploiement';
	return "n'a pas répondu";
}

/** In-app sales of the last 7 days in euros, net, from Google Play's orders and Apple's Sales reports. Always a
 *  line: a store that did not answer is named with the reason, so a missing figure never just vanishes. */
export function inAppLine({ orders, apple, rates: r, playWhy, appleWhy }: InApp): string {
	const missing = [!orders && `Google Play ${playWhy}`, !apple && `App Store ${appleWhy}`].filter(Boolean).join(' · ');
	if (!orders && !apple) return `Achats intégrés : ${missing}`;
	const { last7: week, unconverted: left } = income({ revenue: null, orders, apple, rates: r, now: new Date() });
	const net = Math.round((week.play.net + week.appstore.net) * 100) / 100;
	const gross = Math.round((week.play.gross + week.appstore.gross) * 100) / 100;
	return `Achats intégrés · 7 j : ${eur.format(net)} net (${eur.format(gross)} brut)`
		+ (missing ? ` · ${missing}` : '')
		+ (left.length ? ` · sans ${left.join(', ')}` : '');
}

export default function AdminHome() {
	const { session, ready, error } = useAdminSession(STATS_LOCAL);
	const [stats, setStats] = useState<ReturnType<typeof totals> | null>(null);
	const [statsError, setStatsError] = useState<string | null>(null);
	const [ads, setAds] = useState<number | null>(null);
	const [money, setMoney] = useState<Revenue | null>(null);
	const [waits, setWaits] = useState<number | null>(null);
	const [inApp, setInApp] = useState<InApp | null>(null);
	const signedIn = STATS_LOCAL || !!session;

	useEffect(() => {
		if (!signedIn) return;
		overview().then((o) => setStats(totals(o))).catch((e) => setStatsError(statsMessage(e)));
		revenue().then(setMoney).catch(() => setMoney(null));
		void Promise.allSettled([playOrders(), appStore(), rates()]).then(([o, a, r]) => setInApp({
			orders: o.status === 'fulfilled' ? o.value : null,
			apple: a.status === 'fulfilled' ? a.value : null,
			rates: r.status === 'fulfilled' ? r.value : null,
			playWhy: o.status === 'rejected' ? whyMissing(o.reason) : '',
			appleWhy: a.status === 'rejected' ? whyMissing(a.reason) : '',
		}));
		board().then((b) => setWaits(b.apps.reduce((n, a) => n + a.waits.length, 0))).catch(() => setWaits(null));
		fetch('/promo/v1/catalog.json', { cache: 'no-cache' })
			.then((r) => (r.ok ? r.json() : null))
			.then((c: Catalog | null) => setAds(c ? c.entries.filter((e) => (e.weight ?? 1) > 0).length : null))
			.catch(() => setAds(null));
	}, [signedIn]);

	const unity = unityShare(money?.total.networks, 'month');
	const tiles: Tile[] = [
		{
			href: '/admin/stats/', title: 'Statistiques', text: 'Visiteurs, achats, connexions et pubs maison, appli par appli.',
			figure: stats ? int.format(stats.visitors7) : undefined, sub: stats ? `visiteurs sur 7 jours · ${stats.apps} applis` : statsError ?? undefined,
			extra: inApp ? inAppLine(inApp) : undefined,
		},
		{
			href: '/admin/revenus/', title: 'Revenus', text: 'La publicité par appli et par régie (LevelPlay).',
			figure: money ? usd.format(money.total.month) : undefined, sub: money ? `ce mois${unity === null ? '' : ` · dont Unity Ads ${usd.format(unity)}`}` : undefined,
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
						<button type="button" className="pa-btn pa-primary" onClick={() => void signIn('google', window.location.href)}>Se connecter avec Google</button>
					</>
				)}
			</div>
			{error && <p className="pa-card as-error">{error}</p>}
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
