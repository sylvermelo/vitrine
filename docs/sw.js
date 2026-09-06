/* Service worker vitrine : coquille en cache (hors-ligne), pages ET scripts
   en network-first (jamais de vieille version servie quand le réseau existe).
   addAll tolérant : un fichier manquant n'empêche plus l'installation. */
const CACHE = "vitrine-v5";
const COQUILLE = [
  "./", "./index.html", "./selections.html", "./corners.html", "./bilan.html",
  "./acces.html", "./connexion.html", "./inscription.html", "./paiement.html",
  "./confidentialite.html", "./conditions.html", "./activation.html",
  "./assets/app.js", "./assets/config.js", "./assets/manifest.webmanifest",
  "./assets/icons-192.png", "./assets/icons-512.png", "./assets/logo.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(COQUILLE.map((u) =>
      c.add(u).catch(() => null))))   // tolérant : jamais d'échec global
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(
    ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;           // CDNs : réseau direct
  const estNavig = e.request.mode === "navigate";
  const estScript = /\.(js|json|webmanifest)(\?|$)/.test(url.pathname);
  if (estNavig || estScript) {
    /* network-first : toujours la dernière version, cache seulement en secours */
    e.respondWith(fetch(e.request)
      .then((r) => {
        if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
        return r;
      })
      .catch(() => caches.match(e.request).then((r) =>
        r || (estNavig ? caches.match("./index.html") : null))));
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r ||
    fetch(e.request).then((rep) => {
      if (rep.ok) caches.open(CACHE).then((c) => c.put(e.request, rep.clone()));
      return rep;
    })));
});
