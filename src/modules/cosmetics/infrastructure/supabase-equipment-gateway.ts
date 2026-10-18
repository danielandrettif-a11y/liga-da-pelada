import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountCosmeticEquipmentGateway } from "../application/equip-account-cosmetic";

export function supabaseAccountCosmeticEquipmentGateway(client: SupabaseClient): AccountCosmeticEquipmentGateway {
  return {
    async equip(slot, cosmeticId) {
      const { error } = await client.rpc("equip_account_cosmetic", {
        p_slot: slot, p_cosmetic_id: cosmeticId,
      });
      return error?.message ?? null;
    },
  };
}
