// App-shell cache only. API responses, cover art and audio are NEVER cached (no stale data, no protected content stored).
const V = 'syrmusic-shell-v1'; // bump on every release that changes shell files
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'js/app.js', 'js/config.js', 'js/provider.js',
  'js/player.js', 'js/store.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-32.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('syrmusic-') && k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
// The page asks the user before activating an update, so playback is never interrupted by a surprise reload.
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (r.mode === 'navigate') return e.respondWith(fetch(r).catch(() => caches.match('index.html')));
  e.respondWith(caches.match(r).then(hit => hit || fetch(r)));
});
