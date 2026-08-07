// Service worker: makes the app installable and work offline.
// Cache-first for the app shell; also runtime-caches Wikimedia reference photos
// so they persist offline after being viewed once.
const CACHE = "rockkey-v1";
const SHELL = [
  "./", "./index.html", "./minerals.js", "./images.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const url = new URL(req.url);
      // cache app-shell responses and Wikimedia photo thumbnails for offline reuse
      if (res.ok && (url.origin === location.origin || url.hostname.endsWith("wikimedia.org"))) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match("./index.html"))) // offline navigation fallback
  );
});
