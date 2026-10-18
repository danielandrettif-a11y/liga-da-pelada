import { describe, expect, it } from "vitest";
import { buildCosmeticsDashboard, emptyCosmeticsDashboard } from "./build-dashboard";
import type { CosmeticRow, CosmeticsDashboardRows } from "../domain/dashboard-types";

const frame: CosmeticRow = {
  id: "frame-1", slug: "frame-one", slot: "frame", rarity: "rare",
  name: "Moldura nova", description: "Moldura", asset_key: "frame-nova",
};
const legacyFrame: CosmeticRow = {
  ...frame, id: "frame-legacy", slug: "frame-legacy", asset_key: "frame-neon",
};
const banner: CosmeticRow = {
  id: "banner-1", slug: "banner-one", slot: "banner", rarity: "epic",
  name: "Capa", description: "Capa do perfil", asset_key: "banner-1",
};

function input(overrides: Partial<CosmeticsDashboardRows> = {}): CosmeticsDashboardRows {
  return {
    fantasySeasonId: "season-a", isAdmin: false,
    owned: [], catalog: [], rewards: [], choices: [], loadout: null, pass: null, shop: [],
    ...overrides,
  };
}

describe("modelo de leitura dos cosméticos", () => {
  it("mantém um retorno indisponível consistente", () => {
    expect(emptyCosmeticsDashboard).toEqual({
      available: false, seasonId: null, cosmetics: [], previewCatalog: [], rewards: [],
      equipped: {}, canPreviewAll: false,
      shop: {
        totalProgressPoints: 0, bonusPoints: 0, extraPointsEarned: 0,
        spentPoints: 0, balancePoints: 0, isUnlocked: false,
        hasStarted: false, purchasedItems: 0, items: [],
      },
    });
  });

  it("mostra coleção e equipamento da conta mesmo sem temporada da pelada", () => {
    const dashboard = buildCosmeticsDashboard(input({
      fantasySeasonId: null,
      owned: [{ cosmetic_id: frame.id, source_reward_id: null, cosmetic: frame }],
      loadout: { frame_cosmetic_id: frame.id },
    }));
    expect(dashboard.available).toBe(true);
    expect(dashboard.seasonId).toBeNull();
    expect(dashboard.cosmetics).toEqual([{
      id: frame.id, slug: frame.slug, slot: frame.slot, rarity: frame.rarity,
      name: frame.name, description: frame.description, assetKey: frame.asset_key,
    }]);
    expect(dashboard.equipped.frame).toBe(frame.id);
    expect(dashboard.rewards).toEqual([]);
  });

  it("só abre o catálogo administrativo e oculta a moldura antiga da prévia", () => {
    const rows = input({ catalog: [legacyFrame, frame, banner] });
    expect(buildCosmeticsDashboard(rows).previewCatalog).toEqual([]);
    const admin = buildCosmeticsDashboard({ ...rows, isAdmin: true });
    expect(admin.canPreviewAll).toBe(true);
    expect(admin.previewCatalog.map((item) => item.id)).toEqual([frame.id, banner.id]);
  });

  it("prioriza a escolha explícita e recupera resgates antigos pela proveniência", () => {
    const rewards: CosmeticsDashboardRows["rewards"] = [
      {
        id: "reward-explicit", house: 10, reward_key: "house-10", reward_type: "cosmetic_choice",
        card_tier: null, bonus: banner, options: [{ cosmetic: frame }, { cosmetic: banner }],
      },
      {
        id: "reward-legacy", house: 20, reward_key: "house-20", reward_type: "cosmetic_choice",
        card_tier: null, bonus: null, options: [{ cosmetic: frame }],
      },
      {
        id: "reward-empty", house: 30, reward_key: "house-30", reward_type: "card_pack",
        card_tier: "gold", bonus: null, options: null,
      },
      {
        id: "reward-hidden", house: 40, reward_key: "pass-shop-pitch-40", reward_type: "cosmetic_choice",
        card_tier: null, bonus: null, options: [],
      },
    ];
    const dashboard = buildCosmeticsDashboard(input({
      rewards,
      choices: [{ reward_id: "reward-explicit", cosmetic_id: banner.id }],
      owned: [
        { cosmetic_id: frame.id, source_reward_id: "reward-explicit", cosmetic: frame },
        { cosmetic_id: frame.id, source_reward_id: "reward-legacy", cosmetic: frame },
      ],
    }));
    expect(dashboard.rewards.map((reward) => [reward.id, reward.selectedCosmeticId]))
      .toEqual([["reward-explicit", banner.id], ["reward-legacy", frame.id], ["reward-empty", null]]);
    expect(dashboard.rewards[0].bonusCosmetic?.id).toBe(banner.id);
    expect(dashboard.rewards[2].options).toEqual([]);
  });

  it("calcula pontos da loja e mantém apenas itens à venda", () => {
    const dashboard = buildCosmeticsDashboard(input({
      pass: { progress: 40, total_progress_points: 55, shop_bonus_points: 4 },
      rewards: [{
        id: "reward-shop", house: 50, reward_key: "house-50", reward_type: "cosmetic_choice",
        card_tier: null, bonus: null, options: [],
      }],
      shop: [
        { id: "bought", price_points: 6, purchased_at: "2026-10-18", source_reward_id: "reward-shop", cosmetic: banner },
        { id: "available", price_points: 5, purchased_at: null, source_reward_id: "reward-shop", cosmetic: frame },
        { id: "missing-cosmetic", price_points: 3, purchased_at: null, source_reward_id: "reward-shop", cosmetic: null },
      ],
    }));
    expect(dashboard.shop).toMatchObject({
      totalProgressPoints: 55, bonusPoints: 4, extraPointsEarned: 19,
      spentPoints: 6, balancePoints: 13, isUnlocked: true,
      hasStarted: true, purchasedItems: 1,
    });
    expect(dashboard.shop.items).toEqual([{
      id: "available", pricePoints: 5, sourceHouse: 50,
      cosmetic: expect.objectContaining({ id: frame.id }),
    }]);
  });
});
