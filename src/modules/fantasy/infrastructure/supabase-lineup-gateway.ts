import type { SupabaseClient } from "@supabase/supabase-js";
import type { FantasyLineupGateway } from "../application/save-lineup";

export function supabaseFantasyLineupGateway(client: SupabaseClient): FantasyLineupGateway {
  return {
    async loadRound(roundId) {
      const { data, error } = await client.from("fantasy_rounds")
        .select("settings_snapshot, round:round_id(league_id)")
        .eq("round_id", roundId).maybeSingle();
      if (error || !data) return null;
      return {
        leagueId: (data.round as { league_id?: string } | null)?.league_id ?? null,
        playersPerTeam: (data.settings_snapshot as Record<string, unknown> | null)?.players_per_team as number | null ?? null,
      };
    },
    async hasTestSession(roundId) {
      const { data, error } = await client.from("fantasy_test_sessions").select("id")
        .eq("round_id", roundId).maybeSingle();
      if (error) throw new Error(`Não foi possível verificar a rodada de testes: ${error.message}`);
      return Boolean(data);
    },
    async saveTest(input, slots) {
      const { error } = await client.rpc("save_fantasy_test_lineup", {
        p_round_id: input.roundId,
        p_player_ids: input.playerIds,
        p_captain_player_id: input.captainId,
        p_top_scorer_player_id: input.scorerId,
        p_top_assist_player_id: input.assistId,
        p_challenge_player_id: input.challengeId,
        p_lineup_slots: slots,
      });
      return error?.message ?? null;
    },
    async saveRegular(input, slots) {
      const { data, error } = await client.rpc("save_fantasy_lineup_with_reserve", {
        p_round_id: input.roundId,
        p_player_ids: input.playerIds,
        p_captain_player_id: input.captainId,
        p_top_scorer_player_id: input.scorerId,
        p_top_assist_player_id: input.assistId,
        p_challenge_player_id: input.challengeId,
        p_lineup_slots: slots,
        p_reserve_player_id: input.reservePlayerId,
        p_reserve_slot_role: input.reserveRole,
      });
      return { lineupId: data as string | null, error: error?.message ?? null };
    },
  };
}
