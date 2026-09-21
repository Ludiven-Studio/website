import { useState } from 'react';
import { FORMAT_LABEL, type MeetupEvent } from '../../lib/meetupRules';
import { formatShortDay, formatTime } from './format';

interface Props {
	events: MeetupEvent[];
	/** Open, not-yet-finished games counted by the SERVER. It can exceed what is
	 *  listed below — a cleared browser loses the secrets, not the games. */
	active: number;
	max: number;
	busy: boolean;
	onOpen(id: string): void;
	onEdit(id: string): void;
	/** Deletes when nobody has joined, cancels when someone has. The caller decides
	 *  again on its side: this is a label, not the rule. */
	onRemove(event: MeetupEvent): void;
	/** Drops the secret from this device only. The row's last exit once the game is
	 *  over and the signups keep it from being deleted. */
	onForget(id: string): void;
}

const startOf = (e: MeetupEvent): number => Date.parse(e.starts_at);
const isLive = (e: MeetupEvent, now: number): boolean => e.status === 'open' && Date.parse(e.ends_at) >= now;

export default function MyGames({ events, active, max, busy, onOpen, onEdit, onRemove, onForget }: Props) {
	const [showPast, setShowPast] = useState(false);
	const now = Date.now();
	const live = events.filter((e) => isLive(e, now)).sort((a, b) => startOf(a) - startOf(b));
	const past = events.filter((e) => !isLive(e, now)).sort((a, b) => startOf(b) - startOf(a));
	const rows = showPast ? [...live, ...past] : live;

	return (
		<section className="re-mine" aria-label="Mes parties">
			<h2>
				Mes parties
				<span className="re-mine-cap">{active} / {max} en ligne</span>
			</h2>

			{live.length === 0 && (
				<p className="re-hint">Aucune partie en ligne. Tu peux en poser {max}.</p>
			)}

			<ul>
				{rows.map((e) => {
					const joined = e.seats_taken - e.organizer_seats;
					const running = isLive(e, now);
					const state = e.status === 'cancelled' ? 'Annulée' : running ? 'En ligne' : 'Terminée';
					return (
						<li key={e.id} className={`re-mine-row ${running ? '' : 're-mine-row--off'}`}>
							<button type="button" className="re-mine-open" onClick={() => onOpen(e.id)}>
								<span className="re-mine-when">{formatShortDay(e.starts_at)} · {formatTime(e.starts_at)}</span>
								<span className="re-mine-what">{FORMAT_LABEL[e.format]} · {e.label || 'Terrain'}</span>
								<span className="re-mine-state">
									{state}{joined > 0 ? ` · ${joined} inscrit${joined > 1 ? 's' : ''}` : ''}
								</span>
							</button>
							<div className="re-mine-acts">
								{running && (
									<button type="button" className="re-btn re-btn--ghost" disabled={busy} onClick={() => onEdit(e.id)}>
										Modifier
									</button>
								)}
								{joined === 0 ? (
									<button type="button" className="re-btn re-btn--danger" disabled={busy} onClick={() => onRemove(e)}>
										Supprimer
									</button>
								) : running ? (
									<button
										type="button"
										className="re-btn re-btn--danger"
										disabled={busy}
										title="Le lien reste en ligne pour prévenir les inscrits"
										onClick={() => onRemove(e)}
									>
										Annuler — {joined} inscrit{joined > 1 ? 's' : ''}
									</button>
								) : (
									<button type="button" className="re-btn re-btn--ghost" onClick={() => onForget(e.id)}>
										Retirer de ma liste
									</button>
								)}
							</div>
						</li>
					);
				})}
			</ul>

			{past.length > 0 && (
				<button type="button" className="re-link" onClick={() => setShowPast((v) => !v)}>
					{showPast ? 'Masquer' : `Voir les parties passées (${past.length})`}
				</button>
			)}
		</section>
	);
}
