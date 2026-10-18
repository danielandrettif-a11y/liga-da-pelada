import { describe, expect, it, vi } from "vitest";
import { supabaseAccountCosmeticEquipmentGateway } from "./supabase-equipment-gateway";

describe("gateway de equipamento global", () => {
  it("envia o slot e o item à RPC da conta, inclusive null para desequipar", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ error: null }) };
    const gateway = supabaseAccountCosmeticEquipmentGateway(
      client as unknown as Parameters<typeof supabaseAccountCosmeticEquipmentGateway>[0],
    );
    expect(await gateway.equip("pitch", "item-1")).toBeNull();
    expect(await gateway.equip("pitch", null)).toBeNull();
    expect(client.rpc).toHaveBeenNthCalledWith(1, "equip_account_cosmetic", {
      p_slot: "pitch", p_cosmetic_id: "item-1",
    });
    expect(client.rpc).toHaveBeenNthCalledWith(2, "equip_account_cosmetic", {
      p_slot: "pitch", p_cosmetic_id: null,
    });
    client.rpc.mockResolvedValueOnce({ error: { message: "sem permissão" } });
    expect(await gateway.equip("frame", "foreign")).toBe("sem permissão");
  });
});
