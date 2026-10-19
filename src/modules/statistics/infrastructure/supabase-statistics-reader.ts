import type { SupabaseClient } from "@supabase/supabase-js";
import { logStatsQuery } from "@/lib/stats-query-diagnostics";
import type { StatisticsRoundType } from "../domain/player-statistics";

export async function readSeasonPlayerTotals(
  client: SupabaseClient,
  seasonId: string,
  roundType: StatisticsRoundType,
) {
  const startedAt = performance.now();
  const result = await client
    .from("player_season_stats")
    .select("player_id, rounds_count, games, goals, assists, wins, draws, losses, points, ranking_points")
    .eq("season_id", seasonId)
    .eq("round_type", roundType);
  logStatsQuery("roster_totals", "season_view", startedAt, result.data?.length || 0, Boolean(result.error));
  return result;
}

export async function readPlayerRoundHistoryRows(
  client: SupabaseClient,
  playerId: string,
  roundIds: string[],
) {
  const startedAt = performance.now();
  const result = await client
    .from("player_round_stats")
    .select(`
      id,
      player_id,
      round_id,
      games,
      wins,
      draws,
      losses,
      goals,
      assists,
      points,
      ranking_points,
      ranking_position_bonus,
      goalkeeper_games,
      goalkeeper_goals,
      goalkeeper_assists,
      goalkeeper_own_goals,
      goals_conceded,
      clean_sheets,
      own_goals,
      defensive_clean_games,
      defensive_one_goal_games,
      team_goals_conceded,
      ranking_defensive_clean_games,
      ranking_defensive_one_goal_games,
      player_profile_locked,
      rounds (
        number,
        date,
        scoring_snapshot
      )
    `)
    .eq("player_id", playerId)
    .in("round_id", roundIds)
    .order("rounds(number)", { ascending: false });
  logStatsQuery("player_history", "round_stats", startedAt, result.data?.length || 0, Boolean(result.error));
  return result;
}
