-- As setas da carta comparam o OVR atual com o fim da rodada anterior jogada.
-- A "forma" das últimas partidas continua influenciando o cálculo, mas não a seta.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_latest_player_card_overalls()
RETURNS TABLE (
  player_id UUID, overall NUMERIC, trend TEXT, def_overall NUMERIC,
  ala_mei_overall NUMERIC, ata_overall NUMERIC, gol_overall NUMERIC,
  goalkeeper_rounds INTEGER, goalkeeper_games INTEGER,
  def_trend TEXT, ala_mei_trend TEXT, ata_trend TEXT, gol_trend TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  WITH compatible_snapshots AS (
    SELECT snapshot.player_id, snapshot.overall,
      snapshot.def_overall, snapshot.ala_mei_overall, snapshot.ata_overall,
      snapshot.gol_overall, snapshot.goalkeeper_rounds, snapshot.goalkeeper_games,
      snapshot.calculation_run_id, snapshot.last_round_id,
      run.source_through_round_id, formula.config AS formula_config,
      player.is_goalkeeper,
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
  ), latest AS (
    SELECT * FROM compatible_snapshots WHERE snapshot_rank = 1
  )
  SELECT latest.player_id, latest.overall,
    CASE
      WHEN latest.last_round_id IS DISTINCT FROM latest.source_through_round_id THEN 'steady'
      WHEN previous_overall.value IS NULL THEN 'steady'
      WHEN latest.overall > previous_overall.value THEN 'rising'
      WHEN latest.overall < previous_overall.value THEN 'falling'
      ELSE 'steady'
    END AS trend,
    latest.def_overall, latest.ala_mei_overall, latest.ata_overall,
    latest.gol_overall, latest.goalkeeper_rounds, latest.goalkeeper_games,
    CASE
      WHEN latest.last_round_id IS DISTINCT FROM latest.source_through_round_id THEN 'steady'
      WHEN previous.positions IS NULL THEN 'steady'
      WHEN latest.def_overall > (previous.positions ->> 'DEF')::NUMERIC THEN 'rising'
      WHEN latest.def_overall < (previous.positions ->> 'DEF')::NUMERIC THEN 'falling'
      ELSE 'steady'
    END AS def_trend,
    CASE
      WHEN latest.last_round_id IS DISTINCT FROM latest.source_through_round_id THEN 'steady'
      WHEN previous.positions IS NULL THEN 'steady'
      WHEN latest.ala_mei_overall > (previous.positions ->> 'ALA_MEI')::NUMERIC THEN 'rising'
      WHEN latest.ala_mei_overall < (previous.positions ->> 'ALA_MEI')::NUMERIC THEN 'falling'
      ELSE 'steady'
    END AS ala_mei_trend,
    CASE
      WHEN latest.last_round_id IS DISTINCT FROM latest.source_through_round_id THEN 'steady'
      WHEN previous.positions IS NULL THEN 'steady'
      WHEN latest.ata_overall > (previous.positions ->> 'ATA')::NUMERIC THEN 'rising'
      WHEN latest.ata_overall < (previous.positions ->> 'ATA')::NUMERIC THEN 'falling'
      ELSE 'steady'
    END AS ata_trend,
    CASE
      WHEN latest.last_round_id IS DISTINCT FROM latest.source_through_round_id THEN 'steady'
      WHEN previous.positions IS NULL THEN 'steady'
      WHEN latest.gol_overall > (previous.positions ->> 'GOL')::NUMERIC THEN 'rising'
      WHEN latest.gol_overall < (previous.positions ->> 'GOL')::NUMERIC THEN 'falling'
      ELSE 'steady'
    END AS gol_trend
  FROM latest
  LEFT JOIN LATERAL (
    SELECT breakdown.positions
    FROM public.player_overall_round_breakdowns breakdown
    WHERE breakdown.calculation_run_id = latest.calculation_run_id
      AND breakdown.player_id = latest.player_id
    ORDER BY breakdown.round_index DESC
    OFFSET 1 LIMIT 1
  ) previous ON true
  LEFT JOIN LATERAL (
    SELECT round(sum(ranked.value * weights.weight), 1) AS value
    FROM (
      SELECT candidate.value,
        row_number() OVER (ORDER BY candidate.value DESC) AS position_rank
      FROM (VALUES
        ((previous.positions ->> 'DEF')::NUMERIC, true),
        ((previous.positions ->> 'ALA_MEI')::NUMERIC, true),
        ((previous.positions ->> 'ATA')::NUMERIC, true),
        ((previous.positions ->> 'GOL')::NUMERIC,
          latest.is_goalkeeper
          AND latest.goalkeeper_games >= COALESCE((latest.formula_config ->> 'goalkeeperEligibilityGames')::INTEGER, 8)
          AND latest.goalkeeper_rounds >= COALESCE((latest.formula_config ->> 'goalkeeperEligibilityRounds')::INTEGER, 3))
      ) candidate(value, eligible)
      WHERE candidate.eligible AND candidate.value IS NOT NULL
    ) ranked
    JOIN (VALUES (1::BIGINT, .50::NUMERIC), (2::BIGINT, .35::NUMERIC), (3::BIGINT, .15::NUMERIC)) weights(position_rank, weight)
      USING (position_rank)
  ) previous_overall ON true;
$function$;

REVOKE ALL ON FUNCTION public.get_latest_player_card_overalls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_player_card_overalls() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
