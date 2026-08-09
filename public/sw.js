/* Pelada de Baixa Qualidade — service worker exclusivo para Web Push. */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Pelada de Baixa Qualidade", body: event.data.text() };
  }

  const title = payload.title || "Pelada de Baixa Qualidade";
  const options = {
    body: payload.body || "Tem novidade na sua rodada.",
    icon: payload.icon || "/icons/pelada-bq-v2-192.png",
    badge: payload.badge || "/icons/pelada-bq-v2-192.png",
    tag: payload.tag || "pelada-update",
    renotify: true,
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
