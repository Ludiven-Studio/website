import { useState } from 'react';
import {
	FORMATS, PLAYERS_NEEDED, ROLES, validateEvent,
	type Format, type Role,
} from '../../lib/meetupRules';
import { defaultStart, toLocalInput } from './format';
import { labels, pick, useLang } from './i18n';

export interface Draft {
	startsAt: string; endsAt: string; format: Format; playersNeeded: number;
	roleNeeded: Role; organizerName: string; organizerSeats: number;
}

interface Props {
	pin: { lat: number; lng: number } | null;
	name: string;
	busy: boolean;
	/** Present = edit an existing game rather than post a new one. The spot and the
	 *  organizer are then fixed: `update_event` patches the slot, the format, the role
	 *  and the head count, and refuses everything else. Showing a field the server
	 *  would drop is how a form starts lying. */
	initial?: Draft | null;
	/** What the server said. It belongs here and not in a page banner: the form is
	 *  a screen tall, and a refusal painted above it reads as nothing happening. */
	error?: string | null;
	onPickAgain(): void;
	onCancel(): void;
	onSubmit(v: Draft): void;
}

const DURATIONS = [1, 2, 3, 4, 6];

/** Entirely closed except the first name: every other field is a list or a date
 *  (spec §8). Nothing here needs moderating. Its refusals (validateEvent) are French
 *  only: posting happens in the app while the site is browse-only. */
export default function CreateForm({ pin, name, busy, initial, error: refused, onPickAgain, onCancel, onSubmit }: Props) {
	const lang = useLang();
	const tr = pick(lang);
	const L = labels(lang);
	const editing = Boolean(initial);
	const [start, setStart] = useState(() => toLocalInput(initial ? new Date(initial.startsAt) : defaultStart()));
	const [hours, setHours] = useState(() => (initial
		? Math.max(1, Math.round((Date.parse(initial.endsAt) - Date.parse(initial.startsAt)) / 3600_000))
		: 3));
	const [format, setFormat] = useState<Format>(initial?.format ?? 'doublette');
	const [playersNeeded, setPlayersNeeded] = useState(initial?.playersNeeded ?? 4);
	const [roleNeeded, setRoleNeeded] = useState<Role>(initial?.roleNeeded ?? 'any');
	const [organizerName, setOrganizerName] = useState(initial?.organizerName ?? name);
	const [organizerSeats, setOrganizerSeats] = useState(initial?.organizerSeats ?? 1);
	const [error, setError] = useState<string | null>(null);

	// A duration off the list (an older game, a hand-made row) must still show its own
	// value, or the select renders blank and silently re-times the game on save.
	const durations = DURATIONS.includes(hours) ? DURATIONS : [...DURATIONS, hours].sort((a, b) => a - b);

	const submit = (e: React.FormEvent): void => {
		e.preventDefault();
		const startsAt = new Date(start);
		if (Number.isNaN(startsAt.getTime())) { setError(tr('Date invalide.', 'Invalid date.')); return; }
		const endsAt = new Date(startsAt.getTime() + hours * 3600_000);
		const draft = {
			startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
			format, playersNeeded, roleNeeded, organizerName, organizerSeats,
		};
		const problem = validateEvent(draft);
		if (problem) { setError(problem); return; }
		if (!editing && !pin) { setError(tr('Pose une épingle sur la carte.', 'Drop a pin on the map.')); return; }
		setError(null);
		onSubmit(draft);
	};

	return (
		<form className="re-form" onSubmit={submit}>
			<h2>{editing ? tr('Modifier la partie', 'Edit the game') : tr('Poser une partie', 'Post a game')}</h2>

			{editing ? (
				<p className="re-hint">
					{tr(
						'Le terrain et les inscrits ne bougent pas. Pour jouer ailleurs, annule cette partie et repose-en une.',
						'The pitch and the players stay. To play somewhere else, cancel this game and post a new one.',
					)}
				</p>
			) : (
				<p className={`re-pinstate ${pin ? 're-pinstate--set' : ''}`}>
					{pin
						? <>{tr('Épingle posée.', 'Pin dropped.')} <button type="button" className="re-link" onClick={onPickAgain}>{tr('Déplacer', 'Move')}</button></>
						: tr("Touche la carte pour poser l'épingle à l'endroit où vous jouez.", 'Tap the map to drop the pin where you play.')}
				</p>
			)}

			<label>
				<span>{tr('Quand', 'When')}</span>
				<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
			</label>

			<label>
				<span>{tr('Durée', 'Duration')}</span>
				<select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
					{durations.map((h) => <option key={h} value={h}>{h} h</option>)}
				</select>
			</label>

			<label>
				<span>Format</span>
				<select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
					{FORMATS.map((f) => <option key={f} value={f}>{L.format[f]}</option>)}
				</select>
			</label>

			<label>
				<span>{tr('Joueurs au total', 'Players in total')}</span>
				<select value={playersNeeded} onChange={(e) => setPlayersNeeded(Number(e.target.value))}>
					{PLAYERS_NEEDED.map((n) => <option key={n} value={n}>{n} {tr('joueurs', 'players')}</option>)}
				</select>
			</label>

			<label>
				<span>{tr('On cherche', 'Looking for')}</span>
				<select value={roleNeeded} onChange={(e) => setRoleNeeded(e.target.value as Role)}>
					{ROLES.map((r) => <option key={r} value={r}>{L.role[r]}</option>)}
				</select>
			</label>

			{!editing && (
				<>
					<label>
						<span>{tr('Ton prénom', 'Your first name')}</span>
						<input value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} maxLength={24} placeholder="Raph" required />
					</label>

					<label>
						<span>{tr('Tu viens à', 'Your seats')}</span>
						<select value={organizerSeats} onChange={(e) => setOrganizerSeats(Number(e.target.value))}>
							{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
						</select>
					</label>
				</>
			)}

			{/* Local first: it is the fresher of the two, since a draft that fails here
			    never reached the server. */}
			{(error ?? refused) && <p className="re-error" role="alert">{error ?? refused}</p>}

			<div className="re-formactions">
				<button type="button" className="re-btn re-btn--ghost" onClick={onCancel}>
					{editing ? tr('Revenir', 'Back') : tr('Annuler', 'Cancel')}
				</button>
				<button type="submit" className="re-btn" disabled={busy || (!editing && !pin)}>
					{busy ? tr('Envoi…', 'Sending…') : editing ? tr('Enregistrer', 'Save') : tr('Publier la partie', 'Post the game')}
				</button>
			</div>
		</form>
	);
}
