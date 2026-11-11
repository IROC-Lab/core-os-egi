// Core OS · service worker do PWA.
// Só guarda a "casca" do painel (HTML, CSS, JS, ícones) pra abrir rápido e instalar no celular.
// API, terminal (WebSocket) e arquivos do cérebro sempre vão direto ao servidor.
const CACHE = 'core-os-v1';
const CASCA = ['/', '/app.css', '/app.js', '/manifest.webmanifest', '/icones/icone-192.png', '/icones/icone-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws') || url.pathname.startsWith('/arquivo')) return;
  // rede primeiro (sempre a versão nova após deploy); cache só se o servidor não responder
  e.respondWith(fetch(req).then((r) => {
    if (r.ok && (CASCA.includes(url.pathname) || url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/logos/') || url.pathname.startsWith('/icones/'))) {
      const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia));
    }
    return r;
  }).catch(() => caches.match(req).then((r) => r || caches.match('/'))));
});
