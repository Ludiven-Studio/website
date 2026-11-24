// « Se connecter avec Google » on the admin pages. With the studio's Web client set, Google's own button: a popup under
// the « Ludiven Studio » name, its ID token handed to Supabase with the nonce. Without it, or when Google's script
// cannot load, the site's button and the redirect through Supabase, as before.
import { useEffect, useRef, useState } from 'react';
import { GOOGLE_WEB_CLIENT_ID } from '../../data/site';
import { GIS_SHOW_MS, gisButtonShown, loadGis, makeNonce } from '../../lib/googleIdentity';
import { signIn, signInWithGoogleToken } from '../../lib/meetupAuth';

export default function GoogleSignIn({ onError, clientId = GOOGLE_WEB_CLIENT_ID }: { onError: (why: string) => void; clientId?: string }) {
	const host = useRef<HTMLDivElement>(null);
	const [fallback, setFallback] = useState(!clientId);
	const report = useRef(onError);
	report.current = onError;

	useEffect(() => {
		if (!clientId) return;
		let live = true;
		let timer = 0;
		void (async () => {
			try {
				const [gis, nonce] = await Promise.all([loadGis(), makeNonce()]);
				if (!live || !host.current) return;
				gis.initialize({
					client_id: clientId,
					nonce: nonce.hashed,
					ux_mode: 'popup',
					auto_select: false,
					itp_support: true,
					callback: ({ credential }) => {
						if (!credential) { report.current('Google n’a pas rendu de jeton.'); return; }
						void signInWithGoogleToken(credential, nonce.raw).then((why) => { if (why) report.current(why); });
					},
				});
				gis.renderButton(host.current, { type: 'standard', theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'fr' });
				// Google refuses an origin or a client by leaving its button hidden, with no error to catch: without
				// a button after a few seconds, the redirect comes back so the admin can always sign in.
				timer = window.setTimeout(() => { if (live && !gisButtonShown(host.current)) setFallback(true); }, GIS_SHOW_MS);
			} catch {
				if (live) setFallback(true);
			}
		})();
		return () => { live = false; window.clearTimeout(timer); };
	}, [clientId]);

	if (fallback) {
		return (
			<button type="button" className="pa-btn pa-primary" onClick={async () => {
				const why = await signIn('google', window.location.href);
				if (why) onError(why);
			}}>Se connecter avec Google</button>
		);
	}
	return <div ref={host} className="ak-gis" />;
}
