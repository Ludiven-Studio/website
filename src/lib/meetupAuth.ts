// Supabase Auth for /rencontres: browsing is open, acting (create, join, report)
// needs an account. Google or Apple only, PKCE, session kept in localStorage.

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../data/site';

export type Provider = 'google' | 'apple';

export const PROVIDER_LABEL: Record<Provider, string> = { google: 'Google', apple: 'Apple' };

let client: SupabaseClient | null = null;

/** Lazy: the moderation page and the map share meetups.ts, and only the map logs in. */
function auth(): SupabaseClient['auth'] {
	client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
		auth: {
			flowType: 'pkce',
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: true,
			// Own key: the game clients use the default one and never log in.
			storageKey: 'ludiven-meetup-auth',
		},
	});
	return client.auth;
}

/** Waits for the ?code= exchange on the way back from the provider. Never throws. */
export async function currentSession(): Promise<Session | null> {
	try {
		const { data } = await auth().getSession();
		return data.session;
	} catch {
		return null;
	}
}

export async function accessToken(): Promise<string | null> {
	return (await currentSession())?.access_token ?? null;
}

export function onSessionChange(cb: (s: Session | null) => void): () => void {
	const { data } = auth().onAuthStateChange((_event, s) => cb(s));
	return () => data.subscription.unsubscribe();
}

/** The provider error the redirect brought back, if any, removed from the URL. */
export function takeRedirectError(): string | null {
	const url = new URL(window.location.href);
	const hash = new URLSearchParams(url.hash.slice(1));
	const pick = (k: string): string | null => url.searchParams.get(k) ?? hash.get(k);
	const raw = pick('error_description') ?? pick('error');
	if (!raw) return null;
	for (const k of ['error', 'error_code', 'error_description']) url.searchParams.delete(k);
	if (hash.has('error') || hash.has('error_description')) url.hash = '';
	window.history.replaceState(window.history.state, '', url);
	return `La connexion a échoué (${raw.replace(/\+/g, ' ')}).`;
}

const NOT_READY = (p: Provider): string =>
	`La connexion avec ${PROVIDER_LABEL[p]} n'est pas encore disponible. Réessaie plus tard.`;

/** null = leaving for the provider; a string = why it could not.
 *  skip_http_redirect makes the authorize endpoint answer in JSON, so a provider
 *  not enabled yet is a readable refusal here instead of a raw JSON page. */
export async function signIn(provider: Provider, returnTo: string): Promise<string | null> {
	try {
		const { data, error } = await auth().signInWithOAuth({
			provider,
			options: { redirectTo: returnTo, skipBrowserRedirect: true },
		});
		if (error || !data.url) return NOT_READY(provider);
		const direct = data.url.replace(/&skip_http_redirect=true/, '');
		let res: Response;
		try {
			res = await fetch(data.url);
		} catch {
			// Can't probe: let the provider page speak for itself.
			window.location.assign(direct);
			return null;
		}
		const body = await res.json().catch(() => ({})) as { url?: string };
		if (!res.ok) return NOT_READY(provider);
		window.location.assign(body.url ?? direct);
		return null;
	} catch {
		return NOT_READY(provider);
	}
}

export async function signOut(): Promise<void> {
	try { await auth().signOut(); } catch { /* the local session is gone either way */ }
}

/** Google gives an email; Apple may give a relay address or nothing. */
export const accountLabel = (s: Session): string =>
	s.user.email || (s.user.user_metadata?.full_name as string | undefined) || 'ton compte';
