import { useState } from 'react';
import {
	FORMATS, FORMAT_LABEL, PLAYERS_NEEDED, ROLES, ROLE_LABEL, validateEvent,
	type Format, type Role,
} from '../../lib/meetupRules';
import { defaultStart, toLocalInput } from './format';

interface Props {
	pin: { lat: number; lng: number } | null;
	name: string;
	busy: boolean;
	onPickAgain(): void;
	onCancel(): void;
	onSubmit(v: {
		startsAt: string; endsAt: string; format: Format; playersNeeded: number;
		roleNeeded: Role; organizerName: string; organizerSeats: number;
	}): void;
}

const DURATIONS = [1, 2, 3, 4, 6];

/** Entirely closed except the first name: every other field is a list or a date
 *  (spec §8). Nothing here needs moderating. */
export default function CreateForm({ pin, name, busy, onPickAgain, onCancel, onSubmit }: Props) {
	const [start, setStart] = useState(() => toLocalInput(defaultStart()));
	const [hours, setHours] = useState(3);
	const [format, setFormat] = useState<Format>('doublette');
	const [playersNeeded, setPlayersNeeded] = useState(4);
	const [roleNeeded, setRoleNeeded] = useState<Role>('any');
	const [organizerName, setOrganizerName] = useState(name);
	const [organizerSeats, setOrganizerSeats] = useState(1);
	const [error, setError] = useState<string | null>(null);

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
		if (!pin) { setError('Pose une épingle sur la carte.'); return; }
		setError(null);
		onSubmit(draft);
	};

	return (
		<form className="re-form" onSubmit={submit}>
			<h2>Poser une partie</h2>

			<p className={`re-pinstate ${pin ? 're-pinstate--set' : ''}`}>
				{pin
					? <>Épingle posée. <button type="button" className="re-link" onClick={onPickAgain}>Déplacer</button></>
					: <>Touche la carte pour poser l'épingle à l'endroit où vous jouez.</>}
			</p>

			<label>
				<span>Quand</span>
				<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
			</label>

			<label>
				<span>Durée</span>
				<select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
					{DURATIONS.map((h) => <option key={h} value={h}>{h} h</option>)}
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

			{error && <p className="re-error">{error}</p>}

			<div className="re-formactions">
				<button type="button" className="re-btn re-btn--ghost" onClick={onCancel}>Annuler</button>
				<button type="submit" className="re-btn" disabled={busy || !pin}>
					{busy ? 'Envoi…' : 'Publier la partie'}
				</button>
			</div>
		</form>
	);
}
