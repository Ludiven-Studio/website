import { useState } from 'react';
import {
	FORMAT_LABEL, REPORT_LABEL, REPORT_REASONS, ROLE_LABEL, ROLES, seatsLeft,
	type MeetupEvent, type MeetupSignup, type ReportReason, type Role,
} from '../../lib/meetupRules';
import { buildIcs, downloadIcs } from '../../lib/meetupIcs';
import { trackEvent } from '../../lib/analytics';
import { formatDay, formatSlot } from './format';

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
	const place = event.label || 'Terrain sur la carte';
	const started = Date.parse(event.starts_at) <= Date.now();
	// The server refuses 'no_show' otherwise: don't offer what it will turn down.
	const reasons = REPORT_REASONS.filter((r) => r !== 'no_show' || (Boolean(mine) && started));
	const canFlagAbsent = isOrganizer && started && !cancelled;

	const sendReport = async (): Promise<void> => {
		if (!reason) return;
		setSending(true);
		setReportError(null);
		try {
			await onReport(reason);
			setReported(true);
			setReporting(false);
		} catch (e) {
			setReportError(e instanceof Error ? e.message : 'Une erreur est survenue.');
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
			setReportError(e instanceof Error ? e.message : 'Une erreur est survenue.');
		} finally {
			setSending(false);
		}
	};

	const share = async (): Promise<void> => {
		trackEvent('meetup_share');
		const text = `Pétanque ${FORMAT_LABEL[event.format]} — ${formatDay(event.starts_at)} à ${place}`;
		try {
			if (navigator.share) { await navigator.share({ title: 'Partie de pétanque', text, url: shareUrl }); return; }
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch { /* dismissed share sheet, or no clipboard permission */ }
	};

	const ics = (): void => {
		trackEvent('meetup_ics');
		downloadIcs('petanque.ics', buildIcs({
			uid: `${event.id}@ludiven-studio.fr`,
			startsAt: event.starts_at,
			endsAt: event.ends_at,
			summary: `Pétanque — ${FORMAT_LABEL[event.format]}`,
			location: [place, event.commune].filter(Boolean).join(', '),
			description: `${FORMAT_LABEL[event.format]}, ${event.players_needed} joueurs. Organisé par ${event.organizer_name}.\n${shareUrl}`,
			url: shareUrl,
		}));
	};

	return (
		<section className="re-panel">
			<button type="button" className="re-close" onClick={onClose} aria-label="Fermer">×</button>

			{cancelled && <p className="re-banner re-banner--off">Cette partie a été annulée.</p>}
			{!cancelled && past && <p className="re-banner">Cette partie est passée.</p>}
			{!cancelled && event.hidden && <p className="re-banner">Cette partie est en cours de vérification.</p>}

			<h2>{FORMAT_LABEL[event.format]}</h2>
			<p className="re-when">{formatDay(event.starts_at)} · {formatSlot(event.starts_at, event.ends_at)}</p>
			<p className="re-where">📍 {place}{event.commune && place !== event.commune ? ` · ${event.commune}` : ''}</p>
			{!event.confirmed && <p className="re-hint">Terrain signalé par un joueur, pas encore confirmé.</p>}

			<p className="re-seats">
				<strong>{event.seats_taken} / {event.players_needed}</strong> joueurs
				{left > 0 ? <> · il manque <strong>{left}</strong></> : <> · complet</>}
			</p>
			{event.role_needed !== 'any' && <p className="re-hint">Recherche surtout un {ROLE_LABEL[event.role_needed].toLowerCase()}.</p>}

			<ul className="re-who">
				<li><strong>{event.organizer_name}</strong> (organisateur){event.organizer_seats > 1 ? ` ×${event.organizer_seats}` : ''}</li>
				{signups.map((s) => (
					<li key={s.id}>
						{s.player_name}{s.seats > 1 ? ` ×${s.seats}` : ''}
						{canFlagAbsent && !s.is_me && (absent.has(s.id) ? (
							<span className="re-absent re-absent--done"> · absent signalé</span>
						) : (
							<>
								{' · '}
								<button
									type="button"
									className="re-link re-absent"
									disabled={sending}
									onClick={() => { void flagAbsent(s.id); }}
								>
									N'est pas venu
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
						<p className="re-ok">Tu organises cette partie.</p>
						<button type="button" className="re-btn" disabled={busy} onClick={onEdit}>
							Modifier la partie
						</button>
						{mine && (
							<button type="button" className="re-btn re-btn--ghost" disabled={busy} onClick={onLeave}>
								Me désinscrire
							</button>
						)}
					</div>
				) : mine ? (
					<div className="re-actions">
						<p className="re-ok">Tu es inscrit{mine.seats > 1 ? ` à ${mine.seats}` : ''}.</p>
						<button type="button" className="re-btn re-btn--ghost" disabled={busy} onClick={onLeave}>
							Me désinscrire
						</button>
					</div>
				) : (
					<form
						className="re-join"
						onSubmit={(e) => { e.preventDefault(); onJoin(seats, role, who); }}
					>
						<label>
							<span>Prénom</span>
							<input value={who} onChange={(e) => setWho(e.target.value)} maxLength={24} placeholder="Léa" required />
						</label>
						<label>
							<span>Places</span>
							<select value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
								{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
							</select>
						</label>
						<label>
							<span>Je joue</span>
							<select value={role} onChange={(e) => setRole(e.target.value as Role)}>
								{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
							</select>
						</label>
						<button type="submit" className="re-btn" disabled={busy || left <= 0}>
							{left > 0 ? 'Je viens' : 'Complet'}
						</button>
					</form>
				)
			)}

			<div className="re-tools">
				<button type="button" className="re-btn re-btn--ghost" disabled={placeSaved} onClick={onSavePlace}>
					{placeSaved ? '🏠 Lieu enregistré' : '🏠 Enregistrer ce lieu'}
				</button>
				<button type="button" className="re-btn re-btn--ghost" onClick={ics}>📅 Ajouter à mon agenda</button>
				<button type="button" className="re-btn re-btn--ghost" onClick={share}>
					{copied ? '✔ Lien copié' : '🔗 Partager'}
				</button>
				{isOrganizer && !cancelled && (
					<button type="button" className="re-btn re-btn--danger" disabled={busy} onClick={onCancel}>
						Annuler la partie
					</button>
				)}
			</div>

			{(!isOrganizer || reportError) && (
				<div className="re-report">
					{reportError && <p className="re-error" role="alert">{reportError}</p>}
					{!isOrganizer && (reported ? (
						<p className="re-hint" role="status">Merci, on va regarder.</p>
					) : reporting ? (
						<form className="re-reportform" onSubmit={(e) => { e.preventDefault(); void sendReport(); }}>
							<fieldset>
								<legend>Pourquoi signaler cette partie&nbsp;?</legend>
								{reasons.map((r) => (
									<label key={r}>
										<input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
										{REPORT_LABEL[r]}
									</label>
								))}
							</fieldset>
							<div className="re-actions">
								<button type="submit" className="re-btn" disabled={!reason || sending}>Envoyer</button>
								<button type="button" className="re-btn re-btn--ghost" onClick={() => { setReporting(false); setReportError(null); }}>
									Annuler
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
								Signaler
							</button>
							{canMute && (
								<button type="button" className="re-link" onClick={onMute}>
									Masquer les parties de cet organisateur
								</button>
							)}
						</div>
					))}
				</div>
			)}

			{/* The only place the app appears (spec §10). The map is a service, not an ad. */}
			<a
				className="re-scanner"
				href="/petanque-scanner/"
				onClick={() => trackEvent('meetup_scanner_click')}
			>
				Vous jouez le {formatDay(event.starts_at).toLowerCase()}&nbsp;? <strong>Pétanque Scanner</strong> compte les points au téléphone.
			</a>
		</section>
	);
}
