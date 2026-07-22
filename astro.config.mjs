import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import AstroPWA from '@vite-pwa/astro';

// https://astro.build/config
export default defineConfig({
    site: 'https://www.ludiven-studio.fr',
    integrations: [
        react(),
        sitemap({ filter: (page) => !page.includes('/labo') }),
        AstroPWA({
            registerType: 'autoUpdate',
            // Keep the hand-written public/manifest.webmanifest (+ MainHead link) — don't
            // generate or inject a second one.
            manifest: false,
            // We register sw.js ourselves in BaseLayout (auto-injection is skipped anyway
            // when manifest generation is off).
            injectRegister: false,
            workbox: {
                clientsClaim: true,
                skipWaiting: true,
                // Precache the whole app shell: every page + its JS/CSS/fonts → games play
                // offline after the first visit. Big images are cached on demand instead.
                globPatterns: ['**/*.{html,js,css,svg,woff2,webmanifest}'],
                // The /labo 3D demos pull ~1 MB of three.js — keep them out of the precache
                // (labo is experimental and excluded from the sitemap).
                globIgnores: [
                    '**/three.module*.js',
                    '**/Scene3D*.js',
                    '**/UnrealBloomPass*.js',
                    '**/LaboDemo*.js',
                ],
                navigateFallback: null,
                cleanupOutdatedCaches: true,
                maximumFileSizeToCacheInBytes: 3_500_000,
                runtimeCaching: [
                    {
                        // On-demand cache for images (game art, OG, backgrounds).
                        // Same-origin only in practice; Supabase (other origin, JSON) never matches.
                        urlPattern: ({ request }) => request.destination === 'image',
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'ludiven-images',
                            expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
                        },
                    },
                ],
            },
        }),
    ],
});
