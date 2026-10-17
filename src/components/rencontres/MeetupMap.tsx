import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import L from 'leaflet';
import type { MeetupEvent, MeetupSpot } from '../../lib/meetupRules';
import type { Place } from '../../lib/meetupPlaces';
import type { MeetupTournament } from '../../lib/meetups';
import { centreOf, clusterPoints } from '../../lib/mapClusters';
import {
	GAME_H, GAME_W, gameCard, gameClusterCard, ME_ICON, placeIcon, T_H, T_W, tournamentCard, tournamentClusterCard,
	type Slot,
} from './mapCards';

// Saint-Jean-de-Bournay — the launch area (spec §6).
export const HOME: [number, number] = [45.4489, 5.1381];

export interface MapHandle {
	flyTo(lat: number, lng: number, zoom?: number): void;
	fitAll(): void;
	/** What "ajouter ce lieu" means: wherever the player has just panned to. */
	center(): { lat: number; lng: number } | null;
}

interface Props {
	events: readonly MeetupEvent[];
	spots: readonly MeetupSpot[];
	places: readonly Place[];
	tournaments: readonly MeetupTournament[];
	hoveredId: string | null;
	selectedId: string | null;
	/** The open tournament or pitch: its pin stays grown, like the open game's. */
	selectedTournamentId?: string | null;
	selectedSpotId?: string | null;
	/** The player's position, once "Autour de moi" got it. */
	me?: { lat: number; lng: number } | null;
	/** When set, a click on the map drops the pin instead of selecting an event. */
	picking: boolean;
	pin: { lat: number; lng: number } | null;
	onHover(id: string | null): void;
	onSelect(id: string): void;
	onSelectSpot(id: string): void;
	onSelectTournament(id: string): void;
	onPick(lat: number, lng: number): void;
	handle?: Ref<MapHandle>;
}

/* Hand-drawn markers instead of L.Icon.Default: the default icon locates its PNG
   by reading the stylesheet back, and Vite rewrites that path to a hashed name —
   the markers come out as empty boxes. A divIcon also carries the hover/selected
   states the list needs, and ships no image at all. */
const pinHtml = (fill: string, ring: string): string =>
	`<svg viewBox="0 0 24 32" width="26" height="34" aria-hidden="true">`
	+ `<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${fill}" stroke="${ring}" stroke-width="1.5"/>`
	+ `<circle cx="12" cy="12" r="4.5" fill="#fff"/></svg>`;

const icon = (cls: string, fill: string, ring: string): L.DivIcon =>
	L.divIcon({ html: pinHtml(fill, ring), className: `re-pin ${cls}`, iconSize: [26, 34], iconAnchor: [13, 34] });

const ICONS = {
	spot: icon('re-pin--spot', '#c2c8cf', '#86909b'),
	hollow: icon('re-pin--hollow', 'rgba(194,200,207,0.45)', '#86909b'),
	pick: icon('re-pin--pick', '#2fbf71', '#146b3c'),
};

/** Pins closer than this many screen pixels merge into a count pin: about the
 *  marker's half width, so boards do not pile up. */
const CLUSTER_PX = 24;
const GAME_CLUSTER_PX = 110;
const TOURNAMENT_CLUSTER_PX = 85;
/** From this zoom every pin stands alone: two on one pitch would otherwise stay a
 *  count pin that no zoom can open. */
const NO_CLUSTER_ZOOM = 16;
const SPOTS_MIN_ZOOM = 12;

const FAN_ROW = 4;
const FAN_GAP = 6;

/** At full zoom, cards on the same pitch side by side instead of piled on one
 *  point, where only the top one showed: rows of FAN_ROW centred on the pin,
 *  by start, each new row above the last. */
export function fanSlots<T extends { spot_id: string; starts_at: string }>(
	items: readonly T[], w: number, h: number,
): Map<T, Slot> {
	const by = new Map<string, T[]>();
	for (const it of items) {
		const list = by.get(it.spot_id);
		if (list) list.push(it); else by.set(it.spot_id, [it]);
	}
	const out = new Map<T, Slot>();
	for (const list of by.values()) {
		if (list.length < 2) continue;
		list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
		list.forEach((it, i) => {
			const row = Math.floor(i / FAN_ROW);
			const inRow = Math.min(FAN_ROW, list.length - row * FAN_ROW);
			out.set(it, [(i % FAN_ROW - (inRow - 1) / 2) * (w + FAN_GAP), row * (h + FAN_GAP)]);
		});
	}
	return out;
}

const clusterIcon = (cls: string, fill: string, ring: string, count: number): L.DivIcon =>
	L.divIcon({
		html: pinHtml(fill, ring) + `<span class="re-pin-count">${count > 9 ? '9+' : count}</span>`,
		className: `re-pin re-pin--cluster ${cls}`, iconSize: [26, 34], iconAnchor: [13, 34],
	});

// Leaflet sets a string tooltip as innerHTML. Spot labels come from OSM, which anyone can edit.
const textNode = (text: string): HTMLElement => {
	const el = document.createElement('span');
	el.textContent = text;
	return el;
};

