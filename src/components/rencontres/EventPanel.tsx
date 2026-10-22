import { useState } from 'react';
import {
	REPORT_REASONS, ROLES, seatsLeft,
	type MeetupEvent, type MeetupSignup, type ReportReason, type Role,
} from '../../lib/meetupRules';
import { buildIcs, downloadIcs } from '../../lib/meetupIcs';
import { trackEvent } from '../../lib/analytics';
import { formatDay, formatSlot } from './format';
import { labels, PATHS, pick, useLang } from './i18n';

interface Props {
	event: MeetupEvent;
	signups: readonly MeetupSignup[];
	isOrganizer: boolean;
	name: string;
	busy: boolean;
	/** The verdict of the last action taken here, shown here. A page-level banner
	 *  sits a screen away and reads as nothing having happened. */
	error?: string | null;
	flash?: string | null;
	placeSaved: boolean;
	shareUrl: string;
	onJoin(seats: number, role: Role, name: string): void;
	onLeave(): void;
	onEdit(): void;
	onCancel(): void;
	onClose(): void;
	onSavePlace(): void;
	/** Rejects with the server's French message, shown as is. */
	onReport(reason: ReportReason): Promise<void>;
	onReportSignup(signupId: string): Promise<void>;
	/** False for my own games: muting myself would only hide them from me. */
	canMute: boolean;
	onMute(): void;
	/** Reporting needs an account; signed out, « Signaler » opens the login sheet. */
	signedIn: boolean;
	onLogin(): void;
}

