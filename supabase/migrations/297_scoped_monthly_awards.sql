-- Os premios mensais sao calculados dentro da pelada, nao sobre todas as
-- rodadas do aplicativo. As assinaturas antigas sem league_id sao fechadas.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_monthly_award_winners_for_league(
  p_league_id uuid, p_period_start date DEFAULT NULL
)
RETURNS TABLE (
  award_type text, period_start date, points numeric, rounds_played integer,
  metric_value numeric, is_final boolean, player_id uuid, player_name text,
  avatar_url text, goalkeeper_games integer, goals_conceded integer,
  clean_sheets integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH official_rounds AS (
    SELECT round_item.id, date_trunc('month', round_item.date)::date AS month_start
    FROM public.rounds round_item
    JOIN public.leagues league ON league.id = round_item.league_id AND league.is_active
    WHERE round_item.league_id = p_league_id
      AND public.is_league_member(p_league_id)
      AND round_item.round_type = 'official' AND round_item.status = 'finished'
      AND (p_period_start IS NULL
        OR date_trunc('month', round_item.date)::date = p_period_start)
  ), eligible_stats AS (
    SELECT round_item.month_start, stats.*
    FROM official_rounds round_item
    JOIN public.player_round_stats stats ON stats.round_id = round_item.id
    JOIN public.players player ON player.id = stats.player_id
    JOIN public.league_members member ON member.league_id = p_league_id
      AND member.player_id = stats.player_id
    WHERE player.is_selectable AND player.member_category = 'player'
  ), position_totals AS (
    SELECT month_start, player_id, player_profile_locked AS profile,
      sum(points)::numeric AS total_points, count(DISTINCT round_id)::integer AS rounds,
      sum(wins)::integer AS wins, sum(draws)::integer AS draws,
      sum(goals)::integer AS goals, sum(assists)::integer AS assists
    FROM eligible_stats
    WHERE games > 0 AND player_profile_locked IN ('defensive','midfield','offensive')
    GROUP BY month_start, player_id, player_profile_locked
  ), position_ranked AS (
    SELECT totals.*, row_number() OVER (
      PARTITION BY month_start, profile
      ORDER BY total_points DESC, wins DESC, draws DESC, goals DESC,
        assists DESC, rounds ASC, player_id
    ) AS position FROM position_totals totals
  ), scout_totals AS (
    SELECT month_start, player_id, sum(points)::numeric AS total_points,
      sum(COALESCE(ranking_points, points))::numeric AS ranked_points,
      count(DISTINCT round_id)::integer AS rounds,
      sum(goals)::integer AS goals, sum(assists)::integer AS assists,
      sum(wins)::integer AS wins, sum(draws)::integer AS draws
    FROM eligible_stats WHERE games > 0 GROUP BY month_start, player_id
  ), scorer_ranked AS (
    SELECT totals.*, row_number() OVER (
      PARTITION BY month_start ORDER BY goals DESC, wins DESC, draws DESC,
        assists DESC, total_points DESC, player_id
    ) AS position FROM scout_totals totals WHERE goals > 0
  ), assist_ranked AS (
    SELECT totals.*, row_number() OVER (
      PARTITION BY month_start ORDER BY assists DESC, wins DESC, draws DESC,
        goals DESC, total_points DESC, player_id
    ) AS position FROM scout_totals totals WHERE assists > 0
  ), goalkeeper_totals AS (
    SELECT month_start, player_id,
      sum(COALESCE(ranking_points, points))::numeric AS total_points,
      count(DISTINCT round_id)::integer AS rounds,
      sum(goalkeeper_games)::integer AS keeper_games,
      sum(goals_conceded)::integer AS conceded,
      sum(clean_sheets)::integer AS sheets,
      sum(goalkeeper_wins)::integer AS keeper_wins
    FROM eligible_stats WHERE goalkeeper_games > 0
    GROUP BY month_start, player_id HAVING sum(goalkeeper_games) >= 4
  ), goalkeeper_ranked AS (
    SELECT totals.*, row_number() OVER (
      PARTITION BY month_start
      ORDER BY conceded::numeric / NULLIF(keeper_games, 0) ASC,
        sheets::numeric / NULLIF(keeper_games, 0) DESC,
        keeper_games DESC, keeper_wins DESC, total_points DESC, player_id
    ) AS position FROM goalkeeper_totals totals
  ), manager_totals AS (
    SELECT round_item.month_start, profile.player_id,
      sum(lineup.total_points)::numeric AS total_points,
      count(*)::integer AS rounds,
      max(lineup.total_points)::numeric AS best_round,
      COALESCE(scout.wins, 0)::integer AS wins,
      COALESCE(scout.draws, 0)::integer AS draws
    FROM official_rounds round_item
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id = round_item.id
    JOIN public.fantasy_seasons fantasy_season
      ON fantasy_season.id = fantasy_round.fantasy_season_id
      AND fantasy_season.league_id = p_league_id
    JOIN public.fantasy_lineups lineup ON lineup.fantasy_round_id = fantasy_round.id
    JOIN public.account_profiles profile ON profile.user_id = lineup.user_id
    JOIN public.league_members member ON member.league_id = p_league_id
      AND member.player_id = profile.player_id AND member.user_id = lineup.user_id
    JOIN public.players player ON player.id = profile.player_id
    LEFT JOIN scout_totals scout ON scout.month_start = round_item.month_start
      AND scout.player_id = profile.player_id
    WHERE lineup.status = 'scored' AND player.is_selectable
      AND player.member_category = 'player'
    GROUP BY round_item.month_start, profile.player_id, scout.wins, scout.draws
  ), manager_ranked AS (
    SELECT totals.*, row_number() OVER (
      PARTITION BY month_start ORDER BY total_points DESC, wins DESC, draws DESC,
        rounds DESC, best_round DESC, player_id
    ) AS position FROM manager_totals totals
  ), ranked_mvp AS (
    SELECT totals.*, row_number() OVER (
      PARTITION BY month_start ORDER BY ranked_points DESC, wins DESC, draws DESC,
        goals DESC, assists DESC, rounds ASC, player_id
    ) AS position FROM scout_totals totals
  ), winners AS (
    SELECT CASE profile WHEN 'defensive' THEN 'bestDefenderMonth'
      WHEN 'midfield' THEN 'bestMidfielderMonth'
      ELSE 'bestAttackerMonth' END::text AS kind,
      month_start, total_points, rounds, total_points AS metric,
      player_id, NULL::integer AS keeper_games,
      NULL::integer AS conceded, NULL::integer AS sheets
    FROM position_ranked WHERE position = 1
    UNION ALL
    SELECT 'goldenBootMonth', month_start, total_points, rounds, goals,
      player_id, NULL, NULL, NULL FROM scorer_ranked WHERE position = 1
    UNION ALL
    SELECT 'topAssistMonth', month_start, total_points, rounds, assists,
      player_id, NULL, NULL, NULL FROM assist_ranked WHERE position = 1
    UNION ALL
    SELECT 'bestGoalkeeperMonth', month_start, total_points, rounds,
      round(conceded::numeric / NULLIF(keeper_games, 0), 2),
      player_id, keeper_games, conceded, sheets
    FROM goalkeeper_ranked WHERE position = 1
    UNION ALL
    SELECT 'bestManagerMonth', month_start, total_points, rounds, total_points,
      player_id, NULL, NULL, NULL FROM manager_ranked WHERE position = 1
    UNION ALL
    SELECT 'rankedMvpMonth', month_start, ranked_points, rounds, ranked_points,
      player_id, NULL, NULL, NULL FROM ranked_mvp WHERE position = 1
  )
  SELECT winner.kind, winner.month_start, winner.total_points, winner.rounds,
    winner.metric, winner.month_start < date_trunc('month', current_date)::date,
    player.id, player.name, player.avatar_url,
    winner.keeper_games, winner.conceded, winner.sheets
  FROM winners winner
  JOIN public.players player ON player.id = winner.player_id
  ORDER BY winner.month_start DESC, CASE winner.kind
    WHEN 'bestDefenderMonth' THEN 1 WHEN 'bestMidfielderMonth' THEN 2
    WHEN 'bestAttackerMonth' THEN 3 WHEN 'bestGoalkeeperMonth' THEN 4
    WHEN 'goldenBootMonth' THEN 5 WHEN 'topAssistMonth' THEN 6
    WHEN 'rankedMvpMonth' THEN 7 WHEN 'bestManagerMonth' THEN 8 END;
$$;

CREATE OR REPLACE FUNCTION public.get_monthly_awards_for_player_in_league(
  p_league_id uuid, p_player_id uuid
)
RETURNS TABLE (
  award_type text, period_start date, points numeric, rounds_played integer,
  metric_value numeric, is_final boolean, goalkeeper_games integer,
  goals_conceded integer, clean_sheets integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT award.award_type, award.period_start, award.points,
    award.rounds_played, award.metric_value, award.is_final,
    award.goalkeeper_games, award.goals_conceded, award.clean_sheets
  FROM public.get_monthly_award_winners_for_league(p_league_id, NULL::date) award
  WHERE award.player_id = p_player_id
  ORDER BY award.period_start DESC, award.award_type;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_award_winners(date),
  public.get_monthly_awards_for_player(uuid),
  public.get_monthly_award_winners_for_league(uuid,date),
  public.get_monthly_awards_for_player_in_league(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_award_winners_for_league(uuid,date),
  public.get_monthly_awards_for_player_in_league(uuid,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
