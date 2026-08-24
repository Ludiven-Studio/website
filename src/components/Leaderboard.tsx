import { useState, useEffect, useCallback, useRef } from 'react';
import {
	fetchLeaderboard,
	submitDaily,
	playerName,
	setPlayerName,
	leaderboardEnabled,
	todayKey,
	type Metric,
	type ScoreRow,
} from '../lib/leaderboard';
import { games } from '../data/games';
import { fmtCentisExact } from '../lib/scoreFormat';
import { isSecured } from '../data/securedGames';
import { submitScore, getLeaderboard } from '../lib/scores';
import { gameStreak } from '../lib/streak';
import { equippedBlason } from '../lib/wallet';
import { trackEvent } from '../lib/analytics';
import ErrorBoundary from './ErrorBoundary';

// Time leaderboards store CENTISECONDS; a game may still pass its own `format`.

interface Props {
	game: string;
	metric: Metric;
	/** Value of a just-finished daily run to submit (omit when only viewing). */
	submitValue?: number;
	/** Custom value formatter (e.g. to decode an encoded value). Defaults to time/score. */
	format?: (v: number) => string;
	/** Custom rows source (e.g. lib/scores getLeaderboard). When set, the internal
	    submitDaily is skipped — the game submits through the Edge Function itself. */
	source?: () => Promise<ScoreRow[]>;
	/** Share + "tous les défis" row. Off when the board is only a peek (free mode corner). */
	actions?: boolean;
}

