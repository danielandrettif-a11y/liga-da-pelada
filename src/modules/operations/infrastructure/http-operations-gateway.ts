import type { PerformanceSummaryRow } from "@/lib/actions/performance";

export class OperationsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly code?: string
  ) {
    super(message);
    this.name = "OperationsApiError";
  }
}

export type OperationsHttpGateway = {
  getPerformanceSummary(hours?: number): Promise<PerformanceSummaryRow[]>;
  reportServerEvent(event: any): Promise<{ success: boolean; error?: string }>;
};

export function httpOperationsGateway(
  baseUrl: string,
  fetcher: typeof fetch = fetch
): OperationsHttpGateway {
  const normalizedBase = baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${normalizedBase}${path}`;
    const headers = new Headers(init?.headers);
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetcher(url, { ...init, headers });
    if (!res.ok) {
      let errorBody: any = null;
      try {
        errorBody = await res.json();
      } catch {
        // fallback
      }
      throw new OperationsApiError(
        errorBody?.error || errorBody?.message || `HTTP ${res.status}`,
        res.status,
        errorBody?.code
      );
    }
    if (res.status === 204) return { success: true } as unknown as T;
    return res.json() as Promise<T>;
  }

  return {
    async getPerformanceSummary(hours = 24) {
      return request<PerformanceSummaryRow[]>(`/api/operations/performance-summary?hours=${encodeURIComponent(hours)}`);
    },

    async reportServerEvent(event) {
      return request<{ success: boolean; error?: string }>("/api/internal/operations/observability", {
        method: "POST",
        body: JSON.stringify(event),
      });
    },
  };
}
