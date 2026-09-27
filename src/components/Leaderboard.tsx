import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import { submitScore, getLeaderboard, getDailyRank } from '../lib/scores';
import { gameStreak } from '../lib/streak';
import { equippedBlason } from '../lib/wallet';
import { trackEvent } from '../lib/analytics';
import ErrorBoundary from './ErrorBoundary';
import { tr, type GameLang } from '../lib/gameLang';

// Time leaderboards store CENTISECONDS; a game may still pass its own `format`.

const PAGE = 50; // rows per page of the full board
const LOCAL_MAX = 1000; // boards ranked on the client (legacy table, event, custom source) load this many

interface Ranked extends ScoreRow { rank: number }
/** Rows from `offset`, at most `n`, already ranked. */
type Pager = (offset: number, n: number) => Promise<Ranked[]>;

const ranked = (rows: ScoreRow[], offset: number): Ranked[] => rows.map((r, i) => ({ ...r, rank: offset + i + 1 }));

/** The short board: the podium, then the player with a neighbour on each side. `null` is a gap.
    Later rows of `pool` win a rank over earlier ones (the window around the player over the top). */
function compact(pool: Ranked[], total: number, myRank: number | null): (Ranked | null)[] {
	const want: number[] = [];
	if (total <= 6) for (let r = 1; r <= total; r++) want.push(r);
	else if (myRank == null) want.push(1, 2, 3, 4, 5);
	else for (const r of [1, 2, 3, myRank - 1, myRank, myRank + 1]) if (r >= 1 && r <= total && !want.includes(r)) want.push(r);
	const byRank = new Map(pool.map((r) => [r.rank, r]));
	const out: (Ranked | null)[] = [];
	let prev = 0;
	for (const r of want.sort((a, b) => a - b)) {
		const row = byRank.get(r);
		if (!row) continue;
		if (prev > 0 && r > prev + 1) out.push(null);
		out.push(row);
		prev = r;
	}
	return out;
}

const TXT = {
	fr: {
		title: 'Classement du jour', daily: 'Défi du jour', rank: ['🥇 1er', '🥈 2e', '🥉 3e'], nth: (n: number) => `${n}e`,
		of: (n: number) => ` sur ${n}`, streak: (n: number) => `🔥 ${n} jours d'affilée`, beat: 'Peux-tu me battre ?',
		shared: 'Partagé !', copied: 'Lien copié !', share: '📣 Partager mon score', all: '🗓 Tous les défis',
		sendFail: "⚠️ Ton score n'a pas pu être envoyé.", retry: 'Réessayer', refused: "⚠️ Ton score n'a pas été retenu par le classement.",
		off: "Le classement n'est pas encore configuré.", loading: 'Chargement…',
		down: 'Classement indisponible pour le moment. Vérifie ta connexion.',
		empty: "Personne n'a encore joué aujourd'hui. À toi de lancer le classement !",
		nick: 'Ton pseudo', nickLabel: 'Pseudo', ok: 'Valider', cancel: 'Annuler', nickIs: 'Pseudo :', change: 'Changer',
		setNick: 'Définir un pseudo', crashed: 'Classement momentanément indisponible.',
		seeAll: (n: number) => `Voir tout (${n})`, close: 'Fermer',
	},
	en: {
		title: 'Today’s leaderboard', daily: 'Daily challenge', rank: ['🥇 1st', '🥈 2nd', '🥉 3rd'], nth: (n: number) => `${n}th`,
		of: (n: number) => ` of ${n}`, streak: (n: number) => `🔥 ${n} days in a row`, beat: 'Can you beat me?',
		shared: 'Shared!', copied: 'Link copied!', share: '📣 Share my score', all: '🗓 All challenges',
		sendFail: '⚠️ Your score could not be sent.', retry: 'Retry', refused: '⚠️ Your score was not accepted by the leaderboard.',
		off: 'The leaderboard is not set up yet.', loading: 'Loading…',
		down: 'Leaderboard unavailable for now. Check your connection.',
		empty: 'Nobody has played today yet. Be the first on the board!',
		nick: 'Your nickname', nickLabel: 'Nickname', ok: 'Save', cancel: 'Cancel', nickIs: 'Nickname:', change: 'Change',
		setNick: 'Set a nickname', crashed: 'Leaderboard unavailable for now.',
		seeAll: (n: number) => `See all (${n})`, close: 'Close',
	},
	es: {
		title: 'Clasificación del día', daily: 'Reto del día', rank: ['🥇 1.º', '🥈 2.º', '🥉 3.º'], nth: (n: number) => `${n}.º`,
		of: (n: number) => ` de ${n}`, streak: (n: number) => `🔥 ${n} días seguidos`, beat: '¿Puedes ganarme?',
		shared: '¡Compartido!', copied: '¡Enlace copiado!', share: '📣 Compartir mi puntuación', all: '🗓 Todos los retos',
		sendFail: '⚠️ No se pudo enviar tu puntuación.', retry: 'Reintentar', refused: '⚠️ La clasificación no aceptó tu puntuación.',
		off: 'La clasificación aún no está configurada.', loading: 'Cargando…',
		down: 'Clasificación no disponible por ahora. Comprueba tu conexión.',
		empty: 'Nadie ha jugado todavía hoy. ¡Estrena tú la clasificación!',
		nick: 'Tu apodo', nickLabel: 'Apodo', ok: 'Guardar', cancel: 'Cancelar', nickIs: 'Apodo:', change: 'Cambiar',
		setNick: 'Elegir un apodo', crashed: 'Clasificación no disponible por ahora.',
		seeAll: (n: number) => `Ver todo (${n})`, close: 'Cerrar',
	},
};

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
	lang?: GameLang;
	/** An event board rather than the day's: its own title and empty line, and `submitValue` goes
	    in as a free-play row (no challenge date) even though `source` does the reading. */
	event?: { title: string; empty: string };
}

