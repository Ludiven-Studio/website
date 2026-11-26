// /admin/revenus/: the studio's income in euros first (ads, Google Play and App Store in-app sales, net and paid),
// then the ad revenue per app from the LevelPlay Reporting API (every mediated network), through stats-admin: this
// month, the last 30 days and each of those days, with Unity Ads' own share.
import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import GoogleSignIn from './GoogleSignIn';
import { appColor } from '../../lib/appColors';
import { networkLabel, unityShare } from '../../lib/adNetworks';
import {
	STATS_LOCAL, StatsError, appStore, playOrders, purchases, rates, revenue, statsMessage,
	type AppStoreSales, type PlayOrders, type Purchases, type Rates, type Revenue, type RevenueApp, type RevenueDay, type RevenueNetwork,
} from '../../lib/statsAdmin';
import { PLAY_CUT, SOURCES, income, periodLine, since, type Source } from '../../lib/income';
import { useAdminSession } from './useAdminSession';
import { AppName, Bars, DayStack, Help, Pill, Tile, appStyle } from './AdminParts';

const PLATFORMS: Record<string, string> = { android: 'Android', ios: 'iOS' };
const int = new Intl.NumberFormat('fr-FR');
const at = (d: string) => new Date(`${d}T12:00:00Z`);
const dayLabel = (d: string): string => at(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const firstLabel = (d: string): string => (d.endsWith('-01') ? `1er ${at(d).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' })}` : dayLabel(d));
const when = (iso: string): string => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
/** « Depuis le 1er novembre ». */
const Since = (monthStart: string): string => since(monthStart).replace(/^d/, 'D');

/** « 1–23 nov. », or « 25 oct.–23 nov. » across two months. */
function range(from: string, to: string): string {
	return from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8))}–${dayLabel(to)}` : `${dayLabel(from)}–${dayLabel(to)}`;
}

function money(currency: string) {
	const f = new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 });
	return (n: number) => f.format(n);
}

function revenueMessage(e: unknown): string {
	if (e instanceof StatsError && e.status === 400) return "stats-admin n'a pas encore l'action « revenue » : elle attend son redéploiement.";
	if (e instanceof StatsError && e.status === 503 && e.message === 'revenue not configured')
		return 'Les clés LevelPlay ne sont pas encore enregistrées (secrets LEVELPLAY_SECRET_KEY et LEVELPLAY_REFRESH_TOKEN de stats-admin).';
	if (e instanceof StatsError && e.status === 502) return "LevelPlay n'a pas répondu ou a refusé les clés (Secret Key et Refresh Token de My Account).";
	return statsMessage(e);
}

/** « dont Unity Ads x », the figure Unity's own dashboard shows; nothing for a report cached before the split. */
function unityPart(networks: RevenueNetwork[] | undefined, period: 'month' | 'last30', fmt: (n: number) => string): string | undefined {
	const share = unityShare(networks, period);
	return share === null ? undefined : `dont Unity Ads ${fmt(share)}`;
}

const byDay = (days: RevenueDay[]) => new Map(days.map((d) => [d.date, d.revenue]));

const SOURCE_NAMES: Record<Source, string> = { ads: 'Publicité', play: 'Google Play', appstore: 'App Store' };
const SOURCE_COLORS: Record<Source, string> = { ads: 'var(--src-ads)', play: 'var(--src-play)', appstore: 'var(--src-appstore)' };
const eur = money('EUR');

/** What a source loaded, or why not. */
type Loaded<T> = { data: T | null; problem: string | null };

function sourceProblem(e: unknown, notSet: string): string {
	if (e instanceof StatsError && e.status === 503) return notSet;
	if (e instanceof StatsError && e.status === 400) return 'attend le redéploiement de stats-admin';
	if (e instanceof StatsError && e.status === 502) return "n'a pas répondu";
	return statsMessage(e);
}

/** The studio's income in euros: each source this month and over 30 days, a bar per day, then per app. */
function Income({ ads, orders, apple, seen, fx }: { ads: Revenue | null; orders: Loaded<PlayOrders>; apple: Loaded<AppStoreSales>; seen: Purchases | null; fx: Loaded<Rates> }) {
	const r = income({ revenue: ads, orders: orders.data, apple: apple.data, seen, rates: fx.data, now: new Date() });
	const total = (period: 'month' | 'last30') => SOURCES.reduce((n, s) => n + r[period][s].net, 0);
	const month = periodLine(r, 'month'), last30 = periodLine(r, 'last30');
	// A store without its report counts the purchases its apps saw: said, not a fault. Nothing at all is one.
	const status = (s: Source): ReactNode => {
		if (s === 'ads') return ads ? null : <Pill tone="warn">pas lu</Pill>;
		const from = r.inAppFrom[s], problem = s === 'play' ? orders.problem : apple.problem;
		if (from === 'apps') return <Pill tone="plain" title={problem ? `Relevé du store : ${problem}` : undefined}>achats vus par les applis, pas le relevé</Pill>;
		return from ? null : <Pill tone="warn">{problem ?? 'pas lu'}</Pill>;
	};
	const paid30 = (s: Source): string => (s === 'ads' ? (r.adsPaid ? money(r.adsPaid.currency)(r.adsPaid.last30) : '–') : eur(r.last30[s].gross));
	const first = r.days[0];
	const last = r.days[r.days.length - 1];
	return (
		<section className="ak-income">
			<header className="ak-section"><h2>Tout compris <small>en euros, net</small></h2></header>
			<div className="ak-tiles">
				<Tile label={`${Since(r.monthStart)} · ${range(r.monthStart, last)}`} value={eur(month.total)} sub={<>{month.sum}{month.paid.map((l) => <Fragment key={l}><br />{l}</Fragment>)}</>} />
				<Tile label={`30 derniers jours · ${range(first, last)}`} value={eur(last30.total)} sub={<>{last30.sum}{last30.paid.map((l) => <Fragment key={l}><br />{l}</Fragment>)}</>} />
				<Tile label={`Publicité · ${since(r.monthStart)}`} value={eur(r.month.ads.net)} sub="LevelPlay, toutes régies" />
				<Tile label={`Achats intégrés · ${since(r.monthStart)}`} value={eur(r.month.play.net + r.month.appstore.net)} sub={`Google Play ${eur(r.month.play.net)} · App Store ${eur(r.month.appstore.net)}`} />
			</div>
			{month.net && <p className="ak-note">{month.net.replace(/^n/, 'N')}.</p>}
			<div className="pa-card ak-card">
				<div className="as-scroll">
					<table className="ak-table ak-num ak-sources">
						<thead><tr><th scope="col">Source</th><th scope="col">{Since(r.monthStart)}</th><th scope="col">30 derniers jours</th><th scope="col" className="ak-wide">Payé, 30 derniers jours</th></tr></thead>
						<tbody>
							{SOURCES.map((s) => (
								<tr key={s}>
									<th scope="row"><span className="ak-app" style={{ '--app': SOURCE_COLORS[s] } as CSSProperties}><i aria-hidden="true" />{SOURCE_NAMES[s]}</span>{status(s)}</th>
									<td>{eur(r.month[s].net)}</td>
									<td>{eur(r.last30[s].net)}</td>
									<td className="ak-wide">{paid30(s)}</td>
								</tr>
							))}
							<tr className="ak-total">
								<th scope="row">Total</th><td>{eur(total('month'))}</td><td>{eur(total('last30'))}</td><td className="ak-wide" />
							</tr>
						</tbody>
					</table>
				</div>
				<DayStack days={r.days} unit={eur} partial series={SOURCES.map((s) => ({ key: s, label: SOURCE_NAMES[s], color: SOURCE_COLORS[s], byDay: r.byDay[s] }))} />
				{r.apps.length > 0 && (
					<div className="as-scroll">
						<table className="ak-table ak-num">
							<thead><tr><th scope="col">Par appli · 30 derniers jours</th><th scope="col" className="ak-wide">Publicité</th><th scope="col" className="ak-wide">Google Play</th><th scope="col" className="ak-wide">App Store</th><th scope="col">Total</th></tr></thead>
							<tbody>
								{r.apps.map((a) => (
									<tr key={a.key}>
										<th scope="row"><AppName name={a.name} /></th>
										<td className="ak-wide">{a.ads ? eur(a.ads) : '–'}</td>
										<td className="ak-wide">{a.play ? eur(a.play) : '–'}</td>
										<td className="ak-wide">{a.appstore ? eur(a.appstore) : '–'}</td>
										<td>{eur(a.total)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
				<Help>
					<p>
						Net : ce qui revient au studio. Publicité : ce que LevelPlay nous verse, entre entreprises, sans TVA ; « payé » la
						donne en dollars, avant conversion. App Store : les « Developer Proceeds » d'Apple, après sa part et la TVA. Google Play :
						une estimation, le prix hors taxes moins les {Math.round(PLAY_CUT * 100)} % de Google. Payé : ce que les acheteurs ont
						payé. Sans le relevé d'un store, ses achats sont ceux que les applis ont vus, pas ceux du relevé de Google ou
						d'Apple (réels seulement, au prix du catalogue en France ; net = payé − TVA (20 %) − commission du store (15 %),
						une estimation : la TVA dépend du pays de l'acheteur) ; c'est le même compte que l'accueil de l'admin.
					</p>
					<p>
						{fx.data
							? `Converti au taux BCE du ${dayLabel(fx.data.date)} : 1 € = ${(fx.data.perEur.USD ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 4 })} $US.`
							: `Taux BCE ${fx.problem ?? 'pas lu'} : seuls les montants en euros comptent.`}
						{r.unconverted.length > 0 && ` Sans taux, donc laissés de côté : ${r.unconverted.join(', ')}.`}
						{' '}L'App Store compte en jours du Pacifique et s'arrête à hier ; les autres en jours UTC, jusqu'à aujourd'hui.
					</p>
				</Help>
			</div>
		</section>
	);
}

function AppCard({ app, fmt, monthStart }: { app: RevenueApp; fmt: (n: number) => string; monthStart: string }) {
	return (
		<article className="pa-card ak-appcard" style={appStyle(app.name)}>
			<header>
				<h2><i aria-hidden="true" />{app.name}</h2>
				{app.platforms.length > 1 && (
					<small>{app.platforms.map((p) => `${PLATFORMS[p.platform] ?? p.platform} ${fmt(p.month)}`).join(' · ')} {since(monthStart)}</small>
				)}
			</header>
			<div className="ak-nums">
				<div><span>{Since(monthStart)}</span><strong>{fmt(app.month)}</strong><small>{unityPart(app.networks, 'month', fmt)}</small></div>
				<div><span>30 derniers jours</span><strong>{fmt(app.last30)}</strong><small>{unityPart(app.networks, 'last30', fmt)}</small></div>
				<div><span>Affichages</span><strong>{int.format(app.impressions30)}</strong><small>sur les 30 derniers jours</small></div>
			</div>
			<DayStack days={app.days.map((d) => d.date)} series={[{ key: app.name, label: app.name, color: appColor(app.name), byDay: byDay(app.days) }]} unit={fmt} partial />
		</article>
	);
}

function Studio({ data, fmt }: { data: Revenue; fmt: (n: number) => string }) {
	const { total, apps } = data;
	const days = total.days.map((d) => d.date);
	const yesterday = total.days[total.days.length - 2];
	const week = total.days.slice(-8, -1);
	const shows = apps.reduce((n, a) => n + a.impressions30, 0);
	// The report starts on the month's first day when nothing came in before it: both totals are then the same.
	const before = total.days.filter((d) => d.date < data.monthStart);
	const nothingBefore = before.length > 0 && before.every((d) => d.revenue === 0) && total.last30 > 0;
	return (
		<>
			<div className="ak-tiles">
				<Tile label={`${Since(data.monthStart)} · ${range(data.monthStart, data.to)}`} value={fmt(total.month)} sub={unityPart(total.networks, 'month', fmt)} />
				<Tile label={`30 derniers jours · ${range(data.from, data.to)}`} value={fmt(total.last30)} sub={unityPart(total.networks, 'last30', fmt)} />
				{yesterday && <Tile label={`Hier · ${dayLabel(yesterday.date)}`} value={fmt(yesterday.revenue)} sub={`${fmt(week.reduce((s, d) => s + d.revenue, 0) / Math.max(1, week.length))} par jour sur 7 jours`} />}
				<Tile label="Affichages · 30 derniers jours" value={int.format(shows)} sub={`${apps.length} ${apps.length > 1 ? 'applis' : 'appli'}`} />
			</div>
			{nothingBefore && (
				<p className="ak-note">
					LevelPlay ne compte aucun revenu avant le {firstLabel(data.monthStart)} : les chiffres {since(data.monthStart)} et des 30 derniers jours sont donc égaux, et ce
					que Unity compte en octobre a été gagné hors LevelPlay.
				</p>
			)}
			<section className="pa-card ak-card">
				<header><h2>Par jour <small>en dollars US, jours UTC</small></h2></header>
				<DayStack days={days} unit={fmt} partial
					series={apps.map((a) => ({ key: a.name, label: a.name, color: appColor(a.name), byDay: byDay(a.days) }))} />
				{apps.length > 0 && (
					<Help label="Jour par jour">
						<div className="as-scroll">
							<table className="ak-table ak-num">
								<thead><tr><th scope="col">Jour</th>{apps.map((a) => <th scope="col" key={a.name}><AppName name={a.name} /></th>)}<th scope="col">Total</th></tr></thead>
								<tbody>
									{[...total.days].reverse().map((d) => (
										<tr key={d.date}>
											<th scope="row">{dayLabel(d.date)}</th>
											{apps.map((a) => <td key={a.name}>{fmt(a.days.find((x) => x.date === d.date)?.revenue ?? 0)}</td>)}
											<td>{fmt(d.revenue)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Help>
				)}
			</section>
			<div className="pa-card ak-pair">
				<section>
					<h2>Par appli <small>30 derniers jours</small></h2>
					<Bars format={fmt} empty="aucun revenu" rows={apps.map((a) => ({ key: a.name, label: a.name, value: a.last30, color: appColor(a.name) }))} />
				</section>
				<section className="ak-netbars">
					<h2>Par régie <small>30 derniers jours, noms de LevelPlay</small></h2>
					{total.networks ? (
						<Bars format={fmt} empty="aucun revenu" rows={total.networks.map((n) => ({ key: n.network, label: networkLabel(n), value: n.last30, color: 'var(--sc-muted)' }))} />
					) : <p className="as-muted">Relevé d'avant le détail par régie : « Actualiser » le relit.</p>}
				</section>
			</div>
			<Help>
				<p>
					Les revenus publicitaires gagnés selon LevelPlay, toutes régies comprises (ironSource Ads, Unity Ads…), en dollars
					US, par jour UTC ; le dernier jour, plus clair, est en cours. « Dont Unity Ads » est le chiffre à comparer au tableau
					de bord Unity, qui ne compte que sa régie.
				</p>
				<p>Le solde disponible au versement (« available balance » de Unity) n'est dans aucune API : il reste à lire dans le tableau de bord.</p>
				{!!data.fields?.length && <p>Champs reçus de LevelPlay : {data.fields.join(', ')}.</p>}
			</Help>
		</>
	);
}

export default function AdminRevenue() {
	const { session, ready, error } = useAdminSession(STATS_LOCAL);
	const [data, setData] = useState<Revenue | null>(null);
	const [orders, setOrders] = useState<Loaded<PlayOrders>>({ data: null, problem: null });
	const [apple, setApple] = useState<Loaded<AppStoreSales>>({ data: null, problem: null });
	const [fx, setFx] = useState<Loaded<Rates>>({ data: null, problem: null });
	const [seen, setSeen] = useState<Purchases | null>(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const signedIn = STATS_LOCAL || !!session;

	async function load(refresh = false) {
		setBusy(true);
		setMessage(null);
		const settle = <T,>(p: Promise<T>, set: (l: Loaded<T>) => void, notSet: string) =>
			p.then((d) => set({ data: d, problem: null })).catch((e: unknown) => set({ data: null, problem: sourceProblem(e, notSet) }));
		await Promise.all([
			revenue(refresh).then(setData).catch((e: unknown) => setMessage(revenueMessage(e))),
			settle(playOrders(refresh), setOrders, 'clé Google Play non posée'),
			settle(appStore(refresh), setApple, 'clé App Store non posée'),
			settle(rates(), setFx, 'pas lu'),
			purchases(refresh).then(setSeen).catch(() => setSeen(null)),
		]);
		setBusy(false);
	}

	useEffect(() => {
		if (signedIn) void load();
	}, [signedIn]);

	if (!ready) return <p className="as-muted">Chargement…</p>;
	if (!signedIn)
		return (
			<div className="pa-card as-signin">
				<p>Les revenus sont réservés à l'administration du studio.</p>
				<GoogleSignIn onError={setMessage} />
				{(message || error) && <p className="as-error">{message ?? error}</p>}
			</div>
		);

	const fmt = money(data?.currency ?? 'USD');
	return (
		<div className="as-root">
			<div className="pa-bar">
				<span className="as-muted">
					{data ? `Relevé le ${when(data.generatedAt)}${data.cached ? ' (gardé une heure)' : ''}` : busy ? 'Lecture de LevelPlay…' : ''}
				</span>
				<button type="button" className="pa-btn" disabled={busy} onClick={() => void load(true)}>Actualiser</button>
			</div>
			{message && <p className="pa-card as-error">{message}</p>}
			{!busy && (data || orders.data || apple.data || seen) && <Income ads={data} orders={orders} apple={apple} seen={seen} fx={fx} />}
			{data && <header className="ak-section"><h2>Publicité <small>LevelPlay, en dollars US</small></h2></header>}
			{data && <Studio data={data} fmt={fmt} />}
			{data && !data.apps.length && <p className="pa-card as-muted">LevelPlay ne donne aucun revenu sur ces 30 jours.</p>}
			{data && data.apps.length > 0 && (
				<div className="ak-apps">
					{data.apps.map((a) => <AppCard key={a.name} app={a} fmt={fmt} monthStart={data.monthStart} />)}
				</div>
			)}
		</div>
	);
}
