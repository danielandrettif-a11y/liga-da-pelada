-- Premiações mensais automáticas do Ranked e do Cartola.
-- O mês atual representa uma liderança provisória; meses anteriores são títulos.

CREATE OR REPLACE FUNCTION public.get_monthly_awards_for_player(p_player_id UUID)
RETURNS TABLE (
  award_type TEXT,
  period_start DATE,
  points NUMERIC,
  rounds_played INTEGER,
  is_final BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH official_rounds AS (
    SELECT r.id, date_trunc('month', r.date)::DATE AS period_start
    FROM public.rounds r
    WHERE r.round_type = 'official' AND r.status = 'finished'
  ),
  position_totals AS (
    SELECT
      rounds.period_start,
      stats.player_id,
      player.player_profile,
      sum(stats.points)::NUMERIC AS points,
      count(DISTINCT stats.round_id)::INTEGER AS rounds_played,
      sum(stats.wins)::INTEGER AS wins,
      sum(stats.goals)::INTEGER AS goals,
      sum(stats.assists)::INTEGER AS assists
    FROM official_rounds rounds
    JOIN public.player_round_stats stats ON stats.round_id = rounds.id
    JOIN public.players player ON player.id = stats.player_id
    WHERE player.is_selectable = true
      AND player.member_category = 'player'
      AND player.player_profile IN ('defensive', 'midfield', 'offensive')
      AND stats.games > 0
    GROUP BY rounds.period_start, stats.player_id, player.player_profile
  ),
  position_ranked AS (
    SELECT totals.*,
      row_number() OVER (
        PARTITION BY totals.period_start, totals.player_profile
        ORDER BY totals.points DESC, totals.wins DESC, totals.goals DESC,
          totals.assists DESC, totals.rounds_played ASC, totals.player_id
      ) AS position
    FROM position_totals totals
  ),
  manager_totals AS (
    SELECT
      rounds.period_start,
      profile.player_id,
      sum(lineup.total_points)::NUMERIC AS points,
      count(*)::INTEGER AS rounds_played,
      max(lineup.total_points)::NUMERIC AS best_round
    FROM official_rounds rounds
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id = rounds.id
    JOIN public.fantasy_lineups lineup ON lineup.fantasy_round_id = fantasy_round.id
    JOIN public.account_profiles profile ON profile.user_id = lineup.user_id
    JOIN public.players player ON player.id = profile.player_id
    WHERE lineup.status = 'scored'
      AND player.is_selectable = true
      AND player.member_category = 'player'
    GROUP BY rounds.period_start, profile.player_id
  ),
  manager_ranked AS (
    SELECT totals.*,
      row_number() OVER (
        PARTITION BY totals.period_start
        ORDER BY totals.points DESC, totals.rounds_played DESC,
          totals.best_round DESC, totals.player_id
      ) AS position
    FROM manager_totals totals
  ),
  winners AS (
    SELECT
      ranked.player_id,
      CASE ranked.player_profile
        WHEN 'defensive' THEN 'bestDefenderMonth'
        WHEN 'midfield' THEN 'bestMidfielderMonth'
        WHEN 'offensive' THEN 'bestAttackerMonth'
      END AS award_type,
      ranked.period_start,
      ranked.points,
      ranked.rounds_played
    FROM position_ranked ranked
    WHERE ranked.position = 1
    UNION ALL
    SELECT ranked.player_id, 'bestManagerMonth', ranked.period_start,
      ranked.points, ranked.rounds_played
    FROM manager_ranked ranked
    WHERE ranked.position = 1
  )
  SELECT
    winners.award_type,
    winners.period_start,
    winners.points,
    winners.rounds_played,
    winners.period_start < date_trunc('month', CURRENT_DATE)::DATE AS is_final
  FROM winners
  WHERE winners.player_id = p_player_id
  ORDER BY winners.period_start DESC, winners.award_type;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_awards_for_player(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_awards_for_player(UUID) TO anon, authenticated;
