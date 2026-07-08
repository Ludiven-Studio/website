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
import { games } from '../data/games';

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

interface Props {
	game: string;
	metric: Metric;
	/** Value of a just-finished daily run to submit (omit when only viewing). */
	submitValue?: number;
	/** Custom value formatter (e.g. to decode an encoded value). Defaults to time/score. */
	format?: (v: number) => string;
}

export default function Leaderboard({ game, metric, submitValue, format }: Props) {
	const [name, setName] = useState<string>(() => playerName());
	const [draft, setDraft] = useState('');
	const [editing, setEditing] = useState(false);
	const [rows, setRows] = useState<ScoreRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [shareMsg, setShareMsg] = useState('');
	const lastSubmittedRef = useRef<number | null>(null); // last value sent (re-submit when it improves)

	const load = useCallback(async () => {
		setLoading(true);
		// Submit whenever the value changes (e.g. a new best lap); submitDaily only posts if it actually beats the day's best.
		if (submitValue != null && name && submitValue !== lastSubmittedRef.current) {
			lastSubmittedRef.current = submitValue;
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
		lastSubmittedRef.current = null; // allow submitting the pending run under the new name
		setName(n);
		setEditing(false);
	};

	const startEdit = () => {
		setDraft(name);
		setEditing(true);
	};

	const me = name.toLowerCase();
	const fmt = format ?? ((v: number) => (metric === 'time' ? fmtTime(v) : String(v)));
	const showInput = editing || (submitValue != null && !name);

	// Spoiler-free result share (Wordle-style): score/rank + same-daily deep link.
	const share = async (): Promise<void> => {
		if (submitValue == null) return;
		const title = games.find((g) => g.id === game)?.title ?? game;
		const url = `${location.origin}/jeux/${game}?defi`;
		const line = metric === 'time' ? `⏱️ ${fmt(submitValue)}` : `🏆 ${fmt(submitValue)} pts`;
		const text = `${title} — Défi du jour\n${line}`;
		try {
			if (navigator.share) {
				await navigator.share({ title: `${title} — Défi du jour`, text, url });
				setShareMsg('Partagé !');
			} else {
				await navigator.clipboard.writeText(`${text}\n${url}`);
				setShareMsg('Lien copié !');
			}
		} catch {
			return; // user cancelled — no toast
		}
		setTimeout(() => setShareMsg(''), 1600);
	};

	return (
		<div className="lb-root">
			<style>{CSS}</style>
			<h3 className="lb-title">Classement du jour</h3>

			{submitValue != null && (
				<div className="lb-share-row">
					<button className="lb-share" onClick={share}>📣 Partager mon score</button>
					{shareMsg && <span className="lb-share-msg">{shareMsg}</span>}
				</div>
			)}

			{!leaderboardEnabled() ? (
				<p className="lb-msg">Le classement n'est pas encore configuré.</p>
			) : (
				<>
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

					{showInput ? (
						<div className="lb-name">
							<input
								type="text"
								maxLength={20}
								placeholder="Ton pseudo"
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								onKeyDown={(e) => e.key === 'Enter' && save()}
								aria-label="Pseudo"
								autoFocus
							/>
							<button onClick={save}>Valider</button>
							{editing && (
								<button className="lb-cancel" onClick={() => setEditing(false)}>Annuler</button>
							)}
						</div>
					) : (
						<p className="lb-foot">
							{name ? (
								<>
									Pseudo : <strong>{name}</strong> ·{' '}
									<button className="lb-link" onClick={startEdit}>Changer</button>
								</>
							) : (
								<button className="lb-link" onClick={startEdit}>Définir un pseudo</button>
							)}
						</p>
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

.lb-share-row { display: flex; align-items: center; gap: 10px; justify-content: center; margin: 0 0 0.9rem; flex-wrap: wrap; }
.lb-share { border: none; background: var(--accent-regular); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 13.5px; border-radius: 999px; padding: 8px 18px; cursor: pointer; box-shadow: var(--shadow-sm); }
.lb-share:hover { filter: brightness(1.05); }
.lb-share-msg { font-size: 12.5px; font-weight: 600; color: var(--accent-regular); }

.lb-name { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 0.9rem; }
.lb-name input {
  font: inherit; color: var(--gray-0); background: var(--gray-999);
  border: 1.5px solid var(--gray-700); border-radius: 999px; padding: 6px 14px; min-width: 0; flex: 1;
}
.lb-name input:focus-visible { outline: none; border-color: var(--accent-regular); }
.lb-name button {
  border: none; background: var(--accent-regular); color: var(--accent-text-over);
  font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 6px 16px; cursor: pointer;
}
.lb-name button.lb-cancel { background: var(--gray-800); color: var(--gray-0); }

.lb-foot { text-align: center; color: var(--gray-300); font-size: 12.5px; margin: 0.9rem 0 0; }
.lb-foot strong { color: var(--gray-0); }
.lb-link {
  border: none; background: none; padding: 0; cursor: pointer;
  font: inherit; font-size: 12.5px; font-weight: 600; color: var(--accent-regular); text-decoration: underline;
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
