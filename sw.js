/* Service Worker - Shisnekai no Kami (PWA)
   Strategie : on NE cache JAMAIS l'API ni le WebSocket (donnees temps reel).
   On cache uniquement la "coquille" (pages + assets statiques) pour un demarrage
   rapide et un affichage du logo meme en connexion degradee. */
const CACHE = 'snk-cache-v1';
const ASSETS = [
  '/', '/play',
  '/style.css', '/qrcode.js', '/sound.js',
  '/snk-emblem.png', '/ak-emblem.png', '/logo.jpg',
  '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE).map(k => caches.delete(k))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Ne jamais intercepter : API, WebSocket, autres origines, requetes non-GET
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (req.headers.get('upgrade') === 'websocket') return;

  // Pages (navigation) : reseau d'abord (code a jour), repli sur cache si hors-ligne
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
                .catch(() => caches.match(req).then(r => r || caches.match('/')))
    );
    return;
  }
  // Assets statiques : cache d'abord (rapide), maj en arriere-plan
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; }).catch(() => cached);
      return cached || network;
    })
  );
});
