import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminPreviewGateway } from "../application/admin-preview";
import type { PreviewCosmeticRow } from "../domain/equipped-summary";

export function supabaseAdminPreviewGateway(client: SupabaseClient): AdminPreviewGateway {
  return {
    async findCosmeticsByIds(ids) {
      const { data, error } = await client.from("fantasy_cosmetics")
        .select("id, slot, asset_key, name").in("id", ids);
      if (error) return null;
      return (data || []) as PreviewCosmeticRow[];
    },
  };
}
