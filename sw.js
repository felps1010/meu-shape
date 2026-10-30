// Service worker: deixa o app abrir offline.
// Ao mudar qualquer arquivo do app, aumente VERSION para os celulares baixarem a versão nova.
const VERSION = 'v1';
const CACHE = `meu-shape-${VERSION}`;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/store.js', 'js/foods.js', 'js/taco-data.js', 'js/calc.js', 'js/ai.js', 'js/ui.js',
  'js/views/onboarding.js', 'js/views/diario.js', 'js/views/dieta.js',
  'js/views/evolucao.js', 'js/views/pratos.js', 'js/views/perfil.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Chamadas à API do Claude nunca passam pelo cache.
  if (url.hostname === 'api.anthropic.com') return;

  // SDK do Claude (CDN, versão fixa): cache primeiro.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) c.put(e.request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (url.origin !== location.origin) return;
  // Arquivos do app: cache primeiro, rede como reserva.
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
