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
	spots?: string[];
	[key: string]: unknown;
}

export interface Catalog {
	schema: number;
	updated: string;
	rotationSeconds?: number;
	defaultLanguage?: string;
	entries: CatalogEntry[];
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
export function imageInfo(bytes: Uint8Array): { type: 'png' | 'jpeg'; width: number; height: number } | null;
export function checkImage(bytes: Uint8Array, what?: string): string[];
export function checkClip(bytes: Uint8Array, what?: string): string[];
