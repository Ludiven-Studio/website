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
	activeCount, applyFilters, applyTournamentFilters, DEFAULT_FILTERS, NEAR_KM, rangeLabel,
	type DateFilter, type Filters, type RoleFilter,
} from '../../lib/meetupFilters';
import { challengeDay } from '../../lib/day';
import {
	MAX_ACTIVE_EVENTS, seatsLeft, validateSignup,
	type MeetupEvent, type MeetupSignup, type MeetupSpot, type ReportReason, type Role,
} from '../../lib/meetupRules';
import {
	addPlace, isNearPlaces, nearestPlace, readNearKm, readPlaces, removePlace, saveNearKm, savePlaces,
	MAX_PLACES, SAME_PLACE_M, type Place, type PlaceKind,
} from '../../lib/meetupPlaces';
import { distanceM, formatDistance, isPlausibleFr, nearest } from '../../lib/meetupGeo';
import MeetupMap, { type MapHandle } from './MeetupMap';
import CreateForm, { type Draft } from './CreateForm';
import EventPanel from './EventPanel';
import TournamentPanel from './TournamentPanel';
import MyGames from './MyGames';
import StoreLinks, { AppCard, AppIcon } from './StoreLinks';
import { formatShortDay, formatTime } from './format';
import { seatsText } from './mapCards';
import { LangContext, labels, PATHS, pick, useT, type Lang } from './i18n';

const DATES: DateFilter[] = ['today', 'weekend', 'week', 'fortnight', 'all', 'custom'];
const ROLE_FILTERS: RoleFilter[] = ['all', 'tireur', 'pointeur'];

interface Detail {
	event: MeetupEvent;
	signups: MeetupSignup[];
	isOrganizer: boolean;
}

/** Server refusals are French on both pages: the function writes them, the app shows them as is. */
const message = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback);
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

