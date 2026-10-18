import { describe, expect, it, vi } from "vitest";
import type { CosmeticSlot } from "@/lib/fantasy/cosmetics";
import { equipAccountCosmetic } from "./equip-account-cosmetic";

describe("equipar cosmético da conta", () => {
  it("não chama o banco para slot inválido", async () => {
    const gateway = { equip: vi.fn().mockResolvedValue(null) };
    expect(await equipAccountCosmetic("invalid" as CosmeticSlot, "item-1", gateway))
      .toEqual({ success: false, error: "Tipo de cosmético inválido." });
    expect(gateway.equip).not.toHaveBeenCalled();
  });

  it("equipa ou desequipa pelo mesmo RPC e preserva o erro do banco", async () => {
    const gateway = { equip: vi.fn().mockResolvedValue(null) };
    expect(await equipAccountCosmetic("frame", "item-1", gateway)).toEqual({ success: true });
    expect(await equipAccountCosmetic("frame", null, gateway)).toEqual({ success: true });
    expect(gateway.equip).toHaveBeenNthCalledWith(1, "frame", "item-1");
    expect(gateway.equip).toHaveBeenNthCalledWith(2, "frame", null);
    gateway.equip.mockResolvedValueOnce("Cosmetico nao pertence a conta ou ao slot");
    expect(await equipAccountCosmetic("frame", "foreign", gateway)).toEqual({
      success: false, error: "Cosmetico nao pertence a conta ou ao slot",
    });
  });
});
