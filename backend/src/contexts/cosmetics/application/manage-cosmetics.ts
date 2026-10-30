import {
  type CosmeticSlot,
  type UserEquippedCosmetics,
  type CosmeticPreviewLoadout,
  type EquippedCosmeticsSummary,
  isValidCosmeticSlot,
  sanitizeEquippedCosmetics,
} from "../domain/cosmetics.js";

export interface CosmeticsRepository {
  getCosmeticsDashboard(params: {
    userId: string;
    leagueId: string;
    seasonId: string | null;
    isAdmin: boolean;
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

  getMyEquippedCosmetics(userId: string): Promise<EquippedCosmeticsSummary | null>;

  getPlayerEquippedCosmetics(playerId: string): Promise<EquippedCosmeticsSummary | null>;

  getAllPlayersEquippedCosmeticsMap(playerIds?: string[]): Promise<Record<string, EquippedCosmeticsSummary>>;

  resolveAdminCosmeticsPreview(params: {
    isAdmin: boolean;
    ownPlayerId: string | null;
    playerId: string;
    requested: CosmeticPreviewLoadout;
  }): Promise<EquippedCosmeticsSummary | null>;

  cleanupLegacyCosmeticsPreview(fantasySeasonId: string | null): Promise<{ success: boolean; error?: string }>;

  dismissUnopenedBronzePassPack(fantasySeasonId: string | null): Promise<{ success: boolean; error?: string }>;

  resetTestPassRewardClaims(params: {
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
    isAdmin: boolean;
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

  async getPlayerEquipped(playerId: string) {
    return this.repository.getPlayerEquippedCosmetics(playerId);
  }

  async getAllPlayersMap(playerIds?: string[]) {
    return this.repository.getAllPlayersEquippedCosmeticsMap(playerIds);
  }

  async resolveAdminPreview(params: {
    isAdmin: boolean;
    ownPlayerId: string | null;
    playerId: string;
    requested: CosmeticPreviewLoadout;
  }) {
    return this.repository.resolveAdminCosmeticsPreview(params);
  }

  async cleanupLegacyPreview(fantasySeasonId: string | null) {
    return this.repository.cleanupLegacyCosmeticsPreview(fantasySeasonId);
  }

  async dismissBronzePack(fantasySeasonId: string | null) {
    return this.repository.dismissUnopenedBronzePassPack(fantasySeasonId);
  }

  async resetTestClaims(params: {
    fantasySeasonId: string;
    selectedFantasySeasonId: string | null;
  }) {
    return this.repository.resetTestPassRewardClaims(params);
  }
}
