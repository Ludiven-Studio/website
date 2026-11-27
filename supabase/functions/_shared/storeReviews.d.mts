// Types of storeReviews.mjs, for the site's TypeScript and the function's Deno check.

export type ReviewStore = 'appstore' | 'play';
export interface StoreApp { app: string; name: string; package: string; bundle: string }
export interface CountryRating { country: string; average: number; count: number }
/** One app in one store. live: found in that store. average: null without any rating. App Store: count is the
 *  ratings of the countries read; Google Play: the ratings of the exports, average Google's own overall one. */
export interface StoreRating { app: string; store: ReviewStore; live: boolean; average: number | null; count: number; countries: CountryRating[]; version: string; url: string }
export interface Review {
	app: string;
	store: ReviewStore;
	stars: number;
	at: string;
	title: string;
	text: string;
	lang: string;
	version: string;
	reply: string | null;
	replyAt: string | null;
	link: string;
}
export interface ReviewApp { app: string; name: string; stores: StoreRating[]; last30: { average: number | null; count: number } }
/** play: ok, closed (the service account lacks the reports permission), unset (no key), error. */
export interface Reviews { generatedAt: string; play: 'ok' | 'closed' | 'unset' | 'error'; apps: ReviewApp[]; reviews: Review[]; errors: string[]; cached?: boolean }

export const REVIEWS_KEY: string;
export const REVIEWS_CACHE_MINUTES: number;
export const REVIEWS_MAX: number;
export const STORE_APPS: StoreApp[];
export const COUNTRIES: string[];
export function combine(parts: { average: number; count: number }[]): { average: number | null; count: number };
export function readLookup(body: unknown, bundle: string, country: string): { country: string; average: number; count: number; version: string; url: string } | null;
export function appStoreRatings(fetchFn: typeof fetch, apps?: StoreApp[], countries?: string[]): Promise<{ apps: StoreRating[]; errors: string[] }>;
export function decodeReport(buf: ArrayBuffer | Uint8Array): string;
export function readPlayReviews(csvRows: string[][], app: string): Review[];
export function readPlayOverview(csvRows: string[][]): { date: string; average: number } | null;
export function playRatings(
	env: { PLAY_REPORTS_KEY?: string; PLAY_REPORTS_BUCKET?: string },
	fetchFn: typeof fetch,
	now: Date,
	apps?: StoreApp[],
): Promise<{ status: 'ok' | 'closed'; apps: StoreRating[]; reviews: Review[]; errors: string[] }>;
export function recent(reviews: Review[], now: Date, days?: number): { average: number | null; count: number };
export function storeReviews(env: { PLAY_REPORTS_KEY?: string; PLAY_REPORTS_BUCKET?: string }, fetchFn: typeof fetch, now: Date): Promise<Reviews>;
