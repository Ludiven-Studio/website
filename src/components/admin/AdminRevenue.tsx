// /admin/revenus/: the ad revenue per app from the LevelPlay Reporting API (every mediated network), through
// stats-admin: this month, the last 30 days and each of those days, with Unity Ads' own share.
import { useEffect, useState } from 'react';
import { signIn } from '../../lib/meetupAuth';
import { appColor } from '../../lib/appColors';
import { networkLabel, unityShare } from '../../lib/adNetworks';
import { STATS_LOCAL, StatsError, revenue, statsMessage, type Revenue, type RevenueApp, type RevenueDay, type RevenueNetwork } from '../../lib/statsAdmin';
import { useAdminSession } from './useAdminSession';
import { AppName, Bars, DayStack, Help, Tile, appStyle } from './AdminParts';

const PLATFORMS: Record<string, string> = { android: 'Android', ios: 'iOS' };
const int = new Intl.NumberFormat('fr-FR');
const at = (d: string) => new Date(`${d}T12:00:00Z`);
const dayLabel = (d: string): string => at(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const firstLabel = (d: string): string => (d.endsWith('-01') ? `1er ${at(d).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' })}` : dayLabel(d));
const when = (iso: string): string => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

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

function AppCard({ app, fmt }: { app: RevenueApp; fmt: (n: number) => string }) {
	return (
		<article className="pa-card ak-appcard" style={appStyle(app.name)}>
			<header>
				<h2><i aria-hidden="true" />{app.name}</h2>
				{app.platforms.length > 1 && (
					<small>{app.platforms.map((p) => `${PLATFORMS[p.platform] ?? p.platform} ${fmt(p.month)}`).join(' · ')} ce mois</small>
				)}
			</header>
			<div className="ak-nums">
				<div><span>Ce mois</span><strong>{fmt(app.month)}</strong><small>{unityPart(app.networks, 'month', fmt)}</small></div>
				<div><span>30 jours</span><strong>{fmt(app.last30)}</strong><small>{unityPart(app.networks, 'last30', fmt)}</small></div>
				<div><span>Affichages</span><strong>{int.format(app.impressions30)}</strong><small>sur 30 jours</small></div>
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
				<Tile label={`Ce mois · ${range(data.monthStart, data.to)}`} value={fmt(total.month)} sub={unityPart(total.networks, 'month', fmt)} />
				<Tile label={`30 derniers jours · ${range(data.from, data.to)}`} value={fmt(total.last30)} sub={unityPart(total.networks, 'last30', fmt)} />
				{yesterday && <Tile label={`Hier · ${dayLabel(yesterday.date)}`} value={fmt(yesterday.revenue)} sub={`${fmt(week.reduce((s, d) => s + d.revenue, 0) / Math.max(1, week.length))} par jour sur 7 jours`} />}
				<Tile label="Affichages · 30 jours" value={int.format(shows)} sub={`${apps.length} ${apps.length > 1 ? 'applis' : 'appli'}`} />
			</div>
			{nothingBefore && (
				<p className="ak-note">
					LevelPlay ne compte aucun revenu avant le {firstLabel(data.monthStart)} : ce mois et les 30 jours sont donc égaux, et ce
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
					<h2>Par appli <small>30 jours</small></h2>
					<Bars format={fmt} empty="aucun revenu" rows={apps.map((a) => ({ key: a.name, label: a.name, value: a.last30, color: appColor(a.name) }))} />
				</section>
				<section className="ak-netbars">
					<h2>Par régie <small>30 jours, noms de LevelPlay</small></h2>
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
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const signedIn = STATS_LOCAL || !!session;

	async function load(refresh = false) {
		setBusy(true);
		setMessage(null);
		try {
			setData(await revenue(refresh));
		} catch (e) {
			setMessage(revenueMessage(e));
		} finally {
			setBusy(false);
		}
	}

	useEffect(() => {
		if (signedIn) void load();
	}, [signedIn]);

	if (!ready) return <p className="as-muted">Chargement…</p>;
	if (!signedIn)
		return (
			<div className="pa-card as-signin">
				<p>Les revenus sont réservés à l'administration du studio.</p>
				<button type="button" className="pa-btn pa-primary" onClick={async () => {
					const err = await signIn('google', window.location.href);
					if (err) setMessage(err);
				}}>Se connecter avec Google</button>
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
			{data && <Studio data={data} fmt={fmt} />}
			{data && !data.apps.length && <p className="pa-card as-muted">LevelPlay ne donne aucun revenu sur ces 30 jours.</p>}
			{data && data.apps.length > 0 && (
				<div className="ak-apps">
					{data.apps.map((a) => <AppCard key={a.name} app={a} fmt={fmt} />)}
				</div>
			)}
		</div>
	);
}
