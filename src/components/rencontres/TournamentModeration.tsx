import { useCallback, useEffect, useState } from 'react';
import {
	modGetTournament, moderateTournament,
	type ModTournament, type ModTournamentAction, type ModTournamentReport, type TournamentReportReason,
} from '../../lib/meetups';
import { formatDay, formatShortDay, formatTime } from './format';

interface Data { tournament: ModTournament; posterPreview: string | null; reports: ModTournamentReport[]; }

const message = (e: unknown): string => (e instanceof Error ? e.message : 'Une erreur est survenue.');

const REASON: Record<TournamentReportReason, string> = {
	poster: 'Affiche choquante', fake: 'Faux tournoi', wrong_info: 'Infos erronées', other: 'Autre',
};

const POSTER_STATE: Record<ModTournament['poster_status'], string> = {
	none: 'Pas d’affiche', pending: 'Affiche en attente', approved: 'Affiche validée', rejected: 'Affiche refusée',
};

const ASK: Record<ModTournamentAction, string> = {
	approve_poster: 'Valider cette affiche ? Elle devient visible de tous.',
	reject_poster: 'Refuser cette affiche ? Elle est supprimée, le tournoi reste en ligne.',
	restore: 'Rétablir ce tournoi ? Il revient sur la carte et ses signalements sont effacés.',
	remove: 'Retirer ce tournoi ? Il est annulé et masqué.',
	ban_organizer: "Retirer ce tournoi et bannir l'organisateur ? Toutes ses annonces ouvertes seront masquées.",
};

const DONE: Record<ModTournamentAction, string> = {
	approve_poster: 'Affiche validée.',
	reject_poster: 'Affiche refusée.',
	restore: 'Tournoi rétabli.',
	remove: 'Tournoi retiré.',
	ban_organizer: 'Tournoi retiré, organisateur banni.',
};

/** ?t= is the tournament, ?k= its own token. */
export default function TournamentModeration({ tournamentId, token }: { tournamentId: string; token: string }) {
	const [data, setData] = useState<Data | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [flash, setFlash] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		setData(await modGetTournament(tournamentId, token));
	}, [tournamentId, token]);

	useEffect(() => {
		if (!token) { setError('Lien incomplet.'); return; }
		load().catch((e) => setError(message(e)));
	}, [token, load]);

	const act = async (what: ModTournamentAction): Promise<void> => {
		if (!window.confirm(ASK[what])) return;
		setBusy(true);
		setError(null);
		setFlash(null);
		try {
			await moderateTournament(tournamentId, token, what);
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

	const { tournament: t, posterPreview, reports } = data;
	const state = t.status === 'cancelled' ? 'Annulé' : t.hidden ? 'Masqué' : 'En ligne';
	const fee = t.entry_fee_cents === null ? null : `${(t.entry_fee_cents / 100).toLocaleString('fr-FR')} €`;

	return (
		<div className="re-root">
			<h1>Modération — tournoi</h1>

			<section className="re-panel">
				<h2>{t.title} · {state}</h2>
				<p>Organisateur&nbsp;: <strong>{t.club_name}</strong></p>
				<p className="re-when">{formatDay(t.starts_at)} · {formatTime(t.starts_at)}</p>
				<p className="re-where">📍 {t.label || 'Lieu'}{t.commune && t.commune !== t.label ? ` · ${t.commune}` : ''}</p>
				<p>{t.format} · {t.category}{fee ? ` · ${fee}` : ''}{t.contact_phone ? ` · ${t.contact_phone}` : ''}</p>
				{t.details && <p style={{ whiteSpace: 'pre-line' }}>{t.details}</p>}
			</section>

			<section className="re-panel">
				<h2>{POSTER_STATE[t.poster_status]}</h2>
				{posterPreview
					? <img src={posterPreview} alt="Affiche du tournoi" style={{ maxWidth: '100%', borderRadius: 8 }} />
					: <p className="re-hint">Rien à afficher.</p>}
				{t.poster_status === 'pending' && (
					<div className="re-actions">
						<button type="button" className="re-btn" disabled={busy} onClick={() => { void act('approve_poster'); }}>
							Valider l'affiche
						</button>
						<button type="button" className="re-btn re-btn--ghost" disabled={busy} onClick={() => { void act('reject_poster'); }}>
							Refuser l'affiche
						</button>
					</div>
				)}
				{t.poster_status === 'approved' && (
					<div className="re-actions">
						<button type="button" className="re-btn re-btn--ghost" disabled={busy} onClick={() => { void act('reject_poster'); }}>
							Retirer l'affiche
						</button>
					</div>
				)}
			</section>

			<section className="re-panel">
				<h2>Signalements ({reports.length})</h2>
				{reports.length === 0 ? <p className="re-hint">Aucun signalement.</p> : (
					<ul className="re-who">
						{reports.map((r, i) => (
							<li key={i}>{REASON[r.reason] ?? r.reason} — {formatShortDay(r.created_at)} {formatTime(r.created_at)}</li>
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
