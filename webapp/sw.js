const CACHE_NAME = 'app-cache-v1';
const ASSETS = [
  '/',
  '/leitstelle.html',
  '/fahrer.html',
  '/admin.html',
  '/style.css',
  '/socket.io/socket.io.js',
  '/alarm.mp3',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
});
