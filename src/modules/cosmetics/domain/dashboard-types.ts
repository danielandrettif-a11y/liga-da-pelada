import type { CosmeticItem, CosmeticRarity, CosmeticSlot } from "@/lib/fantasy/cosmetics";

export type CosmeticPassReward = {
  id: string; house: number; rewardType: "cosmetic_choice" | "card_pack"; cardTier: "bronze" | "gold" | null;
  selectedCosmeticId: string | null; options: CosmeticItem[]; bonusCosmetic: CosmeticItem | null;
};

export type SeasonPassShopItem = {
  id: string;
  pricePoints: number;
  cosmetic: CosmeticItem;
  sourceHouse: number;
};

export type SeasonPassShop = {
  totalProgressPoints: number;
  bonusPoints: number;
  extraPointsEarned: number;
  spentPoints: number;
  balancePoints: number;
  isUnlocked: boolean;
  hasStarted: boolean;
  purchasedItems: number;
  items: SeasonPassShopItem[];
};

export type CosmeticsDashboard = {
  available: boolean; seasonId: string | null; cosmetics: CosmeticItem[]; rewards: CosmeticPassReward[];
  previewCatalog: CosmeticItem[];
  equipped: Partial<Record<CosmeticSlot, string | null>>; canPreviewAll: boolean;
  shop: SeasonPassShop;
};

export type CosmeticRow = {
  id: string; slug: string; slot: CosmeticSlot; rarity: CosmeticRarity;
  name: string; description: string; asset_key: string;
};

export type CosmeticsDashboardRows = {
  fantasySeasonId: string | null;
  isAdmin: boolean;
  owned: Array<{ cosmetic_id: string | null; source_reward_id: string | null; cosmetic: CosmeticRow | null }>;
  catalog: CosmeticRow[];
  rewards: Array<{
    id: string; house: number; reward_key: string; reward_type: CosmeticPassReward["rewardType"];
    card_tier: CosmeticPassReward["cardTier"]; bonus: CosmeticRow | null;
    options: Array<{ cosmetic: CosmeticRow | null }> | null;
  }>;
  choices: Array<{ reward_id: string; cosmetic_id: string }>;
  loadout: Partial<Record<`${CosmeticSlot}_cosmetic_id`, string | null>> | null;
  pass: { progress?: number | null; total_progress_points?: number | null; shop_bonus_points?: number | null } | null;
  shop: Array<{
    id: string; price_points: number; purchased_at: string | null;
    source_reward_id: string; cosmetic: CosmeticRow | null;
  }>;
};
