import { useCallback, useEffect, useState } from 'react';
import { modList, type ModQueueEvent, type ModQueueTournament } from '../../lib/meetups';
import { formatDay, formatTime } from './format';

const KEY = 'ludiven-meetup-admin';

const message = (e: unknown): string => (e instanceof Error ? e.message : 'Une erreur est survenue.');

const readKey = (): string => {
	try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
};

const writeKey = (v: string | null): void => {
	try {
		if (v) localStorage.setItem(KEY, v);
		else localStorage.removeItem(KEY);
	} catch { /* private window: the key is asked again next time */ }
};

/** No ?e= or ?t=: every poster waiting and every reported listing, behind the admin key. */
export default function ModerationQueue() {
	const [key, setKey] = useState(readKey);
	const [draft, setDraft] = useState('');
	const [data, setData] = useState<{ tournaments: ModQueueTournament[]; events: ModQueueEvent[] } | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async (k: string) => {
		setError(null);
		try {
			setData(await modList(k));
		} catch (e) {
			const m = message(e);
			if (m === 'forbidden') { writeKey(null); setKey(''); setError('Clé refusée.'); return; }
			setError(m);
		}
	}, []);

	useEffect(() => { if (key) void load(key); }, [key, load]);

	if (!key) {
		return (
			<div className="re-root">
				<h1>Modération</h1>
				<form className="re-form" onSubmit={(e) => { e.preventDefault(); writeKey(draft.trim()); setKey(draft.trim()); }}>
					<label htmlFor="mod-key">Clé d'administration</label>
					<input id="mod-key" type="password" autoComplete="off" value={draft}
						onChange={(e) => setDraft(e.target.value)} />
					<p className="re-hint">Gardée dans ce navigateur seulement.</p>
					{error && <p className="re-error" role="alert">{error}</p>}
					<div className="re-actions">
						<button type="submit" className="re-btn" disabled={!draft.trim()}>Ouvrir</button>
					</div>
				</form>
			</div>
		);
	}

	const posters = data?.tournaments.filter((t) => t.poster_status === 'pending') ?? [];
	const reportedT = data?.tournaments.filter((t) => t.reports > 0) ?? [];

	return (
		<div className="re-root">
			<h1>Modération</h1>
			{error && <p className="re-error" role="alert">{error}</p>}
			{!data && !error && <p className="re-empty">Chargement…</p>}
			{data && (
				<>
					<section className="re-panel">
						<h2>Affiches à valider ({posters.length})</h2>
						{posters.length === 0 ? <p className="re-hint">Aucune affiche en attente.</p> : (
							<ul className="re-queue">
								{posters.map((t) => (
									<li key={t.id}>
										<a href={t.link}>
											{t.preview && <img src={t.preview} alt="" loading="lazy" />}
											<span><strong>{t.title}</strong> · {t.club_name}<br />
												{formatDay(t.starts_at)} · {formatTime(t.starts_at)} · {t.commune || t.label}</span>
										</a>
									</li>
								))}
							</ul>
						)}
					</section>
					<section className="re-panel">
						<h2>Signalements</h2>
						{reportedT.length === 0 && data.events.length === 0 ? <p className="re-hint">Aucun signalement.</p> : (
							<ul className="re-queue">
								{reportedT.map((t) => (
									<li key={t.id}>
										<a href={t.link}>
											<span><strong>Tournoi · {t.title}</strong> · {t.reports} signalement(s){t.hidden ? ' · masqué' : ''}<br />
												{formatDay(t.starts_at)} · {t.commune || t.label}</span>
										</a>
									</li>
								))}
								{data.events.map((e) => (
									<li key={e.id}>
										<a href={e.link}>
											<span><strong>Partie · {e.organizer_name}</strong> · {e.reports} signalement(s){e.hidden ? ' · masquée' : ''}<br />
												{formatDay(e.starts_at)} · {formatTime(e.starts_at)} · {e.commune || e.label}</span>
										</a>
									</li>
								))}
							</ul>
						)}
					</section>
					<div className="re-actions">
						<button type="button" className="re-btn" onClick={() => { setData(null); void load(key); }}>Actualiser</button>
						<button type="button" className="re-btn re-btn--ghost" onClick={() => { writeKey(null); setKey(''); setData(null); }}>
							Oublier la clé
						</button>
					</div>
				</>
			)}
		</div>
	);
}
