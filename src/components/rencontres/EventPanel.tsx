import { useState } from 'react';
import { FORMAT_LABEL, ROLE_LABEL, ROLES, seatsLeft, type MeetupEvent, type MeetupSignup, type Role } from '../../lib/meetupRules';
import { buildIcs, downloadIcs } from '../../lib/meetupIcs';
import { trackEvent } from '../../lib/analytics';
import { formatDay, formatSlot } from './format';

interface Props {
	event: MeetupEvent;
	signups: readonly MeetupSignup[];
	isOrganizer: boolean;
	playerId: string;
	name: string;
	busy: boolean;
	shareUrl: string;
	onJoin(seats: number, role: Role, name: string): void;
	onLeave(): void;
	onEdit(): void;
	onCancel(): void;
	onClose(): void;
}

export default function EventPanel({
	event, signups, isOrganizer, playerId, name, busy, shareUrl, onJoin, onLeave, onEdit, onCancel, onClose,
}: Props) {
	const mine = signups.find((s) => s.player_id === playerId);
	const [seats, setSeats] = useState(mine?.seats ?? 1);
	const [role, setRole] = useState<Role>(mine?.role ?? 'any');
	const [who, setWho] = useState(mine?.player_name ?? name);
	const [copied, setCopied] = useState(false);

	const left = seatsLeft(event);
	const past = Date.parse(event.ends_at) < Date.now();
	const cancelled = event.status === 'cancelled';
	const place = event.label || 'Terrain sur la carte';

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
					<li key={s.player_id}>{s.player_name}{s.seats > 1 ? ` ×${s.seats}` : ''}</li>
				))}
			</ul>

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
