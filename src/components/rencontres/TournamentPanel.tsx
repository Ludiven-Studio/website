import { useEffect } from 'react';
import { approvalLine, contestsOf, type MeetupTournament, type TournamentContest } from '../../lib/meetups';
import { formatDay, formatTime } from './format';
import { PATHS, pick, useLang, type Lang } from './i18n';

type Format = MeetupTournament['format'];
type Category = MeetupTournament['category'];

const FORMAT: Record<Lang, Record<Format, string>> = {
	fr: { 'tete-a-tete': 'Tête-à-tête', doublette: 'Doublette', triplette: 'Triplette' },
	en: { 'tete-a-tete': 'Singles', doublette: 'Doubles', triplette: 'Triples' },
};
const FORMAT_PLURAL: Record<Lang, Record<Format, string>> = {
	fr: { 'tete-a-tete': 'En tête-à-tête', doublette: 'En doublettes', triplette: 'En triplettes' },
	en: FORMAT.en,
};
const CATEGORY: Record<Lang, Record<Category, string>> = {
	fr: { open: 'Open', veterans: 'Vétérans', feminin: 'Féminin', jeunes: 'Jeunes', mixte: 'Mixte' },
	en: { open: 'Open', veterans: 'Veterans', feminin: 'Women', jeunes: 'Youth', mixte: 'Mixed' },
};

const fee = (cents: number | null, lang: Lang): string | null => {
	if (cents === null) return null;
	const en = lang === 'en';
	if (cents === 0) return en ? 'Free entry' : 'Inscription gratuite';
	const amount = (cents / 100).toLocaleString(en ? 'en-GB' : 'fr-FR', { minimumFractionDigits: cents % 100 ? 2 : 0 });
	return en ? `Entry €${amount}` : `Inscription ${amount}\u00a0€`;
};

const phone = (digits: string): string => digits.replace(/(\d{2})(?=\d)/g, '$1 ');

const sameDay = (cs: TournamentContest[]): boolean =>
	cs.every((c) => formatDay(c.starts_at) === formatDay(cs[0].starts_at));

/** "14:30 · Triplette · Vétérans · Inscription 5 €", the day first when they span several. */
const contestLine = (c: TournamentContest, withDay: boolean, lang: Lang): string => {
	const price = fee(c.entry_fee_cents, lang);
	return `${withDay ? `${formatDay(c.starts_at, lang)} ` : ''}${formatTime(c.starts_at, lang)} · ${FORMAT[lang][c.format]} · ${CATEGORY[lang][c.category]}`
		+ (price ? ` · ${price}` : '');
};

/** What a club without a poster still gets: one composed from its own details,
 *  so every tournament reads like a poster on a café wall. */
function ComposedPoster({ t }: { t: MeetupTournament }) {
	const lang = useLang();
	const tr = pick(lang);
	const price = fee(t.entry_fee_cents, lang);
	const cs = contestsOf(t);
	const oneDay = sameDay(cs);
	const day = (iso: string): string => formatDay(iso, lang);
	const time = (iso: string): string => formatTime(iso, lang);
	return (
		<div className={`re-affiche re-affiche--${t.format}`} role="img" aria-label={tr(`Affiche : ${t.title}`, `Poster: ${t.title}`)}>
			<p className="re-affiche-kicker">{tr('Concours de pétanque', 'Pétanque tournament')}</p>
			<p className="re-affiche-title">{t.title}</p>
			{cs.length === 1 ? (
				<>
					<p className="re-affiche-when">{day(t.starts_at)}<br />{time(t.starts_at)}</p>
					<p className="re-affiche-what">{FORMAT_PLURAL[lang][t.format]} · {CATEGORY[lang][t.category]}</p>
					{price && <p className="re-affiche-what">{price}</p>}
				</>
			) : (
				<>
					{oneDay && <p className="re-affiche-when">{day(t.starts_at)}</p>}
					{cs.map((c, i) => (
						<p key={i} className="re-affiche-what">
							{oneDay ? time(c.starts_at) : `${day(c.starts_at)} ${time(c.starts_at)}`}
							{' · '}{FORMAT_PLURAL[lang][c.format]} · {CATEGORY[lang][c.category]}
						</p>
					))}
				</>
			)}
			<p className="re-affiche-where">
				{t.label || tr('Lieu du concours', 'Tournament venue')}{t.commune && t.commune !== t.label ? `, ${t.commune}` : ''}
			</p>
			<p className="re-affiche-club">{t.club_name}</p>
		</div>
	);
}

/** The page a shared tournament link opens, over the map: on a phone a panel
 *  under the map is a screen away, and the tap seemed to show the name only. */
