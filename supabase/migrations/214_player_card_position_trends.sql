DROP FUNCTION IF EXISTS public.get_latest_player_card_overalls();

CREATE FUNCTION public.get_latest_player_card_overalls()
RETURNS TABLE (
  player_id UUID, overall NUMERIC, trend TEXT, def_overall NUMERIC,
  ala_mei_overall NUMERIC, ata_overall NUMERIC, gol_overall NUMERIC,
  goalkeeper_rounds INTEGER, goalkeeper_games INTEGER,
  def_trend TEXT, ala_mei_trend TEXT, ata_trend TEXT, gol_trend TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  WITH compatible_snapshots AS (
    SELECT snapshot.player_id, snapshot.overall,
      COALESCE(snapshot.data_quality ->> 'overall_trend', 'steady') AS trend,
      snapshot.def_overall, snapshot.ala_mei_overall, snapshot.ata_overall,
      snapshot.gol_overall, snapshot.goalkeeper_rounds, snapshot.goalkeeper_games,
      COALESCE(snapshot.data_quality #>> '{position_trends,DEF}', 'steady') AS def_trend,
      COALESCE(snapshot.data_quality #>> '{position_trends,ALA_MEI}', 'steady') AS ala_mei_trend,
      COALESCE(snapshot.data_quality #>> '{position_trends,ATA}', 'steady') AS ata_trend,
      COALESCE(snapshot.data_quality #>> '{position_trends,GOL}', 'steady') AS gol_trend,
      row_number() OVER (PARTITION BY snapshot.player_id ORDER BY
        CASE formula.key
          WHEN 'adaptive-v16-distributed-trait-bonus' THEN 0
          WHEN 'adaptive-v15-goalkeeper-outcomes' THEN 1
          WHEN 'adaptive-v14-role-adjusted-rates' THEN 2
          WHEN 'adaptive-v13-admin-style-evidence' THEN 3
          WHEN 'adaptive-v12-top-three-progression' THEN 4
          WHEN 'adaptive-v11-balanced-characteristics' THEN 5
          WHEN 'adaptive-v10-role-reframe' THEN 6
          WHEN 'adaptive-v9-player-form-trend-shadow' THEN 7 ELSE 8 END,
        run.created_at DESC, run.id DESC) AS snapshot_rank
    FROM public.player_overall_snapshots snapshot
    JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
    JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
    JOIN public.players player ON player.id = snapshot.player_id
    WHERE formula.key IN (
      'adaptive-v16-distributed-trait-bonus', 'adaptive-v15-goalkeeper-outcomes',
      'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence',
      'adaptive-v12-top-three-progression', 'adaptive-v11-balanced-characteristics',
      'adaptive-v10-role-reframe', 'adaptive-v9-player-form-trend-shadow',
      'adaptive-v8-soft-progression-shadow')
      AND (
        (formula.key IN ('adaptive-v16-distributed-trait-bonus', 'adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence') AND run.status = 'published')
        OR (formula.key NOT IN ('adaptive-v16-distributed-trait-bonus', 'adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence') AND run.status IN ('succeeded', 'published'))
      )
      AND player.is_competitive_profile_complete = true
  )
  SELECT player_id, overall, trend, def_overall, ala_mei_overall,
    ata_overall, gol_overall, goalkeeper_rounds, goalkeeper_games,
    def_trend, ala_mei_trend, ata_trend, gol_trend
  FROM compatible_snapshots WHERE snapshot_rank = 1;
$function$;

REVOKE ALL ON FUNCTION public.get_latest_player_card_overalls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_player_card_overalls() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