export default function MeetupMap({
	events, spots, places, tournaments, hoveredId, selectedId, selectedTournamentId = null, selectedSpotId = null,
	picking, pin, me = null,
	onHover, onSelect, onSelectSpot, onSelectTournament, onPick, handle,
}: Props) {
	const boxRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<L.Map | null>(null);
	const eventLayer = useRef<L.LayerGroup | null>(null);
	const spotLayer = useRef<L.LayerGroup | null>(null);
	const placeLayer = useRef<L.LayerGroup | null>(null);
	const tournamentLayer = useRef<L.LayerGroup | null>(null);
	const pinMarker = useRef<L.Marker | null>(null);
	const markers = useRef(new Map<string, L.Marker>());
	// Tournament and pitch pins by id, for the grown "open" state.
	const tournamentMarkers = useRef(new Map<string, L.Marker>());
	const spotMarkers = useRef(new Map<string, L.Marker>());
	const [zoom, setZoom] = useState(11);
	// Read inside Leaflet handlers, which are bound once — a captured prop would
	// be the value from the frame the map was created on.
	const cb = useRef({ onPick, onSelect, onSelectSpot, onSelectTournament, onHover, picking });
	cb.current = { onPick, onSelect, onSelectSpot, onSelectTournament, onHover, picking };

	useEffect(() => {
		// Strict mode mounts twice; a second init on the same node throws
		// "Map container is already initialized" and the page stays blank.
		if (mapRef.current || !boxRef.current) return;
		const map = L.map(boxRef.current, { center: HOME, zoom: 11, zoomControl: true });
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			// Mandatory: without it the service worker stores opaque responses,
			// padded to ~7 MB each, and the origin quota takes the precache down.
			crossOrigin: true,
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
		}).addTo(map);
		// Added in painting order: home ports sit under the games they exist to find.
		placeLayer.current = L.layerGroup().addTo(map);
		spotLayer.current = L.layerGroup().addTo(map);
		eventLayer.current = L.layerGroup().addTo(map);
		tournamentLayer.current = L.layerGroup().addTo(map);
		map.on('zoomend', () => setZoom(map.getZoom()));
		map.on('click', (e: L.LeafletMouseEvent) => {
			if (cb.current.picking) cb.current.onPick(e.latlng.lat, e.latlng.lng);
		});
		mapRef.current = map;
		// The container is sized by CSS; if the island mounted before layout
		// settled Leaflet measured 0×0 and would render a grey box in silence.
		setTimeout(() => map.invalidateSize(), 0);
		return () => { map.remove(); mapRef.current = null; };
	}, []);

	/** Member indices per pin at the current zoom; singletons from NO_CLUSTER_ZOOM on. */
	const groupsOf = <T extends { lat: number; lng: number }>(items: readonly T[], radius = CLUSTER_PX): number[][] => {
		const map = mapRef.current;
		if (!map || zoom >= NO_CLUSTER_ZOOM) return items.map((_, i) => [i]);
		return clusterPoints(items.map((it) => map.project([it.lat, it.lng], zoom)), radius);
	};

	/** A count pin: a tap zooms in two levels on the members' average. */
	const addCluster = <T extends { lat: number; lng: number }>(
		layer: L.LayerGroup, items: readonly T[], members: number[], icon: L.DivIcon,
	): void => {
		const c = centreOf(members, (i) => items[i]);
		L.marker([c.lat, c.lng], { icon, title: `${members.length}` })
			.on('click', () => mapRef.current?.flyTo([c.lat, c.lng], Math.min(19, zoom + 2), { duration: 0.6 }))
			.addTo(layer);
	};

	useImperativeHandle(handle, () => ({
		flyTo: (lat, lng, zoom = 14) => mapRef.current?.flyTo([lat, lng], zoom, { duration: 0.8 }),
		fitAll: () => {
			const pts = events.map((e) => [e.lat, e.lng] as [number, number]);
			if (pts.length) mapRef.current?.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 14 });
			else mapRef.current?.setView(HOME, 11);
		},
		center: () => {
			const c = mapRef.current?.getCenter();
			return c ? { lat: c.lat, lng: c.lng } : null;
		},
	}), [events]);

	useEffect(() => {
		const layer = placeLayer.current;
		if (!layer) return;
		layer.clearLayers();
		for (const p of places) {
			const m = L.marker([p.lat, p.lng], { icon: placeIcon(p), interactive: false });
			if (p.kind !== 'home') m.bindTooltip(textNode(p.name), { direction: 'top', permanent: false });
			m.addTo(layer);
		}
		if (me) L.marker([me.lat, me.lng], { icon: ME_ICON, interactive: false, zIndexOffset: 3000 }).addTo(layer);
	}, [places, me]);

	// Known places, drawn under the events. Unconfirmed user pins show hollow —
	// a pin in someone's garden stays faint and dies on its own (spec §6).
	useEffect(() => {
		const layer = spotLayer.current;
		if (!layer) return;
		layer.clearLayers();
		spotMarkers.current.clear();
		const busy = new Set(events.map((e) => e.spot_id));
		// As in the app: zoomed out, 100+ grey pins buried the games; pitches show from town scale.
		const free = zoom >= SPOTS_MIN_ZOOM ? spots.filter((s) => !busy.has(s.id)) : [];
		for (const g of groupsOf(free)) {
			if (g.length > 1) {
				addCluster(layer, free, g, clusterIcon('re-pin--spot', '#c2c8cf', '#86909b', g.length));
				continue;
			}
			const s = free[g[0]];
			const m = L.marker([s.lat, s.lng], { icon: s.confirmed ? ICONS.spot : ICONS.hollow, opacity: 0.85 })
				.bindTooltip(textNode(s.label || 'Terrain'), { direction: 'top' })
				// While picking, a marker would otherwise swallow the click that is
				// trying to drop the pin. Snapping to the terrain is the better answer.
				.on('click', () => {
					if (cb.current.picking) cb.current.onPick(s.lat, s.lng);
					else cb.current.onSelectSpot(s.id);
				})
				.addTo(layer);
			spotMarkers.current.set(s.id, m);
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps -- groupsOf/addCluster read the same zoom
	}, [spots, events, zoom]);

	useEffect(() => {
		const layer = eventLayer.current;
		if (!layer) return;
		layer.clearLayers();
		markers.current.clear();
		const slots = zoom >= NO_CLUSTER_ZOOM ? fanSlots(events, GAME_W, GAME_H) : null;
		for (const g of groupsOf(events, GAME_CLUSTER_PX)) {
			if (g.length > 1) {
				addCluster(layer, events, g, gameClusterCard(g.length));
				continue;
			}
			const e = events[g[0]];
			const m = L.marker([e.lat, e.lng], { icon: gameCard(e, slots?.get(e)), title: e.label || 'Terrain' })
				// Same rule as the terrains above, and the case that made it necessary:
				// a marker over the pin you were aiming for opened its event, which
				// closed the half-filled form without a word.
				.on('click', () => {
					if (cb.current.picking) cb.current.onPick(e.lat, e.lng);
					else cb.current.onSelect(e.id);
				})
				.on('mouseover', () => cb.current.onHover(e.id))
				.on('mouseout', () => cb.current.onHover(null))
				.addTo(layer);
			markers.current.set(e.id, m);
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps -- groupsOf/addCluster read the same zoom
	}, [events, zoom]);

	useEffect(() => {
		const layer = tournamentLayer.current;
		if (!layer) return;
		layer.clearLayers();
		tournamentMarkers.current.clear();
		const slots = zoom >= NO_CLUSTER_ZOOM ? fanSlots(tournaments, T_W, T_H) : null;
		for (const g of groupsOf(tournaments, TOURNAMENT_CLUSTER_PX)) {
			if (g.length > 1) {
				addCluster(layer, tournaments, g, tournamentClusterCard(g.length));
				continue;
			}
			const t = tournaments[g[0]];
			const m = L.marker([t.lat, t.lng], { icon: tournamentCard(t, slots?.get(t)), title: t.title, zIndexOffset: 500 })
				.on('click', () => {
					if (cb.current.picking) cb.current.onPick(t.lat, t.lng);
					else cb.current.onSelectTournament(t.id);
				})
				.addTo(layer);
			tournamentMarkers.current.set(t.id, m);
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps -- groupsOf/addCluster read the same zoom
	}, [tournaments, zoom]);

	// Highlight without rebuilding the layer: swapping icons keeps the popup
	// state and avoids a flash on every mouse move across the list.
	useEffect(() => {
		const active = selectedId ?? hoveredId;
		for (const [id, m] of markers.current) {
			m.getElement()?.classList.toggle('re-pin--active', id === active);
			m.setZIndexOffset(id === active ? 1000 : 0);
		}
	}, [hoveredId, selectedId, events]);

	// A class on the element, not a new icon: the pin keeps its own colour and grows.
	useEffect(() => {
		for (const [id, m] of tournamentMarkers.current) m.getElement()?.classList.toggle('re-pin--active', id === selectedTournamentId);
		for (const [id, m] of spotMarkers.current) m.getElement()?.classList.toggle('re-pin--active', id === selectedSpotId);
	}, [selectedTournamentId, selectedSpotId, tournaments, spots, events, zoom]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		if (!pin) {
			pinMarker.current?.remove();
			pinMarker.current = null;
			return;
		}
		if (pinMarker.current) pinMarker.current.setLatLng([pin.lat, pin.lng]);
		else pinMarker.current = L.marker([pin.lat, pin.lng], { icon: ICONS.pick, zIndexOffset: 2000 }).addTo(map);
	}, [pin]);

	useEffect(() => {
		boxRef.current?.classList.toggle('re-map--picking', picking);
	}, [picking]);

	return <div ref={boxRef} className="re-map" role="application" aria-label="Carte des parties" />;
}
