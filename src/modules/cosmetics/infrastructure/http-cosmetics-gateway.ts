import type { CosmeticSlot } from "@/lib/fantasy/cosmetics";
import type { CosmeticsDashboardRows } from "@/modules/cosmetics/domain/dashboard-types";
import type { CosmeticPreviewLoadout, EquippedCosmeticsSummary } from "@/modules/cosmetics/domain/equipped-summary";

export class CosmeticsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly code?: string
  ) {
    super(message);
    this.name = "CosmeticsApiError";
  }
}

export type CosmeticsHttpGateway = {
  getCosmeticsDashboard(leagueId: string, seasonId: string | null): Promise<CosmeticsDashboardRows | null>;
  cleanupLegacyCosmeticsPreview(fantasySeasonId: string | null): Promise<{ success: boolean; removed?: number; error?: string }>;
  dismissUnopenedBronzePassPack(fantasySeasonId: string | null): Promise<{ success: boolean; dismissed?: number; error?: string }>;
  resetTestPassRewardClaims(fantasySeasonId: string, selectedFantasySeasonId: string | null): Promise<{ success: boolean; removed?: number; error?: string }>;
  claimPassCosmetic(rewardId: string, cosmeticId: string, fantasySeasonId: string): Promise<{ success: boolean; error?: string }>;
  purchaseSeasonPassShopItem(shopItemId: string, fantasySeasonId: string): Promise<{ success: boolean; error?: string }>;
  equipCosmetic(slot: CosmeticSlot, cosmeticId: string | null): Promise<{ success: boolean; error?: string }>;
  getAdminCosmeticsPreview(leagueId: string, playerId: string, requested: CosmeticPreviewLoadout): Promise<EquippedCosmeticsSummary | null>;
  getMyEquippedCosmetics(): Promise<EquippedCosmeticsSummary | null>;
  getPlayerEquippedCosmetics(playerId: string): Promise<EquippedCosmeticsSummary | null>;
  getAllPlayersEquippedCosmeticsMap(playerIds?: string[]): Promise<Map<string, EquippedCosmeticsSummary>>;
};

export function httpCosmeticsGateway(
  baseUrl: string,
  accessToken: string,
  fetcher: typeof fetch = fetch
): CosmeticsHttpGateway {
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
      throw new CosmeticsApiError(
        errorBody?.error || errorBody?.message || `HTTP ${res.status}`,
        res.status,
        errorBody?.code
      );
    }
    return res.json() as Promise<T>;
  }

  async function mutation<T extends { success: boolean; error?: string }>(path: string, body: unknown): Promise<T> {
    try {
      return await request<T>(path, { method: "POST", body: JSON.stringify(body) });
    } catch (error) {
      if (error instanceof CosmeticsApiError && error.status === 400) return { success: false, error: error.message } as T;
      throw error;
    }
  }

  return {
    async getCosmeticsDashboard(leagueId, seasonId) {
      const q = new URLSearchParams();
      if (leagueId) q.set("leagueId", leagueId);
      if (seasonId) q.set("seasonId", seasonId);
      return request<CosmeticsDashboardRows | null>(`/api/cosmetics/dashboard?${q.toString()}`);
    },

    async cleanupLegacyCosmeticsPreview(fantasySeasonId) {
      return mutation<{ success: boolean; removed?: number; error?: string }>("/api/cosmetics/admin/cleanup-legacy", { fantasySeasonId });
    },

    async dismissUnopenedBronzePassPack(fantasySeasonId) {
      return mutation<{ success: boolean; dismissed?: number; error?: string }>("/api/cosmetics/admin/dismiss-bronze-pack", { fantasySeasonId });
    },

    async resetTestPassRewardClaims(fantasySeasonId, selectedFantasySeasonId) {
      return mutation<{ success: boolean; removed?: number; error?: string }>("/api/cosmetics/admin/reset-test-claims", { fantasySeasonId, selectedFantasySeasonId });
    },

    async claimPassCosmetic(rewardId, cosmeticId, fantasySeasonId) {
      return mutation<{ success: boolean; error?: string }>("/api/cosmetics/claim-pass", { rewardId, cosmeticId, fantasySeasonId });
    },

    async purchaseSeasonPassShopItem(shopItemId, fantasySeasonId) {
      return mutation<{ success: boolean; error?: string }>("/api/cosmetics/purchase-shop", { shopItemId, fantasySeasonId });
    },

    async equipCosmetic(slot, cosmeticId) {
      return mutation<{ success: boolean; error?: string }>("/api/cosmetics/equip", { slot, cosmeticId });
    },

    async getAdminCosmeticsPreview(leagueId, playerId, requested) {
      return request<EquippedCosmeticsSummary | null>("/api/cosmetics/admin-preview", {
        method: "POST",
        body: JSON.stringify({ leagueId, playerId, requested }),
      });
    },

    async getMyEquippedCosmetics() {
      return request<EquippedCosmeticsSummary | null>("/api/cosmetics/equipped/me");
    },

    async getPlayerEquippedCosmetics(playerId) {
      return request<EquippedCosmeticsSummary | null>(`/api/cosmetics/equipped/players/${playerId}`);
    },

    async getAllPlayersEquippedCosmeticsMap(playerIds) {
      const record = await request<Record<string, EquippedCosmeticsSummary>>("/api/cosmetics/equipped/players-map", {
        method: "POST",
        body: JSON.stringify({ playerIds }),
      });
      return new Map(Object.entries(record || {}));
    },
  };
}
