// Types of statsAdmin.mjs, for the site's TypeScript and the function's Deno check.

export interface Count { key: string; count: number }
export interface Stats { visitors: number; visits: number; pageviews: number }
export interface Host { host: string; visitors: number; test: boolean }
export interface AdRate { ad: string; show: number; tap: number; rate: number | null }
export interface RetentionDay { rate: number; visitors: number; cohorts: number }
export interface Retention { d1: RetentionDay | null; d7: RetentionDay | null }
export type ConsentPlatform = 'android' | 'ios';
/** One platform's consent figures; visitors are Umami's 28-day visitors on that OS. */
export interface ConsentSplit { platform: ConsentPlatform; visitors: number; answers: Count[]; opens: Count[] }
/** answers: ad_consent's result (yes, no); opens: app_open's ads (yes, no, unasked); null when the call failed.
 *  platforms: null when the app sends neither event, or Umami could not split them by OS. */
export interface Consent { answers: Count[] | null; opens: Count[] | null; platforms: ConsentSplit[] | null }

export interface AppStats {
	id: string;
	name: string;
	domain: string;
	periods: { d1: Stats | null; d7: Stats | null; d28: Stats | null };
	events: Count[] | null;
	hosts: Host[] | null;
	purchases: { items: Count[] | null; results: Count[] | null };
	signIn: { providers: Count[] | null; results: Count[] | null };
	ads: AdRate[] | null;
	retention: Retention | null;
	/** Null when both consent reads failed; missing from figures cached before it. */
	consent?: Consent | null;
	errors: string[];
}

export interface BoardApp {
	app: string;
	name: string;
	order: number;
	play_prod: string;
	play_test: string;
	ios: string;
	beta: string;
	main: string;
	waits: string[];
	updatedAt: string | null;
}
export interface Board { generatedAt: string; apps: BoardApp[] }
export interface BoardRow { app: string; data: unknown; updated_at: string }

export interface Overview { generatedAt: string; apps: AppStats[]; cached?: boolean }

export interface RevenueDay { date: string; revenue: number }
/** One ad network's share: network is LevelPlay's networkName (unityAds…), « ? » when the row has none. */
export interface RevenueNetwork { network: string; name: string; month: number; last30: number }
export interface RevenueApp {
	name: string;
	keys: string[];
	platforms: { platform: string; month: number }[];
	month: number;
	last30: number;
	impressions30: number;
	days: RevenueDay[];
	/** Missing from a report cached before the split by network. */
	networks?: RevenueNetwork[];
}
export interface Revenue {
	generatedAt: string;
	currency: string;
	/** The first report row's field names; missing from a report cached before them. */
	fields?: string[];
	monthStart: string;
	from: string;
	to: string;
	total: { month: number; last30: number; days: RevenueDay[]; networks?: RevenueNetwork[] };
	apps: RevenueApp[];
	cached?: boolean;
}

export type PurchaseKind = 'real' | 'unchecked' | 'tester' | 'promo' | 'dev' | 'beta';
export interface Purchase { at: string; app: string; item: string; store: string; later: boolean; kind: PurchaseKind; buyer: number | null }
export interface Purchases { generatedAt: string; from: string; purchases: Purchase[]; counted: number; buyers: number; errors: string[]; cached?: boolean }

export interface Cache {
	get(key: string): Promise<{ body: unknown; fetchedAt: string } | null> | { body: unknown; fetchedAt: string } | null;
	put(key: string, body: unknown): Promise<unknown> | unknown;
}

export interface StatsEnv {
	UMAMI_URL?: string;
	UMAMI_USER?: string;
	UMAMI_PASSWORD?: string;
	PROMO_ADMIN_USER_ID?: string;
	LEVELPLAY_SECRET_KEY?: string;
	LEVELPLAY_REFRESH_TOKEN?: string;
	PLAY_REPORTS_KEY?: string;
	PLAY_REPORTS_BUCKET?: string;
}

export const CACHE_MINUTES: number;
export const CACHE_KEY: string;
export const PERIODS: { d1: number; d7: number; d28: number };
export const RETENTION_DAYS: number;
export const TIMEZONE: string;

export function num(v: unknown): number;
export function readStats(raw: unknown): Stats;
export function readCounts(raw: unknown): Count[];
export function readRetention(raw: unknown): Retention | null;
export function tapRates(shows: Count[], taps: Count[]): AdRate[];
export function readHosts(counts: Count[]): Host[];
export function osPlatform(os: string): ConsentPlatform | null;
export function readConsent(
	values: (event: string, property: string, filters?: { os?: string }) => Promise<Count[] | null>,
	osVisitors: Count[] | null,
	errors: string[],
): Promise<Consent | null>;
export function umami(base: string, fetchFn: typeof fetch): {
	login(username: string, password: string): Promise<void>;
	get(path: string): Promise<unknown>;
	post(path: string, body: unknown): Promise<unknown>;
};
export function appStats(u: ReturnType<typeof umami>, site: { id: string; name?: string; domain?: string }, now: Date): Promise<AppStats>;
export function umamiSites(env: StatsEnv, fetchFn: typeof fetch): Promise<{ u: ReturnType<typeof umami>; sites: { id: string; name?: string; domain?: string }[] }>;
export function overview(env: StatsEnv, fetchFn: typeof fetch, now: Date): Promise<Overview>;
export const BOARD_FIELDS: string[];
export function readBoard(rows: unknown, now: Date): Board;
export const LEVELPLAY: string;
export const REVENUE_KEY: string;
export const REVENUE_CACHE_MINUTES: number;
export const REVENUE_DAYS: number;
export function revenueRange(now: Date): { today: string; monthStart: string; from30: string; startDate: string };
export function readRevenueRow(row: unknown): { date: string; key: string; name: string; platform: string; network: string; revenue: number; impressions: number } | null;
export const NETWORK_NAMES: Record<string, string>;
export function revenueSummary(rows: unknown[], now: Date): Revenue;
export function levelPlayRows(env: StatsEnv, fetchFn: typeof fetch, now: Date): Promise<unknown[]>;
export const PURCHASES_KEY: string;
export const PURCHASES_DAYS: number;
export const COUNTED: Set<string>;
export function purchaseKind(props: Map<string, string>, hostname?: string): PurchaseKind;
export function readPurchase(entry: unknown, app: string): (Omit<Purchase, 'buyer'> & { props: Map<string, string> }) | null;
export function recentPurchases(env: StatsEnv, fetchFn: typeof fetch, now: Date): Promise<Purchases>;
export function statsHandler(deps: {
	env: StatsEnv;
	isAdmin: (req: Request) => Promise<boolean>;
	cache: Cache;
	board?: { list(): Promise<BoardRow[]> };
	fetch?: typeof fetch;
	now?: () => Date;
}): (req: Request) => Promise<Response>;
