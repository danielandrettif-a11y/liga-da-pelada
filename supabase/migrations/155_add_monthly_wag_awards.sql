-- Inclui Anna e Duda como Melhor WAG de todos os meses, sem critério competitivo.
-- O cálculo dos demais prêmios permanece isolado na função criada pela migration 154.

DROP FUNCTION IF EXISTS public.get_monthly_awards_for_player(UUID);

DO $$
BEGIN
  IF to_regprocedure('public.get_competitive_monthly_award_winners(date)') IS NULL THEN
    IF to_regprocedure('public.get_monthly_award_winners(date)') IS NULL THEN
      RAISE EXCEPTION 'Aplique a migration 154 antes da migration 155.';
    END IF;

    ALTER FUNCTION public.get_monthly_award_winners(DATE)
      RENAME TO get_competitive_monthly_award_winners;
  END IF;
END;
$$;

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
  WITH award_periods AS (
    SELECT p_period_start AS period_start
    WHERE p_period_start IS NOT NULL

    UNION

    SELECT DISTINCT date_trunc('month', round.date)::DATE AS period_start
    FROM public.rounds round
    WHERE p_period_start IS NULL
      AND round.round_type = 'official'
      AND round.status = 'finished'
  ),
  combined AS (
    SELECT
      competitive.award_type,
      competitive.period_start,
      competitive.points,
      competitive.rounds_played,
      competitive.metric_value,
      competitive.is_final,
      competitive.player_id,
      competitive.player_name,
      competitive.avatar_url
    FROM public.get_competitive_monthly_award_winners(p_period_start) competitive

    UNION ALL

    SELECT
      'bestWagMonth'::TEXT AS award_type,
      period.period_start,
      0::NUMERIC AS points,
      0::INTEGER AS rounds_played,
      0::NUMERIC AS metric_value,
      period.period_start < date_trunc('month', CURRENT_DATE)::DATE AS is_final,
      player.id AS player_id,
      player.name AS player_name,
      player.avatar_url
    FROM award_periods period
    CROSS JOIN public.players player
    WHERE player.member_category = 'wag'
      AND (
        lower(trim(player.name)) IN ('anna', 'duda')
        OR lower(split_part(trim(player.name), ' ', 1)) IN ('anna', 'duda')
        OR lower(trim(COALESCE(player.nickname, ''))) IN ('anna', 'duda')
      )
  )
  SELECT
    combined.award_type,
    combined.period_start,
    combined.points,
    combined.rounds_played,
    combined.metric_value,
    combined.is_final,
    combined.player_id,
    combined.player_name,
    combined.avatar_url
  FROM combined
  ORDER BY
    combined.period_start DESC,
    CASE combined.award_type
      WHEN 'bestDefenderMonth' THEN 1
      WHEN 'bestMidfielderMonth' THEN 2
      WHEN 'bestAttackerMonth' THEN 3
      WHEN 'bestGoalkeeperMonth' THEN 4
      WHEN 'goldenBootMonth' THEN 5
      WHEN 'topAssistMonth' THEN 6
      WHEN 'bestManagerMonth' THEN 7
      WHEN 'bestWagMonth' THEN 8
      ELSE 9
    END,
    combined.player_name;
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

REVOKE ALL ON FUNCTION public.get_competitive_monthly_award_winners(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_monthly_award_winners(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_award_winners(DATE) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_monthly_awards_for_player(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_awards_for_player(UUID) TO anon, authenticated;
