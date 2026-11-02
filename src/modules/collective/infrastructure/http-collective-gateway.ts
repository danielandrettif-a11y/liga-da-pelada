import type { CollectiveSummary, CollectiveRoomData } from "@/lib/actions/collective";
import type { CollectivePageCursor, CollectivePageMessage } from "./supabase-collective-reader";

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

export type CollectiveHttpGateway = {
  getActiveCollectiveSummary(leagueId: string): Promise<CollectiveSummary | null>;
  getCollectiveRoom(leagueId: string, callupId?: string): Promise<CollectiveRoomData | null>;
  getOlderCollectiveMessages(
    leagueId: string,
    callupId: string,
    cursor: CollectivePageCursor
  ): Promise<{ success: boolean; messages: CollectivePageMessage[]; hasOlderMessages: boolean; nextCursor: CollectivePageCursor | null; error?: string }>;
  sendCollectiveMessage(leagueId: string, payload: any): Promise<{ success: boolean; error?: string }>;
  editCollectiveMessage(leagueId: string, messageId: string, body: string): Promise<{ success: boolean; error?: string }>;
  deleteCollectiveMessage(leagueId: string, messageId: string): Promise<{ success: boolean; error?: string }>;
  markCollectiveRead(leagueId: string, targets: Array<{ callupId: string; messageId: string }>): Promise<{ success: boolean }>;
  getAdminPreviousCollective(leagueId: string): Promise<CollectiveRoomData | null>;
};

type ApiCollectiveMessage = Omit<CollectivePageMessage, "mediaUrl"> & {
  mediaPath?: string | null;
};

type ApiCollectiveRoom = Omit<CollectiveRoomData, "messages"> & {
  messages: ApiCollectiveMessage[];
};

type SignMediaPaths = (paths: string[]) => Promise<Map<string, string>>;

export function httpCollectiveGateway(
  baseUrl: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
  signMediaPaths?: SignMediaPaths,
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

  async function mapMessages(messages: ApiCollectiveMessage[]): Promise<CollectivePageMessage[]> {
    const paths = [...new Set(messages.map((message) => message.mediaPath || "").filter(Boolean))];
    let signedByPath = new Map<string, string>();
    if (paths.length && signMediaPaths) {
      try {
        signedByPath = await signMediaPaths(paths);
      } catch {
        // A falha ao assinar uma mídia não deve impedir a leitura da conversa.
      }
    }
    return messages.map(({ mediaPath, ...message }) => ({
      ...message,
      mediaUrl: mediaPath ? signedByPath.get(mediaPath) || null : null,
    }));
  }

  async function mapRoom(room: ApiCollectiveRoom | null): Promise<CollectiveRoomData | null> {
    if (!room) return null;
    return { ...room, messages: await mapMessages(room.messages || []) };
  }

  return {
    async getActiveCollectiveSummary(leagueId) {
      return request<CollectiveSummary | null>(`/api/collective/leagues/${leagueId}/summary`);
    },

    async getCollectiveRoom(leagueId, callupId) {
      const q = callupId ? `?callupId=${encodeURIComponent(callupId)}` : "";
      const room = await request<ApiCollectiveRoom | null>(`/api/collective/leagues/${leagueId}/room${q}`);
      return mapRoom(room);
    },

    async getOlderCollectiveMessages(leagueId, callupId, cursor) {
      const page = await request<{
        success: boolean;
        messages: ApiCollectiveMessage[];
        hasOlderMessages: boolean;
        nextCursor: CollectivePageCursor | null;
        error?: string;
      }>(`/api/collective/leagues/${leagueId}/callups/${callupId}/messages`, {
        method: "POST",
        body: JSON.stringify({ cursor }),
      });
      return { ...page, messages: await mapMessages(page.messages || []) };
    },

    async sendCollectiveMessage(leagueId, payload) {
      return request<{ success: boolean; error?: string }>(`/api/collective/leagues/${leagueId}/messages`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    async editCollectiveMessage(leagueId, messageId, body) {
      return request<{ success: boolean; error?: string }>(`/api/collective/leagues/${leagueId}/messages/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      });
    },

    async deleteCollectiveMessage(leagueId, messageId) {
      return request<{ success: boolean; error?: string }>(`/api/collective/leagues/${leagueId}/messages/${messageId}`, {
        method: "DELETE",
      });
    },

    async markCollectiveRead(leagueId, targets) {
      return request<{ success: boolean }>(`/api/collective/leagues/${leagueId}/reads`, {
        method: "POST",
        body: JSON.stringify({ targets }),
      });
    },

    async getAdminPreviousCollective(leagueId) {
      const room = await request<ApiCollectiveRoom | null>(`/api/collective/leagues/${leagueId}/admin-previous`);
      return mapRoom(room);
    },
  };
}
