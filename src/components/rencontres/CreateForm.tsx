import { useState } from 'react';
import {
	FORMATS, FORMAT_LABEL, PLAYERS_NEEDED, ROLES, ROLE_LABEL, validateEvent,
	type Format, type Role,
} from '../../lib/meetupRules';
import { defaultStart, toLocalInput } from './format';

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
	onPickAgain(): void;
	onCancel(): void;
	onSubmit(v: Draft): void;
}

const DURATIONS = [1, 2, 3, 4, 6];

/** Entirely closed except the first name: every other field is a list or a date
 *  (spec §8). Nothing here needs moderating. */
export default function CreateForm({ pin, name, busy, initial, onPickAgain, onCancel, onSubmit }: Props) {
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
		if (Number.isNaN(startsAt.getTime())) { setError('Date invalide.'); return; }
		const endsAt = new Date(startsAt.getTime() + hours * 3600_000);
		const draft = {
			startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
			format, playersNeeded, roleNeeded, organizerName, organizerSeats,
		};
		const problem = validateEvent(draft);
		if (problem) { setError(problem); return; }
		if (!editing && !pin) { setError('Pose une épingle sur la carte.'); return; }
		setError(null);
		onSubmit(draft);
	};

	return (
		<form className="re-form" onSubmit={submit}>
			<h2>{editing ? 'Modifier la partie' : 'Poser une partie'}</h2>

			{editing ? (
				<p className="re-hint">
					Le terrain et les inscrits ne bougent pas. Pour jouer ailleurs, annule cette partie et repose-en une.
				</p>
			) : (
				<p className={`re-pinstate ${pin ? 're-pinstate--set' : ''}`}>
					{pin
						? <>Épingle posée. <button type="button" className="re-link" onClick={onPickAgain}>Déplacer</button></>
						: <>Touche la carte pour poser l'épingle à l'endroit où vous jouez.</>}
				</p>
			)}

			<label>
				<span>Quand</span>
				<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
			</label>

			<label>
				<span>Durée</span>
				<select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
					{durations.map((h) => <option key={h} value={h}>{h} h</option>)}
				</select>
			</label>

			<label>
				<span>Format</span>
				<select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
					{FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
				</select>
			</label>

			<label>
				<span>Joueurs au total</span>
				<select value={playersNeeded} onChange={(e) => setPlayersNeeded(Number(e.target.value))}>
					{PLAYERS_NEEDED.map((n) => <option key={n} value={n}>{n} joueurs</option>)}
				</select>
			</label>

			<label>
				<span>On cherche</span>
				<select value={roleNeeded} onChange={(e) => setRoleNeeded(e.target.value as Role)}>
					{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
				</select>
			</label>

			{!editing && (
				<>
					<label>
						<span>Ton prénom</span>
						<input value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} maxLength={24} placeholder="Raph" required />
					</label>

					<label>
						<span>Tu viens à</span>
						<select value={organizerSeats} onChange={(e) => setOrganizerSeats(Number(e.target.value))}>
							{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
						</select>
					</label>
				</>
			)}

			{error && <p className="re-error">{error}</p>}

			<div className="re-formactions">
				<button type="button" className="re-btn re-btn--ghost" onClick={onCancel}>
					{editing ? 'Revenir' : 'Annuler'}
				</button>
				<button type="submit" className="re-btn" disabled={busy || (!editing && !pin)}>
					{busy ? 'Envoi…' : editing ? 'Enregistrer' : 'Publier la partie'}
				</button>
			</div>
		</form>
	);
}
