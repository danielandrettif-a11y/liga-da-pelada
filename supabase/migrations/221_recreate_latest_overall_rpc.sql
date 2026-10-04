-- Recria o RPC após a adoção do OVR v17. A função antiga pode ter uma lista
-- diferente de colunas OUT, que o PostgreSQL não aceita alterar com OR REPLACE.

BEGIN;

DROP FUNCTION IF EXISTS public.get_latest_player_card_overalls();

CREATE FUNCTION public.get_latest_player_card_overalls()
RETURNS TABLE (
  player_id UUID,
  overall NUMERIC,
  trend TEXT,
  def_overall NUMERIC,
  ala_mei_overall NUMERIC,
  ata_overall NUMERIC,
  gol_overall NUMERIC,
  goalkeeper_rounds INTEGER,
  goalkeeper_games INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT ON (snapshot.player_id)
    snapshot.player_id,
    snapshot.overall,
    COALESCE(snapshot.data_quality->>'overall_trend', 'steady'),
    snapshot.def_overall,
    snapshot.ata_overall,
    snapshot.ata_overall,
    snapshot.gol_overall,
    snapshot.goalkeeper_rounds,
    snapshot.goalkeeper_games
  FROM public.player_overall_snapshots snapshot
  JOIN public.overall_calculation_runs run
    ON run.id = snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula
    ON formula.id = run.formula_version_id
  JOIN public.players player
    ON player.id = snapshot.player_id
  WHERE run.status = 'published'
    AND player.is_competitive_profile_complete = true
  ORDER BY
    snapshot.player_id,
    CASE WHEN formula.key = 'adaptive-v17-three-positions-column-c' THEN 0 ELSE 1 END,
    run.published_at DESC NULLS LAST,
    run.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_latest_player_card_overalls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_player_card_overalls() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
