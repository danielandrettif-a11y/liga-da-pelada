import type { SupabaseClient } from "@supabase/supabase-js";

export async function readFantasyPlayerDetailBase(
  client: SupabaseClient,
  input: { leagueId: string; seasonId: string; fantasySeasonId: string; playerId: string },
) {
  const [membership, price, history, stats, cosmeticProfile] = await Promise.all([
    client
      .from("league_members")
      .select("player_id, player_profile, players!inner(id, name, avatar_url, is_goalkeeper, member_category)")
      .eq("league_id", input.leagueId)
      .eq("player_id", input.playerId)
      .eq("is_active", true)
      .maybeSingle(),
    client
      .from("fantasy_player_prices")
      .select("current_price, total_points, rounds_played")
      .eq("fantasy_season_id", input.fantasySeasonId)
      .eq("player_id", input.playerId)
      .maybeSingle(),
    client
      .from("fantasy_player_price_history")
      .select("id, fantasy_round_id, price_before, price_after, price_change, variation_rate, market_band, round_rank, round_percentile, round_points, goals, assists, wins, games, created_at, fantasy_rounds(round:round_id(number, date))")
      .eq("fantasy_season_id", input.fantasySeasonId)
      .eq("player_id", input.playerId)
      .order("created_at", { ascending: true }),
    client
      .from("player_round_stats")
      .select("round_id, goals, assists, wins, draws, losses, games, own_goals, team_goals_conceded, defensive_clean_games, defensive_one_goal_games, ranking_defensive_clean_games, ranking_defensive_one_goal_games, goalkeeper_games, goalkeeper_goals, goalkeeper_assists, goalkeeper_own_goals, goalkeeper_wins, goalkeeper_draws, goalkeeper_losses, goals_conceded, clean_sheets, points, ranking_points, ranking_position_bonus, player_profile_locked, round:round_id!inner(season_id)")
      .eq("player_id", input.playerId)
      .eq("round.season_id", input.seasonId),
    client
      .from("account_profiles")
      .select("user_id")
      .eq("player_id", input.playerId)
      .maybeSingle(),
  ]);
  return { membership, price, history, stats, cosmeticProfile };
}

export async function readMyFantasyHistoryRows(
  client: SupabaseClient,
  userId: string,
  fantasySeasonId: string,
) {
  return client
    .from("fantasy_lineups")
    .select("id, status, total_points, budget_before, budget_after, created_at, fantasy_rounds!inner(round_id, market_status, fantasy_season_id, rounds(number, date))")
    .eq("user_id", userId)
    .eq("fantasy_rounds.fantasy_season_id", fantasySeasonId)
    .order("created_at", { ascending: false });
}

export async function readFantasyQuickHighlightPrices(client: SupabaseClient, fantasySeasonId: string) {
  const latest = await client.from("fantasy_player_price_history")
    .select("fantasy_round_id")
    .eq("fantasy_season_id", fantasySeasonId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) return { data: null, error: latest.error };
  if (!latest.data) return { data: [], error: null };

  const result = await client.from("fantasy_player_price_history")
    .select("round_points, price_before, price_after, variation_rate, players(name, avatar_url)")
    .eq("fantasy_season_id", fantasySeasonId)
    .eq("fantasy_round_id", latest.data.fantasy_round_id);
  if (result.error) return { data: null, error: result.error };
  return {
    data: (result.data || []).map((row) => ({
      ...row,
      current_price: row.price_after,
      last_round_points: row.round_points,
      last_price_change: Number(row.price_after) - Number(row.price_before),
    })),
    error: null,
  };
}
