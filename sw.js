// Rede primeiro, cache como rede de seguranca. Assim o app nunca serve um
// arquivo velho quando esta online, e continua abrindo offline.

const CACHE = 'gastos-v8';
const ASSETS = [
  '.',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'js/app.js',
  'js/ui.js',
  'js/store.js',
  'js/model.js',
  'js/money.js',
  'js/voice.js',
  'js/sheets.js',
  'js/version.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    // cache: 'reload' ignora o cache HTTP do navegador (o GitHub Pages manda
    // Cache-Control: max-age=600) - sem isso, "rede primeiro" as vezes so
    // lia um arquivo velho que o proprio navegador tinha guardado, sem sequer
    // perguntar ao servidor se havia versao nova.
    fetch(request, { cache: 'reload' })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('index.html'))),
  );
});
