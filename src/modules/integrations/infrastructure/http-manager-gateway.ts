import type { ClubIdentity, ManagerCommand, ManagerResult } from "@/lib/bq-manager/types";

export class ManagerApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ManagerApiError";
  }
}

export type ManagerHttpGateway = {
  createClub(identity: ClubIdentity, leagueId: string): Promise<ManagerResult>;
  runCommand(command: ManagerCommand, expectedVersion: number, leagueId: string): Promise<ManagerResult>;
};

export function httpManagerGateway(
  baseUrl: string,
  accessToken: string,
  fetcher: typeof fetch = fetch
): ManagerHttpGateway {
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
      throw new ManagerApiError(
        errorBody?.message || errorBody?.error || `HTTP ${res.status}`,
        res.status,
        errorBody?.code
      );
    }
    return res.json() as Promise<T>;
  }

  return {
    async createClub(identity, leagueId) {
      return request<ManagerResult>("/api/integrations/manager/club", {
        method: "POST",
        body: JSON.stringify({ identity, leagueId }),
      });
    },

    async runCommand(command, expectedVersion, leagueId) {
      return request<ManagerResult>("/api/integrations/manager/command", {
        method: "POST",
        body: JSON.stringify({ command, expectedVersion, leagueId }),
      });
    },
  };
}