function LeaderboardInner({ game, metric, submitValue, format, source, actions = true, lang = 'fr', event }: Props) {
	const t = { ...tr(lang, TXT), ...(event ?? {}) };
	const [name, setName] = useState<string>(() => playerName());
	const [draft, setDraft] = useState('');
	const [editing, setEditing] = useState(false);
	const [shown, setShown] = useState<(Ranked | null)[]>([]);
	const [total, setTotal] = useState(0);
	const [myRank, setMyRank] = useState<number | null>(null);
	const [all, setAll] = useState(false); // the full board is open
	const pagerRef = useRef<Pager>(async () => []);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	// 'network' is worth a retry; 'rejected' means the server refused the value itself,
	// so re-sending it would fail identically. Both must be visible: a silent drop is
	// how a legit sub-3s Cordes run vanished with no message.
	const [submitFailed, setSubmitFailed] = useState<'network' | 'rejected' | null>(null);
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
		if ((!source || event) && submitValue != null && name && submitValue !== lastSubmittedRef.current) {
			lastSubmittedRef.current = submitValue;
			let failed: 'network' | 'rejected' | null = null;
			try {
				if (secured || event) {
					const r = await submitScore({ gameId: game, score: submitValue, isDailyChallenge: !event });
					// 'leaderboard disabled' is a config state, not a lost score — line 210 says so already.
					if (!r.ok && r.error !== 'leaderboard disabled')
						failed = r.error === 'network error' ? 'network' : 'rejected';
				} else {
					await submitDaily(game, submitValue, metric);
				}
			} catch {
				failed = 'network';
			}
			if (failed === 'network') lastSubmittedRef.current = null; // let a retry re-attempt the submit
			setSubmitFailed(failed);
		}
		// Read the board — throws on a network/HTTP failure (vs. a legit empty board).
		try {
			const me = name.toLowerCase();
			const mine = submitValue ?? dayValue;
			if (secured && !source && !event) {
				// The secured daily holds one row per player, so the server pages it and counts the rank:
				// a board of thousands costs three small requests, never the whole list.
				const [top, count] = await Promise.all([getLeaderboard(game, metric, undefined, 6), getDailyRank(game, metric, mine)]);
				const n = count?.total ?? top.length;
				const at = name ? count?.rank ?? null : null;
				const pool = ranked(top, 0);
				if (at != null && at + 1 > pool.length && n > 6) {
					// One above, one below. Ties can leave the player out of the window, or put them at
					// its edge, so they are laid in by hand at the counted rank.
					const others = (await getLeaderboard(game, metric, undefined, 4, at - 2)).filter((r) => r.name.toLowerCase() !== me);
					if (others[0]) pool.push({ ...others[0], rank: at - 1 });
					pool.push({ name, value: mine!, created_at: '', rank: at });
					if (others[1]) pool.push({ ...others[1], rank: at + 1 });
				}
				pagerRef.current = async (o, k) => ranked(await getLeaderboard(game, metric, undefined, k, o), o);
				setTotal(n);
				setMyRank(at);
				setShown(compact(pool, n, at));
			} else {
				const rows = ranked(source ? await source()
					: secured ? await getLeaderboard(game, metric, undefined, LOCAL_MAX)
					: await fetchLeaderboard(game, metric, undefined, LOCAL_MAX), 0);
				const found = me ? rows.findIndex((r) => r.name.toLowerCase() === me) : -1;
				const at = found >= 0 ? found + 1 : null;
				pagerRef.current = async (o, k) => rows.slice(o, o + k);
				setTotal(rows.length);
				setMyRank(at);
				setShown(compact(rows, rows.length, at));
			}
			setError(false);
		} catch {
			setError(true);
		} finally {
			setLoading(false);
		}
	}, [game, metric, submitValue, dayValue, name, source, secured, event]);

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
		const rank = myRank == null ? -1 : myRank - 1;
		const rankLine =
			rank < 0 ? '' : ` · ${rank < 3 ? t.rank[rank] : t.nth(rank + 1)}${total > 1 ? t.of(total) : ''}`;
		const st = gameStreak(gameId);
		const streakLine = st.count > 1 ? `\n${t.streak(st.count)}` : '';
		const text = `${title} — ${t.daily}\n${line}${rankLine}${streakLine}\n${t.beat}`;
		try {
			if (navigator.share) {
				await navigator.share({ title: `${title} — ${t.daily}`, text, url });
				setShareMsg(t.shared);
			} else {
				await navigator.clipboard.writeText(`${text}\n${url}`);
				setShareMsg(t.copied);
			}
		} catch {
			return; // user cancelled — no toast
		}
		trackEvent('defi:share', { game: gameId });
		setTimeout(() => setShareMsg(''), 1600);
	};

	return (
		<div className={`lb-root ${open ? '' : 'is-folded'}`} ref={rootRef}>
			<style>{CSS}</style>
			{collapsible ? (
				<button className="lb-title" onClick={toggle} aria-expanded={open}>
					<span>{t.title}</span>
					<span className="lb-chev" aria-hidden="true">▾</span>
				</button>
			) : (
				<h3 className="lb-title lb-title-static">{t.title}</h3>
			)}

			{open && (
			<>
			{actions && (
				<div className="lb-share-row">
					{dayValue != null && (
						<button className="lb-share" onClick={share}>{t.share}</button>
					)}
					<a className="lb-back" href="/jeux/defi/">{t.all}</a>
					{shareMsg && <span className="lb-share-msg">{shareMsg}</span>}
				</div>
			)}

			{submitFailed && !error && (
				<p className="lb-warn">
					{submitFailed === 'network' ? (
						<>
							{t.sendFail}{' '}
							<button className="lb-link" onClick={load}>{t.retry}</button>
						</>
					) : (
						<>{t.refused}</>
					)}
				</p>
			)}

			{!leaderboardEnabled() ? (
				<p className="lb-msg">{t.off}</p>
			) : (
				<>
					{loading ? (
						<p className="lb-msg">{t.loading}</p>
					) : error ? (
						<div className="lb-err">
							<p className="lb-msg">{t.down}</p>
							<button className="lb-retry" onClick={load}>{t.retry}</button>
						</div>
					) : shown.length === 0 ? (
						<p className="lb-msg">{t.empty}</p>
					) : (
						<>
							<ol className="lb-list">
								{shown.map((r, i) => r ? (
									<Row key={`${r.rank}-${r.name}`} r={r} me={me} blason={myBlason?.emoji} fmt={fmt} />
								) : (
									<li key={`gap-${i}`} className="lb-gap" aria-hidden="true">⋯</li>
								))}
							</ol>
							{total > shown.filter(Boolean).length && (
								<button className="lb-all-btn" onClick={() => setAll(true)}>{t.seeAll(total)}</button>
							)}
						</>
					)}
					{all && rootRef.current && createPortal(
						<AllRows title={t.title} total={total} pager={pagerRef.current} me={me} blason={myBlason?.emoji}
							fmt={fmt} closeLabel={t.close} loadingLabel={t.loading} onClose={() => setAll(false)} />,
						// Inside the game page: native fullscreen shows that element only, so a portal to <body> would vanish.
						rootRef.current.closest('.game-page') ?? document.body,
					)}

					{showInput ? (
						<div className="lb-name">
							<input
								type="text"
								maxLength={20}
								placeholder={t.nick}
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								onKeyDown={(e) => e.key === 'Enter' && save()}
								aria-label={t.nickLabel}
								autoFocus
							/>
							<button onClick={save}>{t.ok}</button>
							{editing && (
								<button className="lb-cancel" onClick={() => setEditing(false)}>{t.cancel}</button>
							)}
						</div>
					) : (
						<p className="lb-foot">
							{name ? (
								<>
									{t.nickIs} <strong>{myBlason ? `${myBlason.emoji} ` : ''}{name}</strong> ·{' '}
									<button className="lb-link" onClick={startEdit}>{t.change}</button>
								</>
							) : (
								<button className="lb-link" onClick={startEdit}>{t.setNick}</button>
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

function Row({ r, me, blason, fmt }: { r: Ranked; me: string; blason?: string; fmt: (v: number) => string }) {
	const mine = r.name.toLowerCase() === me;
	return (
		<li className={`lb-row ${mine ? 'me' : ''}`}>
			<span className="lb-rank">{r.rank}</span>
			<span className="lb-pname">{mine && blason ? `${blason} ` : ''}{r.name}</span>
			<span className="lb-val">{fmt(r.value)}</span>
		</li>
	);
}

/** The whole board over the page, a page of rows at a time as the list nears its end. */
function AllRows({ title, total, pager, me, blason, fmt, closeLabel, loadingLabel, onClose }: {
	title: string; total: number; pager: Pager; me: string; blason?: string; fmt: (v: number) => string;
	closeLabel: string; loadingLabel: string; onClose: () => void;
}) {
	const [rows, setRows] = useState<Ranked[]>([]);
	const [done, setDone] = useState(false);
	const busyRef = useRef(false);
	const boxRef = useRef<HTMLDivElement | null>(null);
	const endRef = useRef<HTMLDivElement | null>(null);

	const more = useCallback(async () => {
		if (busyRef.current) return;
		busyRef.current = true;
		try {
			const offset = rows.length;
			const next = await pager(offset, PAGE);
			setRows((r) => (r.length === offset ? [...r, ...next] : r));
			if (next.length < PAGE || offset + next.length >= total) setDone(true);
		} catch {
			setDone(true);
		} finally {
			busyRef.current = false;
		}
	}, [rows.length, pager, total]);

	// Re-observed after every page: a sentinel still in view after a load fires again on observe.
	useEffect(() => {
		const box = boxRef.current, end = endRef.current;
		if (!box || !end || done) return;
		const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) void more(); }, { root: box, rootMargin: '300px' });
		io.observe(end);
		return () => io.disconnect();
	}, [more, done]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	return (
		<div className="lb-all" role="dialog" aria-modal="true" aria-label={title}>
			<div className="lb-all-head">
				<h3>{title} <span className="lb-all-n">· {total}</span></h3>
				<button className="lb-all-close" onClick={onClose} aria-label={closeLabel}>✕</button>
			</div>
			<div className="lb-all-body" ref={boxRef}>
				<ol className="lb-list">
					{rows.map((r) => <Row key={`${r.rank}-${r.name}`} r={r} me={me} blason={blason} fmt={fmt} />)}
				</ol>
				{!done && <div ref={endRef} className="lb-msg lb-all-more">{loadingLabel}</div>}
			</div>
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
					{tr(props.lang ?? 'fr', TXT).crashed}
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

.lb-list {
  list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px;
}
.lb-row {
  flex: none; display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: 10px;
  padding: 7px 12px; border-radius: 10px; background: var(--gray-999_40); border: 1px solid var(--gray-800);
  font-size: 14px;
}
.lb-gap { text-align: center; color: var(--gray-300); line-height: 1; font-size: 14px; }
.lb-all-btn {
  display: block; margin: 8px auto 0; border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-0);
  font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 6px 16px; cursor: pointer;
}
.lb-all-btn:hover, .lb-all-btn:focus-visible { border-color: var(--accent-regular); color: var(--accent-regular); }
/* Above everything, the fullscreen exit included: this is a modal and has its own close. */
.lb-all {
  position: fixed; inset: 0; z-index: 2147483647; display: flex; flex-direction: column;
  background: var(--gray-999); color: var(--gray-0); font-family: var(--font-body);
}
.lb-all-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left));
  border-bottom: 1px solid var(--gray-800);
}
.lb-all-head h3 { margin: 0; font-size: 17px; }
.lb-all-n { color: var(--gray-300); font-weight: 500; }
.lb-all-close { border: none; background: transparent; color: var(--gray-0); font-size: 20px; line-height: 1; padding: 6px 8px; cursor: pointer; }
.lb-all-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 12px 16px max(16px, env(safe-area-inset-bottom)); }
.lb-all-body .lb-list { max-width: 480px; margin: 0 auto; }
.lb-all-more { padding: 14px 0; }
.lb-row.me { border-color: var(--accent-regular); background: var(--accent-overlay); }
.lb-rank { font-weight: 700; color: var(--gray-300); text-align: center; font-variant-numeric: tabular-nums; }
.lb-pname { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-val { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent-regular); }
/* On the player's own row the accent value sat on the accent overlay — purple on purple, unreadable
   in dark theme. Match the name's color so it keeps the contrast the rest of the row already has. */
.lb-row.me .lb-val { color: var(--gray-0); }
`;
