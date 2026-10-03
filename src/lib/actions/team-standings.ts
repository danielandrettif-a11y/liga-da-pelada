"use server";

import { supabase } from "../supabase";
import { buildSeasonTeamStandings, type SeasonTeamStanding } from "../season-team-standings";
import { getActiveSeason } from "./seasons";

export async function getSeasonTeamStandings(): Promise<SeasonTeamStanding[]> {
  const season = await getActiveSeason();
  if (!season) return buildSeasonTeamStandings([]);

  const { data, error } = await supabase
    .from("rounds")
    .select(`
      id,
      teams (id, name, crest_url),
      matches (
        status,
        team_a_id,
        team_b_id,
        score_a,
        score_b,
        match_events (
          team_id,
          player_id,
          assist_player_id,
          is_own_goal,
          player:player_id (id, name),
          assist_player:assist_player_id (id, name)
        )
      )
    `)
    .eq("season_id", season.id)
    .eq("round_type", "official")
    .eq("status", "finished");

  if (error) {
    console.error("Erro ao montar o Brasileirão do BQ:", error);
    return buildSeasonTeamStandings([]);
  }

  return buildSeasonTeamStandings((data || []) as unknown as Parameters<typeof buildSeasonTeamStandings>[0]);
}
