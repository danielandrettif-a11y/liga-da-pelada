const CACHE_NAME = "pelada-bq-shell-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([
    OFFLINE_URL,
    "/icons/pelada-bq-v2-192.png",
  ])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  const url = new URL(event.request.url);
  const isCardArt = url.origin === self.location.origin && url.pathname.startsWith("/images/cards/");
  const isStaticImage = url.origin === self.location.origin && (
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/team-crests/") ||
    url.pathname.startsWith("/_next/image")
  );

  if (!isCardArt && !isStaticImage) return;

  // Exibe a imagem já disponível imediatamente e atualiza o cache em segundo plano.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// Web Push continua no mesmo service worker usado para a instalação PWA.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Pelada de Baixa Qualidade", body: event.data.text() };
  }
  const title = payload.title || "Pelada de Baixa Qualidade";
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || "Tem novidade na sua rodada.",
    icon: payload.icon || "/icons/pelada-bq-v2-192.png",
    badge: payload.badge || "/icons/pelada-bq-v2-192.png",
    tag: payload.tag || "pelada-update",
    renotify: true,
    data: { url: payload.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("navigate" in client) await client.navigate(targetUrl);
      if ("focus" in client) return client.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
