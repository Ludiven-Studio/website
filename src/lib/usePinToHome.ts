import { useEffect, useState } from 'react';

// Put a page on the home screen. The site-wide manifest declares start_url "/",
// and Safari 16.4+ honours the manifest when adding to the home screen — so
// without this the icon would open the site root instead of the page you were
// on. We swap in a page-local manifest for as long as that page is open.
// If a browser ignores it the icon still lands on the section: degraded, not
// broken.

export type PinPlatform = 'ios' | 'android' | 'desktop';

export interface PinTarget {
	/** Shown under the icon. */
	name: string;
	/** Which URLs the installed window keeps, e.g. '/courses'. */
	scope: string;
	/** Defaults to the current URL — /courses needs that, because its ?l= secret
	 *  IS the list. A page whose query string is transient must pass its own. */
	startUrl?: string;
}

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
}

const isStandalone = (): boolean =>
	window.matchMedia('(display-mode: standalone)').matches ||
	(window.navigator as { standalone?: boolean }).standalone === true;

/** iPadOS reports a Mac UA, so touch points are what separate it from a desktop. */
function detectPlatform(): PinPlatform {
	const ua = navigator.userAgent;
	if (/iPhone|iPod/.test(ua)) return 'ios';
	if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
	if (/Android/.test(ua)) return 'android';
	return 'desktop';
}

export function usePinToHome({ name, scope, startUrl }: PinTarget): {
	platform: PinPlatform;
	installed: boolean;
	nativePrompt: (() => void) | null;
} {
	const [platform] = useState<PinPlatform>(() => detectPlatform());
	const [installed, setInstalled] = useState(false);
	const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

	useEffect(() => { setInstalled(isStandalone()); }, []);

	// Chrome fires this instead of offering its own bar; holding it lets the
	// "Épingler" button trigger the real install dialog.
	useEffect(() => {
		const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
		window.addEventListener('beforeinstallprompt', onPrompt);
		return () => window.removeEventListener('beforeinstallprompt', onPrompt);
	}, []);

	useEffect(() => {
		const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
		if (!link) return;
		const original = link.getAttribute('href');
		const label = name.trim() || 'Ludiven Studio';
		const manifest = {
			name: label,
			short_name: label.slice(0, 12),
			start_url: startUrl ?? window.location.href,
			scope,
			display: 'standalone',
			background_color: '#ffffff',
			theme_color: '#7611a6',
			icons: [
				{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
				{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
				{ src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
			],
		};
		const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
		link.setAttribute('href', url);
		return () => {
			if (original) link.setAttribute('href', original);
			URL.revokeObjectURL(url);
		};
	}, [name, scope, startUrl]);

	return {
		platform,
		installed,
		nativePrompt: deferred ? () => { void deferred.prompt(); setDeferred(null); } : null,
	};
}
