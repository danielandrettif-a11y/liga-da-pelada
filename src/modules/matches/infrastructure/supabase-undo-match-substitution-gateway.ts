import type { SupabaseClient } from "@supabase/supabase-js";
import type { UndoMatchSubstitutionGateway } from "../application/undo-match-substitution";
import { getMatchState } from "./match-scope";

export function supabaseUndoMatchSubstitutionGateway(client: SupabaseClient): UndoMatchSubstitutionGateway {
  return {
    async loadSelectedMatchRoundId(matchId) {
      const match = await getMatchState(client, matchId);
      return match.round_id;
    },
    async isSubstitutionInMatch(substitutionId, matchId) {
      const { data } = await client.from("match_substitutions")
        .select("match_id").eq("id", substitutionId).eq("match_id", matchId).maybeSingle();
      return Boolean(data);
    },
    async undo(substitutionId) {
      const { error } = await client.rpc("undo_last_match_substitution", {
        p_substitution_id: substitutionId,
      });
      if (error) throw new Error(error.message);
    },
  };
}
