const CACHE_NAME = 'mboppi-v244';
const APP_SHELL = ['/', '/manifest.webmanifest', '/manifest-verone.webmanifest', '/manifest-livreur.webmanifest', '/manifest-admin.webmanifest', '/icon-192.png', '/icon-512.png', '/icon.png', '/favicon-32x32.png', '/apple-touch-icon.png', '/navbar-logo.png', '/assistant-avatar.webp', '/og-image.svg', '/og-image.png', '/robots.txt', '/splash.js', '/diapo/MboppiShop_Developpez_votre_boutique.webp', '/diapo/MboppiShop_Gagner_telephone_connexion.webp', '/diapo/MboppiShop_Paiement_a_la_livraison_1x1.webp', '/diapo/MboppiShop_Shopify_optimise.webp'];

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
  const title = data.title || 'Mboppi';
  // CRITIQUE : `renotify: true` exige un tag NON vide, sinon showNotification()
  // jette une TypeError et la notification n'est jamais affichÃ©e. Le serveur
  // envoie toujours un tag, mais on se protÃ¨ge si jamais il manque.
  const tag =
    data.tag ||
    'mboppi-' +
      String(title + '|' + (data.body || ''))
        .replace(/[^\w-]+/g, '')
        .slice(0, 48) ||
    'mboppi';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/favicon-32x32.png',
    tag,
    renotify: true,
    // Son de notification (supportÃ© surtout sur Android/Chrome ; Chrome
    // desktop ignore le champ "sound" comme documentÃ©). NB : quand l'app est
    // FERMÃ‰E, le son vient du canal systÃ¨me de la PWA (RÃ©glages â†’ Applications
    // â†’ [nom] â†’ Notifications â†’ activer le son) ; la vibration fonctionne, elle.
    sound: data.sound || '/notification.wav',
    vibrate: data.vibrate || [200, 100, 200],
    // La notification reste affichÃ©e tant que l'utilisateur n'a pas rÃ©agi.
    requireInteraction: data.requireInteraction !== false,
    data: { url: data.data && data.data.url ? data.data.url : '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Rotation de l'abonnement push par le push service (FCM renouvelle les tokens,
// dÃ©sinstallation temporaire/rÃ©installation du navigateurâ€¦) : on se rÃ©-abonne
// aussitÃ´t et on met Ã  jour le serveur. Sans Ã§a, l'appareil perd le push pour
// toujours jusqu'Ã  la prochaine ouverture de l'app.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(handlePushSubscriptionChange(event.oldSubscription));
});

async function getVapidPublicKey() {
  const keyUrl = '/api/push/key';
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(keyUrl);
    if (cached) {
      try {
        const d = await cached.json();
        if (d.public_key) return d.public_key;
      } catch (e) {}
    }
    const resp = await fetch(keyUrl);
    if (resp.ok) {
      const d = await resp.json();
      const clone = new Response(JSON.stringify(d), {
        headers: { 'Content-Type': 'application/json' },
      });
      cache.put(keyUrl, clone).catch(() => {});
      if (d.public_key) return d.public_key;
    }
  } catch (e) {}
  return null;
}

async function handlePushSubscriptionChange(oldSub) {
  try {
    const publicKey = await getVapidPublicKey();
    if (!publicKey) return;
    const sub = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const oldEndpoint = oldSub && oldSub.endpoint ? oldSub.endpoint : null;
    // L'ancien endpoint est un "capability URL" secret : le fournir suffit au
    // serveur pour transfÃ©rer l'abonnement sans JWT (le SW ne lit pas le token).
    if (oldEndpoint) {
      await fetch('/api/push/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_endpoint: oldEndpoint, subscription: sub.toJSON() }),
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[sw] pushsubscriptionchange erreur :', err && err.message);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  // Mesure d'ouverture : ping best-effort (keepalive survit Ã  la fermeture).
  try {
    const tag = event.notification.tag || '';
    event.waitUntil(
      fetch('/api/metrics/push-open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
        keepalive: true,
      }).catch(() => {})
    );
  } catch (e) {}
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
  // dÃ©jÃ  vues restent visibles hors connexion. Les URLs sont uniques par upload
  // (timestamp + uuid), donc pas de risque de servir une version pÃ©rimÃ©e.
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
  // immÃ©diatement, le reseau rafraichit en arriere-plan. Les fichiers ont un hash,
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
