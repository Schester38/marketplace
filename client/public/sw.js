const CACHE_NAME = 'mboppi-v195';
const APP_SHELL = ['/', '/manifest.webmanifest', '/manifest-verone.webmanifest', '/manifest-livreur.webmanifest', '/manifest-admin.webmanifest', '/icon-192.png', '/icon-512.png', '/icon.png', '/favicon-32x32.png', '/apple-touch-icon.png', '/navbar-logo.png', '/assistant-avatar.webp', '/og-image.svg', '/og-image.png', '/robots.txt', '/sitemap.xml', '/splash.js', '/diapo/MboppiShop_Developpez_votre_boutique.webp', '/diapo/MboppiShop_Gagner_telephone_connexion.webp', '/diapo/MboppiShop_Paiement_a_la_livraison_1x1.webp', '/diapo/MboppiShop_Shopify_optimise.webp'];

// Endpoints GET publics : servis depuis le cache quand le reseau est lent ou coupe,
// puis rafraichis en arriere-plan (stale-while-revalidate).
const API_SWR = [
  '/api/products',
  '/api/flash-promotions',
  '/api/offers',
  '/api/metrics/trending',
  '/api/sales/recent',
  '/api/messages/popup',
  '/api/shop/',
  '/api/reviews/product/',
];
const API_TIMEOUT = 6000;

function isApiSwr(pathname) {
  return API_SWR.some((p) => pathname === p || pathname.startsWith(p));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          APP_SHELL.map((url) =>
            cache.add(new Request(url, { headers: { accept: 'text/html' } }))
          )
        )
      )
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
    // Son de notification (supporté surtout sur Android/Chrome ; Chrome
    // desktop ignore le champ "sound" comme documenté).
    sound: data.sound || '/notification.wav',
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

  // Donnees API : JSON publics servis depuis le cache (stale-while-revalidate avec timeout)
  // pour que la page s'ouvre meme en reseau tres lent ; le reste est en reseau pur.
  if (url.pathname.startsWith('/api/')) {
    if (isApiSwr(url.pathname)) {
      event.respondWith(apiSwr(event.request));
    } else {
      event.respondWith(
        fetch(event.request).catch(
          () => new Response('Ressource indisponible hors connexion', { status: 504, statusText: 'Gateway Timeout' })
        )
      );
    }
    return;
  }

  // Bundles JS/CSS (contenus avec hash) : stale-while-revalidate. Le cache sert
  // immédiatement, le reseau rafraichit en arriere-plan. Les fichiers ont un hash,
  // donc deux versions ne se melangent jamais.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(assetSwr(event.request));
    return;
  }

  if (event.request.mode === 'navigate' || url.pathname === '/') {
    // Navigation : servir le shell index.html en cache immediatement (s'ouvre meme
    // en faible connexion), puis rafraichir le shell en arriere-plan quand c'est possible.
    event.respondWith(navSwr(event.request));
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

async function apiSwr(request) {
  const cached = await caches.match(request);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT);
  try {
    const resp = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (resp && resp.ok && /application\/json/.test(resp.headers.get('content-type') || '')) {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    return resp;
  } catch (err) {
    clearTimeout(timer);
    if (cached) return cached;
    return new Response('Ressource indisponible hors connexion', { status: 504, statusText: 'Gateway Timeout' });
  }
}

async function assetSwr(request) {
  const cached = await caches.match(request);
  const net = fetch(request, { cache: 'no-store' })
    .then((resp) => {
      if (resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return resp;
    })
    .catch(() => null);
  if (cached) return cached;
  return net.then((resp) => resp || new Response('Ressource indisponible hors connexion', { status: 504, statusText: 'Gateway Timeout' }));
}

async function navSwr(request) {
  const cached = await caches.match('/');
  const net = fetch(request, { cache: 'no-store' })
    .then((resp) => {
      if (resp && resp.ok && /text\/html/i.test(resp.headers.get('content-type') || '')) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
      }
      return resp;
    })
    .catch(() => null);
  if (cached && /text\/html/i.test(cached.headers.get('content-type') || '')) return cached;
  return net.then((resp) => resp || new Response('Ressource indisponible hors connexion', { status: 504, statusText: 'Gateway Timeout' }));
}
