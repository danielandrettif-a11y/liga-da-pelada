-- Entrega ao mercado todos os scouts específicos do período em que o atleta
-- atuou no gol. A interface usa estes campos para separar a visão acumulada da
-- visão da última rodada sem misturar a pontuação de linha.

CREATE OR REPLACE FUNCTION public.get_fantasy_market_read_model(
  p_fantasy_season_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'prices', COALESCE((
      SELECT jsonb_agg(to_jsonb(price))
      FROM public.fantasy_player_prices price
      WHERE price.fantasy_season_id = p_fantasy_season_id
    ), '[]'::jsonb),
    'stats', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'round_id', stats.round_id,
        'player_id', stats.player_id,
        'goals', stats.goals,
        'assists', stats.assists,
        'wins', stats.wins,
        'draws', stats.draws,
        'losses', stats.losses,
        'own_goals', stats.own_goals,
        'games', stats.games,
        'goalkeeper_games', stats.goalkeeper_games,
        'goalkeeper_goals', stats.goalkeeper_goals,
        'goalkeeper_assists', stats.goalkeeper_assists,
        'goalkeeper_own_goals', stats.goalkeeper_own_goals,
        'goalkeeper_wins', stats.goalkeeper_wins,
        'goalkeeper_draws', stats.goalkeeper_draws,
        'goalkeeper_losses', stats.goalkeeper_losses,
        'goals_conceded', stats.goals_conceded,
        'clean_sheets', stats.clean_sheets,
        'defensive_clean_games', stats.defensive_clean_games,
        'defensive_one_goal_games', stats.defensive_one_goal_games,
        'team_goals_conceded', stats.team_goals_conceded,
        'ranking_points', stats.ranking_points
      ))
      FROM public.player_round_stats stats
      JOIN public.rounds round_item
        ON round_item.id = stats.round_id
       AND round_item.round_type = 'official'
      JOIN public.fantasy_seasons fantasy_season
        ON fantasy_season.season_id = round_item.season_id
      WHERE fantasy_season.id = p_fantasy_season_id
    ), '[]'::jsonb),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', player.id,
        'name', player.name,
        'avatar_url', player.avatar_url,
        'player_profile', player.player_profile,
        'overall_traits', player.overall_traits,
        'is_goalkeeper', player.is_goalkeeper,
        'member_category', player.member_category,
        'is_selectable', player.is_selectable,
        'is_competitive_profile_complete', player.is_competitive_profile_complete
      ) ORDER BY player.name)
      FROM public.players player
      WHERE player.is_competitive_profile_complete = true
    ), '[]'::jsonb),
    'history', COALESCE((
      SELECT jsonb_agg(to_jsonb(history) ORDER BY history.created_at DESC)
      FROM public.fantasy_player_price_history history
      WHERE history.fantasy_season_id = p_fantasy_season_id
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_fantasy_market_read_model(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fantasy_market_read_model(UUID) TO authenticated;