export default function TournamentPanel({ tournament: t, shareUrl, samePitch = [], onOpen, onClose }: {
	tournament: MeetupTournament; shareUrl: string;
	/** The other tournaments on this pitch: the map shows one card for all of them. */
	samePitch?: readonly MeetupTournament[]; onOpen?(id: string): void; onClose(): void;
}) {
	const lang = useLang();
	const tr = pick(lang);
	const place = t.label || tr('Lieu du concours', 'Tournament venue');
	const approval = approvalLine(t, lang);
	const price = fee(t.entry_fee_cents, lang);
	const cs = contestsOf(t);
	const directions = `https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lng}`;
	const day = (iso: string): string => formatDay(iso, lang);
	const time = (iso: string): string => formatTime(iso, lang);
	const poster = tr(`Affiche : ${t.title}`, `Poster: ${t.title}`);

	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	const share = async (): Promise<void> => {
		const text = `${t.title} (${t.club_name}), ${day(t.starts_at)} ${tr('à', 'at')} ${time(t.starts_at)}`;
		if (navigator.share) {
			await navigator.share({ title: t.title, text, url: shareUrl }).catch(() => {});
		} else {
			await navigator.clipboard?.writeText(`${text}\n${shareUrl}`).catch(() => {});
		}
	};

	return (
		<div className="re-modal re-modal--tournament" onClick={onClose}>
			<section className="re-sheet re-tournament" onClick={(e) => e.stopPropagation()} aria-label={t.title}>
				<button type="button" className="re-close" onClick={onClose} aria-label={tr('Fermer', 'Close')}>×</button>
				{t.status === 'cancelled' && <p className="re-banner re-banner--off">{tr('Concours annulé', 'Tournament cancelled')}</p>}
				{t.poster_url
					? <img className="re-poster" src={t.poster_url} alt={poster} />
					: <ComposedPoster t={t} />}
				<h2>🏆 {t.title}</h2>
				<p><strong>{tr('Organisé par', 'Organized by')} {t.club_name}</strong></p>
				{(cs.length === 1 || sameDay(cs)) && (
					<p className="re-when">{day(t.starts_at)}{cs.length === 1 ? ` · ${time(t.starts_at)}` : ''}</p>
				)}
				<p className="re-where">📍 {place}{t.commune && t.commune !== place ? ` · ${t.commune}` : ''}</p>
				{cs.length === 1
					? <p className="re-hint">{FORMAT[lang][t.format]} · {CATEGORY[lang][t.category]}{price ? ` · ${price}` : ''}</p>
					: (
						<ul className="re-contests">
							{cs.map((c, i) => <li key={i}>{contestLine(c, !sameDay(cs), lang)}</li>)}
						</ul>
					)}
				<p className={approval.verified ? 're-approval re-approval--ok' : 're-approval'}>{approval.text}</p>
				{!approval.verified && (
					<p className="re-hint">
						{tr(
							'Un licencié qui joue une compétition non agréée peut être sanctionné\u00a0: vérifie auprès du club ou du comité.',
							'A licensed player who enters an unapproved competition can be sanctioned: check with the club or the committee.',
						)}
					</p>
				)}
				{t.details && <p style={{ whiteSpace: 'pre-line' }}>{t.details}</p>}
				{samePitch.length > 0 && onOpen && (
					<div className="re-same-pitch">
						<p className="re-hint">{tr('Aussi à ce terrain\u00a0:', 'Also at this pitch:')}</p>
						<ul className="re-contests">
							{samePitch.map((o) => (
								<li key={o.id}>
									<button type="button" className="re-link" onClick={() => onOpen(o.id)}>
										{day(o.starts_at)} · {o.title}
									</button>
								</li>
							))}
						</ul>
					</div>
				)}
				<div className="re-actions">
					{t.contact_phone && t.status === 'open' && (
						<a className="re-btn" href={`tel:${t.contact_phone}`}>{tr('Appeler le', 'Call')} {phone(t.contact_phone)}</a>
					)}
					<a className="re-btn re-btn--ghost" href={directions} target="_blank" rel="noopener">{tr('Y aller', 'Directions')}</a>
					<button type="button" className="re-btn re-btn--ghost" onClick={() => { void share(); }}>{tr('Partager', 'Share')}</button>
				</div>
				<p className="re-hint re-app-cta">
					{tr(
						<>Ce concours et toutes les parties autour de toi sont dans l'appli <strong>Pétanque Meet</strong>, sur Android et iPhone.</>,
						<>This tournament and every game near you are in the <strong>Pétanque Meet</strong> app, on Android and iPhone.</>,
					)}{' '}
					<a href={PATHS[lang].app}>{tr("Télécharger l'appli", 'Get the app')}</a>
				</p>
			</section>
		</div>
	);
}
