import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import L from 'leaflet';
import type { MeetupEvent, MeetupSpot } from '../../lib/meetupRules';

// Saint-Jean-de-Bournay — the launch area (spec §6).
export const HOME: [number, number] = [45.4489, 5.1381];

export interface MapHandle {
	flyTo(lat: number, lng: number, zoom?: number): void;
	fitAll(): void;
}

interface Props {
	events: readonly MeetupEvent[];
	spots: readonly MeetupSpot[];
	hoveredId: string | null;
	selectedId: string | null;
	/** When set, a click on the map drops the pin instead of selecting an event. */
	picking: boolean;
	pin: { lat: number; lng: number } | null;
	onHover(id: string | null): void;
	onSelect(id: string): void;
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
	event: icon('re-pin--event', '#b14ae0', '#5a1f77'),
	active: icon('re-pin--active', '#ff8a3d', '#8a3d12'),
	spot: icon('re-pin--spot', '#8a8f9a', '#4a4f58'),
	hollow: icon('re-pin--hollow', 'rgba(138,143,154,0.35)', '#4a4f58'),
	pick: icon('re-pin--pick', '#2fbf71', '#146b3c'),
};

export default function MeetupMap({
	events, spots, hoveredId, selectedId, picking, pin, onHover, onSelect, onPick, handle,
}: Props) {
	const boxRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<L.Map | null>(null);
	const eventLayer = useRef<L.LayerGroup | null>(null);
	const spotLayer = useRef<L.LayerGroup | null>(null);
	const pinMarker = useRef<L.Marker | null>(null);
	const markers = useRef(new Map<string, L.Marker>());
	// Read inside Leaflet handlers, which are bound once — a captured prop would
	// be the value from the frame the map was created on.
	const cb = useRef({ onPick, onSelect, onHover, picking });
	cb.current = { onPick, onSelect, onHover, picking };

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
		spotLayer.current = L.layerGroup().addTo(map);
		eventLayer.current = L.layerGroup().addTo(map);
		map.on('click', (e: L.LeafletMouseEvent) => {
			if (cb.current.picking) cb.current.onPick(e.latlng.lat, e.latlng.lng);
		});
		mapRef.current = map;
		// The container is sized by CSS; if the island mounted before layout
		// settled Leaflet measured 0×0 and would render a grey box in silence.
		setTimeout(() => map.invalidateSize(), 0);
		return () => { map.remove(); mapRef.current = null; };
	}, []);

	useImperativeHandle(handle, () => ({
		flyTo: (lat, lng, zoom = 14) => mapRef.current?.flyTo([lat, lng], zoom, { duration: 0.8 }),
		fitAll: () => {
			const pts = events.map((e) => [e.lat, e.lng] as [number, number]);
			if (pts.length) mapRef.current?.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 14 });
			else mapRef.current?.setView(HOME, 11);
		},
	}), [events]);

	// Known places, drawn under the events. Unconfirmed user pins show hollow —
	// a pin in someone's garden stays faint and dies on its own (spec §6).
	useEffect(() => {
		const layer = spotLayer.current;
		if (!layer) return;
		layer.clearLayers();
		const busy = new Set(events.map((e) => e.spot_id));
		for (const s of spots) {
			if (busy.has(s.id)) continue;
			L.marker([s.lat, s.lng], { icon: s.confirmed ? ICONS.spot : ICONS.hollow, opacity: 0.85, interactive: false })
				.bindTooltip(s.label || 'Terrain', { direction: 'top' })
				.addTo(layer);
		}
	}, [spots, events]);

	useEffect(() => {
		const layer = eventLayer.current;
		if (!layer) return;
		layer.clearLayers();
		markers.current.clear();
		for (const e of events) {
			const m = L.marker([e.lat, e.lng], { icon: ICONS.event, title: e.label || 'Terrain' })
				.on('click', () => cb.current.onSelect(e.id))
				.on('mouseover', () => cb.current.onHover(e.id))
				.on('mouseout', () => cb.current.onHover(null))
				.addTo(layer);
			markers.current.set(e.id, m);
		}
	}, [events]);

	// Highlight without rebuilding the layer: swapping icons keeps the popup
	// state and avoids a flash on every mouse move across the list.
	useEffect(() => {
		const active = selectedId ?? hoveredId;
		for (const [id, m] of markers.current) {
			m.setIcon(id === active ? ICONS.active : ICONS.event);
			m.setZIndexOffset(id === active ? 1000 : 0);
		}
	}, [hoveredId, selectedId, events]);

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
