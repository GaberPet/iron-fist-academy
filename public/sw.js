// Offline support for the installed phone app (website only; the desktop app has its files built in).
// Pages and frame data: network first, so updates arrive when online; the cache is the offline fallback.
// Hashed build files (scripts, styles, fonts): cache first, they never change under the same name.
// 3D models (.glb) are not cached: the fight modes are desktop only.
const CACHE = 'ifa-v1';

async function precache() {
  const c = await caches.open(CACHE);
  await c.addAll(['./', './index.html', './favicon.svg', './manifest.webmanifest', './icon-192.png', './data/manifest.json', './data/changelog.json']);
  // The app shell: scripts and styles named in index.html, and the fonts those styles use.
  const html = await (await fetch('./index.html', { cache: 'no-cache' })).text();
  const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
  await c.addAll(assets);
  for (const css of assets.filter((a) => a.endsWith('.css'))) {
    const text = await (await fetch(css)).text();
    const fonts = [...text.matchAll(/url\(([^)]+\.woff2)\)/g)].map((m) => new URL(m[1].replace(/["']/g, ''), new URL(css, self.registration.scope)).href);
    await c.addAll(fonts);
  }
  // Every character's frame data and combos, so the whole roster works offline.
  const manifest = await (await fetch('./data/manifest.json')).json();
  await c.addAll(manifest.characters.map((ch) => `./data/characters/${ch.id}.json`));
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('.glb')) return;
  const networkFirst = req.mode === 'navigate' || url.pathname.endsWith('.json') || url.pathname.endsWith('.html');
  e.respondWith(
    (async () => {
      const c = await caches.open(CACHE);
      if (networkFirst) {
        try {
          const res = await fetch(req);
          if (res.ok) c.put(req, res.clone());
          return res;
        } catch {
          return (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? c.match('./index.html') : Response.error());
        }
      }
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    })(),
  );
});
