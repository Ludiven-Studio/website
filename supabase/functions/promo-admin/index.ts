// promo-admin — the house ads catalogue's editor (/admin/pubs/), for Raphaël's account only.
// The catalogue stays in the website repo (public/promo/v1/catalog.json, what the apps in the stores read):
// each change is a commit on main through GitHub's API, never forced, so the site's deploy publishes it and
// its build checks it once more. It writes under public/promo/v1/ only.
//
// Secrets: PROMO_GITHUB_TOKEN (fine-grained, Contents read and write on the website repo), PROMO_ADMIN_USER_ID
// (Raphaël's Supabase user id). Deploy: supabase functions deploy promo-admin --project-ref mzrdfahmzllgbpudpsdi

import { createClient } from 'jsr:@supabase/supabase-js@2.117.0';
// @deno-types="../_shared/promoRules.d.mts"
import { CATALOG_PATH, PROMO_DIR, UPLOAD_PATH, checkCatalog, checkClip, checkImage } from '../_shared/promoRules.mjs';
import type { Catalog } from '../_shared/promoRules.d.mts';

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const GITHUB_API = Deno.env.get('GITHUB_API') ?? 'https://api.github.com';
const REPO = Deno.env.get('PROMO_REPO') ?? 'Ludiven-Studio/website';
const BRANCH = 'main';
// A deleted ad's files stay this long: a phone that kept an older catalogue offline still finds them.
const KEEP_DAYS = 30;
const RETRIES = 3;

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

class Refused extends Error {
	constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
		super(message);
	}
}

