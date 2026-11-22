// /admin/versions/: each app's store, testers' and main versions and what waits for Raphaël, from the studio
// board (studio_board, written by the studio's board.py after each send) through stats-admin.
import { useEffect, useState } from 'react';
import { signIn } from '../../lib/meetupAuth';
import { STATS_LOCAL, StatsError, board, statsMessage, type Board, type BoardApp } from '../../lib/statsAdmin';
import { useAdminSession } from './useAdminSession';

const when = (iso: string): string => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

const ROWS: [keyof BoardApp, string][] = [
	['play_prod', 'Google Play'],
	['play_test', 'Play, autres pistes'],
	['ios', 'App Store'],
	['beta', 'Testeurs'],
	['main', 'main'],
];

function boardMessage(e: unknown): string {
	if (e instanceof StatsError && e.status === 400) return "stats-admin n'a pas encore l'action « board » : elle attend son redéploiement.";
	if (e instanceof StatsError && e.status === 502) return "La table studio_board n'est pas lisible : la migration attend d'être appliquée.";
	return statsMessage(e);
}

function AppCard({ app }: { app: BoardApp }) {
	return (
		<article className="pa-card av-app" id={`app-${app.app}`}>
			<header>
				<h2>{app.name}</h2>
				{app.updatedAt && <small>relevé le {when(app.updatedAt)}</small>}
			</header>
			<dl className="av-rows">
				{ROWS.map(([key, label]) => (
					<div key={key}>
						<dt>{label}</dt>
						<dd>{(app[key] as string) || '–'}</dd>
					</div>
				))}
			</dl>
			{app.waits.length > 0 && (
				<section className="av-waits">
					<h3>T'attend</h3>
					<ul>{app.waits.map((w) => <li key={w}>{w}</li>)}</ul>
				</section>
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
				<button type="button" className="pa-btn pa-primary" onClick={async () => {
					const err = await signIn('google', window.location.href);
					if (err) setMessage(err);
				}}>Se connecter avec Google</button>
				{(message || error) && <p className="as-error">{message ?? error}</p>}
			</div>
		);

	const waiting = data?.apps.reduce((n, a) => n + a.waits.length, 0) ?? 0;
	return (
		<div className="as-root">
			<div className="pa-bar">
				<span className="as-muted">
					{data ? `${data.apps.length} applis · ${waiting} choses t'attendent` : busy ? 'Lecture…' : ''}
				</span>
				<button type="button" className="pa-btn" disabled={busy} onClick={() => void load()}>Actualiser</button>
			</div>
			{message && <p className="pa-card as-error">{message}</p>}
			{data && !data.apps.length && <p className="pa-card as-muted">Le tableau est vide : board.py n'a encore rien écrit.</p>}
			<div className="av-grid">
				{data?.apps.map((a) => <AppCard key={a.app} app={a} />)}
			</div>
		</div>
	);
}
