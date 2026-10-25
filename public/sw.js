// Aafia service worker: keeps the emergency page usable offline.
// Only the emergency page and the site's own design files are kept.
// Personal pages (records, bookings) are never stored on the phone.
const CACHE = "aafia-v1";
const EMERGENCY = "/emergency";

async function cacheEmergencyPage() {
  const cache = await caches.open(CACHE);
  const response = await fetch(EMERGENCY, { cache: "no-store" });
  if (!response.ok) return;
  const html = await response.clone().text();
  await cache.put(EMERGENCY, response);
  // Fonts, styles and scripts the page uses (hashed, never change).
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? [])];
  await Promise.all(assets.map((url) => cache.add(url).catch(() => {})));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheEmergencyPage().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: always try the internet first. Offline, show the emergency page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (url.pathname === EMERGENCY && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(EMERGENCY, copy));
          }
          return response;
        })
        .catch(() => caches.match(EMERGENCY)),
    );
    return;
  }

  // Design files: use the stored copy when there is one.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
