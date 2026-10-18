import type { CosmeticSlot } from "@/lib/fantasy/cosmetics";
import { validateEquipmentSlot } from "../domain/equipment";
import type { CosmeticPreviewLoadout, EquippedCosmeticsSummary, PreviewCosmeticRow } from "../domain/equipped-summary";

export type AdminPreviewGateway = {
  findCosmeticsByIds(ids: string[]): Promise<PreviewCosmeticRow[] | null>;
};

type PreviewInput = {
  isAdmin: boolean;
  ownPlayerId: string | null;
  playerId: string;
  requested: CosmeticPreviewLoadout;
};

export async function resolveAdminCosmeticsPreview(
  input: PreviewInput,
  gateway: AdminPreviewGateway,
): Promise<EquippedCosmeticsSummary | null> {
  if (!input.isAdmin || !input.ownPlayerId || input.ownPlayerId !== input.playerId) return null;
  if (!input.requested || typeof input.requested !== "object" || Array.isArray(input.requested)) return null;

  const selections = (Object.entries(input.requested) as Array<[CosmeticSlot, unknown]>)
    .filter(([slot, cosmeticId]) => !validateEquipmentSlot(slot) && typeof cosmeticId === "string" && cosmeticId.length > 0)
    .map(([slot, cosmeticId]) => [slot, cosmeticId as string] as const);
  if (!selections.length) return null;

  const items = await gateway.findCosmeticsByIds([...new Set(selections.map(([, cosmeticId]) => cosmeticId))]);
  if (!items) return null;
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const preview: EquippedCosmeticsSummary = {
    frameKey: null, auraKey: null, titleName: null, bannerAssetKey: null,
    nameplateKey: null, backgroundAssetKey: null, showcaseAssetKey: null, pitchAssetKey: null,
  };

  for (const [slot, cosmeticId] of selections) {
    const item = itemsById.get(cosmeticId);
    if (!item || item.slot !== slot) continue;
    if (slot === "frame") preview.frameKey = item.asset_key;
    if (slot === "aura") preview.auraKey = item.asset_key;
    if (slot === "title") preview.titleName = item.name;
    if (slot === "banner") preview.bannerAssetKey = item.asset_key;
    if (slot === "nameplate") preview.nameplateKey = item.asset_key;
    if (slot === "background") preview.backgroundAssetKey = item.asset_key;
    if (slot === "showcase") preview.showcaseAssetKey = item.asset_key;
    if (slot === "pitch") preview.pitchAssetKey = item.asset_key;
  }

  return preview;
}
