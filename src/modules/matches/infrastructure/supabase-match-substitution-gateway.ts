import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchSubstitutionGateway } from "../application/substitute-match-player";
import { getMatchState } from "./match-scope";

export function supabaseMatchSubstitutionGateway(client: SupabaseClient): MatchSubstitutionGateway {
  return {
    async loadSelectedMatchRoundId(matchId) {
      const match = await getMatchState(client, matchId);
      return match.round_id;
    },
    async loadIncomingContext(matchId, playerId) {
      const { data: incoming, error } = await client.from("matches")
        .select("round:round_id (formation_mode, round_players!inner(player_id, attendance_status))")
        .eq("id", matchId)
        .eq("round.round_players.player_id", playerId)
        .single();
      if (error || !incoming) {
        return { found: false, formationMode: null, attendanceStatus: null };
      }
      const round = Array.isArray(incoming.round) ? incoming.round[0] : incoming.round;
      const entry = (round as { round_players?: Array<{ player_id: string; attendance_status: string | null }> } | null)
        ?.round_players?.find((item) => item.player_id === playerId);
      return {
        found: true,
        formationMode: (round as { formation_mode?: string | null } | null)?.formation_mode || null,
        attendanceStatus: entry?.attendance_status || null,
      };
    },
    async substitute(input) {
      const { data, error } = await client.rpc("substitute_match_player", {
        p_match_id: input.match_id,
        p_team_id: input.team_id,
        p_player_out_id: input.player_out_id,
        p_player_in_id: input.player_in_id || null,
        p_reason: input.reason,
        p_mark_injured: Boolean(input.mark_injured),
      });
      if (error) throw new Error(error.message);
      return data;
    },
  };
}
