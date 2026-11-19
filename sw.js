// CringeBox service worker: offline support.
// Same-origin files: network-first (so updates arrive), falling back to cache when offline.
// CDN libraries: cache-first (pinned versions never change).
const VERSION = 'cringebox-v2';

const SHELL = [
    './',
    'index.html',
    'app.js',
    'manifest.webmanifest',
    'icons/icon.svg'
];

const CDN = [
    'https://cdn.tailwindcss.com/3.4.16',
    'https://cdn.jsdelivr.net/npm/wavesurfer.js@7.8.6/dist/wavesurfer.min.js',
    'https://cdn.jsdelivr.net/npm/wavesurfer.js@7.8.6/dist/plugins/regions.min.js',
    'https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(VERSION);
        await Promise.allSettled([
            ...SHELL.map((u) => cache.add(u)),
            ...CDN.map((u) => cache.add(new Request(u, { mode: 'no-cors' })))
        ]);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    if (url.origin === self.location.origin) {
        event.respondWith((async () => {
            const cache = await caches.open(VERSION);
            try {
                const fresh = await fetch(req);
                if (fresh && fresh.ok) cache.put(req, fresh.clone());
                return fresh;
            } catch (e) {
                const cached = await cache.match(req, { ignoreSearch: true });
                if (cached) return cached;
                if (req.mode === 'navigate') {
                    const shell = await cache.match('index.html');
                    if (shell) return shell;
                }
                throw e;
            }
        })());
        return;
    }

    // Cross-origin (CDN libraries): cache-first
    event.respondWith((async () => {
        const cache = await caches.open(VERSION);
        const cached = await cache.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh && (fresh.ok || fresh.type === 'opaque')) cache.put(req, fresh.clone());
        return fresh;
    })());
});
