import { describe, expect, it } from "vitest";
import type { CosmeticSlot } from "@/lib/fantasy/cosmetics";
import { validateEquipmentSlot } from "./equipment";

describe("slot de cosmético da conta", () => {
  it("aceita os oito slots atuais e bloqueia entrada adulterada", () => {
    for (const slot of ["banner", "frame", "title", "aura", "nameplate", "background", "showcase", "pitch"] as CosmeticSlot[]) {
      expect(validateEquipmentSlot(slot)).toBeNull();
    }
    expect(validateEquipmentSlot("other" as CosmeticSlot)).toBe("Tipo de cosmético inválido.");
    expect(validateEquipmentSlot(null as unknown as CosmeticSlot)).toBe("Tipo de cosmético inválido.");
  });
});
