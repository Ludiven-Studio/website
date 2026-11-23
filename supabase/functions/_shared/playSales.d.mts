// Types of playSales.mjs, for the site's TypeScript and the function's Deno check.

export interface PlayOrder {
	at: string;
	app: string;
	package: string;
	product: string;
	status: string;
	currency: string;
	price: number;
	charged: number;
	country: string;
}
export interface PlayTotal { currency: string; orders: number; charged: number }
export interface PlayOrders { generatedAt: string; from: string; orders: PlayOrder[]; totals: PlayTotal[]; errors: string[]; cached?: boolean }

export const ORDERS_KEY: string;
export const ORDERS_CACHE_MINUTES: number;
export const ORDERS_DAYS: number;
export function readKey(secret: unknown): { email: string; pem: string; tokenUrl: string };
export function readBucket(v: unknown): string;
export function googleToken(key: { email: string; pem: string; tokenUrl: string }, fetchFn: typeof fetch, now: Date): Promise<string>;
export function csvFromZip(buf: ArrayBuffer | Uint8Array): Promise<string>;
export function parseCsv(text: string): string[][];
export function readOrders(csvRows: string[][]): PlayOrder[];
export function playOrders(env: { PLAY_REPORTS_KEY?: string; PLAY_REPORTS_BUCKET?: string }, fetchFn: typeof fetch, now: Date): Promise<PlayOrders>;
