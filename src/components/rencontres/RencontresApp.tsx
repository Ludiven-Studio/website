import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playerId } from '../../lib/scores';
import { trackEvent } from '../../lib/analytics';
import {
	listMeetups, getMeetup, createMeetup, cancelMeetup, joinMeetup, leaveMeetup,
	meetupsEnabled, rememberSecret, secretFor, savedName, saveName,
} from '../../lib/meetups';
import {
	applyFilters, DATE_LABEL, DEFAULT_FILTERS,
	type DateFilter, type Filters, type RoleFilter,
} from '../../lib/meetupFilters';
import {
	FORMAT_LABEL, ROLE_LABEL, seatsLeft, validateSignup,
	type Format, type MeetupEvent, type MeetupSignup, type MeetupSpot, type Role,
} from '../../lib/meetupRules';
import { distanceM, formatDistance, isPlausibleFr } from '../../lib/meetupGeo';
import MeetupMap, { type MapHandle } from './MeetupMap';
import CreateForm from './CreateForm';
import EventPanel from './EventPanel';
import { formatShortDay, formatTime } from './format';

const DATES: DateFilter[] = ['today', 'weekend', 'week', 'all'];
const ROLE_FILTERS: RoleFilter[] = ['all', 'tireur', 'pointeur'];

interface Detail {
	event: MeetupEvent;
	signups: MeetupSignup[];
	isOrganizer: boolean;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : 'Une erreur est survenue.');

/** The page is static, so the event id lives in the query string and the island
 *  resolves it (spec §2). replaceState keeps the back button out of it. */
function setUrl(eventId: string | null, secret?: string | null): void {
	const url = new URL(window.location.href);
	if (eventId) url.searchParams.set('e', eventId); else url.searchParams.delete('e');
	if (secret) url.searchParams.set('k', secret); else url.searchParams.delete('k');
	window.history.replaceState(null, '', url);
}

