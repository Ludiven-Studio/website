import { useEffect } from 'react';
import type { MeetupTournament } from '../../lib/meetups';
import { formatDay, formatTime } from './format';

const FORMAT: Record<MeetupTournament['format'], string> = {
	'tete-a-tete': 'Tête-à-tête', doublette: 'Doublette', triplette: 'Triplette',
};
const FORMAT_PLURAL: Record<MeetupTournament['format'], string> = {
	'tete-a-tete': 'En tête-à-tête', doublette: 'En doublettes', triplette: 'En triplettes',
};
const CATEGORY: Record<MeetupTournament['category'], string> = {
	open: 'Open', veterans: 'Vétérans', feminin: 'Féminin', jeunes: 'Jeunes', mixte: 'Mixte',
};

const fee = (cents: number | null): string | null => {
	if (cents === null) return null;
	if (cents === 0) return 'Inscription gratuite';
	const amount = (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: cents % 100 ? 2 : 0 });
	return `Inscription ${amount}\u00a0€`;
};

const phone = (digits: string): string => digits.replace(/(\d{2})(?=\d)/g, '$1 ');

/** What a club without a poster still gets: one composed from its own details,
 *  so every tournament reads like a poster on a café wall. */
function ComposedPoster({ t }: { t: MeetupTournament }) {
	const price = fee(t.entry_fee_cents);
	return (
		<div className={`re-affiche re-affiche--${t.format}`} role="img" aria-label={`Affiche : ${t.title}`}>
			<p className="re-affiche-kicker">Concours de pétanque</p>
			<p className="re-affiche-title">{t.title}</p>
			<p className="re-affiche-when">{formatDay(t.starts_at)}<br />{formatTime(t.starts_at)}</p>
			<p className="re-affiche-what">{FORMAT_PLURAL[t.format]} · {CATEGORY[t.category]}</p>
			{price && <p className="re-affiche-what">{price}</p>}
			<p className="re-affiche-where">{t.label || 'Lieu du tournoi'}{t.commune && t.commune !== t.label ? `, ${t.commune}` : ''}</p>
			<p className="re-affiche-club">{t.club_name}</p>
		</div>
	);
}

/** The page a shared tournament link opens, over the map: on a phone a panel
 *  under the map is a screen away, and the tap seemed to show the name only. */
export default function TournamentPanel({ tournament: t, shareUrl, onClose }: {
	tournament: MeetupTournament; shareUrl: string; onClose(): void;
}) {
	const place = t.label || 'Lieu du tournoi';
	const price = fee(t.entry_fee_cents);
	const directions = `https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lng}`;

	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	const share = async (): Promise<void> => {
		const text = `${t.title} (${t.club_name}), ${formatDay(t.starts_at)} à ${formatTime(t.starts_at)}`;
		if (navigator.share) {
			await navigator.share({ title: t.title, text, url: shareUrl }).catch(() => {});
		} else {
			await navigator.clipboard?.writeText(`${text}\n${shareUrl}`).catch(() => {});
		}
	};

	return (
		<div className="re-modal re-modal--tournament" onClick={onClose}>
			<section className="re-sheet re-tournament" onClick={(e) => e.stopPropagation()} aria-label={t.title}>
				<button type="button" className="re-close" onClick={onClose} aria-label="Fermer">×</button>
				{t.status === 'cancelled' && <p className="re-banner re-banner--off">Tournoi annulé</p>}
				{t.poster_url
					? <img className="re-poster" src={t.poster_url} alt={`Affiche : ${t.title}`} />
					: <ComposedPoster t={t} />}
				<h2>🏆 {t.title}</h2>
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
		</div>
	);
}
