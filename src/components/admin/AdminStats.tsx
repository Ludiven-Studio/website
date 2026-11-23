// /admin/stats/: each app's figures from Umami through stats-admin, with each house ad's weights from the
// catalogue online next to its shows and taps, and the purchases that went through over 30 days.
import { useEffect, useState } from 'react';
import { signIn } from '../../lib/meetupAuth';
import { PRODUCTS, STATS_LOCAL, STORES, StatsError, overview, purchases, statsMessage, type AppStats, type Count, type Overview, type Purchases } from '../../lib/statsAdmin';
import { baseAppId, shares } from '../../lib/promoShares';
import type { Catalog } from '../../../supabase/functions/_shared/promoRules.mjs';
import { useAdminSession } from './useAdminSession';

const int = new Intl.NumberFormat('fr-FR');
const pct = (x: number | null | undefined): string => (x == null ? '–' : `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
const when = (iso: string): string => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const SHOWN_PURCHASES = 50;
const RESULT_NAMES: Record<string, string> = { ok: 'réussis', success: 'réussis', fail: 'échoués', failed: 'échoués', error: 'échoués', cancel: 'annulés', cancelled: 'annulés', canceled: 'annulés' };

function Counts({ rows, names, empty = 'aucun' }: { rows: Count[] | null; names?: Record<string, string>; empty?: string }) {
	if (rows === null) return <span className="as-muted">indisponible</span>;
	if (!rows.length) return <span className="as-muted">{empty}</span>;
	// Apps word the same outcome differently ("fail", "failed"): one line per shown name.
	const merged = new Map<string, number>();
	for (const r of rows) {
		const name = names?.[r.key] ?? r.key;
		merged.set(name, (merged.get(name) ?? 0) + r.count);
	}
	return (
		<ul className="as-counts">
			{[...merged].sort((a, b) => b[1] - a[1]).map(([name, count]) => <li key={name}><span>{name}</span> <strong>{int.format(count)}</strong></li>)}
		</ul>
	);
}

function purchasesMessage(e: unknown): string {
	if (e instanceof StatsError && e.status === 400) return "stats-admin n'a pas encore l'action « purchases » : elle attend son redéploiement.";
	return statsMessage(e);
}

/** Purchases only: the time, the app, the product, the store. Never a session, an account or an event id. */
function RecentPurchases({ data, message }: { data: Purchases | null; message: string | null }) {
	const product = (item: string) => (Object.hasOwn(PRODUCTS, item) ? PRODUCTS[item] : null);
	const shown = data?.purchases.slice(0, SHOWN_PURCHASES) ?? [];
	return (
		<section className="pa-card as-app as-purchases">
			<header>
				<h2>Derniers achats</h2>
				<small>{data ? `${int.format(data.purchases.length)} réussis sur 30 jours, du plus récent au plus ancien` : 'achats réussis sur 30 jours'}</small>
			</header>
			{message && <p className="as-error">{message}</p>}
			{data && data.purchases.length === 0 && <p className="as-muted">Aucun achat réussi sur ces 30 jours.</p>}
			{shown.length > 0 && (
				<div className="as-scroll">
					<table className="as-table">
						<thead><tr><th scope="col">Date</th><th scope="col">Appli</th><th scope="col">Article</th><th scope="col">Store</th><th scope="col">Prix catalogue</th></tr></thead>
						<tbody>
							{shown.map((p, i) => (
								<tr key={`${p.at}-${i}`}>
									<th scope="row">{when(p.at)}{p.later && <small className="as-muted" title="Le store l'a rendu plus tard (après une relance, ou un paiement validé ensuite)."> · rendu plus tard</small>}</th>
									<td>{p.app}</td>
									<td>{product(p.item)?.name ?? p.item}</td>
									<td>{STORES[p.store] ?? (p.store || '–')}</td>
									<td>{product(p.item)?.price ?? '–'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{data && data.purchases.length > SHOWN_PURCHASES && <p className="as-muted">Et {int.format(data.purchases.length - SHOWN_PURCHASES)} plus anciens.</p>}
			<p className="as-muted">
				D'après l'événement iap_result des applis : achats réussis seulement, sans les cartes de test ni les builds de dev.
				Le prix est celui du catalogue en France, pas celui payé dans la monnaie de l'acheteur ; un achat remboursé ensuite reste dans la liste.
			</p>
			{data && data.errors.length > 0 && <p className="as-muted as-errors">Non lus : {data.errors.join(' ; ')}</p>}
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
	return (
		<article className="pa-card as-app">
			<header>
				<h2>{app.name}</h2>
				<small>{app.domain}</small>
				{app.hosts && app.hosts.length > 0 && (
					<small className="as-hosts">
						{app.hosts.map((h) => `${h.host}${h.test ? ' (test)' : ''} : ${int.format(h.visitors)}`).join(' · ')} visiteurs sur 28 j
					</small>
				)}
			</header>
			<div className="as-scroll">
				<table className="as-table">
					<thead><tr><th scope="col" /><th scope="col">1 jour</th><th scope="col">7 jours</th><th scope="col">28 jours</th></tr></thead>
					<tbody>
						<tr><th scope="row">Visiteurs</th>{[p.d1, p.d7, p.d28].map((s, i) => <td key={i}>{s ? int.format(s.visitors) : '–'}</td>)}</tr>
						<tr><th scope="row">Sessions</th>{[p.d1, p.d7, p.d28].map((s, i) => <td key={i}>{s ? int.format(s.visits) : '–'}</td>)}</tr>
					</tbody>
				</table>
			</div>
			<p className="as-retention" title="Umami reconnaît un visiteur à son adresse IP et son appareil, renouvelés chaque mois ; les applis n'envoient pas d'identifiant de joueur. Les retours sont donc sous-estimés, surtout sur mobile.">
				Rétention <span className="as-tag">indicative</span> : J1 <strong>{pct(app.retention?.d1?.rate)}</strong>, J7 <strong>{pct(app.retention?.d7?.rate)}</strong>
				{app.retention?.d1 && <small> (sur {int.format(app.retention.d1.visitors)} nouveaux visiteurs)</small>}
			</p>
			<div className="as-grid">
				<section>
					<h3>Achats, 28 j</h3>
					<p className="as-muted">Par article (toutes issues) :</p>
					<Counts rows={app.purchases.items} />
					<p className="as-muted">Issues :</p>
					<Counts rows={app.purchases.results} names={RESULT_NAMES} />
				</section>
				<section>
					<h3>Connexions, 28 j</h3>
					<Counts rows={app.signIn.providers} names={{ google: 'Google', apple: 'Apple' }} />
					<p className="as-muted">Issues :</p>
					<Counts rows={app.signIn.results} names={RESULT_NAMES} />
				</section>
			</div>
			<section>
				<h3>Pubs maison montrées ici, 28 j</h3>
				{app.ads === null ? <span className="as-muted">indisponible</span> : app.ads.length === 0 ? <span className="as-muted">aucun affichage</span> : (
					<div className="as-scroll">
						<table className="as-table">
							<thead><tr><th scope="col">Pub</th><th scope="col">Affichages</th><th scope="col">Taps</th><th scope="col">Taux</th><th scope="col">Part Android</th><th scope="col">Part iOS</th></tr></thead>
							<tbody>
								{app.ads.map((r) => (
									<tr key={r.ad}>
										<th scope="row">{title(r.ad)}</th>
										<td>{int.format(r.show)}</td>
										<td>{int.format(r.tap)}</td>
										<td>{pct(r.rate)}</td>
										<td>{share(r.ad, 'android')}</td>
										<td>{share(r.ad, 'ios')}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
				<p className="as-muted">Parts : ce que le catalogue en ligne donne aujourd'hui en bannière (page Pubs maison), pas sur les 28 jours.</p>
			</section>
			{app.errors.length > 0 && <p className="as-muted as-errors">Non lus : {app.errors.join(' ; ')}</p>}
		</article>
	);
}

export default function AdminStats() {
	const { session, ready, error } = useAdminSession(STATS_LOCAL);
	const [data, setData] = useState<Overview | null>(null);
	const [catalog, setCatalog] = useState<Catalog | null>(null);
	const [bought, setBought] = useState<Purchases | null>(null);
	const [boughtMessage, setBoughtMessage] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const signedIn = STATS_LOCAL || !!session;

	async function load(refresh = false) {
		setBusy(true);
		setMessage(null);
		setBoughtMessage(null);
		const recent = purchases(refresh).then(setBought).catch((e) => setBoughtMessage(purchasesMessage(e)));
		try {
			setData(await overview(refresh));
		} catch (e) {
			setMessage(statsMessage(e));
		} finally {
			await recent;
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
				<button type="button" className="pa-btn pa-primary" onClick={async () => {
					const err = await signIn('google', window.location.href);
					if (err) setMessage(err);
				}}>Se connecter avec Google</button>
				{(message || error) && <p className="as-error">{message ?? error}</p>}
			</div>
		);

	return (
		<div className="as-root">
			<div className="pa-bar">
				<span className="as-muted">
					{data ? `Chiffres du ${when(data.generatedAt)}${data.cached ? ' (gardés 10 min)' : ''} · ${data.apps.length} applis` : busy ? 'Lecture d\'Umami…' : ''}
				</span>
				<button type="button" className="pa-btn" disabled={busy} onClick={() => void load(true)}>Actualiser</button>
			</div>
			{message && <p className="pa-card as-error">{message}</p>}
			{(bought || boughtMessage) && <RecentPurchases data={bought} message={boughtMessage} />}
			{data?.apps.map((a) => <AppCard key={a.id} app={a} catalog={catalog} />)}
		</div>
	);
}
