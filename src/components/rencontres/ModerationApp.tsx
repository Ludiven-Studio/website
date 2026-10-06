import { useCallback, useEffect, useState } from 'react';
import { modGet, moderate, type ModAction, type ModReport, type ModSignup } from '../../lib/meetups';
import { FORMAT_LABEL, REPORT_LABEL, type MeetupEvent } from '../../lib/meetupRules';
import { formatDay, formatShortDay, formatSlot, formatTime } from './format';

interface Data { event: MeetupEvent; signups: ModSignup[]; reports: ModReport[]; }

const message = (e: unknown): string => (e instanceof Error ? e.message : 'Une erreur est survenue.');

const ASK: Record<Exclude<ModAction, 'ban_signup'>, string> = {
	restore: 'Rétablir cette partie ? Elle revient sur la carte et ses signalements sont effacés.',
	remove: 'Retirer cette partie ? Elle est annulée et masquée.',
	ban_organizer: "Retirer cette partie et bannir l'organisateur ? Toutes ses parties ouvertes seront masquées.",
};

const DONE: Record<ModAction, string> = {
	restore: 'Partie rétablie.',
	remove: 'Partie retirée.',
	ban_organizer: 'Partie retirée, organisateur banni.',
	ban_signup: 'Joueur banni et retiré.',
};

/** The page behind the report mail. ?e= is the game, ?k= its per-game token. */
export default function ModerationApp() {
	const [q] = useState(() => new URLSearchParams(window.location.search));
	const eventId = q.get('e') ?? '';
	const token = q.get('k') ?? '';
	const [data, setData] = useState<Data | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [flash, setFlash] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		setData(await modGet(eventId, token));
	}, [eventId, token]);

	useEffect(() => {
		if (!eventId || !token) { setError('Lien incomplet.'); return; }
		load().catch((e) => setError(message(e)));
	}, [eventId, token, load]);

	const act = async (what: ModAction, signupId?: string, ask?: string): Promise<void> => {
		if (!window.confirm(ask ?? ASK[what as keyof typeof ASK])) return;
		setBusy(true);
		setError(null);
		setFlash(null);
		try {
			await moderate(eventId, token, what, signupId);
			await load();
			setFlash(DONE[what]);
		} catch (e) {
			setError(message(e));
		} finally {
			setBusy(false);
		}
	};

	if (!data) {
		return (
			<div className="re-root">
				<h1>Modération</h1>
				{error ? <p className="re-error" role="alert">{error}</p> : <p className="re-empty">Chargement…</p>}
			</div>
		);
	}

	const { event, signups, reports } = data;
	const counts = reports.reduce<Record<string, number>>((a, r) => ({ ...a, [r.reason]: (a[r.reason] ?? 0) + 1 }), {});
	const state = event.status === 'cancelled' ? 'Annulée' : event.hidden ? 'Masquée' : 'En ligne';

	return (
		<div className="re-root">
			<h1>Modération</h1>

			<section className="re-panel">
				<h2>{FORMAT_LABEL[event.format]} · {state}</h2>
				<p className="re-when">{formatDay(event.starts_at)} · {formatSlot(event.starts_at, event.ends_at)}</p>
				<p className="re-where">📍 {event.label || 'Terrain'}{event.commune && event.commune !== event.label ? ` · ${event.commune}` : ''}</p>
				<p className="re-seats"><strong>{event.seats_taken} / {event.players_needed}</strong> joueurs</p>
				<p>Organisateur&nbsp;: <strong>{event.organizer_name}</strong>{event.organizer_seats > 1 ? ` ×${event.organizer_seats}` : ''}</p>
				<a className="re-link" href={`/rencontres/?e=${event.id}`}>Voir la fiche publique</a>
			</section>

			<section className="re-panel">
				<h2>Signalements ({reports.length})</h2>
				{reports.length === 0 ? <p className="re-hint">Aucun signalement.</p> : (
					<>
						<p>{Object.entries(counts).map(([r, n]) => `${REPORT_LABEL[r as ModReport['reason']] ?? r} ×${n}`).join(' · ')}</p>
						<ul className="re-who">
							{reports.map((r, i) => (
								<li key={i}>{REPORT_LABEL[r.reason] ?? r.reason} — {formatShortDay(r.created_at)} {formatTime(r.created_at)}</li>
							))}
						</ul>
					</>
				)}
			</section>

			<section className="re-panel">
				<h2>Inscrits ({signups.length})</h2>
				{signups.length === 0 ? <p className="re-hint">Personne.</p> : (
					<ul className="re-who">
						{signups.map((s) => (
							<li key={s.id}>
								{s.player_name}{s.seats > 1 ? ` ×${s.seats}` : ''}
								{s.no_shows > 0 && <> · absent {s.no_shows} fois</>}
								{' · '}
								<button
									type="button"
									className="re-link"
									disabled={busy}
									onClick={() => { void act('ban_signup', s.id, `Bannir ${s.player_name} et le retirer de toutes ses parties ?`); }}
								>
									Bannir
								</button>
							</li>
						))}
					</ul>
				)}
			</section>

			{flash && <p className="re-ok re-ok--loud" role="status">✅ {flash}</p>}
			{error && <p className="re-error" role="alert">{error}</p>}

			<div className="re-actions">
				<button type="button" className="re-btn" disabled={busy} onClick={() => { void act('restore'); }}>
					Rétablir
				</button>
				<button type="button" className="re-btn re-btn--ghost" disabled={busy} onClick={() => { void act('remove'); }}>
					Retirer
				</button>
				<button type="button" className="re-btn re-btn--danger" disabled={busy} onClick={() => { void act('ban_organizer'); }}>
					Retirer et bannir l'organisateur
				</button>
			</div>
		</div>
	);
}
