/*
 * Service worker — offline app shell.
 *
 * Navigations are network-first with a redirect-stripped offline fallback, so
 * the app always loads the freshest HTML and never trips Safari's
 * "response served by service worker has redirections" error. Static assets
 * are cache-first and refreshed in the background. Cross-origin requests
 * (Supabase API, CDN modules) are never intercepted.
 *
 * Bump CACHE to force every client to refetch on the next visit.
 */
const CACHE = "financetracker-v2";
const ASSETS = [
  "./styles.css", "./config.js", "./data.js", "./parser.js",
  "./statements.js", "./store.js", "./app.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
];

// Rebuild a response without the "redirected" flag (which is illegal to
// return for a navigation request).
function strip(res) {
  if (!res || !res.redirected) return res;
  return new Response(res.clone().body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS);
    try {
      const idx = strip(await fetch("./index.html", { cache: "reload" }));
      if (idx && idx.ok) await c.put("./index.html", idx.clone());
    } catch (_) { /* offline install of index is optional */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Navigations: always try the network, fall back to a clean cached page.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const clean = strip(await fetch(req));
        if (clean && clean.ok) { const c = await caches.open(CACHE); c.put("./index.html", clean.clone()); }
        return clean;
      } catch (_) {
        return (await caches.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  // Static assets: cache-first, refresh in background.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(res => {
      if (res && res.status === 200) caches.open(CACHE).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
