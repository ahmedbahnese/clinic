/* BSCH Clinics PWA: only public shell assets are cached. Never cache API, HTML, staff, or user files. */
const CACHE_PREFIX = 'bsch-clinic-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const PRECACHE_URLS = ['/offline.html', '/pwa/icon-192.png', '/pwa/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/staff')) return;
  if (url.pathname === '/manifest.webmanifest' || url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const offline = await caches.match('/offline.html');
      return offline || Response.error();
    }));
    return;
  }

  // Public icons use network-first so a CMS/icon update is reflected promptly,
  // while a previously cached icon remains available offline.
  if (url.pathname.startsWith('/pwa/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    })());
    return;
  }

  // Hashed Next.js chunks are immutable public/static assets.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })());
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === 'string' ? payload.title.slice(0, 80) : 'عيادات مستشفى الأطفال التخصصي';
  const options = {
    body: typeof payload.body === 'string' ? payload.body.slice(0, 240) : 'لديكم إعلان جديد من المستشفى.',
    icon: '/pwa/icon-192.png',
    badge: '/pwa/icon-192.png',
    tag: 'bsch-hospital-announcement',
    renotify: false,
    data: { url: typeof payload.url === 'string' ? payload.url : '/' },
  };
  if (typeof payload.image === 'string') options.image = payload.image;
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requested = event.notification.data && event.notification.data.url;
  let target = '/';
  try {
    const parsed = new URL(requested || '/', self.location.origin);
    if (parsed.origin === self.location.origin) target = parsed.pathname + parsed.search + parsed.hash;
  } catch { /* keep same-origin home as the safe destination */ }
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.navigate(target).then(() => existing.focus());
    return self.clients.openWindow(target);
  }));
});
