import type { CosmeticSlot } from "@/lib/fantasy/cosmetics";
import type { CosmeticsDashboard } from "@/lib/actions/cosmetics";
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
  getCosmeticsDashboard(leagueId: string, seasonId: string | null, isAdmin: boolean): Promise<CosmeticsDashboard>;
  cleanupLegacyCosmeticsPreview(fantasySeasonId: string | null): Promise<{ success: boolean; removed?: number; error?: string }>;
  dismissUnopenedBronzePassPack(fantasySeasonId: string | null): Promise<{ success: boolean; dismissed?: number; error?: string }>;
  resetTestPassRewardClaims(fantasySeasonId: string, selectedFantasySeasonId: string | null): Promise<{ success: boolean; removed?: number; error?: string }>;
  claimPassCosmetic(rewardId: string, cosmeticId: string, fantasySeasonId: string): Promise<{ success: boolean; error?: string }>;
  purchaseSeasonPassShopItem(shopItemId: string, fantasySeasonId: string): Promise<{ success: boolean; error?: string }>;
  equipCosmetic(slot: CosmeticSlot, cosmeticId: string | null): Promise<{ success: boolean; error?: string }>;
  getAdminCosmeticsPreview(playerId: string, requested: CosmeticPreviewLoadout, ownPlayerId: string | null, isAdmin: boolean): Promise<EquippedCosmeticsSummary | null>;
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

  return {
    async getCosmeticsDashboard(leagueId, seasonId, isAdmin) {
      const q = new URLSearchParams();
      if (leagueId) q.set("leagueId", leagueId);
      if (seasonId) q.set("seasonId", seasonId);
      if (isAdmin) q.set("isAdmin", "true");
      return request<CosmeticsDashboard>(`/api/cosmetics/dashboard?${q.toString()}`);
    },

    async cleanupLegacyCosmeticsPreview(fantasySeasonId) {
      return request<{ success: boolean; removed?: number; error?: string }>("/api/cosmetics/admin/cleanup-legacy", {
        method: "POST",
        body: JSON.stringify({ fantasySeasonId }),
      });
    },

    async dismissUnopenedBronzePassPack(fantasySeasonId) {
      return request<{ success: boolean; dismissed?: number; error?: string }>("/api/cosmetics/admin/dismiss-bronze-pack", {
        method: "POST",
        body: JSON.stringify({ fantasySeasonId }),
      });
    },

    async resetTestPassRewardClaims(fantasySeasonId, selectedFantasySeasonId) {
      return request<{ success: boolean; removed?: number; error?: string }>("/api/cosmetics/admin/reset-test-claims", {
        method: "POST",
        body: JSON.stringify({ fantasySeasonId, selectedFantasySeasonId }),
      });
    },

    async claimPassCosmetic(rewardId, cosmeticId, fantasySeasonId) {
      return request<{ success: boolean; error?: string }>("/api/cosmetics/claim-pass", {
        method: "POST",
        body: JSON.stringify({ rewardId, cosmeticId, fantasySeasonId }),
      });
    },

    async purchaseSeasonPassShopItem(shopItemId, fantasySeasonId) {
      return request<{ success: boolean; error?: string }>("/api/cosmetics/purchase-shop", {
        method: "POST",
        body: JSON.stringify({ shopItemId, fantasySeasonId }),
      });
    },

    async equipCosmetic(slot, cosmeticId) {
      return request<{ success: boolean; error?: string }>("/api/cosmetics/equip", {
        method: "POST",
        body: JSON.stringify({ slot, cosmeticId }),
      });
    },

    async getAdminCosmeticsPreview(playerId, requested, ownPlayerId, isAdmin) {
      return request<EquippedCosmeticsSummary | null>("/api/cosmetics/admin-preview", {
        method: "POST",
        body: JSON.stringify({ playerId, requested, ownPlayerId, isAdmin }),
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