async function gh<T>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`${GITHUB_API}/repos/${REPO}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${Deno.env.get('PROMO_GITHUB_TOKEN')}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'User-Agent': 'ludiven-promo-admin',
			...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (!res.ok) throw new Refused(res.status, `GitHub ${method} ${path.split('?')[0]}: ${res.status}`, { github: (await res.text()).slice(0, 300) });
	return await res.json() as T;
}

/** Moves main to `sha`, never forced: false when main moved on meanwhile (GitHub's 422). */
async function moveMain(sha: string): Promise<boolean> {
	try {
		await gh('PATCH', `/git/refs/heads/${BRANCH}`, { sha, force: false });
		return true;
	} catch (e) {
		if (e instanceof Refused && e.status === 422) return false;
		throw e;
	}
}

const b64 = (bytes: Uint8Array): string => {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(s);
};
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0));

interface Head { sha: string; tree: string }

async function head(): Promise<Head> {
	const ref = await gh<{ object: { sha: string } }>('GET', `/git/ref/heads/${BRANCH}`);
	const commit = await gh<{ tree: { sha: string } }>('GET', `/git/commits/${ref.object.sha}`);
	return { sha: ref.object.sha, tree: commit.tree.sha };
}

async function catalogAt(ref: string): Promise<{ catalog: Catalog; blob: string }> {
	const file = await gh<{ content: string; sha: string }>('GET', `/contents/${CATALOG_PATH}?ref=${ref}`);
	return { catalog: JSON.parse(new TextDecoder().decode(unb64(file.content))), blob: file.sha };
}

/** Every file of the tree, by path. */
async function treeFiles(tree: string): Promise<Map<string, number>> {
	const t = await gh<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>('GET', `/git/trees/${tree}?recursive=1`);
	if (t.truncated) throw new Refused(502, 'the repo tree came back truncated');
	return new Map(t.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.size ?? 0]));
}

interface Version { sha: string; date: string; message: string }

/** The catalogue's versions on main, newest first. */
async function history(limit = 100): Promise<Version[]> {
	const list = await gh<{ sha: string; commit: { committer: { date: string }; message: string } }[]>(
		'GET', `/commits?sha=${BRANCH}&path=${CATALOG_PATH}&per_page=${limit}`);
	return list.map((c) => ({ sha: c.sha, date: c.commit.committer.date, message: c.commit.message.split('\n')[0] }));
}

/** The store pages of the entries that show (weight > 0) and whose link is new: an app not found is refused. */
async function storeProblems(next: Catalog, before: Catalog): Promise<{ problems: string[]; warnings: string[] }> {
	const problems: string[] = [];
	const warnings: string[] = [];
	const old = new Map((before.entries ?? []).map((e) => [e.id, JSON.stringify(e.link)]));
	await Promise.all(next.entries.filter((e) => (e.weight ?? 1) > 0 && old.get(e.id) !== JSON.stringify(e.link)).map(async (e) => {
		try {
			if (e.link?.android) {
				const r = await fetch(`https://play.google.com/store/apps/details?id=${encodeURIComponent(e.link.android)}&hl=en`, { signal: AbortSignal.timeout(10_000) });
				if (r.status === 404) problems.push(`${e.id}: ${e.link.android} is not on Google Play`);
				else if (!r.ok) warnings.push(`${e.id}: Google Play answered ${r.status}`);
				await r.body?.cancel();
			}
			if (e.link?.ios) {
				const r = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(e.link.ios)}`, { signal: AbortSignal.timeout(10_000) });
				const found = r.ok ? ((await r.json()) as { resultCount?: number }).resultCount : undefined;
				if (found === 0) problems.push(`${e.id}: ${e.link.ios} is not on the App Store`);
				else if (!found) warnings.push(`${e.id}: the App Store lookup did not answer`);
			}
		} catch {
			warnings.push(`${e.id}: its store page could not be checked`);
		}
	}));
	return { problems, warnings };
}

/** The promo/v1/ files that an older catalogue used and that none has used for KEEP_DAYS days. A version stays
 *  live until the next one replaces it (the newest, until now), so the days count from the day a file left. */
async function expiredFiles(next: Catalog, files: Map<string, number>, now: number): Promise<string[]> {
	const used = (c: Catalog): string[] => checkCatalog(c).files.map((f) => f.path);
	const keep = new Set(used(next));
	const once = new Set<string>();
	let liveUntil = now;
	for (const v of await history()) {
		const recent = now - liveUntil < KEEP_DAYS * 86_400_000;
		for (const p of used((await catalogAt(v.sha)).catalog)) (recent ? keep : once).add(p);
		liveUntil = Date.parse(v.date);
	}
	return [...once].filter((p) => p.startsWith(PROMO_DIR) && p !== CATALOG_PATH && !keep.has(p) && files.has(p));
}

interface Upload { path: string; sha: string }

/** Commits `next` (and the uploaded blobs) on main, on top of whatever main is when it lands. */
async function publish(next: Catalog, baseBlob: string | null, uploads: Upload[], message: string) {
	for (const u of uploads) if (!UPLOAD_PATH.test(u.path) || !/^[0-9a-f]{40}$/.test(u.sha)) throw new Refused(400, `not a file the admin may write: ${u.path}`);
	next.updated = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
	const { problems } = checkCatalog(next, { strict: true });
	if (problems.length) throw new Refused(400, 'the catalogue has problems', { problems });

	for (let attempt = 1; ; attempt++) {
		const h = await head();
		const current = await catalogAt(h.sha);
		if (baseBlob && current.blob !== baseBlob)
			throw new Refused(409, 'the catalogue changed since it was loaded: reload it', { current: current.catalog, blob: current.blob });
		const files = await treeFiles(h.tree);
		const uploaded = new Set(uploads.map((u) => u.path));
		const missing = checkCatalog(next).files.filter((f) => !files.has(f.path) && !uploaded.has(f.path));
		if (missing.length) throw new Refused(400, 'files are missing', { problems: missing.map((f) => `${f.what}: ${f.path} is not on the site`) });
		const stores = await storeProblems(next, current.catalog);
		if (stores.problems.length) throw new Refused(400, 'store pages are missing', { problems: stores.problems });
		const expired = await expiredFiles(next, files, Date.now());

		const catalogBlob = await gh<{ sha: string }>('POST', '/git/blobs', { content: JSON.stringify(next, null, 2) + '\n', encoding: 'utf-8' });
		const tree = await gh<{ sha: string }>('POST', '/git/trees', {
			base_tree: h.tree,
			tree: [
				{ path: CATALOG_PATH, mode: '100644', type: 'blob', sha: catalogBlob.sha },
				...uploads.map((u) => ({ path: u.path, mode: '100644', type: 'blob', sha: u.sha })),
				...expired.map((p) => ({ path: p, mode: '100644', type: 'blob', sha: null })),
			],
		});
		const commit = await gh<{ sha: string }>('POST', '/git/commits', { message, tree: tree.sha, parents: [h.sha] });
		if (await moveMain(commit.sha))
			return { commit: commit.sha, url: `https://github.com/${REPO}/commit/${commit.sha}`, blob: catalogBlob.sha, removed: expired, warnings: stores.warnings, attempts: attempt };
		// Main moved on meanwhile (another session's push): build the commit again on the new head.
		if (attempt >= RETRIES) throw new Refused(409, 'main kept moving: try again');
	}
}

