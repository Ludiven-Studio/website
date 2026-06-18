import { useState, useEffect, useCallback, useRef } from 'react';
import {
	fetchLeaderboard,
	submitDaily,
	playerName,
	setPlayerName,
	leaderboardEnabled,
	type Metric,
	type ScoreRow,
} from '../lib/leaderboard';

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

interface Props {
	game: string;
	metric: Metric;
	/** Value of a just-finished daily run to submit (omit when only viewing). */
	submitValue?: number;
}

export default function Leaderboard({ game, metric, submitValue }: Props) {
	const [name, setName] = useState<string>(() => playerName());
	const [draft, setDraft] = useState('');
	const [rows, setRows] = useState<ScoreRow[]>([]);
	const [loading, setLoading] = useState(true);
	const submitted = useRef(false);

	const load = useCallback(async () => {
		setLoading(true);
		if (submitValue != null && name && !submitted.current) {
			submitted.current = true;
			await submitDaily(game, submitValue, metric);
		}
		setRows(await fetchLeaderboard(game, metric));
		setLoading(false);
	}, [game, metric, submitValue, name]);

	useEffect(() => {
		load();
	}, [load]);

	const save = () => {
		const n = draft.trim().slice(0, 20);
		if (!n) return;
		setPlayerName(n);
		submitted.current = false; // allow submitting the pending run under the new name
		setName(n);
	};

	const me = name.toLowerCase();
	const fmt = (v: number) => (metric === 'time' ? fmtTime(v) : String(v));

	return (
		<div className="lb-root">
			<style>{CSS}</style>
			<h3 className="lb-title">Classement du jour</h3>

			{!leaderboardEnabled() ? (
				<p className="lb-msg">Le classement n'est pas encore configuré.</p>
			) : (
				<>
					{submitValue != null && !name && (
						<div className="lb-name">
							<input
								type="text"
								maxLength={20}
								placeholder="Ton pseudo"
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								onKeyDown={(e) => e.key === 'Enter' && save()}
								aria-label="Pseudo"
							/>
							<button onClick={save}>Valider</button>
						</div>
					)}

					{loading ? (
						<p className="lb-msg">Chargement…</p>
					) : rows.length === 0 ? (
						<p className="lb-msg">Personne n'a encore joué aujourd'hui. À toi de lancer le classement&nbsp;!</p>
					) : (
						<ol className="lb-list">
							{rows.map((r, i) => (
								<li key={`${r.name}-${i}`} className={`lb-row ${r.name.toLowerCase() === me ? 'me' : ''}`}>
									<span className="lb-rank">{i + 1}</span>
									<span className="lb-pname">{r.name}</span>
									<span className="lb-val">{fmt(r.value)}</span>
								</li>
							))}
						</ol>
					)}
				</>
			)}
		</div>
	);
}

const CSS = `
.lb-root {
  width: 100%;
  max-width: 360px;
  margin: 1.25rem auto 0;
  color: var(--gray-0);
  font-family: var(--font-body);
}
.lb-title {
  font-family: var(--font-brand); font-weight: 600; font-size: 16px;
  text-align: center; margin: 0 0 0.75rem; color: var(--gray-0);
}
.lb-msg { text-align: center; color: var(--gray-300); font-size: 13px; line-height: 1.5; margin: 0; }

.lb-name { display: flex; gap: 8px; justify-content: center; margin-bottom: 0.9rem; }
.lb-name input {
  font: inherit; color: var(--gray-0); background: var(--gray-999);
  border: 1.5px solid var(--gray-700); border-radius: 999px; padding: 6px 14px; min-width: 0; flex: 1;
}
.lb-name input:focus-visible { outline: none; border-color: var(--accent-regular); }
.lb-name button {
  border: none; background: var(--accent-regular); color: var(--accent-text-over);
  font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 6px 16px; cursor: pointer;
}

.lb-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.lb-row {
  display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: 10px;
  padding: 7px 12px; border-radius: 10px; background: var(--gray-999_40); border: 1px solid var(--gray-800);
  font-size: 14px;
}
.lb-row.me { border-color: var(--accent-regular); background: var(--accent-overlay); }
.lb-rank { font-weight: 700; color: var(--gray-300); text-align: center; font-variant-numeric: tabular-nums; }
.lb-pname { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-val { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent-regular); }
`;
