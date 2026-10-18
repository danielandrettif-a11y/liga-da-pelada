import { isLegacyFrameAsset, type CosmeticItem } from "@/lib/fantasy/cosmetics";
import type { CosmeticsDashboard, CosmeticsDashboardRows, CosmeticRow, SeasonPassShop } from "../domain/dashboard-types";

const emptyShop: SeasonPassShop = {
  totalProgressPoints: 0, bonusPoints: 0, extraPointsEarned: 0, spentPoints: 0, balancePoints: 0,
  isUnlocked: false, hasStarted: false, purchasedItems: 0, items: [],
};

export const emptyCosmeticsDashboard: CosmeticsDashboard = {
  available: false, seasonId: null, cosmetics: [], previewCatalog: [], rewards: [],
  equipped: {}, canPreviewAll: false, shop: emptyShop,
};

function mapCosmetic(row: CosmeticRow): CosmeticItem {
  return {
    id: row.id, slug: row.slug, slot: row.slot, rarity: row.rarity,
    name: row.name, description: row.description, assetKey: row.asset_key,
  };
}

export function buildCosmeticsDashboard(rows: CosmeticsDashboardRows): CosmeticsDashboard {
  const choices = new Map(rows.choices.map((row) => [row.reward_id, row.cosmetic_id]));
  const ownedByReward = new Map<string, Set<string>>();
  for (const row of rows.owned) {
    if (!row.source_reward_id || !row.cosmetic_id) continue;
    const cosmetics = ownedByReward.get(row.source_reward_id) || new Set<string>();
    cosmetics.add(row.cosmetic_id);
    ownedByReward.set(row.source_reward_id, cosmetics);
  }
  const loadout = rows.loadout || {};
  const rewardHouseById = new Map(rows.rewards.map((row) => [row.id, Number(row.house || 0)]));
  const totalProgressPoints = Number(rows.pass?.total_progress_points || rows.pass?.progress || 0);
  const bonusPoints = Number(rows.pass?.shop_bonus_points || 0);
  const extraPointsEarned = Math.max(0, totalProgressPoints - 40) + bonusPoints;
  const spentPoints = rows.shop.filter((row) => Boolean(row.purchased_at))
    .reduce((total, row) => total + Number(row.price_points || 0), 0);
  const shopItems = rows.shop.filter((row) => !row.purchased_at && row.cosmetic)
    .map((row) => ({
      id: row.id,
      pricePoints: Number(row.price_points || 0),
      cosmetic: mapCosmetic(row.cosmetic!),
      sourceHouse: rewardHouseById.get(row.source_reward_id) || 0,
    }));

  return {
    available: true, seasonId: rows.fantasySeasonId, canPreviewAll: rows.isAdmin,
    cosmetics: rows.owned.map((row) => row.cosmetic).filter((item): item is CosmeticRow => Boolean(item)).map(mapCosmetic),
    previewCatalog: rows.isAdmin
      ? rows.catalog.map(mapCosmetic).filter((item) => !isLegacyFrameAsset(item.slot === "frame" ? item.assetKey : null))
      : [],
    rewards: rows.rewards.filter((row) => row.reward_key !== "pass-shop-pitch-40").map((row) => ({
      id: row.id, house: Number(row.house), rewardType: row.reward_type, cardTier: row.card_tier,
      selectedCosmeticId: choices.get(row.id) || (row.options || [])
        .map((option) => option.cosmetic?.id)
        .find((id) => id && ownedByReward.get(row.id)?.has(id)) || null,
      bonusCosmetic: row.bonus ? mapCosmetic(row.bonus) : null,
      options: (row.options || []).map((option) => option.cosmetic)
        .filter((item): item is CosmeticRow => Boolean(item)).map(mapCosmetic),
    })),
    equipped: {
      banner: loadout.banner_cosmetic_id || null, frame: loadout.frame_cosmetic_id || null,
      title: loadout.title_cosmetic_id || null, aura: loadout.aura_cosmetic_id || null,
      nameplate: loadout.nameplate_cosmetic_id || null, background: loadout.background_cosmetic_id || null,
      showcase: loadout.showcase_cosmetic_id || null, pitch: loadout.pitch_cosmetic_id || null,
    },
    shop: {
      totalProgressPoints, bonusPoints, extraPointsEarned, spentPoints,
      balancePoints: Math.max(0, extraPointsEarned - spentPoints),
      isUnlocked: Number(rows.pass?.progress || 0) >= 40,
      hasStarted: rows.shop.length > 0,
      purchasedItems: rows.shop.filter((row) => Boolean(row.purchased_at)).length,
      items: shopItems,
    },
  };
}
