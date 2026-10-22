import { useState } from 'react';
import type { MeetupEvent } from '../../lib/meetupRules';
import { formatShortDay, formatTime } from './format';
import { labels, pick, useLang } from './i18n';

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
	/** Only a game this device holds a secret for: the account's games come back anyway. */
	canForget(id: string): boolean;
}

const startOf = (e: MeetupEvent): number => Date.parse(e.starts_at);
const isLive = (e: MeetupEvent, now: number): boolean => e.status === 'open' && Date.parse(e.ends_at) >= now;

export default function MyGames({ events, active, max, busy, onOpen, onEdit, onRemove, onForget, canForget }: Props) {
	const lang = useLang();
	const tr = pick(lang);
	const L = labels(lang);
	const [showPast, setShowPast] = useState(false);
	const now = Date.now();
	const live = events.filter((e) => isLive(e, now)).sort((a, b) => startOf(a) - startOf(b));
	const past = events.filter((e) => !isLive(e, now)).sort((a, b) => startOf(b) - startOf(a));
	const rows = showPast ? [...live, ...past] : live;
	const signedUp = (n: number): string => tr(`${n} inscrit${n > 1 ? 's' : ''}`, `${n} signed up`);

	return (
		<section className="re-mine" aria-label={tr('Mes parties', 'My games')}>
			<h2>
				{tr('Mes parties', 'My games')}
				<span className="re-mine-cap">{active} / {max} {tr('en ligne', 'online')}</span>
			</h2>

			{live.length === 0 && (
				<p className="re-hint">{tr(`Aucune partie en ligne. Tu peux en poser ${max}.`, `No game online. You can post ${max}.`)}</p>
			)}

			<ul>
				{rows.map((e) => {
					const joined = e.seats_taken - e.organizer_seats;
					const running = isLive(e, now);
					const state = e.status === 'cancelled' ? tr('Annulée', 'Cancelled')
						: running ? tr('En ligne', 'Online') : tr('Terminée', 'Over');
					return (
						<li key={e.id} className={`re-mine-row ${running ? '' : 're-mine-row--off'}`}>
							<button type="button" className="re-mine-open" onClick={() => onOpen(e.id)}>
								<span className="re-mine-when">{formatShortDay(e.starts_at, lang)} · {formatTime(e.starts_at, lang)}</span>
								<span className="re-mine-what">{L.format[e.format]} · {e.label || tr('Terrain', 'Pitch')}</span>
								<span className="re-mine-state">
									{state}{joined > 0 ? ` · ${signedUp(joined)}` : ''}
								</span>
							</button>
							<div className="re-mine-acts">
								{running && (
									<button type="button" className="re-btn re-btn--ghost" disabled={busy} onClick={() => onEdit(e.id)}>
										{tr('Modifier', 'Edit')}
									</button>
								)}
								{joined === 0 ? (
									<button type="button" className="re-btn re-btn--danger" disabled={busy} onClick={() => onRemove(e)}>
										{tr('Supprimer', 'Delete')}
									</button>
								) : running ? (
									<button
										type="button"
										className="re-btn re-btn--danger"
										disabled={busy}
										title={tr('Le lien reste en ligne pour prévenir les inscrits', 'The link stays online to tell the players')}
										onClick={() => onRemove(e)}
									>
										{tr('Annuler', 'Cancel')} — {signedUp(joined)}
									</button>
								) : canForget(e.id) && (
									<button type="button" className="re-btn re-btn--ghost" onClick={() => onForget(e.id)}>
										{tr('Retirer de ma liste', 'Remove from my list')}
									</button>
								)}
							</div>
						</li>
					);
				})}
			</ul>

			{past.length > 0 && (
				<button type="button" className="re-link" onClick={() => setShowPast((v) => !v)}>
					{showPast ? tr('Masquer', 'Hide') : tr(`Voir les parties passées (${past.length})`, `Show past games (${past.length})`)}
				</button>
			)}
		</section>
	);
}
