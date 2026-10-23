const VERSION = 'v1';
const SHELL = `najm-shell-${VERSION}`;
const CDN = `najm-cdn-${VERSION}`;

const SHELL_FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![SHELL, CDN].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // بيانات Supabase: لا تُخزَّن أبداً (دائماً من الشبكة)
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;

  // ملفات الموقع نفسه: الشبكة أولاً، ثم النسخة المخزنة عند انقطاع الإنترنت
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // المكتبات والخطوط من CDN: من المخزن فوراً مع تحديث بالخلفية
  if (['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
    e.respondWith(
      caches.open(CDN).then(cache =>
        cache.match(req).then(cached => {
          const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => cached);
          return cached || net;
        })
      )
    );
  }
});
