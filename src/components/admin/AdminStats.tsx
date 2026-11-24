// /admin/stats/: each app's figures from Umami through stats-admin, with each house ad's weights from the
// catalogue online next to its shows and taps, Google Play's orders (sales reports) and the purchases the apps saw.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import GoogleSignIn from './GoogleSignIn';
import { COUNTED_KINDS, KINDS, PRODUCTS, STATS_LOCAL, STORES, StatsError, overview, playOrders, purchases, statsMessage, type AppStats, type Count, type Overview, type PlayOrders, type Purchases } from '../../lib/statsAdmin';
import { appColor } from '../../lib/appColors';
import { baseAppId, shares } from '../../lib/promoShares';
import type { Catalog } from '../../../supabase/functions/_shared/promoRules.mjs';
import { useAdminSession } from './useAdminSession';
import { AppName, Bars, DayStack, Help, Meter, Pill, Tile, type DaySeries, type Tone } from './AdminParts';

const int = new Intl.NumberFormat('fr-FR');
const pct = (x: number | null | undefined): string => (x == null ? '–' : `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
const when = (iso: string): string => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const short = (iso: string): string => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const SHOWN_MAX = 50;
const SHOWN_FIRST = 6;
const RESULT_NAMES: Record<string, string> = { ok: 'réussis', success: 'réussis', fail: 'échoués', failed: 'échoués', error: 'échoués', cancel: 'annulés', cancelled: 'annulés', canceled: 'annulés' };
const RESULT_TONE: Record<string, Tone> = { réussis: 'ok', annulés: 'warn', échoués: 'bad' };
const ORDER_STATUS: Record<string, [string, Tone]> = {
	charged: ['payée', 'ok'], refund: ['remboursée', 'warn'], refunded: ['remboursée', 'warn'], 'partial refund': ['remboursée en partie', 'warn'], cancelled: ['annulée', 'bad'], canceled: ['annulée', 'bad'],
};
const productName = (item: string) => (Object.hasOwn(PRODUCTS, item) ? PRODUCTS[item].name : item);

function priceIn(currency: string, n: number): string {
	try {
		return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(n);
	} catch {
		return `${n.toLocaleString('fr-FR')} ${currency}`;
	}
}
const euros = (n: number) => priceIn('EUR', n);

function merge(rows: Count[] | null, names?: Record<string, string>): [string, number][] {
	// Apps word the same outcome differently ("fail", "failed"): one line per shown name.
	const merged = new Map<string, number>();
	for (const r of rows ?? []) {
		const name = names?.[r.key] ?? r.key;
		merged.set(name, (merged.get(name) ?? 0) + r.count);
	}
	return [...merged].sort((a, b) => b[1] - a[1]);
}

function Outcomes({ rows }: { rows: Count[] | null }) {
	const merged = merge(rows, RESULT_NAMES);
	if (!merged.length) return null;
	return <p className="ak-pills">{merged.map(([name, n]) => <Pill key={name} tone={RESULT_TONE[name] ?? 'plain'}>{`${int.format(n)} ${name}`}</Pill>)}</p>;
}

/** A table showing its first rows, the rest one tap away. */
function ShortTable({ head, rows, more }: { head: string[]; rows: { key: string; muted?: boolean; cells: ReactNode[] }[]; more: (n: number) => string }) {
	const [open, setOpen] = useState(false);
	const shown = rows.slice(0, open ? SHOWN_MAX : SHOWN_FIRST);
	return (
		<>
			<div className="as-scroll">
				<table className="ak-table ak-list">
					<thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
					<tbody>
						{shown.map((r) => (
							<tr key={r.key} className={r.muted ? 'as-not-real' : undefined}>
								{r.cells.map((c, i) => (i === 0 ? <th key={i} scope="row">{c}</th> : <td key={i}>{c}</td>))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{rows.length > SHOWN_FIRST && (
				<button type="button" className="ak-more" onClick={() => setOpen(!open)}>
					{open ? 'Moins' : more(Math.min(rows.length, SHOWN_MAX))}
				</button>
			)}
		</>
	);
}


function Unread({ errors }: { errors: string[] }) {
	if (!errors.length) return null;
	return (
		<details className="ak-unread">
			<summary><Pill tone="warn">{errors.length > 1 ? `${errors.length} chiffres non lus` : '1 chiffre non lu'}</Pill></summary>
			<p className="as-muted as-errors">{errors.join(' ; ')}</p>
		</details>
	);
}

function ordersMessage(e: unknown): string {
	if (e instanceof StatsError && e.status === 400) return "stats-admin n'a pas encore l'action « orders » : elle attend son redéploiement.";
	if (e instanceof StatsError && e.status === 503 && e.message === 'orders not configured')
		return "Le rapport de ventes Google Play n'est pas encore branché (secrets PLAY_REPORTS_KEY et PLAY_REPORTS_BUCKET de stats-admin).";
	if (e instanceof StatsError && e.status === 502)
		return "Google n'a pas donné le rapport de ventes (clé du compte de service, droit « Voir les données financières » dans la Play Console, ou nom du bucket).";
	return statsMessage(e);
}

function purchasesMessage(e: unknown): string {
	if (e instanceof StatsError && e.status === 400) return "stats-admin n'a pas encore l'action « purchases » : elle attend son redéploiement.";
	return statsMessage(e);
}

const paid = (status: string) => /^charged/.test(status);

/** The last 30 days, oldest first, as YYYY-MM-DD. */
function lastDays(endIso: string, n = 30): string[] {
	const end = new Date(endIso);
	return Array.from({ length: n }, (_, i) => new Date(end.getTime() - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** The figures that matter first, over every app. */
function KeyFigures({ data, orders, bought }: { data: Overview | null; orders: PlayOrders | null; bought: Purchases | null }) {
	const eur = orders?.totals.find((t) => t.currency === 'EUR');
	const others = orders?.totals.filter((t) => t.currency !== 'EUR') ?? [];
	let d1 = 0, d28 = 0, shows = 0, taps = 0;
	for (const a of data?.apps ?? []) {
		d1 += a.periods.d1?.visitors ?? 0;
		d28 += a.periods.d28?.visitors ?? 0;
		for (const r of a.ads ?? []) {
			shows += r.show;
			taps += r.tap;
		}
	}
	return (
		<div className="ak-tiles">
			<Tile label="Ventes Google Play · 30 j" value={orders ? euros(eur?.charged ?? 0) : '–'}
				sub={orders && `${int.format(orders.totals.reduce((s, t) => s + t.orders, 0))} commandes${others.length ? ` · + ${others.map((t) => priceIn(t.currency, t.charged)).join(', ')}` : ''}`} />
			<Tile label="Achats réels · 30 j" value={bought ? int.format(bought.counted ?? 0) : '–'} sub={bought && `${int.format(bought.buyers ?? 0)} acheteurs`} />
			<Tile label="Visiteurs · 28 j" value={data ? int.format(d28) : '–'} sub={data && `${int.format(d1)} sur le dernier jour`} />
			<Tile label="Pubs maison · 28 j" value={data ? pct(shows ? taps / shows : null) : '–'} sub={data && `de taps sur ${int.format(shows)} affichages`} />
		</div>
	);
}

/** Every app side by side: its visitors, and what it sold on Google Play. */
function ByApp({ data, orders }: { data: Overview; orders: PlayOrders | null }) {
	const sold = new Map<string, number>();
	for (const o of orders?.orders ?? []) if (paid(o.status) && o.currency === 'EUR') sold.set(o.app, (sold.get(o.app) ?? 0) + o.charged);
	return (
		<section className="pa-card ak-pair">
			<div>
				<h2>Visiteurs par appli <small>28 j</small></h2>
				<Bars format={(n) => int.format(n)} rows={data.apps.map((a) => ({ key: a.id, label: a.name, value: a.periods.d28?.visitors ?? 0, color: appColor(a.name, a.domain) }))} />
			</div>
			<div>
				<h2>Ventes Play par appli <small>30 j, en euros</small></h2>
				<Bars format={euros} empty={orders ? 'aucune vente' : 'rapport pas encore lu'} rows={[...sold].map(([app, v]) => ({ key: app, label: app, value: Math.round(v * 100) / 100, color: appColor(app) }))} />
			</div>
		</section>
	);
}

/** Google Play's own orders: the real price, its currency and the buyer's country; nothing else about the buyer. */
function PlayOrdersCard({ data, message }: { data: PlayOrders | null; message: string | null }) {
	const charged = data?.orders.filter((o) => paid(o.status)) ?? [];
	const apps = [...new Set(charged.map((o) => o.app))];
	const series: DaySeries[] = apps.map((app) => {
		const byDay = new Map<string, number>();
		for (const o of charged) if (o.app === app) byDay.set(o.at.slice(0, 10), (byDay.get(o.at.slice(0, 10)) ?? 0) + 1);
		return { key: app, label: app, color: appColor(app), byDay };
	});
	return (
		<section className="pa-card ak-card">
			<header>
				<h2>Commandes Google Play <small>30 j</small></h2>
				{data && <Unread errors={data.errors} />}
			</header>
			{message && <p className="as-error">{message}</p>}
			{data && charged.length > 0 && <DayStack days={lastDays(data.generatedAt)} series={series} unit={(n) => `${int.format(n)} commande${n > 1 ? 's' : ''}`} />}
			{data && data.orders.length === 0 && <p className="as-muted">Aucune commande sur 30 jours.</p>}
			{data && data.orders.length > 0 && (
				<ShortTable
					head={['Date', 'Appli', 'Produit', 'Statut', 'Pays', 'Payé']}
					more={(n) => `Voir les ${int.format(n)} commandes`}
					rows={data.orders.map((o, i) => {
						const [label, tone] = ORDER_STATUS[o.status] ?? [o.status || '–', 'plain' as Tone];
						return {
							key: `${o.at}-${i}`,
							muted: !paid(o.status),
							cells: [short(o.at), <AppName name={o.app} />, productName(o.product) || '–', <Pill tone={tone}>{label}</Pill>, o.country || '–', o.currency ? priceIn(o.currency, o.charged) : '–'],
						};
					})}
				/>
			)}
			<Help>
				Le rapport de ventes de la Play Console, mis à jour une fois par jour : les vraies commandes, sans celles des testeurs, au prix payé taxes comprises dans la monnaie de l'acheteur.
				Rien sur l'acheteur que son pays. L'App Store n'y est pas. Le graphique compte les commandes payées par jour.
			</Help>
		</section>
	);
}

/** Purchases only: the time, the app, the product, the store. Never a session, an account or an event id.
 *  Real ones by default; testers', promo codes and simulated (dev and beta builds) on request. */
function RecentPurchases({ data, message }: { data: Purchases | null; message: string | null }) {
	const [all, setAll] = useState(false);
	const listed = data?.purchases.filter((p) => all || COUNTED_KINDS.includes(p.kind)) ?? [];
	const others = (data?.purchases.length ?? 0) - (data?.counted ?? 0);
	return (
		<section className="pa-card ak-card">
			<header>
				<h2>Derniers achats <small>30 j, vus par les applis</small></h2>
				{data && <Unread errors={data.errors} />}
			</header>
			{message && <p className="as-error">{message}</p>}
			{data && others > 0 && (
				<label className="as-check">
					<input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
					{` Voir aussi testeurs, promos et simulés (${int.format(others)})`}
				</label>
			)}
			{data && listed.length === 0 && <p className="as-muted">Aucun achat réel sur ces 30 jours.</p>}
			{listed.length > 0 && (
				<ShortTable
					key={String(all)}
					head={['Date', 'Appli', 'Article', 'Store', 'Type', 'Acheteur', 'Prix']}
					more={(n) => `Voir les ${int.format(n)} achats`}
					rows={listed.map((p, i) => ({
						key: `${p.at}-${i}`,
						muted: !COUNTED_KINDS.includes(p.kind),
						cells: [
							<>{short(p.at)}{p.later && <small className="as-muted" title="Le store l'a rendu plus tard (après une relance, ou un paiement validé ensuite)."> · plus tard</small>}</>,
							<AppName name={p.app} />, productName(p.item), STORES[p.store] ?? (p.store || '–'), KINDS[p.kind] ?? p.kind,
							p.buyer ? `n° ${p.buyer}` : '–', Object.hasOwn(PRODUCTS, p.item) ? PRODUCTS[p.item].price : '–',
						],
					}))}
				/>
			)}
			<Help>
				D'après l'événement iap_result des applis, achats réussis seulement. Réel : payé sur Google Play (reçu lu) ; réel (non vérifié) : l'App Store, dont le reçu ne dit pas s'il s'agit d'un test.
				Testeur : carte de test Play ; simulé : build de dev, ou de bêta (« beta » dans la version) ; ni les uns ni les autres ne sont comptés.
				Le prix est celui du catalogue en France ; un achat remboursé ensuite reste dans la liste.
				Acheteur : même appareil ce mois-ci, approximatif (Umami reconnaît un appareil à son adresse IP et à son modèle, et repart de zéro chaque mois).
			</Help>
		</section>
	);
}

function AppCard({ app, catalog }: { app: AppStats; catalog: Catalog | null }) {
	// The store build's id: its hostname, else the website's domain.
	const id = baseAppId(app.hosts?.find((h) => !h.test)?.host ?? app.domain);
	const title = (ad: string): string => catalog?.entries.find((e) => e.id === ad)?.title.fr ?? ad;
	const share = (ad: string, platform: 'android' | 'ios'): string => {
		if (!catalog || !id) return '–';
		const row = shares(catalog, id, { platform, spot: 'banner' }).rows.find((r) => r.id === ad);
		return row ? (row.state === 'shown' ? pct(row.share) : row.state === 'self' ? 'sa pub' : '0 %') : 'hors catalogue';
	};
	const p = app.periods;
	const color = appColor(app.name, app.domain);
	const items = merge(app.purchases.items);
	const providers = merge(app.signIn.providers, { google: 'Google', apple: 'Apple' });
	const test = app.hosts?.filter((h) => h.test) ?? [];
	return (
		<article className="pa-card ak-appcard" style={{ '--app': color } as CSSProperties}>
			<header>
				<h2><i aria-hidden="true" />{app.name}</h2>
				<Unread errors={app.errors} />
			</header>
			<section>
				<h3>Visiteurs</h3>
				<div className="ak-nums">
					{([['1 jour', p.d1], ['7 jours', p.d7], ['28 jours', p.d28]] as const).map(([label, s]) => (
						<div key={label}>
							<strong>{s ? int.format(s.visitors) : '–'}</strong>
							<span>{label}</span>
							{s && <small>{int.format(s.visits)} sessions</small>}
						</div>
					))}
				</div>
			</section>
			<div className="ak-ret" title="Umami reconnaît un visiteur à son adresse IP et son appareil, renouvelés chaque mois ; les applis n'envoient pas d'identifiant de joueur. Les retours sont donc sous-estimés, surtout sur mobile. La barre va de 0 à 50 %.">
				<h3>Rétention <small>indicative</small></h3>
				<Meter label="J1" rate={app.retention?.d1?.rate} text={pct(app.retention?.d1?.rate)} />
				<Meter label="J7" rate={app.retention?.d7?.rate} text={pct(app.retention?.d7?.rate)} />
			</div>
			<div className="ak-split">
				<section>
					<h3>Achats <small>28 j, toutes issues</small></h3>
					{app.purchases.items === null ? <p className="as-muted">indisponible</p> : (
						<Bars format={(n) => int.format(n)} empty="aucun" rows={items.map(([key, n]) => ({ key, label: productName(key), value: n, color }))} />
					)}
					<Outcomes rows={app.purchases.results} />
				</section>
				<section>
					<h3>Connexions <small>28 j</small></h3>
					{app.signIn.providers === null ? <p className="as-muted">indisponible</p> : (
						<Bars format={(n) => int.format(n)} empty="aucune" rows={providers.map(([key, n]) => ({ key, label: key, value: n, color }))} />
					)}
					<Outcomes rows={app.signIn.results} />
				</section>
			</div>
			{app.ads !== null && app.ads.length > 0 && (
				<section>
					<h3>Pubs maison montrées ici <small>28 j</small></h3>
					<div className="as-scroll">
						<table className="ak-table ak-num">
							<thead><tr><th scope="col">Pub</th><th scope="col">Affichages</th><th scope="col" className="ak-wide">Taps</th><th scope="col">Taux</th><th scope="col" className="ak-wide" title="Part des tirages en bannière aujourd'hui, d'après le catalogue en ligne">Part Android</th><th scope="col" className="ak-wide" title="Part des tirages en bannière aujourd'hui, d'après le catalogue en ligne">Part iOS</th></tr></thead>
							<tbody>
								{app.ads.map((r) => (
									<tr key={r.ad}>
										<th scope="row"><AppName name={title(r.ad)} /></th>
										<td>{int.format(r.show)}</td>
										<td className="ak-wide">{int.format(r.tap)}</td>
										<td><strong>{pct(r.rate)}</strong></td>
										<td className="ak-wide">{share(r.ad, 'android')}</td>
										<td className="ak-wide">{share(r.ad, 'ios')}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			)}
			{app.ads === null && <p className="as-muted">Pubs maison : indisponible</p>}
			<small className="ak-foot">
				{app.domain}{test.length > 0 && ` · builds de test : ${test.map((h) => int.format(h.visitors)).join(', ')} visiteurs`}
			</small>
		</article>
	);
}

export default function AdminStats() {
	const { session, ready, error } = useAdminSession(STATS_LOCAL);
	const [data, setData] = useState<Overview | null>(null);
	const [catalog, setCatalog] = useState<Catalog | null>(null);
	const [bought, setBought] = useState<Purchases | null>(null);
	const [boughtMessage, setBoughtMessage] = useState<string | null>(null);
	const [orders, setOrders] = useState<PlayOrders | null>(null);
	const [ordersError, setOrdersError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const signedIn = STATS_LOCAL || !!session;

	async function load(refresh = false) {
		setBusy(true);
		setMessage(null);
		setBoughtMessage(null);
		setOrdersError(null);
		const recent = purchases(refresh).then(setBought).catch((e) => setBoughtMessage(purchasesMessage(e)));
		const sold = playOrders(refresh).then(setOrders).catch((e) => setOrdersError(ordersMessage(e)));
		try {
			setData(await overview(refresh));
		} catch (e) {
			setMessage(statsMessage(e));
		} finally {
			await Promise.all([recent, sold]);
			setBusy(false);
		}
	}

	useEffect(() => {
		if (!signedIn) return;
		void load();
		fetch('/promo/v1/catalog.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then(setCatalog).catch(() => setCatalog(null));
	}, [signedIn]);

	if (!ready) return <p className="as-muted">Chargement…</p>;
	if (!signedIn)
		return (
			<div className="pa-card as-signin">
				<p>Le tableau de bord est réservé à l'administration du studio.</p>
				<GoogleSignIn onError={setMessage} />
				{(message || error) && <p className="as-error">{message ?? error}</p>}
			</div>
		);

	return (
		<div className="as-root">
			<div className="pa-bar">
				<span className="as-muted">
					{data ? `Chiffres du ${when(data.generatedAt)}${data.cached ? ' (gardés 10 min)' : ''}` : busy ? 'Lecture d\'Umami…' : ''}
				</span>
				<button type="button" className="pa-btn" disabled={busy} onClick={() => void load(true)}>Actualiser</button>
			</div>
			{message && <p className="pa-card as-error">{message}</p>}
			<KeyFigures data={data} orders={orders} bought={bought} />
			{data && <ByApp data={data} orders={orders} />}
			{(orders || ordersError) && <PlayOrdersCard data={orders} message={ordersError} />}
			{(bought || boughtMessage) && <RecentPurchases data={bought} message={boughtMessage} />}
			<div className="ak-apps">
				{data?.apps.map((a) => <AppCard key={a.id} app={a} catalog={catalog} />)}
			</div>
		</div>
	);
}
