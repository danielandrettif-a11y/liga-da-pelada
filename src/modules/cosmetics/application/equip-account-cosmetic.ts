import type { CosmeticSlot } from "@/lib/fantasy/cosmetics";
import { validateEquipmentSlot } from "../domain/equipment";

export type AccountCosmeticEquipmentGateway = {
  equip(slot: CosmeticSlot, cosmeticId: string | null): Promise<string | null>;
};

export async function equipAccountCosmetic(
  slot: CosmeticSlot,
  cosmeticId: string | null,
  gateway: AccountCosmeticEquipmentGateway,
) {
  const validationError = validateEquipmentSlot(slot);
  if (validationError) return { success: false as const, error: validationError };
  const error = await gateway.equip(slot, cosmeticId);
  if (error) return { success: false as const, error };
  return { success: true as const };
}
