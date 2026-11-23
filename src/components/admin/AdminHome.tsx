// /admin/: one tile per admin page. Once signed in, the tiles show a few figures: the house ads from the
// catalogue online, the visitors and taps and this month's ad revenue from stats-admin. Versions links the studio board.
import { useEffect, useState } from 'react';
import { accountLabel, signIn, signOut } from '../../lib/meetupAuth';
import { STATS_LOCAL, overview, revenue, statsMessage, totals } from '../../lib/statsAdmin';
import type { Catalog } from '../../../supabase/functions/_shared/promoRules.mjs';
import { useAdminSession } from './useAdminSession';

const int = new Intl.NumberFormat('fr-FR');
const usd = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface Tile { href?: string; title: string; text: string; figure?: string }

export default function AdminHome() {
	const { session, ready, error } = useAdminSession(STATS_LOCAL);
	const [stats, setStats] = useState<ReturnType<typeof totals> | null>(null);
	const [statsError, setStatsError] = useState<string | null>(null);
	const [ads, setAds] = useState<number | null>(null);
	const [month, setMonth] = useState<number | null>(null);
	const signedIn = STATS_LOCAL || !!session;

	useEffect(() => {
		if (!signedIn) return;
		overview().then((o) => setStats(totals(o))).catch((e) => setStatsError(statsMessage(e)));
		revenue().then((r) => setMonth(r.total.month)).catch(() => setMonth(null));
		fetch('/promo/v1/catalog.json', { cache: 'no-cache' })
			.then((r) => (r.ok ? r.json() : null))
			.then((c: Catalog | null) => setAds(c ? c.entries.filter((e) => (e.weight ?? 1) > 0).length : null))
			.catch(() => setAds(null));
	}, [signedIn]);

	const tiles: Tile[] = [
		{ href: '/admin/pubs/', title: 'Pubs maison', text: 'Le catalogue que lisent les applis, leurs poids par appli et par plateforme.', figure: ads === null ? undefined : `${ads} pubs actives` },
		{ href: '/admin/versions/', title: 'Versions', text: "Chaque appli sur Google Play, l'App Store, chez les testeurs et sur main, et ce qui t'attend." },
		{
			href: '/admin/stats/', title: 'Statistiques', text: 'Visiteurs, achats, connexions et pubs maison, appli par appli (Umami).',
			figure: stats ? `${int.format(stats.visitors7)} visiteurs sur 7 j · ${stats.apps} applis` : statsError ?? undefined,
		},
		{ href: '/admin/revenus/', title: 'Revenus', text: 'La publicité par appli (LevelPlay) : ce mois, les 30 derniers jours, jour par jour.', figure: month === null ? undefined : `${usd.format(month)} ce mois` },
	];

	return (
		<div className="ah-root">
			<div className="pa-bar">
				{!ready ? <span className="pa-note">Chargement…</span> : signedIn ? (
					<>
						<span className="pa-note">{STATS_LOCAL ? 'Essai local' : session ? `Connecté : ${accountLabel(session)}` : ''}</span>
						{!STATS_LOCAL && <button type="button" className="pa-btn" onClick={() => void signOut()}>Se déconnecter</button>}
					</>
				) : (
					<>
						<span className="pa-note">Connecte-toi pour voir les chiffres ; chaque page vérifie l'accès de ton compte.</span>
						<button type="button" className="pa-btn pa-primary" onClick={() => void signIn('google', window.location.href)}>Se connecter avec Google</button>
					</>
				)}
			</div>
			{error && <p className="pa-card as-error">{error}</p>}
			<ul className="ah-tiles">
				{tiles.map((t) => (
					<li key={t.title}>
						{t.href ? (
							<a className="pa-card ah-tile" href={t.href}>
								<strong>{t.title}</strong>
								<span>{t.text}</span>
								{t.figure && <em>{t.figure}</em>}
							</a>
						) : (
							<div className="pa-card ah-tile ah-soon" aria-disabled="true">
								<strong>{t.title}</strong>
								<span>{t.text}</span>
								<em>{t.figure}</em>
							</div>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
