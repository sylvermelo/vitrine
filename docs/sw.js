/* Service worker vitrine : coquille en cache (hors-ligne), pages en
   network-first (toujours les dernières données quand le réseau existe). */
const CACHE = "vitrine-v1";
const COQUILLE = [
  "./index.html", "./selections.html", "./corners.html", "./bilan.html",
  "./methode.html", "./acces.html", "./connexion.html", "./inscription.html",
  "./assets/app.js", "./assets/config.js", "./assets/manifest.webmanifest",
  "./assets/icons-192.png", "./assets/icons-512.png", "./assets/logo.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(
    ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;           // CDNs : réseau direct
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request)
      .then((r) => { caches.open(CACHE).then((c) => c.put(e.request, r.clone())); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html"))));
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r ||
    fetch(e.request).then((rep) => {
      caches.open(CACHE).then((c) => c.put(e.request, rep.clone()));
      return rep;
    })));
});
