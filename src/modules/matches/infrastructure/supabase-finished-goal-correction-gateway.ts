import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FinishedGoalCorrectionGateway,
  FinishedGoalMutation,
} from "../application/correct-finished-goal";
import { getMatchState } from "./match-scope";

export function supabaseFinishedGoalCorrectionGateway(client: SupabaseClient): FinishedGoalCorrectionGateway {
  return {
    async loadEventScope(eventId) {
      const { data: event } = await client.from("match_events").select("match_id")
        .eq("id", eventId).maybeSingle();
      if (!event) throw new Error("Gol não encontrado.");
      const match = await getMatchState(client, event.match_id);
      return { matchId: match.id, roundId: match.round_id };
    },
    async loadMatchScope(matchId) {
      const match = await getMatchState(client, matchId);
      return { matchId: match.id, roundId: match.round_id };
    },
    async removeGoal(eventId) {
      const { data, error } = await client.rpc("correct_finished_goal", { p_event_id: eventId });
      if (error) throw new Error(error.message);
      return data as FinishedGoalMutation;
    },
    async editGoal(eventId, playerId, assistPlayerId) {
      const { data, error } = await client.rpc("correct_finished_goal_event", {
        p_event_id: eventId,
        p_player_id: playerId,
        p_assist_player_id: assistPlayerId,
      });
      if (error) throw new Error(error.message);
      return data as FinishedGoalMutation;
    },
    async addGoal(matchId, teamId, playerId, assistPlayerId) {
      const { data, error } = await client.rpc("add_finished_goal_event", {
        p_match_id: matchId,
        p_team_id: teamId,
        p_player_id: playerId,
        p_assist_player_id: assistPlayerId,
      });
      if (error) throw new Error(error.message);
      return data as FinishedGoalMutation;
    },
    async hasFantasyRound(roundId) {
      const { data, error } = await client.from("fantasy_rounds").select("id")
        .eq("round_id", roundId).maybeSingle();
      if (error) throw new Error(`Não foi possível localizar a rodada do Cartola: ${error.message}`);
      return Boolean(data);
    },
    async reprocessFantasy(roundId) {
      const { error } = await client.rpc("reprocess_fantasy_from_round", { p_round_id: roundId });
      if (error) throw new Error(`O Cartola precisa ser reprocessado: ${error.message}`);
    },
  };
}
