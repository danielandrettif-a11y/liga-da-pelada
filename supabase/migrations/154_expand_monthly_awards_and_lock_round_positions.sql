-- Expande o BQ The Best e preserva a posição efetivamente usada em cada rodada.

ALTER TABLE public.player_round_stats
  ADD COLUMN IF NOT EXISTS player_profile_locked TEXT
  CHECK (player_profile_locked IN ('defensive', 'midfield', 'offensive'));

CREATE INDEX IF NOT EXISTS player_round_stats_monthly_profile_idx
  ON public.player_round_stats (round_id, player_profile_locked, player_id);

-- Recupera o histórico pela posição congelada nas escalações do Cartola.
-- Quando ela não existe, usa a posição atual como melhor aproximação possível.
UPDATE public.player_round_stats stats
SET player_profile_locked = COALESCE(
  (
    SELECT lineup_player.player_profile_locked
    FROM public.fantasy_rounds fantasy_round
    JOIN public.fantasy_lineups lineup
      ON lineup.fantasy_round_id = fantasy_round.id
      AND lineup.status = 'scored'
    JOIN public.fantasy_lineup_players lineup_player
      ON lineup_player.lineup_id = lineup.id
      AND lineup_player.player_id = stats.player_id
    WHERE fantasy_round.round_id = stats.round_id
      AND lineup_player.player_profile_locked IN ('defensive', 'midfield', 'offensive')
    GROUP BY lineup_player.player_profile_locked
    ORDER BY count(*) DESC, max(lineup.created_at) DESC
    LIMIT 1
  ),
  player.player_profile
)
FROM public.players player
WHERE player.id = stats.player_id
  AND stats.player_profile_locked IS NULL;

CREATE OR REPLACE FUNCTION public.lock_player_round_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.player_profile_locked IS NOT NULL THEN
    NEW.player_profile_locked := OLD.player_profile_locked;
  ELSIF NEW.player_profile_locked IS NULL THEN
    SELECT player.player_profile
    INTO NEW.player_profile_locked
    FROM public.players player
    WHERE player.id = NEW.player_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS player_round_stats_lock_profile ON public.player_round_stats;
