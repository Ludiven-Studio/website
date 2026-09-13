import { useEffect, useState } from 'react';

// Pin a grocery list to the home screen. The site-wide manifest declares
// start_url "/", and Safari 16.4+ honours the manifest when adding to the home
// screen — so without this the icon would open the site root instead of the
// list. We swap in a page-local manifest whose start_url carries the ?l= secret.
// If a browser ignores it, the icon still lands on /courses, which falls back to
// the recent-lists view: degraded, not broken.

export type PinPlatform = 'ios' | 'android' | 'desktop';

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

export function usePinToHome(title: string): {
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

	// Point the manifest at THIS list for as long as the page is open.
	useEffect(() => {
		const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
		if (!link) return;
		const original = link.getAttribute('href');
		const name = title.trim() || 'Liste de courses';
		const manifest = {
			name,
			short_name: name.slice(0, 12),
			start_url: window.location.href, // the ?l= secret is the whole point
			scope: '/courses',
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
	}, [title]);

	return {
		platform,
		installed,
		nativePrompt: deferred ? () => { void deferred.prompt(); setDeferred(null); } : null,
	};
}
