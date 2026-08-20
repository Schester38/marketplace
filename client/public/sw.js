const CACHE_NAME = 'mboppi-v64';
const APP_SHELL = ['/', '/manifest.webmanifest', '/manifest-verone.webmanifest', '/manifest-livreur.webmanifest', '/manifest-admin.webmanifest', '/icon-192.png', '/icon-512.png', '/icon.png', '/favicon-32x32.png', '/apple-touch-icon.png', '/navbar-logo.png', '/og-image.svg', '/og-image.png', '/robots.txt', '/sitemap.xml', '/splash.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => caches.open(CACHE_NAME))
      .then((cache) =>
        cache.keys().then((reqs) =>
          Promise.all(
            reqs.filter((r) => new URL(r.url).pathname.startsWith('/api/')).map((r) => cache.delete(r))
          )
        )
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
          clients.forEach((client) => client.postMessage({ type: 'APP_UPDATED' }));
        })
      )
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
  if (event.request.method !== 'GET') return;

  // Images produits (origin Supabase Storage) : cache-first pour que les photos
  // déjà vues restent visibles hors connexion. Les URLs sont uniques par upload
  // (timestamp + uuid), donc pas de risque de servir une version périmée.
  if (/storage\.supabase\.co/.test(url.hostname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        try {
          const resp = await fetch(event.request);
          if (resp && (resp.ok || resp.type === 'opaque')) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        } catch (err) {
          return cached || new Response('Image indisponible hors connexion', { status: 504, statusText: 'Gateway Timeout' });
        }
      })()
    );
    return;
  }

  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/offers' || url.pathname === '/api/products' || url.pathname === '/api/offers/mine') {
      event.respondWith(
        fetch(event.request).catch(
          () => new Response('Ressource indisponible hors connexion', { status: 504, statusText: 'Gateway Timeout' })
        )
      );
    }
    return;
  }

  // Bundles JS/CSS (contenus avec hash) : reseau d'abord pour ne JAMAIS servir une ancienne version
  // quand on est en ligne ; le cache ne sert que hors connexion ou en cas de panne.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(event.request);
        try {
          const network = await fetch(event.request, { cache: 'no-store' });
          if (network.ok) {
            const clone = network.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return network;
        } catch (err) {
          return cached || new Response('Ressource indisponible hors connexion', { status: 504, statusText: 'Gateway Timeout' });
        }
      })()
    );
    return;
  }

  if (event.request.mode === 'navigate' || url.pathname === '/') {
    // Navigation : reseau d'abord, sinon le shell index.html en cache pour naviguer hors ligne.
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(event.request, { cache: 'no-store' });
          if (network.ok) {
            const clone = network.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
          }
          return network;
        } catch (err) {
          const shell = await caches.match('/');
          return shell || new Response('Ressource indisponible hors connexion', { status: 504, statusText: 'Gateway Timeout' });
        }
      })()
    );
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
        .catch(() => new Response('Ressource indisponible hors connexion', { status: 504, statusText: 'Gateway Timeout' }));
    })
  );
});
