import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playerId } from '../../lib/scores';
import { trackEvent } from '../../lib/analytics';
import {
	listMeetups, getMeetup, createMeetup, updateMeetup, cancelMeetup, joinMeetup, leaveMeetup,
	meetupsEnabled, rememberSecret, secretFor, savedName, saveName,
} from '../../lib/meetups';
import {
	applyFilters, DATE_LABEL, DEFAULT_FILTERS,
	type DateFilter, type Filters, type RoleFilter,
} from '../../lib/meetupFilters';
import {
	FORMAT_LABEL, ROLE_LABEL, seatsLeft, validateSignup,
	type MeetupEvent, type MeetupSignup, type MeetupSpot, type Role,
} from '../../lib/meetupRules';
import {
	addPlace, nearestPlace, readPlaces, removePlace, savePlaces,
	MAX_PLACES, NEAR_M, type Place,
} from '../../lib/meetupPlaces';
import { usePinToHome, type PinPlatform } from '../../lib/usePinToHome';
import { distanceM, formatDistance, isPlausibleFr, nearest } from '../../lib/meetupGeo';
import MeetupMap, { type MapHandle } from './MeetupMap';
import CreateForm, { type Draft } from './CreateForm';
import EventPanel from './EventPanel';
import { formatShortDay, formatTime } from './format';

const DATES: DateFilter[] = ['today', 'weekend', 'week', 'all'];
const ROLE_FILTERS: RoleFilter[] = ['all', 'tireur', 'pointeur'];
/* The island is client:only, so `window` is always there. The installed icon must
   land on the map, never on the ?e= card that happened to be open. */
