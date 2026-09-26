const CACHE_NAME = 'mboppi-v360';
const APP_SHELL = ['/', '/manifest.webmanifest', '/manifest-verone.webmanifest', '/manifest-livreur.webmanifest', '/manifest-admin.webmanifest', '/icon-192.png', '/icon-512.png', '/robots.txt', '/splash.js'];
// Les diapositives, illustrations sociales et logos secondaires sont charges a la
// demande : les precacher a chaque version augmentait l'egress des installations.

// Endpoints GET publics : servis depuis le cache quand le reseau est lent ou coupe,
// puis rafraichis en arriere-plan (stale-while-revalidate).
const API_SWR = [
  '/api/products',
  '/api/flash-promotions',
  '/api/offers',
  '/api/metrics/trending',
  '/api/sales/recent',
  '/api/payments/settings',
  '/api/messages/popup',
  '/api/shop/',
  '/api/reviews/product/',
];
const API_TIMEOUT = 6000;
const API_FRESH_MS = 60 * 1000;
const API_REVALIDATIONS = new Map();

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
        self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
          clients.forEach((client) => {
            try {
              client.postMessage({ type: 'APP_UPDATED' });
            } catch (e) {}
            // Onglet en arriÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨re-plan (ancien shell possiblement KO) :
            // re-navigation automatique dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨s que la nouvelle version est
            // active. La navigation passe alors par le mode ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â« rÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©seau
            // d'abord ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â» ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ HTML frais, plus jamais d'ancien shell dont les
            // chunks ont disparu. Les onglets VISIBLES en plein usage ne
            // sont pas forcÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©s (respect du travail en cours) : ils reÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§oivent
            // APP_UPDATED et l'app applique/retarde la mise ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â  jour en SPA.
            // `client.url` est une URL absolue : ne pas l'utiliser ici.
            // La page reçoit APP_UPDATED et main.jsx applique la mise à jour
            // au moment sûr, sans provoquer « Cannot navigate to URL ».
          });
        })
      )
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {}
  const title = data.title || 'MboppiShop';
  // CRITIQUE : `renotify: true` exige un tag NON vide, sinon showNotification()
  // jette une TypeError et la notification n'est jamais affichÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©e. Le serveur
  // envoie toujours un tag, mais on se protÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨ge si jamais il manque.
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
    // Son de notification (supportÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© surtout sur Android/Chrome ; Chrome
    // desktop ignore le champ "sound" comme documentÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©). NB : quand l'app est
    // FERMÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°E, le son vient du canal systÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨me de la PWA (RÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©glages ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ Applications
    // ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ [nom] ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ Notifications ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ activer le son) ; la vibration fonctionne, elle.
    sound: data.sound || '/notification.wav',
    vibrate: data.vibrate || [200, 100, 200],
    // La notification reste affichÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©e tant que l'utilisateur n'a pas rÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©agi.
    requireInteraction: data.requireInteraction !== false,
    data: { url: data.data && data.data.url ? data.data.url : '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Rotation de l'abonnement push par le push service (FCM renouvelle les tokens,
// dÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©sinstallation temporaire/rÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©installation du navigateurÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦) : on se rÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©-abonne
// aussitÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â´t et on met ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  jour le serveur. Sans ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§a, l'appareil perd le push pour
// toujours jusqu'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  la prochaine ouverture de l'app.
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
    // serveur pour transfÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©rer l'abonnement sans JWT (le SW ne lit pas le token).
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
  // Mesure d'ouverture : ping best-effort (keepalive survit ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  la fermeture).
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
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      let target;
      try {
        target = new URL(url, self.location.origin);
      } catch (e) {
        target = new URL('/', self.location.origin);
      }
      // Une notification peut contenir un lien externe : WindowClient.navigate
      // ne sert que pour une URL interne et attend une URL relative.
      if (target.origin !== self.location.origin) return clients.openWindow(target.href);
      const relativeUrl = `${target.pathname}${target.search}${target.hash}`;
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          try {
            await client.navigate(relativeUrl);
          } catch (e) {}
          return;
        }
      }
      return clients.openWindow(target.href);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // Images produits (origin Supabase Storage) : cache-first pour que les photos
  // dÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©jÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  vues restent visibles hors connexion. Les URLs sont uniques par upload
  // (timestamp + uuid), donc pas de risque de servir une version pÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©rimÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©e.
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

  // Un changement vers les produits digitaux doit voir immédiatement une
  // publication récente. Le cache du service worker ne doit pas masquer le
  // résultat réseau de cette requête explicitement fraîche.
  if (url.pathname.startsWith('/api/')) {
    const isFreshCatalog =
      url.pathname === '/api/products' &&
      (url.searchParams.get('type') === 'digital' || url.searchParams.has('catalog_refresh'));
    if (isApiSwr(url.pathname) && event.request.cache !== 'no-store' && !isFreshCatalog) {
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
  // immÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©diatement, le reseau rafraichit en arriere-plan. Les fichiers ont un hash,
  // donc deux versions ne se melangent jamais.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(assetCacheFirst(event.request));
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

function fetchAndCacheApi(request) {
  const key = request.url;
  if (API_REVALIDATIONS.has(key)) return API_REVALIDATIONS.get(key);
  const shared = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT);
    try {
      const resp = await fetch(request, { signal: controller.signal });
      clearTimeout(timer);
      if (resp && resp.ok && /application\/json/.test(resp.headers.get('content-type') || '')) {
        const body = await resp.clone().arrayBuffer();
        const headers = new Headers(resp.headers);
        headers.set('x-sw-cached-at', String(Date.now()));
        await caches.open(CACHE_NAME).then((cache) =>
          cache.put(request, new Response(body, { status: resp.status, statusText: resp.statusText, headers }))
        );
      }
      return resp;
    } catch (err) {
      clearTimeout(timer);
      return null;
    }
  })();
  API_REVALIDATIONS.set(key, shared);
  shared.then(
    () => { if (API_REVALIDATIONS.get(key) === shared) API_REVALIDATIONS.delete(key); },
    () => { if (API_REVALIDATIONS.get(key) === shared) API_REVALIDATIONS.delete(key); }
  );
  return shared;
}

