// Types of appStoreSales.mjs, for the site's TypeScript and the function's Deno check.

export interface SalesRow {
	date: string;
	sku: string;
	title: string;
	type: string;
	parent: string;
	units: number;
	proceeds: number;
	currency: string;
	gross: number;
	grossCurrency: string;
}
/** One day's in-app sales of one app: proceeds (net of Apple's cut and tax) in their currency, gross in the buyers'. */
export interface AppStoreSale { date: string; app: string; units: number; proceeds: number; currency: string; gross: number; grossCurrency: string }
export interface AppStoreSales { generatedAt: string; from: string; to: string; sales: AppStoreSale[]; errors: string[]; cached?: boolean }
export interface Rates { generatedAt: string; date: string; perEur: Record<string, number>; cached?: boolean }

export const APPSTORE_KEY: string;
export const APPSTORE_CACHE_MINUTES: number;
export const RATES_KEY: string;
export const RATES_CACHE_MINUTES: number;
export const ASC_API: string;
export const ECB_RATES: string;
export function ascToken(env: { ASC_PRIVATE_KEY?: string; ASC_KEY_ID?: string; ASC_ISSUER_ID?: string }, now: Date): Promise<string>;
export function gunzip(buf: ArrayBuffer | Uint8Array): Promise<string>;
export function readSalesTsv(text: string): SalesRow[];
export function isInApp(row: Pick<SalesRow, 'type' | 'parent'>): boolean;
export function appStoreDays(now: Date): string[];
export function appStoreSummary(rows: SalesRow[], now: Date): { generatedAt: string; sales: AppStoreSale[] };
export function appStoreSales(env: Record<string, string | undefined>, fetchFn: typeof fetch, now: Date): Promise<AppStoreSales>;
export function readEcbRates(xml: string): { date: string; perEur: Record<string, number> };
export function ecbRates(fetchFn: typeof fetch, now: Date): Promise<Rates>;
