import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegisterGoalGateway, SavedGoal } from "../application/register-live-goal";
import { getMatchState } from "./match-scope";

export function supabaseGoalGateway(client: SupabaseClient): RegisterGoalGateway {
  return {
    async ensureMatchSelected(matchId) {
      await getMatchState(client, matchId);
    },
    async saveGoal(input) {
      const { data, error } = await client.rpc("register_goal", {
        p_match_id: input.match_id,
        p_player_id: input.player_id,
        p_team_id: input.team_id,
        p_assist_player_id: input.assist_player_id || null,
        p_minute: input.minute ?? null,
        p_idempotency_key: input.idempotency_key || null,
        p_is_own_goal: Boolean(input.is_own_goal),
      });
      if (error) throw new Error(error.message);
      return data as SavedGoal;
    },
  };
}
