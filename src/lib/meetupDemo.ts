// Sample games and tournaments for the "Démo" button. Built in the browser, never
// sent anywhere: the map shows what it looks like once players are on it, without
// a single fake row in the database. Dates are relative to now so it never goes stale.

import type { MeetupEvent, MeetupSignup } from './meetupRules';
import type { MeetupTournament } from './meetups';

export const DEMO_PREFIX = 'demo-';
export const isDemo = (id: string): boolean => id.startsWith(DEMO_PREFIX);

interface Place { label: string; commune: string; lat: number; lng: number; }

const PLACES: Place[] = [
	{ label: 'Boulodrome municipal', commune: 'Saint-Jean-de-Bournay', lat: 45.5005, lng: 5.1383 },
	{ label: 'Place du village', commune: 'Artas', lat: 45.5372, lng: 5.1636 },
	{ label: 'Parc des sports', commune: 'Châtonnay', lat: 45.4867, lng: 5.2117 },
	{ label: 'Place de la mairie', commune: 'Villeneuve-de-Marc', lat: 45.4676, lng: 5.1003 },
	{ label: 'Boulodrome du stade', commune: 'Bourgoin-Jallieu', lat: 45.5905, lng: 5.2744 },
	{ label: 'Jardin de ville', commune: 'Vienne', lat: 45.5245, lng: 4.8742 },
];

const at = (days: number, hour: number, minute = 0): Date => {
	const d = new Date();
	d.setDate(d.getDate() + days);
	d.setHours(hour, minute, 0, 0);
	return d;
};

type GameSeed = [place: number, days: number, hour: number, hours: number, format: MeetupEvent['format'],
	needed: number, role: MeetupEvent['role_needed'], organizer: string, taken: number];

const GAMES: GameSeed[] = [
	[0, 0, 18, 2, 'doublette', 4, 'any', 'Marc', 2],
	[1, 1, 10, 2, 'triplette', 6, 'tireur', 'Josiane', 4],
	[2, 2, 14, 3, 'melee', 8, 'any', 'Paul', 5],
	[3, 3, 17, 2, 'tete-a-tete', 2, 'any', 'Gérard', 1],
	[4, 5, 15, 3, 'doublette', 4, 'pointeur', 'Nadia', 3],
	[5, 6, 9, 2, 'triplette', 6, 'any', 'Bernard', 6],
];

const NAMES = ['Léo', 'Sami', 'Julie', 'René', 'Odile', 'Karim', 'Lucie'];

export function demoEvents(): MeetupEvent[] {
	return GAMES.map(([p, days, hour, hours, format, needed, role, organizer, taken], i) => {
		const place = PLACES[p];
		const start = at(days, hour, i % 2 ? 30 : 0);
		return {
			id: `${DEMO_PREFIX}game-${i}`, spot_id: `${DEMO_PREFIX}spot-${p}`,
			starts_at: start.toISOString(), ends_at: new Date(start.getTime() + hours * 3600_000).toISOString(),
			format, players_needed: needed, role_needed: role, organizer_name: organizer, organizer_seats: 1,
			organizer_tag: `${DEMO_PREFIX}tag-${i}`, status: 'open', hidden: false,
			lat: place.lat, lng: place.lng, label: place.label, commune: place.commune, confirmed: true, seats_taken: taken,
		};
	});
}

/** The players already in: seats add up to seats_taken, organizer excluded. */
export function demoSignups(event: MeetupEvent): MeetupSignup[] {
	const out: MeetupSignup[] = [];
	for (let i = 0; i < event.seats_taken - event.organizer_seats; i++) {
		out.push({
			id: `${event.id}-s${i}`, player_name: NAMES[(i + event.players_needed) % NAMES.length],
			seats: 1, role: 'any', is_me: false,
		});
	}
	return out;
}

type TournamentSeed = [place: number, days: number, hour: number, title: string, club: string,
	format: MeetupTournament['format'], category: MeetupTournament['category'], fee: number | null, poster: string | null];

const TOURNAMENTS: TournamentSeed[] = [
	[0, 12, 14, 'Concours de la Saint-Jean', 'Boule Saint-Jeannaise', 'triplette', 'open', 500, 'saint-jean'],
	[4, 20, 9, 'Challenge vétérans', 'Amicale Bouliste Berjallienne', 'doublette', 'veterans', 800, 'veterans'],
	[5, 33, 14, 'Grand prix de la ville', 'Pétanque Viennoise', 'triplette', 'open', 1000, 'grand-prix'],
	[2, 8, 19, 'Nocturne en doublettes', 'Comité des fêtes', 'doublette', 'mixte', 0, null],
	[1, 15, 9, 'Journée des boulistes', 'La Boule du Lac', 'doublette', 'open', 500, null],
];

/** A day with three contests: doublette and triplette in the morning, tête-à-tête after lunch. */
const DEMO_CONTESTS: Record<number, [hour: number, minute: number, format: MeetupTournament['format'], fee: number | null][]> = {
	4: [[9, 0, 'doublette', 500], [9, 0, 'triplette', 800], [14, 30, 'tete-a-tete', 300]],
};

export function demoTournaments(): MeetupTournament[] {
	return TOURNAMENTS.map(([p, days, hour, title, club, format, category, fee, poster], i) => {
		const place = PLACES[p];
		return {
			id: `${DEMO_PREFIX}tournament-${i}`, spot_id: `${DEMO_PREFIX}spot-${p}`, title, club_name: club,
			starts_at: at(days, hour).toISOString(), format, category, entry_fee_cents: fee,
			details: 'Inscriptions sur place une heure avant. 4 parties, dotation en fonction des inscrits.',
			contact_phone: null,
			poster_status: poster ? 'approved' : 'none',
			poster_url: poster ? `/assets/rencontres/demo/${poster}.jpg` : null,
			organizer_tag: `${DEMO_PREFIX}club-${i}`, status: 'open', hidden: false,
			// The three approval states, in turn.
			approval_source: i % 3 === 0 ? 'Calendrier du comité de l’Isère' : null,
			approval_declared: i % 3 === 1 ? true : null,
			// A little off the pitch, so the gold pin does not hide the game's.
			lat: place.lat + 0.003, lng: place.lng - 0.004, label: place.label, commune: place.commune,
			contests: (DEMO_CONTESTS[i] ?? [[hour, 0, format, fee]]).map(([h, m, f, cents]) => ({
				starts_at: at(days, h, m).toISOString(), format: f, category, entry_fee_cents: cents,
			})),
		};
	});
}
