// /admin/versions/: each app's store, testers' and main versions and what waits for Raphaël, from the studio
// board (studio_board, written by the studio's board.py after each send) through stats-admin.
import { useEffect, useState } from 'react';
import GoogleSignIn from './GoogleSignIn';
import { STATS_LOCAL, StatsError, board, statsMessage, type Board, type BoardApp } from '../../lib/statsAdmin';
import { useAdminSession } from './useAdminSession';
import { AppName, Pill, Tile, appStyle, type Tone } from './AdminParts';

const HOUR = 3600_000;
// A board line older than this has likely missed a send.
const STALE_HOURS = 48;

const ROWS: [keyof BoardApp, string][] = [
	['play_prod', 'Google Play'],
	['play_test', 'Play, autres pistes'],
	['ios', 'App Store'],
	['beta', 'Testeurs'],
	['main', 'main'],
];

function ago(iso: string, now: number): string {
	const h = Math.max(0, (now - Date.parse(iso)) / HOUR);
	if (h < 1) return "à l'instant";
	if (h < 48) return `il y a ${Math.round(h)} h`;
	return `il y a ${Math.round(h / 24)} j`;
}

/** A store line's state, read from board.py's words: live, under review, refused; anything else is plain. */
function tone(text: string): Tone {
	if (/refus|rejet|rejected|erreur|bloqu/i.test(text)) return 'bad';
	if (/examen|review|attente|en cours/i.test(text)) return 'warn';
	if (/en ligne|live|publi/i.test(text)) return 'ok';
	return 'plain';
}

function boardMessage(e: unknown): string {
	if (e instanceof StatsError && e.status === 400) return "stats-admin n'a pas encore l'action « board » : elle attend son redéploiement.";
	if (e instanceof StatsError && e.status === 502) return "La table studio_board n'est pas lisible : la migration attend d'être appliquée.";
	return statsMessage(e);
}

function AppCard({ app, now }: { app: BoardApp; now: number }) {
	const stale = !!app.updatedAt && now - Date.parse(app.updatedAt) > STALE_HOURS * HOUR;
	return (
		<article className="pa-card ak-appcard" id={`app-${app.app}`} style={appStyle(app.name, app.app)}>
			<header>
				<h2><i aria-hidden="true" />{app.name}</h2>
				{app.waits.length > 0 && <Pill tone="warn">{`${app.waits.length} t'attend${app.waits.length > 1 ? 'ent' : ''}`}</Pill>}
			</header>
			<dl className="ak-rows">
				{ROWS.map(([key, label]) => {
					const text = (app[key] as string) || '';
					const t = key === 'main' ? 'plain' : tone(text);
					return (
						<div key={key}>
							<dt>{label}</dt>
							<dd>{!text ? <span className="as-muted">–</span> : t === 'plain' ? text : <Pill tone={t}>{text}</Pill>}</dd>
						</div>
					);
				})}
			</dl>
			{app.updatedAt && (
				<p className="ak-foot">{stale ? <Pill tone="warn">{`relevé ${ago(app.updatedAt, now)}`}</Pill> : `relevé ${ago(app.updatedAt, now)}`}</p>
			)}
		</article>
	);
}

export default function AdminVersions() {
	const { session, ready, error } = useAdminSession(STATS_LOCAL);
	const [data, setData] = useState<Board | null>(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const signedIn = STATS_LOCAL || !!session;

	async function load() {
		setBusy(true);
		setMessage(null);
		try {
			setData(await board());
		} catch (e) {
			setMessage(boardMessage(e));
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
				<p>L'état des versions est réservé à l'administration du studio.</p>
				<GoogleSignIn onError={setMessage} />
				{(message || error) && <p className="as-error">{message ?? error}</p>}
			</div>
		);

	const now = data ? Date.parse(data.generatedAt) : Date.now();
	const apps = data?.apps ?? [];
	const waits = apps.flatMap((a) => a.waits.map((w) => ({ app: a, text: w })));
	return (
		<div className="as-root">
			<div className="pa-bar">
				<span className="as-muted">{busy ? 'Lecture…' : data ? `Relevé ${ago(data.generatedAt, Date.now())}` : ''}</span>
				<button type="button" className="pa-btn" disabled={busy} onClick={() => void load()}>Actualiser</button>
			</div>
			{message && <p className="pa-card as-error">{message}</p>}
			{data && !apps.length && <p className="pa-card as-muted">Le tableau est vide : board.py n'a encore rien écrit.</p>}
			{apps.length > 0 && (
				<div className="ak-tiles">
					<Tile label="T'attendent" value={waits.length ? <span className="ak-warn-text">{waits.length}</span> : '0'} sub={waits.length ? `dans ${new Set(waits.map((w) => w.app.app)).size} applis` : 'rien à faire'} />
					<Tile label="Sur Google Play" value={apps.filter((a) => a.play_prod).length} sub={`sur ${apps.length} applis`} />
					<Tile label="Sur l'App Store" value={apps.filter((a) => a.ios).length} sub={`sur ${apps.length} applis`} />
					<Tile label="Chez les testeurs" value={apps.filter((a) => a.beta).length} sub={`sur ${apps.length} applis`} />
				</div>
			)}
			{waits.length > 0 && (
				<section className="pa-card ak-card">
					<header><h2>T'attend</h2></header>
					<ul className="ak-waits">
						{waits.map((w) => (
							<li key={`${w.app.app}-${w.text}`}>
								<a href={`#app-${w.app.app}`}><AppName name={w.app.name} of={w.app.app} /></a>
								<span>{w.text}</span>
							</li>
						))}
					</ul>
				</section>
			)}
			{apps.length > 0 && <div className="ak-apps ak-apps--narrow">{apps.map((a) => <AppCard key={a.app} app={a} now={now} />)}</div>}
		</div>
	);
}