export default function RencontresApp({ lang = 'fr' }: { lang?: Lang }) {
	const tr = useMemo(() => pick(lang), [lang]);
	const L = labels(lang);
	const paths = PATHS[lang];
	// client:only, so `window` is always there.
	const pageUrl = `${window.location.origin}${paths.map}`;
	const failed = tr('Une erreur est survenue.', 'Something went wrong.');
	const noOwner = tr("Lien d'organisateur manquant.", 'The organizer link is missing.');
	const myPlace = tr('Mon lieu', 'My place');
	const [pid] = useState(() => playerId());
	const [events, setEvents] = useState<MeetupEvent[]>([]);
	const [spots, setSpots] = useState<MeetupSpot[]>([]);
	const [tournaments, setTournaments] = useState<MeetupTournament[]>([]);
	const [tournament, setTournament] = useState<MeetupTournament | null>(null);
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
			setError(message(e, failed));
		}
	}, [failed]);

	const closeTournament = useCallback(() => {
		setTournament(null);
		setUrl(null);
	}, []);

	const openEvent = useCallback(async (id: string, fromUrl?: string | null) => {
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
			setError(message(e, failed));
			setUrl(null);
		}
	}, [pid, failed]);

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
				setError(message(e, failed));
			} finally {
				setLoading(false);
			}
			await loadMine();
			if (wanted) await openEvent(wanted, url.get('k'));
			else if (wantedTournament) await openTournament(wantedTournament);
			if (s && takeResume() === 'create') setResumeCreate(true);
		})();
	}, [load, loadMine, openEvent, openTournament, failed]);

	/* Nothing around Saint-Jean-de-Bournay in the period reads as an empty map: open on what
	   there is instead. Once, on arrival, and never over a shared ?e= or ?t= link. */
	const framed = useRef(false);
	useEffect(() => {
		if (loading || framed.current) return;
		framed.current = true;
		const q = new URLSearchParams(window.location.search);
		if (!q.has('e') && !q.has('t')) mapRef.current?.frameIfEmpty();
	}, [loading]);

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
			else setError(message(e, failed));
		} finally {
			setBusy(false);
		}
	}, [failed]);

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
			setFlash(tr('Inscription enregistrée.', 'You are signed up.'));
		});
	}, [detail, pid, refresh, run, session, tr]);

	const onLeave = useCallback(() => {
		if (!detail) return;
		void run(async () => {
			await leaveMeetup(detail.event.id, pid);
			trackEvent('meetup_leave');
			await refresh(detail.event.id);
			setFlash(tr('Tu es désinscrit.', 'You have left the game.'));
		});
	}, [detail, pid, refresh, run, tr]);

	const onEditSubmit = useCallback((v: Draft) => {
		if (!detail) return;
		const secret = secretOf(detail.event.id);
		if (!secret && !session) { setError(noOwner); return; }
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
			setFlash(tr('Modifications enregistrées.', 'Changes saved.'));
		});
	}, [detail, refresh, run, session, noOwner, tr]);

	const onCancel = useCallback(() => {
		if (!detail) return;
		const secret = secretOf(detail.event.id);
		if (!secret && !session) { setError(noOwner); return; }
		if (!window.confirm(tr(
			'Annuler cette partie ? Les inscrits ne seront pas prévenus.',
			'Cancel this game? The players who signed up will not be told.',
		))) return;
		void run(async () => {
			await cancelMeetup(detail.event.id, secret);
			trackEvent('meetup_cancel');
			await refresh(detail.event.id);
		});
	}, [detail, refresh, run, session, noOwner, tr]);

	/* Same button, two outcomes, and the row's label says which: with nobody signed
	   up the game leaves for good, otherwise it is cancelled so the link can still
	   tell the players it is off. The seat count decides here AND on the server —
	   this one only picks the wording, a stale count gets a 409 back. */
	const onRemoveMine = useCallback((e: MeetupEvent) => {
		const secret = secretOf(e.id);
		if (!secret && !session) { setError(noOwner); return; }
		const joined = e.seats_taken - e.organizer_seats;
		const ask = joined > 0
			? tr(
				`Annuler cette partie ? ${joined} joueur(s) inscrit(s) : le lien restera en ligne pour les prévenir.`,
				`Cancel this game? ${joined} player(s) signed up: the link stays online to let them know.`,
			)
			: tr(
				'Supprimer cette partie ? Personne n\'est inscrit, elle disparaîtra pour de bon.',
				'Delete this game? Nobody has signed up, so it will be gone for good.',
			);
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
			setFlash(joined > 0 ? tr('Partie annulée.', 'Game cancelled.') : tr('Partie supprimée.', 'Game deleted.'));
		});
	}, [closeEvent, detail, load, loadMine, run, session, noOwner, tr]);

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
		if (!secret && !session) throw new Error(noOwner);
		await reportSignup(detail.event.id, secret, signupId);
		trackEvent('meetup_report_signup');
	}, [detail, session, noOwner]);

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
			setNote(tr('Tu es déconnecté.', 'You are signed out.'));
		});
	}, [run, tr]);

	const removeAccount = useCallback(() => {
		const ok = window.confirm(tr(
			'Supprimer ton compte\u00a0? C’est définitif.\n\n'
			+ 'Tes parties en cours seront annulées, tes inscriptions et tes signalements effacés. '
			+ 'Tu pourras recréer un compte, mais rien ne sera récupéré.',
			'Delete your account? This cannot be undone.\n\n'
			+ 'Your upcoming games will be cancelled, and your signups and reports erased. '
			+ 'You can create a new account, but nothing will be recovered.',
		));
		if (!ok) return;
		void run(async () => {
			await deleteAccount();
			await signOut();
			trackEvent('meetup_account_delete');
			setCreating(false);
			closeEvent();
			await load();
			await loadMine();
			setNote(tr('Ton compte est supprimé.', 'Your account is deleted.'));
		});
	}, [closeEvent, load, loadMine, run, tr]);

	const onCreateSubmit = useCallback((v: Draft) => {
		if (!pin) { setError(tr('Pose une épingle sur la carte.', 'Drop a pin on the map.')); return; }
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
	}, [load, loadMine, openEvent, pid, pin, run, tr]);

	// Button only, never on load (spec §8): a map that asks for your position the
	// second it opens reads as a tracker, and the answer is usually "block".
	const locate = useCallback(() => {
		if (!navigator.geolocation) {
			setError(tr('Ton navigateur ne partage pas la position.', 'Your browser does not share its location.'));
			return;
		}
		setLocating(true);
		navigator.geolocation.getCurrentPosition(
			(p) => {
				setLocating(false);
				setMe({ lat: p.coords.latitude, lng: p.coords.longitude });
				mapRef.current?.flyTo(p.coords.latitude, p.coords.longitude, 13);
			},
			() => { setLocating(false); setError(tr('Position indisponible.', 'Location unavailable.')); },
			{ enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
		);
	}, [tr]);

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
		savePlaceAt(label.trim() || myPlace, c.lat, c.lng, kind);
		setNaming(null);
	}, [savePlaceAt, myPlace]);

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
		if (n && n.m <= mine) return `${formatDistance(n.m, lang)} ${tr('de', 'from')} ${n.place.name}`;
		return me ? formatDistance(mine, lang) : null;
	};

	// My own tag never counts as muted, even if an older mute caught it.
	const myTags = useMemo(() => new Set(mine.map((e) => e.organizer_tag)), [mine]);
	const shown = useMemo(() => {
		const off = new Set(muted.filter((t) => !myTags.has(t)));
		const kept = off.size ? events.filter((e) => !off.has(e.organizer_tag)) : events;
		return applyFilters(kept, filters, new Date(), places);
	}, [events, filters, places, muted, myTags]);
	const shownTournaments = useMemo(
		() => applyTournamentFilters(tournaments, filters, new Date(), places),
		[tournaments, filters, places]);
	// Every coming date on the open tournament's pitch, whatever the filter.
	const samePitch = useMemo(
		() => (tournament
			? tournaments.filter((t) => t.spot_id === tournament.spot_id && t.id !== tournament.id)
				.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
			: []),
		[tournaments, tournament]);

	const periodLabel = filters.date === 'custom' ? rangeLabel(filters, lang) : L.date[filters.date];
	const active = activeCount(filters, places.length > 0);
	const toggleFilters = (open: boolean): void => {
		setFiltersOpen(open);
		try { localStorage.setItem(FILTERS_OPEN_KEY, open ? '1' : '0'); } catch { /* private mode */ }
	};
	// The distance keeps its last value: only the toggle goes back to "partout".
	const resetFilters = (): void => setFilters((f) => ({ ...DEFAULT_FILTERS, nearKm: f.nearKm }));

	const shareUrl = (id: string): string => `${pageUrl}?e=${id}`;
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

	if (!meetupsEnabled()) return <p className="re-empty">{tr("Le service n'est pas disponible.", 'The service is not available.')}</p>;

	return (
		<LangContext.Provider value={lang}>
		<div className="re-root">
			<header className="re-head">
				<h1>{tr('Rencontres pétanque', 'Pétanque meetups')}</h1>
				<p className="re-sub">
					{tr('Trouve des joueurs et des concours autour de chez toi.', 'Find players and tournaments near you.')}
				</p>
				{(session || WEB_LOGIN) && (
					<div className="re-account">
						{session ? (
							<>
								<span>{tr('Connecté avec', 'Signed in as')} <strong>{accountLabel(session)}</strong></span>
								<button type="button" className="re-link" disabled={busy} onClick={logout}>
									{tr('Se déconnecter', 'Sign out')}
								</button>
								<button type="button" className="re-link re-link--danger" disabled={busy} onClick={removeAccount}>
									{tr('Supprimer mon compte', 'Delete my account')}
								</button>
							</>
						) : (
							<>
								<span>{tr('Regarder la carte est libre.', 'Browsing the map is free.')}</span>
								<button type="button" className="re-link" onClick={() => setLoginOpen('act')}>
									{tr('Se connecter pour publier ou rejoindre', 'Sign in to post or join')}
								</button>
							</>
						)}
					</div>
				)}
				<AppCard />
			</header>

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
					<span aria-hidden="true">⚙️</span> {tr('Filtres', 'Filters')} · {periodLabel}
					{active > 0 && (
						<span className="re-badge" aria-label={tr(`${active} filtre(s) actif(s)`, `${active} active filter(s)`)}>
							+{active}
						</span>
					)}
					<span className="re-chev" aria-hidden="true">▾</span>
				</button>
				<button type="button" className="re-btn re-btn--ghost" disabled={locating} onClick={locate}>
					{locating ? tr('Localisation…', 'Locating…') : tr('📍 Autour de moi', '📍 Near me')}
				</button>
				<button type="button" className="re-btn" onClick={() => startCreate()}>{tr('+ Poser une partie', '+ Post a game')}</button>
				{muted.length > 0 && (
					<button type="button" className="re-link re-unmute" onClick={unmuteAll}>
						{tr(`Réafficher les organisateurs masqués (${muted.length})`, `Show hidden organizers again (${muted.length})`)}
					</button>
				)}
			</div>

			{filtersOpen && (
				<div id="re-filters" className="re-filters">
					<fieldset className="re-fgroup">
						<legend>{tr('Quand', 'When')}</legend>
						<div className="re-seg" role="group" aria-label={tr('Quand', 'When')}>
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
									{d === 'custom' && filters.date === 'custom' ? `📅 ${rangeLabel(filters, lang)}` : L.date[d]}
								</button>
							))}
						</div>

						{filters.date === 'custom' && (
							<span className="re-dates" role="group" aria-label={tr('Dates choisies', 'Chosen dates')}>
								<label>
									{tr('Du', 'From')}
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
									{tr('au', 'to')}
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
						<legend>{tr('Parties', 'Games')}</legend>
						<select
							className="re-select"
							aria-label={tr('Rôle', 'Role')}
							value={filters.role}
							onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value as RoleFilter }))}
						>
							{ROLE_FILTERS.map((r) => (
								<option key={r} value={r}>{r === 'all' ? tr('Tous les rôles', 'All roles') : L.role[r as Role]}</option>
							))}
						</select>

						<label className="re-check">
							<input
								type="checkbox"
								checked={filters.freeSeatsOnly}
								onChange={(e) => setFilters((f) => ({ ...f, freeSeatsOnly: e.target.checked }))}
							/>
							{tr('Places libres', 'Free seats only')}
						</label>
					</fieldset>

					<fieldset className="re-fgroup">
						<legend>{tr('Concours', 'Tournaments')}</legend>
						<label className="re-check">
							<input
								type="checkbox"
								checked={filters.postersOnly}
								onChange={(e) => setFilters((f) => ({ ...f, postersOnly: e.target.checked }))}
							/>
							{tr('Avec affiche seulement', 'With a poster only')}
						</label>
					</fieldset>

					<fieldset className="re-fgroup">
						<legend>{tr('Mes lieux', 'My places')}</legend>
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
										aria-label={tr(`Retirer ${p.name}`, `Remove ${p.name}`)}
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
									<span className="re-seg" role="group" aria-label={tr('Type de lieu', 'Kind of place')}>
										<button type="button" className={`re-segbtn ${namingKind === 'home' ? 're-segbtn--on' : ''}`}
											aria-pressed={namingKind === 'home'} onClick={() => setNamingKind('home')}>
											{tr('🏠 Ma maison', '🏠 My home')}
										</button>
										<button type="button" className={`re-segbtn ${namingKind === 'favorite' ? 're-segbtn--on' : ''}`}
											aria-pressed={namingKind === 'favorite'} onClick={() => setNamingKind('favorite')}>
											{tr('💚 Lieu favori', '💚 Favourite place')}
										</button>
									</span>
									<input
										autoFocus
										value={naming}
										maxLength={24}
										placeholder={tr('Lyon, le camping…', 'Lyon, the campsite…')}
										aria-label={tr('Nom du lieu', 'Place name')}
										onChange={(e) => setNaming(e.target.value)}
									/>
									<button type="submit" className="re-btn">{tr('Enregistrer', 'Save')}</button>
									<button type="button" className="re-btn re-btn--ghost" onClick={() => setNaming(null)}>
										{tr('Annuler', 'Cancel')}
									</button>
								</form>
							) : places.length < MAX_PLACES && (
								<button
									type="button"
									className="re-btn re-btn--ghost"
									onClick={() => setNaming(guessPlaceName())}
								>
									{tr('🏠 Enregistrer ce lieu', '🏠 Save this place')}
								</button>
							)}

							{places.length > 0 && naming === null && (
								<select
									className="re-select"
									aria-label={tr('Autour de mes lieux', 'Around my places')}
									value={filters.nearPlaces ? String(filters.nearKm) : ''}
									onChange={(e) => {
										const km = Number(e.target.value);
										if (!km) { setFilters((f) => ({ ...f, nearPlaces: false })); return; }
										saveNearKm(km);
										setFilters((f) => ({ ...f, nearPlaces: true, nearKm: km }));
									}}
								>
									<option value="">{tr('Autour de mes lieux : partout', 'Around my places: anywhere')}</option>
									{NEAR_KM.map((km) => (
										<option key={km} value={km}>{tr(`À ${km} km de mes lieux`, `Within ${km} km of my places`)}</option>
									))}
								</select>
							)}
						</div>

						{places.length === 0 && naming === null && (
							<p className="re-hint re-hint--places">
								{tr(
									'Tu joues à plusieurs endroits\u00a0? Centre la carte sur l\'un d\'eux et enregistre-le. Les distances partiront de tes lieux, pas d\'un seul.',
									'Do you play in several places? Centre the map on one of them and save it. Distances will then start from your places, not from just one.',
								)}
							</p>
						)}
					</fieldset>

					{(active > 0 || filters.date !== DEFAULT_FILTERS.date) && (
						<button type="button" className="re-link re-reset" onClick={resetFilters}>
							{tr('Réinitialiser les filtres', 'Reset filters')}
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
				<p className="re-tip">
					{tr("Touche la carte à l'endroit où vous jouez pour poser l'épingle.", 'Tap the map where you play to drop the pin.')}
				</p>
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
					if (!isPlausibleFr(lat, lng)) { setError(tr('Choisis un endroit en France.', 'Pick a place in France.')); return; }
					setError(null);
					setPin({ lat, lng });
				}}
			/>
			<p className="re-legend" aria-label={tr('Légende de la carte', 'Map legend')}>
				<span><i className="re-dot re-dot--game" />{tr('Partie', 'Game')}</span>
				<span><i className="re-dot re-dot--tournament" />{tr('Concours', 'Tournament')}</span>
				<span><i className="re-dot re-dot--spot" />{tr('Terrain', 'Pitch')}</span>
				<span><i className="re-dot re-dot--place" />{tr('Mes lieux', 'My places')}</span>
				<span>{tr('Un chiffre = plusieurs, touche pour zoomer', 'A number = several, tap to zoom in')}</span>
			</p>

			{/* A terrain used to be a dot with a tooltip and nothing else — 115 of them,
			    all inert. Clicking one now leads somewhere. */}
			{spot && !creating && (
				// Over the map, like a game: a panel under the map is a screen away on a phone.
				<div className="re-modal re-modal--tournament" onClick={() => setSpotId(null)}>
				<section className="re-sheet re-tournament" onClick={(e) => e.stopPropagation()} aria-label={spot.label || tr('Terrain', 'Pitch')}>
					<button type="button" className="re-close" onClick={() => setSpotId(null)} aria-label={tr('Fermer', 'Close')}>×</button>
					<h2>📍 {spot.label || tr('Terrain de pétanque', 'Pétanque pitch')}</h2>
					{spot.commune && spot.commune !== spot.label && <p className="re-where">{spot.commune}</p>}
					<p className="re-hint">
						{spot.confirmed
							? tr(
								'Terrain de pétanque connu (OpenStreetMap ou confirmé par plusieurs organisateurs).',
								'Known pétanque pitch (OpenStreetMap, or confirmed by several organizers).',
							)
							: tr('Terrain signalé par un joueur, pas encore confirmé.', 'Pitch added by a player, not confirmed yet.')}
					</p>
					<p className="re-hint">
						{tr(
							<>
								Aucune partie posée ici pour l'instant. Pour en organiser une, ou être prévenu des parties
								autour, utilise <a href={paths.app}>l'appli Pétanque Meet</a>.
							</>,
							<>
								No game posted here yet. To set one up, or to hear about games nearby, use{' '}
								<a href={paths.app}>the Pétanque Meet app</a>.
							</>,
						)}
					</p>
					<div className="re-actions">
						<a
							className="re-btn re-btn--ghost"
							href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`}
							target="_blank"
							rel="noopener"
						>
							{tr('Y aller', 'Directions')}
						</a>
						<button
							type="button"
							className="re-btn"
							onClick={() => startCreate({ lat: spot.lat, lng: spot.lng })}
						>
							{tr('+ Poser une partie ici', '+ Post a game here')}
						</button>
						<button
							type="button"
							className="re-btn re-btn--ghost"
							disabled={isSavedPlace(spot.lat, spot.lng)}
							onClick={() => savePlaceAt(spot.commune || spot.label || myPlace, spot.lat, spot.lng)}
						>
							{isSavedPlace(spot.lat, spot.lng)
								? tr('🏠 Lieu enregistré', '🏠 Place saved')
								: tr('🏠 Enregistrer ce lieu', '🏠 Save this place')}
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
					<p className="re-ok re-ok--loud">{tr('✅ Ta partie est en ligne.', '✅ Your game is online.')}</p>
					<p>
						{tr(
							<>
								Elle est liée à ton compte&nbsp;: tu la retrouves dans «&nbsp;Mes parties&nbsp;» pour la modifier
								ou l'annuler, depuis n'importe quel appareil.
							</>,
							<>It is linked to your account: find it under “My games” to edit or cancel it, from any device.</>,
						)}
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
					shareUrl={`${pageUrl}?t=${tournament.id}`}
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
								detail.event.commune || detail.event.label || myPlace,
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

			<section className="re-list" aria-label={tr('Parties', 'Games')}>
				{loading && <p className="re-empty">{tr('Chargement…', 'Loading…')}</p>}
				{!loading && shown.length === 0 && (
					<p className="re-empty">
						{tr(
							<>Aucune partie ici pour l'instant. Pose la tienne&nbsp;: c'est comme ça que la carte se remplit.</>,
							<>No games here yet. Post yours: that is how the map fills up.</>,
						)}
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
									<span className="re-card-when">{formatShortDay(e.starts_at, lang)} · {formatTime(e.starts_at, lang)}</span>
									<span className="re-card-title">{L.format[e.format]}</span>
									<span className="re-card-place">
										{e.label || tr('Terrain', 'Pitch')}{e.commune && e.commune !== e.label ? ` · ${e.commune}` : ''}
										{far ? ` · ${far}` : ''}
									</span>
									<span className={`re-card-seats ${left > 0 ? '' : 're-card-seats--full'}`}>
										{seatsText(left, lang)}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</section>

			<p className="re-legal re-rules">
				{tr(
					<>
						Ici, on joue franc jeu&nbsp;: ton vrai prénom, de vraies parties, et du respect pour tout le monde.
						Une partie louche ou un souci&nbsp;:
					</>,
					<>Play fair here: your real first name, real games, and respect for everyone. A dodgy game or a problem:</>,
				)}{' '}
				<a href="mailto:contact@ludiven-studio.fr">contact@ludiven-studio.fr</a>.
			</p>
			<p className="re-legal">
				{tr(
					<>
						Fonds de carte&nbsp;: <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>.
						Regarder ne demande rien&nbsp;; publier, rejoindre ou signaler se fait dans{' '}
						<a href={paths.app}>l'appli Pétanque Meet</a>.{' '}
						<a href="/petanque-meet/confidentialite/">Ce qui est stocké</a> · <a href="/petanque-meet/cgu/">Conditions</a>.
					</>,
					<>
						Base map: <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>.
						Browsing asks for nothing; posting, joining or reporting happens in{' '}
						<a href={paths.app}>the Pétanque Meet app</a>.{' '}
						<a href="/petanque-meet/confidentialite/" hrefLang="fr">What is stored</a> ·{' '}
						<a href="/petanque-meet/cgu/" hrefLang="fr">Terms</a> (in French).
					</>,
				)}
			</p>

			{loginOpen && (WEB_LOGIN
				? <LoginSheet onLogin={login} onClose={() => setLoginOpen(null)} />
				: <AppSheet onClose={() => setLoginOpen(null)} />)}
		</div>
		</LangContext.Provider>
	);
}

/** Any action that needs an account, while the site is browse-only. */
function AppSheet({ onClose }: { onClose(): void }) {
	const tr = useT();
	return (
		<div className="re-modal" onClick={onClose}>
			<div className="re-sheet re-login" onClick={(e) => e.stopPropagation()}>
				<h2 className="re-apptitle"><AppIcon size={40} /> {tr("Ça se passe dans l'appli", 'It happens in the app')}</h2>
				<p className="re-hint">
					{tr(
						"Ici, la carte se consulte librement. Pour publier une partie, la rejoindre, annoncer un concours ou signaler un abus, utilise l'appli Pétanque Meet, sur Android et iPhone.",
						'Here, the map is free to browse. To post a game, join one, announce a tournament or report abuse, use the Pétanque Meet app, on Android and iPhone.',
					)}
				</p>
				<StoreLinks />
				<div className="re-formactions">
					<button type="button" className="re-btn re-btn--ghost" onClick={onClose}>{tr('Fermer', 'Close')}</button>
				</div>
			</div>
		</div>
	);
}

/** Opened by any action that needs an account, and by a 401. */
function LoginSheet({ onLogin, onClose }: {
	onLogin(p: Provider): Promise<string | null>; onClose(): void;
}) {
	const tr = useT();
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
				<h2>{tr('Connecte-toi pour publier, rejoindre ou signaler', 'Sign in to post, join or report')}</h2>
				<p className="re-hint">
					{tr(
						'Regarder la carte reste libre. Le prénom affiché aux autres joueurs est toujours celui que tu tapes.',
						'Browsing the map stays free. The first name other players see is always the one you type.',
					)}
				</p>
				{(['google', 'apple'] as const).map((p) => (
					<button
						key={p}
						type="button"
						className={`re-btn re-login-${p}`}
						disabled={pending !== null}
						onClick={() => { void go(p); }}
					>
						{pending === p ? tr('Redirection…', 'Redirecting…') : tr(`Continuer avec ${PROVIDER_LABEL[p]}`, `Continue with ${PROVIDER_LABEL[p]}`)}
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
