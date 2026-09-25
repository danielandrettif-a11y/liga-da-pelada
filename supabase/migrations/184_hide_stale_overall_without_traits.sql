-- Um atleta sem características atuais não participa do motor de OVR. A
-- leitura pública por jogador fazia fallback para snapshots antigos e podia
-- continuar exibindo uma nota calculada antes de as características serem
-- removidas. Filtramos o estado atual do perfil para manter carta e auditoria
-- sob a mesma regra.

DROP FUNCTION IF EXISTS public.get_latest_player_card_overalls();

CREATE FUNCTION public.get_latest_player_card_overalls()
RETURNS TABLE (
  player_id UUID,
  overall NUMERIC,
  trend TEXT,
  def_overall NUMERIC,
  ala_mei_overall NUMERIC,
  ata_overall NUMERIC,
  gol_overall NUMERIC
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH compatible_snapshots AS (
    SELECT
      snapshot.player_id,
      snapshot.overall,
      COALESCE(snapshot.data_quality ->> 'overall_trend', 'steady') AS trend,
      snapshot.def_overall,
      snapshot.ala_mei_overall,
      snapshot.ata_overall,
      snapshot.gol_overall,
      row_number() OVER (
        PARTITION BY snapshot.player_id
        ORDER BY
          CASE formula.key
            WHEN 'adaptive-v11-balanced-characteristics' THEN 0
            WHEN 'adaptive-v10-role-reframe' THEN 1
            WHEN 'adaptive-v9-player-form-trend-shadow' THEN 2
            ELSE 3
          END,
          run.created_at DESC,
          run.id DESC
      ) AS snapshot_rank
    FROM public.player_overall_snapshots AS snapshot
    INNER JOIN public.overall_calculation_runs AS run
      ON run.id = snapshot.calculation_run_id
    INNER JOIN public.overall_formula_versions AS formula
      ON formula.id = run.formula_version_id
    INNER JOIN public.players AS player
      ON player.id = snapshot.player_id
    WHERE formula.key IN (
      'adaptive-v11-balanced-characteristics',
      'adaptive-v10-role-reframe',
      'adaptive-v9-player-form-trend-shadow',
      'adaptive-v8-soft-progression-shadow'
    )
      AND run.status IN ('succeeded', 'published')
      AND player.member_category = 'player'
      AND player.is_selectable = true
      AND cardinality(player.overall_traits) > 0
  )
  SELECT
    compatible.player_id,
    compatible.overall,
    compatible.trend,
    compatible.def_overall,
    compatible.ala_mei_overall,
    compatible.ata_overall,
    compatible.gol_overall
  FROM compatible_snapshots AS compatible
  WHERE compatible.snapshot_rank = 1;
$function$;

REVOKE ALL ON FUNCTION public.get_latest_player_card_overalls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_player_card_overalls() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
