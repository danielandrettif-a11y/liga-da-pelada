import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegisterGoalGateway, SavedGoal } from "../application/register-live-goal";

export class GoalWriteError extends Error {
  constructor(message: string, public readonly uncertain: boolean) {
    super(message);
    this.name = "GoalWriteError";
  }
}

export function supabaseGoalGateway(client: SupabaseClient): RegisterGoalGateway {
  return {
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
      if (error) {
        const message = error.message || "Não foi possível registrar o gol.";
        const uncertain = /^PGRST00[0-2]$/.test(error.code || "")
          || (!error.code && /fetch|network|timeout|connection|socket|aborted/i.test(message));
        throw new GoalWriteError(message, uncertain);
      }
      return data as SavedGoal;
    },
  };
}