const PAGE_URL = `${window.location.origin}/rencontres/`;

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
	const [editing, setEditing] = useState(false);
	const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
	const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
	const [locating, setLocating] = useState(false);
	const [created, setCreated] = useState<{ id: string; secret: string } | null>(null);
	const [name, setName] = useState('');
	const [places, setPlaces] = useState<Place[]>([]);
	const [naming, setNaming] = useState<string | null>(null); // the draft name, while adding a place
	const [pinning, setPinning] = useState(false);
	const mapRef = useRef<MapHandle>(null);
	// The map is the page, so the icon must open the map — not whatever game card
	// happened to be open, which is what the live URL would carry.
	const toHome = usePinToHome({ name: 'Rencontres pétanque', scope: '/rencontres', startUrl: PAGE_URL });

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
			setEditing(false);
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
		setPlaces(readPlaces());
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
		setEditing(false);
		setUrl(null);
	}, []);

	/** Proof of ownership. The ?k= link wins so a cleared browser can still get back in. */
	const secretOf = (eventId: string): string | undefined =>
		secretFor(eventId, new URLSearchParams(window.location.search).get('k'));

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

	const onEditSubmit = useCallback((v: Draft) => {
		if (!detail) return;
		const secret = secretOf(detail.event.id);
		if (!secret) { setError('Lien d\'organisateur manquant.'); return; }
		void run(async () => {
			// Only what update_event accepts. The organizer name and seats are not in the
			// patch, so sending them would be a silent no-op the form would take for a save.
			await updateMeetup(detail.event.id, secret, {
				startsAt: v.startsAt, endsAt: v.endsAt, format: v.format,
				playersNeeded: v.playersNeeded, roleNeeded: v.roleNeeded,
			});
			trackEvent('meetup_edit', { format: v.format });
			setEditing(false);
			await refresh(detail.event.id);
		});
	}, [detail, refresh, run]);

	const onCancel = useCallback(() => {
		if (!detail) return;
		const secret = secretOf(detail.event.id);
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
		setEditing(false);
		setDetail(null);
		setCreated(null);
		setPin(null);
		setUrl(null);
	}, []);

	const onCreateSubmit = useCallback((v: Draft) => {
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

	const commitPlaces = useCallback((next: Place[]) => {
		setPlaces(next);
		savePlaces(next);
	}, []);

	/* The map centre, not the geolocation: the winter address is exactly the one
	   you are NOT standing in when you save it. Pan there, name it, done. */
	const saveCurrentPlace = useCallback((label: string) => {
		const c = mapRef.current?.center();
		if (!c) return;
		commitPlaces(addPlace(places, label, c.lat, c.lng));
		trackEvent('meetup_place_add');
		setNaming(null);
	}, [commitPlaces, places]);

	const dropPlace = useCallback((index: number) => {
		const next = removePlace(places, index);
		commitPlaces(next);
		// A filter with nothing left to filter on would just be a dead checkbox.
		if (!next.length) setFilters((f) => ({ ...f, nearPlaces: false }));
	}, [commitPlaces, places]);

	/** A free first guess: the terrain the player is looking at usually names the town. */
	const guessPlaceName = (): string => {
		const c = mapRef.current?.center();
		if (!c) return '';
		const s = nearest(spots, c.lat, c.lng, 3000);
		return s?.commune || s?.label || '';
	};

	/** Measured from the closest anchor the player gave us, and it says which one —
	 *  "18 km" is useless to someone who lives in two places. */
	const distanceLabel = (e: MeetupEvent): string | null => {
		const n = nearestPlace(places, e.lat, e.lng);
		const mine = me ? distanceM(me.lat, me.lng, e.lat, e.lng) : Infinity;
		if (n && n.m <= mine) return `${formatDistance(n.m)} de ${n.place.name}`;
		return me ? formatDistance(mine) : null;
	};

	const shown = useMemo(() => applyFilters(events, filters, new Date(), places), [events, filters, places]);
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
				{!toHome.installed && (
					<button
						type="button"
						className="re-install"
						onClick={() => { trackEvent('meetup_pin_open'); setPinning(true); }}
					>
						📲 Mettre la carte sur mon téléphone
					</button>
				)}
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

			{/* Home ports. One player summers at a campsite and winters in Lyon, and
			    "autour de moi" serves whichever one he is standing in — never both. */}
			<div className="re-places">
				{places.map((p, i) => (
					<span key={`${p.lat},${p.lng}`} className="re-place">
						<button
							type="button"
							className="re-place-go"
							onClick={() => mapRef.current?.flyTo(p.lat, p.lng, 12)}
						>
							🏠 {p.name}
						</button>
						<button
							type="button"
							className="re-place-off"
							aria-label={`Retirer ${p.name}`}
							onClick={() => dropPlace(i)}
						>
							×
						</button>
					</span>
				))}

				{naming !== null ? (
					<form
						className="re-naming"
						onSubmit={(e) => { e.preventDefault(); saveCurrentPlace(naming); }}
					>
						<input
							autoFocus
							value={naming}
							maxLength={24}
							placeholder="Lyon, le camping…"
							aria-label="Nom du lieu"
							onChange={(e) => setNaming(e.target.value)}
						/>
						<button type="submit" className="re-btn">Enregistrer</button>
						<button type="button" className="re-btn re-btn--ghost" onClick={() => setNaming(null)}>
							Annuler
						</button>
					</form>
				) : places.length < MAX_PLACES && (
					<button
						type="button"
						className="re-btn re-btn--ghost"
						onClick={() => setNaming(guessPlaceName())}
					>
						🏠 Enregistrer ce lieu
					</button>
				)}

				{places.length > 0 && naming === null && (
					<label className="re-check">
						<input
							type="checkbox"
							checked={filters.nearPlaces}
							onChange={(e) => setFilters((f) => ({ ...f, nearPlaces: e.target.checked }))}
						/>
						À moins de {Math.round(NEAR_M / 1000)} km de mes lieux
					</label>
				)}
			</div>

			{places.length === 0 && naming === null && (
				<p className="re-hint re-hint--places">
					Tu joues à plusieurs endroits&nbsp;? Centre la carte sur l'un d'eux et enregistre-le.
					Les distances partiront de tes lieux, pas d'un seul.
				</p>
			)}

			{creating && !pin && (
				<p className="re-tip">Touche la carte à l'endroit où vous jouez pour poser l'épingle.</p>
			)}

			<MeetupMap
				handle={mapRef}
				events={shown}
				spots={spots}
				places={places}
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

			{detail && editing && (
				<CreateForm
					key={`edit-${detail.event.id}`}
					pin={null}
					name={name}
					busy={busy}
					initial={{
						startsAt: detail.event.starts_at,
						endsAt: detail.event.ends_at,
						format: detail.event.format,
						playersNeeded: detail.event.players_needed,
						roleNeeded: detail.event.role_needed,
						organizerName: detail.event.organizer_name,
						organizerSeats: detail.event.organizer_seats,
					}}
					onPickAgain={() => { /* the spot is fixed once the game is posted */ }}
					onCancel={() => setEditing(false)}
					onSubmit={onEditSubmit}
				/>
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
					onEdit={() => setEditing(true)}
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
						const far = distanceLabel(e);
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

			{pinning && (
				<PinSheet
					platform={toHome.platform}
					nativePrompt={toHome.nativePrompt}
					onClose={() => setPinning(false)}
				/>
			)}
		</div>
	);
}

/** The answer to "plutôt une appli à télécharger": there already is one, it just
 *  never said so. iOS has no install API, so those steps are written out. */
function PinSheet({ platform, nativePrompt, onClose }: {
	platform: PinPlatform; nativePrompt: (() => void) | null; onClose: () => void;
}) {
	return (
		<div className="re-modal" onClick={onClose}>
			<div className="re-sheet" onClick={(e) => e.stopPropagation()}>
				<h2>Mettre la carte sur ton téléphone</h2>
				<p className="re-hint">
					Rien à télécharger&nbsp;: la page s'installe comme une application, avec son icône,
					et s'ouvre directement sur la carte.
				</p>
				{platform === 'ios' && (
					<ol className="re-steps">
						<li>Touche le bouton <strong>Partager</strong> en bas de Safari.</li>
						<li>Fais défiler et choisis <strong>« Sur l'écran d'accueil »</strong>.</li>
						<li>Valide avec <strong>Ajouter</strong>.</li>
					</ol>
				)}
				{platform === 'android' && !nativePrompt && (
					<ol className="re-steps">
						<li>Ouvre le menu <strong>⋮</strong> de Chrome, en haut à droite.</li>
						<li>Choisis <strong>« Ajouter à l'écran d'accueil »</strong> ou « Installer l'application ».</li>
					</ol>
				)}
				{platform === 'desktop' && !nativePrompt && (
					<p className="re-hint">
						Sur ordinateur, ajoute simplement cette page à tes favoris&nbsp;: l'installation
						a surtout du sens sur téléphone, là où on lit la carte au bord du terrain.
					</p>
				)}
				<div className="re-formactions">
					<button type="button" className="re-btn re-btn--ghost" onClick={onClose}>Fermer</button>
					{nativePrompt && (
						<button type="button" className="re-btn" onClick={() => { nativePrompt(); onClose(); }}>
							Installer
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
