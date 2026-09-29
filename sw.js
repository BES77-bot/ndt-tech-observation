// Offline cache. Bump VERSION whenever any app file changes so devices pick up the update.
const VERSION = 'ndtobs-v2';
const FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'css/app.css', 'css/print.css',
  'js/app.js', 'js/db.js', 'js/model.js', 'js/checklists.js', 'js/report.js', 'js/signature.js', 'js/backup.js', 'js/evidence.js', 'js/storage.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
