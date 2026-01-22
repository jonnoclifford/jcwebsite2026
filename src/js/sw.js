/**
 * Service Worker for Jonathan Clifford Photography Portfolio
 *
 * Caching Strategies:
 * - Static assets (CSS, JS, fonts): Cache on install, cache-first
 * - Images: Cache-first with runtime caching (max 100 images)
 * - HTML pages: Network-first with cache fallback
 *
 * Cache Versioning: Update CACHE_VERSION to bust caches on deploy
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `jc-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `jc-images-${CACHE_VERSION}`;
const HTML_CACHE = `jc-pages-${CACHE_VERSION}`;

// Maximum number of images to cache
const MAX_IMAGE_CACHE_SIZE = 100;

// Static assets to cache on install (critical for offline functionality)
const STATIC_ASSETS = [
  '/css/styles.css',
  '/js/main.js',
  '/js/slideshow.js',
  '/js/lightbox.js',
  '/js/navigation.js',
  '/js/lazyload.js',
  '/js/video-modal.js',
  '/favicon.ico',
  '/favicon.svg',
  '/manifest.json'
];

// Pages to pre-cache for offline access
const PRECACHE_PAGES = [
  '/',
  '/work/',
  '/about/',
  '/contact/',
  '/404.html'
];

/**
 * Install event - cache static assets
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.addAll(STATIC_ASSETS.filter(url => url));
      }),
      // Pre-cache key pages
      caches.open(HTML_CACHE).then((cache) => {
        return cache.addAll(PRECACHE_PAGES);
      })
    ]).then(() => {
      // Force the waiting service worker to become active
      return self.skipWaiting();
    })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            // Delete caches that don't match current version
            return (
              cacheName.startsWith('jc-') &&
              cacheName !== STATIC_CACHE &&
              cacheName !== IMAGE_CACHE &&
              cacheName !== HTML_CACHE
            );
          })
          .map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

/**
 * Fetch event - handle requests with appropriate caching strategy
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Determine caching strategy based on request type
  if (isImageRequest(request)) {
    // Images: Cache-first strategy
    event.respondWith(cacheFirstWithRuntimeCache(request, IMAGE_CACHE));
  } else if (isStaticAsset(request)) {
    // Static assets: Cache-first strategy
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (isHTMLRequest(request)) {
    // HTML pages: Network-first strategy
    event.respondWith(networkFirstWithCache(request, HTML_CACHE));
  }
});

/**
 * Check if request is for an image
 */
function isImageRequest(request) {
  const url = new URL(request.url);
  return (
    url.pathname.startsWith('/images/') ||
    request.destination === 'image' ||
    /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(url.pathname)
  );
}

/**
 * Check if request is for a static asset (CSS, JS, fonts)
 */
function isStaticAsset(request) {
  const url = new URL(request.url);
  return (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/fonts/') ||
    /\.(css|js|woff|woff2|ttf|eot)$/i.test(url.pathname)
  );
}

/**
 * Check if request is for an HTML page
 */
function isHTMLRequest(request) {
  const url = new URL(request.url);
  return (
    request.destination === 'document' ||
    request.headers.get('accept')?.includes('text/html') ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html')
  );
}

/**
 * Cache-first strategy
 * Returns cached response if available, otherwise fetches from network
 */
async function cacheFirst(request, cacheName) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    return new Response('', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Cache-first with runtime caching and size limits (for images)
 * Caches images as they're viewed, with a maximum cache size
 */
async function cacheFirstWithRuntimeCache(request, cacheName) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    // Cache successful image responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);

      // Check cache size and trim if necessary
      const keys = await cache.keys();
      if (keys.length >= MAX_IMAGE_CACHE_SIZE) {
        // Remove oldest entries (FIFO) - 10% at a time
        const deleteCount = Math.ceil(MAX_IMAGE_CACHE_SIZE * 0.1);
        for (let i = 0; i < deleteCount && i < keys.length; i++) {
          await cache.delete(keys[i]);
        }
      }

      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    return new Response('', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'image/svg+xml' }
    });
  }
}

/**
 * Network-first strategy with cache fallback (for HTML pages)
 * Tries network first for fresh content, falls back to cache if offline
 */
async function networkFirstWithCache(request, cacheName) {
  try {
    const networkResponse = await fetch(request);

    // Cache successful HTML responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // If no cached response and this is a navigation request, show offline page
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/404.html');
      if (offlinePage) {
        return offlinePage;
      }
    }

    return new Response('Offline - page not available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

/**
 * Message handler for cache management
 * Allows the main thread to communicate with the service worker
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    // Cache specific URLs on demand
    const urls = event.data.urls;
    event.waitUntil(
      caches.open(HTML_CACHE).then((cache) => {
        return cache.addAll(urls);
      })
    );
  }

  if (event.data && event.data.type === 'CLEAR_CACHES') {
    // Clear all caches (useful for debugging or forced refresh)
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('jc-'))
            .map((name) => caches.delete(name))
        );
      })
    );
  }
});
