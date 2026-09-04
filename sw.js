/* Service worker: cache-first so the app works fully offline after first load. */
const CACHE = "lift-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./program.js",
  "./app.js",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        // Cache same-origin GETs as we see them (handles updated files).
        const copy = res.clone();
        caches.open(CACHE).then(c => { try { c.put(e.request, copy); } catch (x) {} });
        return res;
      }).catch(() => hit);
    })
  );
});
