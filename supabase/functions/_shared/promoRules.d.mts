// Types of promoRules.mjs, for the site's TypeScript and the function's Deno check.

export interface CatalogEntry {
	id: string;
	title: Record<string, string>;
	text?: Record<string, string>;
	image: string;
	clips?: Record<string, string>;
	link: { android?: string; ios?: string; web?: string };
	app?: string[];
	groups?: string[];
	hideIn?: string[];
	platforms?: string[];
	languages?: string[];
	start?: string;
	end?: string;
	weight?: number;
	/** The weight in each app that shows the entry, by its base id. */
	weights?: Record<string, number | { android?: number; ios?: number }>;
	spots?: string[];
	[key: string]: unknown;
}

export type MixFormat = 'banner' | 'interstitial';
export type MixCase = 'consent' | 'noConsent';
/** One row of "mix": per format, per consent case, the % of house ads. */
export type MixRow = Partial<Record<MixFormat, Partial<Record<MixCase, number>>>>;

export interface Catalog {
	schema: number;
	updated: string;
	rotationSeconds?: number;
	defaultLanguage?: string;
	entries: CatalogEntry[];
	/** "*" for every app, else a base app id. */
	mix?: Record<string, MixRow>;
	[key: string]: unknown;
}

export const SITE: string;
export const CATALOG_PATH: string;
export const CATALOG_URL: string;
export const PROMO_DIR: string;
export const SCHEMA: number;
export const LANGUAGES: string[];
export const BANNER_TEXT_MAX: number;
export const IMAGE_RULES: { minSide: number; maxSide: number; maxBytes: number };
export const CLIP_MAX_BYTES: number;
export const UPLOAD_PATH: RegExp;

export function missingGlyphs(s: string): string[];
export function sitePath(url: string, base?: string): string | null;
export function catalogUrl(path: string): string;
export function checkCatalog(catalog: unknown, options?: { strict?: boolean; base?: string; schema?: number | null }): {
	problems: string[];
	files: { path: string; what: string }[];
};
export const MIX_FORMATS: MixFormat[];
export const MIX_CASES: MixCase[];
export const MIX_DEFAULTS: Record<MixFormat, number>;
export const MIX_NO_CONSENT: number;
export function checkMix(mix: unknown): string[];
export function imageInfo(bytes: Uint8Array): { type: 'png' | 'jpeg'; width: number; height: number } | null;
export function checkImage(bytes: Uint8Array, what?: string): string[];
export const CLIP_MAX_SIDE: number;
export const CLIP_SECONDS: [number, number];
export function mp4Info(bytes: Uint8Array): { width: number; height: number; seconds: number } | null;
export function checkClip(bytes: Uint8Array, what?: string): string[];
export function clipWarnings(entry: unknown, lengths?: Record<string, number>): string[];
