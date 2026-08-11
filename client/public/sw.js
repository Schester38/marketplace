const CACHE_NAME = 'mboppi-v15';
const APP_SHELL = ['/', '/manifest.webmanifest', '/manifest-verone.webmanifest', '/manifest-livreur.webmanifest', '/icon-192.png', '/icon-512.png', '/icon.png', '/favicon-32x32.png', '/apple-touch-icon.png', '/navbar-logo.png', '/og-image.svg', '/robots.txt', '/sitemap.xml'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {}
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/favicon-32x32.png',
    tag: data.tag,
    renotify: true,
    vibrate: data.vibrate || [200, 100, 200],
    data: { url: data.data && data.data.url ? data.data.url : '/' },
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Mboppi', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  if (event.request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/offers' || url.pathname === '/api/products') {
      event.respondWith(
        (async () => {
          const cached = await caches.match(event.request);
          const network = fetch(event.request)
            .then((response) => {
              if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
              }
              return response;
            })
            .catch(() => cached);
          return cached || network;
        })()
      );
    }
    return;
  }

  if (event.request.mode === 'navigate' || url.pathname === '/') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/'));
    })
  );
});
