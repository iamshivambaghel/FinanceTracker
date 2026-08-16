/*
 * Service worker — offline app shell.
 *
 * Strategy: cache the local app files (shell) so the app opens instantly and
 * works offline. Anything cross-origin (Supabase API, the pdf.js / supabase
 * CDN modules) is always fetched from the network and never cached here, so
 * your data is never stale and auth always talks to the live server.
 */
const CACHE = "financetracker-v1";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./data.js",
  "./parser.js",
  "./statements.js",
  "./store.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Only handle same-origin GETs; let everything else (Supabase, CDNs) pass through.
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network; // stale-while-revalidate
    })
  );
});