async function apiSwr(request) {
  const cached = await caches.match(request);
  const cachedAt = Number(cached?.headers.get('x-sw-cached-at') || 0);
  if (cached && Date.now() - cachedAt < API_FRESH_MS) return cached;
  if (cached) {
    fetchAndCacheApi(request);
    return cached;
  }
  return (await fetchAndCacheApi(request)) || cached ||
    new Response('Ressource indisponible hors connexion', { status: 504, statusText: 'Gateway Timeout' });
}

async function assetCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    if (resp.ok) {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    return resp;
  } catch (err) {
    return new Response('Ressource indisponible hors connexion', { status: 504, statusText: 'Gateway Timeout' });
  }
}

async function navSwr(request) {
  // NAVIGATION : le RÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â°SEAU d'abord (HTML frais ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â  chaque ouverture), le cache
  // ne sert que HORS LIGNE. Avant v251, on servait le shell en cache immÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©diat
  // (stale-while-revalidate) : aprÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨s un dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©ploiement, ce shell rÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©fÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©renÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ait des
  // chunks de l'ancien build que la route SPA servait en text/html ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â« Failed
  // to fetch dynamically imported module ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â» ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ splash/loader infini.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000); // filet : cache si rÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©seau lent
  try {
    const resp = await fetch(request, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (resp && resp.ok && /text\/html/i.test(resp.headers.get('content-type') || '')) {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
    }
    return resp;
  } catch (err) {
    clearTimeout(timer);
    const cached = await caches.match('/');
    if (cached && /text\/html/i.test(cached.headers.get('content-type') || '')) return cached;
    return new Response('Ressource indisponible hors connexion', { status: 504, statusText: 'Gateway Timeout' });
  }
}

