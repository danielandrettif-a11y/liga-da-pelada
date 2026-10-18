import type { CosmeticSlot } from "@/lib/fantasy/cosmetics";

const VALID_SLOTS = new Set<CosmeticSlot>([
  "banner", "frame", "title", "aura", "nameplate", "background", "showcase", "pitch",
]);

export function validateEquipmentSlot(slot: CosmeticSlot): string | null {
  return typeof slot === "string" && VALID_SLOTS.has(slot)
    ? null
    : "Tipo de cosmético inválido.";
}
