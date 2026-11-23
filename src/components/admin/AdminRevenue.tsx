// /admin/revenus/: the ad revenue per app from the LevelPlay Reporting API (every mediated network), through
// stats-admin: this month, the last 30 days and each of those days.
import { useEffect, useState } from 'react';
import { signIn } from '../../lib/meetupAuth';
import { STATS_LOCAL, StatsError, revenue, statsMessage, type Revenue, type RevenueApp, type RevenueDay } from '../../lib/statsAdmin';
import { useAdminSession } from './useAdminSession';

const PLATFORMS: Record<string, string> = { android: 'Android', ios: 'iOS' };
const dayLabel = (d: string): string => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const when = (iso: string): string => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

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

/** One bar per day, the last one (today) lighter as it is partial. Hover gives the day and its amount. */
function DayBars({ days, fmt, label }: { days: RevenueDay[]; fmt: (n: number) => string; label: string }) {
	const W = 300, H = 72, GAP = 2;
	const max = Math.max(...days.map((d) => d.revenue), 0);
	const bw = (W - GAP * (days.length - 1)) / days.length;
	return (
		<figure className="ar-chart">
			<svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label} : revenus par jour du ${dayLabel(days[0].date)} au ${dayLabel(days[days.length - 1].date)}, au plus ${fmt(max)} par jour`}>
				<line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="ar-base" />
				{days.map((d, i) => {
					const h = max > 0 ? Math.max((d.revenue / max) * (H - 4), d.revenue > 0 ? 2 : 0) : 0;
					const x = i * (bw + GAP);
					return (
						<g key={d.date} className={i === days.length - 1 ? 'ar-today' : undefined}>
							<rect x={x} y={0} width={bw + GAP} height={H} className="ar-hit">
								<title>{`${dayLabel(d.date)} : ${fmt(d.revenue)}${i === days.length - 1 ? ' (journée en cours)' : ''}`}</title>
							</rect>
							{h > 0 && <rect x={x} y={H - 1 - h} width={bw} height={h} rx={Math.min(2, bw / 2)} className="ar-bar" />}
						</g>
					);
				})}
			</svg>
			<figcaption>
				<span>{dayLabel(days[0].date)}</span>
				<span>max {fmt(max)} / jour</span>
				<span>{dayLabel(days[days.length - 1].date)}</span>
			</figcaption>
		</figure>
	);
}

function AppCard({ app, fmt }: { app: RevenueApp; fmt: (n: number) => string }) {
	return (
		<article className="pa-card ar-app">
			<header>
				<h2>{app.name}</h2>
				{app.platforms.length > 0 && (
					<small>{app.platforms.map((p) => `${PLATFORMS[p.platform] ?? p.platform} ${fmt(p.month)}`).join(' · ')} ce mois</small>
				)}
			</header>
			<dl className="ar-figures">
				<div><dt>Ce mois</dt><dd>{fmt(app.month)}</dd></div>
				<div><dt>30 derniers jours</dt><dd>{fmt(app.last30)}</dd></div>
				<div><dt>Affichages (30 j)</dt><dd>{new Intl.NumberFormat('fr-FR').format(app.impressions30)}</dd></div>
			</dl>
			<DayBars days={app.days} fmt={fmt} label={app.name} />
		</article>
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
			<p className="pa-card as-muted">
				Revenus publicitaires gagnés selon LevelPlay, toutes régies comprises (ironSource Ads, Unity Ads…), en dollars US,
				jours en heure UTC ; la journée en cours est partielle. Le solde disponible au versement (« available balance » du
				tableau de bord Unity) n'est dans aucune API : il reste à lire dans le tableau de bord.
			</p>
			{data && (
				<>
					<section className="pa-card ar-app ar-total">
						<header><h2>Tout le studio</h2><small>du {dayLabel(data.from)} au {dayLabel(data.to)}</small></header>
						<dl className="ar-figures">
							<div><dt>Ce mois</dt><dd>{fmt(data.total.month)}</dd></div>
							<div><dt>30 derniers jours</dt><dd>{fmt(data.total.last30)}</dd></div>
							<div><dt>Applis</dt><dd>{data.apps.length}</dd></div>
						</dl>
						<DayBars days={data.total.days} fmt={fmt} label="Tout le studio" />
						{data.apps.length > 0 && (
							<details>
								<summary>Jour par jour</summary>
								<div className="as-scroll">
									<table className="as-table">
										<thead><tr><th>Jour</th>{data.apps.map((a) => <th key={a.name}>{a.name}</th>)}<th>Total</th></tr></thead>
										<tbody>
											{[...data.total.days].reverse().map((d) => (
												<tr key={d.date}>
													<th>{dayLabel(d.date)}</th>
													{data.apps.map((a) => <td key={a.name}>{fmt(a.days.find((x) => x.date === d.date)?.revenue ?? 0)}</td>)}
													<td>{fmt(d.revenue)}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</details>
						)}
					</section>
					{!data.apps.length && <p className="pa-card as-muted">LevelPlay ne donne aucun revenu sur ces 30 jours.</p>}
					<div className="ar-grid">
						{data.apps.map((a) => <AppCard key={a.name} app={a} fmt={fmt} />)}
					</div>
				</>
			)}
		</div>
	);
}
