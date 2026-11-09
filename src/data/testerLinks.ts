// The testers' builds of each app: the beta (the store build under a .beta id) and the dev build. Their pages are
// unlisted (noindex, out of the sitemap and of sw.js); TesterLinks.astro shows them after five taps on the app's icon
// on its download page. A page not written yet gets no button.
import { TEST_APK as DRAGONS_GEMS_DEV } from './dragonsGems';

export type TesterApp = 'petanque-meet' | 'petanque-scan' | 'petanque-game' | 'dragons-gems';

export const TESTER_LINKS: Record<TesterApp, { beta?: string; dev?: string }> = {
	'petanque-meet': { beta: '/petanque-meet/beta-0gn9lbmb/', dev: '/petanque-meet/test/' },
	'petanque-scan': { beta: '/petanque-scanner/beta-cd53d8qv/', dev: '/petanque-scanner/test/' },
	'petanque-game': { beta: '/petanque-game/beta-drm50otf/', dev: '/jeux/petanque/test/' },
	// No beta until the next one: its old page redirects to the product page (astro.config.mjs).
	'dragons-gems': { dev: DRAGONS_GEMS_DEV },
};
