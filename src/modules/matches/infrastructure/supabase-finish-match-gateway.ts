import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinishedMatch, FinishMatchGateway } from "../application/finish-match";
import { getMatchState } from "./match-scope";
import { buildQuickStartSuggestion } from "./quick-start-suggestion";

export function supabaseFinishMatchGateway(client: SupabaseClient): FinishMatchGateway<Awaited<ReturnType<typeof buildQuickStartSuggestion>>> {
  return {
    async loadCurrent(matchId) {
      const state = await getMatchState(client, matchId);
      return {
        roundId: state.round_id,
        status: state.status,
        timerAccumulatedSeconds: state.timer_accumulated_seconds,
        timerStartedAt: state.timer_started_at,
        eligibilityElapsedOffsetSeconds: state.eligibility_elapsed_offset_seconds,
      };
    },
    async markFinished(matchId, elapsedSeconds) {
      const { data, error } = await client.from("matches")
        .update({
          status: "finished",
          finished_at: new Date().toISOString(),
          timer_started_at: null,
          timer_accumulated_seconds: elapsedSeconds,
        })
        .eq("id", matchId)
        .neq("status", "finished")
        .select(`
          id,
          round_id,
          score_a,
          score_b,
          team_a:team_a_id (name),
          team_b:team_b_id (name)
        `)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as FinishedMatch | null;
    },
    async setExitTimes(matchId, officialElapsedSeconds) {
      const { error } = await client.from("match_players")
        .update({ left_elapsed_seconds: officialElapsedSeconds })
        .eq("match_id", matchId)
        .is("left_elapsed_seconds", null);
      if (error) throw new Error(error.message);
    },
    async deactivateParticipants(matchId) {
      const { error } = await client.from("match_players")
        .update({ is_active: false })
        .eq("match_id", matchId)
        .eq("is_active", true);
      if (error) throw new Error(error.message);
    },
    buildQuickStart(roundId, matchId) {
      return buildQuickStartSuggestion(client, roundId, matchId);
    },
  };
}
