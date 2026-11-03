export type CosmeticSlot = "banner" | "frame" | "title" | "aura" | "nameplate" | "background" | "showcase" | "pitch";
export type CosmeticRarity = "common" | "rare" | "epic" | "legendary";

export const VALID_COSMETIC_SLOTS: CosmeticSlot[] = [
  "banner", "frame", "title", "aura", "nameplate", "background", "showcase", "pitch",
];

export type CosmeticItem = {
  id: string; slug: string; slot: CosmeticSlot; rarity: CosmeticRarity;
  name: string; description: string; assetKey: string;
};
export type CosmeticPreviewLoadout = Partial<Record<CosmeticSlot, string | null>>;
export type EquippedCosmeticsSummary = {
  frameKey: string | null; auraKey: string | null; titleName: string | null;
  bannerAssetKey: string | null; nameplateKey: string | null; backgroundAssetKey: string | null;
  showcaseAssetKey: string | null; pitchAssetKey: string | null;
};
export const emptyEquippedSummary = (): EquippedCosmeticsSummary => ({
  frameKey: null, auraKey: null, titleName: null, bannerAssetKey: null,
  nameplateKey: null, backgroundAssetKey: null, showcaseAssetKey: null, pitchAssetKey: null,
});
export function isValidCosmeticSlot(slot: string): slot is CosmeticSlot {
  return VALID_COSMETIC_SLOTS.includes(slot as CosmeticSlot);
}
export function mapEquippedRow(row: any): EquippedCosmeticsSummary {
  return { frameKey: row?.frame_key || null, auraKey: row?.aura_key || null,
    titleName: row?.title_name || null, bannerAssetKey: row?.banner_key || null,
    nameplateKey: row?.nameplate_key || null, backgroundAssetKey: row?.background_key || null,
    showcaseAssetKey: row?.showcase_key || null, pitchAssetKey: row?.pitch_key || null };
}
