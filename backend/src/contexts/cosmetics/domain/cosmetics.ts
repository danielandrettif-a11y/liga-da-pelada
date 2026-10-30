export type CosmeticSlot = "border" | "avatar" | "card_theme" | "goal_effect";

export const VALID_COSMETIC_SLOTS: CosmeticSlot[] = ["border", "avatar", "card_theme", "goal_effect"];

export interface CosmeticItem {
  id: string;
  name: string;
  description?: string | null;
  slot: CosmeticSlot;
  rarity?: "common" | "rare" | "epic" | "legendary";
  assetUrl?: string | null;
  priceCoins?: number;
  isActive: boolean;
}

export interface UserEquippedCosmetics {
  border?: string | null;
  avatar?: string | null;
  card_theme?: string | null;
  goal_effect?: string | null;
}

export interface CosmeticPreviewLoadout {
  border?: string | null;
  avatar?: string | null;
  card_theme?: string | null;
  goal_effect?: string | null;
}

export interface EquippedCosmeticsSummary {
  border: { id: string; name?: string; assetUrl?: string } | null;
  avatar: { id: string; name?: string; assetUrl?: string } | null;
  card_theme: { id: string; name?: string; assetUrl?: string } | null;
  goal_effect: { id: string; name?: string; assetUrl?: string } | null;
}

export function isValidCosmeticSlot(slot: string): slot is CosmeticSlot {
  return VALID_COSMETIC_SLOTS.includes(slot as CosmeticSlot);
}

export function sanitizeEquippedCosmetics(input: Partial<UserEquippedCosmetics>): UserEquippedCosmetics {
  return {
    border: typeof input.border === "string" && input.border.trim() ? input.border.trim() : null,
    avatar: typeof input.avatar === "string" && input.avatar.trim() ? input.avatar.trim() : null,
    card_theme: typeof input.card_theme === "string" && input.card_theme.trim() ? input.card_theme.trim() : null,
    goal_effect: typeof input.goal_effect === "string" && input.goal_effect.trim() ? input.goal_effect.trim() : null,
  };
}

export function buildEquippedSummaryFromItems(
  items: Map<string, { id: string; name?: string; assetUrl?: string; slot: CosmeticSlot }>,
  loadout: UserEquippedCosmetics
): EquippedCosmeticsSummary {
  const getSlotItem = (id?: string | null, expectedSlot?: CosmeticSlot) => {
    if (!id) return null;
    const item = items.get(id);
    if (!item || (expectedSlot && item.slot !== expectedSlot)) return null;
    return { id: item.id, name: item.name, assetUrl: item.assetUrl };
  };

  return {
    border: getSlotItem(loadout.border, "border"),
    avatar: getSlotItem(loadout.avatar, "avatar"),
    card_theme: getSlotItem(loadout.card_theme, "card_theme"),
    goal_effect: getSlotItem(loadout.goal_effect, "goal_effect"),
  };
}