async function isAdmin(req: Request): Promise<boolean> {
	const admin = Deno.env.get('PROMO_ADMIN_USER_ID');
	const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
	if (!admin || !jwt) return false;
	const { data } = await createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!).auth.getUser(jwt);
	return data?.user?.id === admin;
}

const SHA = /^[0-9a-f]{7,40}$/;

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
	if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
	if (!Deno.env.get('PROMO_GITHUB_TOKEN') || !Deno.env.get('PROMO_ADMIN_USER_ID')) return json({ error: 'not configured' }, 503);
	try {
		if (!(await isAdmin(req))) return json({ error: 'not allowed' }, 403);
	} catch {
		return json({ error: 'not allowed' }, 403);
	}

	let body: Record<string, unknown>;
	try {
		body = await req.json();
	} catch {
		return json({ error: 'invalid JSON body' }, 400);
	}
	try {
		switch (body.action) {
			case 'get': {
				const h = await head();
				const { catalog, blob } = await catalogAt(h.sha);
				const files = await treeFiles(h.tree);
				return json({
					head: h.sha,
					catalog,
					blob,
					files: [...files].filter(([p]) => p.startsWith(PROMO_DIR)).map(([path, size]) => ({ path, size })),
					missing: checkCatalog(catalog).files.filter((f) => !files.has(f.path)).map((f) => f.path),
				});
			}
			case 'history':
				return json({ versions: await history(30) });
			case 'version':
				if (typeof body.sha !== 'string' || !SHA.test(body.sha)) return json({ error: 'sha is required' }, 400);
				return json(await catalogAt(body.sha));
			case 'upload': {
				const path = String(body.path ?? '');
				if (!UPLOAD_PATH.test(path)) return json({ error: `not a file the admin may write: ${path}` }, 400);
				const bytes = unb64(String(body.base64 ?? ''));
				const problems = path.endsWith('.mp4') ? checkClip(bytes, path) : checkImage(bytes, path);
				if (problems.length) return json({ error: 'the file is refused', problems }, 400);
				const blob = await gh<{ sha: string }>('POST', '/git/blobs', { content: b64(bytes), encoding: 'base64' });
				return json({ path, sha: blob.sha, size: bytes.length });
			}
			case 'publish': {
				const uploads = Array.isArray(body.uploads) ? body.uploads as Upload[] : [];
				const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim().slice(0, 300) : '[CHANGED] House ads catalogue';
				return json(await publish(body.catalog as Catalog, typeof body.blob === 'string' ? body.blob : null, uploads, message));
			}
			case 'revert': {
				if (typeof body.sha !== 'string' || !SHA.test(body.sha)) return json({ error: 'sha is required' }, 400);
				const { catalog } = await catalogAt(body.sha);
				const date = typeof body.date === 'string' ? body.date.slice(0, 10) : '';
				return json(await publish(catalog, typeof body.blob === 'string' ? body.blob : null, [],
					`[CHANGED] House ads catalogue: back to the version of ${date} (${body.sha.slice(0, 7)})`));
			}
			default:
				return json({ error: 'unknown action' }, 400);
		}
	} catch (e) {
		if (e instanceof Refused) return json({ error: e.message, ...e.extra }, e.status >= 500 || e.status === 422 || e.status === 404 ? 502 : e.status);
		return json({ error: 'failed', detail: String(e).slice(0, 200) }, 500);
	}
});