CREATE TRIGGER player_round_stats_lock_profile
BEFORE INSERT OR UPDATE OF player_id, player_profile_locked
ON public.player_round_stats
FOR EACH ROW EXECUTE FUNCTION public.lock_player_round_profile();

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
  avatar_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH official_rounds AS (
    SELECT
      round.id,
      date_trunc('month', round.date)::DATE AS period_start,
      round.best_goalkeeper_player_id
    FROM public.rounds round
    WHERE round.round_type = 'official'
      AND round.status = 'finished'
      AND (
        p_period_start IS NULL
        OR date_trunc('month', round.date)::DATE = p_period_start
      )
  ),
  position_totals AS (
    SELECT
      round.period_start,
      stats.player_id,
      stats.player_profile_locked AS player_profile,
      sum(stats.points)::NUMERIC AS points,
      count(DISTINCT stats.round_id)::INTEGER AS rounds_played,
      sum(stats.wins)::INTEGER AS wins,
      sum(stats.draws)::INTEGER AS draws,
      sum(stats.goals)::INTEGER AS goals,
      sum(stats.assists)::INTEGER AS assists
    FROM official_rounds round
    JOIN public.player_round_stats stats ON stats.round_id = round.id
    JOIN public.players player ON player.id = stats.player_id
    WHERE player.is_selectable = true
      AND player.member_category = 'player'
      AND stats.player_profile_locked IN ('defensive', 'midfield', 'offensive')
      AND stats.games > 0
    GROUP BY round.period_start, stats.player_id, stats.player_profile_locked
  ),
  position_ranked AS (
    SELECT totals.*,
      row_number() OVER (
        PARTITION BY totals.period_start, totals.player_profile
        ORDER BY totals.points DESC, totals.wins DESC, totals.draws DESC,
          totals.goals DESC, totals.assists DESC, totals.rounds_played ASC,
          totals.player_id
      ) AS position
    FROM position_totals totals
  ),
  scout_totals AS (
    SELECT
      round.period_start,
      stats.player_id,
      sum(stats.points)::NUMERIC AS points,
      count(DISTINCT stats.round_id)::INTEGER AS rounds_played,
      sum(stats.goals)::INTEGER AS goals,
      sum(stats.assists)::INTEGER AS assists,
      sum(stats.wins)::INTEGER AS wins,
      sum(stats.draws)::INTEGER AS draws
    FROM official_rounds round
    JOIN public.player_round_stats stats ON stats.round_id = round.id
    JOIN public.players player ON player.id = stats.player_id
    WHERE player.is_selectable = true
      AND player.member_category = 'player'
      AND stats.games > 0
    GROUP BY round.period_start, stats.player_id
  ),
  scorer_ranked AS (
    SELECT totals.*,
      row_number() OVER (
        PARTITION BY totals.period_start
        ORDER BY totals.goals DESC, totals.wins DESC, totals.draws DESC,
          totals.assists DESC, totals.points DESC, totals.player_id
      ) AS position
    FROM scout_totals totals
    WHERE totals.goals > 0
  ),
  assist_ranked AS (
    SELECT totals.*,
      row_number() OVER (
        PARTITION BY totals.period_start
        ORDER BY totals.assists DESC, totals.wins DESC, totals.draws DESC,
          totals.goals DESC, totals.points DESC, totals.player_id
      ) AS position
    FROM scout_totals totals
    WHERE totals.assists > 0
  ),
  goalkeeper_performance AS (
    SELECT
      round.period_start,
      stats.player_id,
      sum(stats.points)::NUMERIC AS points,
      count(DISTINCT stats.round_id)::INTEGER AS rounds_played,
      sum(stats.goalkeeper_games)::INTEGER AS goalkeeper_games,
      sum(stats.clean_sheets)::INTEGER AS clean_sheets,
      sum(stats.goals_conceded)::INTEGER AS goals_conceded,
      sum(stats.wins)::INTEGER AS wins,
      sum(stats.draws)::INTEGER AS draws
    FROM official_rounds round
    JOIN public.player_round_stats stats ON stats.round_id = round.id
    JOIN public.players player ON player.id = stats.player_id
    WHERE stats.goalkeeper_games > 0
      AND player.is_selectable = true
      AND player.member_category = 'player'
    GROUP BY round.period_start, stats.player_id
  ),
  goalkeeper_ranked AS (
    SELECT
      performance.*,
      row_number() OVER (
        PARTITION BY performance.period_start
        ORDER BY performance.goals_conceded ASC, performance.wins DESC,
          performance.draws DESC, performance.goalkeeper_games DESC,
          performance.clean_sheets DESC, performance.points DESC,
          performance.player_id
      ) AS position
    FROM goalkeeper_performance performance
  ),
  manager_totals AS (
    SELECT
      round.period_start,
      profile.player_id,
      sum(lineup.total_points)::NUMERIC AS points,
      count(*)::INTEGER AS rounds_played,
      max(lineup.total_points)::NUMERIC AS best_round,
      COALESCE(scout.wins, 0)::INTEGER AS wins,
      COALESCE(scout.draws, 0)::INTEGER AS draws
    FROM official_rounds round
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id = round.id
    JOIN public.fantasy_lineups lineup ON lineup.fantasy_round_id = fantasy_round.id
    JOIN public.account_profiles profile ON profile.user_id = lineup.user_id
    JOIN public.players player ON player.id = profile.player_id
    LEFT JOIN scout_totals scout
      ON scout.period_start = round.period_start
      AND scout.player_id = profile.player_id
    WHERE lineup.status = 'scored'
      AND player.is_selectable = true
      AND player.member_category = 'player'
    GROUP BY round.period_start, profile.player_id, scout.wins, scout.draws
  ),
  manager_ranked AS (
    SELECT totals.*,
      row_number() OVER (
        PARTITION BY totals.period_start
        ORDER BY totals.points DESC, totals.wins DESC, totals.draws DESC,
          totals.rounds_played DESC, totals.best_round DESC, totals.player_id
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
      END::TEXT AS award_type,
      ranked.period_start,
      ranked.points,
      ranked.rounds_played,
      ranked.points AS metric_value
    FROM position_ranked ranked
    WHERE ranked.position = 1

    UNION ALL
    SELECT ranked.player_id, 'bestGoalkeeperMonth', ranked.period_start,
      ranked.points, ranked.rounds_played, ranked.goals_conceded::NUMERIC
    FROM goalkeeper_ranked ranked WHERE ranked.position = 1

    UNION ALL
    SELECT ranked.player_id, 'goldenBootMonth', ranked.period_start,
      ranked.points, ranked.rounds_played, ranked.goals::NUMERIC
    FROM scorer_ranked ranked WHERE ranked.position = 1

    UNION ALL
    SELECT ranked.player_id, 'topAssistMonth', ranked.period_start,
      ranked.points, ranked.rounds_played, ranked.assists::NUMERIC
    FROM assist_ranked ranked WHERE ranked.position = 1

    UNION ALL
    SELECT ranked.player_id, 'bestManagerMonth', ranked.period_start,
      ranked.points, ranked.rounds_played, ranked.points
    FROM manager_ranked ranked WHERE ranked.position = 1
  )
  SELECT
    winners.award_type,
    winners.period_start,
    winners.points,
    winners.rounds_played,
    winners.metric_value,
    winners.period_start < date_trunc('month', CURRENT_DATE)::DATE,
    player.id,
    player.name,
    player.avatar_url
  FROM winners
  JOIN public.players player ON player.id = winners.player_id
  ORDER BY winners.period_start DESC, CASE winners.award_type
    WHEN 'bestDefenderMonth' THEN 1
    WHEN 'bestMidfielderMonth' THEN 2
    WHEN 'bestAttackerMonth' THEN 3
    WHEN 'bestGoalkeeperMonth' THEN 4
    WHEN 'goldenBootMonth' THEN 5
    WHEN 'topAssistMonth' THEN 6
    WHEN 'bestManagerMonth' THEN 7
  END;
$$;

CREATE FUNCTION public.get_monthly_awards_for_player(p_player_id UUID)
RETURNS TABLE (
  award_type TEXT,
  period_start DATE,
  points NUMERIC,
  rounds_played INTEGER,
  metric_value NUMERIC,
  is_final BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    award.award_type,
    award.period_start,
    award.points,
    award.rounds_played,
    award.metric_value,
    award.is_final
  FROM public.get_monthly_award_winners(NULL::DATE) award
  WHERE award.player_id = p_player_id
  ORDER BY award.period_start DESC, award.award_type;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_award_winners(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_award_winners(DATE) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_monthly_awards_for_player(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_awards_for_player(UUID) TO anon, authenticated;