export default function EventPanel({
	event, signups, isOrganizer, name, busy, error, flash, placeSaved, shareUrl,
	onJoin, onLeave, onEdit, onCancel, onClose, onSavePlace, onReport, onReportSignup, canMute, onMute, signedIn, onLogin,
}: Props) {
	const lang = useLang();
	const tr = pick(lang);
	const L = labels(lang);
	const mine = signups.find((s) => s.is_me);
	const [seats, setSeats] = useState(mine?.seats ?? 1);
	const [role, setRole] = useState<Role>(mine?.role ?? 'any');
	const [who, setWho] = useState(mine?.player_name ?? name);
	const [copied, setCopied] = useState(false);
	const [reporting, setReporting] = useState(false);
	const [reason, setReason] = useState<ReportReason | null>(null);
	const [reported, setReported] = useState(false);
	const [reportError, setReportError] = useState<string | null>(null);
	const [sending, setSending] = useState(false);
	const [absent, setAbsent] = useState<ReadonlySet<string>>(new Set());

	const left = seatsLeft(event);
	const past = Date.parse(event.ends_at) < Date.now();
	const cancelled = event.status === 'cancelled';
	const place = event.label || tr('Terrain sur la carte', 'Pitch on the map');
	const started = Date.parse(event.starts_at) <= Date.now();
	// The server refuses 'no_show' otherwise: don't offer what it will turn down.
	const reasons = REPORT_REASONS.filter((r) => r !== 'no_show' || (Boolean(mine) && started));
	const canFlagAbsent = isOrganizer && started && !cancelled;
	const failed = tr('Une erreur est survenue.', 'Something went wrong.');
	const day = formatDay(event.starts_at, lang);

	const sendReport = async (): Promise<void> => {
		if (!reason) return;
		setSending(true);
		setReportError(null);
		try {
			await onReport(reason);
			setReported(true);
			setReporting(false);
		} catch (e) {
			setReportError(e instanceof Error ? e.message : failed);
		} finally {
			setSending(false);
		}
	};

	const flagAbsent = async (signupId: string): Promise<void> => {
		setSending(true);
		setReportError(null);
		try {
			await onReportSignup(signupId);
			setAbsent((s) => new Set(s).add(signupId));
		} catch (e) {
			setReportError(e instanceof Error ? e.message : failed);
		} finally {
			setSending(false);
		}
	};

	const share = async (): Promise<void> => {
		trackEvent('meetup_share');
		const text = `Pétanque ${L.format[event.format]} — ${day} ${tr('à', 'at')} ${place}`;
		try {
			if (navigator.share) {
				await navigator.share({ title: tr('Partie de pétanque', 'Pétanque game'), text, url: shareUrl });
				return;
			}
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch { /* dismissed share sheet, or no clipboard permission */ }
	};

	const ics = (): void => {
		trackEvent('meetup_ics');
		const format = L.format[event.format];
		downloadIcs('petanque.ics', buildIcs({
			uid: `${event.id}@ludiven-studio.fr`,
			startsAt: event.starts_at,
			endsAt: event.ends_at,
			summary: `Pétanque — ${format}`,
			location: [place, event.commune].filter(Boolean).join(', '),
			description: tr(
				`${format}, ${event.players_needed} joueurs. Organisé par ${event.organizer_name}.\n${shareUrl}`,
				`${format}, ${event.players_needed} players. Organized by ${event.organizer_name}.\n${shareUrl}`,
			),
			url: shareUrl,
		}));
	};

	return (
		<section className="re-panel">
			<button type="button" className="re-close" onClick={onClose} aria-label={tr('Fermer', 'Close')}>×</button>

			{cancelled && <p className="re-banner re-banner--off">{tr('Cette partie a été annulée.', 'This game has been cancelled.')}</p>}
			{!cancelled && past && <p className="re-banner">{tr('Cette partie est passée.', 'This game is over.')}</p>}
			{!cancelled && event.hidden && (
				<p className="re-banner">{tr('Cette partie est en cours de vérification.', 'This game is being checked.')}</p>
			)}

			<h2>{L.format[event.format]}</h2>
			<p className="re-when">{day} · {formatSlot(event.starts_at, event.ends_at, lang)}</p>
			<p className="re-where">📍 {place}{event.commune && place !== event.commune ? ` · ${event.commune}` : ''}</p>
			{!event.confirmed && (
				<p className="re-hint">{tr('Terrain signalé par un joueur, pas encore confirmé.', 'Pitch added by a player, not confirmed yet.')}</p>
			)}

			<p className="re-seats">
				<strong>{event.seats_taken} / {event.players_needed}</strong> {tr('joueurs', 'players')}
				{left > 0
					? tr(<> · il manque <strong>{left}</strong></>, <> · <strong>{left}</strong> spot{left > 1 ? 's' : ''} left</>)
					: tr(' · complet', ' · full')}
			</p>
			{event.role_needed !== 'any' && (
				<p className="re-hint">
					{tr('Recherche surtout un', 'Mostly looking for a')} {L.role[event.role_needed].toLowerCase()}.
				</p>
			)}

			<ul className="re-who">
				<li>
					<strong>{event.organizer_name}</strong> ({tr('organisateur', 'organizer')})
					{event.organizer_seats > 1 ? ` ×${event.organizer_seats}` : ''}
				</li>
				{signups.map((s) => (
					<li key={s.id}>
						{s.player_name}{s.seats > 1 ? ` ×${s.seats}` : ''}
						{canFlagAbsent && !s.is_me && (absent.has(s.id) ? (
							<span className="re-absent re-absent--done"> · {tr('absent signalé', 'reported absent')}</span>
						) : (
							<>
								{' · '}
								<button
									type="button"
									className="re-link re-absent"
									disabled={sending}
									onClick={() => { void flagAbsent(s.id); }}
								>
									{tr("N'est pas venu", 'Did not come')}
								</button>
							</>
						))}
					</li>
				))}
			</ul>

			{flash && <p className="re-ok re-ok--loud" role="status">✅ {flash}</p>}
			{error && <p className="re-error" role="alert">{error}</p>}

			{!cancelled && !past && (
				/* The organizer already holds seats through `organizer_seats`, so offering them the
				   signup form reads as "post another one" — which is what it used to do. Their
				   action here is to change the game, not to enter it. */
				isOrganizer ? (
					<div className="re-actions">
						<p className="re-ok">{tr('Tu organises cette partie.', 'You are organizing this game.')}</p>
						<button type="button" className="re-btn" disabled={busy} onClick={onEdit}>
							{tr('Modifier la partie', 'Edit the game')}
						</button>
						{mine && (
							<button type="button" className="re-btn re-btn--ghost" disabled={busy} onClick={onLeave}>
								{tr('Me désinscrire', 'Leave the game')}
							</button>
						)}
					</div>
				) : mine ? (
					<div className="re-actions">
						<p className="re-ok">
							{tr(
								`Tu es inscrit${mine.seats > 1 ? ` à ${mine.seats}` : ''}.`,
								`You are signed up${mine.seats > 1 ? ` for ${mine.seats} seats` : ''}.`,
							)}
						</p>
						<button type="button" className="re-btn re-btn--ghost" disabled={busy} onClick={onLeave}>
							{tr('Me désinscrire', 'Leave the game')}
						</button>
					</div>
				) : (
					<form
						className="re-join"
						onSubmit={(e) => { e.preventDefault(); onJoin(seats, role, who); }}
					>
						<label>
							<span>{tr('Prénom', 'First name')}</span>
							<input value={who} onChange={(e) => setWho(e.target.value)} maxLength={24} placeholder="Léa" required />
						</label>
						<label>
							<span>{tr('Places', 'Seats')}</span>
							<select value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
								{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
							</select>
						</label>
						<label>
							<span>{tr('Je joue', 'I play')}</span>
							<select value={role} onChange={(e) => setRole(e.target.value as Role)}>
								{ROLES.map((r) => <option key={r} value={r}>{L.role[r]}</option>)}
							</select>
						</label>
						<button type="submit" className="re-btn" disabled={busy || left <= 0}>
							{left > 0 ? tr('Je viens', "I'm in") : tr('Complet', 'Full')}
						</button>
					</form>
				)
			)}

			<div className="re-tools">
				<button type="button" className="re-btn re-btn--ghost" disabled={placeSaved} onClick={onSavePlace}>
					{placeSaved ? tr('🏠 Lieu enregistré', '🏠 Place saved') : tr('🏠 Enregistrer ce lieu', '🏠 Save this place')}
				</button>
				<button type="button" className="re-btn re-btn--ghost" onClick={ics}>
					{tr('📅 Ajouter à mon agenda', '📅 Add to my calendar')}
				</button>
				<button type="button" className="re-btn re-btn--ghost" onClick={share}>
					{copied ? tr('✔ Lien copié', '✔ Link copied') : tr('🔗 Partager', '🔗 Share')}
				</button>
				{isOrganizer && !cancelled && (
					<button type="button" className="re-btn re-btn--danger" disabled={busy} onClick={onCancel}>
						{tr('Annuler la partie', 'Cancel the game')}
					</button>
				)}
			</div>

			{(!isOrganizer || reportError) && (
				<div className="re-report">
					{reportError && <p className="re-error" role="alert">{reportError}</p>}
					{!isOrganizer && (reported ? (
						<p className="re-hint" role="status">{tr('Merci, on va regarder.', 'Thanks, we will look into it.')}</p>
					) : reporting ? (
						<form className="re-reportform" onSubmit={(e) => { e.preventDefault(); void sendReport(); }}>
							<fieldset>
								<legend>{tr('Pourquoi signaler cette partie\u00a0?', 'Why report this game?')}</legend>
								{reasons.map((r) => (
									<label key={r}>
										<input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
										{L.report[r]}
									</label>
								))}
							</fieldset>
							<div className="re-actions">
								<button type="submit" className="re-btn" disabled={!reason || sending}>{tr('Envoyer', 'Send')}</button>
								<button type="button" className="re-btn re-btn--ghost" onClick={() => { setReporting(false); setReportError(null); }}>
									{tr('Annuler', 'Cancel')}
								</button>
							</div>
						</form>
					) : (
						<div className="re-reportlinks">
							<button
								type="button"
								className="re-link"
								onClick={() => { if (signedIn) setReporting(true); else onLogin(); }}
							>
								{tr('Signaler', 'Report')}
							</button>
							{canMute && (
								<button type="button" className="re-link" onClick={onMute}>
									{tr('Masquer les parties de cet organisateur', "Hide this organizer's games")}
								</button>
							)}
						</div>
					))}
				</div>
			)}

			{/* The only place the app appears (spec §10). The map is a service, not an ad. */}
			<a
				className="re-scanner"
				href={PATHS[lang].scanner}
				onClick={() => trackEvent('meetup_scanner_click')}
			>
				{tr(
					<>Vous jouez le {day.toLowerCase()}&nbsp;? <strong>Pétanque Scanner</strong> compte les points au téléphone.</>,
					<>Playing on {day}? <strong>Pétanque Scanner</strong> counts the points with your phone.</>,
				)}
			</a>
		</section>
	);
}
