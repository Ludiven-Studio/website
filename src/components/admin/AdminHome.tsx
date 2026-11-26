// /admin/: one tile per admin page. Once signed in, the tiles show each page's key figure: the visitors from
// stats-admin with the in-app sales of the last 7 days, the month's revenue in euros (ads and in-app purchases, the
// same count as /admin/revenus/), what waits on the studio board, and the house ads from the catalogue online.
// The cards reload every 10 minutes in a visible tab, keep their figures while they do, and badge what moved.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { accountLabel, signOut } from '../../lib/meetupAuth';
import GoogleSignIn from './GoogleSignIn';
import { STATS_LOCAL, StatsError, appStore, board, overview, playOrders, purchases, rates, revenue, statsMessage, totals } from '../../lib/statsAdmin';
import { homeIncome, revenueTile, weekLine, type HomeMoney } from '../../lib/homeRevenue';
import { NO_TRACK, deltaLabel, dueReload, houseAdLines, statsLines, testLines, track, waitLines, type Track } from '../../lib/adminHome';
import { readBetaBuild } from '../../lib/betaBuild';
import { TEST_APPS } from '../../data/testBuilds';
import type { Overview } from '../../lib/statsAdmin';
import type { Catalog } from '../../../supabase/functions/_shared/promoRules.mjs';
import { useAdminSession } from './useAdminSession';
import { AppName } from './AdminParts';

const int = new Intl.NumberFormat('fr-FR');
// The studio's apps in the order of their colours.
const APPS = ['Pétanque Game', "Dragon's Gems", 'Pétanque Meet', 'Nino Rush', 'Pétanque Scan'];

interface Tile { href: string; title: string; text: string; figure?: ReactNode; delta?: string; up?: boolean; lines?: (string | undefined)[] }
type Build = { name: string; version: string; date: Date | null };
type Money = HomeMoney & { why: string };
const TICK_MS = 60_000;
/** Why the purchases did not come: the stats not set up, the function not redeployed, or no answer. */
export function whyMissing(e: unknown): string {
	if (e instanceof StatsError && e.status === 503) return 'statistiques non branchées';
	if (e instanceof StatsError && e.status === 400) return 'attend le redéploiement';
	return "n'ont pas répondu";
}

