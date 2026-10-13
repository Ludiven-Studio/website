import type { MeetupTournament } from '../../lib/meetups';
import { formatDay, formatTime } from './format';

const FORMAT: Record<MeetupTournament['format'], string> = {
	'tete-a-tete': 'Tête-à-tête', doublette: 'Doublette', triplette: 'Triplette',
};
const CATEGORY: Record<MeetupTournament['category'], string> = {
	open: 'Open', veterans: 'Vétérans', feminin: 'Féminin', jeunes: 'Jeunes', mixte: 'Mixte',
};

const fee = (cents: number | null): string | null => {
	if (cents === null) return null;
	if (cents === 0) return 'Gratuit';
	return `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: cents % 100 ? 2 : 0 })}\u00a0€`;
};

const phone = (digits: string): string => digits.replace(/(\d{2})(?=\d)/g, '$1 ');

/** The page a shared tournament link opens. Read-only: acting happens in the app. */
export default function TournamentPanel({ tournament: t, shareUrl, onClose }: {
	tournament: MeetupTournament; shareUrl: string; onClose(): void;
}) {
	const place = t.label || 'Lieu du tournoi';
	const price = fee(t.entry_fee_cents);
	const directions = `https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lng}`;

	const share = async (): Promise<void> => {
		const text = `${t.title} (${t.club_name}), ${formatDay(t.starts_at)} à ${formatTime(t.starts_at)}`;
		if (navigator.share) {
			await navigator.share({ title: t.title, text, url: shareUrl }).catch(() => {});
		} else {
			await navigator.clipboard?.writeText(`${text}\n${shareUrl}`).catch(() => {});
		}
	};

	return (
		<section className="re-panel re-tournament">
			<button type="button" className="re-close" onClick={onClose} aria-label="Fermer">×</button>
			{t.status === 'cancelled' && <p className="re-banner re-banner--off">Tournoi annulé</p>}
			<h2>🏆 {t.title}</h2>
			{t.poster_url && <img className="re-poster" src={t.poster_url} alt={`Affiche : ${t.title}`} loading="lazy" />}
			<p><strong>Organisé par {t.club_name}</strong></p>
			<p className="re-when">{formatDay(t.starts_at)} · {formatTime(t.starts_at)}</p>
			<p className="re-where">📍 {place}{t.commune && t.commune !== place ? ` · ${t.commune}` : ''}</p>
			<p className="re-hint">{FORMAT[t.format]} · {CATEGORY[t.category]}{price ? ` · ${price}` : ''}</p>
			{t.details && <p style={{ whiteSpace: 'pre-line' }}>{t.details}</p>}
			<div className="re-actions">
				{t.contact_phone && t.status === 'open' && (
					<a className="re-btn" href={`tel:${t.contact_phone}`}>Appeler le {phone(t.contact_phone)}</a>
				)}
				<a className="re-btn re-btn--ghost" href={directions} target="_blank" rel="noopener">Y aller</a>
				<button type="button" className="re-btn re-btn--ghost" onClick={() => { void share(); }}>Partager</button>
			</div>
			<p className="re-hint re-app-cta">
				Ce tournoi et toutes les parties autour de toi sont dans l'appli <strong>Pétanque Meet</strong>,
				bientôt sur Android et iPhone.
			</p>
		</section>
	);
}
