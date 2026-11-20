import type { CollectivePageCursor, RawCollectivePage } from "./supabase-collective-reader";

export class CollectiveApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly code?: string
  ) {
    super(message);
    this.name = "CollectiveApiError";
  }
}

export type SendCollectiveMessagePayload = {
  callupId: string;
  body: string;
  kind: "text" | "image" | "audio";
  mediaPath: string | null;
  mediaMime: string | null;
  mediaSize: number | null;
  duration: number | null;
  replyToMessageId: string | null;
};

export type CollectiveHttpGateway = {
  getPreviousCallupId(leagueId: string): Promise<{ callupId: string | null }>;
  getCandidates(leagueId: string): Promise<any[]>;
  getPage(leagueId: string, callupIds: string[], cursor: CollectivePageCursor | null, limit: number): Promise<RawCollectivePage>;
  sendCollectiveMessage(leagueId: string, payload: SendCollectiveMessagePayload): Promise<{ success: boolean; messageId?: string; error?: string }>;
  editCollectiveMessage(leagueId: string, messageId: string, body: string): Promise<{ success: boolean; error?: string }>;
  deleteCollectiveMessage(leagueId: string, messageId: string): Promise<{ success: boolean; error?: string }>;
  markCollectiveRead(leagueId: string, targets: Array<{ callupId: string; messageId: string }>): Promise<{ success: boolean }>;
};

export function httpCollectiveGateway(
  baseUrl: string,
  accessToken: string,
  fetcher: typeof fetch = fetch
): CollectiveHttpGateway {
  const normalizedBase = baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${normalizedBase}${path}`;
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
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
      throw new CollectiveApiError(
        errorBody?.error || errorBody?.message || `HTTP ${res.status}`,
        res.status,
        errorBody?.code
      );
    }
    return res.json() as Promise<T>;
  }

  async function mutation(path: string, init: RequestInit): Promise<{ success: boolean; error?: string }> {
    try {
      return await request(path, init);
    } catch (error) {
      if (error instanceof CollectiveApiError && error.status === 400) return { success: false, error: error.message };
      throw error;
    }
  }

  return {
    async getPreviousCallupId(leagueId) {
      return request<{ callupId: string | null }>(`/api/collective/leagues/${encodeURIComponent(leagueId)}/previous-id`);
    },
    async getCandidates(leagueId) {
      return request<any[]>(`/api/collective/leagues/${encodeURIComponent(leagueId)}/candidates`);
    },
    async getPage(leagueId, callupIds, cursor, limit) {
      return request<RawCollectivePage>(`/api/collective/leagues/${encodeURIComponent(leagueId)}/page`, {
        method: "POST", body: JSON.stringify({ callupIds, cursor, limit }),
      });
    },
    async sendCollectiveMessage(leagueId, payload) {
      return mutation(`/api/collective/leagues/${encodeURIComponent(leagueId)}/messages`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    async editCollectiveMessage(leagueId, messageId, body) {
      return mutation(`/api/collective/leagues/${encodeURIComponent(leagueId)}/messages/${encodeURIComponent(messageId)}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      });
    },

    async deleteCollectiveMessage(leagueId, messageId) {
      return mutation(`/api/collective/leagues/${encodeURIComponent(leagueId)}/messages/${encodeURIComponent(messageId)}`, {
        method: "DELETE",
      });
    },

    async markCollectiveRead(leagueId, targets) {
      try {
        return await request<{ success: boolean }>(`/api/collective/leagues/${encodeURIComponent(leagueId)}/reads`, {
          method: "POST",
          body: JSON.stringify({ targets }),
        });
      } catch (error) {
        if (error instanceof CollectiveApiError && error.status === 400) return { success: false };
        throw error;
      }
    },
  };
}
