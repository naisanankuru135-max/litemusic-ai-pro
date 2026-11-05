const CACHE_NAME = 'litemusic-pwa-v11';
const ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

// Never store music files or API responses in the cache:
// the tracks already live in IndexedDB, so caching them here would double the phone's storage use.
function isBypass(req, url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/converted/') ||
    req.destination === 'audio' ||
    req.destination === 'video'
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return; // Google Drive etc. -> straight to network
  if (isBypass(req, url)) return;                  // music / API -> straight to network

  // App shell: serve from cache instantly (works with Tailscale off / no network),
  // and refresh it in the background when we are online.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, clone));
            }
            return res;
          })
          .catch(() => null);
        return cached || network.then((res) => res || caches.match('./') || caches.match('./index.html'));
      })
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
