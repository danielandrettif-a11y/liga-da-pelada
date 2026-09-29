-- Melhor Goleiro do mês: exige amostra mínima e compara a média por atuação.
-- Também expõe os scouts usados para explicar o resultado ao usuário.

BEGIN;

DROP FUNCTION IF EXISTS public.get_monthly_awards_for_player(UUID);
DROP FUNCTION IF EXISTS public.get_monthly_award_winners(DATE);

CREATE FUNCTION public.get_monthly_award_winners(p_period_start DATE DEFAULT NULL)
RETURNS TABLE (
  award_type TEXT,
  period_start DATE,
  points NUMERIC,
  rounds_played INTEGER,
  metric_value NUMERIC,
  is_final BOOLEAN,
  player_id UUID,
  player_name TEXT,
  avatar_url TEXT,
  goalkeeper_games INTEGER,
  goals_conceded INTEGER,
  clean_sheets INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH base_awards AS (
    SELECT
      award.award_type,
      award.period_start,
      award.points,
      award.rounds_played,
      award.metric_value,
      award.is_final,
      award.player_id,
      award.player_name,
      award.avatar_url,
      NULL::INTEGER AS goalkeeper_games,
      NULL::INTEGER AS goals_conceded,
      NULL::INTEGER AS clean_sheets
    FROM public.get_monthly_award_winners_before_ranked_mvp(p_period_start) award
    WHERE award.award_type <> 'bestGoalkeeperMonth'
  ),
  goalkeeper_totals AS (
    SELECT
      date_trunc('month', round_item.date)::DATE AS period_start,
      stats.player_id,
      sum(COALESCE(stats.ranking_points, stats.points))::NUMERIC AS points,
      count(DISTINCT stats.round_id)::INTEGER AS rounds_played,
      sum(stats.goalkeeper_games)::INTEGER AS goalkeeper_games,
      sum(stats.goals_conceded)::INTEGER AS goals_conceded,
      sum(stats.clean_sheets)::INTEGER AS clean_sheets,
      sum(stats.goalkeeper_wins)::INTEGER AS goalkeeper_wins
    FROM public.rounds round_item
    JOIN public.player_round_stats stats ON stats.round_id = round_item.id
    JOIN public.players player ON player.id = stats.player_id
    WHERE round_item.round_type = 'official'
      AND round_item.status = 'finished'
      AND stats.goalkeeper_games > 0
      AND player.is_selectable = true
      AND player.member_category = 'player'
      AND (
        p_period_start IS NULL
        OR date_trunc('month', round_item.date)::DATE = p_period_start
      )
    GROUP BY date_trunc('month', round_item.date)::DATE, stats.player_id
    HAVING sum(stats.goalkeeper_games) >= 4
  ),
  goalkeeper_ranked AS (
    SELECT totals.*,
      row_number() OVER (
        PARTITION BY totals.period_start
        ORDER BY
          totals.goals_conceded::NUMERIC / NULLIF(totals.goalkeeper_games, 0) ASC,
          totals.clean_sheets::NUMERIC / NULLIF(totals.goalkeeper_games, 0) DESC,
          totals.goalkeeper_games DESC,
          totals.goalkeeper_wins DESC,
          totals.points DESC,
          totals.player_id
      ) AS position
    FROM goalkeeper_totals totals
  ),
  goalkeeper_award AS (
    SELECT
      'bestGoalkeeperMonth'::TEXT AS award_type,
      ranked.period_start,
      ranked.points,
      ranked.rounds_played,
      round(ranked.goals_conceded::NUMERIC / NULLIF(ranked.goalkeeper_games, 0), 2) AS metric_value,
      ranked.period_start < date_trunc('month', CURRENT_DATE)::DATE AS is_final,
      player.id AS player_id,
      player.name AS player_name,
      player.avatar_url,
      ranked.goalkeeper_games,
      ranked.goals_conceded,
      ranked.clean_sheets
    FROM goalkeeper_ranked ranked
    JOIN public.players player ON player.id = ranked.player_id
    WHERE ranked.position = 1
  ),
  ranked_mvp AS (
    SELECT
      'rankedMvpMonth'::TEXT AS award_type,
      winner.period_start,
      winner.points,
      winner.rounds_played,
      winner.points AS metric_value,
      winner.period_start < date_trunc('month', CURRENT_DATE)::DATE AS is_final,
      player.id AS player_id,
      player.name AS player_name,
      player.avatar_url,
      NULL::INTEGER AS goalkeeper_games,
      NULL::INTEGER AS goals_conceded,
      NULL::INTEGER AS clean_sheets
    FROM (
      SELECT ranked.*
      FROM (
        SELECT
          date_trunc('month', round_item.date)::DATE AS period_start,
          stats.player_id,
          sum(COALESCE(stats.ranking_points, stats.points))::NUMERIC AS points,
          count(DISTINCT stats.round_id)::INTEGER AS rounds_played,
          row_number() OVER (
            PARTITION BY date_trunc('month', round_item.date)::DATE
            ORDER BY sum(COALESCE(stats.ranking_points, stats.points)) DESC,
              sum(stats.wins) DESC, sum(stats.draws) DESC,
              sum(stats.goals) DESC, sum(stats.assists) DESC,
              count(DISTINCT stats.round_id) ASC, stats.player_id
          ) AS position
        FROM public.rounds round_item
        JOIN public.player_round_stats stats ON stats.round_id = round_item.id
        JOIN public.players eligible ON eligible.id = stats.player_id
        WHERE round_item.round_type = 'official'
          AND round_item.status = 'finished'
          AND stats.games > 0
          AND eligible.is_selectable = true
          AND eligible.member_category = 'player'
          AND (
            p_period_start IS NULL
            OR date_trunc('month', round_item.date)::DATE = p_period_start
          )
        GROUP BY date_trunc('month', round_item.date)::DATE, stats.player_id
      ) ranked
      WHERE ranked.position = 1
    ) winner
    JOIN public.players player ON player.id = winner.player_id
  ),
  combined AS (
    SELECT * FROM base_awards
    UNION ALL
    SELECT * FROM goalkeeper_award
    UNION ALL
    SELECT * FROM ranked_mvp
  )
  SELECT * FROM combined
  ORDER BY combined.period_start DESC, CASE combined.award_type
    WHEN 'bestDefenderMonth' THEN 1
    WHEN 'bestMidfielderMonth' THEN 2
    WHEN 'bestAttackerMonth' THEN 3
    WHEN 'bestGoalkeeperMonth' THEN 4
    WHEN 'goldenBootMonth' THEN 5
    WHEN 'topAssistMonth' THEN 6
    WHEN 'rankedMvpMonth' THEN 7
    WHEN 'bestManagerMonth' THEN 8
  END;
$$;

CREATE FUNCTION public.get_monthly_awards_for_player(p_player_id UUID)
RETURNS TABLE (
  award_type TEXT,
  period_start DATE,
  points NUMERIC,
  rounds_played INTEGER,
  metric_value NUMERIC,
  is_final BOOLEAN,
  goalkeeper_games INTEGER,
  goals_conceded INTEGER,
  clean_sheets INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT award.award_type, award.period_start, award.points,
    award.rounds_played, award.metric_value, award.is_final,
    award.goalkeeper_games, award.goals_conceded, award.clean_sheets
  FROM public.get_monthly_award_winners(NULL::DATE) award
  WHERE award.player_id = p_player_id
  ORDER BY award.period_start DESC, award.award_type;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_award_winners(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_award_winners(DATE) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_monthly_awards_for_player(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_awards_for_player(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
