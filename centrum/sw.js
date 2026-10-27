/* Service Worker – Centrum Dowodzenia STL.
   • powłoka aplikacji (HTML/CSS/JS/ikony) z pamięci → start natychmiast, także bez zasięgu
   • biblioteka supabase-js i czcionki: stale-while-revalidate
   • dane (Supabase API, Edge Functions, Storage) NIGDY nie są buforowane – zawsze świeże i prywatne */
const VERSION = 'stl-centrum-v5';
const SHELL = ['./', './index.html', './app.css', './app.js', './config.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // dane z Supabase – tylko sieć
  if (/\.supabase\.(co|in)$/.test(url.hostname) || url.port === '54321') return;

  // CDN (supabase-js) i Google Fonts – stale-while-revalidate
  if (['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  if (url.origin !== location.origin) return;

  // nawigacja: sieć, a bez zasięgu – powłoka z pamięci
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copy)); } return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }

  // własne pliki: najpierw sieć (zawsze najnowsza wersja), bez zasięgu – kopia z pamięci
  e.respondWith(fetch(req, { cache: 'no-cache' })
    .then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; })
    .catch(() => caches.match(req)));
});

self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });

/* ---------- powiadomienia push ---------- */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'STL Centrum', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'STL Centrum', {
    body: d.body || '', icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    tag: d.tag || 'stl', renotify: true, vibrate: [40, 60, 40], data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.navigate(target).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
