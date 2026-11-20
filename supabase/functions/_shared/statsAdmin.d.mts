// Types of statsAdmin.mjs, for the site's TypeScript and the function's Deno check.

export interface Count { key: string; count: number }
export interface Stats { visitors: number; visits: number; pageviews: number }
export interface Host { host: string; visitors: number; test: boolean }
export interface AdRate { ad: string; show: number; tap: number; rate: number | null }
export interface RetentionDay { rate: number; visitors: number; cohorts: number }
export interface Retention { d1: RetentionDay | null; d7: RetentionDay | null }

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
	errors: string[];
}

export interface Overview { generatedAt: string; apps: AppStats[]; cached?: boolean }

export interface Cache {
	get(key: string): Promise<{ body: Overview; fetchedAt: string } | null> | { body: Overview; fetchedAt: string } | null;
	put(key: string, body: Overview): Promise<unknown> | unknown;
}

export interface StatsEnv {
	UMAMI_URL?: string;
	UMAMI_USER?: string;
	UMAMI_PASSWORD?: string;
	PROMO_ADMIN_USER_ID?: string;
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
export function umami(base: string, fetchFn: typeof fetch): {
	login(username: string, password: string): Promise<void>;
	get(path: string): Promise<unknown>;
	post(path: string, body: unknown): Promise<unknown>;
};
export function appStats(u: ReturnType<typeof umami>, site: { id: string; name?: string; domain?: string }, now: Date): Promise<AppStats>;
export function overview(env: StatsEnv, fetchFn: typeof fetch, now: Date): Promise<Overview>;
export function statsHandler(deps: {
	env: StatsEnv;
	isAdmin: (req: Request) => Promise<boolean>;
	cache: Cache;
	fetch?: typeof fetch;
	now?: () => Date;
}): (req: Request) => Promise<Response>;
