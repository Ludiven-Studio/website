// Google's own sign-in button (Google Identity Services) for the admin pages: it hands back an ID token from the
// « Ludiven Studio » Google Cloud project's Web client, which Supabase takes with signInWithIdToken. The redirect
// sign-in goes through Supabase's one Google client, Pétanque Meet's, and so shows Meet's name and logo.
// Without GOOGLE_WEB_CLIENT_ID (src/data/site.ts) everything stays on that redirect.

export const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';

/** What the admin pages add to the site's Content-Security-Policy for the button (MainHead.astro). */
export const GIS_CSP = {
	script: 'https://accounts.google.com/gsi/client',
	style: 'https://accounts.google.com/gsi/style',
	frame: 'https://accounts.google.com/gsi/',
	connect: 'https://accounts.google.com/gsi/',
} as const;

/** The pages whose sign-in is Google's button: the admin, under the studio's own brand. */
export const usesGoogleButton = (path: string): boolean => /^\/admin(\/|$)/.test(path);

export async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A fresh nonce: Google gets its SHA-256 and puts it in the token, Supabase gets the raw one and checks the two. */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const raw = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '');
	return { raw, hashed: await sha256Hex(raw) };
}

export interface GoogleId {
	initialize(o: {
		client_id: string; callback: (r: { credential?: string }) => void; nonce: string;
		ux_mode?: 'popup'; auto_select?: boolean; itp_support?: boolean; use_fedcm_for_button?: boolean;
	}): void;
	renderButton(el: HTMLElement, o: Record<string, string | number>): void;
}

let loading: Promise<GoogleId> | null = null;

/** The GIS script, loaded once per page. Rejects when it cannot load, so the caller falls back to the redirect. */
export function loadGis(): Promise<GoogleId> {
	const ready = () => (window as unknown as { google?: { accounts?: { id?: GoogleId } } }).google?.accounts?.id;
	if (ready()) return Promise.resolve(ready()!);
	loading ??= new Promise<GoogleId>((resolve, reject) => {
		const s = document.createElement('script');
		s.src = GIS_SCRIPT;
		s.async = true;
		s.onload = () => (ready() ? resolve(ready()!) : reject(new Error('gis')));
		s.onerror = () => { loading = null; reject(new Error('gis')); };
		document.head.appendChild(s);
	});
	return loading;
}
