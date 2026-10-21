import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { playerId } from '../../lib/scores';
import { trackEvent } from '../../lib/analytics';
import {
	listMeetups, getMeetup, createMeetup, updateMeetup, cancelMeetup, deleteMeetup, joinMeetup, leaveMeetup,
	myMeetups, meetupsEnabled, rememberSecret, secretFor, forgetSecret, hasSecret, savedName, saveName,
	reportMeetup, reportSignup, readMuted, saveMuted, deleteAccount, LoginRequired, getTournament,
	type MeetupTournament,
} from '../../lib/meetups';
import {
	accountLabel, currentSession, onSessionChange, signIn, signOut, takeRedirectError,
	PROVIDER_LABEL, type Provider,
} from '../../lib/meetupAuth';
import {
	activeCount, applyFilters, applyTournamentFilters, DATE_LABEL, DEFAULT_FILTERS, NEAR_KM, rangeLabel,
	type DateFilter, type Filters, type RoleFilter,
} from '../../lib/meetupFilters';
import { challengeDay } from '../../lib/day';
import {
	FORMAT_LABEL, MAX_ACTIVE_EVENTS, ROLE_LABEL, seatsLeft, validateSignup,
	type MeetupEvent, type MeetupSignup, type MeetupSpot, type ReportReason, type Role,
} from '../../lib/meetupRules';
import {
	addPlace, isNearPlaces, nearestPlace, readNearKm, readPlaces, removePlace, saveNearKm, savePlaces,
	MAX_PLACES, SAME_PLACE_M, type Place, type PlaceKind,
} from '../../lib/meetupPlaces';
import { usePinToHome, type PinPlatform } from '../../lib/usePinToHome';
import { distanceM, formatDistance, isPlausibleFr, nearest } from '../../lib/meetupGeo';
import MeetupMap, { HOME, type MapHandle } from './MeetupMap';
import CreateForm, { type Draft } from './CreateForm';
import EventPanel from './EventPanel';
import TournamentPanel from './TournamentPanel';
import { demoEvents, demoSignups, demoTournaments, isDemo } from '../../lib/meetupDemo';
import MyGames from './MyGames';
import StoreLinks from './StoreLinks';
import { formatShortDay, formatTime } from './format';

const DATES: DateFilter[] = ['today', 'weekend', 'week', 'fortnight', 'all', 'custom'];
const ROLE_FILTERS: RoleFilter[] = ['all', 'tireur', 'pointeur'];
/* The island is client:only, so `window` is always there. The installed icon must
   land on the map, never on the ?e= card that happened to be open. */
const PAGE_URL = `${window.location.origin}/petanque-meet/`;
const APP_PAGE = '/petanque-meet/telecharger/';

interface Detail {
	event: MeetupEvent;
	signups: MeetupSignup[];
	isOrganizer: boolean;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : 'Une erreur est survenue.');
const NO_OWNER = "Lien d'organisateur manquant.";
/** Browse-only for now: every action goes through the app. The web login
 *  stays wired for the day the site opens actions again. */
const WEB_LOGIN: boolean = false;

/** The filter panel folds away: the map is the page, not the controls above it. */
const FILTERS_OPEN_KEY = 'ludiven-meetup-filters-open';
const readFiltersOpen = (): boolean => {
	try { return localStorage.getItem(FILTERS_OPEN_KEY) === '1'; } catch { return false; }
};

/** What to reopen after the provider sends the player back. ?e= covers the rest. */
const RESUME_KEY = 'ludiven-meetup-resume';
const takeResume = (): string | null => {
	try {
		const v = sessionStorage.getItem(RESUME_KEY);
		sessionStorage.removeItem(RESUME_KEY);
		return v;
	} catch { return null; }
};

/** The page is static, so the event id lives in the query string and the island
 *  resolves it (spec §2). replaceState keeps the back button out of it. */
function setUrl(eventId: string | null, secret?: string | null): void {
	const url = new URL(window.location.href);
	url.searchParams.delete('t');
	if (eventId) url.searchParams.set('e', eventId); else url.searchParams.delete('e');
	if (secret) url.searchParams.set('k', secret); else url.searchParams.delete('k');
	window.history.replaceState(null, '', url);
}