function LeaderboardInner({ game, metric, submitValue, format, source, actions = true }: Props) {
	const [name, setName] = useState<string>(() => playerName());
	const [draft, setDraft] = useState('');
	const [editing, setEditing] = useState(false);
	const [rows, setRows] = useState<ScoreRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [submitFailed, setSubmitFailed] = useState(false);
	const [shareMsg, setShareMsg] = useState('');
	const [dayValue, setDayValue] = useState<number | null>(null); // today's own result, this run or an earlier one
	// Only the inline daily board folds; the corner peek (actions=false) stays open, plain title.
	const collapsible = actions;
	const [open, setOpen] = useState<boolean>(!collapsible || submitValue != null);
	const lastSubmittedRef = useRef<number | null>(null); // last value sent (re-submit when it improves)
	const userToggledRef = useRef(false); // once the player folds/unfolds by hand, stop auto-opening

	const secured = isSecured(game);
	// A few boards log under "<id>-t" (the timed variant); the page and the streak use the bare id.
	const gameId = games.some((g) => g.id === game) ? game : game.replace(/-t$/, '');
	const load = useCallback(async () => {
		setLoading(true);
		// Submit whenever the value changes (e.g. a new best lap). Secured games go through
		// the Edge Function (server-side best-retained/quota); legacy games use submitDaily
		// (which only posts if it beats the day's best). `source` overrides reads entirely.
		// Kept separate from the read so a failed POST never hides the board.
		if (!source && submitValue != null && name && submitValue !== lastSubmittedRef.current) {
			lastSubmittedRef.current = submitValue;
			let failed = false;
			try {
				if (secured) {
					const r = await submitScore({ gameId: game, score: submitValue, isDailyChallenge: true });
					failed = !r.ok && r.error === 'network error';
				} else {
					await submitDaily(game, submitValue, metric);
				}
			} catch {
				failed = true;
			}
			if (failed) lastSubmittedRef.current = null; // let a retry re-attempt the submit
			setSubmitFailed(failed);
		}
		// Read the board — throws on a network/HTTP failure (vs. a legit empty board).
		try {
			const data = source ? await source() : secured ? await getLeaderboard(game, metric) : await fetchLeaderboard(game, metric);
			setRows(data);
			setError(false);
		} catch {
			setError(true);
		} finally {
			setLoading(false);
		}
	}, [game, metric, submitValue, name, source, secured]);

	useEffect(() => {
		load();
	}, [load]);

	// Persist the player's own best-of-day (offline-safe, pre-formatted) so game cards
	// (and the /jeux/defi hub) can show "record en cours". Keyed by day + leaderboard id.
	// The same blob feeds `dayValue`: a game only passes `submitValue` on the run itself, so
	// without this a player coming back to a daily already done loses the share and the way out.
	useEffect(() => {
		try {
			const key = `ludiven-dayrec-${game}-${todayKey()}`;
			const prev = JSON.parse(localStorage.getItem(key) || 'null') as { v: number } | null;
			if (submitValue == null) {
				setDayValue(prev ? prev.v : null);
				return;
			}
			const better = !prev || (metric === 'time' ? submitValue < prev.v : submitValue > prev.v);
			if (better) {
				const t = format ? format(submitValue) : metric === 'time' ? fmtCentisExact(submitValue) : String(submitValue);
				localStorage.setItem(key, JSON.stringify({ v: submitValue, m: metric, t }));
			}
			setDayValue(better ? submitValue : prev!.v);
		} catch {
			setDayValue(submitValue ?? null);
		}
	}, [submitValue, game, metric, format]);

	// Open the board once there is something to show (a fresh run or today's stored result),
	// unless the player has already set the fold by hand.
	useEffect(() => {
		if (userToggledRef.current || !collapsible) return;
		if (submitValue != null || dayValue != null) setOpen(true);
	}, [submitValue, dayValue, collapsible]);

	const toggle = () => {
		userToggledRef.current = true;
		setOpen((o) => !o);
	};

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
	const myBlason = equippedBlason(); // shown next to your own name (public display needs the backend)
	const fmt = format ?? ((v: number) => (metric === 'time' ? fmtCentisExact(v) : String(v)));
	const showInput = editing || (submitValue != null && !name);

	// Spoiler-free result share (Wordle-style): score/rank + a challenge deep link that
	// carries the sharer's name and value, so the receiver lands on the same daily with
	// a score to beat (see DefiChallenge).
	const share = async (): Promise<void> => {
		if (dayValue == null) return;
		const title = games.find((g) => g.id === gameId)?.title ?? gameId;
		const extra = new URLSearchParams({ vs: String(dayValue), d: todayKey() });
		if (name) extra.set('de', name);
		const url = `${location.origin}/jeux/${gameId}?defi&${extra}`;
		const line = metric === 'time' ? `⏱️ ${fmt(dayValue)}` : `🏆 ${fmt(dayValue)} pts`;
		const rank = rows.findIndex((r) => r.name.toLowerCase() === me);
		const rankLine =
			rank < 0 ? '' : ` · ${rank < 3 ? ['🥇 1er', '🥈 2e', '🥉 3e'][rank] : `${rank + 1}e`}${rows.length > 1 ? ` sur ${rows.length}` : ''}`;
		const st = gameStreak(gameId);
		const streakLine = st.count > 1 ? `\n🔥 ${st.count} jours d'affilée` : '';
		const text = `${title} — Défi du jour\n${line}${rankLine}${streakLine}\nPeux-tu me battre ?`;
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
		trackEvent('defi:share', { game: gameId });
		setTimeout(() => setShareMsg(''), 1600);
	};

	return (
		<div className={`lb-root ${open ? '' : 'is-folded'}`}>
			<style>{CSS}</style>
			{collapsible ? (
				<button className="lb-title" onClick={toggle} aria-expanded={open}>
					<span>Classement du jour</span>
					<span className="lb-chev" aria-hidden="true">▾</span>
				</button>
			) : (
				<h3 className="lb-title lb-title-static">Classement du jour</h3>
			)}

			{open && (
			<>
			{actions && (
				<div className="lb-share-row">
					{dayValue != null && (
						<button className="lb-share" onClick={share}>📣 Partager mon score</button>
					)}
					<a className="lb-back" href="/jeux/defi/">🗓 Tous les défis</a>
					{shareMsg && <span className="lb-share-msg">{shareMsg}</span>}
				</div>
			)}

			{submitFailed && !error && (
				<p className="lb-warn">
					⚠️ Ton score n'a pas pu être envoyé.{' '}
					<button className="lb-link" onClick={load}>Réessayer</button>
				</p>
			)}

			{!leaderboardEnabled() ? (
				<p className="lb-msg">Le classement n'est pas encore configuré.</p>
			) : (
				<>
					{loading ? (
						<p className="lb-msg">Chargement…</p>
					) : error ? (
						<div className="lb-err">
							<p className="lb-msg">Classement indisponible pour le moment. Vérifie ta connexion.</p>
							<button className="lb-retry" onClick={load}>Réessayer</button>
						</div>
					) : rows.length === 0 ? (
						<p className="lb-msg">Personne n'a encore joué aujourd'hui. À toi de lancer le classement&nbsp;!</p>
					) : (
						<ol className="lb-list">
							{rows.map((r, i) => (
								<li key={`${r.name}-${i}`} className={`lb-row ${r.name.toLowerCase() === me ? 'me' : ''}`}>
									<span className="lb-rank">{i + 1}</span>
									<span className="lb-pname">{r.name.toLowerCase() === me && myBlason ? `${myBlason.emoji} ` : ''}{r.name}</span>
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
									Pseudo : <strong>{myBlason ? `${myBlason.emoji} ` : ''}{name}</strong> ·{' '}
									<button className="lb-link" onClick={startEdit}>Changer</button>
								</>
							) : (
								<button className="lb-link" onClick={startEdit}>Définir un pseudo</button>
							)}
						</p>
					)}
				</>
			)}
			</>
			)}
		</div>
	);
}

// Wrapped so an unexpected render error (e.g. a malformed row) shows a small
// notice instead of blanking the game page.
export default function Leaderboard(props: Props) {
	return (
		<ErrorBoundary
			fallback={
				<p style={{ textAlign: 'center', color: 'var(--gray-300)', fontSize: 13, margin: '1.25rem 0 0' }}>
					Classement momentanément indisponible.
				</p>
			}
		>
			<LeaderboardInner {...props} />
		</ErrorBoundary>
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
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; margin: 0 0 0.75rem; padding: 8px 12px;
  border: 1.5px solid var(--gray-800); border-radius: 999px; background: var(--gray-999_40);
  font-family: var(--font-brand); font-weight: 600; font-size: 16px;
  color: var(--gray-0); cursor: pointer;
  transition: border-color var(--theme-transition), color var(--theme-transition);
}
.lb-title:hover, .lb-title:focus-visible { border-color: var(--accent-regular); }
.lb-title-static { border: none; background: none; padding: 0; cursor: default; }
.lb-chev { font-size: 12px; color: var(--gray-300); transition: transform 0.2s ease; }
.lb-root.is-folded { margin-bottom: 0; }
.lb-root.is-folded .lb-chev { transform: rotate(-90deg); }
.lb-msg { text-align: center; color: var(--gray-300); font-size: 13px; line-height: 1.5; margin: 0; }

.lb-err { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.lb-retry {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-100);
  font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 6px 16px; cursor: pointer;
}
.lb-retry:hover, .lb-retry:focus-visible { border-color: var(--accent-regular); color: var(--accent-regular); }
.lb-warn { text-align: center; color: var(--gray-200); font-size: 12.5px; margin: 0 0 0.9rem; }
.lb-warn .lb-link { color: var(--accent-regular); }

.lb-share-row { display: flex; align-items: center; gap: 10px; justify-content: center; margin: 0 0 0.9rem; flex-wrap: wrap; }
.lb-share { border: none; background: var(--accent-regular); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 13.5px; border-radius: 999px; padding: 8px 18px; cursor: pointer; box-shadow: var(--shadow-sm); }
.lb-share:hover { filter: brightness(1.05); }
.lb-back {
  border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0);
  font: inherit; font-weight: 700; font-size: 13.5px; border-radius: 999px; padding: 8px 18px;
  text-decoration: none; box-shadow: var(--shadow-sm);
}
.lb-back:hover, .lb-back:focus-visible { border-color: var(--accent-regular); color: var(--accent-regular); }
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
