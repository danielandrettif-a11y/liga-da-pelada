import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FantasyAdminCommandGateway,
  FantasyReprocessMode,
  FantasyTestSessionOperation,
} from "../application/admin-commands";

const TEST_SESSION_RPC: Record<FantasyTestSessionOperation, string> = {
  create: "create_fantasy_test_session",
  process: "process_fantasy_test_round",
  reset: "reset_fantasy_test_session",
};

export function supabaseFantasyAdminCommandGateway(
  client: SupabaseClient,
  rebuildRoundStats: FantasyAdminCommandGateway["rebuildRoundStats"],
): FantasyAdminCommandGateway {
  return {
    async updateSettings(leagueId, payload) {
      const { error } = await client.rpc("update_fantasy_settings_for_league", {
        p_league_id: leagueId,
        p_settings: payload,
      });
      return error?.message || null;
    },
    async findFantasySeasonId(seasonId, leagueId) {
      const { data } = await client.from("fantasy_seasons").select("id")
        .eq("season_id", seasonId).eq("league_id", leagueId).maybeSingle();
      return data?.id || null;
    },
    async previewMarket(fantasySeasonId) {
      const { data, error } = await client.rpc("preview_fantasy_market_v11", {
        p_fantasy_season_id: fantasySeasonId,
      });
      return { data, error: error?.message || null };
    },
    async roundBelongsToLeague(roundId, leagueId) {
      const { data } = await client.from("rounds").select("id")
        .eq("id", roundId).eq("league_id", leagueId).maybeSingle();
      return Boolean(data);
    },
    rebuildRoundStats,
    async reprocessRound(roundId, mode: FantasyReprocessMode) {
      const rpc = mode === "current" ? "reprocess_fantasy_with_current_rules" : "reprocess_fantasy_from_round";
      const { data, error } = await client.rpc(rpc, { p_round_id: roundId });
      const result = data as { affected_finished_rounds?: number } | null;
      return { affectedRounds: Number(result?.affected_finished_rounds || 1), error: error?.message || null };
    },
    async repairLegacyLineups() {
      const { data, error } = await client.rpc("repair_legacy_saved_fantasy_lineups");
      return {
        repaired: Number(data?.repaired || 0),
        lineups: Array.isArray(data?.lineups) ? data.lineups : [],
        error: error?.message || null,
      };
    },
    async changeTestSession(roundId, operation) {
      const { error } = await client.rpc(TEST_SESSION_RPC[operation], { p_round_id: roundId });
      return error?.message || null;
    },
  };
}
