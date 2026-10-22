import { createServiceClient } from "@/lib/supabase/service";

export type ObservabilityEvent = {
  kind: "server_error" | "client_error" | "web_vital" | "client_action" | "match_step";
  name: string;
  message?: string;
  path?: string;
  value?: number;
  rating?: string;
  digest?: string;
  success?: boolean;
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
      ? Object.fromEntries(Object.entries(event.metadata).filter(([, value]) => value !== undefined).slice(0, 20))
      : undefined,
  };
}

export async function reportServerEvent(event: ObservabilityEvent) {
  const payload = sanitize(event);
  const line = JSON.stringify({ ...payload, timestamp: new Date().toISOString() });

  if (payload.kind === "server_error") console.error(`[observability] ${line}`);
  else if (payload.kind !== "match_step") console.info(`[observability] ${line}`);

  if ((payload.kind === "web_vital" && payload.rating === "poor")
    || (payload.kind === "match_step" && (payload.success === false || Number(payload.value || 0) >= 1_500))) {
    console.warn(`[performance-alert] ${line}`);
  }

  const service = createServiceClient();
  if (service) {
    const { error } = await service.from("app_performance_events").insert({
      kind: payload.kind,
      name: payload.name,
      message: payload.message || null,
      path: payload.path || null,
      value: payload.value ?? null,
      rating: payload.rating || null,
      digest: payload.digest || null,
      success: payload.success ?? null,
      metadata: payload.metadata || {},
    });
    if (error) console.error("[observability] persistence failed", error.message);
  }

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
