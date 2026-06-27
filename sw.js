// Orbital-Lite — Service Worker
// Caches the app shell so it loads instantly and works offline (login screen)
// Stream data is always fetched live — never cached

const CACHE = 'orbital-lite-v22';

// App shell — files to cache on install
const SHELL = [
  '/mcscruff-iptv/',
  '/mcscruff-iptv/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // CDN libraries — cached so the app works on slow connections
  'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mpegts.js/1.7.3/mpegts.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/dashjs/4.7.4/dash.all.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'
];

// Install — cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      // Cache what we can — don't fail install if a CDN item is unavailable
      return Promise.allSettled(
        SHELL.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate — clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first for app shell, network-only for streams
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never cache IPTV API calls or stream URLs
  if (
    url.pathname.includes('player_api.php') ||
    url.pathname.includes('get.php') ||
    url.pathname.includes('/live/') ||
    url.pathname.includes('/movie/') ||
    url.pathname.includes('/series/') ||
    url.pathname.endsWith('.m3u8') ||
    url.pathname.endsWith('.m3u') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.mpd') ||
    url.pathname.endsWith('.mp4')
  ) {
    // Pass straight through to network — never cache streams
    return;
  }

  // Page navigations + the HTML itself: NETWORK-FIRST so updates always show.
  // Falls back to the cached copy only when offline.
  const isHtml = event.request.mode === 'navigate' ||
                 url.pathname === '/mcscruff-iptv/' ||
                 url.pathname.endsWith('/index.html');
  if (isHtml) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put('/mcscruff-iptv/index.html', clone));
        }
        return response;
      }).catch(() => caches.match('/mcscruff-iptv/index.html'))
    );
    return;
  }

  // Everything else (CDN libs, icons, manifest): cache-first — these are
  // versioned/stable, so serving from cache is safe and fast.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
