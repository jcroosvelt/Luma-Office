// Réception de fichiers via « Partager vers Luma Office » (Android) : stockés dans un cache, puis ouverts par l'application.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return;
  event.respondWith((async () => {
    try {
      const data = await event.request.formData();
      const files = data.getAll('files').filter((f) => f && f.name);
      const cache = await caches.open('luma-share');
      for (const k of await cache.keys()) await cache.delete(k);
      let i = 0;
      for (const f of files) {
        await cache.put(new URL(`__shared/${i++}/${encodeURIComponent(f.name)}`, self.registration.scope).href,
          new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } }));
      }
    } catch (e) { /* on redirige quand même vers l'application */ }
    return Response.redirect(new URL('./#/shared', self.registration.scope).href, 303);
  })());
});
