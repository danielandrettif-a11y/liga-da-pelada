import type { SupabaseClient } from "@supabase/supabase-js";
import { suggestNextMatchRotation } from "@/lib/next-match";

export async function buildQuickStartSuggestion(client: SupabaseClient, roundId: string, matchId: string) {
  const { data: round, error } = await client
    .from("rounds")
    .select(`
      id, number, formation_mode, arrival_order_enabled, target_players_per_team,
      round_players (
        player_id,
        availability_status,
        attendance_status
      ),
      teams (
        id, name, color, crest_url, position, captain_player_id, fixed_goalkeeper_player_id,
        team_players (
          player_id,
          goalkeeper_order,
          loan_order,
          players (id, name, is_goalkeeper)
        )
      ),
      matches (
        id, team_a_id, team_b_id, score_a, score_b, match_order, created_at, started_at,
        match_players (player_id, team_id, original_team_id),
        match_goalkeepers (player_id, team_id, rotation_order)
      ),
      league:league_id (players_per_team)
    `)
    .eq("id", roundId)
    .single();

  if (error || !round) {
    console.error("Erro ao preparar início rápido:", error);
    return null;
  }

  const teams = [...(round.teams || [])].sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0));
  const matches = [...(round.matches || [])].sort((a: any, b: any) =>
    Number(a.match_order || 0) - Number(b.match_order || 0)
      || String(a.created_at || "").localeCompare(String(b.created_at || "")),
  );
  const rotation = suggestNextMatchRotation(teams, matches, matchId);
  if (!rotation) return null;

  return { round: { ...round, teams, matches }, rotation };
}
