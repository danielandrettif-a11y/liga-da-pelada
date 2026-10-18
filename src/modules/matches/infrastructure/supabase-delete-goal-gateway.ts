import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeleteLiveGoalGateway, DeletedLiveGoal } from "../application/delete-live-goal";
import { getMatchState } from "./match-scope";

export function supabaseDeleteGoalGateway(client: SupabaseClient): DeleteLiveGoalGateway {
  return {
    async ensureMatchSelected(matchId) {
      await getMatchState(client, matchId);
    },
    async eventBelongsToMatch(eventId, matchId) {
      const { data } = await client.from("match_events").select("match_id")
        .eq("id", eventId).eq("match_id", matchId).maybeSingle();
      return Boolean(data);
    },
    async deleteGoal(eventId, matchId) {
      const { data, error } = await client.rpc("delete_match_event", {
        p_event_id: eventId,
        p_match_id: matchId,
      });
      if (error) throw new Error(error.message);
      return data as DeletedLiveGoal;
    },
  };
}
