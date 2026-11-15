const CACHE_NAME = "local-translator-shell-v1";
const SHELL = ["./", "./index.html", "./style.css", "./app.js", "./manifest.json", "./icon.svg"];
const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL);
    // Keep the Transformers.js entry bundle available for subsequent offline launches.
    try {
      const response = await fetch(TRANSFORMERS_CDN, { mode: "cors" });
      if (response.ok) await cache.put(TRANSFORMERS_CDN, response);
    } catch (_) {}
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("local-translator-shell-") && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin || url.href === TRANSFORMERS_CDN) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok && event.request.method === "GET") {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, response.clone());
        }
        return response;
      } catch (err) {
        return new Response("オフラインです。初回のモデル準備とアプリ読み込みをオンラインで完了してください。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
  }
});
