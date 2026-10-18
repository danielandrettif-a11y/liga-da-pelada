import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoalkeeperGateway } from "../application/manage-goalkeepers";
import { normalizeGoalkeeperElapsedHint } from "../domain/goalkeeper-management";
import { getMatchState } from "./match-scope";

export function supabaseGoalkeeperGateway(client: SupabaseClient): GoalkeeperGateway {
  return {
    async findRoundTeam(roundId, teamId, leagueId) {
      const { data, error } = await client.from("teams")
        .select("id, round_id, round:round_id!inner(league_id)")
        .eq("id", teamId).eq("round_id", roundId).eq("round.league_id", leagueId).maybeSingle();
      return { team: data ? { roundId: data.round_id } : null, error: error?.message || null };
    },
    async isTeamPlayer(teamId, playerId) {
      const { data } = await client.from("team_players")
        .select("player_id").eq("team_id", teamId).eq("player_id", playerId).maybeSingle();
      return Boolean(data);
    },
    async setFixedGoalkeeper(teamId, playerId) {
      const { error } = await client.from("teams")
        .update({ fixed_goalkeeper_player_id: playerId }).eq("id", teamId);
      if (error) throw new Error(error.message);
    },
    async loadMatch(matchId) {
      const match = await getMatchState(client, matchId);
      return {
        roundId: match.round_id,
        status: match.status,
        teamAId: match.team_a_id,
        teamBId: match.team_b_id,
      };
    },
    async changeMatchGoalkeeper(matchId, teamId, playerId, elapsedSeconds) {
      // A dica de tempo do navegador não define o tempo oficial. A RPC usa
      // o relógio do servidor sob o mesmo lock usado para registrar gols.
      const { data, error } = await client.rpc("change_match_goalkeeper", {
        p_match_id: matchId,
        p_team_id: teamId,
        p_player_id: playerId,
        p_elapsed_seconds: normalizeGoalkeeperElapsedHint(elapsedSeconds),
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown> | null;
    },
  };
}
