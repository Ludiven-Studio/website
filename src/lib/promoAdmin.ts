// The admin page's calls to promo-admin (supabase/functions/promo-admin). Signed in with the site's Google
// account (meetupAuth); the function lets Raphaël's account only through.
// PUBLIC_PROMO_ADMIN_URL, set in dev only, points at a local run of the function and its mock, with a fixed token.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../data/site';
import { accessToken } from './meetupAuth';
import type { Catalog } from '../../supabase/functions/_shared/promoRules.mjs';

export type { Catalog, CatalogEntry } from '../../supabase/functions/_shared/promoRules.mjs';

const LOCAL = import.meta.env.PUBLIC_PROMO_ADMIN_URL as string | undefined;
export const FUNCTION_URL = LOCAL || `${SUPABASE_URL}/functions/v1/promo-admin`;
/** Local runs skip the Google sign-in. */
export const LOCAL_RUN = !!LOCAL;

export interface Loaded {
	head: string;
	catalog: Catalog;
	blob: string;
	files: { path: string; size: number }[];
	missing: string[];
}
export interface Version { sha: string; date: string; message: string }
export interface Published { commit: string; url: string; blob: string; removed: string[]; warnings: string[] }
export interface Upload { path: string; sha: string }

export class AdminError extends Error {
	constructor(public status: number, message: string, public problems: string[] = []) {
		super(message);
	}
}

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
	const token = LOCAL_RUN ? 'local-dev' : await accessToken();
	if (!token) throw new AdminError(401, 'not signed in');
	let res: Response;
	try {
		res = await fetch(FUNCTION_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
			body: JSON.stringify({ action, ...payload }),
		});
	} catch {
		throw new AdminError(0, 'network error');
	}
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new AdminError(res.status, body.error ?? `HTTP ${res.status}`, body.problems ?? []);
	return body as T;
}

export const load = (): Promise<Loaded> => call('get');
export const versions = async (): Promise<Version[]> => (await call<{ versions: Version[] }>('history')).versions;
export const versionAt = (sha: string): Promise<{ catalog: Catalog; blob: string }> => call('version', { sha });
export const upload = (path: string, base64: string): Promise<Upload & { size: number }> => call('upload', { path, base64 });
export const publish = (catalog: Catalog, blob: string, uploads: Upload[], message: string): Promise<Published> =>
	call('publish', { catalog, blob, uploads, message });
export const revert = (sha: string, date: string, blob: string): Promise<Published> => call('revert', { sha, date, blob });

/** A picked file as base64, for the upload. */
export function fileBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}