export default function RencontresApp() {
	const [pid] = useState(() => playerId());
	const [events, setEvents] = useState<MeetupEvent[]>([]);
	const [spots, setSpots] = useState<MeetupSpot[]>([]);
	const [tournaments, setTournaments] = useState<MeetupTournament[]>([]);
	const [tournament, setTournament] = useState<MeetupTournament | null>(null);
	// ?demo opens straight on the samples: a link to show someone what it looks like.
	const [demo, setDemo] = useState(() => new URLSearchParams(window.location.search).has('demo'));
	const demoData = useMemo(() => (demo ? { events: demoEvents(), tournaments: demoTournaments() } : null), [demo]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
	const [filtersOpen, setFiltersOpen] = useState(readFiltersOpen);
	// Paris day, as the date filters count them: the earliest a picked day can be.
	const today = challengeDay();
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const [detail, setDetail] = useState<Detail | null>(null);
	const [creating, setCreating] = useState(false);
	const [editing, setEditing] = useState(false);
	const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
	const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
	const [locating, setLocating] = useState(false);
	const [created, setCreated] = useState<{ id: string; secret: string } | null>(null);
	const [flash, setFlash] = useState<string | null>(null);
	const [spotId, setSpotId] = useState<string | null>(null);
	const [name, setName] = useState('');
	const [places, setPlaces] = useState<Place[]>([]);
	const [naming, setNaming] = useState<string | null>(null); // the draft name, while adding a place
	const [namingKind, setNamingKind] = useState<PlaceKind>('favorite');
	const [pinning, setPinning] = useState(false);
	const [mine, setMine] = useState<MeetupEvent[]>([]);
	const [cap, setCap] = useState({ active: 0, max: MAX_ACTIVE_EVENTS });
	const [muted, setMuted] = useState<string[]>([]);
	const [session, setSession] = useState<Session | null>(null);
	const [loginOpen, setLoginOpen] = useState<'create' | 'act' | null>(null);
	const [resumeCreate, setResumeCreate] = useState(false);
	const [note, setNote] = useState<string | null>(null);
	const uidRef = useRef<string | null | undefined>(undefined);
	const mapRef = useRef<MapHandle>(null);
	const okRef = useRef<HTMLDivElement>(null);
	// The map is the page, so the icon must open the map — not whatever game card
	// happened to be open, which is what the live URL would carry.
	const toHome = usePinToHome({ name: 'Rencontres pétanque', scope: '/petanque-meet', startUrl: PAGE_URL });

	const load = useCallback(async (): Promise<MeetupEvent[]> => {
		const r = await listMeetups();
		setEvents(r.events);
		setSpots(r.spots);
		setTournaments(r.tournaments ?? []);
		return r.events;
	}, []);

	/** Never fatal: « Mes parties » is a convenience, and the map has to open even
	 *  when a stored secret points at a game that no longer exists. */
	const loadMine = useCallback(async () => {
		try {
			const r = await myMeetups(pid);
			setMine(r.events);
			setCap({ active: r.active, max: r.max });
		} catch { /* keep the last list */ }
	}, [pid]);

	/** The ?t= link a club shares. Cancelled and past ones still open. */
	const openTournament = useCallback(async (id: string) => {
		if (isDemo(id)) {
			const t = demoTournaments().find((x) => x.id === id);
			if (!t) return;
			setTournament(t);
			setDetail(null);
			setSpotId(null);
			mapRef.current?.flyTo(t.lat, t.lng);
			return;
		}
		try {
			const r = await getTournament(id);
			setTournament(r.tournament);
			setDetail(null);
			setSpotId(null);
			setUrl(null);
			const url = new URL(window.location.href);
			url.searchParams.set('t', id);
			window.history.replaceState(null, '', url);
			mapRef.current?.flyTo(r.tournament.lat, r.tournament.lng);
		} catch (e) {
			setError(message(e));
		}
	}, []);

	const closeTournament = useCallback(() => {
		setTournament(null);
		setUrl(null);
	}, []);

	const openEvent = useCallback(async (id: string, fromUrl?: string | null) => {
		if (isDemo(id)) {
			const ev = demoEvents().find((x) => x.id === id);
			if (!ev) return;
			setTournament(null);
			setDetail({ event: ev, signups: demoSignups(ev), isOrganizer: false });
			setCreating(false);
			setEditing(false);
			setSpotId(null);
			mapRef.current?.flyTo(ev.lat, ev.lng);
			return;
		}
		const secret = secretFor(id, fromUrl);
		try {
			const d = await getMeetup(id, pid, secret);
			setTournament(null);
			setDetail(d);
			setCreating(false);
			setEditing(false);
			setSpotId(null);
			// The account proves ownership now; only a ?k= already there stays.
			setUrl(id, d.isOrganizer && fromUrl ? fromUrl : null);
			mapRef.current?.flyTo(d.event.lat, d.event.lng);
		} catch (e) {
			setError(message(e));
			setUrl(null);
		}
	}, [pid]);

	// The period strip scrolls on a phone: keep the picked one in view, dates and all.
	// The strip alone: scrollIntoView would also move the page on load.
	useEffect(() => {
		const on = document.querySelector<HTMLElement>('.re-filters .re-seg .re-segbtn--on');
		const strip = on?.parentElement;
		if (!on || !strip) return;
		const a = on.getBoundingClientRect();
		const b = strip.getBoundingClientRect();
		if (a.left < b.left) strip.scrollLeft -= b.left - a.left;
		else if (a.right > b.right) strip.scrollLeft += a.right - b.right;
	}, [filters.date, filters.from, filters.to, filtersOpen]);

	useEffect(() => {
		trackEvent('meetup_view');
		setName(savedName());
		setPlaces(readPlaces());
		setFilters((f) => ({ ...f, nearKm: readNearKm(NEAR_KM, f.nearKm) }));
		setMuted(readMuted());
		const back = takeRedirectError();
		if (back) setError(back);
		const url = new URLSearchParams(window.location.search);
		const wanted = url.get('e');
		const wantedTournament = url.get('t');
		void (async () => {
			// Waits for the ?code= exchange, so every call below already carries the account.
			const s = await currentSession();
			uidRef.current = s?.user.id ?? null;
			setSession(s);
			try {
				await load();
			} catch (e) {
				setError(message(e));
			} finally {
				setLoading(false);
			}
			await loadMine();
			if (wanted) await openEvent(wanted, url.get('k'));
			else if (wantedTournament) await openTournament(wantedTournament);
			if (s && takeResume() === 'create') setResumeCreate(true);
		})();
	}, [load, loadMine, openEvent, openTournament]);

	/** After any write: the list and the open card must agree, or the seat counter
	 *  on the map contradicts the one in the panel. */
	const refresh = useCallback(async (eventId: string) => {
		await load();
		await loadMine();
		await openEvent(eventId);
	}, [load, loadMine, openEvent]);

	useEffect(() => {
		if (!detail) return undefined;
		const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') closeEvent(); };
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	// eslint-disable-next-line react-hooks/exhaustive-deps -- closeEvent is stable
	}, [detail]);

	const closeEvent = useCallback(() => {
		setDetail(null);
		setCreated(null);
		setFlash(null);
		setEditing(false);
		setUrl(null);
	}, []);

	/* Signing in or out changes what « Mes parties » holds and who owns the open
	   card. setTimeout: auth calls made inside the auth callback can deadlock. */
	useEffect(() => onSessionChange((s) => {
		setSession(s);
		const uid = s?.user.id ?? null;
		if (uidRef.current === undefined || uidRef.current === uid) return;
		uidRef.current = uid;
		setTimeout(() => {
			void loadMine();
			const open = new URLSearchParams(window.location.search).get('e');
			if (open) void openEvent(open);
		}, 0);
	}), [loadMine, openEvent]);

	/** Proof of ownership. The ?k= link wins so a cleared browser can still get back
	 *  in — but only for the event the link names. « Mes parties » asks about rows the
	 *  URL says nothing about, and handing them the open card's key is a silent 403. */
	const secretOf = (eventId: string): string | undefined => {
		const q = new URLSearchParams(window.location.search);
		return secretFor(eventId, q.get('e') === eventId ? q.get('k') : null);
	};

	const run = useCallback(async (fn: () => Promise<void>) => {
		setBusy(true);
		// Drop the previous verdict before the new one: leaving a stale refusal on
		// screen during the retry is how a second attempt reads as a second failure.
		setError(null);
		setFlash(null);
		setNote(null);
		try {
			await fn();
			setError(null);
		} catch (e) {
			if (e instanceof LoginRequired) setLoginOpen('act');
			else setError(message(e));
		} finally {
			setBusy(false);
		}
	}, []);

	const onJoin = useCallback((seats: number, role: Role, who: string) => {
		if (!detail) return;
		if (!session) { setLoginOpen('act'); return; }
		const problem = validateSignup(who, seats, role);
		if (problem) { setError(problem); return; }
		void run(async () => {
			await joinMeetup(detail.event.id, pid, who, seats, role);
			saveName(who);
			setName(who);
			trackEvent('meetup_join', { format: detail.event.format });
			await refresh(detail.event.id);
			setFlash('Inscription enregistrée.');
		});
	}, [detail, pid, refresh, run, session]);

	const onLeave = useCallback(() => {
		if (!detail) return;
		void run(async () => {
			await leaveMeetup(detail.event.id, pid);
			trackEvent('meetup_leave');
			await refresh(detail.event.id);
			setFlash('Tu es désinscrit.');
		});
	}, [detail, pid, refresh, run]);

	const onEditSubmit = useCallback((v: Draft) => {
		if (!detail) return;
		const secret = secretOf(detail.event.id);
		if (!secret && !session) { setError(NO_OWNER); return; }
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
			setFlash('Modifications enregistrées.');
		});
	}, [detail, refresh, run, session]);

	const onCancel = useCallback(() => {
		if (!detail) return;
		const secret = secretOf(detail.event.id);
		if (!secret && !session) { setError(NO_OWNER); return; }
		if (!window.confirm('Annuler cette partie ? Les inscrits ne seront pas prévenus.')) return;
		void run(async () => {
			await cancelMeetup(detail.event.id, secret);
			trackEvent('meetup_cancel');
			await refresh(detail.event.id);
		});
	}, [detail, refresh, run, session]);

	/* Same button, two outcomes, and the row's label says which: with nobody signed
	   up the game leaves for good, otherwise it is cancelled so the link can still
	   tell the players it is off. The seat count decides here AND on the server —
	   this one only picks the wording, a stale count gets a 409 back. */
	const onRemoveMine = useCallback((e: MeetupEvent) => {
		const secret = secretOf(e.id);
		if (!secret && !session) { setError(NO_OWNER); return; }
		const joined = e.seats_taken - e.organizer_seats;
		const ask = joined > 0
			? `Annuler cette partie ? ${joined} joueur(s) inscrit(s) : le lien restera en ligne pour les prévenir.`
			: 'Supprimer cette partie ? Personne n\'est inscrit, elle disparaîtra pour de bon.';
		if (!window.confirm(ask)) return;
		void run(async () => {
			if (joined > 0) {
				await cancelMeetup(e.id, secret);
				trackEvent('meetup_cancel');
			} else {
				await deleteMeetup(e.id, secret);
				forgetSecret(e.id);
				trackEvent('meetup_delete');
			}
			if (detail?.event.id === e.id && joined === 0) closeEvent();
			await load();
			await loadMine();
			setFlash(joined > 0 ? 'Partie annulée.' : 'Partie supprimée.');
		});
	}, [closeEvent, detail, load, loadMine, run, session]);

	/** Only forgets the secret. The game stays up — this is the exit for a finished
	 *  one whose signups keep it from being deleted. */
	const onForgetMine = useCallback((id: string) => {
		forgetSecret(id);
		setMine((list) => list.filter((e) => e.id !== id));
	}, []);

	/** Rejects with the server's message: the panel shows it next to the button. */
	const onReport = useCallback(async (reason: ReportReason) => {
		if (!detail) return;
		try {
			await reportMeetup(detail.event.id, pid, reason);
		} catch (e) {
			if (e instanceof LoginRequired) setLoginOpen('act');
			throw e;
		}
		trackEvent('meetup_report', { reason });
	}, [detail, pid]);

	const onReportSignup = useCallback(async (signupId: string) => {
		if (!detail) return;
		const secret = secretOf(detail.event.id);
		if (!secret && !session) throw new Error(NO_OWNER);
		await reportSignup(detail.event.id, secret, signupId);
		trackEvent('meetup_report_signup');
	}, [detail, session]);

	const onMute = useCallback(() => {
		if (!detail) return;
		const next = [...new Set([...muted, detail.event.organizer_tag])];
		setMuted(next);
		saveMuted(next);
		trackEvent('meetup_mute');
		closeEvent();
	}, [closeEvent, detail, muted]);

	const unmuteAll = useCallback(() => {
		setMuted([]);
		saveMuted([]);
	}, []);

	const onEditMine = useCallback((id: string) => {
		void (async () => { await openEvent(id); setEditing(true); })();
	}, [openEvent]);

	/** `at` = a known terrain the player clicked, so posting there is one tap and the
	 *  pin lands exactly on the spot instead of near it. */
	const startCreate = useCallback((at?: { lat: number; lng: number }) => {
		if (!session) { setLoginOpen('create'); return; }
		setCreating(true);
		setEditing(false);
		setDetail(null);
		setCreated(null);
		setFlash(null);
		setError(null);
		setSpotId(null);
		setPin(at ?? null);
		setUrl(null);
	}, [session]);

	useEffect(() => {
		if (!resumeCreate) return;
		setResumeCreate(false);
		startCreate();
	}, [resumeCreate, startCreate]);

	/** null = left for the provider. */
	const login = useCallback(async (provider: Provider): Promise<string | null> => {
		try { if (loginOpen === 'create') sessionStorage.setItem(RESUME_KEY, 'create'); } catch { /* private mode */ }
		trackEvent('meetup_login', { provider });
		return signIn(provider, window.location.href);
	}, [loginOpen]);

	const logout = useCallback(() => {
		void run(async () => {
			await signOut();
			setCreating(false);
			setNote('Tu es déconnecté.');
		});
	}, [run]);

	const removeAccount = useCallback(() => {
		const ok = window.confirm(
			'Supprimer ton compte\u00a0? C’est définitif.\n\n'
			+ 'Tes parties en cours seront annulées, tes inscriptions et tes signalements effacés. '
			+ 'Tu pourras recréer un compte, mais rien ne sera récupéré.',
		);
		if (!ok) return;
		void run(async () => {
			await deleteAccount();
			await signOut();
			trackEvent('meetup_account_delete');
			setCreating(false);
			closeEvent();
			await load();
			await loadMine();
			setNote('Ton compte est supprimé.');
		});
	}, [closeEvent, load, loadMine, run]);

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
			await loadMine();
			await openEvent(r.id);
		});
	}, [load, loadMine, openEvent, pid, pin, run]);

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

	const savePlaceAt = useCallback((label: string, lat: number, lng: number, kind: PlaceKind = 'favorite') => {
		commitPlaces(addPlace(places, label, lat, lng, kind));
		trackEvent('meetup_place_add');
	}, [commitPlaces, places]);

	/* The map centre, not the geolocation: the winter address is exactly the one
	   you are NOT standing in when you save it. Pan there, name it, done. */
	const saveCurrentPlace = useCallback((label: string, kind: PlaceKind) => {
		const c = mapRef.current?.center();
		if (!c) return;
		savePlaceAt(label, c.lat, c.lng, kind);
		setNaming(null);
	}, [savePlaceAt]);

	/** Already a home port? Then the button must say so instead of quietly renaming
	 *  the one that is there. Same threshold addPlace merges on. */
	const isSavedPlace = (lat: number, lng: number): boolean => isNearPlaces(places, lat, lng, SAME_PLACE_M);

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

	// My own tag never counts as muted, even if an older mute caught it.
	const myTags = useMemo(() => new Set(mine.map((e) => e.organizer_tag)), [mine]);
	const shown = useMemo(() => {
		const off = new Set(muted.filter((t) => !myTags.has(t)));
		const source = demoData ? demoData.events : events;
		const kept = off.size ? source.filter((e) => !off.has(e.organizer_tag)) : source;
		return applyFilters(kept, filters, new Date(), places);
	}, [events, demoData, filters, places, muted, myTags]);
	const allTournaments = demoData ? demoData.tournaments : tournaments;
	const shownTournaments = useMemo(
		() => applyTournamentFilters(allTournaments, filters, new Date(), places),
		[allTournaments, filters, places]);
	// Every coming date on the open tournament's pitch, whatever the filter.
	const samePitch = useMemo(
		() => (tournament
			? allTournaments.filter((t) => t.spot_id === tournament.spot_id && t.id !== tournament.id)
				.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
			: []),
		[allTournaments, tournament]);

	const periodLabel = filters.date === 'custom' ? rangeLabel(filters) : DATE_LABEL[filters.date];
	const active = activeCount(filters, places.length > 0);
	const toggleFilters = (open: boolean): void => {
		setFiltersOpen(open);
		try { localStorage.setItem(FILTERS_OPEN_KEY, open ? '1' : '0'); } catch { /* private mode */ }
	};
	// The distance keeps its last value: only the toggle goes back to "partout".
	const resetFilters = (): void => setFilters((f) => ({ ...DEFAULT_FILTERS, nearKm: f.nearKm }));

	const toggleDemo = (): void => {
		const on = !demo;
		if (on) trackEvent('meetup_demo');
		setDemo(on);
		setDetail(null);
		setTournament(null);
		setSpotId(null);
		const url = new URL(window.location.href);
		url.searchParams.delete('e');
		url.searchParams.delete('t');
		url.searchParams.delete('k');
		if (on) url.searchParams.set('demo', ''); else url.searchParams.delete('demo');
		window.history.replaceState(null, '', url);
		if (on) mapRef.current?.flyTo(HOME[0], HOME[1], 10);
	};
	const shareUrl = (id: string): string => `${window.location.origin}/petanque-meet/?e=${id}`;
	const spot = spotId ? spots.find((s) => s.id === spotId) ?? null : null;

	/* The page is two screens tall, so a banner pinned to the top is a banner
	   nobody reads: the whole "Publier ne fait rien" report was a refusal
	   rendered above the fold while the player was looking at the button. The
	   verdict goes to the surface that asked for it. */
	const formOpen = creating || editing;
	const formError = formOpen ? error : null;
	const panelError = !formOpen && detail ? error : null;
	const pageError = !formOpen && !detail ? error : null;

	/* Whatever just came back — good or bad — has to be on screen, and after a
	   publish the form unmounts and the page shrinks under the scroll position. */
	useEffect(() => {
		if (created || flash || panelError) okRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}, [created, flash, panelError]);

	/* « Modifier » is clicked from a list that can sit a screen away from the form
	   it opens, which is the same trap as the banner above: a form nobody sees. */
	useEffect(() => {
		if (editing) okRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}, [editing]);

	if (!meetupsEnabled()) return <p className="re-empty">Le service n'est pas disponible.</p>;

	return (
		<div className="re-root">
			<header className="re-head">
				<h1>Rencontres pétanque</h1>
				<p className="re-sub">
					Trouve des joueurs et des concours autour de chez toi.
				</p>
				<div className="re-account">
					{session ? (
						<>
							<span>Connecté avec <strong>{accountLabel(session)}</strong></span>
							<button type="button" className="re-link" disabled={busy} onClick={logout}>Se déconnecter</button>
							<button type="button" className="re-link re-link--danger" disabled={busy} onClick={removeAccount}>
								Supprimer mon compte
							</button>
						</>
					) : (
						<>
							<span>Regarder la carte est libre.</span>
							<button type="button" className="re-link" onClick={() => setLoginOpen('act')}>
								{WEB_LOGIN ? 'Se connecter pour publier ou rejoindre' : "Publier ou rejoindre : dans l'appli"}
							</button>
						</>
					)}
				</div>
				{!toHome.installed && (
					<button
						type="button"
						className="re-install"
						onClick={() => { trackEvent('meetup_pin_open'); setPinning(true); }}
					>
						📲 Mettre la carte sur mon téléphone
					</button>
				)}
				<button type="button" className="re-demo-btn" onClick={toggleDemo}>
					{demo ? '✖ Quitter la démo' : '👀 Démo : voir des exemples'}
				</button>
			</header>

			{demo && (
				<p className="re-ok re-demo" role="status">
					Mode démo&nbsp;: ces parties et ces concours sont des exemples fictifs, pour voir à quoi
					ressemble la carte quand les joueurs et les clubs l'utilisent.
				</p>
			)}

			{pageError && (
				<p className="re-error" role="alert" onClick={() => setError(null)}>{pageError}</p>
			)}
			{note && !pageError && (
				<p className="re-ok" role="status" onClick={() => setNote(null)}>{note}</p>
			)}

			<div className="re-bar">
				<button
					type="button"
					className={`re-btn re-btn--ghost re-filtertoggle ${filtersOpen ? 're-filtertoggle--on' : ''}`}
					aria-expanded={filtersOpen}
					aria-controls="re-filters"
					onClick={() => toggleFilters(!filtersOpen)}
				>
					<span aria-hidden="true">⚙️</span> Filtres · {periodLabel}
					{active > 0 && <span className="re-badge" aria-label={`${active} filtre(s) actif(s)`}>+{active}</span>}
					<span className="re-chev" aria-hidden="true">▾</span>
				</button>
				<button type="button" className="re-btn re-btn--ghost" disabled={locating} onClick={locate}>
					{locating ? 'Localisation…' : '📍 Autour de moi'}
				</button>
				<button type="button" className="re-btn" onClick={() => startCreate()}>+ Poser une partie</button>
				{muted.length > 0 && (
					<button type="button" className="re-link re-unmute" onClick={unmuteAll}>
						Réafficher les organisateurs masqués ({muted.length})
					</button>
				)}
			</div>

			{filtersOpen && (
				<div id="re-filters" className="re-filters">
					<fieldset className="re-fgroup">
						<legend>Quand</legend>
						<div className="re-seg" role="group" aria-label="Quand">
							{DATES.map((d) => (
								<button
									key={d}
									type="button"
									className={`re-segbtn ${filters.date === d ? 're-segbtn--on' : ''}`}
									aria-pressed={filters.date === d}
									onClick={() => setFilters((f) => d !== 'custom' ? { ...f, date: d }
										// Today by default: the two fields below then only need moving.
										: { ...f, date: d, from: f.from || today, to: f.to || f.from || today })}
								>
									{d === 'custom' && filters.date === 'custom' ? `📅 ${rangeLabel(filters)}` : DATE_LABEL[d]}
								</button>
							))}
						</div>

						{filters.date === 'custom' && (
							<span className="re-dates" role="group" aria-label="Dates choisies">
								<label>
									Du
									<input
										type="date"
										className="re-select"
										min={today}
										value={filters.from}
										onChange={(e) => {
											const from = e.target.value;
											setFilters((f) => ({ ...f, from, to: f.to && f.to >= from ? f.to : from }));
										}}
									/>
								</label>
								<label>
									au
									<input
										type="date"
										className="re-select"
										min={filters.from || today}
										value={filters.to}
										onChange={(e) => {
											const to = e.target.value;
											setFilters((f) => ({ ...f, to: to && to >= f.from ? to : f.from }));
										}}
									/>
								</label>
							</span>
						)}
					</fieldset>

					<fieldset className="re-fgroup">
						<legend>Parties</legend>
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
					</fieldset>

					<fieldset className="re-fgroup">
						<legend>Concours</legend>
						<label className="re-check">
							<input
								type="checkbox"
								checked={filters.postersOnly}
								onChange={(e) => setFilters((f) => ({ ...f, postersOnly: e.target.checked }))}
							/>
							Avec affiche seulement
						</label>
					</fieldset>

					<fieldset className="re-fgroup">
						<legend>Mes lieux</legend>
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
									onSubmit={(e) => { e.preventDefault(); saveCurrentPlace(naming, namingKind); }}
								>
									<span className="re-seg" role="group" aria-label="Type de lieu">
										<button type="button" className={`re-segbtn ${namingKind === 'home' ? 're-segbtn--on' : ''}`}
											aria-pressed={namingKind === 'home'} onClick={() => setNamingKind('home')}>🏠 Ma maison</button>
										<button type="button" className={`re-segbtn ${namingKind === 'favorite' ? 're-segbtn--on' : ''}`}
											aria-pressed={namingKind === 'favorite'} onClick={() => setNamingKind('favorite')}>💚 Lieu favori</button>
									</span>
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
								<select
									className="re-select"
									aria-label="Autour de mes lieux"
									value={filters.nearPlaces ? String(filters.nearKm) : ''}
									onChange={(e) => {
										const km = Number(e.target.value);
										if (!km) { setFilters((f) => ({ ...f, nearPlaces: false })); return; }
										saveNearKm(km);
										setFilters((f) => ({ ...f, nearPlaces: true, nearKm: km }));
									}}
								>
									<option value="">Autour de mes lieux : partout</option>
									{NEAR_KM.map((km) => <option key={km} value={km}>À {km} km de mes lieux</option>)}
								</select>
							)}
						</div>

						{places.length === 0 && naming === null && (
							<p className="re-hint re-hint--places">
								Tu joues à plusieurs endroits&nbsp;? Centre la carte sur l'un d'eux et enregistre-le.
								Les distances partiront de tes lieux, pas d'un seul.
							</p>
						)}
					</fieldset>

					{(active > 0 || filters.date !== DEFAULT_FILTERS.date) && (
						<button type="button" className="re-link re-reset" onClick={resetFilters}>
							Réinitialiser les filtres
						</button>
					)}
				</div>
			)}

			{/* Above the map on purpose: the cap is spent from the button right above,
			    and « 3 / 3 en ligne » is the only thing that explains the refusal. */}
			{mine.length > 0 && (
				<MyGames
					events={mine}
					active={cap.active}
					max={cap.max}
					busy={busy}
					onOpen={(id) => { void openEvent(id); }}
					onEdit={onEditMine}
					onRemove={onRemoveMine}
					onForget={onForgetMine}
					canForget={hasSecret}
				/>
			)}

			{creating && !pin && (
				<p className="re-tip">Touche la carte à l'endroit où vous jouez pour poser l'épingle.</p>
			)}

			<MeetupMap
				handle={mapRef}
				events={shown}
				spots={spots}
				places={places}
				nearM={filters.nearPlaces && places.length > 0 ? filters.nearKm * 1000 : 0}
				tournaments={shownTournaments}
				hoveredId={hoveredId}
				selectedId={detail?.event.id ?? null}
				selectedTournamentId={tournament?.id ?? null}
				selectedSpotId={spot && !creating ? spot.id : null}
				me={me}
				picking={creating}
				pin={pin}
				onHover={setHoveredId}
				onSelect={(id) => { void openEvent(id); }}
				onSelectSpot={(id) => { closeTournament(); setSpotId(id); }}
				onSelectTournament={(id) => { void openTournament(id); }}
				onPick={(lat, lng) => {
					if (!isPlausibleFr(lat, lng)) { setError('Choisis un endroit en France.'); return; }
					setError(null);
					setPin({ lat, lng });
				}}
			/>
			<p className="re-legend" aria-label="Légende de la carte">
				<span><i className="re-dot re-dot--game" />Partie</span>
				<span><i className="re-dot re-dot--tournament" />Concours</span>
				<span><i className="re-dot re-dot--spot" />Terrain</span>
				<span><i className="re-dot re-dot--place" />Mes lieux</span>
				<span>Un chiffre = plusieurs, touche pour zoomer</span>
			</p>

			{/* A terrain used to be a dot with a tooltip and nothing else — 115 of them,
			    all inert. Clicking one now leads somewhere. */}
			{spot && !creating && (
				// Over the map, like a game: a panel under the map is a screen away on a phone.
				<div className="re-modal re-modal--tournament" onClick={() => setSpotId(null)}>
				<section className="re-sheet re-tournament" onClick={(e) => e.stopPropagation()} aria-label={spot.label || 'Terrain'}>
					<button type="button" className="re-close" onClick={() => setSpotId(null)} aria-label="Fermer">×</button>
					<h2>📍 {spot.label || 'Terrain de pétanque'}</h2>
					{spot.commune && spot.commune !== spot.label && <p className="re-where">{spot.commune}</p>}
					<p className="re-hint">
						{spot.confirmed
							? 'Terrain de pétanque connu (OpenStreetMap ou confirmé par plusieurs organisateurs).'
							: 'Terrain signalé par un joueur, pas encore confirmé.'}
					</p>
					<p className="re-hint">
						Aucune partie posée ici pour l'instant. Pour en organiser une, ou être prévenu des parties
						autour, utilise <a href={APP_PAGE}>l'appli Pétanque Meet</a>.
					</p>
					<div className="re-actions">
						<a
							className="re-btn re-btn--ghost"
							href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`}
							target="_blank"
							rel="noopener"
						>
							Y aller
						</a>
						<button
							type="button"
							className="re-btn"
							onClick={() => startCreate({ lat: spot.lat, lng: spot.lng })}
						>
							+ Poser une partie ici
						</button>
						<button
							type="button"
							className="re-btn re-btn--ghost"
							disabled={isSavedPlace(spot.lat, spot.lng)}
							onClick={() => savePlaceAt(spot.commune || spot.label || 'Mon lieu', spot.lat, spot.lng)}
						>
							{isSavedPlace(spot.lat, spot.lng) ? '🏠 Lieu enregistré' : '🏠 Enregistrer ce lieu'}
						</button>
					</div>
				</section>
				</div>
			)}

			{creating && (
				<CreateForm
					pin={pin}
					name={name}
					busy={busy}
					error={formError}
					onPickAgain={() => setPin(null)}
					onCancel={() => { setCreating(false); setPin(null); setError(null); }}
					onSubmit={onCreateSubmit}
				/>
			)}

			<div className="re-focus" ref={okRef}>
			{created && (
				<div className="re-secret">
					<p className="re-ok re-ok--loud">✅ Ta partie est en ligne.</p>
					<p>
						Elle est liée à ton compte&nbsp;: tu la retrouves dans «&nbsp;Mes parties&nbsp;» pour la modifier
						ou l'annuler, depuis n'importe quel appareil.
					</p>
					<div className="re-secretrow">
						<button type="button" className="re-btn re-btn--ghost" onClick={() => setCreated(null)}>
							OK
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
					error={formError}
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

			{tournament && (
				<TournamentPanel
					key={tournament.id}
					tournament={tournament}
					shareUrl={`${PAGE_URL}?t=${tournament.id}`}
					samePitch={samePitch}
					onOpen={(id) => { void openTournament(id); }}
					onClose={closeTournament}
				/>
			)}

			{detail && (
				// Over the map, like a tournament: on a phone a panel under the map is a screen away.
				<div className="re-modal re-modal--tournament" onClick={closeEvent}>
					<div className="re-sheet re-sheet--event" onClick={(e) => e.stopPropagation()}>
						<EventPanel
							key={detail.event.id}
							event={detail.event}
							signups={detail.signups}
							isOrganizer={detail.isOrganizer}
							name={name}
							busy={busy}
							error={panelError}
							flash={flash}
							placeSaved={isSavedPlace(detail.event.lat, detail.event.lng)}
							shareUrl={shareUrl(detail.event.id)}
							onJoin={onJoin}
							onLeave={onLeave}
							onEdit={() => setEditing(true)}
							onCancel={onCancel}
							onClose={closeEvent}
							onSavePlace={() => savePlaceAt(
								detail.event.commune || detail.event.label || 'Mon lieu',
								detail.event.lat, detail.event.lng,
							)}
							onReport={onReport}
							onReportSignup={onReportSignup}
							signedIn={Boolean(session)}
							onLogin={() => setLoginOpen('act')}
							canMute={!detail.isOrganizer && !myTags.has(detail.event.organizer_tag)}
							onMute={onMute}
						/>
					</div>
				</div>
			)}
			</div>

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

			<p className="re-legal re-rules">
				Ici, on joue franc jeu&nbsp;: ton vrai prénom, de vraies parties, et du respect pour tout le monde.
				Une partie louche ou un souci&nbsp;:{' '}
				<a href="mailto:contact@ludiven-studio.fr">contact@ludiven-studio.fr</a>.
			</p>
			<p className="re-legal">
				Fonds de carte&nbsp;: <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>.
				Regarder ne demande rien&nbsp;; publier, rejoindre ou signaler se fait dans{' '}
				<a href={APP_PAGE}>l'appli Pétanque Meet</a>.{' '}
				<a href="/petanque-meet/confidentialite/">Ce qui est stocké</a> · <a href="/petanque-meet/cgu/">Conditions</a>.
			</p>

			{loginOpen && (WEB_LOGIN
				? <LoginSheet onLogin={login} onClose={() => setLoginOpen(null)} />
				: <AppSheet onClose={() => setLoginOpen(null)} />)}

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

/** Any action that needs an account, while the site is browse-only. */
function AppSheet({ onClose }: { onClose(): void }) {
	return (
		<div className="re-modal" onClick={onClose}>
			<div className="re-sheet re-login" onClick={(e) => e.stopPropagation()}>
				<h2>Ça se passe dans l'appli</h2>
				<p className="re-hint">
					Ici, la carte se consulte librement. Pour publier une partie, la rejoindre, annoncer un concours
					ou signaler un abus, utilise l'appli Pétanque Meet, sur Android et iPhone.
				</p>
				<StoreLinks />
				<div className="re-formactions">
					<button type="button" className="re-btn re-btn--ghost" onClick={onClose}>Fermer</button>
				</div>
			</div>
		</div>
	);
}

/** Opened by any action that needs an account, and by a 401. */
function LoginSheet({ onLogin, onClose }: {
	onLogin(p: Provider): Promise<string | null>; onClose(): void;
}) {
	const [pending, setPending] = useState<Provider | null>(null);
	const [failed, setFailed] = useState<string | null>(null);

	const go = async (p: Provider): Promise<void> => {
		setPending(p);
		setFailed(null);
		const why = await onLogin(p);
		// null: the page is leaving for the provider, keep the button busy.
		if (why !== null) { setFailed(why); setPending(null); }
	};

	return (
		<div className="re-modal" onClick={onClose}>
			<div className="re-sheet re-login" onClick={(e) => e.stopPropagation()}>
				<h2>Connecte-toi pour publier, rejoindre ou signaler</h2>
				<p className="re-hint">
					Regarder la carte reste libre. Le prénom affiché aux autres joueurs est toujours celui que tu tapes.
				</p>
				{(['google', 'apple'] as const).map((p) => (
					<button
						key={p}
						type="button"
						className={`re-btn re-login-${p}`}
						disabled={pending !== null}
						onClick={() => { void go(p); }}
					>
						{pending === p ? 'Redirection…' : `Continuer avec ${PROVIDER_LABEL[p]}`}
					</button>
				))}
				{failed && <p className="re-error" role="alert">{failed}</p>}
				<div className="re-formactions">
					<button type="button" className="re-btn re-btn--ghost" onClick={onClose}>Fermer</button>
				</div>
			</div>
		</div>
	);
}
