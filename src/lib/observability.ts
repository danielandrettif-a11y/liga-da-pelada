type ObservabilityEvent = {
  kind: "server_error" | "client_error" | "web_vital";
  name: string;
  message?: string;
  path?: string;
  value?: number;
  rating?: string;
  digest?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

function sanitize(event: ObservabilityEvent): ObservabilityEvent {
  return {
    ...event,
    name: event.name.slice(0, 100),
    message: event.message?.slice(0, 500),
    path: event.path?.split("?")[0].slice(0, 200),
    digest: event.digest?.slice(0, 100),
    metadata: event.metadata
      ? Object.fromEntries(Object.entries(event.metadata).slice(0, 20))
      : undefined,
  };
}

export async function reportServerEvent(event: ObservabilityEvent) {
  const payload = sanitize(event);
  const line = JSON.stringify({ ...payload, timestamp: new Date().toISOString() });

  if (payload.kind === "server_error") console.error(`[observability] ${line}`);
  else console.info(`[observability] ${line}`);

  const webhookUrl = process.env.OBSERVABILITY_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: line,
      signal: AbortSignal.timeout(2_500),
    });
  } catch (error) {
    console.error("[observability] webhook delivery failed", error);
  }
}
