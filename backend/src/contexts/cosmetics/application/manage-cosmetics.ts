import {
  type CosmeticSlot,
  type UserEquippedCosmetics,
  type CosmeticPreviewLoadout,
  type CosmeticPreviewSummary,
  type EquippedCosmeticsSummary,
  isValidCosmeticSlot,
  sanitizeEquippedCosmetics,
} from "../domain/cosmetics.js";

export interface CosmeticsRepository {
  getCosmeticsDashboard(params: {
    userId: string;
    leagueId: string;
    seasonId: string | null;
  }): Promise<any>;

  equipCosmetic(params: {
    userId: string;
    slot: CosmeticSlot;
    cosmeticId: string | null;
  }): Promise<{ success: boolean; error?: string }>;

  claimPassCosmetic(params: {
    userId: string;
    rewardId: string;
    cosmeticId: string;
    fantasySeasonId: string;
  }): Promise<{ success: boolean; error?: string }>;

  purchaseSeasonPassShopItem(params: {
    userId: string;
    shopItemId: string;
    fantasySeasonId: string;
  }): Promise<{ success: boolean; error?: string }>;

  getMyEquippedCosmetics(userId: string): Promise<CosmeticPreviewSummary | null>;

  getPlayerEquippedCosmetics(userId: string, playerId: string): Promise<CosmeticPreviewSummary | null>;

  getAllPlayersEquippedCosmeticsMap(userId: string, playerIds?: string[]): Promise<Record<string, CosmeticPreviewSummary>>;

  resolveAdminCosmeticsPreview(params: {
    userId: string;
    leagueId: string;
    playerId: string;
    requested: CosmeticPreviewLoadout;
  }): Promise<CosmeticPreviewSummary | null>;

  cleanupLegacyCosmeticsPreview(userId: string, fantasySeasonId: string | null): Promise<{ success: boolean; removed?: number; error?: string }>;

  dismissUnopenedBronzePassPack(userId: string, fantasySeasonId: string | null): Promise<{ success: boolean; dismissed?: number; error?: string }>;

  resetTestPassRewardClaims(params: {
    userId: string;
    fantasySeasonId: string;
    selectedFantasySeasonId: string | null;
  }): Promise<{ success: boolean; error?: string }>;
}

export class ManageCosmeticsUseCase {
  constructor(private readonly repository: CosmeticsRepository) {}

  async getDashboard(params: {
    userId: string;
    leagueId: string;
    seasonId: string | null;
  }) {
    return this.repository.getCosmeticsDashboard(params);
  }

  async equip(params: {
    userId: string;
    slot: string;
    cosmeticId: string | null;
  }): Promise<{ success: boolean; error?: string }> {
    if (!isValidCosmeticSlot(params.slot)) {
      return { success: false, error: "Slot de cosmético inválido." };
    }
    return this.repository.equipCosmetic({
      userId: params.userId,
      slot: params.slot,
      cosmeticId: params.cosmeticId,
    });
  }

  async claimPassCosmetic(params: {
    userId: string;
    rewardId: string;
    cosmeticId: string;
    fantasySeasonId: string;
  }) {
    if (!params.rewardId || !params.cosmeticId || !params.fantasySeasonId) {
      return { success: false, error: "Dados incompletos para resgate de cosmético." };
    }
    return this.repository.claimPassCosmetic(params);
  }

  async purchaseShopItem(params: {
    userId: string;
    shopItemId: string;
    fantasySeasonId: string;
  }) {
    if (!params.shopItemId || !params.fantasySeasonId) {
      return { success: false, error: "Item da loja ou temporada inválidos." };
    }
    return this.repository.purchaseSeasonPassShopItem(params);
  }

  async getMyEquipped(userId: string) {
    return this.repository.getMyEquippedCosmetics(userId);
  }

  async getPlayerEquipped(userId: string, playerId: string) {
    return this.repository.getPlayerEquippedCosmetics(userId, playerId);
  }

  async getAllPlayersMap(userId: string, playerIds?: string[]) {
    return this.repository.getAllPlayersEquippedCosmeticsMap(userId, playerIds);
  }

  async resolveAdminPreview(params: {
    userId: string;
    leagueId: string;
    playerId: string;
    requested: CosmeticPreviewLoadout;
  }) {
    return this.repository.resolveAdminCosmeticsPreview(params);
  }

  async cleanupLegacyPreview(userId: string, fantasySeasonId: string | null) {
    return this.repository.cleanupLegacyCosmeticsPreview(userId, fantasySeasonId);
  }

  async dismissBronzePack(userId: string, fantasySeasonId: string | null) {
    return this.repository.dismissUnopenedBronzePassPack(userId, fantasySeasonId);
  }

  async resetTestClaims(params: {
    userId: string;
    fantasySeasonId: string;
    selectedFantasySeasonId: string | null;
  }) {
    return this.repository.resetTestPassRewardClaims(params);
  }
}