export default function RencontresApp() {
	const [pid] = useState(() => playerId());
	const [events, setEvents] = useState<MeetupEvent[]>([]);
	const [spots, setSpots] = useState<MeetupSpot[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const [detail, setDetail] = useState<Detail | null>(null);
	const [creating, setCreating] = useState(false);
	const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
	const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
	const [locating, setLocating] = useState(false);
	const [created, setCreated] = useState<{ id: string; secret: string } | null>(null);
	const [name, setName] = useState('');
	const mapRef = useRef<MapHandle>(null);

	const load = useCallback(async (): Promise<MeetupEvent[]> => {
		const r = await listMeetups();
		setEvents(r.events);
		setSpots(r.spots);
		return r.events;
	}, []);

	const openEvent = useCallback(async (id: string, fromUrl?: string | null) => {
		const secret = secretFor(id, fromUrl);
		try {
			const d = await getMeetup(id, secret);
			setDetail(d);
			setCreating(false);
			setUrl(id, d.isOrganizer ? secret : null);
			mapRef.current?.flyTo(d.event.lat, d.event.lng);
		} catch (e) {
			setError(message(e));
			setUrl(null);
		}
	}, []);

	useEffect(() => {
		trackEvent('meetup_view');
		setName(savedName());
		const url = new URLSearchParams(window.location.search);
		const wanted = url.get('e');
		void (async () => {
			try {
				await load();
			} catch (e) {
				setError(message(e));
			} finally {
				setLoading(false);
			}
			if (wanted) await openEvent(wanted, url.get('k'));
		})();
	}, [load, openEvent]);

	/** After any write: the list and the open card must agree, or the seat counter
	 *  on the map contradicts the one in the panel. */
	const refresh = useCallback(async (eventId: string) => {
		await load();
		await openEvent(eventId);
	}, [load, openEvent]);

	const closeEvent = useCallback(() => {
		setDetail(null);
		setCreated(null);
		setUrl(null);
	}, []);

	const run = useCallback(async (fn: () => Promise<void>) => {
		setBusy(true);
		try {
			await fn();
			setError(null);
		} catch (e) {
			setError(message(e));
		} finally {
			setBusy(false);
		}
	}, []);

	const onJoin = useCallback((seats: number, role: Role, who: string) => {
		if (!detail) return;
		const problem = validateSignup(who, seats, role);
		if (problem) { setError(problem); return; }
		void run(async () => {
			await joinMeetup(detail.event.id, pid, who, seats, role);
			saveName(who);
			setName(who);
			trackEvent('meetup_join', { format: detail.event.format });
			await refresh(detail.event.id);
		});
	}, [detail, pid, refresh, run]);

	const onLeave = useCallback(() => {
		if (!detail) return;
		void run(async () => {
			await leaveMeetup(detail.event.id, pid);
			trackEvent('meetup_leave');
			await refresh(detail.event.id);
		});
	}, [detail, pid, refresh, run]);

	const onCancel = useCallback(() => {
		if (!detail) return;
		const secret = secretFor(detail.event.id, new URLSearchParams(window.location.search).get('k'));
		if (!secret) { setError('Lien d\'organisateur manquant.'); return; }
		if (!window.confirm('Annuler cette partie ? Les inscrits ne seront pas prévenus.')) return;
		void run(async () => {
			await cancelMeetup(detail.event.id, secret);
			trackEvent('meetup_cancel');
			await refresh(detail.event.id);
		});
	}, [detail, refresh, run]);

	const startCreate = useCallback(() => {
		setCreating(true);
		setDetail(null);
		setCreated(null);
		setPin(null);
		setUrl(null);
	}, []);

	const onCreateSubmit = useCallback((v: {
		startsAt: string; endsAt: string; format: Format; playersNeeded: number;
		roleNeeded: Role; organizerName: string; organizerSeats: number;
	}) => {
		if (!pin) { setError('Pose une épingle sur la carte.'); return; }
		void run(async () => {
			const r = await createMeetup({ playerId: pid, lat: pin.lat, lng: pin.lng, ...v });
			rememberSecret(r.id, r.secret);
			saveName(v.organizerName);
			setName(v.organizerName);
			trackEvent('meetup_create', { format: v.format });
			setCreating(false);
			setPin(null);
			setCreated(r);
			await load();
			await openEvent(r.id, r.secret);
		});
	}, [load, openEvent, pid, pin, run]);

	// Button only, never on load (spec §8): a map that asks for your position the
	// second it opens reads as a tracker, and the answer is usually "block".
	const locate = useCallback(() => {
		if (!navigator.geolocation) { setError('Ton navigateur ne partage pas la position.'); return; }
		setLocating(true);
		navigator.geolocation.getCurrentPosition(
			(p) => {
				setLocating(false);
				setMe({ lat: p.coords.latitude, lng: p.coords.longitude });
				mapRef.current?.flyTo(p.coords.latitude, p.coords.longitude, 13);
			},
			() => { setLocating(false); setError('Position indisponible.'); },
			{ enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
		);
	}, []);

	const shown = useMemo(() => applyFilters(events, filters), [events, filters]);
	const shareUrl = (id: string): string => `${window.location.origin}/rencontres/?e=${id}`;
	const secretUrl = created ? `${window.location.origin}/rencontres/?e=${created.id}&k=${created.secret}` : '';

	if (!meetupsEnabled()) return <p className="re-empty">Le service n'est pas disponible.</p>;

	return (
		<div className="re-root">
			<header className="re-head">
				<h1>Rencontres pétanque</h1>
				<p className="re-sub">
					Qui joue près de chez toi, quand, et combien il manque de joueurs. Sans inscription.
				</p>
			</header>

			{error && (
				<p className="re-error" role="alert" onClick={() => setError(null)}>{error}</p>
			)}

			<div className="re-bar">
				<div className="re-seg" role="group" aria-label="Quand">
					{DATES.map((d) => (
						<button
							key={d}
							type="button"
							className={`re-segbtn ${filters.date === d ? 're-segbtn--on' : ''}`}
							aria-pressed={filters.date === d}
							onClick={() => setFilters((f) => ({ ...f, date: d }))}
						>
							{DATE_LABEL[d]}
						</button>
					))}
				</div>

				<select
					className="re-select"
					aria-label="Rôle"
					value={filters.role}
					onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value as RoleFilter }))}
				>
					{ROLE_FILTERS.map((r) => (
						<option key={r} value={r}>{r === 'all' ? 'Tous les rôles' : ROLE_LABEL[r as Role]}</option>
					))}
				</select>

				<label className="re-check">
					<input
						type="checkbox"
						checked={filters.freeSeatsOnly}
						onChange={(e) => setFilters((f) => ({ ...f, freeSeatsOnly: e.target.checked }))}
					/>
					Places libres
				</label>

				<button type="button" className="re-btn re-btn--ghost" disabled={locating} onClick={locate}>
					{locating ? 'Localisation…' : '📍 Autour de moi'}
				</button>
				<button type="button" className="re-btn" onClick={startCreate}>+ Poser une partie</button>
			</div>

			{creating && !pin && (
				<p className="re-tip">Touche la carte à l'endroit où vous jouez pour poser l'épingle.</p>
			)}

			<MeetupMap
				handle={mapRef}
				events={shown}
				spots={spots}
				hoveredId={hoveredId}
				selectedId={detail?.event.id ?? null}
				picking={creating}
				pin={pin}
				onHover={setHoveredId}
				onSelect={(id) => { void openEvent(id); }}
				onPick={(lat, lng) => {
					if (!isPlausibleFr(lat, lng)) { setError('Choisis un endroit en France.'); return; }
					setError(null);
					setPin({ lat, lng });
				}}
			/>

			{creating && (
				<CreateForm
					pin={pin}
					name={name}
					busy={busy}
					onPickAgain={() => setPin(null)}
					onCancel={() => { setCreating(false); setPin(null); }}
					onSubmit={onCreateSubmit}
				/>
			)}

			{created && (
				<div className="re-secret">
					<p><strong>Garde ce lien</strong> pour modifier ou annuler ta partie. C'est le seul moyen : il n'y a ni compte ni mail.</p>
					<input className="re-secretlink" readOnly value={secretUrl} onFocus={(e) => e.currentTarget.select()} />
					<div className="re-secretrow">
						<button
							type="button"
							className="re-btn re-btn--ghost"
							onClick={() => { void navigator.clipboard?.writeText(secretUrl); }}
						>
							Copier le lien
						</button>
						<button type="button" className="re-btn re-btn--ghost" onClick={() => setCreated(null)}>
							J'ai noté
						</button>
					</div>
				</div>
			)}

			{detail && (
				<EventPanel
					key={detail.event.id}
					event={detail.event}
					signups={detail.signups}
					isOrganizer={detail.isOrganizer}
					playerId={pid}
					name={name}
					busy={busy}
					shareUrl={shareUrl(detail.event.id)}
					onJoin={onJoin}
					onLeave={onLeave}
					onCancel={onCancel}
					onClose={closeEvent}
				/>
			)}

			<section className="re-list" aria-label="Parties">
				{loading && <p className="re-empty">Chargement…</p>}
				{!loading && shown.length === 0 && (
					<p className="re-empty">
						Aucune partie ici pour l'instant. Pose la tienne&nbsp;: c'est comme ça que la carte se remplit.
					</p>
				)}
				<ul>
					{shown.map((e) => {
						const left = seatsLeft(e);
						const far = me ? formatDistance(distanceM(me.lat, me.lng, e.lat, e.lng)) : null;
						return (
							<li
								key={e.id}
								className={`re-item ${hoveredId === e.id || detail?.event.id === e.id ? 're-item--on' : ''}`}
								onMouseEnter={() => setHoveredId(e.id)}
								onMouseLeave={() => setHoveredId(null)}
							>
								<button type="button" className="re-card" onClick={() => { void openEvent(e.id); }}>
									<span className="re-card-when">{formatShortDay(e.starts_at)} · {formatTime(e.starts_at)}</span>
									<span className="re-card-title">{FORMAT_LABEL[e.format]}</span>
									<span className="re-card-place">
										{e.label || 'Terrain'}{e.commune && e.commune !== e.label ? ` · ${e.commune}` : ''}
										{far ? ` · ${far}` : ''}
									</span>
									<span className={`re-card-seats ${left > 0 ? '' : 're-card-seats--full'}`}>
										{left > 0 ? `il manque ${left}` : 'complet'}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</section>

			<p className="re-legal">
				Fonds de carte&nbsp;: <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>.
				Aucune inscription, aucun mail. <a href="/confidentialite/">Ce qui est stocké</a>.
			</p>
		</div>
	);
}