export default function AdminHome() {
	const { session, ready, error } = useAdminSession(STATS_LOCAL);
	const [ov, setOv] = useState<Overview | null>(null);
	const [waitList, setWaitList] = useState<string[]>([]);
	const [builds, setBuilds] = useState<Build[]>([]);
	const [moved, setMoved] = useState<Track>(NO_TRACK);
	const lastAt = useRef(0);
	const lastMoney = useRef<Money | null>(null);
	const [statsError, setStatsError] = useState<string | null>(null);
	const [ads, setAds] = useState<number | null>(null);
	const [waits, setWaits] = useState<number | null>(null);
	const [signInError, setSignInError] = useState<string | null>(null);
	// Every money source at once, so a figure never switches source as the answers come in.
	const [money, setMoney] = useState<Money | null>(null);
	const signedIn = STATS_LOCAL || !!session;

	useEffect(() => {
		if (!signedIn) return;
		const note = (key: string, value: number) => setMoved((t) => track(t, key, value));
		// A failed reload keeps the figures already shown: only an answer replaces them.
		const load = () => {
			overview().then((o) => {
				setOv(o);
				setStatsError(null);
				note('visitors', totals(o).visitors7);
			}).catch((e) => setStatsError(statsMessage(e)));
			void Promise.allSettled([revenue(), playOrders(), appStore(), purchases(), rates()]).then(([ad, o, a, p, r]) => {
				const ok = <T,>(x: PromiseSettledResult<T>): T | null => (x.status === 'fulfilled' ? x.value : null);
				const m = lastMoney.current;
				if (m && ![ad, o, a, p, r].some((x) => x.status === 'fulfilled')) return;
				const next: Money = {
					money: ok(ad) ?? m?.money ?? null, orders: ok(o) ?? m?.orders ?? null, apple: ok(a) ?? m?.apple ?? null,
					seen: ok(p) ?? m?.seen ?? null, rates: ok(r) ?? m?.rates ?? null, now: new Date(),
					why: p.status === 'rejected' && !m?.seen ? whyMissing(p.reason) : '',
				};
				lastMoney.current = next;
				setMoney(next);
				const counted = homeIncome(next);
				const total = revenueTile(counted).total;
				// Keyed by the month: a new month's first reading starts afresh instead of showing a big minus.
				if (total !== undefined) note(`revenue:${counted.monthStart}`, total);
			});
			board().then((b) => {
				const n = b.apps.reduce((k, a) => k + a.waits.length, 0);
				setWaits(n);
				setWaitList(waitLines(b));
				note('waits', n);
			}).catch(() => undefined);
			// The testers' manifests the /tests/ page reads: public, one small file per app.
			void Promise.all(TEST_APPS.filter((a) => a.latest).map((a) => fetch(`${a.latest}?t=${Date.now()}`, { cache: 'no-store' })
				.then((r) => (r.ok ? r.json() : null))
				.then((j) => {
					const b = j ? readBetaBuild(j) : null;
					return b ? { name: a.name, version: b.version, date: b.date } : null;
				})
				.catch(() => null)))
				.then((all) => setBuilds((old) => {
					const fresh = all.filter((b) => b !== null);
					return [...fresh, ...old.filter((b) => !fresh.some((f) => f.name === b.name))];
				}));
			fetch('/promo/v1/catalog.json', { cache: 'no-cache' })
				.then((r) => (r.ok ? r.json() : null))
				.then((c: Catalog | null) => {
					if (!c) return;
					const n = c.entries.filter((e) => (e.weight ?? 1) > 0).length;
					setAds(n);
					note('ads', n);
				})
				.catch(() => undefined);
		};
		const tick = () => {
			if (!dueReload(document.visibilityState, lastAt.current, Date.now())) return;
			lastAt.current = Date.now();
			load();
		};
		tick();
		const id = window.setInterval(tick, TICK_MS);
		document.addEventListener('visibilitychange', tick);
		return () => {
			window.clearInterval(id);
			document.removeEventListener('visibilitychange', tick);
		};
	}, [signedIn]);

	const counted = money ? homeIncome(money) : null;
	const month = counted ? revenueTile(counted) : { lines: [] };
	const stats = ov ? totals(ov) : null;
	const tests = testLines(builds);
	const badge = (key: string, unit?: string): Pick<Tile, 'delta' | 'up'> => {
		const d = moved.delta[key];
		return d ? { delta: deltaLabel(d, unit), up: d > 0 } : {};
	};
	const tiles: Tile[] = [
		{
			href: '/admin/stats/', title: 'Statistiques', text: 'Visiteurs, achats, connexions et pubs maison, appli par appli.',
			figure: stats ? int.format(stats.visitors7) : undefined, ...badge('visitors'),
			lines: [
				stats ? `visiteurs des 7 derniers jours · ${stats.apps} applis` : statsError ?? undefined,
				...(ov ? statsLines(ov) : []),
				counted && money ? weekLine(counted, money.why) : undefined,
			],
		},
		{
			href: '/admin/revenus/', title: 'Revenus', text: 'La publicité et les achats intégrés, en euros.',
			figure: month.figure, ...(counted ? badge(`revenue:${counted.monthStart}`, '€') : {}), lines: month.lines,
		},
		{
			href: '/admin/versions/', title: 'Versions', text: 'Chaque appli sur les stores, chez les testeurs et sur main.',
			figure: waits === null ? undefined : <span className={waits ? 'ak-warn-text' : undefined}>{waits}</span>, ...badge('waits'),
			lines: [waits === null ? undefined : waits ? `chose${waits > 1 ? 's' : ''} t'attend${waits > 1 ? 'ent' : ''}` : "rien ne t'attend", ...waitList],
		},
		{
			href: '/admin/pubs/', title: 'Pubs maison', text: 'Le catalogue des applis et leurs poids.',
			figure: ads === null ? undefined : ads, ...badge('ads'),
			lines: [ads === null ? undefined : `pub${ads > 1 ? 's' : ''} active${ads > 1 ? 's' : ''}`, ...(ov ? houseAdLines(ov) : [])],
		},
		{ href: '/tests/', title: 'Versions de test', text: 'Les APK de test des applis et les prototypes, au même endroit.', lines: tests.length ? ['Les plus récentes :', ...tests] : [] },
	];

	return (
		<div className="as-root">
			<div className="pa-bar">
				{!ready ? <span className="pa-note">Chargement…</span> : signedIn ? (
					<>
						<span className="pa-note">{STATS_LOCAL ? 'Essai local' : session ? `Connecté : ${accountLabel(session)}` : ''}</span>
						{!STATS_LOCAL && <button type="button" className="pa-btn" onClick={() => void signOut()}>Se déconnecter</button>}
					</>
				) : (
					<>
						<span className="pa-note">Connecte-toi pour voir les chiffres.</span>
						<GoogleSignIn onError={setSignInError} />
					</>
				)}
			</div>
			{(error || signInError) && <p className="pa-card as-error">{error ?? signInError}</p>}
			<ul className="ah-tiles">
				{tiles.map((t) => (
					<li key={t.title}>
						<a className="ak-tile ah-tile" href={t.href}>
							<span>{t.title}</span>
							{t.figure !== undefined ? (
								<span className="ah-figure">
									<strong>{t.figure}</strong>
									{t.delta && <b className={`ah-delta${t.up ? ' ah-delta--up' : ''}`} title="Écart avec la lecture d'avant">{t.delta}</b>}
								</span>
							) : <em>{t.text}</em>}
							{t.lines?.filter(Boolean).map((l) => <small key={l}>{l}</small>)}
						</a>
					</li>
				))}
			</ul>
			<p className="ak-legend ah-apps" aria-label="La couleur de chaque appli, la même sur toutes les pages">
				{APPS.map((a) => <AppName key={a} name={a} />)}
			</p>
		</div>
	);
}
