export interface PerformanceSummaryRow {
  kind: string;
  name: string;
  path: string;
  samples: number;
  p50_ms: number | null;
  p95_ms: number | null;
  max_ms: number | null;
  poor_or_failed: number;
}

export interface ServerEventInput {
  kind: "client_error" | "web_vital" | "client_action";
  name: string;
  message?: string;
  path?: string;
  value?: number;
  rating?: string;
  metadata?: Record<string, any>;
}

export const ALLOWED_OBSERVABILITY_KINDS = new Set(["client_error", "web_vital", "client_action"]);
export const ALLOWED_WEB_VITALS = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"]);
export const ALLOWED_CLIENT_ACTIONS = new Set(["register_goal", "finish_match", "create_match", "change_goalkeeper"]);

export function validateServerEvent(event: Partial<ServerEventInput>): { valid: boolean; error?: string } {
  if (!event.kind || !ALLOWED_OBSERVABILITY_KINDS.has(event.kind)) {
    return { valid: false, error: "Tipo de evento de observabilidade inválido." };
  }
  if (!event.name || typeof event.name !== "string" || !event.name.trim()) {
    return { valid: false, error: "Nome do evento é obrigatório." };
  }
  if (event.kind === "web_vital" && !ALLOWED_WEB_VITALS.has(event.name)) {
    return { valid: false, error: "Web vital não reconhecido." };
  }
  if (event.kind === "client_action" && !ALLOWED_CLIENT_ACTIONS.has(event.name)) {
    return { valid: false, error: "Ação de cliente não monitorada." };
  }
  return { valid: true };
}
