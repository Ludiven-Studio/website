// /admin/avis/: the stores' ratings of each app (App Store from Apple's public lookup, Google Play from the Play
// Console's exports), then Google's reviews with their text and our reply, through stats-admin.
import { useEffect, useState } from 'react';
import GoogleSignIn from './GoogleSignIn';
import { STATS_LOCAL, StatsError, reviews, statsMessage, type Review, type Reviews, type StoreRating } from '../../lib/statsAdmin';
import { STORE_NAMES, byRatings, playProblem, starLabel, studioAverage } from '../../lib/reviews';
import { useAdminSession } from './useAdminSession';
import { AppName, Help, Pill, Tile } from './AdminParts';

const int = new Intl.NumberFormat('fr-FR');
const one = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const when = (iso: string): string => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const day = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const COUNTRY = new Intl.DisplayNames(['fr'], { type: 'region' });
const LANG = new Intl.DisplayNames(['fr'], { type: 'language' });

function reviewsMessage(e: unknown): string {
	if (e instanceof StatsError && e.status === 400) return "stats-admin n'a pas encore l'action « reviews » : elle attend son redéploiement.";
	if (e instanceof StatsError && e.status === 502) return "Les stores n'ont pas répondu.";
	return statsMessage(e);
}

function Rating({ r }: { r: StoreRating | undefined }) {
	const label = starLabel(r);
	if (!r?.live) return <span className="as-muted">{label}</span>;
	const title = r.countries.length ? r.countries.map((c) => `${COUNTRY.of(c.country.toUpperCase())} : ${one.format(c.average)} (${c.count})`).join('\n') : undefined;
	return r.url ? <a href={r.url} target="_blank" rel="noopener" title={title}>{label}</a> : <span title={title}>{label}</span>;
}

function Stars({ n }: { n: number }) {
	return <span className="av-stars" role="img" aria-label={`${n} étoile${n > 1 ? 's' : ''} sur 5`}>{'★'.repeat(n)}<span aria-hidden="true">{'★'.repeat(5 - n)}</span></span>;
}

function ReviewItem({ r, name }: { r: Review; name: string }) {
	const lang = r.lang ? (LANG.of(r.lang) ?? r.lang) : '';
	return (
		<li className={`av-review${r.stars <= 2 ? ' av-low' : ''}`}>
			<header>
				<Stars n={r.stars} />
				<AppName name={name} of={r.app} />
				<span className="as-muted">{[day(r.at), STORE_NAMES[r.store], r.version && `version ${r.version}`, lang].filter(Boolean).join(' · ')}</span>
			</header>
			{r.title && <strong>{r.title}</strong>}
			{r.text ? <p>{r.text}</p> : <p className="as-muted">Note sans texte.</p>}
			{r.reply ? (
				<blockquote className="av-reply"><span>Notre réponse{r.replyAt ? `, le ${day(r.replyAt)}` : ''} :</span> {r.reply}</blockquote>
			) : r.text && r.link ? (
				<a className="av-answer" href={r.link} target="_blank" rel="noopener">Répondre dans la Play Console</a>
			) : null}
		</li>
	);
}

