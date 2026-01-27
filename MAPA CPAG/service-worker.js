/**
 * ============================================================================
 * SERVICE WORKER - Ciudad Juan Bosch Platform
 * 
 * Strategy: 
 * - Cache First for static assets (CSS, JS, images, SVG)
 * - Network First for data files (CSV, JSON)
 * - Offline fallback for navigation requests
 * ============================================================================
 */

const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `cjb-static-${CACHE_VERSION}`;
const DATA_CACHE = `cjb-data-${CACHE_VERSION}`;

// Assets that must be cached for offline functionality
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/css/elite-features.css',
    '/css/enterprise-modules.css',
    '/js/app.js',
    '/js/elite-features.js',
    '/js/enterprise-modules.js',
    '/manifest.json'
];

// Data files that should be cached but updated when online
const DATA_ASSETS = [
    '/data/lotesv2.csv',
    '/data/mapa.svg'
];

// ============================================================================
// INSTALL EVENT - Cache static assets
// ============================================================================

self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');

    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_ASSETS);
        }).then(() => {
            // Cache data assets in separate cache
            return caches.open(DATA_CACHE).then((cache) => {
                console.log('[SW] Caching data assets');
                return cache.addAll(DATA_ASSETS);
            });
        }).then(() => {
            console.log('[SW] Installation complete');
            return self.skipWaiting();
        }).catch((error) => {
            console.error('[SW] Installation failed:', error);
        })
    );
});

// ============================================================================
// ACTIVATE EVENT - Clean old caches
// ============================================================================

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((cacheName) => {
                        // Delete caches that don't match current version
                        return cacheName.startsWith('cjb-') &&
                            cacheName !== STATIC_CACHE &&
                            cacheName !== DATA_CACHE;
                    })
                    .map((cacheName) => {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    })
            );
        }).then(() => {
            console.log('[SW] Activation complete');
            return self.clients.claim();
        })
    );
});

// ============================================================================
// FETCH EVENT - Serve from cache with appropriate strategy
// ============================================================================

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip external requests
    if (url.origin !== location.origin) {
        return;
    }

    // Determine strategy based on request type
    if (isDataRequest(url)) {
        // Network First for data files - get fresh data when possible
        event.respondWith(networkFirstStrategy(event.request, DATA_CACHE));
    } else if (isStaticAsset(url)) {
        // Cache First for static assets
        event.respondWith(cacheFirstStrategy(event.request, STATIC_CACHE));
    } else if (event.request.mode === 'navigate') {
        // Navigation requests - try network, fallback to cached index
        event.respondWith(navigationStrategy(event.request));
    } else {
        // Default: try cache, then network
        event.respondWith(cacheFirstStrategy(event.request, STATIC_CACHE));
    }
});

// ============================================================================
// CACHING STRATEGIES
// ============================================================================

/**
 * Cache First Strategy
 * Returns cached response if available, otherwise fetches from network
 */
async function cacheFirstStrategy(request, cacheName) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
        // Return cached response but update cache in background
        updateCache(request, cacheName);
        return cachedResponse;
    }

    // Not in cache, fetch from network
    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('[SW] Cache First failed:', error);
        return new Response('Offline - Resource not available', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

/**
 * Network First Strategy
 * Tries network first, falls back to cache if offline
 */
async function networkFirstStrategy(request, cacheName) {
    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            // Update cache with fresh data
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        // Network failed, try cache
        console.log('[SW] Network failed, trying cache for:', request.url);
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        return new Response('Offline - Data not available', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

/**
 * Navigation Strategy
 * Handles page navigation with offline fallback
 */
async function navigationStrategy(request) {
    try {
        // Try to fetch the page from network
        const networkResponse = await fetch(request);
        return networkResponse;
    } catch (error) {
        // Network failed, return cached index.html
        console.log('[SW] Navigation failed, serving cached index');
        const cachedResponse = await caches.match('/index.html');

        if (cachedResponse) {
            return cachedResponse;
        }

        // Fallback offline page
        return new Response(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Sin Conexión - CJB Mapa</title>
                <style>
                    body {
                        font-family: system-ui, sans-serif;
                        background: #0f172a;
                        color: white;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                        text-align: center;
                    }
                    .offline-container {
                        max-width: 400px;
                        padding: 40px;
                    }
                    .offline-icon {
                        font-size: 64px;
                        margin-bottom: 20px;
                    }
                    h1 { margin: 0 0 10px; font-size: 24px; }
                    p { color: #94a3b8; margin: 0 0 30px; }
                    button {
                        padding: 12px 24px;
                        background: #3b82f6;
                        border: none;
                        border-radius: 8px;
                        color: white;
                        font-size: 16px;
                        cursor: pointer;
                    }
                </style>
            </head>
            <body>
                <div class="offline-container">
                    <div class="offline-icon">📡</div>
                    <h1>Sin Conexión</h1>
                    <p>No hay conexión a internet. Por favor, verifica tu conexión y vuelve a intentar.</p>
                    <button onclick="location.reload()">Reintentar</button>
                </div>
            </body>
            </html>
        `, {
            headers: { 'Content-Type': 'text/html' }
        });
    }
}

/**
 * Update cache in background
 */
async function updateCache(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response);
        }
    } catch (error) {
        // Silently fail - we already have cached version
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isStaticAsset(url) {
    return url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ico)$/);
}

function isDataRequest(url) {
    return url.pathname.includes('/data/') ||
        url.pathname.endsWith('.csv') ||
        url.pathname.endsWith('.json');
}

// ============================================================================
// BACKGROUND SYNC (for future use)
// ============================================================================

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        console.log('[SW] Background sync triggered');
        // Future: sync any pending data
    }
});

// ============================================================================
// PUSH NOTIFICATIONS (for future use)
// ============================================================================

self.addEventListener('push', (event) => {
    const data = event.data?.json() || {};

    const options = {
        body: data.body || 'Nueva actualización disponible',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        vibrate: [100, 50, 100],
        data: { url: data.url || '/' }
    };

    event.waitUntil(
        self.registration.showNotification(
            data.title || 'CJB Mapa',
            options
        )
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.openWindow(event.notification.data.url || '/')
    );
});

console.log('[SW] Service Worker loaded');
