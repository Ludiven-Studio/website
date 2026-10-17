import { useCallback, useEffect, useState } from 'react';
import { modList, modSendLink, type ModCredential, type ModQueueEvent, type ModQueueTournament } from '../../lib/meetups';
import { formatDay, formatTime } from './format';

const KEY = 'ludiven-meetup-admin';

const message = (e: unknown): string => (e instanceof Error ? e.message : 'Une erreur est survenue.');

function writeCred(v: ModCredential | null): void {
	try {
		if (v) localStorage.setItem(KEY, JSON.stringify(v));
		else localStorage.removeItem(KEY);
	} catch { /* private window: asked again next time */ }
}

/** The mailed link's ?q= wins and leaves the address bar; else what this browser kept. */
function readCred(): ModCredential | null {
	const q = new URLSearchParams(window.location.search).get('q');
	if (q) {
		writeCred({ pass: q });
		window.history.replaceState(null, '', window.location.pathname);
		return { pass: q };
	}
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ModCredential | null;
		return raw && typeof raw === 'object' && ('pass' in raw || 'adminKey' in raw) ? raw : null;
	} catch { return null; }
}

/** No ?e= or ?t=: every poster waiting and every reported listing. Opened by the
 *  7-day link mailed to the moderator, or by the admin key. */
export default function ModerationQueue() {
	const [cred, setCred] = useState(readCred);
	const [draft, setDraft] = useState('');
	const [withKey, setWithKey] = useState(false);
	const [sent, setSent] = useState(false);
	const [busy, setBusy] = useState(false);
	const [data, setData] = useState<{ tournaments: ModQueueTournament[]; events: ModQueueEvent[] } | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async (c: ModCredential) => {
		setError(null);
		try {
			setData(await modList(c));
		} catch (e) {
			const m = message(e);
			if (m !== 'forbidden') { setError(m); return; }
			writeCred(null);
			setCred(null);
			setError('pass' in c ? 'Ce lien a expiré. Demande-en un nouveau.' : 'Clé refusée.');
		}
	}, []);

	useEffect(() => { if (cred) void load(cred); }, [cred, load]);

	const sendLink = async (): Promise<void> => {
		setBusy(true);
		setError(null);
		try {
			await modSendLink();
			setSent(true);
		} catch (e) {
			setError(message(e));
		} finally {
			setBusy(false);
		}
	};

	const signOut = (): void => {
		writeCred(null);
		setCred(null);
		setData(null);
	};

	if (!cred) {
		return (
			<div className="re-root">
				<h1>Modération</h1>
				<section className="re-panel">
					<p>Reçois un lien d'accès à l'adresse de modération. Il reste valable 7 jours dans ce navigateur.</p>
					{sent
						? <p className="re-ok" role="status">✅ Lien envoyé. Ouvre l'e-mail « Rencontres : accès à la modération ».</p>
						: (
							<div className="re-actions">
								<button type="button" className="re-btn" disabled={busy} onClick={() => { void sendLink(); }}>
									Recevoir un lien par e-mail
								</button>
							</div>
						)}
					{error && <p className="re-error" role="alert">{error}</p>}
				</section>
				{withKey ? (
					<form className="re-form" onSubmit={(e) => {
						e.preventDefault();
						const c = { adminKey: draft.trim() };
						writeCred(c);
						setCred(c);
					}}>
						<label htmlFor="mod-key">Clé d'administration</label>
						<input id="mod-key" type="password" autoComplete="off" value={draft}
							onChange={(e) => setDraft(e.target.value)} />
						<div className="re-actions">
							<button type="submit" className="re-btn" disabled={!draft.trim()}>Ouvrir</button>
						</div>
					</form>
				) : (
					<div className="re-actions">
						<button type="button" className="re-btn re-btn--ghost" onClick={() => setWithKey(true)}>
							J'ai la clé d'administration
						</button>
					</div>
				)}
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
											<span><strong>Concours · {t.title}</strong> · {t.reports} signalement(s){t.hidden ? ' · masqué' : ''}<br />
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
						<button type="button" className="re-btn" onClick={() => { setData(null); void load(cred); }}>Actualiser</button>
						<button type="button" className="re-btn re-btn--ghost" onClick={signOut}>Se déconnecter</button>
					</div>
				</>
			)}
		</div>
	);
}