function Page({ data }: { data: Reviews }) {
	const [app, setApp] = useState('');
	const [stars, setStars] = useState(0);
	const [open, setOpen] = useState(false);
	const all = studioAverage(data);
	const names = new Map(data.apps.map((a) => [a.app, a.name]));
	const apple = data.apps.flatMap((a) => a.stores).filter((s) => s.store === 'appstore');
	const play = data.apps.flatMap((a) => a.stores).filter((s) => s.store === 'play');
	const sum = (list: StoreRating[]) => ({ count: list.reduce((n, s) => n + s.count, 0), apps: list.filter((s) => s.live).length });
	const problem = playProblem(data.play);
	const listed = data.reviews.filter((r) => (!app || r.app === app) && (!stars || r.stars === stars) && (!open || (!r.reply && !!r.text)));
	const month = data.reviews.filter((r) => Date.parse(r.at) >= Date.parse(data.generatedAt) - 30 * 86_400_000);
	const monthAvg = month.length ? month.reduce((n, r) => n + r.stars, 0) / month.length : null;
	return (
		<>
			{problem && <p className="ak-note"><strong>Google Play</strong> : {problem}. Les notes de l'App Store sont là quand même.</p>}
			<div className="ak-tiles">
				<Tile label="Note moyenne" value={all.average === null ? '–' : `★ ${one.format(all.average)}`} sub={`${int.format(all.count)} notes, tous stores`} />
				<Tile label="App Store" value={int.format(sum(apple).count)} sub={`notes, ${sum(apple).apps} appli${sum(apple).apps > 1 ? 's' : ''} en ligne`} />
				<Tile label="Google Play" value={data.play === 'ok' ? int.format(sum(play).count) : '–'} sub={data.play === 'ok' ? `notes, ${sum(play).apps} appli${sum(play).apps > 1 ? 's' : ''}` : 'pas encore lu'} />
				<Tile label="Google · 30 derniers jours" value={monthAvg === null ? '–' : `★ ${one.format(monthAvg)}`} sub={data.play === 'ok' ? `${month.length} note${month.length > 1 ? 's' : ''}` : 'pas encore lu'} />
			</div>
			<section className="pa-card ak-card">
				<header><h2>Par appli</h2></header>
				<div className="as-scroll">
					<table className="ak-table">
						<thead><tr><th scope="col">Appli</th><th scope="col">App Store</th><th scope="col">Google Play</th><th scope="col" className="ak-wide">Google, 30 derniers jours</th></tr></thead>
						<tbody>
							{byRatings(data.apps).map((a) => (
								<tr key={a.app}>
									<th scope="row"><AppName name={a.name} of={a.app} /></th>
									<td><Rating r={a.stores.find((s) => s.store === 'appstore')} /></td>
									<td>{data.play === 'ok' ? <Rating r={a.stores.find((s) => s.store === 'play')} /> : <span className="as-muted">–</span>}</td>
									<td className="ak-wide">{a.last30.count ? starLabel(a.last30) : <span className="as-muted">–</span>}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
			<section className="pa-card ak-card">
				<header><h2>Derniers avis <small>Google Play, du plus récent</small></h2></header>
				{data.play === 'ok' ? (
					<>
						<div className="av-filters">
							<label>Appli{' '}
								<select value={app} onChange={(e) => setApp(e.target.value)}>
									<option value="">toutes</option>
									{data.apps.map((a) => <option key={a.app} value={a.app}>{a.name}</option>)}
								</select>
							</label>
							<label>Étoiles{' '}
								<select value={stars} onChange={(e) => setStars(Number(e.target.value))}>
									<option value={0}>toutes</option>
									{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
								</select>
							</label>
							<label className="as-check"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> sans réponse</label>
						</div>
						{listed.length ? (
							<ul className="av-list">{listed.map((r) => <ReviewItem key={`${r.app}-${r.at}-${r.stars}-${r.text.slice(0, 20)}`} r={r} name={names.get(r.app) ?? r.app} />)}</ul>
						) : <p className="as-muted">Aucun avis {data.reviews.length ? 'avec ces filtres' : 'pour le moment'}.</p>}
					</>
				) : <p className="as-muted">Les avis de Google arrivent dès que l'accès aux rapports est ouvert.</p>}
			</section>
			{data.errors.length > 0 && (
				<Help label={`Non lu (${data.errors.length})`}><ul className="as-errors">{data.errors.map((e) => <li key={e}>{e}</li>)}</ul></Help>
			)}
			<Help>
				<p>
					App Store : la note moyenne et le nombre de notes que montre Apple dans chaque pays lu (France, Belgique,
					Suisse, Luxembourg, Canada, États-Unis, Royaume-Uni, Irlande, Australie, Allemagne, Autriche, Espagne, Italie,
					Portugal, Pays-Bas), réunis par leur nombre ; le détail par pays en survolant la note. Les avis écrits de l'App
					Store demandent une clé App Store Connect « Customer Support » : ils viendront ensuite.
				</p>
				<p>
					Google Play : la note moyenne de Google, et chaque note avec son texte et notre réponse, d'après les exports
					de la Play Console (mis à jour une fois par jour). Le nombre est celui des notes de ces exports. Les avis sont
					relus toutes les 6 heures ; « Actualiser » les relit tout de suite.
				</p>
			</Help>
		</>
	);
}

export default function AdminReviews() {
	const { session, ready, error } = useAdminSession(STATS_LOCAL);
	const [data, setData] = useState<Reviews | null>(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const signedIn = STATS_LOCAL || !!session;

	async function load(refresh = false) {
		setBusy(true);
		setMessage(null);
		try {
			setData(await reviews(refresh));
		} catch (e) {
			setMessage(reviewsMessage(e));
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
				<p>Les avis sont réservés à l'administration du studio.</p>
				<GoogleSignIn onError={setMessage} />
				{(message || error) && <p className="as-error">{message ?? error}</p>}
			</div>
		);

	return (
		<div className="as-root">
			<div className="pa-bar">
				<span className="as-muted">
					{busy ? 'Lecture des stores…' : data ? `Relevé le ${when(data.generatedAt)}${data.cached ? ' (gardé 6 heures)' : ''}` : ''}
				</span>
				{data?.play === 'closed' && <Pill tone="warn">Google Play : accès pas encore ouvert</Pill>}
				<button type="button" className="pa-btn" disabled={busy} onClick={() => void load(true)}>Actualiser</button>
			</div>
			{message && <p className="pa-card as-error">{message}</p>}
			{data && <Page data={data} />}
		</div>
	);
}
