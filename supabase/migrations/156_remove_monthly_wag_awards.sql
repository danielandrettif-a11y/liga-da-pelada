-- Remove a categoria honorária de Melhor WAG e restaura a função competitiva original.

DROP FUNCTION IF EXISTS public.get_monthly_awards_for_player(UUID);
DROP FUNCTION IF EXISTS public.get_monthly_award_winners(DATE);

DO $$
BEGIN
  IF to_regprocedure('public.get_competitive_monthly_award_winners(date)') IS NULL THEN
    RAISE EXCEPTION 'Aplique a migration 155 antes da migration 156.';
  END IF;

  ALTER FUNCTION public.get_competitive_monthly_award_winners(DATE)
    RENAME TO get_monthly_award_winners;
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
