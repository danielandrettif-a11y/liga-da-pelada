import type { SupabaseClient } from "@supabase/supabase-js";
import { getSelectedLeague } from "@/lib/league-context";

export async function getMatchState(client: SupabaseClient, matchId: string) {
  const { data, error } = await client
    .from("matches")
    .select("id, round_id, team_a_id, team_b_id, score_a, score_b, status, timer_started_at, timer_accumulated_seconds, eligibility_elapsed_offset_seconds, duration_seconds, timer_one_minute_alerted_at, timer_thirty_seconds_alerted_at, timer_finished_alerted_at")
    .eq("id", matchId)
    .single();

  if (error || !data) throw new Error("Partida não encontrada");
  const league = await getSelectedLeague();
  if (!league) throw new Error("Selecione uma pelada no lobby.");
  const { data: round } = await client.from("rounds").select("league_id")
    .eq("id", data.round_id).eq("league_id", league.id).maybeSingle();
  if (!round) throw new Error("Partida fora da pelada selecionada.");
  return data;
}
