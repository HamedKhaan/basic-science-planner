/* Service Worker — آفلاین واقعی برنامه‌ریز علوم پایه */
const CACHE = 'bsp-app-v5';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './sw.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];
// پس از اولین بازدید آنلاین، این‌ها هم کش می‌شوند
const CDN_HINTS = [
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // هر فایل را جدا بکش تا یکی خراب کل install را نشکند
    for (const url of CORE) {
      try {
        await cache.add(url);
      } catch (e) {
        try {
          const res = await fetch(url, { cache: 'reload' });
          if (res && res.ok) await cache.put(url, res);
        } catch (_) {}
      }
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function cachePut(request, response) {
  try {
    if (!response || !response.ok) return;
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  } catch (_) {}
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // ناوبری (باز کردن اپ) — بدون نت حتماً index از کش
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(event.request);
        await cachePut('./index.html', net);
        await cachePut(event.request, net);
        return net;
      } catch (_) {
        const cache = await caches.open(CACHE);
        return (
          (await cache.match('./index.html')) ||
          (await cache.match('index.html')) ||
          (await cache.match('./')) ||
          (await cache.match(event.request)) ||
          new Response(
            '<!DOCTYPE html><html lang="fa" dir="rtl"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>آفلاین</title><body style="font-family:Tahoma;padding:2rem;text-align:center;background:#0f172a;color:#e2e8f0"><h1>در حال آماده‌سازی کش</h1><p>یک‌بار با اینترنت اپ را باز کن تا برای دفعات بعد آفلاین شود.</p></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          )
        );
      }
    })());
    return;
  }

  // فایل‌های همین دامنه: کش اول، شبکه بعد
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(event.request) || await cache.match(url.pathname);
      if (cached) {
        // به‌روزرسانی پس‌زمینه وقتی آنلاین
        event.waitUntil(
          fetch(event.request).then((res) => cachePut(event.request, res)).catch(() => {})
        );
        return cached;
      }
      try {
        const net = await fetch(event.request);
        await cachePut(event.request, net);
        return net;
      } catch (_) {
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // CDN (Tailwind / فونت): شبکه؛ اگر بود کش کن؛ آفلاین از کش
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const net = await fetch(event.request);
      // پاسخ‌های CDN را برای آفلاین نگه دار
      try { await cache.put(event.request, net.clone()); } catch (_) {}
      return net;
    } catch (_) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      // opaque match by url string
      const all = await cache.keys();
      for (const req of all) {
        if (req.url === event.request.url) {
          const hit = await cache.match(req);
          if (hit) return hit;
        }
      }
      return new Response('', { status: 503 });
    }
  })());
});
