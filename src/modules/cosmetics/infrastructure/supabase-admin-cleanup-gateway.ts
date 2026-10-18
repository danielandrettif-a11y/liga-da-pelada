import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminCosmeticsCleanupGateway } from "../application/admin-cleanup";

export async function readFantasySeasonId(
  client: SupabaseClient,
  leagueId: string,
  seasonId: string,
): Promise<string | null> {
  const { data } = await client.from("fantasy_seasons").select("id")
    .eq("season_id", seasonId).eq("league_id", leagueId).maybeSingle();
  return data?.id || null;
}

export function supabaseAdminCosmeticsCleanupGateway(client: SupabaseClient): AdminCosmeticsCleanupGateway {
  return {
    async cleanupPreview(fantasySeasonId) {
      const { data, error } = await client.rpc("cleanup_my_cosmetics_preview", {
        p_fantasy_season_id: fantasySeasonId,
      });
      return { count: Number(data || 0), error: error?.message || null };
    },
    async dismissBronzePack(fantasySeasonId) {
      const { data, error } = await client.rpc("dismiss_my_unopened_bronze_pass_pack", {
        p_fantasy_season_id: fantasySeasonId,
      });
      return { count: Number(data || 0), error: error?.message || null };
    },
    async resetTestClaims(fantasySeasonId) {
      const { data, error } = await client.rpc("reset_my_test_pass_cosmetic_claims", {
        p_fantasy_season_id: fantasySeasonId,
      });
      return { count: Number(data || 0), error: error?.message || null };
    },
  };
}
