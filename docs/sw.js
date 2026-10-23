/* Versioned shell. Never cache account data or responses from external APIs. */
const CACHE = 'vitrine-2026-10-23-studio';
const V = '20261023-studio';
const COQUILLE = [
  './','./index.html','./connexion.html','./inscription.html','./selections.html',
  './hockey.html','./europe.html','./exotiques.html','./bilan.html','./abonnement.html',
  './acces.html','./activation.html','./paiement.html','./conditions.html','./confidentialite.html',
  './assets/config.js', './assets/pronoclair-192.png','./assets/pronoclair-512.png',
  ...['design.css','experience.css','studio.css','app.js','refresh.js','manifest.webmanifest','pronoclair.svg'].map(p=>'./assets/'+p+'?v='+V)
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(COQUILLE.map(async url => {
    try { const response = await fetch(new Request(url,{cache:'reload'})); if(response.ok) await cache.put(url,response); } catch (_) {}
  }))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('vitrine-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  // Network first also applies to logos: old cache-first image entries caused mixed branding.
  event.respondWith((async()=>{
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request,{cache:'no-cache'});
      if(response.ok) await cache.put(event.request,response.clone());
      return response;
    } catch (_) {
      const saved = await cache.match(event.request);
      if(saved) return saved;
      if(event.request.mode==='navigate') return await cache.match('./index.html') || new Response('Connexion indisponible',{status:503});
      return new Response('',{status:503});
    }
  })());
});
