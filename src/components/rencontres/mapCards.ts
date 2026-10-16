// Map markers as small signboards ("cartouches"), one look per kind, the same as
// the PetanqueMeet app: a game is a terracotta board with its time and the seats
// it lacks, a tournament a gold-framed A4 card with its poster, a saved place a
// heart or a home board, the player's position the usual blue dot. Pitches keep
// their plain pin. Leaflet divIcons, so the text is real text: crisp at any size.
import L from 'leaflet';
import type { MeetupEvent } from '../../lib/meetupRules';
import type { MeetupTournament } from '../../lib/meetups';
import type { Place } from '../../lib/meetupPlaces';

const esc = (s: string): string =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A steel boule: grey sphere, light on the upper left, two parallel grooves.
const BOULE = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">'
	+ '<circle cx="12" cy="12" r="11.5" fill="#fbf7f0"/>'
	+ '<circle cx="12" cy="12" r="9" fill="#9aa0ad" stroke="#3d4a5c" stroke-width="1"/>'
	+ '<path d="M8.2 3.9c2.6 4.6 2.6 11.6 0 16.2M15.8 3.9c-2.6 4.6-2.6 11.6 0 16.2" stroke="#3d4a5c" stroke-width="1.2" fill="none"/>'
	+ '<ellipse cx="9" cy="8" rx="2.2" ry="1.4" fill="#fff" opacity="0.75"/></svg>';

const TROPHY = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">'
	+ '<path d="M7 3h10v3h3v2a4 4 0 0 1-4 4h-.4A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.4 12H8a4 4 0 0 1-4-4V6h3z" fill="#f5dc7a"/></svg>';

const HOUSE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">'
	+ '<path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z" fill="#3f8f7e"/></svg>';

const HEART = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">'
	+ '<path d="M12 21s-8.5-5.4-8.5-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.5 3.2C20.5 15.6 12 21 12 21z" fill="#f9cbd6" stroke="#e58aa2" stroke-width="1.6"/>'
	+ '<path d="M12 15.5s-3.6-2.3-3.6-4.8A2 2 0 0 1 12 9.4a2 2 0 0 1 3.6 1.3c0 2.5-3.6 4.8-3.6 4.8z" fill="#ffffff"/></svg>';

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** "18:00" today, "sam. 18:00" another day: the board has room for one line. */
function when(iso: string): string {
	const d = new Date(iso);
	const time = timeFmt.format(d);
	return d.toDateString() === new Date().toDateString() ? time : `${dayFmt.format(d)} ${time}`;
}

const board = (html: string, cls: string, w: number, h: number): L.DivIcon =>
	L.divIcon({ html, className: `re-pin re-cp-pin ${cls}`, iconSize: [w, h], iconAnchor: [w / 2, h] });

const GAME_W = 136;
const GAME_H = 58;

export function gameCard(e: MeetupEvent): L.DivIcon {
	const left = Math.max(0, e.players_needed - e.seats_taken);
	const seats = left > 0 ? `il manque ${left}` : 'complet';
	return board(
		`<div class="re-cp re-cp--game">${BOULE}<span class="re-cp-txt"><b>${esc(when(e.starts_at))}</b><small>${seats}</small></span></div>`,
		're-pin--event', GAME_W, GAME_H);
}

export function gameClusterCard(count: number): L.DivIcon {
	return board(
		`<div class="re-cp re-cp--game">${BOULE}<span class="re-cp-txt"><b>${count} parties</b><small>zoomer</small></span></div>`,
		're-pin--event re-pin--cluster', GAME_W, GAME_H);
}

const T_W = 78;
const T_H = 136;
// The poster window less the title's padding, and the font of .re-cp-title.
const TITLE_W = 60;
const TITLE_H = 87;
const TITLE_MAX = 11;
const TITLE_MIN = 7;
const TITLE_LINE = 1.15;
let measure: CanvasRenderingContext2D | null | undefined;

/** Lines of `size` px the title wraps to, or Infinity when a word is wider than the card. */
function titleLines(words: string[][], size: number): number {
	if (!measure) return 1;
	measure.font = `800 ${size}px system-ui, sans-serif`;
	const space = measure.measureText(' ').width;
	let lines = 1;
	let line = 0;
	for (const word of words) {
		for (const [i, piece] of word.entries()) {
			const w = measure.measureText(piece).width;
			if (w > TITLE_W) return Infinity;
			const gap = i === 0 && line > 0 ? space : 0;
			if (line > 0 && line + gap + w > TITLE_W) { lines++; line = w; } else line += gap + w;
		}
	}
	return lines;
}

/** Shrinks a long title instead of breaking a word, like the app's card. */
function titleSize(title: string): number {
	measure ??= document.createElement('canvas').getContext('2d');
	// A line may also break after a hyphen: Saint-Romain-de-Surieu.
	const words = title.split(/\s+/).filter(Boolean).map((w) => w.split(/(?<=-)/));
	for (let size = TITLE_MAX; size > TITLE_MIN; size -= 0.5) {
		if (titleLines(words, size) * size * TITLE_LINE <= TITLE_H) return size;
	}
	return TITLE_MIN;
}

/** The approved poster in an A4 window; without one, the title in the gold card. */
export function tournamentCard(t: MeetupTournament): L.DivIcon {
	// The thumbnail when there is one: a map full of A4 posters at full size is a lot of bandwidth.
	const src = t.poster_thumb_url ?? t.poster_url;
	const face = src
		? `<img src="${esc(src)}" alt="" loading="lazy" />`
		: `<span class="re-cp-title" style="font-size:${titleSize(t.title)}px">${esc(t.title)}</span>`;
	return board(
		`<div class="re-cp re-cp--tournament"><span class="re-cp-badge">${TROPHY}</span>`
		+ `<span class="re-cp-poster">${face}</span><span class="re-cp-date">${esc(shortDate.format(new Date(t.starts_at)))}</span></div>`,
		're-pin--tournament', T_W, T_H);
}

export function tournamentClusterCard(count: number): L.DivIcon {
	return board(
		`<div class="re-cp re-cp--tournament re-cp--stack"><span class="re-cp-badge">${TROPHY}</span>`
		+ `<span class="re-cp-poster"><span class="re-cp-title">${count} tournois</span></span><span class="re-cp-date">zoomer</span></div>`,
		're-pin--tournament re-pin--cluster', T_W, T_H);
}

export function placeIcon(p: Place): L.DivIcon {
	if (p.kind === 'home') {
		return board(`<div class="re-cp re-cp--home">${HOUSE}<span>${esc(p.name)}</span></div>`, 're-pin--home', 150, 40);
	}
	return L.divIcon({ html: HEART, className: 're-pin re-pin--home re-pin--fav', iconSize: [30, 30], iconAnchor: [15, 15] });
}

/** The usual "you are here": a blue dot with a soft halo. */
export const ME_ICON = L.divIcon({
	html: '<span class="re-me"></span>', className: 're-pin re-pin--me', iconSize: [22, 22], iconAnchor: [11, 11],
});
